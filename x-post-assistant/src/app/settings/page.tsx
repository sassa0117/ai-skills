"use client";

import { useState, useEffect } from "react";
import { IP_TIERS } from "@/lib/constants";

interface Franchise {
  id: string;
  name: string;
  tier: string;
  romBase: string | null;
  keywords: { id: string; keyword: string }[];
  _count: { posts: number };
}

interface PhraseItem {
  id: string;
  text: string;
  effect: string | null;
  bestResult: string | null;
  category: string | null;
}

interface NgPatternItem {
  id: string;
  pattern: string;
  reason: string;
  suggestion: string | null;
  severity: string;
}

interface TemplateItem {
  id: string;
  name: string;
  template: string;
  postType: string;
  description: string | null;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"ip" | "phrases" | "ng" | "templates">("ip");
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [phrases, setPhrases] = useState<PhraseItem[]>([]);
  const [ngPatterns, setNgPatterns] = useState<NgPatternItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);

  useEffect(() => {
    fetch("/api/franchises").then((r) => r.json()).then(setFranchises);
    fetch("/api/phrases").then((r) => r.json()).then(setPhrases);
    fetch("/api/ng-patterns").then((r) => r.json()).then(setNgPatterns);
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
  }, []);

  const tabs = [
    { key: "ip" as const, label: "IP作品" },
    { key: "phrases" as const, label: "フレーズ" },
    { key: "ng" as const, label: "NGパターン" },
    { key: "templates" as const, label: "テンプレート" },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">設定</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-bold py-2 rounded-md transition-colors ${
              tab === t.key ? "bg-white text-[#1d9bf0] shadow-sm" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* IP作品タブ */}
      {tab === "ip" && (
        <div className="space-y-2">
          {franchises.map((f) => (
            <div key={f.id} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${IP_TIERS[f.tier]?.bg || "bg-gray-100"} ${IP_TIERS[f.tier]?.color || "text-gray-700"}`}>
                    {f.tier}
                  </span>
                  <span className="text-sm font-bold">{f.name}</span>
                </div>
                <span className="text-xs text-gray-400">{f._count.posts}件</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {f.keywords.map((kw) => (
                  <span key={kw.id} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {kw.keyword}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* フレーズタブ */}
      {tab === "phrases" && (
        <div className="space-y-2">
          {phrases.map((p) => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-sm font-bold">{p.text}</p>
              <div className="flex gap-2 mt-1 text-xs text-gray-500">
                {p.effect && <span>{p.effect}</span>}
                {p.bestResult && <span className="text-[#1d9bf0]">{p.bestResult}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NGパターンタブ */}
      {tab === "ng" && (
        <div className="space-y-2">
          {ngPatterns.map((ng) => (
            <div key={ng.id} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  ng.severity === "error" ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600"
                }`}>
                  {ng.severity === "error" ? "NG" : "注意"}
                </span>
                <code className="text-xs bg-gray-100 px-1 rounded">{ng.pattern}</code>
              </div>
              <p className="text-xs text-gray-600 mt-1">{ng.reason}</p>
              {ng.suggestion && (
                <p className="text-xs text-green-600 mt-0.5">→ {ng.suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* テンプレートタブ */}
      {tab === "templates" && (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{t.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  t.postType === "mega_buzz" ? "bg-red-100 text-red-600" :
                  t.postType === "mid_tier" ? "bg-blue-100 text-blue-600" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {t.postType === "mega_buzz" ? "バズ" : t.postType === "mid_tier" ? "安定" : "引用RT"}
                </span>
              </div>
              <pre className="text-xs bg-gray-50 rounded p-2 mt-2 whitespace-pre-wrap text-gray-600 overflow-hidden">
                {t.template}
              </pre>
              {t.description && (
                <p className="text-xs text-gray-400 mt-1">{t.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
