import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(file(relative), "utf8");

const runtimeConfig = read("src/api/runtime-config.ts");
const runtime = read("src/api/runtime.ts");
const example = read(".env.example");
const viteConfig = read("vite.config.ts");
const vitestConfig = read("vitest.config.ts");
const authProviderGrid = read("src/components/auth-provider-grid.vue");
const app = read("src/App.vue");

assert.match(runtimeConfig, /export type ApiEnvironment = "mock"/,
  "the high-fidelity App must expose mock as its only runtime environment");
assert.match(runtimeConfig, /environment:\s*"mock"/,
  "the high-fidelity App runtime must be fixed to mock");
assert.doesNotMatch(runtimeConfig, /VITE_NEXGRID_API_MODE|"sandbox"|"remote"|modeExplicit/,
  "the high-fidelity App must not accept sandbox/remote overrides");
assert.doesNotMatch(runtime, /fundsSandboxEnabled|paymentSandboxEnabled|apiRuntimeConfig\.mode/,
  "the high-fidelity runtime must not expose sandbox capability switches");
assert.doesNotMatch(example, /VITE_NEXGRID_API_MODE|sandbox|remote/i,
  "the example environment must not document obsolete sandbox/remote startup modes");
assert.match(viteConfig, /port:\s*5174/,
  "the high-fidelity preview must own its fixed 5174 port");
assert.doesNotMatch(viteConfig, /loadEnv|VITE_NEXGRID_API_PREVIEW_TARGET|proxy:\s*\{/,
  "the fixed mock preview must not expose a Java backend proxy");
assert.doesNotMatch(vitestConfig, /VITE_NEXGRID_API_MODE|VITE_NEXGRID_API_DEV_BASE_URL/,
  "tests must not reintroduce a selectable frontend API mode");
assert.doesNotMatch(authProviderGrid, /sandbox/i,
  "the login provider grid must not expose the deleted sandbox mode");
assert.match(app,
  /const previewAccount = provisionMockPreviewAccount\(\);[\s\S]*?const auth = useAuth\(\);[\s\S]*?if \(!previewAccount\.ok\) \{[\s\S]*?auth\.signOut\(\);[\s\S]*?uni\.reLaunch\(\{ url: "\/pages\/login\/login"[\s\S]*?return;/,
  "a preview-account storage failure must sign out the demo default and stop startup on Login");
assert.equal(fs.existsSync(file(".env.acceptance-h5")), false,
  "the obsolete sandbox environment file must be removed");
assert.equal(fs.existsSync(file("scripts/start-acceptance-h5.ps1")), false,
  "the obsolete sandbox launcher must be removed");

console.log("high-fidelity fixed mock mode contract: PASS");
