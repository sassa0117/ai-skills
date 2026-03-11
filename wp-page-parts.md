# WordPress 記事装飾パーツスキル

WPのコードエディター（カスタムHTML）で使える装飾コンポーネント集。
比較ページ・セールスページ・読み物ページなど、**ブロックエディターのデフォルト装飾では物足りない場面**で使う。

## いつ使うか
- WP固定ページや投稿で見出し・ボックス・ハイライト等の視覚装飾が必要なとき
- wp-sedori / wp-article-structure ではカバーしないページ（セールス系・比較系・案内系）

## CSSの配置ルール

CSSは `<!-- wp:html -->` ブロックの先頭にまとめて1箇所で定義する。
クラス名はページ固有のプレフィックスをつけて衝突を防ぐ。

```html
<!-- wp:html -->
<style>
.cp-section-head{ ... }
/* 以下すべてのクラス定義 */
</style>
<!-- /wp:html -->
```

---

## パーツ一覧

### 1. セクション見出し

左ボーダー付きの見出し。記事を大きなセクションに区切る。

```html
<!-- wp:html -->
<h2 class="cp-section-head">見出しテキスト</h2>
<!-- /wp:html -->
```

```css
.cp-section-head{
  font-size:1.3rem;
  font-weight:900;
  padding:12px 0 12px 16px;
  border-left:4px solid #2563eb;
  margin:48px 0 20px;
  line-height:1.5
}
```

### 2. マーカー線（ハイライト）

テキストの下半分にマーカーを引く。`<span>` で囲むだけ。

```html
<span class="cp-highlight">重要なフレーズ</span>
<span class="cp-highlight-yellow">黄色で強調したいフレーズ</span>
```

```css
.cp-highlight{background:linear-gradient(transparent 60%,#dbeafe 60%)}
.cp-highlight-yellow{background:linear-gradient(transparent 60%,#fef3c7 60%)}
```

**使いすぎ注意**: 1セクションに1〜2箇所が限度。

### 3. ボックス（3種類）

#### グレーボックス（引用・補足）

```html
<!-- wp:html -->
<div class="cp-box-gray">
テキスト内容
</div>
<!-- /wp:html -->
```

```css
.cp-box-gray{
  background:#f8fafc;
  border-radius:12px;
  padding:20px 24px;
  margin:20px 0;
  line-height:1.9
}
```

#### ブルーボックス（ポジティブ情報・メリット）

```html
<!-- wp:html -->
<div class="cp-box-blue">
<ul class="cp-list-check">
<li>項目1</li>
<li>項目2</li>
</ul>
</div>
<!-- /wp:html -->
```

```css
.cp-box-blue{
  background:#eff6ff;
  border-left:4px solid #2563eb;
  border-radius:0 12px 12px 0;
  padding:16px 20px;
  margin:20px 0;
  line-height:1.9
}
```

#### レッドボックス（注意・ネガティブ情報）

```html
<!-- wp:html -->
<div class="cp-box-red">
<ul class="cp-list-check cp-list-x">
<li>向かない条件1</li>
<li>向かない条件2</li>
</ul>
</div>
<!-- /wp:html -->
```

```css
.cp-box-red{
  background:#fef2f2;
  border-left:4px solid #dc2626;
  border-radius:0 12px 12px 0;
  padding:16px 20px;
  margin:20px 0;
  line-height:1.9
}
```

### 4. チェックリスト / バツリスト

```css
.cp-list-check{list-style:none;padding:0;margin:12px 0}
.cp-list-check li{padding:8px 0 8px 28px;position:relative;font-size:0.95rem}
.cp-list-check li::before{content:"✓";color:#059669;position:absolute;left:0;font-weight:700;font-size:1.1rem}
.cp-list-x li::before{content:"✗";color:#dc2626}
```

- `.cp-list-check` = 緑チェックマーク
- `.cp-list-check.cp-list-x` = 赤バツマーク

### 5. プラン比較カード（グリッド）

3カラムのカード比較。**`display:flex` + `flex:1` で高さが自動で揃う。**

```css
.plan-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:20px;
  max-width:820px;
  margin:32px auto
}
.plan-card{
  background:#fff;
  border-radius:16px;
  box-shadow:0 4px 20px rgba(0,0,0,0.06);
  border:2px solid #e2e8f0;
  overflow:hidden;
  display:flex;
  flex-direction:column  /* ← 高さ揃えの肝 */
}
.plan-card.is-recommended{
  border-color:#2563eb;
  box-shadow:0 4px 20px rgba(37,99,235,0.15)
}
.plan-features{
  padding:16px 20px;
  list-style:none;
  margin:0;
  flex:1  /* ← 高さ揃えの肝 */
}
.plan-btn{
  display:block;
  text-align:center;
  padding:14px;
  margin:8px 16px 16px;
  border-radius:10px;
  color:#fff;
  font-weight:700;
  text-decoration:none
}
@media(max-width:640px){
  .plan-grid{grid-template-columns:1fr;max-width:360px}
}
```

