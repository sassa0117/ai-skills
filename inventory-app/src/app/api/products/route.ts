import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const tradingStatus = searchParams.get("tradingStatus") || "";
  const platformId = searchParams.get("platformId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
    ];
  }

  if (tradingStatus && tradingStatus !== "all") {
    where.tradingStatus = tradingStatus;
  }

  if (platformId) {
    where.platformId = platformId;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (dateFrom || dateTo) {
    where.listingDate = {};
    if (dateFrom) (where.listingDate as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.listingDate as Record<string, unknown>).lte = new Date(dateTo);
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      platform: true,
      category: true,
      supplier: true,
      paymentMethod: true,
      tags: { include: { tag: true } },
    },
    orderBy: { [sortBy]: sortOrder },
  });

  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tagIds, ...data } = body;

  const product = await prisma.product.create({
    data: {
      ...data,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
      listingDate: data.listingDate ? new Date(data.listingDate) : null,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
      shippingDate: data.shippingDate ? new Date(data.shippingDate) : null,
      completionDate: data.completionDate ? new Date(data.completionDate) : null,
      tags: tagIds?.length
        ? { create: tagIds.map((tagId: string) => ({ tagId })) }
        : undefined,
    },
    include: {
      platform: true,
      category: true,
      supplier: true,
      paymentMethod: true,
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json(product, { status: 201 });
}
