"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatDate,
  TRADING_STATUS_LABELS,
  TRADING_STATUS_COLORS,
  calcProfit,
  daysBetween,
} from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  code: string | null;
  coverImage: string | null;
  sellingPrice: number;
  purchasePrice: number;
  shippingIncome: number;
  shippingCost: number;
  packagingCost: number;
  commission: number;
  tradingStatus: string;
  listingDate: string | null;
  completionDate: string | null;
  platform: { name: string } | null;
  category: { name: string } | null;
  tags: { tag: { name: string } }[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [tradingStatus, setTradingStatus] = useState("all");
  const [showSummary, setShowSummary] = useState(true);

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tradingStatus !== "all") params.set("tradingStatus", tradingStatus);
    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json);
  }, [search, tradingStatus]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Summary calculations
  const summary = products.reduce(
    (acc, p) => {
      const { profit } = calcProfit(p);
      acc.profit += profit;
      acc.sales += p.sellingPrice;
      acc.purchase += p.purchasePrice;
      acc.shipping += p.shippingCost;
      acc.packaging += p.packagingCost;
      acc.commissionTotal += p.commission;
      acc.count += 1;
      return acc;
    },
    {
      profit: 0,
      sales: 0,
      purchase: 0,
      shipping: 0,
      packaging: 0,
      commissionTotal: 0,
      count: 0,
    }
  );

  const profitRate = summary.sales > 0 ? (summary.profit / summary.sales) * 100 : 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">商品管理</h1>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="商品名や商品コードで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border rounded-lg px-4 py-2.5 pl-10 text-sm"
        />
        <svg
          className="absolute left-3 top-3 w-4 h-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: "all", label: "すべて" },
          { value: "before_listing", label: "出品前" },
          { value: "listing", label: "出品中" },
          { value: "sold", label: "売却済" },
          { value: "shipped", label: "発送済" },
          { value: "completed", label: "取引完了" },
          { value: "cancelled", label: "キャンセル" },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => setTradingStatus(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
              tradingStatus === s.value
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 border"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {showSummary && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">サマリー</span>
            <button
              onClick={() => setShowSummary(false)}
              className="text-xs text-gray-400"
            >
              非表示
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">利益</span>
              <span className={`font-medium ${summary.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(summary.profit)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">販売額</span>
              <span>{formatCurrency(summary.sales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">仕入額</span>
              <span>{formatCurrency(summary.purchase)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">送料</span>
              <span>{formatCurrency(summary.shipping)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">梱包費</span>
              <span>{formatCurrency(summary.packaging)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">手数料</span>
              <span>{formatCurrency(summary.commissionTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">利益率</span>
              <span>{formatPercent(profitRate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">商品数</span>
              <span>{formatNumber(summary.count)}件</span>
            </div>
          </div>
        </div>
      )}

      {!showSummary && (
        <button
          onClick={() => setShowSummary(true)}
          className="text-xs text-indigo-500"
        >
          サマリーを表示
        </button>
      )}

      {/* Product list */}
      <div className="space-y-3">
        {products.map((product) => {
          const { profit } = calcProfit(product);
          const days = daysBetween(product.listingDate, product.completionDate);
          return (
            <Link
              key={product.id}
              href={`/products/${product.id}/edit`}
              className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-3">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-300">
                  {product.coverImage ? (
                    <img
                      src={product.coverImage}
                      alt=""
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium truncate">
                      {product.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${
                        TRADING_STATUS_COLORS[product.tradingStatus] || "bg-gray-100"
                      }`}
                    >
                      {TRADING_STATUS_LABELS[product.tradingStatus] || product.tradingStatus}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span>{formatCurrency(product.sellingPrice)}</span>
                    <span
                      className={`font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatCurrency(profit)}
                    </span>
                    {days !== null && <span>{days}日</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    {product.platform && <span>{product.platform.name}</span>}
                    {product.category && <span>{product.category.name}</span>}
                    {product.listingDate && (
                      <span>{formatDate(product.listingDate)}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
        {products.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            商品がありません
          </div>
        )}
      </div>

      {/* FAB */}
      <Link
        href="/products/new"
        className="fixed bottom-24 right-4 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-colors z-40"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Link>
    </div>
  );
}
