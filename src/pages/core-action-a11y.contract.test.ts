import segments from "@/components/glass-segments.vue?raw";
import { describe, expect, it } from "vitest";

const pages = import.meta.glob(["./me/wallet-exchange.vue", "./team/agent.vue", "./earn/earn.vue", "./store/detail.vue", "./me/receipts.vue"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("core financial and ambassador controls", () => {
  it("declares keyboard and screen-reader semantics for every wallet exchange action", () => {
    const value = pages["./me/wallet-exchange.vue"] ?? "";
    for (const handler of ["goHowItWorks", "onRefresh", "setMax", "flip", "handleConfirm"]) {
      const tag = value.match(new RegExp(`<view[^>]*@click="${handler}"[^>]*>`, "s"))?.[0] ?? "";
      expect(tag, handler).toContain('role="button"');
      expect(tag, handler).toContain('tabindex="0"');
    }
  });

  it("makes the ambassador route and submit actions keyboard reachable", () => {
    const value = pages["./team/agent.vue"] ?? "";
    expect(value.match(/<view[^>]*@click="go\('\/pages\/team\/rank'\)"[^>]*>/s)?.[0]).toContain('role="button"');
    const submit = value.match(/<view[^>]*@click="submit"[^>]*>/s)?.[0] ?? "";
    expect(submit).toContain('role="button"');
    expect(submit).toContain('tabindex="0"');
    expect(submit).toContain(":aria-disabled=");
  });

  it.each([
    ["./earn/earn.vue", ["range = r", "taskPoolOpen = !taskPoolOpen", "openExplainer"]],
    ["./store/detail.vue", ["openTrustUrl(row.Url)", "refreshTrustMaterial"]],
    ["./me/receipts.vue", ["tab = c", "handleClearAll", "open = r"]],
  ] as const)("makes audited actions keyboard reachable in %s", (path, handlers) => {
    const value = pages[path] ?? "";
    for (const handler of handlers) {
      const marker = value.indexOf(`@click="${handler}"`);
      const stoppedMarker = value.indexOf(`@click.stop="${handler}"`);
      const click = marker >= 0 ? marker : stoppedMarker;
      const tag = click >= 0 ? value.slice(value.lastIndexOf("<", click), value.indexOf(">", click) + 1) : "";
      if (path === "./store/detail.vue" && handler === "openTrustUrl(row.Url)") {
        // A report navigates like a link: Enter activates, Space scrolls.
        // Missing/unsafe destinations are removed before rendering; linked
        // reports remain in the keyboard tab order and Enter opens them.
        expect(tag).toContain('role="link"');
        expect(value).toContain(".filter((row) => safeTrustUrl(row.Url))");
        expect(tag).toContain('tabindex="0"');
        expect(tag).toContain('@keydown.enter.prevent="openTrustUrl(row.Url)"');
        expect(tag).not.toContain('@keydown.space');
        continue;
      }
      if (handler === "range = r" || handler === "tab = c") {
        // These select one option and deselect the others. role="button"+aria-pressed
        // reads as a multi-select toggle, so they are radios/tabs with the state in
        // aria-checked/aria-selected instead. Either way the group is ONE Tab stop:
        // the selected item is 0 and the rest are -1 (roving tabindex, contract §2.3).
        expect(value).toMatch(new RegExp('<GlassSegments[^>]*v-model="' + (handler === 'range = r' ? 'range' : 'tab') + '"'));
        expect(segments).toContain(':aria-selected=');
        expect(segments).toContain(':aria-checked=');
        expect(segments).toMatch(/:tabindex="option.disabled \? -1 : [^\"]*option.value === modelValue \? 0 : -1"/);
    expect(segments).toContain('option.value === modelValue');
    expect(segments).toContain('@keydown="onKeydown($event, option)"');
    expect(segments).toContain('choose(target, "arrow")');
    expect(segments).toContain('?.focus()');
        continue;
      }
      expect(tag, handler).toContain('role="button"');
      expect(tag, handler).toContain('tabindex="0"');
    }
  });
});
