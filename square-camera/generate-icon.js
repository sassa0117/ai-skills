const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

async function generateIcon(htmlContent, outputPath, size) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(htmlContent);
  await page.screenshot({ path: outputPath, type: "png", omitBackground: true });
  await browser.close();
}

const foregroundHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 432px; height: 432px; display: flex; align-items: center; justify-content: center; background: transparent; }
  .cam {
    width: 220px; height: 180px;
    background: linear-gradient(135deg, #1a6fc4 0%, #2196F3 40%, #64B5F6 100%);
    border-radius: 24px;
    position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 8px 32px rgba(33,150,243,0.3);
  }
  .cam::before {
    content: '';
    position: absolute;
    top: -18px; left: 60px;
    width: 50px; height: 22px;
    background: linear-gradient(135deg, #1565C0, #1E88E5);
    border-radius: 6px 6px 0 0;
  }
  .lens-ring {
    width: 100px; height: 100px;
    border-radius: 50%;
    border: 6px solid rgba(255,255,255,0.85);
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.15);
  }
  .lens-inner {
    width: 60px; height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #90CAF9 0%, #1565C0 50%, #0D47A1 100%);
    position: relative;
  }
  .lens-inner::after {
    content: '';
    position: absolute;
    top: 12px; left: 14px;
    width: 18px; height: 12px;
    background: rgba(255,255,255,0.35);
    border-radius: 50%;
    transform: rotate(-30deg);
  }
  .flash {
    position: absolute;
    top: 20px; right: 30px;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle, #FFF9C4 30%, #FFD54F 100%);
    box-shadow: 0 0 8px rgba(255,213,79,0.6);
  }
  /* Square frame overlay in corner */
  .square-mark {
    position: absolute;
    bottom: 16px; right: 16px;
    width: 28px; height: 28px;
    border: 3px solid rgba(255,255,255,0.9);
    border-radius: 3px;
  }
</style></head>
<body>
  <div class="cam">
    <div class="cam-top"></div>
    <div class="lens-ring">
      <div class="lens-inner"></div>
    </div>
    <div class="flash"></div>
    <div class="square-mark"></div>
  </div>
</body></html>`;

const backgroundHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { width: 432px; height: 432px; background: linear-gradient(145deg, #E3F2FD 0%, #BBDEFB 50%, #90CAF9 100%); }
</style></head>
<body></body></html>`;

const mainIconHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1024px; height: 1024px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(145deg, #E3F2FD 0%, #BBDEFB 40%, #90CAF9 100%);
    border-radius: 200px;
  }
  .cam {
    width: 520px; height: 420px;
    background: linear-gradient(135deg, #1a6fc4 0%, #2196F3 40%, #64B5F6 100%);
    border-radius: 56px;
    position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 16px 64px rgba(33,150,243,0.35);
  }
  .cam::before {
    content: '';
    position: absolute;
    top: -42px; left: 140px;
    width: 120px; height: 50px;
    background: linear-gradient(135deg, #1565C0, #1E88E5);
    border-radius: 14px 14px 0 0;
  }
  .lens-ring {
    width: 230px; height: 230px;
    border-radius: 50%;
    border: 14px solid rgba(255,255,255,0.85);
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.15);
  }
  .lens-inner {
    width: 140px; height: 140px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #90CAF9 0%, #1565C0 50%, #0D47A1 100%);
    position: relative;
  }
  .lens-inner::after {
    content: '';
    position: absolute;
    top: 28px; left: 32px;
    width: 42px; height: 28px;
    background: rgba(255,255,255,0.35);
    border-radius: 50%;
    transform: rotate(-30deg);
  }
  .flash {
    position: absolute;
    top: 45px; right: 70px;
    width: 32px; height: 32px;
    border-radius: 50%;
    background: radial-gradient(circle, #FFF9C4 30%, #FFD54F 100%);
    box-shadow: 0 0 16px rgba(255,213,79,0.6);
  }
  .square-mark {
    position: absolute;
    bottom: 36px; right: 36px;
    width: 64px; height: 64px;
    border: 7px solid rgba(255,255,255,0.9);
    border-radius: 6px;
  }
</style></head>
<body>
  <div class="cam">
    <div class="lens-ring">
      <div class="lens-inner"></div>
    </div>
    <div class="flash"></div>
    <div class="square-mark"></div>
  </div>
</body></html>`;

const monochromeHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 432px; height: 432px; display: flex; align-items: center; justify-content: center; background: transparent; }
  .cam {
    width: 220px; height: 180px;
    background: white;
    border-radius: 24px;
    position: relative;
    display: flex; align-items: center; justify-content: center;
  }
  .cam::before {
    content: '';
    position: absolute;
    top: -18px; left: 60px;
    width: 50px; height: 22px;
    background: white;
    border-radius: 6px 6px 0 0;
  }
  .lens-ring {
    width: 90px; height: 90px;
    border-radius: 50%;
    border: 6px solid white;
    background: transparent;
  }
  .square-mark {
    position: absolute;
    bottom: 16px; right: 16px;
    width: 28px; height: 28px;
    border: 3px solid white;
    border-radius: 3px;
  }
</style></head>
<body>
  <div class="cam">
    <div class="lens-ring"></div>
    <div class="square-mark"></div>
  </div>
</body></html>`;

(async () => {
  const assetsDir = path.join(__dirname, "assets");

  await generateIcon(foregroundHTML, path.join(assetsDir, "android-icon-foreground.png"), 432);
  console.log("✓ foreground");

  await generateIcon(backgroundHTML, path.join(assetsDir, "android-icon-background.png"), 432);
  console.log("✓ background");

  await generateIcon(mainIconHTML, path.join(assetsDir, "icon.png"), 1024);
  console.log("✓ icon");

  await generateIcon(monochromeHTML, path.join(assetsDir, "android-icon-monochrome.png"), 432);
  console.log("✓ monochrome");

  // splash icon
  await generateIcon(mainIconHTML, path.join(assetsDir, "splash-icon.png"), 1024);
  console.log("✓ splash");

  console.log("Done!");
})();
