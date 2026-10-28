import { baseParse, compile, type ElementNode, type TemplateChildNode } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { formatUnreadBadge } from "./unread-badge";
import chassis from "@/components/app-chassis.vue?raw";
import bubble from "@/components/nova/nova-bubble.vue?raw";
import services from "@/components/support/service-message-list.vue?raw";
import conversations from "@/pages/support/messages.vue?raw";
import notifications from "@/pages/me/notifications.vue?raw";
import me from "@/pages/me/me.vue?raw";
import segments from "@/components/glass-segments.vue?raw";

const boundaries = [[0, ""], [1, "1"], [9, "9"], [10, "10"], [98, "98"], [99, "99"], [100, "99"], [12345, "99"]] as const;

// Render the production badge markup, including its own visibility condition.
function elementMarkup(source: string, matches: (node: ElementNode) => boolean): string {
  const template = parse(source).descriptor.template;
  if (!template) throw new Error("Missing production template");
  function find(nodes: TemplateChildNode[]): ElementNode | undefined {
    for (const node of nodes) {
      if (node.type !== 1) continue;
      if (matches(node)) return node;
      const nested = find(node.children);
      if (nested) return nested;
    }
  }
  const node = find(baseParse(template.content).children);
  if (!node) throw new Error("Missing production badge");
  return node.loc.source;
}
const hasClass = (name: string) => (node: ElementNode) => node.props.some(prop => prop.type === 6 && prop.name === "class" && prop.value?.content.split(" ").includes(name));
const markup = {
  bell: elementMarkup(chassis, hasClass("nx-badge")),
  bubble: elementMarkup(bubble, hasClass("nx-nova-badge")),
  service: elementMarkup(services, hasClass("service-unread")),
  conversation: elementMarkup(conversations, hasClass("nx-conv-unread")),
  segment: elementMarkup(segments, hasClass("nx-glass-option__count")),
};
async function renderBadge(template: string, bindings: Record<string, unknown>): Promise<string> {
  const code = compile(template, { mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag) }).code;
  const render = new Function("Vue", code)(Vue) as Vue.RenderFunction;
  const html = await renderToString(Vue.createSSRApp({ setup: () => bindings, render }));
  return html.replace(/<!--.*?-->/g, "");
}

