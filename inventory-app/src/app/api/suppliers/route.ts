import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(suppliers);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supplier = await prisma.supplier.create({ data: body });
  return NextResponse.json(supplier, { status: 201 });
}
