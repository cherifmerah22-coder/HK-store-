$ErrorActionPreference = "Stop"
Write-Host "HK STORE - إعداد الذكاء الاصطناعي المحلي" -ForegroundColor Cyan
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host "لم يتم العثور على Ollama." -ForegroundColor Yellow
  Write-Host "ثبّت Ollama for Windows من https://ollama.com/download ثم أعد تشغيل هذا الملف."
  exit 1
}
Write-Host "تنزيل النموذج qwen2.5:3b (قد يستغرق وقتاً حسب سرعة الإنترنت)..." -ForegroundColor Cyan
ollama pull qwen2.5:3b
if ($LASTEXITCODE -ne 0) { throw "فشل تنزيل النموذج." }
Write-Host "النماذج المثبتة:" -ForegroundColor Green
ollama list
Write-Host ""
Write-Host "تم تجهيز النموذج. اترك Ollama يعمل ثم شغّل خادم HK STORE." -ForegroundColor Green
Write-Host "الإعداد الافتراضي: http://127.0.0.1:11434 والنموذج qwen2.5:3b"
