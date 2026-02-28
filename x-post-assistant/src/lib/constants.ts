export const ALGORITHM_ERAS = {
  pre_grok: { label: "旧アルゴ（〜2025/10）", end: new Date("2025-10-31") },
  grok_transition: { label: "Grok移行期（2025/11〜12）", start: new Date("2025-11-01"), end: new Date("2025-12-31") },
  grok_full: { label: "Grok完全稼働（2026/1〜）", start: new Date("2026-01-01") },
} as const;

export const IP_TIERS: Record<string, { label: string; color: string; bg: string; romBase: string }> = {
  S: { label: "S（国民的）", color: "text-red-700", bg: "bg-red-100", romBase: "数千万" },
  A: { label: "A（世代的）", color: "text-orange-700", bg: "bg-orange-100", romBase: "数百万" },
  B: { label: "B（層限定）", color: "text-blue-700", bg: "bg-blue-100", romBase: "数十万" },
  C: { label: "C（コア）", color: "text-gray-700", bg: "bg-gray-100", romBase: "数万" },
};

export const POST_TYPES: Record<string, { label: string; description: string }> = {
  mega_buzz: { label: "大バズ狙い", description: "認知拡大・フォロワー獲得" },
  mid_tier: { label: "中間安定型", description: "ファンベース維持・信頼構築" },
  quote_rt: { label: "引用RT", description: "便乗型" },
  self_reply: { label: "セルフリプ", description: "誘導" },
};

export const PROGRESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  initial: { label: "初速型", color: "text-yellow-700", bg: "bg-yellow-100" },
  delayed: { label: "遅延型", color: "text-green-700", bg: "bg-green-100" },
  dual_peak: { label: "二峰型", color: "text-purple-700", bg: "bg-purple-100" },
  ultra_initial: { label: "超初速型", color: "text-red-700", bg: "bg-red-100" },
  low: { label: "低調型", color: "text-gray-600", bg: "bg-gray-100" },
  sustained: { label: "持続型", color: "text-blue-700", bg: "bg-blue-100" },
};

export const BOOKMARK_RATE_THRESHOLD = 0.3;

export const PRICE_DIFF_TIERS = [
  { min: 100, label: "最強（100倍以上）", color: "text-red-600" },
  { min: 10, label: "十分（10倍以上）", color: "text-orange-600" },
  { min: 0, label: "工夫必須（10倍未満）", color: "text-gray-600" },
];

export function getAlgorithmEra(date: Date): string {
  if (date < new Date("2025-11-01")) return "pre_grok";
  if (date < new Date("2026-01-01")) return "grok_transition";
  return "grok_full";
}

export function getPriceDiffTier(ratio: number) {
  return PRICE_DIFF_TIERS.find((t) => ratio >= t.min) || PRICE_DIFF_TIERS[2];
}

export function formatPrice(yen: number): string {
  if (yen >= 10000) {
    const man = yen / 10000;
    return man % 1 === 0 ? `${man}万円` : `${man.toFixed(1)}万円`;
  }
  return `${yen.toLocaleString()}円`;
}
