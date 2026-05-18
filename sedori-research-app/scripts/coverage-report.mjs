/**
 * 駿屋取得率レポート
 *
 * watchlist の全 IP について:
 *   - have_in_catalog: CatalogItem.ipShort 件数
 *   - suruga_total:    駿屋検索ヒット数（カテゴリ無指定）
 *   - coverage_pct:    have / total
 *
 * CSV + ScanCursor サマリーを出力する。
 *
 * 使い方:
 *   node scripts/coverage-report.mjs              # 全IP・駿屋実機問い合わせ
 *   node scripts/coverage-report.mjs --no-fetch   # 駿屋問い合わせskip（ScanCursorのtotalHits集計のみ）
 *   node scripts/coverage-report.mjs --ip 鬼滅の刃  # 1IP
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");
const WATCHLIST_PATH = path.join(__dirname, "goods-watchlist.json");

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] || null;
}
const hasFlag = (name) => args.includes(name);

const ipFilter = getArg("--ip");
const noFetch = hasFlag("--no-fetch");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getSurugayaTotal(keyword) {
  const url = `https://www.suruga-ya.jp/search?search_word=${encodeURIComponent(keyword)}&searchbox=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.9" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/該当件数[:：]?\s*([\d,]+)\s*件中/);
    if (!m) return 0; // 検索結果なし
    return parseInt(m[1].replace(/,/g, ""), 10) || 0;
  } catch {
    return null;
  }
}

async function main() {
  const wl = JSON.parse(fs.readFileSync(WATCHLIST_PATH, "utf-8"));
  const ips = new Set();
  for (const a of wl.accounts || []) if (a.ip) ips.add(a.ip);
  const ipList = [...ips].filter(ip => !ipFilter || ip === ipFilter).sort();

  const db = new Database(DB_PATH, { readonly: true });
  const haveStmt = db.prepare("SELECT COUNT(*) AS c FROM CatalogItem WHERE ipShort = ?");
  const cursorStmt = db.prepare(`
    SELECT category, note, lastPage, totalHits, itemsScanned, isExhausted
      FROM ScanCursor WHERE ipShort = ? ORDER BY category
  `);

  console.log(`対象IP: ${ipList.length}件 (駿屋問い合わせ: ${noFetch ? "skip" : "あり"})\n`);

  const rows = [];
  for (let i = 0; i < ipList.length; i++) {
    const ip = ipList[i];
    const have = haveStmt.get(ip).c;
    const cursors = cursorStmt.all(ip);
    const cursorScanned = cursors.reduce((s, c) => s + c.itemsScanned, 0);
    const cursorTotalHits = cursors.reduce((s, c) => s + c.totalHits, 0);
    const exhaustedCnt = cursors.filter(c => c.isExhausted).length;

    let surugaTotal = null;
    if (!noFetch) {
      process.stdout.write(`  [${i + 1}/${ipList.length}] ${ip}  ... `);
      surugaTotal = await getSurugayaTotal(ip);
      process.stdout.write(`have=${have} total=${surugaTotal ?? "?"}\n`);
      await sleep(1500);
    }

    const coverage = surugaTotal ? ((have / surugaTotal) * 100).toFixed(1) + "%" : "";
    rows.push({
      ip,
      have_in_catalog: have,
      suruga_total: surugaTotal ?? "",
      coverage_pct: coverage,
      cursor_scanned: cursorScanned,
      cursor_total_hits: cursorTotalHits,
      cursors_exhausted: `${exhaustedCnt}/${cursors.length}`,
    });
  }

  db.close();

  // CSV出力
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(PROJECT_ROOT, "scripts", "output", `coverage-${ts}`);
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, "coverage_per_ip.csv");
  const header = ["ip", "have_in_catalog", "suruga_total", "coverage_pct", "cursor_scanned", "cursor_total_hits", "cursors_exhausted"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map(h => {
      const v = r[h] ?? "";
      const s = String(v).replace(/"/g, '""');
      return /[",]/.test(s) ? `"${s}"` : s;
    }).join(","));
  }
  fs.writeFileSync(csvPath, lines.join("\n"), "utf-8");
  console.log(`\nCSV: ${csvPath}`);

  // サマリー（駿屋問い合わせがあった場合のみ）
  if (!noFetch) {
    const withTotal = rows.filter(r => typeof r.suruga_total === "number" && r.suruga_total > 0);
    const totalHave = withTotal.reduce((s, r) => s + r.have_in_catalog, 0);
    const totalSuruga = withTotal.reduce((s, r) => s + r.suruga_total, 0);
    const overallPct = totalSuruga ? ((totalHave / totalSuruga) * 100).toFixed(1) : "?";
    console.log(`\n=== 総合 ===`);
    console.log(`  catalog 保有: ${totalHave.toLocaleString()}`);
    console.log(`  駿屋ヒット数(カテゴリ無指定 合計): ${totalSuruga.toLocaleString()}`);
    console.log(`  取得率: ${overallPct}%`);
  }

  // ScanCursor サマリー
  const totalScanned = rows.reduce((s, r) => s + r.cursor_scanned, 0);
  console.log(`\n=== ScanCursor 進捗 ===`);
  console.log(`  cursor_scanned 合計: ${totalScanned.toLocaleString()}`);
}

main().catch(e => {
  console.error("エラー:", e);
  process.exit(1);
});
