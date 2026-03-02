import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  analyzeDayOfWeek,
  analyzeIpRotation,
  analyzeFrequency,
  generateRecommendations,
} from "@/lib/analyzer";

export async function GET() {
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    include: { franchise: true },
    orderBy: { postDate: "desc" },
  });

  const dayOfWeekStats = analyzeDayOfWeek(posts);
  const ipRotation = analyzeIpRotation(posts);
  const frequency = analyzeFrequency(posts);
  const recommendations = generateRecommendations(
    posts,
    dayOfWeekStats,
    ipRotation,
    frequency
  );

  // 3ヶ月以上前の高パフォーマンスポスト → リメイク候補
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // 同じIPで最近（3ヶ月以内）投稿があるIP → リメイク済みとみなす
  const recentPostsByFranchise = new Set<string>();
  for (const p of posts) {
    if (p.franchiseId && p.postDate && new Date(p.postDate) >= threeMonthsAgo) {
      recentPostsByFranchise.add(p.franchiseId);
    }
  }

  // 内容の類似チェック用: 最近のポストのキーワード
  const recentContentWords = posts
    .filter((p) => p.postDate && new Date(p.postDate) >= threeMonthsAgo)
    .map((p) => p.content.toLowerCase());

  function isLikelyRemade(oldPost: typeof posts[0]): boolean {
    // 同じIPで最近のポストがあればリメイク済み
    if (oldPost.franchiseId && recentPostsByFranchise.has(oldPost.franchiseId)) {
      return true;
    }
    // IPなしでも、本文から主要キーワード（商品名等）を抽出して類似チェック
    const keywords = oldPost.content
      .replace(/[！!？?。、\n\r]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 5);
    if (keywords.length > 0) {
      for (const recent of recentContentWords) {
        const matchCount = keywords.filter((kw) => recent.includes(kw.toLowerCase())).length;
        if (matchCount >= 2) return true;
      }
    }
    return false;
  }

  const remakeCandidates = posts
    .filter(
      (p) =>
        p.postDate &&
        new Date(p.postDate) < threeMonthsAgo &&
        p.impressions > 5000 &&
        !isLikelyRemade(p)
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      content: p.content,
      impressions: p.impressions,
      postDate: p.postDate,
      franchise: p.franchise,
      daysSincePost: Math.floor(
        (Date.now() - new Date(p.postDate!).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

  // 未使用の商材ストック
  const unusedStocks = await prisma.productStock.findMany({
    where: { used: false },
    include: { franchise: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    recommendations,
    dayOfWeekStats,
    ipRotation,
    frequency,
    totalPosts: posts.length,
    remakeCandidates,
    unusedStocks,
  });
}
