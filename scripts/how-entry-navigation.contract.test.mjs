import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("tab navigation uses the transient-overlay-safe route gate", () => {
  const chassis = read("src/components/app-chassis.vue");
  assert.match(chassis, /navBack as navBackTo, navTo/);
  assert.match(chassis, /navTo\(tab\.route\)/);
  assert.match(chassis, /navTo\("\/pages\/search\/search"\)/);
  assert.doesNotMatch(chassis, /uni\.reLaunch\(\{ url: tab\.route/);
});

test("an empty first-user notification surface stays honest and does not invent business navigation", () => {
  const center = read("src/pages/me/notifications.vue");
  assert.match(center, /notifs\.items\.length === 0[\s\S]*t\.value\.notifs\.emptyAllTitle/);
  assert.doesNotMatch(center, /wallet-repurchase-how|goRepurchaseHow/);
});

test("team detail pages keep both How entries as direct keyboard-accessible targets", () => {
  const binary = read("src/pages/team/binary.vue");
  const unilevel = read("src/pages/team/unilevel.vue");
  assert.match(binary, /role="button" tabindex="0"[\s\S]*@click="go\('\/pages\/team\/binary-how'\)"/);
  assert.match(unilevel, /role="button" tabindex="0"[\s\S]*@click="go\('\/pages\/team\/unilevel-how'\)"/);
});

test("back navigation also closes transient overlays before popping the stack", () => {
  const route = read("src/lib/route.ts");
  const navBackStart = route.indexOf("export function navBack");
  const navToStart = route.indexOf("/** Navigate to", navBackStart);
  assert.ok(navBackStart >= 0 && navToStart > navBackStart);
  const navBackBody = route.slice(navBackStart, navToStart);
  assert.match(navBackBody, /closeTransientNavigationSheets\(\)/);
  assert.match(route, /function closeTransientNavigationSheets\(\)[\s\S]*useTrialClaimSheet\(\)\.closeTransient\(\)[\s\S]*useVoucherClaimSheet\(\)\.closeTransient\(\)/);
});
