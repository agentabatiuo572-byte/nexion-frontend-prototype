import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function containsForbiddenKyc(source) {
  // The existing sticky-CTA identifier family contains the letters `kyC`
  // across its word join. Neutralize only that exact phrase; every other KYC
  // spelling, including deliberately odd identifier casing, is forbidden.
  return /kyc/i.test(String(source).replace(/stickycta/ig, ""));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

const RETIRED_ROUTE_MIGRATION = path.normalize("src/lib/retired-route-migrations.ts");

function runtimeSourceForKycScan(file) {
  const source = fs.readFileSync(file, "utf8");
  if (path.normalize(file) !== RETIRED_ROUTE_MIGRATION) return source;
  // One historical route key is retained only as a safe migration source.
  // Removing this exact key would recreate the retired deep-link white screen.
  return source.replaceAll('"pages/me/kyc"', '"pages/me/retired-verification"');
}

test("UniApp runtime contains no KYC capability or gate", () => {
  const violations = sourceFiles("src")
    .filter((file) => containsForbiddenKyc(file)
      || (/\.(?:ts|vue|json|scss|css)$/.test(file)
        && containsForbiddenKyc(runtimeSourceForKycScan(file))));

  assert.deepEqual(violations, []);
});

test("retired KYC deep link migrates to the current security page with an explanation", () => {
  const migration = fs.readFileSync(RETIRED_ROUTE_MIGRATION, "utf8");
  const app = fs.readFileSync("src/App.vue", "utf8");
  const security = fs.readFileSync("src/pages/me/security.vue", "utf8");

  assert.match(migration, /"pages\/me\/kyc"/);
  assert.match(migration, /"\/pages\/me\/security\?from=retired-flow"/);
  assert.match(app, /resolveRetiredRoute\(readCurrentRoute\(\)\)/);
  assert.match(app, /uni\.reLaunch\(\{\s*url:\s*retiredRoute/);
  assert.match(security, /from === "retired-flow"/);
  assert.match(security, /flowRetired/);
  assert.match(security, /data-qa="retired-flow-notice"/);
});

test("KYC removal guard catches case and identifier variants without matching stickyCTA", () => {
  for (const sentinel of [
    "KYC", "Kyc", "kYc", "KYC_GATE", "KycStatus", "KYC-address",
    "showKycGate", "useKYCStore", "legacy_kyc", "hasKyc",
    "showkyCGate", "usekyCStore", "haskyC", "legacy_kyC",
  ]) {
    assert.equal(containsForbiddenKyc(sentinel), true, `must reject ${sentinel}`);
  }
  assert.equal(containsForbiddenKyc("stickyCTA"), false);
  assert.equal(containsForbiddenKyc("useStickyCTA"), false);
  assert.equal(containsForbiddenKyc("StickyCTAPayload"), false);
  assert.equal(containsForbiddenKyc("stickyCTAKyc"), true);
  assert.equal(containsForbiddenKyc("src/pages/risk/kyc-review.css"), true);
});

test("production payout-address flow is server-canonical while sandbox uses an explicit local mock", () => {
  const api = fs.readFileSync("src/api/payout-address-api.ts", "utf8");
  const runtime = fs.readFileSync("src/api/runtime.ts", "utf8");
  const store = fs.readFileSync("src/store/payout-address.ts", "utf8");
  const page = fs.readFileSync("src/pages/me/wallet-address-rebind.vue", "utf8");

  assert.match(api, /path: "\/api\/payout-addresses"/);
  assert.match(api, /path: "\/api\/payout-addresses\/otp\/send"/);
  assert.match(api, /idempotencyKey: input\.idempotencyKey/);
  assert.match(runtime, /createPayoutAddressApi\(apiClient\)/);
  assert.match(runtime, /payoutAddressServerEnabled = apiRuntimeConfig\.mode === "remote"/);
  assert.match(runtime, /payoutAddressMockEnabled = apiRuntimeConfig\.mode !== "remote"/);
  assert.match(store, /payoutAddressServerEnabled \? emptyBook\(\) : hydrate\(boundKey\)/);
  assert.match(store, /await payoutAddressApi\.save/);
  assert.match(page, /await payout\.saveRemoteAddress/);
  assert.match(page, /data-testid="payout-address-mock-source"/);
  assert.match(page, /v-if="payoutAddressMockEnabled"/);
  assert.match(page, /t\.addrRebind\.sandboxMockNotice/);
});
