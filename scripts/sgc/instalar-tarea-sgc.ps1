# Programa el guardado SGC cada hora en el Programador de tareas de Windows (usuario actual,
# solo con la sesión iniciada). La vista guarda 24 h: con una corrida por hora hay margen
# aunque fallen varias seguidas. Salida en data\sgc\_snapshot.log.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\sgc\instalar-tarea-sgc.ps1
# Quitar: schtasks /Delete /TN "BIMtrazer SGC guardado" /F
#
# Requiere VPN Vicentin conectada y la ruta a 192.168.15.55. Para que la ruta no se pierda al
# reiniciar, una vez en una terminal de administrador:
#   route -p add 192.168.15.55 mask 255.255.255.255 10.8.0.1
# (o agregar "route 192.168.15.55 255.255.255.255" al perfil Bimtrazer.ovpn).

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node).Source
$log = Join-Path $root 'data\sgc\_snapshot.log'

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c cd /d `"$root`" && `"$node`" scripts\sgc\snapshot-sgc.mjs >> `"$log`" 2>&1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'BIMtrazer SGC guardado' -Action $action -Trigger $trigger -Settings $settings -Description 'Guarda la vista SGC (24 h) en data/sgc y data/movimientos' -Force | Out-Null
Write-Output "Tarea 'BIMtrazer SGC guardado' programada cada hora. Log: $log"
