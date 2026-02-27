import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      platform: true,
      category: true,
      supplier: true,
      paymentMethod: true,
      tags: { include: { tag: true } },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { tagIds, ...data } = body;

  // Delete existing tags and recreate
  await prisma.productTag.deleteMany({ where: { productId: id } });

  const product = await prisma.product.update({
    where: { id },
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

  return NextResponse.json(product);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
