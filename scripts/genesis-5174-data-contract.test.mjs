import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const liveScript = fileURLToPath(new URL("./genesis-public-state-live.mjs", import.meta.url));

// This test runs in the offline full contract chain. A live Genesis check must
// opt in to a backend URL, even if a developer has a service on port 8110.
const source = readFileSync(liveScript, "utf8");
assert.doesNotMatch(source, /127\.0\.0\.1:8110|localhost:8110/i);

const noFetch = `data:text/javascript,${encodeURIComponent('globalThis.fetch = () => { throw new Error("UNEXPECTED_FETCH") }')}`;
const result = spawnSync(process.execPath, ["--import", noFetch, liveScript], {
  encoding: "utf8",
  env: { ...process.env, NX_GENESIS_BACKEND_URL: "" },
});
assert.notEqual(result.status, 0, "live check must fail closed without a URL");
assert.match(result.stderr, /NX_GENESIS_BACKEND_URL is required/);
assert.doesNotMatch(result.stderr, /UNEXPECTED_FETCH|ECONNREFUSED|fetch failed|127\.0\.0\.1:8110/i);
