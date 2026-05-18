/**
 * 駿河屋URL空のCatalogItem 316件をHTML一覧で出力
 * 一回限りの確認用。終わったら削除
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

const db = new Database(DB_PATH, { readonly: true });
const rows = db.prepare(`
  SELECT id, name, ipShort, searchKeyword, maker, listPrice, category, description, productType, characterName, ipTitle, createdAt
  FROM CatalogItem
  WHERE surugayaUrl IS NULL OR surugayaUrl = ''
  ORDER BY ipShort, name
`).all();
db.close();

console.log(`抽出: ${rows.length}件`);

const escape = (s) => s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const surugayaSearchUrl = (name) => `https://www.suruga-ya.jp/search?search_word=${encodeURIComponent(name)}`;
const hobipediaUrl = (id) => `https://hobipedia.jp/catalog/${id}`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>駿河屋URL空のCatalogItem 一覧 (${rows.length}件)</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Yu Gothic UI", sans-serif; font-size: 13px; margin: 20px; }
  h1 { font-size: 18px; }
  .info { background: #f0f0f0; padding: 10px; margin-bottom: 15px; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #4a5568; color: white; position: sticky; top: 0; }
  tr:nth-child(even) { background: #f9f9f9; }
  tr:hover { background: #fff8dc; }
  .name { min-width: 280px; max-width: 400px; word-break: break-word; }
  .desc { max-width: 350px; font-size: 11px; color: #555; word-break: break-word; }
  .ip { white-space: nowrap; }
  .keyword { font-size: 11px; color: #666; white-space: nowrap; }
  .meta { font-size: 11px; color: #888; white-space: nowrap; }
  a.search-link { color: #2b6cb0; font-size: 11px; text-decoration: none; }
  a.search-link:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>駿河屋URL空のCatalogItem 一覧（${rows.length}件）</h1>
<div class="info">
  起源: 「駿河屋にないものをリサーチ依頼した名残」（さっさ確認）<br>
  全件 createdAt = 2026-04-27 02:29:01 同秒の bulk insert<br>
  各 name の右に駿河屋検索リンクあり → 今再検索したらヒットするか確認用
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>IP</th>
      <th>ホビペディア</th>
      <th>商品名</th>
      <th>検索キーワード</th>
      <th>メーカー</th>
      <th>定価</th>
      <th>カテゴリ</th>
      <th>商品種別</th>
      <th>キャラ名</th>
      <th>解説</th>
    </tr>
  </thead>
  <tbody>
${rows.map((r, i) => `    <tr>
      <td class="meta">${i + 1}</td>
      <td class="ip">${escape(r.ipShort)}</td>
      <td><a class="search-link" href="${hobipediaUrl(r.id)}" target="_blank">開く →</a></td>
      <td class="name">${escape(r.name)}<br><a class="search-link" href="${surugayaSearchUrl(r.name)}" target="_blank">駿河屋で再検索 →</a></td>
      <td class="keyword">${escape(r.searchKeyword)}</td>
      <td>${escape(r.maker)}</td>
      <td>${r.listPrice ? "¥" + r.listPrice.toLocaleString() : ""}</td>
      <td class="meta">${escape(r.category)}</td>
      <td class="meta">${escape(r.productType)}</td>
      <td class="meta">${escape(r.characterName)}</td>
      <td class="desc">${escape(r.description)}</td>
    </tr>`).join("\n")}
  </tbody>
</table>
</body>
</html>`;

const outDir = path.join(PROJECT_ROOT, "scripts", "output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "null-url-items.html");
fs.writeFileSync(outPath, html, "utf-8");
console.log(`出力: ${outPath}`);
