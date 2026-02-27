/**
 * HTML→PNG 自動変換スクリプト
 *
 * 使い方:
 *   node scripts/screenshot.js <HTMLファイルパス> [出力PNGパス]
 *
 * 例:
 *   node scripts/screenshot.js "C:\Users\user\Desktop\図解4_時間帯マップ.html"
 *   node scripts/screenshot.js input.html output/図解4.png
 *
 * HTMLファイルを1600x900でレンダリングし、PNGとして保存する。
 * 出力パスを省略した場合は output/ フォルダに同名で保存。
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function screenshot(inputPath, outputPath) {
  const absoluteInput = path.resolve(inputPath);

  if (!fs.existsSync(absoluteInput)) {
    console.error(`エラー: ファイルが見つかりません → ${absoluteInput}`);
    process.exit(1);
  }

  if (!outputPath) {
    const baseName = path.basename(absoluteInput, path.extname(absoluteInput));
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    outputPath = path.join(outputDir, `${baseName}.png`);
  }

  const absoluteOutput = path.resolve(outputPath);

  console.log(`入力: ${absoluteInput}`);
  console.log(`出力: ${absoluteOutput}`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  await page.goto(`file:///${absoluteInput.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

  // 絵文字のレンダリングを待つ
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({
    path: absoluteOutput,
    clip: { x: 0, y: 0, width: 1600, height: 900 }
  });

  await browser.close();
  console.log(`完了! → ${absoluteOutput}`);
}

// 一括変換: ディレクトリ指定時はフォルダ内の全HTMLを変換
async function batchScreenshot(inputDir) {
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.html'));

  if (files.length === 0) {
    console.error(`エラー: ${inputDir} にHTMLファイルがありません`);
    process.exit(1);
  }

  console.log(`${files.length}件のHTMLファイルを変換します...\n`);

  const browser = await puppeteer.launch({ headless: true });

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const baseName = path.basename(file, '.html');
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${baseName}.png`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
    await page.goto(`file:///${inputPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({
      path: outputPath,
      clip: { x: 0, y: 0, width: 1600, height: 900 }
    });
    await page.close();
    console.log(`  ✓ ${file} → ${baseName}.png`);
  }

  await browser.close();
  console.log(`\n全${files.length}件の変換が完了しました!`);
}

// メイン
const input = process.argv[2];
const output = process.argv[3];

if (!input) {
  console.log('使い方:');
  console.log('  単体: node scripts/screenshot.js <HTMLファイル> [出力PNG]');
  console.log('  一括: node scripts/screenshot.js <HTMLフォルダ>');
  process.exit(0);
}

const inputStat = fs.existsSync(input) && fs.statSync(input);

if (inputStat && inputStat.isDirectory()) {
  batchScreenshot(path.resolve(input));
} else {
  screenshot(input, output);
}
