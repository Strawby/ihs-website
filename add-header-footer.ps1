<#
.SYNOPSIS
Adds header, footer, and script placeholders to every index.html file in the project.

.DESCRIPTION
Searches recursively from the provided root (defaulting to the script's location) for
index.html files. It inserts a header placeholder after the opening <body> tag, ensures
a footer placeholder appears near the end of the document, and adds a script tag that
points to script.js with an automatically calculated relative path.
#>

param(
  [string]$RootPath = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

Set-Location $RootPath

$indexFiles = Get-ChildItem -Path $RootPath -Filter 'index.html' -Recurse -File

foreach ($file in $indexFiles) {
  $content = Get-Content -Path $file.FullName -Raw

  # Compute relative path to script.js from this index.html
  $relativePath = Resolve-Path -Path $file.FullName -Relative
  $relativeDir  = Split-Path -Path $relativePath -Parent
  $depth = if ([string]::IsNullOrWhiteSpace($relativeDir)) {
    0
  } else {
    $relativeDir.Split([IO.Path]::DirectorySeparatorChar).Count
  }
  $scriptPath = ('../' * $depth) + 'script.js'

  $updated   = $false
  $hasHeader = $content -match '<div\s+data-header'
  $hasFooter = $content -match '<div\s+data-footer'
  $hasScript = $content -match '<script\s+src="[^"]*script\.js"'

  # Insert header after <body> if missing
  if (-not $hasHeader) {
    $content = $content -replace '(<body[^>]*>)', "`$1`n  <div data-header></div>`n"
    $updated = $true
  }

  # Ensure footer exists
  if (-not $hasFooter) {
    if ($hasScript) {
      # Replace existing script tag with footer + new script tag
      $content = $content -replace '<script\s+src="[^"]*script\.js"[^>]*></script>',
        "  <div data-footer></div>`n  <script src=""$scriptPath""></script>"
    } else {
      # Insert footer before </body>
      $content = $content -replace '(</body\s*>)',
        "  <div data-footer></div>`n`$1"
    }
    $updated   = $true
    $hasFooter = $true
  }

  # Ensure script tag exists and has the correct path
  if (-not $hasScript) {
    if ($hasFooter) {
      # Add script right after footer
      $content = $content -replace '(<div\s+data-footer></div>)',
        "`$1`n  <script src=""$scriptPath""></script>"
    } else {
      # Fallback: script before </body>
      $content = $content -replace '(</body\s*>)',
        "  <script src=""$scriptPath""></script>`n`$1"
    }
    $updated = $true
  } else {
    # Normalize any existing script.js tag to the correct relative path
    $content = $content -replace '<script\s+src="[^"]*script\.js"[^>]*></script>',
      "  <script src=""$scriptPath""></script>"
    $updated = $true
  }

  if ($updated) {
    Set-Content -Path $file.FullName -Value $content -Encoding UTF8
    Write-Host "Updated $relativePath"
  } else {
    Write-Host "No changes needed for $relativePath"
  }
}
