import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const platforms = await prisma.platform.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(platforms);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const platform = await prisma.platform.create({ data: body });
  return NextResponse.json(platform, { status: 201 });
}
