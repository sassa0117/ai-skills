import { spawn, type ChildProcess } from "child_process";
import { prisma } from "@/lib/prisma";
import { sseManager } from "@/lib/sse/event-emitter";
import { redactSecrets } from "@/lib/security/secret-redactor";
import type { NotificationType } from "./types";

interface RunningTask {
  taskId: string;
  process: ChildProcess;
  output: string[];
}

class TaskRunner {
  private running: Map<string, RunningTask> = new Map();
  private maxConcurrent = 3;

  get activeCount() {
    return this.running.size;
  }

  async start(taskId: string): Promise<void> {
    if (this.running.size >= this.maxConcurrent) {
      await this.log(taskId, "warn", `同時実行上限(${this.maxConcurrent})に達しています。キューで待機中...`);
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const workDir = task.workDir || "C:\\Users\\user\\ai-skills";

    // Claude Code CLIをJSON streaming modeで起動
    const proc = spawn("claude", [
      "--print",
      "--output-format", "stream-json",
      "--max-turns", "50",
      task.prompt,
    ], {
      cwd: workDir,
      shell: true,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDECODE"))
      ) as NodeJS.ProcessEnv,
    });

    const running: RunningTask = {
      taskId,
      process: proc,
      output: [],
    };

    this.running.set(taskId, running);

    await prisma.task.update({
      where: { id: taskId },
      data: { status: "running", pid: proc.pid, startedAt: new Date() },
    });

    sseManager.broadcast({
      type: "task:started",
      data: { taskId, pid: proc.pid ?? 0 },
    });

    await this.log(taskId, "info", `Claude Code起動 (PID: ${proc.pid})`);

    let buffer = "";

    proc.stdout?.on("data", async (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          await this.handleStreamEvent(taskId, event);
        } catch {
          // JSONじゃない行はそのまま出力として記録
          const cleaned = redactSecrets(line);
          running.output.push(cleaned);
          await this.log(taskId, "output", cleaned);
        }
      }
    });

    proc.stderr?.on("data", async (chunk: Buffer) => {
      const msg = redactSecrets(chunk.toString().trim());
      if (msg) {
        await this.log(taskId, "error", msg);
      }
    });

    proc.on("close", async (code: number | null) => {
      this.running.delete(taskId);
      const finalOutput = running.output.join("\n");

      if (code === 0) {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "completed",
            result: finalOutput.slice(-10000), // 最後の10000文字を保存
            completedAt: new Date(),
          },
        });
        sseManager.broadcast({
          type: "task:completed",
          data: { taskId, result: finalOutput.slice(-500) },
        });
        await this.notify(taskId, "completed", `タスク完了: ${task.title}`, "正常に完了しました");
      } else {
        const errorMsg = `プロセス終了コード: ${code}`;
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "failed",
            error: errorMsg,
            result: finalOutput.slice(-10000),
            completedAt: new Date(),
          },
        });
        sseManager.broadcast({
          type: "task:failed",
          data: { taskId, error: errorMsg },
        });
        await this.notify(taskId, "error", `タスク失敗: ${task.title}`, errorMsg);
      }

      await this.log(taskId, "info", `完了 (exit code: ${code})`);
      // キューに待機中タスクがあれば次を起動
      await this.processQueue();
    });

    proc.on("error", async (err: Error) => {
      this.running.delete(taskId);
      const errorMsg = `プロセスエラー: ${err.message}`;
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "failed", error: errorMsg, completedAt: new Date() },
      });
      sseManager.broadcast({
        type: "task:failed",
        data: { taskId, error: errorMsg },
      });
      await this.notify(taskId, "error", `タスクエラー: ${task.title}`, errorMsg);
    });
  }

  private async handleStreamEvent(taskId: string, event: Record<string, unknown>) {
    const running = this.running.get(taskId);
    if (!running) return;

    const type = event.type as string;

    switch (type) {
      case "assistant": {
        // アシスタントのテキスト出力
        const content = event.message as Record<string, unknown>;
        if (content?.content) {
          const blocks = content.content as Array<Record<string, unknown>>;
          for (const block of blocks) {
            if (block.type === "text") {
              const text = redactSecrets(block.text as string);
              running.output.push(text);
              await this.log(taskId, "output", text.slice(0, 500));
              sseManager.broadcast({
                type: "task:progress",
                data: { taskId, message: text.slice(0, 200) },
              });
            }
            if (block.type === "tool_use") {
              const toolName = block.name as string;
              await this.log(taskId, "tool_call", `${toolName}: ${JSON.stringify(block.input).slice(0, 300)}`);
            }
          }
        }
        break;
      }
      case "result": {
        const result = redactSecrets(JSON.stringify(event).slice(0, 2000));
        running.output.push(result);
        await this.log(taskId, "info", "最終結果を受信");
        break;
      }
    }
  }

  async cancel(taskId: string): Promise<void> {
    const running = this.running.get(taskId);
    if (running) {
      running.process.kill("SIGTERM");
      this.running.delete(taskId);
    }
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "cancelled", completedAt: new Date() },
    });
    sseManager.broadcast({ type: "task:cancelled", data: { taskId } });
    await this.log(taskId, "warn", "キャンセルされました");
  }

  async processQueue(): Promise<void> {
    if (this.running.size >= this.maxConcurrent) return;

    const pendingTasks = await prisma.task.findMany({
      where: { status: "pending" },
      orderBy: [
        { priority: "desc" }, // urgent > high > normal > low (alphabetical desc works)
        { createdAt: "asc" },
      ],
      take: this.maxConcurrent - this.running.size,
    });

    for (const task of pendingTasks) {
      await this.start(task.id);
    }
  }

  getStatus(): { active: number; max: number; tasks: string[] } {
    return {
      active: this.running.size,
      max: this.maxConcurrent,
      tasks: Array.from(this.running.keys()),
    };
  }

  private async log(taskId: string, level: string, message: string) {
    await prisma.taskLog.create({
      data: { taskId, level, message: message.slice(0, 5000) },
    });
  }

  private async notify(taskId: string | null, type: NotificationType, title: string, message: string) {
    const notif = await prisma.notification.create({
      data: { taskId, type, title, message },
    });
    sseManager.broadcast({
      type: "notification",
      data: { id: notif.id, type, title, message },
    });
  }
}

export const taskRunner = new TaskRunner();
