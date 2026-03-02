"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const SCHEDULE: Record<number, { type: string; label: string }> = {
  0: { type: "analysis", label: "分析・リライト検討" },
  1: { type: "mid_tier", label: "中間安定型（まとめ系）" },
  2: { type: "mega_buzz", label: "大バズ狙い（SランクIP）" },
  3: { type: "mid_tier", label: "中間安定型（まとめ系）" },
  4: { type: "mega_buzz", label: "大バズ狙い（SランクIP）" },
  5: { type: "mid_tier", label: "中間安定型（まとめ系）" },
  6: { type: "analysis", label: "分析・リライト検討" },
};

interface RemakeCandidate {
  id: string;
  content: string;
  impressions: number;
  postDate: string;
  franchise: { name: string; tier: string } | null;
  daysSincePost: number;
}

interface StockItem {
  id: string;
  productName: string;
  buyPrice: number | null;
  sellPrice: number | null;
  memo: string;
  franchise: { name: string; tier: string } | null;
}

interface GeneratedPost {
  content: string;
  type: string;
  reasoning: string;
}

export default function Dashboard() {
  const [data, setData] = useState<{
    totalPosts: number;
    remakeCandidates: RemakeCandidate[];
    unusedStocks: StockItem[];
    frequency: { postsPerWeek: number; daysSinceLastPost: number; currentStreak: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, GeneratedPost[]>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/recommendations")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const todaySchedule = SCHEDULE[today.getDay()];

  async function handleGenerate(key: string, body: Record<string, unknown>) {
    setGenerating(key);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.variations) {
        setGenerated((prev) => ({ ...prev, [key]: result.variations }));
      }
    } catch (err) {
      console.error(err);
    }
    setGenerating(null);
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">Today&apos;s Posts</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-24 shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl font-bold">今日のポスト案</h1>
        <p className="text-xs text-gray-500">
          {today.getMonth() + 1}/{today.getDate()}（{DAY_LABELS[today.getDay()]}）
          ・{data?.totalPosts || 0}件のデータから分析
        </p>
      </div>

      {/* 今日の推奨タイプ */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
        <p className="text-xs text-blue-600 font-bold mb-1">
          {DAY_LABELS[today.getDay()]}曜日の戦略
        </p>
        <p className="text-lg font-bold text-gray-900">{todaySchedule.label}</p>
        <div className="flex gap-3 mt-2 text-xs text-gray-500">
          <span>週{data?.frequency.postsPerWeek || 0}件ペース</span>
          <span>連続{data?.frequency.currentStreak || 0}日</span>
          {(data?.frequency.daysSinceLastPost ?? 0) >= 2 && (
            <span className="text-red-500 font-bold">
              {data?.frequency.daysSinceLastPost}日空き
            </span>
          )}
        </div>
      </div>

      {/* リメイク候補 */}
      {data?.remakeCandidates && data.remakeCandidates.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700">
            リメイク候補（3ヶ月以上前）
          </h2>
          {data.remakeCandidates.slice(0, 3).map((post) => (
            <div key={post.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400">
                      {post.daysSincePost}日前
                    </span>
                    <span className="text-xs font-bold text-blue-600">
                      {formatNumber(post.impressions)}imp
                    </span>
                    {post.franchise && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        post.franchise.tier === "S" ? "bg-red-100 text-red-700" :
                        post.franchise.tier === "A" ? "bg-orange-100 text-orange-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {post.franchise.tier} {post.franchise.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2">
                    {post.content}
                  </p>
                </div>
              </div>

              <button
                onClick={() =>
                  handleGenerate(`remake-${post.id}`, {
                    mode: "remake",
                    originalContent: post.content,
                    originalImpressions: post.impressions,
                  })
                }
                disabled={generating === `remake-${post.id}`}
                className="mt-2 w-full bg-[#1d9bf0] text-white text-sm font-bold py-2 rounded-lg hover:bg-[#1a8cd8] disabled:opacity-50"
              >
                {generating === `remake-${post.id}` ? "生成中..." : "AIでリメイク"}
              </button>

              {/* 生成結果 */}
              {generated[`remake-${post.id}`] && (
                <div className="mt-3 space-y-2">
                  {generated[`remake-${post.id}`].map((v, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{v.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-400">{v.reasoning}</p>
                        <button
                          onClick={() => handleCopy(v.content, `remake-${post.id}-${i}`)}
                          className="text-xs font-bold text-[#1d9bf0] hover:underline"
                        >
                          {copied === `remake-${post.id}-${i}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 未使用ストック */}
      {data?.unusedStocks && data.unusedStocks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">商材ストック</h2>
            <Link href="/stock" className="text-xs text-[#1d9bf0] font-bold">
              全て見る
            </Link>
          </div>
          {data.unusedStocks.slice(0, 3).map((stock) => (
            <div key={stock.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold">{stock.productName}</span>
                {stock.franchise && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    stock.franchise.tier === "S" ? "bg-red-100 text-red-700" :
                    stock.franchise.tier === "A" ? "bg-orange-100 text-orange-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {stock.franchise.tier}
                  </span>
                )}
              </div>
              {(stock.buyPrice || stock.sellPrice) && (
                <p className="text-xs text-gray-500">
                  {stock.buyPrice ? `${stock.buyPrice.toLocaleString()}円` : "?"}
                  {" → "}
                  {stock.sellPrice ? `${stock.sellPrice.toLocaleString()}円` : "?"}
                </p>
              )}
              <p className="text-xs text-gray-600 mt-1">{stock.memo}</p>

              <button
                onClick={() =>
                  handleGenerate(`stock-${stock.id}`, {
                    mode: "product",
                    productName: stock.productName,
                    buyPrice: stock.buyPrice,
                    sellPrice: stock.sellPrice,
                    memo: stock.memo,
                  })
                }
                disabled={generating === `stock-${stock.id}`}
                className="mt-2 w-full bg-[#1d9bf0] text-white text-sm font-bold py-2 rounded-lg hover:bg-[#1a8cd8] disabled:opacity-50"
              >
                {generating === `stock-${stock.id}` ? "生成中..." : "AIでポスト生成"}
              </button>

              {generated[`stock-${stock.id}`] && (
                <div className="mt-3 space-y-2">
                  {generated[`stock-${stock.id}`].map((v, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{v.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-400">{v.reasoning}</p>
                        <button
                          onClick={() => handleCopy(v.content, `stock-${stock.id}-${i}`)}
                          className="text-xs font-bold text-[#1d9bf0] hover:underline"
                        >
                          {copied === `stock-${stock.id}-${i}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* データなし */}
      {!data?.remakeCandidates?.length && !data?.unusedStocks?.length && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <p className="text-lg font-bold mb-2">ネタがない</p>
          <p className="text-sm text-gray-500 mb-4">
            商材ストックに商品を追加するか、ポストデータをインポートしよう
          </p>
          <div className="flex gap-2 justify-center">
            <Link
              href="/stock"
              className="bg-[#1d9bf0] text-white font-bold px-4 py-2 rounded-lg text-sm"
            >
              ストック追加
            </Link>
            <Link
              href="/posts/import"
              className="bg-gray-100 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm"
            >
              CSVインポート
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
