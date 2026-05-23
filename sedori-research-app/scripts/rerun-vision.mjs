/**
 * 既存 sample-N の items-survived.json に対して Vision だけ再判定する。
 * モデル変更（gemini-2.5-flash 等）の効果検証用。
 * Usage: node scripts/rerun-vision.mjs --output sample-44 --vision-model gemini-2.5-flash
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.resolve(PROJECT_ROOT, "..");

const argv = process.argv.slice(2);
const getArg = (n, def = null) => {
  const i = argv.indexOf(n);
  return i === -1 ? def : argv[i + 1];
};
const ARG_OUTPUT = getArg("--output");
const ARG_VISION_MODEL = getArg("--vision-model", "gemini-2.5-flash");
if (!ARG_OUTPUT) { console.error("--output 必須"); process.exit(1); }

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const [k, ...r] = t.split("=");
    if (!process.env[k.trim()]) process.env[k.trim()] = r.join("=").trim();
  }
}
loadEnv(path.join(SKILLS_ROOT, ".env"));
loadEnv(path.join(SKILLS_ROOT, "alert-app", ".env"));
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 未設定"); process.exit(1); }

const VISION_PROMPT = `画像に写っている缶バッジを判定してください。
- count_badges: 缶バッジの個数（整数）
- multiplier_text: 価格や個数の掛け算表記（"x3" "×5" "3個セット" "5枚組"等）があれば抽�、なければnull
- other_goods: 缶バッジ以外のグッズ(クリアファイル/ステッカー/アクスタ等)が一緒に写っているか true/false
- kind: count_badges===1 && other_goods===false ならsingle、それ以外はmulti
JSONで返してください: {"count_badges": N, "multiplier_text": null|"...", "other_goods": bool, "kind": "single"|"multi", "reason": "..."}`;

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  return { base64: buf.toString("base64"), mime };
}

async function callGeminiVision(imageBase64, mime, prompt, model = "gemini-2.5-flash") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: imageBase64 } }, { text: prompt }] }],
    generationConfig: { temperature: 0, response_mime_type: "application/json" }
  };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  try { return JSON.parse(txt); } catch { return { kind: "unknown", error: "parse_fail", raw: txt }; }
}

function applyVisionGuard(v) {
  if (!v || v.kind === "unknown") return v;
  if (v.count_badges === 1 && v.other_goods === false && !v.multiplier_text) return { ...v, kind: "single" };
  return { ...v, kind: "multi" };
}

const OUT_DIR = path.join(PROJECT_ROOT, "output", "can-badge", ARG_OUTPUT);
const survived = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "items-survived.json"), "utf-8"));
console.log(`${ARG_OUTPUT}: items-survived ${survived.length}件 を ${ARG_VISION_MODEL} で再判定`);

const results = [];
for (let i = 0; i < survived.length; i++) {
  const it = survived[i];
  try {
    const { base64, mime } = await fetchImageAsBase64(it.thumbnailUrl);
    const raw = await callGeminiVision(base64, mime, VISION_PROMPT, ARG_VISION_MODEL);
    const v = applyVisionGuard(raw);
    results.push({ ...it, vision: v });
    console.log(`  ${i+1}/${survived.length} [¥${it.price}] ${it.name.slice(0,40)} → ${v.kind}`);
  } catch (e) {
    results.push({ ...it, vision: { kind: "unknown", error: e.message } });
    console.log(`  ${i+1}/${survived.length} ERROR: ${e.message}`);
  }
}

const ngList = results.filter(c => c.vision?.kind === "multi" || c.vision?.kind === "unknown");
const survivedNew = results.filter(c => c.vision?.kind === "single");

const suffix = ARG_VISION_MODEL.replace(/[^a-z0-9]/gi, "-");
fs.writeFileSync(path.join(OUT_DIR, `items-vision-${suffix}.json`), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(OUT_DIR, `items-vision-survived-${suffix}.json`), JSON.stringify(survivedNew, null, 2));
fs.writeFileSync(path.join(OUT_DIR, `items-vision-ng-${suffix}.json`), JSON.stringify(ngList, null, 2));

console.log(`\n結果: single ${survivedNew.length}件 / multi ${ngList.length}件`);
console.log(`保存先: ${OUT_DIR}/items-vision-${suffix}.json`);
