if (-not $env:CURSOR_INVOKED_AS) {
    $env:CURSOR_INVOKED_AS = Split-Path -leaf $MyInvocation.MyCommand.Name
}
$scriptPath = Split-Path -parent $MyInvocation.MyCommand.Definition

if (-not $env:NODE_COMPILE_CACHE) {
    $env:NODE_COMPILE_CACHE = "$env:LOCALAPPDATA\cursor-compile-cache"
}

if (Test-Path "$scriptPath\node.exe") {
    & "$scriptPath\node.exe" "$scriptPath\index.js" @args
    exit $LASTEXITCODE
}

$versionsRoot = Join-Path $scriptPath 'versions'
$versionDir = Get-ChildItem -Path $versionsRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object {
        (Test-Path (Join-Path $_.FullName 'node.exe')) -and (Test-Path (Join-Path $_.FullName 'index.js'))
    } |
    Sort-Object Name -Descending |
    Select-Object -First 1

if (-not $versionDir) {
    Write-Error "No version directories found in $scriptPath"
    exit 1
}

& (Join-Path $versionDir.FullName 'node.exe') (Join-Path $versionDir.FullName 'index.js') @args
exit $LASTEXITCODE
