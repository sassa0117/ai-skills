/**
 * 週刊誌相場 結果ビューワ（ローカルキャスト用）
 *   全体ページ index.html      — 雑誌×年×号のグループカードグリッド
 *   グループ別 g-NNN.html       — 1グループの詳細 + 出品一覧
 *
 * 使い方:
 *   node scripts/weekly-magazine-report.mjs [--scan-id <id>] [--min-count 1] [--open]
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
  ? db.prepare("SELECT * FROM WeeklyMagazineScan WHERE id = ?").get(scanIdArg)
  : db.prepare("SELECT * FROM WeeklyMagazineScan ORDER BY createdAt DESC LIMIT 1").get();

if (!scan) {
  console.error("スキャンが見つからない。先に weekly-magazine-scan.mjs を実行しろ");
  process.exit(1);
}

// グループは中央値降順
const allGroupsRaw = db.prepare(`
  SELECT * FROM WeeklyMagazineGroup
  WHERE scanId = ? AND itemCount >= ?
  ORDER BY priceMedian DESC
`).all(scan.id, minCount);

const getItemsByGroup = db.prepare(`
  SELECT id, rawName, price, soldDate, isSold, url, thumbnailUrl, condition, gradeRank, eventTagsJSON
  FROM WeeklyMagazineItem
  WHERE groupId = ? ORDER BY price DESC
`);

// コンディション
const CONDITION_ORDER = ["鑑定品", "S", "A", "B", "C", "D", "E"];
const CONDITION_LABEL = {
  "鑑定品": "鑑定品",
  "S": "S シュリンク",
  "A": "A 付録あり",
  "B": "B 通常",
  "C": "C やや傷/付録欠",
  "D": "D 傷汚れ",
  "E": "E 状態悪い",
};
const CONDITION_COLOR = {
  "鑑定品": "#7c3aed",
  "S": "#0284c7",
  "A": "#059669",
  "B": "#0a7a3f",
  "C": "#d97706",
  "D": "#dc2626",
  "E": "#71717a",
};

const allGroups = allGroupsRaw.map((g, i) => {
  const slug = `g-${String(i + 1).padStart(3, "0")}`;
  const items = getItemsByGroup.all(g.id);
  return { ...g, slug, items, eventTagsArr: JSON.parse(g.eventTags || "[]") };
});

// 雑誌別集計（サイドバーや今後の集約用）
const magMap = new Map();
for (const g of allGroups) {
  if (!magMap.has(g.magazineTitle)) {
    magMap.set(g.magazineTitle, { title: g.magazineTitle, groups: [], totalItems: 0, maxMedian: 0 });
  }
  const m = magMap.get(g.magazineTitle);
  m.groups.push(g);
  m.totalItems += g.itemCount;
  if (g.priceMedian > m.maxMedian) m.maxMedian = g.priceMedian;
}
const magList = [...magMap.values()].sort((a, b) => b.maxMedian - a.maxMedian);

// ヘルパー
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

const MERCARI_AMBASSADOR_ID = "1057058815";
function mercariItemUrl(rawUrl) {
  if (!rawUrl) return "#";
  const sep = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${sep}afid=${MERCARI_AMBASSADOR_ID}`;
}

function mercariSearchUrl(keyword) {
  return `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&afid=${MERCARI_AMBASSADOR_ID}`;
}

function eventTagBadge(tag) {
  const COLORS = {
    "新連載": "#dc2626",
    "最終回": "#7c3aed",
    "巻頭カラー": "#d97706",
    "センターカラー": "#f59e0b",
    "読切": "#0284c7",
    "表紙": "#0a7a3f",
  };
  const color = COLORS[tag] || "#71717a";
  return `<span class="ev-badge" style="background:${color}">${escapeHtml(tag)}</span>`;
}

function conditionBreakdown(items) {
  const map = new Map();
  for (const it of items) {
    const c = it.condition || "B";
    map.set(c, (map.get(c) || 0) + 1);
  }
  return CONDITION_ORDER.filter(c => map.has(c)).map(c => ({ c, n: map.get(c) }));
}

// ========================================
// 共通CSS
// ========================================
const COMMON_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --indigo-50: #eef2ff; --indigo-100: #e0e7ff; --indigo-300: #a5b4fc;
    --indigo-500: #6366f1; --indigo-600: #4f46e5; --indigo-700: #4338ca;
    --zinc-50: #fafafa; --zinc-100: #f4f4f5; --zinc-200: #e4e4e7; --zinc-300: #d4d4d8;
    --zinc-400: #a1a1aa; --zinc-500: #71717a; --zinc-600: #52525b; --zinc-700: #3f3f46;
    --zinc-800: #27272a; --zinc-900: #18181b;
    --rose-500: #f43f5e; --rose-600: #e11d48;
    --amber-500: #f59e0b; --amber-600: #d97706;
  }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
    background: var(--zinc-100); color: var(--zinc-800);
    -webkit-font-smoothing: antialiased; line-height: 1.5;
  }
  a { color: inherit; text-decoration: none; }
  /* Header */
  .site-header {
    display: flex; align-items: center; gap: 12px;
    height: 56px; background: linear-gradient(135deg, var(--indigo-600), var(--indigo-700));
    padding: 0 20px;
  }
  .site-header .brand { display: flex; align-items: baseline; gap: 8px; font-weight: 700; color: #fff; font-size: 18px; }
  .site-header .brand .beta { font-size: 10px; background: rgba(255,255,255,0.25); padding: 2px 6px; border-radius: 3px; font-weight: 700; }
  .site-header .meta { margin-left: auto; font-size: 11px; color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; }
  .site-header .meta code { background: rgba(255,255,255,0.18); padding: 1px 6px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 10px; }
  /* Sub bar */
  .sub-bar { background: var(--indigo-50); padding: 8px 20px; font-size: 13px; }
  .sub-bar .inner { max-width: 1280px; margin: 0 auto; display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
  .sub-bar a { color: var(--indigo-600); font-weight: 600; }
  .sub-bar a:hover { text-decoration: underline; }
  /* 価格カラー */
  .p-premium { color: var(--rose-600); }
  .p-highest { color: var(--rose-500); }
  .p-high { color: var(--amber-600); }
  .p-mid { color: var(--indigo-600); }
  .p-low { color: var(--zinc-500); }
  /* イベントバッジ */
  .ev-badge {
    display: inline-block; padding: 2px 7px; border-radius: 4px;
    font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.3px; line-height: 1.4;
  }
  /* コンディションpill */
  .cond-pill {
    display: inline-flex; align-items: center; gap: 3px; color: #fff;
    font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
    letter-spacing: 0.3px; line-height: 1.4;
  }
  .cond-pill .n { background: rgba(255,255,255,0.25); border-radius: 999px; padding: 0 5px; margin-left: 2px; font-size: 10px; }
  /* セクション */
  .section { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .section-head { border-left: 3px solid var(--indigo-300); border-bottom: 1px solid var(--zinc-100); padding: 10px 14px; }
  .section-head h2 { margin: 0; font-size: 13px; font-weight: 700; color: var(--zinc-700); }
  .section-body { padding: 16px; }
`;

// ========================================
// 全体ページ
// ========================================
const groupsJson = JSON.stringify(allGroups.map(g => ({
  slug: g.slug,
  magazineTitle: g.magazineTitle,
  year: g.year,
  issueNumber: g.issueNumber,
  coverIP: g.coverIP,
  eventTags: g.eventTagsArr,
  conds: conditionBreakdown(g.items),
  itemCount: g.itemCount,
  priceMedian: g.priceMedian,
  priceMin: g.priceMin,
  priceMax: g.priceMax,
  priceP90: g.priceP90,
  hasImage: g.items[0]?.thumbnailUrl ? true : false,
  heroThumb: g.items[0]?.thumbnailUrl || null,
})));

const totalItems = allGroups.reduce((s, g) => s + g.itemCount, 0);
const totalSold = allGroups.reduce((s, g) => s + g.items.filter(i => i.isSold).length, 0);
const maxMedianOverall = Math.max(...allGroups.map(g => g.priceMedian));

const indexHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>週刊誌相場 — みんなの週刊誌相場</title>
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
  .control-bar select { min-width: 180px; cursor: pointer; }
  .control-bar input[type="search"] { flex: 1; min-width: 180px; }
  .control-bar .count { margin-left: auto; font-size: 11px; color: var(--zinc-400); font-variant-numeric: tabular-nums; }
  /* グリッド */
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 640px)  { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 900px)  { .grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1100px) { .grid { grid-template-columns: repeat(5, 1fr); } }
  .card {
    background: #fff; border-radius: 12px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    display: flex; flex-direction: column;
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    border: 1px solid var(--zinc-200);
  }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); border-color: var(--indigo-300); }
  .card-visual {
    position: relative; aspect-ratio: 3/4;
    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .card-visual img { width: 100%; height: 100%; object-fit: cover; }
  .card-visual .no-img {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    color: var(--indigo-600);
  }
  .card-visual .no-img .yr { font-size: 28px; font-weight: 900; letter-spacing: -1px; }
  .card-visual .no-img .iss { font-size: 16px; font-weight: 700; }
  .card-visual .rank-badge {
    position: absolute; top: 6px; left: 6px;
    background: var(--indigo-500); color: #fff; font-size: 11px; font-weight: 700;
    padding: 3px 10px; border-radius: 14px; box-shadow: 0 2px 6px rgba(99,102,241,0.4);
    z-index: 2; letter-spacing: 0.5px;
  }
  .card-visual .rank-badge.top-3 { background: linear-gradient(135deg, var(--rose-500), var(--amber-500)); }
  .card-visual .mag-watermark {
    position: absolute; top: 6px; right: 6px;
    font-size: 10px; font-weight: 700; color: var(--zinc-700);
    background: rgba(255,255,255,0.92); padding: 2px 6px; border-radius: 4px;
    max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-visual .ev-strip {
    position: absolute; bottom: 0; left: 0; right: 0;
    display: flex; gap: 3px; padding: 5px 6px;
    background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
  }
  .card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .card-body .ip-line { font-size: 12px; font-weight: 700; color: var(--zinc-700); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-body .ip-line .no-ip { color: var(--zinc-400); font-weight: 500; font-style: italic; }
  .card-body .issue-line { font-size: 11px; color: var(--zinc-500); font-variant-numeric: tabular-nums; }
  .card-body .price-main { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; line-height: 1.1; margin-top: 2px; }
  .card-body .price-sub { font-size: 10px; color: var(--zinc-400); }
  .card-body .conds { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .card-body .cond-pill { font-size: 10px; padding: 1px 6px; }
  .card-body .cond-pill .n { font-size: 9px; }
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
  <div class="brand">週刊誌相場 <span class="beta">BETA</span></div>
  <div class="meta">scan <code>${scan.id.slice(0, 8)}</code> · ${escapeHtml(scan.createdAt || "")}</div>
</header>
<div class="sub-bar"><div class="inner">
  <strong>みんなの週刊誌相場</strong>
  ${magList.slice(0, 8).map(m => `<a href="#" class="mag-filter" data-mag="${escapeHtml(m.title)}">${escapeHtml(m.title)} <span style="color:var(--zinc-400)">(${m.groups.length})</span></a>`).join("")}
</div></div>
<main>
  <div class="summary">
    <div><div class="label">グループ数</div><div class="value">${allGroups.length.toLocaleString()}</div></div>
    <div><div class="label">出品総数</div><div class="value">${totalItems.toLocaleString()}</div></div>
    <div><div class="label">sold</div><div class="value">${totalSold.toLocaleString()}</div></div>
    <div><div class="label">最高中央値</div><div class="value" style="color:var(--rose-600)">${yen(maxMedianOverall)}</div></div>
  </div>

  <div class="control-bar">
    <label>並び替え</label>
    <select id="sortSelect">
      <option value="median">中央値（高い順）</option>
      <option value="max">最高値（高い順）</option>
      <option value="count">出品数（多い順）</option>
      <option value="year-asc">古い順</option>
      <option value="year-desc">新しい順</option>
    </select>
    <label>雑誌</label>
    <select id="magSelect">
      <option value="">すべて</option>
      ${magList.map(m => `<option value="${escapeHtml(m.title)}">${escapeHtml(m.title)}</option>`).join("")}
    </select>
    <label>イベント</label>
    <select id="eventSelect">
      <option value="">すべて</option>
      <option value="新連載">新連載</option>
      <option value="最終回">最終回</option>
      <option value="合併号">合併号 (issue)</option>
      <option value="表紙">表紙</option>
      <option value="巻頭カラー">巻頭カラー</option>
      <option value="センターカラー">センターカラー</option>
      <option value="読切">読切</option>
    </select>
    <input type="search" id="searchInput" placeholder="表紙作品名や号で絞り込み…">
    <span class="count" id="countLabel">${allGroups.length} groups</span>
  </div>

  <div class="grid" id="grid"></div>
</main>

<script>
const GROUPS = ${groupsJson};
const grid = document.getElementById("grid");
const sortSel = document.getElementById("sortSelect");
const magSel = document.getElementById("magSelect");
const evSel = document.getElementById("eventSelect");
const searchInput = document.getElementById("searchInput");
const countLabel = document.getElementById("countLabel");

const CONDITION_COLOR = ${JSON.stringify(CONDITION_COLOR)};
const EVENT_COLOR = {
  "新連載": "#dc2626","最終回": "#7c3aed","巻頭カラー": "#d97706",
  "センターカラー": "#f59e0b","読切": "#0284c7","表紙": "#0a7a3f"
};

function priceClass(p) {
  if (p >= 100000) return "p-premium";
  if (p >= 30000) return "p-highest";
  if (p >= 10000) return "p-high";
  if (p >= 3000) return "p-mid";
  return "p-low";
}
function yen(n) { return "¥" + Number(n).toLocaleString("ja-JP"); }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function render() {
  const sortKey = sortSel.value;
  const magFilter = magSel.value;
  const evFilter = evSel.value;
  const q = searchInput.value.trim().toLowerCase();

  let arr = GROUPS.filter(g => {
    if (magFilter && g.magazineTitle !== magFilter) return false;
    if (evFilter) {
      if (evFilter === "合併号") {
        if (!/合併/.test(g.issueNumber || "")) return false;
      } else {
        if (!(g.eventTags || []).includes(evFilter)) return false;
      }
    }
    if (q) {
      const hay = [g.coverIP, g.magazineTitle, String(g.year), g.issueNumber].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function issueSort(s) {
    if (!s) return 999;
    if (s === "創刊号") return 0;
    if (s === "新年特大号") return 1;
    if (s === "新春特大号") return 2;
    const merger = s.match(/(\\d+)\\s*[･・]\\s*(\\d+)\\s*合併号/);
    if (merger) return (parseInt(merger[1]) + parseInt(merger[2])) / 2;
    if (s === "合併号") return 998;
    if (/周年記念号?/.test(s)) return 997;
    const m = s.match(/^(\\d+)/);
    if (m) return parseInt(m[1], 10);
    return 999;
  }
  const timeKey = (g) => (g.year || 0) * 1000 + issueSort(g.issueNumber);

  if (sortKey === "median") arr.sort((a,b) => b.priceMedian - a.priceMedian);
  else if (sortKey === "max") arr.sort((a,b) => b.priceMax - a.priceMax);
  else if (sortKey === "count") arr.sort((a,b) => b.itemCount - a.itemCount);
  else if (sortKey === "year-asc") arr.sort((a,b) => timeKey(a) - timeKey(b));
  else if (sortKey === "year-desc") arr.sort((a,b) => timeKey(b) - timeKey(a));

  countLabel.textContent = arr.length + " groups";

  if (arr.length === 0) {
    grid.innerHTML = '<div class="empty">該当なし</div>';
    return;
  }

  grid.innerHTML = arr.map((g, i) => {
    const rankClass = i < 3 ? "top-3" : "";
    const visual = g.hasImage
      ? '<img src="' + escapeHtml(g.heroThumb) + '" alt="" loading="lazy">'
      : '<div class="no-img"><div class="yr">' + (g.year||"?") + '</div><div class="iss">' + escapeHtml(g.issueNumber||"") + '</div></div>';
    const events = (g.eventTags || []).map(t => '<span class="ev-badge" style="background:'+(EVENT_COLOR[t]||"#71717a")+'">'+escapeHtml(t)+'</span>').join("");
    const conds = (g.conds || []).map(c => '<span class="cond-pill" style="background:'+CONDITION_COLOR[c.c]+'">'+c.c+'<span class="n">'+c.n+'</span></span>').join("");
    return ''
      + '<a href="./' + g.slug + '.html" class="card">'
      + '  <div class="card-visual">'
      + '    <span class="rank-badge ' + rankClass + '">#' + (i+1) + '</span>'
      + '    <span class="mag-watermark">' + escapeHtml(g.magazineTitle) + '</span>'
      + visual
      + (events ? '<div class="ev-strip">' + events + '</div>' : '')
      + '  </div>'
      + '  <div class="card-body">'
      + '    <div class="ip-line">' + (g.coverIP ? escapeHtml(g.coverIP) : '<span class="no-ip">作品未特定</span>') + '</div>'
      + '    <div class="issue-line">' + (g.year||"?") + '年 ' + escapeHtml(g.issueNumber||"-") + '</div>'
      + '    <div class="price-main ' + priceClass(g.priceMedian) + '">' + yen(g.priceMedian) + '</div>'
      + '    <div class="price-sub">最高 ' + yen(g.priceMax) + '</div>'
      + '    <div class="conds">' + conds + '</div>'
      + '    <div class="card-stats">'
      + '      <div class="row"><span>出品</span><span class="v">' + g.itemCount + '</span></div>'
      + '      <div class="row"><span>p90</span><span class="v">' + yen(g.priceP90||0) + '</span></div>'
      + '    </div>'
      + '  </div>'
      + '</a>';
  }).join("");
}

sortSel.addEventListener("change", render);
magSel.addEventListener("change", render);
evSel.addEventListener("change", render);
searchInput.addEventListener("input", render);
document.querySelectorAll(".mag-filter").forEach(a => {
  a.addEventListener("click", e => {
    e.preventDefault();
    magSel.value = a.dataset.mag;
    render();
    window.scrollTo({top: 0, behavior: "smooth"});
  });
});
render();
</script>
</body>
</html>`;

// ========================================
// グループ詳細ページ
// ========================================
function buildGroupHtml(g, rankIndex) {
  const itemsSorted = [...g.items].sort((a, b) => b.price - a.price);
  const soldCount = g.items.filter(i => i.isSold).length;
  const tradingCount = g.items.length - soldCount;
  const conds = conditionBreakdown(g.items);
  const eventBadges = g.eventTagsArr.map(eventTagBadge).join(" ");
  const condPills = conds.map(c =>
    `<span class="cond-pill" style="background:${CONDITION_COLOR[c.c]}">${CONDITION_LABEL[c.c] || c.c}<span class="n">${c.n}</span></span>`
  ).join(" ");

  const title = `${g.magazineTitle} ${g.year}年 ${g.issueNumber}号` + (g.coverIP ? ` ${g.coverIP}` : "");
  const searchKW = `${g.magazineTitle} ${g.year}年 ${g.issueNumber}号` + (g.coverIP ? ` ${g.coverIP}` : "");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | 週刊誌相場</title>
<style>
${COMMON_CSS}
  main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; display: grid; gap: 16px; }
  .hero {
    background: linear-gradient(135deg, var(--indigo-600), var(--indigo-700));
    color: #fff; border-radius: 14px; padding: 18px 22px;
    display: flex; gap: 22px; align-items: center; box-shadow: 0 4px 20px rgba(99,102,241,0.2);
  }
  .hero .id-block { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .hero .breadcrumb { font-size: 11px; opacity: 0.8; letter-spacing: 0.5px; }
  .hero .title { font-size: 28px; font-weight: 900; line-height: 1.15; letter-spacing: -0.5px; }
  .hero .subtitle { font-size: 14px; opacity: 0.9; }
  .hero .ev-list { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
  .hero .price-block { text-align: right; }
  .hero .price-block .lbl { font-size: 11px; opacity: 0.7; }
  .hero .price-block .val { font-size: 36px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
  .hero .price-block .max { font-size: 14px; opacity: 0.9; margin-top: 4px; }
  /* 統計 */
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .stats-row > div { background: #fff; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .stats-row .l { font-size: 10px; color: var(--zinc-400); letter-spacing: 0.5px; }
  .stats-row .v { font-size: 20px; font-weight: 800; margin-top: 2px; font-variant-numeric: tabular-nums; }
  /* コンディション・タグ集 */
  .meta-strip { background: #fff; border-radius: 10px; padding: 14px 16px; display: flex; gap: 18px; flex-wrap: wrap; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
  .meta-strip .group-label { font-size: 11px; color: var(--zinc-500); font-weight: 700; letter-spacing: 0.5px; min-width: 80px; }
  .meta-strip .items { display: flex; gap: 4px; flex-wrap: wrap; }
  /* 出品一覧 */
  .items-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 700px) { .items-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1000px) { .items-grid { grid-template-columns: repeat(4, 1fr); } }
  .item-card {
    background: #fff; border-radius: 10px; overflow: hidden;
    border: 1px solid var(--zinc-200);
    display: flex; flex-direction: column;
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  }
  .item-card:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,0.07); border-color: var(--indigo-300); }
  .item-thumb {
    aspect-ratio: 1/1; position: relative;
    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    overflow: hidden; display: flex; align-items: center; justify-content: center;
  }
  .item-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .item-thumb .no-thumb { font-size: 36px; color: var(--indigo-300); }
  .item-thumb .status-pill {
    position: absolute; top: 6px; right: 6px;
    background: rgba(255,255,255,0.95); color: var(--zinc-700);
    font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  }
  .item-thumb .status-pill.sold { background: var(--rose-500); color: #fff; }
  .item-thumb .cond-corner {
    position: absolute; top: 6px; left: 6px;
    font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
    background: rgba(0,0,0,0.6); color: #fff;
  }
  .item-body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
  .item-body .name { font-size: 11px; color: var(--zinc-600); line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .item-body .price { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .item-body .date { font-size: 10px; color: var(--zinc-400); margin-top: auto; padding-top: 4px; }
  /* リンク群 */
  .ext-links { display: flex; gap: 8px; flex-wrap: wrap; }
  .ext-links a {
    background: #fff; color: var(--indigo-600); border: 1px solid var(--zinc-200);
    border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600;
  }
  .ext-links a:hover { border-color: var(--indigo-300); background: var(--indigo-50); }
  .nav-bar { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }
  .nav-btn {
    background: #fff; color: var(--indigo-600); border: 1px solid var(--zinc-200);
    border-radius: 8px; padding: 8px 14px; font-size: 13px;
  }
  .nav-btn:hover { border-color: var(--indigo-300); background: var(--indigo-50); }
</style>
</head>
<body>
<header class="site-header">
  <div class="brand">週刊誌相場 <span class="beta">BETA</span></div>
  <div class="meta">scan <code>${scan.id.slice(0, 8)}</code></div>
</header>
<div class="sub-bar"><div class="inner">
  <a href="./index.html">← 全グループ一覧</a>
  <span style="color:var(--zinc-400)">/</span>
  <span style="color:var(--zinc-600)">${escapeHtml(g.magazineTitle)} ${g.year}年</span>
</div></div>

<main>
  <div class="hero">
    <div class="id-block">
      <div class="breadcrumb">#${rankIndex + 1} · 中央値ランキング</div>
      <div class="title">${escapeHtml(g.coverIP || "作品未特定")}</div>
      <div class="subtitle">${escapeHtml(g.magazineTitle)} ${g.year}年 ${escapeHtml(g.issueNumber || "-")}号</div>
      <div class="ev-list">${eventBadges}</div>
    </div>
    <div class="price-block">
      <div class="lbl">中央値</div>
      <div class="val">${yen(g.priceMedian)}</div>
      <div class="max">最高 ${yen(g.priceMax)} / 最低 ${yen(g.priceMin)}</div>
    </div>
  </div>

  <div class="stats-row">
    <div><div class="l">出品総数</div><div class="v">${g.itemCount}</div></div>
    <div><div class="l">SOLD</div><div class="v" style="color:var(--rose-500)">${soldCount}</div></div>
    <div><div class="l">取引中</div><div class="v">${tradingCount}</div></div>
    <div><div class="l">p90</div><div class="v">${yen(g.priceP90 || 0)}</div></div>
  </div>

  <div class="meta-strip">
    <span class="group-label">コンディション</span>
    <span class="items">${condPills || '<span style="color:var(--zinc-400);font-size:12px">情報なし</span>'}</span>
  </div>

  <div class="section">
    <div class="section-head"><h2>出品一覧（価格降順 ${g.items.length}件）</h2></div>
    <div class="section-body">
      <div class="items-grid">
        ${itemsSorted.map(it => {
          const thumb = it.thumbnailUrl
            ? `<img src="${escapeHtml(it.thumbnailUrl)}" alt="" loading="lazy">`
            : `<div class="no-thumb">📰</div>`;
          const status = it.isSold
            ? `<span class="status-pill sold">SOLD</span>`
            : `<span class="status-pill">取引中</span>`;
          const condBg = CONDITION_COLOR[it.condition] || "#71717a";
          const condLabel = it.gradeRank || it.condition || "B";
          return `
          <a href="${escapeHtml(mercariItemUrl(it.url))}" target="_blank" rel="noopener" class="item-card">
            <div class="item-thumb">
              ${thumb}
              ${status}
              <span class="cond-corner" style="background:${condBg}">${escapeHtml(condLabel)}</span>
            </div>
            <div class="item-body">
              <div class="name">${escapeHtml(it.rawName)}</div>
              <div class="price ${priceColorClass(it.price)}">${yen(it.price)}</div>
              <div class="date">${escapeHtml(it.soldDate || "")}</div>
            </div>
          </a>`;
        }).join("")}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>他サイトで探す</h2></div>
    <div class="section-body">
      <div class="ext-links">
        <a href="${mercariSearchUrl(searchKW)}" target="_blank" rel="noopener">メルカリで検索</a>
        <a href="https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(searchKW)}" target="_blank" rel="noopener">ヤフオク</a>
        <a href="https://paypayfleamarket.yahoo.co.jp/search/${encodeURIComponent(searchKW)}" target="_blank" rel="noopener">PayPayフリマ</a>
        <a href="https://www.suruga-ya.jp/search?search_word=${encodeURIComponent(searchKW)}" target="_blank" rel="noopener">駿河屋</a>
        <a href="https://order.mandarake.co.jp/order/listPage/list?keyword=${encodeURIComponent(searchKW)}" target="_blank" rel="noopener">まんだらけ</a>
      </div>
    </div>
  </div>

  <div class="nav-bar">
    <a href="./index.html" class="nav-btn">← 全グループ一覧</a>
    ${rankIndex + 1 < allGroups.length ? `<a href="./${allGroups[rankIndex + 1].slug}.html" class="nav-btn">次のグループ →</a>` : ""}
  </div>
</main>
</body>
</html>`;
}

// ========================================
// 出力
// ========================================
const outDir = path.join(PROJECT_ROOT, "scripts", "output", "weekly-magazine");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, "index.html"), indexHtml);
console.log(`✓ index.html`);

for (let i = 0; i < allGroups.length; i++) {
  const g = allGroups[i];
  fs.writeFileSync(path.join(outDir, `${g.slug}.html`), buildGroupHtml(g, i));
}
console.log(`✓ ${allGroups.length}個のグループページ`);

const indexPath = path.join(outDir, "index.html");
console.log(`\n出力先: ${outDir}`);
console.log(`開く: file:///${indexPath.replace(/\\/g, "/")}`);

if (shouldOpen) {
  try {
    execSync(`start "" "${indexPath}"`, { shell: "cmd.exe" });
    console.log("→ ブラウザを起動");
  } catch (e) {
    console.error("ブラウザ起動失敗:", e.message);
  }
}
