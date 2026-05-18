/**
 * 駿河屋グッズカタログ
 *
 * 駿河屋からアニメグッズを新着順/発売日順で取得し、
 * メルカリsoldと価格比較する。
 *
 * 駿河屋の商品名は構造化されてる（キャラ名・商品種別・イベント名・IP名がテキストに入ってる）
 * → そのままメルカリ検索キーワードに使える
 *
 * 使い方:
 *   # IP指定で新着順取得 → メルカリ比較
 *   node scripts/surugaya-catalog.mjs --keyword "ヒロアカ グッズ"
 *   node scripts/surugaya-catalog.mjs --keyword "ダンダダン" --sort release
 *
 *   # オプション
 *   --keyword "検索ワード"   駿河屋の検索キーワード（必須）
 *   --sort new|release       new=更新新しい順（デフォルト） release=発売日新しい順
 *   --limit N                取得件数（デフォルト: 30）
 *   --skip-mercari           メルカリ比較をスキップ
 *   --min-diff N             メルカリとの最低価格差%（デフォルト: 0、全件表示）
 *   --category ID            駿屋カテゴリID（例: 501=ホビー / 500=おもちゃ / 1004=小物）
 *   --mode daily|deep        daily=新着拾い / deep=過去深掘り（ScanCursorで再開可能）
 *   --max-pages N            1回の走査ページ数（daily=3 / deep=10 がデフォ）
 *   --use-cursor             watchlist 一括時に ScanCursor を使う（IPxカテゴリ単位）
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import * as cheerio from "cheerio";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import Database from "better-sqlite3";
import { filterSoldList, isExcludedByPattern } from "./lib/sold-filter.mjs";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

// ========================================
// CLI引数
// ========================================
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const keyword = getArg("--keyword");
const sortMode = getArg("--sort") || "new";
const limit = parseInt(getArg("--limit") || "30", 10);
const skipMercari = hasFlag("--skip-mercari");
const minDiff = parseInt(getArg("--min-diff") || "0", 10);
const useWatchlist = hasFlag("--watchlist");
const skipDb = hasFlag("--skip-db");
const ipFilter = getArg("--ip");
const categoryArg = getArg("--category");
const scanMode = getArg("--mode") || "daily"; // daily | deep
const useCursor = hasFlag("--use-cursor") || scanMode === "deep";
const maxPagesArg = getArg("--max-pages");
const batchSize = parseInt(getArg("--batch-size") || "0", 10); // 0 = 制限なし
const DEFAULT_DAILY_PAGES = 3;
const DEFAULT_DEEP_PAGES = 10;
const maxPages = parseInt(
  maxPagesArg || (scanMode === "deep" ? DEFAULT_DEEP_PAGES : DEFAULT_DAILY_PAGES),
  10
);
const ITEMS_PER_PAGE = 24; // 駿屋は1ページ24件
const dryRun = hasFlag("--dry-run");

if (!keyword && !useWatchlist) {
  console.error(`使い方:
  node scripts/surugaya-catalog.mjs --keyword "ヒロアカ グッズ" [--sort new|release] [--limit 30] [--skip-mercari] [--min-diff 20]
  node scripts/surugaya-catalog.mjs --watchlist [--limit 30] [--skip-mercari]

  --watchlist     goods-watchlist.json の全IPを一括処理
  --skip-db       DB保存をスキップ（JSONのみ）`);
  process.exit(1);
}

// ========================================
// DB接続
// ========================================
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

function cuid() {
  // 簡易cuid: Prisma互換の一意ID
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString("hex");
  return `c${ts}${rand}`;
}

function saveToDb(items, comparisons, searchKeyword, ipShort) {
  const db = getDb();
  const now = new Date().toISOString();

  const upsertItem = db.prepare(`
    INSERT INTO CatalogItem (id, createdAt, updatedAt, surugayaUrl, name, category, maker, listPrice, releaseDate, description, venueTags, productType, characterName, ipTitle, eventName, limitedType, searchKeyword, ipShort, mercariKeyword)
    VALUES (@id, @now, @now, @surugayaUrl, @name, @category, @maker, @listPrice, @releaseDate, @description, @venueTags, @productType, @characterName, @ipTitle, @eventName, @limitedType, @searchKeyword, @ipShort, @mercariKeyword)
    ON CONFLICT(surugayaUrl) DO UPDATE SET
      updatedAt = @now,
      name = @name,
      category = @category,
      maker = @maker,
      listPrice = @listPrice,
      releaseDate = @releaseDate,
      description = @description,
      venueTags = @venueTags,
      productType = COALESCE(@productType, CatalogItem.productType),
      characterName = COALESCE(@characterName, CatalogItem.characterName),
      ipTitle = COALESCE(@ipTitle, CatalogItem.ipTitle),
      eventName = COALESCE(@eventName, CatalogItem.eventName),
      limitedType = COALESCE(@limitedType, CatalogItem.limitedType),
      mercariKeyword = @mercariKeyword
  `);

  const insertSnapshot = db.prepare(`
    INSERT INTO PriceSnapshot (id, createdAt, itemId, surugayaPrice, soldOut, mercariMedian, mercariCount, weeklyTrend, diffPercent, trendDirection)
    VALUES (@id, @now, @itemId, @surugayaPrice, @soldOut, @mercariMedian, @mercariCount, @weeklyTrend, @diffPercent, @trendDirection)
  `);

  // 個別soldレコード（値動き商品のみ保存）。UNIQUE(itemId,soldDate,price)で重複弾き
  const insertSold = db.prepare(`
    INSERT OR IGNORE INTO MercariSoldRecord
      (id, createdAt, itemId, price, soldDate, mercariName, mercariItemId, thumbnailUrl, itemConditionId)
    VALUES (@id, @now, @itemId, @price, @soldDate, @mercariName, @mercariItemId, @thumbnailUrl, @itemConditionId)
  `);

  const getItemByUrl = db.prepare(`SELECT id FROM CatalogItem WHERE surugayaUrl = ?`);

  const transaction = db.transaction(() => {
    let savedCount = 0;
    for (const item of items) {
      const comp = comparisons?.find(c => c.url === item.url);
      const mercariKw = comp?.mercariKeyword || null;

      upsertItem.run({
        id: cuid(),
        now,
        surugayaUrl: item.url,
        name: item.name,
        category: item.category || null,
        maker: item.maker || null,
        listPrice: item.listPrice || null,
        releaseDate: item.releaseDate || null,
        description: item.description || null,
        venueTags: item.venueTags?.length ? JSON.stringify(item.venueTags) : null,
        productType: item.productType || null,
        characterName: item.characterName || null,
        ipTitle: item.ipTitle || null,
        eventName: item.eventName || null,
        limitedType: item.limitedType || null,
        searchKeyword: searchKeyword,
        ipShort: ipShort || null,
        mercariKeyword: mercariKw,
      });

      // スナップショット
      const row = getItemByUrl.get(item.url);
      if (row) {
        insertSnapshot.run({
          id: cuid(),
          now,
          itemId: row.id,
          surugayaPrice: item.price || null,
          soldOut: item.soldOut ? 1 : 0,
          mercariMedian: comp?.mercariMedian || null,
          mercariCount: comp?.mercariCount || 0,
          weeklyTrend: comp?.trend ? JSON.stringify(comp.trend) : null,
          diffPercent: comp?.diff ?? null,
          trendDirection: comp?.trendDirection ?? null,
        });
        savedCount++;

        // 値動きがある商品は個別soldレコードも保存（グラフ用）
        // 条件: 駿河屋差20%以上 or 相場変動率10%以上
        const hasMovement =
          (comp?.diff != null && Math.abs(comp.diff) >= 20) ||
          (comp?.trendDirection != null && Math.abs(comp.trendDirection) >= 10);
        if (hasMovement && comp?.soldRaw?.length) {
          for (const s of comp.soldRaw) {
            insertSold.run({
              id: cuid(),
              now,
              itemId: row.id,
              price: s.price,
              soldDate: s.date,
              mercariName: s.name || null,
              mercariItemId: s.mercariItemId || null,
              thumbnailUrl: s.thumbnailUrl || null,
              itemConditionId: s.itemConditionId || null,
            });
          }
        }
      }
    }
    return savedCount;
  });

  const count = transaction();
  db.close();
  return count;
}

// ========================================
// ScanCursor 操作
// ========================================
function getOrCreateCursor(ipShort, category, sortMode) {
  const db = getDb();
  try {
    const sel = db.prepare(`
      SELECT * FROM ScanCursor
       WHERE ipShort = ?
         AND COALESCE(category, '') = COALESCE(?, '')
         AND sortMode = ?
    `);
    let row = sel.get(ipShort, category, sortMode);
    if (row) return row;

    const now = new Date().toISOString();
    const id = cuid();
    db.prepare(`
      INSERT INTO ScanCursor (id, createdAt, updatedAt, ipShort, category, sortMode, lastPage, totalHits, itemsScanned, newLastRun, isExhausted)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)
    `).run(id, now, now, ipShort, category, sortMode);
    row = sel.get(ipShort, category, sortMode);
    return row;
  } finally {
    db.close();
  }
}

function updateCursor(id, fields) {
  const db = getDb();
  try {
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updatedAt = ?");
    vals.push(new Date().toISOString());
    vals.push(id);
    db.prepare(`UPDATE ScanCursor SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  } finally {
    db.close();
  }
}

function listCursors(filter = {}) {
  const db = getDb();
  try {
    const where = [];
    const params = [];
    if (filter.ipShort) { where.push("ipShort = ?"); params.push(filter.ipShort); }
    if (filter.isExhausted != null) { where.push("isExhausted = ?"); params.push(filter.isExhausted ? 1 : 0); }
    const sql = `SELECT * FROM ScanCursor ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ipShort, category`;
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

// ========================================
// ユーティリティ
// ========================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// 駿河屋の価格テキストから最初の数値だけ取る（"￥29,500 ～ ￥41,000" のレンジ表記対策）
// 1億以上は異常値として 0 扱い
function parseSurugayaPrice(text) {
  if (!text) return 0;
  const m = text.match(/[\d,]+/);
  if (!m) return 0;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999) return 0;
  return n;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ========================================
// 駿河屋スクレイピング
// ========================================
/**
 * @param {object} opts
 *  - keyword (string)
 *  - sortMode 'new'|'release'
 *  - limit number  // 取得件数上限。null/0 ならページ範囲のみで停止
 *  - category string|null  // 駿屋カテゴリID
 *  - startPage number  // 開始ページ（デフォルト 1）
 *  - maxPages number   // 走査するページ数の上限（デフォルト 999）
 *  - onMeta?: (meta) => void  // 該当件数等のメタを通知（cursor 更新用）
 */
