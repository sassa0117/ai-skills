---
description: 利益商品紹介記事の作成スキル。ボイスメモ＋スプレッドシートデータからWP固定ページ用HTMLを一括生成。
---

# 利益商品紹介記事 作成スキル

## 概要

さっさの利益商品紹介ページ（WP固定ページ）を作成するスキル。
ボイスメモのテキスト＋スプレッドシートの数値データを受け取り、さっさの声で解説を書き、SANGO sgbブロック対応のWordPress HTMLを生成する。

## 入力素材

### 1. スプレッドシートデータ（必須）
以下の項目を商品ごとに抽出：
- 商品名
- 販売価格
- 仕入れ値
- 送料
- 利益

### 2. ボイスメモテキスト（必須）
AIボイスレコーダー等で文字起こしされた、仕入れのポイントや雑感。
- 口語・断片的でOK
- 商品ごとの言及を紐づけて解説文に落とし込む

## 記事構成

### ページ全体
- **導入文・まとめは不要**（いきなり商品から始める）
- 目次はSANGO TOCが自動生成するため出力不要
- 商品の並び順はスプレッドシートの順序に従う

### 商品ごとのブロック構成（上から順に）

1. **H2見出し**（商品名）
2. **商品画像**（src="" 空欄で出力）
3. **価格テーブル**（販売価格/仕入れ値/送料/利益の4行）
4. **解説文**（ボイスメモの内容をリライト）★後述
5. **さっさ吹き出し**（一言コメント）
6. **空行**（商品間の余白）

## 解説文の書き方

### フォーマット判定

ボイスメモの情報量に応じて2パターンを使い分ける：

#### パターンA: 詳細解説あり（ボイスメモで具体的なポイントや背景が語られている場合）

```
■小見出し（リサーチ・仕入れのポイント系）

導入文（1〜2文。体験ベースで入る）

**1. ポイントのタイトル**
説明文。重要キーワードは**太字**。

**2. ポイントのタイトル**
説明文。
```

- ポイントは2〜3個が目安
- 各ポイントはタイトル＋1〜2文の説明
- `<!-- wp:paragraph -->` ブロックで段落分け

#### パターンB: 一言コメントのみ（ボイスメモで軽く触れている/情報が少ない場合）

- 解説文ブロック自体を省略
- 吹き出しの一言コメントだけで済ませる

### 解説文のトーン（sassa-writing準拠）

**必ず以下のルールで書くこと：**

- 一人称は「僕」
- 語尾: 「〜かなと思います」「〜なんですよね」「〜ですね」を混ぜる
- 口癖: 「ぶっちゃけ」「めちゃくちゃ」「正直」「まぁ」を自然に使う
- 体験ベース: 「僕が仕入れたときは」「実際に〜してみて」から始める
- 自虐・正直: 失敗や反省もそのまま書く（「安くしすぎた！」「もう少し調べればよかった」）
- 「笑」: 自虐やツッコミの文末に自然に入れる
- 太字: 結論や核心を `<strong>` で強調（1セクション1〜2箇所）
- 段落は短く（1〜3文で改行）

**やってはいけないこと：**
- 問いかけの連発（「〜ではないでしょうか？」）
- 構造宣言（「今回は3つのポイントを紹介します」）
- 過剰な煽り（「今すぐ」「限定」「見逃すな」）
- 硬い敬語（「〜でございます」の連発）
- 語尾の単調な繰り返し（「〜です。〜です。〜です。」）

### 吹き出しコメントの書き方

- **1文**で簡潔に
- 体験からの実感、驚き、反省、学びのいずれか
- さっさの声で書く（カジュアル敬語 or 感嘆）
- 例:
  - 「ポーターは小物系が穴場かも！リュックはみんな狙ってるから競争激しいです」
  - 「爆速で売れたので、もっと高い可能性あります！」
  - 「初期はアツい！！」
  - 「安くしすぎた！IXYの相場上がってるから値付けもっと強気でよかった！」
  - 「Giftは高額なのだと１０万円するのとかもあります笑」
  - 「シリアルナンバー付きで世界に４００個の商品が２５３０円の価値しかないわけがない！」

## HTML出力テンプレート

### 商品ブロック（パターンA: 解説あり）

