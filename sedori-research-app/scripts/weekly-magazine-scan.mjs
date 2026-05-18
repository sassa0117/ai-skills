/**
 * 週刊誌相場スキャン
 *
 * メルカリの sold + 取引中から週刊誌出品を取得し、
 * [雑誌名 × 年 × 号 × 表紙作品 × 連載イベント] でグルーピングして相場を集計・SQLite保存。
 *
 * 仕様: handoff_weekly-magazine-scan.md
 *
 * 使い方:
 *   node scripts/weekly-magazine-scan.mjs [オプション]
 *
 * オプション:
 *   --queries "週刊少年ジャンプ 新連載,..."  検索クエリをカンマ区切りで指定
 *   --min-count 2                            件数フィルタ（出力時、デフォルト2）
 *   --json                                   結果をJSON標準出力
 *   --no-save                                DB保存しない（テスト実行用）
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

const generateMercariJwt =
  require("generate-mercari-jwt").default || require("generate-mercari-jwt");

// ========================================
// CLI引数
// ========================================
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx === -1 ? null : args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const DEFAULT_QUERIES = [
  // 連載イベント系（鉱脈）
  "週刊少年ジャンプ 新連載",
  "週刊少年ジャンプ 最終回",
  "週刊少年ジャンプ 合併号",
  "週刊少年マガジン 新連載",
  "週刊少年マガジン 最終回",
  "週刊少年サンデー 新連載",
  "週刊少年チャンピオン 新連載",
  // 旧号（年指定）
  "週刊少年ジャンプ 1985年",
  "週刊少年ジャンプ 1995年",
  "週刊少年ジャンプ 1997年",
  "週刊少年ジャンプ 2016年",
  "週刊少年ジャンプ 2018年",
  "週刊少年ジャンプ 2019年",
  // 月刊系
  "月刊コロコロコミック 創刊",
  // 少女誌（要観察）
  "りぼん 付録",
  "なかよし 付録",
];
const queriesArg = getArg("--queries");
const queries = queriesArg
  ? queriesArg.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_QUERIES;
const minCount = parseInt(getArg("--min-count") || "2", 10);
const jsonOutput = hasFlag("--json");
const noSave = hasFlag("--no-save");

const log = (...a) => { if (!jsonOutput) console.log(...a); };

// ========================================
// DB初期化
// ========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS WeeklyMagazineScan (
    id TEXT PRIMARY KEY,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'running',
    totalFetched INTEGER DEFAULT 0,
    totalFiltered INTEGER DEFAULT 0,
    totalGrouped INTEGER DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS WeeklyMagazineGroup (
    id TEXT PRIMARY KEY,
    scanId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    magazineTitle TEXT NOT NULL,
    year INTEGER,
    issueNumber TEXT,
    coverIP TEXT,
    eventTags TEXT,
    itemCount INTEGER NOT NULL,
    priceMedian INTEGER NOT NULL,
    priceMin INTEGER NOT NULL,
    priceMax INTEGER NOT NULL,
    priceP90 INTEGER,
    samples TEXT,
    FOREIGN KEY (scanId) REFERENCES WeeklyMagazineScan(id)
  );
  CREATE INDEX IF NOT EXISTS idx_wmGroup_mag ON WeeklyMagazineGroup(magazineTitle);
  CREATE INDEX IF NOT EXISTS idx_wmGroup_year ON WeeklyMagazineGroup(year);
  CREATE INDEX IF NOT EXISTS idx_wmGroup_cover ON WeeklyMagazineGroup(coverIP);
  CREATE INDEX IF NOT EXISTS idx_wmGroup_scan ON WeeklyMagazineGroup(scanId);

  CREATE TABLE IF NOT EXISTS WeeklyMagazineItem (
    id TEXT PRIMARY KEY,
    scanId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    groupId TEXT,
    rawName TEXT NOT NULL,
    price INTEGER NOT NULL,
    soldDate TEXT,
    isSold INTEGER DEFAULT 0,
    url TEXT,
    thumbnailUrl TEXT,
    magazineTitle TEXT,
    year INTEGER,
    issueNumber TEXT,
    coverIP TEXT,
    eventTagsJSON TEXT,
    condition TEXT,
    gradeRank TEXT,
    FOREIGN KEY (scanId) REFERENCES WeeklyMagazineScan(id),
    FOREIGN KEY (groupId) REFERENCES WeeklyMagazineGroup(id)
  );
  CREATE INDEX IF NOT EXISTS idx_wmItem_scan ON WeeklyMagazineItem(scanId);
  CREATE INDEX IF NOT EXISTS idx_wmItem_group ON WeeklyMagazineItem(groupId);
  CREATE INDEX IF NOT EXISTS idx_wmItem_cover ON WeeklyMagazineItem(coverIP);

  CREATE TABLE IF NOT EXISTS MagazineIssueCover (
    id TEXT PRIMARY KEY,
    magazineTitle TEXT NOT NULL,
    year INTEGER NOT NULL,
    issueNumber TEXT NOT NULL,
    coverIP TEXT,
    eventTagsJSON TEXT,
    coverImageUrl TEXT,
    source TEXT,
    UNIQUE (magazineTitle, year, issueNumber)
  );
`);

// ========================================
// ユーティリティ
// ========================================
function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] || s[s.length - 1];
}

// ========================================
// 除外フィルタ（雑誌固有）
// ========================================
const EXCLUDE_PATTERNS = [
  /セット/,
  /まとめ/,
  /\d+冊/,
  /\d+\s*点/,
  /\d+\s*[-〜~ｰ–]\s*\d+\s*[年号巻]/,
  /[A-Za-z぀-ヿ一-鿿]+\s*様/, // 「○○様」リクエスト商品
  /専用ページ/,
  /リクエスト/,
  /全話切り取り/,
  /切り抜き/,
  /\bコピー\b/,
];
function shouldExclude(name) {
  return EXCLUDE_PATTERNS.some((p) => p.test(name));
}

// ========================================
// 雑誌名抽出
// ========================================
const MAGAZINE_TITLES = [
  // 長い順に並べる（部分一致を避けるため）
  { canonical: "週刊少年ジャンプ", patterns: [/週刊少年ジャンプ/, /少年ジャンプ/] },
  { canonical: "週刊少年マガジン", patterns: [/週刊少年マガジン/, /少年マガジン/] },
  { canonical: "週刊少年サンデー", patterns: [/週刊少年サンデー/, /少年サンデー/] },
  { canonical: "週刊少年チャンピオン", patterns: [/週刊少年チャンピオン/, /少年チャンピオン/] },
  { canonical: "ヤングジャンプ", patterns: [/週刊ヤングジャンプ/, /ヤングジャンプ/, /YJ/i] },
  { canonical: "ヤングマガジン", patterns: [/週刊ヤングマガジン/, /ヤングマガジン/] },
  { canonical: "ジャンプスクエア", patterns: [/ジャンプスクエア/, /ジャンプSQ/i, /JUMP\s*SQ/i] },
  { canonical: "月刊少年マガジン", patterns: [/月刊少年マガジン/, /月マガ/] },
  { canonical: "月刊コロコロコミック", patterns: [/月刊コロコロコミック/, /コロコロコミック/, /コロコロ(?!アニキ)/] },
  { canonical: "別冊コロコロコミック", patterns: [/別冊コロコロ/] },
  { canonical: "りぼん", patterns: [/りぼん/] },
  { canonical: "なかよし", patterns: [/なかよし/] },
  { canonical: "ちゃお", patterns: [/ちゃお/] },
  { canonical: "ビッグコミック", patterns: [/ビッグコミック/] },
  { canonical: "モーニング", patterns: [/週刊モーニング/, /モーニング/] },
  { canonical: "アフタヌーン", patterns: [/アフタヌーン/] },
  { canonical: "別冊マーガレット", patterns: [/別冊マーガレット|別マ\b/] },
  { canonical: "マーガレット", patterns: [/マーガレット/] },
];

function extractMagazineTitle(name) {
  for (const m of MAGAZINE_TITLES) {
    for (const p of m.patterns) {
      if (p.test(name)) return m.canonical;
    }
  }
  return null;
}

// ========================================
// 年抽出
// ========================================
function extractYear(name) {
  // 完全な4桁年が優先
  const full = name.match(/(19[789]\d|20[012]\d)\s*年/);
  if (full) return parseInt(full[1], 10);
  const full2 = name.match(/\b(19[789]\d|20[012]\d)\b/);
  if (full2) return parseInt(full2[1], 10);
  // 'XX年表記（曖昧、信頼度低い） → 不採用
  return null;
}

// ========================================
// 号数抽出
// ========================================
function extractIssueNumber(name) {
  // 合併号・特大号・創刊号・周年記念号
  if (/合併号/.test(name)) {
    const m = name.match(/(\d{1,2})\s*[･・\.]?\s*(\d{1,2})\s*合併号/);
    if (m) return `${m[1]}・${m[2]}合併号`;
    return "合併号";
  }
  if (/創刊号/.test(name)) return "創刊号";
  const anniv = name.match(/(\d{1,3})\s*周年記念号?/);
  if (anniv) return `${anniv[1]}周年記念号`;
  if (/新年特大号/.test(name)) return "新年特大号";
  if (/新春特大号/.test(name)) return "新春特大号";

  // 通常号 "○○号" / "No.○○" / "No ○○"
  const patterns = [
    /(?:\b|年)\s*(\d{1,3})\s*号/,
    /No\.?\s*(\d{1,3})/i,
    /第\s*(\d{1,3})\s*号/,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) return m[1];
  }
  return null;
}

// ========================================
// 連載イベント抽出
// ========================================
const EVENT_TAGS = [
  { tag: "新連載", regex: /新連載|連載開始|第\s*1\s*話|初掲載|初登場|連載スタート/ },
  { tag: "最終回", regex: /最終回|連載終了|完結号/ },
  { tag: "巻頭カラー", regex: /巻頭カラー|巻頭/ },
  { tag: "センターカラー", regex: /センターカラー|センター/ },
  { tag: "読切", regex: /読切|読み切り/ },
  { tag: "表紙", regex: /表紙/ },
];

function extractEventTags(name) {
  const tags = [];
  for (const e of EVENT_TAGS) {
    if (e.regex.test(name)) tags.push(e.tag);
  }
  return tags;
}

// ========================================
// 鑑定・コンディション
// ========================================
function extractCondition(name) {
  const rated = name.match(/(PSA|BGS|CGC)\s*([0-9]+(?:\.[0-9])?)/i);
  if (rated) return { condition: "鑑定品", gradeRank: `${rated[1].toUpperCase()} ${rated[2]}` };
  if (/鑑定品|グレーディング|グレード付/i.test(name)) return { condition: "鑑定品", gradeRank: null };
  if (/状態(が)?(悪|わる)|難あり|難有り|ジャンク|ボロボロ/.test(name)) return { condition: "E", gradeRank: null };
  if (/傷あり|汚れ|シミ|シール跡|折れ|焼け|破れ|落書/.test(name)) return { condition: "D", gradeRank: null };
  if (/やや傷|小傷|少し傷|微傷|日焼け|軽い擦れ|若干/.test(name)) return { condition: "C", gradeRank: null };
  if (/付録欠|付録なし|付録無し/.test(name)) return { condition: "C", gradeRank: null };
  if (/シュリンク/.test(name)) return { condition: "S", gradeRank: null };
  if (/付録付き|付録あり|付録有/.test(name)) return { condition: "A", gradeRank: null };
  return { condition: "B", gradeRank: null };
}

// ========================================
// 表紙作品（IP）抽出 — comic-ip-normalize.json を流用
// ========================================
const NORMALIZE_MAP_PATH = path.join(__dirname, "comic-ip-normalize.json");
const normalizeMapRaw = JSON.parse(fs.readFileSync(NORMALIZE_MAP_PATH, "utf-8"));
const normalizeMap = Object.entries(normalizeMapRaw).map(([canonical, patterns]) => ({
  canonical,
  regexes: patterns.map((p) => new RegExp(p, "i")),
}));

function extractCoverIP(name) {
  // 商品名から既知IPの登場をチェック（早期マッチ）
  for (const { canonical, regexes } of normalizeMap) {
    for (const re of regexes) {
      if (re.test(name)) return canonical;
    }
  }
  return null;
}

// ========================================
// メルカリ検索
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
      headers: {
        "Content-Type": "application/json",
        DPoP: dpop,
        "X-Platform": "web",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map((item) => ({
      id: item.id,
      name: item.name,
      price:
        typeof item.price === "string"
          ? parseInt(item.price, 10)
          : item.price,
      isSold: /SOLD/i.test(String(item.status || "")),
      date: item.updated
        ? new Date(item.updated * 1000).toISOString().split("T")[0]
        : null,
      url: `https://jp.mercari.com/item/${item.id}`,
      thumbnailUrl:
        Array.isArray(item.thumbnails) && item.thumbnails.length
          ? item.thumbnails[0]
          : item.thumbnail || item.thumbnail_url || null,
    }));
  } catch (e) {
    log(`⚠ メルカリ検索失敗 "${keyword}": ${e.message}`);
    return [];
  }
}

// ========================================
// アイテム抽出（フィルタ + パース）
// ========================================
function extractFromItems(rawItems) {
  const filtered = rawItems.filter((it) => !shouldExclude(it.name));
  const extracted = [];
  const rejected = { noMag: 0, noYear: 0, noIssue: 0 };

  for (const it of filtered) {
    const magazineTitle = extractMagazineTitle(it.name);
    if (!magazineTitle) { rejected.noMag++; continue; }
    const year = extractYear(it.name);
    if (!year) { rejected.noYear++; continue; }
    const issueNumber = extractIssueNumber(it.name);
    if (!issueNumber) { rejected.noIssue++; continue; }
    const coverIP = extractCoverIP(it.name);
    const eventTags = extractEventTags(it.name);
    const { condition, gradeRank } = extractCondition(it.name);
    extracted.push({
      ...it,
      magazineTitle,
      year,
      issueNumber,
      coverIP,
      eventTags,
      condition,
      gradeRank,
    });
  }
  return { filtered, extracted, rejected };
}

// ========================================
// グルーピング: magazineTitle × year × issueNumber × coverIP
// （eventTagsは号の属性。出品の表記揺れで別グループ化しない）
// ========================================
function groupItems(extracted) {
  const groups = new Map();
  for (const it of extracted) {
    const key = `${it.magazineTitle}||${it.year}||${it.issueNumber}||${it.coverIP || ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        magazineTitle: it.magazineTitle,
        year: it.year,
        issueNumber: it.issueNumber,
        coverIP: it.coverIP,
        items: [],
      });
    }
    groups.get(key).items.push(it);
  }
  // eventTagsはグループ集約後に「過半数の出品に登場するタグ」を採用
  // （1件だけの誤抽出を排除、号の属性として確からしいタグだけ残す）
  for (const g of groups.values()) {
    const counts = new Map();
    for (const it of g.items) {
      for (const t of it.eventTags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const threshold = Math.max(1, Math.ceil(g.items.length / 2));
    g.eventTags = [...counts.entries()]
      .filter(([_, c]) => c >= threshold)
      .map(([t]) => t)
      .sort();
  }
  return groups;
}

// ========================================
// メイン
// ========================================
const insertScan = db.prepare(`
  INSERT INTO WeeklyMagazineScan (id, status, totalFetched, totalFiltered, totalGrouped)
  VALUES (?, 'running', 0, 0, 0)
`);
const updateScan = db.prepare(`
  UPDATE WeeklyMagazineScan
  SET status = ?, totalFetched = ?, totalFiltered = ?, totalGrouped = ?, error = ?
  WHERE id = ?
`);
const insertGroup = db.prepare(`
  INSERT INTO WeeklyMagazineGroup
    (id, scanId, magazineTitle, year, issueNumber, coverIP, eventTags,
     itemCount, priceMedian, priceMin, priceMax, priceP90, samples)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertItem = db.prepare(`
  INSERT OR REPLACE INTO WeeklyMagazineItem
    (id, scanId, groupId, rawName, price, soldDate, isSold, url, thumbnailUrl,
     magazineTitle, year, issueNumber, coverIP, eventTagsJSON, condition, gradeRank)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

async function main() {
  const scanId = generateId();
  if (!noSave) insertScan.run(scanId);
  log(`▶ scanId: ${scanId}`);
  log(`▶ queries: ${queries.length}件`);

  const allItems = new Map();
  for (const q of queries) {
    log(`  [fetch] "${q}"`);
    const items = await fetchMercari(q);
    log(`    取得 ${items.length}件`);
    for (const it of items) {
      if (!allItems.has(it.id)) allItems.set(it.id, it);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  log(`▶ 重複排除後: ${allItems.size}件`);

  const { filtered, extracted, rejected } = extractFromItems([...allItems.values()]);
  log(`▶ 除外フィルタ後: ${filtered.length}件`);
  log(`▶ パース成功: ${extracted.length}件`);
  log(`▶ 棄却内訳: 雑誌名なし=${rejected.noMag} / 年なし=${rejected.noYear} / 号なし=${rejected.noIssue}`);

  const groups = groupItems(extracted);
  log(`▶ ユニークグループ: ${groups.size}`);

  const groupRows = [];
  for (const g of groups.values()) {
    const prices = g.items.map((i) => i.price);
    const row = {
      id: generateId(),
      scanId,
      magazineTitle: g.magazineTitle,
      year: g.year,
      issueNumber: g.issueNumber,
      coverIP: g.coverIP,
      eventTags: JSON.stringify(g.eventTags),
      itemCount: g.items.length,
      priceMedian: median(prices),
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      priceP90: percentile(prices, 0.9),
      samples: JSON.stringify(
        g.items.slice(0, 3).map((i) => ({
          name: i.name, price: i.price, url: i.url, date: i.date, isSold: i.isSold,
        }))
      ),
    };
    groupRows.push(row);
    if (!noSave) {
      insertGroup.run(
        row.id, row.scanId, row.magazineTitle, row.year, row.issueNumber,
        row.coverIP, row.eventTags, row.itemCount, row.priceMedian,
        row.priceMin, row.priceMax, row.priceP90, row.samples
      );
      for (const it of g.items) {
        insertItem.run(
          it.id, scanId, row.id, it.name, it.price, it.date, it.isSold ? 1 : 0,
          it.url, it.thumbnailUrl || null,
          it.magazineTitle, it.year, it.issueNumber, it.coverIP,
          JSON.stringify(it.eventTags),
          it.condition || "B", it.gradeRank || null
        );
      }
    }
  }

  if (!noSave) {
    updateScan.run("completed", allItems.size, filtered.length, groups.size, null, scanId);
  }

  const topGroups = groupRows
    .filter((g) => g.itemCount >= minCount)
    .sort((a, b) => b.priceMedian - a.priceMedian)
    .slice(0, 30);

  if (jsonOutput) {
    console.log(JSON.stringify({
      scanId,
      totalFetched: allItems.size,
      totalFiltered: filtered.length,
      totalExtracted: extracted.length,
      totalGroups: groups.size,
      topGroups,
    }, null, 2));
  } else {
    log(`\n▶ Top グループ（priceMedian降順、件数${minCount}以上、上位30）:`);
    log(
      "mag".padEnd(18) +
      "year".padStart(5) +
      "issue".padStart(10) +
      "IP".padStart(14) +
      "events".padEnd(20) +
      "n".padStart(4) +
      "med".padStart(10) +
      "max".padStart(11)
    );
    for (const g of topGroups) {
      log(
        String(g.magazineTitle || "").padEnd(18) +
        String(g.year || "").padStart(5) +
        String(g.issueNumber || "").padStart(10) +
        String(g.coverIP || "").padStart(14) +
        (" " + (JSON.parse(g.eventTags || "[]").join(",") || "-")).padEnd(20) +
        String(g.itemCount).padStart(4) +
        ("¥" + g.priceMedian.toLocaleString()).padStart(10) +
        ("¥" + g.priceMax.toLocaleString()).padStart(11)
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  if (!noSave) {
    db.prepare(`UPDATE WeeklyMagazineScan SET status='failed', error=? WHERE id=?`).run(
      String(e.message || e), ""
    );
  }
  process.exit(1);
});
