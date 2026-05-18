/**
 * グッズカタログ収集
 *
 * 2つのモード:
 *   1. アカウントモード: Xのグッズアカウントから商品投稿を収集 → メルカリsold追跡
 *   2. ディスカバーモード: 公式アニメアカウントを巡回 → イベント告知から
 *      専用アカウント（原画展、ポップアップ等）を自動発見 → そのアカウントのグッズを収集
 *
 * ※ x-post-assistantと同じChromeプロファイルを使う（ログイン済み）
 * ※ 実行前にChromeを閉じること
 *
 * 使い方:
 *   # アカウントモード（特定のグッズアカウントを直接指定）
 *   node scripts/goods-catalog.mjs --account "dandadan_goods" --ip "ダンダダン" --count 30
 *
 *   # ディスカバーモード（公式アカウントからイベント専用アカウントを自動発見）
 *   node scripts/goods-catalog.mjs --discover "dandadan_anime" --ip "ダンダダン"
 *
 *   # ウォッチリスト（goods-watchlist.jsonに定義した公式アカウントを一括処理）
 *   node scripts/goods-catalog.mjs --watchlist
 *
 *   # 共通オプション
 *   --skip-mercari   メルカリ検索をスキップ（アカウント発見・商品名抽出のみ）
 *   --count N        投稿取得件数（デフォルト: 30）
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

// ========================================
// CLI引数
// ========================================
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const xAccount = getArg("--account");
const discoverAccount = getArg("--discover");
const watchlistMode = hasFlag("--watchlist");
const ipTitle = getArg("--ip") || "";
const postCount = parseInt(getArg("--count") || "30", 10);
const skipMercari = hasFlag("--skip-mercari");

if (!xAccount && !discoverAccount && !watchlistMode) {
  console.error(`使い方:
  # アカウントモード（グッズアカウントを直接指定）
  node scripts/goods-catalog.mjs --account "dandadan_goods" [--ip "ダンダダン"] [--count 30] [--skip-mercari]

  # ディスカバーモード（公式アカウントからイベントアカウントを自動発見）
  node scripts/goods-catalog.mjs --discover "dandadan_anime" --ip "ダンダダン" [--skip-mercari]

  # ウォッチリストモード（一括処理）
  node scripts/goods-catalog.mjs --watchlist [--skip-mercari]`);
  process.exit(1);
}

// ========================================
// ユーティリティ
// ========================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ========================================
// Chrome起動（x-post-assistantと同じ方式）
// ========================================
const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCRAPER_PROFILE = path.resolve(__dirname, "..", "..", "x-post-assistant", ".scraper-chrome-profile");
const DEBUG_PORT = 9222;

async function killScraperChrome() {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (res.ok) {
      try {
        const out = execSync(`netstat -ano | findstr :${DEBUG_PORT} | findstr LISTENING`, { encoding: "utf-8" });
        const match = out.match(/LISTENING\s+(\d+)/);
        if (match) {
          execSync(`taskkill /F /PID ${match[1]} /T`, { stdio: "ignore" });
          await sleep(2000);
        }
      } catch {}
    }
  } catch {}
}

async function waitForDebugPort(maxWait = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return true; } catch {}
    await sleep(500);
  }
  return false;
}

async function launchChrome() {
  await killScraperChrome();

  if (!fs.existsSync(SCRAPER_PROFILE)) {
    console.error(`Chromeプロファイルが見つかりません: ${SCRAPER_PROFILE}`);
    console.error("先に x-post-assistant/scripts/scrape-x.ts を一度実行してXにログインしてください。");
    process.exit(1);
  }

  console.log("Chrome起動中...");
  const chrome = spawn(CHROME_EXE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${SCRAPER_PROFILE}`,
    "--no-first-run", "--no-default-browser-check", "--lang=ja",
    "--window-position=-32000,-32000", "--window-size=1280,900",
    "about:blank",
  ], { detached: true, stdio: "ignore" });
  chrome.unref();

  if (!(await waitForDebugPort())) {
    console.error("Chrome起動失敗");
    process.exit(1);
  }
  console.log("Chrome起動完了\n");

  return puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 1280, height: 900 },
  });
}

// ========================================
// ツイート収集スクリプト（ページ内で実行）
// @メンションとリンクURLも取得する
// ========================================
const COLLECT_TWEETS = `
  (() => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results = [];
    for (const el of tweets) {
      const socialContext = el.querySelector('[data-testid="socialContext"]');
      const isRetweet = (socialContext && socialContext.textContent &&
        (socialContext.textContent.includes("reposted") || socialContext.textContent.includes("リポスト"))) || false;
      if (isRetweet) continue;

      const tweetText = el.querySelector('[data-testid="tweetText"]');
      const content = tweetText ? tweetText.textContent : "";
      if (!content) continue;

      const timeEl = el.querySelector('time');
      const timeLink = timeEl ? timeEl.closest('a') : null;
      const postUrl = timeLink ? timeLink.getAttribute('href') : "";
      const fullUrl = postUrl ? "https://x.com" + postUrl : "";
      const postDate = timeEl ? timeEl.getAttribute('datetime') : null;

      // @メンション（DOMリンク + テキスト内の@パターン両方から抽出）
      const mentions = [];
      if (tweetText) {
        // DOM内のユーザーリンク
        tweetText.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href') || "";
          // /username 形式（ハッシュタグや外部リンクではない）
          const m = href.match(/^\\/([A-Za-z0-9_]{1,15})$/);
          if (m) mentions.push(m[1]);
        });
        // テキスト内の@ユーザー名パターン（DOMで拾えないケース対策）
        const textContent = tweetText.textContent || "";
        const atMatches = textContent.matchAll(/@([A-Za-z0-9_]{1,15})/g);
        for (const m of atMatches) {
          if (!mentions.includes(m[1])) mentions.push(m[1]);
        }
      }

      // 投稿内のリンクURL（t.coリンクのテキスト表示も取得）
      const links = [];
      if (tweetText) {
        tweetText.querySelectorAll('a[href*="t.co"], a[href*="http"]').forEach(a => {
          const href = a.getAttribute('href') || "";
          const text = a.textContent || "";
          if (href.includes('t.co') || href.startsWith('http')) {
            links.push({ href, text });
          }
        });
      }

      // カード（リンクプレビュー）のURLも取得
      const cardLink = el.querySelector('[data-testid="card.wrapper"] a[href]');
      if (cardLink) {
        links.push({ href: cardLink.getAttribute('href') || "", text: cardLink.textContent || "" });
      }

      const images = [];
      el.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.includes('profile_images')) images.push(src);
      });

      results.push({ postUrl: fullUrl, content, postDate, images, mentions, links });
    }
    return results;
  })()
`;

// ========================================
// 共通: スクロールしながらツイート収集
// ========================================
async function scrollAndCollect(page, count) {
  const allPosts = [];
  let lastHeight = 0;
  let noNewCount = 0;

  while (allPosts.length < count && noNewCount < 8) {
    const rawPosts = await page.evaluate(COLLECT_TWEETS);

    for (const p of rawPosts) {
      if (allPosts.length >= count) break;
      if (!p.postUrl || allPosts.some(x => x.postUrl === p.postUrl)) continue;
      allPosts.push(p);
    }

    process.stdout.write(`\r  ${allPosts.length}/${count} 投稿収集済み`);

    const newHeight = await page.evaluate(`
      (() => { window.scrollBy(0, window.innerHeight * 2); return document.body.scrollHeight; })()
    `);

    if (newHeight === lastHeight) noNewCount++;
    else noNewCount = 0;
    lastHeight = newHeight;

    await sleep(2500);
  }

  console.log(`\n  -> ${allPosts.length}件収集完了\n`);
  return allPosts;
}

async function collectXPosts(browser, account, count) {
  console.log(`@${account} の投稿を収集中...`);

  const page = await browser.newPage();

  try {
    await page.goto(`https://x.com/${account}`, { waitUntil: "networkidle2", timeout: 30000 });

    try {
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 20000 });
    } catch {
      console.log("  ツイートが見つかりません。ログイン状態 or アカウント名を確認。");
      return [];
    }

    await sleep(3000);
    return await scrollAndCollect(page, count);
  } finally {
    await page.close();
  }
}

// ========================================
// 商品名抽出
// ========================================

// グッズ種別キーワード（商品名の核になる部分）
const GOODS_TYPES = [
  "アクリルスタンド", "アクスタ", "アクリルキーホルダー", "アクリルブロック",
  "アクリルブックスタンド", "アクリルフィギュア",
  "缶バッジ", "ピンバッジ", "バッジ",
  "フィギュア", "フィギュアライト",
  "ぬいぐるみ", "ぬいぐるみマスコット", "みみぐるみ",
  "タペストリー", "クリアファイル", "ポストカード", "ポストカードセット",
  "キーホルダー", "ラバーストラップ", "ラバスト",
  "コースター", "マグカップ", "タオル", "ビッグタオル",
  "Tシャツ", "パーカー",
  "ステッカー", "シール",
  "ブランケット", "抱き枕カバー", "抱き枕",
  "色紙", "ミニ色紙", "色紙フレーム",
  "ポーチ", "バッグ", "トートバッグ",
  "クリアカード", "ビジュアルカード", "フォトグレイカード",
  "ブックスタンド", "収納BOX",
  "DXF", "Qposket",
];
// 長い順にソート（「アクリルスタンド」が「アクスタ」より先にマッチするように）
GOODS_TYPES.sort((a, b) => b.length - a.length);

const GOODS_TYPES_RE = new RegExp(`(${GOODS_TYPES.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");

// グッズ投稿かどうかの判定用（GOODS_TYPESより緩い）
const GOODS_POST_RE = /グッズ|物販|アクスタ|アクリルスタンド|アクリルキーホルダー|缶バッジ|フィギュア|ぬいぐるみ|タペストリー|クリアファイル|キーホルダー|ラバスト|ラバーストラップ|一番くじ|ガチャ|トレーディング|コースター|マグカップ|Tシャツ|パーカー|ポストカード|ステッカー|ブランケット|抱き枕|色紙|タオル|ポーチ|バッグ|ピンバッジ|DXF|Qposket/;

function isGoodsPost(text) {
  return GOODS_POST_RE.test(text);
}

/**
 * 宣伝文ツイートから個別の商品名を抽出する
 *
 * 抽出ルール:
 * 1. 「」で囲まれた商品名（「ショーウィンドウ風アクリルスタンド」等）
 * 2. [修飾語]+[グッズ種別]のパターン（描き下ろしアクリルスタンド、レコード風コースター等）
 * 3. グッズ専用アカウント（1投稿=1商品）はテキストそのまま
 */
