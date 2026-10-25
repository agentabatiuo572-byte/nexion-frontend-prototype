import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./invite-scan-entry.vue?raw";
import login from "@/pages/login/login.vue?raw";
import team from "@/pages/team/team.vue?raw";
import me from "@/pages/me/me.vue?raw";
import { scannedInvitationCode } from "@/lib/invite-scan";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const base = "https://18.142.169.24/ref/", code = "NXBE540DAFE785";
it("accepts only the exact configured invitation URL, without browser URL support", () => {
  vi.stubGlobal("URL", undefined);
  expect(scannedInvitationCode(` ${base}${code} `, base)).toBe(code);
  for (const input of [code, "javascript:alert(1)", `https://evil.test/ref/${code}`,
    `https://18.142.169.24.evil.test/ref/${code}`, `https://18.142.169.24@evil.test/ref/${code}`,
    `${base}../${code}`, `${base}${code}?return=/pages/me/me`, `${base}${code}#route`,
    `${base}%4eXBE540DAFE785`, `${base}${code}/`, `${base}${"A".repeat(33)}`, 42]) {
    expect(scannedInvitationCode(input, base)).toBeNull();
  }
  expect(scannedInvitationCode(`${base}${code}`, "")).toBeNull();
});

type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; }, setElementText: (target, text) => { target.text = text; },
  patchProp: (target, key, _old, value) => { target.props[key] = value; }, parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
  insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const unmounts: Array<() => void> = [];
const compiled = ts.transpileModule(compileScript(parse(source).descriptor, { id: "invite-scan", inlineTemplate: true }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

async function fixture(copy = en, authenticated = false, load = async () => {}) {
  let epoch = 1;
  const originalPage = {}, pages = Object.assign(Object.create(null), { 0: originalPage, length: 1 });
  vi.stubGlobal("getCurrentPages", () => pages);
  const auth = Vue.reactive({ accountId: authenticated ? "user:1060" : "", isAuthenticated: authenticated });
  const config = Vue.reactive({ configStatus: "ready", config: { share: { baseUrl: base } }, ensureLoaded: vi.fn(load) });
  const requests: Array<{ success: (value: { result: string }) => void; fail: (error: { errMsg: string }) => void; scanType: string[] }> = [];
  const scanCode = vi.fn(options => requests.push(options));
  vi.stubGlobal("uni", { scanCode });
  const navTo = vi.fn(async (_url: string) => true), unloads: Array<() => void> = [];
  const showError = vi.fn();
  const imports: Record<string, unknown> = {
    vue: Vue, "@/composables/use-tab-page-lifecycle": { onUnload: (fn: () => void) => unloads.push(fn) },
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/store/auth": { useAuth: () => auth },
    "@/store/config": { useConfig: () => config }, "@/lib/route": { navTo },
    "@/lib/account-scope": { captureAccountScope: () => epoch, isCurrentAccountScope: (value: number) => value === epoch },
    "@/lib/share": { buildShareLink: (value: string) => config.configStatus === "ready" ? config.config.share.baseUrl + value : "" },
    "@/lib/invite-scan": { scannedInvitationCode },
    "@/store/ui": { toast: { error: showError } },
  };
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", compiled)((id: string) => { if (!(id in imports)) throw new Error(id); return imports[id]; }, exports);
  const root = node("root"), props = Vue.reactive({ disabled: false, shortcut: false, label: undefined as string | undefined });
  const app = renderer.createApp({ render: () => Vue.h(exports.default, props) });
  app.mount(root); unmounts.push(() => app.unmount()); await Vue.nextTick();
  const button = () => all(root).find(item => item.props.role === "button")!;
  return { root, button, scanCode, requests, config, auth, navTo, props, showError,
    pages, click: () => button().props.onClick(), unload: () => unloads.forEach(fn => fn()), rebind: () => epoch++, coverPage: () => { pages[pages.length++] = {}; } };
}
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); await Promise.resolve(); };
afterEach(() => { unmounts.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });

it("native page stack without Array.at reaches the scanner and preserves top-page identity", async () => {
  const f = await fixture();
  expect(f.pages.at).toBeUndefined();
  let failure: unknown;
  const scan = f.click().catch((error: unknown) => { failure = error; });
  await flush();
  expect(failure).toBeUndefined();
  expect(f.scanCode).toHaveBeenCalledOnce();
  f.requests[0].success({ result: base + code });
  await scan;
  expect(f.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/ref/code?code=${code}`);
});

for (const copy of [en, zh, vietnamese]) it(`actual scan entry uses locale and opens only the public preview (${copy.inviteScan.open})`, async () => {
  const f = await fixture(copy);
  expect(f.button().props["aria-label"]).toBe(copy.inviteScan.open);
  expect(text(f.root)).toContain(copy.inviteScan.open);
  const first = f.click(), duplicate = f.click(); await flush();
  expect(f.scanCode).toHaveBeenCalledOnce(); expect(f.requests[0].scanType).toEqual(["qrCode"]);
  expect(f.button().props["aria-disabled"]).toBe(true);
  f.requests[0].success({ result: base + code }); await first; await duplicate; await flush();
  expect(f.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/ref/code?code=${code}`);
  expect(f.button().props["aria-disabled"]).toBe(false);
});

