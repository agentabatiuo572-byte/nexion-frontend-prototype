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

test("the optional Terms reader uses the registration-only exit policy", () => {
  assert.match(source, /onBackPress\(\(\) => \{/);
  assert.match(source, /shouldBlockLegalTermsExit\(remoteApiEnabled, !!currentSessionFence\(\), serverTerms\.value\)/);
  assert.match(source, /if \(blockRequiredExit\(\)\) return;/);
  assert.match(source, /if \(blockRequiredExit\(\)\) return true;/);
});

test("ordinary navigation does not check or enforce Terms", () => {
  assert.doesNotMatch(app, /scheduleLegalTermsGate|enforcePendingLegalTermsGate|hasPendingLegalTermsRequirement/);
  assert.doesNotMatch(runtime, /legalTermsApi|uni\.showLoading|navReset/);
});

test("a failed document read still exposes an in-place retry", () => {
  assert.match(source, /v-if="loadError"[\s\S]{0,500}@click="retryTerms"/);
  assert.match(source, /function retryTerms[\s\S]{0,180}void loadTerms\(\)/);
  assert.match(source, /loadingTerms \? "…" : t\.ui\.retry/);
});