async function scrapeSurugaya(opts) {
  const {
    keyword,
    sortMode = "new",
    limit = 0,
    category = null,
    startPage = 1,
    maxPages = 999,
    onMeta = null,
  } = opts;

  const rankBy = sortMode === "release"
    ? "release_date(int):descending"
    : "modificationTime:descending";

  const allItems = [];
  let page = startPage;
  const endPage = startPage + maxPages - 1;
  let metaReported = false;
  let lastReachedPage = startPage - 1;
  let totalHits = 0;
  let exhausted = false;

  while (page <= endPage) {
    if (limit > 0 && allItems.length >= limit) break;

    const params = new URLSearchParams({
      search_word: keyword,
      searchbox: "1",
      rankBy,
    });
    if (category) params.set("category", category);
    if (page > 1) params.set("page", String(page));

    const url = `https://www.suruga-ya.jp/search?${params}`;
    console.log(`  駿河屋 p${page}${category ? ` cat=${category}` : ""}: ${url.slice(0, 100)}...`);

    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.9" },
      redirect: "follow",
    });

    if (!res.ok) {
      // 駿屋は「該当0件」も 404 で返す（カテゴリ絞り時に多発）→ exhausted 扱いで cursor を進める
      if (res.status === 404) {
        console.log(`  該当0件 (404) → exhausted`);
        exhausted = true;
      } else {
        console.log(`  エラー: ${res.status}`);
      }
      break;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // 該当件数を1回だけ取得 → totalHits
    if (!metaReported) {
      const hitTextMatch = html.match(/該当件数[:：]?\s*([\d,]+)\s*件中/);
      if (hitTextMatch) totalHits = parseInt(hitTextMatch[1].replace(/,/g, ""), 10) || 0;
      if (onMeta) onMeta({ totalHits });
      metaReported = true;
    }

    let pageCount = 0;

    $("#search_result .item").each((i, el) => {
      if (limit > 0 && allItems.length >= limit) return false;

      const $item = $(el);
      const name = $item.find(".item_detail .title h3.product-name").text().trim();
      if (!name) return;
      if (/^<<[^>]+>>/.test(name)) return;

      const urlPath = $item.find(".item_detail .title a").attr("href") || "";
      const itemUrl = urlPath.startsWith("http") ? urlPath : `https://www.suruga-ya.jp${urlPath}`;

      // 価格（"￥29,500 ～ ￥41,000" のレンジ表記は最初の値を採用）
      let price = 0;
      const priceText = $item.find(".item_price .price_teika span.text-red strong").first().text().trim();
      price = parseSurugayaPrice(priceText);

      // マケプレ価格（品切れの場合）
      const soldOut = $item.find(".item_price p.price").text().trim() === "品切れ";
      if (!price || soldOut) {
        const mpText = $item.find(".item_price .makeplaTit span.text-red strong").text().trim();
        const mpPrice = parseSurugayaPrice(mpText);
        if (mpPrice) price = mpPrice;
      }

      // 発売日
      const detailText = $item.find(".item_detail").text();
      const dateMatch = detailText.match(/(\d{4})[年/](\d{1,2})[月/](\d{1,2})?/);
      const releaseDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}${dateMatch[3] ? "-" + dateMatch[3].padStart(2, "0") : ""}`
        : null;

      // カテゴリ（あれば）
      const itemCategory = $item.find(".item_detail .category").text().trim() || null;

      allItems.push({
        name,
        price,
        soldOut,
        url: itemUrl,
        releaseDate,
        category: itemCategory,
        source: "surugaya",
      });
      pageCount++;
    });

    if (pageCount === 0) {
      // 結果ゼロ = 駿屋表示上限到達 or 末尾
      exhausted = true;
      break;
    }
    lastReachedPage = page;
    console.log(`    ${pageCount}件取得 (累計${allItems.length} / 該当${totalHits})`);

    // totalHits ベースで踏破済み判定
    if (totalHits > 0 && page * ITEMS_PER_PAGE >= totalHits) {
      exhausted = true;
    }
    if (exhausted) break;

    page++;
    await sleep(1500);
  }

  return { items: allItems, lastReachedPage, totalHits, exhausted };
}

// ========================================
// 駿河屋 商品詳細ページから追加情報を取得
// ========================================
async function fetchSurugayaDetail(item) {
  try {
    // 駿河屋がNode fetchをBOT検知して403返すため curl 経由で取得
    const { stdout: html } = await execFileAsync("curl", [
      "-sS",
      "-A", UA,
      "--max-time", "15",
      item.url,
    ], { maxBuffer: 5 * 1024 * 1024, encoding: "utf-8" });
    if (!html) return item;

    const $ = cheerio.load(html);

    // th/次要素パターンで情報抽出
    const details = {};
    $("th").each((i, el) => {
      const label = $(el).text().trim();
      const value = $(el).next().text().trim();
      if (label && value) details[label] = value;
    });

    item.maker = details["メーカー"] || null;
    item.listPrice = details["定価"] ? (parseSurugayaPrice(details["定価"]) || null) : null;

    // カテゴリ（詳細ページのほうが正確）
    if (details["カテゴリ"]) {
      item.category = details["カテゴリ"].replace(/\s+/g, " > ").trim();
    }

    // 発売日（検索結果で取れなかった場合のフォールバック）
    if (!item.releaseDate && details["発売日"]) {
      const m = details["発売日"].match(/(\d{4})[年/](\d{1,2})[月/](\d{1,2})?/);
      if (m) item.releaseDate = `${m[1]}-${m[2].padStart(2, "0")}${m[3] ? "-" + m[3].padStart(2, "0") : ""}`;
    }

    // 商品解説（備考 — どこ発売か等の重要情報が入ってる）
    let description = null;
    $("*").each((i, el) => {
      const t = $(el).text().trim();
      if (t.startsWith("商品解説") && t.length > 5 && t.length < 500) {
        description = t.replace(/^商品解説■?\s*/, "").trim();
        return false;
      }
    });
    item.description = description;

    // 商品種別を自動判定
    const productTypePatterns = [
      { pattern: /フィギュア|figma|ねんどろいど|スタチュー|ARTFX/i, type: "フィギュア" },
      { pattern: /一番くじ/i, type: "一番くじ" },
      { pattern: /ぬいぐるみ|もちもち|ちびぐるみ|くったり/i, type: "ぬいぐるみ" },
      { pattern: /アクリルスタンド|アクスタ|アクリルブロック/i, type: "アクスタ" },
      { pattern: /アクリルキーホルダー|アクキー/i, type: "アクキー" },
      { pattern: /缶バッジ|カンバッジ/i, type: "缶バッジ" },
      { pattern: /タペストリー|ポスター/i, type: "タペストリー" },
      { pattern: /Tシャツ|パーカー|アパレル/i, type: "アパレル" },
      { pattern: /クリアファイル/i, type: "クリアファイル" },
      { pattern: /色紙|ミニ色紙/i, type: "色紙" },
      { pattern: /ブロマイド|生写真|ポストカード/i, type: "ブロマイド" },
      { pattern: /ラバーストラップ|ラバスト|ラバーキーホルダー/i, type: "ラバスト" },
      { pattern: /マグカップ|グラス|タンブラー/i, type: "食器" },
      { pattern: /クッション|抱き枕/i, type: "クッション" },
      { pattern: /DX|変身ベルト|なりきり/i, type: "DX玩具" },
      { pattern: /プライズ/i, type: "プライズ" },
      { pattern: /トレーディング|トレカ|カード/i, type: "トレカ" },
    ];
    const nameForType = item.name + " " + (item.category || "");
    item.productType = null;
    for (const { pattern, type } of productTypePatterns) {
      if (pattern.test(nameForType)) {
        item.productType = type;
        break;
      }
    }

    // 駿河屋の商品名からIP正式名称を抽出（「」内）
    const ipMatch = item.name.match(/「([^」]+)」/);
    item.ipTitle = ipMatch ? ipMatch[1] : null;

    // キャラ名抽出（先頭の日本語句、「」の前まで）
    const nameBeforeIP = item.name.replace(/「[^」]*」/g, "").trim();
    const charMatch = nameBeforeIP.match(/^([\u3000-\u9FFFa-zA-Z&＆.・×]+?)[\s　]+/);
    item.characterName = charMatch ? charMatch[1].trim() : null;
    // 商品種別と同じものがキャラ名に入ってたら除去
    if (item.characterName && /^(全\d+種|セット|コレクション|トレーディング)/.test(item.characterName)) {
      item.characterName = null;
    }

    // イベント名抽出（販売場所タグやIP名の中から）
    const eventPatterns = [
      /ジャンプフェスタ\d*/,
      /アニメジャパン\d*/,
      /コミケ\d*|コミックマーケット\d*/,
      /原画展|展覧会|展$/,
      /ポップアップストア|POP UP SHOP/i,
      /コラボカフェ|CAFE|カフェ/i,
    ];
    item.eventName = null;
    const fullText = (item.name || "") + " " + (description || "");
    for (const p of eventPatterns) {
      const m = fullText.match(p);
      if (m) { item.eventName = m[0]; break; }
    }

    // 限定性判定
    const limitedPatterns = [
      { pattern: /会場限定/, type: "会場限定" },
      { pattern: /イベント限定/, type: "イベント限定" },
      { pattern: /期間限定/, type: "期間限定" },
      { pattern: /先行販売/, type: "先行販売" },
      { pattern: /受注生産|受注限定/, type: "受注生産" },
      { pattern: /店舗限定|ショップ限定/, type: "店舗限定" },
      { pattern: /ドン・キホーテ限定|ドンキ限定/, type: "ドンキ限定" },
      { pattern: /アニメイト限定/, type: "アニメイト限定" },
      { pattern: /劇場グッズ|劇場限定/, type: "劇場限定" },
      { pattern: /プレミアムバンダイ|プレバン/, type: "プレバン" },
    ];
    item.limitedType = null;
    for (const { pattern, type } of limitedPatterns) {
      if (pattern.test(fullText)) { item.limitedType = type; break; }
    }

    // 備考から販売場所タグを抽出
    if (description) {
      const venuePatterns = [
        /ジャンプフェスタ\d*/,
        /アニメジャパン\d*/,
        /コミケ|コミックマーケット/,
        /アニメイト/,
        /ジャンプショップ/,
        /東急ハンズ/,
        /ポップアップストア/,
        /原画展|展覧会/,
        /コラボカフェ/,
        /先行販売/,
        /会場限定|イベント限定|期間限定/,
      ];
      const tags = [];
      for (const p of venuePatterns) {
        const m = description.match(p);
        if (m) tags.push(m[0]);
      }
      item.venueTags = tags;
    }

    return item;
  } catch {
    return item;
  }
}

// ========================================
// メルカリsold検索
// ========================================
const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchMercariSold(keyword, limit = 30) {
  try {
    const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: {
        keyword,
        sort: "SORT_CREATED_TIME",
        order: "ORDER_DESC",
        status: ["STATUS_SOLD_OUT"],
      },
    };
    const res = await fetch(MERCARI_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];

    // 強化版NGパターン（sold-filter.mjs の EXCLUDE_PATTERNS）
    return data.items
      .filter((item) => !isExcludedByPattern(item.name))
      .map((item) => ({
        mercariItemId: item.id,
        name: item.name,
        price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
        date: new Date(item.updated * 1000).toISOString().split("T")[0],
        thumbnailUrl: item.thumbnails?.[0] || null,
        itemConditionId: item.itemConditionId || null,
      }));
  } catch {
    return [];
  }
}

// ========================================
// 商品名を短縮してメルカリ検索キーワードにする
// 駿河屋の商品名は長い（キャラ名+商品種別+「イベント名」+特典区分）ので
// そのまま検索すると一致しない。適度に短くする。
// ========================================
/**
 * 駿河屋の商品名からメルカリ検索キーワードを作る
 * 基本そのまま使う。ノイズだけ除去。
 * ヒットしなければ呼び出し側で段階的に短縮する。
 */
function cleanSurugayaName(surugayaName) {
  let kw = surugayaName;
  kw = kw.replace(/^\[単品\]\s*/, "");
  kw = kw.replace(/^\[.*?\]\s*/, "");
  kw = kw.replace(/^\d+\.\s*/, "");
  kw = kw.replace(/\s*(グッズ購入特典|販売特典|先行販売特典|配布|非売品|ノベルティ|グッズ付チケット特典)$/, "");
  return kw.trim();
}

/**
 * 駿河屋の商品名から商品名部分を抽出する
 *
 * 駿河屋: "麗日お茶子 おなまえアクリルキーホルダー 準備運動ver. 「僕のヒーローアカデミア」"
 *   → キャラ名: 麗日お茶子
 *   → 商品名: おなまえアクリルキーホルダー（←これが大事。ジャンルじゃなくて商品名）
 *   → IP: 「」の中身
 *
 * メルカリ検索: "ヒロアカ 麗日お茶子 おなまえアクリルキーホルダー"
 *   → --ipの略称 + キャラ名 + 商品名（ver.等は落とす）
 */
function buildMercariKeyword(surugayaName, ipShort) {
  const clean = cleanSurugayaName(surugayaName);

  // キャラ名（先頭の日本語句）
  const charMatch = clean.match(/^([\u3000-\u9FFFa-zA-Z&＆.]+)/);
  const char = charMatch ? charMatch[1].trim() : "";

  // 「」とキャラ名を除いた残り = 商品名部分
  let productName = clean
    .replace(/「[^」]*」/g, "")
    .replace(/^[\u3000-\u9FFFa-zA-Z&＆.]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  // ver.表記やバリエーション表記を落とす（検索ノイズになる）
  // 「準備運動ver.」「雪遊びVer.」等、ver.の前の修飾語ごと除去
  productName = productName.replace(/\s*[\u3000-\u9FFFa-zA-Z]*\s*[Vv]er\.?\s*/g, " ");
  // JF2026等のイベント回号
  productName = productName.replace(/\s*JF\d{4}\s*/g, " ");
  productName = productName.replace(/\s+/g, " ").trim();

  // IP略称 + キャラ名 + 商品名
  const ip = ipShort || "";
  const parts = [ip, char, productName].filter(p => p.length > 0);
  return parts.join(" ");
}

// ========================================
// メイン
// ========================================
async function main() {
  console.log(`=== 駿河屋グッズカタログ ===`);
  console.log(`検索: "${keyword}"`);
  console.log(`ソート: ${sortMode === "release" ? "発売日新しい順" : "更新新しい順"}`);
  console.log(`取得件数: ${limit}\n`);

  // Step 1: 駿河屋から取得
  const scanResult = await scrapeSurugaya({
    keyword,
    sortMode,
    limit,
    category: categoryArg || null,
    startPage: 1,
    maxPages: 999,
  });
  const items = scanResult.items;

  if (items.length === 0) {
    console.log("駿河屋の検索結果なし。");
    return;
  }

  console.log(`\n駿河屋: ${items.length}件取得`);
  console.log(`商品詳細を取得中...\n`);

  // 各商品の詳細ページから追加情報を取得
  for (let i = 0; i < items.length; i++) {
    items[i] = await fetchSurugayaDetail(items[i]);
    process.stdout.write(`\r  ${i + 1}/${items.length} 詳細取得済み`);
    await sleep(1000);
  }
  console.log("\n");

  // 一覧表示
  for (const item of items) {
    const price = item.price ? `\\${item.price.toLocaleString()}` : "品切れ";
    const date = item.releaseDate || "日付不明";
    const maker = item.maker ? `[${item.maker}]` : "";
    const tags = item.venueTags?.length > 0 ? ` {${item.venueTags.join(",")}}` : "";
    const listPrice = item.listPrice ? ` 定価\\${item.listPrice.toLocaleString()}` : "";
    console.log(`  ${price.padStart(8)}${listPrice}  ${date}  ${maker}${tags}  ${item.name.slice(0, 55)}`);
  }

  if (skipMercari) {
    console.log("\nメルカリ比較スキップ（--skip-mercari）");
    const outputPath = path.join(PROJECT_ROOT, `surugaya-catalog.json`);
    fs.writeFileSync(outputPath, JSON.stringify({ keyword, items, comparisons: [] }, null, 2), "utf-8");
    console.log(`結果保存: ${outputPath}`);

    if (!skipDb) {
      const ipShort = keyword.split(/\s/)[0];
      const count = saveToDb(items, [], keyword, ipShort);
      console.log(`DB保存: ${count}件のスナップショット`);
    }
    return { items, comparisons: [] };
  }

  // Step 2: メルカリsoldと比較
  console.log(`\nメルカリsold比較中...\n`);

  const comparisons = [];

  for (const item of items) {
    if (!item.price) continue;

    const mercariKw = buildMercariKeyword(item.name, keyword.split(/\s/)[0]);
    let sold = await searchMercariSold(mercariKw, 60);

    // MUSTフィルタ適用（駿河屋商品と一致するsoldのみ）
    sold = filterSoldList(sold, {
      surugayaName: item.name,
      productType: item.productType,
      characterName: item.characterName,
      mercariKeyword: mercariKw,
      listPrice: item.listPrice || item.price,
    });

    if (sold.length === 0) {
      comparisons.push({ ...item, mercariKeyword: mercariKw, mercariMedian: null, mercariCount: 0, diff: null, trend: null });
      continue;
    }

    const now = Date.now();
    const week1 = sold.filter(s => new Date(s.date).getTime() >= now - 7 * 86400000);
    const week2 = sold.filter(s => {
      const t = new Date(s.date).getTime();
      return t >= now - 14 * 86400000 && t < now - 7 * 86400000;
    });
    const week3_4 = sold.filter(s => {
      const t = new Date(s.date).getTime();
      return t >= now - 30 * 86400000 && t < now - 14 * 86400000;
    });
    const older = sold.filter(s => new Date(s.date).getTime() < now - 30 * 86400000);

    const mercariMedian = median(sold.map(s => s.price));
    const diff = item.price > 0 ? Math.round(((mercariMedian - item.price) / item.price) * 100) : null;

    // 相場推移: 週ごとの中央値
    const trend = {
      "直近7日": week1.length >= 2 ? { median: median(week1.map(s => s.price)), count: week1.length } : null,
      "8-14日前": week2.length >= 2 ? { median: median(week2.map(s => s.price)), count: week2.length } : null,
      "15-30日前": week3_4.length >= 2 ? { median: median(week3_4.map(s => s.price)), count: week3_4.length } : null,
      "31日以前": older.length >= 2 ? { median: median(older.map(s => s.price)), count: older.length } : null,
    };

    // トレンド判定（直近 vs 過去）
    let trendDirection = null;
    const recentMedian = (trend["直近7日"] || trend["8-14日前"])?.median;
    const pastMedian = (trend["15-30日前"] || trend["31日以前"])?.median;
    if (recentMedian && pastMedian && pastMedian > 0) {
      const change = Math.round(((recentMedian - pastMedian) / pastMedian) * 100);
      trendDirection = change;
    }

    comparisons.push({
      ...item,
      mercariKeyword: mercariKw,
      mercariMedian,
      mercariCount: sold.length,
      diff,
      trend,
      trendDirection,
      soldRaw: sold,
    });

    // 表示
    const diffStr = diff != null ? `${diff > 0 ? "+" : ""}${diff}%` : "N/A";
    const trendStr = trendDirection != null ? ` 推移${trendDirection > 0 ? "+" : ""}${trendDirection}%` : "";
    if (minDiff === 0 || (diff != null && diff >= minDiff)) {
      process.stdout.write(`  駿河屋\\${item.price.toLocaleString()} → メルカリ\\${mercariMedian.toLocaleString()} (${diffStr}${trendStr}) ${item.name.slice(0, 45)}\n`);
    }

    await sleep(1000);
  }

  // Step 3: サマリー
  console.log(`\n${"=".repeat(60)}`);
  console.log(`結果サマリー: "${keyword}"`);
  console.log("=".repeat(60));

  const withData = comparisons.filter(c => c.mercariMedian != null);
  const profitable = withData.filter(c => c.diff != null && c.diff >= 20);

  console.log(`\n駿河屋: ${items.length}件 → メルカリデータあり: ${withData.length}件`);

  if (profitable.length > 0) {
    console.log(`\nメルカリのほうが20%以上高い商品:`);
    profitable.sort((a, b) => (b.diff || 0) - (a.diff || 0));
    for (const c of profitable) {
      console.log(`  +${c.diff}%  駿河屋\\${c.price.toLocaleString()} → メルカリ\\${c.mercariMedian.toLocaleString()}  ${c.name.slice(0, 55)}`);
    }
  }

  const cheaper = withData.filter(c => c.diff != null && c.diff <= -20);
  if (cheaper.length > 0) {
    console.log(`\n駿河屋のほうが安い商品（仕入れ候補）:`);
    cheaper.sort((a, b) => (a.diff || 0) - (b.diff || 0));
    for (const c of cheaper.slice(0, 10)) {
      console.log(`  ${c.diff}%  駿河屋\\${c.price.toLocaleString()} → メルカリ\\${c.mercariMedian.toLocaleString()}  ${c.name.slice(0, 55)}`);
    }
  }

  // 相場推移があるもの
  const withTrend = withData.filter(c => c.trendDirection != null);
  if (withTrend.length > 0) {
    const rising = withTrend.filter(c => c.trendDirection > 10).sort((a, b) => b.trendDirection - a.trendDirection);
    const falling = withTrend.filter(c => c.trendDirection < -10).sort((a, b) => a.trendDirection - b.trendDirection);

    if (rising.length > 0) {
      console.log(`\n相場上昇中（直近 vs 過去 +10%以上）:`);
      for (const c of rising) {
        const t = c.trend;
        const recent = t["直近7日"] || t["8-14日前"];
        const past = t["15-30日前"] || t["31日以前"];
        console.log(`  +${c.trendDirection}%  \\${past.median.toLocaleString()} → \\${recent.median.toLocaleString()}  ${c.name.slice(0, 50)}`);
        // 週ごとの推移を表示
        const periods = ["31日以前", "15-30日前", "8-14日前", "直近7日"];
        const timeline = periods.map(p => t[p] ? `\\${t[p].median.toLocaleString()}(${t[p].count})` : "-").join(" → ");
        console.log(`         ${timeline}`);
      }
    }

    if (falling.length > 0) {
      console.log(`\n相場下落中（直近 vs 過去 -10%以上）:`);
      for (const c of falling) {
        const t = c.trend;
        const recent = t["直近7日"] || t["8-14日前"];
        const past = t["15-30日前"] || t["31日以前"];
        console.log(`  ${c.trendDirection}%  \\${past.median.toLocaleString()} → \\${recent.median.toLocaleString()}  ${c.name.slice(0, 50)}`);
      }
    }
  }

  // JSON出力
  const outputPath = path.join(PROJECT_ROOT, `surugaya-catalog.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ keyword, items, comparisons }, null, 2), "utf-8");
  console.log(`\n結果保存: ${outputPath}`);

  // DB保存
  if (!skipDb) {
    const ipShort = keyword.split(/\s/)[0];
    const count = saveToDb(items, comparisons, keyword, ipShort);
    console.log(`DB保存: ${count}件のスナップショット`);
  }

  return { items, comparisons };
}

