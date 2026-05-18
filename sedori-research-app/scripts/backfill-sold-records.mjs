/**
 * MercariSoldRecord バックフィル
 *
 * 既にスキャン済みで値動きがある商品（駿河屋差±20% or 相場変動率±10%）について、
 * メルカリsoldを再取得してMercariSoldRecordに個別保存する。
 *
 * これにより、バケット集計（weeklyTrend）より精度の高い日単位の価格グラフが描ける。
 *
 * 使い方:
 *   node scripts/backfill-sold-records.mjs               # 全件
 *   node scripts/backfill-sold-records.mjs --limit 10    # 10件だけ（動作確認用）
 *   node scripts/backfill-sold-records.mjs --force       # 既にレコードがあっても再取得
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const limit = parseInt(getArg("--limit") || "0", 10);
const force = args.includes("--force");

const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

function cuid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString("hex");
  return `c${ts}${rand}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchMercariSold(keyword, limit = 60) {
  try {
    const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: {
        keyword,
        sort: "SORT_CREATED_TIME",
        order: "ORDER_DESC",
        status: ["STATUS_SOLD_OUT"],
      },
    };
    const res = await fetch(MERCARI_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];
    const excludePatterns = /まとめ|セット売り|まとめ売り|コンプ|コンプリート|1ロット|一式|全種|全\d+種|大量|引退|まとめて|\dロット|ロット売り|セット販売|おまとめ|一括|福袋|フルコンプ|全種類|\d+点|まとめ出品|全賞|コンプセット/i;
    return data.items
      .filter(item => !excludePatterns.test(item.name))
      .map(item => ({
        name: item.name,
        price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
        date: new Date(item.updated * 1000).toISOString().split("T")[0],
      }));
  } catch {
    return [];
  }
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // 対象商品: 値動き + mercariKeywordあり
  const query = `
    SELECT ci.id, ci.name, ci.mercariKeyword, ci.listPrice,
      ps.surugayaPrice, ps.diffPercent, ps.trendDirection,
      (SELECT COUNT(*) FROM MercariSoldRecord WHERE itemId = ci.id) as existingCount
    FROM CatalogItem ci
    JOIN PriceSnapshot ps ON ps.itemId = ci.id
    WHERE ps.createdAt = (SELECT MAX(createdAt) FROM PriceSnapshot WHERE itemId = ci.id)
      AND (ABS(ps.diffPercent) >= 20 OR ABS(ps.trendDirection) >= 10)
      AND ci.mercariKeyword IS NOT NULL
    ORDER BY ABS(ps.trendDirection) DESC, ABS(ps.diffPercent) DESC
    ${limit > 0 ? `LIMIT ${limit}` : ""}
  `;

  const targets = db.prepare(query).all();
  console.log(`対象: ${targets.length}件`);
  if (force) console.log("--force: 既存レコードを無視して再取得");

  const insertSold = db.prepare(`
    INSERT OR IGNORE INTO MercariSoldRecord (id, createdAt, itemId, price, soldDate, mercariName)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  let processed = 0;
  let skipped = 0;
  let totalInserted = 0;

  for (const t of targets) {
    processed++;

    if (!force && t.existingCount > 0) {
      skipped++;
      continue;
    }

    const sold = await searchMercariSold(t.mercariKeyword, 60);

    // 外れ値除外（定価or駿河屋価格の5倍超）
    const priceBase = t.listPrice || t.surugayaPrice || 0;
    const filtered = priceBase > 0
      ? sold.filter(s => s.price <= priceBase * 5)
      : sold;

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const s of filtered) {
        const result = insertSold.run(cuid(), now, t.id, s.price, s.date, s.name || null);
        if (result.changes > 0) inserted++;
      }
    });
    tx();
    totalInserted += inserted;

    process.stdout.write(
      `\r  ${processed}/${targets.length}  ` +
      `[${t.name.slice(0, 35)}] sold=${filtered.length} new=${inserted} (skipped=${skipped}, total=${totalInserted})  `
    );

    await sleep(1000);
  }

  console.log(`\n\n完了: 処理${processed}件 / 既存スキップ${skipped}件 / 新規保存${totalInserted}レコード`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
