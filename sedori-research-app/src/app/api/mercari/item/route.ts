import { NextRequest, NextResponse } from "next/server";
import { searchMercariSoldWithThumbnails } from "@/lib/scrapers/mercari";

// 検索APIで該当商品を含む結果から1件取得
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const keyword = request.nextUrl.searchParams.get("keyword") || "";

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // キーワードがあれば検索して該当IDを探す
  if (keyword) {
    const items = await searchMercariSoldWithThumbnails(keyword, 120);
    const found = items.find((item) => item.id === id);
    if (found) {
      return NextResponse.json(found);
    }
  }

  return NextResponse.json({ error: "Item not found" }, { status: 404 });
}