function extractProductNames(postText, ip = "") {
  let text = postText.replace(/\n/g, " ");
  // URL除去
  text = text.replace(/https?:\/\/\S+/g, "");
  // ハッシュタグ除去
  text = text.replace(/#\S+/g, "");
  // 装飾文字除去
  text = text.replace(/[◤◢◣◥▋━═＝∟├▼↓→►▷☆★◆●○■□＊*･°:｡]+/g, " ");
  // 【】内は見出し → 除去
  text = text.replace(/【[^】]*】/g, " ");
  // ／＼装飾除去
  text = text.replace(/[／＼]/g, " ");
  // @メンション除去
  text = text.replace(/@[A-Za-z0-9_]+/g, " ");
  // 連続スペース
  text = text.replace(/\s+/g, " ").trim();

  const products = [];
  const seen = new Set();

  // --- パターン1: 「」で囲まれた商品名 ---
  const quoted = text.matchAll(/「([^」]{3,50})」/g);
  for (const m of quoted) {
    let name = m[1].trim();
    // IP名や一般的すぎるものは除外
    if (/^(TVアニメ|アニメ|劇場版|映画)/.test(name)) continue;
    if (/詳細|こちら|公式|予約|販売/.test(name)) continue;
    const key = name.replace(/\s/g, "");
    if (!seen.has(key)) {
      seen.add(key);
      products.push(name);
    }
  }

  // --- パターン2: [修飾語]+[グッズ種別] ---
  // 修飾語を明示的にリストアップ（日本語15文字みたいな雑な範囲指定はゴミを巻き込む）
  const MODIFIERS = [
    "描き下ろし", "オリジナル", "限定", "特製", "新感覚の",
    "レコード風", "オーロラ素材の", "ショーウィンドウ風", "ブリスターパック風",
    "きぐるみを着た", "トレーディング", "ミニチュア", "メモリアル", "原画",
    "楕円", "・", // 「・缶バッジ」「楕円缶バッジ」
  ];
  const modPart = MODIFIERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

  for (const goodsType of GOODS_TYPES) {
    const escaped = goodsType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 修飾語（あれば）+ グッズ種別 + セット表記（あれば）
    const re = new RegExp(
      `((?:${modPart})\\s*${escaped}(?:\\s*\\d+[種個枚]?セット)?)`,
      "g"
    );
    const matches = text.matchAll(re);
    for (const m of matches) {
      let name = m[1].trim();
      // 先頭の「・」を除去
      name = name.replace(/^・/, "");
      // グッズ種別だけ（修飾語なし）はスキップ — 商品名じゃない
      if (GOODS_TYPES.includes(name)) continue;
      if (name.length < 4) continue;
      // 宣伝文句フィルタ
      if (/新感覚|楽しい|おすすめ|嬉しい/.test(name)) continue;
      const key = name.replace(/\s/g, "");
      if (!seen.has(key)) {
        seen.add(key);
        products.push(name);
      }
    }
  }

  return products;
}

/**
 * ツイートからIP名を抽出する
 * 『IP名』パターン、またはハッシュタグから取る
 */
function extractIpFromTweet(postText) {
  // 『IP名』パターン
  const ipMatch = postText.match(/『([^』]{2,30})』/);
  if (ipMatch) return ipMatch[1].trim();
  // TVアニメ「IP名」パターン
  const tvMatch = postText.match(/(?:TVアニメ|アニメ|劇場版)\s*[『「]([^」』]{2,30})[」』]/);
  if (tvMatch) return tvMatch[1].trim();
  return "";
}

function extractProductsFromPosts(posts, ip = "", filterGoods = false) {
  const allProducts = [];
  const seen = new Set();

  for (const post of posts) {
    if (filterGoods && !isGoodsPost(post.content)) continue;

    // ツイートからIP名を検出（--ipが指定されてなければ）
    const tweetIp = ip || extractIpFromTweet(post.content);

    const names = extractProductNames(post.content, tweetIp);

    for (const name of names) {
      // メルカリ検索キーワード = IP名 + 商品名
      const keyword = tweetIp ? `${tweetIp} ${name}` : name;
      const key = keyword.replace(/\s/g, "").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        allProducts.push({
          name: keyword,
          rawProductName: name,
          ip: tweetIp,
          postUrl: post.postUrl,
          postDate: post.postDate,
        });
      }
    }
  }

  return allProducts;
}

