import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { remoteAccountScope } from "@/lib/remote-account-epoch";

const paymentApi = {
  config: vi.fn(),
  fxQuote: vi.fn(),
};
let sessionSnapshot = { user: { userId: 7 }, accessToken: "test-before-rotation" };

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  paymentApi,
  sessionVault: { read: () => sessionSnapshot },
}));

describe("fx remote failure", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    paymentApi.config.mockReset();
    paymentApi.fxQuote.mockReset();
    sessionSnapshot = { user: { userId: 7 }, accessToken: "test-before-rotation" };
    remoteAccountScope.bind("user:7");
  });

  it("marks the explicit remote/sandbox rail unavailable without fixed local values", async () => {
    paymentApi.config.mockResolvedValue({
      vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
        todayRemainingDepositUsdt: 2578.62, todayRemainingVnd: 68050000, feeVnd: 0, feeUsdt: 0 },
    });
    paymentApi.fxQuote.mockResolvedValue({
      baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMinutes: 30,
    });

    const { useFx } = await import("./fx");
    const fx = useFx();
    await fx.load();
    expect(fx.configReady).toBe(true);

    paymentApi.config.mockRejectedValue(new Error("PAYMENT_CONFIG_RESPONSE_INVALID"));
    await fx.load();

    expect(fx.syncFailed).toBe(true);
    expect(fx.configReady).toBe(false);
    expect(fx.fxAvailable).toBe(false);
    expect(fx.vietQrEnabled).toBe(false);
    expect(fx.baseRateVndPerUsdt).toBe(0);
    expect(fx.minDepositUsdt).toBe(0);
    expect(fx.maxDepositUsdt).toBe(0);
    expect(fx.todayRemainingDepositUsdt).toBe(0);
  });

  it("makes concurrent callers wait for the same configuration refresh", async () => {
    let resolveConfig!: (value: {
      vietQr: { enabled: boolean; minDepositUsdt: number; maxDepositUsdt: number;
        todayRemainingDepositUsdt: number; todayRemainingVnd: number; feeVnd: number; feeUsdt: number };
    }) => void;
    paymentApi.config.mockReturnValue(new Promise((resolve) => {
      resolveConfig = resolve;
    }));
    paymentApi.fxQuote.mockResolvedValue({
      baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMinutes: 30,
    });

    const { useFx } = await import("./fx");
    const fx = useFx();
    const firstLoad = fx.load();
    const concurrentLoad = fx.load();
    let concurrentSettled = false;
    void concurrentLoad.then(() => {
      concurrentSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(concurrentSettled).toBe(false);
    expect(paymentApi.config).toHaveBeenCalledTimes(1);
    expect(paymentApi.fxQuote).toHaveBeenCalledTimes(1);

    resolveConfig({
      vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
        todayRemainingDepositUsdt: 2578.62, todayRemainingVnd: 68050000, feeVnd: 0, feeUsdt: 0 },
    });
    await Promise.all([firstLoad, concurrentLoad]);

    expect(concurrentSettled).toBe(true);
    expect(fx.maxDepositUsdt).toBe(5000);
    expect(fx.todayRemainingDepositUsdt).toBe(2578.62);
  });

  it.each(["success", "failure"])("ignores a prior account's late %s while the new account gets its own read", async (completion) => {
    let resolveOld!: (value: unknown) => void;
    let rejectOld!: (cause: Error) => void;
    paymentApi.config.mockReturnValueOnce(new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }))
      .mockResolvedValueOnce({ vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
        todayRemainingDepositUsdt: 80, todayRemainingVnd: 100, dailyCapacityKnown: true, feeVnd: 0, feeUsdt: 0 } });
    paymentApi.fxQuote.mockResolvedValueOnce({ baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMinutes: 30 })
      .mockResolvedValueOnce({ baseRateVndPerUsdt: 27000, buySpreadPct: 1.5, lockWindowMinutes: 30 });
    const { useFx } = await import("./fx");
    const fx = useFx(), oldLoad = fx.load();
    sessionSnapshot = { user: { userId: 8 }, accessToken: "test-next-account" };
    remoteAccountScope.bind("user:8");
    const newLoad = fx.load();
    await newLoad;
    expect(paymentApi.config).toHaveBeenCalledTimes(2);
    expect(paymentApi.fxQuote).toHaveBeenCalledTimes(2);
    expect(fx).toMatchObject({ configReady: true, syncFailed: false, loading: false,
      baseRateVndPerUsdt: 27000, todayRemainingDepositUsdt: 80 });
    if (completion === "success") resolveOld({ vietQr: { enabled: true, todayRemainingDepositUsdt: 999 } });
    else rejectOld(new Error("OLD_ACCOUNT_CONFIG_FAILED"));
    await oldLoad;
    expect(fx).toMatchObject({ configReady: true, syncFailed: false, loading: false,
      baseRateVndPerUsdt: 27000, todayRemainingDepositUsdt: 80 });
  });

  it("a same-account rebind starts its own read and an old completion cannot clear the new loading flag", async () => {
    let resolveOld!: (value: unknown) => void, resolveNew!: (value: unknown) => void;
    paymentApi.config.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
    paymentApi.fxQuote.mockResolvedValue({ baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMinutes: 30 });
    const { useFx } = await import("./fx");
    const fx = useFx(), oldLoad = fx.load();
    remoteAccountScope.bind("user:7");
    const newLoad = fx.load();
    resolveOld({ vietQr: { enabled: true, todayRemainingDepositUsdt: 999 } });
    await oldLoad;
    expect(fx.loading).toBe(true); expect(fx.configReady).toBe(false);
    const joinedLoad = fx.load();
    let newSettled = false, joinedSettled = false;
    void newLoad.then(() => { newSettled = true; });
    void joinedLoad.then(() => { joinedSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(newSettled).toBe(false); expect(joinedSettled).toBe(false);
    expect(paymentApi.config).toHaveBeenCalledTimes(2); expect(paymentApi.fxQuote).toHaveBeenCalledTimes(2);
    resolveNew({ vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 80, todayRemainingVnd: 100, feeVnd: 0, feeUsdt: 0 } });
    await Promise.all([newLoad, joinedLoad]);
    expect(newSettled).toBe(true); expect(joinedSettled).toBe(true);
    expect(paymentApi.config).toHaveBeenCalledTimes(2); expect(fx.todayRemainingDepositUsdt).toBe(80);
    expect(paymentApi.fxQuote).toHaveBeenCalledTimes(2);
    expect(fx).toMatchObject({ configReady: true, fxAvailable: true, loading: false, syncFailed: false,
      vietQrEnabled: true, baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMin: 30,
      minDepositUsdt: 10, maxDepositUsdt: 5000, todayRemainingVnd: 100 });
  });

  it("same-account token rotation preserves the in-flight read and its valid result", async () => {
    let resolveConfig!: (value: unknown) => void;
    paymentApi.config.mockReturnValue(new Promise(resolve => { resolveConfig = resolve; }));
    paymentApi.fxQuote.mockResolvedValue({ baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMinutes: 30 });
    const { useFx } = await import("./fx");
    const fx = useFx(), firstLoad = fx.load();
    sessionSnapshot = { user: { userId: 7 }, accessToken: "test-after-rotation" };
    const rotatedLoad = fx.load();
    let firstSettled = false, rotatedSettled = false;
    void firstLoad.then(() => { firstSettled = true; });
    void rotatedLoad.then(() => { rotatedSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(firstSettled).toBe(false); expect(rotatedSettled).toBe(false);
    expect(fx.loading).toBe(true); expect(fx.configReady).toBe(false);
    expect(paymentApi.config).toHaveBeenCalledTimes(1); expect(paymentApi.fxQuote).toHaveBeenCalledTimes(1);
    resolveConfig({ vietQr: { enabled: true, minDepositUsdt: 10, maxDepositUsdt: 5000,
      todayRemainingDepositUsdt: 80, todayRemainingVnd: 100, feeVnd: 0, feeUsdt: 0 } });
    await Promise.all([firstLoad, rotatedLoad]);
    expect(firstSettled).toBe(true); expect(rotatedSettled).toBe(true);
    expect(paymentApi.config).toHaveBeenCalledTimes(1); expect(fx.configReady).toBe(true);
    expect(paymentApi.fxQuote).toHaveBeenCalledTimes(1);
    expect(fx).toMatchObject({ fxAvailable: true, loading: false, syncFailed: false, vietQrEnabled: true,
      baseRateVndPerUsdt: 26000, buySpreadPct: 1.5, lockWindowMin: 30, minDepositUsdt: 10,
      maxDepositUsdt: 5000, todayRemainingDepositUsdt: 80, todayRemainingVnd: 100 });
  });
});
