import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { VIDEO_CONFIG } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

/** 一時ファイルディレクトリ */
const TEMP_DIR = resolve(rootDir, "temp");

/**
 * 共通CSSを生成
 */
function getCommonCSS(colors, width, height) {
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${width}px;
  height: ${height}px;
  font-family: 'Noto Sans JP', sans-serif;
  overflow: hidden;
}
.slide {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}
/* ウォーターマーク・ブランド */
.slide-number {
  position: absolute;
  bottom: 28px;
  right: 48px;
  font-size: 20px;
  opacity: 0.35;
  font-weight: 700;
  letter-spacing: 1px;
}
.brand {
  position: absolute;
  bottom: 28px;
  left: 48px;
  font-size: 20px;
  opacity: 0.35;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${colors.primary};
}
.channel-watermark {
  position: absolute;
  top: 28px;
  right: 48px;
  font-size: 20px;
  font-weight: 900;
  opacity: 0.12;
  letter-spacing: 3px;
}
/* 装飾パーツ */
.deco-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.06;
}
.deco-line {
  position: absolute;
  opacity: 0.08;
}`;
}

/**
 * スライドHTMLテンプレートを生成
 */
function buildSlideHTML(slide, index, total, colorScheme) {
  const colors = colorScheme || VIDEO_CONFIG.colors.default;
  const { width, height } = VIDEO_CONFIG;
  const channelName = VIDEO_CONFIG.channelName;
  const siteUrl = VIDEO_CONFIG.siteUrl;
  const type = slide.type || slide.style;

  const { bodyCSS, bodyContent } = buildSlideByType(slide, type, colors, index);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
${getCommonCSS(colors, width, height)}
${bodyCSS}
</style>
</head>
<body>
<div class="slide">
  ${bodyContent}
  <div class="brand"><span class="brand-dot"></span>${siteUrl}</div>
  <div class="slide-number">${index + 1} / ${total}</div>
  <div class="channel-watermark">${channelName}</div>
</div>
</body>
</html>`;
}

/**
 * タイプ別にCSS+HTMLを生成
 */
function buildSlideByType(slide, type, colors, index) {
  switch (type) {
    case "title":
      return buildTitleSlide(slide, colors);
    case "content":
      return buildContentSlide(slide, colors, index);
    case "highlight":
      return buildHighlightSlide(slide, colors);
    case "summary":
      return buildSummarySlide(slide, colors);
    case "closing":
    case "ending":
      return buildEndingSlide(slide, colors);
    default:
      return buildContentSlide(slide, colors, index);
  }
}

// ============================================================
// タイトルスライド
// ============================================================
function buildTitleSlide(slide, colors) {
  const bodyCSS = `
body {
  background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 40%, ${colors.dark} 100%);
  color: #FFFFFF;
}
.title-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 120px;
  position: relative;
  z-index: 1;
}
.title-main {
  font-size: 76px;
  font-weight: 900;
  text-align: center;
  line-height: 1.25;
  text-shadow: 3px 5px 12px rgba(0,0,0,0.35);
  letter-spacing: 2px;
}
.title-deco {
  width: 100px;
  height: 5px;
  background: rgba(255,255,255,0.5);
  border-radius: 3px;
  margin: 28px 0;
}
.title-sub {
  font-size: 38px;
  font-weight: 400;
  text-align: center;
  opacity: 0.9;
  text-shadow: 1px 3px 6px rgba(0,0,0,0.25);
  line-height: 1.5;
}
/* 背景装飾 */
.title-bg-circle1 {
  position: absolute; top: -80px; right: -80px;
  width: 400px; height: 400px; border-radius: 50%;
  background: rgba(255,255,255,0.06);
}
.title-bg-circle2 {
  position: absolute; bottom: -120px; left: -60px;
  width: 500px; height: 500px; border-radius: 50%;
  background: rgba(255,255,255,0.04);
}
.title-bg-stripe {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 80px,
    rgba(255,255,255,0.02) 80px,
    rgba(255,255,255,0.02) 82px
  );
}`;

  const bodyContent = `
<div class="title-bg-circle1"></div>
<div class="title-bg-circle2"></div>
<div class="title-bg-stripe"></div>
<div class="title-wrapper">
  <div class="title-main">${esc(slide.heading || slide.text || "")}</div>
  <div class="title-deco"></div>
  <div class="title-sub">${esc(slide.subheading || "")}</div>
</div>`;

  return { bodyCSS, bodyContent };
}

