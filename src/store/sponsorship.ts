import { defineStore } from "pinia";
import { ref } from "vue";
import { pickSponsor, type SponsorMeta } from "@/mock/sponsors";
import { normalizeAccountKey } from "@/store/account-cloud";
import { useConfig } from "@/store/config";
import { remoteApiEnabled } from "@/api/runtime";

// ⚠️ MOCK-ONLY: 本地保存推荐展示态与礼包领取标记。PROD 由既有
// `POST /api/sponsorship/bind` 及其服务端账本回执原子裁决，客户端不能把此表
// 当作推荐关系或礼包资格的权威来源。
const STORAGE_KEY = "nexgrid-sponsorship-v1";

// 邀请码 client 预检(服务端权威校验另行);大小写不敏感,统一大写。
export const REF_CODE_RE = /^NEXGRID-[A-Z0-9]{4}$/;

export function normalizeRefCode(raw: string | null | undefined): string | null {
  const v = (raw || "").trim().toUpperCase();
  return REF_CODE_RE.test(v) ? v : null;
}

interface AccountBinding {
  sponsorCode: string;
  sponsor: SponsorMeta | null;
  giftClaimed: boolean;
  boundAt: number;
}

interface Persisted {
  schema?: 2;
  bindingsByAccount?: Record<string, AccountBinding>;
  // v1 兼容字段：旧设备级展示态只在首次读取时迁到 default/已领取账号。
  sponsorCode?: string | null;
  sponsor?: SponsorMeta | null;
  giftClaimed?: boolean;
  giftClaimedByAccount?: Record<string, boolean>;
  boundAt?: number | null;
  pendingCode?: string | null;
  pendingAt?: number | null;
}

interface State {
  bindingsByAccount: Record<string, AccountBinding>;
  pendingCode: string | null;
  pendingAt: number | null;
}

function validBinding(raw: unknown): AccountBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<AccountBinding>;
  const sponsorCode = normalizeRefCode(value.sponsorCode);
  if (!sponsorCode || !Number.isFinite(value.boundAt)) return null;
  return {
    sponsorCode,
    sponsor: pickSponsor(sponsorCode),
    giftClaimed: !!value.giftClaimed,
    boundAt: value.boundAt as number,
  };
}

function hydrate(): State {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY) as Persisted | "";
    if (!raw || typeof raw !== "object") return { bindingsByAccount: {}, pendingCode: null, pendingAt: null };
    const bindingsByAccount: Record<string, AccountBinding> = {};
    if (raw.bindingsByAccount && typeof raw.bindingsByAccount === "object") {
      Object.entries(raw.bindingsByAccount).forEach(([accountKey, binding]) => {
        const valid = validBinding(binding);
        if (valid) bindingsByAccount[normalizeAccountKey(accountKey)] = valid;
      });
    } else {
      const legacyCode = normalizeRefCode(raw.sponsorCode);
      if (legacyCode) {
        const legacy = {
          sponsorCode: legacyCode,
          sponsor: pickSponsor(legacyCode),
          giftClaimed: !!raw.giftClaimed,
          boundAt: Number.isFinite(raw.boundAt) ? raw.boundAt as number : Date.now(),
        };
        bindingsByAccount.default = legacy;
        Object.entries(raw.giftClaimedByAccount ?? {}).forEach(([accountKey, claimed]) => {
          if (claimed) bindingsByAccount[normalizeAccountKey(accountKey)] = { ...legacy, giftClaimed: true };
        });
      }
    }
    return {
      bindingsByAccount,
      pendingCode: normalizeRefCode(raw.pendingCode),
      pendingAt: Number.isFinite(raw.pendingAt) ? raw.pendingAt as number : null,
    };
  } catch {
    return { bindingsByAccount: {}, pendingCode: null, pendingAt: null };
  }
}

