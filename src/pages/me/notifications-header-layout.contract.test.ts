import { baseParse, compile, type ElementNode, type TemplateChildNode } from "@vue/compiler-dom";
import { parse, compileStyle } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { fmt } from "@/i18n/format";
import { notificationActionsCopy } from "@/i18n/notification-actions";
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
function unreadLabel(translations: typeof zh | typeof en | typeof vi, totalUnread: number, error: string | null = null): string {
  const ast = ts.createSourceFile("notifications.vue.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  let initializer: ts.Expression | undefined;
  function find(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "unreadLabel") initializer = node.initializer;
    ts.forEachChild(node, find);
  }
  find(ast);
  if (!initializer) throw new Error("Missing page unread expression");
  const code = ts.transpileModule(`const label = ${initializer.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function("computed", "center", "t", "fmt", code + ";return label.value;")(Vue.computed, { totalUnread, error, loading: false }, Vue.ref(translations), fmt) as string;
}
async function renderHeader(translations: typeof zh | typeof en | typeof vi, totalUnread: number, expanded = true, overrides: Record<string, unknown> = {}): Promise<string> {
  const code = compile(`<view>${nav.loc.source}${heading.loc.source}</view>`, { mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag) }).code;
  const render = new Function("Vue", code)(Vue) as Vue.RenderFunction;
  const app = Vue.createSSRApp({
    components: { LiquidGlass: { render: () => null } },
    setup: () => {
      const copy = notificationActionsCopy[translations === zh ? 'zh' : translations === en ? 'en' : 'vi'];
      const context = { t: translations, actionCopy: copy, center: { totalUnread, error: null, loading: false, refresh: () => {} }, notifs: { unread: totalUnread }, markingAll: false, clearingRead: false, markAll: () => {}, section: 'notifications', headerState: { title: expanded }, unreadLabel: unreadLabel(translations, totalUnread), navBack: () => {}, navTo: () => {}, ...overrides };
      return { ...context, ...recoveryBindings(context.center, Vue.ref(context.section), Vue.reactive({ realtimeFallback: overrides.liveFallback === true, categoryLoading: false, stopRealtime() {}, startRealtime() {} }), copy) };
    },
    render,
  });
  return renderToString(app);
}

function recoveryBindings(center: any, section: Vue.Ref<string>, conversations: any, copy = notificationActionsCopy.zh, visible = true, disposed = false) {
  const ast = ts.createSourceFile('page.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  const names = new Set(['summaryRecovery', 'retrySummary']);
  const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text ?? '')
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(ast))));
  const code = ts.transpileModule(nodes.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('computed', 'center', 'section', 'conversations', 'actionCopy', 'pageVisible', 'disposed', code + ';return { summaryRecovery, retrySummary };')(
    Vue.computed, center, section, conversations, Vue.ref(copy), visible, disposed);
}

describe("message page header content contract", () => {
  it("fits the notification category rail to its content and leaves the service section without one", () => {
    const filters = all.filter(node => hasClass(node, "message-filters"));
    expect(filters).toHaveLength(1);
    expect(filters.map(node => node.tag)).toEqual(["GlassSegments"]);
    expect(filters.map(node => node.props.find(prop => prop.type === 7 && prop.name === "model")))
      .toEqual([expect.objectContaining({ exp: expect.objectContaining({ content: "filter" }) })]);
    expect(filters[0].props.find(prop => prop.type === 7 && prop.name === "if")).toMatchObject({ exp: { content: "section !== 'service'" } });
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
    expect(children).toHaveLength(3);
    expect(children[0].loc.source).toContain("navBack('/pages/me/me')");
    expect(children[2].loc.source).toContain("navTo('/pages/me/preferences')");
    expect(children[1].loc.source).toContain('message-summary-recovery');
    expect(children[1].loc.source).toContain('@click="retrySummary"');
    const titles = all.filter(node => hasClass(node, "message-title"));
    expect(titles).toHaveLength(1);
    expect(elements(heading.children)).toContain(titles[0]);
    expect(titles[0].loc.source).toContain('role="heading"');
    expect(titles[0].loc.source).toContain('aria-level="1"');
    const recoveryTitle = all.find(node => hasClass(node, 'message-recovery-title'))!;
    expect(recoveryTitle.loc.source).toContain('v-if="!headerState.title"');
    expect(recoveryTitle.loc.source).toContain('role="heading"');
    expect(nav.loc.source).toContain(recoveryTitle.loc.source);
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
    expect(compact.props.find(prop => prop.type === 7 && prop.name === 'if')).toMatchObject({ exp: { content: '!summaryRecovery.visible' } });
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
    expect(clear.loc.source).toContain('headerState.title && !markingAll && !clearingRead ? 0 : -1');
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
    expect(source).toContain('void center.refresh();');
    expect(source).toContain('@click="notifs.retryRemote()"');
  });

  it.each([[zh, '更新失败'], [en, 'Update failed'], [vi, 'Làm mới thất bại']] as const)(
    "keeps a visible failure and direct retry in fixed navigation, outside the collapsible heading", async (copy, failure) => {
      const failed = await renderHeader(copy, 0, false, {
        center: { totalUnread: 0, error: 'failed', loading: false, refresh() {} }, unreadLabel: copy.notifs.unreadUnavailable,
      });
      expect(failed).toContain(failure); expect(failed).toContain(copy.ui.retry);
      expect(nav.loc.source).toContain('role="alert"');
      expect(all.find(node => hasClass(node, 'message-compact'))!.loc.source).toContain('v-if="!summaryRecovery.visible"');
      expect(heading.loc.source).not.toContain('message-summary-recovery');
      expect(failed).not.toContain(copy.notifs.allCaughtUp);
    });

  it("keeps notification failure details after selected rows while retaining their retry", () => {
    const feed = all.find(node => hasClass(node, 'notification-feed'))!;
    const children = feed.children.filter((node): node is ElementNode => node.type === 1);
    const error = children.findIndex(node => attribute(node, 'data-testid')?.type === 6);
    const rows = children.findIndex(node => hasClass(node, 'notification-item'));
    expect(error).toBeGreaterThan(rows);
    expect(children[error].loc.source).toContain('role="alert"');
    expect(children[error].loc.source).toContain('@click="notifs.retryRemote()"');
  });

  it("executes the actual fixed-nav retry for pointer and keyboard without claiming unavailable unread is zero", () => {
    let calls = 0;
    const center = Vue.reactive({ error: 'offline', loading: false, refresh() { calls++; } });
    const code = compile(nav.loc.source, { mode: 'function', prefixIdentifiers: true,
      isCustomElement: tag => ['view', 'text'].includes(tag) }).code;
    const render = new Function('Vue', code)({ ...Vue, resolveComponent: () => ({ render: () => null }) });
    const context = Vue.proxyRefs({ center, t: zh, actionCopy: notificationActionsCopy.zh, headerState: { title: false }, navBack() {}, navTo() {},
      ...recoveryBindings(center, Vue.ref('service'), Vue.reactive({ realtimeFallback: false, categoryLoading: false, stopRealtime() {}, startRealtime() {} })) });
    const nodes = (node: Vue.VNode): Vue.VNode[] => [node, ...(Array.isArray(node.children) ? node.children.filter(Vue.isVNode).flatMap(nodes) : [])];
    const retry = () => nodes(render(context, [])).find(node => node.props?.['aria-label'] === '更新失败 · ' + zh.ui.retry)!;
    retry().props!.onClick();
    for (const handler of retry().props!.onKeydown) handler({ key: 'Enter', preventDefault() {} });
    expect(calls).toBe(2);
    center.loading = true;
    expect(retry().props!.tabindex).toBe(-1); expect(retry().props!['aria-disabled']).toBe(true);
    expect(unreadLabel(zh, 0, 'offline')).toBe(zh.notifs.unreadUnavailable);
  });

  it('limits live degradation to Service and preserves current busy, read-error priority and reconnect retry', () => {
    const calls: string[] = [];
    const center = Vue.reactive({ error: null as string | null, loading: false, refresh() { calls.push('refresh'); } });
    const conversations = Vue.reactive({ realtimeFallback: true, categoryLoading: false,
      stopRealtime() { calls.push('stop'); }, startRealtime() { calls.push('start'); } });
    const section = Vue.ref('notifications'), view = recoveryBindings(center, section, conversations);
    expect(view.summaryRecovery.value.visible).toBe(false);
    section.value = 'service'; expect(view.summaryRecovery.value.visible).toBe(true);
    expect(view.summaryRecovery.value.label).toBe(notificationActionsCopy.zh.liveUnavailable);
    conversations.categoryLoading = true; view.retrySummary(); expect(calls).toEqual([]);
    conversations.categoryLoading = false; view.retrySummary(); expect(calls).toEqual(['stop', 'start', 'refresh']);
    center.error = 'offline'; expect(view.summaryRecovery.value.label).toBe(notificationActionsCopy.zh.refreshFailed);
    center.loading = true; view.retrySummary(); expect(calls).toHaveLength(3);
    center.loading = false; section.value = 'notifications'; view.retrySummary();
    expect(calls).toEqual(['stop', 'start', 'refresh', 'refresh']);
    center.error = null; expect(view.summaryRecovery.value.visible).toBe(false);
    section.value = 'service'; conversations.realtimeFallback = false;
    expect(view.summaryRecovery.value.visible).toBe(false);
  });

  it.each([[zh, 'zh'], [en, 'en'], [vi, 'vi']] as const)('keeps the localized live warning reachable in the collapsed Service nav', async (copy, language) => {
    const service = await renderHeader(copy, 0, false, { section: 'service', liveFallback: true });
    expect(service).toContain(notificationActionsCopy[language].liveUnavailable);
    expect(service).toContain(copy.ui.retry);
    const notifications = await renderHeader(copy, 0, false, { section: 'notifications', liveFallback: true });
    expect(notifications).not.toContain(notificationActionsCopy[language].liveUnavailable);
  });

  it.each(['hidden', 'disposed'])('cannot reconnect from an old %s page action', boundary => {
    const calls: string[] = [];
    const view = recoveryBindings({ error: null, loading: false, refresh() { calls.push('refresh'); } }, Vue.ref('service'),
      { realtimeFallback: true, categoryLoading: false, stopRealtime() { calls.push('stop'); }, startRealtime() { calls.push('start'); } },
      notificationActionsCopy.zh, boundary !== 'hidden', boundary === 'disposed');
    view.retrySummary(); expect(calls).toEqual([]);
  });

  it("uses one glass track with a flat selection and keeps the category indicator free to move", () => {
    const scoped = descriptor.styles.find(style => style.scoped)!.content;
    const compiled = compileStyle({ source: scoped, filename: 'notifications.vue', id: 'data-v-message-check', scoped: true });
    expect(compiled.errors).toEqual([]);
    const primary = all.find(node => hasClass(node, 'message-primary'))!;
    expect(attribute(primary, 'surface')).toMatchObject({ value: { content: 'glass' } });
    expect(attribute(primary, 'selection')).toMatchObject({ value: { content: 'flat' } });
    expect(scoped).not.toContain('.nx-glass-option--selected::before');
    const indicator = scoped.match(/\.message-filters :deep\(\.nx-glass-indicator\)\s*\{([^}]+)\}/)![1];
    expect(indicator).not.toMatch(/display:\s*none|visibility:\s*hidden|transform:/);
    expect(scoped).toMatch(/\.message-option-label, \.message-category-dot\s*\{[^}]*z-index:\s*1/);
  });

  it("uses natural line boxes for category/date alignment without position compensation", () => {
    const scoped = descriptor.styles.find(style => style.scoped)!.content;
    const category = scoped.match(/\.message-filters :deep\(\.nx-glass-option\)\s*\{([^}]+)\}/)![1];
    const date = pageStyles.match(/\.notification-date\s*\{([^}]+)\}/)![1];
    expect(category).toContain('line-height: normal');
    expect(date).toContain('line-height: var(--ui-type-message-meta-lh)');
    expect(date).toContain('font-size: var(--ui-type-message-meta)');
    for (const rule of [category, date]) expect(rule).not.toMatch(/transform|translate|top:/);
    expect(category).toContain('height: 44px'); expect(date).toContain('margin: 18px 2px 2px');
    expect(source + pageStyles + settingsSource).not.toMatch(/#(?:0F131B|171B24|232938|121722|0D1017)\b/i);
  });
});
