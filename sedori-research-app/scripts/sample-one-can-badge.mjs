/**
 * 缶バッジ記事 サンプル1件取得スクリプト
 * 合意フローに従って 1ペアだけ完走させ、HTMLプレビューを出す。
 *
 * フロー反映:
 *   - シリーズ内の柄違い・キャラ違いは除外しない
 *   - 別グッズ(アクスタ/アクリル等)・まとめ売り・別ストアだけ除外
 *   - スクショは商品グリッド要素だけを DOM 単位で切る (PR・関連商品が映らない)
 *   - 1ペアだけ。ユーザー確認後に残り49件へ展開
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.resolve(PROJECT_ROOT, "..");

// CLI 引数
const argv = process.argv.slice(2);
const getArg = (n, def = null) => {
  const i = argv.indexOf(n);
  return i === -1 ? def : argv[i + 1];
};
const ARG_SERIES = getArg("--series");
const ARG_PRODUCT = getArg("--product");
const ARG_OUTPUT = getArg("--output", "sample-1");
const ARG_EXTRA_EXCLUDE = getArg("--exclude-extra", "");
const ARG_PRICE_MIN = parseInt(getArg("--price-min", "3000"), 10);
const ARG_MAX_ITEMS = parseInt(getArg("--max-items", "0"), 10); // 0=全件採用
// スクショ縦長対策: メルカリ商品グリッド 5列 × 縦3行 ≒ 4:3 が標準。none=従来通り全件
const ARG_ASPECT = getArg("--aspect", "4:3");
const ASPECT_RATIO = (() => {
  if (!ARG_ASPECT || ARG_ASPECT === "none") return null;
  const m = ARG_ASPECT.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
})();
// --resume-screenshot: 既存 items-*.json を読んで Step 3 (スクショ) と Step 4 (HTML) だけ走らせる
const ARG_RESUME_SCREENSHOT = argv.includes("--resume-screenshot");

const OUTPUT_DIR = path.join(PROJECT_ROOT, "output", "can-badge", ARG_OUTPUT);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const require = createRequire(import.meta.url);
const generateMercariJwt = require("generate-mercari-jwt").default || require("generate-mercari-jwt");

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key.trim()]) process.env[key.trim()] = rest.join("=").trim();
  }
}
loadEnv(path.join(SKILLS_ROOT, ".env"));
loadEnv(path.join(SKILLS_ROOT, "alert-app", ".env"));

const AFID = "1057058815";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ARG_NO_VISION = argv.includes("--no-vision");

// === ペア指定 ===
// CLI 引数優先、無ければデフォルト (sample-1 = 銀魂×キャラポップストア)
const SERIES = ARG_SERIES || "銀魂";
const PRODUCT = ARG_PRODUCT || "キャラポップストア スクエア缶バッジ";
const KEYWORD = `${SERIES} ${PRODUCT}`;
// 別グッズ+まとめ売りベース (全ペア共通)
// 合意フロー2のNG_OTHER_GOODS / NG_BUNDLE を API 側 exclude_keyword にも反映
// → アンバサダーリンク先(=メルカリ検索URL)もスクショと同じ綺麗な結果になる
const EXCLUDE_BASE = [
  // まとめ売り・セット
  "セット", "まとめ売り", "まとめ", "詰め合わせ", "福袋", "コンプ", "全種", "台紙付",
  // 別グッズ (缶バッジと紛らわしい)
  "アクスタ", "アクキー", "アクリル", "ピンバッジ", "ピンバッチ", "ビンズ",
  "ガラポン",
  "ブロマイド", "原画", "イラストボード", "アートボード", "複製原画",
  "特典カード", "クリアファイル", "ポストカード", "ステッカー", "ポスター",
  "キーホルダー", "ラバスト", "ストラップ",
  "DVD", "Blu-ray", "サウンドトラック",
  "タオル", "マグカップ", "クッション", "ぬいぐるみ",
  "フィギュア", "ねんどろいど",
].join(" ");
// 合意フロー4-d で動的決定したキャラ除外語 (--exclude-extra で渡す)
const EXCLUDE = ARG_EXTRA_EXCLUDE
  ? `${EXCLUDE_BASE} ${ARG_EXTRA_EXCLUDE}`
  : EXCLUDE_BASE;

const MERCARI_SEARCH_URL = "https://api.mercari.jp/v2/entities:search";

async function searchMercari({ keyword, excludeKeyword = "", priceMin = 0, pageSize = 120 }) {
  const dpop = await generateMercariJwt(MERCARI_SEARCH_URL, "POST");
  const searchCondition = {
    keyword,
    sort: "SORT_CREATED_TIME",
    order: "ORDER_DESC",
    status: ["STATUS_SOLD_OUT"],
  };
  if (excludeKeyword) searchCondition.excludeKeyword = excludeKeyword;
  if (priceMin > 0) searchCondition.priceMin = String(priceMin);
  const body = {
    searchSessionId: crypto.randomUUID(),
    pageSize: Math.min(pageSize, 120),
    searchCondition,
  };
  const res = await fetch(MERCARI_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", DPoP: dpop, "X-Platform": "web" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mercari ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.items || []).map(it => ({
    id: it.id,
    name: it.name,
    price: typeof it.price === "string" ? parseInt(it.price, 10) : it.price,
    thumbnailUrl: Array.isArray(it.thumbnails) && it.thumbnails.length ? it.thumbnails[0] : null,
  }));
}

// 合意フロー2: タイトルレベルで弾く (缶バッジじゃない・別グッズ・まとめ売り・専用出品)
const GOOD_BADGE_RE = /缶\s*バッ(ジ|ヂ|チ)/;
const GOOD_BADGE_AS_BONUS_RE = /(缶\s*バッ(ジ|ヂ|チ))\s*付き|特典\s*の?\s*(缶\s*バッ(ジ|ヂ|チ))/;
const NG_OTHER_GOODS = [
  "タオル", "ブロマイド", "アクリルブロック", "アクリルスタンド", "アクリルコースター",
  "アクリルパネル", "アクリルプレート", "アクリルキーホルダー",
  "アクスタ", "アクコ", "アクキー", "ぱしゃこれ", "グラッテ", "Gratte",
  "ピンバッジ", "ピンバッチ", "メタルバッジ",
  "エアフレッシャー", "マスキングテープ", "マステ", "缶ミラー",
  "Blu-ray", "Blu-Ray", "BD", "DVD", "完全生産限定版", "サウンドトラック",
  "キーホルダー", "キーチェーン", "ストラップ", "ラバスト", "ラバーストラップ",
  "シャツ", "タンブラー", "マグカップ", "クッション", "ぬいぐるみ",
  "ポストカード", "クリアファイル", "ステッカー", "シール", "ポスター",
  "フィギュア", "ねんどろいど", "ダーツ",
  "原画", "イラストボード", "アートボード", "複製原画", "生ブロマイド", "特典カード",
];
const NG_BUNDLE = [
  "まとめ売り", "まとめ商品", "グッズまとめ", "まとめて", "詰め合わせ", "福袋",
  "グッズセット", "セット売り", "コンプ", "コンプリート", "全種",
  "座席特典", "特典セット", "バッジセット", "台紙付",
];
const NG_BUNDLE_REGEX = [
  /\d+\s*個\s*(セット|入り|まとめ)/,
  /[2-9]\s*個/,
  /\d{2,}\s*個/,
  /\d+\s*点\s*(セット|まとめ)?/,
  /\d+\s*枚/,
  /[2-9]\s*種/,
  /\d{2,}\s*種/,
];
const NG_TITLE_PATTERNS = [
  { re: /専用/, label: "専用出品" },
];

function checkTitleNG(name) {
  if (!name) return null;
  if (!GOOD_BADGE_RE.test(name)) return { label: "缶バッジ語なし", matched: "(なし)" };
  if (GOOD_BADGE_AS_BONUS_RE.test(name)) return { label: "缶バッジ付帯(本体別)", matched: name.match(GOOD_BADGE_AS_BONUS_RE)[0] };
  for (const ng of NG_OTHER_GOODS) {
    if (name.includes(ng)) return { label: `別グッズ:${ng}`, matched: ng };
  }
  for (const ng of NG_BUNDLE) {
    if (name.includes(ng)) return { label: `まとめ:${ng}`, matched: ng };
  }
  for (const re of NG_BUNDLE_REGEX) {
    const m = name.match(re);
    if (m) return { label: `数量:${m[0]}`, matched: m[0] };
  }
  for (const { re, label } of NG_TITLE_PATTERNS) {
    const m = name.match(re);
    if (m) return { label, matched: m[0] };
  }
  return null;
}

const MERCARI_ITEM_URL = "https://api.mercari.jp/items/get";

async function fetchItemDescription(itemId) {
  const url = `${MERCARI_ITEM_URL}?id=${itemId}`;
  const dpop = await generateMercariJwt(url, "GET");
  const res = await fetch(url, { headers: { DPoP: dpop, "X-Platform": "web" } });
  if (!res.ok) return null;
  const j = await res.json();
  const d = j.data || j;
  return d.description || "";
}

// 説明文中の「実質まとめ売り」検出パターン
const NG_DESCRIPTION_PATTERNS = [
  { re: /バラ売り\s*[×✕✗❌不]/, label: "バラ売り不可明記" },
  { re: /バラ売\s*不可/, label: "バラ売不可明記" },
  { re: /ばら売り\s*[×✕✗❌不]/, label: "ばら売り不可" },
  { re: /個別\s*[×✕✗❌不]/, label: "個別販売不可" },
  { re: /まとめ売り/, label: "まとめ売り" },
  { re: /まとめ\s*商品/, label: "まとめ商品" },
  { re: /セット\s*売り/, label: "セット売り" },
  { re: /セット\s*販売/, label: "セット販売" },
  { re: /[2-9]\s*個\s*(セット|まとめ|入り)/, label: "n個セット" },
  { re: /\d{2,}\s*個\s*(セット|まとめ|入り)/, label: "n個セット" },
  { re: /\d{1,2}\s*点\s*(セット|まとめ)/, label: "n点セット" },
  { re: /\d{1,2}\s*枚\s*(セット|まとめ)/, label: "n枚セット" },
  { re: /[A-Ea-e]賞\s*[×x✕]\s*\d/, label: "n賞×複数" },
  { re: /全\s*\d{1,2}\s*種/, label: "全n種" },
  { re: /コンプ(リート)?\s*セット/, label: "コンプセット" },
];

function checkDescriptionNG(desc) {
  if (!desc) return null;
  for (const { re, label } of NG_DESCRIPTION_PATTERNS) {
    const m = desc.match(re);
    if (m) return { label, matched: m[0] };
  }
  return null;
}

async function filterByDescription(items, concurrency = 5) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const it = items[i];
      try {
        const desc = await fetchItemDescription(it.id);
        const ng = checkDescriptionNG(desc);
        results[i] = { ...it, description: desc, ng };
      } catch (e) {
        results[i] = { ...it, description: null, ng: null, _fetchError: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ========================================
// Gemini Vision: 写真ベースまとめ売り判定
// ========================================
function toHighResUrl(thumbUrl) {
  if (!thumbUrl) return null;
  // thumb/item/webp/m{id}_N.jpg → item/detail/orig/photos/m{id}_N.jpg
  const m = thumbUrl.match(/^(https:\/\/static\.mercdn\.net)\/thumb\/item\/webp\/(m\w+_\d+)\.jpg(\?.*)?$/);
  if (m) return `${m[1]}/item/detail/orig/photos/${m[2]}.jpg${m[3] || ""}`;
  return thumbUrl;
}

async function fetchImageAsBase64(thumbUrl) {
  const hiUrl = toHighResUrl(thumbUrl);
  // 高解像度を試して失敗したら thumb にフォールバック
  for (const url of [hiUrl, thumbUrl].filter(Boolean)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = r.headers.get("content-type") || (url.endsWith(".jpg") ? "image/jpeg" : "image/webp");
      return { base64: buf.toString("base64"), mime, url };
    } catch { /* try next */ }
  }
  throw new Error("image fetch failed");
}

