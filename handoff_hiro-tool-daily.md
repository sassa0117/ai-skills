# 引き継ぎ: ひろさんツール入荷通知ワード自動抽出 + オフモール入荷通知統合

## 現状（2026-03-25）

### fishing-daily.mjs
- パイプライン全体動作確認済み（Step 1〜6）
- 修正済み: ブランド+型番で複合キーワード検索、管理番号除去、HTMLエンティティデコード、汎用ワード除外
- スクリプト: `ai-skills/scripts/fishing-daily.mjs`

### ひろさんツールの制約
- **入荷通知は1単語しか登録できない**（CSV一括登録でも同じ。2単語1セルでエラー）
- 使い物にならない → 入荷通知はひろさんツールを使わない方針に転換
- ひろさんツールは**即売れリスト取得専用**として使う

### 既存の自作ツール: offmall-keyword-watcher
- リポジトリ: `C:\Users\user\offmall-keyword-watcher`（GitHub: sassa0117/offmall-keyword-watcher）
- 仕様書: `C:\Users\user\offmall-watcher\README.md`
- 本番: https://offmall-keyword-watcher-production.up.railway.app/admin
- 技術: Python + FastAPI + SQLAlchemy + SQLite、Railway（Docker）
- **現在の運用: ホビーカテゴリのみカテゴリ監視で新着取得。そこからキーワードを拾う仕組み**
- スキャン間隔: 180秒（3分）
- 通知: Discord / LINE
- コスト: Railway $5/月

### offmall-keyword-watcherの2つの監視モード
1. **カテゴリ監視**: オフモールのカテゴリURL直指定 → 新着商品を検出 → 通知（**メインで使ってる**）
2. **キーワード検索**: 登録キーワードでオフモール全体検索 → 新着検出 → 通知（補助）

### 関連リポジトリ
- `offmall-fast-seller`: 即売れチェッカー（PWA、別アプリ）
- `offmall-pricedown-checker`: 値下げチェッカー（GitHub Actions cron）

## 方針

**ひろさんツール（即売れリスト取得）→ 利益判定 → offmall-keyword-watcherに統合**

ただし、keyword-watcherの現在の運用がホビーカテゴリのカテゴリ監視ベースなので、
釣り具を追加するにはkeyword-watcherの設定・運用フローを理解した上で統合する必要がある。

## 次にやること

1. **offmall-keyword-watcherの現在の運用状態を確認**
   - Railway上のDB（登録済みキーワード、カテゴリURL、ユーザー設定）
   - 管理者ログイン情報（Railway環境変数）
   - ホビーカテゴリ監視の具体的なURL・設定
2. **釣り具カテゴリの追加**
   - オフモールの釣り具カテゴリURLを特定
   - keyword-watcherのカテゴリ監視に追加
3. **fishing-daily.mjsとの連携設計**
   - 即売れリストから利益判定したキーワードをどうkeyword-watcherに流すか
   - カテゴリ監視とキーワード検索の使い分け
4. **将来展開**: 駿河屋（入荷通知併用）、まんだらけ・らしんばん・とれふぁく（定期巡回）

## 技術メモ

### keyword-watcher API
- `POST /api/keywords` - キーワード登録（複合ワードOK）
- `POST /api/keywords/import` - CSV一括インポート
- `POST /api/auth/login` - JWT認証
- 認証: JWT（`require_active_subscription` = admin/無料/有料会員）

### fishing-daily.mjs テスト結果（2026-03-25）
- 212件スクレイプ → 新規212件 → オフモール詳細取得（成功76/失敗136）→ 検索対象201件
- 登録OK 74件 → 修正後23件（汎用ワード除外で精度向上）
- 要手動 25件 → 修正後13件
- ページネーション: 7ページ目で0件になる場合あり（タイミング差？）
