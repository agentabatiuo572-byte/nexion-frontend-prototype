import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { startPrototypeProvider, signInPrototypeProvider, cancelPrototypeProvider, startPrototypePhone, confirmPrototypePhone, acknowledgePrototypeProviderRegistration } from "@/api/prototype-account-api";
import { readPrototypeUsers, PROTOTYPE_USERS_KEY } from "./prototype-identity";
import { resolveAuthAccountById, markAuthAccountOnboardingComplete, resolveAuthAccount } from "@/store/auth-account";
import { useApp } from "@/store/app";
import { useBills } from "@/store/bills";
import { useConfig } from "@/store/config";
import { useSponsorship } from "@/store/sponsorship";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { isUserSession } from "@/api/contracts";
import { createSessionVault } from "@/api/session-vault";
import { completeSignIn } from "./complete-sign-in";

const storage = new Map<string, any>();
let rejectedKey = '';
beforeEach(() => {
  storage.clear(); rejectedKey = '';
  (globalThis as any).uni = {
    getStorageSync: (key: string) => storage.has(key) ? structuredClone(storage.get(key)) : '',
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    setStorageSync: (key: string, value: unknown) => { if (key === rejectedKey) throw new Error('storage'); storage.set(key, JSON.parse(JSON.stringify(value))); },
    removeStorageSync: (key: string) => storage.delete(key), reLaunch: vi.fn(),
  };
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());
function login(provider: 'GOOGLE' | 'APPLE' | 'TELEGRAM' = 'GOOGLE', subject: 'demo-primary' | 'demo-secondary' = 'demo-primary', sponsor: string | null = 'NX-AB12') {
  const result = signInPrototypeProvider(startPrototypeProvider(provider, null, subject, sponsor).id);
  if (result.kind !== 'authenticated') throw new Error('unexpected challenge');
  return result;
}
it.each(['GOOGLE', 'APPLE', 'TELEGRAM'] as const)('%s creates one stable phone-less invited account and persists its receipt', provider => {
  const result = login(provider);
  expect(result.user).toMatchObject({ countryCode: '', phone: '' });
  expect(result.registrationReceipt).toMatchObject({ sponsorCode: 'NXAB12' });
  expect(resolveAuthAccountById(result.accountId)).toMatchObject({ ok: true, account: { status: 'active', onboardingComplete: false, registration: result.registrationReceipt } });
  const vault = createSessionVault();
  expect(() => vault.save({ accessToken: 'local', refreshToken: 'local', tokenType: 'Bearer', user: result.user })).not.toThrow();
  expect(completeSignIn({ identity: result.accountId, serverProfile: result.user, deferNavigation: true })).toEqual({ ok: true });
  expect(acknowledgePrototypeProviderRegistration(result.accountId)).toBe(true);
  const app = useApp(), bills = useBills(), amount = app.user.usdtBalance, nex = app.user.nexBalance;
  expect(useSponsorship().sponsorCode).toBe('NXAB12');
  expect(bills.bills.filter(bill => bill.ref === result.registrationReceipt!.giftRef)).toHaveLength(2);
  setActivePinia(createPinia());
  const again = login(provider, 'demo-primary', 'NXOTHER');
  expect(again.accountId).toBe(result.accountId); expect(again.user.userId).toBe(result.user.userId);
  expect(again.registrationReceipt).toBeUndefined();
  useApp().bindAccount(result.accountId); rebindAccountScopedStores(result.accountId);
  expect(useApp().user.usdtBalance).toBe(amount); expect(useApp().user.nexBalance).toBe(nex);
  expect(useSponsorship().sponsorCode).toBe('NXAB12');
  expect(useBills().bills.filter(bill => bill.ref === result.registrationReceipt!.giftRef)).toHaveLength(2);
  expect(markAuthAccountOnboardingComplete(result.accountId)).toBe(true);
  expect(resolveAuthAccountById(result.accountId)).toMatchObject({ account: { onboardingComplete: true } });
});
it('isolates two confirmed subjects on the same platform, and a later phone alias keeps that account', () => {
  const first = login('GOOGLE', 'demo-primary', 'NXAAA1');
  const second = login('GOOGLE', 'demo-secondary', 'NXBBB2');
  expect(second.accountId).not.toBe(first.accountId); expect(second.user.userId).not.toBe(first.user.userId);
  const challenge = startPrototypePhone(second.accountId, '+84', '902345678');
  confirmPrototypePhone(second.accountId, challenge.challengeNo, '123456');
  expect(login('GOOGLE', 'demo-secondary').user.phone).toBe('902345678');
  expect(resolveAuthAccount('+84902345678')).toMatchObject({ account: { accountId: second.accountId } });
  expect(resolveAuthAccountById(first.accountId)).toMatchObject({ account: { phoneE164: '', registration: { sponsorCode: 'NXAAA1' } } });
});
it('creates without an invitation without claiming a welcome gift, including when rewards are disabled', () => {
  const solo = login('GOOGLE', 'demo-primary', null);
  expect(solo.registrationReceipt).toMatchObject({ sponsorCode: null, giftUsdt: 0, giftNex: 0 });
  useConfig().config.rewards.enabled = false;
  const invited = login('APPLE');
  expect(invited.registrationReceipt).toMatchObject({ sponsorCode: 'NXAB12', giftUsdt: 0, giftNex: 0 });
});
it('cancellation and failed initial writes never create an authenticated or reserved account', () => {
  const canceled = startPrototypeProvider('GOOGLE', null, 'demo-primary', 'NXAB12');
  cancelPrototypeProvider(canceled.id);
  expect(() => signInPrototypeProvider(canceled.id)).toThrow('OAUTH_FLOW_EXPIRED');
  expect(Object.keys(readPrototypeUsers().users)).toHaveLength(0);
  rejectedKey = PROTOTYPE_USERS_KEY;
  expect(() => login()).toThrow('ACCOUNT_STORAGE_UNAVAILABLE');
  expect(storage.has(PROTOTYPE_USERS_KEY)).toBe(false);
});
it('resumes a pending partial gift after failure, preserving the original sponsor and exact-once credit', () => {
  rejectedKey = 'nexgrid-bills-accounts-v1';
  const flow = startPrototypeProvider('GOOGLE', null, 'demo-primary', 'NXAB12');
  expect(() => signInPrototypeProvider(flow.id)).toThrow('PROTOTYPE_REGISTRATION_RETRY');
  const pending = readPrototypeUsers().users['provider:google:demo-primary'];
  expect(pending.registration?.status).toBe('pending');
  expect(completeSignIn({ identity: pending.accountId!, deferNavigation: true })).toEqual({ ok: false, error: 'account_pending' });
  expect(useApp().accountKey).toBe('default');
  const paid = structuredClone(storage.get('nexgrid-account-cloud-v1')[pending.accountId!].user);
  rejectedKey = '';
  setActivePinia(createPinia());
  const result = login('GOOGLE', 'demo-primary', 'NXCHANGED');
  expect(result.registrationReceipt?.sponsorCode).toBe('NXAB12');
  const after = storage.get('nexgrid-account-cloud-v1')[pending.accountId!].user;
  expect(after.usdtBalance).toBe(paid.usdtBalance); expect(after.nexBalance).toBe(paid.nexBalance);
  expect(readPrototypeUsers().users[pending.accountId!].registration?.status).toBe('active');
});
it('fails closed after a transient provider registry read instead of creating another identity', () => {
  const first = login(); const before = structuredClone(storage.get(PROTOTYPE_USERS_KEY));
  const original = uni.getStorageSync;
  uni.getStorageSync = ((key: string) => { if (key === PROTOTYPE_USERS_KEY) throw new Error('temporary'); return original(key); }) as typeof uni.getStorageSync;
  expect(() => login()).toThrow('ACCOUNT_STORAGE_UNAVAILABLE');
  expect(storage.get(PROTOTYPE_USERS_KEY)).toEqual(before);
  uni.getStorageSync = original;
  expect(login().accountId).toBe(first.accountId);
});
it.each([1, 2, 3])('keeps every account row while resuming a pending gift with native cloud read failure %s', failAt => {
  const other = login('APPLE', 'demo-secondary', 'NXOTHER');
  expect(acknowledgePrototypeProviderRegistration(other.accountId)).toBe(true);
  rejectedKey = 'nexgrid-bills-accounts-v1';
  expect(() => login()).toThrow('PROTOTYPE_REGISTRATION_RETRY');
  rejectedKey = '';
  const key = 'nexgrid-account-cloud-v1', before = structuredClone(storage.get(key));
  const originalRead = uni.getStorageSync, originalWrite = uni.setStorageSync;
  let reads = 0;
  const nativeStorage = {
    getItem: (readKey: string) => {
      if (readKey === key && ++reads === failAt) throw new Error('native temporary read');
      return storage.has(readKey) ? JSON.stringify({ type: typeof storage.get(readKey), data: storage.get(readKey) }) : null;
    },
    setItem: (writeKey: string, raw: string) => storage.set(writeKey, JSON.parse(raw).data),
  };
  vi.stubGlobal('window', { localStorage: nativeStorage });
  uni.getStorageSync = ((readKey: string) => { try { const raw = nativeStorage.getItem(readKey); return raw ? JSON.parse(raw).data : ''; } catch { return ''; } }) as typeof uni.getStorageSync;
  uni.setStorageSync = ((writeKey: string, value: unknown) => nativeStorage.setItem(writeKey, JSON.stringify({ type: typeof value, data: value }))) as typeof uni.setStorageSync;
  if (failAt === 1) expect(() => login()).toThrow('PROTOTYPE_REGISTRATION_RETRY');
  else expect(login()).toHaveProperty('registrationReceipt');
  expect(reads).toBe(1);
  uni.getStorageSync = originalRead; uni.setStorageSync = originalWrite; vi.unstubAllGlobals();
  if (failAt === 1) expect(login()).toHaveProperty('registrationReceipt');
  const after = storage.get(key);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const accountKey of Object.keys(before)) {
    expect(after[accountKey].user.usdtBalance).toBe(before[accountKey].user.usdtBalance);
    expect(after[accountKey].user.nexBalance).toBe(before[accountKey].user.nexBalance);
    expect(after[accountKey].user.appliedRewardKeys).toEqual(before[accountKey].user.appliedRewardKeys);
    expect(after[accountKey].devices).toEqual(before[accountKey].devices);
  }
  expect(useApp().accountKey).toBe('default');
});
it('accepts a complete phone-less session while rejecting partial, missing or malformed phone fields', () => {
  const base = { userId: 7, nickname: 'Demo', countryCode: '', phone: '' };
  expect(isUserSession(base)).toBe(true);
  expect(isUserSession({ ...base, countryCode: '+81', phone: '81987654321' })).toBe(true);
  for (const fields of [{ countryCode: '+84' }, { phone: '901234567' }, { countryCode: undefined }, { phone: undefined },
    { countryCode: 'invalid', phone: '901234567' }, { countryCode: '+84', phone: 'not-a-number' }]) expect(isUserSession({ ...base, ...fields })).toBe(false);
});
