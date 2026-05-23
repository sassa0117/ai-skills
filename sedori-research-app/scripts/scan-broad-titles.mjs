/**
 * 缶バッジ広域検索 ad-hoc スクリプト
 * 用途: 既採用シリーズ・NG確定シリーズに該当しないタイトルを300件ほど集めて、未着手シリーズ候補を発掘する
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output", "can-badge");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const require = createRequire(import.meta.url);
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchOnce(keyword, excludeKeyword, priceMin, sortMode = "created") {
  const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
  const body = {
    searchSessionId: crypto.randomUUID(),
    pageSize: 120,
    searchCondition: {
      keyword,
      excludeKeyword,
      priceMin: String(priceMin),
      sort: sortMode === "price" ? "SORT_PRICE" : "SORT_CREATED_TIME",
      order: "ORDER_DESC",
      status: ["STATUS_SOLD_OUT", "STATUS_TRADING"],
    },
  };
  const res = await fetch(MERCARI_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.items || []).map(it => ({ id: it.id, name: it.name, price: parseInt(it.price, 10) }));
}

// 既採用シリーズ・NG確定シリーズを除外して、未着手シリーズ発掘を加速
const EXCLUDE = [
  // 既採用シリーズ
  "銀魂", "呪術廻戦", "ハイキュー", "ワンピース", "文豪ストレイドッグス", "文スト", "DIABOLIK", "ディアラバ",
  // NG確定シリーズ
  "プロセカ", "プロジェクトセカイ", "鬼滅の刃 ufotable", "ブルーロック", "にじさんじ", "コナン",
  "あんさんぶる", "あんスタ", "HiMERU",
  // 一般NGワード
  "セット", "まとめ売り", "まとめ", "詰め合わせ", "福袋", "コンプ", "全種", "台紙付",
  "アクスタ", "アクキー", "アクリル", "ピンバッジ", "ピンバッチ", "ビンズ", "ガラポン",
  "ブロマイド", "原画", "イラストボード", "アートボード", "複製原画",
  "特典カード", "クリアファイル", "ポストカード", "ステッカー", "ポスター",
  "キーホルダー", "ラバスト", "ストラップ",
  "DVD", "Blu-ray", "サウンドトラック",
  "タオル", "マグカップ", "クッション", "ぬいぐるみ",
  "フィギュア", "ねんどろいど",
].join(" ");

// 3クエリ並行: 新着「缶バッジ」/ 価格降順「缶バッジ」/ 新着「コレクション缶バッジ」
const [r1, r2, r3] = await Promise.all([
  searchOnce("缶バッジ", EXCLUDE, 3000, "created"),
  searchOnce("缶バッジ", EXCLUDE, 3000, "price"),
  searchOnce("コレクション缶バッジ", EXCLUDE, 3000, "created"),
]);
// 重複排除（id基準）
const seen = new Set();
const items = [];
for (const arr of [r1, r2, r3]) {
  for (const it of arr) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    items.push(it);
  }
}
console.log(`取得: created=${r1.length} / price-desc=${r2.length} / collection=${r3.length} / unique=${items.length}\n`);

// 価格降順で並べ替えてタイトル列挙
items.sort((a, b) => b.price - a.price);
const out = items.map(it => `[¥${it.price}] ${it.name}`).join("\n");
const outPath = path.join(OUTPUT_DIR, "broad-titles.txt");
fs.writeFileSync(outPath, out);
console.log(`保存: ${outPath}`);
console.log(`\n--- 上位40件 ---`);
items.slice(0, 40).forEach((it, i) => console.log(`${i+1}. [¥${it.price}] ${it.name}`));
