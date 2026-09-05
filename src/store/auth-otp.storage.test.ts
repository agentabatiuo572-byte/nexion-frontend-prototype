/**
 * 滑块 / OTP mock 的**存储降级**契约。
 * 焊死 2026-08-19 实景故障:localStorage 满(或浏览器禁掉站点数据)时 writeMap 抛出,
 * captcha-slider 的 loadChallenge 只有一个 catch,把任何异常都讲成网络失败 →
 * 注册页弹「加载失败,请检查网络后重试」,而重试改不掉满 / 被禁 → 注册永久卡死。
 * 注册每次发码都强制过滑块,所以这条路断 = 整个注册断,不是边角。
 * uni storage 用内存表桩掉,storageBroken 打开即模拟配额耗尽(与 orders.persist.test 同款桩)。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, unknown>();
let storageBroken = false;
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => (memory.has(k) ? memory.get(k) : ""),
  setStorageSync: (k: string, v: unknown) => {
    if (storageBroken) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    memory.set(k, v);
  },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

vi.mock("@/store/config", () => ({
  useConfig: () => ({
    config: {
      otpGate: {
        resendSeconds: 60,
        captchaAfterSends: 3,
        otpTtlSeconds: 300,
        maxVerifyAttempts: 5,
        captchaTicketTtlSeconds: 120,
        captchaAlwaysScenes: ["register"],
      },
    },
  }),
}));

const { captchaChallenge, captchaVerify, otpSend } = await import("./auth-otp");

describe("auth-otp storage degradation contract", () => {
  beforeEach(() => { memory.clear(); storageBroken = false; });

  it("issues and verifies a challenge when storage works (baseline)", async () => {
    const challenge = await captchaChallenge("+14155550001");
    const res = await captchaVerify("+14155550001", {
      challengeId: challenge.challengeId,
      offsetRatio: challenge.targetRatio,
    });
    expect(res.ok).toBe(true);
  });

  it("still issues a challenge when every storage write fails", async () => {
    storageBroken = true;
    // 回归点:这里以前会 reject,滑块层把它渲染成「加载失败」并永久卡死注册。
    await expect(captchaChallenge("+14155550002")).resolves.toMatchObject({
      challengeId: expect.any(String),
    });
  });

  it("keeps the whole register send path working on a full storage", async () => {
    storageBroken = true;
    const phone = "+14155550003";
    const challenge = await captchaChallenge(phone);
    // 降级不能只是"不抛":题面得留得住,否则用户对准了也判未对准。
    const verified = await captchaVerify(phone, {
      challengeId: challenge.challengeId,
      offsetRatio: challenge.targetRatio,
    });
    expect(verified.ok).toBe(true);
    const ticket = verified.ok ? verified.ticket : "";
    // otpSend 同走这条咽喉,且 register.vue 那条路没有 catch —— 抛了就是 CTA 永远转圈。
    await expect(otpSend(phone, "register", ticket)).resolves.toMatchObject({ ok: true });
  });

  it("a wrong offset is still a plain captcha failure, not a load failure", async () => {
    storageBroken = true;
    const phone = "+14155550004";
    const challenge = await captchaChallenge(phone);
    const off = challenge.targetRatio > 0.5 ? 0.05 : 0.95;
    const res = await captchaVerify(phone, { challengeId: challenge.challengeId, offsetRatio: off });
    expect(res).toMatchObject({ ok: false, error: "captcha_failed", failCount: 1 });
  });

  it("goes back to disk once storage recovers", async () => {
    storageBroken = true;
    await captchaChallenge("+14155550005");
    expect(memory.has("nx_otp_captcha_v1")).toBe(false);
    storageBroken = false;
    const challenge = await captchaChallenge("+14155550005");
    expect(memory.has("nx_otp_captcha_v1")).toBe(true);
    // 磁盘重新可用后,内存影子必须撤下,不能反过来盖住磁盘。
    const res = await captchaVerify("+14155550005", {
      challengeId: challenge.challengeId,
      offsetRatio: challenge.targetRatio,
    });
    expect(res.ok).toBe(true);
  });
});
