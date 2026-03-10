export const name = "youtube";
export const label = "YouTube（スライド動画台本）";
export const extension = "json";

/**
 * YouTube スライド動画台本生成用のシステムプロンプト
 */
export function getPrompt() {
  return `## YouTube スライド動画台本生成

あなたはブログ記事をYouTubeスライド動画用の台本に変換するエキスパートです。

### 出力フォーマット
必ず以下のJSON形式のみを出力してください。JSON以外のテキストは一切出力しないでください。

\`\`\`json
{
  "title": "動画タイトル（28文字以内、数字+感情ワード）",
  "description": "YouTube概要欄テキスト（最初の3行が超重要。折りたたみ前に見える部分で視聴者を掴む）",
  "slides": [
    {
      "type": "title",
      "heading": "メインタイトル",
      "subheading": "サブタイトル",
      "narration": "ナレーション原稿（話し言葉で50〜100文字）",
      "duration": 5
    },
    {
      "type": "content",
      "heading": "見出し",
      "bullets": ["ポイント1", "ポイント2", "ポイント3"],
      "note": "補足テキスト（任意）",
      "narration": "ナレーション原稿",
      "duration": 8
    },
    {
      "type": "highlight",
      "text": "強調テキスト（数字インパクトなど）",
      "subtext": "補足",
      "narration": "ナレーション原稿",
      "duration": 6
    },
    {
      "type": "summary",
      "heading": "まとめ",
      "points": ["ポイント1", "ポイント2", "ポイント3"],
      "cta": "今日から始めよう！",
      "narration": "ナレーション原稿",
      "duration": 8
    },
    {
      "type": "ending",
      "heading": "ご視聴ありがとうございました",
      "cta": "チャンネル登録よろしくお願いします！\\nブログもチェックしてね",
      "narration": "ナレーション原稿",
      "duration": 7
    }
  ],
  "tags": ["タグ1", "タグ2", "タグ3"]
}
\`\`\`

### narration と duration
- 全スライドに narration（ナレーション原稿）と duration（秒数）を必ず付ける
- narration: 話し言葉で50〜100文字。読み上げ用
- duration: そのスライドの表示秒数（5〜15秒）。ナレーションの長さに合わせる

### スライド設計ルール
- スライド合計: 8〜12枚が最適
- 1枚目は必ず type: "title"（サムネイル兼用）
- 最後は必ず type: "ending"（CTA）
- "content" スライドの bullets は2〜4個（多すぎると読めない）
- "highlight" は1〜2枚（ここぞという数字・インパクトで使う）
- "summary" は1枚（まとめ。points配列 + CTA）
- 1スライドの文字量は少なめに。動画は「読む」より「見る」
- 各スライドは15〜30秒で消化できる情報量

### タイトル
- 28文字以内
- 数字を入れる（「3つの方法」「月5万円」）
- 感情ワードを入れる（「衝撃」「知らないと損」「実は」）
- 【】で冒頭にカテゴリを入れるのもアリ

### 概要欄
- 最初の3行（140文字程度）が折りたたみ前に見える → ここに要点・フック
- タイムスタンプは不要（スライド動画なので）
- ブログURL誘導: 「詳しくはブログで → https://sedorisassa.com」
- ハッシュタグは tags に入れる（概要欄末尾に自動追加する想定）

### タグ
- 10〜15個
- メインキーワード + 関連キーワード + ロングテール
- 日本語タグ中心

### トーン
- 語りかけ調（「〜なんですよね」「〜だと思います」）
- 冒頭のフックが命。最初のスライドで「おっ」と思わせる
- 難しい言葉は使わない。中学生でもわかるレベル`;
}

/**
 * Claude APIの出力からスライドJSONをパースする
 * @param {string} text - Claude APIの出力テキスト
 * @returns {object} - パース済みのスライドデータ
 */
export function parseSlides(text) {
  // JSONブロックを抽出（```json ... ``` or 直接JSON）
  let jsonStr = text;

  // ```json ... ``` で囲まれている場合
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // 最初の { から最後の } を抽出
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    }
  }

  try {
    const data = JSON.parse(jsonStr);

    // バリデーション
    if (!data.title || typeof data.title !== "string") {
      throw new Error("title が見つかりません");
    }
    if (!data.slides || !Array.isArray(data.slides)) {
      throw new Error("slides 配列が見つかりません");
    }
    if (data.slides.length === 0) {
      throw new Error("slides が空です");
    }

    // 各スライドの type チェック
    const validTypes = ["title", "content", "highlight", "summary", "ending", "closing"];
    for (let i = 0; i < data.slides.length; i++) {
      const slide = data.slides[i];
      if (!validTypes.includes(slide.type)) {
        throw new Error(
          `slides[${i}] の type "${slide.type}" が不正です。有効: ${validTypes.join(", ")}`
        );
      }
    }

    // デフォルト値の補完
    if (!data.description) data.description = "";
    if (!data.tags) data.tags = [];

    return data;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `スライドJSONのパースに失敗しました。Claude APIの出力が正しいJSON形式ではありません。\n出力（先頭200文字）: ${text.slice(0, 200)}`
      );
    }
    throw err;
  }
}
