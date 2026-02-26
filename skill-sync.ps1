Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$global:watcherProcess = $null
$global:isRunning = $false

# === トレイアイコン作成 ===
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Visible = $true

function Set-IconOn {
    $bmp = New-Object System.Drawing.Bitmap(16, 16)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.FillEllipse([System.Drawing.Brushes]::LimeGreen, 2, 2, 12, 12)
    $g.Dispose()
    $notifyIcon.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $notifyIcon.Text = "Skill Sync: ON"
}

function Set-IconOff {
    $bmp = New-Object System.Drawing.Bitmap(16, 16)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.FillEllipse([System.Drawing.Brushes]::Gray, 2, 2, 12, 12)
    $g.Dispose()
    $notifyIcon.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $notifyIcon.Text = "Skill Sync: OFF"
}

function Start-Watcher {
    if ($global:watcherProcess -and !$global:watcherProcess.HasExited) { return }
    $si = New-Object System.Diagnostics.ProcessStartInfo
    $si.FileName = "node"
    $si.Arguments = "watcher.js"
    $si.WorkingDirectory = "C:\Users\user\ai-skills"
    $si.WindowStyle = "Hidden"
    $si.CreateNoWindow = $true
    $si.UseShellExecute = $false
    $global:watcherProcess = [System.Diagnostics.Process]::Start($si)
    $global:isRunning = $true
    Set-IconOn
    $toggleItem.Text = "● 同期ON（クリックでOFF）"
}

function Stop-Watcher {
    if ($global:watcherProcess -and !$global:watcherProcess.HasExited) {
        $global:watcherProcess.Kill()
        $global:watcherProcess.WaitForExit(3000)
    }
    $global:watcherProcess = $null
    $global:isRunning = $false
    Set-IconOff
    $toggleItem.Text = "○ 同期OFF（クリックでON）"
}

# === メニュー ===
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$toggleItem = New-Object System.Windows.Forms.ToolStripMenuItem
$toggleItem.Text = "● 同期ON（クリックでOFF）"
$toggleItem.Add_Click({
    if ($global:isRunning) { Stop-Watcher } else { Start-Watcher }
})

$syncNowItem = New-Object System.Windows.Forms.ToolStripMenuItem
$syncNowItem.Text = "今すぐ同期"
$syncNowItem.Add_Click({
    Set-Location "C:\Users\user\ai-skills"
    & node -e "require('./watcher.js')" 2>$null
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList "-e `"const w = require('./watcher.js')`"" -WorkingDirectory "C:\Users\user\ai-skills"
})

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "終了"
$exitItem.Add_Click({
    Stop-Watcher
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$contextMenu.Items.Add($toggleItem) | Out-Null
$contextMenu.Items.Add($syncNowItem) | Out-Null
$contextMenu.Items.Add("-") | Out-Null
$contextMenu.Items.Add($exitItem) | Out-Null

$notifyIcon.ContextMenuStrip = $contextMenu

# ダブルクリックでトグル
$notifyIcon.Add_DoubleClick({
    if ($global:isRunning) { Stop-Watcher } else { Start-Watcher }
})

# === 起動 ===
Start-Watcher

[System.Windows.Forms.Application]::Run()
