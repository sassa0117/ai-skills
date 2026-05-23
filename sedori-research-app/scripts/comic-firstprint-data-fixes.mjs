/**
 * ComicFirstPrint データ汚染の一括修正（UPDATE のみ・DELETE禁止）
 *
 * 対処:
 *   Phase 1: セット品検出（「1巻から22巻」「全23巻」等）→ excludedReason UPDATE
 *   Phase 2: 雑誌混入検出（「漫画 雑誌」「""" """」「号 表紙」等）→ excludedReason UPDATE
 *   Phase 3: 装飾文字・不可視文字を含む normalizedIP の統合（既存 normalize map に再 match）
 *   Phase 4: 同IP×同volumeの重複Group統合（最大Groupを親に、子Item.groupId UPDATE）
 *   Phase 5: 全Group の itemCount/priceMedian/Min/Max を再計算 UPDATE（samples は触らない）
 *
 * 絶対ルール: DELETE FROM / TRUNCATE / 列省略INSERT 一切禁止。UPDATE のみ。
 *
 * 使い方:
 *   node scripts/comic-firstprint-data-fixes.mjs --dry-run   検出だけして DB は触らない
 *   node scripts/comic-firstprint-data-fixes.mjs              本走
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

const DRY_RUN = process.argv.includes("--dry-run");
console.log(DRY_RUN ? "*** DRY RUN MODE *** (DB変更なし)" : "*** 本走 ***");

// ===== Phase 1: セット品検出 =====
const SET_PATTERNS = [
  /\d+\s*巻\s*[〜~ーから～-]\s*\d+\s*巻/,        // 「1巻から22巻」「1巻〜23巻」「1巻ー22巻」
  /[1１一壱]\s*[〜~]\s*\d+\s*巻/,                  // 「1〜23巻」（"巻"前が省略）
  /全\s*\d+\s*巻/,                                  // 「全11巻」
  /\d+\s*冊\s*(セット|まとめ|一括)/,                 // 「N冊セット」「N冊まとめ」
  /\d+\s*巻\s*(セット|まとめ売り|一括)/,            // 「23巻セット」
  /(まとめ売り|一括売り|全巻セット|全巻まとめ)/,
  /(BOX|ボックス|box)\s*セット/i,
  /\b完結\b.{0,5}セット/,
];

// ===== Phase 2: 雑誌混入検出 =====
const MAGAZINE_PATTERNS = [
  /漫画\s*雑誌/,
  /雑誌\s*[（(]?\s*"""/,
  /"""\s*[）)]?\s*\d+\s*巻/,                       // 「""" """ 4 巻)」
  /号.{0,8}表紙/,                                   // 「○号 ○○ 表紙」
];

// ===== Phase 3: normalize 再適用ロジック =====
const NORMALIZE_MAP_PATH = path.join(PROJECT_ROOT, "scripts", "comic-ip-normalize.json");
const NORMALIZE_MAP = JSON.parse(fs.readFileSync(NORMALIZE_MAP_PATH, "utf-8"));

const DECORATION_RE = /[✴︎★☆⭐︎✨※♪✿❤❥]/g;
const INVISIBLE_RE = /[​‌‍﻿⁠ ]/g;

function normalizeStrip(s) {
  if (!s) return s;
  let out = s.replace(INVISIBLE_RE, "");
  out = out.replace(DECORATION_RE, "");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function tryNormalize(rawIp) {
  if (!rawIp) return null;
  const stripped = normalizeStrip(rawIp);
  // 既存 NORMALIZE_MAP の各エントリで match試行
  for (const [norm, patterns] of Object.entries(NORMALIZE_MAP)) {
    for (const p of patterns) {
      try {
        const re = new RegExp(p, "i");
        if (re.test(stripped)) return norm;
      } catch (e) { /* invalid regex skip */ }
    }
  }
  // map にマッチしなくても、装飾文字除去だけで変わったらそれを返す
  return stripped !== rawIp ? stripped : null;
}

// ===== Phase 1+2 実行 =====
console.log("\n[Phase 1+2] セット品・雑誌混入を excludedReason に UPDATE...");
const validItems = db.prepare("SELECT id, rawName, normalizedIP FROM ComicFirstPrintItem WHERE excludedReason IS NULL").all();
let setCount = 0, magCount = 0;
const updExcluded = db.prepare("UPDATE ComicFirstPrintItem SET excludedReason = ?, groupId = NULL WHERE id = ?");
const sampleSet = [], sampleMag = [];
for (const it of validItems) {
  const name = it.rawName || "";
  const ip = it.normalizedIP || "";
  let matched = null;
  for (const re of SET_PATTERNS) {
    if (re.test(name)) { matched = "text:set品"; break; }
  }
  if (matched) {
    if (sampleSet.length < 5) sampleSet.push(name.slice(0, 80));
    if (!DRY_RUN) updExcluded.run(matched, it.id);
    setCount++;
    continue;
  }
  for (const re of MAGAZINE_PATTERNS) {
    if (re.test(name) || re.test(ip)) { matched = "text:雑誌混入"; break; }
  }
  if (matched) {
    if (sampleMag.length < 5) sampleMag.push(name.slice(0, 80));
    if (!DRY_RUN) updExcluded.run(matched, it.id);
    magCount++;
  }
}
console.log(`  セット品除外: ${setCount}件, 雑誌混入除外: ${magCount}件`);
if (sampleSet.length) console.log("  セット例:", sampleSet);
if (sampleMag.length) console.log("  雑誌例:", sampleMag);

