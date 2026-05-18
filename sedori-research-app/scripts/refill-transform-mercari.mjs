import crypto from "crypto";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const generateMercariJwt =
  require("generate-mercari-jwt").default ||
  require("generate-mercari-jwt");

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchMercariSold(keyword, limit = 60) {
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
    const res = await fetch(MERCARI_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];
    return data.items.map((item) => ({
      mercariItemId: item.id,
      name: item.name,
      price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
      soldDate: new Date(item.updated * 1000).toISOString().split("T")[0],
      thumbnailUrl: item.thumbnails?.[0] || null,
      itemConditionId: item.itemConditionId || null,
    }));
  } catch (e) {
    return [];
  }
}

const TRANSFORM_NAMES = [
  "カードコミューン", "プリティコミューン", "ハートフルコミューン", "タッチコミューン",
  "ミラクルコミューン", "ハーティエルブローチェ", "ミックスコミューン",
  "プリキュアスパイラルリングセット", "クリスタルコミューン", "スプラッシュコミューン",
  "ピンキーキャッチュ", "ドリームコレット", "ドリームトーチ", "プリキュアシンフォニーセット",
  "キュアモ", "ローズパクト", "ミルキィパレット", "キュアフルーレ",
  "リンクルン", "フレッシュキュアスティック", "パッションハープ",
  "ココロパフューム", "フラワータクト", "ココロポット", "シャイニータンバリン",
  "ハートキャッチミラージュ", "シャイニーパフューム",
  "キュアモジューレ", "ミラクルベルティエ", "ファンタスティックベルティエ", "ラブギターロッド",
  "スマイルパクト", "プリンセスキャンドル", "ロイヤルクロック",
  "ラブリーコミューン", "ラブハートアロー", "ラブアイズパレット", "ラブキッスルージュ",
  "マジカルラブリーパッド",
  "プリチェンミラー", "トリプルダンスハニーバトン", "フォーチュンタンバリン",
  "フォーチュンピアノ", "シャイニングメイクドレッサー",
  "プリンセスパフューム", "クリスタルプリンセスロッド", "スカーレットバイオリン",
  "ミュージックプリンセスパレス",
  "リンクルステッキ", "リンクルスマホン", "フラワーエコーワンド",
  "スイーツパクト", "キャンディロッド", "パルフェレインボーリボン", "キラキラルクリーマー",
  "プリハート", "メロディソード", "ツインラブギター",
  "プリキュアミライブレス", "ミライパッド",
  "スターカラーペンダント", "プリキュアレインボーパフューム",
  "ヒーリングステッキ", "アースウィンディハープ", "ヒーリングっどアロー",
  "トロピカルパクト", "ハートルージュロッド", "マーメイドアクアポット",
  "マーメイドアクアパクト", "トロピカルハートドレッサー",
  "ハートキュアウォッチ", "ハートジューシーミキサー", "ハートフルーツペンダント",
  "パーティキャンドルタクト",
  "スカイミラージュ", "ミックスパレット",
  "ワンダフルパクト", "ダイヤモンドリボンキャッスル",
  "アイドルハートブローチ", "アイドルハートインカム",
  "キラキラショータイムマイク", "キラッキランリボンバトン",
];

function extractTransformName(itemName) {
  for (const tn of TRANSFORM_NAMES) {
    if (itemName.includes(tn)) return tn;
  }
  return null;
}

const db = new Database("./dev.db");
db.pragma("journal_mode = WAL");

const items = db
  .prepare(
    `SELECT id, name FROM CatalogItem WHERE transformBody = 1 ORDER BY name`
  )
  .all();

console.log(`変身アイテム本体: ${items.length} 件`);

const insertSnap = db.prepare(`
  INSERT INTO PriceSnapshot (
    id, itemId, mercariMedian, mercariCount, soldOut, createdAt
  ) VALUES (?, ?, ?, ?, 0, ?)
`);

const insertSold = db.prepare(`
  INSERT OR IGNORE INTO MercariSoldRecord (
    id, itemId, price, soldDate, mercariName, mercariItemId,
    thumbnailUrl, itemConditionId, createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

let processed = 0;
let updated = 0;
let totalSolds = 0;

for (const item of items) {
  processed++;
  const baseKw = extractTransformName(item.name);
  if (!baseKw) {
    if (processed % 20 === 0) console.log(`  [${processed}/${items.length}] skip(no base): ${item.name.slice(0, 30)}`);
    continue;
  }

  const sold = await searchMercariSold(baseKw, 60);
  if (sold.length === 0) {
    if (processed % 20 === 0) console.log(`  [${processed}/${items.length}] no hit: ${baseKw}`);
    continue;
  }

  const prices = sold.map((s) => s.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];

  const now = new Date().toISOString();

  insertSnap.run(cuid(), item.id, median, sold.length, now);

  for (const s of sold) {
    insertSold.run(
      cuid(), item.id, s.price, s.soldDate, s.name, s.mercariItemId,
      s.thumbnailUrl, s.itemConditionId, now
    );
  }

  updated++;
  totalSolds += sold.length;

  if (processed % 10 === 0) {
    console.log(`  [${processed}/${items.length}] ${baseKw}: ${sold.length}件 median=¥${median.toLocaleString()}`);
  }

  await new Promise((r) => setTimeout(r, 400));
}

console.log(`\n完了: processed=${processed} updated=${updated} totalSolds=${totalSolds}`);

db.close();
