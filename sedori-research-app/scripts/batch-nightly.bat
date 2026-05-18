@echo off
REM ============================================
REM 夜間バッチ：駿河屋画像取得 → watchlistスクレイプ → Gemini照合
REM 実行目安: 2〜6時間
REM 使い方: コマンドプロンプトから batch-nightly.bat
REM ============================================

cd /d "%~dp0\.."

echo [1/3] 駿河屋画像URL 全件バッチ取得 (imageUrl NULL商品のみ)
node scripts/batch-fetch-images.mjs

echo.
echo [2/3] watchlist全件スクレイプ (新親商品クエリ含む、MUSTフィルタ適用済み)
node scripts/surugaya-catalog.mjs --watchlist

echo.
echo [3/3] Gemini画像照合 全商品
node scripts/batch-gemini-match.mjs

echo.
echo === 夜間バッチ完了 ===
pause
