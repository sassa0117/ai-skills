/**
 * 書店巡回ガイド 強化スキャン: ②除外キーワード方式 (新規作品掘り)
 *
 * 既存の comic-firstprint-scan.mjs (フロー①汎用初版巡回) と組み合わせて使う。
 * - top N IP (itemCount 降順) を除外キーワード化
 * - メルカリ searchCondition.excludeKeyword に渡し、既出IPを弾いて新規作品だけ拾う
 *
 * デフォルトは DRY-RUN (除外語の組み立て・件数試算のみ・API叩かない)。
 * 本当に走らせるときは --execute を付ける（API消費注意）。
 *
 * 仕様根拠: handoff_comic-bookstore-mercari-scan-enhancement.md (さっさ構想)
 * 関連: feedback_no-trend-scan-automation.md (cron自動巡回はユーザー判断)
 *
 * 使い方:
 *   node scripts/comic-firstprint-scan-exclude.mjs                       (DRY: 除外語 + 想定件数表示)
 *   node scripts/comic-firstprint-scan-exclude.mjs --top 30 --max 50     (DRY: top 30 IP 除外, 50件取得想定)
 *   node scripts/comic-firstprint-scan-exclude.mjs --execute              (本走: メルカリAPI叩く)
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { ensureHistoryColumns, DEFAULT_HISTORY_PLAN } from "./lib/db-history.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] || null; };
const hasFlag = (n) => args.includes(n);

const EXECUTE = hasFlag("--execute");
const TOP_N = parseInt(getArg("--top") || "20", 10);
const MAX_FETCH = parseInt(getArg("--max") || "30", 10);
const KEYWORD = getArg("--keyword") || "初版 1巻";

console.log(EXECUTE ? "*** EXECUTE MODE *** (メルカリAPI 叩く)" : "*** DRY-RUN *** (除外語/件数試算のみ)");

// ===== scan メタに flowType を保持 (ensure idempotent) =====
{
  const cols = db.prepare("PRAGMA table_info(ComicFirstPrintScan)").all();
  if (!cols.some((c) => c.name === "flowType")) {
    db.exec("ALTER TABLE ComicFirstPrintScan ADD COLUMN flowType TEXT DEFAULT 'periodic'");
    console.log("✔ ComicFirstPrintScan.flowType カラム追加");
  }
  if (!cols.some((c) => c.name === "excludeKeyword")) {
    db.exec("ALTER TABLE ComicFirstPrintScan ADD COLUMN excludeKeyword TEXT");
    console.log("✔ ComicFirstPrintScan.excludeKeyword カラム追加");
  }
}
ensureHistoryColumns(db, DEFAULT_HISTORY_PLAN);

// ===== top N IP を集約 (canonical normalizedIP 単位) =====
const latestScan = db.prepare("SELECT id FROM ComicFirstPrintScan ORDER BY createdAt DESC LIMIT 1").get();
if (!latestScan) { console.error("既存scanなし。先に comic-firstprint-scan.mjs を実行"); process.exit(1); }

const topIps = db.prepare(`
  SELECT ipName, SUM(itemCount) as total
  FROM ComicFirstPrintGroup
  WHERE scanId = ? AND ipName IS NOT NULL AND itemCount > 0
  GROUP BY ipName
  ORDER BY total DESC
  LIMIT ?
`).all(latestScan.id, TOP_N);

console.log(`\n▶ 除外対象 top ${TOP_N} IP (itemCount合計):`);
topIps.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.ipName}  (${r.total}件)`));

const excludeKeyword = topIps.map((r) => r.ipName).join(" ");
console.log(`\n▶ excludeKeyword string (${excludeKeyword.length}文字):`);
console.log(`  "${excludeKeyword.slice(0, 200)}${excludeKeyword.length > 200 ? "..." : ""}"`);

console.log(`\n▶ 検索クエリ: "${KEYWORD}"`);
console.log(`▶ 最大取得件数: ${MAX_FETCH}`);

if (!EXECUTE) {
  console.log("\n[DRY-RUN] API は叩かない。本走は --execute を付ける。");
  console.log("\n参考: 既存実装の参考は can-badge-article-scan.mjs:169-177 の searchCondition.excludeKeyword 渡し");
  db.close();
  process.exit(0);
}

// ===== EXECUTE モード: メルカリAPI 呼び出し =====
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

async function searchMercari({ keyword, excludeKeyword, limit }) {
  const dpop = await generateMercariJwt({ method: "POST", url: "https://api.mercari.jp/v2/entities:search" });
  const searchCondition = {
    keyword,
    excludeKeyword: excludeKeyword || undefined,
    sort: "SORT_CREATED_TIME",
    order: "ORDER_DESC",
    status: ["STATUS_ON_SALE"],
    limit,
  };
  const body = JSON.stringify({ userId: "", pageSize: limit, pageToken: "", searchCondition, defaultDatabaseQueryEnabled: true });
  const res = await fetch("https://api.mercari.jp/v2/entities:search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DPoP": dpop,
      "X-Platform": "web",
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const scanId = crypto.randomBytes(12).toString("hex");
db.prepare(`INSERT INTO ComicFirstPrintScan (id, status, flowType, excludeKeyword) VALUES (?, 'running', 'exclude', ?)`).run(scanId, excludeKeyword);
console.log(`\n▶ 新規 scanId: ${scanId} (flowType=exclude)`);

let fetched = 0, dup = 0, newCount = 0;
try {
  const result = await searchMercari({ keyword: KEYWORD, excludeKeyword, limit: MAX_FETCH });
  const items = result.items || [];
  console.log(`▶ メルカリ取得: ${items.length}件`);
  fetched = items.length;

  // 既存Item.id (PRIMARY KEY) 重複は INSERT OR IGNORE で弾く (handoff 該当)
  const insert = db.prepare(`
    INSERT OR IGNORE INTO ComicFirstPrintItem (id, scanId, rawName, price, url, thumbnailUrl, soldDate)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `);
  for (const it of items) {
    const before = db.prepare("SELECT id FROM ComicFirstPrintItem WHERE id = ?").get(it.id);
    if (before) { dup++; continue; }
    insert.run(it.id, scanId, it.name || "", it.price || 0, `https://jp.mercari.com/item/${it.id}`, it.thumbnails?.[0] || null);
    newCount++;
  }
  db.prepare(`UPDATE ComicFirstPrintScan SET status='completed', totalFetched=?, totalFiltered=?, totalGrouped=? WHERE id=?`)
    .run(fetched, newCount, 0, scanId);
} catch (e) {
  console.error("✗ 失敗:", e.message);
  db.prepare(`UPDATE ComicFirstPrintScan SET status='failed', error=? WHERE id=?`).run(e.message, scanId);
}

console.log(`\n▶ 完了: 取得 ${fetched} / 既存重複 ${dup} / 新規 ${newCount}`);
console.log(`▶ 後続処理 (グルーピング・data-fixes・seed) は別途実行`);

db.close();
