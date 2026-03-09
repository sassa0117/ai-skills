import { TEMPLATE_X, SKILL_X_STRATEGY } from "../../config.js";

export const name = "x";
export const label = "X（旧Twitter）";
export const extension = "txt";

/**
 * X用のシステムプロンプトを返す
 */
export function getPrompt() {
  return `${TEMPLATE_X}

## X配信戦略（全文参照）
${SKILL_X_STRATEGY}

## 追加指示
- 出力は投稿テキストのみ。説明やメタ情報は不要
- メインツイート + セルフリプ案を「---」区切りで出力すること
- 140文字以内厳守（メインツイート）
- セルフリプは必要に応じて2-3個まで
- 外部リンクはメインツイートに入れない（セルフリプで対応）
- 画像の提案があればコメント行（// で始まる行）で記載`;
}