// ============================================================
// コンテンツスライド（大幅リニューアル）
// ============================================================
function buildContentSlide(slide, colors, index) {
  // 偶数・奇数でレイアウトを変える
  const isEven = index % 2 === 0;
  const accentBg = isEven
    ? `linear-gradient(180deg, ${colors.background} 0%, ${colors.backgroundEnd} 100%)`
    : `linear-gradient(180deg, #FAFBFF 0%, ${colors.backgroundEnd} 100%)`;

  const bodyCSS = `
body {
  background: ${accentBg};
  color: ${colors.text};
}
/* ヘッダーバー */
.content-header {
  background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
  padding: 60px 80px;
  display: flex;
  align-items: center;
  gap: 28px;
  position: relative;
  overflow: hidden;
  min-height: 180px;
}
.content-header::after {
  content: '';
  position: absolute; right: -40px; top: -40px;
  width: 260px; height: 260px;
  background: rgba(255,255,255,0.07);
  border-radius: 50%;
}
.content-header::before {
  content: '';
  position: absolute; left: -20px; bottom: -60px;
  width: 180px; height: 180px;
  background: rgba(255,255,255,0.04);
  border-radius: 50%;
}
.header-num {
  font-size: 64px;
  font-weight: 900;
  color: rgba(255,255,255,0.3);
  font-style: italic;
  min-width: 100px;
}
.header-text {
  font-size: 52px;
  font-weight: 900;
  color: #FFFFFF;
  text-shadow: 2px 3px 6px rgba(0,0,0,0.2);
  line-height: 1.3;
}
/* ボディ */
.content-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 60px 40px;
  gap: 0;
}
/* カード式リスト */
.bullet-card {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 44px 52px;
  margin-bottom: 22px;
  background: rgba(255,255,255,0.92);
  border-radius: 22px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.08);
  border-left: 8px solid ${colors.primary};
}
.bullet-icon {
  width: 64px;
  height: 64px;
  min-width: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, ${colors.primary}, ${colors.accent});
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 900;
  font-size: 32px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
}
.bullet-text {
  font-size: 42px;
  font-weight: 700;
  line-height: 1.4;
  color: ${colors.text};
}
/* 補足テキスト */
.content-note {
  text-align: center;
  font-size: 26px;
  color: ${colors.secondary};
  opacity: 0.7;
  margin-top: 20px;
  font-weight: 700;
}
/* テキスト表示（bullets無し時） */
.content-text-block {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.8;
  text-align: center;
  padding: 40px;
  background: rgba(255,255,255,0.7);
  border-radius: 20px;
  border-left: 8px solid ${colors.primary};
}
/* 装飾 */
.content-deco1 {
  position: absolute; bottom: 60px; right: 60px;
  width: 180px; height: 180px; border-radius: 50%;
  background: ${colors.primary}; opacity: 0.04;
}
.content-deco2 {
  position: absolute; top: 100px; right: -30px;
  width: 120px; height: 120px; border-radius: 50%;
  background: ${colors.accent}; opacity: 0.05;
}`;

  let bodyItems = "";
  if (slide.bullets && slide.bullets.length > 0) {
    bodyItems = slide.bullets
      .map(
        (b, i) => `
<div class="bullet-card">
  <div class="bullet-icon">${i + 1}</div>
  <div class="bullet-text">${esc(b)}</div>
</div>`
      )
      .join("\n");
  } else {
    const text = slide.body || slide.text || "";
    bodyItems = `<div class="content-text-block">${esc(text)}</div>`;
  }

  const noteHTML = slide.note
    ? `<div class="content-note">${esc(slide.note)}</div>`
    : "";
  const highlightHTML = slide.highlight
    ? `<div class="content-note" style="color:${colors.primary};opacity:1;">${esc(slide.highlight)}</div>`
    : "";

  const bodyContent = `
<div class="content-deco1"></div>
<div class="content-deco2"></div>
<div class="content-header">
  <div class="header-num">${String(index + 1).padStart(2, "0")}</div>
  <div class="header-text">${esc(slide.heading || "")}</div>
</div>
<div class="content-body">
  ${bodyItems}
  ${highlightHTML}
  ${noteHTML}
</div>`;

  return { bodyCSS, bodyContent };
}

