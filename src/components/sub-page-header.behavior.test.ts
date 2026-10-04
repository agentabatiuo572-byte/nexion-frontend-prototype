import { describe, expect, it } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import source from "./sub-page-header.vue?raw";

const template = parse(source).descriptor.template!.content;
const render = new Function("Vue", compile(template, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue) as Vue.RenderFunction;

async function header(plain = false, actionLabel?: string) {
  return renderToString(Vue.createSSRApp({
    components: { LiquidGlass: Vue.defineComponent({
      props: { radius: { type: Number, required: true } },
      setup: props => () => Vue.h("i", { "data-glass-radius": props.radius }),
    }) },
    setup: () => ({
      plain, actionLabel, action: actionLabel ? () => {} : undefined,
      statusBarHeight: 44, pendingBarInset: 60, rowH: 44,
      displayTitle: "Wallet", subtitle: undefined, unread: 3,
      t: { profile: { back: "Back" }, notifs: { drawerTitle: "Messages" } },
      goBack: () => {}, goBell: () => {}, onKeyboardActivate: () => {},
    }), render,
  }));
}

describe("independent sub-page header controls", () => {
  it("renders a glass surface for each control and none around the title", async () => {
    const html = await header();
    expect(html.match(/data-glass-radius="18"/g)).toHaveLength(2);
    expect(html).toMatch(/class="spv-glass"><i data-glass-radius="18"/);
    expect(html).toMatch(/class="spv-titlewrap"><text class="spv-title">Wallet/);
    expect(html).toContain('aria-label="Messages · 3"');
  });

  it("keeps the plain variant's round back control and no message bell", async () => {
    const html = await header(true);
    expect(html).toContain('data-glass-radius="22"');
    expect(html).not.toContain("spv-bell");
    expect(html.match(/data-glass-radius=/g)).toHaveLength(1);
  });

  it("keeps the ticket action separate and replaces the bell", async () => {
    const html = await header(true, "Details");
    expect(html).toContain('class="spv-action"');
    expect(html).toContain('aria-label="Details"');
    expect(html).not.toContain("spv-bell");
    expect(html.match(/data-glass-radius=/g)).toHaveLength(2);
  });
});
