import { NextResponse } from "next/server";
import { taskRunner } from "@/lib/engine/task-runner";
import { sseManager } from "@/lib/sse/event-emitter";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    runner: taskRunner.getStatus(),
    sseClients: sseManager.getClientCount(),
    timestamp: Date.now(),
  });
}
