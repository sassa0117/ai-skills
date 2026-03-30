/**
 * 入荷通知ワード自動抽出 日次巡回スクリプト
 *
 * 1. ひろさんツールの即売れリストをスクレイプ（前回との差分のみ）
 * 2. オフモール商品ページから実際のブランド・型番を取得（汎用名も含め全件）
 * 3. 1単語で登録できる型番を抽出
 * 4. メルカリsold自動検索 → 利益判定
 * 5. CSVファイル生成 → Discord送信
 *
 * 使い方:
 *   node scripts/fishing-daily.mjs [カテゴリ] [リストタイプ]
 *   例: node scripts/fishing-daily.mjs fishing soldout
 *
 * カテゴリ: fishing / toy_hobby / game / card / pc / instrument / smartphone / car_bike / golf
 * リストタイプ: soldout（即売れ） / daily（日時売り切れ）
 *
 * 自動実行: Windowsタスクスケジューラ or start-fishing-daily.bat
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'fishing-daily');

// sedori-research-appのnode_modulesから借りる
const require = createRequire(
  path.join(ROOT, 'sedori-research-app', 'node_modules', 'x.js')
);
const generateMercariJwt = require('generate-mercari-jwt');

const MERCARI_API_URL = 'https://api.mercari.jp/v2/entities:search';
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1471121436130279475/b3DGIXUKz7WRYT4oIlzuz8Qi9K8XYeW_6F0uAsWKzETlrgsFZrRMNpkr3G0xxypM7b6z';

// ===== offmall-keyword-watcher API =====
const WATCHER_API_URL = 'https://offmall-keyword-watcher-production.up.railway.app';
const WATCHER_ADMIN_EMAIL = 'admin@offmall-watcher.com';
const WATCHER_ADMIN_PASSWORD = 'Cloudysassa0624';

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
function today() { return new Date().toISOString().split('T')[0]; }
function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

function log(msg) {
  const line = `[${now()}] ${msg}`;
  console.log(line);
  // ログファイルにも追記
  fs.appendFileSync(path.join(DATA_DIR, 'fishing-daily.log'), line + '\n');
}

// ===== データディレクトリ初期化 =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== 既知IDの管理 =====
function getKnownIdsPath(category, listType) {
  return path.join(DATA_DIR, `known_${category}_${listType}.json`);
}

function loadKnownIds(category, listType) {
  const p = getKnownIdsPath(category, listType);
  if (!fs.existsSync(p)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(p, 'utf-8')));
}

function saveKnownIds(category, listType, ids) {
  fs.writeFileSync(getKnownIdsPath(category, listType), JSON.stringify([...ids], null, 2));
}

// ===== Chrome接続 =====
async function connectChrome() {
  let browser;
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const data = await res.json();
    browser = await puppeteer.connect({ browserWSEndpoint: data.webSocketDebuggerUrl });
    log('既存Chromeに接続');
  } catch (e) {
    log('Chrome起動中...');
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
        log(`  接続待ち... (${retry + 1}/15)`);
      }
    }
  }
  return browser;
}

// ===== ログイン =====
async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);
  if (!page.url().includes('login')) { log('ログイン済み'); return true; }

  log('ログイン実行中...');
  const emailInput = await page.$('input[type="email"], input[name="email"], input[name="username"]');
  if (emailInput) { await emailInput.click({ clickCount: 3 }); await emailInput.type('sassa@gmail.com'); }
  const passInput = await page.$('input[type="password"], input[name="password"]');
  if (passInput) { await passInput.click({ clickCount: 3 }); await passInput.type('sassa0110'); }
  const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await sleep(2000);
  }

  if (page.url().includes('login')) {
    log('自動ログイン失敗。手動ログインが必要です。');
    // 自動実行時はDiscordに通知して終了
    await sendDiscordMessage('⚠️ 日次巡回: ログイン失敗。手動でChromeにログインしてください。');
    return false;
  }
  log('ログイン完了');
  return true;
}

// ===== ページスクレイプ =====
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
      let itemId = null, modelNumber = null;
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
        });
      }
    });
    return results;
  });
}

async function scrapeAllPages(page, url) {
  log(`ページ取得: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  const { totalCount, totalPages } = await page.evaluate(() => {
    const titleEl = document.querySelector('[class*="soldoutResearch-resultTitle"]');
    const countMatch = titleEl?.textContent?.match(/全\s*([\d,]+)\s*件/);
    const total = countMatch ? parseInt(countMatch[1].replace(/,/g, '')) : null;
    const pagBtns = document.querySelectorAll('[class*="MuiPaginationItem-page"]');
    let maxPage = 1;
    pagBtns.forEach(btn => { const n = parseInt(btn.textContent); if (!isNaN(n) && n > maxPage) maxPage = n; });
    return { totalCount: total, totalPages: maxPage };
  });

  log(`総件数: ${totalCount}件 / ${totalPages}ページ`);

  let allItems = await scrapeCurrentPage(page);
  log(`  ページ 1/${totalPages}: ${allItems.length}件`);

  for (let p = 2; p <= totalPages; p++) {
    const clicked = await page.evaluate((targetPage) => {
      const btns = document.querySelectorAll('[class*="MuiPaginationItem-page"]');
      for (const btn of btns) { if (btn.textContent.trim() === String(targetPage)) { btn.click(); return true; } }
      const nextBtn = document.querySelector('[aria-label="Go to next page"]');
      if (nextBtn) { nextBtn.click(); return true; }
      return false;
    }, p);

    if (!clicked) { log(`  ページ ${p} ボタンなし、中断`); break; }
    await sleep(2000);
    await page.waitForSelector('[class*="soldoutResearch-card"]', { timeout: 10000 }).catch(() => {});
    await sleep(1000);

    const pageItems = await scrapeCurrentPage(page);
    log(`  ページ ${p}/${totalPages}: ${pageItems.length}件`);
    allItems = allItems.concat(pageItems);
  }

  // 重複除去
  const seen = new Set();
  return allItems.filter(item => { if (seen.has(item.itemId)) return false; seen.add(item.itemId); return true; });
}

// ===== オフモール商品ページから実データ取得 =====
async function fetchOffmallDetail(offmallUrl) {
  try {
    const res = await fetch(offmallUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 商品が削除されている場合
    if (html.includes('対象の商品はございません')) return null;

    const brand = html.match(/product-detail-cate-name">\s*([^<]+)/)?.[1]?.trim() || null;
    const model = html.match(/product-detail-num">型番：([^<]+)/)?.[1]?.trim() || null;
    const name = html.match(/class="item-name">([^<]+)/)?.[1]?.trim() || null;

    return { brand, model, name };
  } catch (err) {
    return null;
  }
}

// 全アイテムのオフモール詳細を取得（レート制限付き）
async function enrichWithOffmall(items) {
  log(`オフモール詳細取得: ${items.length}件`);
  let enriched = 0, failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const detail = await fetchOffmallDetail(item.offmallUrl);

    if (detail) {
      // オフモールのデータで上書き/補完
      if (detail.brand) item.offmallBrand = detail.brand;
      if (detail.model) item.offmallModel = detail.model;
      if (detail.name) item.offmallName = detail.name;
      enriched++;
    } else {
      failed++;
    }

    if (i % 20 === 0 && i > 0) log(`  ${i}/${items.length} 取得済み（成功:${enriched} 失敗:${failed}）`);

    // レート制限: 1秒間隔
    if (i < items.length - 1) await sleep(1000);
  }

  log(`オフモール詳細完了: 成功${enriched}件 / 失敗${failed}件`);
  return items;
}

// ===== 共通ユーティリティ =====

/** HTMLエンティティをデコード */
function decodeHtmlEntities(str) {
  return str
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");
}

