/**
 * 前期アニメの価格推移分析スクリプト
 *
 * ページ送りで全soldデータを取得し、
 * 放送前→放送中→放送後の価格推移を商品単位で分析���る
 *
 * 使い方:
 *   node scripts/season-analysis.mjs --title "推しの子" --goods "フィギュ��"
 *   node scripts/season-analysis.mjs --batch   ← 冬アニメ主要作品を一括
 */

import { createRequire } from "module";
import crypto from "crypto";

const require = createRequire(import.meta.url);
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx === -1 ? null : args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

// ========================================
// メルカリ全件取得（ページ送り）
// ========================================
async function searchAllSold(keyword, maxPages = 10) {
  const allItems = [];
  let pageToken = null;

  for (let page = 0; page < maxPages; page++) {
    try {
      const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
      const body = {
        searchSessionId: crypto.randomUUID(),
        pageSize: 120,
        searchCondition: {
          keyword,
          sort: "SORT_CREATED_TIME",
          order: "ORDER_DESC",
          status: ["STATUS_SOLD_OUT"],
        },
      };
      if (pageToken) body.pageToken = pageToken;

      const res = await fetch(MERCARI_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
        body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const data = await res.json();
      if (!data.items?.length) break;

      for (const item of data.items) {
        allItems.push({
          name: item.name,
          price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
          date: new Date(item.updated * 1000).toISOString().split("T")[0],
          url: `https://jp.mercari.com/item/${item.id}`,
        });
      }

      console.log(`  ページ${page + 1}: ${data.items.length}件取得 (累計${allItems.length}/${data.meta?.numFound || "?"})`);

      pageToken = data.meta?.nextPageToken;
      if (!pageToken) break;

      // API負荷軽減
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  ページ${page + 1}エラー:`, e.message);
      break;
    }
  }
  return allItems;
}

// ========================================
// 期間別に分割して分析
// ========================================
function analyzePeriods(items, broadcastStart, broadcastEnd) {
  const pre = [];     // 放送前
  const during = [];  // 放送中
  const post = [];    // ���送後

  for (const item of items) {
    if (item.date < broadcastStart) pre.push(item);
    else if (item.date <= broadcastEnd) during.push(item);
    else post.push(item);
  }

  return { pre, during, post };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function periodStats(items) {
  if (items.length === 0) return { count: 0, median: 0, min: 0, max: 0, avg: 0 };
  const prices = items.map(i => i.price);
  return {
    count: items.length,
    median: median(prices),
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}

// ========================================
// 1作品の分析
// ========================================
async function analyzeTitle(title, goodsType, broadcastStart, broadcastEnd) {
  const keyword = `${title} ${goodsType}`;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 ${title} [${goodsType}]`);
  console.log(`   放送期間: ${broadcastStart} 〜 ${broadcastEnd}`);
  console.log(`   検索: "${keyword}"`);
  console.log(`${"=".repeat(60)}`);

  // 全件取得
  const allItems = await searchAllSold(keyword, 15);
  if (allItems.length === 0) {
    console.log("  → データなし");
    return null;
  }

  // 商品名にタイトルが含まれるもののみ
  const filtered = allItems.filter(item =>
    item.name.toLowerCase().includes(title.toLowerCase()) ||
    item.name.replace(/\s/g, "").includes(title.replace(/\s/g, ""))
  );

  console.log(`\n  全件: ${allItems.length} → タイトル名一致: ${filtered.length}`);
  console.log(`  期間: ${filtered[filtered.length - 1]?.date || "?"} 〜 ${filtered[0]?.date || "?"}`);

  // 期間別分割
  const { pre, during, post } = analyzePeriods(filtered, broadcastStart, broadcastEnd);
  const preStat = periodStats(pre);
  const durStat = periodStats(during);
  const postStat = periodStats(post);

  console.log(`\n  ── 期間別サマリー ──`);
  console.log(`  放送前 (〜${broadcastStart}): ${preStat.count}件  中央値¥${preStat.median.toLocaleString()}  (¥${preStat.min.toLocaleString()}〜¥${preStat.max.toLocaleString()})`);
  console.log(`  放送中 (${broadcastStart}〜${broadcastEnd}): ${durStat.count}件  中央値¥${durStat.median.toLocaleString()}  (¥${durStat.min.toLocaleString()}〜¥${durStat.max.toLocaleString()})`);
  console.log(`  放送後 (${broadcastEnd}〜): ${postStat.count}件  中央値¥${postStat.median.toLocaleString()}  (¥${postStat.min.toLocaleString()}〜¥${postStat.max.toLocaleString()})`);

  // 変動率
  if (preStat.median > 0 && durStat.median > 0) {
    const preToDir = Math.round(((durStat.median - preStat.median) / preStat.median) * 100);
    console.log(`\n  放送前→放送中: ${preToDir > 0 ? "+" : ""}${preToDir}%`);
  }
  if (durStat.median > 0 && postStat.count > 0) {
    const dirToPost = Math.round(((postStat.median - durStat.median) / durStat.median) * 100);
    console.log(`  放送中→放送後: ${dirToPost > 0 ? "+" : ""}${dirToPost}%`);
  }
  if (preStat.median > 0 && postStat.count > 0) {
    const preToPost = Math.round(((postStat.median - preStat.median) / preStat.median) * 100);
    console.log(`  放送前→放送後: ${preToPost > 0 ? "+" : ""}${preToPost}%`);
  }

  // 商品単位で特に動いたもの（簡易表示）
  console.log(`\n  ── 直近sold商品（高額順10件）──`);
  const sorted = [...filtered].sort((a, b) => b.price - a.price).slice(0, 10);
  for (const item of sorted) {
    console.log(`  ¥${item.price.toLocaleString().padStart(7)}  ${item.date}  ${item.name.slice(0, 55)}`);
  }

  // 最安sold（低額順5件）
  console.log(`\n  ── 低額sold商品（5件）──`);
  const cheapest = [...filtered].sort((a, b) => a.price - b.price).slice(0, 5);
  for (const item of cheapest) {
    console.log(`  ¥${item.price.toLocaleString().padStart(7)}  ${item.date}  ${item.name.slice(0, 55)}`);
  }

  return {
    title, goodsType,
    totalItems: filtered.length,
    dateRange: { from: filtered[filtered.length - 1]?.date, to: filtered[0]?.date },
    pre: preStat, during: durStat, post: postStat,
  };
}

// ========================================
// メイン
// ========================================
async function main() {
  const title = getArg("--title");
  const goods = getArg("--goods") || "フィギュア";
  const batch = hasFlag("--batch");

  if (batch) {
    // 冬アニメ主要作品��一括分析
    // 放送期間: 2026年1月〜3月
    const targets = [
      { title: "推しの子", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "3期" },
      { title: "かぐや様は告らせたい", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "新作" },
      { title: "炎炎ノ消防隊", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "3期" },
      { title: "アンデッドアンラック", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "2期" },
      { title: "メダリスト", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "2期" },
      { title: "魔都精兵のスレイブ", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "2期" },
      { title: "Fate/strange Fake", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "新作" },
      { title: "青のミブロ", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "新作" },
      { title: "刃牙道", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "続編" },
      { title: "名探偵プリキュア", broadcastStart: "2026-02-01", broadcastEnd: "2026-03-31", type: "新作" },
      { title: "違国日記", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "新作" },
      { title: "貴族転生", broadcastStart: "2026-01-01", broadcastEnd: "2026-03-31", type: "新作" },
    ];

    const goodsTypes = ["フィギュア", "一番くじ", "アクスタ", "ぬいぐるみ"];
    const results = [];

    for (const target of targets) {
      for (const g of goodsTypes) {
        const result = await analyzeTitle(target.title, g, target.broadcastStart, target.broadcastEnd);
        if (result) {
          result.seasonType = target.type;
          results.push(result);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // 全体サマリー
    console.log(`\n\n${"#".repeat(60)}`);
    console.log("# 冬アニメ 価格推移サマリー");
    console.log(`${"#".repeat(60)}\n`);

    for (const r of results) {
      if (r.pre.count >= 3 && r.during.count >= 3) {
        const change = Math.round(((r.during.median - r.pre.median) / r.pre.median) * 100);
        const arrow = change >= 30 ? "🔥" : change >= 10 ? "📈" : change > 0 ? "↗️" : change > -10 ? "→" : "📉";
        console.log(`${arrow} ${r.title} [${r.goodsType}] (${r.seasonType})`);
        console.log(`  放送前¥${r.pre.median.toLocaleString()} → 放送中¥${r.during.median.toLocaleString()} (${change > 0 ? "+" : ""}${change}%) 放送後¥${r.post.median.toLocaleString() || "データなし"}`);
      }
    }
  } else if (title) {
    // 単体分析
    const start = getArg("--start") || "2026-01-01";
    const end = getArg("--end") || "2026-03-31";
    await analyzeTitle(title, goods, start, end);
  } else {
    console.log("使い方:");
    console.log("  node scripts/season-analysis.mjs --title \"推しの子\" --goods \"フィギュア\"");
    console.log("  node scripts/season-analysis.mjs --batch");
  }
}

main().catch(e => {
  console.error("エラー:", e);
  process.exit(1);
});
