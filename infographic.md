# ブログ図解インフォグラフィック生成スキル

ユーザーからブログ記事の内容や図解にしたいテーマを受け取り、ブラウザで開いてスクショすればそのまま使える **自己完結型HTMLファイル** を生成します。

## 出力先

デスクトップに `図解_{{テーマ名}}.html` として保存する。

## デザインシステム（厳守）

### 基本仕様
- サイズ：**1600px × 900px** 固定（16:9）
- 背景：白（#FFFFFF）
- overflow: hidden（はみ出し非表示）
- フォント：`'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif`

### カラーパレット
| 用途 | 色名 | コード |
|------|------|--------|
| タイトル帯 | 濃い青 | #1E40AF |
| カード帯・ポジティブ | 青 | #2563EB / #3B82F6 |
| カード帯・注意 | オレンジ | #F59E0B |
| カード帯・ネガティブ | 赤 | #DC2626 / #EF4444 |
| カード帯・穏やか | 緑 | #16A34A / #22C55E |
| カード帯・無効 | グレー | #6B7280 |
| まとめ帯背景 | 黄 | #FEF3C7 |
| まとめ帯ボーダー | 黄ボーダー | #F59E0B |
| まとめ帯強調テキスト | 茶 | #B45309 |
| NG背景 | 薄赤 | #FEF2F2 |
| OKボックス背景 | 薄青 | #EFF6FF |
| 本文 | ダークグレー | #333333 |
| 補足テキスト | ミドルグレー | #555555 |
| カードボーダー | ライトグレー | #E5E7EB |
| 破線 | ライトグレー | #E5E7EB |

### 3層構造（すべての図解で共通）

```
┌─────────────────────────────────────┐
│  タイトル帯（h=76px）               │  ← 濃い青背景、白文字、左に絵文字アイコン
├─────────────────────────────────────┤
│                                     │
│  メインコンテンツ（カード横並び）     │  ← 図解の種類に応じて変わる
│                                     │
├─────────────────────────────────────┤
│  まとめ帯（h=auto）                 │  ← 黄色背景、💡アイコン、要約テキスト
└─────────────────────────────────────┘
```

## レイアウトパターン（6種類）

ユーザーの内容に応じて最適なパターンを選択する。

### パターンA：横並びカード型（3〜4枚）
**用途：** 複数のポイント・ステップ・パターンの並列比較
```
[カード1] [カード2] [カード3] [カード4]
```
- 各カードの構造：カラー帯ヘッダー → 評価マーク（◎○△✕） → 絵文字アイコン → 本文 → 結論（破線区切り）
- カード間に矢印を入れる場合は `→` をカード間に絶対配置

### パターンB：左右対比型（VS）
**用途：** 良い例 vs 悪い例、NG vs OK、ビフォーアフター
```
[ ✕ NG側 ]  VS  [ ◎ OK側 ]
```
- 左側：薄赤背景（#FEF2F2）+ 赤ボーダー
- 右側：薄青背景（#EFF6FF）+ 青ボーダー
- 中央に大きな「VS」テキスト

### パターンC：ステップ・フロー型
**用途：** 手順、プロセス、ワークフロー
```
[STEP1] → [STEP2] → [STEP3] → [STEP4]
                                  ↓
                              [STEP1に戻る]（ループの場合）
```
- カードを矢印でつなぐ
- ループがある場合は下側に戻り矢印を描画

### パターンD：カード＋補足帯型
**用途：** メインのカード群＋NGパターンや注意事項を下段に追加
```
[カード1] [カード2] [カード3] [カード4]
[━━━━━ 補足帯（NG / 注意 / 参考情報）━━━━━]
```
- 図解4で使ったパターン。カード群の下にNGセクションや注意事項を追加

### パターンE：2カラム詳細型
**用途：** 2つのカテゴリに分けて詳しく説明する場合
```
[ 左カラム（大きめ）          ] [ 右カラム（大きめ）          ]
[ ・箇条書き1                ] [ ・箇条書き1                ]
[ ・箇条書き2                ] [ ・箇条書き2                ]
[ ・箇条書き3                ] [ ・箇条書き3                ]
```
- 各カラム内に小見出し（◆マーク）、箇条書き、囲み補足を配置可能

### パターンF：ランキング・評価型
**用途：** おすすめ順、評価一覧
```
[1位 金] [2位 銀] [3位 銅]
```
- 1位は他より大きくor色を目立たせる

