import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "./app-chassis.vue",
  "./home/quick-action-row.vue",
  "./support/conversation-thread.vue",
  "../pages/store/checkout.vue",
  "../pages/support/chat.vue",
  "./ui/nx-button.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const read = (path: string) => sources[path] ?? "";

function clickableTag(source: string, click: string): string {
  const marker = source.indexOf(click);
  if (marker < 0) return "";
  return source.slice(source.lastIndexOf("<", marker), source.indexOf(">", marker) + 1);
}

// Reachable when actionable: a static tabindex="0", or a roving tabindex that is 0 while enabled.
const REACHABLE = /(?<!:)tabindex="0"|:tabindex="[^"]*\? (?:0 : (?:-1|undefined)|-1 : 0)"/;
function expectKeyboardControl(tag: string): void {
  expect(tag).toMatch(/(?<!:)role="|:role="/);
  expect(tag).toMatch(REACHABLE);
  expect(tag).toContain("onKeyboardActivate($event");
}

describe("core interaction accessibility contracts", () => {
  it("keeps both sub-page chassis actions named and keyboard reachable", () => {
    const source = read("./app-chassis.vue");
    for (const handler of ['@click="navBack"', '@click="goNotifications"']) {
      const tag = clickableTag(source, handler);
      expectKeyboardControl(tag);
      expect(tag).toContain(":aria-label=");
    }
  });

  it("makes every home quick action a named keyboard link", () => {
    const tag = clickableTag(read("./home/quick-action-row.vue"), '@click="go(c.href)"');
    expect(tag).toContain('role="link"');
    expect(tag).toContain('tabindex="0"');
    expect(tag).toContain(':aria-label="c.label"');
  });

  it("makes support CTA, quick replies, restart and send controls keyboard reachable", () => {
    const source = read("./support/conversation-thread.vue");
    for (const click of [
      '@click="onCta(m)"',
      "@click=\"emit('chip', q.key)\"",
      "@click=\"emit('restart')\"",
      '@click="onSend"',
    ]) {
      expectKeyboardControl(clickableTag(source, click));
    }
    expect(source).toContain(':aria-label="sendLabel"');
    expect(source).toContain('sendLabel: string;');
    expect(clickableTag(source, '@click="onSend"')).toContain(':aria-disabled="!canSend"');
    for (const click of [
      '@click="saveQueueEdit(m)"',
      "@click=\"runQueueAction(m, 'cancel-edit')\"",
      // Retry lives on the delivery receipt, a button only while the message is retryable.
      '@click="retryStatus(m)"',
      '@click="startEdit(m)"',
      "@click=\"runQueueAction(m, 'cancel')\"",
    ]) {
      expectKeyboardControl(clickableTag(source, click));
    }
  });

  it("makes the full-screen support header and history actions keyboard reachable", () => {
    const source = read("../pages/support/chat.vue");
    for (const click of [
      // New-conversation, ticket and Nova history actions left with Nova (BUG-008).
      '@click="goBack"',
      '@click="loadEarlierHumanHistory"',
    ]) {
      expectKeyboardControl(clickableTag(source, click));
    }
  });

  it("ignores repeated keydown events before invoking navigation or mutation handlers", () => {
    for (const source of Object.values(sources)) {
      if (!source.includes("onKeyboardActivate")) continue;
      expect(source).toMatch(/function onKeyboardActivate\(event: KeyboardEvent, action: \(\) => void\)[\s\S]*event\.repeat/);
    }
  });

  it("makes checkout trade-in removal and restoration keyboard reachable", () => {
    const source = read("../pages/store/checkout.vue");
    // Both are the shared NxButton, which owns role, roving tabindex and Enter/Space activation.
    for (const click of ['@click="removeTradein"', '@click="reAddTradein"']) expect(clickableTag(source, click)).toMatch(/^<NxButton\b/);
    const button = read("./ui/nx-button.vue");
    expect(button).toContain('role="button" :tabindex="disabled || busy ? -1 : 0"');
    expect(button).toContain('@keydown.enter.prevent="activate" @keydown.space.prevent="activate"');
  });
});
