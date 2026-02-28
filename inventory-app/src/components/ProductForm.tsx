"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent, formatDateForInput } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
  commissionRate?: number;
}

interface ProductFormProps {
  product?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function ProductForm({ product, onSubmit }: ProductFormProps) {
  const [platforms, setPlatforms] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<Option[]>([]);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [platformId, setPlatformId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tradingStatus, setTradingStatus] = useState("before_listing");
  const [sellingPrice, setSellingPrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [shippingIncome, setShippingIncome] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [packagingCost, setPackagingCost] = useState(0);
  const [commission, setCommission] = useState(0);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [listingDate, setListingDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [shippingDate, setShippingDate] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [memo, setMemo] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/platforms").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/payment-methods").then((r) => r.json()),
    ]).then(([p, c, t, s, pm]) => {
      setPlatforms(p);
      setCategories(c);
      setTags(t);
      setSuppliers(s);
      setPaymentMethods(pm);
    });
  }, []);

  useEffect(() => {
    if (product) {
      setName((product.name as string) || "");
      setCode((product.code as string) || "");
      setPlatformId((product.platformId as string) || "");
      setCategoryId((product.categoryId as string) || "");
      setSupplierId((product.supplierId as string) || "");
      setPaymentMethodId((product.paymentMethodId as string) || "");
      setTradingStatus((product.tradingStatus as string) || "before_listing");
      setSellingPrice((product.sellingPrice as number) || 0);
      setPurchasePrice((product.purchasePrice as number) || 0);
      setShippingIncome((product.shippingIncome as number) || 0);
      setShippingCost((product.shippingCost as number) || 0);
      setPackagingCost((product.packagingCost as number) || 0);
      setCommission((product.commission as number) || 0);
      setCommissionRate((product.commissionRate as number) ?? null);
      setPurchaseDate(formatDateForInput(product.purchaseDate as string));
      setListingDate(formatDateForInput(product.listingDate as string));
      setPaymentDate(formatDateForInput(product.paymentDate as string));
      setShippingDate(formatDateForInput(product.shippingDate as string));
      setCompletionDate(formatDateForInput(product.completionDate as string));
      setCoverImage((product.coverImage as string) || null);
      if (product.images) {
        try {
          setImages(JSON.parse(product.images as string));
        } catch {
          setImages([]);
        }
      }
      setMemo((product.memo as string) || "");
      setInvoiceNumber((product.invoiceNumber as string) || "");
      if (product.tags && Array.isArray(product.tags)) {
        setSelectedTagIds(
          (product.tags as { tagId: string }[]).map((t) => t.tagId)
        );
      }
    }
  }, [product]);

  // Auto-calc commission from rate
  useEffect(() => {
    if (commissionRate !== null && sellingPrice > 0) {
      setCommission(Math.floor(sellingPrice * (commissionRate / 100)));
    }
  }, [commissionRate, sellingPrice]);

  // Update commission rate when platform changes
  useEffect(() => {
    if (platformId) {
      const platform = platforms.find((p) => p.id === platformId);
      if (platform && platform.commissionRate) {
        setCommissionRate(platform.commissionRate);
      }
    }
  }, [platformId, platforms]);

  const uploadFiles = async (files: FileList): Promise<string[]> => {
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const json = await res.json();
    return json.urls || [];
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    try {
      const urls = await uploadFiles(e.target.files);
      if (urls[0]) setCoverImage(urls[0]);
    } finally {
      setUploading(false);
    }
  };

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    try {
      const urls = await uploadFiles(e.target.files);
      setImages((prev) => [...prev, ...urls]);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const income = sellingPrice + shippingIncome;
  const expense = purchasePrice + shippingCost + packagingCost + commission;
  const profit = income - expense;
  const profitRate = income > 0 ? (profit / income) * 100 : 0;
  const costRate = income > 0 ? (expense / income) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      code: code || null,
      coverImage: coverImage || null,
      images: images.length > 0 ? JSON.stringify(images) : null,
      platformId: platformId || null,
      categoryId: categoryId || null,
      supplierId: supplierId || null,
      paymentMethodId: paymentMethodId || null,
      tagIds: selectedTagIds,
      tradingStatus,
      sellingPrice,
      purchasePrice,
      shippingIncome,
      shippingCost,
      packagingCost,
      commission,
      commissionRate,
      purchaseDate: purchaseDate || null,
      listingDate: listingDate || null,
      paymentDate: paymentDate || null,
      shippingDate: shippingDate || null,
      completionDate: completionDate || null,
      memo: memo || null,
      invoiceNumber: invoiceNumber || null,
    });
  };

  const inputClass =
    "w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
  const labelClass = "block text-sm font-medium text-gray-600 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Platform Section */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <h2 className="font-medium text-sm text-gray-800">出品先の情報</h2>
        <div>
          <label className={labelClass}>プラットフォーム</label>
          <select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            className={inputClass}
          >
            <option value="">選択してください</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>手数料率 (%)</label>
          <input
            type="number"
            step="0.1"
            value={commissionRate ?? ""}
            onChange={(e) =>
              setCommissionRate(e.target.value ? parseFloat(e.target.value) : null)
            }
            className={inputClass}
          />
        </div>
      </div>

      {/* Images */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <h2 className="font-medium text-sm text-gray-800">商品画像</h2>

        {/* Cover Image */}
        <div>
          <label className={labelClass}>カバー画像</label>
          <div className="flex items-start gap-3">
            <div className="w-24 h-24 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden relative">
              {coverImage ? (
                <>
                  <img src={coverImage} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setCoverImage(null)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </>
              ) : (
                <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs mt-1">追加</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {coverImage && (
              <label className="cursor-pointer text-xs text-indigo-500 mt-2">
                変更
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Additional Images */}
        <div>
          <label className={labelClass}>追加画像</label>
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={i} className="w-20 h-20 relative rounded-lg overflow-hidden border">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 3 - images.length) }).map((_, i) => (
              <label key={`empty-${i}`} className="w-20 h-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer flex flex-col items-center justify-center text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs mt-0.5">追加</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagesUpload}
                  className="hidden"
                />
              </label>
            ))}
            {images.length >= 3 && (
            <label className="w-20 h-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer flex flex-col items-center justify-center text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs mt-0.5">追加</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImagesUpload}
                className="hidden"
              />
            </label>
            )}
          </div>
        </div>

        {uploading && (
          <p className="text-xs text-indigo-500">アップロード中...</p>
        )}
      </div>

      {/* Product Info */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <h2 className="font-medium text-sm text-gray-800">商品情報</h2>
        <div>
          <label className={labelClass}>商品名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>独自商品コード</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>商品カテゴリ</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">選択してください</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>タグ</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setSelectedTagIds((prev) =>
                    prev.includes(tag.id)
                      ? prev.filter((id) => id !== tag.id)
                      : [...prev, tag.id]
                  )
                }
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  selectedTagIds.includes(tag.id)
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {tag.name}
              </button>
            ))}
            {tags.length === 0 && (
              <span className="text-xs text-gray-400">
                設定画面からタグを追加してください
              </span>
            )}
          </div>
        </div>
        <div>
          <label className={labelClass}>取引ステータス</label>
          <select
            value={tradingStatus}
            onChange={(e) => setTradingStatus(e.target.value)}
            className={inputClass}
          >
            <option value="before_listing">出品前</option>
            <option value="listing">出品中</option>
            <option value="sold">売却済</option>
            <option value="shipped">発送済</option>
            <option value="completed">取引完了</option>
            <option value="cancelled">キャンセル</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>仕入先</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={inputClass}
          >
            <option value="">選択してください</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>仕入決済方法</label>
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className={inputClass}
          >
            <option value="">選択してください</option>
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {pm.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Price Section */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <h2 className="font-medium text-sm text-gray-800">価格情報</h2>
        <div>
          <label className={labelClass}>販売価格</label>
          <input
            type="number"
            value={sellingPrice || ""}
            onChange={(e) => setSellingPrice(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>仕入価格</label>
          <input
            type="number"
            value={purchasePrice || ""}
            onChange={(e) => setPurchasePrice(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>送料（購入者負担分）</label>
          <input
            type="number"
            value={shippingIncome || ""}
            onChange={(e) => setShippingIncome(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>送料</label>
          <input
            type="number"
            value={shippingCost || ""}
            onChange={(e) => setShippingCost(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>梱包費</label>
          <input
            type="number"
            value={packagingCost || ""}
            onChange={(e) => setPackagingCost(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>手数料（優先）</label>
          <input
            type="number"
            value={commission || ""}
            onChange={(e) => setCommission(Number(e.target.value))}
            className={inputClass}
          />
        </div>

        {/* Calculated values */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">収入合計</span>
            <span>{formatCurrency(income)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">支出合計</span>
            <span>{formatCurrency(expense)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span className="text-gray-500">純利益</span>
            <span className={profit >= 0 ? "text-green-600" : "text-red-600"}>
              {formatCurrency(profit)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">手数料</span>
            <span>{formatCurrency(commission)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">利益率</span>
            <span>{formatPercent(profitRate)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">原価率</span>
            <span>{formatPercent(costRate)}</span>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <h2 className="font-medium text-sm text-gray-800">日程</h2>
        {[
          { label: "仕入日", value: purchaseDate, setter: setPurchaseDate },
          { label: "出品日", value: listingDate, setter: setListingDate },
          { label: "入金日", value: paymentDate, setter: setPaymentDate },
          { label: "発送日", value: shippingDate, setter: setShippingDate },
          {
            label: "取引完了日",
            value: completionDate,
            setter: setCompletionDate,
          },
        ].map(({ label, value, setter }) => (
          <div key={label}>
            <label className={labelClass}>{label}</label>
            <input
              type="date"
              value={value}
              onChange={(e) => setter(e.target.value)}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      {/* Memo & Details */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <h2 className="font-medium text-sm text-gray-800">メモ</h2>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={4}
          className={inputClass}
          placeholder="メモを入力..."
        />
        <div>
          <label className={labelClass}>インボイス番号</label>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
      >
        {product ? "更新する" : "追加する"}
      </button>
    </form>
  );
}
