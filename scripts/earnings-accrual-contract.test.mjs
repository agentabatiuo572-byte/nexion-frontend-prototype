import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateUsdAccrual,
  completedUsdCentDelta,
} from "../src/lib/earnings-accrual.ts";

test("sub-cent device deltas survive repeated aggregate ticks", () => {
  let total = 247.83;
  for (let i = 0; i < 15; i += 1) total = accumulateUsdAccrual(total, 0.001);
  assert.equal(total, 247.845);
  assert.equal(total.toFixed(2), "247.84");
});

test("only completed cents are routed while the sub-cent remainder is retained", () => {
  let total = 247.83;
  let routed = 0;
  for (let i = 0; i < 30; i += 1) {
    const next = accumulateUsdAccrual(total, 0.001);
    routed = +(routed + completedUsdCentDelta(total, next)).toFixed(2);
    total = next;
  }
  assert.equal(total, 247.86);
  assert.equal(routed, 0.03);
});

test("invalid or negative accrual deltas never reduce the aggregate", () => {
  assert.equal(accumulateUsdAccrual(12.345, -1), 12.345);
  assert.equal(accumulateUsdAccrual(12.345, Number.NaN), 12.345);
  assert.equal(completedUsdCentDelta(12.345, 12.344), 0);
});
