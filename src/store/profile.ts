import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { defaultNickname } from "@/lib/nickname";
import { remoteApiEnabled } from "@/api/runtime";
import { profileApi } from "@/api/runtime";
import { isAmbiguousOutcome } from "@/api/errors";
import type { UserSession } from "@/api/contracts";
import { acquireProfileCommandKey, finishProfileCommand } from "@/lib/profile-command-key";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";

// Ported from Nexion-prototype/lib/store/profile.ts (zustand → Pinia).
// 旧设备级单键 "nexgrid-profile-v1" 废弃(存量无账号归属,mock 可重建);资料按账号分行。
const ACCOUNTS_KEY = "nexgrid-profile-accounts-v1"; // { [accountKey]: Persisted }

// region/timezone 不再持久:2026-07-15 起由设备派生(lib/device-region.ts),资料页只读展示。
interface Persisted {
  displayName: string;
  avatarSeed: string;
}

function defaultSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function hydrate(accountKey: string): Persisted {
  const row = readAccountRow<Persisted>(ACCOUNTS_KEY, accountKey);
  if (row && row.displayName) return row;
  // 默认昵称按账号 key 确定性派生(词库构造,2026-07-15 昵称治理:无自由文本)。
  return {
    displayName: defaultNickname(accountKey),
    avatarSeed: "alex-seed",
  };
}

export const useProfile = defineStore("profile", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);
  // Remote profile fields are an auth-session projection.  Never render a
  // browser seed before that projection arrives.
  const init = remoteApiEnabled ? { displayName: "", avatarSeed: "" } : hydrate(boundKey);
  const displayName = ref(init.displayName);
  const avatarSeed = ref(init.avatarSeed);
  const phoneE164 = ref("");
  const nicknameCandidates = ref<string[]>([]);

  function persist() {
    writeAccountRow<Persisted>(ACCOUNTS_KEY, boundKey, {
      displayName: displayName.value,
      avatarSeed: avatarSeed.value,
    });
  }

  /** 账号切换重绑:装载该账号的资料(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    remoteAccountEpoch.bind(boundKey);
    // A server session must never inherit a prior browser profile row. The
    // authoritative auth response is projected immediately after this bind;
    // until then leave an honest blank state rather than a demo identity.
    if (remoteApiEnabled) {
      displayName.value = "";
      avatarSeed.value = "";
      phoneE164.value = "";
      nicknameCandidates.value = [];
      return;
    }
    const next = hydrate(boundKey);
    displayName.value = next.displayName;
    avatarSeed.value = next.avatarSeed;
    phoneE164.value = "";
  }

  /** Ephemeral server projection: authentication, not local storage, owns it. */
  function projectServerIdentity(identity: UserSession) {
    if (!remoteApiEnabled) return;
    displayName.value = identity.nickname;
    avatarSeed.value = `user:${identity.userId}`;
    phoneE164.value = `${identity.countryCode}${identity.phone}`;
  }

  async function refreshNicknameCandidates(): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    const request = remoteAccountEpoch.snapshot();
    try {
      const candidates = await profileApi.nicknameCandidates();
      if (!remoteAccountEpoch.isCurrent(request)) return true;
      nicknameCandidates.value = candidates;
      return true;
    } catch {
      if (!remoteAccountEpoch.isCurrent(request)) return true;
      nicknameCandidates.value = [];
      return false;
    }
  }

  async function setDisplayName(v: string): Promise<boolean> {
    if (remoteApiEnabled) {
      const expected = displayName.value;
      const desired = v.trim();
      if (!expected || !desired || desired === expected) return false;
      const commandKey = acquireProfileCommandKey(boundKey, expected, desired);
      const request = remoteAccountEpoch.snapshot();
      try {
        const updated = await profileApi.updateNickname(expected, desired, commandKey);
        if (!remoteAccountEpoch.isCurrent(request)) return false;
        displayName.value = updated;
        finishProfileCommand(boundKey, expected, desired);
        return true;
      } catch (error) {
        if (!isAmbiguousOutcome(error)) finishProfileCommand(boundKey, expected, desired);
        throw error;
      }
    }
    displayName.value = v;
    persist();
    return true;
  }
  function regenerateAvatar() {
    if (remoteApiEnabled) return false;
    avatarSeed.value = defaultSeed();
    persist();
    return true;
  }

  return {
    displayName, avatarSeed, phoneE164, nicknameCandidates,
    setDisplayName, regenerateAvatar, bindAccount, projectServerIdentity, refreshNicknameCandidates,
  };
});
