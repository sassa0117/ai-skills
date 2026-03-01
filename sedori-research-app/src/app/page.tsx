"use client";

import { useState } from "react";
import type { ResearchResult } from "@/lib/types";

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!keyword.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          purchasePrice: purchasePrice ? parseInt(purchasePrice, 10) : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const recommendationLabel = {
    strong_buy: "強気",
    buy: "標準",
    cautious: "慎重",
    skip: "見送り",
  };

  const recommendationColor = {
    strong_buy: "bg-green-500",
    buy: "bg-blue-500",
    cautious: "bg-yellow-500",
    skip: "bg-red-500",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">
          せどりリサーチ AI
        </h1>

        {/* 検索フォーム */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="商品名 or 型番を入力"
            className="w-full px-4 py-3 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="mt-3 flex gap-3 items-center">
            <div className="flex-1">
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="仕入れ値（任意）"
                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !keyword.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
            >
              {loading ? "検索中..." : "リサーチ"}
            </button>
          </div>
        </div>

        {/* ローディング */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              メルカリ・ヤフオクを検索中...
            </p>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* 結果表示 */}
        {result && (
          <>
            {/* AI判断 */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`px-3 py-1 rounded-full text-white text-sm font-bold ${recommendationColor[result.aiJudgment.recommendation]}`}
                >
                  {recommendationLabel[result.aiJudgment.recommendation]}
                </span>
                <span className="text-gray-900 font-medium">AI判断</span>
              </div>

              {result.aiJudgment.estimatedProfit !== undefined && (
                <div className="flex gap-4 mb-3 text-sm">
                  <span className="text-gray-600">
                    推定利益:{" "}
                    <span className="font-bold text-green-600">
                      ¥{result.aiJudgment.estimatedProfit.toLocaleString()}
                    </span>
                  </span>
                  {result.aiJudgment.estimatedROI !== undefined && (
                    <span className="text-gray-600">
                      ROI:{" "}
                      <span className="font-bold">
                        {result.aiJudgment.estimatedROI}%
                      </span>
                    </span>
                  )}
                </div>
              )}

              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {result.aiJudgment.reasoning}
              </div>

              {result.aiJudgment.risks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-red-600 mb-1">
                    リスク・注意点
                  </p>
                  {result.aiJudgment.risks.map((risk, i) => (
                    <p key={i} className="text-xs text-gray-600">
                      ・{risk}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* 価格サマリー */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <h2 className="text-sm font-medium text-gray-500 mb-3">
                価格サマリー（{result.summary.sampleCount}件）
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">中央値</p>
                  <p className="text-lg font-bold">
                    ¥{result.summary.medianPrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">平均</p>
                  <p className="text-lg font-bold">
                    ¥{result.summary.averagePrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">最安</p>
                  <p className="text-base text-gray-700">
                    ¥{result.summary.minPrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">最高</p>
                  <p className="text-base text-gray-700">
                    ¥{result.summary.maxPrice.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* メルカリsold */}
            {result.prices.mercari.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h2 className="text-sm font-medium text-gray-500 mb-3">
                  メルカリ sold（{result.prices.mercari.length}件）
                </h2>
                <div className="space-y-2">
                  {result.prices.mercari.slice(0, 20).map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-start text-sm border-b border-gray-50 pb-2"
                    >
                      <div className="flex-1 pr-3">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline line-clamp-1"
                          >
                            {item.name}
                          </a>
                        ) : (
                          <span className="text-gray-700 line-clamp-1">
                            {item.name}
                          </span>
                        )}
                        {item.date && (
                          <span className="text-xs text-gray-400 ml-1">
                            {item.date}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        ¥{item.price.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ヤフオク落札 */}
            {result.prices.yahooAuction.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h2 className="text-sm font-medium text-gray-500 mb-3">
                  ヤフオク落札（{result.prices.yahooAuction.length}件）
                </h2>
                <div className="space-y-2">
                  {result.prices.yahooAuction.slice(0, 20).map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-start text-sm border-b border-gray-50 pb-2"
                    >
                      <div className="flex-1 pr-3">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline line-clamp-1"
                          >
                            {item.name}
                          </a>
                        ) : (
                          <span className="text-gray-700 line-clamp-1">
                            {item.name}
                          </span>
                        )}
                        {item.bids !== undefined && item.bids > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            {item.bids}件入札
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        ¥{item.price.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* データなし */}
            {result.prices.mercari.length === 0 &&
              result.prices.yahooAuction.length === 0 && (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                  <p className="text-gray-500">
                    該当する販売履歴が見つかりませんでした
                  </p>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
