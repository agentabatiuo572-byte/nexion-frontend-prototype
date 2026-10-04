import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const runtimeConfig = read("src/api/runtime-config.ts");
const runtime = read("src/api/runtime.ts");

assert.match(runtimeConfig, /export type ApiEnvironment = "dev" \| "prod"/,
  "the formal UniApp must expose only development and production API environments");
assert.doesNotMatch(runtimeConfig, /ApiMode|VITE_NEXGRID_API_MODE|"sandbox"|"remote"/,
  "the formal UniApp must not retain the old browser-selected sandbox/remote mode");
assert.match(runtime, /expectedApiEnvironment:\s*ApiEnvironment\s*=\s*apiRuntimeConfig\.environment/,
  "API response validation must use the standard dev/prod environment directly");
assert.doesNotMatch(runtime, /expectedApiResponseMode|:\s*ApiMode|["'](?:sandbox|remote)["']/,
  "runtime composition must not translate dev/prod back into a sandbox/remote mode");
assert.doesNotMatch(runtime, /fundsSandboxEnabled|paymentSandboxEnabled/,
  "development-only capabilities must not be exposed as a frontend sandbox mode");

console.log("formal UniApp frontend environment contract: PASS");