// ============================================================
// ハイライトスライド
// ============================================================
function buildHighlightSlide(slide, colors) {
  const bodyCSS = `
body {
  background: linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${colors.accent} 100%);
  color: #FFFFFF;
}
.highlight-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 120px;
  position: relative;
  z-index: 1;
}
.highlight-text {
  font-size: 88px;
  font-weight: 900;
  text-align: center;
  line-height: 1.2;
  text-shadow: 4px 6px 16px rgba(0,0,0,0.35);
  letter-spacing: 2px;
  margin-bottom: 32px;
}
.highlight-sub {
  font-size: 38px;
  font-weight: 700;
  text-align: center;
  opacity: 0.85;
  text-shadow: 2px 3px 6px rgba(0,0,0,0.25);
  background: rgba(255,255,255,0.15);
  padding: 14px 40px;
  border-radius: 50px;
}
.hl-deco1 {
  position: absolute; top: -100px; left: -100px;
  width: 450px; height: 450px; border-radius: 50%;
  background: rgba(255,255,255,0.05);
}
.hl-deco2 {
  position: absolute; bottom: -80px; right: -60px;
  width: 350px; height: 350px; border-radius: 50%;
  background: rgba(255,255,255,0.04);
}
.hl-stripe {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 60px,
    rgba(255,255,255,0.015) 60px,
    rgba(255,255,255,0.015) 62px
  );
}`;

  const bodyContent = `
<div class="hl-deco1"></div>
<div class="hl-deco2"></div>
<div class="hl-stripe"></div>
<div class="highlight-wrapper">
  <div class="highlight-text">${esc(slide.text || slide.heading || "")}</div>
  <div class="highlight-sub">${esc(slide.subtext || "")}</div>
</div>`;

  return { bodyCSS, bodyContent };
}

// ============================================================
// まとめスライド
// ============================================================
function buildSummarySlide(slide, colors) {
  const bodyCSS = `
body {
  background: linear-gradient(180deg, #F0FFF4 0%, #E8F5E9 50%, ${colors.backgroundEnd} 100%);
  color: ${colors.text};
}
.summary-header {
  text-align: center;
  padding: 50px 80px 30px;
}
.summary-heading {
  font-size: 52px;
  font-weight: 900;
  color: ${colors.secondary};
  position: relative;
  display: inline-block;
}
.summary-heading::after {
  content: '';
  display: block;
  width: 60%;
  height: 5px;
  background: linear-gradient(90deg, ${colors.primary}, #4CAF50);
  margin: 12px auto 0;
  border-radius: 3px;
}
.summary-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px 100px;
  gap: 20px;
}
.summary-card {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 34px 48px;
  background: rgba(255,255,255,0.9);
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  width: 100%;
  max-width: 1100px;
}
.summary-check {
  width: 56px;
  height: 56px;
  min-width: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4CAF50, #66BB6A);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28px;
  font-weight: 900;
  box-shadow: 0 3px 8px rgba(76,175,80,0.3);
}
.summary-text {
  font-size: 38px;
  font-weight: 700;
  line-height: 1.3;
}
.summary-cta {
  margin-top: 24px;
  padding: 22px 60px;
  background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
  color: #fff;
  font-size: 32px;
  font-weight: 900;
  border-radius: 60px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  letter-spacing: 1px;
}`;

  const points = (slide.points || [])
    .map(
      (p) => `
<div class="summary-card">
  <div class="summary-check">&#10003;</div>
  <div class="summary-text">${esc(p)}</div>
</div>`
    )
    .join("\n");

  const cta = slide.cta
    ? `<div class="summary-cta">${esc(slide.cta)}</div>`
    : "";

  const bodyContent = `
<div class="summary-header">
  <div class="summary-heading">${esc(slide.heading || "まとめ")}</div>
</div>
<div class="summary-body">
  ${points}
  ${cta}
</div>`;

  return { bodyCSS, bodyContent };
}

