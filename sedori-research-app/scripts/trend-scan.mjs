/**
 * アニメグッズ相場トレンドスキャン（スタンドアロン版）
 *
 * Claude Codeスキル `/anime-trend` から呼ばれる。
 * アニメイトタイムズから今期アニメ一覧を取得し、
 * メルカリsoldの価格トレンドを分析してDBに保存する。
 *
 * 使い方:
 *   node scripts/trend-scan.mjs [オプション]
 *
 * オプション:
 *   --ips "作品1,作品2"    追加でチェックするIP（カンマ区切り）
 *   --goods "フィギュア,DX" グッズ種別を絞る（デフォルト: 全種）
 *   --min-change 10        最低上昇率%（デフォルト: 10）
 *   --skip-seasonal        今期アニメ一覧の取得をスキップ
 *   --skip-news            ニュース取得をスキップ
 *   --json                 結果をJSON形式で標準出力
 *   --notify               Discord通知を送信
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// better-sqlite3で直接DB操作
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

// generate-mercari-jwt
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

// ========================================
// CLI引数パース
// ========================================
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const customIPs = (getArg("--ips") || "").split(",").map(s => s.trim()).filter(Boolean);
const goodsFilter = (getArg("--goods") || "").split(",").map(s => s.trim()).filter(Boolean);
const minChange = parseInt(getArg("--min-change") || "10", 10);
const skipSeasonal = hasFlag("--skip-seasonal");
const skipNews = hasFlag("--skip-news");
const jsonOutput = hasFlag("--json");
const notify = hasFlag("--notify");

const ALL_GOODS = ["フィギュア", "一番くじ", "DX", "プラモデル", "ぬいぐるみ", "缶バッジ", "アクリルスタンド", "アクスタ"];
const activeGoods = goodsFilter.length > 0 ? goodsFilter : ALL_GOODS;

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1471121436130279475/b3DGIXUKz7WRYT4oIlzuz8Qi9K8XYeW_6F0uAsWKzETlrgsFZrRMNpkr3G0xxypM7b6z";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "ja,en;q=0.9",
};

// ========================================
// DB初期化（テーブルがなければ作成）
// ========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS AnimeNews (
    id TEXT PRIMARY KEY,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    ipTitle TEXT NOT NULL,
    newsType TEXT NOT NULL,
    publishedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_animeNews_ipTitle ON AnimeNews(ipTitle);
  CREATE INDEX IF NOT EXISTS idx_animeNews_newsType ON AnimeNews(newsType);

  CREATE TABLE IF NOT EXISTS TrendScan (
    id TEXT PRIMARY KEY,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'running',
    newsCount INTEGER DEFAULT 0,
    hitCount INTEGER DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS TrendResult (
    id TEXT PRIMARY KEY,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    scanId TEXT NOT NULL,
    newsId TEXT,
    keyword TEXT NOT NULL,
    goodsType TEXT NOT NULL,
    ipTitle TEXT NOT NULL,
    recentMedian INTEGER NOT NULL,
    olderMedian INTEGER NOT NULL,
    changePercent REAL NOT NULL,
    recentCount INTEGER NOT NULL,
    olderCount INTEGER NOT NULL,
    recentItems TEXT NOT NULL,
    olderItems TEXT NOT NULL,
    FOREIGN KEY (scanId) REFERENCES TrendScan(id),
    FOREIGN KEY (newsId) REFERENCES AnimeNews(id)
  );
  CREATE INDEX IF NOT EXISTS idx_trendResult_scanId ON TrendResult(scanId);
  CREATE INDEX IF NOT EXISTS idx_trendResult_ipTitle ON TrendResult(ipTitle);
  CREATE INDEX IF NOT EXISTS idx_trendResult_changePercent ON TrendResult(changePercent);
`);

// ========================================
// DB操作
// ========================================
function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

function createScan() {
  const id = generateId();
  db.prepare("INSERT INTO TrendScan (id, createdAt, status, newsCount, hitCount) VALUES (?, datetime('now'), 'running', 0, 0)").run(id);
  return id;
}

function updateScan(id, data) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(data)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  db.prepare(`UPDATE TrendScan SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

function upsertNews(news) {
  const existing = db.prepare("SELECT id FROM AnimeNews WHERE url = ?").get(news.url);
  if (existing) return existing.id;
  const id = generateId();
  db.prepare("INSERT INTO AnimeNews (id, createdAt, title, url, source, ipTitle, newsType, publishedAt) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)").run(id, news.title, news.url, news.source, news.ipTitle, news.newsType, news.publishedAt);
  return id;
}

function insertResult(data) {
  const id = generateId();
  db.prepare(`INSERT INTO TrendResult (id, createdAt, scanId, newsId, keyword, goodsType, ipTitle, recentMedian, olderMedian, changePercent, recentCount, olderCount, recentItems, olderItems) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.scanId, data.newsId, data.keyword, data.goodsType, data.ipTitle, data.recentMedian, data.olderMedian, data.changePercent, data.recentCount, data.olderCount, data.recentItems, data.olderItems);
  return id;
}

function findRelatedNews(ipTitle) {
  return db.prepare("SELECT id, title, url, newsType FROM AnimeNews WHERE ipTitle LIKE ? ORDER BY createdAt DESC LIMIT 1").get(`%${ipTitle}%`);
}

// ========================================
// アニメイトタイムズ スクレイピング
// ========================================
function getCurrentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return "冬";
  if (m <= 6) return "春";
  if (m <= 9) return "夏";
  return "秋";
}

function isRebroadcast(title) {
  return /再放送|再編集|一挙放送|セレクション|傑作選/.test(title);
}

function cleanIpTitle(title) {
  return title
    .replace(/\s*[（(].*?[）)]$/g, "")
    .replace(/\s*第?\d+期$/g, "")
    .replace(/\s*Season\s*\d+$/i, "")
    .replace(/\s*シーズン\s*\d+$/g, "")
    .trim();
}

async function scrapeSeasonalAnime() {
  const results = [];
  const season = `${new Date().getFullYear()}${getCurrentSeason()}`;

  // まず /anime/ から季節ページURLを探す
  let pageUrls = [];
  try {
    const res = await fetch("https://www.animatetimes.com/anime/", { headers: FETCH_HEADERS });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const currentSeason = getCurrentSeason();
      $("a[href*='tag/details.php']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text();
        if (text.includes(`${currentSeason}アニメ`)) {
          const fullUrl = href.startsWith("http") ? href : `https://www.animatetimes.com${href}`;
          if (!pageUrls.includes(fullUrl)) pageUrls.push(fullUrl);
        }
      });
    }
  } catch (e) {
    log(`⚠ /anime/ ページ取得失敗: ${e.message}`);
  }

  // フォールバック
  if (pageUrls.length === 0) {
    const fallbackIds = { "春": 5228, "夏": 5806, "秋": 5947, "冬": 6212 };
    const id = fallbackIds[getCurrentSeason()];
    if (id) pageUrls.push(`https://www.animatetimes.com/tag/details.php?id=${id}`);
  }

  for (const url of pageUrls) {
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $("h2 a[href*='tag/details'], h3 a[href*='tag/details']").each((_, el) => {
        const title = $(el).text().trim();
        if (!title || title.length < 2 || isRebroadcast(title)) return;
        if (results.some(r => r.title === title)) return;
        results.push({ title, season });
      });
    } catch (e) {
      log(`⚠ 季節ページ取得失敗: ${e.message}`);
    }
  }
  return results;
}

const NEWS_TYPE_KW = {
  movie: ["映画化", "劇場版", "映画", "劇場アニメ"],
  season: ["第2期", "第3期", "第4期", "2期", "3期", "新シーズン", "続編"],
  remake: ["リメイク", "リブート", "新作アニメ化"],
  anime: ["アニメ化", "TVアニメ", "テレビアニメ", "アニメ化決定", "放送開始", "放送決定"],
  game: ["ゲーム化", "新作ゲーム"],
};

function detectNewsType(title) {
  for (const [type, kws] of Object.entries(NEWS_TYPE_KW)) {
    if (kws.some(kw => title.includes(kw))) return type;
  }
  return "other";
}

function extractIpTitle(newsTitle) {
  const m = newsTitle.match(/[「『](.*?)[」』]/);
  if (m) return m[1];
  const m2 = newsTitle.match(/(?:TVアニメ|アニメ|映画|劇場版)\s*[『「]?([\w\s\u3000-\u9FFF]+)/);
  if (m2) return m2[1].trim();
  return newsTitle.slice(0, 30);
}

async function scrapeNews() {
  const results = [];
  const urls = [
    "https://www.animatetimes.com/news/",
    "https://www.animatetimes.com/news/tag.php?tag=anime",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $("article, .news-item, .article-list li, .c-news_item, a[href*='/news/details/']").each((_, el) => {
        const $el = $(el);
        const linkEl = $el.is("a") ? $el : $el.find("a").first();
        const href = linkEl.attr("href");
        const title = linkEl.text().trim() || $el.find(".title, h2, h3").text().trim();
        if (!href || !title) return;
        const fullUrl = href.startsWith("http") ? href : `https://www.animatetimes.com${href}`;
        const newsType = detectNewsType(title);
        if (newsType === "other") return;
        if (results.some(r => r.url === fullUrl)) return;
        results.push({
          title, url: fullUrl, source: "animatetimes",
          ipTitle: extractIpTitle(title), newsType,
          publishedAt: new Date().toISOString().split("T")[0],
        });
      });
    } catch (e) {
      log(`⚠ ニュース取得失敗: ${e.message}`);
    }
  }
  return results;
}

// ========================================
// メルカリ sold 検索
// ========================================
const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchMercariSold(keyword, limit = 120) {
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
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map(item => ({
      name: item.name,
      price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
      date: new Date(item.updated * 1000).toISOString().split("T")[0],
      url: `https://jp.mercari.com/item/${item.id}`,
    }));
  } catch (e) {
    log(`⚠ メルカリ検索失敗 "${keyword}": ${e.message}`);
    return [];
  }
}

// ========================================
// トレンド分析
// ========================================
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// 商品名にIPタイトルが含まれるかチェック（説明文ヒットの混入を排除）
function nameContainsIP(itemName, ipTitle) {
  const normalized = itemName.toLowerCase();
  const ipLower = ipTitle.toLowerCase();
  // そのまま含まれるか
  if (normalized.includes(ipLower)) return true;
  // スペース除去でも試す（「ドロ ヘドロ」等の表記揺れ対策）
  if (normalized.replace(/\s/g, "").includes(ipLower.replace(/\s/g, ""))) return true;
  return false;
}

// 外れ値を除外（中央値の3倍以上 or 1/3以下を弾く）
function removeOutliers(items) {
  if (items.length < 3) return items;
  const prices = items.map(i => i.price);
  const med = median(prices);
  if (med === 0) return items;
  return items.filter(i => i.price >= med / 3 && i.price <= med * 3);
}

const MIN_SAMPLES_PER_PERIOD = 5; // 各期間の最低サンプル数

// 商品名からIPタイトルとグッズ種別を除去して、商品の固有名部分を抽出
function extractProductKey(itemName, ipTitle, goodsType) {
  let key = itemName;
  // IP名を除去
  key = key.replace(new RegExp(ipTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  // グッズ種別を除去
  key = key.replace(new RegExp(goodsType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  // 共通ノイズワードを除去
  key = key.replace(/【.*?】/g, '').replace(/\(.*?\)/g, '').replace(/（.*?）/g, '');
  key = key.replace(/(新品|未開封|中古|美品|訳あり|ジャンク|セット|まとめ|おまけ|送料無料)/gi, '');
  // 余分な記号・スペースを正規化
  key = key.replace(/[　\s・/／＆&]+/g, ' ').replace(/[^\w\u3000-\u9FFF\uFF00-\uFFEF ]/g, '').trim();
  // 短すぎたら元の名前を使う
  return key.length >= 3 ? key : itemName.slice(0, 40);
}

// 類似キーを統合（先頭15文字で切る → 「プレミアムカイマンプライズ」も「プレミアムカイマン」も同じに）
function normalizeProductKey(key) {
  return key.replace(/\s+/g, '').slice(0, 15);
}

// 商品グルーピング: 似た商品名をまとめて、商品単位の価格変動を出す
function groupByProduct(recentItems, olderItems, ipTitle, goodsType) {
  const groups = new Map(); // normalizedKey → { name, recent: [price], older: [price], recentItems, olderItems }

  function addToGroup(item, period) {
    const rawKey = extractProductKey(item.name, ipTitle, goodsType);
    const normKey = normalizeProductKey(rawKey);

    if (!groups.has(normKey)) {
      groups.set(normKey, {
        name: item.name.slice(0, 60), // 代表名（最初にヒットした商品名）
        recent: [], older: [],
        recentItems: [], olderItems: [],
      });
    }
    const g = groups.get(normKey);
    if (period === 'recent') {
      g.recent.push(item.price);
      g.recentItems.push(item);
    } else {
      g.older.push(item.price);
      g.olderItems.push(item);
    }
  }

  for (const item of recentItems) addToGroup(item, 'recent');
  for (const item of olderItems) addToGroup(item, 'older');

  // 両期間にデータがあるグループのみ、変動率を計算
  const results = [];
  for (const [, g] of groups) {
    if (g.recent.length >= 1 && g.older.length >= 1) {
      const recentMed = median(g.recent);
      const olderMed = median(g.older);
      if (olderMed > 0) {
        const change = Math.round(((recentMed - olderMed) / olderMed) * 1000) / 10;
        results.push({
          productName: g.name,
          recentMedian: recentMed,
          olderMedian: olderMed,
          changePercent: change,
          recentCount: g.recent.length,
          olderCount: g.older.length,
          recentItems: g.recentItems,
          olderItems: g.olderItems,
        });
      }
    }
  }

  return results.sort((a, b) => b.changePercent - a.changePercent);
}

async function analyzeTrend(keyword, goodsType, ipTitle) {
  const rawItems = await searchMercariSold(keyword);
  if (rawItems.length < 5) return null;

  // 1. 商品��にIPタイトルとグッズ種別の両方が含まれるもののみ
  const items = rawItems.filter(item => {
    if (!nameContainsIP(item.name, ipTitle)) return false;
    // グッズ種別も商品名に含まれるかチェック（「アクスタ」→「アクリルスタンド」等の表記揺れ対応）
    const name = item.name.toLowerCase();
    const goodsAliases = {
      "フィギュア": ["フィギュア", "figure"],
      "一番くじ": ["一番くじ", "ichiban"],
      "DX": ["dx", "ＤＸ"],
      "プラモデル": ["プラモデル", "プラモ", "ガンプラ"],
      "ぬいぐるみ": ["ぬいぐるみ", "���い"],
      "缶バッジ": ["缶バッジ", "缶バッチ", "バッジ", "バッチ"],
      "アクリルスタンド": ["アクリルスタンド", "アクスタ", "アクリル"],
      "アクスタ": ["アクスタ", "ア���リルスタン���", "アクリル"],
    };
    const aliases = goodsAliases[goodsType] || [goodsType.toLowerCase()];
    return aliases.some(a => name.includes(a));
  });
  if (items.length < 5) return null;

  // 2. 期間分割
  const now = Date.now();
  let recent = [], older = [];
  for (const item of items) {
    const d = new Date(item.date).getTime();
    if (d >= now - 7 * 86400000) recent.push(item);
    else if (d >= now - 37 * 86400000) older.push(item);
  }

  // 3. 外れ値除外
  recent = removeOutliers(recent);
  older = removeOutliers(older);

  // 4. 最低サンプル数チェック
  if (recent.length < MIN_SAMPLES_PER_PERIOD || older.length < MIN_SAMPLES_PER_PERIOD) return null;

  const recentMed = median(recent.map(i => i.price));
  const olderMed = median(older.map(i => i.price));
  if (olderMed === 0) return null;

  const changePercent = Math.round(((recentMed - olderMed) / olderMed) * 1000) / 10;

  // 5. 商品グルーピング（具体的にどの商品が上がってるか）
  const productGroups = groupByProduct(recent, older, ipTitle, goodsType);

  return {
    keyword, goodsType, ipTitle,
    recentMedian: recentMed, olderMedian: olderMed, changePercent,
    recentCount: recent.length, olderCount: older.length,
    recentItems: recent, olderItems: older,
    products: productGroups, // 商品単位の内訳
  };
}

// ========================================
// メイン
// ========================================
function log(msg) {
  if (!jsonOutput) console.log(msg);
}

async function main() {
  log("=== アニメグッズ相場トレンドスキャン ===");
  log(`グッズ種別: ${activeGoods.join(", ")}`);
  log(`最低上昇率: ${minChange}%`);

  const scanId = createScan();

  // 1. チェック対象IP収集
  const ipSet = new Map(); // ip → { source, originalTitle }

  if (!skipSeasonal) {
    log("\n📺 今期アニメ一覧を取得中...");
    const seasonal = await scrapeSeasonalAnime();
    log(`  → ${seasonal.length}作品`);
    for (const a of seasonal) {
      const ip = cleanIpTitle(a.title);
      if (ip && !ipSet.has(ip)) ipSet.set(ip, { source: `今期アニメ(${a.season})`, originalTitle: a.title });
    }
  }

  let newsCount = 0;
  if (!skipNews) {
    log("\n📰 アニメニュースを取得中...");
    const news = await scrapeNews();
    newsCount = news.length;
    log(`  → ${news.length}件`);
    for (const n of news) {
      upsertNews(n);
      const ip = cleanIpTitle(n.ipTitle);
      if (ip && !ipSet.has(ip)) ipSet.set(ip, { source: `ニュース: ${n.newsType}`, originalTitle: n.ipTitle });
    }
  }

  for (const ip of customIPs) {
    if (!ipSet.has(ip)) ipSet.set(ip, { source: "手動追加", originalTitle: ip });
  }

  const allIPs = Array.from(ipSet.entries());
  log(`\n🎯 チェック対象: ${allIPs.length}作品`);
  for (const [ip, info] of allIPs) log(`  - ${info.originalTitle} (${info.source})`);

  // 2. メルカリトレンドスキャン
  log("\n🔍 メルカリsold検索開始...");
  const allResults = [];
  const total = allIPs.length * activeGoods.length;
  let current = 0;

  for (const [ip, ipInfo] of allIPs) {
    for (const goods of activeGoods) {
      current++;
      const keyword = `${ip} ${goods}`;
      log(`  [${current}/${total}] ${keyword}`);

      const result = await analyzeTrend(keyword, goods, ip);
      if (result && result.changePercent >= minChange) {
        result.originalTitle = ipInfo.originalTitle;
        allResults.push(result);
        log(`    → 🔥 +${result.changePercent}% (¥${result.olderMedian} → ¥${result.recentMedian})`);
      } else if (result) {
        log(`    → ${result.changePercent > 0 ? "+" : ""}${result.changePercent}%`);
      } else {
        log(`    → データ不足`);
      }

      // メルカリAPI負荷軽減
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 上昇率順ソート
  allResults.sort((a, b) => b.changePercent - a.changePercent);

  // 3. DB保存
  for (const r of allResults) {
    const news = findRelatedNews(r.ipTitle);
    insertResult({
      scanId,
      newsId: news?.id || null,
      keyword: r.keyword,
      goodsType: r.goodsType,
      ipTitle: r.ipTitle,
      recentMedian: r.recentMedian,
      olderMedian: r.olderMedian,
      changePercent: r.changePercent,
      recentCount: r.recentCount,
      olderCount: r.olderCount,
      recentItems: JSON.stringify(r.recentItems),
      olderItems: JSON.stringify(r.products || []), // 商品グループを保存（Web表示用）
    });
  }

  updateScan(scanId, { status: "completed", newsCount, hitCount: allResults.length });

  // 4. 結果出力
  if (jsonOutput) {
    console.log(JSON.stringify({ scanId, results: allResults }, null, 2));
  } else {
    log("\n" + "=".repeat(50));
    log(`✅ スキャン完了 (ID: ${scanId})`);
    log(`検知: ${allResults.length}件\n`);

    if (allResults.length > 0) {
      for (const r of allResults) {
        const arrow = r.changePercent >= 30 ? "🔥" : r.changePercent >= 15 ? "📈" : "↗️";
        const news = findRelatedNews(r.ipTitle);
        const title = r.originalTitle && r.originalTitle !== r.ipTitle ? `${r.originalTitle}` : r.ipTitle;
        log(`${arrow} ${title} [${r.goodsType}] +${r.changePercent}%`);
        log(`  全体: ¥${r.olderMedian.toLocaleString()} → ¥${r.recentMedian.toLocaleString()} (過去${r.olderCount}件→直近${r.recentCount}件)`);
        if (news) log(`  📰 ${news.title}`);

        // 直近sold商品（高額順に5件）
        if (r.recentItems && r.recentItems.length > 0) {
          const sorted = [...r.recentItems].sort((a, b) => b.price - a.price).slice(0, 5);
          log(`  直近sold:`);
          for (const item of sorted) {
            log(`    ¥${item.price.toLocaleString().padStart(7)} ${item.date} ${item.name.slice(0, 50)}`);
          }
        }
        log("");
      }
    } else {
      log("上昇トレンドは検知されませんでした。");
    }

    log(`👀 Webで確認: http://localhost:3000/trend`);
  }

  // 5. Discord通知
  if (notify && allResults.length > 0) {
    await sendDiscord(allResults);
  }

  db.close();
}

async function sendDiscord(results) {
  const top = results.slice(0, 10);
  const desc = top.map((r, i) => {
    const arrow = r.changePercent >= 30 ? "🔥" : r.changePercent >= 15 ? "📈" : "↗️";
    return `${i + 1}. ${arrow} **${r.ipTitle}** ${r.goodsType} — **+${r.changePercent}%**\n　¥${r.olderMedian.toLocaleString()} → ¥${r.recentMedian.toLocaleString()}`;
  }).join("\n\n");

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `📊 アニメグッズ相場トレンド（${results.length}件検知）`,
          description: desc + (results.length > 10 ? `\n\n...他${results.length - 10}件` : ""),
          color: 0xff4444,
        }],
      }),
    });
    log("📣 Discord通知送信完了");
  } catch (e) {
    log(`⚠ Discord通知失敗: ${e.message}`);
  }
}

main().catch(e => {
  console.error("致命的エラー:", e);
  db.close();
  process.exit(1);
});
