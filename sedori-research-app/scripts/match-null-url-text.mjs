/**
 * 1段階目: 駿河屋URL空の316件を、name完全一致で駿河屋に紐付ける
 *
 * 動作:
 *   1. surugayaUrl空のCatalogItemを取得
 *   2. name で駿河屋検索（curl経由、bot対策）
 *   3. 検索結果上位10件のnameを正規化して比較
 *   4. 完全一致 → 駿河屋情報で上書き (surugayaUrl, name, imageUrl, maker, listPrice, category, description, productType)
 *   5. 不一致・ヒット0 → 候補リストへ（2段階目=画像照合へ）
 *   6. 変更ログをJSONで出力
 *
 * 使い方: node scripts/match-null-url-text.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import * as cheerio from "cheerio";
import fs from "fs";
import crypto from "crypto";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseSurugayaPrice(text) {
  if (!text) return 0;
  const m = text.match(/[\d,]+/);
  if (!m) return 0;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999) return 0;
  return n;
}

function normalize(s) {
  if (!s) return "";
  return s
    .normalize("NFKC")
    .replace(/^\[単品\]/g, "")
    .replace(/[【】〔〕\[\]\(\)（）「」『』]/g, "")
    .replace(/[★☆♪♥♡♬❤♀♂✨]/g, "")
    .replace(/(美品|新品同様|新品|未開封|未使用|レア|希少|稀少|送料無料|即決)/g, "")
    .replace(/[\s　・]+/g, "")
    .toLowerCase();
}

async function curlGet(url) {
  const { stdout: html } = await execFileAsync("curl", [
    "-sS", "-A", UA, "--max-time", "20", url,
  ], { maxBuffer: 5 * 1024 * 1024, encoding: "utf-8" });
  return html;
}

async function searchSurugaya(keyword) {
  const params = new URLSearchParams({
    search_word: keyword,
    searchbox: "1",
    rankBy: "modificationTime:descending",
  });
  const url = `https://www.suruga-ya.jp/search?${params}`;
  const html = await curlGet(url);
  const $ = cheerio.load(html);
  const results = [];
  $("#search_result .item").each((_, el) => {
    const $item = $(el);
    const name = $item.find(".item_detail .title h3.product-name").text().trim();
    if (!name) return;
    if (/^<<[^>]+>>/.test(name)) return;
    const urlPath = $item.find(".item_detail .title a").attr("href") || "";
    const itemUrl = urlPath.startsWith("http") ? urlPath : `https://www.suruga-ya.jp${urlPath}`;
    const imgUrl = $item.find("img").first().attr("src") || $item.find("img").first().attr("data-src") || null;
    results.push({ name, url: itemUrl, imageUrl: imgUrl });
  });
  return results.slice(0, 10);
}

async function fetchSurugayaDetail(url) {
  try {
    const html = await curlGet(url);
    if (!html) return {};
    const $ = cheerio.load(html);
    const details = {};
    $("th").each((_, el) => {
      const label = $(el).text().trim();
      const value = $(el).next().text().trim();
      if (label && value) details[label] = value;
    });

    const result = {
      maker: details["メーカー"] || null,
      listPrice: details["定価"] ? (parseSurugayaPrice(details["定価"]) || null) : null,
      category: details["カテゴリ"] ? details["カテゴリ"].replace(/\s+/g, " > ").trim() : null,
      description: null,
      productType: null,
      imageUrl: null,
    };

    $("*").each((_, el) => {
      const t = $(el).text().trim();
      if (t.startsWith("商品解説") && t.length > 5 && t.length < 500) {
        result.description = t.replace(/^商品解説■?\s*/, "").trim();
        return false;
      }
    });

    const ogImg = $('meta[property="og:image"]').attr("content");
    if (ogImg) result.imageUrl = ogImg;
    if (!result.imageUrl) {
      const mainImg = $("#item_image img, .item_image img, .product-image img").first().attr("src");
      if (mainImg) result.imageUrl = mainImg.startsWith("http") ? mainImg : `https://www.suruga-ya.jp${mainImg}`;
    }

    return result;
  } catch {
    return {};
  }
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const targets = db.prepare(`
  SELECT id, name, ipShort, searchKeyword, imageUrl
  FROM CatalogItem
  WHERE surugayaUrl IS NULL OR surugayaUrl = ''
  ORDER BY ipShort, name
`).all();

