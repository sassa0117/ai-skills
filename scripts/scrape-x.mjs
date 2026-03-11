#!/usr/bin/env node

/**
 * X (Twitter) ポスト スクレイピングスクリプト（スタンドアロン版）
 *
 * Phase 1: プロフィールページをスクロールしてポストURL・本文・日付を収集
 * Phase 2: 各ポストの /analytics ページを巡回して詳細メトリクスを取得
 *
 * 既存データ（data/x-posts.json）とマージ。重複はURL基準でスキップ。
 *
 * 使い方:
 *   node scripts/scrape-x.mjs [--username sassasedori] [--count 50]
 */

import puppeteer from "puppeteer";
import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT_DIR, "data");
const OUTPUT_FILE = resolve(DATA_DIR, "x-posts.json");
const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCRAPER_PROFILE = resolve(ROOT_DIR, ".scraper-chrome-profile");
const DEBUG_PORT = 9222;

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

function parseMetric(text) {
  if (!text) return 0;
  const cleaned = text.trim().replace(/,/g, "");
  if (cleaned.endsWith("K") || cleaned.endsWith("k"))
    return Math.round(parseFloat(cleaned) * 1000);
  if (cleaned.endsWith("M") || cleaned.endsWith("m"))
    return Math.round(parseFloat(cleaned) * 1000000);
  if (cleaned.endsWith("万"))
    return Math.round(parseFloat(cleaned) * 10000);
  return parseInt(cleaned) || 0;
}

function loadExistingData() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(OUTPUT_FILE)) {
    try {
      return JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

function saveData(posts) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2), "utf-8");
}

