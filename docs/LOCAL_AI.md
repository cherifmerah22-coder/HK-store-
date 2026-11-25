# HK STORE Local AI

## Windows desktop

The Windows build packages the llama.cpp runtime and the Qwen2.5 1.5B GGUF model under the application's resources. On launch, Electron starts the local inference server on 127.0.0.1:11435 and checks its health. No Ollama installation, API key, or paid cloud AI service is required. Once packaged, model inference is local and can work offline.

The model is several hundred megabytes to over a gigabyte depending on quantization. The portable installer is therefore much larger than the web application. Performance depends on the computer's RAM and CPU.

## Android

The current Android workflow builds a Capacitor APK containing the web application only. It does **not** yet include a native llama.cpp Android runtime or the GGUF model. Therefore offline on-device AI is not available in this APK. The Android APK must not be described as having embedded AI until a native Android runtime, model packaging, and on-device inference tests have been completed.

## Supported AI tasks

- Repair triage: organize symptoms and suggest safe diagnostic tests; it must not claim a component is faulty without measurement.
- Accessory compatibility: request the exact phone model where needed and use stock data as the source of truth.
- Short Algerian Darija welcome phrase: this is text generation only. Automatic camera-triggered greetings require a separately verified camera event integration.

The assistant must not provide FRP/Activation Lock bypass, unauthorized lock removal, or IMEI alteration. Require the customer's authorization and a backup before destructive reset or flashing.

## Network and security

The AI inference endpoint binds to 127.0.0.1 on the Windows host. It is not exposed as an unauthenticated network service. Cross-device AI access requires a separately secured authenticated transport and must not be enabled by simply opening the model port.

The LAN API uses its own authentication controls. HTTP is not equivalent to HTTPS; configure a trusted TLS certificate and key before transmitting credentials or sensitive information across a network.

## Verification

The Windows CI workflow builds llama.cpp, downloads the model, starts the local server, checks /health, sends a chat completion request, then runs the application tests. A CI pass verifies the runner environment only; it does not prove performance on every shop computer or compatibility with a particular camera.