// ========================================
// ディスカバーモード: 公式アカウントからイベント専用アカウントを発見
// ========================================
const EVENT_HINTS = [
  "原画展", "展覧会", "展示", "コラボカフェ", "ポップアップストア",
  "ポップアップショップ", "POP UP", "POPUP", "物販", "グッズ",
  "イベント", "周年", "フェア", "フェスタ",
];

/**
 * 公式アカウントの投稿を見て、イベント関連の投稿から
 * @メンション（専用アカウント）を発見する
 */
function discoverEventAccounts(posts) {
  const found = new Map(); // account -> { account, reason, postUrl, postDate }

  for (const post of posts) {
    const text = post.content;

    // イベント関連の投稿か判定
    const matchedHint = EVENT_HINTS.find(h => text.includes(h));
    if (!matchedHint) continue;

    // この投稿内の@メンションを見る
    if (post.mentions?.length > 0) {
      for (const mention of post.mentions) {
        // 自分自身や一般的なアカウントは除外
        if (found.has(mention)) continue;
        found.set(mention, {
          account: mention,
          reason: `${matchedHint}の告知投稿でメンションされている`,
          postUrl: post.postUrl,
          postDate: post.postDate,
          postSnippet: text.slice(0, 100),
        });
      }
    }

    // リンクからx.comのアカウントURLを探す
    if (post.links?.length > 0) {
      for (const link of post.links) {
        // x.com/account_name 形式のリンク
        const xMatch = link.href.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/?$/);
        if (xMatch && !found.has(xMatch[1])) {
          found.set(xMatch[1], {
            account: xMatch[1],
            reason: `${matchedHint}の告知投稿にリンクがある`,
            postUrl: post.postUrl,
            postDate: post.postDate,
            postSnippet: text.slice(0, 100),
          });
        }
      }
    }
  }

  return Array.from(found.values());
}

