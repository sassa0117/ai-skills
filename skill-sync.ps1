[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$global:watcherProcess = $null
$global:isRunning = $false

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
    $toggleItem.Text = "Sync ON (click to OFF)"
}

function Stop-Watcher {
    if ($global:watcherProcess -and !$global:watcherProcess.HasExited) {
        $global:watcherProcess.Kill()
        $global:watcherProcess.WaitForExit(3000)
    }
    $global:watcherProcess = $null
    $global:isRunning = $false
    Set-IconOff
    $toggleItem.Text = "Sync OFF (click to ON)"
}

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$toggleItem = New-Object System.Windows.Forms.ToolStripMenuItem
$toggleItem.Text = "Sync ON (click to OFF)"
$toggleItem.Add_Click({
    if ($global:isRunning) { Stop-Watcher } else { Start-Watcher }
})

$syncNowItem = New-Object System.Windows.Forms.ToolStripMenuItem
$syncNowItem.Text = "Sync Now"
$syncNowItem.Add_Click({
    $si2 = New-Object System.Diagnostics.ProcessStartInfo
    $si2.FileName = "node"
    $si2.Arguments = "-e `"const fs=require('fs');const path=require('path');const{execSync}=require('child_process');const W=path.join(process.env.USERPROFILE,'.claude','commands');const R=path.join(process.env.USERPROFILE,'ai-skills');fs.readdirSync(W).filter(f=>f.endsWith('.md')).forEach(f=>{fs.copyFileSync(path.join(W,f),path.join(R,f))});execSync('git add -A',{cwd:R});try{execSync('git commit -m auto-sync',{cwd:R});execSync('git push',{cwd:R})}catch(e){}`""
    $si2.WorkingDirectory = "C:\Users\user\ai-skills"
    $si2.WindowStyle = "Hidden"
    $si2.CreateNoWindow = $true
    $si2.UseShellExecute = $false
    [System.Diagnostics.Process]::Start($si2)
})

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "Exit"
$exitItem.Add_Click({
    Stop-Watcher
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$contextMenu.Items.Add($toggleItem) | Out-Null
$contextMenu.Items.Add($syncNowItem) | Out-Null
$sep = New-Object System.Windows.Forms.ToolStripSeparator
$contextMenu.Items.Add($sep) | Out-Null
$contextMenu.Items.Add($exitItem) | Out-Null

$notifyIcon.ContextMenuStrip = $contextMenu

$notifyIcon.Add_DoubleClick({
    if ($global:isRunning) { Stop-Watcher } else { Start-Watcher }
})

Start-Watcher

[System.Windows.Forms.Application]::Run()
