# ブログ記事 一括公開スキル

ユーザーから記事テキストを受け取り、以下の全工程を自動で実行する統合スキルです。

## 実行フロー

1. **記事HTML生成**：`/wp-sedori` スキルと同じルールでWordPressブロックエディター用HTMLを生成
2. **図解HTML生成**：`/infographic` スキルのデザインシステムに従い、記事内容から図解が有効な箇所を特定してHTMLファイルを生成
3. **図解PNG変換**：生成したHTMLを `node scripts/screenshot.js` でPNG化
4. **WordPress投稿**：`node scripts/wp-post.js` で記事HTML＋画像をWordPressに投稿

## ユーザーからの入力

以下のいずれかの形式で受け取る：

- 記事テキスト（本文そのもの）
- 記事テーマ＋箇条書きメモ
- スプレッドシートのコピペデータ（商品リスト記事の場合）

## オプション（ユーザーが指示に含めた場合のみ適用）

| 指示キーワード | 動作 |
|--------------|------|
| 「固定ページ」 | `--type page` で投稿 |
| 「投稿」「記事」 | `--type post` で投稿（デフォルト） |
| 「公開」 | `--status publish` で投稿 |
| 「下書き」 | `--status draft` で投稿（デフォルト） |
| 「図解なし」 | 図解生成をスキップ |
| 「図解だけ」 | 記事HTMLは生成せず図解のみ |

## 実行手順（Claude側が順番に実行する）

### STEP 1: 記事HTMLの生成

- `/wp-sedori` スキルのテンプレートとルールに従い、WordPress コードエディター用HTMLを生成
- 生成したHTMLを `C:\Users\user\Desktop\article_temp.html` に保存

### STEP 2: 図解の生成

- 記事内容を分析し、図解が有効な箇所を特定
- `/infographic` スキルのデザインシステム（3層構造、カラーパレット、6種のレイアウトパターン）に従い、各図解のHTMLを生成
- `C:\Users\user\Desktop\` に `図解N_テーマ名.html` として保存

### STEP 3: PNG変換

以下のコマンドを実行：

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "C:/Users/user/ai-skills"
node scripts/screenshot.js "C:\Users\user\Desktop\図解1_xxx.html"
node scripts/screenshot.js "C:\Users\user\Desktop\図解2_xxx.html"
```

出力先：`C:\Users\user\ai-skills\output\`

### STEP 4: WordPress投稿

以下のコマンドを実行：

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd "C:/Users/user/ai-skills"
node scripts/wp-post.js "C:\Users\user\Desktop\article_temp.html" --title "記事タイトル" --status draft --type post --image output/図解1_xxx.png --image output/図解2_xxx.png
```

※ `--type` と `--status` はユーザーの指示に応じて切り替える

### STEP 5: 結果報告

投稿完了後、以下を報告：
- WordPressの編集画面URL
- アップロードした画像の一覧
- 「あとは管理画面で画像位置の調整と最終確認をしてください」と案内

## 前提条件

- `C:\Users\user\ai-skills\.env` にWordPress認証情報が設定済みであること（設定済み）

## 注意事項

- 投稿はデフォルトで **下書き（draft）** にする。明示的に「公開して」と言われた場合のみ publish にする
- 図解の枚数は記事内容に応じて自動判断（通常2〜5枚）
- 記事HTML内の画像位置（`src=""`）には、アップロード後のURLを手動で差し込む必要がある（現時点の制限）
