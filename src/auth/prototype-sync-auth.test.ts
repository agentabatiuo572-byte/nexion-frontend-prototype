import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, registerMockAuthCredential, mockAccountIdForUser, provisionMockAuthCredential, setMockAuthTwoFactor } from "@/api/mock-auth-api";
import { createSessionVault } from "@/api/session-vault";
import { startPrototypeProvider, linkPrototypeProvider, signInPrototypeProvider, linkedPrototypeProviders, cancelPrototypeProvider, startPrototypePhone, confirmPrototypePhone, prototypeAccountPhone, prototypePhonePolicy, cancelPrototypePhone, PROTOTYPE_PHONE_POLICY_KEY } from "@/api/prototype-account-api";
import { PROTOTYPE_USERS_KEY } from "./prototype-identity";
import { PROTOTYPE_DEMO_CODE } from "./prototype-demo";
import { provisionMockPreviewAuthAccount, resolveAuthAccount } from "@/store/auth-account";
import { privacyPolicyHref, resolvePrivacyReturn } from "@/lib/privacy-return";
import { visibleReferralGift, newcomerSubtitleKind } from "@/lib/referral-reward-gate";
import { resolvePostSignInRoute } from "./post-sign-in-route";
import { readPrototypePrivacyPolicy, PROTOTYPE_PRIVACY_POLICY_KEY } from "@/api/prototype-privacy-api";

