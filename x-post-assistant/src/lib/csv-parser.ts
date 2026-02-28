import { getAlgorithmEra } from "./constants";

export interface ParsedPost {
  postDate: Date | null;
  postUrl: string | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  profileClicks: number;
  linkClicks: number;
  followerDelta: number;
  engagementRate: number;
  videoViews: number;
  bookmarks: number;
  shares: number;
  content: string;
  supplement: string | null;
  progressionType: string | null;
  algorithmEra: string | null;
  bookmarkRate: number | null;
}

const PROGRESSION_MAP: Record<string, string> = {
  "初速型": "initial",
  "遅延型": "delayed",
  "二峰型": "dual_peak",
  "超初速型": "ultra_initial",
  "低調型": "low",
  "持続型": "sustained",
};

function parseNum(s: string): number {
  const trimmed = s.trim().replace(/,/g, "").replace(/%/g, "");
  if (trimmed.endsWith("M")) return parseFloat(trimmed) * 1_000_000;
  if (trimmed.endsWith("K")) return parseFloat(trimmed) * 1_000;
  if (trimmed.endsWith("万")) return parseFloat(trimmed) * 10_000;
  return parseFloat(trimmed) || 0;
}

export function parseXAnalyticsCSV(text: string): ParsedPost[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // 区切り文字を自動判定（タブ or カンマ）
  const separator = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(separator).map((h) => h.trim());
  const posts: ParsedPost[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(separator);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").trim();
    });

    const postDate = row["日付"] ? new Date(row["日付"]) : null;
    const impressions = parseNum(row["インプレッション"] || "0");
    const bm = parseNum(row["ブックマーク"] || "0");

    posts.push({
      postDate,
      postUrl: row["ポストURL"] || null,
      impressions,
      likes: parseNum(row["いいね"] || "0"),
      replies: parseNum(row["リプライ"] || "0"),
      reposts: parseNum(row["リポスト"] || "0"),
      profileClicks: parseNum(row["プロフクリック"] || "0"),
      linkClicks: parseNum(row["リンククリック"] || "0"),
      followerDelta: parseNum(row["フォロワー増減"] || "0"),
      engagementRate: parseNum(row["エンゲ率"] || "0"),
      videoViews: parseNum(row["動画再生"] || "0"),
      bookmarks: bm,
      shares: parseNum(row["シェア"] || "0"),
      content: row["投稿内容"] || "",
      supplement: row["補足"] || null,
      progressionType: PROGRESSION_MAP[row["推移型"]] || row["推移型"] || null,
      algorithmEra: postDate ? getAlgorithmEra(postDate) : null,
      bookmarkRate: impressions > 0 ? (bm / impressions) * 100 : null,
    });
  }

  return posts;
}
