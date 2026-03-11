const puppeteer = require('puppeteer');
const fs = require('fs');

const imageUrls = [
  'https://sedorisassa.com/wp-content/uploads/2025/08/%E5%90%8D%E7%A7%B0%E6%9C%AA%E8%A8%AD%E5%AE%9A%E3%81%AE%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3.zip-8-1024x576.png',
  'https://sedorisassa.com/wp-content/uploads/2024/12/Untitled-design-1-1-1024x538.png',
  'https://sedorisassa.com/wp-content/uploads/2025/01/Untitled-design-28.png',
  'https://sedorisassa.com/wp-content/uploads/2025/01/Untitled-design-18.png',
  'https://sedorisassa.com/wp-content/uploads/2024/12/Untitled-design-22.png',
  'https://sedorisassa.com/wp-content/uploads/2025/09/LINE_ALBUM_202509-%E7%89%B9%E5%85%B8_250926_9-1024x576.jpg',
  'https://sedorisassa.com/wp-content/uploads/2025/12/LINE_ALBUM_E588A9E79B8AE59586E59381E7B4B9E4BB8B-E5AE8CE6889020251204_251207_21.jpg',
  'https://sedorisassa.com/wp-content/uploads/2025/04/%E5%90%8D%E7%A7%B0%E6%9C%AA%E8%A8%AD%E5%AE%9A%E3%81%AE%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3.zip-32-1024x576.png',
  'https://sedorisassa.com/wp-content/uploads/2025/04/%E5%90%8D%E7%A7%B0%E6%9C%AA%E8%A8%AD%E5%AE%9A%E3%81%AE%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3.zip-8-1024x576.png',
  'https://sedorisassa.com/wp-content/uploads/2025/04/%E5%90%8D%E7%A7%B0%E6%9C%AA%E8%A8%AD%E5%AE%9A%E3%81%AE%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3.zip-24-1024x576.png',
  'https://sedorisassa.com/wp-content/uploads/2025/03/Untitled-design-21-1024x538.png',
  'https://sedorisassa.com/wp-content/uploads/2024/12/Untitled-design-5-1.png',
  'https://sedorisassa.com/wp-content/uploads/2025/08/%E5%90%8D%E7%A7%B0%E6%9C%AA%E8%A8%AD%E5%AE%9A%E3%81%AE%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3.zip-4-1024x576.png',
  'https://sedorisassa.com/wp-content/uploads/2025/05/IMG_6491-1024x576.jpeg',
  'https://sedorisassa.com/wp-content/uploads/2025/12/LINE_ALBUM_E588A9E79B8AE59586E59381E7B4B9E4BB8B-E5AE8CE6889020251204_251207_17.jpg',
  'https://sedorisassa.com/wp-content/uploads/2025/05/IMG_6496-1024x576.jpeg',
  'https://sedorisassa.com/wp-content/uploads/2025/06/%E5%90%8D%E7%A7%B0%E6%9C%AA%E8%A8%AD%E5%AE%9A%E3%81%AE%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3.zip-1-1-1024x576.png',
  'https://sedorisassa.com/wp-content/uploads/2026/01/4-1024x576.jpg',
];

async function downloadAsBase64(url) {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ext = url.match(/\.(png|jpg|jpeg)$/i);
    const mime = ext && (ext[1].toLowerCase() === 'jpg' || ext[1].toLowerCase() === 'jpeg') ? 'image/jpeg' : 'image/png';
    return 'data:' + mime + ';base64,' + Buffer.from(buf).toString('base64');
  } catch (e) {
    console.log('Failed:', url.substring(url.lastIndexOf('/') + 1));
    return null;
  }
}

