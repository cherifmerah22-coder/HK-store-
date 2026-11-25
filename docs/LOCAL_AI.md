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

After logging in on the Windows shop computer, HK STORE can connect to the loopback LAN service and the Software Lab provides **فحص جاهزية الذكاء الاصطناعي**. This calls `GET /api/ai/status` and reports Ollama reachability and installed models. Diagnosis, accessory compatibility notes, and short Algerian Darija welcome phrases use the local model. The stock database remains the source of truth for actual product availability and exact compatibility.

The default LAN service binds to loopback over HTTP when no TLS certificate is configured. In this mode AI works only from the Windows computer itself; Android/customer tablets cannot reach the Windows host. For cross-device access configure a trusted certificate with `HKSTORE_TLS_CERT` and `HKSTORE_TLS_KEY`, then use the HTTPS address.

## Notes

- No API key is sent to the Android app.
- The first model download needs internet; after that, inference can run offline on the Windows computer.
- Speed and answer quality depend on the shop computer's RAM, CPU, and GPU. A 3B model is a lightweight starting point, not a guarantee of expert-level repair diagnosis.
- Local AI requests are protected by the seller-key check and a 12-request-per-minute rate limit. The server does not forward prompts to a cloud AI provider.
