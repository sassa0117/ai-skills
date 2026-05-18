/**
 * 2段階目: 駿河屋URL空の316件を、searchKeyword検索+Gemini画像照合で紐付ける
 *
 * 動作:
 *   1. surugayaUrl空のCatalogItemを取得
 *   2. searchKeyword（"/" 区切りで複数の場合は分割）で駿河屋検索
 *   3. 上位N件の候補（name, url, imageUrl）を取得
 *   4. 元imageUrl(メルカリ起源)と各候補画像をGeminiで比較
 *   5. verdict=same が見つかれば、駿河屋情報で上書き (surugayaUrl, name, imageUrl, maker, listPrice, category, description, productType)
 *   6. 見つからなければ「画像照合候補なし」リストへ
 *   7. 結果ログをJSON出力
 *
 * 使い方:
 *   node scripts/match-null-url-image.mjs            # 全件
 *   node scripts/match-null-url-image.mjs --limit 5  # 先頭5件のみ（テスト用）
 *   node scripts/match-null-url-image.mjs --dry      # DB更新しない
 */
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import * as cheerio from "cheerio";
import fs from "fs";
import Database from "better-sqlite3";
import { GoogleGenerativeAI } from "@google/generative-ai";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const limit = parseInt(getArg("--limit") || "0", 10);
const isDry = args.includes("--dry");
const CANDIDATES_PER_KEYWORD = 5;

