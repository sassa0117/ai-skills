/**
 * ComicFirstPrintGroup.ipName を、その Group に紐づく Item の normalizedIP 多数決で書き換える。
 * 安全装置:
 *   - 新値が normalize map の canonical key に一致する場合のみ書き換える
 *   - もしくは新値が既存値の strict subset (prefix garbage が落ちた形) の場合のみ書き換える
 * 上記いずれにも当てはまらない場合は触らない（汚れた方向への上書き防止）。
 *
 * UPDATE のみ。DELETE/INSERT は永久に禁止 (handoff_comic-cleanup-data-loss-2026-05-23.md)。
 *
 * 使い方:
 *   node scripts/comic-firstprint-relink-groups.mjs [--dry-run]
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { ensureHistoryColumns, updateWithHistory, DEFAULT_HISTORY_PLAN } from "./lib/db-history.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

// _history カラム準備 (冪等)
const added = ensureHistoryColumns(db, DEFAULT_HISTORY_PLAN);
if (added.length) console.log(`▶ _history カラム追加: ${added.join(", ")}`);

const DRY = process.argv.includes("--dry-run");
console.log(DRY ? "*** DRY-RUN ***" : "*** 本走 ***");

const NORMALIZE_MAP_PATH = path.join(__dirname, "comic-ip-normalize.json");
const canonicalSet = new Set(Object.keys(JSON.parse(fs.readFileSync(NORMALIZE_MAP_PATH, "utf-8"))));
console.log(`▶ canonical IP数: ${canonicalSet.size}`);

const scan = db.prepare("SELECT id FROM ComicFirstPrintScan ORDER BY createdAt DESC LIMIT 1").get();
if (!scan) { console.error("scan なし"); process.exit(1); }

const groups = db.prepare("SELECT id, ipName, volume FROM ComicFirstPrintGroup WHERE scanId=?").all(scan.id);
console.log(`▶ 対象Group: ${groups.length}`);

const itemNormByGroup = db.prepare(`
  SELECT normalizedIP, COUNT(*) as n FROM ComicFirstPrintItem
  WHERE groupId=? AND normalizedIP IS NOT NULL
  GROUP BY normalizedIP ORDER BY n DESC LIMIT 1
`);

let changed = 0, same = 0, noItem = 0, skippedUnsafe = 0;
const samples = [];
const unsafeSamples = [];

for (const g of groups) {
  const top = itemNormByGroup.get(g.id);
  if (!top || !top.normalizedIP) { noItem++; continue; }
  if (top.normalizedIP === g.ipName) { same++; continue; }
  const newVal = top.normalizedIP;
  const isCanonical = canonicalSet.has(newVal);
  // 既存値の strict subset (newVal が oldVal に含まれる、かつ短い) を「ノイズ削減方向」として許可
  const isCleaner = g.ipName.includes(newVal) && newVal.length < g.ipName.length;
  if (!isCanonical && !isCleaner) {
    if (unsafeSamples.length < 10) unsafeSamples.push({ before: g.ipName, rejectedAfter: newVal });
    skippedUnsafe++;
    continue;
  }
  if (samples.length < 30) samples.push({ before: g.ipName, after: newVal, vol: g.volume, reason: isCanonical ? "canonical" : "cleaner" });
  if (!DRY) updateWithHistory(db, "ComicFirstPrintGroup", g.id, "ipName", newVal, "relink-groups");
  changed++;
}

console.log(`▶ Group.ipName 変更: ${changed} / 同じ: ${same} / Itemなし: ${noItem} / 安全装置で却下: ${skippedUnsafe}`);
if (samples.length) { console.log("\n=== 採用 ==="); console.table(samples); }
if (unsafeSamples.length) { console.log("\n=== 却下サンプル ==="); console.table(unsafeSamples); }

db.close();
