import { prisma } from "@/lib/prisma";
import { detectIp } from "@/lib/ip-detector";
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

export async function DELETE() {
  const result = await prisma.post.deleteMany({});
  return NextResponse.json({ deleted: result.count });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // IP自動判定（franchiseIdが未指定の場合）
  let franchiseId = body.franchiseId || null;
  if (!franchiseId && body.content) {
    const keywords = await prisma.ipKeyword.findMany({ include: { franchise: true } });
    const detected = detectIp(body.content, keywords);
    if (detected) franchiseId = detected.franchiseId;
  }

  const post = await prisma.post.create({
    data: {
      ...body,
      franchiseId,
      postDate: body.postDate ? new Date(body.postDate) : null,
    },
    include: { franchise: true },
  });

  return NextResponse.json(post, { status: 201 });
}

/** PATCH: 全ポストのIP自動判定を一括実行 */
export async function PATCH() {
  const keywords = await prisma.ipKeyword.findMany({ include: { franchise: true } });
  const posts = await prisma.post.findMany({ where: { franchiseId: null }, select: { id: true, content: true } });

  let classified = 0;
  for (const post of posts) {
    const detected = detectIp(post.content, keywords);
    if (detected) {
      await prisma.post.update({ where: { id: post.id }, data: { franchiseId: detected.franchiseId } });
      classified++;
    }
  }

  return NextResponse.json({ total: posts.length, classified });
}
