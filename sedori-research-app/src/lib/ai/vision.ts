/**
 * Google Cloud Vision API - Web Detection
 * Google Lensと同じ画像検索インデックスを使って商品を特定する
 */

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

export interface ProductIdentification {
  productName: string;
  searchKeyword: string;
  category?: string;
  modelNumber?: string;
  confidence: "high" | "medium" | "low";
  webPages?: { title: string; url: string }[];
}

interface VisionWebEntity {
  entityId?: string;
  score: number;
  description: string;
}

interface VisionBestGuessLabel {
  label: string;
  languageCode?: string;
}

interface VisionMatchingPage {
  url: string;
  pageTitle?: string;
  fullMatchingImages?: { url: string }[];
  partialMatchingImages?: { url: string }[];
}

interface VisionWebDetection {
  bestGuessLabels?: VisionBestGuessLabel[];
  webEntities?: VisionWebEntity[];
  pagesWithMatchingImages?: VisionMatchingPage[];
  visuallySimilarImages?: { url: string }[];
}

export async function identifyProductFromImage(
  base64Image: string,
  _mimeType: string
): Promise<ProductIdentification> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (Google API Key) が設定されていません");
  }

  const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [
            { type: "WEB_DETECTION", maxResults: 20 },
            { type: "TEXT_DETECTION", maxResults: 5 },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Vision API error:", response.status, errorBody);
    throw new Error(`Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const result = data.responses?.[0];

  if (result?.error) {
    throw new Error(`Vision API: ${result.error.message}`);
  }

  const webDetection: VisionWebDetection = result?.webDetection || {};
  const textAnnotations = result?.textAnnotations || [];

  // OCRで読み取れたテキスト全文（最初の要素が全文）
  const ocrFullText: string = textAnnotations[0]?.description || "";

  // bestGuessLabels: Googleが推測した画像の内容（最も信頼度が高い）
  const bestGuesses = (webDetection.bestGuessLabels || []).map(
    (l: VisionBestGuessLabel) => l.label
  );

  // webEntities: 画像に関連するエンティティ（スコア順）
  const entities = (webDetection.webEntities || [])
    .filter((e: VisionWebEntity) => e.description && e.score > 0.3)
    .sort((a: VisionWebEntity, b: VisionWebEntity) => b.score - a.score);

  // マッチしたWebページ（商品ページの可能性が高い）
  const matchingPages = (webDetection.pagesWithMatchingImages || [])
    .filter((p: VisionMatchingPage) => p.pageTitle)
    .slice(0, 5);

  // 商品名の決定ロジック
  const productName = determineProductName(
    bestGuesses,
    entities,
    matchingPages,
    ocrFullText
  );

  // 検索キーワードの生成
  const searchKeyword = generateSearchKeyword(
    bestGuesses,
    entities,
    matchingPages,
    ocrFullText
  );

  // 信頼度の判定
  const confidence = determineConfidence(
    bestGuesses,
    entities,
    matchingPages,
    ocrFullText
  );

  // 型番抽出（OCRテキストから）
  const modelNumber = extractModelNumber(ocrFullText);

  // Webページ情報（UI表示用）
  const webPages = matchingPages.map((p: VisionMatchingPage) => ({
    title: p.pageTitle || "",
    url: p.url,
  }));

  console.log("[Vision API] bestGuesses:", bestGuesses);
  console.log(
    "[Vision API] top entities:",
    entities.slice(0, 5).map((e: VisionWebEntity) => `${e.description}(${e.score.toFixed(2)})`)
  );
  console.log("[Vision API] productName:", productName);
  console.log("[Vision API] searchKeyword:", searchKeyword);
  console.log("[Vision API] confidence:", confidence);

  return {
    productName,
    searchKeyword,
    category: undefined,
    modelNumber: modelNumber || undefined,
    confidence,
    webPages,
  };
}

/**
 * 商品名を決定する
 * 優先順位: マッチページタイトル > bestGuessLabel > topEntity
 */
function determineProductName(
  bestGuesses: string[],
  entities: VisionWebEntity[],
  matchingPages: VisionMatchingPage[],
  ocrText: string
): string {
  // 1. マッチしたWebページのタイトルから商品名を抽出
  //    通販サイト（メルカリ、ヤフオク、Amazon等）のタイトルは商品名そのもの
  for (const page of matchingPages) {
    const title = page.pageTitle || "";
    // ノイズを除去して商品名を抽出
    const cleaned = cleanPageTitle(title);
    if (cleaned && cleaned.length > 3 && cleaned.length < 100) {
      return cleaned;
    }
  }

  // 2. bestGuessLabel（Googleの推測）
  if (bestGuesses.length > 0 && bestGuesses[0].length > 2) {
    return bestGuesses[0];
  }

  // 3. 上位エンティティの組み合わせ
  if (entities.length > 0) {
    return entities
      .slice(0, 3)
      .map((e) => e.description)
      .join(" ");
  }

  // 4. OCRテキストの先頭部分
  if (ocrText) {
    return ocrText.split("\n")[0].slice(0, 80);
  }

  return "不明な商品";
}

/**
 * メルカリ/ヤフオク検索用キーワードを生成する
 */
function generateSearchKeyword(
  bestGuesses: string[],
  entities: VisionWebEntity[],
  matchingPages: VisionMatchingPage[],
  ocrText: string
): string {
  const keywords: string[] = [];

  // 型番があればそれだけで十分
  const modelNum = extractModelNumber(ocrText);
  if (modelNum) {
    // 型番 + ブランド名（あれば）
    const brand = entities.find(
      (e) => e.score > 0.5 && !e.description.match(/^[0-9]/)
    );
    if (brand) {
      return `${brand.description} ${modelNum}`;
    }
    return modelNum;
  }

  // bestGuessLabelを最優先（Googleの画像検索結果と同等）
  if (bestGuesses.length > 0) {
    const guess = bestGuesses[0];
    // 日本語のbestGuessがあればそれが最適
    if (guess.match(/[\u3000-\u9fff]/)) {
      // 長すぎる場合は適度にカット
      if (guess.length <= 30) {
        return guess;
      }
      // 先頭30文字でキーワード的に使える部分を返す
      return guess.slice(0, 30).trim();
    }
    keywords.push(guess);
  }

  // 高スコアのエンティティを追加（重複排除）
  for (const entity of entities.slice(0, 4)) {
    const desc = entity.description;
    if (desc && !keywords.some((k) => k.includes(desc) || desc.includes(k))) {
      keywords.push(desc);
    }
  }

  // マッチページタイトルからキーワード補完
  if (keywords.length < 2 && matchingPages.length > 0) {
    const title = cleanPageTitle(matchingPages[0].pageTitle || "");
    if (title && !keywords.some((k) => title.includes(k))) {
      // タイトルから主要なキーワードを抽出
      const titleWords = title.split(/[\s　/|｜\-–—]+/).filter((w) => w.length > 1);
      for (const word of titleWords.slice(0, 3)) {
        if (!keywords.some((k) => k.includes(word) || word.includes(k))) {
          keywords.push(word);
          if (keywords.length >= 4) break;
        }
      }
    }
  }

  if (keywords.length === 0) {
    // 最終手段: OCRテキストの先頭
    if (ocrText) {
      return ocrText.split("\n")[0].slice(0, 30).trim();
    }
    return "不明";
  }

  return keywords.join(" ");
}

/**
 * 信頼度を判定
 */
function determineConfidence(
  bestGuesses: string[],
  entities: VisionWebEntity[],
  matchingPages: VisionMatchingPage[],
  ocrText: string
): "high" | "medium" | "low" {
  // 完全一致するWebページが見つかった → high
  const hasFullMatch = matchingPages.some(
    (p) => (p.fullMatchingImages || []).length > 0
  );
  if (hasFullMatch && bestGuesses.length > 0) {
    return "high";
  }

  // bestGuessがあり、高スコアエンティティもある → high
  if (
    bestGuesses.length > 0 &&
    entities.length > 0 &&
    entities[0].score > 0.7
  ) {
    return "high";
  }

  // bestGuessはあるが確信度がやや低い、またはOCRテキストがある
  if (bestGuesses.length > 0 || ocrText.length > 10) {
    return "medium";
  }

  // エンティティだけ
  if (entities.length > 0) {
    return "medium";
  }

  return "low";
}

/**
 * ページタイトルからノイズを除去
 */
function cleanPageTitle(title: string): string {
  return (
    title
      // 通販サイト名を除去
      .replace(
        /\s*[-–—|｜]\s*(メルカリ|ヤフオク!?|Amazon\.?co\.?jp|楽天市場|Yahoo!?ショッピング|駿河屋|まんだらけ|らしんばん|ヤフオク|PayPayフリマ|ラクマ).*/gi,
        ""
      )
      .replace(
        /^(メルカリ|ヤフオク!?|Amazon\.?co\.?jp|楽天市場)[\s\-–—|｜]+/gi,
        ""
      )
      // 一般的なサフィックスノイズを除去
      .replace(/\s*[-–—|｜]\s*(通販|公式|オンライン).*/gi, "")
      .replace(/【.*?】/g, "")
      .replace(/\[.*?\]/g, "")
      .trim()
  );
}

/**
 * テキストから型番を抽出
 */
function extractModelNumber(text: string): string | null {
  if (!text) return null;

  // 一般的な型番パターン: 英数字+ハイフン（例: SHF-12345, ABC-1234-X）
  const patterns = [
    /\b([A-Z]{2,}[-\s]?\d{3,}[-A-Z0-9]*)\b/i,
    /\b(\d{3,}[-][A-Z0-9]+)\b/i,
    // JANコード（13桁 or 8桁）
    /\b(49\d{11})\b/,
    /\b(45\d{11})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}
