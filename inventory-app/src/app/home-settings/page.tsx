"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WIDGET_TYPE_LABELS,
  WIDGET_PERIOD_LABELS,
  WIDGET_METRIC_LABELS,
  TRADING_STATUS_LABELS,
} from "@/lib/utils";

interface Widget {
  id: string;
  type: string;
  period: string;
  periodRange: string;
  metric: string;
  tradingStatus: string;
  sortOrder: number;
}

export default function HomeSettingsPage() {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const fetchWidgets = useCallback(async () => {
    const res = await fetch("/api/widgets");
    const json = await res.json();
    setWidgets(json);
  }, []);

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const handleDelete = async (id: string) => {
    if (!confirm("この項目を削除しますか？")) return;
    await fetch(`/api/widgets/${id}`, { method: "DELETE" });
    setMenuOpenId(null);
    fetchWidgets();
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...widgets];
    const draggedItem = items[dragItem.current];
    items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, draggedItem);
    setWidgets(items);
    dragItem.current = null;
    dragOverItem.current = null;

    // Persist order
    await fetch("/api/widgets/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: items.map((w) => w.id) }),
    });
  };

  const periodRangeLabel = (w: Widget) => {
    if (w.periodRange === "current") {
      return "（現在）";
    }
    return "（直近）";
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">ホームの設定</h1>
      </div>

      <div className="space-y-2">
        {widgets.map((widget, index) => (
          <div
            key={widget.id}
            className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3"
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
          >
            {/* Drag handle */}
            <div className="cursor-grab text-gray-300 touch-none">
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </svg>
            </div>

            {/* Widget info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {WIDGET_METRIC_LABELS[widget.metric] || widget.metric}
              </div>
              <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                <span>{WIDGET_TYPE_LABELS[widget.type]}</span>
                <span>
                  {WIDGET_PERIOD_LABELS[widget.period]}
                  {periodRangeLabel(widget)}
                </span>
                <span>{TRADING_STATUS_LABELS[widget.tradingStatus] || "すべて"}</span>
              </div>
            </div>

            {/* Menu button */}
            <div className="relative">
              <button
                onClick={() =>
                  setMenuOpenId(menuOpenId === widget.id ? null : widget.id)
                }
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {menuOpenId === widget.id && (
                <div className="absolute right-0 top-8 bg-white border rounded-lg shadow-lg z-10 min-w-[120px]">
                  <Link
                    href={`/home-settings/${widget.id}/edit`}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpenId(null)}
                  >
                    編集
                  </Link>
                  <button
                    onClick={() => handleDelete(widget.id)}
                    className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-gray-50"
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {widgets.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            ウィジェットがありません
          </div>
        )}
      </div>

      {/* Add button */}
      <Link
        href="/home-settings/new"
        className="block w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-center text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
      >
        + 項目を追加
      </Link>
    </div>
  );
}
