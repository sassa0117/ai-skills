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
  /[1１一壱]\s*[\-‐ー－〜~～]\s*\d+\s*巻/,         // 「1〜23巻」「1～23巻」「1-31巻」「1 -31巻」（"巻"前が省略・チルダ/ハイフン/長音符）
  /全\s*\d+\s*巻/,                                  // 「全11巻」
  /\d+\s*冊\s*(セット|まとめ|一括)/,                 // 「N冊セット」「N冊まとめ」
  /\d+\s*巻\s*(セット|まとめ売り|一括)/,            // 「23巻セット」
  /(まとめ売り|一括売り|全巻セット|全巻まとめ|最新刊まで)/,
  /\d+\s*巻\s*まで/,
  /(BOX|ボックス|box)\s*セット/i,
  /\b完結\b.{0,5}セット/,
  /\d+\s*[,、・，]\s*\d+\s*[,、・，]\s*\d+\s*巻/,  // 「70,71,72巻」「1、2、3巻」（全角コンマも）
  /\d+\s*巻\s*[,、・，]\s*\d+\s*巻/,                 // 「1巻,2巻」「1巻，2巻」（巻明示で2冊以上）
  /\d+\s*[,、・，]\s*\d+\s*巻\s*セット/,             // 「1,2,3巻 セット」
  /\d+\s*巻\s+\d+\s*巻/,                            // 「1巻 2巻」「3巻 4巻」（スペース区切りで巻明示2冊以上）
  /\b\d+\s*-\s*\d{2,}\b/,                           // 「1-41」「70-99」（片方2桁以上の数字レンジ。「1-1」「1-2」は誤検知しにくい）
];

// ===== Phase 2: 雑誌混入 + 専用出品検出 =====
const MAGAZINE_PATTERNS = [
  /漫画\s*雑誌/,
  /雑誌\s*[（(]?\s*"""/,
  /"""\s*[）)]?\s*\d+\s*巻/,                       // 「""" """ 4 巻)」
  /号.{0,8}表紙/,                                   // 「○号 ○○ 表紙」
  // 専用出品（メルカリ特有：取置依頼）
  /^[A-Za-z0-9*✨★☆]+\s*[A-Za-z0-9*✨★☆]?\s*様/,    // 「N J 様」「N*✨様」「a*様」等
  /[A-Za-z0-9]{1,3}\s*様(?!\S)/,                    // 「NJ様」等
  /専用\s*出品/,
  /お取り置き/,
  /お取置き/,
];

// ===== Phase 2b: 特典・グッズ付き出品（価格が歪む）=====
const GIFT_BUNDLED_PATTERNS = [
  /特典.{0,3}付/,
  /(?:アクスタ|アクリル.?スタンド).{0,3}付/,
  /(?:缶バッジ|缶バッチ).{0,3}付/,
  /ポスター.{0,3}付/,
  /(?:色紙|サイン色紙).{0,3}付/,
  /(?:ぬいぐるみ|フィギュア|ラバスト|キーホルダー).{0,3}付/,
  /(?:応援店|書店).{0,5}ペーパー/,
  /イラスト\s*カード.{0,3}付/,
  /(?:特典|おまけ|オマケ).{0,3}多数/,
  /サイン.{0,3}本/,
  /(?:アクリルスタンド|缶バッジ|ぬいぐるみ|フィギュア)\s*(?:も|＋|プラス)/,
  /サイン\s*色紙/,
  /(?:Blu-?ray|DVD|CD)\s*(?:BOX|ボックス|付)/i,
];

// ===== Phase 2c: 他カテゴリ出品（コミック以外混入）=====
const WRONG_CATEGORY_PATTERNS = [
  /Blu-?ray/i,
  /\bDVD\b/i,
  /\bCD\b/,
  /(?:ポケカ|遊戯王\s*カード|トレカ|デュエマ\s*カード)/,
  /(?:エナジーマーカー|ARS\d+)/,        // ポケカ評価カード
  /(?:アクリルスタンド|ぬいぐるみ|フィギュア|ラバーストラップ)$/,
];

// ===== Phase 3: normalize 再適用ロジック =====
const NORMALIZE_MAP_PATH = path.join(PROJECT_ROOT, "scripts", "comic-ip-normalize.json");
const NORMALIZE_MAP = JSON.parse(fs.readFileSync(NORMALIZE_MAP_PATH, "utf-8"));

const DECORATION_RE = /[✴✴︎★☆⭐⭐︎✨※♪✿❤❥＊*◆■□◇▲△▽▼◎●○♡♥◉◈❖✦✧❀✼✽❁]/g;
const INVISIBLE_RE = /[​‌‍﻿⁠ ]/g;

