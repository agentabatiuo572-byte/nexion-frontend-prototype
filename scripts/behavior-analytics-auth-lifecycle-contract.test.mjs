import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../src/services/behavior-analytics.ts", import.meta.url), "utf8");

test("behavior analytics drops active state without a request on logout, account switch, or hide", () => {
  assert.match(service, /function dispose\(emitClose = false\)/);
  assert.match(service, /dispose\(false\);/);
  assert.match(service, /function pause\(\) \{[\s\S]*?options\.tracker\.discard\(\)/);
  assert.doesNotMatch(service, /function pause\(\) \{[\s\S]*?tracker\.hide\(activeRoute\)/);
});

test("only an authenticated, onboarding-complete subject enables analytics", async () => {
  const app = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  assert.match(app, /auth\.isAuthenticated && auth\.onboardingComplete/);
  assert.match(service, /if \(!context\.enabled \|\| !nextSubject\) \{\s*dispose\(false\)/);
});

test("App telemetry contract never sends server-owned environment or sampling fields", async () => {
  const api = await readFile(new URL("../src/api/behavior-analytics-api.ts", import.meta.url), "utf8");
  assert.match(api, /body: event/);
  assert.match(api, /hasOnlyFields\(event, PAGE_EVENT_FIELDS\)/);
  assert.match(api, /hasOnlyFields\(event, CLICK_EVENT_FIELDS\)/);
  assert.doesNotMatch(api, /samplingKey|sampling_key/);
  assert.match(api, /body: event/);
});

test("a server-issued Sandbox receipt becomes a visible, copyable opaque PC credential", async () => {
  const api = await readFile(new URL("../src/api/behavior-analytics-api.ts", import.meta.url), "utf8");
  assert.match(api, /observationToken/);
  assert.match(api, /sourceEnvironment !== "SANDBOX"/);
  assert.match(service, /rememberAcceptanceObservationCredential/);
  assert.match(service, /uni\.setClipboardData/);
  assert.match(service, /uni\.showModal/);
  assert.match(service, /getAcceptanceObservationCredential/);
});

test("a delayed A receipt cannot project a credential after logout or an A-to-B rotation", () => {
  assert.match(service, /const receipt = await options\.transport\.ingest\(event\)/);
  assert.match(service, /const receipt = await options\.transport\.ingest\(event\)[\s\S]*?if \(queuedEpoch !== epoch\) return/);
  assert.match(service, /if \(options\.enabled && !options\.enabled\(\)\) return;[\s\S]*?rememberAcceptanceObservationCredential\(receipt, options\.credentialScope/);
  assert.match(service, /clearAcceptanceObservationCredential\(\);/);
  assert.match(service, /credentialScope: subject/);
  assert.match(service, /acceptanceObservationCredentialScope/);
});

test("a server-sampled production event without an eventId remains a valid receipt", async () => {
  const api = await readFile(new URL("../src/api/behavior-analytics-api.ts", import.meta.url), "utf8");
  assert.match(api, /sampledIn\?: boolean/);
  assert.match(api, /row\.sampledIn !== false && typeof row\.eventId !== "string"/);
});

test("page and click events share one cancellable serial transport lane", () => {
  assert.match(service, /let serial = Promise\.resolve\(\)/);
  assert.match(service, /serial = serial\.catch\(\(\) => undefined\)\.then\(async \(\) =>/);
  assert.match(service, /if \(queuedEpoch !== epoch\) return/);
  assert.match(service, /epoch \+= 1/);
  assert.match(service, /const endedAt = options\.now\(\);[\s\S]*?clientTs: endedAt/);
});
