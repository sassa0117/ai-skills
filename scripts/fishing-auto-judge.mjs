/**
 * 釣り具即売れリスト → メルカリsold自動検索 → 利益判定 → 登録ワードリスト生成
 *
 * 使い方: node scripts/fishing-auto-judge.mjs
 * 出力: fishing_register_words.txt（ひろさんツール登録用）
 *       fishing_judge_result.html（判定結果ビューア）
 *
 * 判定基準:
 *   ① メルカリに履歴なし → 登録（希少）
 *   ② 履歴あり＋差額取れてる → 登録
 *   ③ 履歴あり＋差額取れてない＋sold件数少ない（市場在庫枯れ） → 登録
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// sedori-research-appのnode_modulesからgenerate-mercari-jwtを借りる
const require = createRequire(
  path.join(ROOT, 'sedori-research-app', 'node_modules', 'x.js')
);
const generateMercariJwt = require('generate-mercari-jwt');

const MERCARI_API_URL = 'https://api.mercari.jp/v2/entities:search';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 型番抽出ロジック（fishing-model-extract.mjsと同じ） =====

const GENERIC_NAMES = [
  /^スピニングリール$/, /^ベイトリール$/, /^(電動・)?両軸リール$/,
  /^電動リール$/, /^リール$/, /^オールドリール$/, /^落込用リール$/,
  /^フライリール$/, /^ヘラ竿$/, /^へら竿$/, /^バスロッド$/,
  /^トラウトロッド$/, /^フライロッド$/, /^磯竿$/, /^渓流竿$/,
  /^船竿$/, /^釣竿$/, /^ロッド$/, /^シーバスロッド$/,
  /^ショアジギングロッド$/, /^ショアジギング$/, /^ジギングロッド$/,
  /^アジングロッド$/, /^タコ専用ロッド$/, /^穴釣りロッド$/,
  /^フィッシングロッド$/, /^フライフィッシングロッド$/,
  /^折りたたみ式ロッド$/, /^ハードルアー$/, /^スイッシャー$/,
  /^ウェーダー$/, /^万力$/, /^ロッドスタンド$/, /^ロッドキーパー$/,
  /^竹竿$/, /^ポータブル冷凍冷蔵車$/, /^オールウェザーセットアップ$/,
  /^電動・両軸リール$/, /^HOLIDAY-COOL$/,
];

function extractSearchKeyword(name) {
  if (!name) return null;
  let cleaned = name.trim();
  if (GENERIC_NAMES.some(re => re.test(cleaned))) return null;
  cleaned = cleaned.replace(/[（(]\s*\d+\s*[）)]/g, '').trim();
  const suffixes = /\s*(電動リール|電動|リール|ロッド|釣り|竿)\s*$/;
  for (let i = 0; i < 5; i++) {
    const prev = cleaned;
    cleaned = cleaned.replace(suffixes, '').trim();
    if (cleaned === prev) break;
  }
  cleaned = cleaned.replace(/\b\d{5,}\b/g, '').trim();
  cleaned = cleaned.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
}

// ===== メルカリ検索 =====

async function searchMercariSold(keyword, limit = 20) {
  try {
    const dpopFn = generateMercariJwt.default || generateMercariJwt;
    const dpop = await dpopFn(MERCARI_API_URL, 'POST');

    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: {
        keyword,
        sort: 'SORT_CREATED_TIME',
        order: 'ORDER_DESC',
        status: ['STATUS_SOLD_OUT'],
      },
    };

    const res = await fetch(MERCARI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        DPoP: dpop,
        'X-Platform': 'web',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Mercari ${res.status}`);
    const data = await res.json();
    return {
      items: (data.items || []).map(i => ({
        name: i.name,
        price: i.price,
        id: i.id,
        date: new Date(i.updated * 1000).toISOString().split('T')[0],
      })),
      numFound: data.meta?.numFound || 0,
    };
  } catch (err) {
    console.error(`  ✗ メルカリ検索失敗: ${err.message}`);
    return { items: [], numFound: 0, error: err.message };
  }
}

// ===== 判定ロジック =====

function judge(item, mercari) {
  const offmallPrice = parseInt(item.price) || 0;

  // ① 履歴なし → 登録（希少）
  if (mercari.numFound === 0) {
    return { action: 'register', reason: '履歴なし（希少）', emoji: '🟢' };
  }

  // sold価格の中央値を計算
  const prices = mercari.items.map(i => i.price).filter(p => p > 0).sort((a, b) => a - b);
  const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;

  // オフモール価格の1.1倍（手数料込み）で利益が出るか
  const costWithFee = offmallPrice * 1.1;
  const profit = median - costWithFee;
  const profitRate = median > 0 ? (profit / costWithFee * 100) : 0;

  // ② 差額取れてる → 登録
  if (profit > 500 && profitRate > 10) {
    return {
      action: 'register',
      reason: `差額あり（中央値¥${median.toLocaleString()} - 仕入¥${offmallPrice.toLocaleString()} = 利益¥${Math.round(profit).toLocaleString()}、ROI ${profitRate.toFixed(0)}%）`,
      emoji: '🟢',
      median,
      profit: Math.round(profit),
      profitRate: profitRate.toFixed(0),
    };
  }

  // ③ 差額なし＋市場在庫枯れ（sold件数5件以下 = 出回り少ない）→ 登録
  if (mercari.numFound <= 5) {
    return {
      action: 'register',
      reason: `在庫枯れ（sold ${mercari.numFound}件のみ、中央値¥${median.toLocaleString()}）`,
      emoji: '🟡',
      median,
    };
  }

  // スキップ
  return {
    action: 'skip',
    reason: `差額なし＋流通あり（sold ${mercari.numFound}件、中央値¥${median.toLocaleString()}、利益¥${Math.round(profit).toLocaleString()}）`,
    emoji: '⚪',
    median,
    profit: Math.round(profit),
  };
}

// ===== メイン =====

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'hiro_fishing_soldout.json'), 'utf-8'));

  // 検索対象を準備
  const targets = [];

  // 型番フィールドあり
  for (const item of data) {
    if (item.modelNumber) {
      targets.push({
        ...item,
        searchKeyword: item.modelNumber,
        source: 'model_field',
      });
    }
  }

  // 商品名から抽出
  for (const item of data) {
    if (!item.modelNumber) {
      const kw = extractSearchKeyword(item.name);
      if (kw) {
        targets.push({
          ...item,
          searchKeyword: kw,
          source: 'name_extract',
        });
      }
    }
  }

  console.log(`\n=== 釣り具 自動判定 ===`);
  console.log(`検索対象: ${targets.length}件\n`);

  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const keyword = item.searchKeyword;
    process.stdout.write(`[${i + 1}/${targets.length}] "${keyword}" ... `);

    const mercari = await searchMercariSold(keyword);
    const judgment = judge(item, mercari);

    results.push({
      ...item,
      mercari,
      judgment,
    });

    console.log(`${judgment.emoji} ${judgment.action} - ${judgment.reason}`);

    // レート制限対策: 1.5秒待ち
    if (i < targets.length - 1) await sleep(1500);
  }

  // === 結果集計 ===
  const toRegister = results.filter(r => r.judgment.action === 'register');
  const toSkip = results.filter(r => r.judgment.action === 'skip');

  console.log(`\n=== 結果 ===`);
  console.log(`登録: ${toRegister.length}件`);
  console.log(`スキップ: ${toSkip.length}件`);

  // === 登録ワード生成 ===
  // ひろさんツールはスペース非対応 → 単語1つで検索できるものだけ「登録OK」
  const autoWords = [];   // そのまま登録できる
  const manualWords = []; // 手動判断が必要

  /**
   * 複数トークンから最も検索に適した1ワードを選ぶ
   * 優先順: 英数字混合の型番 > 長い英字 > 日本語固有名詞
   * 除外: 純粋な数字のみ(4桁以下), 年式(2桁数字), 汎用語
   */
  function pickBestToken(text) {
    const tokens = text.split(/\s+/).filter(t => t.length >= 2);
    const genericTokens = new Set(['MX', 'XR', 'PC', 'SW', 'BB', 'LT', 'MD']);

    // スコアリング
    const scored = tokens.map(t => {
      let score = 0;
      // 英数字混合（型番らしい）: 高スコア
      if (/[A-Za-z]/.test(t) && /\d/.test(t)) score += 50;
      // ハイフンやスラッシュ含む（型番の特徴）
      if (/[-\/]/.test(t)) score += 20;
      // 長さボーナス
      score += Math.min(t.length * 2, 20);
      // 純粋数字は低スコア
      if (/^\d+$/.test(t)) score -= 30;
      // 2桁数字（年式）はさらに低い
      if (/^\d{1,2}$/.test(t)) score -= 50;
      // 5桁以上数字（IDコード）は最低
      if (/^\d{5,}$/.test(t)) score -= 80;
      // 汎用的すぎる短い英字トークンは低い
      if (genericTokens.has(t.toUpperCase())) score -= 20;
      // シリーズ名+年式の結合（15TWINPOWER, 20STELLA等）: 高スコア
      if (/^\d{2}[A-Z]/.test(t) && t.length >= 6) score += 40;
      return { token: t, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.token || null;
  }

  for (const r of toRegister) {
    const kw = r.searchKeyword;
    const name = r.name || '';
    const price = parseInt(r.price) || 0;
    const j = r.judgment;

    // 型番フィールドがあってスペースなし → そのまま使える
    if (r.modelNumber && !r.modelNumber.includes(' ')) {
      if (/^\d+$/.test(r.modelNumber) && r.modelNumber.length <= 4) {
        // 数字だけで短い → 商品名から探す
        const best = pickBestToken(kw);
        if (best) {
          autoWords.push({ word: best, name, price, reason: j.reason, original: kw });
        } else {
          manualWords.push({ word: kw, name, price, reason: j.reason, issue: `型番 "${r.modelNumber}" が汎用的` });
        }
      } else {
        autoWords.push({ word: r.modelNumber, name, price, reason: j.reason });
      }
      continue;
    }

    // スペースなしで4文字以上 → そのまま
    if (!kw.includes(' ') && kw.length >= 4) {
      autoWords.push({ word: kw, name, price, reason: j.reason });
      continue;
    }

    // スペース含む → 最適な1トークンを自動選択
    const best = pickBestToken(kw);
    if (best && best.length >= 4) {
      autoWords.push({ word: best, name, price, reason: j.reason, original: kw });
    } else {
      manualWords.push({ word: kw, name, price, reason: j.reason, issue: '自動選択不可' });
    }
  }

  // === 最終フィルタ: 登録しても意味ないワードを除外 ===
  const TOO_GENERIC = new Set([
    'C3000', 'C2000', '4000S', '600H', '200J', '1000H', '10TH',
  ]);
  // サイズ表記だけ（数字+L/M/S/H等）は汎用的すぎ
  const isSizeOnly = (w) => /^\d+[LMS]-?[A-Z]?$/.test(w) || /^\d+[A-Z]-[A-Z]$/.test(w);
  // ロッドの長さ表記（68L-S, 86ML-S等）
  const isRodSize = (w) => /^\d{2}[LMH]+-?[A-Z\-\.・]+$/.test(w);

  const filtered = autoWords.filter(w => {
    if (TOO_GENERIC.has(w.word)) {
      manualWords.push({ ...w, issue: `"${w.word}" 汎用的すぎ` });
      return false;
    }
    if (isRodSize(w.word) || isSizeOnly(w.word)) {
      manualWords.push({ ...w, issue: `"${w.word}" サイズ表記のみ` });
      return false;
    }
    // 3文字以下は除外
    if (w.word.length <= 3) {
      manualWords.push({ ...w, issue: `"${w.word}" 短すぎ` });
      return false;
    }
    return true;
  });
  autoWords.length = 0;
  autoWords.push(...filtered);

  // 出力
  const wordPath = path.join(ROOT, 'fishing_register_words.txt');
  const lines = [
    `# ひろさんツール登録ワード（自動判定 ${new Date().toISOString().split('T')[0]}）`,
    `# 全${toRegister.length}件 → 登録OK: ${autoWords.length}件 / 要手動: ${manualWords.length}件`,
    '',
    '## 登録OK（単語1つでヒットする）',
    ...autoWords.map(w => `${w.word}\t¥${w.price.toLocaleString()}\t${w.reason}`),
    '',
    '## 要手動（スペース含む or 汎用的）',
    ...manualWords.map(w => `${w.word}\t¥${w.price.toLocaleString()}\t${w.reason}\t※${w.issue}`),
  ];
  fs.writeFileSync(wordPath, lines.join('\n') + '\n', 'utf-8');

  console.log(`\n=== 登録ワード ===`);
  console.log(`\n■ 登録OK（${autoWords.length}件）:`);
  autoWords.forEach((w, i) => console.log(`  ${i + 1}. ${w.word}  (¥${w.price.toLocaleString()})`));
  console.log(`\n■ 要手動（${manualWords.length}件）:`);
  manualWords.forEach((w, i) => console.log(`  ${i + 1}. ${w.word}  → ${w.issue}`));
  console.log(`\nファイル: ${wordPath}`);

  // === HTML結果ビューア ===
  generateResultHTML(results, toRegister, toSkip);
}

function generateResultHTML(results, toRegister, toSkip) {
  const rows = results.map((r, idx) => {
    const j = r.judgment;
    const bgColor = j.action === 'register' ? (j.emoji === '🟢' ? '#e8f5e9' : '#fff8e1') : '#fff';
    const mercariUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(r.searchKeyword)}&status=sold_out`;
    const price = parseInt(r.price) || 0;

    return `<tr style="background:${bgColor}">
      <td>${idx + 1}</td>
      <td>${j.emoji} <strong>${j.action === 'register' ? '登録' : 'スキップ'}</strong></td>
      <td style="max-width:250px">${r.name || ''}</td>
      <td><strong>${r.searchKeyword}</strong></td>
      <td style="text-align:right">¥${price.toLocaleString()}</td>
      <td style="text-align:right">${j.median ? '¥' + j.median.toLocaleString() : '-'}</td>
      <td style="text-align:right">${r.mercari.numFound}</td>
      <td style="font-size:12px">${j.reason}</td>
      <td><a href="${mercariUrl}" target="_blank" style="color:#e53935;font-size:12px">確認</a></td>
    </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>釣り具 判定結果</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 20px; background: #f5f5f5; }
  h1 { font-size: 20px; }
  .stats { margin-bottom: 12px; font-size: 14px; }
  .stats span { display: inline-block; padding: 4px 12px; border-radius: 4px; margin-right: 8px; }
  .reg { background: #c8e6c9; } .skip { background: #eee; }
  table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  th { background: #333; color: #fff; padding: 8px; text-align: left; font-size: 12px; position: sticky; top: 0; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  tr:hover { outline: 2px solid #1976D2; }
  .filter { margin-bottom: 10px; }
  .filter button { padding: 4px 12px; margin-right: 4px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: #fff; }
  .filter button.active { background: #333; color: #fff; }
</style></head><body>
<h1>釣り具 即売れリスト 自動判定結果</h1>
<div class="stats">
  <span class="reg">🟢🟡 登録: ${toRegister.length}件</span>
  <span class="skip">⚪ スキップ: ${toSkip.length}件</span>
</div>
<div class="filter">
  <button class="active" onclick="filter('all',this)">全て</button>
  <button onclick="filter('register',this)">登録のみ</button>
  <button onclick="filter('skip',this)">スキップのみ</button>
</div>
<table><thead><tr>
  <th>#</th><th>判定</th><th>商品名</th><th>検索KW</th><th>オフモール価格</th><th>メルカリ中央値</th><th>sold件数</th><th>理由</th><th>確認</th>
</tr></thead><tbody id="tb">${rows}</tbody></table>
<script>
function filter(type, btn) {
  document.querySelectorAll('.filter button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#tb tr').forEach(row => {
    if (type === 'all') { row.style.display = ''; return; }
    const isReg = row.innerHTML.includes('登録');
    row.style.display = (type === 'register' ? isReg : !isReg) ? '' : 'none';
  });
}
</script></body></html>`;

  const htmlPath = path.join(ROOT, 'fishing_judge_result.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`HTML: ${htmlPath}`);
}

main().catch(console.error);
