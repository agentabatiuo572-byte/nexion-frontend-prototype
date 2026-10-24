import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import component from "@/components/third-party-auth.vue?raw";
import { createSessionVault } from "@/api/session-vault";
import { registerMockAuthCredential } from "@/api/mock-auth-api";
import * as adapter from "@/api/prototype-account-api";
import loginPage from "@/pages/login/login.vue?raw";
import registerPage from "@/pages/register/register.vue?raw";
import phonePage from "@/pages/me/phone-binding.vue?raw";
import introPage from "@/pages/onboarding/intro.vue?raw";
import * as phoneNumbers from "@/auth/phone-number";
import { PROTOTYPE_DEMO_CODE } from "./prototype-demo";
import { normalizeRefCode } from "@/store/sponsorship";
import { privacyPolicyHref, resolvePrivacyReturn } from "@/lib/privacy-return";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { completeSignIn as realCompleteSignIn } from "./complete-sign-in";

const accountId = '+84901234567@demo.nexgrid.ai';
const storage = new Map<string, unknown>();
beforeEach(() => {
  storage.clear();
  (globalThis as any).uni = { getStorageSync: (key: string) => storage.get(key) ?? '', getStorageInfoSync: () => ({ keys: [...storage.keys()] }), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key), reLaunch: vi.fn() };
  setActivePinia(createPinia());
  registerMockAuthCredential('+84', '901234567', 'Password123!');
});
afterEach(() => vi.unstubAllGlobals());
function renderScript(intent: 'LOGIN' | 'LINK', realCompletion = false) {
  const script = component.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const auth = realCompletion ? useAuth() : Vue.reactive({ accountId: intent === 'LINK' ? accountId : 'default', isAuthenticated: intent === 'LINK' });
  const sessionVault = createSessionVault(), completeSignIn = realCompletion ? vi.fn(realCompleteSignIn) : vi.fn(() => ({ ok: true }));
  let hide = () => {};
  const props = { intent, disabled: false, returnTo: null, sponsorCode: null };
  const deps = { ...adapter, ...Vue, sessionVault, completeSignIn, useApp,
    watch: (_source: unknown, handler: () => void, options?: { immediate: boolean }) => { if (options?.immediate) handler(); },
    onHide: (callback: () => void) => { hide = callback; }, onUnmounted: () => {},
    useAuth: () => auth, defineProps: () => props, withDefaults: (value: unknown) => value,
    defineEmits: () => vi.fn(), useT: () => Vue.ref({ thirdParty: new Proxy({}, { get: (_, key) => String(key) }), prototypeAuth: new Proxy({}, { get: (_, key) => String(key) }) }),
  };
  const state = new Function(...Object.keys(deps), `${compiled}; return { start, selectIdentity, complete, cancel, flow, password, code, message, linkedLabels, needsCode, completionDisabled };`)(...Object.values(deps));
  return { ...state, auth, props, sessionVault, completeSignIn, hide: () => hide() };
}
it('uses the real link form: empty password is disabled, wrong password recovers, confirmed binding persists', () => {
  const page = renderScript('LINK'); page.start('Google');
  expect(page.completionDisabled.value).toBe(true);
  page.complete(); expect(adapter.linkedPrototypeProviders(accountId)).toEqual([]);
  page.password.value = 'wrong'; page.complete();
  expect(page.message.value).toBe('passwordInvalid'); expect(page.flow.value).not.toBeNull();
  page.password.value = 'Password123!'; page.complete();
  expect(page.flow.value).toBeNull(); expect(page.linkedLabels.value).toEqual(['Google']);
  expect(renderScript('LINK').linkedLabels.value).toEqual(['Google']);
});
it('reaches the shared sign-in completion for a linked provider without re-registering', () => {
  adapter.linkPrototypeProvider(adapter.startPrototypeProvider('GOOGLE', accountId).id, accountId, 'Password123!');
  const page = renderScript('LOGIN'); page.start('Google'); page.complete();
  expect(page.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ identity: accountId }));
  expect(page.sessionVault.read()?.user.phone).toBe('901234567');
  expect(uni.reLaunch).not.toHaveBeenCalled();
});
it('uses the selected stable identity for linking and later login', () => {
  const link = renderScript('LINK'); link.start('Google');
  const abandoned = link.flow.value.id;
  link.password.value = 'Password123!'; link.selectIdentity('demo-secondary');
  expect(link.password.value).toBe('');
  expect(() => adapter.linkPrototypeProvider(abandoned, accountId, 'Password123!')).toThrow('OAUTH_FLOW_EXPIRED');
  link.password.value = 'Password123!'; link.complete();
  const login = renderScript('LOGIN'); login.start('Google');
  login.selectIdentity('demo-secondary'); login.complete();
  expect(login.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ identity: accountId }));
});
it('retains the invitation when selecting a new identity, creates a phone-less account, then shows success', () => {
  const page = renderScript('LOGIN'); page.props.sponsorCode = 'nx-ab12';
  page.start('Google'); page.selectIdentity('demo-secondary'); page.complete();
  expect(page.message.value).toBe('');
  expect(page.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ identity: 'provider:google:demo-secondary', deferNavigation: true }));
  expect(page.sessionVault.read()?.user).toMatchObject({ countryCode: '', phone: '' });
  expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/register/success' });
  const registration = (storage.get('nexgrid-mock-auth-users-v1') as any).users['provider:google:demo-secondary'].registration;
  expect(registration.context.sponsorCode).toBe('NXAB12');
});
it.each(['throw', 'conflict'] as const)('recovers the first registration receipt after session-save %s without replaying gifts', failure => {
  const page = renderScript('LOGIN'); page.props.sponsorCode = 'NXAB12';
  vi.spyOn(page.sessionVault, 'saveIfUnchanged').mockImplementationOnce(() => { if (failure === 'throw') throw new Error('storage'); return false; });
  page.start('Google'); page.complete();
  expect(page.message.value).toBe('failed'); expect(page.completeSignIn).not.toHaveBeenCalled();
  const id = 'provider:google:demo-primary';
  const users = () => (storage.get('nexgrid-mock-auth-users-v1') as any).users;
  const money = () => JSON.stringify((storage.get('nexgrid-account-cloud-v1') as any)[id].user);
  const giftBills = () => (storage.get('nexgrid-bills-accounts-v1') as any)[id].bills.filter((bill: any) => bill.ref === `GIFT-${id}`);
  const credited = money();
  expect(users()[id].registration).toMatchObject({ status: 'active', receiptPending: true });
  expect(giftBills()).toHaveLength(2);
  page.cancel();
  const retried = renderScript('LOGIN'); retried.props.sponsorCode = 'NXDIFFERENT';
  retried.start('Google'); retried.complete();
  expect(retried.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ identity: id, returnTo: '/pages/register/success', deferNavigation: true }));
  expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/register/success' });
  expect(users()[id].registration).toMatchObject({ receiptPending: false, context: { sponsorCode: 'NXAB12' } });
  expect(money()).toBe(credited); expect(giftBills()).toHaveLength(2);
  expect(adapter.signInPrototypeProvider(adapter.startPrototypeProvider('GOOGLE', null).id)).not.toHaveProperty('registrationReceipt');
});
it('keeps the accepted session and pending receipt when acknowledgement storage fails', () => {
  const original = uni.setStorageSync;
  uni.setStorageSync = ((key: string, value: any) => {
    if (key === 'nexgrid-mock-auth-users-v1' && value.users['provider:apple:demo-primary']?.registration?.receiptPending === false) throw new Error('storage');
    return original(key, value);
  }) as typeof uni.setStorageSync;
  const page = renderScript('LOGIN'); page.props.sponsorCode = 'NXAB12'; page.start('Apple'); page.complete();
  expect(page.message.value).toBe(''); expect(page.sessionVault.read()?.user.phone).toBe('');
  expect(page.completeSignIn).toHaveBeenCalledOnce(); expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/register/success' });
  const first = adapter.signInPrototypeProvider(adapter.startPrototypeProvider('APPLE', null).id);
  expect(first).toHaveProperty('registrationReceipt');
  uni.setStorageSync = original;
  const again = renderScript('LOGIN'); again.start('Apple'); again.complete();
  expect(again.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ deferNavigation: true }));
  expect(adapter.signInPrototypeProvider(adapter.startPrototypeProvider('APPLE', null).id)).not.toHaveProperty('registrationReceipt');
});
function cloudAssets() {
  return Object.fromEntries(Object.entries((storage.get('nexgrid-account-cloud-v1') as any) ?? {}).map(([key, row]: [string, any]) => [key, {
    usdt: row.user.usdtBalance, nex: row.user.nexBalance, rewards: JSON.parse(JSON.stringify(row.user.appliedRewardKeys ?? {})),
    devices: row.devices.map((device: any) => ({ id: device.id, kind: device.kind })),
  }]));
}
function seedProviderCompletion() {
  adapter.signInPrototypeProvider(adapter.startPrototypeProvider('APPLE', null, 'demo-secondary', 'NXOTHER').id);
  adapter.signInPrototypeProvider(adapter.startPrototypeProvider('GOOGLE', null, 'demo-primary', 'NXAB12').id);
  useAuth().signOut();
  return cloudAssets();
}
it.each([1, 4, 8])('runs actual provider component and completion without losing accounts on native cloud read %s', failAt => {
  const before = seedProviderCompletion();
  const page = renderScript('LOGIN', true), key = 'nexgrid-account-cloud-v1';
  const originalRead = uni.getStorageSync, originalWrite = uni.setStorageSync;
  let reads = 0;
  const nativeStorage = {
    getItem: (readKey: string) => {
      if (readKey === key && ++reads === failAt) throw new Error('native read failure');
      return storage.has(readKey) ? JSON.stringify({ type: typeof storage.get(readKey), data: storage.get(readKey) }) : null;
    },
    setItem: (writeKey: string, raw: string) => storage.set(writeKey, JSON.parse(raw).data),
  };
  vi.stubGlobal('window', { localStorage: nativeStorage });
  uni.getStorageSync = ((readKey: string) => { try { const raw = nativeStorage.getItem(readKey); return raw ? JSON.parse(raw).data : ''; } catch { return ''; } }) as typeof uni.getStorageSync;
  uni.setStorageSync = ((writeKey: string, value: unknown) => nativeStorage.setItem(writeKey, JSON.stringify({ type: typeof value, data: value }))) as typeof uni.setStorageSync;
  page.start('Google'); page.complete();
  expect(reads).toBe(1); expect(cloudAssets()).toEqual(before);
  if (failAt === 1) { expect(useAuth().isAuthenticated).toBe(false); expect(page.sessionVault.read()).toBeNull(); }
  else { expect(useAuth().isAuthenticated).toBe(true); expect(page.sessionVault.read()).not.toBeNull(); }
  uni.getStorageSync = originalRead; uni.setStorageSync = originalWrite; vi.unstubAllGlobals();
  if (failAt === 1) { page.cancel(); page.start('Google'); page.complete(); }
  expect(useAuth().isAuthenticated).toBe(true); expect(useAuth().accountId).toBe('provider:google:demo-primary');
  expect(page.sessionVault.read()).not.toBeNull(); expect(cloudAssets()).toEqual(before);
  expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/register/success' });
});
it('clears real auth and vault when binding fails after session save, then retries without changing other accounts', () => {
  const before = seedProviderCompletion();
  const page = renderScript('LOGIN', true), original = uni.setStorageSync;
  let writes = 0;
  uni.setStorageSync = ((key: string, value: unknown) => {
    if (key === 'nexgrid-account-cloud-v1' && ++writes === 2) throw new Error('bind storage failure');
    return original(key, value);
  }) as typeof uni.setStorageSync;
  page.start('Google'); page.complete();
  expect(page.completeSignIn).toHaveReturnedWith({ ok: false, error: 'sign_in_storage_unavailable' });
  expect(useAuth().isAuthenticated).toBe(false); expect(page.sessionVault.read()).toBeNull(); expect(useApp().accountKey).toBe('default');
  expect(cloudAssets()).toEqual(before);
  expect((storage.get('nexgrid-mock-auth-users-v1') as any).users['provider:google:demo-primary'].registration.receiptPending).toBe(true);
  uni.setStorageSync = original;
  page.cancel(); page.start('Google'); page.complete();
  expect(useAuth().isAuthenticated).toBe(true); expect(page.sessionVault.read()).not.toBeNull(); expect(cloudAssets()).toEqual(before);
  expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/register/success' });
});
it('cancels on hide and rejects a changed account or session without binding', () => {
  const page = renderScript('LINK'); page.start('Apple'); page.hide();
  expect(page.flow.value).toBeNull();
  page.start('Apple'); page.password.value = 'Password123!'; page.auth.accountId = 'another'; page.complete();
  expect(page.message.value).toBe('expired'); expect(adapter.linkedPrototypeProviders(accountId)).toEqual([]);
  page.auth.accountId = accountId; page.start('Apple'); page.password.value = 'Password123!'; page.sessionVault.clear(); page.complete();
  expect(page.message.value).toBe('expired'); expect(adapter.linkedPrototypeProviders(accountId)).toEqual([]);
});
it('canceled or account-switched login confirmation cannot provision a provider account', () => {
  const page = renderScript('LOGIN'); page.start('Apple'); page.cancel(); page.complete();
  expect(page.completeSignIn).not.toHaveBeenCalled();
  page.start('Apple'); page.auth.accountId = 'another'; page.complete();
  expect(page.message.value).toBe('expired'); expect(page.completeSignIn).not.toHaveBeenCalled();
  expect(Object.keys((storage.get('nexgrid-mock-auth-users-v1') as any).users)).toEqual(['+84 901234567']);
});
it('preserves manually entered current and legacy invitations across the real page actions and privacy return', () => {
  function actions(source: string, names: string[], deps: Record<string, unknown>) {
    const ast = ts.createSourceFile('page.ts', source.split('<script setup lang="ts">')[1].split('</script>')[0], ts.ScriptTarget.Latest, true);
    const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n');
    const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function(...Object.keys(deps), `${code}; return { ${names.join(',')} };`)(...Object.values(deps));
  }
  for (const value of ['nx-fa9066-cfaca9', 'nexgrid-ab12']) {
    const reLaunch = vi.fn(), navTo = vi.fn();
    const signUp = actions(registerPage, ['goLogin', 'goPrivacy'], { lockedRef: Vue.ref(null), invite: Vue.ref(value), normalizeRefCode, uni: { reLaunch }, navTo, privacyPolicyHref });
    signUp.goLogin();
    const forwarded = new URLSearchParams(reLaunch.mock.calls[0][0].url.split('?')[1]).get('ref');
    expect(forwarded).toBe(normalizeRefCode(value));
    const signIn = actions(loginPage, ['goRegister'], { refOnLogin: Vue.ref(forwarded), invalidateOtpFlow: vi.fn(), uni: { reLaunch } });
    signIn.goRegister();
    expect(reLaunch.mock.calls[1][0].url).toBe(`/pages/register/register?ref=${encodeURIComponent(forwarded!)}`);
    signUp.goPrivacy();
    const target = new URLSearchParams(navTo.mock.calls[0][0].split('?')[1]).get('return');
    expect(resolvePrivacyReturn(target)).toBe(`/pages/register/register?ref=${encodeURIComponent(value)}`);
  }
});
it('clears phone success, input, country, cooldown and outstanding challenges when switching accounts', async () => {
  const script = phonePage.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile('phone.ts', script, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const auth = Vue.reactive({ accountId: 'default', isAuthenticated: true });
  const clearInterval = vi.fn();
  const deps = { ...Vue, ...adapter, ...phoneNumbers, PROTOTYPE_DEMO_CODE,
    useAuth: () => auth, useT: () => Vue.ref({ security: {}, thirdParty: {} }), useLocaleStore: () => ({ code: 'en' }),
    sessionVault: createSessionVault(), onShow: (callback: () => void) => callback(), onHide: () => {}, onUnmounted: () => {},
    setInterval: vi.fn(() => 1), clearInterval,
  };
  const page = new Function(...Object.keys(deps), `${compiled}; return { send, submit, done, phone, countryCode, password, newCode, challenge, resendLeft };`)(...Object.values(deps));
  page.countryCode.value = '+86'; page.phone.value = '13800138000'; page.send();
  expect(page.challenge.value).not.toBeNull(); page.newCode.value = PROTOTYPE_DEMO_CODE; page.submit();
  expect(page.done.value).toBe(true);
  auth.accountId = accountId; await Vue.nextTick();
  expect(page.done.value).toBe(false); expect(page.phone.value).toBe(''); expect(page.countryCode.value).toBe('+84');
  expect(page.resendLeft.value).toBe(0); expect(clearInterval).toHaveBeenCalled();
  page.countryCode.value = '+86'; page.phone.value = '13900139000'; page.password.value = 'Password123!'; page.send();
  const pending = page.challenge.value.challengeNo;
  auth.accountId = 'another-existing-account'; await Vue.nextTick();
  expect(page.challenge.value).toBeNull(); expect(page.phone.value).toBe(''); expect(page.countryCode.value).toBe('+84'); expect(page.resendLeft.value).toBe(0);
  expect(() => adapter.confirmPrototypePhone(accountId, pending, PROTOTYPE_DEMO_CODE, PROTOTYPE_DEMO_CODE)).toThrow('USER_PHONE_CHANGE_EXPIRED');
});
it('shows an explicit offline code path on every auth code form and connects intro privacy return', () => {
  for (const source of [component, phonePage, loginPage, registerPage]) {
    const template = source.split('</template>')[0];
    expect(source).toContain('t.prototypeAuth.codeHint');
    expect(source).toContain('PROTOTYPE_DEMO_CODE');
    expect(template).not.toMatch(/t\.thirdParty\.codePrompt|t\.security\.phoneChangeCodesSent/);
  }
  expect(introPage).toContain('privacyPolicyHref(\'/pages/onboarding/intro\')');
  expect(introPage).toContain('@click="goPrivacy"');
});