// ========================================
// メルカリ個別検索
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
    console.log(`  メルカリ検索失敗 "${keyword}": ${e.message}`);
    return [];
  }
}

async function trackProductPrice(keyword) {
  console.log(`  "${keyword}"`);

  const items = await searchMercariSold(keyword, 60);
  if (items.length === 0) {
    console.log(`      -> 結果なし`);
    return null;
  }

  const now = Date.now();
  const recent = items.filter(i => new Date(i.date).getTime() >= now - 7 * 86400000);
  const older = items.filter(i => {
    const t = new Date(i.date).getTime();
    return t < now - 7 * 86400000 && t >= now - 37 * 86400000;
  });

  const prices = items.map(i => i.price);
  const result = {
    keyword,
    totalCount: items.length,
    medianPrice: median(prices),
    recentMedian: recent.length >= 2 ? median(recent.map(i => i.price)) : null,
    olderMedian: older.length >= 2 ? median(older.map(i => i.price)) : null,
    recentCount: recent.length,
    olderCount: older.length,
    sampleItems: items.slice(0, 5),
    changePercent: null,
  };

  if (result.recentMedian && result.olderMedian && result.olderMedian > 0) {
    result.changePercent = Math.round(((result.recentMedian - result.olderMedian) / result.olderMedian) * 1000) / 10;
  }

  const priceStr = `\\${result.medianPrice.toLocaleString()} (${result.totalCount}件)`;
  const changeStr = result.changePercent != null ? ` [${result.changePercent > 0 ? "+" : ""}${result.changePercent}%]` : "";
  console.log(`      -> ${priceStr}${changeStr}`);

  return result;
}

