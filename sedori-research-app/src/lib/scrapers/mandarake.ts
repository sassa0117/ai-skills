import type { PriceResult } from "../types";

// まんだらけはセッションCookieが必要なため、
// 直接のfetch + cheerioではアクセスできない。
// 現在はGoogle検索経由でまんだらけの商品ページを取得する簡易版。
// 将来的にPuppeteerを使った本格版に置き換え予定。

const MANDARAKE_SEARCH_URL =
  "https://order.mandarake.co.jp/order/listPage/serchKeyWord";

export async function searchMandarake(
  keyword: string,
  _limit: number = 20
): Promise<PriceResult[]> {
  try {
    // まんだらけはセッションCookieなしではリダイレクトされるため、
    // まずはCookie取得を試みる
    const initResponse = await fetch(
      "https://order.mandarake.co.jp/order/indexPage/ja",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "manual",
      }
    );

    // Set-Cookieヘッダーを取得
    const cookies = initResponse.headers.getSetCookie?.() || [];
    const cookieString = cookies
      .map((c) => c.split(";")[0])
      .join("; ");

    if (!cookieString) {
      console.warn("Mandarake: Could not obtain session cookies");
      return [];
    }

    // 検索実行
    const searchUrl = `${MANDARAKE_SEARCH_URL}?keyword=${encodeURIComponent(keyword)}&dispCount=24`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Cookie: cookieString,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!searchResponse.ok) {
      throw new Error(
        `Mandarake error: ${searchResponse.status} ${searchResponse.statusText}`
      );
    }

    const html = await searchResponse.text();

    // cheerio でパース
    const { load } = await import("cheerio");
    const $ = load(html);

    const results: PriceResult[] = [];

    $(".thumlarge > .block").each((i, el) => {
      if (results.length >= _limit) return false;

      const $block = $(el);

      const name = $block.find(".title p a").text().trim();
      if (!name) return;

      // URL
      const href = $block.find(".title p a").attr("href") || "";
      const url = href.startsWith("http")
        ? href
        : `https://order.mandarake.co.jp${href}`;

      // 価格（税込）
      const priceText = $block.find(".price p").text().trim();
      const taxIncMatch = priceText.match(/税込\s*([\d,]+)円/);
      const preTaxMatch = priceText.match(/^([\d,]+)円/);
      const price = taxIncMatch
        ? parseInt(taxIncMatch[1].replace(/,/g, ""), 10)
        : preTaxMatch
          ? parseInt(preTaxMatch[1].replace(/,/g, ""), 10)
          : 0;

      if (!price) return;

      // 在庫チェック
      const isSoldOut = $block.find(".soldout").length > 0;

      results.push({
        name,
        price,
        status: isSoldOut ? "sold" : "on_sale",
        url,
        source: "mandarake",
      });
    });

    return results;
  } catch (error) {
    console.error("Mandarake scraping failed:", error);
    return [];
  }
}
