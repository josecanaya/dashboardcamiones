$w = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONIOENCODING = "utf-8"
python "$w\graph.py" | Out-Null
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
foreach ($m in @("full", "r7")) {
  $html = "file:///" + ("$w\graph_$m.html" -replace '\\', '/')
  $p = Start-Process -FilePath $edge -ArgumentList @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", "--window-size=1684,720", "--screenshot=$w\graph_$m.png", $html) -PassThru -WindowStyle Hidden
  $p.WaitForExit(30000) | Out-Null
}
Get-ChildItem "$w\graph_*.png" | Select-Object Name, Length, LastWriteTime
