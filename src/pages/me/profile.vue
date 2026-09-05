<!--
  Profile — ported from Nexion-prototype/app/(main)/me/profile/page.tsx.
  Display name is picked from curated pool candidates via NicknameSheet
  (free-text input + bio + region/timezone all removed 2026-07-15, content
  governance — the page has zero manual input); avatar reroll, tier
  progress bar, wallet-binding link, save bar (disabled until dirty).

  Wrapped in <AppChassis active="me">; SubPageHeader (back chevron) scrolls
  with content. The source MechAvatar is replaced with the initial-letter
  avatar used elsewhere in this me domain (profile-row.vue) — uni has no SVG
  avatar generator and the letter avatar is the established convention here.
  The first-day quest (markComplete) is omitted — no quest store is ported
  in this batch.
-->
<template>
  <AppChassis active="me">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" :title="t.profile.title" />

      <!-- Avatar + email — de-carded: identity sits on the page floor. -->
      <view :style="avatarBlockStyle">
        <view class="flex items-center" style="gap: 16px">
          <view class="relative">
            <view class="grid place-items-center overflow-hidden" :style="avatarStyle">
              <image v-if="avatarUrl" :src="avatarUrl" mode="aspectFill" style="width: 64px; height: 64px" />
              <text v-else :style="avatarTextStyle">{{ initial }}</text>
            </view>
            <view
              class="grid place-items-center active:opacity-80"
              :style="regenBtnStyle"
              role="button"
              tabindex="0"
              aria-disabled="false"
              @click="handleRegen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
            </view>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block truncate" :style="nameStyle">{{ displayName }}</text>
            <text class="block truncate" :style="emailStyle">{{ email }}</text>
            <view class="flex items-center" style="gap: 6px; margin-top: 2px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <text :style="joinedStyle">{{ t.profile.joinedOn }} {{ joinedDate }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Editable fields — de-carded: section label + fields on the floor. -->
      <text class="block" :style="sectionLabelStyle">{{ t.profile.sectionPublic }}</text>
      <view :style="fieldsWrapStyle">
        <view>
          <view class="flex items-center" style="gap: 6px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            <text :style="fieldLabelStyle">{{ t.profile.displayName }}</text>
          </view>
          <view
            class="flex items-center active:opacity-80"
            :style="nameRowStyle"
            role="button"
            tabindex="0"
            aria-disabled="false"
            :aria-label="t.profile.nicknameChange"
            @click="openNicknameSheet"
          >
            <text class="flex-1 truncate" :style="nameValueStyle">{{ name }}</text>
            <text class="shrink-0" :style="nameChangeStyle">{{ t.profile.nicknameChange }}</text>
          </view>
          <text class="block" :style="fieldHintStyle">{{ t.profile.displayNameHint }}</text>
        </view>

      </view>

      <!-- Tier — de-carded: section label + progress on the floor. -->
      <view class="flex items-center justify-between" :style="tierHeaderStyle">
        <text :style="tierTitleStyle">{{ t.profile.tierTitle }}</text>
        <text :style="tierLabelStyle">{{ tierLabel }}</text>
      </view>
      <view :style="tierBarWrapStyle">
        <view :style="tierTrackStyle">
          <view :style="tierFillStyle" />
        </view>
      </view>
      <text class="block" :style="tierProgressStyle">{{ tierProgressLine }} · 62%</text>

      <!-- Wallet binding -->
      <view class="mx-4 flex items-center active:opacity-90" :style="walletCardStyle" @click="goWallet">
        <view class="grid place-items-center shrink-0" :style="walletIconStyle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
        </view>
        <view class="flex-1 min-w-0">
          <view class="flex items-center" style="gap: 6px">
            <text :style="walletTitleStyle">{{ t.profile.walletAddress }}</text>
            <svg v-if="paired" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
          </view>
          <text class="block truncate" :style="walletSubStyle">{{ walletSub }}</text>
        </view>
        <text :style="walletActionStyle">{{ paired ? t.profile.walletPaired : t.profile.walletPair }}</text>
      </view>

      <!-- Save bar -->
      <view style="padding: 0 16px; margin-top: 20px">
        <!-- 未改动时这个按钮点了没用,原先只是「不给按下反馈」—— 那是把禁用态藏起来。
             显式 aria-disabled 让读屏用户也知道现在按不动(《05》§6.1 disabled 公式)。 -->
        <view class="w-full flex items-center justify-center" :class="dirty ? 'active:opacity-90' : ''" :style="saveBtnStyle" role="button" tabindex="0" :aria-disabled="dirty ? 'false' : 'true'" :aria-label="t.profile.saveChanges" @click="handleSave">
          <text :style="saveLabelStyle">{{ t.profile.saveChanges }}</text>
        </view>
        <text v-if="saveFeedback" class="block text-center" :style="saveFeedbackStyle">{{ saveFeedback }}</text>
      </view>

      <NicknameSheet
        :open="nicknameSheetOpen"
        :authoritative="remoteApiEnabled"
        :server-candidates="profile.nicknameCandidates"
        @close="nicknameSheetOpen = false"
        @pick="onNicknamePick"
        @reroll="loadProfileCandidates"
      />
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type CSSProperties } from "vue";
import { profileApi, remoteApiEnabled } from "@/api/runtime";
import AppChassis from "@/components/app-chassis.vue";
import NicknameSheet from "@/components/me/nickname-sheet.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useProfile } from "@/store/profile";
import { usePayoutAddress } from "@/store/payout-address";
import { maskAddressMid, PAYOUT_NETWORKS } from "@/store/payout-address-core";
import { toast } from "@/store/ui";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";

