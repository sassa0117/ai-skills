// ========== Task Types ==========

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "needs_approval";
export type Priority = "low" | "normal" | "high" | "urgent";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type NotificationType = "error" | "approval_needed" | "completed" | "warning";
export type LogLevel = "info" | "warn" | "error" | "tool_call" | "progress" | "output";

export interface TaskInput {
  title: string;
  prompt: string;
  priority?: Priority;
  workDir?: string;
}

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  lastLog?: string;
  percentage?: number;
}

// ========== SSE Event Types ==========

export type SSEEvent =
  | { type: "task:created"; data: { taskId: string; title: string } }
  | { type: "task:started"; data: { taskId: string; pid: number } }
  | { type: "task:progress"; data: { taskId: string; message: string; percentage?: number } }
  | { type: "task:completed"; data: { taskId: string; result: string } }
  | { type: "task:failed"; data: { taskId: string; error: string } }
  | { type: "task:cancelled"; data: { taskId: string } }
  | { type: "approval:needed"; data: { approvalId: string; taskId: string; action: string; risk: RiskLevel } }
  | { type: "approval:resolved"; data: { approvalId: string; status: ApprovalStatus } }
  | { type: "notification"; data: { id: string; type: NotificationType; title: string; message: string } }
  | { type: "heartbeat"; data: { timestamp: number; activeTasks: number } };
