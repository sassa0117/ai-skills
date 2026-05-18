import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

const db = new Database("./dev.db");
db.pragma("journal_mode = WAL");

const data = JSON.parse(
  readFileSync(
    "C:/Users/user/ai-skills/research/precure-parts-organized.json",
    "utf-8"
  )
);

console.log(`[import] 入力: ${data.length} 件`);

const IP_MAP = {
  "カードコミューン": ["ふたりはプリキュア", "プリキュア"],
  "プリティコミューン": ["ふたりはプリキュア", "プリキュア"],
  "ハートフルコミューン": ["ふたりはプリキュア Max Heart", "MaxHeart"],
  "タッチコミューン": ["ふたりはプリキュア Max Heart", "MaxHeart"],
  "ミラクルコミューン": ["ふたりはプリキュア Max Heart", "MaxHeart"],
  "ハーティエルブローチェ": ["ふたりはプリキュア Max Heart", "MaxHeart"],
  "ミックスコミューン": ["ふたりはプリキュア Splash☆Star", "Splash★Star"],
  "スプラッシュコミューン": ["ふたりはプリキュア Splash☆Star", "Splash★Star"],
  "クリスタルコミューン": ["ふたりはプリキュア Splash☆Star", "Splash★Star"],
  "ピンキーキャッチュ": ["Yes!プリキュア5", "プリキュア5"],
  "ドリームコレット": ["Yes!プリキュア5", "プリキュア5"],
  "ドリームトーチ": ["Yes!プリキュア5", "プリキュア5"],
  "キュアモ": ["Yes!プリキュア5 GoGo!", "プリキュア5"],
  "ローズパクト": ["Yes!プリキュア5 GoGo!", "プリキュア5"],
  "ミルキィパレット": ["Yes!プリキュア5 GoGo!", "プリキュア5"],
  "キュアフルーレ": ["Yes!プリキュア5 GoGo!", "プリキュア5"],
  "リンクルン": ["フレッシュプリキュア!", "フレッシュ"],
  "フレッシュキュアスティック": ["フレッシュプリキュア!", "フレッシュ"],
  "パッションハープ": ["フレッシュプリキュア!", "フレッシュ"],
  "ココロパフューム": ["ハートキャッチプリキュア!", "ハートキャッチ"],
  "フラワータクト": ["ハートキャッチプリキュア!", "ハートキャッチ"],
  "ココロポット": ["ハートキャッチプリキュア!", "ハートキャッチ"],
  "シャイニータンバリン": ["ハートキャッチプリキュア!", "ハートキャッチ"],
  "ハートキャッチミラージュ": ["ハートキャッチプリキュア!", "ハートキャッチ"],
  "シャイニーパフューム": ["ハートキャッチプリキュア!", "ハートキャッチ"],
  "キュアモジューレ": ["スイートプリキュア♪", "スイート"],
  "ミラクルベルティエ": ["スイートプリキュア♪", "スイート"],
  "ファンタスティックベルティエ": ["スイートプリキュア♪", "スイート"],
  "ラブギターロッド": ["スイートプリキュア♪", "スイート"],
  "スマイルパクト": ["スマイルプリキュア!", "スマイル"],
  "プリンセスキャンドル": ["スマイルプリキュア!", "スマイル"],
  "ロイヤルクロック": ["スマイルプリキュア!", "スマイル"],
  "ラブリーコミューン": ["ドキドキ!プリキュア", "ドキドキ"],
  "ラブハートアロー": ["ドキドキ!プリキュア", "ドキドキ"],
  "ラブアイズパレット": ["ドキドキ!プリキュア", "ドキドキ"],
  "ラブキッスルージュ": ["ドキドキ!プリキュア", "ドキドキ"],
  "マジカルラブリーパッド": ["ドキドキ!プリキュア", "ドキドキ"],
  "プリチェンミラー": ["ハピネスチャージプリキュア!", "ハピチャ"],
  "トリプルダンスハニーバトン": ["ハピネスチャージプリキュア!", "ハピチャ"],
  "フォーチュンタンバリン": ["ハピネスチャージプリキュア!", "ハピチャ"],
  "フォーチュンピアノ": ["ハピネスチャージプリキュア!", "ハピチャ"],
  "シャイニングメイクドレッサー": ["ハピネスチャージプリキュア!", "ハピチャ"],
  "プリンセスパフューム": ["Go!プリンセスプリキュア", "Goプリ"],
  "クリスタルプリンセスロッド": ["Go!プリンセスプリキュア", "Goプリ"],
  "スカーレットバイオリン": ["Go!プリンセスプリキュア", "Goプリ"],
  "ミュージックプリンセスパレス": ["Go!プリンセスプリキュア", "Goプリ"],
  "リンクルステッキ": ["魔法つかいプリキュア!", "魔法つかい"],
  "リンクルスマホン": ["魔法つかいプリキュア!", "魔法つかい"],
  "フラワーエコーワンド": ["魔法つかいプリキュア!", "魔法つかい"],
  "スイーツパクト": ["キラキラ☆プリキュアアラモード", "アラモード"],
  "キャンディロッド": ["キラキラ☆プリキュアアラモード", "アラモード"],
  "パルフェレインボーリボン": ["キラキラ☆プリキュアアラモード", "アラモード"],
  "キラキラルクリーマー": ["キラキラ☆プリキュアアラモード", "アラモード"],
  "プリハート": ["HUGっと!プリキュア", "HUGっと"],
  "メロディソード": ["HUGっと!プリキュア", "HUGっと"],
  "ツインラブギター": ["HUGっと!プリキュア", "HUGっと"],
  "プリキュアミライブレス": ["HUGっと!プリキュア", "HUGっと"],
  "ミライパッド": ["HUGっと!プリキュア", "HUGっと"],
  "スターカラーペンダント": ["スター☆トゥインクルプリキュア", "スタプリ"],
  "プリキュアレインボーパフューム": ["スター☆トゥインクルプリキュア", "スタプリ"],
  "フワ トゥインクルブック": ["スター☆トゥインクルプリキュア", "スタプリ"],
  "ヒーリングステッキ": ["ヒーリングっど♥プリキュア", "ヒープリ"],
  "アースウィンディハープ": ["ヒーリングっど♥プリキュア", "ヒープリ"],
  "ヒーリングっどアロー": ["ヒーリングっど♥プリキュア", "ヒープリ"],
  "トロピカルパクト": ["トロピカル~ジュ!プリキュア", "トロプリ"],
  "ハートルージュロッド": ["トロピカル~ジュ!プリキュア", "トロプリ"],
  "マーメイドアクアポット": ["トロピカル~ジュ!プリキュア", "トロプリ"],
  "トロピカルハートドレッサー": ["トロピカル~ジュ!プリキュア", "トロプリ"],
  "ハートキュアウォッチ": ["デリシャスパーティ♡プリキュア", "デリパ"],
  "ハートジューシーミキサー": ["デリシャスパーティ♡プリキュア", "デリパ"],
  "ハートフルーツペンダント": ["デリシャスパーティ♡プリキュア", "デリパ"],
  "パーティキャンドルタクト": ["デリシャスパーティ♡プリキュア", "デリパ"],
  "スカイミラージュ": ["ひろがるスカイ!プリキュア", "ひろスカ"],
  "ミックスパレット プリキュア": ["ひろがるスカイ!プリキュア", "ひろスカ"],
  "ワンダフルパクト": ["わんだふるぷりきゅあ!", "わんプリ"],
  "ダイヤモンドリボンキャッスル": ["わんだふるぷりきゅあ!", "わんプリ"],
  "アイドルハートブローチ": ["キミとアイドルプリキュア♪", "キミプリ"],
  "アイドルハートインカム": ["キミとアイドルプリキュア♪", "キミプリ"],
  "キラキラショータイムマイク": ["キミとアイドルプリキュア♪", "キミプリ"],
  "キラッキランリボンバトン": ["キミとアイドルプリキュア♪", "キミプリ"],
};

