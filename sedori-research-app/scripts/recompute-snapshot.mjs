/**
 * 指定 CatalogItem の PriceSnapshot を、現在の MercariSoldRecord から再計算して新規追加。
 *
 * 用途: batch-gemini-match で sold を削除した後、古い snapshot の trendDirection が
 *       汚れたまま残るケースの修復。
 *
 * 使い方:
 *   node scripts/recompute-snapshot.mjs --id <catalogId>
 *
 * 注意: 既存 PriceSnapshot は触らず、新しい行を append する（migrate-sqlite-to-postgres
 *       が append-only 設計のため、それに整合させる）。
 *       migrate スクリプトを後続で走らせれば本番 Postgres にも反映される。
 */
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// surugaya-catalog.mjs と同じ簡易cuid（Prisma互換の一意ID）
function cuid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString("hex");
  return `c${ts}${rand}`;
}

const args = process.argv.slice(2);
const idIdx = args.indexOf("--id");
if (idIdx < 0 || !args[idIdx + 1]) {
  console.error("Usage: node scripts/recompute-snapshot.mjs --id <catalogId>");
  process.exit(1);
}
const catalogId = args[idIdx + 1];

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const db = new Database(path.join(PROJECT_ROOT, "dev.db"));
db.pragma("journal_mode = WAL");

const item = db.prepare("SELECT id, name, ipShort FROM CatalogItem WHERE id = ?").get(catalogId);
if (!item) {
  console.error(`CatalogItem not found: ${catalogId}`);
  process.exit(1);
}
console.log(`商品: ${item.name}`);

// 直近の駿河屋価格（最新 PriceSnapshot から）
const latestSnap = db.prepare(
  "SELECT surugayaPrice, soldOut FROM PriceSnapshot WHERE itemId = ? ORDER BY createdAt DESC LIMIT 1"
).get(catalogId);
const surugayaPrice = latestSnap?.surugayaPrice ?? null;
const soldOut = latestSnap?.soldOut ?? 0;

// MercariSoldRecord 全件
const sold = db.prepare(
  "SELECT price, soldDate FROM MercariSoldRecord WHERE itemId = ? ORDER BY soldDate DESC"
).all(catalogId);
console.log(`sold: ${sold.length}件`);

if (sold.length === 0) {
  console.error("sold ゼロ件、snapshot 計算不能");
  process.exit(1);
}

const now = Date.now();
const week1 = sold.filter(s => new Date(s.soldDate).getTime() >= now - 7 * 86400000);
const week2 = sold.filter(s => {
  const t = new Date(s.soldDate).getTime();
  return t >= now - 14 * 86400000 && t < now - 7 * 86400000;
});
const week3_4 = sold.filter(s => {
  const t = new Date(s.soldDate).getTime();
  return t >= now - 30 * 86400000 && t < now - 14 * 86400000;
});
const older = sold.filter(s => new Date(s.soldDate).getTime() < now - 30 * 86400000);

const mercariMedian = median(sold.map(s => s.price));
const diff = surugayaPrice && surugayaPrice > 0
  ? Math.round(((mercariMedian - surugayaPrice) / surugayaPrice) * 100)
  : null;

const trend = {
  "直近7日": week1.length >= 2 ? { median: median(week1.map(s => s.price)), count: week1.length } : null,
  "8-14日前": week2.length >= 2 ? { median: median(week2.map(s => s.price)), count: week2.length } : null,
  "15-30日前": week3_4.length >= 2 ? { median: median(week3_4.map(s => s.price)), count: week3_4.length } : null,
  "31日以前": older.length >= 2 ? { median: median(older.map(s => s.price)), count: older.length } : null,
};

let trendDirection = null;
const recentMedian = (trend["直近7日"] || trend["8-14日前"])?.median;
const pastMedian = (trend["15-30日前"] || trend["31日以前"])?.median;
if (recentMedian && pastMedian && pastMedian > 0) {
  trendDirection = Math.round(((recentMedian - pastMedian) / pastMedian) * 100);
}

console.log("\n=== 計算結果 ===");
console.log(`mercariMedian: ¥${mercariMedian.toLocaleString()} (n=${sold.length})`);
console.log(`surugayaPrice: ${surugayaPrice ? `¥${surugayaPrice.toLocaleString()}` : "null"}`);
console.log(`diff: ${diff != null ? `${diff > 0 ? "+" : ""}${diff}%` : "null"}`);
console.log(`trendDirection: ${trendDirection != null ? `${trendDirection > 0 ? "+" : ""}${trendDirection}%` : "null"}`);
console.log("trend:", JSON.stringify(trend, null, 2));

const newRow = {
  id: cuid(),
  createdAt: new Date().toISOString(),
  itemId: catalogId,
  surugayaPrice,
  soldOut,
  mercariMedian,
  mercariCount: sold.length,
  weeklyTrend: JSON.stringify(trend),
  diffPercent: diff,
  trendDirection,
};

db.prepare(`
  INSERT INTO PriceSnapshot (id, createdAt, itemId, surugayaPrice, soldOut, mercariMedian, mercariCount, weeklyTrend, diffPercent, trendDirection)
  VALUES (@id, @createdAt, @itemId, @surugayaPrice, @soldOut, @mercariMedian, @mercariCount, @weeklyTrend, @diffPercent, @trendDirection)
`).run(newRow);

console.log(`\nPriceSnapshot 追加完了 id=${newRow.id}`);
db.close();
