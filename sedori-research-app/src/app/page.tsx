"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ResearchResult } from "@/lib/types";

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [identifyingImage, setIdentifyingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImageFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError("画像サイズは10MB以下にしてください");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setImageData({ base64, mimeType: file.type });
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadImageFile(file);
  };

  // クリップボードから画像ペースト
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) loadImageFile(file);
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [loadImageFile]);

  const clearImage = () => {
    setImagePreview(null);
    setImageData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSearch = async () => {
    if (!keyword.trim() && !imageData) return;

    setLoading(true);
    setError(null);
    setResult(null);
    if (imageData) setIdentifyingImage(true);

    try {
      const requestBody: Record<string, unknown> = {};

      if (keyword.trim()) {
        requestBody.keyword = keyword.trim();
      }
      if (purchasePrice) {
        requestBody.purchasePrice = parseInt(purchasePrice, 10);
      }
      if (imageData) {
        requestBody.image = imageData.base64;
        requestBody.imageMimeType = imageData.mimeType;
      }

      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      setIdentifyingImage(false);

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(
          errData?.error || `API error: ${res.status}`
        );
      }

      const data = await res.json();
      setResult(data);

      // 画像で特定された場合、キーワード欄を更新
      if (data.product.identifiedBy === "image" && data.product.searchKeyword) {
        setKeyword(data.product.searchKeyword);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
      setIdentifyingImage(false);
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

  const confidenceLabel = {
    high: "確度: 高",
    medium: "確度: 中",
    low: "確度: 低",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">
          せどりリサーチ AI
        </h1>

        {/* 検索フォーム */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          {/* 画像アップロード */}
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
            />

            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="商品画像"
                  className="w-full max-h-48 object-contain rounded-lg bg-gray-100"
                />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm hover:bg-black/70"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors flex flex-col items-center justify-center gap-1"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  画像で検索
                </div>
                <span className="text-xs text-gray-400">
                  タップで選択 / Ctrl+V でペースト
                </span>
              </button>
            )}
          </div>

          {/* キーワード入力 */}
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={
              imageData
                ? "商品名（任意・画像から自動特定）"
                : "商品名 or 型番を入力"
            }
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
              disabled={loading || (!keyword.trim() && !imageData)}
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
              {identifyingImage
                ? "画像から商品を特定中..."
                : "5サイト並列検索中..."}
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
            {/* 商品特定結果（画像検索の場合） */}
            {result.product.identifiedBy === "image" && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                    画像認識
                  </span>
                  {result.product.confidence && (
                    <span className="text-xs text-blue-500">
                      {confidenceLabel[result.product.confidence]}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {result.product.name}
                </p>
                {result.product.modelNumber && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    型番: {result.product.modelNumber}
                  </p>
                )}
                {result.product.searchKeyword && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    検索キーワード: &quot;{result.product.searchKeyword}&quot;
                  </p>
                )}
              </div>
            )}

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

            {/* 駿河屋 */}
            {result.prices.surugaya.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h2 className="text-sm font-medium text-gray-500 mb-3">
                  駿河屋（{result.prices.surugaya.length}件）
                </h2>
                <div className="space-y-2">
                  {result.prices.surugaya.slice(0, 20).map((item, i) => (
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
                        {item.status === "sold" && (
                          <span className="text-xs text-red-400 ml-1">
                            品切れ
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

            {/* まんだらけ */}
            {result.prices.mandarake.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h2 className="text-sm font-medium text-gray-500 mb-3">
                  まんだらけ（{result.prices.mandarake.length}件）
                </h2>
                <div className="space-y-2">
                  {result.prices.mandarake.slice(0, 20).map((item, i) => (
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
                        {item.status === "sold" && (
                          <span className="text-xs text-red-400 ml-1">
                            売り切れ
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

            {/* らしんばん */}
            {result.prices.lashinbang.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h2 className="text-sm font-medium text-gray-500 mb-3">
                  らしんばん（{result.prices.lashinbang.length}件）
                </h2>
                <div className="space-y-2">
                  {result.prices.lashinbang.slice(0, 20).map((item, i) => (
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
                        {item.condition && (
                          <span className="text-xs text-gray-400 ml-1">
                            [{item.condition}]
                          </span>
                        )}
                        {item.status === "sold" && (
                          <span className="text-xs text-red-400 ml-1">
                            品切
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
              result.prices.yahooAuction.length === 0 &&
              result.prices.surugaya.length === 0 &&
              result.prices.mandarake.length === 0 &&
              result.prices.lashinbang.length === 0 && (
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
