"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  WIDGET_METRIC_LABELS,
  WIDGET_DATE_FIELD_LABELS,
  TRADING_STATUS_LABELS,
} from "@/lib/utils";

interface Widget {
  id: string;
  type: string;
  period: string;
  periodRange: string;
  recentCount: number;
  metric: string;
  dateField: string;
  tradingStatus: string;
  showComparison: boolean;
  sortOrder: number;
}

interface Product {
  sellingPrice: number;
  purchasePrice: number;
  shippingIncome: number;
  shippingCost: number;
  packagingCost: number;
  commission: number;
  tradingStatus: string;
  purchaseDate: string | null;
  listingDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  completionDate: string | null;
}

function getProductDateValue(product: Product, dateField: string): Date | null {
  const val = product[dateField as keyof Product] as string | null;
  return val ? new Date(val) : null;
}

function calcMetricValue(products: Product[], metric: string): number {
  switch (metric) {
    case "profit":
      return products.reduce((sum, p) => {
        return sum + (p.sellingPrice + p.shippingIncome - p.purchasePrice - p.shippingCost - p.packagingCost - p.commission);
      }, 0);
    case "sales":
      return products.reduce((sum, p) => sum + p.sellingPrice, 0);
    case "total_cost":
      return products.reduce((sum, p) => sum + p.purchasePrice + p.shippingCost + p.packagingCost + p.commission, 0);
    case "commission":
      return products.reduce((sum, p) => sum + p.commission, 0);
    case "purchase":
      return products.reduce((sum, p) => sum + p.purchasePrice, 0);
    case "shipping":
      return products.reduce((sum, p) => sum + p.shippingCost, 0);
    case "packaging":
      return products.reduce((sum, p) => sum + p.packagingCost, 0);
    case "profit_rate": {
      const totalSales = products.reduce((sum, p) => sum + p.sellingPrice + p.shippingIncome, 0);
      const totalProfit = products.reduce((sum, p) => {
        return sum + (p.sellingPrice + p.shippingIncome - p.purchasePrice - p.shippingCost - p.packagingCost - p.commission);
      }, 0);
      return totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    }
    case "product_count":
      return products.length;
    default:
      return 0;
  }
}

function formatMetricValue(value: number, metric: string): string {
  if (metric === "profit_rate") return formatPercent(value);
  if (metric === "product_count") return `${formatNumber(value)}件`;
  return formatCurrency(value);
}

function filterByStatus(products: Product[], tradingStatus: string): Product[] {
  if (tradingStatus === "all") return products;
  return products.filter((p) => p.tradingStatus === tradingStatus);
}