// ========================================
// 結果サマリー表示
// ========================================
function printSummary(label, results) {
  console.log("\n" + "=".repeat(60));
  console.log(`${label}`);
  console.log("=".repeat(60));

  if (results.length === 0) {
    console.log("結果なし");
    return;
  }

  results.sort((a, b) => (b.medianPrice || 0) - (a.medianPrice || 0));

  console.log(`\n${"キーワード".padEnd(50)} ${"中央値".padStart(8)} ${"件数".padStart(4)} ${"変動".padStart(8)}`);
  console.log("-".repeat(75));

  for (const r of results) {
    const kw = r.keyword.length > 48 ? r.keyword.slice(0, 48) + ".." : r.keyword.padEnd(50);
    const price = `\\${r.medianPrice.toLocaleString()}`.padStart(8);
    const count = `${r.totalCount}`.padStart(4);
    const change = r.changePercent != null
      ? `${r.changePercent > 0 ? "+" : ""}${r.changePercent}%`.padStart(8)
      : "   N/A".padStart(8);
    console.log(`${kw} ${price} ${count} ${change}`);
  }

  const trending = results.filter(r => r.changePercent != null && r.changePercent > 10);
  if (trending.length > 0) {
    console.log(`\n上昇トレンド（+10%以上）:`);
    trending.sort((a, b) => b.changePercent - a.changePercent);
    for (const r of trending) {
      console.log(`  +${r.changePercent}% ${r.keyword}`);
      if (r.olderMedian && r.recentMedian) {
        console.log(`    \\${r.olderMedian.toLocaleString()} -> \\${r.recentMedian.toLocaleString()}`);
      }
    }
  }
}

// ========================================
// メイン: アカウントモード
// ========================================
async function runAccountMode(browser) {
  console.log(`=== アカウントモード: @${xAccount} ===\n`);

  const posts = await collectXPosts(browser, xAccount, postCount);
  if (posts.length === 0) {
    console.log("投稿が取得できませんでした。");
    return { products: [], results: [] };
  }

  console.log("商品名抽出中...\n");
  const products = extractProductsFromPosts(posts, ipTitle);

  console.log(`商品数: ${products.length}件\n`);
  for (const p of products) console.log(`  ${p.name}`);
  console.log("");

  if (skipMercari) {
    console.log("メルカリ検索スキップ（--skip-mercari）");
    return { products, results: [] };
  }

  console.log(`メルカリsold価格追跡\n`);
  const results = [];
  for (const product of products) {
    const result = await trackProductPrice(product.name);
    if (result) results.push(result);
    await sleep(1500);
  }

  printSummary(`結果サマリー: @${xAccount}`, results);
  return { products, results };
}

