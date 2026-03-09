import { TEMPLATE_THREADS } from "../../config.js";

export const name = "threads";
export const label = "Threads（スレッズ）";
export const extension = "txt";

/**
 * Threads用のシステムプロンプトを返す
 */
export function getPrompt() {
  return `${TEMPLATE_THREADS}

## 追加指示
- 出力は投稿テキストのみ。説明やメタ情報は不要
- 連投スレッド形式の場合は「---」で各投稿を区切ること
- 各投稿の冒頭に [1/N], [2/N] のような番号を振ること（連投の場合）
- ハッシュタグは投稿末尾にまとめること
- 元記事が短い場合は単発投稿でOK`;
}
