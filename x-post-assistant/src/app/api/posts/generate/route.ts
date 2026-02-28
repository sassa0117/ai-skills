import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { generateVariations } from "@/lib/template-engine";
import { detectIp } from "@/lib/ip-detector";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { productName, buyPrice, sellPrice, sourceStore, postType } = body;

  // IP自動判定
  const keywords = await prisma.ipKeyword.findMany({
    include: { franchise: true },
  });
  const detected = detectIp(productName, keywords);

  // テンプレート取得
  const templates = await prisma.postTemplate.findMany({
    where: postType ? { postType } : undefined,
    orderBy: { sortOrder: "asc" },
  });

  // フレーズ取得
  const phrases = await prisma.phrase.findMany();

  const variations = generateVariations(
    {
      productName,
      ipName: detected?.name,
      ipTier: detected?.tier,
      buyPrice: Number(buyPrice) || 0,
      sellPrice: Number(sellPrice) || 0,
      sourceStore,
    },
    templates,
    phrases
  );

  return NextResponse.json({
    variations,
    detectedIp: detected,
    priceDiffRatio: buyPrice > 0 ? sellPrice / buyPrice : 0,
  });
}
