"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Expense {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  category: { id: string; name: string } | null;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchExpenses = useCallback(async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/expenses?${params}`);
    const json = await res.json();
    setExpenses(json);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">経費</h1>
      </div>

      {/* Date filter */}
      <div className="flex gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm"
          placeholder="開始日"
        />
        <span className="flex items-center text-gray-400">〜</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm"
          placeholder="終了日"
        />
      </div>

      {/* Total */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-sm text-gray-500">合計経費</div>
        <div className="text-2xl font-bold text-red-600">
          {formatCurrency(total)}
        </div>
        <div className="text-xs text-gray-400 mt-1">{expenses.length}件</div>
      </div>

      {/* Expense list */}
      <div className="space-y-2">
        {expenses.map((expense) => (
          <Link
            key={expense.id}
            href={`/expenses/${expense.id}/edit`}
            className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium">
                  {expense.category?.name || "カテゴリなし"}
                </div>
                {expense.memo && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {expense.memo}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-0.5">
                  {formatDate(expense.date)}
                </div>
              </div>
              <div className="text-sm font-medium text-red-600">
                {formatCurrency(expense.amount)}
              </div>
            </div>
          </Link>
        ))}
        {expenses.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            経費がありません
          </div>
        )}
      </div>

      {/* FAB */}
      <Link
        href="/expenses/new"
        className="fixed bottom-24 right-4 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-colors z-40"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Link>
    </div>
  );
}
