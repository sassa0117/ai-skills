/**
 * IP自動取り込み
 *
 * しょぼいカレンダー (cal.syoboi.jp) から今期＋次期のTV作品を取得し、
 * 既存 goods-watchlist.json と diff して未登録IPを自動追加する。
 *
 * 優先度（project_anime-ip-priority.md）:
 *   ② 2期・2クール（続編）を先に
 *   ③ 1期を後に
 *
 * 1日上限: MAX_ADD_PER_RUN（デフォルト10）
 * 1IPあたり追加キーワード: グッズ / フィギュア / 一番くじ
 *
 * 使い方:
 *   node scripts/ip-fetch.mjs            # 通常実行（追加あり）
 *   node scripts/ip-fetch.mjs --dry-run  # 追加せずレポートのみ
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import Database from "better-sqlite3";
import crypto from "crypto";
import { DEFAULT_DEEP_CATEGORIES } from "./setup-watchlist-cursors.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WATCHLIST_PATH = path.join(__dirname, "goods-watchlist.json");
const ADD_LOG_PATH = path.join(__dirname, "..", "logs", "ip-fetch-added.json");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");
const MAX_ADD_PER_RUN = parseInt(process.env.MAX_ADD_PER_RUN || "10", 10);
const KEYWORD_SUFFIXES = ["グッズ", "フィギュア", "一番くじ"];
const DRY_RUN = process.argv.includes("--dry-run");

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (sedori-research; ip-fetch)",
  "Accept-Language": "ja,en;q=0.8",
};

// ====================================
// しょぼいカレンダー quarter ページ取得
// ====================================
function quarterOf(month) {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function currentAndNextQuarter() {
  const now = new Date();
  const y = now.getFullYear();
  const q = quarterOf(now.getMonth() + 1);
  const nextY = q === 4 ? y + 1 : y;
  const nextQ = q === 4 ? 1 : q + 1;
  return [
    { year: y, q },
    { year: nextY, q: nextQ },
  ];
}

// li 内に含まれていればアニメ作品とみなすキーワード
const ANIME_MARKERS = [
  "アニメーション制作",
  "アニメ制作",
  "総作画監督",
  "作画監督",
  "キャラクターデザイン",
  "シリーズ構成",
];

async function fetchQuarter(year, q) {
  const url = `https://cal.syoboi.jp/quarter/${year}q${q}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const titles = new Set();
  $("li[id^=TID]").each((_, li) => {
    const liHtml = $(li).html() || "";
    const isAnime = ANIME_MARKERS.some((kw) => liHtml.includes(kw));
    if (!isAnime) return;
    const titleEl = $(li).find('a[href*="/tid/"].title').first();
    const t = titleEl.text().trim();
    if (!t || t.length < 2 || t.length > 80) return;
    if (/^\d+$/.test(t)) return;
    titles.add(t);
  });
  return [...titles];
}

// ====================================
// 分類・正規化
// ====================================
const EXCLUDE_PATTERNS = [
  /再放送|再編集|一挙放送|セレクション|傑作選/,
  /^劇場版/,
  /実写ドラマ版/,
  /TVSP$/,
  /^映画/,
  /\(実写ドラマ版\)/,
];

function shouldExclude(title) {
  return EXCLUDE_PATTERNS.some((re) => re.test(title));
}

// 続編判定: II, III, IV, 2nd, Season N, 第N期, シーズンN, NEXT, 数字+期
const SEQUEL_PATTERNS = [
  /\bII+\b/,
  /\bIV\b/,
  /\b\d+(st|nd|rd|th)\b/i,
  /Season\s*\d+/i,
  /シーズン\s*\d+/,
  /第\s*\d+\s*期/,
  /第\s*\d+\s*シリーズ/,
  /\(第\d+(期|シリーズ|シーズン)\)/,
  /\d+期/,
  /続編/,
  /\bNEXT\b/i,
  /actII|actIII/i,
];

function isSequel(title) {
  return SEQUEL_PATTERNS.some((re) => re.test(title));
}

// ベースIP名抽出（続編サフィックスを削除）
function cleanIpTitle(title) {
  return title
    .replace(/\s*[（(].*?[）)]\s*$/g, "")
    .replace(/\s*-?\s*Second\s*Season\s*-?$/i, "")
    .replace(/\s*Season\s*\d+.*$/i, "")
    .replace(/\s*シーズン\s*\d+.*$/g, "")
    .replace(/\s*第\s*\d+\s*(期|シリーズ|シーズン).*$/g, "")
    .replace(/\s*\d+(st|nd|rd|th)\s*season.*$/i, "")
    .replace(/\s+(II+|IV|NEXT)$/i, "")
    .replace(/\s*[0-9０-９]+期$/g, "")
    .replace(/\s*[0-9０-９]+st\s*season$/gi, "")
    .replace(/\s*続編$/g, "")
    .trim();
}

// ====================================
// watchlist 操作
// ====================================
function loadWatchlist() {
  const raw = fs.readFileSync(WATCHLIST_PATH, "utf-8");
  return JSON.parse(raw);
}

function existingIpSet(watchlist) {
  const set = new Set();
  (watchlist.accounts || []).forEach((a) => {
    if (a.ip) set.add(a.ip);
  });
  return set;
}

function backupWatchlist() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = WATCHLIST_PATH.replace(/\.json$/, `.bak-${ts}.json`);
  fs.copyFileSync(WATCHLIST_PATH, backupPath);
  return backupPath;
}

function saveWatchlist(watchlist) {
  const json = JSON.stringify(watchlist, null, 2);
  fs.writeFileSync(WATCHLIST_PATH, json, "utf-8");
}

function makeSeasonLabel() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const seasonName = m <= 3 ? "冬" : m <= 6 ? "春" : m <= 9 ? "夏" : "秋";
  return `${y}${seasonName}`;
}

function cuid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString("hex");
  return `c${ts}${rand}`;
}

function initCursorsForIps(ips) {
  if (!ips.length) return { created: 0, skipped: 0 };
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  try {
    const sel = db.prepare(`
      SELECT id FROM ScanCursor
       WHERE ipShort = ?
         AND COALESCE(category, '') = COALESCE(?, '')
         AND sortMode = ?
    `);
    const ins = db.prepare(`
      INSERT INTO ScanCursor (id, createdAt, updatedAt, ipShort, category, sortMode, lastPage, totalHits, itemsScanned, newLastRun, isExhausted, note)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
    `);
    const now = new Date().toISOString();
    let created = 0, skipped = 0;
    const tx = db.transaction(() => {
      for (const ip of ips) {
        for (const cat of DEFAULT_DEEP_CATEGORIES) {
          if (sel.get(ip, cat.id, "release")) { skipped++; continue; }
          ins.run(cuid(), now, now, ip, cat.id, "release", cat.label);
          created++;
        }
      }
    });
    tx();
    return { created, skipped };
  } finally {
    db.close();
  }
}

function appendAddLog(entries) {
  let history = [];
  try {
    if (fs.existsSync(ADD_LOG_PATH)) {
      history = JSON.parse(fs.readFileSync(ADD_LOG_PATH, "utf-8"));
      if (!Array.isArray(history)) history = [];
    }
  } catch {
    history = [];
  }
  history.push({ at: new Date().toISOString(), entries });
  const logDir = path.dirname(ADD_LOG_PATH);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(ADD_LOG_PATH, JSON.stringify(history, null, 2), "utf-8");
}

// ====================================
// main
// ====================================
async function main() {
  console.log(`=== ip-fetch start (${DRY_RUN ? "dry-run" : "live"}) ===`);

  const quarters = currentAndNextQuarter();
  const rawTitles = new Set();
  for (const { year, q } of quarters) {
    try {
      const list = await fetchQuarter(year, q);
      console.log(`  ${year}q${q}: ${list.length}件取得`);
      list.forEach((t) => rawTitles.add(t));
    } catch (e) {
      console.error(`  ${year}q${q} 取得失敗: ${e.message}`);
    }
  }

  console.log(`合計タイトル: ${rawTitles.size}`);

  // 分類: {baseIp, isSequel}
  const candidates = new Map(); // baseIp -> { isSequel, originalTitle }
  for (const title of rawTitles) {
    if (shouldExclude(title)) continue;
    const base = cleanIpTitle(title);
    if (!base || base.length < 2) continue;
    const seq = isSequel(title);
    if (!candidates.has(base)) {
      candidates.set(base, { isSequel: seq, originalTitle: title });
    } else if (seq && !candidates.get(base).isSequel) {
      candidates.set(base, { isSequel: true, originalTitle: title });
    }
  }
  console.log(`正規化後ユニークIP: ${candidates.size}`);

  // 既存 watchlist と diff
  const watchlist = loadWatchlist();
  const existing = existingIpSet(watchlist);
  console.log(`既存watchlist IP: ${existing.size}`);

  const newOnes = [];
  for (const [baseIp, meta] of candidates) {
    if (existing.has(baseIp)) continue;
    newOnes.push({ ip: baseIp, ...meta });
  }
  // 続編優先で並べる
  newOnes.sort((a, b) => Number(b.isSequel) - Number(a.isSequel));

  console.log(`新規候補: ${newOnes.length}件 (続編=${newOnes.filter((n) => n.isSequel).length})`);

  const toAdd = newOnes.slice(0, MAX_ADD_PER_RUN);
  console.log(`今回追加: ${toAdd.length}件 (上限 ${MAX_ADD_PER_RUN})`);
  toAdd.forEach((n) =>
    console.log(`  + [${n.isSequel ? "②" : "③"}] ${n.ip}  (元: ${n.originalTitle})`)
  );

  if (toAdd.length === 0) {
    console.log("追加対象なし。終了。");
    return;
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] watchlist は変更しません。");
    return;
  }

  // バックアップ → 追加 → 保存
  const backup = backupWatchlist();
  console.log(`バックアップ: ${backup}`);

  const season = makeSeasonLabel();
  const newEntries = [];
  for (const n of toAdd) {
    for (const sfx of KEYWORD_SUFFIXES) {
      newEntries.push({
        ip: n.ip,
        keyword: `${n.ip} ${sfx}`,
        season,
        autoAdded: true,
        autoAddedAt: new Date().toISOString(),
        priority: n.isSequel ? 2 : 3,
      });
    }
  }
  watchlist.accounts = (watchlist.accounts || []).concat(newEntries);
  saveWatchlist(watchlist);
  console.log(`watchlist 更新: +${newEntries.length} エントリ`);

  // ScanCursor 初期行を作成（新規IP × 主要9カテゴリ）
  try {
    const cursorRes = initCursorsForIps(toAdd.map((n) => n.ip));
    console.log(`ScanCursor: +${cursorRes.created} 新規 / ${cursorRes.skipped} スキップ`);
  } catch (e) {
    console.error(`ScanCursor 初期化失敗: ${e.message}`);
  }

  appendAddLog(
    toAdd.map((n) => ({
      ip: n.ip,
      isSequel: n.isSequel,
      originalTitle: n.originalTitle,
      keywords: KEYWORD_SUFFIXES.map((s) => `${n.ip} ${s}`),
    }))
  );

  console.log("=== ip-fetch done ===");
}

main().catch((e) => {
  console.error("致命的エラー:", e.stack || e.message);
  process.exit(1);
});
