import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isLeftConversionSwipe } from "../src/lib/notification-swipe.ts";

const root = path.resolve(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "src/pages/me/notifications.vue"), "utf8");
const store = fs.readFileSync(path.join(root, "src/store/notifications.ts"), "utf8");
const gesture = fs.readFileSync(path.join(root, "src/lib/notification-swipe.ts"), "utf8");

test("remote notification conversion requires a real left-swipe gesture", () => {
  assert.match(page, /@touchstart/);
  assert.match(page, /@touchend/);
  assert.match(page, /isLeftConversionSwipe/);
  assert.match(page, /recordSwipeConversion/);
  assert.match(store, /"swipe_conversion"/);
  assert.match(store, /"cta"/);
  assert.match(gesture, /deltaX\s*<=\s*-64/);
  assert.match(gesture, /Math\.abs\(deltaY\)/);
});

test("mock mode cannot report a remote swipe conversion", () => {
  assert.match(page, /if \(!remoteApiEnabled\) return/);
  assert.match(store, /if \(!remoteApiEnabled\) return null/);
});

test("gesture classifier rejects clicks, right swipes, vertical drags and stale touches", () => {
  const start = { x: 180, y: 100, at: 1_000 };
  assert.equal(isLeftConversionSwipe(start, { x: 110, y: 110, at: 1_400 }), true);
  assert.equal(isLeftConversionSwipe(start, { x: 170, y: 100, at: 1_100 }), false);
  assert.equal(isLeftConversionSwipe(start, { x: 260, y: 100, at: 1_200 }), false);
  assert.equal(isLeftConversionSwipe(start, { x: 100, y: 170, at: 1_200 }), false);
  assert.equal(isLeftConversionSwipe(start, { x: 100, y: 100, at: 2_100 }), false);
});
