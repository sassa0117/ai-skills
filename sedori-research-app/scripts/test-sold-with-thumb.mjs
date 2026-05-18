/**
 * テスト: 指定catalogItemに対してメルカリsoldを画像URL付き+厳密フィルタで保存する
 *
 * フィルタ戦略（②キーワード絞り）:
 *   MUST条件 = 駿河屋商品名の「」内副題（ユアネクスト等）
 *            OR productType略称のいずれか（ラバキー・ラバーキー等）
 *   どちらも含まないsoldは除外
 *
 * 使い方:
 *   node scripts/test-sold-with-thumb.mjs <catalogItemId>
 *   node scripts/test-sold-with-thumb.mjs <catalogItemId> --no-clear   # 既存残す
 *   node scripts/test-sold-with-thumb.mjs <catalogItemId> --debug      # 除外分も表示
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

const args = process.argv.slice(2);
const itemId = args[0];
const noClear = args.includes("--no-clear");
const debug = args.includes("--debug");

if (!itemId) {
  console.error("Usage: node scripts/test-sold-with-thumb.mjs <catalogItemId> [--no-clear] [--debug]");
  process.exit(1);
}

function cuid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString("hex");
  return `c${ts}${rand}`;
}

// productType → メルカリでよく使われる略称バリエーション
const PRODUCT_TYPE_ALIASES = {
  "ラバーキーホルダー": ["ラバキー", "ラバーキー", "ラバキ", "キーホルダー", "キーチェーン"],
  "ラバスト": ["ラバスト", "ラバーストラップ", "ラバキー", "ラバーキー", "キーホルダー"],
  "ラバーストラップ": ["ラバスト", "ラバーストラップ", "ラバキー", "ラバーキー", "キーホルダー"],
  "ラバーチャーム": ["ラバーチャーム", "ラバチャ"],
  "アクリルスタンド": ["アクスタ", "アクリルスタンド", "アクリル"],
  "アクリルキーホルダー": ["アクキー", "アクリルキーホルダー"],
  "缶バッジ": ["缶バ", "缶バッジ", "缶バッチ"],
  "ぬいぐるみ": ["ぬいぐるみ", "ぬい"],
  "一番くじ": ["一番くじ", "一番賞", "くじ"],
  "メタルチャーム": ["メタルチャーム", "メタチャ"],
  "キャラバッジコレクション": ["キャラバッジ", "キャラバ"],
  "トレーディングカード": ["トレカ", "カード"],
  "フィギュア": ["フィギュア"],
  "タペストリー": ["タペストリー", "タペ"],
  "クリアファイル": ["クリアファイル", "クリファ"],
  "ポストカード": ["ポストカード", "ポスカ"],
  "ステッカー": ["ステッカー"],
};

// 一般ストップワード（除去対象）
const GENERAL_STOPWORDS = /劇場版|THE MOVIE|the movie|映画|ver\.|Ver\.|VER\.|ver|Ver|コレクション|エディション|限定|特別|版|【|】|『|』|〜|～/gi;

// 表記ゆれ吸収
function normalize(s) {
  if (!s) return "";
  return s
    .replace(/篇/g, "編")
    .replace(/一番くじ/g, "1番くじ")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
}

function extractMustKeywords(surugayaName, productType, mercariKeyword) {
  // 1) 「」内の副題を抽出（作品タイトル・副題等）
  const quoted = surugayaName.match(/「(.+?)」/);
  const subtitle = quoted ? quoted[1] : surugayaName;

  // 2) 一般語除去
  let cleaned = subtitle.replace(GENERAL_STOPWORDS, " ");

  // 3) mercariKeyword に既に含まれる語を除去（作品名・キャラ名などの広い語）
  const mkTokens = (mercariKeyword || "").split(/[\s　]+/).filter((t) => t.length >= 3);
  for (const t of mkTokens) {
    cleaned = cleaned.split(t).join(" ");
  }

  // 4) 空白整形 → トークン化
  const subtitleTokens = cleaned
    .split(/[\s　・/／、。,.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3); // 3文字以上

  // 5) productType略称
  const typeAliases = PRODUCT_TYPE_ALIASES[productType] || (productType ? [productType] : []);

  return { subtitleTokens, typeAliases };
}

// 相対除外: soldの固有名詞が駿河屋名・mercariKeywordに一切現れない場合は別商品
function relativeExclude(soldName, referenceText) {
  const ref = normalize(referenceText);
  // カタカナ3文字以上 / 英字3文字以上 / 漢字2文字以上 の固有名詞候補を抽出
  const tokens = (soldName.match(/[ァ-ヶー]{3,}|[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ\-]{2,}/g) || [])
    .filter((t) => t.length >= 3);

  // 一般語（賞ランク・ブランド名等）は除去
  const commonWords = new Set([
    "フィギュア", "未開封", "未使用", "新品", "中古", "箱無し", "箱あり",
    "バンダイ", "BANDAI", "SPIRITS", "国内正規品", "海外正規品", "プライズ",
    "ラストワン", "匿名配送", "即購入", "値下げ", "専用",
  ]);
  const significant = tokens.filter((t) => !commonWords.has(t));

  if (significant.length === 0) return { excluded: false, foreign: [] };

  const foreign = significant.filter((t) => !ref.includes(normalize(t)));

  // 駿河屋名に無い固有名詞が「全体の50%以上」かつ「2個以上」あれば別商品と判定
  if (foreign.length >= 2 && foreign.length / significant.length >= 0.5) {
    return { excluded: true, foreign };
  }
  return { excluded: false, foreign };
}

function matchSold(soldName, ctx) {
  if (!soldName) return { ok: false, reason: "no-name" };
  const { subtitleTokens, typeAliases, characterName, isIchibankuji, referenceText } = ctx;
  const n = normalize(soldName);

  // 相対除外チェック（別商品判定）
  const rel = relativeExclude(soldName, referenceText);
  if (rel.excluded) return { ok: false, reason: `foreign:${rel.foreign.slice(0, 3).join(",")}` };

  const subtitleHit = subtitleTokens.some((t) => n.includes(normalize(t)));
  const typeHit =
    typeAliases.some((t) => n.includes(normalize(t))) ||
    (isIchibankuji && /[a-z]賞/i.test(soldName));
  const charHit = characterName ? n.includes(normalize(characterName)) : false;

  const score = (subtitleHit ? 1 : 0) + (typeHit ? 1 : 0) + (charHit ? 1 : 0);
  const tags = `s${subtitleHit ? 1 : 0}t${typeHit ? 1 : 0}c${charHit ? 1 : 0}`;

  if (score >= 2) return { ok: true, reason: tags };
  return { ok: false, reason: `score=${score} ${tags}` };
}

async function searchMercariSoldWithThumb(keyword, limit = 30) {
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
  if (!res.ok) throw new Error(`Mercari API ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) return [];

  const excludePatterns = [
    // 既存: セット・まとめ系
    /まとめ/i, /セット売り/i, /まとめ売り/i, /コンプ/i, /コンプリート/i,
    /1ロット/i, /一式/i, /全種/i, /全\d+種/i, /大量/i, /引退/i, /まとめて/i,
    /\dロット/i, /ロット売り/i, /セット販売/i, /おまとめ/i, /一括/i, /福袋/i,
    /フルコンプ/i, /全種類/i, /まとめ出品/i, /全賞/i, /コンプセット/i,

    // 新規: 複数賞混在（A賞～Z賞を2個以上含む / ラストワン併記）
    /[A-ZＡ-Ｚ]賞[^賞]{0,40}[A-ZＡ-Ｚ]賞/i,
    /[A-ZＡ-Ｚ]賞[^賞]{0,40}ラストワン/i,
    /ラストワン[^賞]{0,40}[A-ZＡ-Ｚ]賞/i,

    // 新規: N点系・全角数字対応
    /[\d０-９]+点/,
    /計[\d０-９一二三四五六七八九十]+[点個種枚]/,
    /[一二三四五六七八九十]+点セット/,

    // 新規: ○個セット / ×N個
    /[\d０-９]+[個種枚本点]\s*セット/,
    /×[\d０-９]+/,

    // 新規: 単独「セット」（ただし慎重に。「セットアップ」「カードセット」等と区別）
    /\sセット$/,     // 末尾に半角空白+セット
    /　セット$/,     // 末尾に全角空白+セット
    / セット /,      // 前後に空白を挟むセット
    /賞.*セット/i,    // A賞...セット 等
  ];

  const isExcluded = (name) => excludePatterns.some((p) => p.test(name));

  return data.items
    .filter((item) => !isExcluded(item.name))
    .map((item) => ({
      mercariItemId: item.id,
      name: item.name,
      price: typeof item.price === "string" ? parseInt(item.price, 10) : item.price,
      soldDate: new Date(item.updated * 1000).toISOString().split("T")[0],
      thumbnailUrl: item.thumbnails?.[0] || null,
      itemConditionId: item.itemConditionId || null,
    }));
}

async function main() {
  const db = new Database(path.join(PROJECT_ROOT, "dev.db"));
  db.pragma("journal_mode = WAL");

  const item = db.prepare("SELECT id, name, mercariKeyword, listPrice, productType, characterName FROM CatalogItem WHERE id = ?").get(itemId);
  if (!item) {
    console.error("商品が見つかりません:", itemId);
    db.close();
    process.exit(1);
  }
  if (!item.mercariKeyword) {
    console.error("mercariKeywordが未設定:", itemId);
    db.close();
    process.exit(1);
  }

  console.log(`\n[${item.name}]`);
  console.log(`検索キーワード: ${item.mercariKeyword}`);
  console.log(`productType: ${item.productType || "(未設定)"}`);

  const must = extractMustKeywords(item.name, item.productType, item.mercariKeyword);
  const isIchibankuji = item.name.includes("一番くじ");
  const judgeCtx = {
    subtitleTokens: must.subtitleTokens,
    typeAliases: must.typeAliases,
    characterName: item.characterName,
    isIchibankuji,
    referenceText: `${item.name} ${item.mercariKeyword}`,
  };
  console.log(`副題トークン: [${must.subtitleTokens.join(", ")}]`);
  console.log(`種別略称: [${must.typeAliases.join(", ")}]`);
  console.log(`キャラ名: ${item.characterName || "(なし)"}`);
  console.log(`一番くじ: ${isIchibankuji}`);

  const solds = await searchMercariSoldWithThumb(item.mercariKeyword, 60);
  console.log(`\nsold取得: ${solds.length}件`);

  const maxPrice = item.listPrice ? item.listPrice * 5 : null;
  const priceFiltered = maxPrice ? solds.filter((s) => s.price <= maxPrice) : solds;
  console.log(`価格フィルタ後: ${priceFiltered.length}件`);

  // スコアリングフィルタ（2条件以上で通過）
  const matched = [];
  const rejected = [];
  for (const s of priceFiltered) {
    const m = matchSold(s.name, judgeCtx);
    if (m.ok) matched.push({ ...s, matchReason: m.reason });
    else rejected.push({ ...s, matchReason: m.reason });
  }
  console.log(`スコア2+通過: ${matched.length}件 / 除外: ${rejected.length}件`);

  if (debug) {
    console.log("\n--- 通過 ---");
    matched.forEach((s) => console.log(`  ✓ [${s.matchReason}] ¥${s.price} ${s.name.slice(0, 50)}`));
    console.log("\n--- 除外 ---");
    rejected.forEach((s) => console.log(`  ✗ [${s.matchReason}] ¥${s.price} ${s.name.slice(0, 50)}`));
  }

  // 既存クリア
  if (!noClear) {
    const del = db.prepare("DELETE FROM MercariSoldRecord WHERE itemId = ?").run(itemId);
    console.log(`\n既存削除: ${del.changes}件`);
  }

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO MercariSoldRecord
      (id, createdAt, itemId, price, soldDate, mercariName, mercariItemId, thumbnailUrl, itemConditionId)
    VALUES (@id, @now, @itemId, @price, @soldDate, @mercariName, @mercariItemId, @thumbnailUrl, @itemConditionId)
  `);
  const tx = db.transaction(() => {
    for (const s of matched) {
      insert.run({
        id: cuid(),
        now,
        itemId,
        price: s.price,
        soldDate: s.soldDate,
        mercariName: s.name,
        mercariItemId: s.mercariItemId,
        thumbnailUrl: s.thumbnailUrl,
        itemConditionId: s.itemConditionId,
      });
    }
  });
  tx();

  console.log(`保存: ${matched.length}件`);

  const saved = db.prepare(`
    SELECT price, soldDate, mercariName, itemConditionId
    FROM MercariSoldRecord WHERE itemId = ? ORDER BY soldDate DESC LIMIT 10
  `).all(itemId);
  console.log("\n保存されたレコード(最新10件):");
  saved.forEach((r) => console.log(`  ¥${r.price} [${r.soldDate}] cond=${r.itemConditionId} ${r.mercariName?.slice(0, 60)}`));

  db.close();
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
