import { NextRequest, NextResponse } from "next/server";
import { searchMercariSold } from "@/lib/scrapers/mercari";
import { searchYahooAuctionClosed } from "@/lib/scrapers/yahoo-auction";
import { analyzeWithClaude } from "@/lib/ai/claude";
import type { PriceSummary, ScrapingResult } from "@/lib/types";

function calculateSummary(prices: number[]): PriceSummary {
  if (prices.length === 0) {
    return {
      medianPrice: 0,
      averagePrice: 0,
      minPrice: 0,
      maxPrice: 0,
      sampleCount: 0,
    };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return {
    medianPrice:
      sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid],
    averagePrice: Math.round(
      sorted.reduce((a, b) => a + b, 0) / sorted.length
    ),
    minPrice: sorted[0],
    maxPrice: sorted[sorted.length - 1],
    sampleCount: sorted.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, purchasePrice } = body as {
      keyword?: string;
      purchasePrice?: number;
    };

    if (!keyword) {
      return NextResponse.json(
        { error: "keyword is required" },
        { status: 400 }
      );
    }

    // 並列でスクレイピング実行
    const [mercariResults, yahooResults] = await Promise.allSettled([
      searchMercariSold(keyword),
      searchYahooAuctionClosed(keyword),
    ]);

    const scrapedData: ScrapingResult = {
      mercari:
        mercariResults.status === "fulfilled" ? mercariResults.value : [],
      yahooAuction:
        yahooResults.status === "fulfilled" ? yahooResults.value : [],
      surugaya: [],
      mandarake: [],
      lashinbang: [],
    };

    // 全サイトの価格を集約してサマリー計算
    const allPrices = [
      ...scrapedData.mercari.map((i) => i.price),
      ...scrapedData.yahooAuction.map((i) => i.price),
    ];
    const summary = calculateSummary(allPrices);

    // Claude APIで分析
    let aiJudgment;
    try {
      aiJudgment = await analyzeWithClaude(keyword, purchasePrice, scrapedData);
    } catch (error) {
      console.error("Claude API failed:", error);
      aiJudgment = {
        recommendation: "cautious" as const,
        reasoning: "AI分析に失敗しました。価格データを参考に判断してください。",
        risks: ["AI分析が利用できませんでした"],
      };
    }

    return NextResponse.json({
      product: {
        name: keyword,
        identifiedBy: "keyword",
      },
      prices: scrapedData,
      summary,
      aiJudgment,
    });
  } catch (error) {
    console.error("Research API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
