# X投稿一括生成 引き継ぎノート（2026-03-21）

## やったこと
- Postモデルに `scheduledAt` フィールド追加済み（prisma db push済み）
- `/api/posts/bulk-generate` — ドラフト保存API（AI API不使用。Claude Codeから保存するだけ）
- `/api/posts/[id]` — 個別PATCH/DELETE API
- `/calendar` ページ — カレンダー表示・編集・コピー・投稿済みマーク
- BottomNavにカレンダータブ追加
- scrape-x.mjs修正 — セッション切れ時の自動検出・protocolTimeout延長
- 最新28件スクレイプ済み（合計528件）

## ビルド
- `debug-analytics.ts` の型エラー修正済み
- ビルド通る状態

## 未完了・次やること
- **ポストの中身作成が本題。以下のフローで進める:**
  1. リメイク候補（3ヶ月以上前の高パフォーマンス）をリストで提示
  2. WP APIから実売データを素材として提示
  3. **ユーザーが内容を決める・書く**（AIが勝手に書くな）
  4. ユーザーの指示で手直し・整形
  5. `/api/posts/bulk-generate` POST で保存
- 毎日投稿ペース
- 科学的な投稿ミックス: バズ/ノウハウ/実売報告/宣伝/自由（割合は適宜調整）

## 重要な反省点
- **AIがポストの文面を勝手に書くな。ユーザーが書く。AIは素材提示と手直し。**
- 「ノウハウ系」の基準を高くしすぎるな。Xでは「こういうの高いから覚えておけ」で十分ノウハウ
- 3ヶ月以上前のポストは再利用OK（ほぼ同じ文章でもいい）
- リメイク済みのポスト（例: プリキュアウエハース 11/19→2/23）を把握しろ
- 確認ばかりするな。「任せる」と言われたら動け。ただしポストの中身は勝手に決めるな

## データの場所
- DB: x-post-assistant/prisma/dev.db（528件、日付あり）
- JSON: data/x-posts.json（528件、日付undefinedのものあり）
- WP API: sedorisassa.com — ID:5366（2月利益商品）、ID:5043（1月利益商品）に実売データあり

## API使い方
```bash
# ドラフト保存
curl -X POST http://localhost:3001/api/posts/bulk-generate \
  -H "Content-Type: application/json" \
  -d '{"drafts": [{"content": "ポスト本文", "postType": "mega_buzz", "scheduledAt": "2026-03-24T10:00:00Z"}]}'

# ドラフト一覧
curl http://localhost:3001/api/posts/bulk-generate

# 個別編集
curl -X PATCH http://localhost:3001/api/posts/{id} \
  -H "Content-Type: application/json" \
  -d '{"content": "修正後の本文"}'

# 個別削除
curl -X DELETE http://localhost:3001/api/posts/{id}
```