/** 5桁以上の純数字（管理番号）を除去 */
function stripManagementNumbers(str) {
  return str.replace(/\b\d{5,}\b/g, '').trim();
}

/** 釣り具カテゴリの汎用ワード（型番・検索キーワードとして無意味） */
const GENERIC_FISHING_WORDS = new Set([
  'バス', 'トラウト', 'ヘラ', 'フライ', 'ジギング', 'アジング', 'メバリング',
  'ショアジギング', 'エギング', 'シーバス', 'チニング', 'タイラバ',
  'スピニング', 'ベイト', '両軸', '電動・両軸', '渓流',
  'リール', 'ロッド', '竿', '釣り', '電動リール',
  'ロッドスタンド', 'ロッドケース', 'タックルボックス', 'ルアーケース',
  'ウェーダー', '万力', 'ロッドキーパー',
  'ポータブル冷凍冷蔵車', '折りたたみ式',
]);

/** 汎用ワードかどうか判定 */
function isGenericWord(word) {
  if (GENERIC_FISHING_WORDS.has(word)) return true;
  // 純ひらがな/カタカナのみで5文字以下 → カテゴリ名の可能性が高い
  if (/^[\u3040-\u309F\u30A0-\u30FF]{1,5}$/.test(word)) return true;
  return false;
}

// ===== 型番抽出（オフモール情報を活用） =====

/** 型番フィールドの共通クリーニング */
function cleanModel(raw) {
  let m = raw.trim();
  m = decodeHtmlEntities(m);
  // 状態表記を除去
  m = m.replace(/\s*(箱付|極美品|美品|新品|中古|付属品|ジャンク品?)\s*/g, '').trim();
  // 管理番号（5桁以上の純数字）を除去
  m = stripManagementNumbers(m);
  m = m.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  return m;
}

