<#
.SYNOPSIS
  FAST + QUIET build: background hero video (smooth, calm motion) from numbered MP4 clips.

.DESCRIPTION
  - Finds all *.mp4 in current folder (except output).
  - Sorts by numeric part of filename DESC.
  - Writes concat list.txt.
  - Measures total duration with ffprobe for progress estimation.
  - Runs ffmpeg with:
      * slowdown via setpts (true slow motion)
      * optional scale down (big speed win)
      * light blur (compression + calm detail)
      * tmix temporal blend (quiet motion, soft cuts)
      * outputs a "website calm" FPS (default 60)
      * fast x264 settings (speed first)
  - Shows a live PowerShell progress bar from ffmpeg -progress out_time_ms.
#>

# -------------------- CONFIG --------------------

# Output
$outputName        = "hero_output_quiet_bg.mp4"
$listPath          = "list.txt"

# True slow motion (3 = 3x longer / 1/3 speed)
$slowFactor        = 5

# "Quiet background" FPS (lower = calmer; 60 is a great default for websites)
$outFps            = 60

# Temporal blend frames (higher = calmer / more ghosting, but still cheap vs interpolation)
# At 60fps: 12 frames ≈ 0.20s blend; 16 frames ≈ 0.27s blend
$transitionFrames  = 12

# Optional: reduce resolution for BIG speed boost (set $null to disable)
# Examples: "1920:-2" (fit width 1920), "1280:-2" (faster), "960:-2" (very fast)
$scale             = "1280:-2"

# Optional: blur strength (0 disables). Slight blur makes motion/texture calmer and compresses better.
$blurSigma         = 0.9

# Encoding speed/quality knobs (speed first, but decent for web)
$crf               = 28            # higher = smaller/faster, lower quality
$preset            = "veryfast"    # faster: ultrafast / veryfast; slower: faster/medium
$tune              = $null         # optional: "fastdecode"

# -------------------- HELPER FUNCTIONS --------------------

function Test-ToolAvailable {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Required tool '$Name' is not available on PATH." -ForegroundColor Red
        exit 1
    }
}

function Get-InputFiles {
    param([Parameter(Mandatory)][string]$OutputName,[string]$Pattern="*.mp4")

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
    param([Parameter(Mandatory)][System.IO.FileInfo[]]$Files,[Parameter(Mandatory)][string]$ListPath)

    Write-Host "Building concat list ($ListPath)..." -ForegroundColor Cyan
    Remove-Item $ListPath -ErrorAction SilentlyContinue

    $total = $Files.Count
    $i = 0

    foreach ($f in $Files) {
        $i++
        "file '$($f.FullName)'" | Add-Content $ListPath

        $pct = [int](($i / $total) * 100)
        Write-Progress -Activity "Building concat list" `
            -Status "Adding ${i} of ${total}: $($f.Name)" `
            -PercentComplete $pct
    }

    Write-Progress -Activity "Building concat list" -Completed
    Write-Host "Concat list built with $total files." -ForegroundColor Green
}

function Get-TotalDurationSeconds {
    param([Parameter(Mandatory)][System.IO.FileInfo[]]$Files)

    Write-Host "Measuring total input duration (ffprobe)..." -ForegroundColor Cyan
    $totalSeconds = 0.0

    foreach ($f in $Files) {
        $json = & ffprobe -v quiet -print_format json -show_entries format=duration "$($f.FullName)"
        if (-not $json) { continue }

        try {
            $info = $json | ConvertFrom-Json
            $duration = [double]$info.format.duration
            $totalSeconds += $duration
        } catch { }
    }

    if ($totalSeconds -le 0) {
        Write-Host "Total duration is zero/invalid; cannot estimate progress." -ForegroundColor Red
        exit 1
    }

    $totalSeconds
}