console.log(`対象: ${targets.length}件`);

const update = db.prepare(`
  UPDATE CatalogItem
  SET surugayaUrl = ?,
      name = ?,
      imageUrl = ?,
      maker = COALESCE(?, maker),
      listPrice = COALESCE(?, listPrice),
      category = COALESCE(?, category),
      description = COALESCE(?, description),
      productType = COALESCE(?, productType),
      updatedAt = ?
  WHERE id = ?
`);

const stats = { matched: 0, noExactMatch: 0, noSearchResult: 0, error: 0, urlConflict: 0 };
const log = [];

const checkExisting = db.prepare(`SELECT id FROM CatalogItem WHERE surugayaUrl = ?`);

for (let i = 0; i < targets.length; i++) {
  const row = targets[i];
  process.stdout.write(`\r  ${i + 1}/${targets.length}  matched=${stats.matched} noMatch=${stats.noExactMatch} noResult=${stats.noSearchResult} err=${stats.error} conflict=${stats.urlConflict}`);

  try {
    const results = await searchSurugaya(row.name);

    if (results.length === 0) {
      stats.noSearchResult++;
      log.push({ id: row.id, name: row.name, status: "no_search_result" });
      await sleep(1500);
      continue;
    }

    const targetNorm = normalize(row.name);
    const exact = results.find(r => normalize(r.name) === targetNorm);

    if (!exact) {
      stats.noExactMatch++;
      log.push({
        id: row.id,
        name: row.name,
        status: "no_exact_match",
        candidates: results.slice(0, 5).map(r => ({ name: r.name, url: r.url })),
      });
      await sleep(1500);
      continue;
    }

    const conflict = checkExisting.get(exact.url);
    if (conflict && conflict.id !== row.id) {
      stats.urlConflict++;
      log.push({
        id: row.id,
        name: row.name,
        status: "url_already_in_db",
        conflictingId: conflict.id,
        surugayaUrl: exact.url,
      });
      await sleep(1500);
      continue;
    }

    const detail = await fetchSurugayaDetail(exact.url);
    const newImageUrl = detail.imageUrl || exact.imageUrl || row.imageUrl;

    update.run(
      exact.url,
      exact.name,
      newImageUrl,
      detail.maker || null,
      detail.listPrice || null,
      detail.category || null,
      detail.description || null,
      detail.productType || null,
      new Date().toISOString(),
      row.id
    );
    stats.matched++;
    log.push({
      id: row.id,
      oldName: row.name,
      newName: exact.name,
      surugayaUrl: exact.url,
      oldImageUrl: row.imageUrl,
      newImageUrl,
      status: "matched",
    });
    await sleep(2000);
  } catch (e) {
    stats.error++;
    log.push({ id: row.id, name: row.name, status: "error", error: e.message });
    await sleep(1500);
  }
}

console.log("\n\n=== 結果 ===");
console.log(`  対象: ${targets.length}件`);
console.log(`  完全一致で紐付け成功: ${stats.matched}件`);
console.log(`  検索ヒットしたが完全一致なし（候補あり、画像照合へ）: ${stats.noExactMatch}件`);
console.log(`  検索結果0件（駿河屋に存在しない可能性高）: ${stats.noSearchResult}件`);
console.log(`  既に同じURL別IDで存在（重複）: ${stats.urlConflict}件`);
console.log(`  エラー: ${stats.error}件`);

const outDir = path.join(PROJECT_ROOT, "scripts", "output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, "match-null-url-text-log.json");
fs.writeFileSync(logPath, JSON.stringify({ stats, log }, null, 2), "utf-8");
console.log(`\n変更ログ: ${logPath}`);

db.close();
