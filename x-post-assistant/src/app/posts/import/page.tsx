"use client";

import { useState, useRef } from "react";

interface ImportResult {
  success: number;
  skipped: number;
  errors: number;
  details: string[];
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/posts/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ success: 0, skipped: 0, errors: 1, details: [data.error] });
      } else {
        setResult(data);
      }
    } catch (e) {
      setResult({ success: 0, skipped: 0, errors: 1, details: [String(e)] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">CSVインポート</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <div className="text-sm text-gray-600 space-y-1">
          <p className="font-bold">対応フォーマット:</p>
          <p>x-analyticsの16カラム形式（タブ区切り or カンマ区切り）</p>
          <p className="text-xs text-gray-400">
            日付 / ポストURL / インプレッション / いいね / リプライ / リポスト / プロフクリック / リンククリック / フォロワー増減 / エンゲ率 / 動画再生 / 推移型 / 投稿内容 / 補足 / ブックマーク / シェア
          </p>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-[#1d9bf0] transition-colors"
        >
          <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-gray-500">
            {file ? file.name : "CSVファイルを選択 or ドラッグ"}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="w-full bg-[#1d9bf0] text-white font-bold py-3 rounded-lg hover:bg-[#1a8cd8] disabled:opacity-50 transition-colors"
        >
          {loading ? "インポート中..." : "インポート実行"}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
          <h2 className="text-sm font-bold">インポート結果</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-green-50 rounded-lg">
              <p className="text-lg font-bold text-green-600">{result.success}</p>
              <p className="text-xs text-green-600">成功</p>
            </div>
            <div className="text-center p-2 bg-yellow-50 rounded-lg">
              <p className="text-lg font-bold text-yellow-600">{result.skipped}</p>
              <p className="text-xs text-yellow-600">スキップ</p>
            </div>
            <div className="text-center p-2 bg-red-50 rounded-lg">
              <p className="text-lg font-bold text-red-600">{result.errors}</p>
              <p className="text-xs text-red-600">エラー</p>
            </div>
          </div>
          {result.details.length > 0 && (
            <div className="text-xs text-red-500 space-y-1 mt-2">
              {result.details.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