// ========================================
// メイン: ディスカバーモード
// 公式アカウント → イベント専用アカウント発見 → グッズ収集
// ========================================
async function runDiscoverMode(browser) {
  const account = discoverAccount;
  console.log(`=== ディスカバーモード: @${account} ===`);
  console.log(`    公式アカウントからイベント専用アカウントを探す\n`);

  // Step 1: 公式アカウントの投稿を収集
  const posts = await collectXPosts(browser, account, postCount);
  if (posts.length === 0) {
    console.log("投稿が取得できませんでした。");
    return { source: account, discoveredAccounts: [], allResults: [] };
  }

  // Step 2: イベント専用アカウントを発見
  const discovered = discoverEventAccounts(posts);

  console.log(`発見されたイベントアカウント: ${discovered.length}件\n`);
  for (const d of discovered) {
    console.log(`  @${d.account}`);
    console.log(`    理由: ${d.reason}`);
    console.log(`    投稿: ${d.postSnippet}...`);
    console.log("");
  }

  if (discovered.length === 0) {
    console.log("イベントアカウントが見つかりませんでした。");

    // 公式アカウント自体からグッズ投稿を拾う（フォールバック）
    console.log("\n公式アカウントからグッズ投稿を直接抽出...\n");
    const products = extractProductsFromPosts(posts, ipTitle, true);
    console.log(`グッズ関連投稿: ${products.length}件`);
    for (const p of products) console.log(`  ${p.name}`);

    return { source: account, discoveredAccounts: [], products, allResults: [] };
  }

  // Step 3: 発見したアカウントを順番に回してグッズ収集
  const allResults = [];

  for (const d of discovered) {
    console.log(`--- @${d.account} のグッズを収集 ---\n`);

    const eventPosts = await collectXPosts(browser, d.account, 20);
    if (eventPosts.length === 0) {
      console.log("  投稿取得失敗。スキップ。\n");
      continue;
    }

    // グッズフィルタON（イベントアカウントでもグッズ以外の投稿がある）
    const products = extractProductsFromPosts(eventPosts, ipTitle, true);
    console.log(`  商品名: ${products.length}件`);
    for (const p of products) console.log(`    ${p.name}`);

    if (products.length === 0) {
      // フィルタなしでも試す（グッズ専用アカウントの可能性）
      const allProducts = extractProductsFromPosts(eventPosts, ipTitle, false);
      if (allProducts.length > 0) {
        console.log(`  （フィルタなし: ${allProducts.length}件）`);
        for (const p of allProducts) console.log(`    ${p.name}`);

        if (!skipMercari) {
          console.log(`\n  メルカリ価格追跡:`);
          const results = [];
          for (const product of allProducts) {
            const result = await trackProductPrice(product.name);
            if (result) results.push(result);
            await sleep(1500);
          }
          allResults.push({ account: d.account, reason: d.reason, products: allProducts, mercariResults: results });
        } else {
          allResults.push({ account: d.account, reason: d.reason, products: allProducts, mercariResults: [] });
        }
      }
      console.log("");
      continue;
    }

    if (!skipMercari) {
      console.log(`\n  メルカリ価格追跡:`);
      const results = [];
      for (const product of products) {
        const result = await trackProductPrice(product.name);
        if (result) results.push(result);
        await sleep(1500);
      }
      allResults.push({ account: d.account, reason: d.reason, products, mercariResults: results });
    } else {
      allResults.push({ account: d.account, reason: d.reason, products, mercariResults: [] });
    }

    console.log("");
    await sleep(3000);
  }

  // サマリー
  const allMercari = allResults.flatMap(r => r.mercariResults);
  if (allMercari.length > 0) {
    printSummary(`ディスカバー結果: @${account}`, allMercari);
  }

  return { source: account, discoveredAccounts: discovered, allResults };
}

