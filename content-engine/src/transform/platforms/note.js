import { TEMPLATE_NOTE } from "../../config.js";

export const name = "note";
export const label = "note";
export const extension = "md";

/**
 * note用のシステムプロンプトを返す
 */
export function getPrompt() {
  return `${TEMPLATE_NOTE}

## 追加指示
- 出力はnote記事のMarkdownテキストのみ。説明やメタ情報は不要
- タイトルは1行目に「# タイトル」形式で書くこと
- 元ブログ記事とSEOでカニバらないよう、切り口・タイトルを変えること
- ブログへの誘導CTAは自然に、押しつけがましくなく`;
}
