"use client";

import { useState, useEffect } from "react";
import { formatNumber, formatDate } from "@/lib/utils";

interface Post {
  id: string;
  content: string;
  impressions: number;
  bookmarkRate: number | null;
  postDate: string | null;
  algorithmEra: string | null;
  franchise: { name: string; tier: string } | null;
}

export default function RewritePage() {
  const [candidates, setCandidates] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts?sortBy=impressions&sortOrder=desc")
      .then((r) => r.json())
      .then((posts: Post[]) => {
        // リライト候補のフィルタリングはクライアント側で
        // （旧アルゴ時代 + インプレッション上位）
        const preGrok = posts.filter(
          (p: Post) => p.algorithmEra === "pre_grok" || p.algorithmEra === "grok_transition"
        );
        setCandidates(preGrok);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const [checklist, setChecklist] = useState<Record<string, boolean[]>>({});

  const toggleCheck = (postId: string, index: number) => {
    setChecklist((prev) => {
      const current = prev[postId] || [false, false, false, false];
      const next = [...current];
      next[index] = !next[index];
      return { ...prev, [postId]: next };
    });
  };

  const checkItems = [
    "画像を変更したか？",
    "金額を最新に更新したか？",
    "自分事化フレーズを追加したか？",
    "切り口を変えたか？",
  ];

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">リライト候補</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-24 shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">リライト候補</h1>
      <p className="text-xs text-gray-500">
        旧アルゴリズム時代の高パフォーマンスポスト。Grok時代に合わせてリライトで再投入
      </p>

      {candidates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
          <p>リライト候補なし</p>
          <p className="text-xs mt-1">CSVインポートでデータを取り込んでください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((post) => {
            const checks = checklist[post.id] || [false, false, false, false];
            return (
              <div key={post.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-3">{post.content}</p>
                    <div className="flex gap-2 mt-1">
                      {post.franchise && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                          post.franchise.tier === "S" ? "bg-red-100 text-red-700" :
                          post.franchise.tier === "A" ? "bg-orange-100 text-orange-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                          {post.franchise.tier} {post.franchise.name}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {post.postDate ? formatDate(post.postDate) : ""}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold">{formatNumber(post.impressions)}</p>
                    <p className="text-xs text-gray-400">imp</p>
                  </div>
                </div>

                {/* リライトチェックリスト */}
                <div className="border-t pt-2 space-y-1">
                  <p className="text-xs font-bold text-gray-500">リライトチェック</p>
                  {checkItems.map((item, i) => (
                    <label key={i} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checks[i]}
                        onChange={() => toggleCheck(post.id, i)}
                        className="w-4 h-4 rounded border-gray-300 text-[#1d9bf0] focus:ring-[#1d9bf0]"
                      />
                      <span className={`text-xs ${checks[i] ? "text-green-600 line-through" : "text-gray-600"}`}>
                        {item}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
