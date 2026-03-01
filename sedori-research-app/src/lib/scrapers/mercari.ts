import generateMercariJwt from "generate-mercari-jwt";
import type { PriceResult } from "../types";

const MERCARI_API_URL = "https://api.mercari.jp/v2/entities:search";

interface MercariItem {
  id: string;
  name: string;
  price: number;
  status: string;
  created: number;
  updated: number;
  thumbnails: string[];
  itemConditionId: number;
}

interface MercariSearchResponse {
  items: MercariItem[];
  meta: {
    nextPageToken: string;
    numFound: number;
  };
}

export async function searchMercariSold(
  keyword: string,
  limit: number = 30
): Promise<PriceResult[]> {
  try {
    const dpop = await generateMercariJwt(MERCARI_API_URL, "POST");

    const body = {
      searchSessionId: crypto.randomUUID(),
      pageSize: Math.min(limit, 120),
      searchCondition: {
        keyword,
        sort: "SORT_CREATED_TIME",
        order: "ORDER_DESC",
        status: ["STATUS_SOLD_OUT"],
      },
    };

    const response = await fetch(MERCARI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        DPoP: dpop,
        "X-Platform": "web",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Mercari API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as MercariSearchResponse;

    if (!data.items || data.items.length === 0) {
      return [];
    }

    return data.items.map((item) => ({
      name: item.name,
      price: item.price,
      status: "sold" as const,
      date: new Date(item.updated * 1000).toISOString().split("T")[0],
      url: `https://jp.mercari.com/item/${item.id}`,
      source: "mercari" as const,
    }));
  } catch (error) {
    console.error("Mercari scraping failed:", error);
    return [];
  }
}
