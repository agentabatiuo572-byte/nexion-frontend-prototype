// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync(new URL("./deposit-bank-pane.vue", import.meta.url), "utf8");

test("hosted bank orders open the provider page and do not expose manual bank instructions", () => {
  expect(source).toContain("openHostedPaymentPage");
  expect(source).toContain('intent.paymentMode === "hosted"');
  expect(source).toContain("hostedContinueCta");
  expect(source).toContain("hostedCanOpen");
  expect(source).toContain("openingHosted");
  expect(source).toContain("findResumablePaymentIntent");
  expect(source).toContain('v-if="intent.paymentMode !== \'hosted\'"');
  expect(source).toContain('v-if="intent.paymentMode !== \'hosted\'" class="nx-bank-cancel-cta');
  expect(source).toContain("const pageActive = ref(false)");
  expect(source).toContain('if (pageActive.value && it.paymentMode === "hosted")');
  expect(source).toContain("pageActive.value = false");
});
