#!/usr/bin/env node

/**
 * X アカウント調査スクレイパー
 *
 * おすすめタイムラインに表示されるポストからアカウントを無差別に収集し、
 * 各アカウントのプロフィール情報（フォロワー数・作成日・bio）と
 * 直近投稿のエンゲージメントを取得する。
 *
 * 使い方:
 *   node scripts/scrape-x-accounts.mjs [--count 100] [--scroll-rounds 20]
 *
 * 出力: data/x-account-research.json
 */

import puppeteer from "puppeteer";
import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT_DIR, "data");
const OUTPUT_FILE = resolve(DATA_DIR, "x-account-research.json");
const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCRAPER_PROFILE = resolve(ROOT_DIR, ".scraper-chrome-profile");
const DEBUG_PORT = 9222;

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 100;
  let scrollRounds = 30;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) count = parseInt(args[++i]);
    if (args[i] === "--scroll-rounds" && args[i + 1]) scrollRounds = parseInt(args[++i]);
  }
  return { count, scrollRounds };
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
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── おすすめTLからアカウントを収集 ───

const COLLECT_ACCOUNTS_SCRIPT = `
  (() => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results = [];
    const seen = new Set();
    for (const el of tweets) {
      // ユーザー名リンクを取得
      const userLinks = el.querySelectorAll('a[role="link"]');
      let username = null;
      for (const link of userLinks) {
        const href = link.getAttribute('href');
        if (href && href.match(/^\\/[A-Za-z0-9_]+$/) && !href.includes('/status/')) {
          username = href.replace('/', '');
          break;
        }
      }
      if (!username || seen.has(username)) continue;
      seen.add(username);

      // ポスト本文
      const tweetText = el.querySelector('[data-testid="tweetText"]');
      const content = tweetText ? tweetText.textContent : "";

      // エンゲージメント
      const getMetric = (testId) => {
        const btn = el.querySelector('[data-testid="' + testId + '"]');
        if (!btn) return "0";
        const text = btn.getAttribute('aria-label') || btn.textContent || "0";
        const match = text.match(/[\\d,.]+[KkMm万]?/);
        return match ? match[0] : "0";
      };

      results.push({
        username,
        sampleContent: content.substring(0, 200),
        likes: getMetric("like"),
        replies: getMetric("reply"),
        reposts: getMetric("retweet"),
      });
    }
    return results;
  })()
`;

// ─── プロフィールページから情報取得 ───

const EXTRACT_PROFILE_SCRIPT = `
  (() => {
    const result = {
      displayName: "",
      bio: "",
      followers: "0",
      following: "0",
      joinDate: "",
      verified: false,
      location: "",
      website: "",
    };

    // 表示名
    const heading = document.querySelector('[data-testid="UserName"]');
    if (heading) {
      const spans = heading.querySelectorAll('span');
      if (spans.length > 0) result.displayName = spans[0].textContent || "";
    }

    // bio
    const bioEl = document.querySelector('[data-testid="UserDescription"]');
    if (bioEl) result.bio = bioEl.textContent || "";

    // フォロワー数・フォロー数
    const links = document.querySelectorAll('a[href*="/verified_followers"], a[href*="/followers"], a[href*="/following"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent || '';
      if (href.includes('/followers') || href.includes('/verified_followers')) {
        const match = text.match(/([\\d,.]+[KkMm万]?)/);
        if (match) result.followers = match[1];
      }
      if (href.includes('/following')) {
        const match = text.match(/([\\d,.]+[KkMm万]?)/);
        if (match) result.following = match[1];
      }
    }

    // 参加日
    const joinEl = document.querySelector('[data-testid="UserJoinDate"]');
    if (joinEl) result.joinDate = joinEl.textContent || "";

    // 認証バッジ
    result.verified = !!document.querySelector('[data-testid="icon-verified"]');

    // 場所
    const locationEl = document.querySelector('[data-testid="UserLocation"]');
    if (locationEl) result.location = locationEl.textContent || "";

    // ウェブサイト
    const urlEl = document.querySelector('[data-testid="UserUrl"]');
    if (urlEl) result.website = urlEl.textContent || "";

    return result;
  })()
`;

