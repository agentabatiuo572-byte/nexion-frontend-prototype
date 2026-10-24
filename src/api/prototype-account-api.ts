import { ApiError } from "./errors";
import type { UserSession } from "./contracts";
import { validateNationalPhone, sanitizePhoneInput } from "@/auth/phone-number";
import { resolveAuthAccount } from "@/store/auth-account";
import { readPrototypeUsers, writePrototypeUsers, findPrototypeAccount, findPrototypePhone, currentPrototypePhone, originalAccountId, PROTOTYPE_USERS_KEY, type PrototypeUserRecord } from "@/auth/prototype-identity";
import { PROTOTYPE_DEMO_CODE } from "@/auth/prototype-demo";
import { readPrototypeStorage, writePrototypeStorageSnapshot } from "@/lib/prototype-storage";
import { registerPrototypeProvider } from "@/auth/prototype-provider-registration";
import type { AuthRegistrationContext } from "@/store/auth-account";

export type PrototypeProvider = "GOOGLE" | "APPLE" | "TELEGRAM";
export const prototypeProviders: PrototypeProvider[] = ["GOOGLE", "APPLE", "TELEGRAM"];
export const prototypeProviderSubjects = ["demo-primary", "demo-secondary"] as const;
export type PrototypeProviderSubject = typeof prototypeProviderSubjects[number];
const fail = (message: string): never => { throw new ApiError({ kind: "business", message }); };
let sequence = 0;
const providerFlows = new Map<string, { provider: PrototypeProvider; subject: PrototypeProviderSubject; owner: string | null; sponsorCode: string | null; expiresAt: number }>();
const phoneFlows = new Map<string, { owner: string; countryCode: string; phone: string; previous: string; expiresAt: number; change: boolean }>();
const phoneSentAt = new Map<string, number>();
/** Backend test 64c1b23a, AppPhoneNumberChangeService.policy(): 365 days / 5 changes. */
export const PROTOTYPE_PHONE_POLICY_KEY = "nexgrid-prototype-phone-change-policy";
export function prototypePhonePolicy(accountId: string) {
  const configured = readPrototypeStorage<{ windowDays?: number; maxChanges?: number }>(PROTOTYPE_PHONE_POLICY_KEY) ?? {};
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return fail('ACCOUNT_STORAGE_UNAVAILABLE');
  const windowDays = typeof configured.windowDays === 'number' && Number.isInteger(configured.windowDays) && configured.windowDays >= 1 && configured.windowDays <= 3650 ? configured.windowDays : 365;
  const maxChanges = typeof configured.maxChanges === 'number' && Number.isInteger(configured.maxChanges) && configured.maxChanges >= 1 && configured.maxChanges <= 20 ? configured.maxChanges : 5;
  const changes = (findPrototypeAccount(readPrototypeUsers(), accountId)?.[1].phoneChanges ?? [])
    .filter(value => value > Date.now() - windowDays * 86_400_000).sort((a, b) => a - b);
  return { windowDays, maxChanges, usedChanges: changes.length, remainingChanges: Math.max(0, maxChanges - changes.length),
    nextAvailableAt: changes.length >= maxChanges ? new Date(changes[0] + windowDays * 86_400_000).toISOString() : "" };
}
export interface PrototypeProviderFlow { id: string; provider: PrototypeProvider; subject: PrototypeProviderSubject; displayName: string }
export interface PrototypePhoneChallenge { challengeNo: string; resendAfterSec: number; oldPhoneMasked: string; newPhoneMasked: string }
const mask = (phone: string) => `••• ${phone.slice(-4)}`;
function passwordMatches(record: { password: string | null }, password: string) {
  if (!password || record.password !== password) fail("OAUTH_LINK_PASSWORD_INVALID");
}
function providerIdentities(record: PrototypeUserRecord) {
  // The first local adapter had one identity per platform. Keep that exact
  // identity available while new bindings persist both provider and subject.
  return [...(record.providerIdentities ?? []), ...(record.providers ?? []).map(provider => ({ provider, subject: prototypeProviderSubjects[0] }))];
}
export function linkedPrototypeProviders(accountId: string): PrototypeProvider[] {
  const record = findPrototypeAccount(readPrototypeUsers(), accountId)?.[1];
  return record ? [...new Set(providerIdentities(record).map(identity => identity.provider))] : [];
}
export function startPrototypeProvider(provider: PrototypeProvider, owner: string | null, subject: PrototypeProviderSubject = prototypeProviderSubjects[0], sponsorCode: string | null = null): PrototypeProviderFlow {
  if (!prototypeProviders.includes(provider)) fail("OAUTH_PROVIDER_UNAVAILABLE");
  if (!prototypeProviderSubjects.includes(subject)) fail("OAUTH_IDENTITY_UNAVAILABLE");
  const id = `provider-${++sequence}`;
  providerFlows.set(id, { provider, subject, owner, sponsorCode: owner === null ? sponsorCode : null, expiresAt: Date.now() + 600_000 });
  return { id, provider, subject, displayName: provider === "GOOGLE" ? "Google" : provider === "APPLE" ? "Apple" : "Telegram" };
}
export function cancelPrototypeProvider(id: string) { providerFlows.delete(id); }
function providerFlow(id: string, owner: string | null) {
  const flow = providerFlows.get(id);
  if (!flow || flow.expiresAt <= Date.now() || flow.owner !== owner) return fail("OAUTH_FLOW_EXPIRED");
  return flow;
}
export function linkPrototypeProvider(id: string, accountId: string, password: string): void {
  const flow = providerFlow(id, accountId);
  const registry = readPrototypeUsers();
  const account = findPrototypeAccount(registry, accountId);
  if (!account) fail("OAUTH_LINK_PASSWORD_INVALID");
  passwordMatches(account![1], password);
  if (Object.values(registry.users).some(record => providerIdentities(record).some(identity => identity.provider === flow.provider && identity.subject === flow.subject))) fail("OAUTH_IDENTITY_ALREADY_LINKED");
  if (providerIdentities(account![1]).some(identity => identity.provider === flow.provider)) fail("OAUTH_IDENTITY_ALREADY_LINKED");
  account![1].providerIdentities = [...(account![1].providerIdentities ?? []), { provider: flow.provider, subject: flow.subject }];
  writePrototypeUsers(registry);
  providerFlows.delete(id);
}
export function signInPrototypeProvider(id: string, code?: string):
  { kind: "challenge"; deliveryHint: string } | { kind: "authenticated"; accountId: string; user: UserSession; registrationReceipt?: AuthRegistrationContext } {
  const flow = providerFlow(id, null);
  let account = Object.entries(readPrototypeUsers().users).find(([, record]) => providerIdentities(record).some(identity => identity.provider === flow.provider && identity.subject === flow.subject));
  const needsRegistration = !account || account[1].registration?.status === "pending";
  if (needsRegistration) account = registerPrototypeProvider(flow.provider, flow.subject, flow.sponsorCode);
  if (!account) return fail("ACCOUNT_STORAGE_UNAVAILABLE");
  const [identity, record] = account;
  const phone = currentPrototypePhone(identity, record);
  if (record.twoFactorEnabled && code === undefined) return { kind: "challenge", deliveryHint: mask(phone.phone) };
  if (record.twoFactorEnabled && code !== PROTOTYPE_DEMO_CODE) return fail("USER_TWO_FACTOR_CHALLENGE_INVALID");
  providerFlows.delete(id);
  return { kind: "authenticated", accountId: originalAccountId(identity, record), user: { ...phone, userId: record.userId, nickname: record.nickname },
    ...(record.registration?.receiptPending ? { registrationReceipt: record.registration.context } : {}) };
}
/** Called only after the matching local session is accepted. An unavailable
 * acknowledgement leaves the durable receipt pending; it must never revoke an
 * already accepted login or replay registration/gift mutations. */
