import { afterEach, describe, expect, it, vi } from "vitest";
import {
  refreshActivePage,
  registerActivePageRefresh,
  resetActivePageRefreshForTest,
} from "./active-page-refresh";

afterEach(resetActivePageRefreshForTest);

describe("active page pull refresh", () => {
  it("refreshes the latest visible page and awaits its remote work", async () => {
    const older = vi.fn();
    let finish!: () => void;
    const latest = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    registerActivePageRefresh(older);
    registerActivePageRefresh(latest);

    const pending = refreshActivePage();
    expect(latest).toHaveBeenCalledOnce();
    expect(older).not.toHaveBeenCalled();
    finish();
    await pending;
  });

  it("does not let an older page disposer unregister the current page", async () => {
    const first = vi.fn();
    const current = vi.fn();
    const disposeFirst = registerActivePageRefresh(first);
    registerActivePageRefresh(current);
    disposeFirst();

    await refreshActivePage();
    expect(current).toHaveBeenCalledOnce();
  });
});
