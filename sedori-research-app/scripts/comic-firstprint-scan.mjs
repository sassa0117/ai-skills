/**
 * 初版コミック相場スキャン
 *
 * メルカリの sold + 取引中から「初版」コミックを取得し、
 * [IP] × [巻数] × [タグ組合せ] でグルーピングして相場を集計・SQLite保存。
 *
 * 仕様: handoff_comic-firstprint-scan.md
 *
 * 使い方:
 *   node scripts/comic-firstprint-scan.mjs [オプション]
 *
 * オプション:
 *   --queries "初版 1巻,初版 5巻,..."   検索クエリをカンマ区切りで指定
 *   --min-count 2                       件数フィルタ（出力時、デフォルト2）
 *   --json                              結果をJSON標準出力
 *   --no-save                           DB保存しない（テスト実行用）
 *   --normalize-only                    既存DBデータの再正規化のみ（API叩かない）※未実装
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

// Gemini text 判定は撤廃 (feedback_use-self-for-text-classification.md 違反のため)。
// text 分類は shouldExclude (Claude が書いた regex) のみ。追加除外は data-fixes.mjs で post-process。
const { shouldExclude } = await import("./lib/comic-exclude-patterns.mjs");
// normalize ロジック (装飾文字除去 + map match) は共用ライブラリへ
const { normalizeIP: libNormalizeIP } = await import("./lib/comic-normalize.mjs");

// ========================================
// CLI引数パース
// ========================================
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

// クエリ: 「初版 1巻」1本で広く取って結果をさばく（さっさ仕様 2026-05-19）
// メルカリAPI は Google風の負号(-XXX)に対応してないので、除外はコード側 EXCLUDE_PATTERNS で
const DEFAULT_QUERIES = ["初版 1巻"];
const queriesArg = getArg("--queries");
const queries = queriesArg
  ? queriesArg.split(",").map(s => s.trim()).filter(Boolean)
  : DEFAULT_QUERIES;
const minCount = parseInt(getArg("--min-count") || "1", 10);
const jsonOutput = hasFlag("--json");
const noSave = hasFlag("--no-save");

// 価格セーフティ: 「初版」表記が無くても拾う閾値（さっさ仕様 2026-05-20: 5000→1000、定価超えは全部拾う）
const PRICE_SAFETY_THRESHOLD = parseInt(getArg("--price-threshold") || "1000", 10);

// Phase2: Phase1の結果から「高騰IP」を抽出 → そのIP名で追加3クエリ検索
// さっさ仕様 2026-05-20: 状態問わず・1件でもこの閾値超えあれば発動（中央値判定は廃止）
const HIGH_PRICE_THRESHOLD = parseInt(getArg("--high-price") || "3000", 10);
const SKIP_PHASE2 = hasFlag("--skip-phase2");

// Gemini 関連フラグは撤廃（text 分類は Claude judge / regex に統一）

const log = (...a) => { if (!jsonOutput) console.log(...a); };

// ========================================
// DB初期化
// ========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS ComicFirstPrintScan (
    id TEXT PRIMARY KEY,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'running',
    totalFetched INTEGER DEFAULT 0,
    totalFiltered INTEGER DEFAULT 0,
    totalGrouped INTEGER DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS ComicFirstPrintGroup (
    id TEXT PRIMARY KEY,
    scanId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ipName TEXT NOT NULL,
    volume INTEGER NOT NULL,
    tags TEXT NOT NULL,
    itemCount INTEGER NOT NULL,
    priceMedian INTEGER NOT NULL,
    priceMin INTEGER NOT NULL,
    priceMax INTEGER NOT NULL,
    samples TEXT,
    FOREIGN KEY (scanId) REFERENCES ComicFirstPrintScan(id)
  );
  CREATE INDEX IF NOT EXISTS idx_cfpGroup_ip ON ComicFirstPrintGroup(ipName);
  CREATE INDEX IF NOT EXISTS idx_cfpGroup_vol ON ComicFirstPrintGroup(volume);
  CREATE INDEX IF NOT EXISTS idx_cfpGroup_scan ON ComicFirstPrintGroup(scanId);

  CREATE TABLE IF NOT EXISTS ComicFirstPrintItem (
    id TEXT PRIMARY KEY,
    scanId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    groupId TEXT,
    rawName TEXT NOT NULL,
    price INTEGER NOT NULL,
    soldDate TEXT,
    url TEXT,
    extractedIP TEXT,
    normalizedIP TEXT,
    volume INTEGER,
    tagsJSON TEXT,
    FOREIGN KEY (scanId) REFERENCES ComicFirstPrintScan(id),
    FOREIGN KEY (groupId) REFERENCES ComicFirstPrintGroup(id)
  );
  CREATE INDEX IF NOT EXISTS idx_cfpItem_scan ON ComicFirstPrintItem(scanId);
  CREATE INDEX IF NOT EXISTS idx_cfpItem_group ON ComicFirstPrintItem(groupId);
  CREATE INDEX IF NOT EXISTS idx_cfpItem_ip ON ComicFirstPrintItem(normalizedIP);
`);

// 既存DBにカラムが無ければ追加
{
  const cols = db.prepare("PRAGMA table_info(ComicFirstPrintItem)").all();
  const has = (n) => cols.some(c => c.name === n);
  if (!has("thumbnailUrl")) db.exec("ALTER TABLE ComicFirstPrintItem ADD COLUMN thumbnailUrl TEXT");
  if (!has("condition"))    db.exec("ALTER TABLE ComicFirstPrintItem ADD COLUMN condition TEXT");
  if (!has("gradeRank"))    db.exec("ALTER TABLE ComicFirstPrintItem ADD COLUMN gradeRank TEXT");
}

// ========================================
// ユーティリティ
// ========================================
function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ========================================
// 仕様 § 3.3 除外フィルタ
// ========================================
// パターンは scripts/lib/comic-exclude-patterns.mjs に集約（3スクリプト共通）。
// 新規パターンを足す時はそちら1箇所だけ修正すれば全scanに反映される。

// ========================================
// 仕様 § 3.4 タグ抽出
//   - 「初版」フラグと「版違いタグ」（グループキーに使う）を分離
//   - コンディションは別関数 extractCondition で判定
// ========================================
function extractGrade(name) {
  const hasFirstPrint = /初版/.test(name) && !/非初版|再版/.test(name);
  // 版違いタグ（原作初版と別物として扱うのでグループキーに含める）
  const versionTags = [];
  if (/新装版/.test(name))            versionTags.push("新装版");
  if (/完全版/.test(name))            versionTags.push("完全版");
  if (/文庫版|文庫判/.test(name))      versionTags.push("文庫版");
  if (/新書判/.test(name))            versionTags.push("新書判");
  if (/ワイド版|ワイド判/.test(name))  versionTags.push("ワイド版");
  if (/愛蔵版/.test(name))            versionTags.push("愛蔵版");
  if (/特装版|限定版/.test(name))      versionTags.push("特装版");
  return { hasFirstPrint, versionTags };
}

// ========================================
// コンディション判定（さっさ仕様 2026-05-12）
//   鑑定品（gradeRank付き）
//   S シュリンク付帯完備
//   A 美品 帯付き
//   B 帯なし美品           ← デフォルト
//   C やや傷汚れあり
//   D 傷汚れあり
//   E 全体的に状態が悪い
// ========================================
function extractCondition(name) {
  // 鑑定品（PSA/BGS/CGC 等）→ ランクも抽出
  const rated = name.match(/(PSA|BGS|CGC)\s*([0-9]+(?:\.[0-9])?)/i);
  if (rated) return { condition: "鑑定品", gradeRank: `${rated[1].toUpperCase()} ${rated[2]}` };
  if (/鑑定品|グレーディング|グレード付/i.test(name)) return { condition: "鑑定品", gradeRank: null };
  // サイン本（販促のサイン会/サインポップ等は除外）
  const hasSignature = /サイン本|直筆サイン|サイン入り|サイン色紙|signed/i.test(name)
    && !/サイン会|サイン入りポップ|サインボード/i.test(name);
  if (hasSignature) return { condition: "サイン本", gradeRank: null };
  // E 全体的に状態が悪い
  if (/状態(が)?(悪|わる)|難あり|難有り|ジャンク|ボロボロ/.test(name)) return { condition: "E", gradeRank: null };
  // D 傷汚れあり
  if (/傷あり|汚れ|シミ|シール跡|折れ|焼け|破れ|落書/.test(name)) return { condition: "D", gradeRank: null };
  // C やや傷汚れあり
  if (/やや傷|小傷|少し傷|微傷|日焼け|軽い擦れ|若干/.test(name)) return { condition: "C", gradeRank: null };
  // S シュリンク付
  if (/シュリンク/.test(name)) return { condition: "S", gradeRank: null };
  // A 帯付き
  const hasObi = /帯付|帯あり|帯有/.test(name);
  const noObi  = /帯なし|帯無し/.test(name);
  if (hasObi) return { condition: "A", gradeRank: null };
  // B 帯なし美品（デフォルト）
  if (noObi)  return { condition: "B", gradeRank: null };
  return { condition: "B", gradeRank: null };
}

// ========================================
// 仕様 § 3.5 巻数抽出
// ========================================
function extractVolume(name) {
  const patterns = [
    /第\s*(\d{1,3})\s*巻/,
    /[\(（]?\s*(\d{1,3})\s*巻\s*[\)）]?/,
    /Vol\.?\s*(\d{1,3})/i,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) return { vol: parseInt(m[1], 10), idx: m.index, len: m[0].length };
  }
  return null;
}

// ========================================
// 仕様 § 3.6 IP抽出
// ========================================
const NOISE_WORDS = [
  "初版","非初版","再版","帯付き","帯付","帯あり","帯なし","帯無し","帯",
  "シュリンク付き","シュリンク付","シュリンクあり","シュリンク",
  "新装版","完全版","文庫版","文庫判","新書判","ワイド版","ワイド判",
  "特装版","限定版","愛蔵版","美品","極美品","新品","未開封","未読",
  "コミックス","ジャンプ","マガジン","サンデー","チャンピオン",
  "集英社","講談社","小学館","角川","KADOKAWA","秋田書店","スクウェアエニックス",
  "チラシ","チラシ付き","特典","非売品","付録","ステッカー","ミニステッカー","ポストカード",
  "ジャンパラ付き","ジャンパラ",
  "送料無料","即購入","即決","匿名配送","早い物勝ち","レア","希少","貴重","美麗","綺麗",
  "良品","中古","used","USED","新刊","旧版","新装版",
];

function extractIP(name) {
  const v = extractVolume(name);
  if (!v) return null;
  let s = name.slice(0, v.idx).trim();
  s = s.replace(/[【\[](.*?)[】\]]/g, " ");
  s = s.replace(/[（\(](.*?)[）\)]/g, " ");
  s = s.replace(/[【\[（\(】\]）\)※☆★◆●○・]/g, " ");
  for (const w of NOISE_WORDS) s = s.split(w).join(" ");
  s = s.replace(/\d{1,3}\s*巻/g, " ").replace(/Vol\.?\s*\d+/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

// ========================================
// 仕様 § 3.7 表記揺れ正規化
// normalize ロジック (装飾文字除去 + map match) は lib/comic-normalize.mjs に統一
// ========================================
function normalizeIP(rawIP) {
  // strict=false (default): map miss でも装飾除去後の stripped を返す。
  // 呼び出し側の `normalizeIP(rawIP) || rawIP` fallback は、装飾除去で何も変わらない時のみ発動する。
  return libNormalizeIP(rawIP);
}

// ========================================
// メルカリ検索（sold + 取引中）
// ========================================
const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function fetchMercari(keyword, limit = 120) {
  try {
    const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: {
        keyword,
        sort: "SORT_CREATED_TIME",
        order: "ORDER_DESC",
        status: ["STATUS_SOLD_OUT", "STATUS_TRADING"],
      },
    };
    const res = await fetch(MERCARI_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map(item => ({
      id: item.id,
      name: item.name,
      price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
      date: item.updated ? new Date(item.updated * 1000).toISOString().split("T")[0] : null,
      url: `https://jp.mercari.com/item/${item.id}`,
      thumbnailUrl: Array.isArray(item.thumbnails) && item.thumbnails.length
        ? item.thumbnails[0]
        : (item.thumbnail || item.thumbnail_url || null),
    }));
  } catch (e) {
    log(`⚠ メルカリ検索失敗 "${keyword}": ${e.message}`);
    return [];
  }
}

// ========================================
// メイン
// ========================================
const insertScan = db.prepare(`
  INSERT INTO ComicFirstPrintScan (id, status, totalFetched, totalFiltered, totalGrouped)
  VALUES (?, 'running', 0, 0, 0)
`);
const updateScan = db.prepare(`
  UPDATE ComicFirstPrintScan
  SET status = ?, totalFetched = ?, totalFiltered = ?, totalGrouped = ?, error = ?
  WHERE id = ?
`);
const insertGroup = db.prepare(`
  INSERT INTO ComicFirstPrintGroup
    (id, scanId, ipName, volume, tags, itemCount, priceMedian, priceMin, priceMax, samples)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
// append-only: メルカリ item.id でユニーク、初回観測価格・状態を固定で残す（再出品は別ID）
const insertItem = db.prepare(`
  INSERT OR IGNORE INTO ComicFirstPrintItem
    (id, scanId, groupId, rawName, price, soldDate, url, extractedIP, normalizedIP, volume, tagsJSON, thumbnailUrl, condition, gradeRank)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ========================================
// 共通: アイテム配列 → フィルタ・抽出
// ========================================
function extractFromItems(rawItems) {
  const filtered = rawItems.filter(it => !shouldExclude(it.name));
  const extracted = [];
  const unmatchedIPs = new Map();
  for (const it of filtered) {
    const v = extractVolume(it.name);
    if (!v) continue;
    const { hasFirstPrint, versionTags } = extractGrade(it.name);
    // 価格セーフティ: 「初版」表記が無くても高額品はサイン本/特装/見落とし初版の可能性 → 拾う
    if (!hasFirstPrint && (it.price || 0) < PRICE_SAFETY_THRESHOLD) continue;
    const { condition, gradeRank } = extractCondition(it.name);
    const rawIP = extractIP(it.name);
    if (!rawIP) continue;
    const normalizedIP = normalizeIP(rawIP) || rawIP;  // 未マッチでも捨てない、rawIPで保存
    if (!normalizeIP(rawIP)) {
      unmatchedIPs.set(rawIP, (unmatchedIPs.get(rawIP) || 0) + 1);
    }
    // 初版判定通った/価格セーフティで拾った を versionTags で区別
    const tagsForGroup = [...versionTags];
    if (hasFirstPrint) tagsForGroup.push("初版");
    else tagsForGroup.push("高額検知");
    extracted.push({
      ...it,
      volume: v.vol,
      versionTags: tagsForGroup,
      condition,
      gradeRank,
      rawIP,
      normalizedIP,
      hasFirstPrint,
    });
  }
  return { filtered, extracted, unmatchedIPs };
}

function groupByIPVolumeTags(extracted) {
  const groups = new Map();
  for (const it of extracted) {
    const sortedTags = [...it.versionTags].sort();
    const key = `${it.normalizedIP}||${it.volume}||${sortedTags.join(",")}`;
    if (!groups.has(key)) {
      groups.set(key, { ipName: it.normalizedIP, volume: it.volume, tags: sortedTags.join(","), items: [] });
    }
    groups.get(key).items.push(it);
  }
  return groups;
}

async function main() {
  const scanId = generateId();
  if (!noSave) insertScan.run(scanId);
  log(`▶ scanId: ${scanId}`);
  log(`▶ Phase1 queries: ${queries.length}本（${queries.join(" / ")}）`);

  // ========== Phase1: 新着順で広く取得 ==========
  const allItems = new Map();
  for (const q of queries) {
    const items = await fetchMercari(q);
    let added = 0;
    for (const it of items) {
      if (!allItems.has(it.id)) {
        allItems.set(it.id, it);
        added++;
      }
    }
    log(`  Phase1 "${q}" 取得 ${items.length} / 新規 ${added} / 累計 ${allItems.size}`);
    await new Promise(r => setTimeout(r, 1200));
  }
  log(`▶ Phase1 重複排除後: ${allItems.size}件`);

  // ========== Phase1.5: 1巻スキャン結果から高騰IP抽出 ==========
  // さっさ仕様 2026-05-20: 状態問わず（hasFirstPrint不問）・1件でも HIGH_PRICE_THRESHOLD 超えがあれば発動
  const phase1Extracted = extractFromItems([...allItems.values()]).extracted;
  const ipVol1Prices = new Map();
  for (const it of phase1Extracted) {
    if (it.volume !== 1) continue;
    if (!ipVol1Prices.has(it.normalizedIP)) ipVol1Prices.set(it.normalizedIP, []);
    ipVol1Prices.get(it.normalizedIP).push(it.price);
  }
  const highIPs = [];
  for (const [ip, prices] of ipVol1Prices) {
    const maxPrice = Math.max(...prices);
    if (maxPrice < HIGH_PRICE_THRESHOLD) continue;
    highIPs.push({ ip, max: maxPrice, n: prices.length });
  }
  highIPs.sort((a, b) => b.max - a.max);
  log(`▶ Phase1.5 高騰IP抽出: ${highIPs.length}件 (1巻に¥${HIGH_PRICE_THRESHOLD}超え1件以上)`);
  if (highIPs.length) {
    log(`   ${highIPs.slice(0, 10).map(h => `${h.ip}(max¥${h.max}/n${h.n})`).join(" / ")}${highIPs.length > 10 ? ` +${highIPs.length - 10}` : ""}`);
  }

  // ========== Phase2: 高騰IPで追加3クエリ検索 ==========
  // さっさ仕様 2026-05-20: IPごとに3クエリ展開（③廃止、②-3 で代替）
  //   ②-1: {IP} 2巻 初版    (2巻初版を狙い撃ち)
  //   ②-2: {IP} 1巻         (状態問わず1巻の他の出品)
  //   ②-3: {IP} 初版        (初版表記ある全巻を網羅)
  if (!SKIP_PHASE2 && highIPs.length) {
    for (const { ip } of highIPs) {
      const queries = [`${ip} 2巻 初版`, `${ip} 1巻`, `${ip} 初版`];
      for (const q of queries) {
        const items = await fetchMercari(q);
        let added = 0;
        for (const it of items) {
          if (!allItems.has(it.id)) {
            allItems.set(it.id, it);
            added++;
          }
        }
        log(`  Phase2 "${q}" 取得 ${items.length} / 新規 ${added} / 累計 ${allItems.size}`);
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  // ========== 全アイテムで最終フィルタ・抽出・グルーピング ==========
  const totalFetched = allItems.size;
  const { filtered, extracted, unmatchedIPs } = extractFromItems([...allItems.values()]);
  log(`▶ 除外フィルタ後: ${filtered.length}件`);
  log(`▶ IP抽出成功（正規化済み）: ${extracted.length}件`);
  log(`▶ 未マッチIP: ${unmatchedIPs.size}種`);

  // Gemini判定撤廃 (text 分類はClaude judge regex に統一)
  // scan時は extractFromItems の shouldExclude で text 除外済。
  // 追加除外 (セット品/雑誌/専用/特典付き/カテゴリ違い) は post-process で
  // data-fixes.mjs を走らせる運用に変更。scan後に下記コマンドを実行する想定:
  //   node scripts/comic-firstprint-data-fixes.mjs
  const validated = extracted;
  const groups = groupByIPVolumeTags(validated);
  log(`▶ ユニークグループ: ${groups.size}`);

  // 5. 集計・DB保存
  const groupRows = [];
  for (const g of groups.values()) {
    const prices = g.items.map(i => i.price);
    const row = {
      id: generateId(),
      scanId,
      ipName: g.ipName,
      volume: g.volume,
      tags: g.tags,
      itemCount: g.items.length,
      priceMedian: median(prices),
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      samples: JSON.stringify(
        g.items.slice(0, 2).map(i => ({ name: i.name, price: i.price, url: i.url, date: i.date }))
      ),
    };
    groupRows.push(row);
    if (!noSave) {
      insertGroup.run(
        row.id, row.scanId, row.ipName, row.volume, row.tags,
        row.itemCount, row.priceMedian, row.priceMin, row.priceMax, row.samples
      );
      for (const it of g.items) {
        // tagsJSON は表示用に「版違い + コンディション派生タグ」をまとめる
        const itemTags = [...(it.versionTags || [])];
        if (it.condition) itemTags.push(it.condition);
        if (it.gradeRank) itemTags.push(it.gradeRank);
        insertItem.run(
          it.id, scanId, row.id, it.name, it.price, it.date, it.url,
          it.rawIP, it.normalizedIP, it.volume, JSON.stringify(itemTags),
          it.thumbnailUrl || null,
          it.condition || "B",
          it.gradeRank || null
        );
      }
    }
  }

  if (!noSave) {
    updateScan.run("completed", totalFetched, filtered.length, groups.size, null, scanId);
  }

  // 6. 出力
  const topGroups = groupRows
    .filter(g => g.itemCount >= minCount)
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, 25);

  const unmatchedTop = [...unmatchedIPs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  if (jsonOutput) {
    console.log(JSON.stringify({
      scanId,
      totalFetched,
      totalFiltered: filtered.length,
      totalExtracted: extracted.length,
      totalValidated: validated.length,
      totalGroups: groups.size,
      topGroups,
      unmatchedTop: unmatchedTop.map(([ip, count]) => ({ ip, count })),
    }, null, 2));
  } else {
    log(`\n▶ Top グループ (件数 ${minCount} 以上, 件数降順):`);
    console.table(topGroups.map(g => ({
      IP: g.ipName.slice(0, 20),
      vol: g.volume,
      tags: g.tags,
      n: g.itemCount,
      median: g.priceMedian,
      min: g.priceMin,
      max: g.priceMax,
    })));

    if (unmatchedTop.length) {
      log(`\n▶ 正規化マップに未マッチのIP（Top 30, 件数降順）:`);
      console.table(unmatchedTop.map(([ip, count]) => ({ ip: ip.slice(0, 50), count })));
      log(`  → comic-ip-normalize.json への追加候補を判定すること`);
    }
  }
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
