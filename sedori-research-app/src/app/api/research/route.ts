import { NextRequest, NextResponse } from "next/server";
import { searchMercariSold } from "@/lib/scrapers/mercari";
import { searchYahooAuctionClosed } from "@/lib/scrapers/yahoo-auction";
import { searchSurugaya } from "@/lib/scrapers/surugaya";
import { searchMandarake } from "@/lib/scrapers/mandarake";
import { searchLashinbang } from "@/lib/scrapers/lashinbang";
import { analyzeWithClaude } from "@/lib/ai/claude";
import { identifyProductFromImage } from "@/lib/ai/gemini";
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
    const { keyword, purchasePrice, image, imageMimeType } = body as {
      keyword?: string;
      purchasePrice?: number;
      image?: string;
      imageMimeType?: string;
    };

    // 画像がある場合はGeminiで商品特定
    let searchKeyword = keyword || "";
    let identifiedBy: "keyword" | "image" = "keyword";
    let productIdentification = null;

    if (image && imageMimeType) {
      try {
        productIdentification = await identifyProductFromImage(
          image,
          imageMimeType
        );
        searchKeyword = productIdentification.searchKeyword;
        identifiedBy = "image";
      } catch (error) {
        console.error("Gemini image recognition failed:", error);
        if (!keyword) {
          return NextResponse.json(
            { error: "画像認識に失敗しました。商品名を入力してください。" },
            { status: 400 }
          );
        }
      }
    }

    if (!searchKeyword) {
      return NextResponse.json(
        { error: "商品名または画像が必要です" },
        { status: 400 }
      );
    }

    // 5サイト並列でスクレイピング実行
    const [
      mercariResults,
      yahooResults,
      surugayaResults,
      mandarakeResults,
      lashinbangResults,
    ] = await Promise.allSettled([
      searchMercariSold(searchKeyword),
      searchYahooAuctionClosed(searchKeyword),
      searchSurugaya(searchKeyword),
      searchMandarake(searchKeyword),
      searchLashinbang(searchKeyword),
    ]);

    const scrapedData: ScrapingResult = {
      mercari:
        mercariResults.status === "fulfilled" ? mercariResults.value : [],
      yahooAuction:
        yahooResults.status === "fulfilled" ? yahooResults.value : [],
      surugaya:
        surugayaResults.status === "fulfilled" ? surugayaResults.value : [],
      mandarake:
        mandarakeResults.status === "fulfilled" ? mandarakeResults.value : [],
      lashinbang:
        lashinbangResults.status === "fulfilled"
          ? lashinbangResults.value
          : [],
    };

    // 全サイトの価格を集約してサマリー計算
    const allPrices = [
      ...scrapedData.mercari.map((i) => i.price),
      ...scrapedData.yahooAuction.map((i) => i.price),
      ...scrapedData.surugaya.map((i) => i.price),
      ...scrapedData.mandarake.map((i) => i.price),
      ...scrapedData.lashinbang.map((i) => i.price),
    ];
    const summary = calculateSummary(allPrices);

    // Claude APIで分析
    let aiJudgment;
    try {
      aiJudgment = await analyzeWithClaude(
        searchKeyword,
        purchasePrice,
        scrapedData
      );
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
        name: productIdentification?.productName || searchKeyword,
        identifiedBy,
        ...(productIdentification && {
          searchKeyword: productIdentification.searchKeyword,
          category: productIdentification.category,
          modelNumber: productIdentification.modelNumber,
          confidence: productIdentification.confidence,
        }),
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
