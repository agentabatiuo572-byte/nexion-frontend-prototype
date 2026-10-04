import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("H5 forwards bearer authorization on same-origin auth and api proxies", () => {
  const config = fs.readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /configure\s*:\s*\(proxy\)/);
  assert.match(config, /proxyReq\.setHeader\(\s*["']Authorization["']/);
  assert.match(config, /["']\/auth["']\s*:/);
  assert.match(config, /["']\/api["']\s*:/);
});
