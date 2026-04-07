const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();

  // 1: 古物営業法まとめ
  const p1 = await browser.newPage();
  await p1.setViewport({ width: 1600, height: 900 });
  const f1 = 'file:///' + path.resolve('temp-infographic-law.html').replace(/\\/g, '/');
  await p1.goto(f1, { waitUntil: 'networkidle0' });
  await p1.screenshot({ path: 'temp-infographic-law.png', type: 'png' });
  console.log('1/3 done');

  // 2: 仕入れ先比較
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1600, height: 900 });
  const f2 = 'file:///' + path.resolve('temp-infographic-platform.html').replace(/\\/g, '/');
  await p2.goto(f2, { waitUntil: 'networkidle0' });
  await p2.screenshot({ path: 'temp-infographic-platform.png', type: 'png' });
  console.log('2/3 done');

  // 3: OGP
  const p3 = await browser.newPage();
  await p3.setViewport({ width: 1200, height: 630 });
  const f3 = 'file:///' + path.resolve('temp-ogp-kobutsu.html').replace(/\\/g, '/');
  await p3.goto(f3, { waitUntil: 'networkidle0' });
  await p3.screenshot({ path: 'temp-ogp-kobutsu.png', type: 'png' });
  console.log('3/3 done');

  await browser.close();
  console.log('All done');
})();
