import Anthropic from "@anthropic-ai/sdk";
import {
  API_KEY,
  SKILL_SASSA_WRITING,
  SKILL_ANTI_AI,
  DEFAULT_PROFILE,
} from "../config.js";

const client = new Anthropic({ apiKey: API_KEY });

/**
 * Claude APIでソーステキストを指定プラットフォーム向けに変換
 * @param {object} params
 * @param {string} params.sourceContent - ソーステキスト（構造化済み）
 * @param {string} params.sourceTitle - 元記事タイトル
 * @param {string} params.platformPrompt - プラットフォーム固有のシステムプロンプト
 * @param {string} params.platformName - プラットフォーム名
 * @param {object} params.profile - ジャンルプロファイル
 * @returns {Promise<string>} - 変換後テキスト
 */
export async function transform({
  sourceContent,
  sourceTitle,
  platformPrompt,
  platformName,
  profile = DEFAULT_PROFILE,
}) {
  const systemPrompt = buildSystemPrompt(platformPrompt, profile);
  const userMessage = buildUserMessage(
    sourceContent,
    sourceTitle,
    platformName
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  let result =
    response.content[0]?.text || "[ERROR] Claude APIからの応答が空でした";

  return result;
}

/**
 * AI臭チェック＆修正（ポストプロセス）
 * @param {string} text - チェック対象テキスト
 * @param {string} platformName - プラットフォーム名
 * @returns {Promise<string>} - 修正後テキスト
 */
export async function antiAiCheck(text, platformName) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `あなたはAI臭チェッカーです。以下のガイドラインに厳密に従い、渡されたテキストからAI臭を除去してください。
修正後のテキストのみを返してください。説明やコメントは不要です。

${SKILL_ANTI_AI}`,
    messages: [
      {
        role: "user",
        content: `以下の${platformName}向けテキストからAI臭を除去してください。内容・構成は変えず、表現のみ修正。\n\n---\n${text}\n---`,
      },
    ],
  });

  return response.content[0]?.text || text;
}

/**
 * システムプロンプトを構築
 */
function buildSystemPrompt(platformPrompt, profile) {
  const parts = [
    `あなたはコンテンツ変換エンジンです。ブログ記事などの一次情報ソースを、指定されたSNSプラットフォーム向けに最適化して変換します。`,
    ``,
    `## ジャンル・ペルソナ`,
    `- ジャンル: ${profile.genre}`,
    `- ペルソナ: ${profile.persona}`,
    `- 説明: ${profile.description}`,
    ``,
  ];

  // さっさ文体スキルの組み込み（デフォルトプロファイルの場合）
  if (profile.writingStyle === "sassa-writing" && SKILL_SASSA_WRITING) {
    parts.push(`## 文体ルール（必ず従うこと）`);
    parts.push(SKILL_SASSA_WRITING);
    parts.push(``);
  }

  // AI臭排除ルール
  if (SKILL_ANTI_AI) {
    parts.push(`## AI臭排除ルール（必ず従うこと）`);
    parts.push(SKILL_ANTI_AI);
    parts.push(``);
  }

  // プラットフォーム固有プロンプト
  parts.push(`## プラットフォーム固有ルール`);
  parts.push(platformPrompt);

  return parts.join("\n");
}

/**
 * ユーザーメッセージを構築
 */
function buildUserMessage(sourceContent, sourceTitle, platformName) {
  return `以下のブログ記事を${platformName}向けコンテンツに変換してください。

## 元記事タイトル
${sourceTitle}

## 元記事内容
${sourceContent}

## 指示
- プラットフォーム固有ルールに厳密に従って変換すること
- 文体ルールを守ること（語尾、口癖、リズム）
- AI臭排除ルールを守ること
- 元記事の核心情報を活かしつつ、プラットフォームに最適化すること
- 変換結果のテキストのみを出力すること（説明やメタコメントは不要）`;
}
