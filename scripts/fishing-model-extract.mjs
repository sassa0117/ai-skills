/**
 * 釣り具即売れリストから型番を抽出し、メルカリ検索リンク付きHTMLを生成
 *
 * 使い方: node scripts/fishing-model-extract.mjs
 * 出力: fishing_search_list.html
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'hiro_fishing_soldout.json'), 'utf-8'));

// 汎用名（型番抽出不可能）のパターン
const GENERIC_NAMES = [
  /^スピニングリール$/,
  /^ベイトリール$/,
  /^(電動・)?両軸リール$/,
  /^電動リール$/,
  /^リール$/,
  /^オールドリール$/,
  /^落込用リール$/,
  /^フライリール$/,
  /^ヘラ竿$/,
  /^へら竿$/,
  /^バスロッド$/,
  /^トラウトロッド$/,
  /^フライロッド$/,
  /^磯竿$/,
  /^渓流竿$/,
  /^船竿$/,
  /^釣竿$/,
  /^ロッド$/,
  /^シーバスロッド$/,
  /^ショアジギングロッド$/,
  /^ショアジギング$/,
  /^ジギングロッド$/,
  /^アジングロッド$/,
  /^タコ専用ロッド$/,
  /^穴釣りロッド$/,
  /^フィッシングロッド$/,
  /^フライフィッシングロッド$/,
  /^折りたたみ式ロッド$/,
  /^ハードルアー$/,
  /^スイッシャー$/,
  /^ウェーダー$/,
  /^万力$/,
  /^ロッドスタンド$/,
  /^ロッドキーパー$/,
  /^竹竿$/,
  /^ポータブル冷凍冷蔵車$/,
  /^オールウェザーセットアップ$/,
  /^電動・両軸リール$/,
];

/**
 * 商品名から検索用キーワードを抽出
 * オフモールの商品名パターン:
 *   [年式] [シリーズ名] [モデル型番] [付属コード（括弧内）]
 */
function extractSearchKeyword(name) {
  if (!name) return null;

  let cleaned = name.trim();

  // 汎用名チェック
  if (GENERIC_NAMES.some(re => re.test(cleaned))) return null;

  // 括弧内のIDコード（数字のみ）を削除: （00061216）, (297748)
  cleaned = cleaned.replace(/[（(]\s*\d+\s*[）)]/g, '').trim();

  // 汎用サフィックスを繰り返し削除（末尾から順に剥がす）
  const suffixes = /\s*(電動リール|電動|リール|ロッド|釣り|竿)\s*$/;
  for (let i = 0; i < 5; i++) {
    const prev = cleaned;
    cleaned = cleaned.replace(suffixes, '').trim();
    if (cleaned === prev) break;
  }

  // 連続する数字のみのIDっぽいもの（5桁以上）を削除
  cleaned = cleaned.replace(/\b\d{5,}\b/g, '').trim();

  // 全角スペースを半角に
  cleaned = cleaned.replace(/　/g, ' ').trim();

  // 連続スペースを1つに
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned || cleaned.length < 2) return null;

  return cleaned;
}

// --- 処理 ---

// グループ1: 型番フィールドあり
const withModel = data.filter(i => i.modelNumber);

// グループ2: 型番フィールドなし → 商品名から抽出
const withoutModel = data.filter(i => !i.modelNumber);
const extracted = [];
const generic = [];

for (const item of withoutModel) {
  const keyword = extractSearchKeyword(item.name);
  if (keyword) {
    extracted.push({ ...item, extractedKeyword: keyword });
  } else {
    generic.push(item);
  }
}

console.log(`=== 結果 ===`);
console.log(`型番フィールドあり: ${withModel.length}件`);
console.log(`商品名から抽出成功: ${extracted.length}件`);
console.log(`汎用名のみ（捨て）: ${generic.length}件`);
console.log(`合計検索対象: ${withModel.length + extracted.length}件`);

