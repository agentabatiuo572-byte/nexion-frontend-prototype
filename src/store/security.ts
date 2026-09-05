import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { changeMockAuthPassword, mockAuthSecurityState, setMockAuthTwoFactor } from "@/api/mock-auth-api";
import { ApiError } from "@/api/errors";
import { remoteApiEnabled } from "@/api/runtime";

// Ported from Nexion-prototype/lib/store/security.ts (zustand+persist → Pinia).
// MOCK-ONLY: password hash never lives client-side; 2FA is local mock state.
// Production reads/writes via /api/me/* (see action JSDocs). Persisted to uni
// storage so toggles survive a refresh.
// 会话/设备列表不在此 store:安全页渲染 session.ts 的账号级 activeSessions(单源真列表);
// 本 store 原有的 mock sessions + revokeSession/revokeAllOthers 全站零消费者,已删(2026-07-10)。
// 旧设备级单键 "nexgrid-security-v1" 废弃(存量无账号归属,mock 可重建);安全设置按账号分行。
const ACCOUNTS_KEY = "nexgrid-security-accounts-v1"; // { [accountKey]: Persisted }

interface Persisted {
  passwordChangedAt: number;
  twoFactorEnabled: boolean;
}

function hydrate(accountKey: string): Persisted {
  const row = readAccountRow<Persisted>(ACCOUNTS_KEY, accountKey);
  const mockState = remoteApiEnabled ? null : mockAuthSecurityState(accountKey);
  if (row && typeof row.twoFactorEnabled === "boolean") {
    return {
      passwordChangedAt: row.passwordChangedAt,
      twoFactorEnabled: mockState?.twoFactorEnabled ?? row.twoFactorEnabled,
    };
  }
  return {
    passwordChangedAt: Date.now() - 21 * 24 * 3600 * 1000,
    twoFactorEnabled: false,
  };
}

export const useSecurity = defineStore("security", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const init = hydrate(boundKey);
  const passwordChangedAt = ref(init.passwordChangedAt);
  const twoFactorEnabled = ref(init.twoFactorEnabled);

  function persist() {
    writeAccountRow<Persisted>(ACCOUNTS_KEY, boundKey, {
      passwordChangedAt: passwordChangedAt.value,
      twoFactorEnabled: twoFactorEnabled.value,
    });
  }

  /** 账号切换重绑:装载该账号的安全设置(2FA / 改密时间)(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    const next = hydrate(boundKey);
    passwordChangedAt.value = next.passwordChangedAt;
    twoFactorEnabled.value = next.twoFactorEnabled;
  }

  // ⚠️ MOCK-ONLY: production POST /api/me/password { oldPassword, newPassword }
  // — server validates old, hashes new, invalidates other sessions. Client
  // never stores the hash; the param keeps the signature stable for cutover.
  function changePassword(currentPassword: string, newPassword?: string) {
    const desired = newPassword ?? "";
    if (remoteApiEnabled) {
      // Remote pages call accountApi directly; retain a no-op-compatible
      // branch for legacy callers without pretending local state is authority.
      if (!desired) throw new ApiError({ kind: "business", message: "USER_INVALID_CREDENTIALS" });
    } else {
      changeMockAuthPassword(boundKey, currentPassword, desired);
    }
    passwordChangedAt.value = Date.now();
    persist();
  }

  function setTwoFactor(on: boolean, currentPassword = "") {
    if (!remoteApiEnabled) setMockAuthTwoFactor(boundKey, on, currentPassword);
    twoFactorEnabled.value = on;
    persist();
  }

  return {
    passwordChangedAt,
    twoFactorEnabled,
    changePassword,
    setTwoFactor,
    bindAccount,
  };
});
