import type { PriceResult } from "../types";

const SNVA_BASE = "https://lashinbang-f-s.snva.jp/";

interface LashinbangItem {
  itemid: string;
  title: string;
  price: number;
  url?: string;
  image?: string;
  desc?: string; // condition: "未開封" / "A" / "B"
  narrow2?: string; // maker
  narrow3?: string; // series
  narrow5?: string; // category
  narrow6?: string; // subcategory
  keyword2?: string; // JAN code
  keyword9?: string; // store
  number3?: number; // release date YYYYMMDD
  number6?: number; // stock quantity
  number7?: number; // price update date YYYYMMDD
}

interface LashinbangResponse {
  kotohaco: {
    result: {
      info: {
        hitnum: number;
        current_page: number;
        last_page: number;
      };
      items: LashinbangItem[];
    };
  };
}

export async function searchLashinbang(
  keyword: string,
  limit: number = 30
): Promise<PriceResult[]> {
  try {
    const params = new URLSearchParams({
      q: keyword,
      limit: String(Math.min(limit, 100)),
      o: "0",
      n6l: "0", // include sold-out items too
      sort: "Score,Number7",
      callback: "callback",
      controller: "lashinbang_front",
    });

    const response = await fetch(`${SNVA_BASE}?${params}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://shop.lashinbang.com/products/list",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Lashinbang API error: ${response.status} ${response.statusText}`
      );
    }

    const text = await response.text();

    // JSONP wrapper を除去: callback({...});
    const jsonStr = text.replace(/^callback\(/, "").replace(/\);?$/, "");
    const data = JSON.parse(jsonStr) as LashinbangResponse;

    const items = data.kotohaco?.result?.items;
    if (!items || items.length === 0) {
      return [];
    }

    return items.map((item) => {
      const inStock = (item.number6 ?? 0) > 0;

      return {
        name: item.title,
        price: item.price,
        status: inStock ? ("on_sale" as const) : ("sold" as const),
        url:
          item.url ||
          `https://shop.lashinbang.com/products/detail/${item.itemid}`,
        condition: item.desc || undefined,
        source: "lashinbang" as const,
      };
    });
  } catch (error) {
    console.error("Lashinbang scraping failed:", error);
    return [];
  }
}
