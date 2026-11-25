'use strict';
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const android = path.join(root, 'android');
const llama = path.join(android, 'llama.cpp');
const moduleDir = path.join(android, 'hk-ai-engine');
const upstreamLib = path.join(llama, 'examples', 'llama.android', 'lib');
const appId = 'dz.hkstore.app';

function requireFile(file) {
  if (!fs.existsSync(file)) throw new Error('Required file missing: ' + file);
}
function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}
if (!fs.existsSync(android)) throw new Error('Run npx cap add android first.');
requireFile(path.join(llama, 'CMakeLists.txt'));
requireFile(path.join(upstreamLib, 'src/main/cpp/CMakeLists.txt'));

copyDir(upstreamLib, moduleDir);
let cmakePath = path.join(moduleDir, 'src/main/cpp/CMakeLists.txt');
let cmake = fs.readFileSync(cmakePath, 'utf8');
const originalRoot = /set\(LLAMA_SRC \$\{CMAKE_CURRENT_LIST_DIR\}\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\)/;
if (!originalRoot.test(cmake)) throw new Error('Upstream llama.cpp Android CMake layout changed.');
cmake = cmake.replace(originalRoot, 'set(LLAMA_SRC ${CMAKE_CURRENT_LIST_DIR}/../../../../llama.cpp)');
fs.writeFileSync(cmakePath, cmake);

const moduleGradle = [
  'plugins {',
  '    id("com.android.library")',
  '    id("org.jetbrains.kotlin.android")',
  '}',
  '',
  'android {',
  '    namespace = "com.arm.aichat"',
  '    compileSdk = 36',
  '    ndkVersion = "29.0.13113456"',
  '    defaultConfig {',
  '        minSdk = 33',
  '        ndk { abiFilters += listOf("arm64-v8a") }',
  '        externalNativeBuild { cmake {',
  '            arguments += "-DCMAKE_BUILD_TYPE=Release"',
  '            arguments += "-DBUILD_SHARED_LIBS=ON"',
  '            arguments += "-DLLAMA_BUILD_APP=OFF"',
  '            arguments += "-DLLAMA_BUILD_COMMON=ON"',
  '            arguments += "-DLLAMA_OPENSSL=OFF"',
  '            arguments += "-DGGML_NATIVE=OFF"',
  '            arguments += "-DGGML_BACKEND_DL=ON"',
  '            arguments += "-DGGML_CPU_ALL_VARIANTS=ON"',
  '            arguments += "-DGGML_LLAMAFILE=OFF"',
  '        } }',
  '    }',
  '    externalNativeBuild { cmake { path("src/main/cpp/CMakeLists.txt"); version = "3.31.6" } }',
  '    compileOptions {',
  '        sourceCompatibility = JavaVersion.VERSION_17',
  '        targetCompatibility = JavaVersion.VERSION_17',
  '    }',
  '    kotlin { jvmToolchain(17) }',
  '    aarMetadata { minCompileSdk = 35 }',
  '    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }',
  '}',
  '',
  'dependencies {',
  '    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")',
  '}',
  ''
].join('\n');
fs.writeFileSync(path.join(moduleDir, 'build.gradle.kts'), moduleGradle);

const settingsFile = path.join(android, 'settings.gradle');
requireFile(settingsFile);
let settings = fs.readFileSync(settingsFile, 'utf8');
if (!settings.includes("include ':hk-ai-engine'")) {
  settings += "\ninclude ':hk-ai-engine'\nproject(':hk-ai-engine').projectDir = new File('./hk-ai-engine')\n";
  fs.writeFileSync(settingsFile, settings);
}

const rootGradleFile = path.join(android, 'build.gradle');
requireFile(rootGradleFile);
let rootGradle = fs.readFileSync(rootGradleFile, 'utf8');
if (!rootGradle.includes('kotlin-gradle-plugin')) {
  if (!/dependencies\s*\{/.test(rootGradle)) throw new Error('Cannot find root Gradle dependencies block.');
  rootGradle = rootGradle.replace(/dependencies\s*\{/, "dependencies {\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0'");
  fs.writeFileSync(rootGradleFile, rootGradle);
}

const appGradleFile = path.join(android, 'app', 'build.gradle');
requireFile(appGradleFile);
let appGradle = fs.readFileSync(appGradleFile, 'utf8');
if (!appGradle.includes("project(':hk-ai-engine')")) {
  if (!/dependencies\s*\{/.test(appGradle)) throw new Error('Cannot find app dependencies block.');
  appGradle = appGradle.replace(/dependencies\s*\{/, "dependencies {\n    implementation project(':hk-ai-engine')");
}
if (!/noCompress\s+['"]gguf['"]/.test(appGradle)) {
  if (!/android\s*\{/.test(appGradle)) throw new Error('Cannot find android block.');
  appGradle = appGradle.replace(/android\s*\{/, "android {\n    androidResources { noCompress 'gguf' }");
}
appGradle = appGradle.replace(/minSdkVersion\s+[^\s]+/g, 'minSdkVersion 33');
appGradle = appGradle.replace(/minSdk\s*=\s*\d+/g, 'minSdk = 33');
if (!appGradle.includes("apply plugin: 'org.jetbrains.kotlin.android'")) {
  appGradle += "\napply plugin: 'org.jetbrains.kotlin.android'\n";
}
if (!appGradle.includes('kotlin { jvmToolchain(21) }')) {
  appGradle += "\nkotlin { jvmToolchain(21) }\n";
}
fs.writeFileSync(appGradleFile, appGradle);

const javaDir = path.join(android, 'app', 'src', 'main', 'java', ...appId.split('.'));
fs.mkdirSync(javaDir, { recursive: true });
const activity = [
  'package ' + appId + ';',
  '',
  'import android.os.Bundle;',
  'import com.getcapacitor.BridgeActivity;',
  '',
  'public class MainActivity extends BridgeActivity {',
  '    @Override',
  '    public void onCreate(Bundle savedInstanceState) {',
  '        registerPlugin(HKLocalAIPlugin.class);',
  '        super.onCreate(savedInstanceState);',
  '    }',
  '}',
  ''
].join('\n');
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), activity);
const pluginSource = path.join(root, 'native', 'android', 'HKLocalAIPlugin.kt');
requireFile(pluginSource);
fs.copyFileSync(pluginSource, path.join(javaDir, 'HKLocalAIPlugin.kt'));

const manifest = path.join(android, 'app', 'src', 'main', 'AndroidManifest.xml');
requireFile(manifest);
let xml = fs.readFileSync(manifest, 'utf8');
if (!/android:largeHeap=/.test(xml)) xml = xml.replace('<application', '<application android:largeHeap="true"');
fs.writeFileSync(manifest, xml);

console.log('Prepared arm64-v8a llama.cpp Android module and HKLocalAI Capacitor plugin.');
