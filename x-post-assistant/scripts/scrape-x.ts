/**
 * X (Twitter) ポスト スクレイピングスクリプト（2フェーズ版）
 *
 * Phase 1: プロフィールページをスクロールしてポストURL・本文・日付を収集
 * Phase 2: 各ポストの /analytics ページを巡回して詳細メトリクスを取得
 *
 * 本物のChromeを専用プロファイルで起動。初回のみXログインが必要。
 * ※実行前にChromeを閉じること
 *
 * 使い方:
 *   npx tsx scripts/scrape-x.ts [--username sassasedori] [--count 50]
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_FILE = path.join(__dirname, "..", "scraped-posts.json");
const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCRAPER_PROFILE = path.join(__dirname, "..", ".scraper-chrome-profile");
const DEBUG_PORT = 9222;

interface ScrapedPost {
  postUrl: string;
  content: string;
  postDate: string | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  bookmarks: number;
  profileClicks: number;
  linkClicks: number;
  engagementRate: number;
  videoViews: number;
  shares: number;
}

// ─── ユーティリティ ───

function parseArgs() {
  const args = process.argv.slice(2);
  let username = "sassasedori";
  let count = 50;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--username" && args[i + 1]) username = args[++i];
    if (args[i] === "--count" && args[i + 1]) count = parseInt(args[++i]);
  }
  return { username, count };
}

function parseMetric(text: string): number {
  if (!text) return 0;
  const cleaned = text.trim().replace(/,/g, "");
  if (cleaned.endsWith("K") || cleaned.endsWith("k")) return Math.round(parseFloat(cleaned) * 1000);
  if (cleaned.endsWith("M") || cleaned.endsWith("m")) return Math.round(parseFloat(cleaned) * 1000000);
  if (cleaned.endsWith("万")) return Math.round(parseFloat(cleaned) * 10000);
  return parseInt(cleaned) || 0;
}

/** スクレイパー専用Chromeだけを終了（デバッグポートで判別） */
async function killScraperChrome(): Promise<void> {
  try {
    // デバッグポートが応答する = スクレイパーChromeが動いている
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (res.ok) {
      // webSocketDebuggerUrl から PID を直接取れないので、ポートを使っているプロセスを特定
      try {
        const out = execSync(`netstat -ano | findstr :${DEBUG_PORT} | findstr LISTENING`, { encoding: "utf-8" });
        const match = out.match(/LISTENING\s+(\d+)/);
        if (match) {
          execSync(`taskkill /F /PID ${match[1]} /T`, { stdio: "ignore" });
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {}
    }
  } catch {
    // ポートが応答しない = スクレイパーChromeは動いていない
  }
}

async function waitForDebugPort(maxWait = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── Phase 1: プロフィールページからURL収集 ───

const COLLECT_POSTS_SCRIPT = `
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

      // いいね・リプ・リポストはaria-labelから取得
      const getMetric = (testId) => {
        const btn = el.querySelector('[data-testid="' + testId + '"]');
        if (!btn) return "0";
        const text = btn.getAttribute('aria-label') || btn.textContent || "0";
        const match = text.match(/[\\d,.]+[KkMm万]?/);
        return match ? match[0] : "0";
      };

      results.push({
        postUrl: fullUrl,
        content: content,
        postDate: postDate,
        likes: getMetric("like"),
        replies: getMetric("reply"),
        reposts: getMetric("retweet"),
      });
    }
    return results;
  })()
`;

async function collectPostUrls(page: Page, username: string, count: number) {
  console.log(`Phase 1: @${username} のプロフィールからポストURL収集中...\n`);

  await page.goto(`https://x.com/${username}`, { waitUntil: "networkidle2", timeout: 30000 });

  // ツイートが表示されるまで待つ
  try {
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 20000 });
  } catch {
    console.log("❌ ツイートが見つかりません。ログイン状態を確認してください。");
    return [];
  }

  await new Promise((r) => setTimeout(r, 3000));

  const allPosts: { postUrl: string; content: string; postDate: string | null; likes: string; replies: string; reposts: string }[] = [];
  let lastHeight = 0;
  let noNewCount = 0;

  while (allPosts.length < count && noNewCount < 8) {
    const rawPosts = await page.evaluate(COLLECT_POSTS_SCRIPT) as any[];

    for (const p of rawPosts) {
      if (allPosts.length >= count) break;
      if (!p.postUrl || allPosts.some((x) => x.postUrl === p.postUrl)) continue;
      allPosts.push(p);
      process.stdout.write(`\r  ${allPosts.length}/${count} URLs collected`);
    }

    const newHeight = await page.evaluate(`
      (() => { window.scrollBy(0, window.innerHeight * 2); return document.body.scrollHeight; })()
    `) as number;

    if (newHeight === lastHeight) noNewCount++;
    else noNewCount = 0;
    lastHeight = newHeight;

    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log(`\n  → ${allPosts.length}件のURL収集完了\n`);
  return allPosts;
}

// ─── Phase 2: Analytics ページから詳細メトリクス取得 ───

const EXTRACT_ANALYTICS = `
  (() => {
    const containers = document.querySelectorAll('[data-testid="app-text-transition-container"]');
    const metrics = {};
    for (const c of containers) {
      const value = c.textContent.trim();
      const ggp = c.parentElement && c.parentElement.parentElement && c.parentElement.parentElement.parentElement;
      if (!ggp) continue;
      const label = ggp.children[0] ? ggp.children[0].textContent.trim() : "";
      if (label && label !== value) {
        metrics[label] = value;
      }
    }
    return metrics;
  })()
`;

async function extractAnalytics(page: Page, postUrl: string): Promise<{
  impressions: number;
  profileClicks: number;
  detailClicks: number;
  linkClicks: number;
  totalEngagements: number;
} | null> {
  try {
    const analyticsUrl = postUrl + "/analytics";
    await page.goto(analyticsUrl, { waitUntil: "networkidle2", timeout: 20000 });

    // データがロードされるまで待つ（最大10秒）
    let metrics: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      metrics = await page.evaluate(EXTRACT_ANALYTICS) as Record<string, string>;
      const hasData = Object.values(metrics).some((v) => v !== "0" && v !== "");
      if (hasData) break;
    }

    return {
      impressions: parseMetric(metrics["インプレッション数"] || "0"),
      totalEngagements: parseMetric(metrics["エンゲージメント"] || "0"),
      detailClicks: parseMetric(metrics["詳細のクリック数"] || "0"),
      profileClicks: parseMetric(metrics["プロフィールへのアクセス数"] || "0"),
      linkClicks: parseMetric(metrics["リンククリック数"] || "0"),
    };
  } catch (err) {
    console.error(`  ⚠ Analytics取得失敗: ${postUrl}`);
    return null;
  }
}

// ─── メイン処理 ───

async function main() {
  const { username, count } = parseArgs();
  console.log(`\nX Post Scraper (2-Phase)`);
  console.log(`Target: @${username}`);
  console.log(`Count: ${count} posts\n`);

  // 既存のスクレイパーChromeがあれば終了（ユーザーのChromeには触らない）
  await killScraperChrome();

  fs.mkdirSync(SCRAPER_PROFILE, { recursive: true });

  const isFirstRun = !fs.existsSync(path.join(SCRAPER_PROFILE, "Default", "Network", "Cookies"))
    && !fs.existsSync(path.join(SCRAPER_PROFILE, "Default", "Cookies"));

  if (isFirstRun) {
    console.log("=== 初回セットアップ ===");
    console.log("Chromeが開きます。Xにログインしてください。\n");
  }

  console.log("Chromeを起動中...");
  const chrome = spawn(CHROME_EXE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${SCRAPER_PROFILE}`,
    "--no-first-run", "--no-default-browser-check", "--lang=ja",
    ...(isFirstRun ? [] : ["--window-position=-32000,-32000", "--window-size=1280,900"]),
    isFirstRun ? "https://x.com/login" : "about:blank",
  ], { detached: true, stdio: "ignore" });
  chrome.unref();

  if (!(await waitForDebugPort())) {
    console.log("❌ Chrome起動失敗"); process.exit(1);
  }
  console.log("✓ Chrome起動完了\n");

  const browser: Browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 初回ログイン待ち
    if (isFirstRun) {
      const existingPages = await browser.pages();
      const loginPage = existingPages.find(p => p.url().includes("x.com")) || page;
      console.log("Xへのログインを待っています...\n");
      await loginPage.waitForSelector('[data-testid="primaryColumn"]', { timeout: 300000 });
      console.log("✓ ログイン確認!\n");
    }

    // ── Phase 1: URL収集 ──
    const rawPosts = await collectPostUrls(page, username, count);
    if (rawPosts.length === 0) {
      console.log("ポストが見つかりませんでした。");
      browser.disconnect();
      process.exit(1);
    }

    // ── Phase 2: Analytics巡回 ──
    console.log(`Phase 2: ${rawPosts.length}件のAnalyticsページを巡回中...\n`);
    const allPosts: ScrapedPost[] = [];

    for (let i = 0; i < rawPosts.length; i++) {
      const raw = rawPosts[i];
      process.stdout.write(`\r  ${i + 1}/${rawPosts.length} analyzing...`);

      const analytics = await extractAnalytics(page, raw.postUrl);

      const impressions = analytics?.impressions || 0;
      const likes = parseMetric(raw.likes);
      const replies = parseMetric(raw.replies);
      const reposts = parseMetric(raw.reposts);

      const post: ScrapedPost = {
        postUrl: raw.postUrl,
        content: raw.content,
        postDate: raw.postDate,
        impressions,
        likes,
        replies,
        reposts,
        bookmarks: 0, // Analyticsページに表示なし
        profileClicks: analytics?.profileClicks || 0,
        linkClicks: analytics?.linkClicks || 0,
        engagementRate: impressions > 0
          ? Math.round(((likes + replies + reposts) / impressions) * 10000) / 100
          : 0,
        videoViews: 0,
        shares: 0,
      };

      allPosts.push(post);

      // レート制限回避（1-2秒のランダム遅延）
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    }

    console.log(`\n\n${allPosts.length}件のポストを取得しました。`);

    // ファイル保存
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPosts, null, 2), "utf-8");
    console.log(`保存先: ${OUTPUT_FILE}`);

    // DB投入
    console.log("\nDBに投入中...");
    let success = 0;
    let skipped = 0;

    for (const post of allPosts) {
      try {
        const res = await fetch("http://localhost:3001/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postUrl: post.postUrl || undefined,
            postDate: post.postDate || undefined,
            content: post.content,
            impressions: post.impressions,
            likes: post.likes,
            replies: post.replies,
            reposts: post.reposts,
            bookmarks: post.bookmarks,
            profileClicks: post.profileClicks,
            linkClicks: post.linkClicks,
            engagementRate: post.engagementRate,
            videoViews: post.videoViews,
            shares: post.shares,
            bookmarkRate: post.impressions > 0
              ? Math.round((post.bookmarks / post.impressions) * 10000) / 100
              : 0,
            status: "published",
            algorithmEra: post.postDate
              ? new Date(post.postDate) < new Date("2025-11-01")
                ? "pre_grok"
                : new Date(post.postDate) < new Date("2026-01-01")
                ? "grok_transition"
                : "grok_full"
              : null,
          }),
        });
        if (res.ok) success++;
        else skipped++;
      } catch {
        skipped++;
      }
    }

    console.log(`\nDB投入完了: ${success}件成功 / ${skipped}件スキップ`);
  } catch (error) {
    console.error("\nエラー:", error);
  } finally {
    await page.close();
    browser.disconnect();
    console.log("\n※ Chromeは開いたままです。不要なら閉じてください。");
  }
}

main();