カード構造:
```html
<div class="plan-card">
  <div class="plan-head" style="background:..."><h3>プラン名</h3></div>
  <div class="plan-price-area">
    <div class="plan-amount">金額<span class="plan-unit">円/年</span></div>
  </div>
  <ul class="plan-features">
    <li>機能1</li>
    <li class="is-na">ない機能</li>
  </ul>
  <a href="..." class="plan-btn" style="background:...">詳細を見る</a>
</div>
```

### 6. CTAリンクボックス

```html
<!-- wp:html -->
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px 20px;margin:32px 0">
<p style="font-size:13px;color:#64748b;margin-bottom:12px">各プランの詳細はこちらから：</p>
<p style="margin-bottom:8px">▶ <a href="URL" style="color:#2563eb;font-weight:700;text-decoration:none">リンクテキスト</a></p>
<p style="font-size:13px;color:#dc2626;margin-top:16px;font-weight:600">締切情報</p>
</div>
<!-- /wp:html -->
```

### 7. 問い合わせボックス

```html
<!-- wp:html -->
<div style="text-align:center;margin:24px 0;padding:16px;background:#f8fafc;border-radius:8px">
<p style="font-size:13px;color:#64748b;margin-bottom:8px">質問・相談はこちらへ</p>
<p>
  <a href="https://lin.ee/rBzkuIB" target="_blank" style="color:#2563eb;text-decoration:none;margin-right:16px">📩 公式LINE</a>
  <a href="https://sedorisassa.com/5mvl" target="_blank" style="color:#2563eb;text-decoration:none">📩 匿名で質問</a>
</p>
</div>
<!-- /wp:html -->
```

---

## カラーパレット

| 用途 | カラー |
|------|--------|
| メインブルー | `#2563eb` |
| ダークブルー | `#1e40af` |
| ライトブルー背景 | `#eff6ff` / `#dbeafe` |
| パープル（フルサポート） | `#7c3aed` |
| グリーン（ライト） | `#059669` |
| レッド（注意） | `#dc2626` |
| テキスト | `#1e293b` |
| サブテキスト | `#64748b` |
| 背景グレー | `#f8fafc` |
| ボーダーグレー | `#e2e8f0` |
| 黄マーカー | `#fef3c7` |

---

## OGP / SNSカード画像の生成 + アイキャッチ設定

ページを作成・更新したら、**必ずOGP画像も生成してアイキャッチに設定する**。
SNSやオプチャでリンクを貼ったときのカード表示に使われる。

### 手順

1. **OGP用HTMLテンプレートを作成**（1200x630px）

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1200px;height:630px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(160deg,#0f172a 0%,#1e40af 50%,#3b82f6 100%);
  font-family:'Noto Sans JP',sans-serif;color:#fff;text-align:center;}
.wrap{padding:0 80px;}
h1{font-size:58px;font-weight:900;line-height:1.5;margin-bottom:16px;}
p{font-size:22px;color:rgba(255,255,255,0.7);}
</style></head><body>
<div class="wrap">
<h1>メインコピー</h1>
<p>サブテキスト</p>
</div>
</body></html>
```

背景のグラデーションはページのテーマカラーに合わせて変更可。

2. **Puppeteerでスクリーンショット**

```javascript
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.goto('file:///PATH/ogp.html', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'ogp.png', type: 'png' });
  await browser.close();
})();
```

3. **WPメディアにアップロード + アイキャッチ設定**

```javascript
// 1. メディアアップロード（multipart/form-data）
// POST /wp-json/wp/v2/media → media_id を取得

// 2. ページのfeatured_mediaに設定
// POST /wp-json/wp/v2/pages/{page_id}
// body: { featured_media: media_id }
```

### 注意事項
- SANGOテーマでは `featured_media` が `og:image` に使われる
- LPページではCSS（`.entry-header{display:none}`）でアイキャッチの表示を非表示にしているため、ページ上には表示されない
- OGP画像を更新した場合、SNSのキャッシュが残る（LINEは数時間、Xは即時反映されないことがある）

---

## 組み合わせのルール

1. **見出しでセクションを区切る** → 流し読みできるようにする
2. **ハイライトは結論・核心だけ** → 多用すると効果が薄れる
3. **ボックスはリスト or 引用と組み合わせ** → テキストだけのボックスは避ける
4. **カードは高さを揃える** → `flex-direction:column` + `flex:1` 必須
5. **スマホファースト** → `@media(max-width:640px)` で1カラムに
6. **ページ作成・更新時は必ずOGP画像も生成してアイキャッチ設定する**
