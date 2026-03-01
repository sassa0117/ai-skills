export interface PriceResult {
  name: string;
  price: number;
  status: "sold" | "on_sale" | "closed";
  date?: string;
  url?: string;
  condition?: string;
  likes?: number;
  bids?: number;
  source: "mercari" | "yahoo_auction" | "surugaya" | "mandarake" | "lashinbang";
}

export interface SurugayaResult {
  sellPrice?: number;
  buyPrice?: number;
  inStock: boolean;
  url?: string;
  items: PriceResult[];
}

export interface ScrapingResult {
  mercari: PriceResult[];
  yahooAuction: PriceResult[];
  surugaya: PriceResult[];
  mandarake: PriceResult[];
  lashinbang: PriceResult[];
}

export interface PriceSummary {
  medianPrice: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  sampleCount: number;
}

export interface AiJudgment {
  recommendation: "strong_buy" | "buy" | "cautious" | "skip";
  reasoning: string;
  estimatedProfit?: number;
  estimatedROI?: number;
  risks: string[];
}

export interface ResearchResult {
  product: {
    name: string;
    identifiedBy: "keyword" | "image";
  };
  prices: ScrapingResult;
  summary: PriceSummary;
  aiJudgment: AiJudgment;
}
