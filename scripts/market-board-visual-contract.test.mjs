import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/home/market-board-card.vue", import.meta.url), "utf8");

test("canonical Java rows use the five-column high-fidelity board", () => {
  assert.match(source, /v-for="\(row, i\) in homeMarketRows"/);
  assert.match(source, /data-home-market-row="true"/);
  assert.match(source, /gridTemplateColumns: marketGridColumns/);
  for (const heading of ["mbColTag", "mbColModel", "mbCol1h", "mbColPrice", "mbCol24h"]) {
    assert.match(source, new RegExp(`t\\.home\\.${heading}`));
  }
});

test("canonical rows show explicit unavailable states instead of mock market facts", () => {
  assert.match(source, /v-if="displayRow\(row\)\.sparkline"/);
  assert.match(source, /marketBoardUnavailable/);
  assert.doesNotMatch(source, /v-for="row in homeMarketRows"/);
  assert.doesNotMatch(source, /`\$\$\{row\.price\}`/);
  assert.doesNotMatch(source, /const ROWS/);
});
