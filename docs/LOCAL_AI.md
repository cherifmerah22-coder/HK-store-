# HK STORE Local AI (No API subscription)

HK STORE uses a local Ollama model on the Windows shop computer. No OpenAI API key or paid API subscription is required for the local assistant.

## One-time setup on the Windows shop computer

1. Install Ollama for Windows from https://ollama.com/download.
2. Open PowerShell in the project folder and run:
   `powershell -ExecutionPolicy Bypass -File .\\scripts\\setup-local-ai.ps1`
3. The script downloads `qwen2.5:3b`. The first download needs internet access and several GB of free disk space.
4. Keep Ollama running and start the HK STORE LAN server.

## Defaults

- Ollama URL: `http://127.0.0.1:11434`
- Model: `qwen2.5:3b`
- Override model with `HK_AI_MODEL`.
- Override local Ollama URL with `HK_OLLAMA_URL`.

## Verify

With the LAN server running and the seller key configured, call `GET /api/ai/status` with header `x-hk-key`. It reports whether Ollama is reachable and whether the configured model is installed.

## Notes

- No API key is sent to the Android app.
- The first model download needs internet; after that, inference can run offline on the Windows computer.
- Speed and answer quality depend on the shop computer's RAM, CPU, and GPU. A 3B model is a lightweight starting point, not a guarantee of expert-level repair diagnosis.
- Local AI requests are still protected by the existing seller-key check and request rate limit.
