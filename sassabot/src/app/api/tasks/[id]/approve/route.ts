import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse/event-emitter";

// 承認 or 拒否
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const body = await req.json();
  const { approvalId, decision } = body; // decision: "approved" | "rejected"

  if (!approvalId || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "approvalId and decision (approved/rejected) required" }, { status: 400 });
  }

  const approval = await prisma.approval.update({
    where: { id: approvalId },
    data: { status: decision, decidedAt: new Date() },
  });

  sseManager.broadcast({
    type: "approval:resolved",
    data: { approvalId: approval.id, status: decision },
  });

  // 拒否ならタスクも失敗扱い
  if (decision === "rejected") {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "cancelled", completedAt: new Date() },
    });
  }

  return NextResponse.json(approval);
}
