import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// ドラフト一括保存（Claude Codeから呼ぶ用。AI APIは使わない）
interface DraftInput {
  content: string;
  postType?: string;
  scheduledAt?: string;
  productName?: string;
  sourcePostId?: string; // リメイク元のポストID
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const drafts: DraftInput[] = body.drafts;

    if (!Array.isArray(drafts) || drafts.length === 0) {
      return NextResponse.json({ error: "drafts配列が必要です" }, { status: 400 });
    }

    const created = await Promise.all(
      drafts.map((d) =>
        prisma.post.create({
          data: {
            content: d.content,
            postType: d.postType || null,
            status: "draft",
            scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
            productName: d.productName || null,
            isRewrite: !!d.sourcePostId,
            originalPostId: d.sourcePostId || null,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      saved: created.length,
      drafts: created.map((p) => ({
        id: p.id,
        content: p.content,
        postType: p.postType,
        scheduledAt: p.scheduledAt,
      })),
    });
  } catch (err) {
    console.error("Draft save error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}

// ドラフト一覧取得
export async function GET() {
  const drafts = await prisma.post.findMany({
    where: { status: "draft" },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      content: true,
      postType: true,
      scheduledAt: true,
      productName: true,
      isRewrite: true,
      originalPostId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ drafts, total: drafts.length });
}

// ドラフト全削除
export async function DELETE() {
  const result = await prisma.post.deleteMany({ where: { status: "draft" } });
  return NextResponse.json({ deleted: result.count });
}
