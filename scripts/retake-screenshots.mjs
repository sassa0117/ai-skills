/**
 * ひろさんツールのスクショ撮り直し（注釈なし→正しい位置に注釈追加）
 *
 * 1. キーワード登録画面
 * 2. 即売れリスト
 * 3. 日時売り切れリスト（メルカリ比較付き）
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, '..', 'output');

const CHROME_BOT_PROFILE = process.env.LOCALAPPDATA + '/Google/Chrome/SurugayaBot';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = 9222;
const BASE_URL = 'https://sedori-assist-pro.com';

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
  if (!browser) throw new Error('Chrome接続失敗');
  return browser;
}

async function takeScreenshot(page, filename, options = {}) {
  const filepath = path.join(OUTPUT, filename);

  if (options.fullPage) {
    await page.screenshot({ path: filepath, fullPage: true });
  } else {
    // ビューポート内のスクショ
    await page.screenshot({ path: filepath });
  }
  console.log(`保存: ${filepath}`);
  return filepath;
}

async function main() {
  const browser = await connectChrome();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // ログイン確認
  console.log('ツールにアクセス中...');
  await page.goto(`${BASE_URL}/offmoal/new_item/list`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  const url = page.url();
  if (url.includes('login')) {
    console.log('ログインが必要です。SurugayaBotプロファイルにログイン情報がありません。');
    console.log('手動でログインしてから再実行してください。');
    await page.close();
    return;
  }
  console.log('ログイン済み確認OK');

  // === 1. キーワード登録画面 ===
  console.log('\n--- 1. キーワード登録画面 ---');
  await page.goto(`${BASE_URL}/offmoal/new_item/list`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);
  await takeScreenshot(page, 'screenshot_01_keyword.png');

  // === 2. 即売れリスト（カテゴリ指定で商品が出るようにする） ===
  console.log('\n--- 2. 即売れリスト ---');
  await page.goto(`${BASE_URL}/offmoal/new_item/soldout_check?category=all`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);
  // URLを確認
  console.log('  現在のURL:', page.url());
  await takeScreenshot(page, 'screenshot_02_soldout.png');

  // === 3. 日時売り切れリスト（SPA内ナビゲーションで遷移） ===
  console.log('\n--- 3. 日時売り切れリスト ---');

  // まずトップページに行ってからSPA内のナビリンクを探す
  await page.goto(`${BASE_URL}/offmoal/new_item/list`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  // ページ内のすべてのリンク・ナビ要素を調査
  const navInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, [role="tab"], [class*="tab"], [class*="Tab"], [class*="nav"], [class*="Nav"], [class*="menu"], [class*="Menu"]'));
    return links.map(el => `${el.tagName} | ${el.textContent.trim().substring(0, 50)} | href=${el.href || ''} | class=${el.className.substring(0, 80)}`).join('\n');
  });
  console.log('  ナビ要素:\n', navInfo);

  // 「日時売り切れ」「daily」を含むリンク/タブをクリック
  const dailyClicked = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('a, button, [role="tab"], span'));
    for (const el of allElements) {
      const txt = el.textContent.trim();
      if (txt.includes('日時売り切れ') || txt.includes('日次') || txt.includes('daily')) {
        el.click();
        return txt;
      }
    }
    // リンクのhrefで探す
    const links = Array.from(document.querySelectorAll('a'));
    for (const a of links) {
      if (a.href && a.href.includes('daily_soldout')) {
        a.click();
        return `href: ${a.href}`;
      }
    }
    return null;
  });

  if (dailyClicked) {
    console.log(`  「${dailyClicked}」をクリック`);
    await sleep(3000);
  } else {
    console.log('  日時売り切れリンク見つからず、URL直接遷移');
    await page.goto(`${BASE_URL}/offmoal/new_item/daily_soldout`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
  }

  console.log('  現在のURL:', page.url());

  // 検索ボタンがあればクリック（日付は今日がデフォのはず）
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.textContent.trim() === '検索') { b.click(); return; }
    }
  });
  await sleep(5000);

  // ページの中身をダンプ
  const pageContent = await page.evaluate(() => {
    return document.body.innerText.substring(0, 2000);
  });
  console.log('  ページ内容（先頭2000文字）:\n', pageContent);

  await takeScreenshot(page, 'screenshot_03_daily.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await takeScreenshot(page, 'screenshot_03_daily_full.png', { fullPage: true });

  console.log('\n全スクショ完了');
  await page.close();
}

main().catch(e => { console.error(e); process.exit(1); });
