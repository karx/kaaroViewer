param([Parameter(Mandatory=$true)][string]$Text,[Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$full = [System.IO.Path]::GetFullPath($Out)
$dir = [System.IO.Path]::GetDirectoryName($full)
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $s.Rate = -1
  $s.Volume = 100
  $s.SetOutputToWaveFile($full)
  $s.Speak($Text)
} finally { $s.Dispose() }
if (-not (Test-Path -LiteralPath $full)) { throw "SAPI produced no file at $full" }