function filterByDateRange(
  products: Product[],
  dateField: string,
  start: Date,
  end: Date
): Product[] {
  return products.filter((p) => {
    const d = getProductDateValue(p, dateField);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

function WidgetRenderer({
  widget,
  products,
}: {
  widget: Widget;
  products: Product[];
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const filtered = filterByStatus(products, widget.tradingStatus);
  const metricLabel = WIDGET_METRIC_LABELS[widget.metric] || widget.metric;
  const statusLabel = TRADING_STATUS_LABELS[widget.tradingStatus] || "すべて";

  if (widget.type === "single_value") {
    // Determine date range based on period
    let start: Date, end: Date;
    let periodLabel: string;

    if (widget.period === "daily") {
      start = new Date(year, month, now.getDate(), 0, 0, 0);
      end = new Date(year, month, now.getDate(), 23, 59, 59);
      periodLabel = `${month + 1}月${now.getDate()}日`;
    } else if (widget.period === "monthly") {
      if (widget.periodRange === "current") {
        start = new Date(year, month, 1);
        end = new Date(year, month + 1, 0, 23, 59, 59);
        periodLabel = `${month + 1}月`;
      } else {
        const monthsBack = widget.recentCount;
        start = new Date(year, month - monthsBack + 1, 1);
        end = new Date(year, month + 1, 0, 23, 59, 59);
        periodLabel = `直近${monthsBack}ヶ月`;
      }
    } else {
      // yearly
      if (widget.periodRange === "current") {
        start = new Date(year, 0, 1);
        end = new Date(year, 11, 31, 23, 59, 59);
        periodLabel = `${year}年`;
      } else {
        start = new Date(year - widget.recentCount + 1, 0, 1);
        end = new Date(year, 11, 31, 23, 59, 59);
        periodLabel = `直近${widget.recentCount}年`;
      }
    }

    const rangeProducts = filterByDateRange(filtered, widget.dateField, start, end);
    const value = calcMetricValue(rangeProducts, widget.metric);

    // Comparison with previous period
    let prevValue: number | null = null;
    if (widget.showComparison) {
      const duration = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - duration);
      const prevEnd = new Date(start.getTime() - 1);
      const prevProducts = filterByDateRange(filtered, widget.dateField, prevStart, prevEnd);
      prevValue = calcMetricValue(prevProducts, widget.metric);
    }

    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500 mb-1">
          {periodLabel}の{metricLabel}（{statusLabel}）
        </div>
        <div
          className={`text-3xl font-bold ${
            widget.metric === "profit" || widget.metric === "profit_rate"
              ? value >= 0 ? "text-green-600" : "text-red-600"
              : ""
          }`}
        >
          {formatMetricValue(value, widget.metric)}
        </div>
        {widget.showComparison && prevValue !== null && (
          <div className="mt-1 text-xs text-gray-400">
            前期: {formatMetricValue(prevValue, widget.metric)}
            {prevValue !== 0 && (
              <span
                className={`ml-2 ${
                  value >= prevValue ? "text-green-500" : "text-red-500"
                }`}
              >
                {value >= prevValue ? "+" : ""}
                {((value - prevValue) / Math.abs(prevValue) * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Bar chart type
  if (widget.period === "daily") {
    const targetMonth = widget.periodRange === "current" ? month : month;
    const daysInMonth = new Date(year, targetMonth + 1, 0).getDate();
    const data = Array.from({ length: daysInMonth }, (_, i) => ({
      name: `${i + 1}`,
      value: 0,
    }));

    const start = new Date(year, targetMonth, 1);
    const end = new Date(year, targetMonth + 1, 0, 23, 59, 59);
    const rangeProducts = filterByDateRange(filtered, widget.dateField, start, end);

    rangeProducts.forEach((p) => {
      const d = getProductDateValue(p, widget.dateField);
      if (d) {
        const day = d.getDate() - 1;
        if (day >= 0 && day < data.length) {
          data[day].value += calcMetricValue([p], widget.metric);
        }
      }
    });

    const periodLabel = `${targetMonth + 1}月`;

    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500 mb-3">
          {periodLabel}の{metricLabel}推移（{statusLabel}）
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={50} />
            <Tooltip formatter={(v) => [formatMetricValue(v as number, widget.metric)]} />
            <Bar dataKey="value" name={metricLabel} fill="#4f46e5" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.period === "monthly") {
    const data = Array.from({ length: 12 }, (_, i) => ({
      name: `${i + 1}月`,
      value: 0,
    }));

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);
    const rangeProducts = filterByDateRange(filtered, widget.dateField, start, end);

    rangeProducts.forEach((p) => {
      const d = getProductDateValue(p, widget.dateField);
      if (d) {
        const m = d.getMonth();
        data[m].value += calcMetricValue([p], widget.metric);
      }
    });

    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500 mb-3">
          {year}年の{metricLabel}推移（{statusLabel}）
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={50} />
            <Tooltip formatter={(v) => [formatMetricValue(v as number, widget.metric)]} />
            <Bar dataKey="value" name={metricLabel} fill="#818cf8" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Yearly
  const yearsToShow = widget.periodRange === "recent" ? widget.recentCount : 3;
  const startYear = year - yearsToShow + 1;
  const data = Array.from({ length: yearsToShow }, (_, i) => ({
    name: `${startYear + i}`,
    value: 0,
  }));

  const start = new Date(startYear, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);
  const rangeProducts = filterByDateRange(filtered, widget.dateField, start, end);

  rangeProducts.forEach((p) => {
    const d = getProductDateValue(p, widget.dateField);
    if (d) {
      const idx = d.getFullYear() - startYear;
      if (idx >= 0 && idx < data.length) {
        data[idx].value += calcMetricValue([p], widget.metric);
      }
    }
  });

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="text-sm text-gray-500 mb-3">
        年間{metricLabel}推移（{statusLabel}）
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={50} />
          <Tooltip formatter={(v) => [formatMetricValue(v as number, widget.metric)]} />
          <Bar dataKey="value" name={metricLabel} fill="#6366f1" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function HomePage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [widgetsRes, productsRes] = await Promise.all([
      fetch("/api/widgets"),
      fetch("/api/products"),
    ]);
    const [widgetsData, productsData] = await Promise.all([
      widgetsRes.json(),
      productsRes.json(),
    ]);
    setWidgets(widgetsData);
    setProducts(productsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ホーム</h1>
        <Link
          href="/home-settings"
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </Link>
      </div>

      {widgets.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="text-gray-300">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400">
            ウィジェットがありません
          </p>
          <Link
            href="/home-settings"
            className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            ホームを設定する
          </Link>
        </div>
      ) : (
        widgets.map((widget) => (
          <WidgetRenderer
            key={widget.id}
            widget={widget}
            products={products}
          />
        ))
      )}
    </div>
  );
}
