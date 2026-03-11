import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 通知一覧
export async function GET(req: NextRequest) {
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: unreadOnly ? { read: false } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(notifications);
}

// 既読にする
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { ids } = body; // string[]

  if (ids && Array.isArray(ids)) {
    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { read: true },
    });
  } else {
    // 全既読
    await prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}