async function callGeminiVision(imageBase64, mime, prompt, model = "gemini-2.5-flash-lite", retries = 2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mime, data: imageBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.0, maxOutputTokens: 256, responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (/503|429|500|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(`${res.status} ${body}`) && attempt < retries) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Gemini ${res.status}: ${body}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini empty response");
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (attempt < retries && /503|429|500|UNAVAILABLE|fetch failed|network/i.test(e.message)) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const VISION_PROMPT = `この画像はメルカリの缶バッジ出品のサムネ写真です。次のステップで順に判定してください。

ステップ1: 画像に写っている缶バッジを **正確に数えて** count_badges に入れる。重なっていても、半分隠れていても全部カウント。同じデザインが並んでいてもそれぞれカウント。
ステップ2: 画像に「×10」「x7」「✕5」のような掛け算表記があれば multiplier_text にその文字列、無ければ null。
ステップ3: 缶バッジ以外のグッズ（アクキー・コースター・ステッカー・ブロマイド等）が一緒に写っているか other_goods に true/false。
ステップ4: 判定 kind:
  - "multi": count_badges >= 2、または multiplier_text が null でない、または other_goods=true
  - "single": count_badges == 1 かつ multiplier_text=null かつ other_goods=false

JSON返答: { "count_badges": 数字, "multiplier_text": "×Nまたはnull", "other_goods": true|false, "kind": "single"|"multi", "reason": "短い理由（日本語）" }`;

// 保険ガード: count_badges>=2、multiplier_text 検出、other_goods=true、reason 内×N の場合は強制 multi
function applyVisionGuard(v) {
  if (!v || typeof v !== "object") return v;
  const reason = String(v.reason || "");
  const countFlag = typeof v.count_badges === "number" && v.count_badges >= 2;
  const multiplierFlag = v.multiplier_text && v.multiplier_text !== "null" && String(v.multiplier_text).trim() !== "";
  const otherGoodsFlag = v.other_goods === true;
  // 「掛け算/マルチ表記」キーワードは Vision が否定形で書く事があるので除外。数字隣接の×/xだけ拾う
  const multiplierInReason = /[×✕✗]\s*\d|\d\s*[×✕✗]|[xX]\s*\d{1,3}\b|\d{1,3}\s*[xX]\b/.test(reason);
  // 否定形（「ありません」「なし」「写っていません」）が reason に含まれる場合はガード発動を抑制
  const negationInReason = /(ありません|なし|写っていません|含まれていません|存在しません|無い|ない\b)/.test(reason);
  // multiplierInReason は否定形がある場合無視（誤検出防止）
  const reasonGuardEffective = multiplierInReason && !negationInReason;
  if (v.kind === "single" && (countFlag || multiplierFlag || otherGoodsFlag || reasonGuardEffective)) {
    const triggered = [];
    if (countFlag) triggered.push(`count_badges=${v.count_badges}`);
    if (multiplierFlag) triggered.push(`multiplier=${v.multiplier_text}`);
    if (otherGoodsFlag) triggered.push("other_goods");
    if (reasonGuardEffective) triggered.push("reason に×N表記");
    return { ...v, kind: "multi", _guard: triggered.join(", "), reason: `[guard: ${triggered.join("/")}] ${reason}` };
  }
  return v;
}

async function classifyByVision(items, concurrency = 4) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const it = items[i];
      try {
        const { base64, mime } = await fetchImageAsBase64(it.thumbnailUrl);
        const v = await callGeminiVision(base64, mime, VISION_PROMPT);
        results[i] = { ...it, vision: applyVisionGuard(v) };
      } catch (e) {
        results[i] = { ...it, vision: { kind: "unknown", error: e.message } };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function buildMercariSearchUrl({ keyword, excludeKeyword }) {
  const params = new URLSearchParams({
    afid: AFID,
    keyword,
    order: "desc",
    sort: "created_time",
    status: "sold_out",
    price_min: String(ARG_PRICE_MIN),
  });
  if (excludeKeyword) params.set("exclude_keyword", excludeKeyword);
  return `https://jp.mercari.com/search?${params.toString()}`;
}

async function takeGridScreenshot(browser, url, outPath, excludeItemIds = []) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 2000 });
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // NG非表示の "前" に全 cells の left/right を測る (列幅をDOM操作で潰さないため)
    const gridWidth = await page.evaluate(() => {
      const cells = document.querySelectorAll('a[href*="/item/"], a[href*="/shops/product/"], a[href*="/products/"]');
      if (!cells.length) return null;
      let minX = Infinity, maxX = 0;
      cells.forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const left = r.left + window.scrollX;
        const right = r.right + window.scrollX;
        minX = Math.min(minX, left);
        maxX = Math.max(maxX, right);
      });
      return { minX: Math.floor(minX), maxX: Math.ceil(maxX) };
    });

    // NG出品ID (実質まとめ売り) のセルを DOM から非表示にする
    if (excludeItemIds.length) {
      const hiddenCount = await page.evaluate((ids) => {
        const set = new Set(ids);
        let hidden = 0;
        // /item/{id}, /shops/product/{id}, /products/{id} 全パターン対応
        document.querySelectorAll('a[href*="/item/"], a[href*="/shops/"], a[href*="/products/"]').forEach(a => {
          const href = a.getAttribute("href") || "";
          let m = href.match(/\/item\/([^/?#]+)/);
          if (!m) m = href.match(/\/shops\/product\/([^/?#]+)/);
          if (!m) m = href.match(/\/products\/([^/?#]+)/);
          if (m && set.has(m[1])) {
            // セルのコンテナごと非表示にする (li や grid item)
            let target = a;
            for (let i = 0; i < 5 && target.parentElement; i++) {
              const p = target.parentElement;
              if (p.tagName === "LI" || (p.getAttribute && p.getAttribute("data-testid") === "item-cell")) {
                target = p;
                break;
              }
              target = p;
            }
            target.style.display = "none";
            hidden++;
          }
        });
        return hidden;
      }, excludeItemIds);
      console.log(`  DOM非表示: ${hiddenCount}件 (NG ID: ${excludeItemIds.join(", ")})`);
      await new Promise(r => setTimeout(r, 500)); // レイアウト再計算待ち
    }

    // 商品グリッドの bounding box を計算 (PR枠・関連商品セクションは含めない)
    const clip = await page.evaluate(() => {
      const selectorCandidates = [
        // /item/{id} と /shops/product/{id} 両方カバー
        'a[href*="/item/"], a[href*="/shops/product/"], a[href*="/products/"]',
        'li[data-testid="item-cell"]',
        '[data-testid="item-cell"]',
        'mer-item-thumbnail',
      ];
      const debug = {};
      for (const sel of selectorCandidates) {
        debug[sel] = document.querySelectorAll(sel).length;
      }
      let cells = [];
      let usedSelector = null;
      for (const sel of selectorCandidates) {
        const found = document.querySelectorAll(sel);
        if (found.length >= 1) { cells = found; usedSelector = sel; break; }
      }
      if (!cells.length) {
        return { error: "no cells", debug };
      }
      // セルの最上端 y を先に求める
      const visibleCells = Array.from(cells).filter(c => {
        const r = c.getBoundingClientRect();
        return !(r.width === 0 && r.height === 0);
      });
      const minCellTop = visibleCells.length
        ? Math.min(...visibleCells.map(c => c.getBoundingClientRect().top + window.scrollY))
        : 0;
      // 「他のサイトの関連広告」「検索条件が似ている商品」の境界
      // ただし境界がセル最上端より上にある場合は無効（検索結果が少ない時の誤検出対策）
      const boundary = (() => {
        const all = document.querySelectorAll("h2, h3, h4, div, section, span");
        for (const h of all) {
          const t = (h.textContent || "").trim();
          // 直接子テキストだけ見たいので length 制限
          if (t.length > 200) continue;
          if (t.includes("他のサイトの関連広告") || t.includes("検索条件が似ている商品") || t.includes("関連広告")) {
            const y = h.getBoundingClientRect().top + window.scrollY;
            if (y > minCellTop) return y;
          }
        }
        return Infinity;
      })();

      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      let validCount = 0;
      const rejected = { aboveBoundary: 0, sample_tops: [] };
      cells.forEach((c, idx) => {
        const r = c.getBoundingClientRect();
        const top = r.top + window.scrollY;
        const bottom = r.bottom + window.scrollY;
        const left = r.left + window.scrollX;
        const right = r.right + window.scrollX;
        if (idx < 3) rejected.sample_tops.push({ top, left, w: r.width, h: r.height });
        // 非表示要素 (display:none) はスキップ
        if (r.width === 0 && r.height === 0) return;
        // PR枠/関連セクション内の要素を除外
        if (top >= boundary) { rejected.aboveBoundary++; return; }
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
        validCount++;
      });
      if (!validCount) return { error: "all cells filtered", debug, boundary, rejected };
      return {
        x: Math.floor(minX),
        y: Math.floor(minY),
        width: Math.ceil(maxX - minX),
        height: Math.ceil(maxY - minY),
        count: validCount,
        usedSelector,
        boundary,
        debug,
      };
    });

    // 列幅を NG非表示前の値で固定 (visible cells が少なくてもメルカリの3列gridを維持)
    if (!clip.error && gridWidth && gridWidth.maxX > gridWidth.minX) {
      clip.x = gridWidth.minX;
      clip.width = gridWidth.maxX - gridWidth.minX;
    }

    if (clip.error) {
      console.log("  clip debug:", JSON.stringify(clip, null, 2));
      throw new Error(`clip 失敗: ${clip.error}`);
    }
    console.log("  clip debug:", JSON.stringify(clip.debug || {}, null, 2));
    console.log(`  商品セル数: ${clip.count}, セレクタ: ${clip.usedSelector}`);
    console.log(`  clip: x=${clip.x} y=${clip.y} w=${clip.width} h=${clip.height}`);

    // ページ全体高さを取得して clip と比較 (clip がページ範囲外を指すとエラーになるので)
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    let targetHeight = clip.height + 16;
    // アスペクト比指定がある場合: 幅基準で頭から切り抜き
    if (ASPECT_RATIO) {
      const ratioHeight = Math.round((clip.width * ASPECT_RATIO.h) / ASPECT_RATIO.w);
      targetHeight = Math.min(targetHeight, ratioHeight);
      console.log(`  aspect ${ARG_ASPECT}: width=${clip.width} → height=${ratioHeight} (元 ${clip.height})`);
    }
    const safeHeight = Math.min(targetHeight, pageHeight - clip.y);

    const PADDING = 8;
    await page.screenshot({
      path: outPath,
      clip: {
        x: Math.max(0, clip.x - PADDING),
        y: Math.max(0, clip.y - PADDING),
        width: Math.min(1200, clip.width + PADDING * 2),
        height: safeHeight,
      },
    });
    return clip;
  } finally {
    await page.close();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function main() {
  console.log(`=== サンプル1件取得: ${SERIES} × ${PRODUCT} ===`);
  console.log(`KEYWORD: ${KEYWORD}`);
  console.log(`EXCLUDE: ${EXCLUDE}\n`);
  if (ARG_RESUME_SCREENSHOT) console.log(`★ --resume-screenshot: 既存 items-*.json を読み込み、Step 3〜4 だけ走らせる\n`);

  let rawItems, items, titleNgItems, enriched, survived, ngList;
  let visionNgList = [];
  let visionSurvived;

  if (ARG_RESUME_SCREENSHOT) {
    // 既存 output から読み込み
    const readJson = (n) => JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, n), "utf-8"));
    rawItems = readJson("items-raw.json");
    items = readJson("items.json");
    enriched = readJson("items-enriched.json");
    ngList = readJson("items-ng.json");
    survived = readJson("items-survived.json");
    // titleNgItems は items-raw と items の差分から復元
    const itemIdSet = new Set(items.map(it => it.id));
    titleNgItems = rawItems.filter(it => !itemIdSet.has(it.id)).map(it => ({ ...it, ng: checkTitleNG(it.name) || { label: "?", matched: "?" } }));
    // vision 結果
    const visionNgPath = path.join(OUTPUT_DIR, "items-vision-ng.json");
    const visionSurvivedPath = path.join(OUTPUT_DIR, "items-vision-survived.json");
    if (fs.existsSync(visionSurvivedPath)) {
      visionNgList = fs.existsSync(visionNgPath) ? readJson("items-vision-ng.json") : [];
      visionSurvived = readJson("items-vision-survived.json");
    } else {
      visionSurvived = survived;
    }
    console.log(`  読み込み: raw=${rawItems.length} / items=${items.length} / survived=${survived.length} / visionSurvived=${visionSurvived.length} / visionNg=${visionNgList.length}`);
  } else {
    // Step 1: メルカリAPI検索
    console.log(`Step 1: メルカリAPI検索 (priceMin=${ARG_PRICE_MIN})`);
    rawItems = await searchMercari({
      keyword: KEYWORD,
      excludeKeyword: EXCLUDE,
      priceMin: ARG_PRICE_MIN,
      pageSize: 120,
    });
    console.log(`  → ${rawItems.length}件ヒット (生)`);
    fs.writeFileSync(path.join(OUTPUT_DIR, "items-raw.json"), JSON.stringify(rawItems, null, 2));

    // Step 1.2: タイトルレベルNG (専用出品など)
    titleNgItems = [];
    items = rawItems.filter(it => {
      const ng = checkTitleNG(it.name);
      if (ng) { titleNgItems.push({ ...it, ng }); return false; }
      return true;
    });
    if (titleNgItems.length) {
      console.log(`\nStep 1.2: タイトルNGで ${titleNgItems.length}件除外`);
      titleNgItems.forEach(e => console.log(`    ✗ [¥${e.price}] ${e.name}  (${e.ng.label})`));
    }
    console.log(`\n  → タイトルNG後: ${items.length}件`);
    items.slice(0, 30).forEach((it, i) => console.log(`    ${i + 1}. [¥${it.price}] ${it.name}`));
    if (items.length > 30) console.log(`    ... 他 ${items.length - 30}件`);
    fs.writeFileSync(path.join(OUTPUT_DIR, "items.json"), JSON.stringify(items, null, 2));

    // Step 1.5: 各出品の説明文を取得し「実質まとめ売り」を弾く
    console.log(`\nStep 1.5: 商品説明文取得 → 実質まとめ売りフィルタ (n=${items.length})`);
    enriched = await filterByDescription(items, 5);
    survived = enriched.filter(e => !e.ng);
    ngList = enriched.filter(e => e.ng);
    console.log(`  → 実質単品: ${survived.length}件 / 実質まとめ売り: ${ngList.length}件`);
    ngList.forEach((e, i) => {
      console.log(`    ✗ [¥${e.price}] ${e.name}`);
      console.log(`        ┗ NG: ${e.ng.label} ("${e.ng.matched}")`);
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, "items-enriched.json"), JSON.stringify(enriched, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, "items-ng.json"), JSON.stringify(ngList, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, "items-survived.json"), JSON.stringify(survived, null, 2));

    // Step 1.6: Gemini Vision で写真ベースまとめ売り判定
    visionSurvived = survived;
    if (!ARG_NO_VISION && GEMINI_KEY && survived.length > 0) {
      console.log(`\nStep 1.6: Gemini Vision 写真判定 (n=${survived.length}, gemini-2.5-flash-lite)`);
      const classified = await classifyByVision(survived, 4);
      // unknown は安全側で multi 扱い（API失敗時に single 漏れを防ぐ）
      visionNgList = classified.filter(c => c.vision?.kind === "multi" || c.vision?.kind === "unknown");
      visionSurvived = classified.filter(c => c.vision?.kind === "single");
      console.log(`  → 写真単品: ${visionSurvived.length}件 / 写真まとめ: ${visionNgList.length}件`);
      visionNgList.forEach(e => {
        const v = e.vision || {};
        console.log(`    ✗ [¥${e.price}] ${e.name}`);
        console.log(`        ┗ Vision: count=${v.count_badges} multiplier=${v.multiplier_text} other_goods=${v.other_goods} reason=${v.reason}`);
      });
      fs.writeFileSync(path.join(OUTPUT_DIR, "items-vision.json"), JSON.stringify(classified, null, 2));
      fs.writeFileSync(path.join(OUTPUT_DIR, "items-vision-ng.json"), JSON.stringify(visionNgList, null, 2));
      fs.writeFileSync(path.join(OUTPUT_DIR, "items-vision-survived.json"), JSON.stringify(visionSurvived, null, 2));
    } else if (ARG_NO_VISION) {
      console.log(`\nStep 1.6: --no-vision 指定でスキップ`);
    } else if (!GEMINI_KEY) {
      console.log(`\nStep 1.6: GEMINI_API_KEY 未設定でスキップ`);
    }
  }

  // Step 2: メルカリ検索URL生成
  const mercariUrl = buildMercariSearchUrl({ keyword: KEYWORD, excludeKeyword: EXCLUDE });
  console.log(`\nStep 2: メルカリ検索URL`);
  console.log(`  ${mercariUrl}`);

  // Step 3: Puppeteer スクショ
  console.log(`\nStep 3: Puppeteer headless スクショ`);
  const puppeteer = (await import("puppeteer")).default;
  const PROFILE = path.join(PROJECT_ROOT, ".scraper-chrome-mercari-readonly");
  const browser = await puppeteer.launch({
    headless: "new",
    userDataDir: PROFILE,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"],
    defaultViewport: { width: 1200, height: 2000 },
  });
  const screenshotPath = path.join(OUTPUT_DIR, "screenshot.png");
  let clipInfo;
  try {
    // タイトルNG (専用出品等) + description NG (実質まとめ売り) を DOM 非表示
    // さらに --max-items 指定時は survived の上位X件以外も DOM 非表示
    let extraHiddenIds = [];
    if (ARG_MAX_ITEMS > 0 && visionSurvived.length > ARG_MAX_ITEMS) {
      const keepIds = new Set(visionSurvived.slice(0, ARG_MAX_ITEMS).map(e => e.id));
      extraHiddenIds = visionSurvived.filter(e => !keepIds.has(e.id)).map(e => e.id);
      console.log(`  --max-items=${ARG_MAX_ITEMS}: ${extraHiddenIds.length}件をDOMで追加非表示`);
    }
    const ngItemIds = [
      ...titleNgItems.map(e => e.id),
      ...ngList.map(e => e.id),
      ...visionNgList.map(e => e.id),
      ...extraHiddenIds,
    ];
    clipInfo = await takeGridScreenshot(browser, mercariUrl, screenshotPath, ngItemIds);
  } finally {
    await browser.close();
  }
  console.log(`  → ${screenshotPath} 保存`);

  // Step 4: HTMLプレビュー生成
  console.log(`\nStep 4: HTMLプレビュー生成`);
  const title = KEYWORD;
  const wpImageBlock = `<!-- wp:image {"lightbox":{"enabled":false},"id":XXXX,"sizeSlug":"full","linkDestination":"custom","className":"mercari-float"} -->
<figure class="wp-block-image size-full mercari-float"><a href="${mercariUrl}"><img src="(WPアップロード後のURL)" alt="${title} メルカリ相場" class="wp-image-XXXX"/></a></figure>
<!-- /wp:image -->`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>サンプル1件プレビュー: ${title}</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; max-width: 880px; margin: 32px auto; padding: 0 20px; background: #fff; color: #333; line-height: 1.7; }
  h1 { font-size: 1.4em; border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { font-size: 1.1em; margin-top: 32px; color: #555; border-left: 4px solid #555; padding-left: 10px; }
  h3.wp-block-heading { background: whitesmoke; padding: 12px 16px; border-left: 4px solid #c62828; font-size: 1.2em; margin: 24px 0 16px; font-weight: bold; }
  .mercari-float { position: relative; margin: 16px 0; }
  .mercari-float a { display: block; position: relative; }
  .mercari-float img { width: 100%; height: auto; display: block; border: 1px solid #ddd; }
  .mercari-float::after { content: "👉 メルカリで相場を見る"; position: absolute; bottom: 12px; right: 12px; background: #ff5733; color: #fff; padding: 10px 18px; border-radius: 4px; font-weight: bold; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .meta { background: #fafafa; border: 1px solid #e0e0e0; padding: 16px 20px; border-radius: 4px; font-size: 0.92em; }
  .meta dt { font-weight: bold; margin-top: 10px; color: #555; }
  .meta dd { margin: 4px 0 0 0; word-break: break-all; }
  .items-table { width: 100%; border-collapse: collapse; font-size: 0.88em; margin-top: 12px; }
  .items-table th, .items-table td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; text-align: left; vertical-align: top; }
  .items-table th { background: #f0f0f0; font-weight: bold; }
  .items-table .price { color: #c62828; font-weight: bold; white-space: nowrap; }
  .items-table .row-ng { background: #fff5f5; }
  .items-table .row-ng td:nth-child(2) { color: #c62828; font-weight: bold; }
  .items-table .row-ok td:nth-child(2) { color: #2e7d32; font-weight: bold; }
  .items-table .ng-cell code { background: #ffe0e0; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
  .ng-details details { margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; background: #fff5f5; }
  .ng-details summary { padding: 10px 14px; cursor: pointer; font-weight: bold; }
  .ng-details .ng-label { color: #c62828; font-size: 0.9em; margin-left: 8px; }
  .ng-details .desc { background: #fff; padding: 12px 16px; margin: 0; white-space: pre-wrap; word-break: break-all; font-size: 0.85em; max-height: 280px; overflow-y: auto; }
  .raw { background: #f5f5f5; color: #333; padding: 16px; border-radius: 4px; font-size: 0.78em; overflow-x: auto; border: 1px solid #ddd; white-space: pre-wrap; word-break: break-all; }
</style>
</head>
<body>
<h1>サンプル1件プレビュー</h1>
<p>合意フローに従って取得した1ペア。これでOKなら残り49ペアに展開。</p>

<h2>記事ブロック（このまま見える形）</h2>
<h3 class="wp-block-heading">1. ${title}</h3>
<figure class="mercari-float"><a href="${mercariUrl}" target="_blank"><img src="screenshot.png" alt="${title} メルカリ相場"/></a></figure>

<h2>メタ情報</h2>
<dl class="meta">
  <dt>シリーズ (series)</dt><dd>${SERIES}</dd>
  <dt>商品名 (product)</dt><dd>${PRODUCT}</dd>
  <dt>検索キーワード</dt><dd>${KEYWORD}</dd>
  <dt>除外キーワード</dt><dd>${EXCLUDE}</dd>
  <dt>価格下限</dt><dd>¥${ARG_PRICE_MIN.toLocaleString()}</dd>
  <dt>ヒット件数 (API実測)</dt><dd>${items.length}件 (description フィルタ後: 実質単品 ${survived.length}件 / 実質まとめ ${ngList.length}件)</dd>
  <dt>Vision 判定</dt><dd>${ARG_NO_VISION ? "スキップ (--no-vision)" : (!GEMINI_KEY ? "スキップ (GEMINI_API_KEY 未設定)" : `写真単品 ${visionSurvived.length}件 / 写真まとめ ${visionNgList.length}件`)}</dd>
  <dt>スクショ内の商品セル数</dt><dd>${clipInfo.count}個</dd>
  <dt>スクショ clip</dt><dd>x=${clipInfo.x}, y=${clipInfo.y}, w=${clipInfo.width}, h=${clipInfo.height} (セレクタ: ${clipInfo.usedSelector})</dd>
  <dt>アンバサダーリンク</dt><dd><a href="${mercariUrl}" target="_blank">${mercariUrl}</a></dd>
</dl>

<h2>ヒット商品一覧 (${items.length}件 / 実質単品 ${survived.length}件 / 実質まとめ ${ngList.length}件${ARG_NO_VISION || !GEMINI_KEY ? '' : ` / Vision単品 ${visionSurvived.length}件 / Visionまとめ ${visionNgList.length}件`})</h2>
<table class="items-table">
  <thead><tr><th>#</th><th>判定</th><th>価格</th><th>タイトル</th><th>NG理由</th>${ARG_NO_VISION || !GEMINI_KEY ? '' : '<th>Vision</th>'}</tr></thead>
  <tbody>
${enriched.map((e, i) => {
  const visionEntry = (visionNgList.find(v => v.id === e.id) || visionSurvived.find(v => v.id === e.id));
  const visionCell = ARG_NO_VISION || !GEMINI_KEY ? '' : (() => {
    if (!visionEntry || !visionEntry.vision) return '<td></td>';
    const v = visionEntry.vision;
    const mark = v.kind === 'multi' ? '📷✗ まとめ' : (v.kind === 'single' ? '📷○ 単品' : '？');
    const detail = v.reason ? `<br><small>${escapeHtml(v.reason)}</small>` : '';
    return `<td>${mark}${detail}</td>`;
  })();
  const visionFlag = visionEntry?.vision?.kind === 'multi';
  const rowClass = e.ng || visionFlag ? 'row-ng' : 'row-ok';
  const judge = e.ng ? '✗ まとめ(desc)' : (visionFlag ? '✗ まとめ(写真)' : '○ 単品');
  return `    <tr class="${rowClass}">
      <td>${i + 1}</td>
      <td>${judge}</td>
      <td class="price">¥${e.price.toLocaleString()}</td>
      <td>${escapeHtml(e.name)}</td>
      <td class="ng-cell">${e.ng ? `${escapeHtml(e.ng.label)} <code>${escapeHtml(e.ng.matched)}</code>` : ''}</td>${visionCell}
    </tr>`;
}).join("\n")}
  </tbody>
</table>

${ngList.length ? `<h2>除外された出品の説明文 (n=${ngList.length})</h2>
<div class="ng-details">
${ngList.map(e => `  <details>
    <summary><span class="price">¥${e.price.toLocaleString()}</span> ${escapeHtml(e.name)} <span class="ng-label">[${escapeHtml(e.ng.label)}]</span></summary>
    <pre class="desc">${escapeHtml((e.description || "").slice(0, 800))}</pre>
  </details>`).join("\n")}
</div>` : ''}

<h2>WP記事ブロックの実HTML (コピペ用)</h2>
<pre class="raw">${escapeHtml(wpImageBlock)}</pre>

</body>
</html>`;

  const htmlPath = path.join(OUTPUT_DIR, "preview.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`  → ${htmlPath} 保存`);
  console.log(`\n✓ サンプル1件取得完了`);
  console.log(`  プレビュー: file:///${htmlPath.replace(/\\/g, "/")}`);

  // 自動オープン (feedback_open-preview-html-after-sample.md ルール: 完走後必ず開く)
  // --no-open でスキップ可能
  if (!argv.includes("--no-open")) {
    const { spawn } = await import("child_process");
    try {
      spawn("cmd.exe", ["/c", "start", "", htmlPath], { detached: true, stdio: "ignore" }).unref();
      console.log(`  → ブラウザで自動オープン`);
    } catch (e) {
      console.log(`  → 自動オープン失敗: ${e.message}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
