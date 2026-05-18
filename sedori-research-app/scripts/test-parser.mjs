/**
 * 商品名パーサーのオフラインテスト
 * 保存済みのTOHOanimeSTOREデータを使う
 */
import fs from "fs";

const GOODS_TYPES = [
  "アクリルスタンド", "アクスタ", "アクリルキーホルダー", "アクリルブロック",
  "アクリルブックスタンド", "アクリルフィギュア",
  "缶バッジ", "ピンバッジ", "バッジ",
  "フィギュア", "フィギュアライト",
  "ぬいぐるみ", "ぬいぐるみマスコット", "みみぐるみ",
  "タペストリー", "クリアファイル", "ポストカード", "ポストカードセット",
  "キーホルダー", "ラバーストラップ", "ラバスト",
  "コースター", "マグカップ", "タオル", "ビッグタオル",
  "Tシャツ", "パーカー", "ステッカー", "シール",
  "ブランケット", "抱き枕カバー", "抱き枕",
  "色紙", "ミニ色紙", "色紙フレーム",
  "ポーチ", "バッグ", "トートバッグ",
  "クリアカード", "ビジュアルカード", "フォトグレイカード",
  "ブックスタンド", "収納BOX",
  "DXF", "Qposket",
];
GOODS_TYPES.sort((a, b) => b.length - a.length);

function extractProductNames(postText) {
  let text = postText.replace(/\n/g, " ");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/#\S+/g, "");
  text = text.replace(/[◤◢◣◥▋━═＝∟├▼↓→►▷☆★◆●○■□＊*･°:｡]+/g, " ");
  text = text.replace(/【[^】]*】/g, " ");
  text = text.replace(/[／＼]/g, " ");
  text = text.replace(/@[A-Za-z0-9_]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  const products = [];
  const seen = new Set();

  // パターン1: 「」で囲まれた商品名
  const quoted = text.matchAll(/「([^」]{3,50})」/g);
  for (const m of quoted) {
    let name = m[1].trim();
    if (/^(TVアニメ|アニメ|劇場版|映画)/.test(name)) continue;
    if (/詳細|こちら|公式|予約|販売/.test(name)) continue;
    const key = name.replace(/\s/g, "");
    if (!seen.has(key)) { seen.add(key); products.push(name); }
  }

  // パターン2: [修飾語]+[グッズ種別]
  const MODIFIERS = [
    "描き下ろし", "オリジナル", "限定", "特製", "新感覚の",
    "レコード風", "オーロラ素材の", "ショーウィンドウ風", "ブリスターパック風",
    "きぐるみを着た", "トレーディング", "ミニチュア", "メモリアル", "原画",
    "楕円", "・",
  ];
  const modPart = MODIFIERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

  for (const goodsType of GOODS_TYPES) {
    const escaped = goodsType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `((?:${modPart})\\s*${escaped}(?:\\s*\\d+[種個枚]?セット)?)`,
      "g"
    );
    const matches = text.matchAll(re);
    for (const m of matches) {
      let name = m[1].trim();
      name = name.replace(/^・/, "");
      if (GOODS_TYPES.includes(name)) continue;
      if (name.length < 4) continue;
      if (/新感覚|楽しい|おすすめ|嬉しい/.test(name)) continue;
      const key = name.replace(/\s/g, "");
      if (!seen.has(key)) { seen.add(key); products.push(name); }
    }
  }

  return products;
}

// テスト実行
const data = JSON.parse(fs.readFileSync("goods-catalog-discover-heroaca_anime.json", "utf-8"));
const ip = "僕のヒーローアカデミア";

for (const result of data.allResults) {
  console.log(`\n=== @${result.account} ===\n`);
  for (const p of result.products) {
    const raw = p.name.slice(0, 80);
    const names = extractProductNames(p.name);
    if (names.length > 0) {
      for (const n of names) {
        console.log(`  ${ip} ${n}`);
      }
    } else {
      console.log(`  (抽出なし) ${raw}...`);
    }
  }
}
