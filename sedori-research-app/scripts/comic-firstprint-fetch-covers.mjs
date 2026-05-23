/**
 * 楽天ブックスAPIで書影URLを取得して ComicFirstPrintGroup.coverUrl に保存
 *
 * 仕様:
 *   - IP単位で1リクエスト → 全巻分の候補をクライアント側でフィルタ（巻ごとに最適な書影を選ぶ）
 *   - 1QPS厳守（IP間に1.2秒sleep）
 *   - 既に coverUrl 入ってるグループはスキップ（--force で再取得）
 *   - 必須ヘッダ: Referer / Origin / User-Agent
 *
 * 使い方:
 *   node scripts/comic-firstprint-fetch-covers.mjs [--scan-id <id>] [--force]
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
if (!APP_ID || !ACCESS_KEY) {
  console.error("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が .env にない");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] || null; };
const hasFlag = (n) => args.includes(n);
const scanIdArg = getArg("--scan-id");
const force = hasFlag("--force");

const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

{
  const cols = db.prepare("PRAGMA table_info(ComicFirstPrintGroup)").all();
  if (!cols.some(c => c.name === "coverUrl")) {
    db.exec("ALTER TABLE ComicFirstPrintGroup ADD COLUMN coverUrl TEXT");
    console.log("✔ ComicFirstPrintGroup.coverUrl カラム追加");
  }
}

const scan = scanIdArg
  ? db.prepare("SELECT * FROM ComicFirstPrintScan WHERE id = ?").get(scanIdArg)
  : db.prepare("SELECT * FROM ComicFirstPrintScan ORDER BY createdAt DESC LIMIT 1").get();
if (!scan) { console.error("scan なし"); process.exit(1); }

const groups = db.prepare(`
  SELECT id, ipName, volume, tags, coverUrl FROM ComicFirstPrintGroup WHERE scanId = ?
`).all(scan.id);

const updateCover = db.prepare(`UPDATE ComicFirstPrintGroup SET coverUrl = ? WHERE id = ?`);

console.log(`▶ scanId: ${scan.id}`);
console.log(`▶ 対象グループ: ${groups.length} (force=${force})`);

const ENDPOINT = "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";
const HEADERS = {
  "Referer": "https://hobipedia.jp/",
  "Origin": "https://hobipedia.jp",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 hobipedia-bot",
};

async function fetchBooks(query) {
  const params = [
    `applicationId=${APP_ID}`,
    `accessKey=${ACCESS_KEY}`,
    AFFILIATE_ID ? `affiliateId=${AFFILIATE_ID}` : null,
    `title=${encodeURIComponent(query)}`,
    `hits=30`,
    `format=json`,
  ].filter(Boolean).join("&");

  const res = await fetch(`${ENDPOINT}?${params}`, { headers: HEADERS });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${txt.slice(0, 150)}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return (data.Items || []).map(({ Item }) => Item);
}
const fetchIpBooks = (ipName) => fetchBooks(ipName);
const fetchByVolume = (ipName, volume) => fetchBooks(`${ipName} ${volume}`);

function isExcluded(title) {
  if (!title) return true;
  // 単巻コミック以外を除外（セット・ガイド・画集・派生グッズ等）
  return /全巻|セット|ガイド|完全ガイド|画集|ファンブック|公式ガイド|コミックガイド|キャラクターブック|アニメ.*BOOK|アニメガイド|大全集|超全集|スペシャル|資料集|アンソロジー|イラストパネル|カレンダー|フォトブック|ノベライズ|超史集|アニメイラスト|公式ファン|攻略本|オフィシャル/i.test(title);
}

// 派生作品サフィックス（原作と別物として除外）
const DERIVATIVE_SUFFIXES = [
  "SD", "GT", "Z", "DAIMA", "改", "新装版", // 原作と同名で派生
  "スーパー", "超", "外伝", "番外編", "別冊", "スピンオフ", "特別編",
  "side B", "THE FIRST", "PROLOGUE", "EPILOGUE",
  "100 YEARS QUEST", "クレイジー・D", "アナザー", "ANOTHER",
  // ノベル/スピンオフ系（v0.6.0 追加・BLEACH「Can't Fear Your Own World」誤マッチ対策）
  "Can't", "ノベル", "小説", "ノベライズ", "Novelize", "novelize",
  "Stories", "ストーリーズ", "STORIES", "Story", "Spirits",
  "公式ファンブック", "コミックガイド", "アンソロジー",
  "ZOMBIE", "ピカチュウ",
];
function looksLikeDerivative(title, ipName) {
  const idx = title.indexOf(ipName);
  if (idx === -1) return false;
  const after = title.slice(idx + ipName.length, idx + ipName.length + 35);
  if (DERIVATIVE_SUFFIXES.some(s => after.toLowerCase().includes(s.toLowerCase()))) return true;
  // 「{IP}スペース文字8文字以上スペース」が来る場合はサブタイトル付き派生扱い (例: "BLEACH Can't Fear Your Own World 1")
  // 原作は通常 "{IP} 1" "{IP}(1)" "{IP} 第1巻" 等で、サブタイトル長は短い
  const subtitleMatch = after.match(/^[\s\-―ー]+([A-Za-z][\w'\s]{12,})/);
  if (subtitleMatch) return true;
  return false;
}

function pickCoverForVolume(items, ipName, volume, tagStr) {
  // 1. セット・ガイドブック等を除外
  let candidates = items.filter(it => !isExcluded(it.title));
  if (candidates.length === 0) return null;

  // 2. 版違いタグ
  const versionTags = ["新装版", "完全版", "文庫版", "新書判", "ワイド版", "愛蔵版"];
  const tagSet = new Set(tagStr.split(",").filter(Boolean));
  const versionWanted = versionTags.find(t => tagSet.has(t));

  // 3. 巻数厳密マッチ（最後の手段=数字単独 は削除）
  const volStr = String(volume);
  const volPatterns = [
    new RegExp(`[\\(（]\\s*${volStr}\\s*[\\)）]`),         // (1) （1）
    new RegExp(`第\\s*${volStr}\\s*巻`),                    // 第1巻
    new RegExp(`(?:^|[^\\d])${volStr}\\s*巻`),             // 1巻
    new RegExp(`Vol\\.?\\s*${volStr}(?:$|\\D)`, "i"),       // Vol.1
    new RegExp(`(?:^|\\s|　)${volStr}\\s*$`),               // 末尾の単独数字（"ドラゴンボール 1"）
    new RegExp(`(?:^|\\s|　)${volStr}\\s+[^\\d]`),          // 数字+空白+非数字（"ドラゴンボール 1 完全版"）
    new RegExp(`(?:^|\\s|　)${volStr}\\s*[\\(（]`),         // 数字+空白+括弧（"ONE PIECE 1 (ジャンプ・コミックス)"）
    new RegExp(`(?:^|\\s|　)${volStr}\\s*[【\\[]`),         // 数字+空白+角括弧
  ];

  const scored = candidates.map(it => {
    const t = it.title || "";
    let score = 0;
    // IP名そのものが含まれない → 除外
    const ipIdx = t.indexOf(ipName);
    if (ipIdx === -1) return { item: it, score: -1000 };
    // IP名が先頭から離れすぎ（"DON'T BLEACH MY FIST" の "BLEACH" idx=6）→ 派生扱い
    if (ipIdx > 3) return { item: it, score: -500 };
    // 派生作品（SD/超/外伝等）→ 除外
    if (looksLikeDerivative(t, ipName)) return { item: it, score: -500 };
    score += 10;
    // 巻数マッチ（必須）
    let volMatched = false;
    for (let i = 0; i < volPatterns.length; i++) {
      if (volPatterns[i].test(t)) {
        score += (volPatterns.length - i) * 5;
        volMatched = true;
        break;
      }
    }
    if (!volMatched) return { item: it, score: -100 };
    // 版違い
    if (versionWanted && t.includes(versionWanted)) score += 30;
    else if (!versionWanted && versionTags.some(v => t.includes(v))) score -= 20;
    // 画像
    if (it.largeImageUrl || it.mediumImageUrl) score += 1;
    return { item: it, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 10) return null; // 巻数マッチ＋IP一致 必須
  return best.item;
}

function maxImageUrl(item) {
  const u = item.largeImageUrl || item.mediumImageUrl || item.smallImageUrl;
  if (!u) return null;
  return u.replace(/\?_ex=\d+x\d+/, "?_ex=400x400");
}

// IP単位でグループ化
const ipGroups = new Map();
for (const g of groups) {
  if (g.coverUrl && !force) continue;
  if (!ipGroups.has(g.ipName)) ipGroups.set(g.ipName, []);
  ipGroups.get(g.ipName).push(g);
}

const targetIps = [...ipGroups.keys()];
console.log(`▶ 取得対象IP: ${targetIps.length}（既存スキップ: ${groups.filter(g => g.coverUrl && !force).length}）`);

let success = 0, miss = 0, fail = 0;
const failures = [];
const unmatched = []; // {g, books} - 2パス目で再試行

// パス1: IP単位
for (let i = 0; i < targetIps.length; i++) {
  const ipName = targetIps[i];
  const ipTag = `[1パス ${i + 1}/${targetIps.length}] ${ipName}`;
  let books;
  try {
    books = await fetchIpBooks(ipName);
  } catch (e) {
    console.log(`${ipTag} ✗ ${e.message}`);
    fail += ipGroups.get(ipName).length;
    failures.push({ ipName, error: e.message });
    await new Promise(r => setTimeout(r, 1200));
    continue;
  }
  console.log(`${ipTag} books=${books.length}`);

  for (const g of ipGroups.get(ipName)) {
    const best = pickCoverForVolume(books, g.ipName, g.volume, g.tags);
    if (best) {
      const url = maxImageUrl(best);
      if (url) {
        updateCover.run(url, g.id);
        success++;
        console.log(`  ✔ ${g.volume}巻 [${g.tags}] → ${(best.title||"").slice(0,40)}`);
      } else {
        unmatched.push(g);
      }
    } else {
      unmatched.push(g);
    }
  }
  await new Promise(r => setTimeout(r, 1200));
}

// パス2: マッチなしの巻 → 巻指定クエリで個別取得
console.log(`\n▶ パス2: 巻指定クエリで再試行 (${unmatched.length}件)`);
for (let i = 0; i < unmatched.length; i++) {
  const g = unmatched[i];
  const tag = `[2パス ${i + 1}/${unmatched.length}] ${g.ipName} ${g.volume}巻 [${g.tags}]`;
  try {
    const books = await fetchByVolume(g.ipName, g.volume);
    const best = pickCoverForVolume(books, g.ipName, g.volume, g.tags);
    if (best) {
      const url = maxImageUrl(best);
      if (url) {
        updateCover.run(url, g.id);
        success++;
        console.log(`${tag} ✔ → ${(best.title||"").slice(0,50)}`);
      } else {
        miss++;
        console.log(`${tag} - no image`);
      }
    } else {
      miss++;
      console.log(`${tag} - no match`);
    }
  } catch (e) {
    fail++;
    console.log(`${tag} ✗ ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1200));
}

console.log(`\n▶ 完了: 成功 ${success} / マッチなし ${miss} / 失敗 ${fail}`);
if (failures.length > 0) {
  console.log("\nIP単位で失敗:");
  failures.forEach(f => console.log(`  - ${f.ipName}: ${f.error}`));
}
