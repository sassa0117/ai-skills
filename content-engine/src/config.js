import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const aiSkillsDir = resolve(rootDir, "..");

// .env を ai-skills ルートから読む
dotenvConfig({ path: resolve(aiSkillsDir, ".env") });

// --- API Keys ---
// ヘルプ表示時はAPIキー不要なので、遅延チェックにする
export const API_KEY = process.env.ANTHROPIC_API_KEY || "";

export function validateApiKey() {
  if (!API_KEY) {
    console.error(
      "[ERROR] ANTHROPIC_API_KEY が .env に設定されていません。\n" +
        "  → https://console.anthropic.com/settings/keys で発行し、\n" +
        `  → ${resolve(aiSkillsDir, ".env")} に追記してください。`
    );
    process.exit(1);
  }
}

// --- WordPress ---
export const WP_SITE_URL =
  process.env.WP_SITE_URL || "https://sedorisassa.com";
export const WP_USERNAME = process.env.WP_USERNAME || "sassa";
export const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || "";

// --- スキルファイル読み込み ---
function loadSkillFile(filename) {
  const filepath = resolve(aiSkillsDir, filename);
  if (existsSync(filepath)) {
    return readFileSync(filepath, "utf-8");
  }
  console.warn(`[WARN] スキルファイルが見つかりません: ${filepath}`);
  return "";
}

export const SKILL_SASSA_WRITING = loadSkillFile("sassa-writing.md");
export const SKILL_X_STRATEGY = loadSkillFile("x-strategy.md");
export const SKILL_ANTI_AI = loadSkillFile("anti-ai-writing.md");

// --- テンプレート読み込み ---
function loadTemplate(filename) {
  const filepath = resolve(rootDir, "src", "templates", filename);
  if (existsSync(filepath)) {
    return readFileSync(filepath, "utf-8");
  }
  console.warn(`[WARN] テンプレートが見つかりません: ${filepath}`);
  return "";
}

export const TEMPLATE_THREADS = loadTemplate("threads.md");
export const TEMPLATE_NOTE = loadTemplate("note.md");
export const TEMPLATE_X = loadTemplate("x.md");

// --- ジャンル設定 ---
export const DEFAULT_PROFILE = {
  genre: "せどり",
  persona: "さっさ",
  writingStyle: "sassa-writing",
  description:
    "電脳せどり＋店舗せどりのハイブリッドで稼ぐブロガー「さっさ」。メルカリショップ・ヤフオク・Yahoo!フリマで販売。",
};

/**
 * ジャンルプロファイルを生成
 * @param {object} overrides - genre, persona, writingStyle, description
 */
export function createProfile(overrides = {}) {
  return { ...DEFAULT_PROFILE, ...overrides };
}

// --- 出力ディレクトリ ---
export const OUTPUT_DIR = resolve(rootDir, "output");

// --- 対応プラットフォーム ---
export const PLATFORMS = ["threads", "note", "x", "youtube", "instagram"];
