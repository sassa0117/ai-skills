$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("$env:USERPROFILE\Desktop\Skill Sync.lnk")
$sc.TargetPath = "wscript.exe"
$sc.Arguments = "`"C:\Users\user\ai-skills\start-sync.vbs`""
$sc.WorkingDirectory = "C:\Users\user\ai-skills"
$sc.Description = "Skill Sync"
$sc.Save()
