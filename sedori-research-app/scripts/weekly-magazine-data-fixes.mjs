/**
 * WeeklyMagazine データ汚染の一括修正 (UPDATE のみ・DELETE禁止)
 *
 * 対処:
 *   Phase 0: WeeklyMagazineItem に excludedReason カラム追加 (ALTER, 冪等)
 *   Phase 1: 専用出品検出 (「○○様」「専用」) → excludedReason UPDATE
 *   Phase 2: 復刻版検出 (「復刻版」「復刻パック」) → excludedReason UPDATE
 *   Phase 2.5: 号番号ミスマッチ検出 (rawName から年・号を抽出し Group の年・号と比較)
 *              → ミスマッチで excludedReason UPDATE
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

// ===== Phase 2.5: 号番号ミスマッチ検出 =====
console.log("\n[Phase 2.5] 号番号ミスマッチを excludedReason に UPDATE...");
// rawName から「YYYY年(M月D日)?(NN(・MM)?号)」を抽出。号は数字 + 任意の連結 (1・2, 4-6, 52・53)
const YEAR_ISSUE_RE = /(\d{4})\s*年(?:\s*\d{1,2}\s*月\s*\d{1,2}\s*日)?\s*(\d{1,2}(?:\s*[・\-~〜]\s*\d{1,2})?)\s*号/g;

function parseIssueNumbers(text) {
  const found = [];
  YEAR_ISSUE_RE.lastIndex = 0;
  let m;
  while ((m = YEAR_ISSUE_RE.exec(text)) !== null) {
    found.push({ year: parseInt(m[1], 10), issue: m[2].replace(/\s+/g, "") });
  }
  return found;
}

// 期待号と照合: issueの片側マッチも許容 (例: group="52・53" item="52" or "53" もOK)
function issueMatches(groupIssue, itemIssue) {
  if (!groupIssue || !itemIssue) return true; // 不明なら通す
  const norm = (s) => String(s).replace(/[・\-~〜\s]/g, ",").split(",").filter(Boolean);
  const gParts = norm(groupIssue);
  const iParts = norm(itemIssue);
  // 数値レベルで一致するパートが1つでもあればOK (合併号許容)
  return gParts.some((g) => iParts.includes(g));
}

// Group の issueNumber が純粋な数字 (合併号含む) でない場合は判定不能 → スキップ
// 例: "50周年記念号" "合併号" 等は数字単体じゃないので照合できない
const NUMERIC_ISSUE_RE = /^\d+(?:[・\-~〜\s]+\d+)?$/;
function isNumericIssue(s) {
  return s != null && NUMERIC_ISSUE_RE.test(String(s));
}

const candidates = db.prepare(`
  SELECT i.id, i.rawName, g.year as gYear, g.issueNumber as gIssue
  FROM WeeklyMagazineItem i
  JOIN WeeklyMagazineGroup g ON i.groupId = g.id
  WHERE i.excludedReason IS NULL AND g.year IS NOT NULL AND g.issueNumber IS NOT NULL
`).all();

let mismatchCount = 0;
let skippedNonNumeric = 0;
const mismatchSamples = [];
for (const r of candidates) {
  if (!isNumericIssue(r.gIssue)) { skippedNonNumeric++; continue; }
  const found = parseIssueNumbers(r.rawName || "");
  if (found.length === 0) continue; // rawName に号番号情報がない場合は判定不能 → スキップ
  // 「グループ年・号と一致する記述」が rawName に少なくとも1つあれば正常
  const okMatch = found.some((f) => f.year === r.gYear && issueMatches(r.gIssue, f.issue));
  if (okMatch) continue;
  // 1つでも違う年・号が rawName にあれば「号間違い」
  const allWrong = found.every((f) => f.year !== r.gYear || !issueMatches(r.gIssue, f.issue));
  if (!allWrong) continue;
  if (!DRY_RUN) updExc.run("text:号番号ミスマッチ", r.id);
  mismatchCount++;
  if (mismatchSamples.length < 8) {
    mismatchSamples.push({
      group: `${r.gYear}/${r.gIssue}`,
      rawNameFound: found.map((f) => `${f.year}/${f.issue}`).join(", "),
      rawName: (r.rawName || "").slice(0, 70),
    });
  }
}
console.log(`  号番号ミスマッチ: ${mismatchCount}件 / 非数値Groupスキップ: ${skippedNonNumeric}件`);
if (mismatchSamples.length) console.table(mismatchSamples);

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
