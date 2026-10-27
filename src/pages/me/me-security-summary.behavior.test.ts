import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import source from './me.vue?raw';
import rowSource from '@/components/ui/nx-list-row.vue?raw';
import groupSource from '@/components/ui/nx-list-group.vue?raw';
import { createRemoteAccountEpoch } from '@/lib/remote-account-epoch';
import { binarySessionReady } from '@/lib/binary-session-ready';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';

const dictionaries = { zh, en, vi: vietnamese }, disposals: Array<() => void> = [];
afterEach(() => disposals.splice(0).forEach(dispose => dispose()));
const js = (code: string) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function part(from: string, to: string) { const start = source.indexOf(from); return source.slice(start, source.indexOf(to, start)); }
function component(raw: string) {
  const descriptor = parse(raw).descriptor;
  if (!descriptor.scriptSetup) return { render: new Function('Vue', compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag) }).code)(Vue) };
  const exports: any = {};
  new Function('require', 'exports', js(compileScript(descriptor, { id: 'security-summary-row', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } }).content))(() => Vue, exports);
  return exports.default;
}
const template = source.match(/<NxListGroup[^>]*class="me-security-hint"[^]*?<\/NxListGroup>/)![0];
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue);
const snapshot = (enabled: boolean) => ({ twoFactorEnabled: enabled, passwordChangedAt: null, sessions: [] });
function deferred() { let resolve!: (value: ReturnType<typeof snapshot>) => void, reject!: (error: Error) => void; return { promise: new Promise<ReturnType<typeof snapshot>>((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; }
function page(language: keyof typeof dictionaries = 'zh') {
  const app = Vue.reactive({ accountKey: 'user:1', accountBindingEpoch: 1 });
  const auth = Vue.reactive({ isAuthenticated: true, accountId: 'user:1' });
  const epoch = createRemoteAccountEpoch('user:1'), api = { securityOverview: vi.fn() };
  const hooks = { show: [] as Array<() => void>, hide: [] as Array<() => void>, dispose: [] as Array<() => void> };
  const bindings = { ref: Vue.ref, computed: Vue.computed, watch: Vue.watch, app, auth, remoteApiEnabled: true, accountApi: api,
    security: { twoFactorEnabled: false }, t: Vue.ref(dictionaries[language]), captureAccountScope: () => epoch.snapshot(), isCurrentAccountScope: epoch.isCurrent,
    binarySessionReady, sessionVault: { read: () => ({ user: { userId: Number(auth.accountId.slice(5)) } }) }, subscribeRuntimeRevision: () => () => {},
    onShow: (callback: () => void) => hooks.show.push(callback), onHide: (callback: () => void) => hooks.hide.push(callback), onUnmounted: (callback: () => void) => hooks.dispose.push(callback) };
  const clearWatch = source.includes('watch([() => app.accountKey') ? part('watch([() => app.accountKey', 'watch(() => [app.accountKey') : '';
  const code = [part('const remoteSecurity = ref', 'const iconPaths'), part('const twoFactorEnabled = computed', '// The Me entry'),
    part('async function refreshRemoteSecurity', 'async function refreshRemoteTrial'), clearWatch,
    'function refreshRemoteMe() { return refreshRemoteSecurity(); } function refreshRemoteOrders() {}',
    part('watch(() => [app.accountKey', 'function handleQuickItem'),
    ';return { remoteSecurity,twoFactorEnabled, twoFactorSummary: typeof twoFactorSummary === "undefined" ? undefined : twoFactorSummary, refreshRemoteSecurity };'].join('\n');
  const scope = Vue.effectScope();
  const state = scope.run(() => new Function(...Object.keys(bindings), js(code))(...Object.values(bindings))) as any;
  disposals.push(() => { hooks.dispose.forEach(callback => callback()); scope.stop(); });
  const html = () => {
    const view = Vue.createSSRApp({ render, setup: () => ({ ...state, t: dictionaries[language], navTo: vi.fn() }) });
    view.component('NxListRow', component(rowSource)); view.component('NxListGroup', component(groupSource));
    return renderToString(view);
  };
  return { state, app, auth, epoch, api, html, show: () => hooks.show.forEach(callback => callback()), hide: () => hooks.hide.forEach(callback => callback()) };
}
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); await Vue.nextTick(); };

it.each(['zh', 'en', 'vi'] as const)('keeps one fixed-title row for unknown/off/on in %s without asserting Passkey', async language => {
  const screen = page(language), copy = dictionaries[language];
  for (const enabled of [null, false, true]) {
    screen.state.remoteSecurity.value = enabled === null ? null : snapshot(enabled);
    const html = await screen.html();
    expect(html).toContain('me-security-hint'); expect(html).toContain(copy.security.twoFactorTitle);
    expect(html).toContain(enabled === null ? '—' : enabled ? copy.security.twoFactorOn : copy.security.twoFactorOff);
    expect(html.match(/class="nx-list-row"/g)).toHaveLength(1); expect(html).not.toContain('Passkey');
  }
});

it.each([false, true])('preserves confirmed %s during show refresh, then becomes unknown on failure without removing the row', async enabled => {
  const screen = page(), next = deferred(); screen.api.securityOverview.mockResolvedValueOnce(snapshot(enabled)).mockReturnValueOnce(next.promise);
  screen.show(); await flush(); screen.hide(); screen.show(); await flush();
  expect(screen.state.twoFactorEnabled.value).toBe(enabled); expect(await screen.html()).toContain('me-security-hint');
  next.reject(new Error('READ_UNAVAILABLE')); await flush();
  expect(screen.state.twoFactorEnabled.value).toBeNull(); expect(await screen.html()).toContain('—'); expect(await screen.html()).toContain('nx-list-row');
});

it.each(['other-account', 'same-account-rebind'] as const)('synchronously clears the %s snapshot and rejects the old read', async change => {
  const screen = page(), old = deferred(), current = deferred();
  screen.api.securityOverview.mockResolvedValueOnce(snapshot(false)).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  screen.show(); await flush(); const previous = screen.state.refreshRemoteSecurity();
  const key = change === 'other-account' ? 'user:2' : 'user:1'; screen.epoch.bind(key); screen.app.accountKey = key; screen.auth.accountId = key; screen.app.accountBindingEpoch++;
  expect(screen.state.twoFactorEnabled.value).toBeNull(); await flush(); old.resolve(snapshot(true)); await previous;
  expect(screen.state.twoFactorEnabled.value).toBeNull();
  current.resolve(snapshot(false)); await flush(); expect(screen.state.twoFactorEnabled.value).toBe(false);
});

it('clears on lost authentication and does not repopulate from a hidden or revoked read', async () => {
  const screen = page(), old = deferred(); screen.api.securityOverview.mockReturnValueOnce(old.promise);
  screen.show(); await flush(); screen.hide(); screen.auth.isAuthenticated = false;
  old.resolve(snapshot(false)); await flush(); expect(screen.state.remoteSecurity.value).toBeNull();
  await screen.state.refreshRemoteSecurity(); expect(screen.api.securityOverview).toHaveBeenCalledOnce();
});
