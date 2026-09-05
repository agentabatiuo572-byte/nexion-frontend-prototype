import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("SMS acceptance code is visible only in an explicit server sandbox", () => {
  for (const page of ["src/pages/login/login.vue", "src/pages/register/register.vue"]) {
    const source = read(page);
    assert.match(source, /VITE_NEXGRID_SANDBOX_OTP_CODE/);
    assert.match(source, /const sandboxOtpEnabled = computed\(\(\) =>[\s\S]*mode === "sandbox"[\s\S]*modeExplicit[\s\S]*\\d\{6\}/);
    assert.match(source, /v-if="sandboxOtpEnabled"[^>]+data-testid="sandbox-otp-code"/);
    assert.match(source, /fmt\(t\.authOtp\.sandboxCodeHint, \{ code: sandboxOtpCode \}\)/);
  }
  for (const locale of ["zh", "vi", "en"]) {
    const messages = read(`src/i18n/messages/${locale}.ts`);
    assert.match(messages, /sandboxCodeHint:[^\n]*\{code\}/);
    assert.doesNotMatch(messages, /sandboxCodeHint:[^\n]*123456/);
  }
  assert.match(read(".env.acceptance-h5"), /^VITE_NEXGRID_SANDBOX_OTP_CODE=123456$/m);
});

test("the Janus native shell can build a resource bundle without pretending it is a signed installer", (t) => {
  const { root, missing } = resolveSiblingRepo("NX1.0-Janus", "NEXGRID_JANUS_ROOT");
  if (missing) return t.skip("NX1.0-Janus sibling checkout is unavailable");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts["build:app:sandbox"] ?? "", /uni build -p app --mode sandbox/);
  assert.match(pkg.scripts["verify:app-package-readiness"] ?? "", /app-package-readiness\.mjs/);
  const readiness = fs.readFileSync(path.join(root, "scripts/app-package-readiness.mjs"), "utf8");
  assert.match(readiness, /NATIVE_RESOURCE_BUNDLE_READY/);
  assert.match(readiness, /SIGNED_INSTALLER_HOLD/);
  assert.match(readiness, /appid/);
  assert.doesNotMatch(readiness, /\.apk[^\n]*(?:writeFile|copyFile)/i);
});

test("Janus has an explicit local simulator while production remains native and fail closed", (t) => {
  const formalAppJanus = read("src/services/janus-c2.ts");
  assert.doesNotMatch(formalAppJanus, /VITE_JANUS_(?:EXECUTOR_MODE|SANDBOX_(?:AUTHORIZATION|SUBJECTS|TARGETS|TOKEN))/);
  assert.doesNotMatch(formalAppJanus, /createJanusExecutor/);
  assert.doesNotMatch(formalAppJanus, /(?:start|stop|sync)JanusC2|runJanusC2|defaultCoordinator/);
  assert.match(formalAppJanus, /return \{ state: "HOLD", code: "JANUS_NATIVE_EXECUTOR_REQUIRED" \};/);
  const { root, missing } = resolveSiblingRepo("NX1.0-Janus", "NEXGRID_JANUS_ROOT");
  if (missing) return t.skip("NX1.0-Janus sibling checkout is unavailable");
  const runtime = fs.readFileSync(path.join(root, "src/lib/janus/executor-runtime.ts"), "utf8");
  const mode = fs.readFileSync(path.join(root, "src/lib/janus/production-executor.ts"), "utf8");
  const sandbox = fs.readFileSync(path.join(root, "src/lib/janus/sandbox-executor.ts"), "utf8");
  assert.match(runtime, /import \{ createSandboxJanusExecutor \} from "\.\/sandbox-executor"/);
  assert.match(runtime, /mode === "sandbox"[\s\S]*createSandboxJanusExecutor\(/);
  assert.match(runtime, /installNativeJanusExecutorBridge/);
  assert.match(mode, /options\.production[\s\S]*JANUS_SANDBOX_PROFILE_FORBIDDEN/);
  assert.match(sandbox, /"local-sandbox"/);
  assert.match(sandbox, /proofMode: "SANDBOX"/);
  assert.match(sandbox, /authorization/);
});
