$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path "$scriptDir\..\.."
$workingDir = Join-Path $root "WORKING"
$designRefDir = Join-Path $root "DESIGN_REFERENCES"
$handoffDir = Join-Path $root "HANDOFF_TO_CHATGPT"
$zipPath = Join-Path $handoffDir "NTK_AI_Income_Opportunity_Hunter_M5b_2026-10-15.zip"
$shaPath = Join-Path $handoffDir "NTK_AI_Income_Opportunity_Hunter_M5b_2026-10-15.zip.sha256"

$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "ntk_m5b_staging"
if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

Write-Host "Staging DESIGN_REFERENCES..."
$stageDesign = Join-Path $stagingDir "DESIGN_REFERENCES"
New-Item -ItemType Directory -Path $stageDesign | Out-Null
Copy-Item -Path (Join-Path $designRefDir "*") -Destination $stageDesign

Write-Host "Staging WORKING files..."
$stageWorking = Join-Path $stagingDir "WORKING"
New-Item -ItemType Directory -Path $stageWorking | Out-Null

Push-Location $workingDir
$trackedFiles = git ls-files
foreach ($file in $trackedFiles) {
    if ($file -eq "tools/package-handoff.ps1") { continue }
    $src = Join-Path $workingDir $file
    $dest = Join-Path $stageWorking $file
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -Path $src -Destination $dest -Force
}
Pop-Location

Write-Host "Compressing archive to $zipPath..."
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Computing SHA-256..."
$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLower()
$hash | Out-File -FilePath $shaPath -Encoding ascii -NoNewline

$totalEntries = (Get-ChildItem -Path $stageDesign -File).Count + (Get-ChildItem -Path $stageWorking -Recurse -File).Count
$sizeBytes = (Get-Item $zipPath).Length

Write-Host "Canonical package complete!"
Write-Host "Path: $zipPath"
Write-Host "SHA256: $hash"
Write-Host "Entries: $totalEntries"
Write-Host "Size: $sizeBytes bytes"

# Clean up staging
Remove-Item -Path $stagingDir -Recurse -Force
