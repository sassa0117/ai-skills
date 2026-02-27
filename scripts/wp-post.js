/**
 * WordPress REST API 記事投稿スクリプト
 *
 * 使い方:
 *   node scripts/wp-post.js <記事HTMLファイル> [--title "タイトル"] [--status draft|publish] [--type post|page]
 *
 * 例:
 *   node scripts/wp-post.js article.html --title "電脳せどり攻略法" --status draft
 *   node scripts/wp-post.js article.html --title "商品紹介記事" --status publish
 *   node scripts/wp-post.js article.html --title "固定ページ" --type page --status draft
 *
 * 事前に .env ファイルにWordPressの認証情報を設定してください。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// .env読み込み（dotenv不要の簡易実装）
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('エラー: .env ファイルが見つかりません');
    console.error('.env.example をコピーして .env を作成し、認証情報を設定してください');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] = rest.join('=').trim();
  }
}

// HTTPリクエスト
function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// 画像アップロード
async function uploadImage(imagePath, siteUrl, auth) {
  const absolutePath = path.resolve(imagePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`  画像が見つかりません: ${absolutePath}`);
    return null;
  }

  const imageData = fs.readFileSync(absolutePath);
  const fileName = path.basename(absolutePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  const contentType = mimeTypes[ext] || 'image/png';

  const url = `${siteUrl}/wp-json/wp/v2/media`;

  const res = await request(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    }
  }, imageData);

  if (res.status === 201) {
    console.log(`  画像アップロード完了: ${res.data.source_url}`);
    return res.data;
  } else {
    console.error(`  画像アップロード失敗 (${res.status}):`, res.data.message || res.data);
    return null;
  }
}

// 記事投稿（post or page）
async function postArticle(htmlPath, title, status, images, type) {
  loadEnv();

  const siteUrl = process.env.WP_SITE_URL;
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  if (!siteUrl || !username || !appPassword) {
    console.error('エラー: .env に WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD を設定してください');
    process.exit(1);
  }

  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const htmlContent = fs.readFileSync(path.resolve(htmlPath), 'utf-8');

  // 画像がある場合はアップロード
  let featuredImageId = null;
  const uploadedImages = [];

  if (images && images.length > 0) {
    console.log('\n画像をアップロード中...');
    for (const img of images) {
      const uploaded = await uploadImage(img, siteUrl, auth);
      if (uploaded) {
        uploadedImages.push(uploaded);
        // 最初の画像をアイキャッチに
        if (!featuredImageId) featuredImageId = uploaded.id;
      }
    }
  }

  // 記事投稿
  console.log('\n記事を投稿中...');

  const postData = JSON.stringify({
    title: title,
    content: htmlContent,
    status: status,
    ...(featuredImageId && { featured_media: featuredImageId })
  });

  const endpoint = type === 'page' ? 'pages' : 'posts';
  const url = `${siteUrl}/wp-json/wp/v2/${endpoint}`;
  const res = await request(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    }
  }, postData);

  if (res.status === 201) {
    console.log(`\n投稿完了!`);
    console.log(`  タイトル: ${res.data.title.rendered}`);
    console.log(`  ステータス: ${res.data.status}`);
    console.log(`  URL: ${res.data.link}`);
    console.log(`  編集: ${siteUrl}/wp-admin/post.php?post=${res.data.id}&action=edit`);
    return res.data;
  } else {
    console.error(`\n投稿失敗 (${res.status}):`, res.data.message || res.data);
    process.exit(1);
  }
}

// 引数パース
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { htmlPath: null, title: '無題の記事', status: 'draft', type: 'post', images: [] };

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--title' && args[i + 1]) {
      result.title = args[i + 1];
      i += 2;
    } else if (args[i] === '--status' && args[i + 1]) {
      result.status = args[i + 1];
      i += 2;
    } else if (args[i] === '--type' && args[i + 1]) {
      result.type = args[i + 1];
      i += 2;
    } else if (args[i] === '--image' && args[i + 1]) {
      result.images.push(args[i + 1]);
      i += 2;
    } else if (!args[i].startsWith('--')) {
      result.htmlPath = args[i];
      i++;
    } else {
      i++;
    }
  }

  return result;
}

// メイン
const args = parseArgs();

if (!args.htmlPath) {
  console.log('使い方:');
  console.log('  node scripts/wp-post.js <記事HTML> [オプション]');
  console.log('');
  console.log('オプション:');
  console.log('  --title "タイトル"     記事タイトル（デフォルト: 無題の記事）');
  console.log('  --status draft|publish  公開状態（デフォルト: draft）');
  console.log('  --type post|page        投稿タイプ（デフォルト: post）');
  console.log('  --image <画像パス>      アップロードする画像（複数指定可）');
  console.log('');
  console.log('例:');
  console.log('  node scripts/wp-post.js article.html --title "攻略法3選" --status draft');
  console.log('  node scripts/wp-post.js article.html --title "攻略法3選" --image eyecatch.png --image 図解1.png');
  process.exit(0);
}

postArticle(args.htmlPath, args.title, args.status, args.images, args.type);
