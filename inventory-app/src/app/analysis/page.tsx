"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { formatCurrency, formatNumber, TRADING_STATUS_LABELS } from "@/lib/utils";

interface Product {
  id: string;
  sellingPrice: number;
  purchasePrice: number;
  shippingIncome: number;
  shippingCost: number;
  packagingCost: number;
  commission: number;
  tradingStatus: string;
  listingDate: string | null;
  completionDate: string | null;
}

type TabType = "daily" | "monthly" | "pnl" | "stats";

export default function AnalysisPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<TabType>("daily");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    const json = await res.json();
    setProducts(json);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const completedProducts = products.filter(
    (p) => p.tradingStatus === "completed"
  );

  // Daily data for selected month
  const getDailyData = () => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = Array.from({ length: daysInMonth }, (_, i) => ({
      name: `${i + 1}`,
      利益: 0,
      売上: 0,
    }));

    completedProducts.forEach((p) => {
      if (p.completionDate) {
        const d = new Date(p.completionDate);
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
          const day = d.getDate() - 1;
          const income = p.sellingPrice + p.shippingIncome;
          const expense =
            p.purchasePrice + p.shippingCost + p.packagingCost + p.commission;
          data[day].利益 += income - expense;
          data[day].売上 += p.sellingPrice;
        }
      }
    });

    return data;
  };

  // Monthly data for selected year
  const getMonthlyData = () => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      name: `${i + 1}月`,
      利益: 0,
      売上: 0,
      仕入: 0,
    }));

    completedProducts.forEach((p) => {
      if (p.completionDate) {
        const d = new Date(p.completionDate);
        if (d.getFullYear() === year) {
          const m = d.getMonth();
          const income = p.sellingPrice + p.shippingIncome;
          const expense =
            p.purchasePrice + p.shippingCost + p.packagingCost + p.commission;
          data[m].利益 += income - expense;
          data[m].売上 += p.sellingPrice;
          data[m].仕入 += p.purchasePrice;
        }
      }
    });

    return data;
  };

  // P&L for selected month
  const getPnlData = () => {
    const monthProducts = completedProducts.filter((p) => {
      if (!p.completionDate) return false;
      const d = new Date(p.completionDate);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });

    const totalSales = monthProducts.reduce(
      (sum, p) => sum + p.sellingPrice,
      0
    );
    const totalPurchase = monthProducts.reduce(
      (sum, p) => sum + p.purchasePrice,
      0
    );
    const totalShipping = monthProducts.reduce(
      (sum, p) => sum + p.shippingCost,
      0
    );
    const totalPackaging = monthProducts.reduce(
      (sum, p) => sum + p.packagingCost,
      0
    );
    const totalCommission = monthProducts.reduce(
      (sum, p) => sum + p.commission,
      0
    );
    const totalIncome = monthProducts.reduce(
      (sum, p) => sum + p.sellingPrice + p.shippingIncome,
      0
    );
    const totalExpense = monthProducts.reduce(
      (sum, p) =>
        sum + p.purchasePrice + p.shippingCost + p.packagingCost + p.commission,
      0
    );
    const profit = totalIncome - totalExpense;

    return {
      totalSales,
      totalPurchase,
      totalShipping,
      totalPackaging,
      totalCommission,
      profit,
      count: monthProducts.length,
    };
  };

  // Stats
  const getStats = () => {
    const byStatus: Record<string, number> = {};
    products.forEach((p) => {
      byStatus[p.tradingStatus] = (byStatus[p.tradingStatus] || 0) + 1;
    });

    const completedWithDates = completedProducts.filter(
      (p) => p.listingDate && p.completionDate
    );
    const avgDays =
      completedWithDates.length > 0
        ? completedWithDates.reduce((sum, p) => {
            const start = new Date(p.listingDate!).getTime();
            const end = new Date(p.completionDate!).getTime();
            return sum + (end - start) / (1000 * 60 * 60 * 24);
          }, 0) / completedWithDates.length
        : 0;

    return { byStatus, avgDays, total: products.length };
  };

  const handleExportCSV = () => {
    const headers = [
      "商品名",
      "販売価格",
      "仕入価格",
      "送料",
      "梱包費",
      "手数料",
      "利益",
      "ステータス",
    ];
    const rows = products.map((p) => {
      const profit =
        p.sellingPrice +
        p.shippingIncome -
        p.purchasePrice -
        p.shippingCost -
        p.packagingCost -
        p.commission;
      return [
        `"${(p as unknown as { name: string }).name || ""}"`,
        p.sellingPrice,
        p.purchasePrice,
        p.shippingCost,
        p.packagingCost,
        p.commission,
        profit,
        TRADING_STATUS_LABELS[p.tradingStatus] || p.tradingStatus,
      ].join(",");
    });

    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products_${year}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { key: "daily" as const, label: "日次推移" },
    { key: "monthly" as const, label: "月次推移" },
    { key: "pnl" as const, label: "損益" },
    { key: "stats" as const, label: "統計" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">分析</h1>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs rounded-md transition-colors ${
              tab === t.key
                ? "bg-white text-indigo-600 shadow-sm font-medium"
                : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "daily" && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm text-gray-500 mb-3">
            {month}月 日別利益推移
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getDailyData()}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} width={50} />
              <Tooltip
                formatter={(value) => [formatCurrency(value as number)]}
              />
              <Bar dataKey="利益" fill="#4f46e5" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === "monthly" && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm text-gray-500 mb-3">
            {year}年 月別推移
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={getMonthlyData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={50} />
              <Tooltip
                formatter={(value) => [formatCurrency(value as number)]}
              />
              <Line
                type="monotone"
                dataKey="売上"
                stroke="#818cf8"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="利益"
                stroke="#4f46e5"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="仕入"
                stroke="#f87171"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === "pnl" && (() => {
        const pnl = getPnlData();
        return (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-sm text-gray-500">
              {year}年{month}月 損益レポート
            </h2>
            <div className="space-y-2">
              {[
                { label: "販売額", value: pnl.totalSales, color: "" },
                { label: "仕入額", value: -pnl.totalPurchase, color: "text-red-600" },
                { label: "送料", value: -pnl.totalShipping, color: "text-red-600" },
                { label: "梱包費", value: -pnl.totalPackaging, color: "text-red-600" },
                { label: "手数料", value: -pnl.totalCommission, color: "text-red-600" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{item.label}</span>
                  <span className={item.color}>
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between text-sm font-bold">
                <span>純利益</span>
                <span
                  className={
                    pnl.profit >= 0 ? "text-green-600" : "text-red-600"
                  }
                >
                  {formatCurrency(pnl.profit)}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                取引完了: {pnl.count}件
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "stats" && (() => {
        const stats = getStats();
        return (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-sm text-gray-500 mb-3">ステータス別</h2>
              <div className="space-y-2">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {TRADING_STATUS_LABELS[status] || status}
                    </span>
                    <span className="font-medium">
                      {formatNumber(count)}件
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-sm text-gray-500 mb-2">統計情報</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">総商品数</span>
                  <span>{formatNumber(stats.total)}件</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">平均取引日数</span>
                  <span>{stats.avgDays.toFixed(1)}日</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Export */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-medium text-gray-700">エクスポート</h2>
        <button
          onClick={handleExportCSV}
          className="w-full py-2.5 border border-indigo-600 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
        >
          CSV出力（商品）
        </button>
      </div>
    </div>
  );
}