const TIERS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
type Tier = (typeof TIERS)[number];

const t = useT();
const app = useApp();
const auth = useAuth();
const profile = useProfile();
const payout = usePayoutAddress();
onMounted(() => {
  // 合并裁决(2026-08-14):取远端那侧(保留 .catch + 收下新增的两个加载调用)。
  //   本地这侧只是把 payout 那行的 .catch 去掉了 —— 理由是缝已自吞、这层是死代码。
  //   但「死代码」和「有害」不是一回事:留着它,万一将来有人把缝的自吞改回抛,
  //   这个调用点仍是安全的。少一行的收益抵不上那个风险,所以不坚持本地那侧。
  if (remoteApiEnabled) void payout.refreshRemote().catch(() => undefined);
  if (remoteApiEnabled) void loadProfileCandidates();
  if (remoteApiEnabled) void loadRemoteProfile();
});

// Local edit buffer (committed on Save), mirroring the source useState.
const name = ref(profile.displayName);
const saveFeedback = ref("");
const isSaving = ref(false);
const nicknameSheetOpen = ref(false);
const avatarUrl = ref("");
const avatarRevision = ref("");
const avatarUploading = ref(false);

const displayName = computed(() => profile.displayName);
// A remote session's user-id key is internal routing state, never profile copy.
// Until the backend supplies a phone projection, show an honest blank field.
const email = computed(() => remoteApiEnabled ? profile.phoneE164 : (auth.email || app.user.email));
const initial = computed(
  () => (displayName.value || email.value || "S").trim()[0]?.toUpperCase() || "S",
);
// 提现地址(payout-address 单源;展示第一个已设网络的当前地址,掩码中段)
const paired = computed(() => payout.hasAnyAddress);
// 展示与跳转必须同源同网络:入口显示的是哪个网络的地址,点进去就落哪个网络 ——
// 否则 BEP20/ERC20 用户点「管理」落到 TRC20 空槽,看起来像地址丢失(审计 P1)。
const walletNetwork = computed(() => PAYOUT_NETWORKS.find((network) => payout.currentFor(network)));
const walletAddress = computed(() => (walletNetwork.value ? payout.currentFor(walletNetwork.value)?.address : undefined));
const walletSub = computed(() =>
  walletAddress.value ? maskAddressMid(walletAddress.value) : t.value.profile.walletEmpty,
);