console.log(`\n--- 抽出結果サンプル ---`);
extracted.forEach(item => {
  console.log(`  "${item.name}" → "${item.extractedKeyword}"`);
});

// メルカリ検索URL生成
function mercariSearchUrl(keyword) {
  return `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&status=sold_out&category_id=1328`;
  // category_id=1328 = フィッシング
}

// HTML生成
function generateHTML() {
  const allItems = [
    ...withModel.map(i => ({
      ...i,
      searchKeyword: i.modelNumber + (i.brand ? ` ${i.brand}` : ''),
      source: 'model_field',
    })),
    ...extracted.map(i => ({
      ...i,
      searchKeyword: i.extractedKeyword,
      source: 'name_extract',
    })),
  ];

  // 価格の高い順にソート
  allItems.sort((a, b) => (parseInt(b.price) || 0) - (parseInt(a.price) || 0));

  const rows = allItems.map((item, idx) => {
    const mercariUrl = mercariSearchUrl(item.searchKeyword);
    const offmallUrl = item.offmallUrl || '#';
    const price = parseInt(item.price) || 0;
    const priceStr = price.toLocaleString();
    const sourceLabel = item.source === 'model_field' ? '型番' : '抽出';
    const sourceBadge = item.source === 'model_field'
      ? '<span style="background:#2196F3;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px">型番</span>'
      : '<span style="background:#FF9800;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px">抽出</span>';

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${sourceBadge}</td>
        <td style="max-width:300px">${item.name || ''}</td>
        <td><strong>${item.searchKeyword}</strong></td>
        <td style="text-align:right">¥${priceStr}</td>
        <td>${item.brand || '-'}</td>
        <td>
          <a href="${mercariUrl}" target="_blank" style="background:#e53935;color:#fff;padding:4px 10px;border-radius:4px;text-decoration:none;font-size:12px;white-space:nowrap">メルカリ検索</a>
        </td>
        <td>
          <a href="${offmallUrl}" target="_blank" style="color:#1976D2;font-size:12px">オフモール</a>
        </td>
      </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>釣り具 即売れリスト - メルカリ検索</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 20px; background: #f5f5f5; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .stats { color: #666; margin-bottom: 16px; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  th { background: #333; color: #fff; padding: 8px 10px; text-align: left; font-size: 13px; position: sticky; top: 0; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
  tr:hover { background: #f0f7ff; }
  .filter { margin-bottom: 12px; }
  .filter input { padding: 6px 12px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; width: 300px; }
  .note { background: #fff3e0; padding: 10px; border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
</style>
</head>
<body>
<h1>釣り具 即売れリスト → メルカリ検索</h1>
<div class="stats">
  型番あり: ${withModel.length}件 / 商品名から抽出: ${extracted.length}件 / 合計: ${allItems.length}件（汎用名 ${generic.length}件は除外）
</div>
<div class="note">
  <strong>判断基準:</strong>
  ① メルカリに履歴なし → 登録（希少）
  ② 履歴あり＋差額取れてる → 登録
  ③ 履歴あり＋差額なし＋市場在庫枯れ → 登録
</div>
<div class="filter">
  <input type="text" id="search" placeholder="絞り込み（商品名・キーワード）" oninput="filterRows()">
</div>
<table>
<thead>
  <tr>
    <th>#</th>
    <th>種別</th>
    <th>商品名</th>
    <th>検索キーワード</th>
    <th>価格</th>
    <th>ブランド</th>
    <th>メルカリ</th>
    <th>オフモール</th>
  </tr>
</thead>
<tbody id="tbody">
${rows}
</tbody>
</table>
<script>
function filterRows() {
  const q = document.getElementById('search').value.toLowerCase();
  const rows = document.querySelectorAll('#tbody tr');
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

const html = generateHTML();
const htmlPath = path.join(ROOT, 'fishing_search_list.html');
fs.writeFileSync(htmlPath, html, 'utf-8');
console.log(`\nHTML生成: ${htmlPath}`);
