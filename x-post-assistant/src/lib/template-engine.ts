import { formatPrice, getPriceDiffTier } from "./constants";

interface ProductInput {
  productName: string;
  ipName?: string;
  ipTier?: string;
  buyPrice: number;
  sellPrice: number;
  sourceStore?: string;
}

interface TemplateRecord {
  id: string;
  name: string;
  template: string;
  postType: string;
}

interface PhraseRecord {
  id: string;
  text: string;
  category: string | null;
}

export interface GeneratedVariation {
  text: string;
  templateName: string;
  charCount: number;
  postType: string;
  usedPhraseIds: string[];
}

export function generateVariations(
  product: ProductInput,
  templates: TemplateRecord[],
  phrases: PhraseRecord[]
): GeneratedVariation[] {
  const ratio = product.buyPrice > 0 ? product.sellPrice / product.buyPrice : 0;
  const diffTier = getPriceDiffTier(ratio);
  const variations: GeneratedVariation[] = [];

  for (const tpl of templates) {
    // テンプレートの変数を置換
    let text = tpl.template
      .replace(/\{productName\}/g, product.productName)
      .replace(/\{ipName\}/g, product.ipName || "")
      .replace(/\{buyPrice\}/g, formatPrice(product.buyPrice))
      .replace(/\{sellPrice\}/g, formatPrice(product.sellPrice))
      .replace(/\{sourceStore\}/g, product.sourceStore || "リサイクルショップ")
      .replace(/\{priceDiff\}/g, `${Math.round(ratio)}倍`)
      .replace(/\{priceDiffLabel\}/g, diffTier.label);

    // フレーズなしバージョン
    variations.push({
      text: text.trim(),
      templateName: tpl.name,
      charCount: text.trim().length,
      postType: tpl.postType,
      usedPhraseIds: [],
    });

    // フレーズ付きバージョン（上位3つのフレーズで）
    const relevantPhrases = phrases.slice(0, 3);
    for (const phrase of relevantPhrases) {
      const withPhrase = `${phrase.text}\n\n${text.trim()}`;
      variations.push({
        text: withPhrase,
        templateName: `${tpl.name} + フレーズ`,
        charCount: withPhrase.length,
        postType: tpl.postType,
        usedPhraseIds: [phrase.id],
      });
    }
  }

  return variations;
}
