import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const franchises = await prisma.ipFranchise.findMany({
    include: { keywords: true, _count: { select: { posts: true } } },
    orderBy: { tier: "asc" },
  });
  return NextResponse.json(franchises);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { keywords, ...data } = body;

  const franchise = await prisma.ipFranchise.create({
    data: {
      ...data,
      keywords: keywords?.length
        ? { create: keywords.map((kw: string) => ({ keyword: kw })) }
        : undefined,
    },
    include: { keywords: true },
  });

  return NextResponse.json(franchise, { status: 201 });
}