const PRODUCT_TYPE_MAP = {
  single_part: "付属品単品",
  complete_set: "コンプリートセット",
  limited: "非売品・購入特典",
};

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

const insertItem = db.prepare(`
  INSERT OR REPLACE INTO CatalogItem (
    id, source, surugayaUrl, mercariItemId, name, category, productType,
    ipTitle, ipShort, searchKeyword, mercariKeyword, imageUrl, venueTags,
    description, createdAt, updatedAt
  ) VALUES (
    @id, @source, NULL, @mercariItemId, @name, @category, @productType,
    @ipTitle, @ipShort, @searchKeyword, @mercariKeyword, @imageUrl, @venueTags,
    @description, @createdAt, @updatedAt
  )
`);

const getExistingItem = db.prepare(
  `SELECT id FROM CatalogItem WHERE mercariItemId = ?`
);

const insertSnap = db.prepare(`
  INSERT INTO PriceSnapshot (
    id, itemId, mercariMedian, mercariCount, soldOut, createdAt
  ) VALUES (?, ?, ?, 1, 0, ?)
`);

const getSnap = db.prepare(
  `SELECT id FROM PriceSnapshot WHERE itemId = ? LIMIT 1`
);

const insertSold = db.prepare(`
  INSERT OR REPLACE INTO MercariSoldRecord (
    id, itemId, price, soldDate, mercariName, mercariItemId,
    thumbnailUrl, itemConditionId, geminiVerdict, geminiCheckedAt, createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

const tx = db.transaction((items) => {
  for (const sold of items) {
    try {
      const primaryParent = sold.relatedParents[0];
      const ipInfo = IP_MAP[primaryParent] || ["プリキュア", "プリキュア"];
      const [ipTitle, ipShort] = ipInfo;
      const productType = PRODUCT_TYPE_MAP[sold.category] || "付属品";
      const now = new Date().toISOString();

      const existing = getExistingItem.get(sold.mercariItemId);
      const itemId = existing?.id || cuid();

      insertItem.run({
        id: itemId,
        source: "mercari_only",
        mercariItemId: sold.mercariItemId,
        name: sold.name,
        category: "付属品",
        productType,
        ipTitle,
        ipShort,
        searchKeyword: sold.relatedKeywords.join(" / "),
        mercariKeyword: sold.relatedKeywords[0] || null,
        imageUrl: sold.thumbnailUrl,
        venueTags: JSON.stringify({
          parents: sold.relatedParents,
          category: sold.category,
        }),
        description: `親アイテム: ${sold.relatedParents.join(", ")}\n検索キーワード: ${sold.relatedKeywords.join(" / ")}\nカテゴリ: ${sold.category}`,
        createdAt: now,
        updatedAt: now,
      });

      const existSnap = getSnap.get(itemId);
      if (!existSnap) {
        insertSnap.run(cuid(), itemId, sold.price, now);
      }

      insertSold.run(
        cuid(),
        itemId,
        sold.price,
        sold.soldDate,
        sold.name,
        sold.mercariItemId,
        sold.thumbnailUrl,
        sold.itemConditionId || null,
        sold.gemini?.type || null,
        sold.gemini ? now : null,
        now
      );

      imported++;
    } catch (e) {
      console.error(`  エラー (${sold.mercariItemId}): ${e.message}`);
      skipped++;
    }
  }
});

tx(data);

console.log(`\n[import] 完了 imported=${imported} skipped=${skipped}`);

const totalCount = db.prepare(`SELECT COUNT(*) as c FROM CatalogItem`).get().c;
const partsCount = db
  .prepare(`SELECT COUNT(*) as c FROM CatalogItem WHERE source = 'mercari_only'`)
  .get().c;
console.log(`  CatalogItem total: ${totalCount}`);
console.log(`  mercari_only: ${partsCount}`);

db.close();
