import * as cheerio from "cheerio";
import type { PriceResult } from "../types";

const SURUGAYA_SEARCH_URL = "https://www.suruga-ya.jp/search";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function searchSurugaya(
  keyword: string,
  limit: number = 24
): Promise<PriceResult[]> {
  try {
    const params = new URLSearchParams({
      search_word: keyword,
      searchbox: "1",
    });

    const response = await fetch(`${SURUGAYA_SEARCH_URL}?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Surugaya error: ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const results: PriceResult[] = [];

    $("#search_result .item").each((i, el) => {
      if (results.length >= limit) return false;

      const $item = $(el);

      // 商品名
      const name = $item.find(".item_detail .title h3.product-name").text().trim();
      if (!name) return;

      // URL
      const urlPath = $item.find(".item_detail .title a").attr("href") || "";
      const url = urlPath.startsWith("http")
        ? urlPath
        : `https://www.suruga-ya.jp${urlPath}`;

      // 価格（税込）
      const priceArea = $item.find(".item_price");
      let price = 0;

      // 販売価格を取得（span.text-red > strong）
      const sellingPriceText = priceArea
        .find(".price_teika span.text-red strong")
        .first()
        .text()
        .trim();
      if (sellingPriceText) {
        price = parseInt(sellingPriceText.replace(/[^\d]/g, ""), 10);
      }

      // 品切れチェック
      const soldOutText = priceArea.find("p.price").text().trim();
      const isSoldOut = soldOutText === "品切れ";

      // マケプレ価格（品切れの場合のフォールバック）
      if (!price || isSoldOut) {
        const mpPriceText = priceArea
          .find(".makeplaTit span.text-red strong")
          .text()
          .trim();
        if (mpPriceText) {
          price = parseInt(mpPriceText.replace(/[^\d]/g, ""), 10);
        }
      }

      if (!price) return;

      results.push({
        name,
        price,
        status: isSoldOut ? "sold" : "on_sale",
        url,
        source: "surugaya",
      });
    });

    return results;
  } catch (error) {
    console.error("Surugaya scraping failed:", error);
    return [];
  }
}
