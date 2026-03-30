"use client";

import { useState, useEffect } from "react";

interface SearchItem {
  id: string;
  name: string;
  price: number;
  thumbnail: string;
  photos: string[];
  date: string;
  url: string;
  itemConditionId: number;
  categoryId: string;
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

const CONDITION_MAP: Record<number, string> = {
  1: "新品、未使用",
  2: "未使用に近い",
  3: "目立った傷や汚れなし",
  4: "やや傷や汚れあり",
  5: "傷や汚れあり",
  6: "全体的に状態が悪い",
};

const SERIES_OPTIONS = [
  "仮面ライダー", "スーパー戦隊", "ウルトラマン", "ガンダム",
  "ドラゴンボール", "ワンピース", "ポケモン", "プリキュア",
  "シルバニアファミリー", "たまごっち", "その他",
];

const PRODUCT_TYPE_OPTIONS = [
  "DX玩具", "フィギュア", "ぬいぐるみ", "アクスタ",
  "プラモデル", "カード", "ゲームソフト", "CD/DVD/BD", "衣類/グッズ", "その他",
];

const GRADE_OPTIONS = ["S（未開封）", "A（開封未使用）", "B（美品）", "C（良品）", "D（難あり）"];
const ACCESSORIES_OPTIONS = ["完品", "箱付き", "箱なし・付属品あり", "本体のみ", "不明"];
const LIMITED_OPTIONS = ["一般流通", "限定", "プレバン", "イベント限定", "一番くじ", "プライズ", "その他"];

function TagButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        selected
          ? "bg-red-500 text-white border-red-500"
          : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
      }`}
    >
      {label}
    </button>
  );
}

export default function PricingResearchPage() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [taggedCount, setTaggedCount] = useState(0);

  // 詳細表示
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tags, setTags] = useState<TagData>({
    ipName: "", series: "", productType: "", gradeRank: "",
    accessories: "", limitedType: "", hasTop: null, hasBottom: null,
    topNote: "", bottomNote: "", releaseYear: "", memo: "",
  });

  const resetTags = () => {
    setTags({
      ipName: "", series: "", productType: "", gradeRank: "",
      accessories: "", limitedType: "", hasTop: null, hasBottom: null,
      topNote: "", bottomNote: "", releaseYear: "", memo: "",
    });
    setSaved(false);
  };

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSelectedItem(null);
    try {
      const res = await fetch(
        `/api/mercari/search?keyword=${encodeURIComponent(keyword.trim())}&limit=120`
      );
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (item: SearchItem) => {
    setSelectedItem(item);
    setCurrentPhoto(0);
    resetTags();
    window.scrollTo(0, 0);
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const body = {
        mercariId: selectedItem.id,
        name: selectedItem.name,
        price: selectedItem.price,
        description: "",
        soldDate: selectedItem.date,
        photos: JSON.stringify(selectedItem.photos),
        condition: CONDITION_MAP[selectedItem.itemConditionId] || "",
        category: selectedItem.categoryId,
        shippingMethod: "",
        sellerName: "",
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
        setTaggedCount((c) => c + 1);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setSelectedItem(null);
  };

  const updateTag = (key: keyof TagData, value: string | boolean | null) => {
    setTags((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    fetch("/api/pricing-data")
      .then((r) => r.json())
      .then((d) => setTaggedCount(d.items?.length || 0))
      .catch(() => {});
  }, []);

  // ========== 商品詳細+タグ付け画面 ==========
  if (selectedItem) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto">
          {/* 画像 */}
          <div className="bg-white">
            <div className="relative aspect-square bg-gray-100">
              {selectedItem.photos.length > 0 ? (
                <>
                  <img
                    src={selectedItem.photos[currentPhoto]}
                    alt={selectedItem.name}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-3 left-3 bg-red-500 text-white text-sm font-bold px-3 py-1 rounded">
                    SOLD
                  </div>
                  {selectedItem.photos.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentPhoto((p) => p > 0 ? p - 1 : selectedItem.photos.length - 1)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 text-white w-10 h-10 rounded-full flex items-center justify-center text-lg"
                      >
                        &lt;
                      </button>
                      <button
                        onClick={() => setCurrentPhoto((p) => p < selectedItem.photos.length - 1 ? p + 1 : 0)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 text-white w-10 h-10 rounded-full flex items-center justify-center text-lg"
                      >
                        &gt;
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {selectedItem.photos.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPhoto(i)}
                            className={`w-2 h-2 rounded-full ${i === currentPhoto ? "bg-white" : "bg-white/50"}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : selectedItem.thumbnail ? (
                <>
                  <img src={selectedItem.thumbnail} alt={selectedItem.name} className="w-full h-full object-contain" />
                  <div className="absolute top-3 left-3 bg-red-500 text-white text-sm font-bold px-3 py-1 rounded">SOLD</div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
              )}
            </div>

            {/* サムネイル一覧 */}
            {selectedItem.photos.length > 1 && (
              <div className="flex gap-1 p-2 overflow-x-auto">
                {selectedItem.photos.map((photo, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPhoto(i)}
                    className={`w-16 h-16 flex-shrink-0 rounded overflow-hidden border-2 ${
                      i === currentPhoto ? "border-red-500" : "border-transparent"
                    }`}
                  >
                    <img src={photo} alt={`${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* 商品基本情報 */}
            <div className="p-4">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{selectedItem.name}</h1>
              <p className="text-2xl font-bold text-red-600 mt-2">
                ¥{selectedItem.price.toLocaleString()}
                <span className="text-sm font-normal text-gray-500 ml-1">（税込）送料込み</span>
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>{CONDITION_MAP[selectedItem.itemConditionId] || `状態ID: ${selectedItem.itemConditionId}`}</span>
                <span>{selectedItem.date}</span>
              </div>
              {/* メルカリで見るリンク */}
              <a
                href={selectedItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm text-blue-600 hover:underline"
              >
                メルカリで詳細を見る →
              </a>
            </div>
          </div>

          {/* タグ付けパネル */}
          <div className="bg-white mt-2 p-4">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-red-500 rounded-full" />
              タグ付け
            </h2>

            <div className="space-y-4">
              {/* シリーズ */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">シリーズ</label>
                <div className="flex flex-wrap gap-2">
                  {SERIES_OPTIONS.map((opt) => (
                    <TagButton key={opt} label={opt} selected={tags.series === opt} onClick={() => updateTag("series", tags.series === opt ? "" : opt)} />
                  ))}
                </div>
              </div>

              {/* IP名 */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">IP名</label>
                <input type="text" value={tags.ipName} onChange={(e) => updateTag("ipName", e.target.value)}
                  placeholder="例: 仮面ライダーオーズ" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>

              {/* 商品種別 */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">商品種別</label>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_TYPE_OPTIONS.map((opt) => (
                    <TagButton key={opt} label={opt} selected={tags.productType === opt} onClick={() => updateTag("productType", tags.productType === opt ? "" : opt)} />
                  ))}
                </div>
              </div>

              {/* 状態ランク */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">状態ランク（さっさ判定）</label>
                <div className="flex flex-wrap gap-2">
                  {GRADE_OPTIONS.map((opt) => (
                    <TagButton key={opt} label={opt} selected={tags.gradeRank === opt} onClick={() => updateTag("gradeRank", tags.gradeRank === opt ? "" : opt)} />
                  ))}
                </div>
              </div>

              {/* 付属品 */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">付属品</label>
                <div className="flex flex-wrap gap-2">
                  {ACCESSORIES_OPTIONS.map((opt) => (
                    <TagButton key={opt} label={opt} selected={tags.accessories === opt} onClick={() => updateTag("accessories", tags.accessories === opt ? "" : opt)} />
                  ))}
                </div>
              </div>

              {/* 限定性 */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">限定性</label>
                <div className="flex flex-wrap gap-2">
                  {LIMITED_OPTIONS.map((opt) => (
                    <TagButton key={opt} label={opt} selected={tags.limitedType === opt} onClick={() => updateTag("limitedType", tags.limitedType === opt ? "" : opt)} />
                  ))}
                </div>
              </div>

              {/* トップ/アンダー */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">トップ（上位互換）</label>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => updateTag("hasTop", tags.hasTop === true ? null : true)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${tags.hasTop === true ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-700 border-gray-200"}`}>あり</button>
                    <button onClick={() => updateTag("hasTop", tags.hasTop === false ? null : false)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${tags.hasTop === false ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-700 border-gray-200"}`}>なし</button>
                  </div>
                  {tags.hasTop === true && (
                    <input type="text" value={tags.topNote} onChange={(e) => updateTag("topNote", e.target.value)}
                      placeholder="例: CSMあり" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">アンダー（下位互換）</label>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => updateTag("hasBottom", tags.hasBottom === true ? null : true)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${tags.hasBottom === true ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-700 border-gray-200"}`}>あり</button>
                    <button onClick={() => updateTag("hasBottom", tags.hasBottom === false ? null : false)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${tags.hasBottom === false ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-700 border-gray-200"}`}>なし</button>
                  </div>
                  {tags.hasBottom === true && (
                    <input type="text" value={tags.bottomNote} onChange={(e) => updateTag("bottomNote", e.target.value)}
                      placeholder="例: プライズあり" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                  )}
                </div>
              </div>

              {/* 発売年 */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">発売年（推定OK）</label>
                <input type="number" value={tags.releaseYear} onChange={(e) => updateTag("releaseYear", e.target.value)}
                  placeholder="例: 2010" className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              {/* メモ */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">メモ</label>
                <textarea value={tags.memo} onChange={(e) => updateTag("memo", e.target.value)}
                  placeholder="気づいたことがあれば" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>

            {/* ボタン */}
            <div className="flex gap-3 mt-6 sticky bottom-0 bg-white py-4 border-t border-gray-100">
              <button onClick={handleBack}
                className="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">
                戻る
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 py-3 rounded-lg text-white font-medium transition-colors ${
                  saved ? "bg-green-500" : "bg-red-500 hover:bg-red-600 disabled:opacity-50"
                }`}>
                {saved ? "保存済み" : saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== 検索一覧画面 ==========
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">価格研究データ収集</h1>
            <p className="text-xs text-gray-500 mt-1">タグ済み: {taggedCount}件</p>
          </div>
        </div>

        {/* 検索 */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex gap-3">
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="検索キーワード（例: 仮面ライダー DX）"
              className="flex-1 px-4 py-3 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleSearch} disabled={loading || !keyword.trim()}
              className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-red-600 transition-colors">
              {loading ? "検索中..." : "検索"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-500 text-sm">メルカリsold検索中...</p>
          </div>
        )}

        {items.length > 0 && !loading && (
          <>
            <p className="text-sm text-gray-500 mb-3">{items.length}件の売り切れ商品</p>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left"
                >
                  <div className="aspect-square relative bg-gray-100">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>
                    )}
                    <div className="absolute top-1 left-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded">SOLD</div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-gray-700 line-clamp-2 leading-tight">{item.name}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">¥{item.price.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.date}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