const userTier = computed<Tier>(() => (app.user.tier as Tier) ?? "L0");
const tierLabel = computed(() => t.value.profile.tierLabels[userTier.value]);
const tierProgressLine = computed(() => {
  const idx = TIERS.indexOf(userTier.value);
  const nextTier: Tier = idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : "L5";
  return t.value.profile.tierProgress.replace("{next}", t.value.profile.tierLabels[nextTier]);
});

const joinedDate = computed(() =>
  new Date(app.user.joinedAt).toLocaleDateString(dateLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }),
);

const dirty = computed(() => name.value !== profile.displayName);

async function loadProfileCandidates() {
  const ok = await profile.refreshNicknameCandidates();
  if (!ok) toast.error(t.value.profile.serverMutationFailed);
}

async function openNicknameSheet() {
  if (remoteApiEnabled && profile.nicknameCandidates.length === 0) {
    const ok = await profile.refreshNicknameCandidates();
    if (!ok) {
      toast.error(t.value.profile.serverMutationFailed);
      return;
    }
  }
  nicknameSheetOpen.value = true;
}

function onNicknamePick(v: string) {
  name.value = v;
  nicknameSheetOpen.value = false;
}

async function handleSave() {
  if (isSaving.value) return;
  if (!dirty.value) {
    saveFeedback.value = t.value.profile.noChangesToast;
    toast.info(t.value.profile.noChangesToast);
    return;
  }
  isSaving.value = true;
  try {
    const saved = await profile.setDisplayName(name.value);
    if (!saved) return;
    name.value = profile.displayName;
    saveFeedback.value = t.value.profile.savedToast;
    toast.success(t.value.profile.savedToast);
  } catch {
    toast.error(t.value.profile.serverMutationFailed);
  } finally {
    isSaving.value = false;
  }
}

async function loadRemoteProfile() {
  const scope = captureAccountScope();
  const accountKey = auth.accountId;
  try {
    const projection = await profileApi.profile();
    if (!isCurrentAccountScope(scope) || auth.accountId !== accountKey) return;
    avatarUrl.value = projection.avatarUrl;
    avatarRevision.value = projection.avatarRevision;
  } catch {
    if (!isCurrentAccountScope(scope) || auth.accountId !== accountKey) return;
    toast.error(t.value.profile.serverMutationFailed);
  }
}

