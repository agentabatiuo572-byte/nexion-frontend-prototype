import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("team detail pages expose the same How entries as the high-fidelity hierarchy", () => {
  const binary = read("src/pages/team/binary.vue");
  const unilevel = read("src/pages/team/unilevel.vue");
  assert.match(binary, /role="button" tabindex="0"[\s\S]*go\('\/pages\/team\/binary-how'\)/);
  assert.match(unilevel, /role="button" tabindex="0"[\s\S]*go\('\/pages\/team\/unilevel-how'\)/);
});
test("the repurchase parent exposes its How page without inventing an extra Me row", () => {
  const source = read("src/pages/me/wallet-repurchase.vue");
  assert.match(source, /role="button" tabindex="0"[\s\S]*@click="goHow"/);
  assert.match(source, /navTo\("\/pages\/me\/wallet-repurchase-how"\)/);
});

test("logical navigation closes transient offer sheets before routing", () => {
  const source = read("src/lib/route.ts");
  assert.match(source, /useTrialClaimSheet/);
  assert.match(source, /useVoucherClaimSheet/);
  assert.match(source, /closeTransient/);
});
