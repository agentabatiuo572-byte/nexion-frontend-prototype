import assert from "node:assert/strict";
import test from "node:test";
import { loadMessages } from "./lib/i18n-load.mjs";

for (const locale of ["zh", "en", "vi"]) {
  test(`${locale} loads imported message modules together with the existing catalog copy`, async () => {
    const messages = await loadMessages(locale);
    assert.equal(typeof messages.promotion.events, "string");
    assert.ok(messages.promotion.events.length > 0);
    assert.equal(typeof messages.store.pageFooter, "string");
    assert.ok(messages.store.pageFooter.length > 0);
  });
}
