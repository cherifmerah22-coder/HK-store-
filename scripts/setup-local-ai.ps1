$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Write-Host "HK STORE - تثبيت الذكاء الاصطناعي المحلي" -ForegroundColor Cyan

function Find-Ollama {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
  )
  foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$ollama = Find-Ollama
if (-not $ollama) {
  Write-Host "تنزيل مثبت Ollama الرسمي..." -ForegroundColor Cyan
  $installer = Join-Path $env:TEMP "HKSTORE-OllamaSetup.exe"
  Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $installer
  $signature = Get-AuthenticodeSignature -FilePath $installer
  if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "(^|, )O=Ollama Inc\.(,|$)") {
    Remove-Item $installer -Force -ErrorAction SilentlyContinue
    throw "تعذر التحقق من التوقيع الرقمي لمثبت Ollama. أوقفنا التثبيت للحماية."
  }
  Write-Host "تثبيت Ollama..." -ForegroundColor Cyan
  $process = Start-Process -FilePath $installer -ArgumentList "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES" -Wait -PassThru
  Remove-Item $installer -Force -ErrorAction SilentlyContinue
  if ($process.ExitCode -ne 0) { throw "فشل مثبت Ollama برمز $($process.ExitCode)" }
  $ollama = Find-Ollama
  if (-not $ollama) { throw "اكتمل المثبت لكن لم يتم العثور على ollama.exe. أعد تشغيل Windows ثم أعد المحاولة." }
}

Write-Host "انتظار خدمة Ollama..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2; $ready = $true; break }
  catch {
    if ($i -eq 0) { Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden }
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) { throw "خدمة Ollama لم تبدأ على المنفذ 11434." }

Write-Host "تنزيل النموذج qwen2.5:3b. قد يكون حجمه عدة غيغابايت..." -ForegroundColor Cyan
& $ollama pull qwen2.5:3b
if ($LASTEXITCODE -ne 0) { throw "فشل تنزيل نموذج الذكاء الاصطناعي." }
Write-Host "التحقق من النموذج..." -ForegroundColor Cyan
& $ollama list
if ($LASTEXITCODE -ne 0) { throw "تعذر التحقق من تثبيت النموذج." }
Write-Host "تم إعداد الذكاء الاصطناعي المحلي بنجاح. أعد تشغيل HK STORE." -ForegroundColor Green