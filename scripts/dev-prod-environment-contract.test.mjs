import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(file(relative), "utf8");

assert.equal(fs.existsSync(file(".env.acceptance-h5")), false,
  "the formal UniApp must not ship a separate acceptance/sandbox environment");
assert.equal(fs.existsSync(file(".env.development")), true,
  "development must use Vite's standard development environment");
assert.equal(fs.existsSync(file(".env.production")), true,
  "production must use Vite's standard production environment");

const example = read(".env.example");
const development = read(".env.development");
const production = read(".env.production");
const runtime = read("src/api/runtime-config.ts");
const runtimeComposition = read("src/api/runtime.ts");
const devLauncher = read("scripts/start-dev-h5.ps1");
const authApi = read("src/api/auth-api.ts");
const login = read("src/pages/login/login.vue");
const register = read("src/pages/register/register.vue");
const devServerPool = read("scripts/lib/dev-server-pool.mjs");
const legacySuite = read("scripts/run-legacy-suite.mjs");
const verifyChain = read("scripts/verify-chain.mjs");
const verifyScript = read("scripts/verify.sh");

for (const [name, source] of Object.entries({ example, development, production, runtime, devLauncher })) {
  assert.doesNotMatch(source, /VITE_NEXGRID_API_MODE/,
    `${name} must not let the UniApp select sandbox/remote business authority`);
}
assert.match(runtime, /export type ApiEnvironment = "dev" \| "prod"/,
  "the formal UniApp runtime must expose only dev/prod environments");
assert.match(runtime, /const environment:\s*ApiEnvironment = import\.meta\.env\.PROD \? "prod" : "dev"/,
  "Vite build environment must determine dev/prod without a custom sandbox flag");
assert.doesNotMatch(runtime, /rawMode|modeExplicit|import\.meta\.env\.DEV \? "sandbox"/,
  "legacy custom mode inference must be removed");
assert.doesNotMatch(runtime, /\bmode:\s*ApiMode|\bmode,|const mode:/,
  "public runtime configuration must expose only dev/prod, not sandbox/remote mode");
assert.match(runtimeComposition, /expectedApiEnvironment:\s*ApiEnvironment\s*=\s*apiRuntimeConfig\.environment/,
  "API response validation must consume dev/prod directly without reconstructing a sandbox mode");
assert.doesNotMatch(runtimeComposition, /expectedApiResponseMode|["'](?:sandbox|remote)["']/,
  "runtime composition must not reconstruct the deleted sandbox/remote mode");
assert.match(development, /^VITE_NEXGRID_API_PREVIEW_TARGET=http:\/\/127\.0\.0\.1:8110$/m,
  "development H5 must proxy to the local Java service");
assert.doesNotMatch(production, /127\.0\.0\.1|localhost|PREVIEW_TARGET/,
  "production config must not embed a loopback backend");
assert.match(devLauncher, /"--mode",\s*"development"/,
  "the development launcher must select the standard Vite development mode");
assert.equal(fs.existsSync(file("scripts/start-acceptance-h5.ps1")), false,
  "the obsolete acceptance/sandbox launcher must be removed");
for (const [name, source] of Object.entries({ authApi, login, register })) {
  assert.doesNotMatch(source, /SANDBOX_MOCK|OAuthExchangeMode|mode:\s*apiRuntimeConfig\.environment/,
    `${name} must leave OAuth execution environment selection to the Java profile`);
}
for (const [name, source] of Object.entries({ devServerPool, legacySuite, verifyChain })) {
  assert.doesNotMatch(source, /mode:\s*["'](?:mock|sandbox|remote)["']|REUSE_(?:MOCK|SANDBOX|REMOTE)_URL/,
    `${name} must start and identify standard development/production environments directly`);
}
assert.equal(fs.existsSync(file("scripts/remote-authority-simulation.test.mjs")), false,
  "the obsolete browser-mode behavior test must not remain as executable guidance");
assert.doesNotMatch(verifyScript, /skipped "(?:AUTH02 legacy local|SPEC-4 local account-cloud|SPEC-4 local session registry).*retired in formal remote mode/,
  "retired local-authority probes are an asserted remote handoff, not a missing-check skip");
for (const handoff of [
  "AUTH02 formal remote auth authority handoff",
  "SPEC-4 formal remote account-cloud authority handoff",
  "SPEC-4 formal remote session authority handoff",
]) {
  assert.match(verifyScript, new RegExp(`ok "${handoff}`),
    `${handoff} must remain an explicit passing contract when local authority is retired`);
}

console.log("UniApp dev/prod environment contract: PASS");
