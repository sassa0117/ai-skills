"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDateForInput } from "@/lib/utils";

interface ExpenseCategory {
  id: string;
  name: string;
}

export default function EditExpensePage() {
  const params = useParams();
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/expenses/${params.id}`).then((r) => r.json()),
      fetch("/api/expense-categories").then((r) => r.json()),
    ]).then(([expense, cats]) => {
      setDate(formatDateForInput(expense.date));
      setAmount(expense.amount);
      setCategoryId(expense.categoryId || "");
      setMemo(expense.memo || "");
      setCategories(cats);
      setLoading(false);
    });
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`/api/expenses/${params.id}`, {
      method: "PUT",
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

  const handleDelete = async () => {
    if (confirm("この経費を削除しますか？")) {
      await fetch(`/api/expenses/${params.id}`, { method: "DELETE" });
      router.push("/expenses");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  const inputClass =
    "w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">経費を編集</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">日付</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">金額</label>
            <input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">カテゴリ</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">選択してください</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">メモ</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className={inputClass} />
          </div>
        </div>
        <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
          更新する
        </button>
      </form>
      <div className="mt-8 pt-4 border-t">
        <button onClick={handleDelete} className="w-full py-3 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
          この経費を削除する
        </button>
      </div>
    </div>
  );
}
