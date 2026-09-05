import { createSSRApp, watch } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { mountSpec7DevBridge } from "@/lib/spec7-dev-bridge";
import { mountAuthOtpDevBridge } from "@/store/auth-otp";
import { useI18nRuntime } from "@/store/i18n-runtime";
import { useLocaleStore } from "@/store/locale";
import "./styles/tokens.css";
import "uno.css";

declare global {
  interface Window {
    __NX_DEVICE_SHELL__?: boolean;
    __NX_UNIAPP_RUNTIME_IDENTITY__?: Readonly<{ marker: string; sourceUrl: string }>;
  }
}

const UNIAPP_RUNTIME_MARKER = "NEXGRID_UNIAPP_RUNTIME_20260809_V1";

const ShellHost = { render: () => null };

export function createApp() {
  const isDeviceShellHost = typeof window !== "undefined" && window.__NX_DEVICE_SHELL__;
  if (typeof window !== "undefined" && !isDeviceShellHost) {
    // Runtime probes verify both this value and the same marker in the module
    // fetched from sourceUrl. A random 200 HTML page with a few copied classes
    // is therefore not accepted as the UniApp candidate.
    window.__NX_UNIAPP_RUNTIME_IDENTITY__ = Object.freeze({
      marker: UNIAPP_RUNTIME_MARKER,
      sourceUrl: import.meta.url,
    });
  }
  const app = createSSRApp(isDeviceShellHost ? ShellHost : App);
  if (isDeviceShellHost) {
    return {
      app,
    };
  }

  const pinia = createPinia();
  app.use(pinia);
  const locale = useLocaleStore(pinia);
  const runtimeI18n = useI18nRuntime(pinia);
  runtimeI18n.prepare();
  void runtimeI18n.refresh(locale.code);
  watch(() => locale.code, (next) => { void runtimeI18n.refresh(next); });
  if (import.meta.env.DEV) {
    // DEV-only: SPEC-7 演示桥(模拟后台处置下发)。
    mountSpec7DevBridge();
    // DEV-only: FEAT-AUTH01 OTP 闸门演示桥(seedSendLog/reset/inspect)。
    mountAuthOtpDevBridge();
  }
  return {
    app,
  };
}
