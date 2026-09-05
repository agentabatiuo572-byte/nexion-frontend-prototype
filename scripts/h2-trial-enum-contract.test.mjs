import assert from "node:assert/strict";
import test from "node:test";

import { parseTrialBooleanConfig } from "../src/lib/trial-config-enum.ts";

test("H2 boolean policy accepts only the reviewed backend booleans and legacy enum labels", () => {
  for (const value of [true, "true", "1", "enabled", "on", "开", "开放"]) {
    assert.equal(parseTrialBooleanConfig(value), true);
  }
  for (const value of [false, "false", "0", "disabled", "off", "关", "关闭"]) {
    assert.equal(parseTrialBooleanConfig(value), false);
  }
  for (const value of ["maybe", "", 1, null, undefined]) {
    assert.throws(() => parseTrialBooleanConfig(value), /TRIAL_CONFIG_RESPONSE_INVALID/);
  }
});