/**
 * メルカリ検索用キーワードを構築する（利益判定用）
 * ブランド+型番の複合ワードOK。精度重視。
 */
function buildSearchKeyword(item) {
  const brand = item.offmallBrand || item.brand || null;

  // 1. オフモール型番があればそれを使う
  if (item.offmallModel) {
    const model = cleanModel(item.offmallModel);
    if (model && model.length >= 2 && !isGenericWord(model)) {
      const keyword = brand ? `${brand} ${model}` : model;
      return { keyword, model, source: 'offmall_model', brand };
    }
  }

  // 2. ひろさんツールの型番
  if (item.modelNumber) {
    const model = cleanModel(item.modelNumber);
    if (model && model.length >= 2 && !isGenericWord(model)) {
      const keyword = brand ? `${brand} ${model}` : model;
      return { keyword, model, source: 'hiro_model', brand };
    }
  }

  // 3. ひろさんツールの商品名から推測
  if (item.name) {
    let cleaned = decodeHtmlEntities(item.name.trim());
    cleaned = cleaned.replace(/[（(]\s*\d+\s*[）)]/g, '').trim();
    const suffixes = /\s*(電動リール|電動|リール|ロッド|釣り|竿)\s*$/;
    for (let i = 0; i < 5; i++) { const prev = cleaned; cleaned = cleaned.replace(suffixes, '').trim(); if (cleaned === prev) break; }
    cleaned = stripManagementNumbers(cleaned);
    cleaned = cleaned.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned && cleaned.length >= 2 && !isGenericWord(cleaned)) {
      const keyword = brand ? `${brand} ${cleaned}` : cleaned;
      return { keyword, model: cleaned, source: 'hiro_name', brand };
    }
  }

  return null;
}

// ===== メルカリ検索 =====
async function searchMercariSold(keyword, limit = 20) {
  try {
    const dpopFn = generateMercariJwt.default || generateMercariJwt;
    const dpop = await dpopFn(MERCARI_API_URL, 'POST');
    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: { keyword, sort: 'SORT_CREATED_TIME', order: 'ORDER_DESC', status: ['STATUS_SOLD_OUT'] },
    };
    const res = await fetch(MERCARI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', DPoP: dpop, 'X-Platform': 'web' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Mercari ${res.status}`);
    const data = await res.json();
    return {
      items: (data.items || []).map(i => ({ name: i.name, price: i.price, id: i.id })),
      numFound: data.meta?.numFound || 0,
    };
  } catch (err) {
    log(`  ✗ メルカリ検索失敗 [${keyword}]: ${err.message}`);
    return { items: [], numFound: 0, error: err.message };
  }
}

// ===== 判定 =====
function judge(item, mercari) {
  const offmallPrice = parseInt(item.price) || 0;
  if (mercari.numFound === 0) return { action: 'register', reason: '履歴なし（希少）', median: 0, profit: 0, roi: 0 };

  const prices = mercari.items.map(i => i.price).filter(p => p > 0).sort((a, b) => a - b);
  const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
  const cost = offmallPrice * 1.1;
  const profit = median - cost;
  const roi = cost > 0 ? (profit / cost * 100) : 0;

  if (profit > 500 && roi > 10) return { action: 'register', reason: '差額あり', median, profit: Math.round(profit), roi: Math.round(roi) };
  if (mercari.numFound <= 5) return { action: 'register', reason: '在庫枯れ', median, profit: Math.round(profit), roi: Math.round(roi) };
  return { action: 'skip', reason: 'スキップ', median, profit: Math.round(profit), roi: Math.round(roi) };
}

// ===== keyword-watcher API連携 =====

