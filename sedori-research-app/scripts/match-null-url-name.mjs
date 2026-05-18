/**
 * name ベースで検索クエリを最適化して駿河屋紐付け
 *
 * 動作:
 *   1. surugayaUrl 空の CatalogItem 取得
 *   2. buildSearchQuery(name, ipShort) でクエリ生成（記号除去・状態語除去・シリーズ名正規化）
 *   3. 駿河屋検索
 *   4. ヒット0なら段階的フォールバック（シリーズ名のみ / 残り語のみ）
 *   5. 候補上位N件と元画像をGeminiで比較
 *   6. verdict=same 見つかれば駿河屋情報で上書き
 *
 * 使い方:
 *   node scripts/match-null-url-name.mjs --limit 10 --dry  # 10件 dry-run
 *   node scripts/match-null-url-name.mjs --limit 10        # 10件 本番
 *   node scripts/match-null-url-name.mjs                   # 全件
 *
 *   --query-only : DB更新もGemini照合もせず、クエリ生成結果と駿河屋ヒット数だけ確認
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
const isQueryOnly = args.includes("--query-only");
const CANDIDATES_PER_QUERY = 5;

// ipShort -> 駿河屋検索用のシリーズ正式名
// 「ふたりはプリキュア MaxHeart」「Yes!プリキュア5GoGo」等もそのまま使う（さっさ確認済）
// シリーズ名の表記ルール（さっさ指示）:
//   - 「プリンセスプリキュア」→「プリンセス プリキュア」（くっつけずスペース入れる）
//   - 「Go」「Go!」「Yes!」「ふたりは」等の冠詞・装飾は外す
//   - 各シリーズの識別語の核 + スペース + プリキュア
const SERIES_MAP = {
  "Goプリ": "プリンセス プリキュア",
  "HUGっと": "HUGっと プリキュア",
  "ハートキャッチ": "ハートキャッチ プリキュア",
  "キミプリ": "キミとアイドル プリキュア",
  "ひろスカ": "ひろがるスカイ プリキュア",
  "ヒープリ": "ヒーリングっど プリキュア",
  "魔法つかい": "魔法つかい プリキュア",
  "プリキュア": "プリキュア",
  "ハピチャ": "ハピネスチャージ プリキュア",
  "プリキュア5": "プリキュア 5",
  "Splash★Star": "Splash Star プリキュア",
  "MaxHeart": "MaxHeart プリキュア",
  "スタプリ": "スター トゥインクル プリキュア",
  "ドキドキ": "ドキドキ プリキュア",
  "フレッシュ": "フレッシュ プリキュア",
  "トロプリ": "トロピカルージュ プリキュア",
  "アラモード": "アラモード プリキュア",
  "スイート": "スイート プリキュア",
};

// 既知シリーズ表記揺れ（name 内から重複除外用）。シリーズ名は SERIES_MAP 側で付け直すので、ここでは name から消す
// 順序: 長い表現から短い表現の順に並べる（部分マッチを先に消すため）
const SERIES_VARIANTS = [
  // Goプリ系（プリンセス有り版を先に・無し版を後に）
  /GO[!！]?\s*プリンセス\s*プリキュア/g,
  /Go[!！]?\s*プリンセス\s*プリキュア/g,
  /プリンセス\s*プリキュア/g,
  /GO[!！]?\s*プリキュア/g,
  /Go[!！]?\s*プリキュア/g,
  // 他シリーズ
  /HUGっと[!！]?\s*プリキュア/g,
  /HUGっと/g,
  /ハートキャッチ\s*プリキュア/g,
  /キミとアイドル\s*プリキュア[♪]?/g,
  /ひろがるスカイ[!！]?\s*プリキュア/g,
  /ヒーリングっど[♥]?\s*プリキュア/g,
  /魔法つかい\s*プリキュア[!！]?/g,
  /ハピネスチャージ\s*プリキュア[!！]?/g,
  /Yes[!！]?\s*プリキュア\s*5\s*GoGo[!！]?/g,
  /Yes[!！]?\s*プリキュア\s*5/g,
  /ふたりは\s*プリキュア\s*Splash[★\s]+Star/g,
  /ふたりは\s*プリキュア\s*MaxHeart/g,
  /ふたりは\s*プリキュア\s*マックスハート/g,
  /ふたりは\s*プリキュア/g,
  /スター[☆\s]*トゥインクル\s*プリキュア/g,
  /ドキドキ[!！]?\s*プリキュア/g,
  /フレッシュ\s*プリキュア[!！]?/g,
  /トロピカル[～〜ー\-]ジュ[!！]?\s*プリキュア/g,
  /トロピカルージュ\s*プリキュア/g,
  /キラキラ[☆\s]*プリキュア\s*アラモード/g,
  /スイート\s*プリキュア[♪]?/g,
  /プリキュア/g, // 最後に残った「プリキュア」単独も除外
  // 「Go」「Yes」「ふたりは」等の冠詞だけ残るケース対策
  /(?:^|\s)Go(?:!|！)?(?=\s|$)/g,
  /(?:^|\s)Yes(?:!|！)?(?=\s|$)/g,
  /(?:^|\s)GoGo(?:!|！)?(?=\s|$)/g,
];

// 除去すべきノイズ語（状態語・装飾・出品文・特典・メーカー名・付属品単品語・メルカリ出品の説明語）
const NOISE_WORDS = [
  "美品", "新品同様", "新品", "未開封", "未使用", "中古品", "中古",
  "送料無料", "即決", "訳あり", "レア", "希少", "稀少",
  "コンプリートセット", "コンプリート", "全種セット", "コンプ",
  "ver\\.", "Ver\\.", "ver\\s", "Ver\\s", "バージョン",
  "購入特典", "特典", "付属品", "付属", "おもちゃ",
  "バンダイ", "BANDAI", "Bandai",
  "セット",
  // メルカリ出品の説明語
  "ハート模様", "ボトル型", "ペン型", "ロケット型",
];

function buildSearchQuery(name, ipShort) {
  const series = SERIES_MAP[ipShort] || "プリキュア";

  let s = name;

  // 1. 括弧と中身を除去
  s = s.replace(/【[^】]*】/g, " ");
  s = s.replace(/〔[^〕]*〕/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\([^\)]*\)/g, " ");
  s = s.replace(/（[^）]*）/g, " ");
  s = s.replace(/「[^」]*」/g, " ");
  s = s.replace(/『[^』]*』/g, " ");
  s = s.replace(/《[^》]*》/g, " ");

  // 2. 装飾記号
  s = s.replace(/[♪☆★♥♡♬❤✨〜～※×✕✖]/g, " ");
  s = s.replace(/[!！?？\/／&＆<>＜＞]/g, " ");
  s = s.replace(/[、。・…]/g, " ");

  // 3. 出品者の様付き（「T*a様」「い*ゆ様」「○○様」）
  s = s.replace(/\S*[*＊]\S*様/g, " ");
  s = s.replace(/\S{1,8}様/g, " ");

  // 4. シリーズ名の表記揺れを name 内から除去（シリーズ名は別途付ける）
  for (const re of SERIES_VARIANTS) {
    s = s.replace(re, " ");
  }

  // 5. ノイズ語除去
  for (const w of NOISE_WORDS) {
    s = s.replace(new RegExp(w, "gi"), " ");
  }
  // 「3個セット」「5個」等
  s = s.replace(/\d+個/g, " ");
  // 残った全角空白・連続空白を整理
  s = s.replace(/[\s　]+/g, " ").trim();

  // 6. クエリ組み立て
  // main: シリーズ名 + 商品名（最も具体的）
  // shortName: 商品名のみ（駿河屋公式名にシリーズ名が無いケースのフォールバック）
  // fb1: シリーズ名のみ（最後の手段。同じシリーズの何でもヒット）
  const main = s ? `${series} ${s}` : series;
  const shortName = s || null;
  const fb1 = series;

  return {
    main: main.replace(/\s+/g, " ").trim(),
    shortName: shortName ? shortName.replace(/\s+/g, " ").trim() : null,
    fb1: fb1.replace(/\s+/g, " ").trim(),
    coreOnly: s,
  };
}

const envPath = path.join(PROJECT_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split(/\r?\n/).forEach((line) => {
    const t = line.replace(/^﻿/, "").trim();
    if (!t || t.startsWith("#")) return;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

let genAI, GEMINI_MODEL;
if (!isQueryOnly) {
  if (!process.env.GEMINI_API_KEY) { console.error("GEMINI_API_KEY 未設定"); process.exit(1); }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  console.log(`使用モデル: ${GEMINI_MODEL}`);
}

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
console.log(`対象: ${targets.length}件 ${isDry ? "(dry-run)" : ""} ${isQueryOnly ? "(--query-only)" : ""}`);

const update = !isQueryOnly ? db.prepare(`
  UPDATE CatalogItem
  SET surugayaUrl = ?, name = ?, imageUrl = ?,
      maker = COALESCE(?, maker), listPrice = COALESCE(?, listPrice),
      category = COALESCE(?, category), description = COALESCE(?, description),
      productType = COALESCE(?, productType), updatedAt = ?
  WHERE id = ?
`) : null;
const checkExisting = db.prepare(`SELECT id FROM CatalogItem WHERE surugayaUrl = ?`);

const stats = { matched: 0, noCandidatesAfterAllQueries: 0, noMatchInCandidates: 0, urlConflict: 0, error: 0, refImgFailed: 0 };
const log = [];
const startMs = Date.now();

for (let i = 0; i < targets.length; i++) {
  const row = targets[i];
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  const eta = i > 0 ? Math.floor((elapsed / i) * (targets.length - i)) : 0;
  process.stdout.write(`\r  ${i + 1}/${targets.length} matched=${stats.matched} noCand=${stats.noCandidatesAfterAllQueries} noMatch=${stats.noMatchInCandidates} err=${stats.error} (${elapsed}s経過 残り約${eta}s)    `);

  const queries = buildSearchQuery(row.name, row.ipShort);

  // --query-only モード: 駿河屋検索のみ実施、ヒット数記録
  if (isQueryOnly) {
    const queriesUsed = [];
    let totalCandidates = 0;
    for (const tag of ["main", "shortName", "fb1"]) {
      const kw = queries[tag];
      if (!kw) continue;
      // 重複クエリスキップ（mainとfb2が同じ場合等）
      if (queriesUsed.some(q => q.kw === kw)) continue;
      try {
        const results = await searchSurugaya(kw, CANDIDATES_PER_QUERY);
        queriesUsed.push({ tag, kw, hits: results.length, top3: results.slice(0, 3).map(r => r.name) });
        totalCandidates += results.length;
        await sleep(800);
        if (totalCandidates >= 3) break; // 十分候補あれば打ち切り
      } catch (e) {
        queriesUsed.push({ tag, kw, error: e.message });
      }
    }
    log.push({
      id: row.id,
      ipShort: row.ipShort,
      origName: row.name,
      coreOnly: queries.coreOnly,
      queries: queriesUsed,
      totalCandidates,
    });
    continue;
  }

  // 通常モード: 検索 → Gemini照合 → DB更新
  let refImage;
  try { refImage = await fetchImageBase64(row.imageUrl); }
  catch (e) {
    stats.refImgFailed++;
    log.push({ id: row.id, name: row.name, status: "ref_image_failed", error: e.message });
    continue;
  }

  const allCandidates = [];
  const seenUrls = new Set();
  const queriesUsed = [];
  for (const tag of ["main", "fb1", "fb2"]) {
    const kw = queries[tag];
    if (!kw) continue;
    if (queriesUsed.some(q => q.kw === kw)) continue;
    try {
      const results = await searchSurugaya(kw, CANDIDATES_PER_QUERY);
      queriesUsed.push({ tag, kw, hits: results.length });
      for (const r of results) {
        if (!r.imageUrl || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        allCandidates.push({ ...r, fromQuery: kw, fromTag: tag });
      }
      await sleep(800);
      // 候補ある程度集まったら打ち切り
      if (allCandidates.length >= 5) break;
    } catch (e) {
      log.push({ id: row.id, name: row.name, status: "search_error", keyword: kw, error: e.message });
    }
  }

  if (allCandidates.length === 0) {
    stats.noCandidatesAfterAllQueries++;
    log.push({ id: row.id, name: row.name, status: "no_candidates", queriesUsed });
    continue;
  }

  let matched = null;
  const verdicts = [];
  for (const cand of allCandidates) {
    try {
      const candImg = await fetchImageBase64(cand.imageUrl);
      const v = await compareImages(refImage, candImg, row.name, cand.name);
      verdicts.push({ candName: cand.name, candUrl: cand.url, fromTag: cand.fromTag, verdict: v.verdict, confidence: v.confidence, reason: v.reason });
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
    log.push({ id: row.id, name: row.name, status: "no_match_in_candidates", queriesUsed, verdicts });
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
    fromQuery: matched.fromQuery,
    fromTag: matched.fromTag,
    status: "matched",
  });
  await sleep(500);
}

console.log("\n\n=== 結果 ===");
if (isQueryOnly) {
  const withCand = log.filter(x => x.totalCandidates > 0).length;
  const without = log.length - withCand;
  console.log(`  対象: ${targets.length}件`);
  console.log(`  駿河屋検索ヒットあり: ${withCand}件`);
  console.log(`  全クエリで0件: ${without}件`);
} else {
  console.log(`  対象: ${targets.length}件`);
  console.log(`  画像照合で紐付け成功: ${stats.matched}件`);
  console.log(`  全クエリ検索結果0件（候補なし）: ${stats.noCandidatesAfterAllQueries}件`);
  console.log(`  候補ありだがGeminiでsame見つからず: ${stats.noMatchInCandidates}件`);
  console.log(`  URL重複（既存ID）: ${stats.urlConflict}件`);
  console.log(`  元画像取得失敗: ${stats.refImgFailed}件`);
  console.log(`  Gemini/その他エラー: ${stats.error}件`);
}

const outDir = path.join(PROJECT_ROOT, "scripts", "output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const suffix = isQueryOnly ? "query-only" : (isDry ? "dry" : "full");
const logPath = path.join(outDir, `match-null-url-name-log-${suffix}.json`);
fs.writeFileSync(logPath, JSON.stringify({ stats, log }, null, 2), "utf-8");
console.log(`\nログ: ${logPath}`);

db.close();