async function killScraperChrome() {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (res.ok) {
      try {
        const out = execSync(
          `netstat -ano | findstr :${DEBUG_PORT} | findstr LISTENING`,
          { encoding: "utf-8" }
        );
        const match = out.match(/LISTENING\s+(\d+)/);
        if (match) {
          execSync(`taskkill /F /PID ${match[1]} /T`, { stdio: "ignore" });
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {}
    }
  } catch {}
}

async function waitForDebugPort(maxWait = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      if (
        (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok
      )
        return true;
    } catch {}
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

async function collectPostUrls(page, username, count) {
  console.log(`Phase 1: @${username} のプロフィールからポストURL収集中...\n`);

  await page.goto(`https://x.com/${username}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  try {
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 20000 });
  } catch {
    console.log("ツイートが見つかりません。ログイン状態を確認してください。");
    return [];
  }

  await new Promise((r) => setTimeout(r, 3000));

  const allPosts = [];
  let lastHeight = 0;
  let noNewCount = 0;

  while (allPosts.length < count && noNewCount < 8) {
    const rawPosts = await page.evaluate(COLLECT_POSTS_SCRIPT);

    for (const p of rawPosts) {
      if (allPosts.length >= count) break;
      if (!p.postUrl || allPosts.some((x) => x.postUrl === p.postUrl)) continue;
      allPosts.push(p);
      process.stdout.write(`\r  ${allPosts.length}/${count} URLs collected`);
    }

    const newHeight = await page.evaluate(`
      (() => { window.scrollBy(0, window.innerHeight * 2); return document.body.scrollHeight; })()
    `);

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

async function extractAnalytics(page, postUrl) {
  try {
    const analyticsUrl = postUrl + "/analytics";
    await page.goto(analyticsUrl, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    let metrics = {};
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      metrics = await page.evaluate(EXTRACT_ANALYTICS);
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
  } catch {
    console.error(`  ⚠ Analytics取得失敗: ${postUrl}`);
    return null;
  }
}

// ─── メイン処理 ───

async function main() {
  const { username, count } = parseArgs();
  console.log(`\nX Post Scraper (Standalone)`);
  console.log(`Target: @${username}`);
  console.log(`Count: ${count} posts`);
  console.log(`Output: ${OUTPUT_FILE}\n`);

  // 既存データ読み込み
  const existingData = loadExistingData();
  const existingUrls = new Set(existingData.map((p) => p.postUrl));
  console.log(`既存データ: ${existingData.length}件\n`);

  // スクレイパーChrome起動
  await killScraperChrome();
  mkdirSync(SCRAPER_PROFILE, { recursive: true });

  const isFirstRun =
    !existsSync(resolve(SCRAPER_PROFILE, "Default", "Network", "Cookies")) &&
    !existsSync(resolve(SCRAPER_PROFILE, "Default", "Cookies"));

  if (isFirstRun) {
    console.log("=== 初回セットアップ ===");
    console.log("Chromeが開きます。Xにログインしてください。\n");
  }

  console.log("Chromeを起動中...");
  const chrome = spawn(
    CHROME_EXE,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${SCRAPER_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--lang=ja",
      ...(isFirstRun
        ? []
        : ["--window-position=-32000,-32000", "--window-size=1280,900"]),
      isFirstRun ? "https://x.com/login" : "about:blank",
    ],
    { detached: true, stdio: "ignore" }
  );
  chrome.unref();

  if (!(await waitForDebugPort())) {
    console.log("Chrome起動失敗");
    process.exit(1);
  }
  console.log("Chrome起動完了\n");

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 初回ログイン待ち
    if (isFirstRun) {
      const existingPages = await browser.pages();
      const loginPage =
        existingPages.find((p) => p.url().includes("x.com")) || page;
      console.log("Xへのログインを待っています...\n");
      await loginPage.waitForSelector('[data-testid="primaryColumn"]', {
        timeout: 300000,
      });
      console.log("ログイン確認!\n");
    }

    // Phase 1: URL収集
    const rawPosts = await collectPostUrls(page, username, count);
    if (rawPosts.length === 0) {
      console.log("ポストが見つかりませんでした。");
      browser.disconnect();
      process.exit(1);
    }

    // 新規ポストのみフィルタ
    const newPosts = rawPosts.filter((p) => !existingUrls.has(p.postUrl));
    console.log(
      `新規ポスト: ${newPosts.length}件（既存と重複: ${rawPosts.length - newPosts.length}件）\n`
    );

    if (newPosts.length === 0) {
      console.log("新規ポストなし。既存データは最新です。");
      browser.disconnect();
      return;
    }

    // Phase 2: Analytics巡回（新規のみ）
    console.log(
      `Phase 2: ${newPosts.length}件のAnalyticsページを巡回中...\n`
    );
    const scrapedPosts = [];

    for (let i = 0; i < newPosts.length; i++) {
      const raw = newPosts[i];
      process.stdout.write(`\r  ${i + 1}/${newPosts.length} analyzing...`);

      const analytics = await extractAnalytics(page, raw.postUrl);

      const impressions = analytics?.impressions || 0;
      const likes = parseMetric(raw.likes);
      const replies = parseMetric(raw.replies);
      const reposts = parseMetric(raw.reposts);

      scrapedPosts.push({
        postUrl: raw.postUrl,
        content: raw.content,
        postDate: raw.postDate,
        impressions,
        likes,
        replies,
        reposts,
        bookmarks: 0,
        profileClicks: analytics?.profileClicks || 0,
        linkClicks: analytics?.linkClicks || 0,
        engagementRate:
          impressions > 0
            ? Math.round(((likes + replies + reposts) / impressions) * 10000) /
              100
            : 0,
        videoViews: 0,
        shares: 0,
      });

      // レート制限回避
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    }

    // マージして保存（新しい順にソート）
    const merged = [...scrapedPosts, ...existingData].sort((a, b) => {
      const da = a.postDate ? new Date(a.postDate).getTime() : 0;
      const db = b.postDate ? new Date(b.postDate).getTime() : 0;
      return db - da;
    });

    saveData(merged);

    console.log(`\n\n完了!`);
    console.log(`  新規追加: ${scrapedPosts.length}件`);
    console.log(`  合計: ${merged.length}件`);
    console.log(`  保存先: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("\nエラー:", error);
  } finally {
    await page.close();
    browser.disconnect();
    console.log("\n※ Chromeは開いたままです。不要なら閉じてください。");
  }
}

main();
