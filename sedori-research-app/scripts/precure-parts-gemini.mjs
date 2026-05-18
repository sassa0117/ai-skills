import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const envPath = path.join(PROJECT_ROOT, ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .forEach((line) => {
      const t = line.replace(/^﻿/, "").trim();
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

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const INPUT = "C:/Users/user/ai-skills/research/precure-parts-sold-filtered.json";
const OUTPUT = "C:/Users/user/ai-skills/research/precure-parts-sold-gemini.json";
const PROGRESS_PATH = OUTPUT + ".progress.json";

const data = JSON.parse(readFileSync(INPUT, "utf-8"));
console.log(`[gemini] 入力 ${data.length} グループ`);

const allSolds = [];
for (const group of data) {
  for (const sold of group.sold) {
    allSolds.push({
      groupKeyword: group.keyword,
      groupSuffix: group.suffix,
      groupParentName: group.parentName,
      groupParentIpShort: group.parentIpShort,
      ...sold,
    });
  }
}
console.log(`[gemini] 全sold ${allSolds.length} 件`);

let progress = {};
if (existsSync(PROGRESS_PATH)) {
  progress = JSON.parse(readFileSync(PROGRESS_PATH, "utf-8"));
  console.log(`[gemini] 既存判定 ${Object.keys(progress).length} 件読み込み`);
}

async function fetchImageBase64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}

async function judgeImage(imageBase64, soldName, parentName) {
  try {
    const result = await model.generateContent([
      {
        inlineData: { mimeType: "image/jpeg", data: imageBase64 },
      },
      {
        text: `この画像は、プリキュアの変身玩具「${parentName}」に関連する商品です。
メルカリの商品名: 「${soldName}」

画像を見て、商品の中身を以下のいずれかに分類してください:

- "main_full": 変身玩具本体（DXセット・なりきり一式・大型本体）が完全な形で写ってる
- "part_only": 付属品単品のみ（カード/キー/ストーン/種/リボン/パーツ等の小物）が写ってる
- "with_extras": 本体+付属品セット（複数まとめ売り）
- "unrelated": プリキュアとは無関係な商品（楽器・指輪・アパレル等）

JSON のみ出力（他テキスト一切不要）:
{ "type": "main_full" | "part_only" | "with_extras" | "unrelated", "confidence": "high" | "medium" | "low" }`,
      },
    ]);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed;
  } catch (e) {
    return { type: "error", error: e.message };
  }
}

const CONCURRENCY = 5;
let done = Object.keys(progress).length;
const startTime = Date.now();
let saveCounter = 0;

async function processOne(sold) {
  if (progress[sold.mercariItemId]) return;
  if (!sold.thumbnailUrl) {
    progress[sold.mercariItemId] = { type: "no_image" };
    return;
  }
  const base64 = await fetchImageBase64(sold.thumbnailUrl);
  if (!base64) {
    progress[sold.mercariItemId] = { type: "fetch_failed" };
    return;
  }
  const verdict = await judgeImage(base64, sold.name, sold.groupParentName);
  if (verdict) {
    progress[sold.mercariItemId] = verdict;
  }
  done++;
  if (done % 50 === 0) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`  [${done}/${allSolds.length}] elapsed=${elapsed}s`);
  }
  saveCounter++;
  if (saveCounter % 100 === 0) {
    writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
  }
}

async function runWithConcurrency(items, fn, n) {
  const queue = items.slice();
  const workers = Array.from({ length: n }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

await runWithConcurrency(allSolds, processOne, CONCURRENCY);

writeFileSync(PROGRESS_PATH, JSON.stringify(progress));

const enriched = data.map((group) => {
  const sold = group.sold
    .map((s) => ({
      ...s,
      gemini: progress[s.mercariItemId] || null,
    }))
    .filter((s) => s.gemini && (s.gemini.type === "part_only"));

  if (sold.length === 0) return null;
  const prices = sold.map((s) => s.price).sort((a, b) => a - b);
  return {
    keyword: group.keyword,
    suffix: group.suffix,
    parentName: group.parentName,
    parentIpShort: group.parentIpShort,
    soldCount: sold.length,
    median: prices[Math.floor(prices.length / 2)],
    max: Math.max(...prices),
    min: Math.min(...prices),
    examples: sold.slice(0, 3).map((s) => ({
      name: s.name,
      price: s.price,
      soldDate: s.soldDate,
      mercariItemId: s.mercariItemId,
    })),
    sold,
  };
}).filter((x) => x);

writeFileSync(OUTPUT, JSON.stringify(enriched, null, 2));
console.log(`\n[gemini] 出力 ${enriched.length} グループ → ${OUTPUT}`);

const ranking = enriched
  .filter((r) => r.soldCount >= 2)
  .sort((a, b) => b.median - a.median)
  .slice(0, 40);

console.log("\n=== Gemini判定後 高値中央値 TOP 40（part_only限定・2件以上）===");
for (const r of ranking) {
  console.log(
    `¥${String(r.median).padStart(7)} (${String(r.soldCount).padStart(3)}件) ${r.keyword}`
  );
  console.log(
    `         例: ${r.examples
      .slice(0, 1)
      .map((e) => `¥${e.price} ${e.name.slice(0, 50)}`)
      .join("")}`
  );
}
