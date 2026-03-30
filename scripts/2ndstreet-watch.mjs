/**
 * セカストオンライン ホビー新着監視スクリプト
 *
 * Scrapfly経由でセカストのbot対策を突破し、新着商品をDiscordに通知する。
 *
 * 使い方:
 *   node scripts/2ndstreet-watch.mjs [間隔(分)] [価格下限] [価格上限]
 *   例: node scripts/2ndstreet-watch.mjs 60 1000 60000
 *   デフォルト: 60分間隔、価格フィルタなし
 *
 * 初回: 新着1ページ目を取得して全商品を記録+通知
 * 2回目以降: 前回取得済みIDと比較して新着のみ通知
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== 設定 =====
const SCRAPFLY_KEY = 'scp-live-204d6f76815a493fbd309b9466ce4f35';
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1471121436130279475/b3DGIXUKz7WRYT4oIlzuz8Qi9K8XYeW_6F0uAsWKzETlrgsFZrRMNpkr3G0xxypM7b6z';
const TARGET_URL = 'https://www.2ndstreet.jp/search?category=130001&sortBy=arrival';
const DATA_FILE = join(__dirname, '2ndstreet_known_ids.json');

const INTERVAL_MIN = process.argv[2] !== undefined ? parseInt(process.argv[2]) : 60;
const PRICE_MIN = parseInt(process.argv[3]) || 0;
const PRICE_MAX = parseInt(process.argv[4]) || Infinity;

// ===== 既知ID管理 =====
function loadKnownIds() {
  if (existsSync(DATA_FILE)) {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  }
  return { ids: [], lastCheck: null, totalNotified: 0 };
}

function saveKnownIds(data) {
  // 直近5000件だけ保持（メモリ節約）
  if (data.ids.length > 5000) {
    data.ids = data.ids.slice(-5000);
  }
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== Scrapfly経由でページ取得 =====
async function fetchPage(page = 1) {
  const url = page === 1
    ? TARGET_URL
    : `${TARGET_URL}&page=${page}`;

  const params = new URLSearchParams({
    key: SCRAPFLY_KEY,
    url: url,
    asp: 'true',
    render_js: 'true',
    country: 'jp',
  });

  const apiUrl = `https://api.scrapfly.io/scrape?${params}`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(120000) });

  if (!res.ok) {
    const rejectCode = res.headers.get('X-Scrapfly-Reject-Code');
    throw new Error(`Scrapfly HTTP ${res.status}${rejectCode ? ` (${rejectCode})` : ''}`);
  }

  const data = await res.json();
  return data.result.content;
}

// ===== HTML解析 =====
function parseItems(html) {
  const items = [];
  // 商品カードを正規表現で抽出
  const cardRegex = /<li\s+class="js-favorite\s+itemCard"\s+goodsid="(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const id = match[1];
    const card = match[2];

    // ブランド
    const brandMatch = card.match(/<p\s+class="itemCard_brand">([\s\S]*?)<\/p>/);
    const brand = brandMatch ? brandMatch[1].trim() : '';

    // 商品名
    const nameMatch = card.match(/<p\s+class="itemCard_name">([\s\S]*?)<\/p>/);
    const name = nameMatch ? nameMatch[1].trim() : '';

    // 価格
    const priceMatch = card.match(/¥([\d,]+)/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;

    // 状態
    const statusMatch = card.match(/<p\s+class="itemCard_status">([\s\S]*?)<\/p>/);
    const status = statusMatch ? statusMatch[1].trim().replace('商品の状態 : ', '') : '';

    // URL
    const urlMatch = card.match(/href="(\/goods\/detail\/goodsId\/\d+\/shopsId\/\d+)"/);
    const itemUrl = urlMatch ? `https://www.2ndstreet.jp${urlMatch[1]}` : '';

    // 画像
    const imgMatch = card.match(/<img\s+src="([^"]+)"/);
    const image = imgMatch ? imgMatch[1] : '';

    items.push({ id, brand, name, price, status, url: itemUrl, image });
  }

  return items;
}

// ===== Discord通知 =====
async function notifyDiscord(newItems) {
  if (newItems.length === 0) return;

  // 5件ずつ送信（Discordのembed上限は10だが見やすさ重視）
  for (let i = 0; i < newItems.length; i += 5) {
    const batch = newItems.slice(i, i + 5);

    const embeds = batch.map(item => ({
      title: `${item.brand} ${item.name}`.slice(0, 256),
      url: item.url,
      color: 0x00bfff,
      fields: [
        { name: '💰 価格', value: `¥${item.price.toLocaleString()}`, inline: true },
        { name: '📦 状態', value: item.status || '不明', inline: true },
      ],
      thumbnail: item.image ? { url: item.image } : undefined,
      footer: { text: 'セカストオンライン 新着監視' },
    }));

    const payload = {
      content: i === 0
        ? `🆕 **セカスト ホビー新着 ${newItems.length}件**`
        : undefined,
      embeds,
    };

    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Discord rate limit対策
    if (i + 5 < newItems.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ===== メインループ =====
async function check() {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(`[${now}] チェック開始...`);

  try {
    const html = await fetchPage(1);
    const items = parseItems(html);
    console.log(`  取得: ${items.length}件`);

    // 価格フィルタ
    const filtered = items.filter(item => {
      if (PRICE_MIN > 0 && item.price < PRICE_MIN) return false;
      if (PRICE_MAX < Infinity && item.price > PRICE_MAX) return false;
      return true;
    });
    console.log(`  価格フィルタ後: ${filtered.length}件 (${PRICE_MIN}〜${PRICE_MAX === Infinity ? '上限なし' : PRICE_MAX}円)`);

    // 既知IDと比較
    const data = loadKnownIds();
    const knownSet = new Set(data.ids);
    const newItems = filtered.filter(item => !knownSet.has(item.id));

    console.log(`  新着: ${newItems.length}件`);

    if (newItems.length > 0) {
      // Discord通知
      await notifyDiscord(newItems);
      console.log(`  Discord通知完了`);

      // 新着IDを記録
      for (const item of newItems) {
        data.ids.push(item.id);
      }
      data.totalNotified += newItems.length;
    }

    data.lastCheck = now;
    saveKnownIds(data);

    // 残りクレジットを表示（Scrapflyの無料枠1000）
    const used = data.ids.length > 0 ? '（累積チェック回数は既知ID数から推定）' : '';
    console.log(`  累計通知: ${data.totalNotified}件 / 既知ID: ${data.ids.length}件 ${used}`);

  } catch (err) {
    console.error(`  ❌ エラー: ${err.message}`);

    // エラーもDiscordに通知
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `⚠️ **セカスト監視エラー**\n${err.message}`,
        }),
      });
    } catch {}
  }
}

// ===== 実行 =====
console.log('========================================');
console.log('セカストオンライン ホビー新着監視');
console.log(`間隔: ${INTERVAL_MIN}分`);
console.log(`価格フィルタ: ${PRICE_MIN || 'なし'}〜${PRICE_MAX === Infinity ? 'なし' : PRICE_MAX}円`);
console.log('========================================');

// 初回チェック
await check();

// 定期チェック
if (INTERVAL_MIN > 0) {
  console.log(`\n次回チェック: ${INTERVAL_MIN}分後`);
  setInterval(async () => {
    await check();
    console.log(`\n次回チェック: ${INTERVAL_MIN}分後`);
  }, INTERVAL_MIN * 60 * 1000);
}
