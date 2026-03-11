const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });

  const htmlPath = path.resolve('C:/Users/user/Desktop/アイキャッチ_アニメグッズせどり.html');
  const fileUrl = 'file:///' + htmlPath.split('\\').join('/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait extra for external images
  await new Promise(r => setTimeout(r, 3000));

  const pngPath = 'C:/Users/user/Desktop/アイキャッチ_アニメグッズせどり.png';
  await page.screenshot({ path: pngPath, type: 'png' });
  console.log('Created:', pngPath);

  await browser.close();
})();
