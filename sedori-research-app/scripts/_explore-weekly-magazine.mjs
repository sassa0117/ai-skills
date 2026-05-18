/**
 * 週刊誌相場 探索的スキャン（軽量・--no-save相当）
 *
 * 仕様: handoff_weekly-magazine-scan.md Step 1
 *
 * 目的: 週刊少年ジャンプ等の週刊誌が、メルカリsoldで¥5,000超の中央値で
 *       立っているかの感触を取る。検知可能性の判定材料を作る。
 *
 * 使い方:
 *   node scripts/_explore-weekly-magazine.mjs
 *   node scripts/_explore-weekly-magazine.mjs --json > output/weekly-mag-explore.json
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const generateMercariJwt =
  require("generate-mercari-jwt").default || require("generate-mercari-jwt");

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const log = (...a) => { if (!jsonOutput) console.log(...a); };

// ========================================
// 探索クエリ（handoff Step 1 のワード候補から）
// ========================================
const QUERIES = [
  // 表紙・連載イベント系（雑誌名+イベント）
  "週刊少年ジャンプ 表紙",
  "週刊少年ジャンプ 最終回",
  "週刊少年ジャンプ 新連載",
  "週刊少年ジャンプ 合併号",

  // 高騰IP × ジャンプ
  "週刊少年ジャンプ 鬼滅の刃",
  "週刊少年ジャンプ 呪術廻戦",
  "週刊少年ジャンプ 推しの子",
  "週刊少年ジャンプ チェンソーマン",

  // 旧号（鑑定需要の主戦場?）
  "週刊少年ジャンプ 1995",
  "週刊少年ジャンプ 1985",

  // 鑑定
  "CGC 漫画",
  "PSA 漫画",
  "グレーディング 雑誌",

  // 他誌（少女誌・他少年誌）
  "りぼん 1990年代",
  "週刊少年マガジン 最終回",
  "月刊コロコロコミック 創刊",
];

// ========================================
// メルカリ検索（comic-firstprint-scan.mjs から流用）
// ========================================
const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function fetchMercari(keyword, limit = 120) {
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
      headers: {
        "Content-Type": "application/json",
        DPoP: dpop,
        "X-Platform": "web",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map((item) => ({
      id: item.id,
      name: item.name,
      price:
        typeof item.price === "string"
          ? parseInt(item.price, 10)
          : item.price,
      status: item.status, // SOLD_OUT or ON_SALE etc
    }));
  } catch (e) {
    log(`  [error] ${keyword}: ${e.message}`);
    return [];
  }
}

// 商品はsoldと取引中の両方が混在。soldかどうかの判定をsold-filterを使わず
// ここではstatus文字列で簡易判定（探索段階）
function isSold(item) {
  // mercari API status: "ITEM_STATUS_SOLD_OUT" / "ITEM_STATUS_TRADING" 等
  return /SOLD/i.test(String(item.status || ""));
}

// ========================================
// 集計
// ========================================
function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function summarize(items) {
  const prices = items.map((i) => i.price).filter((p) => p > 0);
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const over5k = prices.filter((p) => p >= 5000).length;
  const over10k = prices.filter((p) => p >= 10000).length;
  const over30k = prices.filter((p) => p >= 30000).length;
  return {
    count: prices.length,
    median: median(prices),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p75: sorted[Math.floor(sorted.length * 0.75)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    over5k,
    over10k,
    over30k,
    over5kPct: Math.round((over5k / prices.length) * 100),
  };
}

// ========================================
// メイン
// ========================================
async function main() {
  log("週刊誌相場 探索スキャン開始");
  log(`クエリ数: ${QUERIES.length}\n`);

  const results = [];
  for (const q of QUERIES) {
    log(`[fetch] ${q}`);
    const items = await fetchMercari(q, 120);
    const soldItems = items.filter(isSold);
    const summary = summarize(items);
    const soldSummary = summarize(soldItems);

    // ¥5,000超の上位サンプルを記録
    const topSamples = [...items]
      .filter((i) => i.price >= 5000)
      .sort((a, b) => b.price - a.price)
      .slice(0, 5)
      .map((i) => ({
        name: i.name,
        price: i.price,
        status: i.status,
        url: `https://jp.mercari.com/item/${i.id}`,
      }));

    results.push({
      query: q,
      totalFetched: items.length,
      soldFetched: soldItems.length,
      all: summary,
      soldOnly: soldSummary,
      topSamples,
    });

    if (!jsonOutput) {
      if (!summary) {
        log("  (no items)");
      } else {
        log(
          `  all: n=${summary.count} med=¥${summary.median.toLocaleString()} max=¥${summary.max.toLocaleString()} p90=¥${summary.p90.toLocaleString()} 5k+=${summary.over5k}(${summary.over5kPct}%) 10k+=${summary.over10k} 30k+=${summary.over30k}`
        );
        if (soldSummary) {
          log(
            `  sold: n=${soldSummary.count} med=¥${soldSummary.median.toLocaleString()} max=¥${soldSummary.max.toLocaleString()} p90=¥${soldSummary.p90.toLocaleString()} 5k+=${soldSummary.over5k}(${soldSummary.over5kPct}%)`
          );
        }
        if (topSamples.length) {
          log(`  top:`);
          for (const s of topSamples.slice(0, 3)) {
            log(`    ¥${s.price.toLocaleString()} ${s.status} ${s.name.slice(0, 60)}`);
          }
        }
      }
    }

    // 軽くrate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  // 出力先
  const outDir = path.join(PROJECT_ROOT, "scripts", "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "weekly-mag-explore.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2)
  );

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  } else {
    log(`\n結果保存: ${outPath}`);

    // 判定: 各クエリの sold med と 5k+ 比率でテーブル出力
    log("\n=== 判定テーブル（sold基準） ===");
    log("query".padEnd(38) + "n".padStart(5) + "med".padStart(10) + "max".padStart(12) + "5k+%".padStart(7));
    for (const r of results) {
      const s = r.soldOnly;
      if (!s) {
        log(r.query.padEnd(38) + "  (no sold)");
      } else {
        log(
          r.query.padEnd(38) +
            String(s.count).padStart(5) +
            ("¥" + s.median.toLocaleString()).padStart(10) +
            ("¥" + s.max.toLocaleString()).padStart(12) +
            (s.over5kPct + "%").padStart(7)
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
