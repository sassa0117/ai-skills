import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// タグ付きデータ一覧取得
export async function GET(request: NextRequest) {
  const series = request.nextUrl.searchParams.get("series");
  const ipName = request.nextUrl.searchParams.get("ipName");

  const where: Record<string, string> = {};
  if (series) where.series = series;
  if (ipName) where.ipName = ipName;

  const items = await prisma.taggedItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

// タグ付きデータ保存
export async function POST(request: NextRequest) {
  const body = await request.json();

  const item = await prisma.taggedItem.upsert({
    where: { mercariId: body.mercariId },
    update: {
      ipName: body.ipName,
      series: body.series,
      productType: body.productType,
      gradeRank: body.gradeRank,
      accessories: body.accessories,
      limitedType: body.limitedType,
      hasTop: body.hasTop,
      hasBottom: body.hasBottom,
      topNote: body.topNote,
      bottomNote: body.bottomNote,
      releaseYear: body.releaseYear,
      memo: body.memo,
    },
    create: {
      mercariId: body.mercariId,
      name: body.name,
      price: body.price,
      description: body.description,
      soldDate: body.soldDate,
      photos: body.photos,
      condition: body.condition,
      category: body.category,
      shippingMethod: body.shippingMethod,
      sellerName: body.sellerName,
      ipName: body.ipName,
      series: body.series,
      productType: body.productType,
      gradeRank: body.gradeRank,
      accessories: body.accessories,
      limitedType: body.limitedType,
      hasTop: body.hasTop,
      hasBottom: body.hasBottom,
      topNote: body.topNote,
      bottomNote: body.bottomNote,
      releaseYear: body.releaseYear,
      memo: body.memo,
    },
  });

  return NextResponse.json(item);
}
