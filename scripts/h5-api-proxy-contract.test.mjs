import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("H5 proxy preserves the real UI authentication path", () => {
  assert.match(viteConfig, /"\/auth"\s*:\s*\{[\s\S]*?target:\s*apiPreviewTarget/);
  assert.doesNotMatch(viteConfig, /"\/auth"\s*:\s*\{[\s\S]*?rewrite:/);
  assert.doesNotMatch(viteConfig, /"\/api\/auth"\s*:\s*\{/);
});

test("H5 proxy preserves the /api prefix for backend-native app configuration routes", () => {
  assert.match(viteConfig, /"\/api"\s*:\s*\{[\s\S]*?target:\s*apiPreviewTarget/);
  assert.doesNotMatch(viteConfig, /"\/api"\s*:\s*\{[\s\S]*?rewrite:/);
});

test("local acceptance proxy supplies the server-owned geo edge country", () => {
  assert.match(viteConfig, /VITE_NEXGRID_API_PREVIEW_EDGE_COUNTRY/);
  assert.match(viteConfig, /"X-Nexion-Edge-Country"\s*:\s*apiPreviewEdgeCountry/);
  assert.match(viteConfig, /headers:\s*apiPreviewHeaders/);
});
