Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\user\ai-skills\skill-sync.ps1""", 0, False
