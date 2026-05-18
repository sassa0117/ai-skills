/**
 * メルカリsold共通フィルタ
 * - 強化版NGパターン（複数賞・ラストワン・全角数字・計N点・賞.*セット）
 * - MUSTキーワード抽出（「」内副題 + productType略称 + キャラ名 + 一番くじA〜Z賞）
 * - スコアリング判定（3条件のうち2つ以上でtrue）
 * - 相対除外（駿河屋名に無い固有名詞が多いsoldを除外）
 *
 * 共通ユースケース:
 *   import { filterSoldList } from "./lib/sold-filter.mjs";
 *   const matched = filterSoldList(solds, { surugayaName, productType, characterName, mercariKeyword });
 */

// productType略称辞書（メルカリ側でよく使われる略称）
export const PRODUCT_TYPE_ALIASES = {
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

// 一般ストップワード（副題抽出時に除去）
const GENERAL_STOPWORDS = /劇場版|THE MOVIE|the movie|映画|ver\.|Ver\.|VER\.|ver|Ver|コレクション|エディション|限定|特別|版|【|】|『|』|〜|～/gi;

// 強化NGパターン（明らかにセット・まとめ系）
export const EXCLUDE_PATTERNS = [
  // 既存
  /まとめ/i, /セット売り/i, /まとめ売り/i, /コンプ/i, /コンプリート/i,
  /1ロット/i, /一式/i, /全種/i, /全\d+種/i, /大量/i, /引退/i, /まとめて/i,
  /\dロット/i, /ロット売り/i, /セット販売/i, /おまとめ/i, /一括/i, /福袋/i,
  /フルコンプ/i, /全種類/i, /まとめ出品/i, /全賞/i, /コンプセット/i,

  // 複数賞混在
  /[A-ZＡ-Ｚ]賞[^賞]{0,40}[A-ZＡ-Ｚ]賞/i,
  /[A-ZＡ-Ｚ]賞[^賞]{0,40}ラストワン/i,
  /ラストワン[^賞]{0,40}[A-ZＡ-Ｚ]賞/i,

  // N点系
  /[\d０-９]+点/,
  /計[\d０-９一二三四五六七八九十]+[点個種枚]/,
  /[一二三四五六七八九十]+点セット/,

  // ○個セット / ×N個
  /[\d０-９]+[個種枚本点]\s*セット/,
  /×[\d０-９]+/,

  // 単独「セット」（慎重に）
  /\sセット$/,
  /　セット$/,
  / セット /,
  /賞.*セット/i,
];

export function isExcludedByPattern(name) {
  if (!name) return true;
  return EXCLUDE_PATTERNS.some((p) => p.test(name));
}

// 表記ゆれ正規化
export function normalize(s) {
  if (!s) return "";
  return s
    .replace(/篇/g, "編")
    .replace(/一番くじ/g, "1番くじ")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 駿河屋商品名＋productTypeからMUSTキーワードを抽出
export function extractMustKeywords(surugayaName, productType, mercariKeyword) {
  const quoted = surugayaName.match(/「(.+?)」/);
  const subtitle = quoted ? quoted[1] : surugayaName;

  let cleaned = subtitle.replace(GENERAL_STOPWORDS, " ");

  const mkTokens = (mercariKeyword || "").split(/[\s　]+/).filter((t) => t.length >= 3);
  for (const t of mkTokens) {
    cleaned = cleaned.split(t).join(" ");
  }

  const subtitleTokens = cleaned
    .split(/[\s　・/／、。,.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  const typeAliases = PRODUCT_TYPE_ALIASES[productType] || (productType ? [productType] : []);

  return { subtitleTokens, typeAliases };
}

// 相対除外: soldの固有名詞が駿河屋名に一切現れないなら別商品
function relativeExclude(soldName, referenceText) {
  const ref = normalize(referenceText);
  const tokens = (soldName.match(/[ァ-ヶー]{3,}|[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ\-]{2,}/g) || [])
    .filter((t) => t.length >= 3);

  const commonWords = new Set([
    "フィギュア", "未開封", "未使用", "新品", "中古", "箱無し", "箱あり",
    "バンダイ", "BANDAI", "SPIRITS", "国内正規品", "海外正規品", "プライズ",
    "ラストワン", "匿名配送", "即購入", "値下げ", "専用",
  ]);
  const significant = tokens.filter((t) => !commonWords.has(t));

  if (significant.length === 0) return { excluded: false, foreign: [] };
  const foreign = significant.filter((t) => !ref.includes(normalize(t)));
  if (foreign.length >= 2 && foreign.length / significant.length >= 0.5) {
    return { excluded: true, foreign };
  }
  return { excluded: false, foreign };
}

// 一番くじ賞ラベル抽出: "A賞", "B賞" ... "Z賞", "ラストワン賞", "ラスト賞"
function extractKujiPrize(name) {
  if (!name) return null;
  if (/ラストワン|ラスト賞/i.test(name)) return "LAST";
  // 賞名は前後の空白・記号で区切られる単発の[A-Z]+「賞」のみ拾う（複数賞は EXCLUDE_PATTERNS 側で弾く前提）
  const m = name.match(/(?:^|[\s「【\[（(])([A-ZＡ-Ｚ])賞/);
  if (m) {
    const ch = m[1];
    // 全角→半角
    const half = ch.charCodeAt(0) >= 0xFF21 && ch.charCodeAt(0) <= 0xFF3A
      ? String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
      : ch;
    return half.toUpperCase();
  }
  return null;
}

// スコアリング判定（subtitle/type/characterの3条件のうち2つ以上true）
export function matchSold(soldName, ctx) {
  if (!soldName) return { ok: false, reason: "no-name" };
  const { subtitleTokens, typeAliases, characterName, isIchibankuji, referenceText, surugayaName } = ctx;
  const n = normalize(soldName);

  // 相対除外
  const rel = relativeExclude(soldName, referenceText);
  if (rel.excluded) return { ok: false, reason: `foreign:${rel.foreign.slice(0, 3).join(",")}` };

  // 一番くじ: 駿屋に賞ラベルがあれば sold 側も一致必須（不一致なら別キャラ・別賞）
  if (isIchibankuji && surugayaName) {
    const suruPrize = extractKujiPrize(surugayaName);
    if (suruPrize) {
      const soldPrize = extractKujiPrize(soldName);
      if (soldPrize && soldPrize !== suruPrize) {
        return { ok: false, reason: `prize-mismatch:${suruPrize}vs${soldPrize}` };
      }
      // soldに賞ラベル無し→characterNameが必要（後段でcharHitチェック）
    }
  }

  const subtitleHit = subtitleTokens.some((t) => n.includes(normalize(t)));
  const typeHit =
    typeAliases.some((t) => n.includes(normalize(t))) ||
    (isIchibankuji && /[a-z]賞/i.test(soldName));
  const charHit = characterName ? n.includes(normalize(characterName)) : false;

  const score = (subtitleHit ? 1 : 0) + (typeHit ? 1 : 0) + (charHit ? 1 : 0);
  const tags = `s${subtitleHit ? 1 : 0}t${typeHit ? 1 : 0}c${charHit ? 1 : 0}`;

  // 一番くじでcharacterNameありの場合、char必須（賞ラベル一致+subtitleだけだと別キャラが通る）
  if (isIchibankuji && characterName && !charHit) {
    return { ok: false, reason: `kuji-no-char ${tags}` };
  }

  if (score >= 2) return { ok: true, reason: tags };
  return { ok: false, reason: `score=${score} ${tags}` };
}

/**
 * メルカリsoldリストに、NGパターン＋MUSTフィルタを一括適用
 * @param {Array} solds - メルカリAPI結果（{name, price, ...}[]）
 * @param {Object} ctx - { surugayaName, productType, characterName, mercariKeyword, listPrice }
 * @returns {Array} 通過したsold
 */
export function filterSoldList(solds, ctx) {
  const { surugayaName, productType, characterName, mercariKeyword, listPrice } = ctx;

  // 1) NGパターン
  let filtered = solds.filter((s) => !isExcludedByPattern(s.name));

  // 1.5) 相対セット除外: 駿屋名にセット系語が無いのにsold側にあるなら別商品
  const SET_HINTS = /セット|まとめ|コンプ|全種|フルコンプ|まとめ売り|一式/;
  if (!SET_HINTS.test(surugayaName)) {
    filtered = filtered.filter((s) => !SET_HINTS.test(s.name));
  }

  // 2) 価格フィルタ
  if (listPrice) {
    const maxPrice = listPrice * 5;
    filtered = filtered.filter((s) => s.price <= maxPrice);
  }

  // 3) MUSTフィルタ
  const must = extractMustKeywords(surugayaName, productType, mercariKeyword);
  const judgeCtx = {
    subtitleTokens: must.subtitleTokens,
    typeAliases: must.typeAliases,
    characterName,
    isIchibankuji: surugayaName.includes("一番くじ"),
    referenceText: `${surugayaName} ${mercariKeyword || ""}`,
    surugayaName,
  };
  return filtered.filter((s) => matchSold(s.name, judgeCtx).ok);
}
