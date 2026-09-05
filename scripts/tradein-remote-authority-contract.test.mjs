import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("remote checkout gets trade-in sources from server eligibility", () => {
  const source = read("src/pages/store/checkout.vue");
  assert.match(source, /deviceE3Api\.eligibility\(kind\)/);
  assert.match(source, /eligibility\.sources\.filter\(\(source\) => source\.eligible\)/);
});

test("remote trade-in sheet revalidates eligibility and never previews local credit", () => {
  const source = read("src/components/tradein-sheets.vue");
  assert.match(source, /deviceE3Api\.eligibility\(targetKind\)/);
  assert.match(source, /isProductAvailable\(p, phase\.value\)/);
  assert.match(source, /remoteApiEnabled \? "—" :/);
});

test("remote device and product cards do not render a locally estimated trade-in credit", () => {
  const devices = read("src/pages/me/devices.vue");
  const product = read("src/components/store/product-card.vue");
  const banner = read("src/components/store/tradein-window-banner.vue");
  assert.match(devices, /if \(remoteApiEnabled\)[\s\S]{0,250}tradeinCtaLabel/);
  assert.match(product, /!remoteApiEnabled && bestTradeinCredit\.value > 0/);
  assert.match(banner, /deviceE3Api\.eligibility/);
  assert.match(banner, /deviceE3Api\.quote/);
});

test("remote ladder and device capability use server facts or fail closed", () => {
  const ladder = read("src/components/me/tradein-ladder-sheet.vue");
  const card = read("src/components/earn/device-card-pc.vue");
  assert.match(ladder, /deviceE3Api\.tradeinConfig/);
  assert.match(card, /remoteApiEnabled \? 0 : FALLBACK_CAP\.tops/);
  assert.match(card, /remoteApiEnabled \? "—" : FALLBACK_CAP\.tier/);
});
