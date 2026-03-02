"use client";

import { useState, useEffect } from "react";

interface StockItem {
  id: string;
  productName: string;
  buyPrice: number | null;
  sellPrice: number | null;
  sourceUrl: string | null;
  memo: string;
  imageUrl: string | null;
  franchise: { name: string; tier: string } | null;
  used: boolean;
  createdAt: string;
}

export default function StockPage() {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unused" | "used">("unused");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    productName: "",
    buyPrice: "",
    sellPrice: "",
    sourceUrl: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadStocks();
  }, [filter]);

  async function loadStocks() {
    setLoading(true);
    const params = filter === "all" ? "" : `?used=${filter === "used"}`;
    const res = await fetch(`/api/stock${params}`);
    setStocks(await res.json());
    setLoading(false);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // 画像アップロード
      let imageUrl: string | null = null;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.imageUrl;
      }

      await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: form.productName,
          buyPrice: form.buyPrice ? parseInt(form.buyPrice) : null,
          sellPrice: form.sellPrice ? parseInt(form.sellPrice) : null,
          sourceUrl: form.sourceUrl || null,
          memo: form.memo,
          imageUrl,
        }),
      });
      setForm({ productName: "", buyPrice: "", sellPrice: "", sourceUrl: "", memo: "" });
      clearImage();
      setShowForm(false);
      loadStocks();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">商材ストック</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1d9bf0] text-white text-sm font-bold px-4 py-2 rounded-full"
        >
          {showForm ? "閉じる" : "+ 追加"}
        </button>
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <input
            type="text"
            placeholder="商品名 *"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="仕入れ値（円）"
              value={form.buyPrice}
              onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="販売価格（円）"
              value={form.sellPrice}
              onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <input
            type="url"
            placeholder="URL（メルカリ等）"
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            placeholder="面白いポイント・メモ *"
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            required
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          {/* 画像アップロード */}
          {imagePreview ? (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-48 object-contain bg-gray-50 rounded-lg"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 bg-black/60 text-white w-7 h-7 rounded-full text-sm flex items-center justify-center"
              >
                x
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#1d9bf0] transition-colors">
              <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
              <span className="text-xs text-gray-500">スクショをアップロード</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#1d9bf0] text-white font-bold py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? "保存中..." : "ストックに追加"}
          </button>
        </form>
      )}

      {/* フィルタ */}
      <div className="flex gap-2">
        {(["unused", "used", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              filter === f
                ? "bg-[#1d9bf0] text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {f === "unused" ? "未使用" : f === "used" ? "使用済み" : "すべて"}
          </button>
        ))}
      </div>

      {/* リスト */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-20 shadow-sm" />
          ))}
        </div>
      ) : stocks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">
            {filter === "unused"
              ? "未使用のストックなし。商品を追加しよう"
              : "ストックなし"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stocks.map((stock) => (
            <div
              key={stock.id}
              className={`bg-white rounded-xl shadow-sm p-4 ${
                stock.used ? "opacity-60" : ""
              }`}
            >
              {stock.imageUrl && (
                <img
                  src={stock.imageUrl}
                  alt={stock.productName}
                  className="w-full h-40 object-contain bg-gray-50 rounded-lg mb-2"
                />
              )}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold">{stock.productName}</span>
                {stock.franchise && (
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      stock.franchise.tier === "S"
                        ? "bg-red-100 text-red-700"
                        : stock.franchise.tier === "A"
                        ? "bg-orange-100 text-orange-700"
                        : stock.franchise.tier === "B"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {stock.franchise.tier} {stock.franchise.name}
                  </span>
                )}
                {stock.used && (
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                    使用済み
                  </span>
                )}
              </div>
              {(stock.buyPrice || stock.sellPrice) && (
                <p className="text-xs text-gray-500">
                  {stock.buyPrice
                    ? `${stock.buyPrice.toLocaleString()}円`
                    : "?"}
                  {" → "}
                  {stock.sellPrice
                    ? `${stock.sellPrice.toLocaleString()}円`
                    : "?"}
                  {stock.buyPrice && stock.sellPrice && (
                    <span className="ml-1 font-bold text-green-600">
                      ({Math.round(stock.sellPrice / stock.buyPrice)}倍)
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-gray-600 mt-1">{stock.memo}</p>
              {stock.sourceUrl && (
                <a
                  href={stock.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#1d9bf0] mt-1 inline-block"
                >
                  元URL
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
