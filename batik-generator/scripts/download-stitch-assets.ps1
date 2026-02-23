param(
  [string]$LandingCodeUrl = "",
  [string]$LandingImageUrl = "",
  [string]$CaptureCodeUrl = "",
  [string]$CaptureImageUrl = "",
  [string]$WorkspaceCodeUrl = "",
  [string]$WorkspaceImageUrl = ""
)

$ErrorActionPreference = "Stop"

$outDir = Join-Path $PSScriptRoot "..\stitch-assets"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Download-IfProvided {
  param(
    [string]$Url,
    [string]$OutFile
  )
  if ([string]::IsNullOrWhiteSpace($Url)) {
    return
  }
  Write-Host "Downloading $OutFile"
  curl.exe -L $Url -o (Join-Path $outDir $OutFile)
}

Download-IfProvided -Url $LandingCodeUrl -OutFile "landing-code.txt"
Download-IfProvided -Url $LandingImageUrl -OutFile "landing.png"
Download-IfProvided -Url $CaptureCodeUrl -OutFile "capture-code.txt"
Download-IfProvided -Url $CaptureImageUrl -OutFile "capture.png"
Download-IfProvided -Url $WorkspaceCodeUrl -OutFile "workspace-code.txt"
Download-IfProvided -Url $WorkspaceImageUrl -OutFile "workspace.png"

Write-Host "Done. Files saved in stitch-assets/."
