import { defineStore } from "pinia";
import { ref } from "vue";

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

  function persist() {
    try {
      uni.setStorageSync(STORAGE_KEY, {
        soundEnabled: soundEnabled.value,
        hapticsEnabled: hapticsEnabled.value,
        notifPrefs: notifPrefs.value,
      });
    } catch {
      // storage unavailable
    }
  }

  function toggleSound() {
    soundEnabled.value = !soundEnabled.value;
    persist();
  }

  function toggleHaptics() {
    hapticsEnabled.value = !hapticsEnabled.value;
    persist();
  }

  function toggleNotifKind(k: NotifKind) {
    notifPrefs.value = { ...notifPrefs.value, [k]: !notifPrefs.value[k] };
    persist();
  }

  return { soundEnabled, hapticsEnabled, notifPrefs, toggleSound, toggleHaptics, toggleNotifKind };
});
