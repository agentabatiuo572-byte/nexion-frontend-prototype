import { notificationCategory } from "@/lib/notification-category";
import { advanceMessageHeader, createMessageHeaderState } from "@/lib/message-header-scroll";
import ts from "typescript";
import * as vue from "vue";
import { describe, expect, it, vi } from "vitest";
import source from "./notifications.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { fmt } from "@/i18n/format";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";

// Execute the actual page worker; evaluate the actual template bindings below.
// No user notification or backend state is changed by these fixtures.
function mountPage() {
  const notifs = vue.reactive({
    items: [{ id: "team-read", kind: "team", readAt: 1 }, { id: "system-unread", kind: "system", readAt: null as number | null }],
    error: null as string | null, loading: false, nextCursor: null as string | null,
    clearRead: vi.fn(async () => { notifs.items = notifs.items.filter(item => !item.readAt); }),
    refreshRemote: vi.fn(),
  });
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const output = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const modules: Record<string, unknown> = {
    vue: { ...vue, inject: (_key: unknown, fallback: unknown) => fallback, onMounted: vi.fn(), onUnmounted: vi.fn(), watch: vi.fn() },
    "@dcloudio/uni-app": { onResize: vi.fn(), onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn() },
    "@/lib/remote-account-epoch": { remoteAccountScope: createRemoteAccountEpoch("fixture") },
    "@/lib/notification-category": { notificationCategory },
    "@/lib/message-header-scroll": { advanceMessageHeader, createMessageHeaderState },
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 },
    "@/store/pending-checkout-core": { PENDING_BAR_INSET_KEY: Symbol() },
    "@/i18n/use-t": { useT: () => vue.ref(zh) },
    "@/i18n/format": { fmt },
    "@/lib/unread-badge": { formatUnreadBadge },
    "@/store/notifications": { useNotifications: () => notifs },
    "@/store/message-drawer": { useMessageDrawer: () => vue.reactive({ section: "notifications", totalUnread: 1, serviceUnread: 0, refresh: () => notifs.refreshRemote() }) },
    "@/lib/route": { navTo: vi.fn() },
    "@/api/runtime": { remoteApiEnabled: true },
    "@/lib/notification-swipe": { isLeftConversionSwipe: vi.fn() },
    "@/store/ui": { confirm: async () => true, useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/store/app": { useApp: () => ({ accountKey: "fixture", accountBindingEpoch: 0 }) },
  };
  const page = new Function("require", "exports", output + ";return { t, notifs, filter, filtered, countOf, filterLabel, emptyTitle, confirmClearRead, visibleFilterIds };")(
    (name: string) => {
      if (name.endsWith(".vue")) return {};
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    }, {},
  );
  return { page, notifs };
}

function evaluateBinding(expression: string, values: Record<string, unknown>) {
  return new Function("values", `with (values) { return (${expression}); }`)(values);
}

describe("notification empty-state context", () => {
  for (const [name, template] of [["page", source]]) {
    it(`${name} never reports all read while the unread snapshot is unavailable`, () => {
      const expression = template.match(/const unreadLabel = computed\(\(\) => (.+)\);/)![1];
      const center = { totalUnread: 0, error: "offline" as string | null, loading: false };
      const label = () => evaluateBinding(expression, { center, t: { value: zh }, fmt });
      expect(label()).toBe(zh.notifs.unreadUnavailable);
      center.error = null;
      center.loading = true;
      expect(label()).toBe("-");
      center.totalUnread = 3;
      expect(label()).toBe(fmt(zh.notifs.unreadCount, { n: 3 }));
      center.totalUnread = 0;
      center.loading = false;
      expect(label()).toBe(zh.notifs.allCaughtUp);
    });
  }
  for (const [name, template] of [["page", source]]) {
    it(`${name} waits for the remaining cursor before declaring the selected category empty`, () => {
      const { page, notifs } = mountPage();
      page.filter.value = "team";
      // A refresh/account rebind can replace the loaded later-page category
      // with a first page of other kinds while the selected filter remains.
      notifs.items = [{ id: "first-page-system", kind: "system", readAt: null }];
      notifs.nextCursor = "older-page";
      const condition = template.match(/<EmptyState[^>]*v-if="([^\"]+)"/)![1];
      expect(evaluateBinding(condition, vue.proxyRefs(page))).toBe(false);
      const partial = template.match(/v-if="([^\"]+)"[^>]*role="status"/)![1];
      expect(Boolean(evaluateBinding(partial, vue.proxyRefs(page)))).toBe(true);
      notifs.loading = true;
      expect(Boolean(evaluateBinding(partial, vue.proxyRefs(page)))).toBe(false);
      notifs.loading = false;
      notifs.error = "read failed";
      expect(Boolean(evaluateBinding(partial, vue.proxyRefs(page)))).toBe(false);
      notifs.error = null;
      notifs.nextCursor = null;
      expect(evaluateBinding(condition, vue.proxyRefs(page))).toBe(true);
      expect(Boolean(evaluateBinding(partial, vue.proxyRefs(page)))).toBe(false);
    });
  }
  it("keeps the selected category visible after clearing its last read notification", async () => {
    const { page } = mountPage();
    page.filter.value = "team";
    await page.confirmClearRead();
    expect(page.filtered.value).toHaveLength(0);
    expect(page.notifs.items).toHaveLength(1);
    // 断言行为而非模板文本:清空「team」最后一条已读后,该分类必须仍在可见清单里,
    // 否则用户既看不到自己选中的分类,也无法切回去 —— 空态会伪装成「全站没有通知」。
    // (此前用正则从模板里抠 v-if 表达式;改用页面真正渲染所依据的 computed。)
    expect(page.visibleFilterIds.value).toContain("team");
  });

  it("renders the category empty title rather than implying all notifications are gone", async () => {
    const { page } = mountPage();
    page.filter.value = "team";
    await page.confirmClearRead();
    const title = source.match(/<EmptyState[^>]*:title="([^\"]+)"/)![1];
    expect(evaluateBinding(title, vue.proxyRefs(page))).toBe(fmt(zh.notifs.emptyFilterTitle, { filter: zh.notifs.kindTeam }));
  });

  it("uses the global notification empty title only when the feed is actually empty", () => {
    const { page, notifs } = mountPage();
    notifs.items = [];
    expect(page.emptyTitle.value).toBe(zh.notifs.emptyAllTitle);
  });

  it("does not present an empty feed alongside a failed or still-loading request", () => {
    const { page } = mountPage();
    const condition = source.match(/<EmptyState[^>]*v-if="([^\"]+)"/)![1];
    for (const state of [{ error: "failed", loading: false }, { error: null, loading: true }]) {
      expect(evaluateBinding(condition, { ...vue.proxyRefs(page), filtered: [], notifs: state })).toBe(false);
    }
  });
});
