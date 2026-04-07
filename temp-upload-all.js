const fs = require('fs');
const path = require('path');
const https = require('https');

// .env読み込み
const envPath = path.join(__dirname, '.env');
const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [key, ...rest] = trimmed.split('=');
  env[key.trim()] = rest.join('=').trim();
}

const siteUrl = env.WP_SITE_URL || 'https://sedorisassa.com';
const user = env.WP_USERNAME || 'sassa';
const pass = env.WP_APP_PASSWORD || '';
const auth = Buffer.from(user + ':' + pass).toString('base64');

function uploadImage(localPath, wpFileName) {
  return new Promise((resolve, reject) => {
    const imageData = fs.readFileSync(localPath);
    const url = new URL(siteUrl + '/wp-json/wp/v2/media');
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="' + wpFileName + '"',
        'Content-Length': imageData.length
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve({ id: json.id, url: json.source_url });
      });
    });
    req.on('error', reject);
    req.write(imageData);
    req.end();
  });
}

function updatePost(postId, body) {
  return new Promise((resolve, reject) => {
    const jsonBody = JSON.stringify(body);
    const url = new URL(siteUrl + '/wp-json/wp/v2/posts/' + postId);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve(json);
      });
    });
    req.on('error', reject);
    req.write(jsonBody);
    req.end();
  });
}

(async () => {
  // 3画像アップロード
  console.log('Uploading infographic-law...');
  const img1 = await uploadImage('temp-infographic-law.png', 'kobutsu-law-summary.png');
  console.log('  ID:', img1.id, 'URL:', img1.url);

  console.log('Uploading infographic-platform...');
  const img2 = await uploadImage('temp-infographic-platform.png', 'kobutsu-platform-comparison.png');
  console.log('  ID:', img2.id, 'URL:', img2.url);

  console.log('Uploading OGP...');
  const img3 = await uploadImage('temp-ogp-kobutsu.png', 'kobutsu-ogp.png');
  console.log('  ID:', img3.id, 'URL:', img3.url);

  // 記事HTMLを読み込んで画像を挿入
  let content = fs.readFileSync('temp-kobutsu-article.html', 'utf-8');

  // インフォグラフィック1: 「そもそもせどりは違法なのか」セクションの直後（最初のkb-law-boxの前）
  const lawInsertPoint = '<h2 class="kb-section-head">そもそもせどりは違法なのか？</h2>\n<!-- /wp:html -->';
  const lawImage = lawInsertPoint + '\n\n<!-- wp:image {"id":' + img1.id + ',"sizeSlug":"large"} -->\n<figure class="wp-block-image size-large"><img src="' + img1.url + '" alt="古物営業法 せどりに関わる条文まとめ" class="wp-image-' + img1.id + '"/></figure>\n<!-- /wp:image -->';
  content = content.replace(lawInsertPoint, lawImage);

  // インフォグラフィック2: 「仕入れ先ごとの僕の見解」セクションの直後
  const platformInsertPoint = '<h2 class="kb-section-head">仕入れ先ごとの僕の見解</h2>\n<!-- /wp:html -->';
  const platformImage = platformInsertPoint + '\n\n<!-- wp:image {"id":' + img2.id + ',"sizeSlug":"large"} -->\n<figure class="wp-block-image size-large"><img src="' + img2.url + '" alt="仕入れ先ごとの古物営業法リスク比較" class="wp-image-' + img2.id + '"/></figure>\n<!-- /wp:image -->';
  content = content.replace(platformInsertPoint, platformImage);

  // 更新されたHTMLをファイルに保存
  fs.writeFileSync('temp-kobutsu-article.html', content);

  // WP記事更新（content + featured_media）
  console.log('Updating post 5571...');
  const result = await updatePost(5571, {
    content: content,
    featured_media: img3.id
  });
  console.log('Updated! ID:', result.id, 'Status:', result.status, 'Featured:', result.featured_media);

  console.log('\nAll done!');
  console.log('Infographic 1 (law):', img1.id);
  console.log('Infographic 2 (platform):', img2.id);
  console.log('OGP/Eyecatch:', img3.id);
})();
