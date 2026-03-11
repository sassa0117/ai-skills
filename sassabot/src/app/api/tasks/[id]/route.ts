import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taskRunner } from "@/lib/engine/task-runner";

// タスク詳細 + ログ
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      logs: { orderBy: { createdAt: "desc" }, take: 100 },
      approvals: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(task);
}

// タスクキャンセル
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await taskRunner.cancel(id);
  return NextResponse.json({ ok: true });
}