function Invoke-FFmpegWithProgress {
    param(
        [Parameter(Mandatory)][string]$ListPath,
        [Parameter(Mandatory)][string]$OutputName,
        [Parameter(Mandatory)][double]$TotalInputSeconds,
        [Parameter(Mandatory)][int]$SlowFactor,
        [Parameter(Mandatory)][int]$TransitionFrames,
        [Parameter(Mandatory)][int]$OutFps,
        [string]$Scale,
        [double]$BlurSigma,
        [int]$Crf,
        [string]$Preset,
        [string]$Tune
    )

    $totalOutputSeconds = $TotalInputSeconds * $SlowFactor
    Write-Host "Total input duration: $([int]$TotalInputSeconds)s" -ForegroundColor Cyan
    Write-Host "Expected output duration (x$SlowFactor): $([int]$totalOutputSeconds)s" -ForegroundColor Cyan
    Write-Host "Output FPS: $OutFps" -ForegroundColor Cyan
    Write-Host "Starting QUIET background render..." -ForegroundColor Cyan

    # Filter chain:
    # 1) optional scale down
    # 2) optional light blur
    # 3) slow down via setpts (true slow motion)
    # 4) tmix (temporal smoothing / quiet motion)
    # 5) set output fps (calm for website)
    # 6) yuv420p for compatibility
    $filters = @()

    if ($Scale -and $Scale.Trim() -ne "") {
        $filters += "scale=$Scale"
    }
    if ($BlurSigma -gt 0) {
        $filters += "gblur=sigma=$BlurSigma"
    }

    $filters += "setpts=${SlowFactor}*PTS"

    # tmix weighting presets for nicer rolloff (less harsh ghosting)
    if ($TransitionFrames -eq 16) {
        # 1 2 3 4 5 6 7 8 8 7 6 5 4 3 2 1 sum=72
        $filters += "tmix=frames=16:weights='1 2 3 4 5 6 7 8 8 7 6 5 4 3 2 1':scale=1/72"
    }
    elseif ($TransitionFrames -eq 12) {
        # 1 2 3 4 5 6 6 5 4 3 2 1 sum=42
        $filters += "tmix=frames=12:weights='1 2 3 4 5 6 6 5 4 3 2 1':scale=1/42"
    }
    elseif ($TransitionFrames -eq 8) {
        # 1 2 3 4 4 3 2 1 sum=20
        $filters += "tmix=frames=8:weights='1 2 3 4 4 3 2 1':scale=1/20"
    }
    else {
        # Generic average (fastest + simplest)
        $filters += "tmix=frames=$TransitionFrames"
    }

    $filters += "fps=$OutFps"
    $filters += "format=yuv420p"

    $filter = "[0:v:0]" + ($filters -join ",") + "[vout]"

    # Encode args (website-friendly)
    $encodeArgs = @(
        "-c:v", "libx264",
        "-preset", $Preset,
        "-crf", "$Crf",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart"   # important for web playback (moov atom at front)
    )
    if ($Tune -and $Tune.Trim() -ne "") {
        $encodeArgs += @("-tune", $Tune)
    }

    & ffmpeg `
        -hide_banner `
        -loglevel error `
        -progress pipe:1 `
        -fflags +genpts `
        -f concat -safe 0 `
        -analyzeduration 50M -probesize 50M `
        -i $ListPath `
        -filter_complex $filter `
        -map "[vout]" -an `
        @encodeArgs `
        $OutputName |
        ForEach-Object {
            $line = $_.Trim()
            if ($line -match '^out_time_ms=(\d+)$') {
                $ms      = [double]$Matches[1]
                $elapsed = $ms / 1000000.0
                $pct     = [int](($elapsed / $totalOutputSeconds) * 100)
                if ($pct -gt 100) { $pct = 100 }

                Write-Progress -Activity "Rendering QUIET hero video" `
                    -Status "Processed $([int]$elapsed)s of $([int]$totalOutputSeconds)s" `
                    -PercentComplete $pct
            }
        }

    Write-Progress -Activity "Rendering QUIET hero video" -Completed

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ffmpeg failed with exit code $LASTEXITCODE." -ForegroundColor Red
        return
    }

    Write-Host "Render complete: $OutputName" -ForegroundColor Green
}

# -------------------- MAIN --------------------

Test-ToolAvailable -Name "ffmpeg"
Test-ToolAvailable -Name "ffprobe"

$files = Get-InputFiles -OutputName $outputName
New-ConcatList -Files $files -ListPath $listPath

$totalSeconds = Get-TotalDurationSeconds -Files $files

Invoke-FFmpegWithProgress -ListPath $listPath -OutputName $outputName `
    -TotalInputSeconds $totalSeconds -SlowFactor $slowFactor `
    -TransitionFrames $transitionFrames -OutFps $outFps `
    -Scale $scale -BlurSigma $blurSigma `
    -Crf $crf -Preset $preset -Tune $tune
