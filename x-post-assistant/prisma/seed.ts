import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // === IP作品マスタ ===
  const franchises = [
    { name: "ポケモン", tier: "S", romBase: "数千万", keywords: ["ポケモン", "ポケカ", "pikachu", "ピカチュウ", "イーブイ"] },
    { name: "サンリオ", tier: "S", romBase: "数千万", keywords: ["サンリオ", "シュガバニ", "シナモロール", "マイメロ", "ポムポムプリン", "クロミ"] },
    { name: "ジブリ", tier: "S", romBase: "数千万", keywords: ["ジブリ", "トトロ", "千と千尋", "もののけ姫", "ナウシカ"] },
    { name: "鬼滅の刃", tier: "S", romBase: "数千万", keywords: ["鬼滅", "きめつ", "炭治郎", "禰豆子"] },
    { name: "ドラえもん", tier: "S", romBase: "数千万", keywords: ["ドラえもん", "のび太"] },
    { name: "HUNTER×HUNTER", tier: "A", romBase: "数百万", keywords: ["ハンター", "HUNTER", "キルア", "ゴン"] },
    { name: "ハイキュー", tier: "A", romBase: "数百万", keywords: ["ハイキュー", "日向", "影山"] },
    { name: "プリキュア", tier: "A", romBase: "数百万", keywords: ["プリキュア", "precure"] },
    { name: "どうぶつの森", tier: "A", romBase: "数百万", keywords: ["どうぶつの森", "あつ森", "どう森"] },
    { name: "リラックマ", tier: "A", romBase: "数百万", keywords: ["リラックマ"] },
    { name: "ワンピース", tier: "A", romBase: "数百万", keywords: ["ワンピース", "ONE PIECE", "ルフィ"] },
    { name: "ダンガンロンパ", tier: "B", romBase: "数十万", keywords: ["ダンガンロンパ", "弾丸論破"] },
    { name: "ペルソナ", tier: "B", romBase: "数十万", keywords: ["ペルソナ", "P5", "P4"] },
    { name: "銀魂", tier: "B", romBase: "数十万", keywords: ["銀魂", "ぎんたま"] },
    { name: "忍たま", tier: "B", romBase: "数十万", keywords: ["忍たま", "乱太郎"] },
    { name: "特撮", tier: "C", romBase: "数万", keywords: ["特撮", "仮面ライダー", "ウルトラマン", "戦隊"] },
    { name: "イナズマイレブン", tier: "C", romBase: "数万", keywords: ["イナズマイレブン", "イナイレ"] },
    { name: "第五人格", tier: "C", romBase: "数万", keywords: ["第五人格", "IdentityV"] },
  ];

  for (const f of franchises) {
    const franchise = await prisma.ipFranchise.upsert({
      where: { name: f.name },
      update: { tier: f.tier, romBase: f.romBase },
      create: { name: f.name, tier: f.tier, romBase: f.romBase },
    });

    for (const kw of f.keywords) {
      await prisma.ipKeyword.upsert({
        where: { keyword: kw },
        update: { franchiseId: franchise.id },
        create: { keyword: kw, franchiseId: franchise.id },
      });
    }
  }

  // === 自分事化フレーズ ===
  const phrases = [
    { text: "これ家にあったら終わりです", effect: "危機感+期待", bestResult: "930万imp（シュガバニ）", category: "urgency" },
    { text: "実家の押し入れ、もう一度だけ見て", effect: "行動喚起", bestResult: "930万imp", category: "nostalgia" },
    { text: "まだ持ってたらガチで勝ち組", effect: "所有確認欲求", bestResult: "930万imp", category: "self_relevance" },
    { text: "これ、捨ててなかったら勝ち", effect: "後悔の感情", bestResult: "2.8万imp", category: "self_relevance" },
    { text: "当時◯◯で普通に売ってた", effect: "購入経験の想起", bestResult: "930万imp", category: "nostalgia" },
    { text: "定価◯円で買えたやつ", effect: "当時の記憶呼び起こし", bestResult: "-", category: "nostalgia" },
    { text: "UFOキャッチャーで取ったな", effect: "体験記憶の想起", bestResult: "1.7万imp", category: "nostalgia" },
  ];

  for (const p of phrases) {
    await prisma.phrase.upsert({
      where: { text: p.text },
      update: { effect: p.effect, bestResult: p.bestResult, category: p.category },
      create: p,
    });
  }

  // === NGパターン ===
  const ngPatterns = [
    { pattern: "https?://", reason: "外部リンクは致命的ペナルティ（Grok時代）", suggestion: "リンクはリプ欄に貼る", severity: "error" },
    { pattern: "じゃない？|じゃないですか", reason: "疑問形は断定形に比べてエンゲージメント低い", suggestion: "断定形に変更（「〜です！」「〜！！」）", severity: "warning" },
    { pattern: "知ってた？|知ってました？", reason: "商材臭い・上から目線に感じる", suggestion: "事実ベースで提示する", severity: "warning" },
    { pattern: "してください|して下さい", reason: "命令形は上から目線", suggestion: "提案形に変更", severity: "warning" },
    { pattern: "強化中|頑張って|取り組んで", reason: "自分語り＝自慢に見える", suggestion: "商品フォーカスに切り替え", severity: "warning" },
    { pattern: "ございます|いたします", reason: "ビジネス敬語はXの空気に合わない", suggestion: "カジュアルな口調に", severity: "warning" },
  ];

  for (const ng of ngPatterns) {
    const existing = await prisma.ngPattern.findFirst({ where: { pattern: ng.pattern } });
    if (!existing) {
      await prisma.ngPattern.create({ data: ng });
    }
  }

  // === ポストテンプレート ===
  const templates = [
    {
      name: "バズ狙い（価格差インパクト）",
      template: "{sourceStore}、穴場すぎる\n\n{productName}\n{buyPrice}→{sellPrice}！！\n\nエグい",
      postType: "mega_buzz",
      description: "S/Aティア × 価格差10倍以上向け",
      sortOrder: 1,
    },
    {
      name: "バズ狙い（驚き型）",
      template: "{productName}、高すぎる！！\n\n{sellPrice}って何事！？\n{buyPrice}で買えた時代が懐かしい",
      postType: "mega_buzz",
      description: "高額商品の驚き訴求",
      sortOrder: 2,
    },
    {
      name: "中間安定型（まとめ）",
      template: "【これだけ見て】{productName}\n\n{buyPrice}→{sellPrice}\n\n{sourceStore}で見つけたら即買いレベル",
      postType: "mid_tier",
      description: "フォロワー向け情報共有",
      sortOrder: 3,
    },
    {
      name: "中間安定型（保存版）",
      template: "【保存版】{ipName}の高額商品\n\n{productName}\n相場：{sellPrice}\n\nリサイクルショップで{buyPrice}ぐらいで転がってる",
      postType: "mid_tier",
      description: "保存を促すまとめ型",
      sortOrder: 4,
    },
    {
      name: "引用RT（価格情報追加）",
      template: "これ、{sourceStore}で{buyPrice}で売ってた\n\n今{sellPrice}はエグい",
      postType: "quote_rt",
      description: "他人のポストに価格情報を追加",
      sortOrder: 5,
    },
  ];

  for (const t of templates) {
    const existing = await prisma.postTemplate.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.postTemplate.create({ data: t });
    }
  }

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