// ========================================
// ウォッチリスト一括実行
// ========================================
async function runWatchlist() {
  const watchlistPath = path.join(__dirname, "goods-watchlist.json");
  if (!fs.existsSync(watchlistPath)) {
    console.error(`ウォッチリストが見つかりません: ${watchlistPath}`);
    process.exit(1);
  }

  const watchlist = JSON.parse(fs.readFileSync(watchlistPath, "utf-8"));
  let accounts = watchlist.accounts || [];
  if (ipFilter) {
    accounts = accounts.filter((a) => a.ip === ipFilter);
    console.log(`--ip "${ipFilter}" でフィルタ`);
  }
  const effectiveLimit = limit || watchlist.defaultLimit || 100;

  console.log(`=== ウォッチリスト一括実行 ===`);
  console.log(`対象: ${accounts.length}件\n`);

  const allResults = [];

  const failedEntries = [];

  for (const entry of accounts) {
   try {
    const kw = entry.keyword || `${entry.ip} グッズ`;
    console.log(`\n${"━".repeat(60)}`);
    console.log(`[${entry.ip}] キーワード: "${kw}"`);
    console.log(`${"━".repeat(60)}`);

    const scanResult = await scrapeSurugaya({
      keyword: kw,
      sortMode,
      limit: effectiveLimit,
      category: null,
      startPage: 1,
      maxPages: DEFAULT_DAILY_PAGES + 2, // daily一括時は5ページまで余裕
    });
    const items = scanResult.items;
    if (items.length === 0) {
      console.log("  → 結果なし");
      continue;
    }

    console.log(`  駿河屋: ${items.length}件`);

    // 詳細取得
    for (let i = 0; i < items.length; i++) {
      items[i] = await fetchSurugayaDetail(items[i]);
      await sleep(1000);
    }

    let comparisons = [];

    if (!skipMercari) {
      console.log(`  メルカリ比較中...`);
      for (const item of items) {
        if (!item.price) continue;

        const mercariKw = buildMercariKeyword(item.name, entry.ip);
        let sold = await searchMercariSold(mercariKw, 60);

        // MUSTフィルタ適用（駿河屋商品と一致するsoldのみ）
        sold = filterSoldList(sold, {
          surugayaName: item.name,
          productType: item.productType,
          characterName: item.characterName,
          mercariKeyword: mercariKw,
          listPrice: item.listPrice || item.price,
        });

        if (sold.length === 0) {
          comparisons.push({ ...item, mercariKeyword: mercariKw, mercariMedian: null, mercariCount: 0, diff: null, trend: null });
          continue;
        }

        const now = Date.now();
        const week1 = sold.filter(s => new Date(s.date).getTime() >= now - 7 * 86400000);
        const week2 = sold.filter(s => { const t = new Date(s.date).getTime(); return t >= now - 14 * 86400000 && t < now - 7 * 86400000; });
        const week3_4 = sold.filter(s => { const t = new Date(s.date).getTime(); return t >= now - 30 * 86400000 && t < now - 14 * 86400000; });
        const older = sold.filter(s => new Date(s.date).getTime() < now - 30 * 86400000);

        const mercariMedian = median(sold.map(s => s.price));
        const diff = item.price > 0 ? Math.round(((mercariMedian - item.price) / item.price) * 100) : null;

        const trend = {
          "直近7日": week1.length >= 2 ? { median: median(week1.map(s => s.price)), count: week1.length } : null,
          "8-14日前": week2.length >= 2 ? { median: median(week2.map(s => s.price)), count: week2.length } : null,
          "15-30日前": week3_4.length >= 2 ? { median: median(week3_4.map(s => s.price)), count: week3_4.length } : null,
          "31日以前": older.length >= 2 ? { median: median(older.map(s => s.price)), count: older.length } : null,
        };

        let trendDirection = null;
        const recentMedian = (trend["直近7日"] || trend["8-14日前"])?.median;
        const pastMedian = (trend["15-30日前"] || trend["31日以前"])?.median;
        if (recentMedian && pastMedian && pastMedian > 0) {
          trendDirection = Math.round(((recentMedian - pastMedian) / pastMedian) * 100);
        }

        comparisons.push({ ...item, mercariKeyword: mercariKw, mercariMedian, mercariCount: sold.length, diff, trend, trendDirection, soldRaw: sold });
        await sleep(1000);
      }
    }

    // DB保存
    if (!skipDb) {
      const count = saveToDb(items, comparisons, kw, entry.ip);
      console.log(`  DB保存: ${count}件`);
    }

    // 注目商品だけ表示
    const withData = comparisons.filter(c => c.mercariMedian != null);
    const profitable = withData.filter(c => c.diff != null && c.diff >= 20);
    if (profitable.length > 0) {
      console.log(`  🔥 メルカリ20%↑: ${profitable.length}件`);
      for (const c of profitable.slice(0, 5)) {
        console.log(`    +${c.diff}%  駿屋\\${c.price.toLocaleString()} → メルカリ\\${c.mercariMedian.toLocaleString()}  ${c.name.slice(0, 45)}`);
      }
    }

    allResults.push({ ip: entry.ip, items, comparisons });

    // IP間のインターバル
    await sleep(3000);
   } catch (e) {
    console.error(`  ⚠️ [${entry.ip}] "${entry.keyword}" エラーでスキップ: ${e.message}`);
    failedEntries.push({ ip: entry.ip, keyword: entry.keyword, error: e.message });
    await sleep(3000);
   }
  }

  // 失敗エントリのサマリー
  if (failedEntries.length > 0) {
    console.log(`\n${"⚠".repeat(20)}`);
    console.log(`スキップしたエントリ: ${failedEntries.length}件`);
    for (const f of failedEntries) {
      console.log(`  - [${f.ip}] "${f.keyword}": ${f.error}`);
    }
  }

  // 全体サマリー
  console.log(`\n${"═".repeat(60)}`);
  console.log(`全体サマリー`);
  console.log(`${"═".repeat(60)}`);

  let totalItems = 0;
  let totalProfitable = 0;

  for (const r of allResults) {
    const withData = r.comparisons.filter(c => c.mercariMedian != null);
    const profitable = withData.filter(c => c.diff != null && c.diff >= 20);
    totalItems += r.items.length;
    totalProfitable += profitable.length;
    console.log(`  ${r.ip.padEnd(20)} ${r.items.length}件  メルカリ20%↑: ${profitable.length}件`);
  }

  console.log(`\n合計: ${totalItems}件  注目: ${totalProfitable}件`);
}

