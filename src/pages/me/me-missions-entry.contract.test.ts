import { describe, expect, it, vi } from "vitest";
import source from "./me.vue?raw";
import pagesSource from "@/pages.json?raw";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const account = source.slice(source.indexOf('key: "account"'), source.indexOf('key: "preferences"'));
// A direct array item has no task status, eligibility or newcomer-switch condition.
const entrySource = account.match(/items:\s*\[\s*(\{[^\n]+\})/)![1];
const entry = (messages: typeof zh) => {
  expect(entrySource).toContain('key: "missions"');
  return new Function("t", `return (${entrySource});`)({ value: messages });
};

describe("permanent Me mission-center entry", () => {
  it.each([zh, en, vietnamese])("keeps the account entry unconditional with existing localized copy", messages => {
    expect(entry(messages)).toEqual({ key: "missions", label: messages.me.missionsRow,
      href: "/pages/missions/missions", icon: "target", tone: "brand" });
  });

  it("opens the registered mission center through the existing menu click handler", () => {
    const navTo = vi.fn(), themePickerOpen = { value: false };
    const handler = source.match(/function handleQuickItem\(item: QuickItem\) \{([\s\S]*?)\n\}/)![1];
    new Function("navTo", "themePickerOpen", "item", handler)(navTo, themePickerOpen, entry(zh));
    expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/missions/missions");
    expect(themePickerOpen.value).toBe(false);
    expect(JSON.parse(pagesSource).pages).toContainEqual(expect.objectContaining({ path: "pages/missions/missions" }));
  });
});
