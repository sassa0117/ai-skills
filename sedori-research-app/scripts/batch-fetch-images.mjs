/**
 * 駿河屋画像URL 全件バッチ取得
 * CatalogItem.imageUrl が NULL の商品全てに対して、駿河屋商品ページから画像URLを取得してDB保存。
 *
 * 使い方:
 *   node scripts/batch-fetch-images.mjs              # imageUrl NULL の全件
 *   node scripts/batch-fetch-images.mjs --limit 100  # 先頭100件だけ
 *   node scripts/batch-fetch-images.mjs --force      # imageUrl 既にあっても再取得
 */
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import * as cheerio from "cheerio";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const limit = parseInt(getArg("--limit") || "0", 10);
const force = args.includes("--force");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchImageUrl(surugayaUrl) {
  const { stdout } = await execFileAsync("curl", [
    "-sS",
    "-A", UA,
    "--max-time", "15",
    surugayaUrl,
  ], { maxBuffer: 5 * 1024 * 1024, encoding: "utf-8" });
  const $ = cheerio.load(stdout);
  return $("img.main-pro-img").attr("src") || null;
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const where = force ? "" : "WHERE imageUrl IS NULL";
  const limitClause = limit > 0 ? `LIMIT ${limit}` : "";
  const items = db.prepare(`SELECT id, name, surugayaUrl FROM CatalogItem ${where} ORDER BY createdAt DESC ${limitClause}`).all();

  console.log(`対象: ${items.length}件`);
  const update = db.prepare("UPDATE CatalogItem SET imageUrl = ? WHERE id = ?");

  let ok = 0, ng = 0;
  const started = Date.now();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const url = await fetchImageUrl(item.surugayaUrl);
      if (url) {
        update.run(url, item.id);
        ok++;
      } else {
        ng++;
      }
    } catch (err) {
      ng++;
    }

    if ((i + 1) % 50 === 0 || i === items.length - 1) {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remain = Math.floor((items.length - i - 1) * (elapsed / (i + 1)));
      console.log(`[${i + 1}/${items.length}] ok=${ok} ng=${ng} elapsed=${elapsed}s remain≈${remain}s`);
    }
    await sleep(600); // 駿河屋に優しく
  }

  console.log(`\n完了: ok=${ok}, ng=${ng} / ${items.length}件`);
  db.close();
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
