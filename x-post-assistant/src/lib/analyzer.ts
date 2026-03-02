import { ALGORITHM_ERAS } from "./constants";

interface PostData {
  id: string;
  content: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  bookmarks: number;
  engagementRate: number;
  bookmarkRate: number | null;
  progressionType: string | null;
  postType: string | null;
  algorithmEra: string | null;
  postDate: Date | null;
  franchiseId: string | null;
  franchise: { id: string; name: string; tier: string } | null;
  productName: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  isRewriteCandidate: boolean;
}

// === 曜日別パフォーマンス ===
export interface DayOfWeekStats {
  day: number; // 0=日, 1=月, ...6=土
  dayLabel: string;
  postCount: number;
  avgImpressions: number;
  avgEngagement: number;
  bestPostType: string | null; // mega_buzz or mid_tier
  topIpTier: string | null;
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function analyzeDayOfWeek(posts: PostData[]): DayOfWeekStats[] {
  const buckets = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    dayLabel: DAY_LABELS[i],
    posts: [] as PostData[],
  }));

  for (const p of posts) {
    if (p.postDate) {
      const dow = new Date(p.postDate).getDay();
      buckets[dow].posts.push(p);
    }
  }

  return buckets.map((b) => {
    const count = b.posts.length;
    if (count === 0) {
      return {
        day: b.day,
        dayLabel: b.dayLabel,
        postCount: 0,
        avgImpressions: 0,
        avgEngagement: 0,
        bestPostType: null,
        topIpTier: null,
      };
    }

    const avgImp = Math.round(b.posts.reduce((s, p) => s + p.impressions, 0) / count);
    const avgEng = b.posts.reduce((s, p) => s + p.engagementRate, 0) / count;

    // この曜日で最もimpが高いpostType
    const typeMap = new Map<string, number[]>();
    for (const p of b.posts) {
      if (p.postType) {
        if (!typeMap.has(p.postType)) typeMap.set(p.postType, []);
        typeMap.get(p.postType)!.push(p.impressions);
      }
    }
    let bestPostType: string | null = null;
    let bestTypeAvg = 0;
    for (const [type, imps] of typeMap) {
      const avg = imps.reduce((a, b) => a + b, 0) / imps.length;
      if (avg > bestTypeAvg) {
        bestTypeAvg = avg;
        bestPostType = type;
      }
    }

    // この曜日で最もimpが高いIPティア
    const tierMap = new Map<string, number[]>();
    for (const p of b.posts) {
      if (p.franchise) {
        if (!tierMap.has(p.franchise.tier)) tierMap.set(p.franchise.tier, []);
        tierMap.get(p.franchise.tier)!.push(p.impressions);
      }
    }
    let topIpTier: string | null = null;
    let topTierAvg = 0;
    for (const [tier, imps] of tierMap) {
      const avg = imps.reduce((a, b) => a + b, 0) / imps.length;
      if (avg > topTierAvg) {
        topTierAvg = avg;
        topIpTier = tier;
      }
    }

    return {
      day: b.day,
      dayLabel: b.dayLabel,
      postCount: count,
      avgImpressions: avgImp,
      avgEngagement: avgEng,
      bestPostType,
      topIpTier,
    };
  });
}

// === IP投稿ローテーション分析 ===
export interface IpRotationStats {
  franchiseId: string;
  name: string;
  tier: string;
  totalPosts: number;
  avgImpressions: number;
  lastPostedDate: Date | null;
  daysSinceLastPost: number;
  avgDaysBetweenPosts: number;
  isOverdue: boolean; // 平均間隔を超えてるか
  performanceTrend: "rising" | "falling" | "stable"; // 直近3件 vs 全体
}

export function analyzeIpRotation(posts: PostData[]): IpRotationStats[] {
  const now = new Date();
  const ipMap = new Map<string, PostData[]>();

  for (const p of posts) {
    if (p.franchise && p.postDate) {
      const key = p.franchise.id;
      if (!ipMap.has(key)) ipMap.set(key, []);
      ipMap.get(key)!.push(p);
    }
  }

  const results: IpRotationStats[] = [];

  for (const [fId, ipPosts] of ipMap) {
    const sorted = ipPosts.sort(
      (a, b) => new Date(a.postDate!).getTime() - new Date(b.postDate!).getTime()
    );
    const franchise = sorted[0].franchise!;
    const totalPosts = sorted.length;
    const avgImp = Math.round(sorted.reduce((s, p) => s + p.impressions, 0) / totalPosts);

    const lastDate = new Date(sorted[sorted.length - 1].postDate!);
    const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    // 投稿間隔の平均
    let avgDays = 0;
    if (sorted.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const diff =
          new Date(sorted[i].postDate!).getTime() -
          new Date(sorted[i - 1].postDate!).getTime();
        gaps.push(diff / (1000 * 60 * 60 * 24));
      }
      avgDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }

    // パフォーマンストレンド（直近3件 vs 全体平均）
    let trend: "rising" | "falling" | "stable" = "stable";
    if (sorted.length >= 4) {
      const recent3 = sorted.slice(-3);
      const recentAvg = recent3.reduce((s, p) => s + p.impressions, 0) / 3;
      const ratio = recentAvg / avgImp;
      if (ratio > 1.3) trend = "rising";
      else if (ratio < 0.7) trend = "falling";
    }

    results.push({
      franchiseId: fId,
      name: franchise.name,
      tier: franchise.tier,
      totalPosts,
      avgImpressions: avgImp,
      lastPostedDate: lastDate,
      daysSinceLastPost: daysSince,
      avgDaysBetweenPosts: avgDays,
      isOverdue: avgDays > 0 && daysSince > avgDays * 1.5,
      performanceTrend: trend,
    });
  }

  return results.sort((a, b) => b.avgImpressions - a.avgImpressions);
}

