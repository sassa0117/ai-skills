/**
 * goods-watchlist.json の全 IP に対して、アニメグッズ主要9カテゴリの
 * ScanCursor 行を作成する（既存行は上書きしない）。
 *
 * 主要9カテゴリ（駿屋）:
 *   501  ホビー（フィギュア・ぬいぐるみ・プラモ）
 *   500  おもちゃ（一番くじ・プライズ・なりきり）
 *   1004 小物（アクスタ・缶バッジ・キーホルダー雑多）
 *   1014 ストラップ・キーホルダー
 *   1003 ポスター
 *   1022 タペストリー
 *   1015 ポストカード・色紙
 *   1011 シール・ステッカー
 *   1010 文房具
 *
 * 使い方:
 *   node scripts/setup-watchlist-cursors.mjs            # 既存watchlistを一括初期化
 *   node scripts/setup-watchlist-cursors.mjs --ip 鬼滅の刃  # 1IPだけ
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Database from "better-sqlite3";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] || null;
}

export const DEFAULT_DEEP_CATEGORIES = [
  { id: "501",  label: "ホビー" },
  { id: "500",  label: "おもちゃ" },
  { id: "1004", label: "小物" },
  { id: "1014", label: "ストラップ・キーホルダー" },
  { id: "1003", label: "ポスター" },
  { id: "1022", label: "タペストリー" },
  { id: "1015", label: "ポストカード・色紙" },
  { id: "1011", label: "シール・ステッカー" },
  { id: "1010", label: "文房具" },
];
const DEFAULT_SORT_MODE = "release";

function cuid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString("hex");
  return `c${ts}${rand}`;
}

function main() {
  const wlPath = path.join(__dirname, "goods-watchlist.json");
  const wl = JSON.parse(fs.readFileSync(wlPath, "utf-8"));

  const ipFilter = getArg("--ip");
  const ipSet = new Set();
  for (const a of wl.accounts || []) {
    if (a.ip) {
      if (!ipFilter || a.ip === ipFilter) ipSet.add(a.ip);
    }
  }

  const ips = [...ipSet];
  console.log(`対象IP: ${ips.length}件${ipFilter ? ` (filter: ${ipFilter})` : ""}`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const sel = db.prepare(`
    SELECT id FROM ScanCursor
     WHERE ipShort = ?
       AND COALESCE(category, '') = COALESCE(?, '')
       AND sortMode = ?
  `);
  const ins = db.prepare(`
    INSERT INTO ScanCursor (id, createdAt, updatedAt, ipShort, category, sortMode, lastPage, totalHits, itemsScanned, newLastRun, isExhausted, note)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
  `);

  let created = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const ip of ips) {
      for (const cat of DEFAULT_DEEP_CATEGORIES) {
        const exist = sel.get(ip, cat.id, DEFAULT_SORT_MODE);
        if (exist) { skipped++; continue; }
        ins.run(cuid(), now, now, ip, cat.id, DEFAULT_SORT_MODE, cat.label);
        created++;
      }
    }
  });
  tx();

  const total = db.prepare("SELECT COUNT(*) AS c FROM ScanCursor").get();
  console.log(`新規作成: ${created} / 既存スキップ: ${skipped}`);
  console.log(`ScanCursor 合計: ${total.c} 行`);

  db.close();
}

main();
