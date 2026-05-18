/**
 * Gemini画像照合 全件バッチ
 * 各CatalogItemに対して、DBに保存されている MercariSoldRecord の画像と駿河屋画像を比較。
 * different/variant 判定されたsoldを削除。
 *
 * 使い方:
 *   node scripts/batch-gemini-match.mjs                # 全商品（imageUrl/soldあり）
 *   node scripts/batch-gemini-match.mjs --limit 10     # 先頭10商品のみ
 *   node scripts/batch-gemini-match.mjs --ip チェンソーマン # IP絞り
 *   node scripts/batch-gemini-match.mjs --id <catalogId>   # 単一商品のみ
 *   node scripts/batch-gemini-match.mjs --dry          # 削除しない
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Database from "better-sqlite3";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// .env.local を読む
const envPath = path.join(PROJECT_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split(/\r?\n/).forEach((line) => {
    const t = line.replace(/^\uFEFF/, "").trim();
    if (!t || t.startsWith("#")) return;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY 未設定");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const limit = parseInt(getArg("--limit") || "0", 10);
const ipFilter = getArg("--ip");
const idFilter = getArg("--id");
const isDry = args.includes("--dry");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// quota 緩和のため lite に変更可能。GEMINI_MODEL 環境変数で上書き可
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const CONCURRENCY = Math.max(1, parseInt(process.env.GEMINI_CONCURRENCY || "8", 10));
console.log(`使用モデル: ${GEMINI_MODEL} / 並列度: ${CONCURRENCY}`);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// concurrency 制限付き並列実行（外部依存なし）
async function pMap(items, fn, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (e) {
        results[idx] = { ok: false, error: e };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

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
    try {
      return await model.generateContent(parts);
    } catch (err) {
      lastErr = err;
      const kind = classifyError(err);
      if (attempt < maxRetries && (kind === "429" || kind === "503")) {
        const wait = backoffs[attempt];
        console.log(`  リトライ ${attempt + 1}/${maxRetries} (${kind}) → ${wait / 1000}s 待機`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function fetchImageBase64(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/webp";
  return { base64: buf.toString("base64"), mimeType: mime };
}

async function compareImages(refImage, soldImage, refName, soldName) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = `2枚の画像を比較して同一商品か判定。
基準: ${refName}
sold: ${soldName}

判定:
- same = 同一商品
- variant = 同シリーズの別バージョン/別賞
- different = 全く別商品
- unclear = 判定不能

JSON出力のみ:
{"verdict":"same|variant|different|unclear","confidence":"high|medium|low","reason":"簡潔に"}`;

  const result = await generateContentWithRetry(model, [
    { inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } },
    { inlineData: { mimeType: soldImage.mimeType, data: soldImage.base64 } },
    { text: prompt },
  ]);

  const text = result.response.text();
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("JSON抽出失敗");
  return JSON.parse(json[0]);
}

async function main() {
  const db = new Database(path.join(PROJECT_ROOT, "dev.db"));
  db.pragma("journal_mode = WAL");

  // 未照合(geminiCheckedAt IS NULL)の sold が1件以上ある商品のみ対象
  // no_photo は駿河屋側で画像未登録 → 照合不能なのでクエリ段階で除外
  let query = `
    SELECT DISTINCT ci.id, ci.name, ci.imageUrl, ci.ipShort
    FROM CatalogItem ci
    INNER JOIN MercariSoldRecord msr ON msr.itemId = ci.id
    WHERE ci.imageUrl IS NOT NULL
      AND ci.imageUrl NOT LIKE '%no_photo%'
      AND msr.thumbnailUrl IS NOT NULL
      AND msr.geminiCheckedAt IS NULL
  `;
  const params = [];
  if (idFilter) { query += " AND ci.id = ?"; params.push(idFilter); }
  if (ipFilter) { query += " AND ci.ipShort = ?"; params.push(ipFilter); }
  query += " ORDER BY ci.createdAt DESC";
  if (limit > 0) query += ` LIMIT ${limit}`;

  const items = db.prepare(query).all(...params);
  console.log(`対象商品: ${items.length}件 ${isDry ? "(dry-run)" : ""}`);

  const del = db.prepare("DELETE FROM MercariSoldRecord WHERE id = ?");
  const updateChecked = db.prepare(
    "UPDATE MercariSoldRecord SET geminiVerdict = ?, geminiCheckedAt = datetime('now') WHERE id = ?"
  );
  const totalStart = Date.now();
  let totalSolds = 0, totalDeleted = 0;
  const stats = { ok: 0, err429: 0, err503: 0, errImg: 0, errOther: 0 };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n[${i + 1}/${items.length}] ${item.name.slice(0, 50)}`);

    let refImage;
    try {
      refImage = await fetchImageBase64(item.imageUrl);
    } catch (err) {
      console.log(`  駿河屋画像取得失敗: ${err.message}`);
      continue;
    }

    // この商品の未照合 sold のみ対象
    const solds = db.prepare(`
      SELECT id, price, mercariName, thumbnailUrl
      FROM MercariSoldRecord
      WHERE itemId = ? AND thumbnailUrl IS NOT NULL AND geminiCheckedAt IS NULL
      ORDER BY soldDate DESC
    `).all(item.id);

    let toDelete = [];
    let toMark = []; // [{id, verdict}] same/unclear は削除せず checkedAt だけ打つ

    const outcomes = await pMap(solds, async (s) => {
      const soldImage = await fetchImageBase64(s.thumbnailUrl);
      const v = await compareImages(refImage, soldImage, item.name, s.mercariName);
      return { sold: s, verdict: v.verdict };
    }, CONCURRENCY);

    for (let j = 0; j < outcomes.length; j++) {
      const o = outcomes[j];
      const s = solds[j];
      if (o.ok) {
        if (o.value.verdict === "different" || o.value.verdict === "variant") {
          toDelete.push(s);
        } else {
          toMark.push({ id: s.id, verdict: o.value.verdict });
        }
        stats.ok++;
      } else {
        const err = o.error;
        const msg = err?.message || String(err || "");
        if (msg.startsWith("Image fetch ")) {
          stats.errImg++;
          console.log(`  メルカリ画像取得失敗 sold=${s.id}: ${msg}`);
        } else {
          const kind = classifyError(err);
          if (kind === "429") {
            stats.err429++;
            console.log(`  Gemini 429 quota sold=${s.id}: ${msg.slice(0, 160)}`);
          } else if (kind === "503") {
            stats.err503++;
            console.log(`  Gemini 503 一時不可 sold=${s.id}: ${msg.slice(0, 160)}`);
          } else {
            stats.errOther++;
            console.log(`  Gemini照合失敗 sold=${s.id}: ${msg.slice(0, 200)}`);
          }
        }
      }
    }

    totalSolds += solds.length;
    totalDeleted += toDelete.length;
    console.log(`  sold=${solds.length} 除外=${toDelete.length} 残し=${toMark.length}`);

    if (!isDry) {
      const tx = db.transaction(() => {
        for (const s of toDelete) del.run(s.id);
        for (const m of toMark) updateChecked.run(m.verdict, m.id);
      });
      tx();
    }
  }

  const elapsed = Math.floor((Date.now() - totalStart) / 1000);
  console.log(`\n=== 完了 ===`);
  console.log(`商品数: ${items.length}`);
  console.log(`sold総数: ${totalSolds}`);
  console.log(`削除${isDry ? "候補" : ""}: ${totalDeleted}`);
  console.log(`経過: ${elapsed}秒`);
  console.log(`照合: ok=${stats.ok} 429=${stats.err429} 503=${stats.err503} 画像失敗=${stats.errImg} その他=${stats.errOther}`);
  const tried = stats.ok + stats.err429 + stats.err503 + stats.errOther;
  if (tried > 0) {
    const successRate = ((stats.ok / tried) * 100).toFixed(1);
    console.log(`Gemini 成功率: ${successRate}% (${stats.ok}/${tried})`);
  }
  db.close();
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
