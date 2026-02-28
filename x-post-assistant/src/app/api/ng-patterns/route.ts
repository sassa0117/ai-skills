import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const patterns = await prisma.ngPattern.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(patterns);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const pattern = await prisma.ngPattern.create({ data: body });
  return NextResponse.json(pattern, { status: 201 });
}
