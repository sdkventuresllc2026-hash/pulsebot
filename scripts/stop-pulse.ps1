# Stop every Pulse bot (node index.js) and clear the process lock.
$root = Split-Path -Parent $PSScriptRoot
Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'index\.js' } |
  ForEach-Object {
    Write-Host "Stopping PID $($_.ProcessId): $($_.CommandLine)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 2
$lock = Join-Path $root '.pulse-bot.lock'
if (Test-Path $lock) {
  Remove-Item $lock -Force
  Write-Host "Removed lock file."
}
Write-Host "Done. Start once: cd `"$root`"; npm start"
