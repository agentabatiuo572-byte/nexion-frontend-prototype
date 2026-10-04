import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/pages/onboarding/terms.vue", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/lib/legal-terms-gate-runtime.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");

test("a re-launched legal gate returns deterministically instead of popping an empty H5 stack", () => {
  assert.match(source, /const explicitReturn = ref\(false\)/);
  assert.match(source, /explicitReturn\.value = typeof options\?\.return === "string"/);
  assert.match(source, /if \(explicitReturn\.value\) \{ navTo\(returnTo\.value\); return; \}/);
});

test("an unacknowledged authenticated user cannot leave Terms through either back path", () => {
  assert.match(source, /onBackPress\(\(\) => \{/);
  assert.match(source, /shouldBlockLegalTermsExit\(remoteApiEnabled, !!currentSessionFence\(\), serverTerms\.value\)/);
  assert.match(source, /if \(blockRequiredExit\(\)\) return;/);
  assert.match(source, /if \(blockRequiredExit\(\)\) return true;/);
});

test("the global route watcher re-enforces the pending Terms requirement after a history bypass", () => {
  assert.match(runtime, /let pendingRequirement:/);
  assert.match(runtime, /export function enforcePendingLegalTermsGate/);
  assert.match(runtime, /export function recordLegalTermsAcknowledged/);
  assert.match(runtime, /\.catch\(\(\) => \{[\s\S]*pendingRequirement = \{\s*key, locale: requestLocale, version: "", reason: "verification-failed"\s*[,}]/);
  assert.match(runtime, /if \(!isLegalTermsAcknowledged\(snapshot\)\)[\s\S]*version: snapshot\.version, reason: "acknowledgement"/);
  assert.match(runtime, /pendingRequirement\.reason === "acknowledgement"\) return Promise\.resolve\(\)/);
  assert.match(source, /serverTerms\.value = snapshot;[\s\S]{0,120}if \(snapshot\.acknowledged\) recordLegalTermsAcknowledged\(snapshot\)/);
  assert.match(source, /recordLegalTermsAcknowledged\(acknowledged, snapshotLocale\)/);
  assert.match(app, /if \(enforcePendingLegalTermsGate\(`\/\$\{route\}`\)\)/);
  assert.match(app, /if \(hasPendingLegalTermsRequirement\(\)\) \{[\s\S]{0,100}stopBusinessLoops\(\)/);
  assert.match(app, /isLegalTermsGateExemptRoute\(`\/\$\{route\}`\)/);
  assert.match(app, /if \(termsGateRoute && \(enforcePendingLegalTermsGate\(`\/\$\{termsGateRoute\}`\)/);
  assert.match(app, /startQuestWatch\(\);[\s\S]{0,300}lastLegalTermsGateRoute = termsGateRoute/);
});

test("a failed Terms load keeps the gate closed but exposes an in-place retry", () => {
  assert.match(source, /v-if="loadError"[\s\S]{0,500}@click="retryTerms"/);
  assert.match(source, /function retryTerms[\s\S]{0,180}void loadTerms\(\)/);
  assert.match(source, /loadingTerms \? "…" : t\.ui\.retry/);
});
