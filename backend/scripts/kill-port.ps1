param(
  [int]$Port = 4000
)

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listeners) {
  Write-Host "Nothing is listening on port $Port."
  exit 0
}

$procIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $procIds) {
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    Write-Host "Stopping PID $procId ($($p.ProcessName)) - was listening on port $Port"
    Stop-Process -Id $procId -Force
  } catch {
    Write-Warning ('Could not stop PID ' + $procId + ': ' + $_.Exception.Message)
  }
}
