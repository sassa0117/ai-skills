/**
 * コミックIP正規化ライブラリ (scan / data-fixes / 2025-pickup 共用)
 *
 * 公開関数:
 *   - normalizeStrip(s): 装飾文字/不可視文字/プレフィックス除去のみ
 *   - normalizeIP(rawIP, { strict }):
 *       1. rawIP に normalizeStrip を適用
 *       2. comic-ip-normalize.json の各 patterns に対し match試行 → 先勝ちで canonical を返す
 *       3. 全 miss の場合:
 *          - strict=true: null を返す
 *          - strict=false (default): stripped (装飾除去後の文字列) を返す。
 *            装飾除去で何も変わらなかった場合は null を返す。
 *
 * このライブラリは feedback_use-self-for-text-classification.md に従い
 * Claude (regex) のみで判定する。Gemini/外部LLM は呼ばない。
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NORMALIZE_MAP_PATH = path.join(__dirname, "..", "comic-ip-normalize.json");

export const DECORATION_RE = /[✴✴︎★☆⭐⭐︎✨※♪✿❤❥＊*◆■□◇▲△▽▼◎●○♡♥◉◈❖✦✧❀✼✽❁]/g;
export const INVISIBLE_RE = /[​-‍﻿⁠]/g;

const PREFIX_RE = /^(漫画|本|品|新品|中古|美品|希少|レア|初版本|印刷版|コミック|ノベル|激|単行本|送料無料|有り|絶版品|絶版|希少品|名作|名著|まんが|全巻|最終値下げ|盗難防止用|観賞用|小説|新装版|完全版|愛蔵版|文庫版|ワイド版|新書判|ライトノベルその他サイズ|韓国BL)\s+/i;
const SUFFIX_RE = /\s+(漫画|本|まんが|新品|中古|美品|希少|レア|単行本|全巻|既刊|本)\s*$/i;
const USER_PREFIX_RE = /^[A-Za-zＡ-Ｚａ-ｚぁ-んァ-ヶ\d\*✨★☆]{1,5}[〜～。\.]?\s*様\s+/;
const PUNCT_PREFIX_RE = /^[、,\.。\s]+(?:第[一二三四五六七八九十百千万０-９0-9]+刷[、,\s]*)?/;
const SYMBOL_PREFIX_RE = /^[①②③④⑤⑥⑦⑧⑨⑩\d]+\s+/;
const DATE_PREFIX_RE = /^\d{1,2}\/\d{1,2}\s+/;
const NUM_PREFIX_RE = /^\d+\s+(?=[ぁ-んァ-ヶ一-龯])/;
const BRACKET_HEAD_RE = /^[「『【《〈〔\[［]+\s*[^」』】》〉〕\]］]{0,15}[」』】》〉〕\]］]+\s*/;
const BRACKET_TAIL_RE = /[」』】》〉〕\]］]+$/;
const VOL_RANGE_TAIL_RE = /\s*\d+\s*[～〜~ｰー-]\s*$/;

export function normalizeStrip(s) {
  if (!s) return s;
  let out = String(s);
  out = out.replace(INVISIBLE_RE, "");
  out = out.replace(DECORATION_RE, "");
  out = out.replace(USER_PREFIX_RE, "");
  out = out.replace(PUNCT_PREFIX_RE, "");
  out = out.replace(SYMBOL_PREFIX_RE, "");
  out = out.replace(PREFIX_RE, "");
  out = out.replace(SUFFIX_RE, "");
  out = out.replace(DATE_PREFIX_RE, "");
  out = out.replace(NUM_PREFIX_RE, "");
  out = out.replace(BRACKET_HEAD_RE, "");
  out = out.replace(BRACKET_TAIL_RE, "");
  out = out.replace(VOL_RANGE_TAIL_RE, "");
  // 鑑定品ラベル+グレード値 (BGS 9.8, PSA 10 等) を ipName 文字列から除去
  // (extractCondition が condition="鑑定品" / gradeRank="BGS 9.8" として別カラムに保存済み)
  // 注意: 英字ラベル(PSA/BGS/CGC/ARS)は word boundary 必須 (MARSHAL/MARSH の中の ARS/MARS を誤食しないため)
  out = out.replace(/\b(?:PSA|BGS|CGC|ARS)\s*\d+(?:\.\d+)?\b/gi, " ");
  out = out.replace(/\b(?:PSA|BGS|CGC|ARS)\b/gi, " ");
  out = out.replace(/漫画鑑定\s*\d+(?:\.\d+)?/g, " ");
  out = out.replace(/(?:漫画鑑定|鑑定品|グレーディング|グレード付)/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

let cachedMap = null;
function loadMap() {
  if (cachedMap) return cachedMap;
  const raw = JSON.parse(fs.readFileSync(NORMALIZE_MAP_PATH, "utf-8"));
  cachedMap = Object.entries(raw).map(([canonical, patterns]) => ({
    canonical,
    regexes: patterns.map(p => new RegExp(p, "i")),
  }));
  return cachedMap;
}

export function normalizeIP(rawIP, { strict = false } = {}) {
  if (!rawIP) return null;
  const stripped = normalizeStrip(rawIP);
  const map = loadMap();
  for (const { canonical, regexes } of map) {
    for (const re of regexes) {
      if (re.test(stripped)) return canonical;
    }
  }
  if (strict) return null;
  return stripped && stripped !== rawIP ? stripped : null;
}
