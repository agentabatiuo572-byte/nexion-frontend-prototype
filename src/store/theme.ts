import { defineStore } from "pinia";
import { computed, nextTick, onScopeDispose, ref } from "vue";
// #ifdef APP-PLUS
import { syncNativeTheme } from "@/lib/native-theme";
// #endif

// Theme store — appearance preference: light / dark / system.
// NexGrid is a dark-default design system. The H5 root (<html data-theme>) is
// driven from here; App view layers receive the resolved theme when ready. The /me page
// opens a picker sheet that calls setMode() with one of the three modes.
//
// `mode` is the user's *choice* (persisted, may be "system"). `resolved` is the
// concrete light|dark actually written to <html data-theme> — CSS only knows
// those two. When mode === "system" the resolved theme follows the OS colour
// scheme and re-applies live as the OS setting changes.
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

function readSystemTheme(): ResolvedTheme | undefined {
  // #ifdef H5
  try {
    if (typeof window !== "undefined" && window.matchMedia)
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    // matchMedia unavailable
  }
  // #endif
  // #ifdef APP-PLUS
  try {
    // Unlike plus.navigator.getUIStyle(), osTheme supports Android as well.
    const theme = uni.getSystemInfoSync().osTheme;
    if (theme === "light" || theme === "dark") return theme;
  } catch {
    // Keep the last valid theme while the native bridge is unavailable.
  }
  // #endif
  return undefined;
}

// Apply the resolved theme attribute in the current view layer.
function applyTheme(theme: ResolvedTheme) {
  // #ifdef H5
  try {
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    // document unavailable
  }
  // #endif
  // #ifdef APP-PLUS
  syncNativeTheme(theme);
  // #endif
}

export const useTheme = defineStore("theme", () => {
  const mode = ref<ThemeMode>(hydrate());
  const systemTheme = ref<ResolvedTheme>("dark");
  const resolved = computed<ResolvedTheme>(() => mode.value === "system" ? systemTheme.value : mode.value);
  let disposed = false;
  onScopeDispose(() => { disposed = true; });

  function applyResolvedTheme() {
    // #ifdef APP-PLUS
    // Uni also changes status icons after delivering its theme event. Apply
    // our current choice afterwards, including a manual choice made meanwhile.
    void nextTick(() => { if (!disposed) applyTheme(resolved.value); });
    // #endif
    // #ifndef APP-PLUS
    applyTheme(resolved.value);
    // #endif
  }

  function refreshSystemTheme() {
    // #ifdef APP-PLUS
    try {
      if (typeof plus !== "undefined")
        plus.nativeUI?.setUIStyle?.(mode.value === "system" ? "auto" : mode.value);
    } catch {
      // Some runtimes do not expose native UI appearance control.
    }
    // #endif
    if (mode.value === "system") {
      // iOS requires auto before querying osTheme; Android reads the real OS.
      const next = readSystemTheme();
      if (next) systemTheme.value = next;
    }
    applyResolvedTheme();
  }

  function persist() {
    try {
      uni.setStorageSync(STORAGE_KEY, { mode: mode.value });
    } catch {
      // storage unavailable
    }
  }

  function setMode(next: ThemeMode) {
    mode.value = next;
    refreshSystemTheme();
    persist();
  }

  // Follow the OS scheme once per store, releasing listeners on store disposal.
  // #ifdef H5
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onSchemeChange = () => {
        if (!disposed && mode.value === "system") refreshSystemTheme();
      };
      const modern = typeof mq.addEventListener === "function";
      if (modern) mq.addEventListener("change", onSchemeChange);
      else if ((mq as unknown as { addListener?: (cb: () => void) => void }).addListener)
        (mq as unknown as { addListener: (cb: () => void) => void }).addListener(onSchemeChange); // Safari < 14
      onScopeDispose(() => {
        try {
          if (modern) mq.removeEventListener?.("change", onSchemeChange);
          else mq.removeListener?.(onSchemeChange);
        } catch {
          // The browser may be tearing down its media query object.
        }
      });
    }
  } catch {
    // matchMedia unavailable
  }
  // #endif
  // #ifdef APP-PLUS
  try {
    if (typeof uni.onThemeChange === "function") {
      const onSchemeChange = () => {
        if (disposed) return;
        // A notification from an earlier manual native appearance may arrive
        // after switching to System. Query the current OS rather than its payload.
        if (mode.value === "system") {
          const next = readSystemTheme();
          if (next) systemTheme.value = next;
        }
        applyResolvedTheme();
      };
      uni.onThemeChange(onSchemeChange);
      onScopeDispose(() => {
        try { uni.offThemeChange?.(onSchemeChange); } catch { /* native bridge unavailable */ }
      });
    }
  } catch {
    // Foreground refresh remains available if live notifications are unsupported.
  }
  // #endif

  refreshSystemTheme();

  return { mode, resolved, setMode, refreshSystemTheme };
});
