"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface ItemDetail {
  id: string;
  name: string;
  price: number;
  description: string;
  photos: string[];
  condition: string;
  category: string;
  shippingMethod: string;
  shippingPayer: string;
  shippingFromArea: string;
  sellerName: string;
  sellerRating: number;
  numLikes: number;
  numComments: number;
  comments: { userName: string; message: string; created: number }[];
  created: number;
  updated: number;
  status: string;
}

interface TagData {
  ipName: string;
  series: string;
  productType: string;
  gradeRank: string;
  accessories: string;
  limitedType: string;
  hasTop: boolean | null;
  hasBottom: boolean | null;
  topNote: string;
  bottomNote: string;
  releaseYear: string;
  memo: string;
}

const SERIES_OPTIONS = [
  "仮面ライダー",
  "スーパー戦隊",
  "ウルトラマン",
  "ガンダム",
  "ドラゴンボール",
  "ワンピース",
  "ポケモン",
  "プリキュア",
  "シルバニアファミリー",
  "たまごっち",
  "その他",
];

const PRODUCT_TYPE_OPTIONS = [
  "DX玩具",
  "フィギュア",
  "ぬいぐるみ",
  "アクスタ",
  "プラモデル",
  "カード",
  "ゲームソフト",
  "CD/DVD/BD",
  "衣類/グッズ",
  "その他",
];

const GRADE_OPTIONS = ["S（未開封）", "A（開封未使用）", "B（美品）", "C（良品）", "D（難あり）"];
const ACCESSORIES_OPTIONS = ["完品", "箱付き", "箱なし・付属品あり", "本体のみ", "不明"];
const LIMITED_OPTIONS = ["一般流通", "限定", "プレバン", "イベント限定", "一番くじ", "プライズ", "その他"];

function ItemDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const itemId = searchParams.get("id");

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [tags, setTags] = useState<TagData>({
    ipName: "",
    series: "",
    productType: "",
    gradeRank: "",
    accessories: "",
    limitedType: "",
    hasTop: null,
    hasBottom: null,
    topNote: "",
    bottomNote: "",
    releaseYear: "",
    memo: "",
  });

  const loadItem = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/mercari/item?id=${itemId}`);
      if (res.ok) {
        const data = await res.json();
        setItem(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const handleSave = async () => {
    if (!item || !itemId) return;
    setSaving(true);
    try {
      const body = {
        mercariId: itemId,
        name: item.name,
        price: item.price,
        description: item.description,
        soldDate: item.updated
          ? new Date(item.updated * 1000).toISOString().split("T")[0]
          : "",
        photos: JSON.stringify(item.photos),
        condition: item.condition,
        category: item.category,
        shippingMethod: item.shippingMethod,
        sellerName: item.sellerName,
        ...tags,
        releaseYear: tags.releaseYear ? parseInt(tags.releaseYear, 10) : null,
      };

      const res = await fetch("/api/pricing-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    router.back();
  };

  const updateTag = (key: keyof TagData, value: string | boolean | null) => {
    setTags((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">商品が見つかりませんでした</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto">
        {/* メルカリ風商品表示 */}
        <div className="bg-white">
          {/* 画像カルーセル */}
          <div className="relative aspect-square bg-gray-100">
            {item.photos.length > 0 ? (
              <>
                <img
                  src={item.photos[currentPhoto]}
                  alt={item.name}
                  className="w-full h-full object-contain"
                />
                {/* SOLD バッジ */}
                <div className="absolute top-3 left-3 bg-red-500 text-white text-sm font-bold px-3 py-1 rounded">
                  SOLD
                </div>
                {/* 画像ナビ */}
                {item.photos.length > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setCurrentPhoto((p) =>
                          p > 0 ? p - 1 : item.photos.length - 1
                        )
                      }
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 text-white w-8 h-8 rounded-full flex items-center justify-center"
                    >
                      &lt;
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPhoto((p) =>
                          p < item.photos.length - 1 ? p + 1 : 0
                        )
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 text-white w-8 h-8 rounded-full flex items-center justify-center"
                    >
                      &gt;
                    </button>
                    {/* ドットインジケーター */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {item.photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPhoto(i)}
                          className={`w-2 h-2 rounded-full ${
                            i === currentPhoto ? "bg-white" : "bg-white/50"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                No Image
              </div>
            )}
          </div>

          {/* サムネイル一覧 */}
          {item.photos.length > 1 && (
            <div className="flex gap-1 p-2 overflow-x-auto">
              {item.photos.map((photo, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPhoto(i)}
                  className={`w-16 h-16 flex-shrink-0 rounded overflow-hidden border-2 ${
                    i === currentPhoto ? "border-red-500" : "border-transparent"
                  }`}
                >
                  <img
                    src={photo}
                    alt={`${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* 商品情報 */}
          <div className="p-4">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              {item.name}
            </h1>
            <p className="text-2xl font-bold text-red-600 mt-2">
              ¥{item.price.toLocaleString()}
              <span className="text-sm font-normal text-gray-500 ml-1">
                （税込）
              </span>
            </p>

            {/* いいね・コメント */}
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <span>♡ {item.numLikes}</span>
              <span>💬 {item.numComments}</span>
            </div>

            {/* 商品詳細 */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h2 className="text-sm font-bold text-gray-900 mb-2">商品の説明</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {item.description}
              </p>
            </div>

            {/* 商品情報テーブル */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h2 className="text-sm font-bold text-gray-900 mb-2">商品の情報</h2>
              <table className="w-full text-sm">
                <tbody>
                  {item.condition && (
                    <tr className="border-b border-gray-50">
                      <td className="py-2 text-gray-500 w-28">商品の状態</td>
                      <td className="py-2 text-gray-900">{item.condition}</td>
                    </tr>
                  )}
                  {item.category && (
                    <tr className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">カテゴリー</td>
                      <td className="py-2 text-gray-900">{item.category}</td>
                    </tr>
                  )}
                  {item.shippingPayer && (
                    <tr className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">配送料の負担</td>
                      <td className="py-2 text-gray-900">{item.shippingPayer}</td>
                    </tr>
                  )}
                  {item.shippingMethod && (
                    <tr className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">配送の方法</td>
                      <td className="py-2 text-gray-900">{item.shippingMethod}</td>
                    </tr>
                  )}
                  {item.shippingFromArea && (
                    <tr className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">発送元の地域</td>
                      <td className="py-2 text-gray-900">{item.shippingFromArea}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 出品者 */}
            {item.sellerName && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-sm">
                    {item.sellerName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.sellerName}
                    </p>
                    {item.sellerRating > 0 && (
                      <p className="text-xs text-gray-500">
                        評価: {item.sellerRating}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* コメント */}
            {item.comments.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <h2 className="text-sm font-bold text-gray-900 mb-2">
                  コメント（{item.numComments}件）
                </h2>
                <div className="space-y-3">
                  {item.comments.map((comment, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-gray-900">
                        {comment.userName}
                      </span>
                      <p className="text-gray-700 mt-0.5">{comment.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* タグ付けパネル */}
        <div className="bg-white mt-2 p-4 rounded-t-xl shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-red-500 rounded-full" />
            タグ付け
          </h2>

          <div className="space-y-4">
            {/* シリーズ */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                シリーズ
              </label>
              <div className="flex flex-wrap gap-2">
                {SERIES_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => updateTag("series", tags.series === opt ? "" : opt)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tags.series === opt
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* IP名 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                IP名（例: 仮面ライダーオーズ）
              </label>
              <input
                type="text"
                value={tags.ipName}
                onChange={(e) => updateTag("ipName", e.target.value)}
                placeholder="IP名を入力"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* 商品種別 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                商品種別
              </label>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      updateTag("productType", tags.productType === opt ? "" : opt)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tags.productType === opt
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 状態ランク */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                状態ランク（さっさ判定）
              </label>
              <div className="flex flex-wrap gap-2">
                {GRADE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      updateTag("gradeRank", tags.gradeRank === opt ? "" : opt)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tags.gradeRank === opt
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 付属品 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                付属品
              </label>
              <div className="flex flex-wrap gap-2">
                {ACCESSORIES_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      updateTag("accessories", tags.accessories === opt ? "" : opt)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tags.accessories === opt
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 限定性 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                限定性
              </label>
              <div className="flex flex-wrap gap-2">
                {LIMITED_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      updateTag("limitedType", tags.limitedType === opt ? "" : opt)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      tags.limitedType === opt
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* トップ/アンダー */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  トップ（上位互換）
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() =>
                      updateTag("hasTop", tags.hasTop === true ? null : true)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      tags.hasTop === true
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    あり
                  </button>
                  <button
                    onClick={() =>
                      updateTag("hasTop", tags.hasTop === false ? null : false)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      tags.hasTop === false
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    なし
                  </button>
                </div>
                {tags.hasTop === true && (
                  <input
                    type="text"
                    value={tags.topNote}
                    onChange={(e) => updateTag("topNote", e.target.value)}
                    placeholder="例: CSMあり"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  アンダー（下位互換）
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() =>
                      updateTag("hasBottom", tags.hasBottom === true ? null : true)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      tags.hasBottom === true
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    あり
                  </button>
                  <button
                    onClick={() =>
                      updateTag("hasBottom", tags.hasBottom === false ? null : false)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      tags.hasBottom === false
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    なし
                  </button>
                </div>
                {tags.hasBottom === true && (
                  <input
                    type="text"
                    value={tags.bottomNote}
                    onChange={(e) => updateTag("bottomNote", e.target.value)}
                    placeholder="例: プライズあり"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                  />
                )}
              </div>
            </div>

            {/* 発売年 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                発売年（推定でOK）
              </label>
              <input
                type="number"
                value={tags.releaseYear}
                onChange={(e) => updateTag("releaseYear", e.target.value)}
                placeholder="例: 2010"
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            {/* メモ */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                メモ（自由記入）
              </label>
              <textarea
                value={tags.memo}
                onChange={(e) => updateTag("memo", e.target.value)}
                placeholder="気づいたことがあれば"
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
              />
            </div>
          </div>

          {/* 保存ボタン */}
          <div className="flex gap-3 mt-6 sticky bottom-0 bg-white py-4 border-t border-gray-100">
            <button
              onClick={handleSkip}
              className="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
            >
              スキップ
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex-1 py-3 rounded-lg text-white font-medium transition-colors ${
                saved
                  ? "bg-green-500"
                  : "bg-red-500 hover:bg-red-600 disabled:opacity-50"
              }`}
            >
              {saved ? "保存しました！" : saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ItemDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <ItemDetailContent />
    </Suspense>
  );
}
