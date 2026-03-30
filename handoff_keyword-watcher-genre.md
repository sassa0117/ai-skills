# 引き継ぎ: keyword-watcher ジャンルタブ + ホビー自動登録

## 現状（2026-03-25）

### 完了済み
1. **fishing-daily.mjs 修正済み**
   - CSV生成 → keyword-watcher API直接登録に変更
   - `searchKeyword`（ブランド+型番の複合ワード）を使用
   - 重複チェック付き
   - genre引数をそのままAPIに渡す
   - 不要コード削除済み（pickBestToken, getRegisterWord, generateWordCSV, sendDiscordFiles）
   - テスト済み: 44件登録成功、Discord通知OK

2. **keyword-watcherにgenreフィールド追加済み（コード変更済み、未デプロイ）**
   - backend/models.py: Keyword に `genre` カラム追加
   - backend/database.py: マイグレーション追加（ALTER TABLE keywords ADD COLUMN genre）
   - backend/main.py: KeywordCreate/KeywordResponse に genre追加、CRUD対応、CSVインポート対応
   - frontend/app.html: ジャンルセレクト追加、ジャンルタブUI追加
   - frontend/css/style.css: .genre-tabs, .genre-tab, .genre-badge スタイル追加
   - frontend/js/app.js: ジャンルフィルタリング、カウント表示、編集ボタン追加

3. **GitHubにpush済み**: `sassa0117/offmall-keyword-watcher` master
4. **APIでgenreフィールドは動作確認済み**（バックエンドは反映されてる。フロントが未反映）
5. **既存釣り具キーワード41件にgenre=fishing設定済み**

### 未完了: デプロイ
- **RailwayはCLIデプロイ（`railway up`）で運用されてる。GitHub連携ではない**
- git pushしてもRailwayに自動デプロイされない
- GitHubにはpush済み（master）
- **Railway APIトークン（claude-deploy, claude 2）を2つ作ったが、CLIで認証が通らなかった**
  - Scope: 疲れた眠い's Projects（正しい）
  - CLIもGraphQL APIも Unauthorized になる
  - 原因不明。Railway側の仕様変更か、トークン形式の問題の可能性
- **Redeployボタンは古いCLIデプロイを再実行するだけ。新コードは反映されない**
- **解決方法（優先順）**:
  1. Railway Settings タブ → Source → GitHubリポジトリ `sassa0117/offmall-keyword-watcher` を接続 → 以後git pushで自動デプロイ（これが一番確実）
  2. ユーザーがターミナルで `cd C:\Users\user\offmall-keyword-watcher && railway login && railway up` を実行

### 未完了: ホビー自動登録
- fishing-daily.mjs は `node scripts/fishing-daily.mjs toy_hobby soldout` でホビー版として動く
- テスト未実施
- hiro-tool-scraper.mjs は取得+JSON保存のみの旧スクリプト（fishing-daily.mjsに機能統合済み）

## ファイル
- `ai-skills/scripts/fishing-daily.mjs` - メインスクリプト（修正済み）
- `offmall-keyword-watcher/` - keyword-watcherリポジトリ（genre対応済み、未デプロイ）
- `offmall-watcher/README.md` - 仕様書

## 認証情報
- MEMORYに記録済み（reference_offmall-keyword-watcher.md）
- 二度と聞くな

## 次にやること
1. デプロイ（上記A or Bの方法）
2. フロントエンドでジャンルタブ動作確認
3. `node scripts/fishing-daily.mjs toy_hobby soldout` テスト実行
4. 将来: 他カテゴリ（game, instrument等）対応
