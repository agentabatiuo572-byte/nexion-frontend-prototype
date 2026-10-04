import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLocaleStore } from "./locale";
beforeEach(() => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
  setActivePinia(createPinia());
});
test("a historical unsupported profile locale never diverges from rendered language", () => {
  const store = useLocaleStore();
  store.applyServerLocale("ja");
  expect(store.code).toBe("en");
  expect(store.explicitRevision).toBe(0);
  store.setLocale("zh");
  expect(store.code).toBe("zh");
});

test("the registration screen starts in the device language before visiting Home", () => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "zh-CN" }) });
  expect(useLocaleStore().code).toBe("zh");
});

test("Home device detection never replaces a hydrated account preference", () => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "zh-CN" }) });
  const store = useLocaleStore();
  store.applyServerLocale("en");
  store.ensureSystemDetected();
  expect(store.code).toBe("en");
  expect(store.explicitRevision).toBe(0);
});