const envPath = path.join(PROJECT_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split(/\r?\n/).forEach((line) => {
    const t = line.replace(/^﻿/, "").trim();
    if (!t || t.startsWith("#")) return;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}
if (!process.env.GEMINI_API_KEY) { console.error("GEMINI_API_KEY 未設定"); process.exit(1); }

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
console.log(`使用モデル: ${GEMINI_MODEL}`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function classifyError(err) {
  const msg = err?.message || String(err || "");
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota")) return "429";
  if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.toLowerCase().includes("overloaded")) return "503";
  return "other";
}

async function generateContentWithRetry(model, parts, maxRetries = 3) {
  const backoffs = [5000, 10000, 20000];
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await model.generateContent(parts); }
    catch (err) {
      lastErr = err;
      const kind = classifyError(err);
      if (attempt < maxRetries && (kind === "429" || kind === "503")) {
        await sleep(backoffs[attempt]); continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function fetchImageBase64(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/webp";
  return { base64: buf.toString("base64"), mimeType: mime };
}

async function compareImages(refImage, candidateImage, refName, candidateName) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = `2枚の画像を比較して同一商品か判定。
基準: ${refName}
候補: ${candidateName}

判定:
- same = 同一商品
- variant = 同シリーズの別バージョン/別賞
- different = 全く別商品
- unclear = 判定不能

JSON出力のみ:
{"verdict":"same|variant|different|unclear","confidence":"high|medium|low","reason":"簡潔に"}`;
  const result = await generateContentWithRetry(model, [
    { inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } },
    { inlineData: { mimeType: candidateImage.mimeType, data: candidateImage.base64 } },
    { text: prompt },
  ]);
  const text = result.response.text();
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("JSON抽出失敗");
  return JSON.parse(json[0]);
}

async function curlGet(url) {
  const { stdout } = await execFileAsync("curl", [
    "-sSL", "-A", UA, "--max-time", "20", url,
  ], { maxBuffer: 5 * 1024 * 1024, encoding: "utf-8" });
  return stdout;
}

async function searchSurugaya(keyword, maxResults = 5) {
  const params = new URLSearchParams({ search_word: keyword, searchbox: "1" });
  const url = `https://www.suruga-ya.jp/search?${params}`;
  const html = await curlGet(url);
  const $ = cheerio.load(html);
  const results = [];
  $("#search_result .item").each((_, el) => {
    if (results.length >= maxResults) return false;
    const $item = $(el);
    const name = $item.find(".item_detail .title h3.product-name").text().trim();
    if (!name || /^<<[^>]+>>/.test(name)) return;
    const urlPath = $item.find(".item_detail .title a").attr("href") || "";
    const itemUrl = urlPath.startsWith("http") ? urlPath : `https://www.suruga-ya.jp${urlPath}`;
    let imgUrl = $item.find("img").first().attr("src") || $item.find("img").first().attr("data-src") || null;
    if (imgUrl && imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    results.push({ name, url: itemUrl, imageUrl: imgUrl });
  });
  return results;
}

function parseSurugayaPrice(text) {
  if (!text) return 0;
  const m = text.match(/[\d,]+/);
  if (!m) return 0;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 && n < 99_999_999 ? n : 0;
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
    const og = $('meta[property="og:image"]').attr("content");
    if (og) result.imageUrl = og;
    return result;
  } catch { return {}; }
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

let q = `SELECT id, name, ipShort, searchKeyword, imageUrl FROM CatalogItem WHERE (surugayaUrl IS NULL OR surugayaUrl = '') ORDER BY ipShort, name`;
if (limit > 0) q += ` LIMIT ${limit}`;
const targets = db.prepare(q).all();
console.log(`対象: ${targets.length}件 ${isDry ? "(dry-run)" : ""}`);

const update = db.prepare(`
  UPDATE CatalogItem
  SET surugayaUrl = ?, name = ?, imageUrl = ?,
      maker = COALESCE(?, maker), listPrice = COALESCE(?, listPrice),
      category = COALESCE(?, category), description = COALESCE(?, description),
      productType = COALESCE(?, productType), updatedAt = ?
  WHERE id = ?
`);
const checkExisting = db.prepare(`SELECT id FROM CatalogItem WHERE surugayaUrl = ?`);

const stats = { matched: 0, noCandidates: 0, noMatchInCandidates: 0, urlConflict: 0, error: 0, refImgFailed: 0 };
const log = [];
const startMs = Date.now();

for (let i = 0; i < targets.length; i++) {
  const row = targets[i];
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  const eta = i > 0 ? Math.floor((elapsed / i) * (targets.length - i)) : 0;
  process.stdout.write(`\r  ${i + 1}/${targets.length} matched=${stats.matched} noCand=${stats.noCandidates} noMatch=${stats.noMatchInCandidates} err=${stats.error} (${elapsed}s経過 残り約${eta}s)    `);

  let refImage;
  try { refImage = await fetchImageBase64(row.imageUrl); }
  catch (e) {
    stats.refImgFailed++;
    log.push({ id: row.id, name: row.name, status: "ref_image_failed", error: e.message });
    continue;
  }

  const keywords = (row.searchKeyword || "").split("/").map(s => s.trim()).filter(Boolean);
  if (keywords.length === 0) {
    stats.noCandidates++;
    log.push({ id: row.id, name: row.name, status: "no_searchkeyword" });
    continue;
  }

  const allCandidates = [];
  const seenUrls = new Set();
  for (const kw of keywords) {
    try {
      const results = await searchSurugaya(kw, CANDIDATES_PER_KEYWORD);
      for (const r of results) {
        if (!r.imageUrl || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        allCandidates.push({ ...r, fromKeyword: kw });
      }
      await sleep(800);
    } catch (e) {
      log.push({ id: row.id, name: row.name, status: "search_error", keyword: kw, error: e.message });
    }
  }

  if (allCandidates.length === 0) {
    stats.noCandidates++;
    log.push({ id: row.id, name: row.name, status: "no_candidates", searchKeyword: row.searchKeyword });
    continue;
  }

  let matched = null;
  const verdicts = [];
  for (const cand of allCandidates) {
    try {
      const candImg = await fetchImageBase64(cand.imageUrl);
      const v = await compareImages(refImage, candImg, row.name, cand.name);
      verdicts.push({ candName: cand.name, candUrl: cand.url, verdict: v.verdict, confidence: v.confidence, reason: v.reason });
      if (v.verdict === "same" && (v.confidence === "high" || v.confidence === "medium")) {
        matched = cand;
        break;
      }
    } catch (e) {
      stats.error++;
      verdicts.push({ candName: cand.name, candUrl: cand.url, error: e.message });
    }
    await sleep(300);
  }

  if (!matched) {
    stats.noMatchInCandidates++;
    log.push({ id: row.id, name: row.name, status: "no_match_in_candidates", searchKeyword: row.searchKeyword, verdicts });
    continue;
  }

  const conflict = checkExisting.get(matched.url);
  if (conflict && conflict.id !== row.id) {
    stats.urlConflict++;
    log.push({ id: row.id, name: row.name, status: "url_already_in_db", surugayaUrl: matched.url, conflictingId: conflict.id });
    continue;
  }

  const detail = await fetchSurugayaDetail(matched.url);
  const newImageUrl = detail.imageUrl || matched.imageUrl;
  if (!isDry) {
    update.run(matched.url, matched.name, newImageUrl,
      detail.maker || null, detail.listPrice || null, detail.category || null,
      detail.description || null, detail.productType || null,
      new Date().toISOString(), row.id);
  }
  stats.matched++;
  log.push({
    id: row.id,
    oldName: row.name,
    newName: matched.name,
    surugayaUrl: matched.url,
    oldImageUrl: row.imageUrl,
    newImageUrl,
    fromKeyword: matched.fromKeyword,
    status: "matched",
  });
  await sleep(500);
}

console.log("\n\n=== 結果 ===");
console.log(`  対象: ${targets.length}件`);
console.log(`  画像照合で紐付け成功: ${stats.matched}件`);
console.log(`  検索結果0件（候補なし）: ${stats.noCandidates}件`);
console.log(`  候補ありだがGeminiでsame見つからず: ${stats.noMatchInCandidates}件`);
console.log(`  URL重複（既存ID）: ${stats.urlConflict}件`);
console.log(`  元画像取得失敗: ${stats.refImgFailed}件`);
console.log(`  Gemini/その他エラー: ${stats.error}件`);

const outDir = path.join(PROJECT_ROOT, "scripts", "output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, "match-null-url-image-log.json");
fs.writeFileSync(logPath, JSON.stringify({ stats, log }, null, 2), "utf-8");
console.log(`\nログ: ${logPath}`);

db.close();
