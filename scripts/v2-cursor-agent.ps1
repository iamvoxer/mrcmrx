# v2 wrapper: invoke cursor-agent when agent.ps1 shim is broken on Windows.
# Usage: .\scripts\v2-cursor-agent.ps1 login
#        .\scripts\v2-cursor-agent.ps1 status
#        .\scripts\v2-cursor-agent.ps1 create-chat
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'cursor-agent\versions'
if (-not (Test-Path $base)) {
    Write-Error "cursor-agent not installed. Run: irm 'https://cursor.com/install?win32=true' | iex"
}

$versionDir = Get-ChildItem $base -Directory |
    Where-Object {
        (Test-Path (Join-Path $_.FullName 'node.exe')) -and (Test-Path (Join-Path $_.FullName 'index.js'))
    } |
    Sort-Object Name -Descending |
    Select-Object -First 1

if (-not $versionDir) {
    Write-Error "No cursor-agent version with node.exe under $base"
}

$node = Join-Path $versionDir.FullName 'node.exe'
$index = Join-Path $versionDir.FullName 'index.js'
& $node $index @Args
exit $LASTEXITCODE
