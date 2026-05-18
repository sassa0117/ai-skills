/**
 * 初版コミック相場スキャン結果ビューワ
 *   全体ページ index.html        — みんなのポケモンGR風（並び替え可能なグループカードグリッド）
 *   グループ別 g-NNN.html         — 1グループ（IP×巻×タグ組合せ）の詳細＋グラフ＋関連
 *   IP別 ip-NNN.html              — Hobipedia catalog/[id] 風（IP丸ごと）
 *
 * 使い方:
 *   node scripts/comic-firstprint-report.mjs [--scan-id <id>] [--min-count 1] [--open]
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"), { readonly: true });

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] || null; };
const hasFlag = (n) => args.includes(n);

const scanIdArg = getArg("--scan-id");
const minCount = parseInt(getArg("--min-count") || "1", 10);
const shouldOpen = hasFlag("--open");

const scan = scanIdArg
  ? db.prepare("SELECT * FROM ComicFirstPrintScan WHERE id = ?").get(scanIdArg)
  : db.prepare("SELECT * FROM ComicFirstPrintScan ORDER BY createdAt DESC LIMIT 1").get();

if (!scan) {
  console.error("スキャンが見つからない。先に comic-firstprint-scan.mjs を実行しろ");
  process.exit(1);
}

// グループは中央値降順で取得（g-001 の番号がそのまま「中央値ランキング」と一致）
const allGroupsRaw = db.prepare(`
  SELECT * FROM ComicFirstPrintGroup
  WHERE scanId = ? AND itemCount >= ?
  ORDER BY priceMedian DESC
`).all(scan.id, minCount);

const getItemsByGroup = db.prepare(`
  SELECT id, rawName, price, soldDate, url, thumbnailUrl, condition, gradeRank
  FROM ComicFirstPrintItem
  WHERE groupId = ? ORDER BY price DESC
`);

// コンディション順（鑑定品 > S > A > B > C > D > E > 未分類）
const CONDITION_ORDER = ["鑑定品", "S", "A", "B", "C", "D", "E"];
const CONDITION_LABEL = {
  "鑑定品": "鑑定品",
  "S": "S シュリンク付帯完備",
  "A": "A 美品 帯付き",
  "B": "B 帯なし美品",
  "C": "C やや傷汚れあり",
  "D": "D 傷汚れあり",
  "E": "E 状態悪い",
};
const CONDITION_COLOR = {
  "鑑定品": "#7c3aed",  // purple
  "S":      "#0284c7",  // sky-600
  "A":      "#059669",  // emerald-600
  "B":      "#0a7a3f",  // green
  "C":      "#d97706",  // amber-600
  "D":      "#dc2626",  // red-600
  "E":      "#71717a",  // zinc-500
};
const conditionRank = (c) => { const i = CONDITION_ORDER.indexOf(c); return i === -1 ? 99 : i; };
const sortByCondition = (a, b) => conditionRank(a.condition) - conditionRank(b.condition) || b.price - a.price;

// グループに番号 g-NNN とアイテム配列を付与
const allGroups = allGroupsRaw.map((g, i) => {
  const slug = `g-${String(i + 1).padStart(3, "0")}`;
  const items = getItemsByGroup.all(g.id);
  // 公式書影（楽天ブックスAPI）優先。メルカリ画像は使わない（規約）
  const heroThumb = g.coverUrl || null;
  return {
    ...g,
    slug,
    items,
    heroThumb,
    rangePct: g.priceMax > 0 ? Math.round(((g.priceMax - g.priceMin) / g.priceMax) * 100) : 0,
  };
});

// IP単位で集約（個別ページ用）
const ipMap = new Map();
for (const g of allGroups) {
  if (!ipMap.has(g.ipName)) ipMap.set(g.ipName, { ipName: g.ipName, groups: [], totalItems: 0, maxPrice: 0, maxMedian: 0 });
  const ip = ipMap.get(g.ipName);
  ip.groups.push(g);
  ip.totalItems += g.itemCount;
  if (g.priceMax > ip.maxPrice) ip.maxPrice = g.priceMax;
  if (g.priceMedian > ip.maxMedian) ip.maxMedian = g.priceMedian;
}
const ipList = [...ipMap.values()].sort((a, b) => {
  if (b.maxMedian !== a.maxMedian) return b.maxMedian - a.maxMedian;
  return b.totalItems - a.totalItems;
});
const ipSlugMap = new Map();
ipList.forEach((ip, i) => {
  const slug = `ip-${String(i + 1).padStart(3, "0")}`;
  ip.slug = slug;
  // hero画像はIP内のグループ最初の画像
  ip.heroThumb = ip.groups.find(g => g.heroThumb)?.heroThumb || null;
  ipSlugMap.set(ip.ipName, slug);
});

// グループ→所属IP の参照
const groupIpMap = new Map();
for (const g of allGroups) groupIpMap.set(g.id, ipMap.get(g.ipName));

// ========================================
// ヘルパー
// ========================================
const TAG_ORDER = ["初版", "新装版", "完全版", "文庫版", "新書判", "ワイド版", "愛蔵版", "特装版",
                   "帯なし", "帯付", "シュリンク付", "美品", "極美品", "新品/未開封", "非初版"];
const tagWeight = (t) => { const i = TAG_ORDER.indexOf(t); return i === -1 ? 999 : i; };
const tagsToArr = (s) => s.split(",").filter(Boolean);
const compareTagSet = (a, b) => {
  if (a.length !== b.length) return a.length - b.length;
  return a.reduce((s, t) => s + tagWeight(t), 0) - b.reduce((s, t) => s + tagWeight(t), 0);
};

const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function priceColorClass(price) {
  if (price >= 100000) return "p-premium";
  if (price >= 30000) return "p-highest";
  if (price >= 10000) return "p-high";
  if (price >= 3000) return "p-mid";
  return "p-low";
}
function tagClass(tag) {
  if (tag === "初版") return "tg-base";
  if (tag === "新装版" || tag === "完全版" || tag === "愛蔵版" || tag === "ワイド版" || tag === "文庫版" || tag === "新書判") return "tg-version";
  if (tag.startsWith("帯")) return "tg-obi";
  if (tag.startsWith("シュリンク")) return "tg-shrink";
  if (tag === "美品" || tag === "極美品" || tag === "新品/未開封") return "tg-mint";
  if (tag === "特装版") return "tg-special";
  if (tag === "非初版") return "tg-bad";
  return "tg-base";
}
// アフィリエイトID（既存：hobipedia catalog/[id] と共通化）
const AMAZON_TAG = "aberyuki0117-22";
const RAKUTEN_AFFILIATE_ID = "533370a1.099bb0f6.533370a2.d87efbc1";
const MERCARI_AMBASSADOR_ID = "1057058815";

// メルカリ商品URLに afid を付与（アンバサダー経由 = 画像表示OK）
function mercariItemUrl(rawUrl) {
  if (!rawUrl) return "#";
  const sep = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${sep}afid=${MERCARI_AMBASSADOR_ID}`;
}

function buildAffiliateLinks(ipName, vol, tagStr, asin) {
  const kw = encodeURIComponent(`${ipName} ${vol}巻 ${tagStr.replace(/,/g, " ")}`);
  const rakutenInner = encodeURIComponent(`https://search.rakuten.co.jp/search/mall/${kw}/`);
  // asinがあれば商品ページ直リンク、無ければ検索ページ
  const amazonUrl = asin
    ? `https://www.amazon.co.jp/dp/${asin}/?tag=${AMAZON_TAG}`
    : `https://www.amazon.co.jp/s?k=${kw}&tag=${AMAZON_TAG}`;
  return {
    mercari:    `https://jp.mercari.com/search?keyword=${kw}&afid=${MERCARI_AMBASSADOR_ID}`,
    amazon:     amazonUrl,
    rakuten:    `https://hb.afl.rakuten.co.jp/ichiba/${RAKUTEN_AFFILIATE_ID}/?pc=${rakutenInner}&link_type=hybrid_url`,
    rakutenBooks: `https://hb.afl.rakuten.co.jp/ichiba/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(`https://books.rakuten.co.jp/search?sitem=${kw}&g=001`)}&link_type=hybrid_url`,
    yahooShop:  `https://shopping.yahoo.co.jp/search?p=${kw}`,
    yahooAuc:   `https://auctions.yahoo.co.jp/search/search?p=${kw}`,
    paypayFlea: `https://paypayfleamarket.yahoo.co.jp/search/${kw}`,
    surugaya:   `https://www.suruga-ya.jp/search?search_word=${kw}`,
    mandarake:  `https://order.mandarake.co.jp/order/listPage/list?keyword=${kw}`,
    lashinban:  `https://www.lashinbang.com/search?keyword=${kw}`,
    bookoff:    `https://shopping.bookoff.co.jp/search/keyword/${kw}`,
  };
}

// ========================================
// SVG グラフ：IP内の巻 × 中央値 折れ線
// ========================================
function buildVolumeChartSvg(ipGroups, focusGroupId) {
  // 巻×タグごとに集計（同じ巻でも初版/新装版/etc で別系列）
  const tagSeries = new Map(); // tagStr -> [{vol, median, id, isFocus}]
  for (const g of ipGroups) {
    if (!tagSeries.has(g.tags)) tagSeries.set(g.tags, []);
    tagSeries.get(g.tags).push({ vol: g.volume, median: g.priceMedian, id: g.id });
  }
  for (const arr of tagSeries.values()) arr.sort((a, b) => a.vol - b.vol);

  const allVols = [...new Set(ipGroups.map(g => g.volume))].sort((a, b) => a - b);
  const allMedians = ipGroups.map(g => g.priceMedian);
  if (allVols.length === 0 || allMedians.length === 0) return "";

  const W = 720, H = 240;
  const PAD_L = 60, PAD_R = 16, PAD_T = 14, PAD_B = 36;
  const minVol = Math.min(...allVols);
  const maxVol = Math.max(...allVols);
  const yMax = Math.max(...allMedians);
  const yMin = 0;
  const yRange = Math.max(1, yMax - yMin);
  const xRange = Math.max(1, maxVol - minVol);

  const xOf = (v) => PAD_L + ((v - minVol) / xRange) * (W - PAD_L - PAD_R);
  const yOf = (p) => PAD_T + (1 - (p - yMin) / yRange) * (H - PAD_T - PAD_B);

  // 系列カラー
  const SERIES_COLORS = ["#0284c7", "#e11d48", "#d97706", "#7e22ce", "#0a7a3f", "#be185d"];
  const seriesArr = [...tagSeries.entries()].map(([tagStr, points], i) => ({
    tagStr, points, color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  // y軸目盛
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const gridLines = yTicks.map(t => `
    <line x1="${PAD_L}" y1="${PAD_T + t * (H - PAD_T - PAD_B)}" x2="${W - PAD_R}" y2="${PAD_T + t * (H - PAD_T - PAD_B)}" stroke="#e4e4e7" stroke-dasharray="3 3" stroke-width="1"/>
  `).join("");
  const yLabels = yTicks.map(t => `
    <text x="${PAD_L - 8}" y="${PAD_T + t * (H - PAD_T - PAD_B) + 4}" text-anchor="end" font-size="10" fill="#9ca3af">¥${Math.round((1 - t) * yMax).toLocaleString()}</text>
  `).join("");

  // x軸目盛（巻数）
  const xTickStep = Math.max(1, Math.ceil(allVols.length / 8));
  const xLabels = allVols.filter((_, i) => i % xTickStep === 0 || i === allVols.length - 1).map(v => `
    <text x="${xOf(v)}" y="${H - 14}" text-anchor="middle" font-size="10" fill="#9ca3af">${v}</text>
  `).join("");
  const xAxisLabel = `<text x="${(W - PAD_L - PAD_R) / 2 + PAD_L}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#71717a">巻数</text>`;

  // 系列ごとに折れ線+点
  const seriesSvg = seriesArr.map(s => {
    const pointsStr = s.points.map(p => `${xOf(p.vol)},${yOf(p.median)}`).join(" ");
    const line = s.points.length >= 2
      ? `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pointsStr}" opacity="0.85"/>`
      : "";
    const dots = s.points.map(p => {
      const isFocus = p.id === focusGroupId;
      const r = isFocus ? 7 : 4;
      const stroke = isFocus ? `stroke="#18181b" stroke-width="2"` : `stroke="#fff" stroke-width="1.5"`;
      return `<circle cx="${xOf(p.vol)}" cy="${yOf(p.median)}" r="${r}" fill="${s.color}" ${stroke}><title>${escapeHtml(s.tagStr)} ${p.vol}巻 ${yen(p.median)}</title></circle>`;
    }).join("");
    return line + dots;
  }).join("");

  // 凡例
  const legend = seriesArr.map(s => `
    <span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px">
      <span style="display:inline-block;width:14px;height:2px;background:${s.color};vertical-align:middle"></span>
      <span style="font-size:11px;color:var(--zinc-600)">${escapeHtml(s.tagStr || "初版")}</span>
    </span>`).join("");

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg" role="img" aria-label="巻×中央値推移">
        ${gridLines}
        ${yLabels}
        ${xLabels}
        ${xAxisLabel}
        ${seriesSvg}
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>
  `;
}

// ========================================
// 共通CSS
// ========================================
const COMMON_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --sky-50: #f0f9ff; --sky-100: #e0f2fe; --sky-200: #bae6fd; --sky-300: #7dd3fc;
    --sky-400: #38bdf8; --sky-500: #0ea5e9; --sky-600: #0284c7; --sky-700: #0369a1;
    --zinc-50: #fafafa; --zinc-100: #f4f4f5; --zinc-200: #e4e4e7; --zinc-300: #d4d4d8;
    --zinc-400: #a1a1aa; --zinc-500: #71717a; --zinc-600: #52525b; --zinc-700: #3f3f46;
    --zinc-800: #27272a; --zinc-900: #18181b;
    --rose-500: #f43f5e; --rose-600: #e11d48;
    --emerald-500: #10b981; --emerald-600: #059669;
    --amber-500: #f59e0b; --amber-600: #d97706;
    --pink-500: #ec4899; --purple-500: #a855f7;
  }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
    background: var(--zinc-100);
    color: var(--zinc-800);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  a { color: inherit; text-decoration: none; }
  /* Hobipediaヘッダー */
  .site-header {
    display: flex; align-items: center; gap: 12px;
    height: 56px; background: var(--sky-300); padding: 0 20px;
  }
  .site-header .brand { display: flex; align-items: baseline; gap: 6px; font-weight: 700; color: #fff; font-size: 18px; }
  .site-header .brand .beta { font-size: 10px; background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 3px; font-weight: 700; }
  .site-header .meta { margin-left: auto; font-size: 11px; color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; }
  .site-header .meta code { background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 10px; }
  /* サブバー */
  .sub-bar { background: var(--sky-100); padding: 8px 20px; font-size: 13px; }
  .sub-bar .inner { max-width: 1280px; margin: 0 auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .sub-bar a { color: var(--sky-600); }
  .sub-bar a:hover { text-decoration: underline; }
  .sub-bar .label { font-weight: 700; color: var(--sky-700); }
  /* 価格カラー */
  .p-premium { color: var(--rose-600); } .p-highest { color: var(--rose-500); }
  .p-high { color: var(--amber-600); } .p-mid { color: var(--sky-600); } .p-low { color: var(--zinc-500); }
  /* タグ */
  .tag {
    display: inline-block; padding: 2px 7px; border-radius: 4px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.3px; line-height: 1.4;
  }
  .tg-base    { background: var(--sky-100);    color: var(--sky-700); }
  .tg-version { background: #ede9fe;            color: #6d28d9; border: 1px solid #c4b5fd; }
  .tg-obi     { background: #fff3e0;            color: #c87a00; }
  .tg-shrink  { background: #e6f7ed;            color: #0a7a3f; }
  .tg-mint    { background: #fff8db;            color: #a06800; }
  .tg-special { background: #f3e8ff;            color: #7e22ce; }
  .tg-bad     { background: #fee2e2;            color: #b91c1c; }
  /* コンディション pill（全ページ共通） */
  .cond-pill { display: inline-flex; align-items: center; gap: 3px; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; letter-spacing: 0.3px; line-height: 1.4; }
  .cond-pill .n { background: rgba(255,255,255,0.25); border-radius: 999px; padding: 0 5px; margin-left: 2px; font-size: 10px; }
  .grade-conds { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
  /* セクションカード */
  .section { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .section-head { border-left: 3px solid var(--sky-300); border-bottom: 1px solid var(--zinc-100); padding: 10px 14px; }
  .section-head h2 { margin: 0; font-size: 13px; font-weight: 700; color: var(--zinc-700); }
  .section-body { padding: 16px; }
  .section-body.no-pad { padding: 0; }
  /* グラフ */
  .chart-wrap { width: 100%; }
  .chart-svg { width: 100%; height: auto; max-height: 280px; display: block; }
  .chart-legend { margin-top: 6px; padding: 0 4px; }
  /* nav */
  .nav-bar { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }
  .nav-btn { background: #fff; color: var(--sky-600); border: 1px solid var(--zinc-200); border-radius: 8px; padding: 8px 14px; font-size: 13px; }
  .nav-btn:hover { border-color: var(--sky-300); background: var(--sky-50); }
  /* 関連ミニカード */
  .mini-grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 600px)  { .mini-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 900px)  { .mini-grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1100px) { .mini-grid { grid-template-columns: repeat(5, 1fr); } }
  .mini-card {
    background: #fff;
    border: 1px solid var(--zinc-200);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .mini-card:hover { transform: translateY(-2px); border-color: var(--sky-300); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
  .mini-thumb {
    aspect-ratio: 1 / 1;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; position: relative;
  }
  .mini-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .mini-thumb .vol-fallback { font-size: 36px; font-weight: 800; color: var(--sky-600); letter-spacing: -2px; }
  .mini-thumb .vol-badge {
    position: absolute; top: 6px; left: 6px;
    background: rgba(2,132,199,0.85); color: #fff;
    font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
  }
  .mini-body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 2px; }
  .mini-ip { font-size: 10px; color: var(--zinc-500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-vol { font-size: 12px; font-weight: 700; color: var(--zinc-700); }
  .mini-price { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .mini-tags { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; }
`;

// ========================================
// 全体ページ（みんなのポケモンGR風）
// ========================================
// メルカリ画像はDB保存はあるが表示しない（hotlink+規約リスクのため）。
// 公式書影は楽天ブックスAPI から取得（coverUrl カラム）
// コンディション内訳を事前計算
function buildConditionBreakdown(items) {
  const map = new Map();
  for (const it of items) {
    const c = it.condition || "B";
    map.set(c, (map.get(c) || 0) + 1);
  }
  return CONDITION_ORDER.filter(c => map.has(c)).map(c => ({ c, n: map.get(c) }));
}

const groupsJson = JSON.stringify(allGroups.map(g => ({
  slug: g.slug,
  ipName: g.ipName,
  ipSlug: ipSlugMap.get(g.ipName),
  volume: g.volume,
  tags: tagsToArr(g.tags),
  conds: buildConditionBreakdown(g.items),
  itemCount: g.itemCount,
  priceMedian: g.priceMedian,
  priceMin: g.priceMin,
  priceMax: g.priceMax,
  rangePct: g.rangePct,
  cover: g.coverUrl || null,
  createdAt: g.createdAt,
})));

const indexHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>初版コミック相場 — みんなのコミック相場</title>
<style>
${COMMON_CSS}
  main { max-width: 1280px; margin: 0 auto; padding: 20px 16px 60px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 20px; }
  .summary > div { background: #fff; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .summary .label { font-size: 10px; color: var(--zinc-400); letter-spacing: 0.5px; }
  .summary .value { font-size: 22px; font-weight: 800; color: var(--zinc-800); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .control-bar {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    background: #fff; padding: 12px 14px; border-radius: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04); margin-bottom: 16px;
  }
  .control-bar label { font-size: 11px; color: var(--zinc-500); font-weight: 600; }
  .control-bar select, .control-bar input[type="search"] {
    border: 1px solid var(--zinc-200); border-radius: 8px;
    padding: 8px 12px; font-size: 13px; background: #fff; color: var(--zinc-700);
  }
  .control-bar select { min-width: 220px; cursor: pointer; }
  .control-bar select:focus, .control-bar input[type="search"]:focus { outline: 2px solid var(--sky-300); outline-offset: -1px; }
  .control-bar input[type="search"] { flex: 1; min-width: 180px; }
  .control-bar .count { margin-left: auto; font-size: 11px; color: var(--zinc-400); font-variant-numeric: tabular-nums; }
  /* メインカードグリッド */
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 640px)  { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 900px)  { .grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1100px) { .grid { grid-template-columns: repeat(5, 1fr); } }
  .card {
    background: #fff; border-radius: 12px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    display: flex; flex-direction: column;
    transition: transform 0.15s, box-shadow 0.15s;
    border: 1px solid var(--zinc-200);
  }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); border-color: var(--sky-300); }
  .card-visual {
    position: relative; aspect-ratio: 3/4;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .card-visual img { width: 100%; height: 100%; object-fit: cover; }
  .card-visual .no-img { font-size: 56px; font-weight: 900; color: var(--sky-600); letter-spacing: -3px; }
  .card-visual .no-img::after { content: "巻"; font-size: 16px; font-weight: 700; color: var(--sky-700); margin-left: 3px; vertical-align: super; }
  .card-visual .vol-tag {
    position: absolute; bottom: 6px; left: 6px;
    background: rgba(2,132,199,0.92); color: #fff;
    font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
  }
  .card-visual .ip-watermark {
    position: absolute; top: 6px; right: 6px;
    font-size: 10px; font-weight: 700; color: var(--zinc-700);
    background: rgba(255,255,255,0.85); padding: 2px 6px; border-radius: 4px;
    max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* 順位バッジ：左上に固定（タグ帯と被らない） */
  .card-visual .rank-badge {
    position: absolute; top: 6px; left: 6px;
    background: var(--sky-500); color: #fff; font-size: 11px; font-weight: 700;
    padding: 3px 10px; border-radius: 14px; box-shadow: 0 2px 6px rgba(2,132,199,0.3);
    z-index: 2; letter-spacing: 0.5px;
  }
  .card-visual .rank-badge.top-3 { background: linear-gradient(135deg, var(--rose-500), var(--amber-500)); }
  /* タグ帯は card-body 内に移動（visual には重ねない） */
  .card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .card-body .body-tags { display: flex; flex-wrap: wrap; gap: 3px; min-height: 18px; }
  .card-body .body-conds { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; font-size: 10px; }
  .cond-pill { display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px; border-radius: 999px; font-weight: 700; color: #fff; }
  .cond-pill .n { background: rgba(255,255,255,0.25); border-radius: 999px; padding: 0 5px; margin-left: 2px; font-size: 9px; }
  .card-body .ip-name { font-size: 12px; font-weight: 700; color: var(--zinc-700); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px; }
  .card-body .price-main { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; line-height: 1.1; }
  .card-body .price-sub { font-size: 10px; color: var(--zinc-400); margin-bottom: 4px; }
  .card-stats {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px;
    margin-top: auto; padding-top: 8px; border-top: 1px dashed var(--zinc-200);
    font-size: 10px; color: var(--zinc-500); font-variant-numeric: tabular-nums;
  }
  .card-stats .row { display: flex; justify-content: space-between; }
  .card-stats .row .v { color: var(--zinc-700); font-weight: 700; }
  .empty { text-align: center; padding: 80px 20px; color: var(--zinc-400); background: #fff; border-radius: 12px; }
</style>
</head>
<body>
<header class="site-header">
  <a class="brand" href="index.html"><span>初版コミック相場</span><span class="beta">β</span></a>
  <div class="meta"><code>${escapeHtml(scan.id.slice(0, 8))}</code><span style="margin-left:10px">${escapeHtml(scan.createdAt)}</span></div>
</header>

<main>
  <div class="summary">
    <div><div class="label">取得</div><div class="value">${scan.totalFetched}</div></div>
    <div><div class="label">フィルタ後</div><div class="value">${scan.totalFiltered}</div></div>
    <div><div class="label">グループ</div><div class="value">${allGroups.length}</div></div>
    <div><div class="label">IP</div><div class="value">${ipList.length}</div></div>
  </div>

  <div class="control-bar">
    <label for="sort">並び順</label>
    <select id="sort">
      <option value="medianDesc">価格中央値 [高い順]</option>
      <option value="medianAsc">価格中央値 [安い順]</option>
      <option value="maxDesc">最高値 [高い順]</option>
      <option value="maxAsc">最高値 [安い順]</option>
      <option value="countDesc">取引件数 [多い順]</option>
      <option value="countAsc">取引件数 [少ない順]</option>
      <option value="rangeDesc">価格レンジ [広い順]</option>
      <option value="volumeAsc">巻数 [若い順]</option>
      <option value="volumeDesc">巻数 [後ろ順]</option>
      <option value="ipAsc">IP名 [あいうえお順]</option>
    </select>
    <input type="search" id="filter" placeholder="🔍 IP名・タグで絞り込み">
    <span class="count" id="count">${allGroups.length}件</span>
  </div>

  ${allGroups.length === 0
    ? '<div class="empty">該当グループなし</div>'
    : '<div class="grid" id="grid"></div>'}
</main>

<script>
const GROUPS = ${groupsJson};
const CONDITION_COLOR = ${JSON.stringify(CONDITION_COLOR)};
const CONDITION_LABEL = ${JSON.stringify(CONDITION_LABEL)};

const yen = n => "¥" + Number(n).toLocaleString("ja-JP");
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function priceColorClass(price) {
  if (price >= 100000) return "p-premium";
  if (price >= 30000)  return "p-highest";
  if (price >= 10000)  return "p-high";
  if (price >= 3000)   return "p-mid";
  return "p-low";
}
function tagClass(tag) {
  if (tag === "初版") return "tg-base";
  if (["新装版","完全版","愛蔵版","ワイド版","文庫版","新書判"].includes(tag)) return "tg-version";
  if (tag.startsWith("帯")) return "tg-obi";
  if (tag.startsWith("シュリンク")) return "tg-shrink";
  if (["美品","極美品","新品/未開封"].includes(tag)) return "tg-mint";
  if (tag === "特装版") return "tg-special";
  if (tag === "非初版") return "tg-bad";
  return "tg-base";
}

const SORTS = {
  medianDesc: (a,b) => b.priceMedian - a.priceMedian,
  medianAsc:  (a,b) => a.priceMedian - b.priceMedian,
  maxDesc:    (a,b) => b.priceMax - a.priceMax,
  maxAsc:     (a,b) => a.priceMax - b.priceMax,
  countDesc:  (a,b) => b.itemCount - a.itemCount || b.priceMedian - a.priceMedian,
  countAsc:   (a,b) => a.itemCount - b.itemCount || a.priceMedian - b.priceMedian,
  rangeDesc:  (a,b) => b.rangePct - a.rangePct,
  volumeAsc:  (a,b) => a.volume - b.volume || b.priceMedian - a.priceMedian,
  volumeDesc: (a,b) => b.volume - a.volume || b.priceMedian - a.priceMedian,
  ipAsc:      (a,b) => a.ipName.localeCompare(b.ipName, "ja") || a.volume - b.volume,
};

function renderCards() {
  const sortKey = document.getElementById("sort").value;
  const q = document.getElementById("filter").value.trim().toLowerCase();
  const sorted = [...GROUPS].sort(SORTS[sortKey]);
  const filtered = q
    ? sorted.filter(g => g.ipName.toLowerCase().includes(q) || g.tags.some(t => t.toLowerCase().includes(q)))
    : sorted;

  document.getElementById("count").textContent = filtered.length + "件";
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = filtered.map((g, i) => {
    const rank = i + 1;
    const rankCls = rank <= 3 ? "rank-badge top-3" : "rank-badge";
    const priceCls = priceColorClass(g.priceMedian);
    const tags = g.tags.length
      ? g.tags.map(t => '<span class="tag ' + tagClass(t) + '">' + escapeHtml(t) + '</span>').join("")
      : '<span class="tag tg-base">初版</span>';
    const conds = g.conds.map(o => {
      return '<span class="cond-pill" style="background:' + CONDITION_COLOR[o.c] + '" title="' + escapeHtml(CONDITION_LABEL[o.c]) + '">' + escapeHtml(o.c) + '<span class="n">' + o.n + '</span></span>';
    }).join("");
    const visual = g.cover
      ? '<img src="' + escapeHtml(g.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="no-img">' + g.volume + '</span>';
    return \`
      <a class="card" href="\${g.slug}.html">
        <div class="card-visual">
          \${visual}
          <span class="vol-tag">\${g.volume}巻</span>
          <span class="ip-watermark">\${escapeHtml(g.ipName)}</span>
          <div class="\${rankCls}">\${rank}位</div>
        </div>
        <div class="card-body">
          <div class="ip-name">\${escapeHtml(g.ipName)}</div>
          <div class="body-tags">\${tags}</div>
          <div class="price-main \${priceCls}">\${yen(g.priceMedian)}</div>
          <div class="price-sub">中央値 · \${g.itemCount}件</div>
          <div class="body-conds">\${conds}</div>
          <div class="card-stats">
            <div class="row"><span>最高</span><span class="v">\${yen(g.priceMax)}</span></div>
            <div class="row"><span>最安</span><span class="v">\${yen(g.priceMin)}</span></div>
            <div class="row"><span>件数</span><span class="v">\${g.itemCount}</span></div>
            <div class="row"><span>レンジ</span><span class="v">\${g.rangePct}%</span></div>
          </div>
        </div>
      </a>\`;
  }).join("");
}

document.getElementById("sort").addEventListener("change", renderCards);
document.getElementById("filter").addEventListener("input", renderCards);
renderCards();
</script>
</body>
</html>`;

// ========================================
// 関連ミニカード生成（共通）
// ========================================
function buildMiniCard(g) {
  const visual = g.heroThumb
    ? `<img src="${escapeHtml(g.heroThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="vol-fallback">${g.volume}</span>`;
  const tags = tagsToArr(g.tags).map(t =>
    `<span class="tag ${tagClass(t)}">${escapeHtml(t)}</span>`
  ).join("");
  return `
    <a class="mini-card" href="${g.slug}.html">
      <div class="mini-thumb">
        ${visual}
        <span class="vol-badge">${g.volume}巻</span>
      </div>
      <div class="mini-body">
        <div class="mini-ip">${escapeHtml(g.ipName)}</div>
        <div class="mini-price ${priceColorClass(g.priceMedian)}">${yen(g.priceMedian)}</div>
        <div class="mini-tags">${tags}</div>
      </div>
    </a>`;
}

function buildRelatedSections(currentGroup, currentIp) {
  // 1. 同じIPの他の巻
  const sameIpOthers = currentIp.groups
    .filter(g => g.id !== currentGroup.id)
    .sort((a, b) => a.volume - b.volume || compareTagSet(tagsToArr(a.tags), tagsToArr(b.tags)))
    .slice(0, 10);

  // 2. 価格帯が近い他IPの代表グループ
  const otherIps = ipList.filter(ip => ip.ipName !== currentIp.ipName);
  const priced = otherIps.map(ip => {
    const rep = ip.groups.reduce((best, g) =>
      Math.abs(g.priceMedian - currentGroup.priceMedian) < Math.abs(best.priceMedian - currentGroup.priceMedian) ? g : best,
      ip.groups[0]);
    return { ip, rep, dist: Math.abs(rep.priceMedian - currentGroup.priceMedian) };
  }).sort((a, b) => a.dist - b.dist).slice(0, 10);

  const sameIpHtml = sameIpOthers.length ? `
    <div class="section">
      <div class="section-head"><h2>${escapeHtml(currentIp.ipName)} の他の巻・グレード</h2></div>
      <div class="section-body">
        <div class="mini-grid">${sameIpOthers.map(buildMiniCard).join("")}</div>
      </div>
    </div>` : "";

  const otherIpHtml = priced.length ? `
    <div class="section">
      <div class="section-head"><h2>価格帯が近い他のIP</h2></div>
      <div class="section-body">
        <div class="mini-grid">${priced.map(p => buildMiniCard(p.rep)).join("")}</div>
      </div>
    </div>` : "";

  return sameIpHtml + otherIpHtml;
}

// ========================================
// グループ単位ページ g-NNN.html
// ========================================
function buildGroupPage(g, prevG, nextG) {
  const ip = groupIpMap.get(g.id);
  const tags = tagsToArr(g.tags);
  const links = buildAffiliateLinks(g.ipName, g.volume, g.tags, g.asin);

  // コンディション内訳
  const condBreakdown = (() => {
    const m = new Map();
    for (const it of g.items) {
      const c = it.condition || "B";
      m.set(c, (m.get(c) || 0) + 1);
    }
    return CONDITION_ORDER.filter(c => m.has(c)).map(c => ({ c, n: m.get(c) }));
  })();
  const condBreakdownHtml = condBreakdown.map(o =>
    `<span class="cond-pill" style="background:${CONDITION_COLOR[o.c]}" title="${escapeHtml(CONDITION_LABEL[o.c])}">${escapeHtml(o.c)}<span class="n">${o.n}</span></span>`
  ).join("");

  // 取引履歴ギャラリー（コンディション順 → 価格降順）
  const galleryItems = [...g.items].sort(sortByCondition).slice(0, 12);
  const itemGallery = galleryItems.map(it => {
    const cond = it.condition || "B";
    const thumb = it.thumbnailUrl
      ? `<img src="${escapeHtml(it.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="no-thumb">${g.volume}巻</span>`;
    const rankSuffix = it.gradeRank ? ` ${escapeHtml(it.gradeRank)}` : "";
    return `
    <a class="sold-card" href="${escapeHtml(mercariItemUrl(it.url))}" target="_blank" rel="noopener">
      <div class="sold-thumb">
        ${thumb}
        <span class="sold-badge">SOLD</span>
        <span class="cond-tag" style="background:${CONDITION_COLOR[cond]}">${escapeHtml(cond)}${rankSuffix}</span>
      </div>
      <div class="sold-info">
        <div class="sold-price ${priceColorClass(it.price)}">${yen(it.price)}</div>
        <div class="sold-date">${escapeHtml(it.soldDate || "")}</div>
      </div>
    </a>`;
  }).join("");

  // 全件テーブル（コンディション列追加）
  const sortedItems = [...g.items].sort(sortByCondition);
  const itemRows = sortedItems.map(it => {
    const cond = it.condition || "B";
    const rankSuffix = it.gradeRank ? ` ${escapeHtml(it.gradeRank)}` : "";
    return `
    <tr>
      <td class="t-date">${escapeHtml(it.soldDate || "")}</td>
      <td class="t-cond"><span class="cond-pill" style="background:${CONDITION_COLOR[cond]}">${escapeHtml(cond)}${rankSuffix}</span></td>
      <td class="t-price ${priceColorClass(it.price)}">${yen(it.price)}</td>
      <td class="t-name" title="${escapeHtml(it.rawName)}">${escapeHtml(it.rawName)}</td>
      <td class="t-link"><a href="${escapeHtml(mercariItemUrl(it.url))}" target="_blank" rel="noopener">開く ↗</a></td>
    </tr>`;
  }).join("");

  // 価格レンジバー（自グループ内）
  const minPct = 0;
  const maxPct = 100;
  const medPct = g.priceMax > g.priceMin
    ? Math.round(((g.priceMedian - g.priceMin) / (g.priceMax - g.priceMin)) * 100)
    : 50;

  const navPrev = prevG
    ? `<a class="nav-btn" href="${prevG.slug}.html">← ${escapeHtml(prevG.ipName)} ${prevG.volume}巻</a>`
    : `<span></span>`;
  const navNext = nextG
    ? `<a class="nav-btn" href="${nextG.slug}.html">${escapeHtml(nextG.ipName)} ${nextG.volume}巻 →</a>`
    : `<span></span>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(g.ipName)} ${g.volume}巻 ${escapeHtml(g.tags)} — 初版コミック相場</title>
<style>
${COMMON_CSS}
  main { max-width: 1280px; margin: 0 auto; padding: 20px 16px 60px; }
  .breadcrumb { font-size: 12px; color: var(--zinc-500); margin-bottom: 14px; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 6px; color: var(--zinc-300); }
  .breadcrumb .cur { color: var(--zinc-700); }
  .layout { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 900px) { .layout { grid-template-columns: 320px 1fr; } }
  /* 左サイド */
  .sidebar { display: flex; flex-direction: column; gap: 12px; }
  .hero-img {
    aspect-ratio: 3/4;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; position: relative;
  }
  .hero-img img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .hero-img .vol-fallback { font-size: 92px; font-weight: 900; color: var(--sky-600); letter-spacing: -4px; }
  .hero-img .vol-fallback::after { content: "巻"; font-size: 22px; font-weight: 700; color: var(--sky-700); margin-left: 4px; vertical-align: super; }
  .hero-img .meta-overlay {
    position: absolute; top: 8px; left: 8px;
    background: rgba(2,132,199,0.92); color: #fff;
    font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 4px;
  }
  .info-list { margin: 0; padding: 0; }
  .info-list dt, .info-list dd { font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--zinc-100); }
  .info-list dt { color: var(--zinc-400); float: left; clear: left; width: 40%; }
  .info-list dd { color: var(--zinc-700); margin-left: 40%; text-align: right; }
  /* メイン */
  .main-col { display: flex; flex-direction: column; gap: 14px; }
  .ip-header .badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; align-items: center; }
  .ip-header .badge {
    font-size: 11px; padding: 2px 10px; border-radius: 999px;
    border: 1px solid var(--sky-300); color: var(--sky-600);
  }
  .ip-header .ip-link {
    font-size: 12px; color: var(--sky-600);
  }
  .ip-header .ip-link:hover { text-decoration: underline; }
  .ip-header .title { font-size: 22px; font-weight: 800; color: var(--zinc-800); letter-spacing: -0.5px; margin: 4px 0 0; line-height: 1.25; }
  .ip-header .title .vol { color: var(--sky-600); margin: 0 4px; font-variant-numeric: tabular-nums; }
  /* サマリーカード */
  .summary-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .summary-3 > div { background: #fff; border-radius: 12px; padding: 14px 10px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .summary-3 .lbl { font-size: 10px; color: var(--zinc-400); margin-bottom: 4px; }
  .summary-3 .val { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .summary-3 .sub { font-size: 10px; color: var(--zinc-400); margin-top: 2px; }
  /* 価格セル */
  .price-cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; }
  @media (min-width: 600px) { .price-cells { grid-template-columns: repeat(6, 1fr); } }
  .price-cells .lbl { font-size: 10px; color: var(--zinc-400); }
  .price-cells .val { font-size: 16px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  /* レンジ */
  .range-block { padding: 8px 0; }
  .range-track { position: relative; height: 6px; background: var(--zinc-200); border-radius: 3px; margin-bottom: 6px; }
  .range-fill { position: absolute; top: 0; bottom: 0; left: 0; right: 0; background: linear-gradient(90deg, var(--sky-400), var(--amber-500)); border-radius: 3px; opacity: 0.6; }
  .range-marker { position: absolute; top: -3px; bottom: -3px; width: 3px; background: var(--zinc-800); border-radius: 1px; }
  .range-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--zinc-500); font-variant-numeric: tabular-nums; margin-top: 4px; }
  .range-labels .mid { color: var(--zinc-700); font-weight: 700; }
  /* sold ギャラリー */
  .sold-grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(3, 1fr);
  }
  @media (min-width: 600px) { .sold-grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 900px) { .sold-grid { grid-template-columns: repeat(6, 1fr); } }
  .sold-card { display: flex; flex-direction: column; }
  .sold-thumb {
    aspect-ratio: 1/1; position: relative; overflow: hidden; border-radius: 8px;
    background: var(--zinc-100); display: flex; align-items: center; justify-content: center;
  }
  .sold-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .sold-thumb .no-thumb { font-size: 22px; font-weight: 800; color: var(--zinc-400); }
  .sold-thumb .sold-badge {
    position: absolute; top: 6px; left: 6px;
    background: var(--rose-600); color: #fff; font-size: 9px; font-weight: 700;
    padding: 2px 6px; border-radius: 3px; letter-spacing: 0.5px;
  }
  .sold-thumb .cond-tag {
    position: absolute; bottom: 6px; right: 6px;
    color: #fff; font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 3px; letter-spacing: 0.3px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  /* コンディション pill（共通） */
  .cond-pill { display: inline-flex; align-items: center; gap: 3px; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; letter-spacing: 0.3px; }
  .cond-pill .n { background: rgba(255,255,255,0.25); border-radius: 999px; padding: 0 5px; margin-left: 2px; font-size: 10px; }
  .sold-info { padding: 4px 2px; }
  .sold-price { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .sold-date { font-size: 10px; color: var(--zinc-400); font-variant-numeric: tabular-nums; }
  /* 取引テーブル */
  table.sold-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.sold-table thead tr { border-bottom: 1px solid var(--zinc-200); }
  table.sold-table th { font-size: 11px; font-weight: 600; color: var(--zinc-500); padding: 10px 12px; text-align: left; }
  table.sold-table td { padding: 8px 12px; border-bottom: 1px solid var(--zinc-100); font-variant-numeric: tabular-nums; vertical-align: middle; }
  table.sold-table tr:last-child td { border-bottom: 0; }
  table.sold-table .t-thumb { width: 48px; padding: 6px; }
  table.sold-table .t-thumb img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; background: var(--zinc-100); display: block; }
  table.sold-table .t-date { color: var(--zinc-500); white-space: nowrap; font-size: 12px; }
  table.sold-table .t-price { font-weight: 700; text-align: right; white-space: nowrap; }
  table.sold-table .t-name { color: var(--zinc-600); max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table.sold-table .t-link a { color: var(--sky-600); font-size: 11px; }
  table.sold-table .t-link a:hover { text-decoration: underline; }
  /* 購入リンク */
  .buy-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 600px) { .buy-grid { grid-template-columns: repeat(3, 1fr); } }
  .buy-btn { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #fff; }
</style>
</head>
<body>
<header class="site-header">
  <a class="brand" href="index.html"><span>初版コミック相場</span><span class="beta">β</span></a>
  <div class="meta"><code>${escapeHtml(scan.id.slice(0, 8))}</code><span style="margin-left:10px">${escapeHtml(scan.createdAt)}</span></div>
</header>

<div class="sub-bar">
  <div class="inner">
    <a href="index.html">← 一覧に戻る</a>
    <span class="label">初版コミック相場</span>
    <a href="${ip.slug}.html" style="margin-left:auto">${escapeHtml(ip.ipName)} 全${ip.groups.length}グループ →</a>
  </div>
</div>

<main>
  <nav class="breadcrumb">
    <a href="index.html">トップ</a>
    <span class="sep">›</span>
    <a href="${ip.slug}.html">${escapeHtml(g.ipName)}</a>
    <span class="sep">›</span>
    <span class="cur">${g.volume}巻 · ${escapeHtml(g.tags)}</span>
  </nav>

  <div class="layout">
    <aside class="sidebar">
      <div class="section">
        <div class="hero-img">
          ${g.heroThumb
            ? `<img src="${escapeHtml(g.heroThumb)}" alt="${escapeHtml(g.ipName)} ${g.volume}巻" referrerpolicy="no-referrer">`
            : `<span class="vol-fallback">${g.volume}</span>`}
          <span class="meta-overlay">${g.volume}巻</span>
        </div>
      </div>
      <div class="section">
        <div class="section-head"><h2>このグループ</h2></div>
        <div class="section-body">
          <dl class="info-list">
            <dt>作品</dt><dd><a href="${ip.slug}.html" style="color:var(--sky-600)">${escapeHtml(g.ipName)}</a></dd>
            <dt>巻</dt><dd>${g.volume}巻</dd>
            <dt>版</dt><dd>${tags.length ? tags.map(t => `<span class="tag ${tagClass(t)}">${escapeHtml(t)}</span>`).join(" ") : '<span class="tag tg-base">初版</span>'}</dd>
            <dt>件数</dt><dd>${g.itemCount}件</dd>
            <dt>コンディション</dt><dd style="text-align:right;line-height:1.9">${condBreakdownHtml}</dd>
            <dt>中央値</dt><dd class="${priceColorClass(g.priceMedian)}" style="font-weight:700">${yen(g.priceMedian)}</dd>
            <dt>最高</dt><dd class="${priceColorClass(g.priceMax)}" style="font-weight:700">${yen(g.priceMax)}</dd>
            <dt>最安</dt><dd>${yen(g.priceMin)}</dd>
            <dt>レンジ</dt><dd>${g.rangePct}%</dd>
          </dl>
        </div>
      </div>
    </aside>

    <div class="main-col">
      <div class="ip-header">
        <div class="badge-row">
          <a class="ip-link" href="${ip.slug}.html">← ${escapeHtml(g.ipName)}</a>
          <span class="badge">初版コミック</span>
          ${tags.length ? tags.map(t => `<span class="tag ${tagClass(t)}">${escapeHtml(t)}</span>`).join("") : '<span class="tag tg-base">初版</span>'}
        </div>
        <h1 class="title">${escapeHtml(g.ipName)}<span class="vol">${g.volume}巻</span><span style="font-size:14px;color:var(--zinc-500);font-weight:600">${tags.length ? escapeHtml(g.tags) : "初版"}</span></h1>
      </div>

      <div class="summary-3">
        <div><div class="lbl">中央値</div><div class="val ${priceColorClass(g.priceMedian)}">${yen(g.priceMedian)}</div><div class="sub">${g.itemCount}件の中央値</div></div>
        <div><div class="lbl">最高値</div><div class="val ${priceColorClass(g.priceMax)}">${yen(g.priceMax)}</div></div>
        <div><div class="lbl">最安値</div><div class="val p-mid">${yen(g.priceMin)}</div></div>
      </div>

      <div class="section">
        <div class="section-head"><h2>価格情報</h2></div>
        <div class="section-body">
          <div class="price-cells">
            <div><div class="lbl">中央値</div><div class="val ${priceColorClass(g.priceMedian)}">${yen(g.priceMedian)}</div></div>
            <div><div class="lbl">最高値</div><div class="val ${priceColorClass(g.priceMax)}">${yen(g.priceMax)}</div></div>
            <div><div class="lbl">最安値</div><div class="val p-mid">${yen(g.priceMin)}</div></div>
            <div><div class="lbl">取引数</div><div class="val">${g.itemCount}</div></div>
            <div><div class="lbl">レンジ</div><div class="val">${g.rangePct}%</div></div>
            <div><div class="lbl">グループID</div><div class="val" style="font-size:12px;color:var(--zinc-500);font-family:ui-monospace,monospace">${g.slug}</div></div>
          </div>
          <div class="range-block">
            <div class="range-track">
              <div class="range-fill"></div>
              <div class="range-marker" style="left:${medPct}%"></div>
            </div>
            <div class="range-labels">
              <span>最安 ${yen(g.priceMin)}</span>
              <span class="mid">中央値 ${yen(g.priceMedian)}</span>
              <span>最高 ${yen(g.priceMax)}</span>
            </div>
          </div>
        </div>
      </div>

      ${ip.groups.length >= 2 ? `
      <div class="section">
        <div class="section-head"><h2>${escapeHtml(g.ipName)} 巻ごとの中央値推移</h2></div>
        <div class="section-body">
          ${buildVolumeChartSvg(ip.groups, g.id)}
          <p style="margin:8px 0 0;font-size:11px;color:var(--zinc-400)">
            黒い枠の点が現在のグループ。線色＝グレード組合せ。
          </p>
        </div>
      </div>` : ""}

      ${g.items.length > 0 ? `
      <div class="section">
        <div class="section-head"><h2>取引履歴 ギャラリー（${g.items.length}件）</h2></div>
        <div class="section-body">
          <div class="sold-grid">${itemGallery}</div>
        </div>
      </div>` : ""}

      <div class="nav-bar">${navPrev}${navNext}</div>

      ${g.items.length > 0 ? `
      <div class="section">
        <div class="section-head"><h2>取引履歴 詳細</h2></div>
        <div class="section-body no-pad">
          <div style="overflow-x:auto">
            <table class="sold-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>コンディション</th>
                  <th style="text-align:right">価格</th>
                  <th>商品名</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </div>
        </div>
      </div>` : ""}

      <div class="section">
        <div class="section-head"><h2>このグループを買えるところ</h2></div>
        <div class="section-body">
          <div class="buy-grid">
            <a class="buy-btn" href="${links.mercari}" target="_blank" rel="noopener" style="background:#ff4655">メルカリで探す ↗</a>
            <a class="buy-btn" href="${links.amazon}" target="_blank" rel="noopener" style="background:#ff9900">Amazon ↗</a>
            <a class="buy-btn" href="${links.rakuten}" target="_blank" rel="noopener" style="background:#bf0000">楽天市場 ↗</a>
            <a class="buy-btn" href="${links.rakutenBooks}" target="_blank" rel="noopener" style="background:#bf0000">楽天ブックス ↗</a>
            <a class="buy-btn" href="${links.yahooShop}" target="_blank" rel="noopener" style="background:#ff0033">Yahoo!ショッピング ↗</a>
            <a class="buy-btn" href="${links.yahooAuc}" target="_blank" rel="noopener" style="background:#7b0099">ヤフオク ↗</a>
            <a class="buy-btn" href="${links.paypayFlea}" target="_blank" rel="noopener" style="background:#ff0033">Yahoo!フリマ ↗</a>
            <a class="buy-btn" href="${links.surugaya}" target="_blank" rel="noopener" style="background:#333">駿河屋 ↗</a>
            <a class="buy-btn" href="${links.mandarake}" target="_blank" rel="noopener" style="background:#003e80">まんだらけ ↗</a>
            <a class="buy-btn" href="${links.lashinban}" target="_blank" rel="noopener" style="background:#ed1c24">らしんばん ↗</a>
            <a class="buy-btn" href="${links.bookoff}" target="_blank" rel="noopener" style="background:#facc15;color:#1f2937">ブックオフ ↗</a>
          </div>
          <p style="margin:10px 0 0;font-size:11px;color:var(--zinc-400)">
            ※外部リンク。メルカリ/Amazon/楽天はアフィリエイト。ホビペディア統合時はYahoo系もValueCommerce LinkSwitchで自動アフィ化。
          </p>
        </div>
      </div>

      ${buildRelatedSections(g, ip)}

      <div class="nav-bar">${navPrev}${navNext}</div>
    </div>
  </div>
</main>
</body>
</html>`;
}

// ========================================
// IP単位ページ ip-NNN.html
// ========================================
function buildIpPage(ip, prevIp, nextIp) {
  const volumes = [...new Set(ip.groups.map(g => g.volume))].sort((a, b) => a - b);
  const totalGroups = ip.groups.length;
  const allPrices = ip.groups.flatMap(g => [g.priceMin, g.priceMax]);
  const minPrice = allPrices.length ? Math.min(...allPrices) : 0;
  const maxPrice = ip.maxPrice;
  const medMax = ip.maxMedian;

  const volumeSections = volumes.map(vol => {
    const volGroups = ip.groups
      .filter(g => g.volume === vol)
      .sort((a, b) => compareTagSet(tagsToArr(a.tags), tagsToArr(b.tags)));
    const volTotal = volGroups.reduce((s, g) => s + g.itemCount, 0);
    const volMax = Math.max(...volGroups.map(g => g.priceMax));

    const gradeCards = volGroups.map(g => {
      const tags = tagsToArr(g.tags);
      const visualThumb = g.heroThumb;
      // コンディション内訳
      const m = new Map();
      for (const it of g.items) {
        const c = it.condition || "B";
        m.set(c, (m.get(c) || 0) + 1);
      }
      const condPills = CONDITION_ORDER.filter(c => m.has(c)).map(c =>
        `<span class="cond-pill" style="background:${CONDITION_COLOR[c]}" title="${escapeHtml(CONDITION_LABEL[c])}">${escapeHtml(c)}<span class="n">${m.get(c)}</span></span>`
      ).join("");
      const tagsHtml = tags.length
        ? tags.map(t => `<span class="tag ${tagClass(t)}">${escapeHtml(t)}</span>`).join("")
        : '<span class="tag tg-base">初版</span>';
      return `
        <a class="grade-card" href="${g.slug}.html">
          <div class="grade-thumb">
            ${visualThumb
              ? `<img src="${escapeHtml(visualThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
              : `<span class="no-thumb">${vol}</span>`}
          </div>
          <div class="grade-body">
            <div class="grade-tags">${tagsHtml}</div>
            <div class="grade-price ${priceColorClass(g.priceMedian)}">${yen(g.priceMedian)}</div>
            <div class="grade-meta">${g.itemCount}件 · ${yen(g.priceMin)}〜${yen(g.priceMax)}</div>
            <div class="grade-conds">${condPills}</div>
          </div>
        </a>`;
    }).join("");

    return `
      <section class="vol-section" id="vol-${vol}">
        <header class="vol-head">
          <div class="vol-num"><span class="n">${vol}</span><span class="k">巻</span></div>
          <div class="vol-stats">
            <div><span class="lbl">取引</span><span class="v">${volTotal}</span></div>
            <div><span class="lbl">グレード</span><span class="v">${volGroups.length}</span></div>
            <div><span class="lbl">最高</span><span class="v ${priceColorClass(volMax)}">${yen(volMax)}</span></div>
          </div>
        </header>
        <div class="grade-grid">${gradeCards}</div>
      </section>`;
  }).join("\n");

  // 価格帯近い他IP
  const otherIps = ipList.filter(x => x.ipName !== ip.ipName);
  const priced = otherIps.map(other => {
    const rep = other.groups.reduce((best, g) =>
      Math.abs(g.priceMedian - medMax) < Math.abs(best.priceMedian - medMax) ? g : best,
      other.groups[0]);
    return { ip: other, rep, dist: Math.abs(rep.priceMedian - medMax) };
  }).sort((a, b) => a.dist - b.dist).slice(0, 10);

  const navPrev = prevIp
    ? `<a class="nav-btn" href="${prevIp.slug}.html">← ${escapeHtml(prevIp.ipName)}</a>`
    : `<span></span>`;
  const navNext = nextIp
    ? `<a class="nav-btn" href="${nextIp.slug}.html">${escapeHtml(nextIp.ipName)} →</a>`
    : `<span></span>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(ip.ipName)} — 初版コミック相場</title>
<style>
${COMMON_CSS}
  main { max-width: 1280px; margin: 0 auto; padding: 20px 16px 60px; }
  .breadcrumb { font-size: 12px; color: var(--zinc-500); margin-bottom: 14px; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 6px; color: var(--zinc-300); }
  .breadcrumb .cur { color: var(--zinc-700); }
  .layout { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 900px) { .layout { grid-template-columns: 280px 1fr; } }
  .sidebar { display: flex; flex-direction: column; gap: 12px; }
  .hero-img { aspect-ratio: 3/4; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .hero-img img { width: 100%; height: 100%; object-fit: cover; }
  .hero-img .no-img { font-size: 80px; font-weight: 900; color: var(--sky-600); letter-spacing: -3px; }
  .info-list { margin: 0; padding: 0; }
  .info-list dt, .info-list dd { font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--zinc-100); }
  .info-list dt { color: var(--zinc-400); float: left; clear: left; width: 40%; }
  .info-list dd { color: var(--zinc-700); margin-left: 40%; text-align: right; }
  .vol-jump { display: flex; flex-wrap: wrap; gap: 6px; }
  .vol-jump a { background: var(--zinc-100); color: var(--zinc-600); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .vol-jump a:hover { background: var(--sky-100); color: var(--sky-700); }
  .main-col { display: flex; flex-direction: column; gap: 14px; }
  .ip-header .badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .ip-header .badge { font-size: 11px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--sky-300); color: var(--sky-600); }
  .ip-header .ip-title { font-size: 22px; font-weight: 800; color: var(--zinc-800); letter-spacing: -0.5px; margin: 0; line-height: 1.25; }
  .summary-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .summary-3 > div { background: #fff; border-radius: 12px; padding: 14px 10px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .summary-3 .lbl { font-size: 10px; color: var(--zinc-400); margin-bottom: 4px; }
  .summary-3 .val { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .summary-3 .sub { font-size: 10px; color: var(--zinc-400); margin-top: 2px; }
  .price-cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; }
  @media (min-width: 600px) { .price-cells { grid-template-columns: repeat(6, 1fr); } }
  .price-cells .cell .lbl { font-size: 10px; color: var(--zinc-400); }
  .price-cells .cell .val { font-size: 16px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  /* 巻セクション */
  .vol-section { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
  .vol-head { display: flex; align-items: flex-end; gap: 20px; padding: 14px 18px; border-bottom: 1px solid var(--zinc-100); border-left: 3px solid var(--sky-300); }
  .vol-num { display: flex; align-items: baseline; gap: 2px; }
  .vol-num .n { font-size: 32px; font-weight: 800; color: var(--zinc-800); letter-spacing: -1px; line-height: 1; font-variant-numeric: tabular-nums; }
  .vol-num .k { font-size: 14px; color: var(--zinc-500); font-weight: 600; }
  .vol-stats { display: flex; gap: 18px; padding-bottom: 4px; }
  .vol-stats > div { display: flex; flex-direction: column; }
  .vol-stats .lbl { font-size: 10px; color: var(--zinc-400); letter-spacing: 0.3px; }
  .vol-stats .v { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .grade-grid { display: grid; gap: 10px; padding: 14px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 700px)  { .grade-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1100px) { .grade-grid { grid-template-columns: repeat(4, 1fr); } }
  .grade-card {
    background: var(--zinc-50);
    border: 1px solid var(--zinc-200);
    border-radius: 10px; overflow: hidden;
    display: flex; flex-direction: column;
    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .grade-card:hover { transform: translateY(-2px); border-color: var(--sky-300); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .grade-thumb {
    aspect-ratio: 4/5; background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .grade-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .grade-thumb .no-thumb { font-size: 40px; font-weight: 800; color: var(--sky-600); }
  .grade-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .grade-tags { display: flex; flex-wrap: wrap; gap: 3px; }
  .grade-price { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
  .grade-meta { font-size: 11px; color: var(--zinc-500); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<header class="site-header">
  <a class="brand" href="index.html"><span>初版コミック相場</span><span class="beta">β</span></a>
  <div class="meta"><code>${escapeHtml(scan.id.slice(0, 8))}</code><span style="margin-left:10px">${escapeHtml(scan.createdAt)}</span></div>
</header>

<div class="sub-bar">
  <div class="inner">
    <a href="index.html">← 一覧に戻る</a>
    <span class="label">初版コミック相場</span>
  </div>
</div>

<main>
  <nav class="breadcrumb">
    <a href="index.html">トップ</a>
    <span class="sep">›</span>
    <span class="cur">${escapeHtml(ip.ipName)}</span>
  </nav>

  <div class="layout">
    <aside class="sidebar">
      <div class="section">
        <div class="hero-img">
          ${ip.heroThumb
            ? `<img src="${escapeHtml(ip.heroThumb)}" alt="${escapeHtml(ip.ipName)}" referrerpolicy="no-referrer">`
            : `<span class="no-img">${volumes[0]}</span>`}
        </div>
      </div>
      <div class="section">
        <div class="section-head"><h2>IP情報</h2></div>
        <div class="section-body">
          <dl class="info-list">
            <dt>作品名</dt><dd>${escapeHtml(ip.ipName)}</dd>
            <dt>収録巻数</dt><dd>${volumes.length}巻</dd>
            <dt>グループ数</dt><dd>${totalGroups}</dd>
            <dt>取引総数</dt><dd>${ip.totalItems}件</dd>
            <dt>最高価格</dt><dd class="${priceColorClass(maxPrice)}" style="font-weight:700">${yen(maxPrice)}</dd>
            <dt>最安価格</dt><dd>${yen(minPrice)}</dd>
          </dl>
        </div>
      </div>
      ${volumes.length > 1 ? `
      <div class="section">
        <div class="section-head"><h2>巻にジャンプ</h2></div>
        <div class="section-body">
          <div class="vol-jump">${volumes.map(v => `<a href="#vol-${v}">${v}巻</a>`).join("")}</div>
        </div>
      </div>` : ""}
    </aside>

    <div class="main-col">
      <div class="ip-header">
        <div class="badge-row">
          <span class="badge">初版コミック</span>
          <span class="badge" style="border-color:var(--pink-500);color:var(--pink-500)">${volumes.length}巻分</span>
          <span class="badge" style="border-color:var(--amber-500);color:var(--amber-600)">${totalGroups}グループ</span>
        </div>
        <h1 class="ip-title">${escapeHtml(ip.ipName)}</h1>
      </div>

      <div class="summary-3">
        <div><div class="lbl">最高値</div><div class="val ${priceColorClass(maxPrice)}">${yen(maxPrice)}</div><div class="sub">scan内</div></div>
        <div><div class="lbl">中央値MAX</div><div class="val ${priceColorClass(medMax)}">${yen(medMax)}</div><div class="sub">グループ単位</div></div>
        <div><div class="lbl">最安値</div><div class="val p-mid">${yen(minPrice)}</div><div class="sub">scan内</div></div>
      </div>

      <div class="section">
        <div class="section-head"><h2>価格情報</h2></div>
        <div class="section-body">
          <div class="price-cells">
            <div class="cell"><div class="lbl">最高値</div><div class="val ${priceColorClass(maxPrice)}">${yen(maxPrice)}</div></div>
            <div class="cell"><div class="lbl">最安値</div><div class="val p-mid">${yen(minPrice)}</div></div>
            <div class="cell"><div class="lbl">中央値MAX</div><div class="val ${priceColorClass(medMax)}">${yen(medMax)}</div></div>
            <div class="cell"><div class="lbl">取引数</div><div class="val">${ip.totalItems}</div></div>
            <div class="cell"><div class="lbl">巻数</div><div class="val">${volumes.length}</div></div>
            <div class="cell"><div class="lbl">グループ</div><div class="val">${totalGroups}</div></div>
          </div>
        </div>
      </div>

      ${ip.groups.length >= 2 ? `
      <div class="section">
        <div class="section-head"><h2>${escapeHtml(ip.ipName)} 巻ごとの中央値推移</h2></div>
        <div class="section-body">
          ${buildVolumeChartSvg(ip.groups, null)}
          <p style="margin:8px 0 0;font-size:11px;color:var(--zinc-400)">
            線色＝グレード組合せ。点クリックで該当グループへ（凡例参照）
          </p>
        </div>
      </div>` : ""}

      <div class="nav-bar">${navPrev}${navNext}</div>

      ${volumeSections}

      <div class="section">
        <div class="section-head"><h2>価格帯が近い他のIP</h2></div>
        <div class="section-body">
          <div class="mini-grid">${priced.map(p => buildMiniCard(p.rep)).join("")}</div>
        </div>
      </div>

      <div class="nav-bar">${navPrev}${navNext}</div>
    </div>
  </div>
</main>
</body>
</html>`;
}

// ========================================
// 出力
// ========================================
const outDir = path.join(__dirname, "output", "comic-firstprint");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  if ((f.startsWith("ip-") || f.startsWith("g-") || f === "index.html") && f.endsWith(".html")) {
    fs.unlinkSync(path.join(outDir, f));
  }
}
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf-8");
allGroups.forEach((g, i) => {
  const prev = i > 0 ? allGroups[i - 1] : null;
  const next = i < allGroups.length - 1 ? allGroups[i + 1] : null;
  fs.writeFileSync(path.join(outDir, `${g.slug}.html`), buildGroupPage(g, prev, next), "utf-8");
});
ipList.forEach((ip, i) => {
  const prev = i > 0 ? ipList[i - 1] : null;
  const next = i < ipList.length - 1 ? ipList[i + 1] : null;
  fs.writeFileSync(path.join(outDir, `${ip.slug}.html`), buildIpPage(ip, prev, next), "utf-8");
});

const indexPath = path.join(outDir, "index.html");
console.log(`✔ HTML 出力: ${indexPath}`);
console.log(`  グループページ: ${allGroups.length} / IPページ: ${ipList.length} / minCount=${minCount}`);

if (shouldOpen) {
  try { execSync(`start "" "${indexPath}"`, { shell: "cmd.exe" }); } catch (e) {}
}
