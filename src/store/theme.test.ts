import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTheme } from "./theme";

let saved: { mode?: string } | "";
const persist = vi.fn();

beforeEach(() => {
  saved = "";
  persist.mockClear();
  vi.stubGlobal("uni", { getStorageSync: () => saved, setStorageSync: persist });
  setActivePinia(createPinia());
});

test("a fresh install starts dark without writing a theme choice", () => {
  const theme = useTheme();
  expect(theme.mode).toBe("dark");
  expect(theme.resolved).toBe("dark");
  expect(persist).not.toHaveBeenCalled();
});

test("a saved light choice survives launch and later dark selection", () => {
  saved = { mode: "light" };
  const theme = useTheme();
  expect(theme.mode).toBe("light");
  expect(theme.resolved).toBe("light");

  theme.setMode("dark");
  expect(theme.resolved).toBe("dark");
  expect(persist).toHaveBeenCalledWith("nexgrid-theme-v1", { mode: "dark" });
});
