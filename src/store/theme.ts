import { defineStore } from "pinia";
import { computed, ref } from "vue";

// Theme store — appearance preference: light / dark / system.
// NexGrid is a dark-default design system. The H5 root (<html data-theme>) is
// driven from here; App.vue applies the resolved theme on launch. The /me page
// opens a picker sheet that calls setMode() with one of the three modes.
//
// `mode` is the user's *choice* (persisted, may be "system"). `resolved` is the
// concrete light|dark actually written to <html data-theme> — CSS only knows
// those two. When mode === "system" the resolved theme follows the OS colour
// scheme and re-applies live as the OS setting changes (H5 matchMedia listener).
// Device-local preference; no backend involvement.

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "nexgrid-theme-v1";

function hydrate(): ThemeMode {
  try {
    const s = uni.getStorageSync(STORAGE_KEY) as { mode?: ThemeMode } | "";
    if (s && (s.mode === "light" || s.mode === "dark" || s.mode === "system")) return s.mode;
  } catch {
    // first run
  }
  return "dark";
}

// OS colour-scheme preference. H5 only (matchMedia); on App theming is at
// packaging, so this dark-default platform reports dark.
function systemPrefersDark(): boolean {
  // #ifdef H5
  try {
    return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    // matchMedia unavailable
  }
  // #endif
  return true;
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

// Apply the resolved theme attribute on H5 (no-op on App, where theming is at
// packaging).
function applyTheme(mode: ThemeMode) {
  // #ifdef H5
  try {
    document.documentElement.setAttribute("data-theme", resolveMode(mode));
  } catch {
    // document unavailable
  }
  // #endif
}

export const useTheme = defineStore("theme", () => {
  const mode = ref<ThemeMode>(hydrate());
  const resolved = computed<ResolvedTheme>(() => resolveMode(mode.value));

  function persist() {
    try {
      uni.setStorageSync(STORAGE_KEY, { mode: mode.value });
    } catch {
      // storage unavailable
    }
  }

  function setMode(next: ThemeMode) {
    mode.value = next;
    applyTheme(next);
    persist();
  }

  // Follow the OS scheme live while mode === "system" (H5 only). Registered once
  // per store instance (Pinia singleton); no teardown needed for an app-lifetime
  // preference listener.
  // #ifdef H5
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onSchemeChange = () => {
        if (mode.value === "system") applyTheme("system");
      };
      if (mq.addEventListener) mq.addEventListener("change", onSchemeChange);
      else if ((mq as unknown as { addListener?: (cb: () => void) => void }).addListener)
        (mq as unknown as { addListener: (cb: () => void) => void }).addListener(onSchemeChange); // Safari < 14
    }
  } catch {
    // matchMedia unavailable
  }
  // #endif

  return { mode, resolved, setMode };
});