it("authenticated scan is preview only and leaves the existing account unchanged", async () => {
  const f = await fixture(en, true), before = { ...f.auth };
  const scan = f.click(); await flush(); f.requests[0].success({ result: base + code }); await scan;
  expect(f.auth).toEqual(before); expect(f.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/ref/code?code=${code}`);
});

it.each(["scanCode:fail cancel", "scanCode:fail auth deny", "scanCode:fail camera unavailable", "扫码取消", "相机权限未授权"])("failure %s clears busy and permits a fresh attempt", async message => {
  const f = await fixture(), first = f.click(); await flush(); f.requests[0].fail({ errMsg: message }); await first; await flush();
  expect(f.navTo).not.toHaveBeenCalled(); expect(f.button().props["aria-disabled"]).toBe(false);
  if (/cancel|取消/.test(message)) expect(all(f.root).some(item => item.props.role === "alert")).toBe(false);
  else expect(text(f.root)).toContain(/deny|权限/.test(message) ? en.inviteScan.permission : en.inviteScan.failed);
  const second = f.click(); await flush(); f.requests[1].success({ result: base + code }); await second;
  expect(f.navTo).toHaveBeenCalledOnce();
});

it("unavailable public config can retry without opening the camera or needing a current-user referral code", async () => {
  const f = await fixture(); f.config.configStatus = "failed";
  await f.click(); expect(f.scanCode).not.toHaveBeenCalled(); expect(text(f.root)).toContain(en.inviteScan.unavailable);
  f.config.configStatus = "ready"; const next = f.click(); await flush(); f.requests[0].success({ result: base + code }); await next;
  expect(f.navTo).toHaveBeenCalledOnce();
});

it("invalid or outdated configured links stay on the page and navigation failure is retryable", async () => {
  const f = await fixture(), first = f.click(); await flush(); f.config.config.share.baseUrl = "https://current.example/ref/";
  f.requests[0].success({ result: base + code }); await first; await flush();
  expect(text(f.root)).toContain(en.inviteScan.invalid); expect(f.navTo).not.toHaveBeenCalled();
  f.navTo.mockResolvedValueOnce(false); const second = f.click(); await flush();
  f.requests[1].success({ result: f.config.config.share.baseUrl + code }); await second; await flush();
  expect(text(f.root)).toContain(en.inviteScan.failed); expect(f.button().props["aria-disabled"]).toBe(false);
});

it("waits for the onShow public-config refresh after returning from the native camera", async () => {
  let finishRefresh!: () => void, loads = 0;
  const f = await fixture(en, false, () => ++loads === 1 ? Promise.resolve() : new Promise<void>(resolve => { finishRefresh = resolve; }));
  const scan = f.click(); await flush(); f.config.configStatus = "loading";
  f.requests[0].success({ result: base + code }); await flush();
  expect(f.navTo).not.toHaveBeenCalled(); expect(text(f.root)).not.toContain(en.inviteScan.invalid);
  f.config.configStatus = "ready"; finishRefresh(); await scan;
  expect(f.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/ref/code?code=${code}`);
});

it.each(["unload", "account", "auth", "covered-page"])("discards the late scanner callback after %s", async change => {
  const f = await fixture(), scan = f.click(); await flush();
  if (change === "unload") f.unload(); else if (change === "account") f.rebind(); else if (change === "covered-page") f.coverPage(); else f.auth.isAuthenticated = true;
  f.requests[0].success({ result: base + code }); await scan;
  expect(f.navTo).not.toHaveBeenCalled();
});

it("does not open the camera after public-config wait changes account or the parent disables entry", async () => {
  let complete!: () => void;
  const f = await fixture(en, false, () => new Promise<void>(resolve => { complete = resolve; }));
  const scan = f.click(); f.rebind(); complete(); await scan;
  expect(f.scanCode).not.toHaveBeenCalled();
  f.props.disabled = true; await Vue.nextTick(); await f.click(); expect(f.scanCode).not.toHaveBeenCalled();
});

it("login and Me compile the scanner only for APP-PLUS; Team has no duplicate entry", () => {
  expect(team).not.toContain("InviteScanEntry");
  expect(me).toContain("['inventory', 'orders', 'missions', 'rewards', 'scan', 'receipts', 'goals', 'learning']");
  expect(me).toContain("toast.info(t.value.me.scanAppOnly)");
  for (const page of [login, me]) {
    expect(page).toMatch(/<!-- #ifdef APP-PLUS -->\s*<InviteScanEntry[\s\S]*?<!-- #endif -->/);
    expect(page).toMatch(/\/\/ #ifdef APP-PLUS\s*import InviteScanEntry[\s\S]*?\/\/ #endif/);
    const h5 = page.replace(/<!-- #ifdef APP-PLUS -->[\s\S]*?<!-- #endif -->/g, "")
      .replace(/\/\/ #ifdef APP-PLUS[\s\S]*?\/\/ #endif/g, "");
    expect(h5).not.toContain("InviteScanEntry");
  }
});

it("Me shortcut uses Scan label and reports failures as a toast without expanding the grid", async () => {
  const f = await fixture(zh, true);
  Object.assign(f.props, { shortcut: true, label: zh.me.shortcutLabels.scan });
  await Vue.nextTick();
  expect(f.button().props['aria-label']).toBe('扫一扫');
  const scan = f.click(); await flush();
  f.requests[0].fail({ errMsg: 'scanCode:fail auth deny' });
  await scan; await flush();
  expect(f.showError).toHaveBeenCalledExactlyOnceWith(zh.inviteScan.permission);
  expect(all(f.root).some(item => item.props.role === 'alert')).toBe(false);
  const retry = f.click(); await flush(); f.requests[1].fail({ errMsg: 'scanCode:fail cancel' });
  await retry;
  expect(f.scanCode).toHaveBeenCalledTimes(2);
  expect(f.showError).toHaveBeenCalledOnce();
});
