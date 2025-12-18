# Converts all supported images in the current directory to WebP
# Requires ImageMagick installed

# Extensions you want to convert
$extensions = @("*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.tiff", "*.jfif")

foreach ($ext in $extensions) {
    Get-ChildItem -Filter $ext | ForEach-Object {
        $input = $_.FullName
        $output = [System.IO.Path]::ChangeExtension($input, ".webp")

        Write-Host "Converting $($_.Name) → $(Split-Path $output -Leaf)"

        magick convert "$input" -quality 85 "$output"
    }
}

Write-Host "Done! All images converted to WebP."
