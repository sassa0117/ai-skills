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

const PREFIX_RE = /^(漫画|本|品|新品|中古|美品|希少|レア|初版本|印刷版|コミック|ノベル|激|単行本|送料無料|有り)\s+/i;
const DATE_PREFIX_RE = /^\d{1,2}\/\d{1,2}\s+/;
const NUM_PREFIX_RE = /^\d+\s+(?=[ぁ-んァ-ヶ一-龯])/;
const BRACKET_HEAD_RE = /^[「『【《〈〔]+/;
const BRACKET_TAIL_RE = /[」』】》〉〕]+$/;
const VOL_RANGE_TAIL_RE = /\s*\d+\s*[～〜~ｰー-]\s*$/;

export function normalizeStrip(s) {
  if (!s) return s;
  let out = String(s);
  out = out.replace(INVISIBLE_RE, "");
  out = out.replace(DECORATION_RE, "");
  out = out.replace(PREFIX_RE, "");
  out = out.replace(DATE_PREFIX_RE, "");
  out = out.replace(NUM_PREFIX_RE, "");
  out = out.replace(BRACKET_HEAD_RE, "");
  out = out.replace(BRACKET_TAIL_RE, "");
  out = out.replace(VOL_RANGE_TAIL_RE, "");
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
