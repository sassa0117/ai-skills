import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taskRunner } from "@/lib/engine/task-runner";
import { sseManager } from "@/lib/sse/event-emitter";

// タスク一覧
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  const tasks = await prisma.task.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      _count: { select: { logs: true, approvals: true } },
      approvals: {
        where: { status: "pending" },
        take: 1,
      },
    },
  });

  return NextResponse.json(tasks);
}

// タスク作成 → 即実行
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, prompt, priority, workDir } = body;

  if (!title || !prompt) {
    return NextResponse.json({ error: "title and prompt required" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      prompt,
      priority: priority ?? "normal",
      workDir: workDir ?? null,
    },
  });

  sseManager.broadcast({
    type: "task:created",
    data: { taskId: task.id, title: task.title },
  });

  // 即実行開始
  taskRunner.start(task.id).catch((err) => {
    console.error(`Task start failed: ${err.message}`);
  });

  return NextResponse.json(task, { status: 201 });
}
