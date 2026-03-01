import * as cheerio from "cheerio";
import type { PriceResult } from "../types";

const YAHOO_CLOSED_URL =
  "https://auctions.yahoo.co.jp/closedsearch/closedsearch";

export async function searchYahooAuctionClosed(
  keyword: string,
  limit: number = 30
): Promise<PriceResult[]> {
  try {
    const params = new URLSearchParams({
      p: keyword,
      n: String(Math.min(limit, 100)),
      auccat: "",
      tab_ex: "commerce",
      ei: "utf-8",
      aq: "-1",
      oq: "",
      sc_i: "",
      exflg: "1",
      b: "1",
      istatus: "0",
      select: "0",
    });

    const url = `${YAHOO_CLOSED_URL}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Yahoo Auction error: ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: PriceResult[] = [];

    $(".Product").each((_, el) => {
      const $el = $(el);
      const name =
        $el.find(".Product__titleLink").text().trim() ||
        $el.find("a[data-auction-title]").text().trim();
      const priceText =
        $el.find(".Product__priceValue").text().trim() ||
        $el.find(".Product__price .u-textRed").text().trim();
      const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10);
      const href =
        $el.find(".Product__titleLink").attr("href") ||
        $el.find("a[data-auction-title]").attr("href") ||
        "";
      const bidsText = $el.find(".Product__bid").text().trim();
      const bids = parseInt(bidsText.replace(/[^0-9]/g, ""), 10) || 0;
      const dateText = $el.find(".Product__time").text().trim();

      if (name && !isNaN(price)) {
        results.push({
          name,
          price,
          status: "closed",
          date: dateText || undefined,
          url: href || undefined,
          bids,
          source: "yahoo_auction",
        });
      }
    });

    return results.slice(0, limit);
  } catch (error) {
    console.error("Yahoo Auction scraping failed:", error);
    return [];
  }
}
