/**
 * 駿河屋 入荷待ちリスト自動登録
 *
 * 品切れリスト（kaitori_xxx_progress.json）の商品を
 * Puppeteerで入荷待ちリストに自動登録する
 *
 * 使い方: node scripts/surugaya-nyuka-register.mjs [カテゴリID]
 * 例: node scripts/surugaya-nyuka-register.mjs 500
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHROME_BOT_PROFILE = process.env.LOCALAPPDATA + '/Google/Chrome/SurugayaBot';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const DELAY = 3000;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const categoryId = process.argv[2] || '500';
  const progressPath = path.join(ROOT, `kaitori_${categoryId}_progress.json`);

  if (!fs.existsSync(progressPath)) {
    console.log(`進捗ファイルなし: ${progressPath}`);
    console.log('先に surugaya-kaitori-list.mjs でリストを取得してください');
    return;
  }

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  const items = progress.items || [];

  if (items.length === 0) {
    console.log('登録する商品がありません');
    return;
  }

  // 登録済み管理ファイル
  const registeredPath = path.join(ROOT, `kaitori_${categoryId}_registered.json`);
  const registered = new Set(
    fs.existsSync(registeredPath) ? JSON.parse(fs.readFileSync(registeredPath, 'utf-8')) : []
  );

  const toRegister = items.filter(item => !registered.has(item.productId));
  console.log(`\n=== 入荷待ちリスト自動登録 ===`);
  console.log(`対象: ${toRegister.length}件（全${items.length}件中、登録済み${registered.size}件）\n`);

  if (toRegister.length === 0) {
    console.log('全て登録済み');
    return;
  }

  // Chromeをリモートデバッグモードで起動して接続
  // （普通のChromeなのでCloudflareに弾かれない）
  const { execSync } = await import('child_process');
  const DEBUG_PORT = 9222;

  // 既にChromeが起動してるか確認、なければ起動
  let browser;
  try {
    const verRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const verData = await verRes.json();
    browser = await puppeteer.connect({ browserWSEndpoint: verData.webSocketDebuggerUrl });
    console.log('既存のChromeに接続');
  } catch (e) {
    console.log('Chrome起動中...');
    const { spawn: spawnProc } = await import('child_process');
    spawnProc(CHROME_EXE, [
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
  if (!browser) {
    console.log('Chromeに接続できません。');
    return;
  }
  console.log('Chrome接続OK');

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  // ログイン確認
  await page.goto('https://www.suruga-ya.jp/pcmypage', { waitUntil: 'networkidle2' });
  const isLoggedIn = await page.evaluate(() => {
    return !document.querySelector('input[name="password"]');
  });

  if (!isLoggedIn) {
    console.log('\n=== ブラウザで駿河屋にログインしてください ===');
    console.log('ログインしたらここでEnterキーを押してください\n');
    await new Promise(r => process.stdin.once('data', r));
    await page.goto('https://www.suruga-ya.jp/pcmypage', { waitUntil: 'networkidle2' });
    const loggedIn2 = await page.evaluate(() => !document.querySelector('input[name="password"]'));
    if (!loggedIn2) {
      console.log('ログインできていません。終了します。');
      browser.disconnect();
      return;
    }
  }
  console.log('ログイン確認OK\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toRegister.length; i++) {
    const item = toRegister[i];
    const url = `https://www.suruga-ya.jp/product/detail/${item.productId}`;
    console.log(`[${i + 1}/${toRegister.length}] ${item.name.substring(0, 50)}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

      // 入荷待ちリストボタンを探してクリック
      const waitBtn = await page.$('input.waitbtn, button.waitbtn, .waitbtn');
      if (waitBtn) {
        await waitBtn.click();
        await sleep(2000);
        // ページ遷移を待つ
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        registered.add(item.productId);
        successCount++;
        console.log(`  ✓ 登録完了`);
      } else {
        // 既に在庫復活してるか、ボタンがない
        const hasStock = await page.$('form.add-cart');
        if (hasStock) {
          console.log(`  - スキップ（在庫復活済み）`);
        } else {
          console.log(`  ✗ ボタンが見つからない`);
          failCount++;
        }
      }
    } catch (e) {
      console.log(`  ✗ エラー: ${e.message.substring(0, 60)}`);
      failCount++;
    }

    // 途中保存
    if (successCount % 10 === 0 && successCount > 0) {
      fs.writeFileSync(registeredPath, JSON.stringify([...registered], null, 2));
      console.log(`  💾 途中保存: ${registered.size}件登録済み`);
    }

    await sleep(DELAY);
  }

  // 最終保存
  fs.writeFileSync(registeredPath, JSON.stringify([...registered], null, 2));

  console.log(`\n=== 完了 ===`);
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${failCount}件`);
  console.log(`登録済み合計: ${registered.size}件`);

  browser.disconnect();
}

main().catch(console.error);
