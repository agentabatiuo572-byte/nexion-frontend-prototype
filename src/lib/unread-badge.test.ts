import { describe, expect, it } from "vitest";
import { parse } from "@vue/compiler-sfc";
import { baseParse, compile, type ElementNode, type RootNode, type TemplateChildNode } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import * as ts from "typescript";
import { fmt } from "@/i18n/format";
import { formatUnreadBadge } from "./unread-badge";

describe("message badge display limit", () => {
  it.each([
    [0, ""], [1, "1"], [9, "9"], [10, "10"], [98, "98"], [99, "99"],
    [100, "99"], [999, "99"], [Number.MAX_SAFE_INTEGER, "99"],
    [-1, ""], [Number.NaN, ""], [Number.POSITIVE_INFINITY, ""], [1.9, "1"],
  ])("formats %s as %s without changing the source count", (count, expected) => {
    const source = Vue.ref(count);
    expect(formatUnreadBadge(source.value)).toBe(expected);
    expect(source.value).toBe(count);
  });
});

const sources = import.meta.glob([
  "../components/app-chassis.vue", "../components/nova/nova-bubble.vue",
  "../pages/support/messages.vue", "../pages/me/me.vue", "../pages/me/notifications.vue",
  "../components/message-drawer.vue", "../components/me/ticket-row.vue",
], { query: "?raw", import: "default", eager: true });

const surfaces = [
  { path: "../components/app-chassis.vue", className: "nx-badge", computedLabel: true },
  { path: "../components/nova/nova-bubble.vue", className: "nx-nova-badge", computedLabel: true },
  { path: "../pages/support/messages.vue", className: "nx-conv-unread" },
  { path: "../pages/me/me.vue", styleName: "quickBadgeStyle", entryLabel: true },
  { path: "../pages/me/notifications.vue", styleName: "unreadBadgeStyle" },
  { path: "../components/message-drawer.vue", className: "md-tab-badge" },
  { path: "../components/me/ticket-row.vue", styleName: "unreadChipStyle", computedLabel: true },
];

function badgeElement(node: RootNode | TemplateChildNode, surface: typeof surfaces[number]): ElementNode | undefined {
  if (node.type === 1 && node.props.some(prop =>
    (prop.type === 6 && prop.name === "class" && prop.value?.content.split(" ").includes(surface.className ?? ""))
    || (prop.type === 7 && prop.name === "bind" && prop.arg?.type === 4
      && prop.arg.content === "style" && prop.exp?.type === 4 && prop.exp.content === surface.styleName))) {
    return node;
  }
  if (node.type === 0 || node.type === 1) {
    for (const child of node.children) {
      const found = badgeElement(child, surface);
      if (found) return found;
    }
  }
}

function scriptLabel(script: string, count: number, entryLabel: boolean): string | undefined {
  const ast = ts.createSourceFile("badge.vue.ts", script, ts.ScriptTarget.Latest, true);
  let expression: string | undefined;
  function visit(node: ts.Node) {
    if (!entryLabel && ts.isVariableDeclaration(node) && node.name.getText(ast) === "unreadLabel") {
      expression = `${node.initializer!.getText(ast)}.value`;
    }
    if (entryLabel && ts.isObjectLiteralExpression(node)
      && node.properties.some(prop => ts.isPropertyAssignment(prop)
        && prop.name.getText(ast) === "key" && prop.initializer.getText(ast) === '"messages"')) {
      const badge = node.properties.find(prop => ts.isPropertyAssignment(prop) && prop.name.getText(ast) === "badge");
      if (badge && ts.isPropertyAssignment(badge)) expression = badge.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw new Error("Missing source badge expression");
  return new Function("computed", "unread", "totalUnread", "unreadNotifs", "props", "t", "fmt", "formatUnreadBadge",
    `return ${expression};`)(Vue.computed, Vue.ref(count), Vue.ref(count), Vue.ref(count),
    { tk: { unread: count } }, { value: { tickets: { unreadChip: "{n}" } } }, fmt, formatUnreadBadge);
}

describe.each(surfaces)("message badge wiring in $path", surface => {
  it.each([0, 1, 9, 10, 99, 100, 999])("renders the actual badge template at %s unread", async count => {
    const source = String(sources[surface.path] ?? "");
    const { descriptor } = parse(source);
    expect(descriptor.scriptSetup!.content).toContain('import { formatUnreadBadge } from "@/lib/unread-badge"');
    const element = badgeElement(baseParse(descriptor.template!.content), surface);
    if (!element) throw new Error(`Missing badge element in ${surface.path}`);
    const { code } = compile(element.loc.source, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true });
    const render = new Function("Vue", code)(Vue);
    const label = surface.computedLabel || surface.entryLabel
      ? scriptLabel(descriptor.scriptSetup!.content, count, Boolean(surface.entryLabel)) : undefined;
    const html = await renderToString(Vue.createSSRApp({ render, setup: () => ({
      unread: count, unreadLabel: label, showUnreadBadge: count > 0,
      r: { unread: count }, item: { badge: label }, notifs: { unread: count }, tk: { unread: count },
      countUnread: () => count, formatUnreadBadge, filter: "all", id: "all",
      quickBadgeStyle: {}, unreadBadgeStyle: {}, unreadChipStyle: {},
    }) }));
    if (count === 0) expect(html).not.toContain("<text");
    else expect(html).toMatch(new RegExp(`>${formatUnreadBadge(count)}</text>`));
    expect(html).not.toMatch(/\d\+/);
  });
});

it("keeps the notification drawer's descriptive unread total exact", () => {
  const { descriptor } = parse(String(sources["../components/message-drawer.vue"]));
  const script = descriptor.scriptSetup!.content;
  const label = new Function("computed", "unread", "t", "fmt",
    `${script.match(/const unreadLabel = computed\([\s\S]*?\n\);/)![0]}; return unreadLabel.value;`)(
    Vue.computed, Vue.ref(123), { value: { notifs: { unreadCount: "{n} unread", allCaughtUp: "All read" } } }, fmt);
  expect(label).toBe("123 unread");
});
