import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkNgPatterns } from "@/lib/ng-checker";

const client = new Anthropic();

// --- システムプロンプト構築 ---

const BASE_SYSTEM = `あなたは「さっさ」のXポスト作成AIアシスタントです。
さっさは中古せどり（ぬいぐるみ・缶バッジ・フィギュア等）の配信者で、Xで商品の価格差・レア度を発信しています。

## 文体ルール（厳守）
- 短文。3行以内が理想。長文は絶対NG
- 感嘆表現: 「エグい」「高すぎる！！」「マジで穴場」
- 語尾: 「〜笑」「！！」多用。「ですね！」は内輪向けのみ
- 意外性: 「〜なのに」「マジで意味わからん」
- 価格差フォーマット: 「○○円→○○円！！」
- 【】でヘッドライン括り
- 断定形で書く。問いかけ「〜じゃない？」はNG

## 絶対NG
- 外部リンク直貼り
- 「知ってた？」系（商材臭い）
- 命令形「〜してください」
- 自己言及（「頑張ってる」「強化中」系）
- 問いかけ形式
- 長文の説明

## バズ公式
バズ確率 = IP認知度 × 自分事化度
- SランクIP（ポケモン・サンリオ・ジブリ・鬼滅・ドラえもん）× 自分事化フレーズ = 最強

## 自分事化フレーズ
- 「これ家にあったら終わりです」
- 「実家の押し入れ、もう一度だけ見て」
- 「まだ持ってたらガチで勝ち組」
- 「これ、捨ててなかったら勝ち」
- 「当時◯◯で普通に売ってた」
- 「定価◯円で買えたやつ」
- 「UFOキャッチャーで取ったな」

## 投稿タイプ
1. **実売ポスト（バズ狙い）**: 商品の価格差インパクト。「F賞なのに4000円で売れててエグい」
2. **まとめ系（中間安定型）**: 「【保存版】高額ぬいぐるみ3選」「【これだけ見て】◯◯」
3. **1選系**: 「これだけ見ておけ」的な1商品フォーカス

## テンプレート
バズ狙い:
[サイト名]、穴場すぎる
[仕入れ値]円→[販売価格]円！！
[判断理由1文・敬語なし]

まとめ系:
【保存版】[テーマ]○選
or 【これだけ見て】[テーマ]

## 出力ルール
- 2〜3個のバリエーションを出す
- 各バリエーションは280文字以内
- JSONで返す（後述のフォーマット）`;

async function getTopPosts(limit = 10): Promise<string> {
  const posts = await prisma.post.findMany({
    where: { impressions: { gt: 10000 } },
    orderBy: { impressions: "desc" },
    take: limit,
    select: { content: true, impressions: true, likes: true, engagementRate: true },
  });

  if (posts.length === 0) return "";

  return `\n\n## 過去の高パフォーマンスポスト（参考）\n${posts
    .map((p) => `- ${p.impressions.toLocaleString()}imp | ${p.content.slice(0, 80)}`)
    .join("\n")}`;
}

// --- 生成モード ---

export interface GenerateRequest {
  mode: "product" | "remake" | "matome";
  // product mode
  productName?: string;
  buyPrice?: number;
  sellPrice?: number;
  memo?: string;
  // remake mode
  originalContent?: string;
  originalImpressions?: number;
  // matome mode
  theme?: string;
  count?: number; // 3選、5選など
}

export interface GeneratedPost {
  content: string;
  type: string;
  reasoning: string;
}

export interface GenerateResult {
  variations: GeneratedPost[];
  ngWarnings: string[];
}

function buildUserPrompt(req: GenerateRequest): string {
  switch (req.mode) {
    case "product":
      return `以下の商品でXポストを作成して。

商品名: ${req.productName}
${req.buyPrice ? `仕入れ値: ${req.buyPrice}円` : ""}
${req.sellPrice ? `販売価格: ${req.sellPrice}円` : ""}
${req.memo ? `面白いポイント: ${req.memo}` : ""}

バズ狙いの実売ポストとして2〜3パターン作って。価格差のインパクトを最大化して。

以下のJSON形式で返して（他の文章は不要）:
[{"content": "ポスト本文", "type": "mega_buzz", "reasoning": "この案の狙い"}]`;

    case "remake":
      return `以下の過去ポスト（${req.originalImpressions?.toLocaleString() || "不明"}imp）をリメイクして。

元ポスト:
${req.originalContent}

ルール:
- 切り口を変える（同じ内容の再投稿はGrokが「既視感」検出でペナルティ）
- 画像変更前提（テキストだけ作る）
- 自分事化フレーズを追加or変更
- 金額は最新に更新想定

2〜3パターンのリメイク案を作って。

以下のJSON形式で返して（他の文章は不要）:
[{"content": "ポスト本文", "type": "remake", "reasoning": "元ポストからの変更点"}]`;

    case "matome":
      return `「${req.theme}」をテーマにまとめ系ポストを作って。

${req.count ? `${req.count}選形式` : "【これだけ見て】1選形式 or 【保存版】3選形式"}で。

まとめ系は高ブックマーク率 → Grokの「質」評価に貢献するタイプ。
短くパンチのある見出しが重要。

2〜3パターン作って。

以下のJSON形式で返して（他の文章は不要）:
[{"content": "ポスト本文", "type": "mid_tier", "reasoning": "この案の狙い"}]`;
  }
}

export async function generatePost(req: GenerateRequest): Promise<GenerateResult> {
  const topPosts = await getTopPosts();
  const systemPrompt = BASE_SYSTEM + topPosts;
  const userPrompt = buildUserPrompt(req);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // JSONパース
  let variations: GeneratedPost[];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    variations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    variations = [{ content: text, type: req.mode, reasoning: "JSON parse failed" }];
  }

  // NGチェック
  const ngPatterns = await prisma.ngPattern.findMany();
  const allWarnings: string[] = [];
  for (const v of variations) {
    const ngResult = checkNgPatterns(v.content, ngPatterns);
    for (const ng of ngResult.matches) {
      allWarnings.push(`「${v.content.slice(0, 20)}...」: ${ng.reason}`);
    }
  }

  return { variations, ngWarnings: allWarnings };
}
