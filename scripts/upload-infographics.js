/**
 * インフォグラフィック一括アップロード＆記事挿入スクリプト
 *
 * 1. PNGファイルをWPメディアにアップロード
 * 2. 記事5426のプレースホルダーを画像ブロックに差し替え
 * 3. REST APIで記事を更新
 */

const fs = require('fs');
const path = require('path');

const WP_URL = 'https://sedorisassa.com/wp-json/wp/v2';
const AUTH = 'Basic ' + Buffer.from('sassa:NPiF 2vLM Hdl7 w37Z XS5P vgtl').toString('base64');
const POST_ID = 5426;

// プレースホルダーテキスト → PNGファイル名のマッピング
const MAPPING = [
  { placeholder: '22件の実績サマリー図', file: '01_実績サマリー.png' },
  { placeholder: '値付け判断プロセス図', file: '02_値付け判断プロセス.png' },
  { placeholder: '時間・認知・商圏の3つのズレ図解', file: '03_3つのズレ.png' },
  { placeholder: 'コラボ品の見分けチェックポイント図', file: '04_コラボ品見分け.png' },
  { placeholder: '基本スルー/例外パターン判断図', file: '05_スルー例外判断.png' },
  { placeholder: '狙う作品/避ける作品の比較図', file: '06_狙う避ける比較.png' },
  { placeholder: '5つの型マップ', file: '07_5つの型マップ.png' },
  { placeholder: '缶バッジ vs アクスタ比較図', file: '08_缶バッジvsアクスタ.png' },
  { placeholder: '弱点・注意点まとめ図', file: '09_弱点注意点.png' },
  { placeholder: '3つのフィルター概要図', file: '10_3つのフィルター概要.png' },
  { placeholder: '有料案内チラ見せ図', file: '11_有料案内チラ見せ.png' },
  { placeholder: '3つのフィルター判断フローチャート', file: '12_フィルターフローチャート.png' },
  { placeholder: '通常衣装 vs 限定衣装の見分けビジュアル', file: '13_通常vs限定衣装.png' },
  { placeholder: 'アクスタサイズ比較イメージ', file: '14_サイズ比較.png' },
  { placeholder: '開封済み/未開封の価格差イメージ + フィルター判断チャート', file: '15_開封済み価格差.png' },
  { placeholder: '店舗攻略マップ', file: '16_店舗攻略マップ.png' },
  { placeholder: '店舗タイプ別特徴まとめ図', file: '17_店舗タイプ別.png' },
  { placeholder: '大量入荷パターン図', file: '18_大量入荷パターン.png' },
  { placeholder: '店舗立ち回りまとめ図', file: '19_店舗立ち回り.png' },
  { placeholder: '失敗パターンまとめ図', file: '20_失敗パターン.png' },
  { placeholder: '値付けプロセスフロー図', file: '21_値付けプロセスフロー.png' },
  { placeholder: '駿河屋買取フロー図', file: '22_駿河屋買取フロー.png' },
  { placeholder: '全体マップ（3ステップ × 5つの型 × 3フィルター）', file: '23_全体マップ.png' },
];

const PNG_DIR = path.join(__dirname, '..', 'output', 'infographics', 'png');

async function uploadImage(filePath, fileName) {
  const fileData = fs.readFileSync(filePath);

  const res = await fetch(`${WP_URL}/media`, {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Type': 'image/png',
    },
    body: fileData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed for ${fileName}: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log(`✅ Uploaded: ${fileName} → ID:${data.id} URL:${data.source_url}`);
  return { id: data.id, url: data.source_url };
}

async function getPostContent() {
  const res = await fetch(`${WP_URL}/posts/${POST_ID}?context=edit`, {
    headers: { 'Authorization': AUTH },
  });
  if (!res.ok) throw new Error(`Failed to get post: ${res.status}`);
  const data = await res.json();
  return data.content.raw;
}

async function updatePostContent(content) {
  const res = await fetch(`${WP_URL}/posts/${POST_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update post: ${res.status} ${text}`);
  }
  console.log('✅ Post updated successfully');
}

async function main() {
  console.log('=== Step 1: Upload PNGs to WordPress ===');

  const uploadResults = {};
  for (const item of MAPPING) {
    const filePath = path.join(PNG_DIR, item.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }
    try {
      const result = await uploadImage(filePath, item.file);
      uploadResults[item.placeholder] = result;
    } catch (e) {
      console.error(`❌ ${e.message}`);
    }
  }

  console.log(`\n=== Step 2: Get current post content ===`);
  let content = await getPostContent();

  console.log(`\n=== Step 3: Replace placeholders with images ===`);
  let replacedCount = 0;

  for (const item of MAPPING) {
    const result = uploadResults[item.placeholder];
    if (!result) continue;

    // プレースホルダーパターン: <div style="...">📷 図解画像: XXXX</div>
    const placeholderPattern = `<div style="background:#f0f4f8;border:2px dashed #aab;border-radius:8px;padding:24px;text-align:center;color:#667;font-size:14px;margin:16px 0;">📷 図解画像: ${item.placeholder}</div>`;

    // WPのimageブロック形式で差し替え
    const altText = item.placeholder;
    const imageBlock = `<!-- wp:image {"id":${result.id},"sizeSlug":"full","linkDestination":"none"} -->
<figure class="wp-block-image size-full"><img src="${result.url}" alt="${altText}" class="wp-image-${result.id}"/></figure>
<!-- /wp:image -->`;

    if (content.includes(placeholderPattern)) {
      content = content.replace(placeholderPattern, imageBlock);
      replacedCount++;
      console.log(`✅ Replaced: ${item.placeholder}`);
    } else {
      console.warn(`⚠️ Placeholder not found: ${item.placeholder}`);
    }
  }

  console.log(`\nReplaced ${replacedCount}/${MAPPING.length} placeholders`);

  if (replacedCount > 0) {
    console.log(`\n=== Step 4: Update post ===`);
    await updatePostContent(content);
  } else {
    console.log('No replacements made, skipping update');
  }

  // ローカルにも最新版を保存
  const outputPath = path.join(__dirname, '..', 'output', 'acsta-5426-with-images.html');
  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`\nLocal copy saved: ${outputPath}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
