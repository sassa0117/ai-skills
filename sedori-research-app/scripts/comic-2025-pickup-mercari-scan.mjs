/**
 * ComicBookstoreCandidate2025 の各IPに対してメルカリscan
 *
 * 既存 comic-firstprint-scan.mjs のロジックを流用（巻数/初版/IP抽出/正規化）
 * 1QPS厳守（メルカリAPI制限）
 *
 * 使い方:
 *   node scripts/comic-2025-pickup-mercari-scan.mjs [--since 2025-01-01] [--limit 0]
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

// Gemini text 判定は撤廃 (feedback_use-self-for-text-classification.md 違反の解消)。
// text 分類は shouldExclude + comic-firstprint-data-fixes.mjs の post-process に委ねる。
const { shouldExclude } = await import("./lib/comic-exclude-patterns.mjs");

const args = process.argv.slice(2);
const since = args[args.indexOf("--since")+1] || "2025-01-01";
const limitArg = parseInt(args[args.indexOf("--limit")+1] || "0", 10);
// Gemini 関連フラグは撤廃

// ====== ロジック流用（comic-firstprint-scan.mjs と同期） ======
// 除外パターンは scripts/lib/comic-exclude-patterns.mjs に集約。shouldExclude は上で import 済み。

function extractGrade(name) {
  const hasFirstPrint = /初版/.test(name) && !/非初版|再版/.test(name);
  const versionTags = [];
  if (/新装版/.test(name)) versionTags.push("新装版");
  if (/完全版/.test(name)) versionTags.push("完全版");
  if (/文庫版|文庫判/.test(name)) versionTags.push("文庫版");
  if (/新書判/.test(name)) versionTags.push("新書判");
  if (/ワイド版|ワイド判/.test(name)) versionTags.push("ワイド版");
  if (/愛蔵版/.test(name)) versionTags.push("愛蔵版");
  if (/特装版|限定版/.test(name)) versionTags.push("特装版");
  return { hasFirstPrint, versionTags };
}

function extractCondition(name) {
  const rated = name.match(/(PSA|BGS|CGC)\s*([0-9]+(?:\.[0-9])?)/i);
  if (rated) return { condition: "鑑定品", gradeRank: `${rated[1].toUpperCase()} ${rated[2]}` };
  if (/鑑定品|グレーディング|グレード付/i.test(name)) return { condition: "鑑定品", gradeRank: null };
  if (/サイン本|直筆サイン|サイン入り|signed/i.test(name) && !/サイン会|ポップ|ボード/i.test(name)) return { condition: "サイン本", gradeRank: null };
  if (/状態(が)?(悪|わる)|難あり|難有り|ジャンク|ボロボロ/.test(name)) return { condition: "E", gradeRank: null };
  if (/傷あり|汚れ|シミ|シール跡|折れ|焼け|破れ|落書/.test(name)) return { condition: "D", gradeRank: null };
  if (/やや傷|小傷|少し傷|微傷|日焼け|軽い擦れ|若干/.test(name)) return { condition: "C", gradeRank: null };
  if (/シュリンク/.test(name)) return { condition: "S", gradeRank: null };
  if (/帯付|帯あり|帯有/.test(name)) return { condition: "A", gradeRank: null };
  return { condition: "B", gradeRank: null };
}

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

// ====== メルカリAPI ======
const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function fetchMercari(keyword, limit = 60) {
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
      thumbnailUrl: Array.isArray(item.thumbnails) && item.thumbnails.length ? item.thumbnails[0] : (item.thumbnail || null),
    }));
  } catch (e) {
    return [];
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ====== 対象IP取得 ======
const targets = db.prepare(`
  SELECT DISTINCT ipName FROM ComicBookstoreCandidate2025 WHERE salesDate >= ?
`).all(since).map(r => r.ipName);
const final = limitArg > 0 ? targets.slice(0, limitArg) : targets;
console.log(`▶ 対象IP: ${final.length} (since ${since})`);

// scanId
const scanId = crypto.randomBytes(12).toString("hex");
db.prepare(`INSERT INTO ComicFirstPrintScan (id, status, totalFetched, totalFiltered, totalGrouped) VALUES (?, 'running', 0, 0, 0)`).run(scanId);

const insertItem = db.prepare(`
  INSERT OR IGNORE INTO ComicFirstPrintItem
    (id, scanId, groupId, rawName, price, soldDate, url, extractedIP, normalizedIP, volume, tagsJSON, thumbnailUrl, condition, gradeRank)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let totalFetched = 0;
let processed = 0;
const startMs = Date.now();

// Phase A: 全IPでメルカリ取得→テキスト抽出してメモリに溜める
const candidates = []; // { ip, name, price, date, url, thumbnailUrl, versionTags, condition, gradeRank, hasFirstPrint }
for (const ip of final) {
  processed++;
  const keyword = `${ip} 1巻 初版`;
  const rawItems = await fetchMercari(keyword, 60);
  totalFetched += rawItems.length;

  for (const it of rawItems) {
    if (shouldExclude(it.name)) continue;
    const v = extractVolume(it.name);
    if (!v) continue;
    if (v.vol !== 1) continue;
    const { hasFirstPrint, versionTags } = extractGrade(it.name);
    if (!hasFirstPrint && (it.price || 0) < 5000) continue;
    const { condition, gradeRank } = extractCondition(it.name);
    candidates.push({
      ip,
      name: it.name,
      price: it.price,
      date: it.date,
      url: it.url,
      thumbnailUrl: it.thumbnailUrl,
      versionTags,
      condition,
      gradeRank,
      hasFirstPrint,
    });
  }

  if (processed % 50 === 0 || processed === final.length) {
    const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
    console.log(`  ${processed}/${final.length} (${elapsedMin}min) fetched=${totalFetched} candidates=${candidates.length}`);
  }
  await sleep(1100);
}

console.log(`▶ 取得完了: fetched=${totalFetched}, candidates=${candidates.length}`);

// Phase B: Gemini判定撤廃。取得時のtext分類は shouldExclude のみ、
// 追加除外（セット品/雑誌/専用/特典付き/カテゴリ違い）は post-process で
// `node scripts/comic-firstprint-data-fixes.mjs` を走らせる運用に変更。
const validated = candidates;

// Phase C: validatedのみDB保存
let totalFiltered = 0;
for (const c of validated) {
  const tagsForGroup = [...c.versionTags];
  if (c.hasFirstPrint) tagsForGroup.push("初版");
  else tagsForGroup.push("高額検知");
  const itemId = crypto.randomBytes(12).toString("hex");
  try {
    insertItem.run(
      itemId, scanId, null,
      c.name, c.price, c.date, c.url,
      c.ip, c.ip, 1,
      JSON.stringify(tagsForGroup),
      c.thumbnailUrl, c.condition, c.gradeRank
    );
    totalFiltered++;
  } catch (e) { /* ignore */ }
}

db.prepare(`UPDATE ComicFirstPrintScan SET status='completed', totalFetched=?, totalFiltered=? WHERE id=?`)
  .run(totalFetched, totalFiltered, scanId);
console.log(`▶ done: fetched=${totalFetched} candidates=${candidates.length} validated=${validated.length} saved=${totalFiltered}`);
db.close();
