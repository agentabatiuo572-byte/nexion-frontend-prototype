import { ApiError } from "@/api/errors";
import { readPrototypeStorage, writePrototypeStorage } from "@/lib/prototype-storage";
import type { AuthRegistrationContext } from "@/store/auth-account";

/** One local transaction owns credential aliases and linked identities. Wallet keys never change. */
export interface PrototypeUserRecord {
  userId: number;
  password: string | null;
  nickname: string;
  twoFactorEnabled?: boolean;
  accountId?: string;
  countryCode?: string;
  phone?: string;
  providers?: Array<"GOOGLE" | "APPLE" | "TELEGRAM">;
  providerIdentities?: Array<{ provider: "GOOGLE" | "APPLE" | "TELEGRAM"; subject: string }>;
  phoneChanges?: number[];
  registration?: { status: "pending" | "active"; createdAt: number; onboardingComplete: boolean; receiptPending?: boolean; context: AuthRegistrationContext };
}
export interface PrototypeUserRegistry { schema: 1; users: Record<string, PrototypeUserRecord> }
export const PROTOTYPE_USERS_KEY = "nexgrid-mock-auth-users-v1";

export function readPrototypeUsers(): PrototypeUserRegistry {
  let raw: PrototypeUserRegistry | undefined;
  try { raw = readPrototypeStorage<PrototypeUserRegistry>(PROTOTYPE_USERS_KEY); }
  catch { throw new ApiError({ kind: "protocol", message: "ACCOUNT_STORAGE_UNAVAILABLE" }); }
  if (raw === undefined) return { schema: 1, users: {} };
  if (!raw || typeof raw !== 'object' || raw.schema !== 1 || !raw.users || typeof raw.users !== "object" || Array.isArray(raw.users))
    throw new ApiError({ kind: "protocol", message: "ACCOUNT_STORAGE_UNAVAILABLE" });
  return JSON.parse(JSON.stringify(raw));
}
export function writePrototypeUsers(registry: PrototypeUserRegistry): void {
  try {
    writePrototypeStorage(PROTOTYPE_USERS_KEY, registry);
  } catch { throw new ApiError({ kind: "protocol", message: "ACCOUNT_STORAGE_UNAVAILABLE" }); }
}
export function originalAccountId(identity: string, record: PrototypeUserRecord): string {
  return record.accountId ?? `${identity.replace(/\s+/g, "")}@demo.nexgrid.ai`.toLowerCase();
}
export function currentPrototypePhone(identity: string, record: PrototypeUserRecord): { countryCode: string; phone: string } {
  if (record.countryCode !== undefined && record.phone !== undefined) return { countryCode: record.countryCode, phone: record.phone };
  const [countryCode = "", phone = ""] = identity.split(" ");
  return { countryCode, phone };
}
export function findPrototypePhone(registry: PrototypeUserRegistry, countryCode: string, phone: string) {
  return Object.entries(registry.users).find(([identity, record]) => {
    const value = currentPrototypePhone(identity, record);
    return value.countryCode === countryCode && value.phone === phone;
  });
}
export function findPrototypeAccount(registry: PrototypeUserRegistry, accountId: string) {
  return Object.entries(registry.users).find(([identity, record]) =>
    originalAccountId(identity, record) === accountId.toLowerCase() || `user:${record.userId}` === accountId);
}
export function prototypePhoneDirectory(phoneE164: string): { accountId: string; originalPhone: string } | "retired" | null {
  const registry = readPrototypeUsers();
  for (const [identity, record] of Object.entries(registry.users)) {
    const current = currentPrototypePhone(identity, record);
    if (`${current.countryCode}${current.phone}` === phoneE164)
      return { accountId: originalAccountId(identity, record), originalPhone: identity.replace(/\s+/g, "") };
  }
  return Object.keys(registry.users).some(identity => identity.replace(/\s+/g, "") === phoneE164) ? "retired" : null;
}
