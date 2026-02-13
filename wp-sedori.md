# WordPress せどりブログ記事生成スキル

ユーザーからスプレッドシートのコピペデータを受け取り、WordPressのコードエディター用HTMLを生成します。

## 入力データの解釈

ユーザーが渡すデータから以下の項目を抽出してください：
- 商品名
- 販売価格
- 仕入れ値
- 送料
- 利益
- 解説文（リサーチ・仕入れのポイント）
- 筆者コメント（一言）

## 解説文のリライトルール

解説文は以下のルールで読みやすく整形してください：

1. **段落分け**: 内容のまとまりごとに `<!-- wp:paragraph -->` ブロックで分ける
2. **番号付きポイント**: 複数のポイントがある場合は「**1. タイトル**」形式で構造化
3. **太字強調**: 重要なキーワードや結論は `<strong>` タグで強調
4. **改行**: 文が長い場合は `<br>` で適切に改行
5. **小見出し**: 「■」で始まる小見出しを最初に配置

## 出力テンプレート

以下のテンプレートを使用し、プレースホルダーを実際の値に置き換えてください。
**blockId と scopedCSS 内のIDは、商品ごとにユニークなUUID形式で生成してください。**

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
<p>{{筆者コメント}}</p>
<!-- /wp:paragraph --><span class="sgb-block-say-text__before" style="border-right-color:#d5d5d5"></span><span class="sgb-block-say-text__after" style="border-right-color:#FFF"></span></div></div></div></div>
<!-- /wp:sgb/say -->

<!-- wp:paragraph -->
<p></p>
<!-- /wp:paragraph -->
```

## 解説文ブロックの生成例

解説文は複数の `<!-- wp:paragraph -->` ブロックに分けて出力します：

```html
<!-- wp:paragraph -->
<p>■今回のリサーチ・仕入れのポイント</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>今回、この商品を仕入れ対象と判断した理由は、主に以下の3点です。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>1. ポイント1のタイトル</strong><br>ポイント1の説明文。重要な部分は<strong>太字</strong>で強調します。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>2. ポイント2のタイトル</strong><br>ポイント2の説明文。</p>
<!-- /wp:paragraph -->
```

## 出力時の注意事項

1. **コードブロックとして出力**: 生成したHTMLはコードブロック内に出力してください
2. **複数商品対応**: 複数商品のデータがある場合は、商品ごとにテンプレートを繰り返し生成
3. **blockIdの生成**: 各商品のテーブルブロックには `id-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 形式のユニークIDを生成
4. **画像URLは空欄**: `src=""` のまま出力（ユーザーが後で設定）
5. **CSSは省略禁止**: scopedCSSを含むすべてのCSSプロパティを完全に出力

## 実行

ユーザーからデータを受け取ったら、上記ルールに従ってWordPressコードを生成し、コードブロックで出力してください。
