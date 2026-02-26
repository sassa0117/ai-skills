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
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface DashboardData {
  monthlyProfit: number;
  dailyProfits: Record<string, number>;
  monthlyProfits: Record<string, number>;
  year: number;
  month: number;
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/dashboard?year=${year}&month=${month}`);
    const json = await res.json();
    setData(json);
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  const dailyData = Object.entries(data.dailyProfits).map(([day, profit]) => ({
    name: `${day}日`,
    利益: profit,
  }));

  const monthlyData = Object.entries(data.monthlyProfits).map(
    ([m, profit]) => ({
      name: m,
      利益: profit,
    })
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ホーム</h1>
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

      {/* Monthly Profit Summary */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500 mb-1">
          {month}月の利益（取引完了）
        </div>
        <div
          className={`text-3xl font-bold ${data.monthlyProfit >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {formatCurrency(data.monthlyProfit)}
        </div>
      </div>

      {/* Daily Profit Chart */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500 mb-3">
          {month}月の利益推移（取引完了）
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 10 }} width={50} />
            <Tooltip
              formatter={(value) => [formatCurrency(value as number), "利益"]}
            />
            <Bar dataKey="利益" fill="#4f46e5" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Profit Chart */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500 mb-3">
          {year}年の利益推移（取引完了）
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={50} />
            <Tooltip
              formatter={(value) => [formatCurrency(value as number), "利益"]}
            />
            <Bar dataKey="利益" fill="#818cf8" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
