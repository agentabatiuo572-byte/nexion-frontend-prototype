import segments from "@/components/glass-segments.vue?raw";
import { describe, expect, it } from "vitest";
import source from "./notifications.vue?raw";
// @ts-expect-error Contract test runs in Node.
import { readFileSync } from "node:fs";
const styles = readFileSync(new URL("../../styles/message-center.css", import.meta.url), "utf8");
import chassis from "@/components/app-chassis.vue?raw";
import activation from "@/lib/a11y-activate?raw";

describe("notification foreground and clear-read accessibility", () => {
  it("refreshes server notifications whenever the page returns to foreground", () => {
    expect(source).toMatch(/import \{[^}]*onShow[^}]*onHide[^}]*onLoad[^}]*\} from "@dcloudio\/uni-app"/);
    expect(source).toMatch(/onShow\(\(\) => \{\s*if \(disposed\) return;\s*pageVisible = true;\s*void center.refresh\(\);/);
  });

  it("gives the clear-read action an accessible label, 44px target, and confirmation", () => {
    expect(source).toContain(':aria-label="t.notifs.clearReadAria"');
    expect(styles).toContain("min-height: 44px");
    expect(source).toContain("await uiConfirm({");
    expect(source).toContain("notifs.clearRead()");
  });

  it("keeps mark-all and notification rows keyboard-operable", () => {
    expect(source).toContain(':aria-label="t.notifs.markAll"');
    expect(source).toMatch(/role="button"[^>]*:tabindex="markingAll \? -1 : 0"[^>]*@click="markAll"/);
    expect(source).toMatch(/class="notification-row" role="button" tabindex="0"[^>]*@click="toggle\(n\)"/);
    expect(activation).toContain("Enter");
    expect(activation).toContain("click");
  });

  it("keeps filters, retry, and pagination keyboard-operable", () => {
    // 分类是**互斥**选择:必须暴露 radiogroup + 唯一 aria-checked + roving tabindex。
    // 原断言钉的是 role=button + aria-pressed,而浏览器把 aria-pressed 按钮当 toggle
    // button、读屏按复选框朗读 —— 用户以为能同时选多个分类(zentao #94)。判据改成
    // 单选语义,键盘可操作性(Enter/Space/方向键)一并守住。
    expect(source).toMatch(/<GlassSegments[^>]*:label="t.notifs.filterGroupLabel"[^>]*semantics="radio"[^>]*v-model="filter"[^>]*:options="filterOptions"/);
    expect(segments).toContain("'radiogroup'");
    expect(segments).toContain(':aria-checked=');
    expect(segments).toMatch(/:tabindex="option.disabled \? -1 : [^\"]*option.value === modelValue \? 0 : -1"/);
    expect(segments).toContain('option.value === modelValue');
    expect(segments).toContain('@keydown="onKeydown($event, option)"');
    expect(segments).toContain('choose(target, "arrow")');
    expect(segments).toContain('?.focus()');
    expect(source).toMatch(/role="button" tabindex="0"[^>]*@click="notifs.retryRemote\(\)"/);
    expect(source).toMatch(/role="button" :tabindex="notifs.loading \? -1 : 0"[^>]*@click="notifs.loadMoreRemote\(\)"/);
  });

  it("moves the roving focus over the same list it renders", () => {
    // 键盘按 filterIds 走、渲染按另一套判据走 → 焦点会落到没渲染的项上,roving
    // tabindex 随之丢失,整组再也进不去。两边必须共用 visibleFilterIds。
    expect(source).toContain("const visibleFilterIds = computed(");
    expect(source).toContain("visibleFilterIds.value.map(value =>");
    expect(source).toContain('const filterIds: Filter[] = ["all", "finance", "device", "team", "rewards", "system"]');
    expect(segments).toContain("props.options.filter");
  });
  it("opts only this page into a native scroll-view without altering normal chassis scrolling", () => {
    expect(chassis).toContain('<slot name="pageFixed" :top="contentTop + pendingBarInset" />');
    expect(chassis).toContain('<slot />');
    expect(source).toContain('<template #pageFixed="{ top }">');
    expect(source).toContain("top: top + 'px'");
    expect(source).toContain('@scroll="onMessageScroll"');
    expect(styles).toContain('min-height: 0');
    expect(source.indexOf('class="message-filters"')).toBeLessThan(source.indexOf('<scroll-view'));
  });
});