const storage = new Map<string, unknown>();
let round = 0, failWrite = false;
const oldPhone = '901234567', nextPhone = '902345678', password = 'GoodPassword123!';
const accountId = '+84901234567@demo.nexgrid.ai';
function seed() {
  registerMockAuthCredential('+84', oldPhone, password);
  provisionMockPreviewAuthAccount('+84' + oldPhone, { sponsorCode: null, giftRoute: 'no_issue', giftUsdt: 0, giftNex: 0, giftRef: 'test' });
}
beforeEach(() => {
  storage.clear(); failWrite = false;
  vi.useFakeTimers(); vi.setSystemTime(new Date(Date.UTC(2026, 9, 24) + ++round * 600_000));
  (globalThis as any).uni = {
    getStorageSync: (key: string) => storage.has(key) ? JSON.parse(JSON.stringify(storage.get(key))) : '',
    setStorageSync: (key: string, value: unknown) => { if (failWrite) throw new Error('disk full'); storage.set(key, JSON.parse(JSON.stringify(value))); },
    removeStorageSync: (key: string) => storage.delete(key), getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('prototype provider binding and account identity', () => {
  it.each(['GOOGLE', 'APPLE', 'TELEGRAM'] as const)('preserves an existing binding across a fresh adapter: %s', async provider => {
    seed();
    const flow = startPrototypeProvider(provider, accountId);
    expect(() => linkPrototypeProvider(flow.id, accountId, 'wrong')).toThrow('OAUTH_LINK_PASSWORD_INVALID');
    expect(linkedPrototypeProviders(accountId)).toEqual([]);
    linkPrototypeProvider(flow.id, accountId, password);
    expect(linkedPrototypeProviders(accountId)).toEqual([provider]);
    const result = signInPrototypeProvider(startPrototypeProvider(provider, null).id);
    expect(result).toMatchObject({ kind: 'authenticated', accountId });
    if (result.kind === 'authenticated') expect(mockAccountIdForUser(result.user)).toBe(accountId);
    expect(() => linkPrototypeProvider(startPrototypeProvider(provider, accountId).id, accountId, password)).toThrow('OAUTH_IDENTITY_ALREADY_LINKED');
  });
  it('does not commit canceled, expired, wrong-owner or failed-storage bindings', () => {
    seed();
    const canceled = startPrototypeProvider('GOOGLE', accountId); cancelPrototypeProvider(canceled.id);
    expect(() => linkPrototypeProvider(canceled.id, accountId, password)).toThrow('OAUTH_FLOW_EXPIRED');
    const flow = startPrototypeProvider('GOOGLE', accountId);
    expect(() => linkPrototypeProvider(flow.id, 'another', password)).toThrow('OAUTH_FLOW_EXPIRED');
    failWrite = true;
    expect(() => linkPrototypeProvider(flow.id, accountId, password)).toThrow('ACCOUNT_STORAGE_UNAVAILABLE');
    failWrite = false; expect(linkedPrototypeProviders(accountId)).toEqual([]);
    vi.advanceTimersByTime(600_001);
    expect(() => linkPrototypeProvider(flow.id, accountId, password)).toThrow('OAUTH_FLOW_EXPIRED');
  });
  it.each(['GOOGLE', 'APPLE', 'TELEGRAM'] as const)('isolates two accounts with distinct identities on the same platform: %s', provider => {
    seed(); const other = '+84902345678@demo.nexgrid.ai';
    registerMockAuthCredential('+84', nextPhone, password);
    linkPrototypeProvider(startPrototypeProvider(provider, accountId, 'demo-primary').id, accountId, password);
    expect(() => linkPrototypeProvider(startPrototypeProvider(provider, other, 'demo-primary').id, other, password)).toThrow('OAUTH_IDENTITY_ALREADY_LINKED');
    linkPrototypeProvider(startPrototypeProvider(provider, other, 'demo-secondary').id, other, password);
    expect(signInPrototypeProvider(startPrototypeProvider(provider, null, 'demo-primary').id)).toMatchObject({ accountId });
    expect(signInPrototypeProvider(startPrototypeProvider(provider, null, 'demo-secondary').id)).toMatchObject({ accountId: other });
    expect(() => startPrototypeProvider(provider, null, 'invented' as any)).toThrow('OAUTH_IDENTITY_UNAVAILABLE');
  });
  it('never overwrites provider bindings or phone-change history after a transient registry read error', () => {
    seed(); linkPrototypeProvider(startPrototypeProvider('GOOGLE', accountId).id, accountId, password);
    const challenge = startPrototypePhone(accountId, '+84', nextPhone, password);
    confirmPrototypePhone(accountId, challenge.challengeNo, PROTOTYPE_DEMO_CODE, PROTOTYPE_DEMO_CODE);
    const before = JSON.stringify(storage.get(PROTOTYPE_USERS_KEY));
    const getStorage = uni.getStorageSync;
    let failOnce = true;
    uni.getStorageSync = ((key: string) => {
      if (key === PROTOTYPE_USERS_KEY && failOnce) { failOnce = false; throw new Error('temporarily unavailable'); }
      return getStorage(key);
    }) as typeof uni.getStorageSync;
    expect(provisionMockAuthCredential('+84', oldPhone, password)).toBe(false);
    expect(JSON.stringify(storage.get(PROTOTYPE_USERS_KEY))).toBe(before);
    expect(linkedPrototypeProviders(accountId)).toEqual(['GOOGLE']);
    expect(prototypeAccountPhone(accountId)?.phone).toBe(nextPhone);
    expect(prototypePhonePolicy(accountId).usedChanges).toBe(1);
  });
  it('preserves credentials when real H5 localStorage throws while uni would swallow the error', () => {
    seed(); linkPrototypeProvider(startPrototypeProvider('GOOGLE', accountId, 'demo-secondary').id, accountId, password);
    const challenge = startPrototypePhone(accountId, '+84', nextPhone, password);
    confirmPrototypePhone(accountId, challenge.challengeNo, PROTOTYPE_DEMO_CODE, PROTOTYPE_DEMO_CODE);
    const before = JSON.stringify(storage.get(PROTOTYPE_USERS_KEY));
    let failed = false;
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => {
      if (!failed && key === PROTOTYPE_USERS_KEY) { failed = true; throw new Error('H5 transient read'); }
      return storage.has(key) ? JSON.stringify({ type: 'object', data: storage.get(key) }) : null;
    } } });
    const set = vi.spyOn(uni, 'setStorageSync');
    expect(provisionMockAuthCredential('+84', oldPhone, password)).toBe(false);
    expect(set).not.toHaveBeenCalled(); expect(JSON.stringify(storage.get(PROTOTYPE_USERS_KEY))).toBe(before);
    expect(signInPrototypeProvider(startPrototypeProvider('GOOGLE', null, 'demo-secondary').id)).toMatchObject({ accountId, user: { phone: nextPhone } });
  });
  it('applies existing 2FA to provider login', () => {
    seed(); linkPrototypeProvider(startPrototypeProvider('GOOGLE', accountId).id, accountId, password);
    setMockAuthTwoFactor(accountId, true, password);
    provisionMockAuthCredential('+84', oldPhone, password);
    const flow = startPrototypeProvider('GOOGLE', null);
    expect(signInPrototypeProvider(flow.id)).toMatchObject({ kind: 'challenge' });
    expect(() => signInPrototypeProvider(flow.id, 'bad')).toThrow('USER_TWO_FACTOR_CHALLENGE_INVALID');
    expect(() => signInPrototypeProvider(flow.id, '654321')).toThrow('USER_TWO_FACTOR_CHALLENGE_INVALID');
    expect(signInPrototypeProvider(flow.id, '123456')).toMatchObject({ kind: 'authenticated', accountId });
  });
  it('changes the login alias without moving assets; old password/OTP identity cannot return', async () => {
    seed(); const assets = { balance: 142, orders: ['order-one'] }; storage.set('account-assets:' + accountId, assets);
    const challenge = startPrototypePhone(accountId, '+84', nextPhone, password);
    confirmPrototypePhone(accountId, challenge.challengeNo, PROTOTYPE_DEMO_CODE, PROTOTYPE_DEMO_CODE);
    expect(prototypeAccountPhone(accountId)).toEqual({ countryCode: '+84', phone: nextPhone });
    const api = createMockAuthApi(createSessionVault());
    await expect(api.login({ countryCode: '+84', phone: oldPhone, password })).rejects.toThrow('USER_INVALID_CREDENTIALS');
    const result = await api.login({ countryCode: '+84', phone: nextPhone, password });
    expect(mockAccountIdForUser(result.user)).toBe(accountId);
    expect(resolveAuthAccount('+84' + nextPhone)).toMatchObject({ ok: true, account: { accountId } });
    expect(resolveAuthAccount('+84' + oldPhone)).toEqual({ ok: true, account: null });
    expect(storage.get('account-assets:' + accountId)).toEqual(assets);
    expect(prototypePhonePolicy(accountId).usedChanges).toBe(1);
    provisionMockAuthCredential('+84', oldPhone, password);
    await expect(api.login({ countryCode: '+84', phone: oldPhone, password })).rejects.toThrow('USER_INVALID_CREDENTIALS');
  });
  it('requires both codes and preserves the original identity on cancellation/storage failure', () => {
    seed(); const before = storage.get(PROTOTYPE_USERS_KEY);
    let challenge = startPrototypePhone(accountId, '+84', nextPhone, password);
    expect(() => confirmPrototypePhone(accountId, challenge.challengeNo, '123456', 'bad')).toThrow('USER_PHONE_CHANGE_CODE_INVALID');
    expect(() => confirmPrototypePhone(accountId, challenge.challengeNo, '123456', '654321')).toThrow('USER_PHONE_CHANGE_CODE_INVALID');
    expect(() => confirmPrototypePhone('another', challenge.challengeNo, '123456', '123456')).toThrow('USER_PHONE_CHANGE_EXPIRED');
    failWrite = true;
    expect(() => confirmPrototypePhone(accountId, challenge.challengeNo, '123456', '123456')).toThrow('ACCOUNT_STORAGE_UNAVAILABLE');
    failWrite = false; expect(storage.get(PROTOTYPE_USERS_KEY)).toEqual(before);
    cancelPrototypePhone(challenge.challengeNo);
    expect(() => confirmPrototypePhone(accountId, challenge.challengeNo, '123456', '123456')).toThrow('USER_PHONE_CHANGE_EXPIRED');
  });
  it('uses the verified configurable change allowance and rejects duplicate numbers', () => {
    seed(); expect(prototypePhonePolicy(accountId)).toMatchObject({ windowDays: 365, maxChanges: 5, usedChanges: 0 });
    registerMockAuthCredential('+84', nextPhone, password);
    expect(() => startPrototypePhone(accountId, '+84', nextPhone, password)).toThrow('USER_PHONE_ALREADY_IN_USE');
    storage.set(PROTOTYPE_PHONE_POLICY_KEY, { windowDays: 10, maxChanges: 1 });
    const challenge = startPrototypePhone(accountId, '+86', '13800138000', password);
    confirmPrototypePhone(accountId, challenge.challengeNo, '123456', '123456');
    expect(prototypePhonePolicy(accountId)).toMatchObject({ remainingChanges: 0, usedChanges: 1 });
    expect(() => startPrototypePhone(accountId, '+86', '13900139000', password)).toThrow('USER_PHONE_CHANGE_LIMIT_REACHED');
  });
  it('links the existing phone-less prototype account to the same account', () => {
    const challenge = startPrototypePhone('default', '+84', nextPhone);
    confirmPrototypePhone('default', challenge.challengeNo, '123456');
    expect(prototypeAccountPhone('default')).toEqual({ countryCode: '+84', phone: nextPhone });
    expect(resolveAuthAccount('+84' + nextPhone)).toMatchObject({ account: { accountId: 'default' } });
  });
});