// === 投稿頻度分析 ===
export interface FrequencyStats {
  postsPerWeek: number;
  postsPerMonth: number;
  mostActiveDay: string;
  leastActiveDay: string;
  currentStreak: number; // 連続投稿日数
  lastPostDate: Date | null;
  daysSinceLastPost: number;
}

export function analyzeFrequency(posts: PostData[]): FrequencyStats {
  const now = new Date();
  const withDate = posts.filter((p) => p.postDate).sort(
    (a, b) => new Date(b.postDate!).getTime() - new Date(a.postDate!).getTime()
  );

  if (withDate.length === 0) {
    return {
      postsPerWeek: 0,
      postsPerMonth: 0,
      mostActiveDay: "-",
      leastActiveDay: "-",
      currentStreak: 0,
      lastPostDate: null,
      daysSinceLastPost: 0,
    };
  }

  const first = new Date(withDate[withDate.length - 1].postDate!);
  const last = new Date(withDate[0].postDate!);
  const totalDays = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(1, totalDays / 7);
  const totalMonths = Math.max(1, totalDays / 30);

  // 曜日カウント
  const dayCounts = new Array(7).fill(0);
  for (const p of withDate) {
    dayCounts[new Date(p.postDate!).getDay()]++;
  }
  const maxDay = dayCounts.indexOf(Math.max(...dayCounts));
  const minDay = dayCounts.indexOf(Math.min(...dayCounts));

  // 連続投稿
  let streak = 0;
  const dateSet = new Set(
    withDate.map((p) => new Date(p.postDate!).toISOString().slice(0, 10))
  );
  const today = now.toISOString().slice(0, 10);
  let checkDate = new Date(now);
  // 今日から遡って連続日数をカウント
  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (dateSet.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dateStr === today) {
      // 今日まだ投稿してないなら昨日から
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  const daysSince = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    postsPerWeek: Math.round((withDate.length / totalWeeks) * 10) / 10,
    postsPerMonth: Math.round((withDate.length / totalMonths) * 10) / 10,
    mostActiveDay: DAY_LABELS[maxDay],
    leastActiveDay: DAY_LABELS[minDay],
    currentStreak: streak,
    lastPostDate: last,
    daysSinceLastPost: daysSince,
  };
}

// === 今日のおすすめ生成 ===
export interface Recommendation {
  type: "post_type" | "ip_rotation" | "rewrite" | "frequency" | "trend";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestedPostType: string | null;
  suggestedIp: { name: string; tier: string } | null;
  rewritePostId: string | null;
  reasoning: string;
}