// Read production computed expressions rather than recreating count logic here.
function expression<T>(source: string, matches: (node: ts.Node) => boolean, bindings: Record<string, unknown>): T {
  const script = parse(source).descriptor.scriptSetup;
  if (!script) throw new Error("Missing production script");
  const ast = ts.createSourceFile("badge.vue.ts", script.content, ts.ScriptTarget.Latest, true);
  function find(node: ts.Node): ts.Node | undefined {
    if (matches(node)) return node;
    return ts.forEachChild(node, find);
  }
  const node = find(ast);
  if (!node) throw new Error("Missing production count expression");
  const code = ts.transpileModule(`const result = ${node.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), code + ";return result;")(...Object.values(bindings)) as T;
}
function computedValue<T>(source: string, name: string, bindings: Record<string, unknown>): T {
  const initializer = expression<Vue.ComputedRef<T>>(source, node => ts.isCallExpression(node) && ts.isVariableDeclaration(node.parent) && node.parent.name.getText() === name,
    { computed: Vue.computed, formatUnreadBadge, ...bindings });
  return initializer.value;
}
type CountOption = { count?: string | number };
function sourceFunction<T>(source: string, name: string, bindings: Record<string, unknown>): T {
  return expression<T>(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name, bindings);
}
const serviceUnavailable = sourceFunction<(row: { unread: unknown; kind?: string }) => boolean>(services, "unreadUnavailable", { conversations: {} });
const conversationUnavailable = sourceFunction<(row: { unread: unknown; isAi?: boolean }) => boolean>(conversations, "unreadUnavailable", { humanReadFailed: Vue.ref(false) });
const normalTypeBadge = (count: number) => sourceFunction<(key: string) => string | undefined>(conversations, "typeUnreadBadge", { typeUnread: () => count, humanReadFailed: Vue.ref(false), formatUnreadBadge });

describe("message unread badge display", () => {
  it.each(boundaries)("formats %i as '%s' without changing the source count", (count, label) => {
    const original = count;
    expect(formatUnreadBadge(count)).toBe(label);
    expect(count).toBe(original);
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])("hides unusable counts: %s", count => {
    expect(formatUnreadBadge(count)).toBe("");
  });
  for (const [language, translations] of [["zh", zh], ["en", en], ["vi", vi]] as const) {
    it.each(boundaries)(`${language}: renders every message badge for %i`, async (count, label) => {
      const t = Vue.ref(translations), unread = Vue.ref(count), totalUnread = Vue.ref(count);
      const bellLabel = computedValue<string>(chassis, "unreadLabel", { unread });
      const bubbleLabel = computedValue<string>(bubble, "unreadLabel", { totalUnread });
      const showUnreadBadge = computedValue<boolean>(bubble, "showUnreadBadge", { totalUnread });
      const rowMarkup = await Promise.all([
        renderBadge(markup.bell, { unread: count, unreadLabel: bellLabel }),
        renderBadge(markup.bubble, { totalUnread: count, showUnreadBadge, unreadLabel: bubbleLabel }),
        renderBadge(markup.service, { row: { unread: count }, unreadUnavailable: serviceUnavailable, formatUnreadBadge }),
        renderBadge(markup.conversation, { r: { unread: count }, unreadUnavailable: conversationUnavailable, formatUnreadBadge }),
      ]);
      for (const [index, html] of rowMarkup.entries()) {
        if (!label) expect(html).toBe("");
        else expect(html.match(/<text[^>]*>([^<]*)<\/text>/)?.[1]).toBe(label);
      }
      const sections = computedValue<CountOption[]>(notifications, "sectionOptions", { t, notifs: { unread: count }, center: { serviceUnread: count } });
      const types = computedValue<CountOption[]>(conversations, "typeOptions", { TYPES: Vue.ref([{ key: "advisor" }, { key: "support" }, { key: "ai" }]), typeLabel: (key: string) => key, typeUnreadBadge: normalTypeBadge(count) });
      for (const option of sections) {
        expect(option.count).toBeUndefined();
        expect((option as { hasUnread: boolean }).hasUnread).toBe(count > 0);
      }
      for (const option of types) {
        expect(option.count).toBe(label || undefined);
        const html = await renderBadge(markup.segment, { option });
        if (!label) expect(html).toBe("");
        else expect(html.match(/<text[^>]*>([^<]*)<\/text>/)?.[1]).toBe(label);
      }
      const meEntry = expression<{ badge?: string }>(me, node => ts.isObjectLiteralExpression(node) && node.properties.some(prop => ts.isPropertyAssignment(prop) && prop.name.getText() === "key" && prop.initializer.getText() === '"messages"'), { t, messageUnread: unread, formatUnreadBadge });
      expect(meEntry.badge).toBe(label || undefined);
    });
  }
  for (const language of ["zh", "en", "vi"]) {
    it(`${language}: failed or missing support unread counts show a dash without hiding real zero`, async () => {
      for (const count of [undefined, null, Number.NaN, Infinity, -1, 0.5, 0, 1, 100]) {
        const invalid = !Number.isSafeInteger(count) || (count as number) < 0;
        for (const failed of [false, true]) {
          const serviceCheck = sourceFunction<(row: { unread: unknown; kind: string }) => boolean>(services, "unreadUnavailable", { conversations: { error: failed ? "read failed" : "", categoryAvailabilityStatus: "ready" } });
          for (const kind of ["advisor", "support"]) {
            const row = { unread: count, kind };
            const html = await renderBadge(markup.service, { row, unreadUnavailable: serviceCheck, formatUnreadBadge });
            const expected = invalid || failed ? "-" : formatUnreadBadge(count as number);
            expect(html.match(/<text[^>]*>([^<]*)<\/text>/)?.[1] || "").toBe(expected);
          }
          const conversationCheck = sourceFunction<(row: { unread: unknown; isAi: boolean }) => boolean>(conversations, "unreadUnavailable", { humanReadFailed: Vue.ref(failed) });
          const typeBadge = sourceFunction<(key: string) => string | undefined>(conversations, "typeUnreadBadge", { typeUnread: () => count, humanReadFailed: Vue.ref(failed), formatUnreadBadge });
          for (const isAi of [false, true]) {
            const r = { unread: count, isAi };
            const expected = invalid || failed && !isAi ? "-" : formatUnreadBadge(count as number);
            const html = await renderBadge(markup.conversation, { r, unreadUnavailable: conversationCheck, formatUnreadBadge });
            expect(html.match(/<text[^>]*>([^<]*)<\/text>/)?.[1] || "").toBe(expected);
            expect(typeBadge(isAi ? "ai" : "advisor") || "").toBe(expected);
          }
        }
      }
      const categoryFailed = sourceFunction<(row: { unread: number; kind: string }) => boolean>(services, "unreadUnavailable", { conversations: { categoryAvailabilityStatus: "failed" } });
      expect(categoryFailed({ unread: 0, kind: "advisor" })).toBe(true);
      expect(categoryFailed({ unread: 0, kind: "support" })).toBe(true);
      expect(computedValue<boolean>(conversations, "humanReadFailed", { convStore: { categoryAvailabilityStatus: "failed" } })).toBe(true);
      expect(services).toContain('@click="openRow(row)"');
      expect(conversations).toContain('@click="openRow(r)"');
    });
  }
  it('does not announce partial legacy category counts as account-wide numbers', () => {
    for (const exact of [false, true]) {
      const options = computedValue<Array<{ value: string; count?: number; hasUnread: boolean }>>(notifications, 'filterOptions', {
        visibleFilterIds: Vue.ref(['all', 'finance', 'device']), filterLabel: (value: string) => value,
        notifs: { unread: 111, unreadByCategory: { finance: 100, device: 0 }, unreadByCategoryExact: exact },
      });
      expect(options[0].count).toBeUndefined();
      expect(options[0].hasUnread).toBe(true);
      expect(options[1].hasUnread).toBe(true);
      expect(options[2].hasUnread).toBe(false);
      expect(options[1].count).toBeUndefined();
      expect(options[2].count).toBeUndefined();
    }
  });
});

it("does not display unknown actionable authority as zero", () => { expect(formatUnreadBadge(null)).toBe("—"); expect(formatUnreadBadge(0)).toBe(""); });
