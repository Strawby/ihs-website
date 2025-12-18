<#
.SYNOPSIS
  Build a slow-motion, interpolated hero video from numbered MP4 clips.

.DESCRIPTION
  - Finds all *.mp4 files in the current folder (except the final output).
  - Sorts them by numeric part of the filename in DESCENDING order.
  - Builds a concat list.txt for ffmpeg.
  - Computes total input duration via ffprobe.
  - Runs ffmpeg with:
      * configurable slowdown (default 10x slower = 10% speed)
      * gentle spatial blur to smooth noise/compression
      * motion interpolation (internal 240fps, output 120fps)
      * long, softly weighted temporal blending across cuts
        so transitions feel slow and quiet for background use
  - Shows a live PowerShell progress bar based on ffmpeg -progress output.
#>

# -------------------- CONFIG --------------------

# Final output name
$outputName        = "hero_output.mp4"

# Concat list path
$listPath          = "list.txt"

# Slowdown factor (10 = 10% of original speed)
$slowFactor        = 10

# How many frames to blend for transitions (higher = slower, smoother transitions)
# At 120 fps, 15 frames ≈ 0.125 seconds of blended ghosting at cuts.
$transitionFrames  = 15

# -------------------- HELPER FUNCTIONS --------------------

function Test-ToolAvailable {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Required tool '$Name' is not available on PATH." -ForegroundColor Red
        exit 1
    }
}

function Get-InputFiles {
    param(
        [Parameter(Mandatory)]
        [string]$OutputName,
        [string]$Pattern = "*.mp4"
    )

    # Get all mp4s except the final output, sort by numeric part of basename (DESC)
    $files = Get-ChildItem $Pattern -File |
        Where-Object { $_.Name -ne $OutputName } |
        Sort-Object {
            $digits = ($_.BaseName -replace '\D','')
            if ([string]::IsNullOrWhiteSpace($digits)) { 0 } else { [int]$digits }
        } -Descending

    if (-not $files -or $files.Count -eq 0) {
        Write-Host "No input .mp4 files found (other than output)." -ForegroundColor Red
        exit 1
    }

    return $files
}

function New-ConcatList {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo[]]$Files,
        [Parameter(Mandatory)]
        [string]$ListPath
    )

    Write-Host "Building concat list ($ListPath) from MP4 files..." -ForegroundColor Cyan
    Remove-Item $ListPath -ErrorAction SilentlyContinue

    $total  = $Files.Count
    $index  = 0

    foreach ($f in $Files) {
        $index++

        # Write concat entry (absolute path, quoted)
        "file '$($f.FullName)'" | Add-Content $ListPath

        # Progress
        $percent = [int](($index / $total) * 100)
        Write-Progress -Activity "Building concat list" `
                       -Status "Adding ${index} of ${total}: $($f.Name)" `
                       -PercentComplete $percent
    }

    Write-Progress -Activity "Building concat list" -Completed
    Write-Host "Concat list built with $total files." -ForegroundColor Green
}

function Get-TotalDurationSeconds {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo[]]$Files
    )

    Write-Host "Measuring total input duration with ffprobe..." -ForegroundColor Cyan

    $totalSeconds = 0.0

    foreach ($f in $Files) {
        $json = & ffprobe -v quiet -print_format json -show_entries format=duration "$($f.FullName)"
        if (-not $json) {
            Write-Host "Warning: ffprobe returned no data for $($f.Name). Skipping." -ForegroundColor Yellow
            continue
        }

        try {
            $info = $json | ConvertFrom-Json
            $duration = [double]$info.format.duration
            $totalSeconds += $duration
        }
        catch {
            Write-Host "Warning: Failed to parse duration for $($f.Name). Skipping." -ForegroundColor Yellow
        }
    }

    if ($totalSeconds -le 0) {
        Write-Host "Total duration is zero or invalid; cannot estimate progress." -ForegroundColor Red
        exit 1
    }

    $totalSeconds
}

function Invoke-FFmpegWithProgress {
    param(
        [Parameter(Mandatory)]
        [string]$ListPath,
        [Parameter(Mandatory)]
        [string]$OutputName,
        [Parameter(Mandatory)]
        [double]$TotalInputSeconds,
        [Parameter(Mandatory)]
        [int]$SlowFactor,
        [Parameter(Mandatory)]
        [int]$TransitionFrames
    )

    $totalOutputSeconds = $TotalInputSeconds * $SlowFactor
    Write-Host "Total input duration: $([int]$TotalInputSeconds)s" -ForegroundColor Cyan
    Write-Host "Expected output duration (x$SlowFactor): $([int]$totalOutputSeconds)s" -ForegroundColor Cyan
    Write-Host "Starting ffmpeg render (this may take a while)..." -ForegroundColor Cyan

    # Filter graph:
    # - gblur for gentle spatial smoothing
    # - setpts for slowdown
    # - minterpolate for smooth motion up to 240 fps
    # - tmix for a long, softly weighted temporal blend (triangular weights),
    #   normalized with scale=1/78 so colors/brightness stay correct
    # - fps=120 for final output
    # - format=yuv420p at the end for compatibility and to avoid color issues
    #
    # Weights (15 frames): 1 2 3 4 5 6 7 8 9 8 7 6 5 4 3
    # Sum = 78 → scale=1/78
    $filter = "[0:v:0]" +
              "gblur=sigma=1.2," +
              "setpts=${SlowFactor}*PTS," +
              "minterpolate=fps=240:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=none," +
              "tmix=frames=${TransitionFrames}:weights='1 2 3 4 5 6 7 8 9 8 7 6 5 4 3':scale=1/78," +
              "fps=120," +
              "format=yuv420p[vout]"

    # Run ffmpeg; parse -progress output for out_time_ms (drives PowerShell progress bar)
    & ffmpeg `
        -hide_banner `
        -loglevel error `
        -progress pipe:1 `
        -fflags +genpts `
        -f concat -safe 0 `
        -analyzeduration 100M -probesize 100M `
        -i $ListPath `
        -filter_complex $filter `
        -map "[vout]" -an `
        -c:v libx264 -crf 20 -preset slow `
        $OutputName |
        ForEach-Object {
            $line = $_.Trim()
            if ($line -match '^out_time_ms=(\d+)$') {
                $ms      = [double]$Matches[1]
                $elapsed = $ms / 1000000.0  # seconds so far
                $pct     = [int](($elapsed / $totalOutputSeconds) * 100)
                if ($pct -gt 100) { $pct = 100 }

                Write-Progress -Activity "Rendering hero video" `
                               -Status "Processed $([int]$elapsed)s of $([int]$totalOutputSeconds)s" `
                               -PercentComplete $pct
            }
        }

    Write-Progress -Activity "Rendering hero video" -Completed

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ffmpeg failed with exit code $LASTEXITCODE." -ForegroundColor Red
        return
    }

    Write-Host "Render complete: $OutputName" -ForegroundColor Green
}

# -------------------- MAIN SCRIPT --------------------

# 1) Ensure ffmpeg + ffprobe exist
Test-ToolAvailable -Name "ffmpeg"
Test-ToolAvailable -Name "ffprobe"

# 2) Get input files
$files = Get-InputFiles -OutputName $outputName

# 3) Build concat list
New-ConcatList -Files $files -ListPath $listPath

# 4) Compute total duration (seconds)
$totalSeconds = Get-TotalDurationSeconds -Files $files

# 5) Run ffmpeg with live progress bar
Invoke-FFmpegWithProgress -ListPath $listPath -OutputName $outputName `
    -TotalInputSeconds $totalSeconds -SlowFactor $slowFactor `
    -TransitionFrames $transitionFrames
