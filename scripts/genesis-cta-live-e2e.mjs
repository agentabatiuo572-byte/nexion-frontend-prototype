import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appBaseUrl = process.env.NX_GENESIS_APP_URL || "http://127.0.0.1:5173";
const backendUrl = process.env.NX_GENESIS_BACKEND_URL || "http://127.0.0.1:8110";
const evidenceDir = path.resolve(process.env.NX_GENESIS_EVIDENCE_DIR
  || "D:/workspace/bug-pic/genesis-canonical-dev-smoke");

assert.equal(new URL(appBaseUrl).hostname, "127.0.0.1", "GENESIS_APP_MUST_BE_LOOPBACK");
assert.equal(new URL(backendUrl).hostname, "127.0.0.1", "GENESIS_BACKEND_MUST_BE_LOOPBACK");

const response = await fetch(`${backendUrl}/api/genesis/state`);
const payload = await response.json();
assert.equal(response.status, 200, "GENESIS_STATE_HTTP_NOT_200");
assert.equal(payload?.code, 0, "GENESIS_STATE_ENVELOPE_NOT_SUCCESS");
assert.equal(payload?.data?.serverCanonical, true, "GENESIS_STATE_NOT_SERVER_CANONICAL");
assert.equal(payload?.data?.sourceEnvironment, "PRODUCTION", "GENESIS_STATE_NOT_CANONICAL_RAIL");
assert.equal(payload?.data?.runId, "", "GENESIS_STANDARD_DEV_MUST_NOT_HAVE_RUN_ID");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const runtimeErrors = [];
const mutatingRequests = [];
page.on("pageerror", (error) => runtimeErrors.push(String(error)));
page.on("console", (message) => {
  const text = message.text();
  if (message.type() === "error" && !text.includes("401 (Unauthorized)")) runtimeErrors.push(text);
});
page.on("request", (request) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
    mutatingRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
  }
});

try {
  const appResponse = await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  assert.equal(appResponse?.status(), 200, "GENESIS_APP_HTTP_NOT_200");
  await page.waitForTimeout(1_000);
  assert.deepEqual(runtimeErrors, [], "GENESIS_APP_RUNTIME_ERRORS");
  const businessMutatingRequests = mutatingRequests.filter(
    (request) => !/\/auth\/users\/refresh$/.test(request.path),
  );
  assert.deepEqual(businessMutatingRequests, [], "GENESIS_SMOKE_SENT_BUSINESS_MUTATION");

  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, "app.png"), fullPage: true });
  fs.writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify({
    result: "PASS",
    checkedAt: new Date().toISOString(),
    appBaseUrl,
    backendUrl,
    sourceEnvironment: payload.data.sourceEnvironment,
    runId: payload.data.runId,
    serverCanonical: payload.data.serverCanonical,
    totalSupply: payload.data.series?.totalSupply,
    soldSupply: payload.data.series?.soldSupply,
    remainingSupply: payload.data.series?.remainingSupply,
    runtimeErrors,
    mutatingRequests,
    businessMutatingRequests: businessMutatingRequests.length,
  }, null, 2)}\n`, "utf8");
} finally {
  await browser.close();
}

console.log("GENESIS_CANONICAL_DEV_SMOKE_PASS");
