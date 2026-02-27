import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const methods = await prisma.paymentMethod.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(methods);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const method = await prisma.paymentMethod.create({ data: body });
  return NextResponse.json(method, { status: 201 });
}
