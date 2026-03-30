"use client";

import { useState, useEffect, useCallback } from "react";

interface DraftPost {
  id: string;
  content: string;
  postType: string | null;
  scheduledAt: string | null;
  productName: string | null;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  posts: DraftPost[];
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCalendarDays(year: number, month: number, posts: DraftPost[]): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay(); // 0=日

  // ポストをdate keyでグループ化
  const postsByDate: Record<string, DraftPost[]> = {};
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const d = new Date(post.scheduledAt);
    const key = formatDateKey(d);
    if (!postsByDate[key]) postsByDate[key] = [];
    postsByDate[key].push(post);
  }

  const days: CalendarDay[] = [];

  // 前月の日を埋める
  for (let i = startDay - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    const key = formatDateKey(date);
    days.push({ date, isCurrentMonth: false, posts: postsByDate[key] || [] });
  }

  // 当月
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const key = formatDateKey(date);
    days.push({ date, isCurrentMonth: true, posts: postsByDate[key] || [] });
  }

  // 翌月で埋める（6行分=42日）
  while (days.length < 42) {
    const date = new Date(year, month + 1, days.length - lastDay.getDate() - startDay + 1);
    const key = formatDateKey(date);
    days.push({ date, isCurrentMonth: false, posts: postsByDate[key] || [] });
  }

  return days;
}

const POST_TYPE_COLORS: Record<string, string> = {
  mega_buzz: "bg-red-500",
  mid_tier: "bg-blue-500",
  quote_rt: "bg-green-500",
  self_reply: "bg-yellow-500",
};

const POST_TYPE_LABELS: Record<string, string> = {
  mega_buzz: "バズ",
  mid_tier: "安定",
  quote_rt: "引用",
  self_reply: "リプ",
};

export default function CalendarPage() {
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<DraftPost | null>(null);
  const [editContent, setEditContent] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    const res = await fetch("/api/posts/bulk-generate");
    const data = await res.json();
    setDrafts(data.drafts || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleCopy = async (content: string, postId: string) => {
    await navigator.clipboard.writeText(content);
    setCopyFeedback(postId);
    setTimeout(() => setCopyFeedback(null), 1500);
  };

  const handleSaveEdit = async () => {
    if (!selectedPost) return;
    await fetch(`/api/posts/${selectedPost.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    });
    setSelectedPost(null);
    fetchDrafts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このドラフトを削除しますか？")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setSelectedPost(null);
    fetchDrafts();
  };

  const handleMarkPublished = async (id: string) => {
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    fetchDrafts();
  };

  const prevMonth = () => {
    setCurrentMonth((prev) => {
      const m = prev.month - 1;
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
    });
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => {
      const m = prev.month + 1;
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
    });
  };

  const calendarDays = getCalendarDays(currentMonth.year, currentMonth.month, drafts);
  const todayKey = formatDateKey(new Date());
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const monthLabel = `${currentMonth.year}年${currentMonth.month + 1}月`;

  return (
    <div className="p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">投稿カレンダー</h1>
        <span className="text-sm text-gray-500">
          {drafts.length}本のドラフト
        </span>
      </div>

      {/* 案内 */}
      {drafts.length === 0 && !loading && (
        <div className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-200">
          <p className="text-sm text-blue-800">
            Claude Codeで対話しながらポストを作成 → ここに保存されます
          </p>
        </div>
      )}

      {/* カレンダーナビ */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              className={`text-center text-xs font-medium py-2 ${
                i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const key = formatDateKey(day.date);
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                className={`min-h-[60px] p-1 border-b border-r text-xs ${
                  !day.isCurrentMonth ? "bg-gray-50 text-gray-300" : ""
                } ${isToday ? "bg-blue-50" : ""}`}
              >
                <div
                  className={`text-center mb-0.5 ${
                    isToday
                      ? "bg-[#1d9bf0] text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto text-[10px]"
                      : ""
                  }`}
                >
                  {day.date.getDate()}
                </div>
                {day.posts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => {
                      setSelectedPost(post);
                      setEditContent(post.content);
                    }}
                    className={`w-full text-left text-[9px] leading-tight text-white px-1 py-0.5 rounded mb-0.5 truncate ${
                      POST_TYPE_COLORS[post.postType || ""] || "bg-gray-400"
                    }`}
                    title={post.content}
                  >
                    {POST_TYPE_LABELS[post.postType || ""] || "下書き"}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 mt-3 justify-center">
        {Object.entries(POST_TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded ${POST_TYPE_COLORS[type]}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* 今日以降のポスト一覧 */}
      <div className="mt-6">
        <h3 className="font-semibold text-sm mb-3">今後の投稿予定</h3>
        {drafts.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-400 text-sm">
            まだドラフトがありません。Claude Codeでポストを作成してください。
          </div>
        )}
        {drafts.map((post) => (
          <div
            key={post.id}
            className="bg-white rounded-xl p-3 mb-2 shadow-sm border"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`text-[10px] text-white px-1.5 py-0.5 rounded ${
                  POST_TYPE_COLORS[post.postType || ""] || "bg-gray-400"
                }`}
              >
                {POST_TYPE_LABELS[post.postType || ""] || "下書き"}
              </span>
              <span className="text-xs text-gray-400">
                {post.scheduledAt
                  ? new Date(post.scheduledAt).toLocaleDateString("ja-JP", {
                      month: "short",
                      day: "numeric",
                      weekday: "short",
                    })
                  : "未定"}
              </span>
              {post.productName && (
                <span className="text-xs text-gray-400">/ {post.productName}</span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed mb-2">
              {post.content}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(post.content, post.id)}
                className="text-xs text-[#1d9bf0] hover:underline"
              >
                {copyFeedback === post.id ? "コピー済み!" : "コピー"}
              </button>
              <button
                onClick={() => {
                  setSelectedPost(post);
                  setEditContent(post.content);
                }}
                className="text-xs text-gray-500 hover:underline"
              >
                編集
              </button>
              <button
                onClick={() => handleMarkPublished(post.id)}
                className="text-xs text-green-600 hover:underline"
              >
                投稿済み
              </button>
              <button
                onClick={() => handleDelete(post.id)}
                className="text-xs text-red-400 hover:underline ml-auto"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 編集モーダル */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">ポスト編集</h3>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-40 border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]"
            />
            <div className="flex justify-between items-center mt-2">
              <span className={`text-xs ${editContent.length > 280 ? "text-red-500 font-bold" : "text-gray-400"}`}>
                {editContent.length}/280
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(editContent, "modal")}
                  className="px-4 py-1.5 text-sm border rounded-full hover:bg-gray-50"
                >
                  {copyFeedback === "modal" ? "コピー済み!" : "コピー"}
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 text-sm bg-[#1d9bf0] text-white rounded-full hover:bg-[#1a8cd8]"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
