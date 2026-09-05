import type { PlatformConfigSeed } from "@/store/config-types";
import { GPU_TIERS } from "@/lib/gpu-tiers";

// MOCK-ONLY seed for platform config / feature flags (backend-replaceable).
// Future PROD `GET /api/config/platform` returns this shape by projecting each
// domain's existing source (E/K/H3). The client treats the response as read-only;
// this repo currently has no admin-to-client transport.
export const DEFAULT_PLATFORM_CONFIG: PlatformConfigSeed = {
  featureFlags: {
    // DR-1: 电脑算力默认 OFF。
    computeShareEnabled: false,
    // FEAT-HOME02 mock projections. PROD derives these from the existing H3
    // day-one task statuses and promo-banner status; client remains read-only.
    homeNewcomerTasksEnabled: true,
    homeWeeklyPromoEnabled: true,
  },
  // SPEC-1 在线加成系数(单一来源:lib/hashpower.ts 派生 H5_BASE_FACTOR / CONTINUITY_FULL_MS)。
  // 与 admin compute-config COMPUTE_COEFFICIENTS 同 key,运营在 E6 调,PROD 由服务端下发。
  onlineBonus: {
    h5BaseFactor: 0.6,
    continuityFullHours: 2,
  },
  // SPEC-7 mock seed only. PROD: server/admin owns these values; client must
  // not bake any of them into registration, settlement, or withdrawal logic.
  riskCluster: {
    freePhoneSlotsPerCluster: 1,
    duplicateAccountPendingFrom: 2,
    duplicateAccountFreezeFrom: 4,
    pendingReleaseHours: 72,
    appAttestationReleaseHours: 2,
    maxSignupPerIp24h: 3,
    maxAccountsPerDevice: 2,
    // ↓ 口径 = 后台 PRD K1③(同支付工具 ≤2 / 冻结建议线 0.7),与 admin RISK_CLUSTER_PARAMS
    //   defaultVal 同源;值漂移由 verify.sh「SPEC-7 param value parity」哨兵拦。
    //   (2026-07-14 修正镜像抄错的 1/0.82;07-15 因整树 reset 丢失后重放,详见 memory feedback_cross_repo_value_parity)
    maxAccountsPerPaymentInstrument: 2,
    clusterFreezeSuggestThreshold: 0.7,
    releaseMode: "attest_or_manual",
    freeSlotRequiresBinding: true,
  },
  withdrawRules: {
    minWithdrawableUsdt: 20,
    sameAddressRoute: "manual",
    firstWithdrawalManual: true,
    newAddressHoldHours: 24,
    rebindCooldownDays: 7,
  },
  rewards: {
    // NEX 数量原 200(≈免费 $2000 提现抵扣额度)过松,已收紧到 20;此处仅 mock seed,运营在 K 域调。
    welcomeGift: { lockMode: "risk_bucket", usdtAmount: 5, nexAmount: 20 },
    // 邀请人奖励:邀请人每邀请一名新用户得的 NEX;此处仅 mock seed,运营在 K 域调。
    inviterReward: { nexAmount: 200 },
  },
  // FEAT-AUTH01 OTP 闸门 mock seed(PRD §4.6.2/§16.2.1;运营在 K 域调)。
  otpGate: {
    resendSeconds: 60,
    captchaAfterSends: 2,
    otpTtlSeconds: 300,
    maxVerifyAttempts: 5,
    captchaTicketTtlSeconds: 120,
  },
  // SPEC-7 §5b 七维权重 mock seed(K4 权威可配)。强维 0.8+,中维 0.4-0.5,弱维 ≤0.3。
  riskScore: {
    dimensionWeights: {
      serverDeviceId: 0.9,
      ipBucket: 0.8,
      withdrawAddress: 0.9,
      paymentInstrument: 0.5,
      sponsor: 0.4,
      uaFingerprint: 0.2,
      signupTiming: 0.3,
    },
    weakSignalClusterThreshold: 0.6,
  },
  // SPEC-2 M5/M6: structure mirrors admin E6 compute config. DR-7: mock-only,
  // not wired to the admin console yet; PROD server makes this authoritative.
  computeShare: {
    downloadUrl: "",
    content: {
      zhTitle: "电脑显卡算力共享",
      zhGuide: "下载桌面客户端,使用同一账号登录,连接后电脑会出现在设备仓库中。",
      enTitle: "Computer GPU share",
      enGuide: "Download the desktop client, sign in with the same account, and the computer appears in device inventory after connection.",
    },
    gpuTiers: GPU_TIERS,
  },
  // FEAT-SHARE01 分享链路 mock seed(§13.3 share.*;运营在 admin 调)。
  // baseUrl 留空 = dev 回退运行时 origin(扫码可达本机);PROD/admin 配
  // https://nexgrid.ai/ref/(F1 域名单源)。officialUrl 留空 = 官网地址占位态。
  share: {
    baseUrl: "",
    channels: [
      { key: "zalo", intentType: "scheme", androidPackage: "com.zing.zalo", iosScheme: "zalo://", enabled: true },
      { key: "telegram", intentType: "web", urlTemplate: "https://t.me/share/url?url={link}&text={text}", enabled: true },
      { key: "whatsapp", intentType: "web", urlTemplate: "https://wa.me/?text={text}", enabled: true },
      { key: "messenger", intentType: "scheme", androidPackage: "com.facebook.orca", iosScheme: "fb-messenger://", enabled: true },
      { key: "sms", intentType: "web", urlTemplate: "sms:?body={text}", enabled: true },
      { key: "x", intentType: "web", urlTemplate: "https://twitter.com/intent/tweet?text={text}", enabled: true },
      { key: "copy", intentType: "copy", enabled: true },
      { key: "poster", intentType: "poster", enabled: true },
      { key: "system", intentType: "system", enabled: true },
    ],
    appDownload: {
      officialUrl: "",
      iosUrl: "",
      androidUrl: "",
      apkUrl: "",
      version: "",
      releaseNotes: { zh: "", en: "" },
      source: "unavailable",
    },
  },
};
