import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const phrases = await prisma.phrase.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(phrases);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const phrase = await prisma.phrase.create({ data: body });
  return NextResponse.json(phrase, { status: 201 });
}