(async () => {
  console.log('Downloading images...');
  const base64Images = [];
  for (const url of imageUrls) {
    const b64 = await downloadAsBase64(url);
    if (b64) base64Images.push(b64);
  }
  console.log('Downloaded:', base64Images.length, 'images');

  const imgTags = base64Images.map(b => `<img src="${b}">`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif; background: #f0f4f8; position: relative; }

.photo-grid {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(3, 1fr);
  gap: 3px; padding: 3px; opacity: 0.25; filter: blur(2px);
}
.photo-grid img { width: 100%; height: 100%; object-fit: cover; }

.overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(255,255,255,0.82);
}

.content {
  position: relative; z-index: 10; width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 24px 60px;
}

.top-catch {
  color: #1E40AF; font-size: 22px; font-weight: 900;
  letter-spacing: 2px; margin-bottom: 8px;
}

.main-title {
  font-size: 56px; font-weight: 900; text-align: center;
  line-height: 1.25; color: #0f172a; letter-spacing: 2px;
}
.main-title .bracket { color: #F59E0B; }
.main-title .sub { display: block; font-size: 48px; margin-top: 2px; }

.sub-catch {
  font-size: 20px; font-weight: 800; color: #334155;
  margin-top: 10px; letter-spacing: 1px;
}
.sub-catch .orange { color: #F59E0B; font-size: 24px; }

.tags { display: flex; gap: 10px; margin-top: 18px; }
.tag {
  background: #EFF6FF; border: 2px solid #3B82F6; color: #1E40AF;
  font-size: 16px; font-weight: 800; padding: 6px 16px; border-radius: 8px;
}

.bubble {
  position: absolute; top: 30px; right: 40px; z-index: 20;
  background: #3B82F6; color: #fff; font-size: 16px; font-weight: 900;
  padding: 10px 18px; border-radius: 14px; letter-spacing: 1px;
  box-shadow: 0 4px 12px rgba(59,130,246,0.3);
}
.bubble::after {
  content: ''; position: absolute; bottom: -10px; right: 20px;
  width: 0; height: 0; border-left: 10px solid transparent;
  border-right: 10px solid transparent; border-top: 12px solid #3B82F6;
}

.stamp {
  position: absolute; bottom: 30px; left: 40px; z-index: 20;
  background: #DC2626; color: #fff; font-size: 18px; font-weight: 900;
  padding: 10px 20px; border-radius: 50%; width: 90px; height: 90px;
  display: flex; align-items: center; justify-content: center;
  text-align: center; line-height: 1.2; transform: rotate(-12deg);
  box-shadow: 0 4px 12px rgba(220,38,38,0.3); border: 3px solid #fff;
}

.bottom-tags {
  position: absolute; bottom: 28px; right: 40px; z-index: 20;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
}
.btag {
  background: rgba(30,64,175,0.9); color: #fff; font-size: 14px; font-weight: 800;
  padding: 5px 14px; border-radius: 6px; letter-spacing: 1px;
}
</style>
</head>
<body>
<div class="photo-grid">
${imgTags}
</div>
<div class="overlay"></div>

<div class="bubble">狙うは限定品！</div>
<div class="stamp">利益<br>GET!</div>
<div class="bottom-tags">
  <div class="btag">📊 実売データ34商品</div>
  <div class="btag">📈 高騰5条件を解説</div>
  <div class="btag">🔍 判断フロー付き</div>
</div>

<div class="content">
  <div class="top-catch">知識ゼロ・低資金で始める！</div>
  <div class="main-title">
    <span class="bracket">【完全版】</span>アニメグッズ
    <span class="sub">仕入れの教科書</span>
  </div>
  <div class="sub-catch">5ジャンル・全34商品の実売データで<span class="orange">月5万</span>稼ぐ</div>
  <div class="tags">
    <div class="tag">🗿 フィギュア</div>
    <div class="tag">🔵 缶バッジ</div>
    <div class="tag">🧸 ぬいぐるみ</div>
    <div class="tag">🏷 アクスタ</div>
    <div class="tag">🎰 一番くじ</div>
  </div>
</div>
</body>
</html>`;

  const tmpHtml = 'C:/Users/user/tmp/eyecatch_embedded.html';
  fs.writeFileSync(tmpHtml, html);
  console.log('HTML saved');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.goto('file:///' + tmpHtml.split('\\').join('/'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));

  const pngPath = 'C:/Users/user/Downloads/アイキャッチ_アニメグッズせどり.png';
  await page.screenshot({ path: pngPath, type: 'png' });
  console.log('PNG created:', pngPath);

  await browser.close();
})();
