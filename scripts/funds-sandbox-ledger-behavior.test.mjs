import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/store/funds-sandbox-ledger.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
const { projectFundsSandboxLedger } = await import(moduleUrl);

function entry(overrides) {
  return {
    ledgerNo: "SBX-LG-BASE",
    orderNo: "SBX-WD-1",
    entryRole: "WITHDRAWAL_RESERVE",
    direction: "RESERVE",
    amount: 4,
    availableAfter: 16,
    reservedAfter: 4,
    source: "mock",
    sourceEnvironment: "SANDBOX",
    createdAt: "2026-08-11T01:00:00Z",
    ...overrides,
  };
}

test("confirmed withdrawal is one available-balance debit, not RESERVE plus DEBIT twice", () => {
  const rows = projectFundsSandboxLedger([
    entry({}),
    entry({
      ledgerNo: "SBX-LG-DEBIT",
      entryRole: "WITHDRAWAL_DEBIT",
      direction: "OUT",
      reservedAfter: 0,
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, -4);
  assert.equal(rows[0].balanceAfter, 16);
  assert.equal(rows[0].reservedAfter, 4);
  assert.equal(rows[0].status, "posted");
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), -4);
});

test("failed withdrawal reserve and release conserve the user's available balance", () => {
  const rows = projectFundsSandboxLedger([
    entry({}),
    entry({
      ledgerNo: "SBX-LG-RELEASE",
      entryRole: "WITHDRAWAL_RELEASE",
      direction: "RELEASE",
      availableAfter: 20,
      reservedAfter: 0,
    }),
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.entryRole === "WITHDRAWAL_RESERVE").status, "failed");
  assert.equal(rows.find((row) => row.entryRole === "WITHDRAWAL_RELEASE").balanceAfter, 20);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 0);
});

test("top-up remains a labelled authoritative server credit", () => {
  const rows = projectFundsSandboxLedger([entry({
    ledgerNo: "SBX-LG-TOPUP",
    orderNo: "SBX-TU-1",
    entryRole: "TOPUP_CREDIT",
    direction: "IN",
    amount: 5,
    availableAfter: 25,
    reservedAfter: 0,
  })]);

  assert.deepEqual(rows.map(({ type, amount, balanceAfter, source, sourceEnvironment }) =>
    ({ type, amount, balanceAfter, source, sourceEnvironment })), [{
      type: "topup",
      amount: 5,
      balanceAfter: 25,
      source: "mock",
      sourceEnvironment: "SANDBOX",
    }]);
});