// ============================================================
// エンディングスライド
// ============================================================
function buildEndingSlide(slide, colors) {
  const bodyCSS = `
body {
  background: linear-gradient(135deg, ${colors.text} 0%, #4A2C17 50%, ${colors.secondary} 100%);
  color: #FFFFFF;
}
.ending-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 120px;
  position: relative;
  z-index: 1;
}
.ending-heading {
  font-size: 58px;
  font-weight: 900;
  text-align: center;
  text-shadow: 3px 5px 12px rgba(0,0,0,0.35);
  margin-bottom: 48px;
}
.ending-cta-box {
  padding: 40px 80px;
  background: rgba(255,107,53,0.2);
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 24px;
  backdrop-filter: blur(4px);
  text-align: center;
}
.ending-cta-text {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.8;
}
.ending-url {
  font-size: 26px;
  margin-top: 36px;
  opacity: 0.5;
  letter-spacing: 2px;
}
.ending-deco1 {
  position: absolute; top: -60px; right: -60px;
  width: 300px; height: 300px; border-radius: 50%;
  background: rgba(255,255,255,0.04);
}
.ending-deco2 {
  position: absolute; bottom: -80px; left: -40px;
  width: 400px; height: 400px; border-radius: 50%;
  background: rgba(255,255,255,0.03);
}`;

  const ctaText = (slide.cta || slide.text || "")
    .replace(/\\n/g, "<br>")
    .replace(/\n/g, "<br>");

  const bodyContent = `
<div class="ending-deco1"></div>
<div class="ending-deco2"></div>
<div class="ending-wrapper">
  <div class="ending-heading">${esc(slide.heading || "ご視聴ありがとうございました")}</div>
  <div class="ending-cta-box">
    <div class="ending-cta-text">${ctaText}</div>
  </div>
  <div class="ending-url">${VIDEO_CONFIG.siteUrl}</div>
</div>`;

  return { bodyCSS, bodyContent };
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 台本JSONからスライドPNG連番画像を生成
 */
export async function renderSlides(script, options = {}) {
  const tempDir = resolve(TEMP_DIR, "slides");
  mkdirSync(tempDir, { recursive: true });

  const slides = script.slides;
  const total = slides.length;
  const colorScheme = options.colorScheme || VIDEO_CONFIG.colors.default;

  console.log(`    スライド数: ${total}`);

  const browser = await puppeteer.launch({ headless: true });
  const slidePaths = [];
  const tempHtmlFiles = [];

  try {
    for (let i = 0; i < total; i++) {
      const slide = slides[i];
      const html = buildSlideHTML(slide, i, total, colorScheme);
      const filename = `slide_${String(i + 1).padStart(3, "0")}.png`;
      const filepath = resolve(tempDir, filename);

      const htmlPath = resolve(tempDir, `_tmp_slide_${i}.html`);
      writeFileSync(htmlPath, html, "utf-8");
      tempHtmlFiles.push(htmlPath);

      const page = await browser.newPage();
      await page.setViewport({
        width: VIDEO_CONFIG.width,
        height: VIDEO_CONFIG.height,
        deviceScaleFactor: VIDEO_CONFIG.deviceScaleFactor,
      });

      const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
      await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 });
      await new Promise((r) => setTimeout(r, VIDEO_CONFIG.fontLoadWait));

      await page.screenshot({
        path: filepath,
        clip: { x: 0, y: 0, width: VIDEO_CONFIG.width, height: VIDEO_CONFIG.height },
      });

      await page.close();
      slidePaths.push(filepath);
      const typeLabel = slide.type || slide.style || "?";
      console.log(`    [${i + 1}/${total}] ${filename} (${typeLabel})`);
    }
  } finally {
    await browser.close();
    for (const htmlPath of tempHtmlFiles) {
      try { unlinkSync(htmlPath); } catch {}
    }
  }

  return { slidePaths, outputDir: tempDir };
}