function normalizeStrip(s) {
  if (!s) return s;
  let out = s.replace(INVISIBLE_RE, "");
  out = out.replace(DECORATION_RE, "");
  // 先頭プレフィックス除去（出品者の状態説明や日付タグ）
  out = out.replace(/^(漫画|本|品|新品|中古|美品|希少|レア|初版本|印刷版|コミック|ノベル|激)\s+/i, "");
  out = out.replace(/^\d{1,2}\/\d{1,2}\s+/, "");          // 「2/25 ○○○」型 日付プレフィックス
  out = out.replace(/^\d+\s+(?=[ぁ-んァ-ヶ一-龯])/, "");   // 「183 ○○○」型 数字プレフィックス（後ろが日本語の時のみ）
  out = out.replace(/[「『【]+/, "").replace(/[」』】]+$/, ""); // 先頭の鍵括弧
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

// ===== 統一判定関数: rawName → excludedReason | null =====
function judgeText(rawName, normalizedIP) {
  const name = rawName || "";
  const ip = normalizedIP || "";
  for (const re of SET_PATTERNS) if (re.test(name)) return "text:set品";
  for (const re of MAGAZINE_PATTERNS) {
    if (re.test(name) || re.test(ip)) return "text:雑誌混入or専用";
  }
  for (const re of GIFT_BUNDLED_PATTERNS) if (re.test(name)) return "text:特典付き";
  for (const re of WRONG_CATEGORY_PATTERNS) if (re.test(name)) return "text:カテゴリ違い";
  return null;
}

// ===== Phase 0: 旧Gemini判定を Claude (text) 判定で再評価 =====
// feedback_use-self-for-text-classification.md 違反の解消:
// Gemini API を text 分類に使ってたのを撤廃、Claude が書いた text パターンで再判定。
console.log("\n[Phase 0] 旧Gemini判定 (excludedReason='gemini:%') を Claude判定で再評価...");
const geminiItems = db.prepare("SELECT id, rawName, normalizedIP, excludedReason FROM ComicFirstPrintItem WHERE excludedReason LIKE 'gemini:%'").all();
const updReason = db.prepare("UPDATE ComicFirstPrintItem SET excludedReason = ?, groupId = CASE WHEN ? IS NULL THEN groupId ELSE NULL END WHERE id = ?");
const restoreValid = db.prepare("UPDATE ComicFirstPrintItem SET excludedReason = NULL WHERE id = ?");
let geminiKept = 0, geminiRestored = 0;
const sampleRestored = [];
for (const it of geminiItems) {
  const reason = judgeText(it.rawName, it.normalizedIP);
  if (reason) {
    if (!DRY_RUN) updReason.run(reason, reason, it.id);
    geminiKept++;
  } else {
    if (sampleRestored.length < 10) sampleRestored.push(it.rawName.slice(0, 80));
    if (!DRY_RUN) restoreValid.run(it.id);
    geminiRestored++;
  }
}
console.log(`  旧Gemini→text再分類: ${geminiKept}件除外維持 / ${geminiRestored}件をvalidに復活`);
if (sampleRestored.length) {
  console.log("  復活サンプル(本物の初版コミックとして再認識):");
  sampleRestored.forEach(s => console.log("    " + s));
}

// ===== Phase 1+2+2b+2c 実行 =====
console.log("\n[Phase 1+2+2b+2c] valid item に text判定を再適用...");
const validItems = db.prepare("SELECT id, rawName, normalizedIP FROM ComicFirstPrintItem WHERE excludedReason IS NULL").all();
let setCount = 0, magCount = 0, giftCount = 0, wrongCount = 0;
const updExcluded = db.prepare("UPDATE ComicFirstPrintItem SET excludedReason = ?, groupId = NULL WHERE id = ?");
const sampleSet = [], sampleMag = [], sampleGift = [], sampleWrong = [];
for (const it of validItems) {
  const reason = judgeText(it.rawName, it.normalizedIP);
  if (!reason) continue;
  if (!DRY_RUN) updExcluded.run(reason, it.id);
  if (reason === "text:set品") { if (sampleSet.length < 3) sampleSet.push((it.rawName||"").slice(0,80)); setCount++; }
  else if (reason === "text:雑誌混入or専用") { if (sampleMag.length < 3) sampleMag.push((it.rawName||"").slice(0,80)); magCount++; }
  else if (reason === "text:特典付き") { if (sampleGift.length < 3) sampleGift.push((it.rawName||"").slice(0,80)); giftCount++; }
  else if (reason === "text:カテゴリ違い") { if (sampleWrong.length < 3) sampleWrong.push((it.rawName||"").slice(0,80)); wrongCount++; }
}
console.log(`  セット品: ${setCount} / 雑誌or専用: ${magCount} / 特典付き: ${giftCount} / カテゴリ違い: ${wrongCount}`);
if (sampleSet.length) console.log("  セット例:", sampleSet);
if (sampleMag.length) console.log("  雑誌/専用例:", sampleMag);
if (sampleGift.length) console.log("  特典付き例:", sampleGift);
if (sampleWrong.length) console.log("  カテ違い例:", sampleWrong);

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

// ===== Phase 3.5: Group.ipName を Item の normalizedIP 多数派に追従 =====
console.log("\n[Phase 3.5] Group.ipName を Item の normalizedIP 多数派に追従...");
const allGroupsForIpFix = db.prepare("SELECT id, ipName FROM ComicFirstPrintGroup").all();
const updGroupIp = db.prepare("UPDATE ComicFirstPrintGroup SET ipName = ? WHERE id = ?");
let groupIpUpdated = 0;
const sampleIpFix = [];
for (const g of allGroupsForIpFix) {
  const topIp = db.prepare("SELECT normalizedIP, COUNT(*) c FROM ComicFirstPrintItem WHERE groupId=? AND excludedReason IS NULL GROUP BY normalizedIP ORDER BY c DESC LIMIT 1").get(g.id);
  if (!topIp || !topIp.normalizedIP) continue;
  if (topIp.normalizedIP !== g.ipName) {
    if (sampleIpFix.length < 10) sampleIpFix.push(`[${g.ipName}] → [${topIp.normalizedIP}]`);
    if (!DRY_RUN) updGroupIp.run(topIp.normalizedIP, g.id);
    groupIpUpdated++;
  }
}
console.log(`  Group.ipName 追従更新: ${groupIpUpdated}件`);
sampleIpFix.forEach(s => console.log("   ", s));

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
