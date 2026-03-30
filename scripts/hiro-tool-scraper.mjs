/**
 * ひろさんツール（sedori-assist-pro）スクレイパー
 *
 * 即売れリスト・日時売り切れリストから商品データを取得し、
 * item_idでオフモールから正式な商品名・型番を取得する
 *
 * 使い方: node scripts/hiro-tool-scraper.mjs [カテゴリ] [リストタイプ]
 * 例: node scripts/hiro-tool-scraper.mjs fishing soldout
 *     node scripts/hiro-tool-scraper.mjs fishing daily
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHROME_BOT_PROFILE = process.env.LOCALAPPDATA + '/Google/Chrome/SurugayaBot';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = 9222;

const BASE_URL = 'https://sedori-assist-pro.com';
const LOGIN_URL = `${BASE_URL}/login`;

const URLS = {
  soldout: (cat) => `${BASE_URL}/offmoal/new_item/soldout_check?category=${cat}`,
  daily: (cat) => `${BASE_URL}/offmoal/new_item/daily_soldout?category=${cat}`,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function connectChrome() {
  let browser;
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const data = await res.json();
    browser = await puppeteer.connect({ browserWSEndpoint: data.webSocketDebuggerUrl });
    console.log('既存のChromeに接続');
  } catch (e) {
    console.log('Chrome起動中...');
    const { spawn } = await import('child_process');
    spawn(CHROME_EXE, [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${CHROME_BOT_PROFILE}`,
    ], { detached: true, stdio: 'ignore' }).unref();

    for (let retry = 0; retry < 15; retry++) {
      await sleep(2000);
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        const data = await res.json();
        browser = await puppeteer.connect({ browserWSEndpoint: data.webSocketDebuggerUrl });
        break;
      } catch (_) {
        console.log(`  接続待ち... (${retry + 1}/15)`);
      }
    }
  }
  return browser;
}

async function login(page) {
  console.log('ログインページへ...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);

  // 既にログイン済みかチェック
  const url = page.url();
  if (!url.includes('login')) {
    console.log('ログイン済み');
    return true;
  }

  // ログインフォーム入力
  console.log('ログイン実行中...');

  // メールアドレス入力
  const emailInput = await page.$('input[type="email"], input[name="email"], input[name="username"]');
  if (emailInput) {
    await emailInput.click({ clickCount: 3 });
    await emailInput.type('sassa@gmail.com');
  }

  // パスワード入力
  const passInput = await page.$('input[type="password"], input[name="password"]');
  if (passInput) {
    await passInput.click({ clickCount: 3 });
    await passInput.type('sassa0110');
  }

  // ログインボタン
  const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await sleep(2000);
  }

  const afterUrl = page.url();
  if (afterUrl.includes('login')) {
    console.log('自動ログイン失敗。手動でログインしてEnterを押してください。');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
  }

  console.log('ログイン完了');
  return true;
}

// 1ページ分のカードを解析
async function scrapeCurrentPage(page) {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="soldoutResearch-card"]');
    const results = [];

    cards.forEach(card => {
      if (!card.classList.toString().match(/soldoutResearch-card\b/) ||
          card.classList.toString().includes('cardTop')) return;

      const titleEl = card.querySelector('[class*="soldoutResearch-itemTitle"]');
      const priceEl = card.querySelector('[class*="soldoutResearch-priceValue"]');
      const linkEl = card.querySelector('a[href*="netmall.hardoff.co.jp"]');
      const imgEl = card.querySelector('[class*="soldoutResearch-mainImage"]');

      const codeRows = card.querySelectorAll('[class*="soldoutResearch-codeRow"]');
      let itemId = null;
      let modelNumber = null;
      codeRows.forEach(row => {
        const label = row.querySelector('span')?.textContent?.trim();
        const value = row.querySelector('strong')?.textContent?.trim();
        if (label === 'item_id') itemId = value;
        if (label === '型番') modelNumber = value !== '-' ? value : null;
      });

      const metaItems = card.querySelectorAll('[class*="soldoutResearch-metaItem"]');
      const meta = {};
      metaItems.forEach(item => {
        const label = item.querySelector('span')?.textContent?.trim();
        const value = item.querySelector('strong')?.textContent?.trim();
        if (label && value && value !== '-') meta[label] = value;
      });

      const captionEl = card.querySelector('[class*="soldoutResearch-sectionCaption"]');
      const mercariCount = captionEl?.textContent?.match(/(\d+)\s*件/)?.[1] || '0';

      if (itemId) {
        results.push({
          itemId,
          name: titleEl?.textContent?.trim() || null,
          price: priceEl?.textContent?.replace(/[¥,]/g, '').trim() || null,
          modelNumber,
          brand: meta['ブランド'] || null,
          condition: meta['状態'] || null,
          category: meta['カテゴリ'] || null,
          soldoutDate: meta['売り切れ日時'] || null,
          offmallUrl: linkEl?.href || `https://netmall.hardoff.co.jp/product/${itemId}/`,
          imageUrl: imgEl?.src || null,
          mercariCompareCount: parseInt(mercariCount),
        });
      }
    });

    return results;
  });
}

// 全ページをスクレイピング
async function scrapeAllPages(page, url) {
  console.log(`\nページ取得: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  // 総件数・ページ数を取得
  const { totalCount, totalPages } = await page.evaluate(() => {
    const titleEl = document.querySelector('[class*="soldoutResearch-resultTitle"]');
    const countMatch = titleEl?.textContent?.match(/全\s*([\d,]+)\s*件/);
    const total = countMatch ? parseInt(countMatch[1].replace(/,/g, '')) : null;

    const pagBtns = document.querySelectorAll('[class*="MuiPaginationItem-page"]');
    let maxPage = 1;
    pagBtns.forEach(btn => {
      const num = parseInt(btn.textContent);
      if (!isNaN(num) && num > maxPage) maxPage = num;
    });

    return { totalCount: total, totalPages: maxPage };
  });

  console.log(`総件数: ${totalCount}件 / ${totalPages}ページ`);

  // 1ページ目
  let allItems = await scrapeCurrentPage(page);
  console.log(`  ページ 1/${totalPages}: ${allItems.length}件取得`);

  // 2ページ目以降
  for (let p = 2; p <= totalPages; p++) {
    // 次ページボタンをクリック
    const clicked = await page.evaluate((targetPage) => {
      const btns = document.querySelectorAll('[class*="MuiPaginationItem-page"]');
      for (const btn of btns) {
        if (btn.textContent.trim() === String(targetPage)) {
          btn.click();
          return true;
        }
      }
      // 「次へ」ボタン
      const nextBtn = document.querySelector('[aria-label="Go to next page"]');
      if (nextBtn) { nextBtn.click(); return true; }
      return false;
    }, p);

    if (!clicked) {
      console.log(`  ページ ${p} ボタンが見つからず中断`);
      break;
    }

    await sleep(2000);

    // ページ遷移待ち（カードが更新されるのを待つ）
    await page.waitForSelector('[class*="soldoutResearch-card"]', { timeout: 10000 }).catch(() => {});
    await sleep(1000);

    const pageItems = await scrapeCurrentPage(page);
    console.log(`  ページ ${p}/${totalPages}: ${pageItems.length}件取得`);
    allItems = allItems.concat(pageItems);
  }

  // 重複除去
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (seen.has(item.itemId)) return false;
    seen.add(item.itemId);
    return true;
  });

  console.log(`\n合計: ${unique.length}件（重複除去後）`);
  return { items: unique, totalCount };
}

async function main() {
  const category = process.argv[2] || 'fishing';
  const listType = process.argv[3] || 'soldout';

  console.log(`\n=== ひろさんツール スクレイパー ===`);
  console.log(`カテゴリ: ${category} / リスト: ${listType}\n`);

  const browser = await connectChrome();
  if (!browser) {
    console.log('Chromeに接続できません');
    return;
  }

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  // ログイン
  await login(page);

  // 全ページ取得
  const url = URLS[listType] ? URLS[listType](category) : URLS.soldout(category);
  const result = await scrapeAllPages(page, url);

  console.log(`\n=== 取得完了 ===`);
  console.log(`総件数: ${result.totalCount}件 / 取得: ${result.items.length}件`);

  // サマリー表示
  const withModel = result.items.filter(i => i.modelNumber);
  const withBrand = result.items.filter(i => i.brand);
  console.log(`型番あり: ${withModel.length}件 / ブランドあり: ${withBrand.length}件`);

  // 価格帯分布
  const prices = result.items.map(i => parseInt(i.price) || 0);
  const under5k = prices.filter(p => p < 5000).length;
  const under20k = prices.filter(p => p >= 5000 && p < 20000).length;
  const under50k = prices.filter(p => p >= 20000 && p < 50000).length;
  const over50k = prices.filter(p => p >= 50000).length;
  console.log(`価格帯: ~5千:${under5k} / 5千~2万:${under20k} / 2万~5万:${under50k} / 5万~:${over50k}`);

  // データ保存
  const dataPath = path.join(ROOT, `hiro_${category}_${listType}.json`);
  fs.writeFileSync(dataPath, JSON.stringify(result.items, null, 2), 'utf-8');
  console.log(`\nデータ保存: ${dataPath}`);

  console.log('\n完了');
}

main().catch(console.error);
