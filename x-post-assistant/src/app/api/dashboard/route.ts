import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    include: { franchise: true },
    orderBy: { impressions: "desc" },
  });

  const totalPosts = posts.length;
  const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
  const avgImpressions = totalPosts > 0 ? Math.round(totalImpressions / totalPosts) : 0;
  const avgEngagementRate =
    totalPosts > 0
      ? posts.reduce((s, p) => s + p.engagementRate, 0) / totalPosts
      : 0;

  const topPosts = posts.slice(0, 5).map((p) => ({
    id: p.id,
    content: p.content,
    impressions: p.impressions,
    bookmarkRate: p.bookmarkRate,
    postDate: p.postDate?.toISOString() || null,
  }));

  // IPティア別集計
  const tierMap = new Map<string, { count: number; totalImp: number }>();
  for (const p of posts) {
    if (p.franchise) {
      const tier = p.franchise.tier;
      const cur = tierMap.get(tier) || { count: 0, totalImp: 0 };
      cur.count++;
      cur.totalImp += p.impressions;
      tierMap.set(tier, cur);
    }
  }
  const tierBreakdown = Array.from(tierMap.entries())
    .map(([tier, d]) => ({
      tier,
      count: d.count,
      avgImp: Math.round(d.totalImp / d.count),
    }))
    .sort((a, b) => b.avgImp - a.avgImp);

  const rewriteCandidates = posts.filter((p) => p.isRewriteCandidate).length;

  return NextResponse.json({
    totalPosts,
    totalImpressions,
    avgImpressions,
    avgEngagementRate,
    topPosts,
    tierBreakdown,
    rewriteCandidates,
  });
}
