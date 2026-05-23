/**
 * WebSearchで取得したASINを ComicFirstPrintGroup に流し込み、
 * Amazon書影URL + ASIN を保存
 *
 * Amazon書影URLパターン:
 *   https://m.media-amazon.com/images/P/{ASIN}.09.LZZZZZZZ.jpg
 *   ※Amazon Associates 公式の hotlink 可能パターン
 *
 * 使い方:
 *   node scripts/comic-firstprint-apply-amazon-covers.mjs
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(path.join(PROJECT_ROOT, "prisma", "dev.db"));

// asinカラム追加
{
  const cols = db.prepare("PRAGMA table_info(ComicFirstPrintGroup)").all();
  if (!cols.some(c => c.name === "asin")) {
    db.exec("ALTER TABLE ComicFirstPrintGroup ADD COLUMN asin TEXT");
    console.log("✔ ComicFirstPrintGroup.asin カラム追加");
  }
}

// WebSearch結果から特定したASIN（IP|巻 [|版]）
const ASIN_MAP = {
  "BLEACH|1":                                          "4088732138", // 久保帯人・ジャンプコミックス・2002年1月。楽天pickVol1が小説スピンオフ「Can't Fear Your Own World」を誤選択した分の補正
  "BLEACH|7":                                          "4088733924", // v0.2.1 で追加
  "BLUE LOCK|11":                                      "B08KQ5NKCR", // Kindle版（紙11巻Amazon在庫なし）
  "BORUTO|1":                                          "4088807561", // v0.5.0 -NARUTO NEXT GENERATIONS- 池本幹雄/岸本斉史 2016
  "BORUTO -TWO BLUE VORTEX-|1":                        "4088838246", // v0.5.0 池本幹雄/岸本斉史 2024-02
  "FAIRY TAIL|1":                                      "4063637719",
  "GTO|1":                                             "4063124118",
  "HUNTER×HUNTER|2":                                   "4088726065", // v0.5.0 冨樫義博
  "MASHLE|1":                                          "408882329X",
  "NARUTO|1":                                          "4088728408", // v0.2.1 で追加
  "NARUTO|2":                                          "4088728785", // v0.5.0 岸本斉史 2000-06
  "NARUTO|7":                                          "4088731131",
  "ONE PIECE|1":                                       "4088725093",
  "ONE PIECE|2":                                       "4088725441",
  "ONE PIECE|3":                                       "4088725697",
  "ONE PIECE|4":                                       "4088725948", // v0.2.1 で追加
  "ONE PIECE|5":                                       "4088726197",
  "ONE PIECE|6":                                       "4088726421", // v0.2.1 で追加
  "ONE PIECE|7":                                       "4088726839", // v0.2.1 で追加
  "ONE PIECE|8":                                       "4088727126", // v0.5.0 尾田栄一郎
  "サカモトデイズ|1":                                   "4088826574", // v0.5.0 鈴木祐斗 SAKAMOTO DAYS
  "SLAM DUNK|2":                                       "4088716124", // v0.5.0 井上雄彦 1991-06
  "WITCHRIV ウィッチリヴ|1":                            "4088848225", // v0.5.0 はくり 2026-01
  "デビルマン|1":                                       "4063194353", // 完全復刻版
  "デビルマン|5|愛蔵版":                                "4091897622", // 画業50周年愛蔵版
  "ドラゴンボール|1":                                   "4088518314",
  "ドラゴンボール|5":                                   "4088518357", // v0.2.2 で追加
  "ドラゴンボール|10":                                  "4088518403",
  "ドラゴンボール|16":                                  "4088516133",
  "ドラゴンボール|17":                                  "4088516141", // v0.5.0 1989-05
  "ドラゴンボール|24":                                  "4088514149", // v0.5.0 1991-01
  "ドラゴンボール|27":                                  "4088514173", // v0.5.0 1991-08
  "ドラゴンボール|30":                                  "4088514203",
  "ドラゴンボール|37":                                  "4088514963",
  "ドラゴンボール|39":                                  "408851498X", // v0.2.2 で追加
  "ドラゴンボール|40":                                  "4088514998",
  "ドラゴンボール|42":                                  "4088510909",
  "バガボンド|1":                                       "4063286193", // v0.5.0 井上雄彦 1999-03
  "ヴィンランド・サガ|1":                               "4063144232", // v0.5.0 幸村誠 2006-08
  "ヘタリア|1":                                         "4344812751", // v0.5.0 日丸屋秀和 幻冬舎 Axis Powers
  "ポケットモンスタースペシャル|2":                     "4091493327", // v0.5.0
  "ポケットモンスタースペシャル|4":                     "4091493343",
  "今さらですが、幼なじみを好きになってしまいました|1": "4046850167",
  "俺だけレベルアップな件|1":                           "4040640802", // v0.5.0 DUBU/Chugong KADOKAWA
  "僕のヒーローアカデミア|1":                          "4088802640", // v0.2.1 で追加
  "僕のヒーローアカデミア|2":                          "4088802977", // v0.5.0 堀越耕平 2015-01
  "呪術廻戦|1":                                        "4088815165",
  "呪術廻戦|26":                                       "408883884X", // v0.2.1 で追加
  "家庭教師ヒットマンREBORN!|1":                       "408873680X", // v0.5.0 天野明
  "幽遊白書|1":                                        "4088712730",
  "杖と剣のウィストリア|1":                             "4065225191",
  "葬送のフリーレン|1":                                "4098501805", // v0.5.0 山田鐘人/アベツカサ 小学館
  "葬送のフリーレン|6":                                "4098507285", // v0.2.1 で追加
  "進撃の巨人|2":                                      "4063843386", // v0.5.0 諫山創 講談社
  "進撃の巨人|5":                                      "4063845133",
  "遊戯王|1":                                          "4088723112",
  "ワンパンマン|1":                                    "408870701X", // v0.2.1 で追加
  "ワンパンマン|2":                                    "4088707028", // v0.5.0 ONE/村田雄介 2012-12
  "らんま1/2|1":                                       "4091220312", // v0.2.1 で追加（旧版）
};

const VERSION_TAGS = ["新装版", "完全版", "文庫版", "新書判", "ワイド版", "愛蔵版", "特装版"];

function buildKey(ipName, volume, tags) {
  const tagSet = new Set(tags.split(",").filter(Boolean));
  const versionWanted = VERSION_TAGS.find(v => tagSet.has(v));
  if (versionWanted) {
    const versionedKey = `${ipName}|${volume}|${versionWanted}`;
    if (ASIN_MAP[versionedKey]) return versionedKey;
  }
  return `${ipName}|${volume}`;
}

function asinToCoverUrl(asin) {
  return `https://m.media-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg`;
}

const scan = db.prepare("SELECT id FROM ComicFirstPrintScan ORDER BY createdAt DESC LIMIT 1").get();
if (!scan) { console.error("scan なし"); process.exit(1); }

const groups = db.prepare(`
  SELECT id, ipName, volume, tags, coverUrl, asin FROM ComicFirstPrintGroup
  WHERE scanId = ?
`).all(scan.id);

const update = db.prepare(`UPDATE ComicFirstPrintGroup SET coverUrl = ?, asin = ? WHERE id = ?`);

let updated = 0, skipped = 0, missing = 0;
const missingList = [];

for (const g of groups) {
  // 既にAmazon ASIN系のcoverUrlが入ってたらスキップ
  if (g.asin) { skipped++; continue; }

  const key = buildKey(g.ipName, g.volume, g.tags);
  const asin = ASIN_MAP[key];
  if (!asin) {
    if (!g.coverUrl) {
      missing++;
      missingList.push({ ipName: g.ipName, volume: g.volume, tags: g.tags, key });
    }
    continue;
  }

  const coverUrl = asinToCoverUrl(asin);
  update.run(coverUrl, asin, g.id);
  updated++;
  console.log(`✔ ${g.ipName} ${g.volume}巻 [${g.tags}] → ASIN ${asin}`);
}

console.log(`\n▶ Amazon更新: ${updated} / 楽天既存スキップ: ${skipped} / マッチなし: ${missing}`);
if (missingList.length > 0) {
  console.log("\nASIN_MAP 未登録:");
  missingList.forEach(m => console.log(`  - ${m.key}`));
}

// 全体サマリー
const finalStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN coverUrl IS NOT NULL THEN 1 ELSE 0 END) as withCover,
    SUM(CASE WHEN asin IS NOT NULL THEN 1 ELSE 0 END) as withAsin
  FROM ComicFirstPrintGroup WHERE scanId = ?
`).get(scan.id);
console.log(`\n▶ 最終: ${finalStats.withCover}/${finalStats.total} に書影 (Amazon ASIN付き: ${finalStats.withAsin})`);
