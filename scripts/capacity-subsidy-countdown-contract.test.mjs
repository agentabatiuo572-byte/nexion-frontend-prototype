import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const card = readFileSync(new URL("../src/components/earn/device-card-pc.vue", import.meta.url), "utf8");

test("remote subsidy badge consumes the true server remaining-days field", () => {
  assert.match(card, /capacitySubsidyRemainingDays/);
  assert.match(card, /capacitySubsidyEndsAt/);
  assert.match(card, /capacitySnapshotReceivedAt/);
  assert.match(card, /readMonotonicNowMs/);
  assert.match(card, /advanceMonotonicHighWater/);
  assert.match(card, /deadlineRemainingMs/);
  assert.doesNotMatch(
    card,
    /capacitySource === "server"[\s\S]{0,240}\(props\.device\.capacitySubsidyDays \?\? 0\) \* DAY_MS/,
  );
});