export const useSponsorship = defineStore("sponsorship", () => {
  // Remote mode has server-owned sponsorship/referral state. Do not hydrate
  // the mock sponsor table or let a stale device snapshot enter that flow.
  const init = remoteApiEnabled ? { bindingsByAccount: {}, pendingCode: null, pendingAt: null } : hydrate();
  let boundAccountKey = "default";
  const bindingsByAccount = ref<Record<string, AccountBinding>>(init.bindingsByAccount);
  const sponsorCode = ref<string | null>(null);
  const sponsor = ref<SponsorMeta | null>(null);
  const giftClaimed = ref(false);
  const boundAt = ref<number | null>(null);
  const pendingCode = ref<string | null>(init.pendingCode);
  const pendingAt = ref<number | null>(init.pendingAt);

  function applyBoundBinding() {
    const binding = bindingsByAccount.value[boundAccountKey] ?? null;
    sponsorCode.value = binding?.sponsorCode ?? null;
    sponsor.value = binding?.sponsor ?? null;
    giftClaimed.value = binding?.giftClaimed ?? false;
    boundAt.value = binding?.boundAt ?? null;
  }
  applyBoundBinding();

  function snapshotState(): State {
    return {
      bindingsByAccount: { ...bindingsByAccount.value },
      pendingCode: pendingCode.value,
      pendingAt: pendingAt.value,
    };
  }

  function restoreState(state: State) {
    bindingsByAccount.value = { ...state.bindingsByAccount };
    pendingCode.value = state.pendingCode;
    pendingAt.value = state.pendingAt;
    applyBoundBinding();
  }

  function persist(): boolean {
    if (remoteApiEnabled) return false;
    try {
      const binding = bindingsByAccount.value[boundAccountKey] ?? null;
      // 旧版本和运行时诊断仍读取这一只读镜像；真实归因与领取状态只以
      // bindingsByAccount 为源，避免再退回设备级状态。
      const giftClaimedByAccount = Object.fromEntries(
        Object.entries(bindingsByAccount.value)
          .filter(([, item]) => item.giftClaimed)
          .map(([accountKey]) => [accountKey, true]),
      );
      uni.setStorageSync(STORAGE_KEY, {
        schema: 2,
        bindingsByAccount: bindingsByAccount.value,
        // 保留旧字段只供旧代码/手工诊断读取，真实归因以 bindingsByAccount 为准。
        sponsorCode: binding?.sponsorCode ?? null,
        sponsor: binding?.sponsor ?? null,
        giftClaimed: binding?.giftClaimed ?? false,
        giftClaimedByAccount,
        boundAt: binding?.boundAt ?? null,
        pendingCode: pendingCode.value,
        pendingAt: pendingAt.value,
      } satisfies Persisted);
      return true;
    } catch {
      return false;
    }
  }

  /** 账号切换时同步当前账号的推荐展示态，禁止 A 账号串到 B。 */
  function bindAccount(rawAccountKey: string) {
    boundAccountKey = normalizeAccountKey(rawAccountKey);
    applyBoundBinding();
  }

  // 落地页捕获链接来源码:合法才写;注册前 last-touch 覆盖。
  function capturePending(raw: string) {
    const value = normalizeRefCode(raw);
    if (!value || sponsorCode.value) return;
    const previous = snapshotState();
    pendingCode.value = value;
    pendingAt.value = Date.now();
    if (!persist()) restoreState(previous);
  }

  function clearPending() {
    if (pendingCode.value === null && pendingAt.value === null) return;
    const previous = snapshotState();
    pendingCode.value = null;
    pendingAt.value = null;
    if (!persist()) restoreState(previous);
  }

  // First sponsor wins — first-wins 的作用域是账号，不能是整台设备。
  function bind(code: string): boolean {
    const cleaned = normalizeRefCode(code);
    if (!cleaned) return false;
    if (bindingsByAccount.value[boundAccountKey]) return true;
    const previous = snapshotState();
    bindingsByAccount.value = {
      ...bindingsByAccount.value,
      [boundAccountKey]: {
        sponsorCode: cleaned,
        sponsor: pickSponsor(cleaned),
        giftClaimed: false,
        boundAt: Date.now(),
      },
    };
    pendingCode.value = null;
    pendingAt.value = null;
    applyBoundBinding();
    if (persist()) return true;
    restoreState(previous);
    return false;
  }

  function claimGift(accountKey?: string): { usdt: number; nex: number } | null {
    const key = normalizeAccountKey(accountKey ?? boundAccountKey);
    const binding = bindingsByAccount.value[key];
    if (!binding || binding.giftClaimed) return null;
    const previous = snapshotState();
    bindingsByAccount.value = {
      ...bindingsByAccount.value,
      [key]: { ...binding, giftClaimed: true },
    };
    applyBoundBinding();
    if (!persist()) {
      restoreState(previous);
      return null;
    }
    const gift = useConfig().config.rewards.welcomeGift;
    return { usdt: gift.usdtAmount, nex: gift.nexAmount };
  }

  /** 同一账号恢复时仍返回冻结金额，让余额和账单各自按幂等键补齐。 */
  function ensureGiftClaim(accountKey: string, gift: { usdt: number; nex: number }): { usdt: number; nex: number } | null {
    const key = normalizeAccountKey(accountKey);
    const binding = bindingsByAccount.value[key];
    if (!binding) return null;
    if (!binding.giftClaimed) {
      const previous = snapshotState();
      bindingsByAccount.value = {
        ...bindingsByAccount.value,
        [key]: { ...binding, giftClaimed: true },
      };
      applyBoundBinding();
      if (!persist()) {
        restoreState(previous);
        return null;
      }
    }
    return gift;
  }

  function reset() {
    const previous = snapshotState();
    bindingsByAccount.value = {};
    pendingCode.value = null;
    pendingAt.value = null;
    applyBoundBinding();
    if (!persist()) restoreState(previous);
  }

  return {
    sponsorCode, sponsor, giftClaimed, boundAt, pendingCode,
    bindAccount, capturePending, clearPending, bind, claimGift, ensureGiftClaim, reset,
  };
});
