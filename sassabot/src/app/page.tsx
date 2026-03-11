"use client";

import { useEffect, useState, useCallback } from "react";
import { useSSE } from "@/lib/hooks/useSSE";

interface TaskData {
  id: string;
  title: string;
  prompt: string;
  status: string;
  priority: string;
  result: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  _count: { logs: number; approvals: number };
  approvals: Array<{ id: string; action: string; detail: string; risk: string; status: string }>;
}

interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-500",
    running: "bg-blue-500 pulse-dot",
    completed: "bg-green-500",
    failed: "bg-red-500",
    cancelled: "bg-gray-400",
    needs_approval: "bg-yellow-500 pulse-dot",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] ?? "bg-gray-500"}`} />;
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    urgent: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    normal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${styles[priority] ?? styles.normal}`}>
      {priority}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export default function Dashboard() {
  const { events, connected } = useSSE();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskData & { logs: Array<{ level: string; message: string; createdAt: string }> } | null>(null);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks?limit=30");
    if (res.ok) setTasks(await res.json());
  }, []);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications?unread=true");
    if (res.ok) setNotifications(await res.json());
  }, []);

  const fetchTaskDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`);
    if (res.ok) setTaskDetail(await res.json());
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchNotifications();
    const interval = setInterval(() => {
      fetchTasks();
      fetchNotifications();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks, fetchNotifications]);

  // SSEイベントでリフレッシュ
  useEffect(() => {
    const latest = events[events.length - 1];
    if (!latest) return;
    fetchTasks();
    if (latest.type === "notification") fetchNotifications();
    if (selectedTask && (latest.type === "task:progress" || latest.type === "task:completed" || latest.type === "task:failed")) {
      fetchTaskDetail(selectedTask);
    }
  }, [events, fetchTasks, fetchNotifications, selectedTask, fetchTaskDetail]);

  const createTask = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, prompt: newPrompt }),
    });
    setNewTitle("");
    setNewPrompt("");
    setShowForm(false);
    fetchTasks();
  };

  const cancelTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
  };

  const handleApproval = async (taskId: string, approvalId: string, decision: "approved" | "rejected") => {
    await fetch(`/api/tasks/${taskId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision }),
    });
    fetchTasks();
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    fetchNotifications();
  };

  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "needs_approval");
  const recentTasks = tasks.filter((t) => t.status !== "running" && t.status !== "needs_approval");

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">SassaBot</h1>
          <span className={`text-xs px-2 py-0.5 rounded ${connected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {notifications.length > 0 && (
            <button onClick={markAllRead} className="text-xs bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded hover:bg-yellow-500/30">
              {notifications.length} 通知
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
          >
            + タスク追加
          </button>
        </div>
      </div>

      {/* New Task Form */}
      {showForm && (
        <div className="bg-surface rounded-lg p-4 mb-6 border border-border">
          <input
            type="text"
            placeholder="タスク名（ざっくりでOK）"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-2 mb-3 text-sm"
          />
          <textarea
            placeholder="やってほしいこと（詳細）"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            rows={4}
            className="w-full bg-bg border border-border rounded px-3 py-2 mb-3 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={createTask} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm">
              実行
            </button>
            <button onClick={() => setShowForm(false)} className="bg-surface-hover text-text-muted px-4 py-1.5 rounded text-sm">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Notifications (approval needed) */}
      {tasks.filter((t) => t.approvals.length > 0).map((task) =>
        task.approvals.map((a) => (
          <div key={a.id} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-yellow-400 font-medium text-sm">承認が必要</span>
                <p className="text-sm mt-1">{a.action}</p>
                <p className="text-xs text-text-muted mt-1">{a.detail}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block priority-${a.risk}`}>
                  リスク: {a.risk}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproval(task.id, a.id, "approved")}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm"
                >
                  OK
                </button>
                <button
                  onClick={() => handleApproval(task.id, a.id, "rejected")}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm"
                >
                  NG
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Active Tasks */}
        <div className="col-span-2 space-y-3">
          {activeTasks.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-text-muted mb-2">実行中</h2>
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => { setSelectedTask(task.id); fetchTaskDetail(task.id); }}
                  className={`bg-surface rounded-lg p-4 border cursor-pointer hover:border-accent transition-colors ${
                    selectedTask === task.id ? "border-accent" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={task.status} />
                      <span className="font-medium text-sm">{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelTask(task.id); }}
                      className="text-xs text-text-muted hover:text-danger"
                    >
                      停止
                    </button>
                  </div>
                  <p className="text-xs text-text-muted mt-2 line-clamp-1">{task.prompt}</p>
                  <div className="text-[10px] text-text-muted mt-2">
                    ログ {task._count.logs}件 | {task.startedAt ? timeAgo(task.startedAt) + "に開始" : "待機中"}
                  </div>
                </div>
              ))}
            </>
          )}

          <h2 className="text-sm font-medium text-text-muted mb-2 mt-6">履歴</h2>
          {recentTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => { setSelectedTask(task.id); fetchTaskDetail(task.id); }}
              className={`bg-surface rounded-lg p-3 border cursor-pointer hover:border-accent/50 transition-colors ${
                selectedTask === task.id ? "border-accent" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={task.status} />
                  <span className="text-sm">{task.title}</span>
                  <PriorityBadge priority={task.priority} />
                </div>
                <span className="text-[10px] text-text-muted">{timeAgo(task.createdAt)}</span>
              </div>
              {task.error && <p className="text-xs text-danger mt-1">{task.error}</p>}
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="text-center text-text-muted py-12">
              <p className="text-lg mb-2">タスクなし</p>
              <p className="text-sm">「+ タスク追加」からClaude Codeに仕事を振ろう</p>
            </div>
          )}
        </div>

        {/* Task Detail / Log Panel */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text-muted">ログ</h2>
          {taskDetail ? (
            <div className="bg-surface rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <StatusDot status={taskDetail.status} />
                <span className="font-medium text-sm">{taskDetail.title}</span>
              </div>
              {taskDetail.result && (
                <div className="bg-bg rounded p-3 mb-3 text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {taskDetail.result.slice(-2000)}
                </div>
              )}
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {taskDetail.logs.map((log, i) => {
                  const levelColors: Record<string, string> = {
                    info: "text-text-muted",
                    warn: "text-yellow-400",
                    error: "text-red-400",
                    tool_call: "text-blue-400",
                    progress: "text-green-400",
                    output: "text-text",
                  };
                  return (
                    <div key={i} className={`text-[11px] font-mono ${levelColors[log.level] ?? "text-text-muted"}`}>
                      <span className="text-text-muted/50">{new Date(log.createdAt).toLocaleTimeString("ja-JP")}</span>{" "}
                      {log.message.slice(0, 200)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-surface rounded-lg border border-border p-4 text-center text-text-muted text-sm">
              タスクを選択するとログが表示されます
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
