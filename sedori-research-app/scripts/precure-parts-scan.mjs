import crypto from "crypto";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const generateMercariJwt =
  require("generate-mercari-jwt").default ||
  require("generate-mercari-jwt");

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchMercariSold(keyword, limit = 60) {
  try {
    const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: {
        keyword,
        sort: "SORT_CREATED_TIME",
        order: "ORDER_DESC",
        status: ["STATUS_SOLD_OUT"],
      },
    };
    const res = await fetch(MERCARI_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        DPoP: dpop,
        "X-Platform": "web",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map((item) => ({
      mercariItemId: item.id,
      name: item.name,
      price:
        typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
      soldDate: new Date(item.updated * 1000).toISOString().split("T")[0],
      thumbnailUrl: item.thumbnails?.[0] || null,
      itemConditionId: item.itemConditionId || null,
    }));
  } catch (e) {
    console.error(`  mercari error: ${e.message}`);
    return [];
  }
}

const db = new Database("./dev.db", { readonly: true });

// watchlistの「変身玩具系キーワード」だけに絞る
// 派生キーワードを掛けるのは本体名（「カードコミューン」「フラワータクト」等）だけにする
const TRANSFORM_KEYWORDS = [
  "カードコミューン", "プリティコミューン", "ハートフルコミューン", "タッチコミューン", "ミラクルコミューン",
  "ハーティエルブローチェ", "ミックスコミューン", "スプラッシュコミューン", "クリスタルコミューン",
  "ピンキーキャッチュ", "ドリームコレット", "ドリームトーチ", "ローズパクト", "ミルキィパレット", "キュアフルーレ",
  "リンクルン", "フレッシュキュアスティック", "パッションハープ",
  "ココロパフューム", "フラワータクト", "ココロポット", "シャイニータンバリン", "ハートキャッチミラージュ", "シャイニーパフューム",
  "キュアモジューレ", "ミラクルベルティエ", "ファンタスティックベルティエ", "ラブギターロッド",
  "スマイルパクト", "プリンセスキャンドル", "ロイヤルクロック",
  "ラブリーコミューン", "ラブハートアロー", "ラブアイズパレット", "ラブキッスルージュ", "マジカルラブリーパッド",
  "プリチェンミラー", "トリプルダンスハニーバトン", "フォーチュンタンバリン", "フォーチュンピアノ", "シャイニングメイクドレッサー",
  "プリンセスパフューム", "クリスタルプリンセスロッド", "スカーレットバイオリン", "ミュージックプリンセスパレス",
  "リンクルステッキ", "リンクルスマホン", "フラワーエコーワンド",
  "スイーツパクト", "キャンディロッド", "パルフェレインボーリボン", "キラキラルクリーマー",
  "プリハート", "メロディソード", "ツインラブギター", "プリキュアミライブレス", "ミライパッド",
  "スターカラーペンダント", "プリキュアレインボーパフューム", "フワ トゥインクルブック",
  "ヒーリングステッキ", "アースウィンディハープ", "ヒーリングっどアロー",
  "トロピカルパクト", "ハートルージュロッド", "マーメイドアクアポット", "トロピカルハートドレッサー",
  "ハートキュアウォッチ", "ハートジューシーミキサー", "ハートフルーツペンダント", "パーティキャンドルタクト",
  "スカイミラージュ", "ミックスパレット プリキュア",
  "ワンダフルパクト", "ダイヤモンドリボンキャッスル",
  "アイドルハートブローチ", "アイドルハートインカム", "キラキラショータイムマイク", "キラッキランリボンバトン",
];

console.log(`[precure-parts-scan] 変身アイテム本体 ${TRANSFORM_KEYWORDS.length} 件`);
db.close();
const precureItems = TRANSFORM_KEYWORDS.map((kw) => ({
  id: null,
  name: kw,
  ipShort: "プリキュア",
  ipTitle: null,
  productType: "変身アイテム本体",
}));

const baseKeywords = precureItems.map((item) => ({
  parentItemId: item.id,
  parentName: item.name,
  parentIpShort: item.ipShort,
  parentIpTitle: item.ipTitle,
  productType: item.productType,
  base: item.name,
}));

const SUFFIXES = [
  "パーツ",
  "単品",
  "ハートパーツ",
  "ストーン",
  "キー",
  "カード",
  "クリスタル",
  "ペン",
  "ボトル",
  "リング",
  "トーン",
  "リボン",
  "ピンキー",
  "種",
];

const queryList = [];
for (const item of baseKeywords) {
  for (const suf of SUFFIXES) {
    queryList.push({
      ...item,
      keyword: `${item.base} ${suf}`,
      suffix: suf,
    });
  }
}

console.log(`[precure-parts-scan] 派生キーワード ${queryList.length} 件`);

const outDir = "C:/Users/user/ai-skills/research";
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "precure-parts-sold.json");

const allResults = [];
let progress = 0;
const startTime = Date.now();

for (const q of queryList) {
  progress++;
  const sold = await searchMercariSold(q.keyword, 60);
  if (sold.length > 0) {
    allResults.push({
      keyword: q.keyword,
      suffix: q.suffix,
      parentItemId: q.parentItemId,
      parentName: q.parentName,
      parentIpShort: q.parentIpShort,
      parentIpTitle: q.parentIpTitle,
      productType: q.productType,
      soldCount: sold.length,
      median: sold.length
        ? sold.map((s) => s.price).sort((a, b) => a - b)[
            Math.floor(sold.length / 2)
          ]
        : null,
      max: Math.max(...sold.map((s) => s.price)),
      min: Math.min(...sold.map((s) => s.price)),
      sold,
    });
  }
  if (progress % 20 === 0) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(
      `  [${progress}/${queryList.length}] hit=${allResults.length} elapsed=${elapsed}s`
    );
    writeFileSync(outPath, JSON.stringify(allResults, null, 2), "utf-8");
  }
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync(outPath, JSON.stringify(allResults, null, 2), "utf-8");

const elapsed = Math.floor((Date.now() - startTime) / 1000);
console.log(
  `\n[precure-parts-scan] done. hits=${allResults.length} elapsed=${elapsed}s`
);
console.log(`  output: ${outPath}`);

const ranking = allResults
  .filter((r) => r.median != null)
  .sort((a, b) => b.median - a.median)
  .slice(0, 30);
console.log("\n=== 高値中央値 TOP 30 ===");
for (const r of ranking) {
  console.log(
    `¥${r.median.toLocaleString().padStart(7)} (${r.soldCount}件) ${r.keyword}`
  );
}
