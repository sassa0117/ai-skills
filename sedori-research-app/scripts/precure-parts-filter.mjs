import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(
  readFileSync("C:/Users/user/ai-skills/research/precure-parts-sold.json", "utf-8")
);

console.log(`[filter] 入力: ${data.length} 件`);

const NOISE_PATTERNS = [
  /本体/,
  /DX(?:\s|$|セット)/,
  /変身[!！]/,
  /パワーアップ変身/,
  /なりきり変身/,
  /メイクアップ変身/,
  /カラフル.{0,5}変身/,
  /キュアタッチ変身/,
  /つくっておせわして/,
  /くるくる.{0,5}変身/,
  /ハピネス変身/,
  /キミとアイドル変身/,
  /\[バンダイ\]/,
  /スペシャルセット/,
  /なりきりセット/,
  /パーフェクト.{0,3}セット/,
  /外箱.?説明書/,
  /未開封/,
  /セット販売/,
  /大量/,
  /まとめ/,
  /おまとめ/,
  /\d+点/,
  /\d+本/,
];

const PARTS_KEYWORDS = [
  /パーツ/,
  /ハートパーツ/,
  /単品/,
  /カード(?!セット)/,
  /キー/,
  /ストーン/,
  /クリスタル/,
  /ペン/,
  /ボトル/,
  /リング/,
  /トーン/,
  /リボン/,
  /ピンキー/,
  /[のノ]種/,
];

function isNoise(name) {
  if (!name) return true;
  return NOISE_PATTERNS.some((p) => p.test(name));
}

function isLikelyPart(name) {
  if (!name) return false;
  return PARTS_KEYWORDS.some((p) => p.test(name));
}

const PRECURE_CONTEXT = [
  /プリキュア/,
  /ぷりきゅあ/,
  /precure/i,
  /pretty\s*cure/i,
  /キュア[ァ-ヴー]+/,
  /ハートキャッチ/,
  /スマイルプリ/,
  /ドキドキ.プリ/,
  /ハピネスチャージ/,
  /Go!?プリンセス/i,
  /魔法つかい.プリ/,
  /ヒーリングっど/,
  /トロピカル.ジュ/,
  /デリシャスパーティ/,
  /ひろがるスカイ/,
  /わんだふる.ぷり/,
  /キミとアイドル/,
  /ふたりはプリ/,
  /Yes!?プリキュア/i,
  /フレッシュプリキュア/,
  /スイートプリキュア/,
  /スター.トゥインクル/,
  /キラキラ.アラモード/,
  /HUG.っと/,
  /なりきりプリ/,
];

function isPrecureContext(name) {
  if (!name) return false;
  return PRECURE_CONTEXT.some((p) => p.test(name));
}

const cleanResults = [];

for (const r of data) {
  const filteredSold = r.sold.filter((s) => {
    if (isNoise(s.name)) return false;
    if (!isLikelyPart(s.name)) return false;
    if (!isPrecureContext(s.name)) return false;
    return true;
  });

  if (filteredSold.length === 0) continue;

  const prices = filteredSold.map((s) => s.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const max = Math.max(...prices);
  const min = Math.min(...prices);

  cleanResults.push({
    keyword: r.keyword,
    suffix: r.suffix,
    parentName: r.parentName,
    parentIpShort: r.parentIpShort,
    soldCount: filteredSold.length,
    median,
    max,
    min,
    priceUpper: prices[Math.floor(prices.length * 0.9)],
    priceLower: prices[Math.floor(prices.length * 0.1)],
    examples: filteredSold.slice(0, 3).map((s) => ({
      name: s.name,
      price: s.price,
      soldDate: s.soldDate,
      mercariItemId: s.mercariItemId,
    })),
    sold: filteredSold,
  });
}

console.log(`[filter] 出力（純度フィルタ後）: ${cleanResults.length} 件`);

writeFileSync(
  "C:/Users/user/ai-skills/research/precure-parts-sold-filtered.json",
  JSON.stringify(cleanResults, null, 2),
  "utf-8"
);

const ranking = cleanResults
  .filter((r) => r.soldCount >= 2)
  .sort((a, b) => b.median - a.median)
  .slice(0, 40);

console.log("\n=== 純度フィルタ後 高値中央値 TOP 40（2件以上） ===");
for (const r of ranking) {
  console.log(
    `¥${String(r.median).padStart(7)} (${String(r.soldCount).padStart(3)}件) ${r.keyword}`
  );
  console.log(
    `         例: ${r.examples
      .slice(0, 2)
      .map((e) => `¥${e.price} ${e.name.slice(0, 40)}`)
      .join(" / ")}`
  );
}

const single = cleanResults
  .filter((r) => r.soldCount === 1)
  .sort((a, b) => b.median - a.median)
  .slice(0, 20);

console.log("\n=== 1件のみ（限定品候補）TOP 20 ===");
for (const r of single) {
  console.log(
    `¥${String(r.median).padStart(7)} ${r.keyword} → ${r.examples[0].name.slice(0, 60)}`
  );
}
