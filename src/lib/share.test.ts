import { expect, it } from "vitest";
import { hasLegacyShareTemplate } from "./share";
import type { ShareChannelDef } from "@/store/config-types";

it("checks only share templates used by each channel and rejects encoded old hosts", () => {
  const copy = { key: "copy", intentType: "copy", enabled: true, textTemplate: "NexGrid", urlTemplate: "https://nexgrid.ai/share" } as ShareChannelDef;
  expect(hasLegacyShareTemplate(copy, true)).toBe(false);
  expect(hasLegacyShareTemplate({ ...copy, intentType: "web", urlTemplate: "https://%6eexgrid.ai/share?url={link}" }, false)).toBe(true);
  expect(hasLegacyShareTemplate({ ...copy, intentType: "scheme", urlTemplate: undefined }, false)).toBe(false);
  expect(hasLegacyShareTemplate({ ...copy, intentType: "scheme", urlTemplate: undefined }, true)).toBe(true);
});
