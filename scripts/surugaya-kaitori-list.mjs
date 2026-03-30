/**
 * 駿河屋 買取価格リスト取得 & 在庫チェックスクリプト
 *
 * 使い方: node scripts/surugaya-kaitori-list.mjs [カテゴリID] [目標件数] [開始ページ] [ソート]
 * 例: node scripts/surugaya-kaitori-list.mjs 500 100
 *     node scripts/surugaya-kaitori-list.mjs 500 100 15   ← ページ15から再開
 *     node scripts/surugaya-kaitori-list.mjs 500 100 0 price:descending  ← 買取価格の高い順
 * ソート: price:descending / price:ascending / modificationTime:descending / modificationTime:ascending / releaseDate:descending / releaseDate:ascending
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.9',
};

// リクエスト間の待機（ms）— 連続リクエストでブロックされないように
const DELAY_BASE = 2000;
// N件チェックごとに追加で待つ
const DELAY_EXTRA_EVERY = 50;
const DELAY_EXTRA_MS = 5000;
// 途中保存の間隔
const SAVE_EVERY = 20;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 買取検索ページから商品ID+買取価格を取得
 */
async function fetchKaitoriList(categoryId, page = 1, rankBy = '') {
  const rankParam = rankBy ? `&rankBy=${rankBy}` : '';
  const url = `https://www.suruga-ya.jp/search_buy?category=${categoryId}&search_word=&page=${page}${rankParam}`;
  console.log(`  取得中: カテゴリ${categoryId} ページ${page}`);

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];

  // 該当件数を取得
  const countText = $('body').text().match(/該当件数[：:][\s]*([0-9,]+)件/);
  const totalCount = countText ? parseInt(countText[1].replace(/,/g, '')) : 0;

  // data-product JSON からshinaban+kakakuを取得
  $('input.checkbox[data-product]').each((_, el) => {
    const $el = $(el);
    try {
      const data = JSON.parse($el.attr('data-product'));
      const productId = data.shinaban;
      const kakaku = data.kakaku; // -1 = メール見積

      // 商品名: 同じブロック内のh3.product-nameから取得
      const $container = $el.closest('tr').length ? $el.closest('tr') : $el.parent();
      const name = $container.find('h3.product-name').text().trim() ||
                   $container.find('a[href*="kaitori_detail"]').first().text().trim();

      if (productId && name) {
        items.push({
          productId,
          shinaban: productId,
          name: name.replace(/\s+/g, ' ').substring(0, 100),
          kaitoriPrice: kakaku > 0 ? kakaku : null,
          isMailEstimate: kakaku === -1,
        });
      }
    } catch (e) { /* skip */ }
  });

  return { items, totalCount };
}

/**
 * 商品詳細ページで在庫状態を確認
 */
async function checkStock(productId) {
  const url = `https://www.suruga-ya.jp/product/detail/${productId}`;

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { inStock: null, sellingPrice: null, error: `HTTP ${res.status}` };

    const html = await res.text();
    const $ = cheerio.load(html);

    // 品切れ判定: div.out-of-stock-text の有無で判定
    const isSoldOut = $('div.out-of-stock-text').length > 0;
    // 補助判定: カートフォームの有無
    const hasCart = $('form.add-cart').length > 0;
    // 他のショップに在庫あり = 市場に出回ってる = 希少じゃない
    const hasOtherShop = $('a[href*="/product/other/"]').length > 0;

    // 販売価格
    const sellingPriceEl = $('span.text-price-detail').first().text().trim();
    const sellingPriceMatch = sellingPriceEl.match(/([0-9,]+)/);
    const sellingPrice = sellingPriceMatch ? parseInt(sellingPriceMatch[1].replace(/,/g, '')) : null;

    // 買取価格（詳細ページにも表示される）
    // 在庫あり: span.price-buy / 品切れ: span.purchase-price
    const kaitoriPriceEl = $('span.price-buy').first().text().trim() || $('span.purchase-price').first().text().trim();
    const kaitoriPriceMatch = kaitoriPriceEl.match(/([0-9,]+)/);
    const kaitoriPrice = kaitoriPriceMatch ? parseInt(kaitoriPriceMatch[1].replace(/,/g, '')) : null;

    return {
      inStock: isSoldOut ? false : hasCart ? true : null,
      hasOtherShop,
      sellingPrice,
      kaitoriPrice,
    };
  } catch (e) {
    return { inStock: null, sellingPrice: null, error: e.message };
  }
}

/**
 * 結果をHTMLファイルに保存
 */
