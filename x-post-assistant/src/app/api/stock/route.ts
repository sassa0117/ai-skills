import { prisma } from "@/lib/prisma";
import { detectIp } from "@/lib/ip-detector";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const used = searchParams.get("used");

  const where: Record<string, unknown> = {};
  if (used === "true") where.used = true;
  if (used === "false") where.used = false;

  const stocks = await prisma.productStock.findMany({
    where,
    include: { franchise: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(stocks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // IP自動判定
  let franchiseId = body.franchiseId || null;
  if (!franchiseId && body.productName) {
    const keywords = await prisma.ipKeyword.findMany({ include: { franchise: true } });
    const detected = detectIp(body.productName + " " + (body.memo || ""), keywords);
    if (detected) franchiseId = detected.franchiseId;
  }

  const stock = await prisma.productStock.create({
    data: {
      productName: body.productName,
      buyPrice: body.buyPrice || null,
      sellPrice: body.sellPrice || null,
      sourceUrl: body.sourceUrl || null,
      memo: body.memo || "",
      imageUrl: body.imageUrl || null,
      franchiseId,
    },
    include: { franchise: true },
  });

  return NextResponse.json(stock, { status: 201 });
}