async function handleRegen() {
  if (avatarUploading.value) return;
  if (remoteApiEnabled) {
    try {
      const chosen = await new Promise<UniApp.ChooseImageSuccessCallbackResult>((resolve, reject) => {
        uni.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"], success: resolve, fail: reject });
      });
      const filePath = chosen.tempFilePaths[0];
      if (!filePath) return;
      avatarUploading.value = true;
      const scope = captureAccountScope();
      const accountKey = auth.accountId;
      const key = `app-profile:avatar:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const before = avatarRevision.value;
      try {
        const result = await profileApi.uploadAvatar(filePath, key);
        if (!isCurrentAccountScope(scope) || auth.accountId !== accountKey) return;
        avatarUrl.value = result.avatarUrl;
        avatarRevision.value = result.avatarRevision;
      } catch (cause) {
        const authoritative = await profileApi.profile().catch(() => null);
        if (!isCurrentAccountScope(scope) || auth.accountId !== accountKey) return;
        if (!authoritative || !authoritative.avatarRevision || authoritative.avatarRevision === before) throw cause;
        avatarUrl.value = authoritative.avatarUrl;
        avatarRevision.value = authoritative.avatarRevision;
      }
      toast.success(t.value.profile.avatar, t.value.profile.avatarHint);
    } catch (cause) {
      if (cause instanceof Error && /cancel/i.test(cause.message)) return;
      toast.error(t.value.profile.serverMutationFailed);
    } finally {
      avatarUploading.value = false;
    }
    return;
  }
  if (!profile.regenerateAvatar()) return;
  toast.info(t.value.profile.avatar, t.value.profile.avatarHint);
}

function goWallet() {
  // 提现地址行 → 地址管理页(带展示中的网络参数,与 wallet-withdraw.goManage 同模式)
  const query = walletNetwork.value ? `?network=${walletNetwork.value}` : "";
  uni.navigateTo({ url: `/pages/me/wallet-address-rebind${query}`, fail: () => {} });
}

// ── styles ──
// De-carded: identity block sits on the page floor (2px optical inset aligns it
// with the section labels + fields below; header→content gap is global).
const avatarBlockStyle: CSSProperties = {
  margin: "0 16px",
  padding: "0 2px",
};
const avatarStyle: CSSProperties = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  background: "var(--v5-brand)",
};
const avatarTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "26px",
  color: "var(--v5-on-brand)",
};
const regenBtnStyle: CSSProperties = {
  position: "absolute",
  bottom: "-6px",
  right: "-6px",
  width: "28px",
  // 🔴 不抬到 44:这是叠在头像右下角的圆形角标,撑到 44 会盖住头像大半 ——
  // 视觉形态是本质约束(WCAG 2.5.8 Essential)。28×28 ≥ AA 下限 24×24,已进 tap 台账豁免。
  height: "28px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const emailStyle: CSSProperties = {
  marginTop: "1px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const joinedStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
// Section label (de-card spec): 15/600/ink at the 18px content edge.
const sectionLabelStyle: CSSProperties = {
  margin: "22px 18px 12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
// Fields sit on the floor, separated by whitespace (form idiom — no hairlines).
const fieldsWrapStyle: CSSProperties = {
  margin: "0 16px",
  padding: "0 2px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};
const fieldLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
// 昵称行:只读可点(唯一改名路径=候选 sheet),44pt tap target。
const nameRowStyle: CSSProperties = {
  marginTop: "4px",
  minHeight: "44px",
  // 外层 fieldsWrap 无背景,此行直接坐在页面底上;surface-2 对页面底亮色 ΔE 2.2 不可辨 → 改 L1 surface。
  background: "var(--v5-surface)",
  borderRadius: "8px",
  padding: "0 12px",
  gap: "10px",
};
const nameValueStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink)",
};
const nameChangeStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
};
const fieldHintStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const readOnlyHoldStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-warning)",
};
// De-carded tier: section-label header (title + tier badge) then the bar +
// progress line on the floor.
const tierHeaderStyle: CSSProperties = {
  margin: "22px 16px 8px",
  padding: "0 2px",
};
const tierTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
const tierBarWrapStyle: CSSProperties = {
  margin: "0 16px",
  padding: "0 2px",
};
const tierLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const tierTrackStyle: CSSProperties = {
  height: "8px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  overflow: "hidden",
};
const tierFillStyle: CSSProperties = {
  height: "100%",
  width: "62%",
  background: "linear-gradient(to right, var(--v5-brand), color-mix(in srgb, var(--v5-brand) 55%, var(--v5-success)))",
};
const tierProgressStyle: CSSProperties = {
  margin: "8px 18px 0",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
// Wallet-binding nav row keeps its surface (nav-list whitelist) — border dropped.
const walletCardStyle: CSSProperties = {
  marginTop: "20px",
  gap: "12px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "16px",
};
const walletIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
};
const walletTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
const walletSubStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const walletActionStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: paired.value ? "var(--v5-brand-2)" : "var(--v5-brand)",
}));
const saveBtnStyle = computed<CSSProperties>(() => ({
  height: "44px",
  borderRadius: "12px",
  background: dirty.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
}));
const saveLabelStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: dirty.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
const saveFeedbackStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
</script>
