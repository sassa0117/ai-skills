/**
 * テスト: Gemini画像照合で「駿河屋画像 vs メルカリsold画像」を比較
 * スコア2+で通過したsoldに対して、画像ベースで"同一商品か"を判定。
 *
 * 使い方:
 *   node scripts/test-image-match.mjs <catalogItemId>
 *   node scripts/test-image-match.mjs <catalogItemId> --dry   # 結果表示のみ、DB更新しない
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
    const trimmed = line.replace(/^\uFEFF/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      process.env[m[1]] = val;
    }
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY が .env.local に設定されていません");
  process.exit(1);
}

const args = process.argv.slice(2);
const itemId = args[0];
const isDry = args.includes("--dry");

if (!itemId) {
  console.error("Usage: node scripts/test-image-match.mjs <catalogItemId> [--dry]");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function fetchImageBase64(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/webp";
  return { base64: buf.toString("base64"), mimeType: mime };
}

async function compareImages(refImage, soldImage, refName, soldName) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `あなたは中古商品の鑑定士です。
2枚の画像を比較して、同じ商品か判定してください。
1枚目: 駿河屋の公式商品画像（基準）
2枚目: メルカリ出品者が撮影したsold商品画像

基準商品名: ${refName}
sold商品名: ${soldName}

## 判定基準
- **same** = 同一商品（同じキャラ・同じ種別・同じバージョン）
- **variant** = 同じシリーズだが別バージョン・別キャラ（例: 同じ一番くじの別賞、別キャラのフィギュア）
- **different** = 全く別商品（ジャケット・靴下・コラボ別商品等）
- **unclear** = 画像が不鮮明で判定不能

## 出力: JSONのみ
{"verdict": "same|variant|different|unclear", "confidence": "high|medium|low", "reason": "簡潔に"}`;

  const result = await model.generateContent([
    { inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } },
    { inlineData: { mimeType: soldImage.mimeType, data: soldImage.base64 } },
    { text: prompt },
  ]);

  const text = result.response.text();
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("JSON抽出失敗: " + text.slice(0, 200));
  return JSON.parse(json[0]);
}

async function main() {
  const db = new Database(path.join(PROJECT_ROOT, "dev.db"));
  db.pragma("journal_mode = WAL");

  const item = db.prepare("SELECT id, name, imageUrl FROM CatalogItem WHERE id = ?").get(itemId);
  if (!item) {
    console.error("商品が見つかりません");
    process.exit(1);
  }
  if (!item.imageUrl) {
    console.error("駿河屋画像URLが未設定:", itemId);
    process.exit(1);
  }

  console.log(`[${item.name.slice(0, 60)}]`);
  console.log(`駿河屋画像: ${item.imageUrl}`);
  console.log(`駿河屋画像を取得中...`);
  const refImage = await fetchImageBase64(item.imageUrl);
  console.log(`  取得完了 (${refImage.mimeType}, ${Math.round(refImage.base64.length / 1024)}KB)\n`);

  const solds = db.prepare(`
    SELECT id, price, soldDate, mercariName, thumbnailUrl
    FROM MercariSoldRecord
    WHERE itemId = ? AND thumbnailUrl IS NOT NULL
    ORDER BY soldDate DESC
  `).all(itemId);

  console.log(`照合対象: ${solds.length}件\n`);

  const results = [];
  for (let i = 0; i < solds.length; i++) {
    const s = solds[i];
    process.stdout.write(`[${i + 1}/${solds.length}] ¥${s.price} ${s.mercariName.slice(0, 40)}... `);
    try {
      const soldImage = await fetchImageBase64(s.thumbnailUrl);
      const verdict = await compareImages(refImage, soldImage, item.name, s.mercariName);
      results.push({ ...s, ...verdict });
      const mark = verdict.verdict === "same" ? "✓" : verdict.verdict === "variant" ? "⚠" : verdict.verdict === "different" ? "✗" : "?";
      console.log(`${mark} ${verdict.verdict} (${verdict.confidence}): ${verdict.reason}`);
    } catch (err) {
      console.log(`ERR: ${err.message.slice(0, 80)}`);
      results.push({ ...s, verdict: "error", confidence: "low", reason: err.message });
    }
    await new Promise((r) => setTimeout(r, 300)); // rate limit
  }

  // サマリ
  const summary = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
    return acc;
  }, {});
  console.log("\n=== サマリ ===");
  Object.entries(summary).forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

  if (isDry) {
    console.log("\n[dry-run] DB更新なし");
    db.close();
    return;
  }

  // same以外を削除
  const toDelete = results.filter((r) => r.verdict === "different" || r.verdict === "variant");
  console.log(`\n削除対象 (different/variant): ${toDelete.length}件`);
  if (toDelete.length > 0) {
    const del = db.prepare("DELETE FROM MercariSoldRecord WHERE id = ?");
    const tx = db.transaction(() => {
      for (const r of toDelete) del.run(r.id);
    });
    tx();
    console.log("削除完了");
  }

  const remaining = db.prepare("SELECT COUNT(*) as n FROM MercariSoldRecord WHERE itemId = ?").get(itemId);
  console.log(`最終件数: ${remaining.n}件`);

  db.close();
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
