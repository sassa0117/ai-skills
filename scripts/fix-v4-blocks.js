#!/usr/bin/env node
/**
 * acsta-article-v4.html のSANGOブロックを正規フォーマットに修正するスクリプト
 *
 * 1. 見出し: whitesmoke → var(--sgb-pastel-color)
 * 2. 画像: 余計な属性を削除
 * 3. テーブル: blockId連番→UUID、scopedCSSにコメント追加
 * 4. 改行: H2前3行、H3/H4前2行の空パラグラフ挿入
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'output', 'acsta-article-v4.html');
const outputPath = path.join(__dirname, '..', 'output', 'acsta-article-v5.html');

let html = fs.readFileSync(inputPath, 'utf8');
let lines = html.split('\n');

// --- Stats ---
let stats = { headings: 0, images: 0, tables: 0, spacingH2: 0, spacingH3H4: 0 };

// ============================================================
// 1. 見出し: whitesmoke → var(--sgb-pastel-color)
// ============================================================
lines = lines.map(line => {
  if (line.includes('wp:sgb/headings')) {
    if (line.includes('"headingBgColor1":"whitesmoke"')) {
      line = line.replace(
        '"headingBgColor1":"whitesmoke"',
        '"headingBgColor1":"var(\\u002d\\u002dsgb-pastel-color)"'
      );
      stats.headings++;
    }
  }
  if (line.includes('sgb-heading__inner') && line.includes('background-color:whitesmoke;')) {
    line = line.replace('background-color:whitesmoke;', 'background-color:var(--sgb-pastel-color);');
  }
  return line;
});

// ============================================================
// 2. 画像: 余計な属性を削除
// ============================================================
lines = lines.map(line => {
  // 開始コメント
  if (line.includes('<!-- wp:image {"id":0,"sizeSlug":"large","linkDestination":"none"} -->')) {
    line = line.replace(
      '<!-- wp:image {"id":0,"sizeSlug":"large","linkDestination":"none"} -->',
      '<!-- wp:image -->'
    );
    stats.images++;
  }
  // figure/img タグ
  if (line.includes('wp-block-image size-large') && line.includes('wp-image-0')) {
    line = line.replace(
      '<figure class="wp-block-image size-large"><img src="" alt="" class="wp-image-0"/></figure>',
      '<figure class="wp-block-image"><img alt=""/></figure>'
    );
  }
  return line;
});

// ============================================================
// 3. テーブル: blockId連番→UUID、scopedCSSにコメント追加
// ============================================================
function generateBlockId() {
  const uuid = crypto.randomUUID();
  return `id-${uuid}`;
}

lines = lines.map(line => {
  if (!line.includes('wp:table') || !line.includes('blockId')) return line;

  // blockIdを抽出
  const oldIdMatch = line.match(/"blockId":"(id-v4-\d+)"/);
  if (!oldIdMatch) return line;

  const oldId = oldIdMatch[1];
  const newId = generateBlockId();

  // blockId を全置換（css, scopedCSS, blockId属性すべて）
  line = line.split(oldId).join(newId);

  // scopedCSS にコメントを追加（まだない場合）
  // パターン: "scopedCSS":"#id-xxx table tr td {
  // → "scopedCSS":"/* 右線 */\n#id-xxx table tr td {
  if (line.includes('"scopedCSS":"#')) {
    line = line.replace(
      `"scopedCSS":"#${newId} table tr td {`,
      `"scopedCSS":"/* 右線 */\\n#${newId} table tr td {`
    );
  }

  // 太さ調整: }\\n# → }\\n/* 太さ調整 */\\n# (2番目のルール)
  // scopedCSS内の "!important;\\n}\\n#id table td," を探す
  const taisaPattern = `!important;\\n}\\n#${newId} table td,`;
  const taisaReplace = `!important;\\n}\\n/* 太さ調整 */\\n#${newId} table td,`;
  if (line.includes(taisaPattern) && !line.includes(`/* 太さ調整 */\\n#${newId} table td,`)) {
    line = line.replace(taisaPattern, taisaReplace);
  }

  // 色調整: }\\n# → }\\n/* 色調整 */\\n# (last-child td border-color)
  const iroPattern = `*1px);\\n}\\n#${newId} table tr:last-child td {\\n\\tborder-color`;
  const iroReplace = `*1px);\\n}\\n/* 色調整 */\\n#${newId} table tr:last-child td {\\n\\tborder-color`;
  if (line.includes(iroPattern) && !line.includes(`/* 色調整 */\\n#${newId} table tr:last-child`)) {
    line = line.replace(iroPattern, iroReplace);
  }

  // 角丸調整: }\\n# → }\\n/* 角丸調整 */\\n# (first-child td:last-child border-top-right)
  const kadomaruPattern = `!important;\\n}\\n#${newId} table tr:first-child td:last-child`;
  const kadomaruReplace = `!important;\\n}\\n/* 角丸調整 */\\n#${newId} table tr:first-child td:last-child`;
  if (line.includes(kadomaruPattern) && !line.includes(`/* 角丸調整 */\\n#${newId} table tr:first-child`)) {
    line = line.replace(kadomaruPattern, kadomaruReplace);
  }

  stats.tables++;
  return line;
});

// ============================================================
// 4. 改行: H2前3行、H3/H4前2行の空パラグラフ挿入
// ============================================================
const emptyParagraph = '<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->';

const newLines = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // H2見出しの開始を検出
  if (line.includes('<!-- wp:sgb/headings') && !line.includes('headingTag')) {
    // headingTagがない = H2（デフォルト）
    // 前の行が空パラグラフでなければ挿入
    const prevContent = newLines.length > 0 ? newLines[newLines.length - 1] : '';
    if (i > 0 && !prevContent.includes('<!-- /wp:paragraph -->')) {
      // 3つの空パラグラフ
      for (let j = 0; j < 3; j++) {
        newLines.push('');
        newLines.push(emptyParagraph);
        stats.spacingH2++;
      }
    }
  }
  // H3/H4見出しの開始を検出
  else if (line.includes('<!-- wp:sgb/headings') && (line.includes('"headingTag":"h3"') || line.includes('"headingTag":"h4"'))) {
    const prevContent = newLines.length > 0 ? newLines[newLines.length - 1] : '';
    if (i > 0 && !prevContent.includes('<!-- /wp:paragraph -->')) {
      // 2つの空パラグラフ
      for (let j = 0; j < 2; j++) {
        newLines.push('');
        newLines.push(emptyParagraph);
        stats.spacingH3H4++;
      }
    }
  }

  newLines.push(line);
}

// ============================================================
// 出力
// ============================================================
const output = newLines.join('\n');
fs.writeFileSync(outputPath, output, 'utf8');

console.log('=== 修正完了 ===');
console.log(`見出し背景色修正: ${stats.headings} 箇所`);
console.log(`画像ブロック修正: ${stats.images} 箇所`);
console.log(`テーブルUUID化+CSS修正: ${stats.tables} 箇所`);
console.log(`H2前 空パラグラフ追加: ${stats.spacingH2} 個`);
console.log(`H3/H4前 空パラグラフ追加: ${stats.spacingH3H4} 個`);
console.log(`\n入力: ${inputPath}`);
console.log(`出力: ${outputPath}`);
console.log(`行数: ${lines.length} → ${newLines.length}`);
