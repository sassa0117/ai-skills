const puppeteer = require('puppeteer');
const path = require('path');

const files = [
  '図解_市場構造',
  '図解_5ジャンル比較',
  '図解_3つの反応ポイント',
  '図解_高騰5条件',
  '図解_仕入れ判断フロー'
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  for (const name of files) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const htmlPath = path.resolve('C:/Users/user/Desktop/' + name + '.html');
    const fileUrl = 'file:///' + htmlPath.split('\\').join('/');
    await page.goto(fileUrl);
    await new Promise(r => setTimeout(r, 500));
    const pngPath = 'C:/Users/user/Desktop/' + name + '.png';
    await page.screenshot({ path: pngPath, type: 'png' });
    console.log('Created:', name + '.png');
    await page.close();
  }
  await browser.close();
  console.log('All done');
})();
