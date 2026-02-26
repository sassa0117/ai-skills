import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const tags = await prisma.tag.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const tag = await prisma.tag.create({ data: body });
  return NextResponse.json(tag, { status: 201 });
}
