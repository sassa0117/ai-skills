$ErrorActionPreference = 'Stop'

Write-Host "=== 1. stuck node プロセス kill ==="
$killed = 0
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'surugaya-catalog|nightly-full|batch-fetch-images|batch-gemini-match|sedori-research-app' } |
  ForEach-Object {
    Write-Host "  killing PID $($_.ProcessId)"
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $killed++ } catch {}
  }
# cmd.exe の nightly-full.bat も拾う
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
  Where-Object { $_.CommandLine -match 'nightly-full|sedori-research-app' } |
  ForEach-Object {
    Write-Host "  killing cmd PID $($_.ProcessId)"
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $killed++ } catch {}
  }
Write-Host "  killed: $killed"

Write-Host ""
Write-Host "=== 2. CatalogNightly のバッテリ条件解除 ==="
$t = Get-ScheduledTask -TaskName 'SedoriResearch-CatalogNightly'
$t.Settings.DisallowStartIfOnBatteries = $false
$t.Settings.StopIfGoingOnBatteries     = $false
$t.Settings.StartWhenAvailable         = $true
Set-ScheduledTask -InputObject $t | Out-Null
Write-Host "  DisallowStartIfOnBatteries = false"
Write-Host "  StopIfGoingOnBatteries     = false"
Write-Host "  StartWhenAvailable         = true"

Write-Host ""
Write-Host "=== 3. TrendScan を Task Scheduler に新規登録 ==="
$action  = New-ScheduledTaskAction -Execute 'C:\Users\user\ai-skills\sedori-research-app\scripts\trend-scan-cron.bat'
$trigger = New-ScheduledTaskTrigger -Daily -At '5:00am'
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'SedoriResearch-TrendScan' `
  -Action $action -Trigger $trigger -Settings $set -Force `
  -Description 'Hobipedia: 今期アニメ自動取得・メルカリsold相場上昇トレンド検知 (Discord通知付き)' | Out-Null
Write-Host "  registered: SedoriResearch-TrendScan @ 05:00 daily"

Write-Host ""
Write-Host "=== 4. nightly-full.bat を背景起動（今日の分回収） ==="
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c','C:\Users\user\ai-skills\sedori-research-app\scripts\nightly-full.bat' `
  -WindowStyle Hidden -WorkingDirectory 'C:\Users\user\ai-skills\sedori-research-app'
Write-Host "  launched in background"

Write-Host ""
Write-Host "=== Done ==="