it('preserves attribution through privacy and rejects an unsafe return', () => {
  const href = privacyPolicyHref('/pages/register/register', 'NX-ABC123');
  expect(resolvePrivacyReturn(new URLSearchParams(href.split('?')[1]).get('return'))).toBe('/pages/register/register?ref=NX-ABC123');
  expect(resolvePrivacyReturn('https://outside.example')).toBe('/pages/onboarding/intro');
  expect(resolvePostSignInRoute({ onboardingComplete: false, requiresRecalibration: true, returnTo: '/pages/register/register' })).toBe('/pages/index/index');
});
it('does not promise a disabled reward', () => {
  const rewards = { enabled: false, welcomeGift: { usdtAmount: 5, nexAmount: 20 } } as any;
  expect(visibleReferralGift(rewards)).toEqual({ usdtAmount: 0, nexAmount: 0 });
  expect(newcomerSubtitleKind(false, 5, 20)).toBe('gated');
});
it('reads only supplied published privacy text and supports retry after it becomes available', async () => {
  await expect(readPrototypePrivacyPolicy('en')).rejects.toThrow('PRIVACY_POLICY_UNAVAILABLE');
  storage.set(PROTOTYPE_PRIVACY_POLICY_KEY, { en: { status: 'PUBLISHED', version: '1', locale: 'en', hero: 'Approved text', sections: [{ id: 'one', title: 'Title', body: 'Provided body', order: 1 }] } });
  expect(await readPrototypePrivacyPolicy('en')).toMatchObject({ version: '1', sections: [{ id: 'one' }] });
  await expect(readPrototypePrivacyPolicy('zh')).rejects.toThrow();
});