function saveHtml(outOfStock, categoryId, page, checked) {
  const htmlPath = path.join(process.cwd(), `kaitori_${categoryId}.html`);
  const htmlRows = outOfStock.map(r => {
    const url = `https://www.suruga-ya.jp/product/detail/${r.productId}`;
    return `<tr><td>${r.productId}</td><td>${r.name.replace(/</g, '&lt;')}</td><td>${r.kaitoriPrice || '-'}</td><td><a href="${url}" target="_blank">開く</a></td></tr>`;
  }).join('\n');
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>買取リスト 品切れ商品</title>
<style>body{font-family:sans-serif;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}tr:hover{background:#fffbe6}a{color:#0066cc}</style>
</head><body><h2>品切れ商品（カテゴリ${categoryId}）- ${outOfStock.length}件</h2>
<p>最終ページ: ${page} | チェック済: ${checked}件 | 再開コマンド: <code>node scripts/surugaya-kaitori-list.mjs ${categoryId} [目標件数] ${page + 1}</code></p>
<table><tr><th>商品ID</th><th>商品名</th><th>買取価格</th><th>リンク</th></tr>
${htmlRows}</table></body></html>`;
  fs.writeFileSync(htmlPath, html, 'utf-8');
  return htmlPath;
}

/**
 * 結果をJSONに保存（再開用）
 */
function saveProgress(outOfStock, categoryId, page, checked, knownIds) {
  const jsonPath = path.join(process.cwd(), `kaitori_${categoryId}_progress.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ categoryId, lastPage: page, checked, knownIds: [...knownIds], items: outOfStock }, null, 2), 'utf-8');
  return jsonPath;
}

/**
 * 前回の進捗を読み込む
 */
function loadProgress(categoryId) {
  const jsonPath = path.join(process.cwd(), `kaitori_${categoryId}_progress.json`);
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }
  return null;
}

/**
 * メイン処理
 */
async function main() {
  const categoryId = process.argv[2] || '500';
  const targetCount = parseInt(process.argv[3] || '10');
  const startPage = parseInt(process.argv[4] || '0');
  const rankBy = process.argv[5] || '';
  const maxPrice = parseInt(process.argv[6] || '0') || Infinity;
  const minPrice = parseInt(process.argv[7] || '0') || 0;

  let outOfStock = [];
  let page = 1;
  let checked = 0;
  // 既に取得済みの商品IDセット（重複スキップ用）
  const knownIds = new Set();

  // 前回の進捗を読み込む（既知IDを引き継ぐ）
  const prev = loadProgress(categoryId);
  if (prev) {
    if (prev.knownIds) prev.knownIds.forEach(id => knownIds.add(id));
    if (prev.items) prev.items.forEach(item => knownIds.add(item.productId));
  }

  if (startPage > 0) {
    page = startPage;
    if (prev && prev.items) {
      outOfStock = prev.items;
      checked = prev.checked || 0;
      console.log(`\n前回の進捗を読み込み: ${outOfStock.length}件（ページ${page}から再開）`);
    }
  }

  if (knownIds.size > 0) {
    console.log(`既知の商品ID: ${knownIds.size}件（スキップ対象）`);
  }

  console.log(`\n=== 駿河屋 買取リスト取得 ===`);
  console.log(`カテゴリ: ${categoryId}`);
  console.log(`ソート: ${rankBy || '関連順（デフォルト）'}`);
  console.log(`買取価格: ${minPrice > 0 ? minPrice + '円' : '下限なし'} 〜 ${maxPrice < Infinity ? maxPrice + '円' : '上限なし'}`);
  console.log(`目標件数: ${targetCount}件\n`);

  let totalCount = 0;

  while (outOfStock.length < targetCount) {
    // 買取リスト取得
    const result = await fetchKaitoriList(categoryId, page, rankBy);
    if (page === 1 || totalCount === 0) totalCount = result.totalCount;

    if (result.items.length === 0) {
      console.log(`  ページ${page}: 商品なし。終了`);
      break;
    }

    const withPrice = result.items.filter(item => item.kaitoriPrice && item.kaitoriPrice > 0);
    console.log(`  → ${result.items.length}件取得（買取価格あり: ${withPrice.length}件）`);

    // 在庫チェック
    for (const item of withPrice) {
      if (outOfStock.length >= targetCount) break;

      // 既に取得済みならスキップ
      if (knownIds.has(item.productId)) continue;

      // 価格フィルタ
      if (item.kaitoriPrice > maxPrice) continue;
      if (item.kaitoriPrice < minPrice) continue;

      checked++;
      // レート制限対策: N件ごとに追加待機
      if (checked % DELAY_EXTRA_EVERY === 0) {
        console.log(`  ... ${checked}件チェック済、${DELAY_EXTRA_MS / 1000}秒休憩 ...`);
        await sleep(DELAY_EXTRA_MS);
      }
      await sleep(DELAY_BASE);

      const stock = await checkStock(item.productId);
      knownIds.add(item.productId);
      const entry = { ...item, ...stock };

      if (stock.inStock === false && !stock.hasOtherShop) {
        outOfStock.push(entry);
        console.log(`  ✓ [${outOfStock.length}/${targetCount}] ${item.name.substring(0, 50)} (買取${item.kaitoriPrice}円)`);

        // 途中保存
        if (outOfStock.length % SAVE_EVERY === 0) {
          saveProgress(outOfStock, categoryId, page, checked, knownIds);
          saveHtml(outOfStock, categoryId, page, checked);
          console.log(`  💾 途中保存: ${outOfStock.length}件`);
        }
      }
    }

    console.log(`  ページ${page}完了 | 候補${outOfStock.length}/${targetCount} | チェック済${checked}件\n`);
    page++;
    await sleep(DELAY_BASE);
  }

  // 最終保存
  saveProgress(outOfStock, categoryId, page - 1, checked, knownIds);
  const htmlPath = saveHtml(outOfStock, categoryId, page - 1, checked);

  console.log(`=== 完了: ${outOfStock.length}件 ===`);
  console.log(`HTML: ${htmlPath}`);
}

main().catch(console.error);
