import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("remote transaction details never render locally derived chain facts", async () => {
  const page = await read("src/pages/tx/hash.vue");
  assert.match(page, /v-if="remoteApiEnabled"[\s\S]*?data-testid="tx-detail-hold"/);
  assert.match(page, /detailUnavailableTitle/);
  assert.match(page, /detailUnavailableBody/);
  assert.match(page, /<template v-else>[\s\S]*?blockNumber[\s\S]*?confirmations[\s\S]*?fromAddr[\s\S]*?gasLine[\s\S]*?<\/template>/);
});

test("all supported languages explain the transaction-data HOLD", async () => {
  const files = await Promise.all([
    read("src/i18n/messages/en.ts"),
    read("src/i18n/messages/zh.ts"),
    read("src/i18n/messages/vi.ts"),
  ]);
  for (const source of files) {
    assert.match(source, /detailUnavailableTitle:/);
    assert.match(source, /detailUnavailableBody:/);
  }
});