// ========================================
// メイン: ウォッチリストモード
// ========================================
async function runWatchlistMode(browser) {
  console.log("=== ウォッチリストモード ===\n");

  const watchlistPath = path.join(__dirname, "goods-watchlist.json");
  if (!fs.existsSync(watchlistPath)) {
    console.error(`ウォッチリストが見つかりません: ${watchlistPath}`);
    process.exit(1);
  }
  const watchlist = JSON.parse(fs.readFileSync(watchlistPath, "utf-8"));

  const output = {
    timestamp: new Date().toISOString(),
    results: [],
  };

  for (const entry of watchlist.accounts) {
    console.log(`\n${"#".repeat(60)}`);
    console.log(`# ${entry.ip} (@${entry.account}) - ${entry.season}`);
    if (entry.note) console.log(`# ${entry.note}`);
    console.log(`${"#".repeat(60)}\n`);

    // 公式アカウントからイベントアカウントを探す
    const posts = await collectXPosts(browser, entry.account, 30);
    if (posts.length === 0) {
      console.log("  投稿取得失敗。スキップ。\n");
      continue;
    }

    const discovered = discoverEventAccounts(posts);
    console.log(`  発見されたイベントアカウント: ${discovered.length}件`);
    for (const d of discovered) {
      console.log(`    @${d.account} (${d.reason})`);
    }

    // 発見したアカウントのグッズを収集
    const entryResults = [];

    for (const d of discovered) {
      console.log(`\n  --- @${d.account} ---`);
      const eventPosts = await collectXPosts(browser, d.account, 20);
      if (eventPosts.length === 0) continue;

      const products = extractProductsFromPosts(eventPosts, entry.ip, true);
      // グッズフィルタで0件なら、フィルタなしで再試行（グッズ専用アカウントかも）
      const finalProducts = products.length > 0 ? products : extractProductsFromPosts(eventPosts, entry.ip, false);

      console.log(`  商品名: ${finalProducts.length}件`);
      for (const p of finalProducts) console.log(`    ${p.name}`);

      if (!skipMercari && finalProducts.length > 0) {
        console.log(`\n  メルカリ:`);
        const results = [];
        for (const product of finalProducts) {
          const result = await trackProductPrice(product.name);
          if (result) results.push(result);
          await sleep(1500);
        }
        entryResults.push({ account: d.account, products: finalProducts, mercariResults: results });
      } else {
        entryResults.push({ account: d.account, products: finalProducts, mercariResults: [] });
      }

      await sleep(3000);
    }

    // 公式アカウント自体からもグッズ投稿を拾う
    const directProducts = extractProductsFromPosts(posts, entry.ip, true);
    if (directProducts.length > 0) {
      console.log(`\n  公式アカウント直接: ${directProducts.length}件`);
      for (const p of directProducts) console.log(`    ${p.name}`);

      if (!skipMercari) {
        console.log(`\n  メルカリ:`);
        const results = [];
        for (const product of directProducts) {
          const result = await trackProductPrice(product.name);
          if (result) results.push(result);
          await sleep(1500);
        }
        entryResults.push({ account: entry.account, products: directProducts, mercariResults: results });
      }
    }

    output.results.push({
      ip: entry.ip, account: entry.account, season: entry.season,
      discoveredAccounts: discovered, details: entryResults,
    });
  }

  // 全体サマリー
  const allMercari = output.results.flatMap(r => r.details.flatMap(d => d.mercariResults));
  if (allMercari.length > 0) {
    console.log(`\n${"#".repeat(60)}`);
    console.log("# 全体サマリー");
    console.log(`${"#".repeat(60)}`);
    printSummary("全結果", allMercari);
  }

  return output;
}

// ========================================
// メイン
// ========================================
async function main() {
  const browser = await launchChrome();
  let output;

  try {
    if (watchlistMode) {
      output = await runWatchlistMode(browser);
    } else if (discoverAccount) {
      output = await runDiscoverMode(browser);
    } else {
      output = await runAccountMode(browser);
    }
  } finally {
    browser.disconnect();
    console.log("\nChrome切断");
  }

  // JSON出力
  const suffix = watchlistMode ? "watchlist" : discoverAccount ? `discover-${discoverAccount}` : xAccount;
  const outputPath = path.join(PROJECT_ROOT, `goods-catalog-${suffix}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`結果保存: ${outputPath}`);
}

main().catch(e => {
  console.error("エラー:", e);
  process.exit(1);
});
