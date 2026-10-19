# Deja el guardado SGC andando sin nadie frente a la PC (fines de semana, reinicios).
# Correr UNA VEZ en PowerShell como ADMINISTRADOR:
#   powershell -ExecutionPolicy Bypass -File scripts\sgc\dejar-fijo-sgc.ps1
#
# Qué hace:
# 1. Agrega la ruta a 192.168.15.55 (base de la balanza) al perfil Bimtrazer.ovpn: el servidor de
#    Vicentin no la manda y se perdía en cada reinicio (corte del 16/10 14:08).
# 2. Pasa el perfil a config-auto: lo conecta el servicio OpenVPN al arrancar Windows, sin iniciar
#    sesión ni abrir la GUI. (Desde la GUI ya no aparece; se maneja con el servicio.)
# 3. Saca la suspensión e hibernación con corriente.
# 4. Reprograma la tarea «BIMtrazer SGC guardado» para que corra aunque no haya sesión iniciada
#    (S4U) y despierte la PC si estuviera suspendida.
# Lo único que no cubre: apagar la PC. Con la PC apagada no hay guardado (la vista solo guarda 24 h).
# Copia de seguridad del perfil: Bimtrazer.ovpn.bak-<fecha> en la misma carpeta.

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Hay que correrlo como administrador.'
}

$ovpnDir = 'C:\Program Files\OpenVPN'
$src = Join-Path $ovpnDir 'config\Bimtrazer.ovpn'
$autoDir = Join-Path $ovpnDir 'config-auto'
$dst = Join-Path $autoDir 'Bimtrazer.ovpn'
$ovpn = if (Test-Path $dst) { $dst } else { $src }

# 1. Ruta fija
Copy-Item $ovpn "$ovpn.bak-$(Get-Date -Format yyyyMMdd-HHmm)"
$lines = @(Get-Content $ovpn)
if (-not ($lines -match '^\s*route\s+192\.168\.15\.55\b')) {
  $i = 0
  while ($i -lt $lines.Count -and $lines[$i] -notmatch '^\s*<ca>') { $i++ }
  $route = 'route 192.168.15.55 255.255.255.255'
  $lines = if ($i -gt 0 -and $i -lt $lines.Count) { $lines[0..($i - 1)] + $route + $lines[$i..($lines.Count - 1)] } else { $lines + $route }
  Set-Content -Path $ovpn -Value $lines -Encoding ascii
  Write-Output "Ruta agregada a $ovpn"
} else { Write-Output 'La ruta ya estaba en el perfil.' }

# 2. Conexión automática por servicio
if ($ovpn -ne $dst) {
  Get-Process openvpn -ErrorAction SilentlyContinue | Stop-Process -Force   # corta la conexión de la GUI
  New-Item -ItemType Directory -Force $autoDir | Out-Null
  Move-Item $src $dst -Force
}
Set-Service OpenVPNService -StartupType Automatic
Restart-Service OpenVPNService
Write-Output 'VPN: la conecta el servicio OpenVPN al arrancar Windows.'

# 3. Sin suspensión con corriente
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
Write-Output 'Suspensión e hibernación con corriente: desactivadas.'

# 4. Tarea sin sesión iniciada
$task = 'BIMtrazer SGC guardado'
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Set-ScheduledTask -TaskName $task -Principal $principal -Settings $settings | Out-Null
Write-Output "Tarea '$task': corre cada hora aunque no haya sesión iniciada."

# Prueba
Start-Sleep -Seconds 20
$ok = Test-NetConnection 192.168.15.55 -Port 1521 -WarningAction SilentlyContinue
Write-Output ("Balanza 192.168.15.55:1521 -> " + $(if ($ok.TcpTestSucceeded) { 'OK' } else { 'SIN RESPUESTA (esperar 1 min y volver a probar)' }))