// ─── プロフィールページから直近ポストのエンゲージメントも取得 ───

const COLLECT_PROFILE_POSTS_SCRIPT = `
  (() => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results = [];
    let count = 0;
    for (const el of tweets) {
      if (count >= 5) break;

      const socialContext = el.querySelector('[data-testid="socialContext"]');
      const isRetweet = (socialContext && socialContext.textContent &&
        (socialContext.textContent.includes("reposted") || socialContext.textContent.includes("リポスト"))) || false;
      if (isRetweet) continue;

      const tweetText = el.querySelector('[data-testid="tweetText"]');
      const content = tweetText ? tweetText.textContent : "";

      const timeEl = el.querySelector('time');
      const postDate = timeEl ? timeEl.getAttribute('datetime') : null;

      const getMetric = (testId) => {
        const btn = el.querySelector('[data-testid="' + testId + '"]');
        if (!btn) return "0";
        const text = btn.getAttribute('aria-label') || btn.textContent || "0";
        const match = text.match(/[\\d,.]+[KkMm万]?/);
        return match ? match[0] : "0";
      };

      results.push({
        content: content.substring(0, 200),
        postDate,
        likes: getMetric("like"),
        replies: getMetric("reply"),
        reposts: getMetric("retweet"),
      });
      count++;
    }
    return results;
  })()
`;

