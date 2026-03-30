# ひろさんツール × 釣り具 入荷通知自動化 - 引き継ぎ

## 目的
ひろさんツール（sedori-assist-pro.com）の入荷通知に、**利益が取れる釣り具の型番を大量登録**したい。
将来的には釣り具以外のジャンルにも展開する。

## 全体フロー
1. ひろさんツールの「即売れリスト」をスクレイピング（= オフモールで即売れした商品 = 需要の証明）
2. **オフモールの商品ページから実際の商品名・型番を取得**（ひろさんツールの表示名は「スピニングリール」等の汎用名が多いため）
3. 型番から**1単語で登録できるキーワード**を抽出（ひろさんツールはスペース区切り非対応）
4. メルカリsoldで利益判定（差額あり / 履歴なし=希少 / 在庫枯れ → 登録）
5. 登録用ワードリスト（CSV）を生成 → Discord通知
6. **毎日自動で差分巡回**（前回取得済みはスキップ）

## ひろさんツールの制約
- **スペース入りキーワード非対応**（「ダイワ LT2500-H」→ NG、「LT2500-H」→ OK）
- 即売れリスト: 新着入荷から10分後に売り切れ判定
- 日時売り切れリスト: 1日で売り切れたもの
- カテゴリ: 家電/玩具・ホビー/ゲーム/カード/パソコン/楽器/スマホ・タブレット/車・バイク/釣り/ゴルフ
- ログイン: sassa@gmail.com / sassa0110

## 現在のスクリプト構成

### scripts/hiro-tool-scraper.mjs
- ひろさんツールの即売れ/日時売り切れリストをPuppeteerでスクレイピング
- Chrome リモートデバッグ接続（ポート9222、SurugayaBotプロファイル）
- 出力: `hiro_{category}_{listType}.json`

### scripts/fishing-model-extract.mjs
- JSONから型番を抽出 → メルカリ検索リンク付きHTML生成
- 出力: `fishing_search_list.html`

### scripts/fishing-auto-judge.mjs
- 型番でメルカリsold検索 → 利益判定 → 登録ワードリスト生成
- 出力: `fishing_register_words.txt` + `fishing_judge_result.html`

### scripts/fishing-daily.mjs（日次自動化）
- 上記を統合した自動巡回スクリプト
- 差分管理（`data/fishing-daily/known_{category}_{listType}.json`）
- CSV生成 → Discord送信
- 起動: `start-fishing-daily.bat`

## 3/23時点の実行結果
- 即売れリスト: 全209件取得
- 型番フィールドあり: 63件 → メルカリ判定済み
- 商品名から型番抽出: 53件 → メルカリ判定済み
- **汎用名のみ: 93件 → 未処理（ここが問題）**

### 登録OK 29件（fishing_register_words.txt）
CALCUTTA, C3000XG, 15TWINPOWER, 301XGLH, C2000HGS, C3000SDHHG, 19STRADIC, 3000MHG, RR600SDH, 翼15尺, 3000H-LBD, 電動丸1000PLAYS, ヴァンフォードC3000XG, MZRS-461, CERTATE, XT1000, 20STELLA, ゲームウェーダー, BANTAM200, 23AIRITY, 1000SSSPG-B, DW-1925, PLAYS4000, BJ75D, マルチ145, DSEX-73, TOMOKAN, G-TUNE, キャスティズムT20号-385・V

### 要手動 10件
DS2 590 GRAPHITE II, 飛天弓 閃光R 19尺, 4000S, 68L-S, C3000, 600H, 65L-T.N, 200J, 10TH, 86ML-S・N

## 2026-03-24 改修: オフモールスクレイピング追加

### 改修内容
`fishing-daily.mjs`にStep 2「オフモール商品ページから実データ取得」を追加。

**Before:** ひろさんツールの表示名が汎用名（「スピニングリール」等）の場合、型番抽出できず約45%の商品を捨てていた。

**After:** 全件のoffmallUrlをfetchして`product-detail-cate-name`（ブランド）と`product-detail-num`（型番）を取得。汎用名の商品もオフモール経由で型番が取れる。

### オフモール商品ページの構造
- `product-detail-cate-name` → ブランド（SHIMANO, DAIWA等）
- `product-detail-num` → 型番（「型番：CRX-962LSJ」形式）
- fetchで取れる（Puppeteer不要）
- 売り切れ商品でもページは残っている（一部削除済み商品は「対象の商品はございません」）

### テスト結果（汎用名→オフモール型番）
| ひろさんツール表示名 | オフモール ブランド | オフモール型番 | 登録ワード |
|---|---|---|---|
| スピニングリール | KASTKING | 1000S 箱付 極美品 | 1000S |
| リール | ABU GARCIA | AMBASSADEUR6500C | AMBASSADEUR6500C |
| ショアジギング | メジャークラフト | CRX-962LSJ | CRX-962LSJ |
| スピニングリール | DAIWA | 23AIRITY ST SF2000SS-P | 23AIRITY |
| ヘラ竿 | SHIMANO | 翼19尺 | 翼19尺 |

### 処理フロー（改修後）
1. ひろさんツール即売れリストスクレイプ（Puppeteer、差分のみ）
2. **NEW: 全件のオフモール商品ページをfetchしてブランド・型番を取得（1秒間隔）**
3. `buildSearchKeyword()`で優先順位付きキーワード構築（オフモール型番 > ひろさん型番 > 商品名）
4. メルカリsold検索 → 利益判定（1.5秒間隔）
5. 1単語で登録できる型番を`getRegisterWord()`で抽出
6. CSV生成 → Discord送信

## 未完了タスク

### 1. 実行テスト（本番データ）
改修後のfishing-daily.mjsを実際にChrome接続で回すテストが未実施。
ロジックの単体テストは通っている。

### 2. DATA_DIRのカテゴリ対応
現在`data/fishing-daily/`固定。他ジャンルに展開する時は`data/{category}-daily/`にする。

### 3. コスト・負荷の注意
- ひろさんツールへの過度なアクセスはNG
- オフモールfetch: 1秒間隔（200件で約3分半）
- メルカリAPI: 1.5秒間隔
- Claude API等の高コストな判定は使わない。パターンマッチで十分

## 技術メモ
- Puppeteer + 実Chrome（リモートデバッグ9222、SurugayaBotプロファイル）
- メルカリsold検索: generate-mercari-jwt（sedori-research-appのnode_modules借用）
- Discord通知: Webhook
- レート制限: メルカリ検索間1.5秒、ひろさんツールページ間2秒