```html
<!-- wp:sgb/headings {"headingText":"{{商品名}}","headingStyle":"hh hh8","headingIconName":"","headingIconColor":"#333","headingBgColor1":"whitesmoke","headingBorderColor1":"var(\u002d\u002dsgb-main-color)"} -->
<h2 class="wp-block-sgb-headings sgb-heading"><span class="sgb-heading__inner hh hh8" style="background-color:whitesmoke;border-color:var(--sgb-main-color);font-size:1.2em"><span class="sgb-heading__text" style="color:#333">{{商品名}}</span></span></h2>
<!-- /wp:sgb/headings -->

<!-- wp:image {"id":0,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="" alt="" class="wp-image-0"/></figure>
<!-- /wp:image -->

<!-- wp:table {"hasFixedLayout":false,"className":"is-style-regular","borderColor":"var(\u002d\u002dsgb-main-color)","headingFirstCol":true,"headingColor":"#ffffff","headingBgColor":"var(\u002d\u002dsgb-main-color)","css":"/* 右線 */\ntable tr td {\n\tborder-right: 0 !important;\n}\n\n/* 太さ調整 */\ntable td, table th {\n\tborder: 1px solid var(\u002d\u002dsgb-main-color) !important;\n\tborder-width: 1px !important;\n}\n\ntable tr th:first-child,\ntable tr td:first-child {\n\tborder-bottom: 2px solid #fff !important;\n\twidth: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dtd-width)*1px);\n}\n\n/* 色調整 */\ntable tr:last-child td {\n\tborder-color: var(\u002d\u002dsgb-main-color) !important;\n}\n\n/* 角丸調整 */\ntable tr:first-child td:last-child {\n\tborder-top-right-radius: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dbox-radius, 6)* 1px);\n\tborder-top: 0 !important;\n}\n\ntable tr:last-child td:last-child {\n\tborder-bottom-right-radius: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dbox-radius, 6) * 1px);\n\tborder-bottom: 0 !important;\n}\n\n\n.sng-inline-btn {\n\tfont-size: 12px;\n}\n\n.scroll-hint-icon-wrap {\n\tz-index: 10;\n}\n\ntable {\n\tborder-collapse: separate;\n\tborder-spacing: 0;\n\tborder-radius: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dbox-radius)*1px);\n}","scopedCSS":"\n#{{blockId}} table tr td {\n\tborder-right: 0 !important;\n}\n\n\n#{{blockId}} table td,#{{blockId}}  table th {\n\tborder: 1px solid var(\u002d\u002dsgb-main-color) !important;\n\tborder-width: 1px !important;\n}\n\n#{{blockId}} table tr th:first-child,\n#{{blockId}} table tr td:first-child {\n\tborder-bottom: 2px solid #fff !important;\n\twidth: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dtd-width)*1px);\n}\n\n\n#{{blockId}} table tr:last-child td {\n\tborder-color: var(\u002d\u002dsgb-main-color) !important;\n}\n\n\n#{{blockId}} table tr:first-child td:last-child {\n\tborder-top-right-radius: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dbox-radius, 6)* 1px);\n\tborder-top: 0 !important;\n}\n\n#{{blockId}} table tr:last-child td:last-child {\n\tborder-bottom-right-radius: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dbox-radius, 6) * 1px);\n\tborder-bottom: 0 !important;\n}\n\n\n#{{blockId}} .sng-inline-btn {\n\tfont-size: 12px;\n}\n\n#{{blockId}} .scroll-hint-icon-wrap {\n\tz-index: 10;\n}\n\n#{{blockId}} table {\n\tborder-collapse: separate;\n\tborder-spacing: 0;\n\tborder-radius: calc(var(\u002d\u002dsgb\u002d\u002dcustom\u002d\u002dbox-radius)*1px);\n}","blockId":"{{blockId}}","customControls":[{"name":"角丸の大きさ(px)","variableName":"boxRadius","defaultValue":"","defaultType":"string","dateFormat":"","useTextarea":false,"useRadio":false,"useCheckbox":false,"useQuotation":false,"options":[],"min":1,"max":20,"step":1,"label":"","variableType":"number","disableJS":true,"value":6},{"name":"見出しのwidth","variableName":"tdWidth","defaultValue":"","defaultType":"string","dateFormat":"","useTextarea":false,"useRadio":false,"useCheckbox":false,"useQuotation":false,"options":[],"min":0,"max":1000,"step":1,"label":"","variableType":"number","disableJS":true,"value":170}]} -->
<figure class="wp-block-table is-style-regular"><table class="has-border-color has-var-sgb-main-color-border-color"><tbody><tr><td class="has-text-align-center" data-align="center">販売価格</td><td>{{販売価格}}円</td></tr><tr><td class="has-text-align-center" data-align="center">仕入れ値</td><td>{{仕入れ値}}円</td></tr><tr><td class="has-text-align-center" data-align="center">送料</td><td>{{送料}}円</td></tr><tr><td class="has-text-align-center" data-align="center">利益</td><td>{{利益}}円</td></tr></tbody></table></figure>
<!-- /wp:table -->

{{解説文ブロック}}

<!-- wp:sgb/say {"avatarImageUrl":"https://sedorisassa.com/wp-content/uploads/2025/06/7F59A966-41F0-4707-8AA2-E61F36422128.png","avatarName":"さっさ"} -->
<div class="wp-block-sgb-say"><div class="sgb-block-say sgb-block-say--left"><div class="sgb-block-say-avatar"><img src="https://sedorisassa.com/wp-content/uploads/2025/06/7F59A966-41F0-4707-8AA2-E61F36422128.png" alt="さっさ" width="80" height="80" style="border-color:#eaedf2"/><div class="sgb-block-say-avatar__name">さっさ</div></div><div class="sgb-block-say-text"><div class="sgb-block-say-text__content" style="color:#333;border-color:#d5d5d5;background-color:#FFF"><!-- wp:paragraph -->
<p>{{吹き出しコメント}}</p>
<!-- /wp:paragraph --><span class="sgb-block-say-text__before" style="border-right-color:#d5d5d5"></span><span class="sgb-block-say-text__after" style="border-right-color:#FFF"></span></div></div></div></div>
<!-- /wp:sgb/say -->

<!-- wp:paragraph -->
<p><br><br></p>
<!-- /wp:paragraph -->
```

