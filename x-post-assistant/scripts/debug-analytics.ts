/**
 * Analytics ページのメトリクス抽出テスト（ロード待ち改善版）
 */
import puppeteer, { Browser } from "puppeteer";
import { execSync, spawn } from "child_process";
import * as path from "path";

const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCRAPER_PROFILE = path.join(__dirname, "..", ".scraper-chrome-profile");
const DEBUG_PORT = 9222;
const TEST_URL = "https://x.com/sassasedori/status/2025842224727212530/analytics";

/** スクレイパー専用Chromeだけを終了 */
async function killScraperChrome(): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (res.ok) {
      try {
        const out = execSync(`netstat -ano | findstr :${DEBUG_PORT} | findstr LISTENING`, { encoding: "utf-8" });
        const match = out.match(/LISTENING\s+(\d+)/);
        if (match) {
          execSync(`taskkill /F /PID ${match[1]} /T`, { stdio: "ignore" });
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {}
    }
  } catch {}
}

async function waitForDebugPort(maxWait = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const EXTRACT_ANALYTICS = `
  (() => {
    const containers = document.querySelectorAll('[data-testid="app-text-transition-container"]');
    const metrics = {};
    for (const c of containers) {
      const value = c.textContent.trim();
      // 曽祖父（great-grandparent）の最初の子がラベル
      const ggp = c.parentElement?.parentElement?.parentElement;
      if (!ggp) continue;
      const label = ggp.children[0]?.textContent?.trim() || "";
      if (label && label !== value) {
        metrics[label] = value;
      }
    }
    return metrics;
  })()
`;

async function main() {
  await killScraperChrome();

  const chrome = spawn(CHROME_EXE, [
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${SCRAPER_PROFILE}`,
    "--no-first-run", "--no-default-browser-check", "--lang=ja", "--headless=new", "about:blank",
  ], { detached: true, stdio: "ignore" });
  chrome.unref();

  if (!(await waitForDebugPort())) { console.log("Chrome起動失敗"); process.exit(1); }

  const browser: Browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null,
  });

  const page = await browser.newPage();
  console.log("Analyticsページにアクセス:", TEST_URL);
  await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 30000 });

  // 数値が0以外になるまで最大15秒待つ
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const metrics = await page.evaluate(EXTRACT_ANALYTICS);
    const hasData = Object.values(metrics).some((v: any) => v !== "0" && v !== "");
    console.log(`  ${i + 1}秒: `, JSON.stringify(metrics));
    if (hasData) {
      console.log("\n✓ データ取得成功!");
      break;
    }
  }

  // 最終結果
  const finalMetrics = await page.evaluate(EXTRACT_ANALYTICS);
  console.log("\n=== 最終結果 ===");
  console.log(JSON.stringify(finalMetrics, null, 2));

  // スクショ
  await page.screenshot({
    path: path.join(__dirname, "..", "debug-analytics-final.png"),
    clip: { x: 0, y: 0, width: 700, height: 900 },
  });

  await page.close();
  browser.disconnect();
}

main();
