import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const productStats = await prisma.product.groupBy({
    by: ["tradingStatus"],
    _count: true,
  });

  return NextResponse.json({ productStats });
}
