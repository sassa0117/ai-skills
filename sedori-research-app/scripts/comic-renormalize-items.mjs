/**
 * ComicFirstPrintItem の normalizedIP / extractedIP を rawName から再計算して上書き
 *
 * 過去scanのバグデータ (例: 「カグラバチ 1巻 初版」が normalizedIP='ワン！' で保存されてる) を
 * 現行ロジックで再計算して直す。
 *
 * INSERT OR IGNORE で古いゴミデータが維持される仕様への対処。
 *
 * 使い方:
 *   node scripts/comic-renormalize-items.mjs [--dry-run]
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

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

// ====== comic-firstprint-scan.mjs と同じロジック ======
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
  "良品","中古","used","USED","新刊","旧版",
  "単行本","有り","セット","全巻",
];

function extractIP(name) {
  const v = extractVolume(name);
  if (!v) return null;
  let s = name.slice(0, v.idx).trim();
  s = s.replace(/[【\[](.*?)[】\]]/g, " ");
  s = s.replace(/[（\(](.*?)[）\)]/g, " ");
  s = s.replace(/[【\[（\(】\]）\)※☆★◆●○・《》〈〉〔〕「」『』]/g, " ");
  for (const w of NOISE_WORDS) s = s.split(w).join(" ");
  s = s.replace(/\d{1,3}\s*巻/g, " ").replace(/Vol\.?\s*\d+/gi, " ");
  // 「1～」「1〜」「1-」等の巻数範囲表記の前残り (例: "ソウルイーター 1～" → "ソウルイーター")
  s = s.replace(/\s+\d+\s*[～〜~ｰー-]\s*$/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

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

// ====== 全件再計算 ======
const all = db.prepare(`SELECT id, rawName, extractedIP, normalizedIP, volume FROM ComicFirstPrintItem`).all();
console.log(`▶ 対象アイテム: ${all.length}件`);

let changed = 0;
let unchanged = 0;
let cleared = 0;  // 抽出失敗で normalizedIP=null になる件
const changes = []; // 変更例サンプル
const updateStmt = db.prepare(`UPDATE ComicFirstPrintItem SET extractedIP=?, normalizedIP=? WHERE id=?`);

const tx = db.transaction((rows) => {
  for (const r of rows) {
    const newRawIP = extractIP(r.rawName);
    const newNormalized = newRawIP ? (normalizeIP(newRawIP) || newRawIP) : null;
    if (newRawIP === r.extractedIP && newNormalized === r.normalizedIP) {
      unchanged++;
      continue;
    }
    if (!newNormalized) cleared++;
    if (changes.length < 30 && r.normalizedIP !== newNormalized) {
      changes.push({
        rawName: r.rawName.slice(0, 60),
        before: r.normalizedIP,
        after: newNormalized,
      });
    }
    if (!DRY) updateStmt.run(newRawIP, newNormalized, r.id);
    changed++;
  }
});

tx(all);

console.log(`▶ 変更: ${changed}件 / 変更なし: ${unchanged}件 / 抽出失敗 (normalizedIP→null): ${cleared}件`);
console.log(`▶ ${DRY ? "DRY-RUN (DB変更なし)" : "本実行 (DB更新済み)"}`);

if (changes.length) {
  console.log(`\n▶ 変更サンプル (最大30件):`);
  console.table(changes);
}

db.close();
