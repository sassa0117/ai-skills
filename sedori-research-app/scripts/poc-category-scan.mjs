// PoC: カテゴリ走査スキャナ
// category=1014 (ストラップ・キーホルダー) の page 1-10 を走査し DB に upsert
// searchKeyword に '__poc_cat1014__' を入れるので後から除外/削除可能

import * as cheerio from "cheerio";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const db = new Database(join(__dirname, "..", "dev.db"));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const CATEGORY = "1014";
const PAGES = 10;
const MARKER = `__poc_cat${CATEGORY}__`;

function parseSurugayaPrice(text) {
  if (!text) return 0;
  const m = text.replace(/,/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function genId() {
  return "poc" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const insertStmt = db.prepare(`
  INSERT INTO CatalogItem (id, createdAt, updatedAt, source, surugayaUrl, name, category, listPrice, releaseDate, searchKeyword)
  VALUES (@id, @now, @now, 'surugaya', @url, @name, @category, @listPrice, @releaseDate, @searchKeyword)
  ON CONFLICT(surugayaUrl) DO UPDATE SET
    updatedAt = @now,
    name = @name,
    category = COALESCE(@category, CatalogItem.category),
    listPrice = COALESCE(@listPrice, CatalogItem.listPrice),
    releaseDate = COALESCE(@releaseDate, CatalogItem.releaseDate)
`);

async function scrapePage(page) {
  const params = new URLSearchParams({
    category: CATEGORY,
    search_word: "",
    searchbox: "1",
    rankBy: "modificationTime:descending",
  });
  if (page > 1) params.set("page", String(page));
  const url = `https://www.suruga-ya.jp/search?${params}`;

  const t0 = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.9" } });
  if (!res.ok) {
    console.log(`p${page} HTTP ${res.status}`);
    return { items: [], elapsed: Date.now() - t0 };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];
  let parseErr = 0;

  $("#search_result .item").each((i, el) => {
    try {
      const $item = $(el);
      const name = $item.find(".item_detail .title h3.product-name").text().trim();
      if (!name) { parseErr++; return; }
      const urlPath = $item.find(".item_detail .title a").attr("href") || "";
      const itemUrl = urlPath.startsWith("http") ? urlPath : `https://www.suruga-ya.jp${urlPath}`;
      const priceText = $item.find(".item_price .price_teika span.text-red strong").first().text().trim();
      const price = parseSurugayaPrice(priceText);
      const detailText = $item.find(".item_detail").text();
      const dateMatch = detailText.match(/(\d{4})[年/](\d{1,2})[月/](\d{1,2})?/);
      const releaseDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}${dateMatch[3] ? "-" + dateMatch[3].padStart(2, "0") : ""}`
        : null;
      const category = $item.find(".item_detail .category").text().trim() || null;
      items.push({ name, price, url: itemUrl, releaseDate, category });
    } catch (e) {
      parseErr++;
    }
  });

  return { items, elapsed: Date.now() - t0, parseErr };
}

(async () => {
  console.log(`=== PoC: category=${CATEGORY} pages=1..${PAGES} ===`);
  const tAll = Date.now();
  let total = 0, errPage = 0, errParse = 0;
  const sample = [];

  for (let p = 1; p <= PAGES; p++) {
    const { items, elapsed, parseErr = 0 } = await scrapePage(p);
    if (items.length === 0) { errPage++; console.log(`  p${p} 0件 (${elapsed}ms)`); continue; }
    errParse += parseErr;

    const now = new Date().toISOString();
    let upN = 0, upErr = 0;
    for (const it of items) {
      try {
        const id = genId();
        insertStmt.run({
          id, now,
          url: it.url, name: it.name,
          category: it.category,
          listPrice: it.price || null,
          releaseDate: it.releaseDate,
          searchKeyword: MARKER,
        });
        upN++;
      } catch (e) {
        upErr++;
        if (upErr <= 2) console.log(`    upsertErr: ${e.message}`);
      }
    }

    total += items.length;
    console.log(`  p${p}: 取得=${items.length} upsert=${upN} upsertErr=${upErr} parseErr=${parseErr} (${elapsed}ms)`);
    if (sample.length < 5 && items.length) sample.push(items[0].name);
    await new Promise(r => setTimeout(r, 1500));
  }

  const totalSec = ((Date.now() - tAll) / 1000).toFixed(1);
  console.log(`\n=== 結果 ===`);
  console.log(`総取得: ${total}件 / 失敗page: ${errPage} / parseErr: ${errParse}`);
  console.log(`総時間: ${totalSec}s (avg ${(totalSec/PAGES).toFixed(1)}s/page)`);
  console.log(`サンプル:`);
  sample.forEach(s => console.log("  - " + s.slice(0, 70)));

  const inDb = db.prepare("SELECT COUNT(*) as n FROM CatalogItem WHERE searchKeyword = ?").get(MARKER);
  console.log(`DB保存（marker=${MARKER}）: ${inDb.n}件`);
})();
