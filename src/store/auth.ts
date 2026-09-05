import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "@/store/account-cloud";
import { isPhoneAuthAccountId, resolveAuthAccountById } from "@/store/auth-account";
import { remoteApiEnabled } from "@/api/runtime";

// Ported from Nexion-prototype/lib/store/auth.ts (zustand → Pinia).
// Gates main-app access: new sign-ups must finish onboarding
// (intro → estimator → connect) before onboardingComplete flips true.
const STORAGE_KEY = "nexgrid-auth-v1";

interface Persisted {
  isAuthenticated: boolean;
  email: string;
  accountId?: string;
  onboardingComplete: boolean;
}

/**
 * This deliberately recognizes only a non-secret routing hint from the
 * existing auth record. It never restores authority: server mode still needs
 * an in-memory sessionVault before protected UI may render.
 */
export function hasPersistedServerAuthenticatedAccountTrace(): boolean {
  try {
    let record = uni.getStorageSync(STORAGE_KEY) as unknown;
    // Uni H5 may expose its typed-storage envelope as an object or one/more
    // serialized envelopes. Unwrap only the bounded, known `data` wrapper;
    // malformed values remain a cold-start (false) rather than granting access.
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof record === "string") {
        try {
          record = JSON.parse(record) as unknown;
        } catch {
          return false;
        }
      }
      if (record && typeof record === "object" && "data" in record) {
        record = (record as { data?: unknown }).data;
        continue;
      }
      break;
    }
    if (typeof record === "string") {
      try {
        record = JSON.parse(record) as unknown;
      } catch {
        return false;
      }
    }
    return !!record
      && typeof record === "object"
      && (record as Partial<Persisted>).isAuthenticated === true
      && typeof (record as Partial<Persisted>).accountId === "string"
      && (record as Partial<Persisted>).accountId!.startsWith("user:");
  } catch {
    return false;
  }
}

function hydrate(): Persisted {
  // A browser-owned auth record is only a non-secret routing hint in server
  // mode. It cannot recreate an in-memory Bearer session after an H5 reload.
  // Keep the hint readable through hasPersistedServerAuthenticatedAccountTrace,
  // but start closed until password/2FA completes again.
  if (remoteApiEnabled) {
    return { isAuthenticated: false, email: "", accountId: "default", onboardingComplete: false };
  }
  try {
    const s = uni.getStorageSync(STORAGE_KEY) as Persisted | "";
    if (s && typeof s === "object") {
      const persisted: Persisted = {
        isAuthenticated: !!s.isAuthenticated,
        email: s.email || "",
        accountId: s.accountId || normalizeAccountKey(s.email || "default"),
        // v1 persisted users predate the onboarding gate — treat as onboarded.
        onboardingComplete: s.onboardingComplete === undefined ? true : !!s.onboardingComplete,
      };
      if (!persisted.isAuthenticated) return persisted;
      // 手机号账号的 pending/onboarding 事实只认认证目录；旧 auth storage
      // 即使在中断时留下 true，也不能让冷启动绕过注册或 onboarding。
      const identity = persisted.accountId || persisted.email;
      const directory = resolveAuthAccountById(identity);
      if (
        !directory.ok
        || directory.account?.status === "pending"
        || (isPhoneAuthAccountId(identity) && directory.account?.status !== "active")
      ) {
        return { isAuthenticated: false, email: "", accountId: "default", onboardingComplete: false };
      }
      return directory.account
        ? { ...persisted, onboardingComplete: directory.account.onboardingComplete }
        : persisted;
    }
  } catch {
    // first run
  }
  // Demo-friendly default: a fresh install is treated as an authenticated,
  // already-onboarded user so the prototype opens straight to the home tab
  // (the route guard in App.vue stays dormant). Only an explicit signOut()
  // flips this to a gated state, after which the guard routes to onboarding.
  // Production seeds this from the real session (GET /api/auth/session).
  return { isAuthenticated: true, email: "", accountId: "default", onboardingComplete: true };
}

export const useAuth = defineStore("auth", () => {
  const init = hydrate();
  const isAuthenticated = ref(init.isAuthenticated);
  const email = ref(init.email);
  const accountId = ref(init.accountId || normalizeAccountKey(init.email || "default"));
  const onboardingComplete = ref(init.onboardingComplete);

  function persist(): boolean {
    try {
      uni.setStorageSync(STORAGE_KEY, {
        isAuthenticated: isAuthenticated.value,
        email: email.value,
        accountId: accountId.value,
        onboardingComplete: onboardingComplete.value,
      });
      return true;
    } catch {
      // storage unavailable
      return false;
    }
  }

  // Returning users normally have onboarded. Phone-directory callers pass the
  // canonical flag so an interrupted first-time account resumes onboarding.
  function signIn(e: string, completedOnboarding = true): boolean {
    const previous: Persisted = {
      isAuthenticated: isAuthenticated.value,
      email: email.value,
      accountId: accountId.value,
      onboardingComplete: onboardingComplete.value,
    };
    isAuthenticated.value = true;
    email.value = e;
    accountId.value = normalizeAccountKey(e);
    onboardingComplete.value = completedOnboarding;
    if (persist()) return true;
    isAuthenticated.value = previous.isAuthenticated;
    email.value = previous.email;
    accountId.value = previous.accountId ?? "default";
    onboardingComplete.value = previous.onboardingComplete;
    return false;
  }
  // New sign-ups must complete onboarding before the main app unlocks.
  function signUp(e: string): boolean {
    const previous: Persisted = {
      isAuthenticated: isAuthenticated.value,
      email: email.value,
      accountId: accountId.value,
      onboardingComplete: onboardingComplete.value,
    };
    isAuthenticated.value = true;
    email.value = e;
    accountId.value = normalizeAccountKey(e);
    onboardingComplete.value = false;
    if (persist()) return true;
    isAuthenticated.value = previous.isAuthenticated;
    email.value = previous.email;
    accountId.value = previous.accountId ?? "default";
    onboardingComplete.value = previous.onboardingComplete;
    return false;
  }
  // Final onboarding step (connect "Activate phone compute") calls this.
  function completeOnboarding(): boolean {
    const previous = onboardingComplete.value;
    onboardingComplete.value = true;
    if (persist()) return true;
    onboardingComplete.value = previous;
    return false;
  }
  function requireOnboarding(): boolean {
    const previous = onboardingComplete.value;
    onboardingComplete.value = false;
    if (persist()) return true;
    onboardingComplete.value = previous;
    return false;
  }
  function signOut() {
    isAuthenticated.value = false;
    email.value = "";
    accountId.value = "default";
    onboardingComplete.value = false;
    persist();
  }

  return { isAuthenticated, email, accountId, onboardingComplete, signIn, signUp, completeOnboarding, requireOnboarding, signOut };
});
