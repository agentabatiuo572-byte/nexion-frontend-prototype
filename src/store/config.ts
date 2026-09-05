import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ComputeShareContent, FeatureFlagKey, PlatformConfig } from "./config-types";
import { DEFAULT_PLATFORM_CONFIG } from "@/mock/platform-config";
import { isNetworkFeeConfigUsable } from "@/store/nex-faucet";
import { completePlatformConfigSeed } from "@/lib/platform-config-compat";
import { platformConfigApi, remoteApiEnabled } from "@/api/runtime";
import type { PlatformPublicStatsAuthority } from "@/api/platform-config-api";
import { captureCommerceSandboxRun, subscribeCurrentCommerceSandboxRun } from "@/api/order-api";

const IS_PRODUCTION = import.meta.env.PROD;

// Platform config / feature-flag store. Single source for client-side feature
// flags + tunable platform config across all carriers (signed APP / H5 /
// janus-loaded real-disc).
//
// MOCK-ONLY: seeded from mock/platform-config.ts. Future PROD wiring replaces
// the seed with `GET /api/config/platform` on app boot; the client treats the
// fetched response as READ-ONLY (no current admin push channel in this repo).
export const useConfig = defineStore("config", () => {
  const mockConfig = completePlatformConfigSeed(DEFAULT_PLATFORM_CONFIG);
  // Remote mode never exposes plausible server-owned seed values while the
  // authority request is pending or failed. The full structural shape keeps
  // rendering deterministic, but every server-owned value starts closed.
  const unavailableServerConfig: PlatformConfig = {
    ...mockConfig,
    featureFlags: {
      computeShareEnabled: false,
      homeNewcomerTasksEnabled: false,
      homeWeeklyPromoEnabled: false,
    },
    publicStats: {
      // 🔴 三个 -1 是**故意的非法值**,不是随手写的 0(2026-08-12 合并收口;
      // compat 的 RUNTIME_PUBLIC_STATS_DEFAULT 同款,那边有完整说明)。
      // 原因:publicStatsHealth 的合法域里 **0 是合法值**(jitter 判 0-500、
      // 增速判 0-50、虚拟人口判 0-10,000,000)。全 0 会让这三维判成「可用」,
      // 于是服务端数据还没到,首页就把占位当真数据渲染出去(实测「Members 0 · +0%/mo」)。
      // 判据:remote-config-merge-contract 的「load 前六维必须全 false」那格看住。
      fleetDevices: 0,
      onlineRatePct: 0,
      onlineJitter: -1,
      registeredUsersBase: 0,
      registeredUsersMonthlyGrowthPct: -1,
      registeredUsersAnchorAt: 0,
      realUserCount: 0,
      virtualUserCount: -1,
      hashratePercentileTable: [],
    },
    onlineBonus: { h5BaseFactor: 0, continuityFullHours: 0 },
    // These K/D5 policy branches are not part of the current public platform
    // projection.  They must therefore never inherit their mock values in
    // remote mode.  The values below are deliberately inert; real writes use
    // their dedicated server endpoints (auth, payout-address, withdrawals).
    riskCluster: {
      freePhoneSlotsPerCluster: 0,
      duplicateAccountPendingFrom: 0,
      duplicateAccountFreezeFrom: 0,
      pendingReleaseHours: 0,
      appAttestationReleaseHours: 0,
      maxSignupPerIp24h: 0,
      maxAccountsPerDevice: 0,
      maxAccountsPerPaymentInstrument: 0,
      clusterFreezeSuggestThreshold: 0,
      releaseMode: "manual_only",
      freeSlotRequiresBinding: true,
    },
    withdrawRules: {
      minWithdrawableUsdt: 0,
      sameAddressRoute: "reject",
      firstWithdrawalManual: true,
      newAddressHoldHours: 0,
      rebindCooldownDays: 0,
      smallAmountThresholdUsd: 0,
      payoutSlaHours: 0,
      payoutReviewWindowDays: 0,
      networkConfirmFeeUsd: { trc20: 0, bep20: 0, erc20: 0 },
    },
    rewards: {
      welcomeGift: { lockMode: "risk_bucket", usdtAmount: 0, nexAmount: 0 },
      inviterReward: { nexAmount: 0 },
    },
    riskScore: {
      dimensionWeights: {
        serverDeviceId: 0,
        ipBucket: 0,
        withdrawAddress: 0,
        paymentInstrument: 0,
        sponsor: 0,
        uaFingerprint: 0,
        signupTiming: 0,
      },
      weakSignalClusterThreshold: 0,
    },
    otpGate: {
      resendSeconds: 0,
      captchaAfterSends: 0,
      otpTtlSeconds: 0,
      maxVerifyAttempts: 0,
      captchaTicketTtlSeconds: 0,
      captchaAlwaysScenes: [],
    },
    computeShare: {
      downloadUrl: "",
      content: { zhTitle: "", zhGuide: "", enTitle: "", enGuide: "" },
      gpuTiers: [],
    },
    share: {
      baseUrl: "",
      channels: [],
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
  const config = ref<PlatformConfig>(remoteApiEnabled ? unavailableServerConfig : mockConfig);
  const publicStatsAuthority = ref<PlatformPublicStatsAuthority | null>(null);

  // SPEC-7 FEAT-RISK02 异常3: 配置拉取失败态。true = 结算暂停、钱包显示
  // 「收益结算稍后同步」;禁止回退到前端写死默认值继续结算。
  // PROD: GET /api/config/platform 失败/超时时由请求层置位。
  // 配置重拉的合成延迟(mock)。对齐 refresh.ts 的 REFRESH_LATENCY_MS 量级 ——
  // 必须 > 0 且够长到能画出一帧骨架,否则加载态是死 UI。
  const CONFIG_LOAD_LATENCY_MS = 600;

  const syncFailed = ref(true);

  /**
   * 🔴 提现费率配置是否合法 —— **在信任边界校验,不在消费点校验**。
   *
   * 为什么放这儿(2026-07-31 第 5 轮复验结论):原先是页面自己拿 withdrawRules 现判,
   * 属于「消费点校验」—— 任何人在页面读到值**之前**动手脚(例如给它套一层
   * 防御性默认值)就能让校验器永远看不到坏值,失败态永不触发、按写死值收费,
   * 而所有文本哨兵全绿。补文本断言补了三次、每次都被「保留被 pin 的串、改掉喂给它的数据」绕过。
   *
   * 挪到这里后,「在页面塞默认值」这个动作本身失去意义:裁决在上游已经做出,
   * 页面只消费结论。这也正是本项目 coding-style 的原话:
   * 「Validate at system boundaries / never trust external data (API responses)」。
   *
   * PROD:同一个判据用在 GET /api/config/platform 的响应上,不合法即置 syncFailed。
   */
  const feeConfigValid = computed(() =>
    !syncFailed.value && isNetworkFeeConfigUsable(config.value.withdrawRules.networkConfirmFeeUsd),
  );

  function isEnabled(flag: FeatureFlagKey): boolean {
    return !syncFailed.value && config.value.featureFlags[flag] === true;
  }

  /**
   * 重拉平台配置(失败态的重试出口)。
   * MOCK:清 syncFailed 即恢复(种子本就在内存)。
   * PROD:GET /api/config/platform → 成功覆盖 config 并清 syncFailed;失败保持置位。
   * 🔴 失败时**不得**把 config 重置成前端种子 —— 那等于回退写死值(FEAT-RISK02 异常3)。
   */
  const loading = ref(false);
  let reloadAfterCurrentFlight = false;

  function clearRemotePlatformAuthority() {
    if (!remoteApiEnabled) return;
    publicStatsAuthority.value = null;
    config.value = {
      ...config.value,
      publicStats: { ...unavailableServerConfig.publicStats },
    };
    syncFailed.value = true;
  }

  async function load(): Promise<void> {
    if (loading.value) {
      reloadAfterCurrentFlight = true;
      return;
    }
    loading.value = true;
    try {
      if (!remoteApiEnabled) {
        await new Promise<void>((resolve) => setTimeout(resolve, CONFIG_LOAD_LATENCY_MS));
        syncFailed.value = false;
        return;
      }
      const remote = await platformConfigApi.platformConfig();
      if (remote.publicStatsAuthority.sourceEnvironment !== "PRODUCTION") {
        throw new Error("H9_PUBLIC_STATS_ENVIRONMENT_MISMATCH");
      }
      config.value = {
        // The server snapshot is authoritative for every field it provides.
        // Keep only the client-only structural branches that are not part of
        // this bounded context; no fetched field is allowed to fall back to a
        // mock value by precedence.
        ...config.value,
        // Platform's public endpoint owns only this subset. Keep unrelated
        // client feature declarations structurally present, but never use a
        // mock value for a server-supplied flag.
        featureFlags: { ...config.value.featureFlags, ...remote.featureFlags },
        // 🔴 publicStats 是 H9 的**唯一**来源:种子里没有它(819a6da 把它移出 mock 数据),
        //   compat 只补一个「故意非法」哨兵。这里漏写 = 服务端投影解析完就被丢掉,
        //   publicStatsHealth 六位恒 false,16 个消费点永久走「不可用」占位(z1 独立审计 P0-3)。
        //   本行由 scripts/remote-config-merge-contract.test.mjs 的覆盖等式钉着:
        //   解析器返回的每个属于 PlatformConfig 的字段都必须在这里落地,漏一个即红。
        publicStats: remote.publicStats,
        onlineBonus: remote.onlineBonus,
        rewards: remote.rewards,
        computeShare: remote.computeShare,
        share: remote.share,
      };
      publicStatsAuthority.value = remote.publicStatsAuthority;
      syncFailed.value = false;
    } catch {
      clearRemotePlatformAuthority();
    } finally {
      loading.value = false;
      if (reloadAfterCurrentFlight && captureCommerceSandboxRun().runId !== null) {
        reloadAfterCurrentFlight = false;
        void load();
      }
    }
  }

  if (remoteApiEnabled) {
    subscribeCurrentCommerceSandboxRun((scope) => {
      if (scope.runId === null) {
        reloadAfterCurrentFlight = false;
        clearRemotePlatformAuthority();
        return;
      }
      if (publicStatsAuthority.value?.sourceEnvironment === "SANDBOX"
          && publicStatsAuthority.value.runId === scope.runId) return;
      clearRemotePlatformAuthority();
      if (loading.value) reloadAfterCurrentFlight = true;
      else void load();
    });
  }

  // ⚠️ DEV/DEMO-ONLY: 模拟配置拉取失败,演 FEAT-RISK02 异常3。
  function _devSetConfigSyncFailed(value: boolean) {
    if (remoteApiEnabled || IS_PRODUCTION) return;
    syncFailed.value = value;
  }

  // ⚠️ MOCK-ONLY demo helper: lets reviewers flip a flag locally to preview a
  // gated entry without an admin round-trip (front/back are not wired in the
  // prototype, DR-7). PROD: flags come from the server only; client never
  // mutates — remove this when wiring the real endpoint.
  function _devSetFlag(flag: FeatureFlagKey, value: boolean) {
    if (remoteApiEnabled || IS_PRODUCTION) return;
    config.value = {
      ...config.value,
      featureFlags: { ...config.value.featureFlags, [flag]: value },
    };
  }

  function _devSetComputeShareContent(content: Partial<ComputeShareContent>) {
    if (remoteApiEnabled || IS_PRODUCTION) return;
    config.value = {
      ...config.value,
      computeShare: {
        ...config.value.computeShare,
        content: { ...config.value.computeShare.content, ...content },
      },
    };
  }

  return { config, publicStatsAuthority, syncFailed, loading, load, feeConfigValid, isEnabled, _devSetFlag, _devSetComputeShareContent, _devSetConfigSyncFailed };
});

// currentNetworkConfirmFeeUsd(权威网络费跨 store 纯函数)已随 c37e642 的 D5 policy
// 权威化成为零调用死码,z1 判决包删除 —— 费用快照第 5 参权威源现为页面层
// withdrawalPolicy.networkConfirmFeeUsd(服务端 /api/withdrawals/policy),留着死函数
// 会诱使未来哨兵钉上它假绿。
