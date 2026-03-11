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
      text: `あなたは中古せどり（転売リサーチ）の専門家です。
この画像から商品を特定し、メルカリ・ヤフオクで検索するための最適なキーワードを生成してください。

## 画像の種類を判別してください
1. **通販サイト・フリマアプリのスクショ**（オフモール、セカスト、メルカリ等）
   → 画面上のテキスト（商品名・型番・ブランド名）をそのまま読み取って使う
2. **店舗の値札・棚の写真**
   → 値札のテキスト、JANコード、型番を読み取る
3. **商品そのもの（パッケージ・本体）の写真**
   → パッケージの文字、ロゴ、キャラクター名、シリーズ名を読み取る
4. **商品の外観のみ（文字なし）**
   → 見た目から推測する（この場合はconfidence: low）

## 検索キーワードのルール
- **画像内にテキストがあるなら、それを最優先で使え**（OCRのように正確に読み取る）
- 型番・品番があるなら型番のみで十分（例: "SHF-12345"）
- 型番がなければ: ブランド名 + シリーズ名 + キャラ名 + 商品種別
- 余計な修飾語は入れない（"レア" "美品" "希少" 等は不要）
- 検索で使えない一般的すぎるワードは避ける
- 複数キーワードはスペース区切り

## 出力形式（JSON のみ出力、他のテキストは一切不要）
{
  "productName": "商品の正式名称",
  "searchKeyword": "メルカリ・ヤフオク検索用キーワード",
  "category": "フィギュア / カードゲーム / アパレル / 家電 / ゲーム / 本 / DVD・BD / おもちゃ / その他",
  "modelNumber": "型番（あれば）",
  "confidence": "high / medium / low"
}`,
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
