"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatNumber, TRADING_STATUS_LABELS } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  code: string | null;
  sellingPrice: number;
  purchasePrice: number;
  tradingStatus: string;
  category: { name: string } | null;
  platform: { name: string } | null;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  totalValue: number;
}

export default function MasterPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json);
  }, [search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const stats: Stats = products.reduce(
    (acc, p) => {
      acc.total++;
      acc.byStatus[p.tradingStatus] = (acc.byStatus[p.tradingStatus] || 0) + 1;
      acc.totalValue += p.purchasePrice;
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number>, totalValue: 0 }
  );

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">商品マスタ</h1>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="商品名や商品コードで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border rounded-lg px-4 py-2.5 pl-10 text-sm"
        />
        <svg className="absolute left-3 top-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">在庫統計</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">総商品数</div>
            <div className="text-lg font-bold">{formatNumber(stats.total)}件</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">総仕入額</div>
            <div className="text-lg font-bold">{formatCurrency(stats.totalValue)}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="flex justify-between text-sm">
              <span className="text-gray-500">
                {TRADING_STATUS_LABELS[status] || status}
              </span>
              <span className="font-medium">{count}件</span>
            </div>
          ))}
        </div>
      </div>

      {/* Product master list */}
      <div className="bg-white rounded-xl shadow-sm divide-y">
        {products.map((product) => (
          <div key={product.id} className="px-4 py-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium">{product.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {product.code && <span className="mr-2">{product.code}</span>}
                  {product.category && <span className="mr-2">{product.category.name}</span>}
                  {product.platform && <span>{product.platform.name}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm">{formatCurrency(product.sellingPrice)}</div>
                <div className="text-xs text-gray-400">
                  仕入: {formatCurrency(product.purchasePrice)}
                </div>
              </div>
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            商品がありません
          </div>
        )}
      </div>
    </div>
  );
}
