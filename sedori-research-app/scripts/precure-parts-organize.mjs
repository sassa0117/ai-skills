import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(
  readFileSync(
    "C:/Users/user/ai-skills/research/precure-parts-sold-gemini.json",
    "utf-8"
  )
);

const AFID = "1057058815";

function buildMercariUrl(mercariItemId) {
  if (/^[0-9a-zA-Z]{20,}$/.test(mercariItemId) && !mercariItemId.startsWith("m")) {
    return `https://jp.mercari.com/shops/product/${mercariItemId}?afid=${AFID}`;
  }
  return `https://jp.mercari.com/item/${mercariItemId}?afid=${AFID}`;
}

function categorize(name) {
  if (/一番くじ|ラストワン|[A-Z]賞|くじ.*賞|賞.*詰め合わせ|くじ.*ロット/.test(name))
    return "gacha_bundle";
  if (/ミニチャームコレクション|ダイキャストチャーム|ガシャポン|ガチャ|ガチャポン|食玩|ウエハース|キーホルダー|スイング|フィグライフ|ぬーどるストッパー|ピクスタ|キャラフォルム|カードダス|チャームコット|フィグメント/.test(name))
    return "gacha_bundle";
  if (/コンプリートセット|フルコンプ|全\s?[3-9]\s?種|全\s?1\s?[0-2]\s?種|全種セット/.test(name))
    return "complete_set";
  if (/非売品|購入特典|プレミアム|限定|映画|劇場版|プレバン/.test(name))
    return "limited";
  return "single_part";
}

const allSolds = new Map();
for (const group of data) {
  for (const sold of group.sold) {
    if (!allSolds.has(sold.mercariItemId)) {
      allSolds.set(sold.mercariItemId, {
        ...sold,
        url: buildMercariUrl(sold.mercariItemId),
        category: categorize(sold.name),
        relatedKeywords: [],
        relatedParents: new Set(),
      });
    }
    const entry = allSolds.get(sold.mercariItemId);
    entry.relatedKeywords.push(group.keyword);
    entry.relatedParents.add(group.parentName);
  }
}

const unique = Array.from(allSolds.values()).map((s) => ({
  ...s,
  relatedParents: Array.from(s.relatedParents),
}));

console.log(`[organize] ユニーク sold: ${unique.length} 件`);

const byCategory = {};
for (const s of unique) {
  byCategory[s.category] = (byCategory[s.category] || 0) + 1;
}
console.log("カテゴリ別:");
for (const [cat, c] of Object.entries(byCategory)) {
  console.log(`  ${cat}: ${c}`);
}

const filtered = unique.filter((s) => s.category !== "gacha_bundle");
console.log(`\n[organize] gacha_bundle除外後: ${filtered.length} 件`);

filtered.sort((a, b) => b.price - a.price);

writeFileSync(
  "C:/Users/user/ai-skills/research/precure-parts-organized.json",
  JSON.stringify(filtered, null, 2),
  "utf-8"
);

const top = filtered.slice(0, 30);
let md = "# プリキュア付属品 整理済み裏どりリスト\n\n";
md += "重複統合・gacha除外・メルカリショップスURL対応・カテゴリタグ付き\n\n";
md += "凡例: 🔵single_part / 🟢complete_set / 🟡limited\n\n";

const ICON = {
  single_part: "🔵",
  complete_set: "🟢",
  limited: "🟡",
};

for (const s of top) {
  md += `## ${ICON[s.category] || "⚪"} ¥${s.price.toLocaleString()} (${s.soldDate}) ${s.name}\n`;
  md += `- カテゴリ: \`${s.category}\`\n`;
  md += `- 親アイテム: ${s.relatedParents.join(", ")}\n`;
  md += `- 商品状態ID: ${s.itemConditionId}\n`;
  md += `- メルカリ: [${s.mercariItemId}](${s.url})\n`;
  md += `- Gemini: ${s.gemini ? s.gemini.type + "/" + (s.gemini.confidence || "") : "なし"}\n\n`;
}

writeFileSync(
  "C:/Users/user/ai-skills/research/precure-parts-organized.md",
  md,
  "utf-8"
);

console.log(`\n出力:`);
console.log(`  precure-parts-organized.json (${filtered.length}件)`);
console.log(`  precure-parts-organized.md (TOP30)`);

console.log("\n=== TOP30（重複統合・ガチャ除外・正しいURL）===");
for (const s of top) {
  console.log(
    `${ICON[s.category]} ¥${String(s.price).padStart(7)} ${s.soldDate} ${s.name.slice(0, 60)}`
  );
}
