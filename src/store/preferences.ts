import { defineStore } from "pinia";
import { ref } from "vue";
import { notificationPreferencesApi, remoteApiEnabled } from "@/api/runtime";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { accountErrorMessageKey, type AccountErrorMessageKey } from "@/lib/account-error-message";

/**
 * User preferences. Ported from Nexion-prototype/lib/store/preferences.ts
 * (zustand persist → Pinia + uni storage). Lightweight toggles persisted
 * across sessions: sound, haptics, and per-kind notification mute flags.
 *
 * NotifKind mirrors lib/v3/notifications NotifKind (kept local to avoid a
 * store→store import; backend-replaceable shape).
 */

export type NotifKind = "commission" | "team" | "staking" | "market" | "genesis" | "system";

const ALL_NOTIF_KINDS: NotifKind[] = ["commission", "team", "staking", "market", "genesis", "system"];

/**
 * 简报 #214:关键合规通知不可禁用。
 *
 * `system` 这一类的界面标签就是「系统 / 合规 / 监管」,而页脚一直声明「关键合规通知不可禁用」——
 * 但此前它和其它类一样能被关掉,声明与行为直接矛盾:用户以为合规通知仍然送达,实际已被静音。
 * 约束落在数据层(而不是只把开关画灰):即便有人从别处调用 toggle,也关不掉它。
 */
const MANDATORY_NOTIF_KINDS: readonly NotifKind[] = ["system"];
export function isMandatoryNotifKind(k: NotifKind): boolean {
  return MANDATORY_NOTIF_KINDS.includes(k);
}

type NotifPrefs = Record<NotifKind, boolean>;

const STORAGE_KEY = "nexgrid-preferences-v1";

function defaultNotifPrefs(): NotifPrefs {
  return ALL_NOTIF_KINDS.reduce((acc, k) => {
    acc[k] = true;
    return acc;
  }, {} as NotifPrefs);
}

interface PrefsData {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  notifPrefs: NotifPrefs;
}

function hydrate(): PrefsData {
  try {
    const s = uni.getStorageSync(STORAGE_KEY) as Partial<PrefsData> | "";
    if (s && typeof s === "object") {
      const np = s.notifPrefs && typeof s.notifPrefs === "object" ? s.notifPrefs : {};
      const merged = defaultNotifPrefs();
      for (const k of ALL_NOTIF_KINDS) {
        if (typeof (np as Record<string, unknown>)[k] === "boolean") {
          merged[k] = (np as NotifPrefs)[k];
        }
      }
      return {
        soundEnabled: typeof s.soundEnabled === "boolean" ? s.soundEnabled : false,
        hapticsEnabled: typeof s.hapticsEnabled === "boolean" ? s.hapticsEnabled : true,
        notifPrefs: merged,
      };
    }
  } catch {
    // first run
  }
  return { soundEnabled: false, hapticsEnabled: true, notifPrefs: defaultNotifPrefs() };
}

