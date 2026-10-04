import ts from "typescript";
import * as vue from "vue";
import { describe, expect, it, vi } from "vitest";
import source from "./profile.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { rankName } from "@/lib/v-rank-copy";

type PayoutFixture = {
  hasAnyAddress: boolean;
  provenance: unknown;
  address?: string;
};

// Execute the page's real wallet computed values.  The fixture contains no
// payout command, OTP, or server call.
function mountProfile(remote: boolean, payoutFixture: PayoutFixture) {
  const script = source.split('<script setup lang="ts">')[1].split("const userTier")[0];
  const output = ts.transpileModule(script, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const payout = vue.reactive({
    hasAnyAddress: payoutFixture.hasAnyAddress,
    provenance: payoutFixture.provenance,
    currentFor: (network: string) => payoutFixture.address && network === "usdt-trc20"
      ? { address: payoutFixture.address } : undefined,
    refreshRemote: vi.fn(async () => false),
  });
  const modules: Record<string, unknown> = {
    vue: { ...vue, onMounted: vi.fn(), onUnmounted: vi.fn(), watch: vi.fn() },
    "@dcloudio/uni-app": { onHide: vi.fn(), onShow: vi.fn() },
    "@/api/runtime": { profileApi: {}, remoteApiEnabled: remote },
    "@/lib/route": { navTo: vi.fn() },
    "@/i18n/use-t": { useT: () => vue.ref(zh) },
    "@/i18n/format": { dateLocale: () => "zh-CN" },
    "@/store/app": { useApp: () => ({ accountKey: "A", accountBindingEpoch: 1, user: {} }) },
    "@/store/auth": { useAuth: () => ({ accountId: "A", email: "" }) },
    "@/store/profile": { useProfile: () => ({ displayName: "", phoneE164: "", nicknameCandidates: [] }) },
    "@/store/payout-address": { usePayoutAddress: () => payout },
    "@/store/quest": { useQuest: () => ({}) },
    "@/store/v-rank": { useVRank: () => ({}) },
    "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) },
    "@/store/payout-address-core": {
      PAYOUT_NETWORKS: ["usdt-trc20"],
      maskAddressMid: (address: string) => `masked:${address}`,
    },
    "@/store/ui": { toast: {} },
    "@/lib/account-scope": { captureAccountScope: vi.fn(), isCurrentAccountScope: vi.fn(() => true) },
    "@/lib/remote-profile-quest": { claimSetupProfileQuest: vi.fn() },
    "@/lib/profile-save-flow": { reconcileProfileEdit: vi.fn() },
    "@/lib/secure-command-id": { requireCryptoUuid: vi.fn() },
    "@/lib/profile-date": { formatJoinedDate: vi.fn() },
    "@/lib/profile-vrank-display": { profileVRankProjection: vi.fn() },
    "@/lib/v-rank-copy": { rankName },
    "@/api/order-api": { subscribeRuntimeRevision: vi.fn(() => () => undefined) },
    "./p3-18-account-page-fence": {
      createP318AccountPageFence: () => ({ capture: vi.fn(), isCurrent: vi.fn(() => true), invalidate: vi.fn() }),
    },
  };
  const page = new Function("require", "exports", `${output};return { walletSub, walletAction, paired, walletNetwork };`)(
    (name: string) => name.endsWith(".vue") ? {} : modules[name],
    {},
  );
  return vue.proxyRefs(page);
}

describe("profile payout read state", () => {
  it("does not turn an unconfirmed remote empty book into an unset address", () => {
    const page = mountProfile(true, { hasAnyAddress: false, provenance: null });

    expect(page.walletSub).toBe(zh.profile.walletUnknown);
    expect(page.walletAction).toBe(zh.profile.walletPaired);
    expect(source).toContain("{{ walletSub }}");
    expect(source).toContain("{{ walletAction }}");
    expect(source).toContain('const query = walletNetwork.value ? `?network=${walletNetwork.value}` : "";');
  });

  it("keeps confirmed remote empty, confirmed bound, and local empty semantics distinct", () => {
    expect(mountProfile(true, { hasAnyAddress: false, provenance: {} }).walletSub).toBe(zh.profile.walletEmpty);
    expect(mountProfile(true, { hasAnyAddress: false, provenance: {} }).walletAction).toBe(zh.profile.walletPair);

    const bound = mountProfile(true, { hasAnyAddress: true, provenance: {}, address: "T-verified" });
    expect(bound.walletSub).toBe("masked:T-verified");
    expect(bound.walletAction).toBe(zh.profile.walletPaired);

    const local = mountProfile(false, { hasAnyAddress: false, provenance: null });
    expect(local.walletSub).toBe(zh.profile.walletEmpty);
    expect(local.walletAction).toBe(zh.profile.walletPair);
  });
});
