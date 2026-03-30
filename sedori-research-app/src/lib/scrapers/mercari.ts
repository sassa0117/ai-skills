import generateMercariJwt from "generate-mercari-jwt";
import type { PriceResult } from "../types";

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";
const MERCARI_ITEM_URL = "https://api.mercari.jp/items/get";

interface MercariItem {
  id: string;
  name: string;
  price: number | string;
  status: string;
  created: number;
  updated: number;
  thumbnails: string[];
  photos: { uri: string }[];
  itemConditionId: number;
  categoryId: string;
  shippingPayerId: string;
  shippingMethodId: string;
}

interface MercariSearchResponse {
  items: MercariItem[];
  meta: {
    nextPageToken: string;
    numFound: number;
  };
}

// 検索結果（フル情報）
export interface MercariSearchItem {
  id: string;
  name: string;
  price: number;
  thumbnail: string;
  photos: string[];
  date: string;
  url: string;
  itemConditionId: number;
  categoryId: string;
  shippingPayerId: string;
  shippingMethodId: string;
}

// 商品詳細
export interface MercariItemDetail {
  id: string;
  name: string;
  price: number;
  description: string;
  photos: string[];
  condition: string;
  category: string;
  shippingMethod: string;
  shippingPayer: string;
  shippingFromArea: string;
  sellerName: string;
  sellerRating: number;
  numLikes: number;
  numComments: number;
  comments: { userName: string; message: string; created: number }[];
  created: number;
  updated: number;
  status: string;
}

// sold検索（サムネ付き）
export async function searchMercariSoldWithThumbnails(
  keyword: string,
  limit: number = 30
): Promise<MercariSearchItem[]> {
  try {
    const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");

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

    const response = await fetch(MERCARI_SEARCH_URL, {
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
      id: item.id,
      name: item.name,
      price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
      thumbnail: item.thumbnails?.[0] || "",
      photos: (item.photos || []).map((p) => p.uri),
      date: new Date(item.updated * 1000).toISOString().split("T")[0],
      url: `https://jp.mercari.com/item/${item.id}`,
      itemConditionId: item.itemConditionId || 0,
      categoryId: item.categoryId || "",
      shippingPayerId: item.shippingPayerId || "",
      shippingMethodId: item.shippingMethodId || "",
    }));
  } catch (error) {
    console.error("Mercari search failed:", error);
    return [];
  }
}

// 商品詳細取得
export async function getMercariItemDetail(
  itemId: string
): Promise<MercariItemDetail | null> {
  try {
    const url = `${MERCARI_ITEM_URL}?id=${itemId}`;
    const dpop = await generateMercariJwt(url, "GET");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        DPoP: dpop,
        "X-Platform": "web",
      },
    });

    if (!response.ok) {
      throw new Error(`Mercari item API error: ${response.status}`);
    }

    const data = await response.json();
    const item = data.data || data.result || data;

    return {
      id: item.id || itemId,
      name: item.name || "",
      price: item.price || 0,
      description: item.description || "",
      photos: item.photos || item.thumbnails || [],
      condition: item.item_condition?.name || item.itemCondition?.name || "",
      category: item.item_category?.name || item.category?.name || "",
      shippingMethod: item.shipping_method?.name || "",
      shippingPayer: item.shipping_payer?.name || "",
      shippingFromArea: item.shipping_from_area?.name || "",
      sellerName: item.seller?.name || "",
      sellerRating: item.seller?.star_rating_score || item.seller?.ratings?.good || 0,
      numLikes: item.num_likes || 0,
      numComments: item.num_comments || 0,
      comments: (item.comments || []).map((c: { user?: { name?: string }; message?: string; created?: number }) => ({
        userName: c.user?.name || "",
        message: c.message || "",
        created: c.created || 0,
      })),
      created: item.created || 0,
      updated: item.updated || 0,
      status: item.status || "",
    };
  } catch (error) {
    console.error("Mercari item detail failed:", error);
    return null;
  }
}

// 既存の関数（後方互換）
export async function searchMercariSold(
  keyword: string,
  limit: number = 30
): Promise<PriceResult[]> {
  try {
    const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");

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

    const response = await fetch(MERCARI_SEARCH_URL, {
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
      price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
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
