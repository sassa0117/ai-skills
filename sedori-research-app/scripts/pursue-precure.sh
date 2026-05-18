#!/bin/bash
# プリキュアDX玩具を順次駿河屋検索（並列なし、BOT検知配慮で4秒間隔）
# 巡回バッチ完了後に手動実行する想定
# 使い方: bash scripts/pursue-precure.sh

set -e
cd "$(dirname "$0")/.."

LOG="logs/pursue-precure-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

keywords=(
  "ふたりはプリキュア カードコミューン"
  "Max Heart ハートフルコミューン"
  "Splash Star ミックスコミューン"
  "Splash Star クリスタルコミューン"
  "Yes プリキュア5 ピンキーキャッチュ"
  "プリキュア5 GoGo 変身ケータイ キュアモ"
  "フレッシュプリキュア リンクルン"
  "ハートキャッチプリキュア ココロパフューム"
  "ハートキャッチプリキュア シャイニータンバリン"
  "スイートプリキュア キュアモジューレ"
  "スマイルプリキュア スマイルパクト"
  "スマイルプリキュア プリンセスキャンドル"
  "ドキドキプリキュア ラブリーコミューン"
  "ドキドキプリキュア ラブハートアロー"
  "ハピネスチャージプリキュア プリチェンミラー"
  "ハピネスチャージプリキュア ラブプリブレス"
  "プリンセスプリキュア プリンセスパフューム"
  "魔法つかいプリキュア リンクルスマホン"
  "プリキュアアラモード スイーツパクト"
  "プリキュアアラモード キャンディロッド"
  "HUGっとプリキュア プリハート"
  "スタートゥインクルプリキュア スターカラーペンダント"
  "ヒーリングっどプリキュア ヒーリングステッキ"
  "トロピカルージュプリキュア マーメイドアクアポット"
  "トロピカルージュプリキュア マーメイドアクアパクト"
  "デリシャスパーティプリキュア ハートキュアウォッチ"
  "ひろがるスカイプリキュア スカイミラージュ"
  "わんだふるぷりきゅあ ワンダフルパクト"
  "キミとアイドルプリキュア アイドルハートブローチ"
  "名探偵プリキュア ジュエルキュアウォッチ"
  "名探偵プリキュア ティアアルカナロッド"
  "プリキュア 変身 DX"
  "プリキュア 一番くじ"
)

echo "=== pursue-precure start: $(date) ===" | tee -a "$LOG"
echo "対象: ${#keywords[@]}件" | tee -a "$LOG"
echo "" | tee -a "$LOG"

i=0
for kw in "${keywords[@]}"; do
  i=$((i+1))
  echo "[$i/${#keywords[@]}] $kw" | tee -a "$LOG"
  node scripts/surugaya-catalog.mjs --keyword "$kw" --limit 30 --skip-mercari >> "$LOG" 2>&1 || echo "  (failed, continue)" | tee -a "$LOG"
  sleep 4
done

echo "" | tee -a "$LOG"
echo "=== pursue-precure done: $(date) ===" | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "次のステップ: node scripts/batch-fetch-images.mjs（画像URL取得）" | tee -a "$LOG"
