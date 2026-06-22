# Replace broken Cursor agent.ps1 / cursor-agent.ps1 shims (mrcx patched).
param([switch]$WhatIf)

$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'cursor-agent'
$template = Join-Path $PSScriptRoot 'cursor-agent-shim.ps1'

if (-not (Test-Path $base)) {
  Write-Error "cursor-agent not found at $base"
}
if (-not (Test-Path $template)) {
  Write-Error "missing template: $template"
}

$targets = @(
  (Join-Path $base 'agent.ps1'),
  (Join-Path $base 'cursor-agent.ps1')
)

foreach ($target in $targets) {
  if (-not (Test-Path $target)) {
    Write-Warning "skip missing: $target"
    continue
  }
  if ($WhatIf) {
    Write-Host "[WhatIf] would replace: $target"
    continue
  }
  Copy-Item $target "$target.bak-mrcx" -Force
  Copy-Item $template $target -Force
  Write-Host "replaced: $target (backup: $target.bak-mrcx)"
}

if (-not $WhatIf) {
  Write-Host ''
  Write-Host 'verify:'
  & (Join-Path $base 'agent.ps1') status
}
