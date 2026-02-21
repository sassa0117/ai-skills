@echo off
cd /d C:\Users\user\ai-skills

REM Copy latest skill files
copy /Y "C:\Users\user\.claude\commands\x-strategy.md" .
copy /Y "C:\Users\user\.claude\commands\x-analytics.md" . 2>nul
copy /Y "C:\Users\user\.claude\commands\wp-sedori.md" . 2>nul
copy /Y "C:\Users\user\.claude\commands\anti-ai-writing.md" . 2>nul
copy /Y "C:\Users\user\.claude\commands\infographic.md" . 2>nul
copy /Y "C:\Users\user\.claude\commands\blog-publish.md" . 2>nul
copy /Y "C:\Users\user\affiliate-project-strategy.md" .

REM Git add, commit, push
git add .
git commit -m "Update skills: %date% %time%"
git push

echo Done!
pause
