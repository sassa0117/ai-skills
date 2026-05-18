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

const DEFAULT_QUERIES = ["初版 1巻", "初版 5巻", "初版 10巻", "初版 20巻", "初版 30巻"];
const queriesArg = getArg("--queries");
const queries = queriesArg
  ? queriesArg.split(",").map(s => s.trim()).filter(Boolean)
  : DEFAULT_QUERIES;
const minCount = parseInt(getArg("--min-count") || "2", 10);
const jsonOutput = hasFlag("--json");
const noSave = hasFlag("--no-save");

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
const EXCLUDE_PATTERNS = [
  /セット/,
  /まとめ/,
  /全巻/,
  /\d+冊/,
  /\d+\s*[-〜~ｰ–]\s*\d+\s*巻/,
];
function shouldExclude(name) {
  return EXCLUDE_PATTERNS.some(p => p.test(name));
}

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
// ========================================
const NORMALIZE_MAP_PATH = path.join(__dirname, "comic-ip-normalize.json");
const normalizeMapRaw = JSON.parse(fs.readFileSync(NORMALIZE_MAP_PATH, "utf-8"));
const normalizeMap = Object.entries(normalizeMapRaw).map(([canonical, patterns]) => ({
  canonical,
  regexes: patterns.map(p => new RegExp(p, "i")),
}));

function normalizeIP(rawIP) {
  if (!rawIP) return null;
  for (const { canonical, regexes } of normalizeMap) {
    for (const re of regexes) {
      if (re.test(rawIP)) return canonical;
    }
  }
  return null;
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
const insertItem = db.prepare(`
  INSERT OR REPLACE INTO ComicFirstPrintItem
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
    if (!hasFirstPrint) continue;
    const { condition, gradeRank } = extractCondition(it.name);
    const rawIP = extractIP(it.name);
    if (!rawIP) continue;
    const normalizedIP = normalizeIP(rawIP);
    if (!normalizedIP) {
      unmatchedIPs.set(rawIP, (unmatchedIPs.get(rawIP) || 0) + 1);
      continue;
    }
    extracted.push({ ...it, volume: v.vol, versionTags, condition, gradeRank, rawIP, normalizedIP });
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

// Phase 2 の高騰検知パラメータ
const HOT_PRICE_THRESHOLD = 5000;  // 1巻中央値これ以上で他巻も追加検索
const HOT_MIN_COUNT = 2;            // 1巻のサンプル数下限

async function main() {
  const scanId = generateId();
  if (!noSave) insertScan.run(scanId);
  log(`▶ scanId: ${scanId}`);
  log(`▶ queries: ${queries.join(" / ")}`);

  // ========== Phase 1: 既存のquery検索（広く浅く） ==========
  const allItems = new Map();
  for (const q of queries) {
    log(`  [Phase1] 検索: "${q}"`);
    const items = await fetchMercari(q);
    log(`    取得 ${items.length}件`);
    for (const it of items) {
      if (!allItems.has(it.id)) allItems.set(it.id, it);
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  log(`▶ [Phase1] 重複排除後: ${allItems.size}件`);

  // ========== Phase 1.5: 1巻の高騰IPを検知 ==========
  const phase1 = extractFromItems([...allItems.values()]);
  const phase1Groups = groupByIPVolumeTags(phase1.extracted);
  const hotIPs = [...phase1Groups.values()]
    .filter(g => g.volume === 1 && g.tags === "" && g.items.length >= HOT_MIN_COUNT)
    .filter(g => median(g.items.map(i => i.price)) >= HOT_PRICE_THRESHOLD)
    .map(g => ({
      ipName: g.ipName,
      median: median(g.items.map(i => i.price)),
      n: g.items.length,
    }))
    .sort((a, b) => b.median - a.median);

  log(`▶ [Phase1.5] 1巻中央値${HOT_PRICE_THRESHOLD}円以上のIP: ${hotIPs.length}件`);
  for (const h of hotIPs) log(`    ${h.ipName} (中央値¥${h.median.toLocaleString()}, n=${h.n})`);

  // ========== Phase 2: 高騰IPで追加検索（巻数指定なし、部分一致で全巻取得） ==========
  let phase2Added = 0;
  for (const h of hotIPs) {
    const q = `${h.ipName} 初版`;
    log(`  [Phase2] 検索: "${q}"`);
    const items = await fetchMercari(q);
    let added = 0;
    for (const it of items) {
      if (!allItems.has(it.id)) {
        allItems.set(it.id, it);
        added++;
      }
    }
    log(`    取得 ${items.length}件 / 新規追加 ${added}件`);
    phase2Added += added;
    await new Promise(r => setTimeout(r, 1200));
  }
  log(`▶ [Phase2] 追加分: ${phase2Added}件 / 合計: ${allItems.size}件`);

  // ========== 全アイテムで最終フィルタ・抽出・グルーピング ==========
  const totalFetched = allItems.size;
  const { filtered, extracted, unmatchedIPs } = extractFromItems([...allItems.values()]);
  log(`▶ 除外フィルタ後: ${filtered.length}件`);
  log(`▶ IP抽出成功（正規化済み）: ${extracted.length}件`);
  log(`▶ 未マッチIP: ${unmatchedIPs.size}種`);

  const groups = groupByIPVolumeTags(extracted);
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