// ===== Phase 3 実行 =====
console.log("\n[Phase 3] 装飾文字・不可視文字 normalize 統合...");
const stillValid = db.prepare("SELECT id, normalizedIP FROM ComicFirstPrintItem WHERE excludedReason IS NULL").all();
let normCount = 0;
const updNorm = db.prepare("UPDATE ComicFirstPrintItem SET normalizedIP = ? WHERE id = ?");
const sampleNorm = [];
for (const it of stillValid) {
  const before = it.normalizedIP;
  const after = tryNormalize(before);
  if (after && after !== before) {
    if (sampleNorm.length < 10) sampleNorm.push(`[${before}] → [${after}]`);
    if (!DRY_RUN) updNorm.run(after, it.id);
    normCount++;
  }
}
console.log(`  normalize変更: ${normCount}件`);
sampleNorm.forEach(s => console.log("   ", s));

// ===== Phase 4: 同IP×同volume の Group統合 =====
console.log("\n[Phase 4] 同IP×同volume 重複Group の統合...");
const dupGroups = db.prepare(`
  SELECT ipName, volume, COUNT(*) c, GROUP_CONCAT(id, '|') ids, GROUP_CONCAT(itemCount, ',') counts
  FROM ComicFirstPrintGroup
  GROUP BY ipName, volume
  HAVING COUNT(*) > 1
`).all();
let mergedChildren = 0;
const updItemGroup = db.prepare("UPDATE ComicFirstPrintItem SET groupId = ? WHERE groupId = ?");
const sampleMerge = [];
for (const dg of dupGroups) {
  const ids = dg.ids.split("|");
  const counts = dg.counts.split(",").map(n => parseInt(n, 10));
  // itemCount 最大の Group を親に
  let maxIdx = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[maxIdx]) maxIdx = i;
  const parentId = ids[maxIdx];
  for (let i = 0; i < ids.length; i++) {
    if (i === maxIdx) continue;
    if (sampleMerge.length < 5) sampleMerge.push(`${dg.ipName} v${dg.volume}: ${ids[i].slice(0,8)}(n=${counts[i]}) → ${parentId.slice(0,8)}(n=${counts[maxIdx]})`);
    if (!DRY_RUN) updItemGroup.run(parentId, ids[i]);
    mergedChildren++;
  }
}
console.log(`  統合: ${dupGroups.length} IP×巻、${mergedChildren} 子Group の Item を親に移動`);
sampleMerge.forEach(s => console.log("   ", s));

// ===== Phase 5: 全Group の集計値再計算 =====
console.log("\n[Phase 5] 全Group の itemCount/priceMedian/Min/Max 再計算 (samples は触らない)...");
function median(arr) {
  const s = [...arr].sort((a,b)=>a-b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n-1)/2] : Math.round((s[n/2-1] + s[n/2]) / 2);
}
const allGroups = db.prepare("SELECT id FROM ComicFirstPrintGroup").all();
let recalcCount = 0, emptyCount = 0;
const updGroup = db.prepare("UPDATE ComicFirstPrintGroup SET itemCount=?, priceMedian=?, priceMin=?, priceMax=? WHERE id=?");
for (const g of allGroups) {
  const prices = db.prepare("SELECT price FROM ComicFirstPrintItem WHERE groupId=? AND excludedReason IS NULL").all(g.id).map(r => r.price);
  const itemCount = prices.length;
  if (itemCount === 0) {
    if (!DRY_RUN) updGroup.run(0, 0, 0, 0, g.id);
    emptyCount++;
    continue;
  }
  if (!DRY_RUN) updGroup.run(itemCount, median(prices), Math.min(...prices), Math.max(...prices), g.id);
  recalcCount++;
}
console.log(`  集計更新: ${recalcCount} Groups (有効) / ${emptyCount} Groups (item=0 になった)`);

console.log("\n" + (DRY_RUN ? "*** DRY RUN 完了 (DB変更なし) ***" : "*** 本走 完了 ***"));
db.close();
