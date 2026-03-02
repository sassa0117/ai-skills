"use client";

import { useState, useEffect } from "react";
import { IP_TIERS, PRICE_DIFF_TIERS } from "@/lib/constants";
import type { NgCheckResult } from "@/lib/ng-checker";
import type { Recommendation } from "@/lib/analyzer";

interface DetectedIp {
  franchiseId: string;
  name: string;
  tier: string;
}

interface Variation {
  text: string;
  templateName: string;
  charCount: number;
  postType: string;
  usedPhraseIds: string[];
}

export default function CreatePage() {
  const [productName, setProductName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sourceStore, setSourceStore] = useState("");
  const [postType, setPostType] = useState("");
  const [todayRecs, setTodayRecs] = useState<Recommendation[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [detectedIp, setDetectedIp] = useState<DetectedIp | null>(null);
  const [priceDiffRatio, setPriceDiffRatio] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ngResults, setNgResults] = useState<Record<number, NgCheckResult>>({});
  const [copied, setCopied] = useState<number | null>(null);

  // おすすめを取得
  useEffect(() => {
    fetch("/api/recommendations")
      .then((r) => r.json())
      .then((data) => {
        // 上位3件の高優先度おすすめのみ
        setTodayRecs(
          (data.recommendations || [])
            .filter((r: Recommendation) => r.priority === "high" || r.suggestedIp)
            .slice(0, 3)
        );
      })
      .catch(console.error);
  }, []);

  const handleGenerate = async () => {
    if (!productName) return;
    setLoading(true);
    setNgResults({});

    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          buyPrice: Number(buyPrice) || 0,
          sellPrice: Number(sellPrice) || 0,
          sourceStore,
          postType: postType || undefined,
        }),
      });
      const data = await res.json();
      setVariations(data.variations);
      setDetectedIp(data.detectedIp);
      setPriceDiffRatio(data.priceDiffRatio);

      // NGチェック
      for (let i = 0; i < data.variations.length; i++) {
        const ngRes = await fetch("/api/posts/check-ng", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: data.variations[i].text }),
        });
        const ngData = await ngRes.json();
        setNgResults((prev) => ({ ...prev, [i]: ngData }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  const priceDiffTier = PRICE_DIFF_TIERS.find((t) => priceDiffRatio >= t.min);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">ポスト作成</h1>

      {/* 今日のおすすめバナー */}
      {todayRecs.length > 0 && (
        <div className="bg-gradient-to-r from-[#1d9bf0]/10 to-[#1d9bf0]/5 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-[#1d9bf0]">今日のおすすめ</p>
          {todayRecs.map((rec, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`shrink-0 px-1.5 py-0.5 rounded font-bold ${
                rec.priority === "high" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
              }`}>
                {rec.type === "ip_rotation" ? "IP" : rec.type === "post_type" ? "タイプ" : rec.type === "frequency" ? "頻度" : "推奨"}
              </span>
              <span className="text-gray-700">{rec.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* 入力フォーム */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">商品名 *</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例: ポケモンカード 旧裏面 リザードン"
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1d9bf0] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">仕入値（円）</label>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="例: 500"
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1d9bf0] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">売値（円）</label>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="例: 50000"
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1d9bf0] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">仕入先</label>
          <input
            type="text"
            value={sourceStore}
            onChange={(e) => setSourceStore(e.target.value)}
            placeholder="例: ハードオフ, セカスト, オフモール"
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1d9bf0] focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">ポストタイプ</label>
          <div className="flex gap-2">
            {[
              { value: "", label: "すべて" },
              { value: "mega_buzz", label: "バズ狙い" },
              { value: "mid_tier", label: "中間安定型" },
              { value: "quote_rt", label: "引用RT" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPostType(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  postType === opt.value
                    ? "bg-[#1d9bf0] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!productName || loading}
          className="w-full bg-[#1d9bf0] text-white font-bold py-3 rounded-lg hover:bg-[#1a8cd8] disabled:opacity-50 transition-colors"
        >
          {loading ? "生成中..." : "ポスト生成"}
        </button>
      </div>

      {/* IP判定結果 + 価格差 */}
      {detectedIp && (
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${IP_TIERS[detectedIp.tier]?.bg || "bg-gray-100"} ${IP_TIERS[detectedIp.tier]?.color || "text-gray-700"}`}>
            {detectedIp.tier}ティア
          </span>
          <span className="text-sm font-bold">{detectedIp.name}</span>
          {priceDiffRatio > 0 && (
            <span className={`ml-auto text-xs font-bold ${priceDiffTier?.color || "text-gray-600"}`}>
              {Math.round(priceDiffRatio)}倍 {priceDiffTier?.label}
            </span>
          )}
        </div>
      )}

      {/* 生成結果 */}
      {variations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold">生成結果（{variations.length}件）</h2>
          {variations.map((v, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{v.templateName}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${
                    v.charCount > 280 ? "text-red-500 font-bold" :
                    v.charCount > 200 ? "text-yellow-600" : "text-green-600"
                  }`}>
                    {v.charCount}文字
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    v.postType === "mega_buzz" ? "bg-red-100 text-red-600" :
                    v.postType === "mid_tier" ? "bg-blue-100 text-blue-600" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {v.postType === "mega_buzz" ? "バズ" : v.postType === "mid_tier" ? "安定" : "引用RT"}
                  </span>
                </div>
              </div>

              {/* ポストプレビュー（X風） */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#1d9bf0] flex items-center justify-center text-white text-xs font-bold">さ</div>
                  <div>
                    <p className="text-xs font-bold">さっさ</p>
                    <p className="text-xs text-gray-400">@sassasedori</p>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{v.text}</p>
              </div>

              {/* NGチェック結果 */}
              {ngResults[i] && ngResults[i].matches.length > 0 && (
                <div className="space-y-1">
                  {ngResults[i].matches.map((m, j) => (
                    <div key={j} className={`text-xs px-2 py-1 rounded ${
                      m.severity === "error" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"
                    }`}>
                      <span className="font-bold">{m.severity === "error" ? "NG" : "注意"}</span>
                      {" "}{m.reason}
                      {m.suggestion && <span className="text-gray-500"> → {m.suggestion}</span>}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => handleCopy(v.text, i)}
                className={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${
                  copied === i
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {copied === i ? "コピー完了!" : "コピー"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