export function generateRecommendations(
  posts: PostData[],
  dayOfWeekStats: DayOfWeekStats[],
  ipRotation: IpRotationStats[],
  frequency: FrequencyStats
): Recommendation[] {
  const recs: Recommendation[] = [];
  const now = new Date();
  const today = now.getDay(); // 0=日...6=土
  const todayStats = dayOfWeekStats[today];

  // 1. 曜日ベースの推奨ポストタイプ
  if (todayStats && todayStats.postCount > 0) {
    const typeLabel =
      todayStats.bestPostType === "mega_buzz"
        ? "大バズ狙い"
        : todayStats.bestPostType === "mid_tier"
        ? "中間安定型"
        : todayStats.bestPostType || "不明";

    recs.push({
      type: "post_type",
      priority: "high",
      title: `${DAY_LABELS[today]}曜日は「${typeLabel}」が強い`,
      description: `過去${todayStats.postCount}件の${DAY_LABELS[today]}曜投稿で平均${todayStats.avgImpressions.toLocaleString()}imp。${typeLabel}の成績が最も良い`,
      suggestedPostType: todayStats.bestPostType,
      suggestedIp: null,
      rewritePostId: null,
      reasoning: `曜日別パフォーマンス分析に基づく`,
    });
  }

  // x-strategy.mdのスケジュールとの照合
  const dayOfWeek = now.getDay();
  if ([1, 3, 5].includes(dayOfWeek)) {
    // 月水金 = mid_tier
    recs.push({
      type: "post_type",
      priority: "medium",
      title: "戦略スケジュール: 中間安定型の日",
      description:
        "x-strategyの推奨スケジュールでは月/水/金は中間安定型（まとめ系）ポストの日",
      suggestedPostType: "mid_tier",
      suggestedIp: null,
      rewritePostId: null,
      reasoning: "x-strategy.mdの週間スケジュールに基づく",
    });
  } else if ([2, 4].includes(dayOfWeek)) {
    // 火木 = mega_buzz
    recs.push({
      type: "post_type",
      priority: "medium",
      title: "戦略スケジュール: 大バズ狙いの日",
      description:
        "x-strategyの推奨スケジュールでは火/木はS/AティアIPの大バズ狙いポストの日",
      suggestedPostType: "mega_buzz",
      suggestedIp: null,
      rewritePostId: null,
      reasoning: "x-strategy.mdの週間スケジュールに基づく",
    });
  } else {
    // 土日 = 分析・リライト
    recs.push({
      type: "post_type",
      priority: "medium",
      title: "戦略スケジュール: 分析・リライト企画の日",
      description:
        "x-strategyの推奨スケジュールでは土/日はデータ分析とリライト候補の選定に充てる日",
      suggestedPostType: null,
      suggestedIp: null,
      rewritePostId: null,
      reasoning: "x-strategy.mdの週間スケジュールに基づく",
    });
  }

  // 2. IPローテーション（投稿間隔が空いてるIP）
  const overdueIps = ipRotation.filter((ip) => ip.isOverdue);
  for (const ip of overdueIps.slice(0, 3)) {
    recs.push({
      type: "ip_rotation",
      priority: ip.tier === "S" || ip.tier === "A" ? "high" : "medium",
      title: `${ip.name}（${ip.tier}ティア）が${ip.daysSinceLastPost}日間空いてる`,
      description: `平均投稿間隔${ip.avgDaysBetweenPosts}日に対して${ip.daysSinceLastPost}日経過。平均${ip.avgImpressions.toLocaleString()}imp`,
      suggestedPostType: ip.tier === "S" ? "mega_buzz" : "mid_tier",
      suggestedIp: { name: ip.name, tier: ip.tier },
      rewritePostId: null,
      reasoning: `IP投稿ローテーション分析。${
        ip.performanceTrend === "rising"
          ? "直近パフォーマンス上昇中"
          : ip.performanceTrend === "falling"
          ? "直近パフォーマンス下降気味 → 切り口変更推奨"
          : "パフォーマンス安定"
      }`,
    });
  }

  // ローテーションが空いてなくても、パフォーマンス上昇中のIPを推奨
  const risingIps = ipRotation.filter(
    (ip) => ip.performanceTrend === "rising" && !ip.isOverdue
  );
  for (const ip of risingIps.slice(0, 2)) {
    recs.push({
      type: "trend",
      priority: "medium",
      title: `${ip.name}が上昇トレンド`,
      description: `直近のパフォーマンスが全体平均を上回っている。今が攻め時`,
      suggestedPostType: null,
      suggestedIp: { name: ip.name, tier: ip.tier },
      rewritePostId: null,
      reasoning: "直近3件のimp平均が全体平均の1.3倍以上",
    });
  }

  // 3. リライト候補
  const rewriteCandidates = posts
    .filter((p) => p.isRewriteCandidate)
    .sort((a, b) => b.impressions - a.impressions);

  if (rewriteCandidates.length > 0) {
    const top = rewriteCandidates[0];
    recs.push({
      type: "rewrite",
      priority: "medium",
      title: "リライト候補あり",
      description: `「${top.content.substring(0, 40)}...」(${top.impressions.toLocaleString()}imp) を新アルゴリズム向けにリライト`,
      suggestedPostType: null,
      suggestedIp: top.franchise
        ? { name: top.franchise.name, tier: top.franchise.tier }
        : null,
      rewritePostId: top.id,
      reasoning: `旧アルゴ時代の高パフォーマンス投稿。Grok時代に画像変更+フレーズ追加で再投入`,
    });
  }

  // 4. 投稿頻度アラート
  if (frequency.daysSinceLastPost >= 3) {
    recs.push({
      type: "frequency",
      priority: "high",
      title: `${frequency.daysSinceLastPost}日間投稿なし`,
      description: `平均${frequency.postsPerWeek}件/週のペース。アルゴリズム的にも間が空くとリーチが落ちる`,
      suggestedPostType: "mid_tier",
      suggestedIp: null,
      rewritePostId: null,
      reasoning: "投稿頻度分析。Grokアルゴリズムは直近15分のRecencyを重視",
    });
  }

  // priorityでソート (high > medium > low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs;
}
