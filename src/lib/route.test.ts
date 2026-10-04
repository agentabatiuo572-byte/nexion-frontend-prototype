import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closeTrial: vi.fn(),
  closeVoucher: vi.fn(),
  navigationError: vi.fn(),
  throwTrialStore: false,
  throwVoucherStore: false,
}));

vi.mock("@/store/trial-claim-sheet", () => ({
  useTrialClaimSheet: () => {
    if (mocks.throwTrialStore) throw new Error("no active Pinia");
    return { closeTransient: mocks.closeTrial };
  },
}));

vi.mock("@/store/voucher-claim-sheet", () => ({
  useVoucherClaimSheet: () => {
    if (mocks.throwVoucherStore) throw new Error("no active Pinia");
    return { closeTransient: mocks.closeVoucher };
  },
}));

vi.mock("@/store/ui", () => ({
  toast: { error: mocks.navigationError },
}));

vi.mock("@/i18n/use-t", () => ({
  getT: () => ({ ui: { navigationFailed: "Navigation failed" } }),
}));

import { navBack, navTo, navReset, navReplace, takeNavigationQuery, toUniRoute } from "./route";

type NavigationOptions = {
  url: string;
  success?: () => void;
  fail?: () => void;
};

describe("route navigation failure handling", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.closeTrial.mockReset();
    mocks.closeVoucher.mockReset();
    mocks.navigationError.mockReset();
    mocks.throwTrialStore = false;
    mocks.throwVoucherStore = false;
  });

  it("reports a visible error and resolves false after all normal-page fallbacks fail", async () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      redirectTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      reLaunch: vi.fn((options: NavigationOptions) => options.fail?.()),
    });

    await expect(navTo("/pages/team/commissions")).resolves.toBe(false);

    expect(uni.navigateTo).toHaveBeenCalledTimes(1);
    expect(uni.redirectTo).toHaveBeenCalledTimes(1);
    expect(uni.reLaunch).toHaveBeenCalledTimes(1);
    expect(mocks.navigationError).toHaveBeenCalledOnce();
    expect(mocks.navigationError).toHaveBeenCalledWith("Navigation failed");
  });

  it("resolves true when a fallback succeeds", async () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      redirectTo: vi.fn((options: NavigationOptions) => options.success?.()),
      reLaunch: vi.fn(),
    });

    await expect(navTo("/pages/me/wallet-withdraw")).resolves.toBe(true);

    expect(uni.navigateTo).toHaveBeenCalledTimes(1);
    expect(uni.redirectTo).toHaveBeenCalledTimes(1);
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(mocks.navigationError).not.toHaveBeenCalled();
  });

  it("reports a visible error after all tab-page fallbacks fail", async () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      redirectTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      reLaunch: vi.fn((options: NavigationOptions) => options.fail?.()),
    });

    await expect(navTo("/team")).resolves.toBe(false);

    expect(uni.reLaunch).toHaveBeenCalledTimes(1);
    expect(uni.redirectTo).toHaveBeenCalledTimes(1);
    expect(uni.navigateTo).toHaveBeenCalledTimes(1);
    expect(mocks.navigationError).toHaveBeenCalledOnce();
  });

  it("recognizes physical tabBar routes during migrated navigation", () => {
    expect(toUniRoute("/pages/team/team")).toEqual({ url: "/pages/team/team", tab: true });
    expect(toUniRoute("/pages/me/wallet")).toEqual({ url: "/pages/me/wallet", tab: false });
  });

  it("preserves a quota product for one H5 navigation when the destination loses its query", async () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.success?.()),
      redirectTo: vi.fn((options: NavigationOptions) => options.success?.()),
      reLaunch: vi.fn((options: NavigationOptions) => options.success?.()),
    });

    await expect(navTo("/pages/team/quota?product=stellarrack-p2")).resolves.toBe(true);
    expect(uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: "/pages/team/quota?product=stellarrack-p2",
    }));
    expect(takeNavigationQuery("/pages/team/quota")).toBe("?product=stellarrack-p2");
    expect(takeNavigationQuery("/pages/team/quota")).toBe("");

    await navTo("/pages/team/quota?product=another-sku");
    await navTo("/pages/team/team");
    expect(takeNavigationQuery("/pages/team/quota")).toBe("");
  });

  it("reads only the matching H5 hash query after a cold refresh", () => {
    vi.stubGlobal("window", { location: { hash: "#/pages/store/detail?id=stellarbox-pro" } });
    expect(takeNavigationQuery("/pages/store/detail")).toBe("?id=stellarbox-pro");
    expect(takeNavigationQuery("/pages/team/quota")).toBe("");

    (window.location as { hash: string }).hash = "#/pages/team/quota?product=stellarbox-pro";
    expect(takeNavigationQuery("/pages/team/quota")).toBe("?product=stellarbox-pro");
  });

  it("continues navigation when transient stores are not initialized yet", () => {
    mocks.throwTrialStore = true;
    mocks.throwVoucherStore = true;
    vi.stubGlobal("uni", {
      navigateTo: vi.fn(),
      redirectTo: vi.fn(),
      reLaunch: vi.fn(),
    });

    expect(() => navTo("/pages/team/commissions")).not.toThrow();
    expect(uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: "/pages/team/commissions",
    }));
  });

  it("dismisses transient Home overlays before starting the single route chain", async () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.success?.()),
      redirectTo: vi.fn(),
      reLaunch: vi.fn(),
    });

    await expect(navTo("/pages/market/market")).resolves.toBe(true);

    expect(mocks.closeTrial).toHaveBeenCalledOnce();
    expect(mocks.closeVoucher).toHaveBeenCalledOnce();
    expect(uni.navigateTo).toHaveBeenCalledOnce();
    expect(mocks.closeTrial.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(uni.navigateTo).mock.invocationCallOrder[0],
    );
    expect(mocks.closeVoucher.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(uni.navigateTo).mock.invocationCallOrder[0],
    );
    expect(uni.redirectTo).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("settles one normal navigation chain when an SDK emits duplicate callbacks", async () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => {
        options.success?.();
        options.fail?.();
        options.success?.();
      }),
      redirectTo: vi.fn(),
      reLaunch: vi.fn(),
    });

    await expect(navTo("/pages/market/market")).resolves.toBe(true);

    expect(uni.navigateTo).toHaveBeenCalledOnce();
    expect(uni.redirectTo).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(mocks.navigationError).not.toHaveBeenCalled();
  });

  it("reports invalid runtime href values instead of throwing or navigating", () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn(),
      redirectTo: vi.fn(),
      reLaunch: vi.fn(),
    });

    expect(() => navTo(null as unknown as string)).not.toThrow();
    expect(mocks.navigationError).toHaveBeenCalledOnce();
    expect(uni.navigateTo).not.toHaveBeenCalled();
    expect(uni.redirectTo).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("reports navigateBack failure even when no fallback href is supplied", () => {
    vi.stubGlobal("getCurrentPages", () => [{}, {}]);
    vi.stubGlobal("uni", {
      navigateBack: vi.fn((options: NavigationOptions) => options.fail?.()),
      showToast: vi.fn(),
    });

    navBack();

    expect(uni.navigateBack).toHaveBeenCalledOnce();
    expect(uni.showToast).toHaveBeenCalledWith({ title: "Navigation failed", icon: "none" });
  });

  it("uses the platform toast even when the optional UI store is unavailable", () => {
    mocks.navigationError.mockImplementationOnce(() => { throw new Error("no active Pinia"); });
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      redirectTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      reLaunch: vi.fn((options: NavigationOptions) => options.fail?.()),
      showToast: vi.fn(),
    });

    navTo("/pages/team/commissions");

    expect(uni.showToast).toHaveBeenCalledWith({
      title: "Navigation failed",
      icon: "none",
    });
  });

  it("reports an invalid singleton fallback without throwing", () => {
    vi.stubGlobal("getCurrentPages", () => [{}]);
    vi.stubGlobal("uni", {
      reLaunch: vi.fn(),
      showToast: vi.fn(),
    });

    expect(() => navBack({} as unknown as string)).not.toThrow();
    expect(uni.showToast).toHaveBeenCalledWith({ title: "Navigation failed", icon: "none" });
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it("retries a forced reset without downgrading a mandatory gate to a stack push", async () => {
    vi.stubGlobal("uni", {
      reLaunch: vi.fn((options: NavigationOptions) => options.fail?.()),
      redirectTo: vi.fn(), navigateTo: vi.fn(),
    });
    const fail = vi.fn();
    const complete = vi.fn();
    expect(await navReset({ url: "/pages/onboarding/terms", fail, complete })).toBe(false);
    expect(uni.reLaunch).toHaveBeenCalledTimes(2);
    expect(uni.redirectTo).not.toHaveBeenCalled();
    expect(uni.navigateTo).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(mocks.navigationError).toHaveBeenCalledOnce();
  });

  it("recovers a replacement by resetting to the exact same URL", async () => {
    vi.stubGlobal("uni", {
      redirectTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      reLaunch: vi.fn((options: NavigationOptions) => options.success?.()),
      navigateTo: vi.fn(),
    });
    const success = vi.fn();
    const fail = vi.fn();
    const complete = vi.fn();
    expect(await navReplace({ url: "/pages/store/order-detail?id=123", success, fail, complete })).toBe(true);
    expect(uni.reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/store/order-detail?id=123" }));
    expect(success).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
    expect(uni.navigateTo).not.toHaveBeenCalled();
    expect(mocks.navigationError).not.toHaveBeenCalled();
  });

  it("handles synchronous platform exceptions and malformed targets visibly", async () => {
    vi.stubGlobal("uni", { reLaunch: vi.fn(() => { throw new Error("SDK unavailable"); }) });
    expect(await navReset("/login")).toBe(false);
    expect(uni.reLaunch).toHaveBeenCalledTimes(2);
    expect(mocks.navigationError).toHaveBeenCalledOnce();
    expect(await navReset(null as unknown as string)).toBe(false);
    expect(mocks.navigationError).toHaveBeenCalledTimes(2);
    expect(uni.reLaunch).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate SDK callbacks after a successful transition", async () => {
    vi.stubGlobal("uni", { reLaunch: vi.fn((options: NavigationOptions) => {
      options.success?.(); options.fail?.(); options.success?.();
    }) });
    const success = vi.fn();
    expect(await navReset({ url: "/pages/login/login", success })).toBe(true);
    expect(success).toHaveBeenCalledOnce();
    expect(uni.reLaunch).toHaveBeenCalledOnce();
    expect(mocks.navigationError).not.toHaveBeenCalled();
  });

  it("renders forced-navigation failures on bare onboarding pages without a GlobalUi host", async () => {
    vi.stubGlobal("uni", {
      reLaunch: vi.fn((options: NavigationOptions) => options.fail?.()),
      showToast: vi.fn(),
    });
    expect(await navReset("/pages/login/login")).toBe(false);
    expect(uni.showToast).toHaveBeenCalledWith({ title: "Navigation failed", icon: "none" });
    expect(mocks.navigationError).not.toHaveBeenCalled();
  });

  it("also shows normal navigation failure from a bare Terms page without GlobalUi", () => {
    vi.stubGlobal("uni", {
      navigateTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      redirectTo: vi.fn((options: NavigationOptions) => options.fail?.()),
      reLaunch: vi.fn((options: NavigationOptions) => options.fail?.()),
      showToast: vi.fn(),
    });
    navTo("/pages/me/risk-disclosure");
    expect(uni.showToast).toHaveBeenCalledWith({ title: "Navigation failed", icon: "none" });
  });
});