/** keyword-watcherにログインしてJWTを取得 */
async function watcherLogin() {
  try {
    const res = await fetch(`${WATCHER_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: WATCHER_ADMIN_EMAIL, password: WATCHER_ADMIN_PASSWORD }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
  } catch (err) {
    log(`keyword-watcher ログイン失敗: ${err.message}`);
    return null;
  }
}

/** 登録済みキーワード一覧を取得 */
async function watcherGetKeywords(token) {
  const res = await fetch(`${WATCHER_API_URL}/api/keywords`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET keywords failed: ${res.status}`);
  return res.json();
}

/** キーワードを1件登録 */
async function watcherRegisterKeyword(token, keyword, genre = null) {
  const res = await fetch(`${WATCHER_API_URL}/api/keywords`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ keyword, enabled: true, genre }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST keyword failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ===== Discord送信 =====
async function sendDiscordMessage(content) {
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (e) {
    log(`Discord送信失敗: ${e.message}`);
  }
}


// ===== メイン =====
async function main() {
  const category = process.argv[2] || 'fishing';
  const listType = process.argv[3] || 'soldout';

  log(`\n========== 日次巡回 開始 ==========`);
  log(`カテゴリ: ${category} / リスト: ${listType}`);

  // --- Step 1: ひろさんツールスクレイプ ---
  const knownIds = loadKnownIds(category, listType);
  log(`既知ID: ${knownIds.size}件`);

  const browser = await connectChrome();
  if (!browser) {
    log('Chrome接続失敗');
    await sendDiscordMessage('❌ 日次巡回: Chrome接続失敗');
    return;
  }

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  const loggedIn = await login(page);
  if (!loggedIn) return;

  const allItems = await scrapeAllPages(page, URLS[listType](category));
  log(`取得完了: ${allItems.length}件`);

  // 差分抽出
  const newItems = allItems.filter(item => !knownIds.has(item.itemId));
  log(`新規: ${newItems.length}件（既知スキップ: ${allItems.length - newItems.length}件）`);

  if (newItems.length === 0) {
    log('新規なし。終了。');
    await sendDiscordMessage(`🎣 日次巡回 (${today()})\n新規: 0件。変化なし。`);
    return;
  }

  // 既知IDを更新
  allItems.forEach(item => knownIds.add(item.itemId));
  saveKnownIds(category, listType, knownIds);

  // --- Step 2: オフモールから実データ取得 ---
  await enrichWithOffmall(newItems);

  // --- Step 3: 検索対象を準備（全件をオフモール情報で補完済み） ---
  const targets = [];
  let noKeyword = 0;
  for (const item of newItems) {
    const result = buildSearchKeyword(item);
    if (result) {
      targets.push({ ...item, searchKeyword: result.keyword, model: result.model, source: result.source, resolvedBrand: result.brand });
    } else {
      noKeyword++;
    }
  }

  log(`検索対象: ${targets.length}件（キーワード抽出不可: ${noKeyword}件）`);

  // --- Step 4: メルカリ判定 ---
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] "${item.searchKeyword}" ... `);
    const mercari = await searchMercariSold(item.searchKeyword);
    const judgment = judge(item, mercari);
    results.push({ ...item, mercari, judgment });
    console.log(`${judgment.action === 'register' ? '✓' : '✗'} ${judgment.reason}`);
    if (i < targets.length - 1) await sleep(1500);
  }

  const toRegister = results.filter(r => r.judgment.action === 'register');

  log(`判定完了: 登録${toRegister.length}件 / スキップ${results.length - toRegister.length}件`);

  // --- Step 5: keyword-watcher APIに直接登録（複合キーワードOK） ---
  let registered = 0, skippedDup = 0, apiFailed = 0;

  if (toRegister.length > 0) {
    const watcherToken = await watcherLogin();
    if (watcherToken) {
      // 既登録キーワードを取得して重複チェック
      const existing = await watcherGetKeywords(watcherToken);
      const existingSet = new Set(existing.map(k => k.keyword.toLowerCase()));

      for (const item of toRegister) {
        const keyword = item.searchKeyword; // ブランド+型番の複合ワード
        if (existingSet.has(keyword.toLowerCase())) {
          skippedDup++;
          continue;
        }

        try {
          await watcherRegisterKeyword(watcherToken, keyword, category);
          existingSet.add(keyword.toLowerCase());
          registered++;
          log(`  ✓ 登録: ${keyword}`);
        } catch (err) {
          apiFailed++;
          log(`  ✗ 登録失敗: ${keyword} - ${err.message}`);
        }

        await sleep(500);
      }

      log(`API登録完了: 新規${registered}件 / 重複スキップ${skippedDup}件 / 失敗${apiFailed}件`);
    } else {
      log('keyword-watcher APIログイン失敗。登録スキップ。');
      apiFailed = toRegister.length;
    }
  }

  // --- Step 6: Discord送信 ---
  const summary = [
    `**${category} 日次巡回** (${today()})`,
    `新規: ${newItems.length}件 → 利益あり: ${toRegister.length}件 / スキップ: ${results.length - toRegister.length}件`,
    `入荷通知登録: 新規${registered}件 / 重複${skippedDup}件${apiFailed > 0 ? ` / 失敗${apiFailed}件` : ''}`,
  ].join('\n');

  await sendDiscordMessage(summary);

  log(`========== 完了 ==========\n`);
}

main().catch(async (err) => {
  log(`致命的エラー: ${err.message}`);
  await sendDiscordMessage(`❌ 日次巡回エラー:\n\`\`\`${err.message}\`\`\``);
  process.exit(1);
});
