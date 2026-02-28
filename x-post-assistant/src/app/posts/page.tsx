"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatNumber, formatDate } from "@/lib/utils";
import { PROGRESSION_TYPES } from "@/lib/constants";

interface Post {
  id: string;
  content: string;
  impressions: number;
  likes: number;
  reposts: number;
  bookmarks: number;
  bookmarkRate: number | null;
  progressionType: string | null;
  algorithmEra: string | null;
  postDate: string | null;
  status: string;
  franchise: { name: string; tier: string } | null;
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/posts?search=${encodeURIComponent(search)}&status=published&sortBy=impressions&sortOrder=desc`)
      .then((r) => r.json())
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ポスト一覧</h1>
        <Link
          href="/posts/import"
          className="bg-[#1d9bf0] text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#1a8cd8]"
        >
          CSVインポート
        </Link>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ポスト内容で検索..."
        className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1d9bf0] focus:outline-none"
      />

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-20 shadow-sm" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
          <p>ポストがありません</p>
          <Link href="/posts/import" className="text-[#1d9bf0] text-sm mt-2 inline-block">
            CSVインポートする
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <div key={post.id} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm line-clamp-2">{post.content}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {post.franchise && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                        post.franchise.tier === "S" ? "bg-red-100 text-red-700" :
                        post.franchise.tier === "A" ? "bg-orange-100 text-orange-700" :
                        post.franchise.tier === "B" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {post.franchise.tier} {post.franchise.name}
                      </span>
                    )}
                    {post.progressionType && PROGRESSION_TYPES[post.progressionType] && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PROGRESSION_TYPES[post.progressionType].bg} ${PROGRESSION_TYPES[post.progressionType].color}`}>
                        {PROGRESSION_TYPES[post.progressionType].label}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {post.postDate ? formatDate(post.postDate) : "日付なし"}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{formatNumber(post.impressions)}</p>
                  <p className="text-xs text-gray-400">imp</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
