@echo off
REM 釣り具日次巡回（タスクスケジューラ用）
REM 前提: SurugayaBotプロファイルのChromeがログイン済み

cd /d C:\Users\user\ai-skills

REM Chrome起動（既に起動してれば無視される）
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\SurugayaBot"

REM 5秒待ってからスクリプト実行
timeout /t 5 /nobreak >nul

node scripts/fishing-daily.mjs fishing soldout
