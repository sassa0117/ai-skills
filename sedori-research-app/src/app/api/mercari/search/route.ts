import { NextRequest, NextResponse } from "next/server";
import { searchMercariSoldWithThumbnails } from "@/lib/scrapers/mercari";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);

  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const items = await searchMercariSoldWithThumbnails(keyword, limit);
  return NextResponse.json({ items });
}