async function main() {
  const { count, scrollRounds } = parseArgs();
  console.log(`\nX Account Research Scraper`);
  console.log(`Target: おすすめTLから ${count} アカウント収集`);
  console.log(`Scroll rounds: ${scrollRounds}`);
  console.log(`Output: ${OUTPUT_FILE}\n`);

  mkdirSync(DATA_DIR, { recursive: true });

  // Chrome起動
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
    protocolTimeout: 120000,
  });

  const page = await browser.newPage();

  try {
    // ログイン確認
    if (isFirstRun) {
      const existingPages = await browser.pages();
      const loginPage =
        existingPages.find((p) => p.url().includes("x.com")) || page;
      console.log("Xへのログインを待っています...\n");
      await loginPage.waitForSelector('[data-testid="primaryColumn"]', {
        timeout: 300000,
      });
      console.log("ログイン確認!\n");
    } else {
      console.log("ログイン状態を確認中...");
      await page.goto("https://x.com/home", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      try {
        await page.waitForSelector('[data-testid="primaryColumn"]', {
          timeout: 15000,
        });
        console.log("ログイン済み!\n");
      } catch {
        console.log("セッション切れ。再ログインしてください。");
        await page.goto("https://x.com/login", {
          waitUntil: "domcontentloaded",
        });
        await page.waitForSelector('[data-testid="primaryColumn"]', {
          timeout: 300000,
        });
        console.log("再ログイン確認!\n");
      }
    }

    // ── Phase 1: おすすめTLスクロールでアカウント収集 ──
    console.log("Phase 1: おすすめタイムラインからアカウント収集中...\n");

    // おすすめタブに移動（ホームのデフォルト）
    await page.goto("https://x.com/home", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 3000));

    const collectedAccounts = new Map(); // username -> { sampleContent, likes, replies, reposts }

    for (let round = 0; round < scrollRounds; round++) {
      const accounts = await page.evaluate(COLLECT_ACCOUNTS_SCRIPT);

      for (const acc of accounts) {
        if (!collectedAccounts.has(acc.username)) {
          collectedAccounts.set(acc.username, acc);
          process.stdout.write(
            `\r  ${collectedAccounts.size} アカウント収集済み (round ${round + 1}/${scrollRounds})`
          );
        }
        if (collectedAccounts.size >= count) break;
      }

      if (collectedAccounts.size >= count) break;

      await page.evaluate(`window.scrollBy(0, window.innerHeight * 2)`);
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
    }

    console.log(`\n  → ${collectedAccounts.size} アカウント収集完了\n`);

    // ── Phase 2: 各アカウントのプロフィールを巡回 ──
    const usernames = [...collectedAccounts.keys()];
    console.log(`Phase 2: ${usernames.length} アカウントのプロフィール取得中...\n`);

    const results = [];

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      const tlData = collectedAccounts.get(username);
      process.stdout.write(`\r  ${i + 1}/${usernames.length} @${username}                    `);

      try {
        await page.goto(`https://x.com/${username}`, {
          waitUntil: "networkidle2",
          timeout: 20000,
        });

        // プロフィール情報を待つ
        try {
          await page.waitForSelector('[data-testid="UserName"]', { timeout: 10000 });
        } catch {
          // プロフィール読み込み失敗（凍結・非公開等）
          continue;
        }

        await new Promise((r) => setTimeout(r, 1500));

        const profile = await page.evaluate(EXTRACT_PROFILE_SCRIPT);
        const recentPosts = await page.evaluate(COLLECT_PROFILE_POSTS_SCRIPT);

        // エンゲージメント平均を計算
        let avgLikes = 0;
        let avgReplies = 0;
        let avgReposts = 0;
        if (recentPosts.length > 0) {
          avgLikes = Math.round(
            recentPosts.reduce((s, p) => s + parseMetric(p.likes), 0) / recentPosts.length
          );
          avgReplies = Math.round(
            recentPosts.reduce((s, p) => s + parseMetric(p.replies), 0) / recentPosts.length
          );
          avgReposts = Math.round(
            recentPosts.reduce((s, p) => s + parseMetric(p.reposts), 0) / recentPosts.length
          );
        }

        const followers = parseMetric(profile.followers);

        // 成長速度の算出
        let accountAgeDays = null;
        let followersPerDay = null;
        if (profile.joinDate) {
          // 「2023年4月からXを利用しています」等のパース
          const yearMatch = profile.joinDate.match(/(\d{4})/);
          const monthMatch = profile.joinDate.match(/(\d{1,2})月/) || profile.joinDate.match(/(January|February|March|April|May|June|July|August|September|October|November|December)/i);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            let month = 0;
            if (monthMatch) {
              const monthNames = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
              const mStr = monthMatch[1];
              if (mStr.match(/^\d+$/)) {
                month = parseInt(mStr) - 1;
              } else {
                month = monthNames[mStr.toLowerCase()] ?? 0;
              }
            }
            const joinDateObj = new Date(year, month, 1);
            accountAgeDays = Math.max(1, Math.floor((Date.now() - joinDateObj.getTime()) / (1000 * 60 * 60 * 24)));
            followersPerDay = Math.round((followers / accountAgeDays) * 100) / 100;
          }
        }

        // 短期成長指標: 直近投稿のエンゲージメントがフォロワー比で異常に高い = 今伸びてる
        // エンゲージメント率が高い + フォロワー/日が高い = 成長中アカウント
        const engagementRate = followers > 0
          ? Math.round(((avgLikes + avgReplies + avgReposts) / followers) * 10000) / 100
          : 0;

        // 直近投稿の日付範囲から投稿頻度を算出
        let postFrequencyPerWeek = null;
        if (recentPosts.length >= 2) {
          const dates = recentPosts
            .filter((p) => p.postDate)
            .map((p) => new Date(p.postDate).getTime())
            .sort((a, b) => b - a);
          if (dates.length >= 2) {
            const spanDays = Math.max(1, (dates[0] - dates[dates.length - 1]) / (1000 * 60 * 60 * 24));
            postFrequencyPerWeek = Math.round((dates.length / spanDays) * 7 * 10) / 10;
          }
        }

        results.push({
          username,
          displayName: profile.displayName,
          bio: profile.bio,
          followers,
          following: parseMetric(profile.following),
          joinDate: profile.joinDate,
          accountAgeDays,
          followersPerDay,
          verified: profile.verified,
          location: profile.location,
          website: profile.website,
          sampleContent: tlData.sampleContent,
          recentPostCount: recentPosts.length,
          avgLikes,
          avgReplies,
          avgReposts,
          engagementRate,
          postFrequencyPerWeek,
          recentPosts: recentPosts.map((p) => ({
            content: p.content,
            postDate: p.postDate,
            likes: parseMetric(p.likes),
            replies: parseMetric(p.replies),
            reposts: parseMetric(p.reposts),
          })),
          scrapedAt: new Date().toISOString(),
        });

        // レート制限回避
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      } catch (err) {
        // 個別アカウントの失敗はスキップ
        continue;
      }
    }

    // 保存
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");

    console.log(`\n\n完了!`);
    console.log(`  取得: ${results.length} アカウント`);
    console.log(`  保存先: ${OUTPUT_FILE}`);

    // サマリー表示
    console.log(`\n--- フォロワー帯別 ---`);
    const bands = [
      { label: "0-1K", min: 0, max: 1000 },
      { label: "1K-5K", min: 1000, max: 5000 },
      { label: "5K-10K", min: 5000, max: 10000 },
      { label: "10K-50K", min: 10000, max: 50000 },
      { label: "50K-100K", min: 50000, max: 100000 },
      { label: "100K+", min: 100000, max: Infinity },
    ];
    for (const band of bands) {
      const accs = results.filter(
        (r) => r.followers >= band.min && r.followers < band.max
      );
      if (accs.length > 0) {
        const avgEng =
          Math.round(
            (accs.reduce((s, a) => s + a.engagementRate, 0) / accs.length) * 100
          ) / 100;
        const avgGrowth = accs.filter((a) => a.followersPerDay !== null);
        const avgGrowthStr =
          avgGrowth.length > 0
            ? ` / 平均成長: ${Math.round((avgGrowth.reduce((s, a) => s + a.followersPerDay, 0) / avgGrowth.length) * 100) / 100}人/日`
            : "";
        console.log(
          `  ${band.label}: ${accs.length}件 (平均エンゲージメント率: ${avgEng}%${avgGrowthStr})`
        );
      }
    }

    // 成長速度TOP10
    const growthTop = results
      .filter((r) => r.followersPerDay !== null && r.followers >= 500)
      .sort((a, b) => b.followersPerDay - a.followersPerDay)
      .slice(0, 10);
    if (growthTop.length > 0) {
      console.log(`\n--- 成長速度 TOP10 (500+フォロワー) ---`);
      for (const acc of growthTop) {
        console.log(
          `  @${acc.username}: ${acc.followers}フォロワー / ${acc.followersPerDay}人/日 / エンゲージ率${acc.engagementRate}% / "${acc.bio.substring(0, 50)}"`
        );
      }
    }

    // 高エンゲージメント率TOP10
    const engTop = results
      .filter((r) => r.followers >= 500 && r.engagementRate > 0)
      .sort((a, b) => b.engagementRate - a.engagementRate)
      .slice(0, 10);
    if (engTop.length > 0) {
      console.log(`\n--- エンゲージメント率 TOP10 (500+フォロワー) ---`);
      for (const acc of engTop) {
        console.log(
          `  @${acc.username}: エンゲージ率${acc.engagementRate}% / ${acc.followers}フォロワー / "${acc.bio.substring(0, 50)}"`
        );
      }
    }
  } catch (error) {
    console.error("\nエラー:", error);
  } finally {
    await page.close();
    browser.disconnect();
    console.log("\n※ Chromeは開いたままです。不要なら閉じてください。");
  }
}

main();
