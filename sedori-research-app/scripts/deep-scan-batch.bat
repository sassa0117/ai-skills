@echo off
REM ============================================
REM 駿屋カタログ Deep scan バッチ
REM
REM 目的: nightly-full とは独立に「過去深掘り」を進める
REM      ScanCursor の lastPage を見て続きから走査
REM
REM 設計:
REM   - 1回の実行で BATCH_SIZE 個の cursor を進める（lastPage 昇順で優先）
REM   - 各 cursor あたり 10ページ走査（駿屋 24件/page = 240件）
REM   - メルカリ比較は skip（カタログ取り込み優先）
REM   - 詳細取得込みで cursor あたり 約 5分目安
REM
REM Task Scheduler から昼間 1〜2回呼ぶ前提。1回 30〜90分目安。
REM ============================================

cd /d "%~dp0\.."
if not exist logs mkdir logs

set LOGFILE=logs\deep-scan-%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%.log
set LOGFILE=%LOGFILE: =0%

set BATCH_SIZE=10
set MAX_PAGES=10

echo === [%date% %time%] deep-scan start (batch=%BATCH_SIZE% pages=%MAX_PAGES%) === >> %LOGFILE%

node scripts/surugaya-catalog.mjs --watchlist --mode deep --skip-mercari --batch-size %BATCH_SIZE% --max-pages %MAX_PAGES% >> %LOGFILE% 2>&1

echo === [%date% %time%] deep-scan done === >> %LOGFILE%
