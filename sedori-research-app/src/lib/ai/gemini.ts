import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface ProductIdentification {
  productName: string;
  searchKeyword: string;
  category?: string;
  modelNumber?: string;
  confidence: "high" | "medium" | "low";
}

export async function identifyProductFromImage(
  base64Image: string,
  mimeType: string
): Promise<ProductIdentification> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
    {
      text: `この画像に写っている商品を特定してください。
以下のJSON形式で回答してください。JSONのみ出力し、それ以外のテキストは不要です。

{
  "productName": "商品の正式名称（わかる範囲で）",
  "searchKeyword": "メルカリやヤフオクで検索するのに最適なキーワード（型番があれば型番、なければ商品名+特徴）",
  "category": "カテゴリ（例: フィギュア, カードゲーム, アパレル, 家電, ゲームソフト, 本, その他）",
  "modelNumber": "型番や品番（わかれば）",
  "confidence": "high（確実に特定できた） / medium（おそらくこれ） / low（推測）"
}

注意:
- searchKeywordは検索精度を最大化するキーワードにしてください
- 型番がわかる場合は型番を優先
- ブランド名 + 商品名 + 特徴的なワードの組み合わせが理想
- 日本語で回答してください`,
    },
  ]);

  const text = result.response.text();

  // JSON部分を抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini応答からJSONを抽出できませんでした");
  }

  const parsed = JSON.parse(jsonMatch[0]) as ProductIdentification;

  return {
    productName: parsed.productName || "不明な商品",
    searchKeyword: parsed.searchKeyword || parsed.productName || "不明",
    category: parsed.category,
    modelNumber: parsed.modelNumber || undefined,
    confidence: parsed.confidence || "low",
  };
}
