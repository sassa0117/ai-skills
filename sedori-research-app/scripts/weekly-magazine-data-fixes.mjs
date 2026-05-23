/**
 * WeeklyMagazine データ汚染の一括修正 (UPDATE のみ・DELETE禁止)
 *
 * 対処:
 *   Phase 0: WeeklyMagazineItem に excludedReason カラム追加 (ALTER, 冪等)
 *   Phase 1: 専用出品検出 (「○○様」「専用」) → excludedReason UPDATE
 *   Phase 2: 復刻版検出 (「復刻版」「復刻パック」) → excludedReason UPDATE
 *   Phase 3: 全Group の itemCount/priceMedian/Min/Max/P90 再計算 UPDATE
 *
 * 絶対ルール: DELETE FROM / TRUNCATE / 列省略INSERT 一切禁止。UPDATE のみ。
 *
 * 使い方:
 *   node scripts/weekly-magazine-data-fixes.mjs --dry-run   検出だけ
 *   node scripts/weekly-magazine-data-fixes.mjs              本走
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

const DRY_RUN = process.argv.includes("--dry-run");
console.log(DRY_RUN ? "*** DRY RUN MODE *** (DB変更なし)" : "*** 本走 ***");

// ===== Phase 0: excludedReason カラム ensure =====
// ALTER TABLE は非破壊なので DRY_RUN でも実行する（後続クエリが SELECT excludedReason に依存）
{
  const cols = db.prepare("PRAGMA table_info(WeeklyMagazineItem)").all();
  if (!cols.some(c => c.name === "excludedReason")) {
    db.exec("ALTER TABLE WeeklyMagazineItem ADD COLUMN excludedReason TEXT");
    console.log("✔ WeeklyMagazineItem.excludedReason カラム追加");
  } else {
    console.log("= WeeklyMagazineItem.excludedReason 既存");
  }
}

// ===== Phase 1: 専用出品検出 =====
const SPECIAL_PATTERNS = [
  /^[A-Za-z0-9*✨★☆]+\s*[A-Za-z0-9*✨★☆]?\s*様/,    // 「a*7様」「N J 様」「N*✨様」等
  /[A-Za-z0-9]{1,3}\s*様(?!\S)/,                     // 「NJ様」末尾型
  /^[ぁ-んァ-ヶ一-龯]{1,3}\s*\*\s*[ぁ-んァ-ヶ一-龯]{0,3}\s*様/,  // 「さ*様」「り*♪様」（日本語ベース）
  /専用\s*出品/,
  /^専用\s/,
  /お取り置き|お取置き/,
];

// ===== Phase 2: 復刻版検出 =====
const REPRINT_PATTERNS = [
  /復刻版/,
  /復刻\s*パック/,
];

// ===== Phase 1+2 実行 =====
console.log("\n[Phase 1+2] 専用出品・復刻版を excludedReason に UPDATE...");
const valid = db.prepare("SELECT id, rawName FROM WeeklyMagazineItem WHERE excludedReason IS NULL").all();
const updExc = db.prepare("UPDATE WeeklyMagazineItem SET excludedReason=?, groupId=NULL WHERE id=?");
let spCount = 0, reCount = 0;
const sampleSp = [], sampleRe = [];
for (const it of valid) {
  const name = it.rawName || "";
  let reason = null;
  for (const re of SPECIAL_PATTERNS) if (re.test(name)) { reason = "text:専用出品"; break; }
  if (!reason) for (const re of REPRINT_PATTERNS) if (re.test(name)) { reason = "text:復刻版"; break; }
  if (!reason) continue;
  if (!DRY_RUN) updExc.run(reason, it.id);
  if (reason === "text:専用出品") {
    spCount++;
    if (sampleSp.length < 5) sampleSp.push(name.slice(0, 80));
  } else {
    reCount++;
    if (sampleRe.length < 5) sampleRe.push(name.slice(0, 80));
  }
}
console.log(`  専用: ${spCount}件, 復刻版: ${reCount}件`);
if (sampleSp.length) console.log("  専用例:", sampleSp);
if (sampleRe.length) console.log("  復刻例:", sampleRe);

// ===== Phase 3: 全Group の集計値再計算 =====
console.log("\n[Phase 3] 全Group の itemCount/priceMedian/Min/Max/P90 再計算 (samples は触らない)...");
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2);
}
function p90(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(s.length * 0.9));
  return s[idx];
}

const allGroups = db.prepare("SELECT id FROM WeeklyMagazineGroup").all();
const updGroup = db.prepare("UPDATE WeeklyMagazineGroup SET itemCount=?, priceMedian=?, priceMin=?, priceMax=?, priceP90=? WHERE id=?");
let recalcCount = 0, emptyCount = 0;
for (const g of allGroups) {
  const prices = db.prepare("SELECT price FROM WeeklyMagazineItem WHERE groupId=? AND excludedReason IS NULL").all(g.id).map(r => r.price);
  if (prices.length === 0) {
    if (!DRY_RUN) updGroup.run(0, 0, 0, 0, 0, g.id);
    emptyCount++;
    continue;
  }
  if (!DRY_RUN) updGroup.run(prices.length, median(prices), Math.min(...prices), Math.max(...prices), p90(prices), g.id);
  recalcCount++;
}
console.log(`  集計更新: ${recalcCount} (有効) / ${emptyCount} (item=0 になった)`);

db.close();
console.log("\n" + (DRY_RUN ? "*** DRY RUN 完了 ***" : "*** 本走 完了 ***"));
