$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'icons'
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
foreach ($size in @(180, 192, 512)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#214d40'))
    $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#fffdf9'), ($size * 0.055))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    # Existing brand mark: upward sales arrow, within the maskable safe area.
    $graphics.DrawLine($pen, [single]($size * 0.31), [single]($size * 0.69), [single]($size * 0.67), [single]($size * 0.33))
    $graphics.DrawLine($pen, [single]($size * 0.43), [single]($size * 0.33), [single]($size * 0.67), [single]($size * 0.33))
    $graphics.DrawLine($pen, [single]($size * 0.67), [single]($size * 0.33), [single]($size * 0.67), [single]($size * 0.57))
    $filename = if ($size -eq 180) { 'apple-touch-icon.png' } else { "icon-$size.png" }
    $bitmap.Save((Join-Path $iconDirectory $filename), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
