#!/usr/bin/env node
// ブログの利益商品紹介ページから H2（=商品名）を全件抽出して products.json に保存

const fs = require('fs');
const path = require('path');

const WP = 'https://sedorisassa.com/wp-json/wp/v2';

// 利益商品が掲載されている可能性のあるページ/投稿のキーワード
const SEARCH_TERMS = [
  '利益商品',
  '利益商品紹介',
];

// HTML エンティティ簡易デコード
function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  return decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

async function fetchAllSearch(term) {
  const results = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${WP}/search?search=${encodeURIComponent(term)}&per_page=50&page=${page}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) break;
    results.push(...arr);
    if (arr.length < 50) break;
  }
  return results;
}

async function fetchContent(item) {
  const endpoint = item.subtype === 'page' ? 'pages' : 'posts';
  const url = `${WP}/${endpoint}/${item.id}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const text = await r.text();
    return JSON.parse(text);
  } catch (e) {
    console.log(`  parse error on ${item.id}: ${e.message.slice(0, 80)}`);
    return null;
  }
}

function isProfitProductPage(title) {
  // 利益商品紹介系のタイトルだけを採用
  // ぬいぐるみ教科書系などの単発記事は除外
  return /利益商品紹介|利益商品事例|利益商品まとめ/.test(title)
    || /中古せどりラボ.*利益商品/.test(title);
}

(async () => {
  const seen = new Set();
  const candidates = [];

  for (const term of SEARCH_TERMS) {
    const list = await fetchAllSearch(term);
    for (const item of list) {
      const k = `${item.subtype}-${item.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      candidates.push(item);
    }
  }

  console.log(`候補ページ: ${candidates.length}`);

  // タイトルでフィルタ
  const targets = candidates.filter(c => isProfitProductPage(c.title));
  console.log(`対象ページ: ${targets.length}`);

  // 同じタイトルが post と page の両方にある場合は page 優先
  const byTitle = new Map();
  for (const t of targets) {
    const key = t.title.trim();
    const existing = byTitle.get(key);
    if (!existing) byTitle.set(key, t);
    else if (existing.subtype === 'post' && t.subtype === 'page') byTitle.set(key, t);
  }
  const dedup = [...byTitle.values()];
  console.log(`重複排除後: ${dedup.length}`);

  // 各ページから H2 抽出
  const allProducts = [];
  for (const src of dedup) {
    const content = await fetchContent(src);
    if (!content) { console.log(`SKIP: ${src.id}`); continue; }
    const html = content.content.rendered;
    const h2s = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/g) || [])
      .map(stripTags)
      .filter(s => s.length > 0 && s.length < 200);
    console.log(`${src.id} ${src.title}: ${h2s.length}件`);
    h2s.forEach((name, i) => {
      allProducts.push({
        id: `wp-${src.id}-h2-${i}`,
        name,
        source: {
          pageId: src.id,
          pageTitle: content.title.rendered,
          pageUrl: content.link,
          index: i,
        },
      });
    });
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`総商品数: ${allProducts.length} (重複前)`);

  // 商品名で重複排除（同じ商品が複数月に登場した場合は最新を残す）
  const byName = new Map();
  for (const p of allProducts) {
    const existing = byName.get(p.name);
    if (!existing || (p.source.pageId > existing.source.pageId)) {
      byName.set(p.name, p);
    }
  }
  const finalProducts = [...byName.values()].sort(
    (a, b) => b.source.pageId - a.source.pageId
  );
  console.log(`総商品数: ${finalProducts.length} (重複排除後・新しい順)`);

  const out = {
    fetchedAt: new Date().toISOString(),
    products: finalProducts,
  };
  fs.writeFileSync(path.join(__dirname, 'products.json'), JSON.stringify(out, null, 2));
  console.log('→ products.json 保存');
})().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
