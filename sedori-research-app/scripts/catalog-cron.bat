@echo off
cd /d "C:\Users\user\ai-skills\sedori-research-app"
node scripts/catalog-cron.mjs >> logs\cron-output.log 2>&1
