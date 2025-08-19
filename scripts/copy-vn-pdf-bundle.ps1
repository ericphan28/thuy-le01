# Copies Vietnamese PDF-related files into a vietnamese-pdf-bundle folder, preserving structure
# Works relative to this repo; no need to change paths

$ErrorActionPreference = 'Stop'

# Resolve repo root from this script location
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$srcRoot = $repoRoot
$dstRoot = Join-Path $repoRoot 'vietnamese-pdf-bundle'

# List of files to copy (relative to $srcRoot)
$files = @(
  'app\api\invoices\[id]\pdf-vietnamese\route.ts',
  'app\api\invoices\[id]\pdf\route.ts',
  'app\api\invoices\[id]\pdf-advanced\route.ts',

  'lib\utils\puppeteer-pdf-service.ts',
  'lib\utils\vietnamese-html-template.ts',
  'lib\utils\vietnamese-html-pdf.ts',
  'lib\utils\professional-vietnamese-pdf.ts',
  'lib\utils\vietnamese-enterprise-pdf.ts',
  'lib\utils\vietnamese-safe-pdf.ts',
  'lib\utils\vietnamese-font-support.ts',
  'lib\utils\vietnamese-pdf-config.ts',
  'lib\utils\simple-vietnamese-pdf.ts',
  'lib\utils\secure-watermark-pdf.ts',
  'lib\utils\modern-qr-pdf.ts',

  'components\invoice\vietnamese-pdf-button.tsx',
  'components\invoice\advanced-pdf-button.tsx',
  'components\invoice\canvas-vietnamese-pdf.tsx',

  'docs\PDF_TIENg_VIET_EXPORT_GUIDE.md',
  'CANVAS_PDF_SOLUTION.md'
)

# Create destination root
New-Item -ItemType Directory -Path $dstRoot -Force | Out-Null

$copied = 0
$missing = New-Object System.Collections.Generic.List[string]

foreach ($rel in $files) {
  $src  = Join-Path $srcRoot $rel
  $dest = Join-Path $dstRoot $rel
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null

  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination $dest -Force
    $copied++
  } else {
    $missing.Add($src)
  }
}

Write-Host "Copied: $copied file(s)" -ForegroundColor Green
if ($missing.Count -gt 0) {
  Write-Warning "Missing files (not copied):"
  $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
}

Write-Host "Bundle created at: $dstRoot" -ForegroundColor Cyan
