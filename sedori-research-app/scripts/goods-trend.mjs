/**
 * グッズカタログ 推移確認ツール
 *
 * DBに蓄積されたスナップショットから価格推移を表示する。
 *
 * 使い方:
 *   # 全商品の最新スナップショット一覧
 *   node scripts/goods-trend.mjs
 *
 *   # IP指定
 *   node scripts/goods-trend.mjs --ip ヒロアカ
 *
 *   # 推移がある（2回以上スナップショット）商品のみ
 *   node scripts/goods-trend.mjs --has-trend
 *
 *   # メルカリとの差が大きい順
 *   node scripts/goods-trend.mjs --sort diff
 *
 *   # DB統計
 *   node scripts/goods-trend.mjs --stats
 */

import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const ipFilter = getArg("--ip");
const sortBy = getArg("--sort") || "name"; // name | diff | trend | price
const hasTrend = hasFlag("--has-trend");
const showStats = hasFlag("--stats");
const topN = parseInt(getArg("--top") || "50", 10);

function openDb() {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
}

// ========================================
// DB統計
// ========================================
function printStats(db) {
  const itemCount = db.prepare("SELECT COUNT(*) as c FROM CatalogItem").get().c;
  const snapCount = db.prepare("SELECT COUNT(*) as c FROM PriceSnapshot").get().c;
  const ipCounts = db.prepare("SELECT ipShort, COUNT(*) as c FROM CatalogItem GROUP BY ipShort ORDER BY c DESC").all();
  const dateRange = db.prepare("SELECT MIN(createdAt) as minDate, MAX(createdAt) as maxDate FROM PriceSnapshot").get();

  // スナップショット回数の分布
  const snapDist = db.prepare(`
    SELECT snapCount, COUNT(*) as itemCount FROM (
      SELECT itemId, COUNT(*) as snapCount FROM PriceSnapshot GROUP BY itemId
    ) GROUP BY snapCount ORDER BY snapCount
  `).all();

  console.log(`=== DB統計 ===`);
  console.log(`商品数: ${itemCount}`);
  console.log(`スナップショット数: ${snapCount}`);
  console.log(`期間: ${dateRange.minDate?.slice(0, 10) || "N/A"} 〜 ${dateRange.maxDate?.slice(0, 10) || "N/A"}`);

  console.log(`\nIP別商品数:`);
  for (const row of ipCounts) {
    console.log(`  ${(row.ipShort || "不明").padEnd(20)} ${row.c}件`);
  }

  console.log(`\nスナップショット回数の分布:`);
  for (const row of snapDist) {
    const bar = "█".repeat(Math.min(row.itemCount, 40));
    console.log(`  ${String(row.snapCount).padStart(3)}回: ${String(row.itemCount).padStart(5)}件 ${bar}`);
  }
}

// ========================================
// 推移表示
// ========================================
function printTrends(db) {
  let whereClause = "1=1";
  const params = {};

  if (ipFilter) {
    whereClause += " AND ci.ipShort = @ip";
    params.ip = ipFilter;
  }

  // 各商品の最新スナップショットを取得
  const query = `
    SELECT
      ci.id, ci.name, ci.ipShort, ci.releaseDate, ci.listPrice, ci.venueTags, ci.maker,
      ps.surugayaPrice, ps.soldOut, ps.mercariMedian, ps.mercariCount,
      ps.diffPercent, ps.trendDirection, ps.createdAt as snapDate,
      (SELECT COUNT(*) FROM PriceSnapshot WHERE itemId = ci.id) as snapCount
    FROM CatalogItem ci
    JOIN PriceSnapshot ps ON ps.itemId = ci.id
    WHERE ${whereClause}
      AND ps.createdAt = (SELECT MAX(createdAt) FROM PriceSnapshot WHERE itemId = ci.id)
    ${hasTrend ? "AND (SELECT COUNT(*) FROM PriceSnapshot WHERE itemId = ci.id) >= 2" : ""}
    ORDER BY ${sortBy === "diff" ? "ps.diffPercent DESC" :
              sortBy === "trend" ? "ps.trendDirection DESC" :
              sortBy === "price" ? "ps.surugayaPrice DESC" :
              "ci.name ASC"}
    LIMIT @topN
  `;

  params.topN = topN;
  const rows = db.prepare(query).all(params);

  if (rows.length === 0) {
    console.log("データなし。まず surugaya-catalog.mjs でデータを取得してください。");
    return;
  }

  console.log(`=== グッズカタログ 推移 ===`);
  if (ipFilter) console.log(`IP: ${ipFilter}`);
  console.log(`${rows.length}件表示（${sortBy}順）\n`);

  for (const row of rows) {
    const price = row.surugayaPrice ? `¥${row.surugayaPrice.toLocaleString()}` : "品切";
    const mercari = row.mercariMedian ? `¥${row.mercariMedian.toLocaleString()}` : "---";
    const diff = row.diffPercent != null ? `${row.diffPercent > 0 ? "+" : ""}${row.diffPercent}%` : "";
    const trend = row.trendDirection != null ? `推移${row.trendDirection > 0 ? "+" : ""}${row.trendDirection}%` : "";
    const snaps = row.snapCount > 1 ? `[${row.snapCount}回]` : "";
    const tags = row.venueTags ? JSON.parse(row.venueTags).join(",") : "";

    console.log(`  ${price.padStart(8)} → ${mercari.padStart(8)} ${diff.padStart(6)} ${trend.padStart(10)} ${snaps.padStart(5)}  ${row.name.slice(0, 50)}`);

    // メルカリsoldの週ごと相場推移（1回のスナップショットからでも見える）
    const latestSnap = db.prepare(`
      SELECT weeklyTrend FROM PriceSnapshot WHERE itemId = @itemId ORDER BY createdAt DESC LIMIT 1
    `).get({ itemId: row.id });

    if (latestSnap?.weeklyTrend) {
      const wt = JSON.parse(latestSnap.weeklyTrend);
      const periods = ["31日以前", "15-30日前", "8-14日前", "直近7日"];
      const parts = periods.map(p => {
        if (!wt[p]) return "-";
        return `¥${wt[p].median.toLocaleString()}(${wt[p].count})`;
      });
      console.log(`         [メルカリsold推移] ${parts.join(" → ")}`);
    }

    // 2回以上スナップショットがある場合、スナップショット間の推移も表示
    if (row.snapCount >= 2) {
      const history = db.prepare(`
        SELECT createdAt, surugayaPrice, mercariMedian, mercariCount, diffPercent
        FROM PriceSnapshot WHERE itemId = @itemId ORDER BY createdAt ASC
      `).all({ itemId: row.id });

      const timeline = history.map(h => {
        const date = h.createdAt.slice(5, 10);
        const sp = h.surugayaPrice ? `駿¥${h.surugayaPrice.toLocaleString()}` : "品切";
        const mp = h.mercariMedian ? `メ¥${h.mercariMedian.toLocaleString()}(${h.mercariCount})` : "";
        return `${date}: ${sp} ${mp}`;
      });
      console.log(`         [DB推移] ${timeline.join(" → ")}`);
    }
  }
}

// ========================================
// メイン
// ========================================
try {
  const db = openDb();

  if (showStats) {
    printStats(db);
  } else {
    printTrends(db);
  }

  db.close();
} catch (e) {
  if (e.message?.includes("no such table")) {
    console.error("DBテーブルが見つかりません。prisma migrate dev を実行してください。");
  } else {
    console.error("エラー:", e.message);
  }
  process.exit(1);
}
