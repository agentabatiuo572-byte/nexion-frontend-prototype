import { describe, expect, it } from "vitest";
import { parse } from "@vue/compiler-sfc";

const source = String(import.meta.glob("./notifications.vue", {
  query: "?raw", import: "default", eager: true,
})["./notifications.vue"] ?? "");
const { descriptor } = parse(source);
const template = descriptor.template!.content;
const style = descriptor.styles.map(block => block.content).join("\n");

describe("notification page header and unread layout", () => {
  it("uses the existing centered header with the localized message title and back target", () => {
    expect(template).toContain('<SubPageHeader back="/pages/me/me" :title="t.notifs.drawerTitle" />');
    expect(source).not.toContain("/pages/me/preferences");
  });

  it("centers the existing capped badge in equal side columns", () => {
    expect(style).toMatch(/\.notification-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
    expect(style).toMatch(/\.notification-count\s*\{[^}]*grid-column:\s*2;[^}]*justify-content:\s*center/);
    expect(template).toContain('{{ formatUnreadBadge(notifs.unread) }}');
    expect(template).toContain('v-if="notifs.unread > 0" :style="unreadBadgeStyle"');
  });

  it("keeps the existing actions reachable beside the count with wrapping for narrow screens", () => {
    expect(style).toMatch(/\.notification-actions\s*\{[^}]*grid-column:\s*3;[^}]*flex-wrap:\s*wrap/);
    expect(descriptor.scriptSetup!.content).toContain('minHeight: "36px", maxWidth: "100%"');
    expect(template).toContain('@click="notifs.markAllRead()"');
    expect(template).toContain('@click="notifs.clearRead()"');
  });

  it("preserves the real category totals and filter/read interactions", () => {
    expect(template).toContain('{{ filterLabel(id) }} ({{ countOf(id) }})');
    expect(template).toContain('@click="filter = id"');
    expect(template).toContain('@click="onTap(n)"');
    expect(descriptor.scriptSetup!.content).toContain('id === "all" ? notifs.items.length : notifs.items.filter((x) => x.kind === id).length');
  });
});