// ========================================
// Deep scan モード（ScanCursor ベースで過去深掘り）
// ========================================
/**
 * - 対象 cursor:
 *     --ip 指定なら IP 全 cursor / --category 指定ならその1件 / 両方未指定なら全 isExhausted=0
 * - 各 cursor で startPage = lastPage + 1, maxPages = DEFAULT_DEEP_PAGES（または --max-pages）
 * - 取得後 saveToDb で UPSERT、cursor を更新（lastPage / totalHits / itemsScanned / newLastRun / isExhausted）
 * - メルカリ比較は --skip-mercari なら省略（デフォルトは省略する=網羅優先）
 */
async function runDeepScan() {
  const filter = {};
  if (ipFilter) filter.ipShort = ipFilter;
  filter.isExhausted = false;
  let cursors = listCursors(filter);
  if (categoryArg) cursors = cursors.filter(c => (c.category || "") === categoryArg);

  if (cursors.length === 0) {
    console.log("対象 cursor がありません（全部 exhausted か未初期化）。先に setup-watchlist-cursors を実行してください。");
    return;
  }

  // 進捗が浅い順（lastPage 昇順）→ 取得済が少ない cursor を優先
  cursors.sort((a, b) => a.lastPage - b.lastPage || a.itemsScanned - b.itemsScanned);
  if (batchSize > 0 && cursors.length > batchSize) {
    cursors = cursors.slice(0, batchSize);
  }

  console.log(`=== Deep scan ===`);
  console.log(`対象 cursor: ${cursors.length}件 (mode=deep, max-pages=${maxPages}, batch-size=${batchSize || "no-limit"})`);
  console.log(`メルカリ比較: ${skipMercari ? "skip" : "有効"}${dryRun ? " / dry-run" : ""}\n`);

  if (dryRun) {
    for (const c of cursors) {
      console.log(`  - [${c.ipShort}] cat=${c.category || "-"} sort=${c.sortMode} startPage=${c.lastPage + 1}`);
    }
    return;
  }

  let totalNewItems = 0;
  let totalScanned = 0;

  for (const cur of cursors) {
    try {
      console.log(`\n${"━".repeat(60)}`);
      console.log(`[${cur.ipShort}] cat=${cur.category || "-"} sort=${cur.sortMode}  cursor: lastPage=${cur.lastPage} totalHits=${cur.totalHits} scanned=${cur.itemsScanned}`);
      console.log(`${"━".repeat(60)}`);

      const startPage = cur.lastPage + 1;
      const scanResult = await scrapeSurugaya({
        keyword: cur.ipShort,
        sortMode: cur.sortMode,
        limit: 0,
        category: cur.category || null,
        startPage,
        maxPages,
      });
      const items = scanResult.items;

      // 詳細取得（全件）
      if (items.length > 0) {
        console.log(`  駿河屋: ${items.length}件 / 詳細取得中...`);
        for (let i = 0; i < items.length; i++) {
          items[i] = await fetchSurugayaDetail(items[i]);
          await sleep(800);
        }
      }

      // メルカリ比較（オプション、デフォルト skip 推奨だが skipMercari 未指定なら回す）
      const comparisons = [];
      if (!skipMercari && items.length > 0) {
        console.log(`  メルカリ比較中...`);
        for (const item of items) {
          if (!item.price) continue;
          const mercariKw = buildMercariKeyword(item.name, cur.ipShort);
          let sold = await searchMercariSold(mercariKw, 60);
          sold = filterSoldList(sold, {
            surugayaName: item.name,
            productType: item.productType,
            characterName: item.characterName,
            mercariKeyword: mercariKw,
            listPrice: item.listPrice || item.price,
          });
          if (sold.length === 0) {
            comparisons.push({ ...item, mercariKeyword: mercariKw, mercariMedian: null, mercariCount: 0, diff: null, trend: null });
            continue;
          }
          const mercariMedian = median(sold.map(s => s.price));
          const diff = item.price > 0 ? Math.round(((mercariMedian - item.price) / item.price) * 100) : null;
          comparisons.push({ ...item, mercariKeyword: mercariKw, mercariMedian, mercariCount: sold.length, diff, trend: null });
          await sleep(1000);
        }
      }

      // DB保存
      let saved = 0;
      if (!skipDb && items.length > 0) {
        saved = saveToDb(items, comparisons, cur.ipShort, cur.ipShort);
      }

      // cursor 更新
      const newLastPage = Math.max(cur.lastPage, scanResult.lastReachedPage);
      const newItemsScanned = cur.itemsScanned + items.length;
      const isExhausted = scanResult.exhausted ? 1 : 0;
      updateCursor(cur.id, {
        lastPage: newLastPage,
        lastPageAt: new Date().toISOString(),
        totalHits: scanResult.totalHits || cur.totalHits,
        itemsScanned: newItemsScanned,
        newLastRun: items.length,
        isExhausted,
      });

      totalNewItems += items.length;
      totalScanned += 1;
      console.log(`  → ${items.length}件取得 / 保存 ${saved} / lastPage=${newLastPage}${isExhausted ? " [EXHAUSTED]" : ""}`);

      // 各 cursor 間で 3秒待機（駿屋bot対策）
      await sleep(3000);
    } catch (e) {
      console.error(`  ⚠️ [${cur.ipShort}/${cur.category || "-"}] エラーでスキップ: ${e.message}`);
      await sleep(3000);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Deep scan 完了: ${totalScanned} cursors / 取得 ${totalNewItems}件`);
}

// ========================================
// エントリーポイント
// ========================================
if (scanMode === "deep" && (useWatchlist || useCursor)) {
  runDeepScan().catch(e => {
    console.error("エラー:", e);
    process.exit(1);
  });
} else if (useWatchlist) {
  runWatchlist().catch(e => {
    console.error("エラー:", e);
    process.exit(1);
  });
} else {
  main().catch(e => {
    console.error("エラー:", e);
    process.exit(1);
  });
}
