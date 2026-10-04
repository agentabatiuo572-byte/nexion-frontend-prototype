import { afterEach, describe, expect, it, vi } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import type { TicketMessage } from "@/domain/support";
import { formatJoinedDate } from "@/lib/profile-date";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import source from "./ticket-message.vue?raw";

const descriptor = parse(source).descriptor;
const script = ts.transpileModule(descriptor.scriptSetup!.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue) as Vue.RenderFunction;
const scopes: Vue.EffectScope[] = [];
const longBody = "Original message with preserved whitespace.\n".repeat(6);
const validTimestamp = new Date(2026, 9, 3, 12, 34).getTime();
type Translations = typeof zh | typeof en | typeof vietnamese;
interface RecordState {
  expanded: Vue.Ref<boolean>;
  foldable: Vue.ComputedRef<boolean>;
  bodyId: Vue.ComputedRef<string>;
  authorLabel: Vue.ComputedRef<string>;
  dateLabel: Vue.ComputedRef<string>;
  timeLabel: Vue.ComputedRef<string>;
  toggle: () => Promise<void>;
}

function mount(message: Partial<TicketMessage> = {}, translations: Translations = zh, code = "zh") {
  const props = Vue.reactive({
    message: { id: "message:1", ts: validTimestamp, author: "agent", body: "Short answer", ...message } as TicketMessage,
    scope: "user:1:ticket/1", showDate: true,
  });
  const t = Vue.ref(translations), locale = Vue.reactive({ code });
  const modules: Record<string, unknown> = {
    vue: Vue, "@/components/liquid-glass.vue": {},
    "@/i18n/use-t": { useT: () => t }, "@/store/locale": { useLocaleStore: () => locale },
    "@/lib/profile-date": { formatJoinedDate },
  };
  const scope = Vue.effectScope(); scopes.push(scope);
  const state = scope.run(() => new Function("require", "exports", "defineProps", script +
    ";return { expanded, foldable, bodyId, authorLabel, dateLabel, timeLabel, toggle };")(
      (name: string) => {
        if (!(name in modules)) throw new Error(`Unexpected ticket record dependency: ${name}`);
        return modules[name];
      }, {}, () => props,
    )) as RecordState;
  return { props, state, locale, t, html: () => renderToString(Vue.createSSRApp({
    components: { LiquidGlass: { render: () => null } }, setup: () => ({ ...props, ...state, t }), render,
  })) };
}

afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });

describe("ticket timeline message behavior", () => {
  it.each([
    ["empty", "", false], ["short", "Short answer", false],
    ["160 characters", "x".repeat(160), false], ["four lines", "1\n2\n3\n4", false],
    ["161 characters", "x".repeat(161), true], ["five lines", "1\n2\n3\n4\n5", true],
  ] as const)("uses a disclosure only for %s messages that need it", async (_name, body, expected) => {
    const h = mount({ body });
    expect(h.state.foldable.value).toBe(expected);
    expect(h.state.expanded.value).toBe(false);
    const html = await h.html();
    expect(html.includes('class="family-control ticket-record-toggle"')).toBe(expected);
    expect(html.includes("ticket-record-body--preview")).toBe(expected);
  });

  it("expands and collapses twice without replacing or shortening the original text", async () => {
    const h = mount({ body: longBody });
    expect(await h.html()).toContain('aria-expanded="false"');
    for (let cycle = 0; cycle < 2; cycle++) {
      await h.state.toggle();
      expect(h.state.expanded.value).toBe(true);
      const expandedHtml = await h.html();
      expect(expandedHtml).toContain('aria-expanded="true"');
      expect(expandedHtml).toContain(zh.tickets.detail.collapseMessage);
      expect(expandedHtml).not.toContain("ticket-record-body--preview");
      await h.state.toggle();
      expect(h.state.expanded.value).toBe(false);
      expect(await h.html()).toContain(zh.tickets.detail.expandMessage);
      expect(h.props.message.body).toBe(longBody);
    }
  });

  it.each(["scope", "id", "body"] as const)("resets disclosure when %s changes", async field => {
    const h = mount({ body: longBody }); await h.state.toggle();
    expect(h.state.expanded.value).toBe(true);
    if (field === "scope") h.props.scope = "user:2:ticket/2";
    else if (field === "id") h.props.message.id = "message:2";
    else h.props.message.body = longBody + "Changed message";
    await Vue.nextTick();
    expect(h.state.expanded.value).toBe(false);
    expect(await h.html()).toContain('aria-expanded="false"');
  });

  it("keeps the disclosure linked to an account and message specific body ID", async () => {
    const h = mount({ body: longBody, id: 'message/1?"' });
    const previousId = h.state.bodyId.value;
    expect(previousId).toContain(encodeURIComponent(h.props.scope));
    expect(previousId).toContain(encodeURIComponent(h.props.message.id));
    expect(await h.html()).toContain(`aria-controls="${previousId}"`);
    h.props.scope = "user:2:ticket/1";
    expect(h.state.bodyId.value).not.toBe(previousId);
  });

  for (const [code, translations] of [["zh", zh], ["en", en], ["vi", vietnamese]] as const) {
    it(`${code}: identifies the customer and preserves only a nonblank public agent name`, async () => {
      const h = mount({ author: "user", agentName: "Ignored agent name" }, translations, code);
      expect(h.state.authorLabel.value).toBe(translations.tickets.detail.youLabel);
      h.props.message.author = "agent"; h.props.message.agentName = "  Support One  ";
      expect(h.state.authorLabel.value).toBe("Support One");
      for (const value of ["", "   ", undefined]) {
        h.props.message.agentName = value;
        expect(h.state.authorLabel.value).toBe(translations.tickets.detail.agentFallback);
        expect(await h.html()).toContain(translations.tickets.detail.agentFallback);
      }
    });
  }

  it("renders hostile-looking message content as text instead of HTML", async () => {
    const body = '<script>alert("body")</script><img src=x onerror="alert(1)">';
    const h = mount({ body });
    const html = await h.html();
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<img");
    expect(descriptor.template!.content).not.toContain("v-html");
    expect(h.props.message.body).toBe(body);
  });

  it("formats valid dates in the active language and hides an unneeded date separator", async () => {
    const h = mount();
    expect(h.state.timeLabel.value).toBe("12:34");
    expect(h.state.dateLabel.value).toBe("2026/10/03");
    h.locale.code = "en"; expect(h.state.dateLabel.value).toBe("Oct 3, 2026");
    h.locale.code = "vi"; expect(h.state.dateLabel.value).toBe("3 thg 10, 2026");
    expect(await h.html()).toContain('class="ticket-record-date"');
    h.props.showDate = false;
    expect(await h.html()).not.toContain('class="ticket-record-date"');
  });

  it.each([0, -1, NaN, Infinity, 9e15])("uses a neutral date/time for invalid timestamp %s", timestamp => {
    const h = mount({ ts: timestamp });
    expect(h.state.dateLabel.value).toBe("—"); expect(h.state.timeLabel.value).toBe("—");
  });

  it("can open and close without document or HTMLElement globals", async () => {
    vi.stubGlobal("document", undefined); vi.stubGlobal("HTMLElement", undefined);
    const h = mount({ body: longBody });
    await expect(h.state.toggle()).resolves.toBeUndefined();
    await expect(h.state.toggle()).resolves.toBeUndefined();
    expect(h.state.expanded.value).toBe(false);
    expect(h.props.message.body).toBe(longBody);
  });
});
