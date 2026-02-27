"use client";

import { useEffect, useState, useCallback } from "react";

interface MasterItem {
  id: string;
  name: string;
  commissionRate?: number;
}

type MasterType =
  | "platforms"
  | "categories"
  | "tags"
  | "suppliers"
  | "payment-methods"
  | "expense-categories";

const masterSections: {
  key: MasterType;
  label: string;
  hasRate?: boolean;
}[] = [
  { key: "platforms", label: "プラットフォーム", hasRate: true },
  { key: "categories", label: "商品カテゴリ" },
  { key: "tags", label: "タグ" },
  { key: "suppliers", label: "仕入先" },
  { key: "payment-methods", label: "決済方法" },
  { key: "expense-categories", label: "経費カテゴリ" },
];

function MasterSection({
  type,
  label,
  hasRate,
}: {
  type: MasterType;
  label: string;
  hasRate?: boolean;
}) {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");

  const fetchItems = useCallback(async () => {
    const res = await fetch(`/api/${type}`);
    const json = await res.json();
    setItems(json);
  }, [type]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const body: Record<string, unknown> = { name: newName.trim() };
    if (hasRate && newRate) body.commissionRate = parseFloat(newRate);
    await fetch(`/api/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setNewName("");
    setNewRate("");
    fetchItems();
  };

  const handleUpdate = async (id: string) => {
    const body: Record<string, unknown> = { name: editName.trim() };
    if (hasRate && editRate) body.commissionRate = parseFloat(editRate);
    await fetch(`/api/${type}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditingId(null);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    await fetch(`/api/${type}/${id}`, { method: "DELETE" });
    fetchItems();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <span className="text-sm font-medium">{label}</span>
          <span className="ml-2 text-xs text-gray-400">{items.length}件</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {/* Add form */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="名前"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            {hasRate && (
              <input
                type="number"
                placeholder="%"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-20 border rounded-lg px-3 py-2 text-sm"
                step="0.1"
              />
            )}
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"
            >
              追加
            </button>
          </div>

          {/* Items */}
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="py-2 flex items-center justify-between">
                {editingId === item.id ? (
                  <div className="flex gap-2 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-sm"
                    />
                    {hasRate && (
                      <input
                        type="number"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        className="w-20 border rounded px-2 py-1 text-sm"
                        step="0.1"
                      />
                    )}
                    <button
                      onClick={() => handleUpdate(item.id)}
                      className="text-xs text-indigo-600"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-400"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm">
                      {item.name}
                      {hasRate && item.commissionRate !== undefined && (
                        <span className="ml-2 text-xs text-gray-400">
                          {item.commissionRate}%
                        </span>
                      )}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditName(item.name);
                          setEditRate(
                            item.commissionRate?.toString() || ""
                          );
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        削除
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">アカウント</h1>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-2">ツール</h2>
        <div className="text-sm text-gray-500">販売価格シミュレーター（準備中）</div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3 px-1">
          カスタマイズ
        </h2>
        <div className="space-y-3">
          {masterSections.map((section) => (
            <MasterSection
              key={section.key}
              type={section.key}
              label={section.label}
              hasRate={section.hasRate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
