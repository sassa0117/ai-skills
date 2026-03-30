/**
 * クリーンスクショをWPにアップして記事ID:5412の画像を差し替える
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env読み込み
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] = rest.join('=').trim();
  }
}
loadEnv();

const SITE = process.env.WP_SITE_URL;
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadImage(filePath, filename, altText) {
  const imageData = fs.readFileSync(filePath);
  const boundary = '----FormBoundary' + Date.now();

  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
  body += `Content-Type: image/png\r\n\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(body, 'utf-8'),
    imageData,
    Buffer.from(`\r\n--${boundary}\r\n`, 'utf-8'),
    Buffer.from(`Content-Disposition: form-data; name="alt_text"\r\n\r\n${altText}\r\n`, 'utf-8'),
    Buffer.from(`--${boundary}--\r\n`, 'utf-8'),
  ]);

  const res = await request(`${SITE}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length,
    },
  }, bodyBuffer);

  if (res.status === 201) {
    console.log(`アップ成功: ${filename} → ID:${res.data.id} / ${res.data.source_url}`);
    return res.data;
  } else {
    console.error(`アップ失敗: ${filename}`, res.status, res.data);
    return null;
  }
}

async function updatePost(postId, content) {
  const body = JSON.stringify({ content });
  const res = await request(`${SITE}/wp-json/wp/v2/posts/${postId}?context=edit`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (res.status === 200) {
    console.log(`記事更新成功: ID:${postId}`);
    return res.data;
  } else {
    console.error('記事更新失敗:', res.status, res.data);
    return null;
  }
}

async function main() {
  const OUTPUT = path.join(__dirname, '..', 'output');

  // 1. 3枚アップロード
  const img01 = await uploadImage(
    path.join(OUTPUT, 'screenshot_01_keyword.png'),
    'screenshot_keyword_register.png',
    'セカストアシストプロ キーワード登録画面'
  );
  const img02 = await uploadImage(
    path.join(OUTPUT, 'screenshot_02_soldout.png'),
    'screenshot_soldout_list.png',
    'セカストアシストプロ 即売れリスト'
  );
  const img03 = await uploadImage(
    path.join(OUTPUT, 'screenshot_03_daily.png'),
    'screenshot_daily_soldout.png',
    '日時売り切れリスト メルカリ相場比較'
  );

  if (!img01 || !img02 || !img03) {
    console.error('画像アップロードに失敗。中断');
    return;
  }

  // 2. 記事HTML読み込み・画像URL差し替え
  const htmlPath = path.join(OUTPUT, 'hiro-tool-guide.html');
  let html = fs.readFileSync(htmlPath, 'utf-8');

  // 旧画像 → 新画像に差し替え
  // ann_01_keyword_register.png → img01
  html = html.replace(
    /https:\/\/sedorisassa\.com\/wp-content\/uploads\/2026\/03\/ann_01_keyword_register\.png/g,
    img01.source_url
  );
  html = html.replace(/wp-image-5404/g, `wp-image-${img01.id}`);
  html = html.replace(/"id":5404/g, `"id":${img01.id}`);

  // ann_02_soldout_list.png → img02
  html = html.replace(
    /https:\/\/sedorisassa\.com\/wp-content\/uploads\/2026\/03\/ann_02_soldout_list\.png/g,
    img02.source_url
  );
  html = html.replace(/wp-image-5405/g, `wp-image-${img02.id}`);
  html = html.replace(/"id":5405/g, `"id":${img02.id}`);

  // ann_04_daily_soldout.png → img03
  html = html.replace(
    /https:\/\/sedorisassa\.com\/wp-content\/uploads\/2026\/03\/ann_04_daily_soldout\.png/g,
    img03.source_url
  );
  html = html.replace(/wp-image-5407/g, `wp-image-${img03.id}`);
  html = html.replace(/"id":5407/g, `"id":${img03.id}`);

  // 更新したHTMLを保存
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('HTML画像参照を更新');

  // 3. WP記事を更新
  await updatePost(5412, html);

  console.log('\n完了。');
  console.log(`  キーワード登録: ${img01.source_url}`);
  console.log(`  即売れリスト: ${img02.source_url}`);
  console.log(`  日時売り切れ: ${img03.source_url}`);
}

main().catch(e => { console.error(e); process.exit(1); });
