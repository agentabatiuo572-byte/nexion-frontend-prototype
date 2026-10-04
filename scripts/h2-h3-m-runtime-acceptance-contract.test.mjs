import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("local remote H5 preview proxies API paths instead of returning the app document", () => {
  const vite = read("vite.config.ts");
  assert.match(vite, /loadEnv/);
  assert.match(vite, /proxy\s*:/);
  assert.match(vite, /["']\/api["']/);
  assert.match(vite, /VITE_NEXGRID_API_PREVIEW_TARGET/);
});

test("H2 refreshes authority as soon as the first visible earn entry opens", () => {
  const earn = read("src/pages/earn/earn.vue");
  assert.match(earn, /onShow/);
  assert.match(earn, /useFreeTrial/);
  assert.match(earn, /remoteApiEnabled/);
  assert.match(earn, /freeTrial\.refreshRemote\(true\)/);
});

test("H3 and M distinguish an unavailable authority read from a real empty result", () => {
  const weekly = read("src/components/home/weekly-quest-list.vue");
  const help = read("src/pages/me/help.vue");
  assert.match(weekly, /mounted && wq\.error/);
  // Failure must win over the honest empty state. The localized copy is
  // deliberately indirect (`w.loadError`), so test the render branches rather
  // than an obsolete English literal.
  assert.ok(weekly.indexOf("mounted && wq.error") < weekly.indexOf("mounted && !wq.snapshot"));
  assert.ok(weekly.indexOf("mounted && !wq.snapshot") < weekly.indexOf("tier2Quests.length === 0"));
  assert.match(help, /faqLoadError/);
  assert.match(help, /@cta="loadFaqs"/);
  assert.match(help, /supportApi\.faqPage/);
  assert.doesNotMatch(help, /@\/mock\/faq/);
});
