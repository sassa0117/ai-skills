"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ExpenseCategory {
  id: string;
  name: string;
}

export default function NewExpensePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    fetch("/api/expense-categories")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        amount,
        categoryId: categoryId || null,
        memo: memo || null,
      }),
    });
    router.push("/expenses");
  };

  const inputClass =
    "w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">経費を追加</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              日付
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              金額
            </label>
            <input
              type="number"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              カテゴリ
            </label>
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
            <label className="block text-sm font-medium text-gray-600 mb-1">
              メモ
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>
        </div>
        <button
          type="submit"
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          追加する
        </button>
      </form>
    </div>
  );
}