export const usePreferences = defineStore("preferences", () => {
  const init = hydrate();
  const soundEnabled = ref<boolean>(init.soundEnabled);
  const hapticsEnabled = ref<boolean>(init.hapticsEnabled);
  const notifPrefs = ref<NotifPrefs>(init.notifPrefs);
  const loading = ref(false);
  const remoteReady = ref(!remoteApiEnabled);
  const error = ref<AccountErrorMessageKey | null>(null);
  const remoteAccountEpoch = createRemoteAccountEpoch("default");
  let generation = 0;
  let canonicalNotifPrefs = init.notifPrefs;
  let mutationTail: Promise<void> = Promise.resolve();
  let nextMutationId = 0;
  const pendingNotifMutations = new Map<NotifKind, { id: number; value: boolean }>();
  const failedNotifMutations = new Map<NotifKind, AccountErrorMessageKey>();
  let nextReadRequestId = 0;
  let activeReadRequestId = 0;

  function isCurrent(request: RemoteAccountRequest, expectedGeneration: number): boolean {
    return generation === expectedGeneration && remoteAccountEpoch.isCurrent(request);
  }

  function isCurrentRead(request: RemoteAccountRequest, expectedGeneration: number, readRequestId: number): boolean {
    return isCurrent(request, expectedGeneration) && activeReadRequestId === readRequestId;
  }

  function persist() {
    try {
      uni.setStorageSync(STORAGE_KEY, {
        soundEnabled: soundEnabled.value,
        hapticsEnabled: hapticsEnabled.value,
        ...(remoteApiEnabled ? {} : { notifPrefs: notifPrefs.value }),
      });
    } catch {
      // storage unavailable
    }
  }

  function applyVisibleNotifPrefs() {
    const visible = { ...canonicalNotifPrefs };
    for (const [kind, pending] of pendingNotifMutations) visible[kind] = pending.value;
    // Remote mandatory delivery is enforced by the server. Retain its confirmed
    // value on failure rather than disguising legacy false data as a successful write.
    if (!remoteApiEnabled) {
      for (const kind of MANDATORY_NOTIF_KINDS) visible[kind] = true;
    }
    notifPrefs.value = visible;
  }

  function syncMutationError() {
    let latest: AccountErrorMessageKey | null = null;
    for (const message of failedNotifMutations.values()) latest = message;
    error.value = latest;
  }

  function toggleSound() {
    soundEnabled.value = !soundEnabled.value;
    persist();
  }

  function toggleHaptics() {
    hapticsEnabled.value = !hapticsEnabled.value;
    persist();
  }

  async function toggleNotifKind(k: NotifKind) {
    // 简报 #214:强制类只能保持开启 —— 页脚声明「关键合规通知不可禁用」,这里让它成为事实。
    if (isMandatoryNotifKind(k) && notifPrefs.value[k]) return;
    if (!remoteApiEnabled) {
      notifPrefs.value = { ...notifPrefs.value, [k]: !notifPrefs.value[k] };
      persist();
      return;
    }

    const request = remoteAccountEpoch.snapshot();
    const mutationId = ++nextMutationId;
    const value = !notifPrefs.value[k];
    generation += 1;
    pendingNotifMutations.set(k, { id: mutationId, value });
    failedNotifMutations.delete(k);
    applyVisibleNotifPrefs();
    syncMutationError();
    // A mutation supersedes any in-flight read for this account. Do not leave
    // the settings screen in a perpetual read-loading state when that old
    // response is intentionally discarded by the generation guard.
    loading.value = false;

    const run = async () => {
      if (!remoteAccountEpoch.isCurrent(request)) return;
      try {
        const canonical = await notificationPreferencesApi.patch({ [k]: value });
        if (!remoteAccountEpoch.isCurrent(request)) return;
        generation += 1;
        canonicalNotifPrefs = canonical;
        remoteReady.value = true;
        if (pendingNotifMutations.get(k)?.id === mutationId) pendingNotifMutations.delete(k);
        failedNotifMutations.delete(k);
        applyVisibleNotifPrefs();
        syncMutationError();
      } catch (cause) {
        if (!remoteAccountEpoch.isCurrent(request)) return;
        generation += 1;
        if (pendingNotifMutations.get(k)?.id === mutationId) pendingNotifMutations.delete(k);
        failedNotifMutations.set(k, accountErrorMessageKey(cause instanceof Error ? cause : "NOTIFICATION_PREFERENCES_UPDATE_FAILED"));
        applyVisibleNotifPrefs();
        syncMutationError();
      }
    };
    const operation = mutationTail.then(run, run);
    mutationTail = operation.catch(() => undefined);
    await operation;
  }

  async function refreshRemote(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()) {
    const expectedGeneration = generation;
    if (!remoteApiEnabled || !isCurrent(request, expectedGeneration)) return;
    const readRequestId = ++nextReadRequestId;
    activeReadRequestId = readRequestId;
    loading.value = true;
    error.value = null;
    try {
      const canonical = await notificationPreferencesApi.get();
      if (!isCurrentRead(request, expectedGeneration, readRequestId)) return;
      canonicalNotifPrefs = canonical;
      remoteReady.value = true;
      failedNotifMutations.clear();
      applyVisibleNotifPrefs();
    } catch (cause) {
      if (isCurrentRead(request, expectedGeneration, readRequestId)) {
        error.value = accountErrorMessageKey(cause);
      }
    } finally {
      if (remoteAccountEpoch.isCurrent(request) && activeReadRequestId === readRequestId) loading.value = false;
    }
  }

  function bindAccount(accountKey: string) {
    generation += 1;
    remoteAccountEpoch.bind(accountKey);
    if (remoteApiEnabled) {
      remoteReady.value = false;
      canonicalNotifPrefs = defaultNotifPrefs();
      pendingNotifMutations.clear();
      failedNotifMutations.clear();
      mutationTail = Promise.resolve();
      applyVisibleNotifPrefs();
      loading.value = false;
      error.value = null;
      void refreshRemote();
      return;
    }
    const local = hydrate();
    soundEnabled.value = local.soundEnabled;
    hapticsEnabled.value = local.hapticsEnabled;
    canonicalNotifPrefs = local.notifPrefs;
    notifPrefs.value = local.notifPrefs;
  }

  return { soundEnabled, hapticsEnabled, notifPrefs, loading, remoteReady, error, toggleSound, toggleHaptics, toggleNotifKind, bindAccount, refreshRemote };
});
