import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const franchiseId = searchParams.get("franchiseId") || "";
  const algorithmEra = searchParams.get("algorithmEra") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.content = { contains: search };
  }
  if (status && status !== "all") {
    where.status = status;
  }
  if (franchiseId) {
    where.franchiseId = franchiseId;
  }
  if (algorithmEra) {
    where.algorithmEra = algorithmEra;
  }

  const posts = await prisma.post.findMany({
    where,
    include: { franchise: true },
    orderBy: { [sortBy]: sortOrder },
    take: 100,
  });

  return NextResponse.json(posts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const post = await prisma.post.create({
    data: {
      ...body,
      postDate: body.postDate ? new Date(body.postDate) : null,
    },
    include: { franchise: true },
  });

  return NextResponse.json(post, { status: 201 });
}
