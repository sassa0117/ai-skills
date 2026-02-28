"use client";

import { useState, useEffect } from "react";
import { formatNumber, formatPercent } from "@/lib/utils";

interface DashboardData {
  totalPosts: number;
  avgImpressions: number;
  avgEngagementRate: number;
  totalImpressions: number;
  topPosts: {
    id: string;
    content: string;
    impressions: number;
    bookmarkRate: number | null;
    postDate: string | null;
  }[];
  tierBreakdown: { tier: string; count: number; avgImp: number }[];
  rewriteCandidates: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">X Post Assistant</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-24 shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">X Post Assistant</h1>
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
          <p className="text-lg mb-2">データなし</p>
          <p className="text-sm">CSVインポートまたはポスト作成から始めよう</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">X Post Assistant</h1>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500">総ポスト数</p>
          <p className="text-2xl font-bold text-[#1d9bf0]">{data.totalPosts}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500">平均インプレッション</p>
          <p className="text-2xl font-bold">{formatNumber(data.avgImpressions)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500">平均エンゲージメント率</p>
          <p className="text-2xl font-bold">{formatPercent(data.avgEngagementRate)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500">リライト候補</p>
          <p className="text-2xl font-bold text-orange-500">{data.rewriteCandidates}</p>
        </div>
      </div>

      {/* IPティア別 */}
      {data.tierBreakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-bold mb-3">IPティア別パフォーマンス</h2>
          <div className="space-y-2">
            {data.tierBreakdown.map((t) => (
              <div key={t.tier} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    t.tier === "S" ? "bg-red-100 text-red-700" :
                    t.tier === "A" ? "bg-orange-100 text-orange-700" :
                    t.tier === "B" ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>{t.tier}</span>
                  <span className="text-sm text-gray-600">{t.count}件</span>
                </div>
                <span className="text-sm font-bold">{formatNumber(t.avgImp)} imp</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* トップポスト */}
      {data.topPosts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-bold mb-3">トップポスト</h2>
          <div className="space-y-3">
            {data.topPosts.map((post) => (
              <div key={post.id} className="border-b border-gray-100 pb-2 last:border-0">
                <p className="text-sm line-clamp-2">{post.content}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{formatNumber(post.impressions)} imp</span>
                  {post.bookmarkRate !== null && (
                    <span className={post.bookmarkRate >= 0.3 ? "text-green-600 font-bold" : ""}>
                      BM率 {formatPercent(post.bookmarkRate)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
