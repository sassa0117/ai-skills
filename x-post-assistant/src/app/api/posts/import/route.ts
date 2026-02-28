import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { parseXAnalyticsCSV } from "@/lib/csv-parser";
import { detectIp } from "@/lib/ip-detector";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseXAnalyticsCSV(text);

  if (parsed.length === 0) {
    return NextResponse.json({ error: "有効なデータがありません" }, { status: 400 });
  }

  // IP判定用のキーワード取得
  const keywords = await prisma.ipKeyword.findMany({
    include: { franchise: true },
  });

  let success = 0;
  let skipped = 0;
  const errors: string[] = [];

  // 全ポストの平均インプレッション（リライト候補判定用）
  const allPosts = await prisma.post.findMany({
    where: { status: "published", algorithmEra: "pre_grok" },
    select: { impressions: true },
  });
  const avgPreGrokImp =
    allPosts.length > 0
      ? allPosts.reduce((s, p) => s + p.impressions, 0) / allPosts.length
      : 0;

  for (const p of parsed) {
    try {
      // 重複チェック
      if (p.postUrl) {
        const existing = await prisma.post.findUnique({
          where: { postUrl: p.postUrl },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // IP自動判定
      const detected = detectIp(p.content, keywords);

      await prisma.post.create({
        data: {
          postUrl: p.postUrl,
          postDate: p.postDate,
          impressions: p.impressions,
          likes: p.likes,
          replies: p.replies,
          reposts: p.reposts,
          profileClicks: p.profileClicks,
          linkClicks: p.linkClicks,
          followerDelta: p.followerDelta,
          engagementRate: p.engagementRate,
          videoViews: p.videoViews,
          bookmarks: p.bookmarks,
          shares: p.shares,
          content: p.content,
          supplement: p.supplement,
          progressionType: p.progressionType,
          algorithmEra: p.algorithmEra,
          bookmarkRate: p.bookmarkRate,
          franchiseId: detected?.franchiseId || null,
          isRewriteCandidate:
            p.algorithmEra === "pre_grok" && p.impressions > avgPreGrokImp * 1.5,
          status: "published",
        },
      });
      success++;
    } catch (e) {
      errors.push(`行: ${p.content?.substring(0, 30)}... - ${e}`);
    }
  }

  return NextResponse.json({ success, skipped, errors: errors.length, details: errors });
}
