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

  const remakeCandidates = posts
    .filter(
      (p) =>
        p.postDate &&
        new Date(p.postDate) < threeMonthsAgo &&
        p.impressions > 5000
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
