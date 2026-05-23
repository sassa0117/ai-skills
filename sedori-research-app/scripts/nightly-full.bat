@echo off
REM ============================================
REM 夜間フルバッチ（自動実行用、pauseなし）
REM Task Scheduler から呼ばれる前提
REM
REM 順序:
REM   1. ip-fetch                      : しょぼいカレンダーから今期作品→watchlist自動追加
REM   2. surugaya-catalog --watchlist  : 駿河屋スキャン + メルカリsold取得
REM   3. batch-fetch-images            : 新規CatalogItemの画像URL取得（curl経由）
REM   4. batch-gemini-match            : Gemini照合（差分のみ、geminiCheckedAt利用）
REM   5. catalog-cron --skip-scan      : 高騰検知 + Discord通知（スキャンskip）
REM   6. sync-to-hobipedia             : SQLite→Neon Postgres同期（hobipedia.jp更新）
REM   7. comic-firstprint-scan         : 初版コミック相場2段階スキャン（メルカリ）
REM   8. comic-firstprint-fetch-covers : 楽天書影取得
REM   9. comic-firstprint-apply-amazon-covers : Amazon ASIN/書影
REM  10. sync-to-comic-firstprint-web  : SQLite→Neon Postgres同期（comic.hobipedia.jp更新）
REM
REM 想定実行時間: 1〜3時間（差分処理に最適化済み）
REM ============================================

cd /d "%~dp0\.."
if not exist logs mkdir logs

set LOGFILE=logs\nightly-full-%date:~0,4%%date:~5,2%%date:~8,2%.log

echo === [%date% %time%] nightly-full start === >> %LOGFILE%

echo [1/10] ip-fetch (watchlist 自動追加) >> %LOGFILE%
node scripts/ip-fetch.mjs >> %LOGFILE% 2>&1

echo [2/10] surugaya-catalog --watchlist >> %LOGFILE%
node scripts/surugaya-catalog.mjs --watchlist >> %LOGFILE% 2>&1

echo [3/10] batch-fetch-images >> %LOGFILE%
node scripts/batch-fetch-images.mjs >> %LOGFILE% 2>&1

echo [4/10] batch-gemini-match >> %LOGFILE%
node scripts/batch-gemini-match.mjs >> %LOGFILE% 2>&1

echo [5/10] catalog-cron --skip-scan >> %LOGFILE%
node scripts/catalog-cron.mjs --skip-scan >> %LOGFILE% 2>&1

echo [6/10] sync-to-hobipedia (SQLite -> Neon Postgres) >> %LOGFILE%
pushd "C:\Users\user\hobipedia"
node scripts/migrate-sqlite-to-postgres.mjs >> "%~dp0\..\%LOGFILE%" 2>&1
popd

echo [7/10] comic-firstprint-scan (2-phase) >> %LOGFILE%
node scripts/comic-firstprint-scan.mjs >> %LOGFILE% 2>&1

echo [8/10] comic-firstprint-fetch-covers >> %LOGFILE%
node scripts/comic-firstprint-fetch-covers.mjs >> %LOGFILE% 2>&1

echo [9/11] comic-firstprint-apply-amazon-covers >> %LOGFILE%
node scripts/comic-firstprint-apply-amazon-covers.mjs >> %LOGFILE% 2>&1

echo [10/11] comic-firstprint-data-fixes (Claude判定で汚染除去+Group統合) >> %LOGFILE%
node scripts/comic-firstprint-data-fixes.mjs >> %LOGFILE% 2>&1

echo [11/11] sync-to-comic-firstprint-web (SQLite -> Neon Postgres) >> %LOGFILE%
pushd "C:\Users\user\comic-firstprint-web"
node scripts/seed-from-sqlite.mjs >> "%~dp0\..\%LOGFILE%" 2>&1
popd

echo === [%date% %time%] nightly-full done === >> %LOGFILE%