### 商品ブロック（パターンB: 吹き出しのみ）

解説文ブロック（`{{解説文ブロック}}`）を省略し、価格テーブルの直後に吹き出しを配置。

### 解説文ブロックの生成例

```html
<!-- wp:paragraph -->
<p>■今回のリサーチ・仕入れのポイント</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>ポーターは見かけたらとりあえずリサーチするようにしています。<br>正直、まだどのシリーズが高いとかはいまいち把握しきれていません。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>1. フリマ相場と店舗値付けの「ズレ」</strong><br>ただ、気づいたことがあります。<strong>フリマの状態が悪い商品に合わせて、店舗で値付けされていることが多い</strong>んですよね。<br>なので今のところ、あったらリサーチする程度で問題なさそうです。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>2. 小物系は「商圏の差」で狙い目</strong><br>今回のようなペンケースなどの小物系は、商圏の差を考えると<strong>近隣に欲しい人がいなそうなので、あえて安くしている</strong>というケースがありそうです。</p>
<!-- /wp:paragraph -->
```

## 出力時の注意事項

1. **コードブロックとして出力**: 生成したHTMLはコードブロック内に出力
2. **複数商品対応**: 商品ごとにテンプレートを繰り返し生成
3. **blockIdの生成**: 各商品のテーブルブロックには `id-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 形式のユニークIDを生成
4. **画像URLは空欄**: `src=""` のまま出力（ユーザーが後で設定）
5. **CSSは省略禁止**: scopedCSSを含むすべてのCSSプロパティを完全に出力
6. **ボイスメモの紐づけ**: スプレッドシートの商品名とボイスメモの言及を正確にマッチングし、該当する解説を割り当てる
7. **パターン判定**: ボイスメモで具体的に語られている商品 → パターンA（詳細解説）、軽く触れているだけの商品 → パターンB（吹き出しのみ）

## 実行フロー

1. スプレッドシートデータとボイスメモテキストを受け取る
2. 商品ごとにボイスメモの言及を紐づける
3. 情報量に応じてパターンA/Bを判定
4. sassa-writingのトーンで解説文・吹き出しコメントを作成
5. wp-sedoriのHTMLテンプレートで全商品分のHTMLを生成
6. コードブロックで出力