## カードコンポーネントCSS（共通）

```css
.card {
  flex: 1;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.10);
  display: flex;
  flex-direction: column;
  border: 2px solid #e5e7eb;
}
.card-header {
  color: #fff;
  text-align: center;
  padding: 12px 10px;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
}
.card-rating {
  text-align: center;
  font-size: 72px;
  font-weight: 900;
  padding: 10px 0 2px;
  line-height: 1;
}
.card-icon {
  text-align: center;
  font-size: 64px;
  padding: 8px 0;
  line-height: 1;
}
.card-body {
  padding: 14px 20px;
  font-size: 17px;
  line-height: 1.7;
  color: #333;
  flex: 1;
}
.card-conclusion {
  padding: 12px 20px 18px;
  font-size: 18px;
  font-weight: 800;
  text-align: center;
  border-top: 2px dashed #e5e7eb;
}
```

## タイトル帯コンポーネント（共通）

```html
<div class="title-bar">
  <span class="icon">{{絵文字}}</span>
  <h1>{{タイトルテキスト}}</h1>
</div>
```
```css
.title-bar {
  background: #1E40AF;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 40px;
  height: 76px;
  gap: 16px;
}
.title-bar .icon { font-size: 36px; }
.title-bar h1 {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 2px;
}
```

## まとめ帯コンポーネント（共通）

```html
<div class="summary-bar">
  <span class="icon">💡</span>
  <p>まとめ：<strong>{{要約テキスト}}</strong></p>
</div>
```
```css
.summary-bar {
  background: #FEF3C7;
  margin: 18px 30px 0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  padding: 14px 30px;
  gap: 16px;
  border: 2px solid #F59E0B;
}
.summary-bar .icon { font-size: 32px; flex-shrink: 0; }
.summary-bar p { font-size: 20px; font-weight: 700; color: #333; line-height: 1.5; }
.summary-bar strong { color: #B45309; }
```

## NGセクションコンポーネント（必要な場合のみ）

```html
<div class="ng-section">
  <div class="ng-badge">✕<br>NG</div>
  <div class="ng-content">
    <div class="ng-title">{{NGの内容}}</div>
    <div class="ng-desc">{{理由}}</div>
  </div>
  <div class="ng-arrow">→</div>
  <div class="ok-box">
    <div class="ok-label">◎ {{正解の内容}}</div>
    <div class="ok-desc">{{補足}}</div>
  </div>
</div>
```

## 絵文字アイコン選定ルール

画像生成ではないので、アイコンはすべて **絵文字** で表現する。
内容に合った絵文字を選び、1カードにつき1つ配置する。

| カテゴリ | 絵文字候補 |
|----------|-----------|
| 検索・リサーチ | 🔍 🔎 |
| 時間・スピード | ⏱ 🕐 ⚡ |
| お金・利益 | 💰 💴 📈 |
| 商品・在庫 | 📦 🏷 🛒 |
| 警告・注意 | ⚠️ 🚫 ❌ |
| 成功・おすすめ | ✅ ⭐ 🏆 |
| 人物・ライバル | 👥 🏃 |
| 夜・時間帯 | 🌙 ☀️ 🌅 |
| 知識・学び | 📚 🧠 💡 |
| 店舗 | 🏪 🚪 |
| ホビー・おもちゃ | 🎮 🤖 🎯 |

## 生成時の注意事項

1. **自己完結HTML**：外部CSSやJSは使わない。`<style>` タグ内にすべて記述
2. **はみ出し厳禁**：body に `overflow: hidden` を必ず指定。1600x900内に収める
3. **フォント指定**：必ず上記のフォントスタックを使用
4. **strong活用**：カード本文中の重要キーワードは `<strong>` で強調
5. **色の統一**：上記カラーパレット以外の色は原則使用しない
6. **カード枚数**：横並びは最大4枚。5つ以上の場合は2行にするか、情報を統合して4枚以内にまとめる
7. **テキスト量**：カード本文は2〜3行程度に抑える。長くなる場合は箇条書きにする
8. **評価マーク**：◎（最良）○（良）△（微妙）✕（ダメ）の4段階で統一

## 実行フロー

1. ユーザーの入力内容を分析し、最適なレイアウトパターン（A〜F）を選定
2. タイトル・カード内容・まとめテキストを構成
3. 上記デザインシステムに従ってHTMLを生成
4. デスクトップに保存
5. 「ブラウザで開いてスクショして使ってください」と案内
