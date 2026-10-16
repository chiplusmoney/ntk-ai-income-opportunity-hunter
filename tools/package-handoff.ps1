$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'package-handoff.py'
python $script
if ($LASTEXITCODE -ne 0) { throw 'Canonical packaging failed' }