export function acknowledgePrototypeProviderRegistration(accountId: string): boolean {
  try {
    const registry = readPrototypeUsers();
    const record = findPrototypeAccount(registry, accountId)?.[1];
    if (!record?.registration || record.registration.status !== "active") return false;
    if (!record.registration.receiptPending) return true;
    record.registration.receiptPending = false;
    writePrototypeStorageSnapshot(PROTOTYPE_USERS_KEY, registry);
    return true;
  } catch { return false; }
}
export function prototypeAccountPhone(accountId: string) {
  const account = findPrototypeAccount(readPrototypeUsers(), accountId);
  return account ? currentPrototypePhone(account[0], account[1]) : null;
}
export function cancelPrototypePhone(challengeNo: string) { phoneFlows.delete(challengeNo); }
export function startPrototypePhone(accountId: string, countryCode: string, rawPhone: string, password = ""): PrototypePhoneChallenge {
  const phone = sanitizePhoneInput(rawPhone);
  if (!validateNationalPhone(countryCode, phone)) return fail("USER_PHONE_INVALID");
  const registry = readPrototypeUsers();
  const account = findPrototypeAccount(registry, accountId);
  const previous = account ? currentPrototypePhone(account[0], account[1]) : null;
  if (previous?.countryCode === countryCode && previous.phone === phone) return fail("USER_PHONE_UNCHANGED");
  if (findPrototypePhone(registry, countryCode, phone)) return fail("USER_PHONE_ALREADY_IN_USE");
  const registered = resolveAuthAccount(`${countryCode}${phone}`);
  if (!registered.ok) return fail("ACCOUNT_STORAGE_UNAVAILABLE");
  if (registered.account) return fail("USER_PHONE_ALREADY_IN_USE");
  const change = !!previous?.phone;
  if (change) {
    passwordMatches(account![1], password);
    if (!prototypePhonePolicy(accountId).remainingChanges) return fail("USER_PHONE_CHANGE_LIMIT_REACHED");
  }
  if (Date.now() - (phoneSentAt.get(accountId) ?? 0) < 60_000) return fail("USER_PHONE_CHANGE_CHALLENGE_RATE_LIMITED");
  const challengeNo = `phone-${++sequence}`;
  phoneFlows.set(challengeNo, { owner: accountId, countryCode, phone, previous: previous ? `${previous.countryCode}${previous.phone}` : "", expiresAt: Date.now() + 300_000, change });
  phoneSentAt.set(accountId, Date.now());
  return { challengeNo, resendAfterSec: 60, oldPhoneMasked: mask(previous?.phone ?? ""), newPhoneMasked: mask(phone) };
}
export function confirmPrototypePhone(accountId: string, challengeNo: string, newCode: string, oldCode = ""): void {
  const flow = phoneFlows.get(challengeNo);
  if (!flow || flow.owner !== accountId || flow.expiresAt <= Date.now()) return fail("USER_PHONE_CHANGE_EXPIRED");
  if (newCode !== PROTOTYPE_DEMO_CODE || flow.change && oldCode !== PROTOTYPE_DEMO_CODE) return fail("USER_PHONE_CHANGE_CODE_INVALID");
  if (flow.change && !prototypePhonePolicy(accountId).remainingChanges) return fail("USER_PHONE_CHANGE_LIMIT_REACHED");
  const registry = readPrototypeUsers();
  let account = findPrototypeAccount(registry, accountId);
  const previous = account ? currentPrototypePhone(account[0], account[1]) : null;
  if ((previous ? `${previous.countryCode}${previous.phone}` : "") !== flow.previous) return fail("USER_PHONE_CHANGE_EXPIRED");
  if (findPrototypePhone(registry, flow.countryCode, flow.phone)) return fail("USER_PHONE_ALREADY_IN_USE");
  const registered = resolveAuthAccount(`${flow.countryCode}${flow.phone}`);
  if (!registered.ok) return fail("ACCOUNT_STORAGE_UNAVAILABLE");
  if (registered.account) return fail("USER_PHONE_ALREADY_IN_USE");
  if (!account) {
    // The existing prototype's initial account has no credential. Binding adds an
    // OTP sign-in alias to that same account; it never provisions a new wallet.
    let userId = 5381;
    for (const char of accountId) userId = ((userId * 33) ^ char.charCodeAt(0)) >>> 0;
    const key = `account:${accountId}`;
    registry.users[key] = { userId: userId % 2_000_000_000 + 1_000_000, password: null, nickname: flow.phone.slice(-4), accountId };
    account = [key, registry.users[key]];
  }
  account[1].accountId = originalAccountId(account[0], account[1]);
  account[1].countryCode = flow.countryCode;
  account[1].phone = flow.phone;
  if (flow.change) account[1].phoneChanges = [...(account[1].phoneChanges ?? []), Date.now()];
  writePrototypeUsers(registry);
  phoneFlows.delete(challengeNo);
}
