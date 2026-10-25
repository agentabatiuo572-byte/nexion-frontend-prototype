import { baseParse, compile, type ElementNode, type TemplateChildNode } from "@vue/compiler-dom";
import { parse, compileStyle } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import source from "./notifications.vue?raw";
import settingsSource from "./preferences.vue?raw";
// @ts-expect-error Node is used only by the contract runner.
import { readFileSync } from "node:fs";
const pageStyles = readFileSync(new URL('../../styles/message-center.css', import.meta.url), 'utf8');

const descriptor = parse(source).descriptor;
const template = baseParse(descriptor.template!.content);
function elements(nodes: TemplateChildNode[]): ElementNode[] {
  return nodes.flatMap(node => node.type === 1 ? [node, ...elements(node.children)] : []);
}
const all = elements(template.children);
const attribute = (node: ElementNode, name: string) => node.props.find(prop => prop.type === 6 && prop.name === name);
const hasClass = (node: ElementNode, name: string) => {
  const prop = attribute(node, "class");
  return prop?.type === 6 && prop.value?.content.split(" ").includes(name);
};
const nav = all.find(node => hasClass(node, "message-nav"))!;
const heading = all.find(node => hasClass(node, "message-heading"))!;

// Evaluate the page's actual unread expression, preserving its full source count.
function unreadLabel(translations: typeof zh | typeof en | typeof vi, totalUnread: number): string {
  const ast = ts.createSourceFile("notifications.vue.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  let initializer: ts.Expression | undefined;
  function find(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "unreadLabel") initializer = node.initializer;
    ts.forEachChild(node, find);
  }
  find(ast);
  if (!initializer) throw new Error("Missing page unread expression");
  const code = ts.transpileModule(`const label = ${initializer.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function("computed", "center", "t", "fmt", code + ";return label.value;")(Vue.computed, { totalUnread, error: null, loading: false }, Vue.ref(translations), fmt) as string;
}
async function renderHeader(translations: typeof zh | typeof en | typeof vi, totalUnread: number, expanded = true, overrides: Record<string, unknown> = {}): Promise<string> {
  const code = compile(`<view>${nav.loc.source}${heading.loc.source}</view>`, { mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag) }).code;
  const render = new Function("Vue", code)(Vue) as Vue.RenderFunction;
  const app = Vue.createSSRApp({
    components: { LiquidGlass: { render: () => null } },
    setup: () => ({ t: translations, center: { totalUnread, error: null, loading: false, refresh: () => {} }, notifs: { unread: totalUnread }, markingAll: false, markAll: () => {}, section: 'notifications', headerState: { title: expanded }, unreadLabel: unreadLabel(translations, totalUnread), navBack: () => {}, navTo: () => {}, ...overrides }),
    render,
  });
  return renderToString(app);
}

describe("message page header content contract", () => {
  it("fits both short category rails to their content while keeping long rails scrollable", () => {
    const filters = all.filter(node => hasClass(node, "message-filters"));
    expect(filters).toHaveLength(2);
    expect(filters.map(node => node.tag)).toEqual(["GlassSegments", "GlassSegments"]);
    expect(filters.map(node => node.props.find(prop => prop.type === 7 && prop.name === "model")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ exp: expect.objectContaining({ content: "serviceFilter" }) }),
        expect.objectContaining({ exp: expect.objectContaining({ content: "filter" }) }),
      ]));
    for (const filter of filters) {
      expect(attribute(filter, "layout")).toMatchObject({ value: { content: "scroll" } });
      expect(elements(filter.children).filter(node => hasClass(node, "message-category-dot"))).toHaveLength(1);
    }
    const styles = descriptor.styles.map(style => style.content).join("\n");
    const rail = styles.match(/\.message-center \.message-filters\s*\{([^}]+)\}/)?.[1];
    expect(rail).toBeDefined();
    expect(rail).toMatch(/align-self:\s*flex-start\s*;/);
    expect(rail).toMatch(/width:\s*fit-content\s*;/);
    expect(rail).toMatch(/max-width:\s*100%\s*;/);
    expect(rail).toMatch(/box-sizing:\s*border-box\s*;/);
    const dot = [...styles.matchAll(/\.message-category-dot\s*\{([^}]+)\}/g)].map(match => match[1]).join('\n');
    expect(dot).toMatch(/align-self:\s*center\s*;/);
    expect(dot).toMatch(/flex-shrink:\s*0\s*;/);
  });

  it("places one accessible page heading below navigation, with summary actions on one row", () => {
    const children = nav.children.filter((node): node is ElementNode => node.type === 1);
    expect(children).toHaveLength(2);
    expect(children[0].loc.source).toContain("navBack('/pages/me/me')");
    expect(children[1].loc.source).toContain("navTo('/pages/me/preferences')");
    const titles = all.filter(node => hasClass(node, "message-title"));
    expect(titles).toHaveLength(1);
    expect(elements(heading.children)).toContain(titles[0]);
    expect(titles[0].loc.source).toContain('role="heading"');
    expect(titles[0].loc.source).toContain('aria-level="1"');
    expect(nav.loc.source).not.toContain("drawerTitle");
    expect(heading.loc.source).toContain("unreadLabel");
  });

  for (const [language, translations] of [["zh", zh], ["en", en], ["vi", vi]] as const) {
    it(`${language}: retains translated title/actions and the real 298 unread count`, async () => {
      const html = await renderHeader(translations, 298);
      expect(html).toContain(translations.notifs.drawerTitle);
      expect(html).toContain(`aria-label="${translations.profile.back}"`);
      expect(html).toContain(`aria-label="${translations.notifs.preferences}"`);
      expect(html).toContain(fmt(translations.notifs.unreadCount, { n: 298 }));
      expect(unreadLabel(translations, 298)).not.toContain("99");
    });
  }

  it("leaves the existing collapsed-header state in control of the heading", async () => {
    const title = all.find(node => hasClass(node, "message-title"))!;
    expect(title.loc.source).toContain("'message-title--hidden': !headerState.title");
    expect(title.loc.source).toContain(':aria-hidden="!headerState.title"');
    const compact = all.find(node => hasClass(node, "message-compact"))!;
    expect(compact.loc.source).toContain("'message-compact--visible': !headerState.title");
    expect(compact.loc.source).toContain(':aria-hidden="headerState.title"');
    expect(compact.props.some(prop => prop.type === 7 && ["if", "show"].includes(prop.name))).toBe(false);
    const html = await renderHeader(zh, 298, false);
    const titleMarkup = html.match(/<text[^>]*role="heading"[^>]*>/)?.[0];
    expect(titleMarkup).toContain("message-title--hidden");
    expect(titleMarkup).toContain('aria-hidden="true"');
    expect(titleMarkup).not.toContain("display:none");
  });

  it("shows the collapsed heading as plain text without an action or glass background", () => {
    const compact = all.find(node => hasClass(node, "message-compact"))!;
    expect(elements(compact.children).map(node => node.tag)).toEqual(["text"]);
    expect(attribute(compact, "role")).toBeUndefined();
    expect(attribute(compact, "tabindex")).toBeUndefined();
    expect(compact.props.some(prop => prop.type === 7 && prop.name === "on")).toBe(false);
    expect(source).not.toContain("revealSections");
  });

  it("keeps mark-all beside the count and bulk cleanup reachable in the feed and settings", async () => {
    const clear = all.find(node => hasClass(node, 'message-mark-all'))!;
    expect(source).not.toContain('message-secondary-actions');
    const management = all.find(node => hasClass(node, 'notification-management'))!;
    expect(management.loc.source).toContain('@click="confirmClearRead"');
    expect(management.loc.source).toContain('LiquidGlass');
    expect(elements(heading.children)).not.toContain(management);
    expect(nav.loc.source).toContain("navTo('/pages/me/preferences')");
    expect(settingsSource).toContain('@click="confirmClearRead"');
    expect(settingsSource).toContain(':aria-label="t.notifs.clearReadAria"');
    expect(elements(heading.children)).toContain(clear);
    expect(clear.loc.source).not.toContain('LiquidGlass');
    expect(clear.loc.source).toContain('@click="markAll"');
    expect(clear.loc.source).toContain('headerState.title && !markingAll ? 0 : -1');
    const wrapper = all.find(node => node.children.includes(heading))!;
    expect(wrapper.loc.source).toContain(':inert="!headerState.title ? true : undefined"');
    expect(wrapper.loc.source).toContain('@focusin="headerFocused = true"');
    const collapsed = await renderHeader(zh, 298, false);
    expect(collapsed).toMatch(/class="message-button message-mark-all"[^>]*tabindex="-1"/);
    const status = elements(heading.children).find(node => attribute(node, 'role')?.type === 6 && (attribute(node, 'role') as { value?: { content: string } }).value?.content === 'status')!;
    expect(elements(status.children)).not.toContain(clear);
  });

  it("keeps the real unread summary while hiding unavailable batch actions", async () => {
    const service = await renderHeader(zh, 298, true, { section: 'service' });
    expect(service).toContain(fmt(zh.notifs.unreadCount, { n: 298 }));
    expect(service).not.toContain('message-mark-all');
    const read = await renderHeader(zh, 0);
    expect(read).toContain(zh.notifs.allCaughtUp); expect(read).not.toContain('message-mark-all');
    const busy = await renderHeader(zh, 298, true, { markingAll: true });
    expect(busy).toMatch(/class="message-button message-mark-all"[^>]*tabindex="-1"[^>]*aria-disabled="true"/);
  });

  it("retains the summary's independent retry and does not disguise failed counts as all read", async () => {
    const failed = await renderHeader(zh, 0, true, { center: { totalUnread: 0, error: 'failed', loading: false, refresh() {} }, unreadLabel: zh.notifs.unreadUnavailable });
    expect(failed).toContain('message-summary-recovery'); expect(failed).toContain(zh.ui.retry);
    expect(failed).not.toContain(zh.notifs.allCaughtUp);
    expect(source).toContain('@click="center.refresh()"');
    expect(source).toContain('@click="notifs.retryRemote()"');
  });

  it("matches the reference glass highlights without painting over the category label or dot", () => {
    const scoped = descriptor.styles.find(style => style.scoped)!.content;
    const compiled = compileStyle({ source: scoped, filename: 'notifications.vue', id: 'data-v-message-check', scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('.nx-glass-option--selected::before');
    const highlight = scoped.match(/\.nx-glass-option--selected::before\)\s*\{([^}]+)\}/)![1];
    expect(highlight).toContain('inset: 5px 0'); expect(highlight).toContain('z-index: 0');
    expect(highlight).toContain('pointer-events: none');
    expect(highlight).toContain('var(--message-glass-fill)');
    expect(highlight).toContain('var(--message-glass-shadow)');
    expect(scoped).toMatch(/\.message-option-label, \.message-category-dot\s*\{[^}]*z-index:\s*1/);
    expect(pageStyles).toContain('--message-glass-white: #fff');
    expect(pageStyles).toContain('--message-selected-highlight: #E6FFA0');
    expect(pageStyles).toContain('inset 0 1px 0 color-mix(in srgb, var(--message-glass-white) 42%');
    expect(scoped).toContain('inset 0 1px 0 color-mix(in srgb, var(--message-selected-highlight) 55%');
    expect(scoped).toContain('inset 0 -1px 2px');
  });

  it("uses natural line boxes for category/date alignment without position compensation", () => {
    const scoped = descriptor.styles.find(style => style.scoped)!.content;
    const category = scoped.match(/\.message-filters :deep\(\.nx-glass-option\)\s*\{([^}]+)\}/)![1];
    const date = pageStyles.match(/\.notification-date\s*\{([^}]+)\}/)![1];
    for (const rule of [category, date]) {
      expect(rule).toContain('line-height: normal'); expect(rule).not.toMatch(/transform|translate|top:/);
    }
    expect(category).toContain('height: 44px'); expect(date).toContain('margin: 18px 2px 2px');
    expect(source + pageStyles + settingsSource).not.toMatch(/#(?:0F131B|171B24|232938|121722|0D1017)\b/i);
  });
});
