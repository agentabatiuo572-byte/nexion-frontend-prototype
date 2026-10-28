<!-- Account overview, essential shortcuts, network tiles and grouped settings. -->
<template>
  <AppChassis active="me">
    <CardStagger class="px-4 pt-3 pb-4 space-y-3" style="color: var(--v5-ink)">
      <ProfileRow />

      <WalletCard compact />
      <WalletOverview section="summary" />

      <NxSection :title="t.me.frequentFunctions" :action="t.me.deviceAddLabel" class="me-shortcuts" @action="navTo('/pages/store/store')">
        <view class="me-shortcut-grid">
          <template v-for="item in frequentItems" :key="item.key">
          <view class="me-shortcut" :data-quick-key="item.key" role="button" tabindex="0" @click="handleQuickItem(item)" @keydown.enter.prevent="handleQuickItem(item)" @keydown.space.prevent="handleQuickItem(item)">
            <view class="me-row-icon me-shortcut__icon" :class="'me-tone--' + (item.tone || 'muted')"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="path in iconPaths[item.icon]" :key="path" :d="path" /></svg><view v-if="item.dot || item.badge" class="me-row-dot" /></view>
            <text class="me-shortcut__label">{{ item.label }}</text>
          </view>
          </template>
        </view>
      </NxSection>
      <NxSection :title="t.me.myNetwork">
        <view class="me-shortcut-grid me-network-grid">
          <view v-for="item in networkItems" :key="item.key" class="me-shortcut me-network-item" :data-quick-key="item.key" role="button" tabindex="0" @click="handleQuickItem(item)" @keydown.enter.prevent="handleQuickItem(item)" @keydown.space.prevent="handleQuickItem(item)">
            <view class="me-row-icon me-shortcut__icon" :class="'me-tone--' + (item.tone || 'muted')"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="path in iconPaths[item.icon]" :key="path" :d="path" /></svg></view>
            <text class="me-shortcut__label">{{ item.label }}</text>
            <text v-if="item.meta" class="me-network-item__meta">{{ item.key === 'rank' ? visibility.mask(item.meta) : item.meta }}</text>
          </view>
        </view>
      </NxSection>
      <NxSection v-for="section in settingSections" :key="section.key" :title="section.title" :meta="section.count == null ? undefined : visibility.mask(section.count)">
        <NxListGroup>
          <NxListRow v-for="item in section.items" :key="item.key" :data-quick-key="item.key" :title="item.label" :value="['inventory', 'slots', 'orders', 'genesis'].includes(item.key) && item.meta ? visibility.mask(item.meta) : item.meta" @click="handleQuickItem(item)">
            <template #leading><view class="me-row-icon" :class="'me-tone--' + (item.tone || 'muted')">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path v-for="path in iconPaths[item.icon]" :key="path" :d="path" /></svg>
              <view v-if="item.dot || item.badge" class="me-row-dot" />
            </view></template>
          </NxListRow>
        </NxListGroup>
      </NxSection>

      <view v-if="remoteApiEnabled && remoteOrdersLoading && !remoteOrdersHasRead" class="mx-0 flex items-center" style="gap: 8px; min-height: 32px" data-me-orders-state="loading">
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.orders.refreshing }}</text>
      </view>
      <view v-else-if="remoteApiEnabled && remoteOrdersFailed" class="mx-0 flex items-center justify-between" style="gap: 12px; min-height: 44px" data-me-orders-state="failed">
        <text class="flex-1" style="font-size: 12px; color: var(--v5-danger)">{{ t.orders.refreshFailed }}</text>
        <view class="shrink-0 nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline active:opacity-70" data-me-action="retry-orders" role="button" tabindex="0" :aria-label="t.ui.retry" @click="refreshRemoteOrders"  @keydown.enter.prevent="refreshRemoteOrders" @keydown.space.prevent="refreshRemoteOrders">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>

      <!-- Sign out -->
      <view class="w-full inline-flex items-center justify-center active:opacity-90" :style="signOutStyle" data-me-action="sign-out" role="button" tabindex="0" :aria-label="t.me.signOut" @click="handleSignOut"  @keydown.enter.prevent="handleSignOut" @keydown.space.prevent="handleSignOut">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
        <text style="margin-left: 6px">{{ t.me.signOut }}</text>
      </view>

      <!-- i18n-en-ok: 品牌、平台及当前资源版本指纹，报障时逐字保留；? 表示未知 -->
      <text class="block text-center font-mono-tabular" style="margin-top: 16px; font-size: 12px; color: var(--v5-ink-4)">{{ versionFooter }}</text>
      <WalletOverview section="recovery" />
    </CardStagger>
  </AppChassis>

  <ThemePickerSheet :open="themePickerOpen" @close="themePickerOpen = false" />
</template>

<script setup lang="ts">
import { runPassiveTabRead, invalidatePassiveTabRead, passiveTabReadScope } from "@/lib/passive-tab-read";
import { useDataVisibility } from "@/store/data-visibility";
import { formatAmount } from "@/lib/amount-display";
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onHide, onShow, onUnload } from "@/composables/use-tab-page-lifecycle";
import AppChassis from "@/components/tab-page-frame.vue";
import CardStagger from "@/components/card-stagger.vue";
import NxSection from "@/components/ui/nx-section.vue";
import NxListGroup from "@/components/ui/nx-list-group.vue";
import NxListRow from "@/components/ui/nx-list-row.vue";
import ProfileRow from "@/components/me/profile-row.vue";
import WalletCard from "@/components/me/wallet-card.vue";
import WalletOverview from "@/components/me/wallet-overview.vue";
import { useCommission } from "@/store/commission";

import ThemePickerSheet from "@/components/me/theme-picker-sheet.vue";
import { useT } from "@/i18n/use-t";
import { fmt, openSlotsTemplate } from "@/i18n/format";
import { navReset, navTo } from "@/lib/route";
import { displayNickname } from "@/lib/brand-copy";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useSession } from "@/store/session";
import { useProfile } from "@/store/profile";
import { useDeposits } from "@/store/deposits";
import { useOrders } from "@/store/orders";
import { useLocaleStore } from "@/store/locale";
import { trialReservesSlotNow, useFreeTrial } from "@/store/free-trial";
import { useSecurity } from "@/store/security";
import { captureAccountScope, isCurrentAccountScope, rebindAccountScopedStores } from "@/lib/account-scope";
import { useNotifications } from "@/store/notifications";
import { useConversations } from "@/store/conversations";
import { useMessageDrawer } from "@/store/message-drawer";
import { useGenesis } from "@/store/genesis";
import { useConfig } from "@/store/config";
import { useVoucher } from "@/store/voucher";
import { useRewardsSeen } from "@/store/rewards-seen";
import { useVRank } from "@/store/v-rank";
import { useTheme } from "@/store/theme";
import { useBills } from "@/store/bills";
import { useMarket } from "@/store/market";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { accountApi, authApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import type { SecurityState } from "@/api/contracts";
import { runRemoteOrdersRefresh } from "@/lib/remote-orders-refresh";
import { subscribeRuntimeRevision } from "@/api/order-api";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { settleRemoteMeLoaders } from "@/lib/remote-me-refresh";
import { revalidateProductCatalog } from "@/store/product-catalog";
import { refreshEarningsReleaseStatus } from "@/store/earning-release";
import { compiledResourceVersion, formatResourceVersion, readNativeResourceVersion } from "@/lib/app-version";

const versionFooter = ref("UVEL");
// #ifdef H5
versionFooter.value = formatResourceVersion("H5", compiledResourceVersion);
// #endif
// #ifdef APP-PLUS
versionFooter.value = formatResourceVersion("APP");
let resourceVersionRequest = 0;
onShow(() => {
  const request = ++resourceVersionRequest;
  versionFooter.value = formatResourceVersion("APP");
  readNativeResourceVersion((version) => {
    if (request === resourceVersionRequest) versionFooter.value = formatResourceVersion("APP", version);
  });
});
onUnload(() => { ++resourceVersionRequest; });
// #endif

const t = useT();
const visibility = useDataVisibility();
const app = useApp();
const auth = useAuth();
const session = useSession();
const profile = useProfile();
// These summaries only consume authenticated server projections. Explicit
// Mock mode therefore shows unavailable instead of loading fixture stores.
const deposits = useDeposits();
const orders = useOrders();
const locale = useLocaleStore();
const trial = useFreeTrial();
const security = useSecurity();
const notifications = useNotifications();
const conversations = useConversations();
const messageCenter = useMessageDrawer();
const voucher = useVoucher();
const rewardsSeen = useRewardsSeen();
const vrank = useVRank();
const theme = useTheme();
const bills = useBills();
const commission = useCommission();
const market = useMarket();
const themePickerOpen = ref(false);
const remoteSecurity = ref<SecurityState | null>(null);
const remoteOrdersLoading = ref(false);
const remoteOrdersFailed = ref(false);
const remoteOrdersHasRead = ref(false);
let remoteSecurityRequest = 0;
let remoteOrdersRequest = 0;
let remoteMeActive = false;

const iconPaths = {
  network: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 7a4 4 0 1 0 0 .01", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  rank: ["m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 16.7l-5.2 3.2 1-5.9-4.3-4.2 5.9-.9z"],
  invite: ["M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7", "M16 6l-4-4-4 4", "M12 2v14"],
  commission: ["M12 2v20", "M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"],
  device: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2", "M12 18h.01"],
  plus: ["M12 5v14", "M5 12h14"],
  slots: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  target: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4"],
  trend: ["M3 3v18h18", "m6 15 5-5 4 3 6-7", "M16 6h5v5"],
  trophy: ["M6 9H4.5a2.5 2.5 0 0 1 0-5H6", "M18 9h1.5a2.5 2.5 0 0 0 0-5H18", "M4 22h16", "M10 14.7V17c0 .55-.47.98-.97 1.2A4 4 0 0 0 7 22", "M14 14.7V17c0 .55.47.98.97 1.2A4 4 0 0 1 17 22", "M18 2H6v7a6 6 0 0 0 12 0z"],
  flame: ["M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.1-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"],
  book: ["M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"],
  lock: ["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14v10H5z"],
  crown: ["M2 6l5 4 5-7 5 7 5-4-3 13H5z", "M5 22h14"],
  gift: ["M20 12v10H4V12", "M2 7h20v5H2z", "M12 22V7", "M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z", "M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"],
  sparkle: ["m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"],
  user: ["M20 21a8 8 0 1 0-16 0", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  shield: ["M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z", "m9 12 2 2 4-4"],
  bell: ["M10.3 21a2 2 0 0 0 3.4 0", "M4 17h16", "M18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8"],
  receipt: ["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z", "M8 7h8", "M8 12h8", "M8 17h5"],
  package: ["M16.5 9.4 7.55 4.24", "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z", "m3.3 7 8.7 5 8.7-5", "M12 22V12"],
  warning: ["M12 9v4", "M12 17h.01", "m10.3 4.3-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0z"],
  trust: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10", "m9 12 2 2 4-4"],
  sliders: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M2 14h4", "M10 8h4", "M18 16h4"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"],
  monitor: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
  sun: ["M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],
  rewind: ["M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8", "M3 3v5h5"],
  help: ["M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3", "M12 17h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20"],
  chat: ["M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"],
  code: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  messages: ["M4 4h16v11H7l-3 3z", "M8 8h8", "M8 11h5"],
  card: ["M2 7h20v10H2z", "M2 11h20", "M6 15h4"],
} as const;

type QuickIcon = keyof typeof iconPaths;
type QuickTone = "brand" | "blue" | "purple" | "orange" | "success" | "warning" | "muted" | "danger";

interface QuickItem {
  key: string;
  label: string;
  href: string;
  icon: QuickIcon;
  meta?: string;
  badge?: string;
  /** Plain unread dot (no count) on the icon tile — distinct from `badge`. */
  dot?: boolean;
  tone?: QuickTone;
}

interface QuickSection {
  key: string;
  title: string;
  count?: string;
  items: QuickItem[];
}

const profileName = computed(() => displayNickname(profile.displayName));
const orderCount = computed(() => orders.orders.length);
const localeUpper = computed(() => locale.code.toUpperCase());
const trialReady = computed(() => !remoteApiEnabled || trial.authorityStatus === "ready"
  || (trial.authorityStatus === "loading" && trial.authorityServerState !== null));
const slotsReadable = computed(() => !remoteApiEnabled || (app.remoteFleetHasSnapshot && trialReady.value));
const activeCount = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null).length);
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsUsed = computed(() => app.activeSlotCount + trialSlot.value);
const emptySlots = computed(() => Math.max(0, app.slotCap - slotsUsed.value));
const deviceSectionCount = computed(() => slotsReadable.value ? fmt(t.value.myDevices.sectionCount, { n: slotsUsed.value, total: app.slotCap }) : "—");
const activatedLabel = computed(() => slotsReadable.value ? fmt(t.value.myDevices.activatedLabel, { n: activeCount.value }) : "—");
const emptySlotsLabel = computed(() => slotsReadable.value ? fmt(openSlotsTemplate(t.value.myDevices.emptySlots, emptySlots.value), { n: emptySlots.value }) : "—");
const deviceOrdersMeta = computed(() => fmt(orderCount.value === 1 ? t.value.me.deviceOrdersMetaOne : t.value.me.deviceOrdersMeta, { n: orderCount.value }));
const rankValue = computed(() => remoteApiEnabled && !vrank.remoteReady ? "—" : `V${vrank.myRank}`);
const themeModeLabel = computed(() =>
  theme.mode === "system"
    ? t.value.me.themeMetaSystem
    : theme.mode === "dark"
      ? t.value.me.themeMetaDark
      : t.value.me.themeMetaLight,
);

// Trial routing — hero slot (eligible to start) vs active row (running).
// BUG 173: 槽位是三态,不是两态 —— 首次读取期间用固定高度骨架占位,避免
// 卡片在数据到达时凭空插入把下面的模块整体推下去。
const trialStatus = computed(() => trial.status);
const trialIsActive = computed(
  () => trialStatus.value === "active" || trialStatus.value === "grace",
);
const trialIsHero = computed(() => !trialIsActive.value && trial.promoSlot === "visible");

// Genesis row surfaces once the user actually owns a Genesis node →
// links to the holder (holdings/dividends) page.
const genesis = useGenesis();
const config = useConfig();
const ownsGenesis = computed(() => genesis.myOwned > 0);
const myGenesisValue = computed(() => fmt(t.value.me.myGenesisNodeValue, { n: String(genesis.myOwned) }));

// ── Secondary display values, wired to the live ported stores (matches source) ──
const twoFactorEnabled = computed<boolean | null>(() => remoteApiEnabled
  ? remoteSecurity.value?.twoFactorEnabled ?? null
  : security.twoFactorEnabled);
const twoFactorSummary = computed(() => twoFactorEnabled.value === null ? "—"
  : twoFactorEnabled.value ? t.value.security.twoFactorOn : t.value.security.twoFactorOff);
// The Me entry and both bells share the notification + human conversation unread total.
const messageUnread = computed(() => messageCenter.actionableUnread);
// My Rewards unread dot — unused valid vouchers keep it lit (state-based)
// OR reward credits newer than the seen-watermark (cleared on page open).
const rewardsDot = computed(() => voucher.claimedUnused.length > 0 || rewardsSeen.hasUnseen);
const quickSections = computed<QuickSection[]>(() => [
  {
    key: "network",
    title: t.value.me.myNetwork,
    items: [
      { key: "team", label: t.value.me.team, href: "/team", icon: "network", meta: t.value.me.networkOverviewMeta, tone: "brand" },
      { key: "invite", label: t.value.me.networkInviteLabel, href: "/team", icon: "invite", meta: config.config.rewards.enabled ? fmt(t.value.me.networkInviteMeta, { nex: formatAmount(config.config.rewards.inviterReward.nexAmount) }) : t.value.me.networkInviteMetaDisabled, tone: "orange" },
      { key: "commissions", label: t.value.me.networkCommissionsLabel, href: "/team/commissions", icon: "commission", meta: t.value.me.networkCommissionsMeta, tone: "success" },
      { key: "rank", label: t.value.me.currentRank, href: "/team/rank", icon: "rank", meta: rankValue.value, tone: "purple" },
    ],
  },
  {
    key: "devices",
    title: t.value.myDevices.sectionTitle,
    count: deviceSectionCount.value,
    items: [
      { key: "inventory", label: t.value.myDevices.inventoryTitle, href: "/me/devices", icon: "device", meta: activatedLabel.value, tone: "success" },
      { key: "add", label: t.value.me.deviceAddLabel, href: "/store", icon: "plus", meta: t.value.me.deviceAddMeta, tone: "brand" },
      { key: "slots", label: t.value.myDevices.inventorySlotsLabel, href: "/me/devices", icon: "slots", meta: emptySlotsLabel.value, tone: "purple" },
      { key: "goals", label: t.value.me.goalsRow, href: "/me/goals", icon: "target", meta: t.value.me.setTarget, tone: "orange" },
    ],
  },
  {
    key: "account",
    title: t.value.me.secAccount,
    items: [
      { key: "missions", label: t.value.me.missionsRow, href: "/pages/missions/missions", icon: "target", tone: "brand" },
      { key: "rewards", label: t.value.rewards.entry, href: "/me/rewards", icon: "gift", dot: rewardsDot.value, tone: "brand" },
      { key: "receipts", label: t.value.me.receiptsRow, href: "/me/receipts", icon: "receipt", tone: "brand" },
      { key: "orders", label: t.value.store.ordersChip, href: "/store/orders?from=me", icon: "package", meta: orderCount.value > 0 ? deviceOrdersMeta.value : undefined, tone: "purple" },
      { key: "genesis", label: t.value.me.genesisNode, href: ownsGenesis.value ? "/genesis/holder" : "/genesis", icon: "crown", meta: ownsGenesis.value ? myGenesisValue.value : undefined, tone: "orange" },
      { key: "cards", label: t.value.me.walletCardsRow, href: "/me/wallet-cards", icon: "card", meta: t.value.me.walletCardsMeta, tone: "muted" },
      { key: "profile", label: t.value.me.profile, href: "/me/profile", icon: "user", meta: profileName.value, tone: "muted" },
      { key: "security", label: t.value.me.security, href: "/me/security", icon: "lock", meta: twoFactorSummary.value, tone: twoFactorEnabled.value === null ? "muted" : twoFactorEnabled.value ? "muted" : "orange" },
    ],
  },
  {
    key: "preferences",
    title: t.value.me.secPreferences,
    items: [
      { key: "preferences", label: t.value.me.preferencesRow, href: "/me/preferences", icon: "sliders", tone: "muted" },
      { key: "theme", label: t.value.me.themeRow, href: "/me/preferences", icon: theme.mode === "system" ? "monitor" : theme.mode === "dark" ? "moon" : "sun", meta: themeModeLabel.value, tone: "purple" },
      { key: "language", label: t.value.me.languageRow, href: "/me/language", icon: "globe", meta: localeUpper.value, tone: "brand" },
    ],
  },
  {
    key: "help",
    title: t.value.me.secHelp,
    items: [
      { key: "messages", label: t.value.notifs.drawerTitle, href: "/me/notifications", icon: "messages", badge: formatUnreadBadge(messageUnread.value) || undefined, tone: "purple" },
      // This opens the support hub; availability is not inferred from a local badge.
      { key: "support", label: t.value.me.supportHubRow, href: "/me/support", icon: "chat", meta: t.value.me.supportHubMeta, tone: "success" },
      { key: "faq", label: t.value.me.helpFaq, href: "/me/help", icon: "help", tone: "muted" },
      { key: "trust", label: t.value.me.trustCenter, href: "/trust", icon: "trust", meta: t.value.me.auditsPartners, tone: "success" },
      { key: "learning", label: t.value.me.learningRow, href: "/learn/courses", icon: "book", tone: "brand" },
      { key: "risk", label: t.value.me.riskRow, href: "/me/risk-disclosure", icon: "warning", tone: "orange" },
      { key: "developer", label: t.value.me.developer, href: "/developer", icon: "code", tone: "muted" },
    ],
  },
]);
const frequentKeys = ['inventory', 'orders', 'missions', 'rewards', 'receipts', 'goals', 'learning'] as const;
const frequentItems = computed<QuickItem[]>(() => frequentKeys.map((key) => {
  const item = quickSections.value.flatMap(section => section.items).find(item => item.key === key)!;
  const tones: Record<string, QuickTone> = { inventory:'blue', orders:'purple', missions:'brand', rewards:'orange', receipts:'blue', goals:'purple', genesis:'orange', learning:'purple' };
  return { ...item, label: t.value.me.shortcutLabels[key], icon: key === 'goals' ? 'trend' as const : item.icon, tone: tones[key] };
}));
const networkItems = computed(() => quickSections.value.find(section => section.key === 'network')?.items ?? []);
const settingSections = computed(() => quickSections.value.filter(section => !['network','devices'].includes(section.key)).map(section => ({ ...section, items: section.items.filter(item => !frequentKeys.some(key => key === item.key) && item.key !== 'profile') })));

async function refreshRemoteFunds() {
  await runPassiveTabRead('deposits-bank-history', () => deposits.refreshRemoteVietQrDeposits(), undefined, () => deposits.remoteReceiptInitialStatus === 'ready');
}

async function refreshRemoteOrders(passive: unknown = false) {
  if (!remoteApiEnabled) return;
  const request = ++remoteOrdersRequest;
  const accountKey = app.accountKey;
  const readScope = passiveTabReadScope();
  await runRemoteOrdersRefresh(
    () => passive === true ? runPassiveTabRead('orders', () => orders.refreshRemote().then(() => true)).then(() => undefined) : (invalidatePassiveTabRead('orders'), orders.refreshRemote()),
    (state) => {
      if (request !== remoteOrdersRequest || accountKey !== app.accountKey || readScope !== passiveTabReadScope()) return;
      remoteOrdersLoading.value = state.loading && passive === true && remoteOrdersFailed.value ? false : state.loading;
      remoteOrdersFailed.value = state.loading && passive === true ? remoteOrdersFailed.value : state.failed;
      if (remoteMeActive && !state.loading && !state.failed) remoteOrdersHasRead.value = true;
    },
  );
}

async function refreshRemoteSecurity() {
  if (!remoteApiEnabled || !remoteMeActive || !binarySessionReady({
    remote: remoteApiEnabled, authenticated: auth.isAuthenticated,
    accountId: auth.accountId, appAccountKey: app.accountKey,
    sessionUserId: sessionVault.read()?.user.userId ?? null,
  })) return;
  const request = ++remoteSecurityRequest;
  const accountKey = app.accountKey;
  const binding = app.accountBindingEpoch;
  const scope = captureAccountScope();
  const readScope = passiveTabReadScope();
  const current = () => remoteMeActive && request === remoteSecurityRequest
    && accountKey === app.accountKey && binding === app.accountBindingEpoch && isCurrentAccountScope(scope) && readScope === passiveTabReadScope();
  try {
    const snapshot = await runPassiveTabRead('security-overview', () => accountApi.securityOverview());
    if (!current()) return;
    remoteSecurity.value = snapshot;
  } catch {
    if (current()) remoteSecurity.value = null;
  }
}

async function refreshRemoteTrial() {
  // BUG 173: 原来是 state + eligibility 两次串行 RTT —— 卡片 4.2s 才出现、
  // 7.0s 第二次置 loading 又把它禁掉,用户看到两段抖动。
  // GET /api/trial/state 的权威答复里已经带 canStart/eligibilityReason,
  // 一次读取就能定态;eligibility 读取只留作 state 读失败后的修复路径。
  if (await runPassiveTabRead('trial-state', () => trial.refreshRemote())) return;
  await runPassiveTabRead('trial-eligibility', () => trial.refreshEligibilityRemote());
}

async function refreshRemoteMe() {
  if (!remoteApiEnabled) return;
  await settleRemoteMeLoaders([
    ["profile-avatar", () => runPassiveTabRead("profile-avatar", () => profile.refreshAvatar())],
    ["home", () => app.ensureHomeTruth()],
    ["commission", () => commission.ensureCanonicalEvents()],
    ["withdrawals", () => runPassiveTabRead('withdrawals', () => app.refreshRemoteWithdrawalList())],
    ["fleet", async () => { await revalidateProductCatalog(); await runPassiveTabRead('remote-fleet', () => app.refreshRemoteFleet(undefined, { coalesce: true })); await runPassiveTabRead('earning-release', () => refreshEarningsReleaseStatus()); }],
    ["funds", refreshRemoteFunds],
    ["orders", () => refreshRemoteOrders(true)],
    ["security", refreshRemoteSecurity],
    ["notifications", () => runPassiveTabRead('notifications', () => notifications.refreshRemote(), undefined, () => notifications.hasRemoteSnapshot && !notifications.loading && !notifications.error)],
    ["conversations", () => runPassiveTabRead('conversations', () => conversations.refresh(), { owner: conversations.scopeInvalidated }, () => !conversations.loading && !conversations.error)],
    ["trial", refreshRemoteTrial],
    ["vouchers", () => voucher.revalidateRemote()],
    ["rank", () => vrank.ensureCanonicalVRank()],
    ["genesis", () => runPassiveTabRead('genesis-state', () => genesis.syncRemote())],
    ["bills", () => runPassiveTabRead('bills-summary', () => bills.refreshSummary(), undefined, () => bills.summaryStatus === 'ready')],
    ["market", () => runPassiveTabRead('market', () => market.syncRemote())],
    ["config", () => config.revalidate()],
  ]);
}

watch([() => app.accountKey, () => app.accountBindingEpoch, () => auth.accountId, () => auth.isAuthenticated], () => {
  remoteSecurityRequest += 1;
  remoteSecurity.value = null;
  remoteOrdersHasRead.value = false;
  remoteOrdersRequest += 1;
}, { flush: "sync" });
watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => {
  if (remoteApiEnabled) void refreshRemoteMe();
});
onShow(() => {
  remoteMeActive = true;
  if (remoteApiEnabled) void refreshRemoteMe();
});
onHide(() => {
  remoteMeActive = false;
  remoteSecurityRequest += 1;
  remoteOrdersRequest += 1;
});
// Catalog replacement clears the shared order list even without an account change.
const unsubscribeOrdersRevision = subscribeRuntimeRevision(() => {
  if (!remoteApiEnabled) return;
  invalidatePassiveTabRead("orders");
  invalidatePassiveTabRead("earning-release");
  remoteOrdersRequest += 1;
  if (remoteMeActive && binarySessionReady({
    remote: remoteApiEnabled, authenticated: auth.isAuthenticated,
    accountId: auth.accountId, appAccountKey: app.accountKey,
    sessionUserId: sessionVault.read()?.user.userId ?? null,
  })) {
    void refreshRemoteOrders(true);
    void runPassiveTabRead("earning-release", () => refreshEarningsReleaseStatus()).catch(() => undefined);
  }
});
onUnmounted(() => {
  remoteMeActive = false;
  remoteSecurityRequest += 1;
  remoteOrdersRequest += 1;
  unsubscribeOrdersRevision();
});

function handleQuickItem(item: QuickItem) {
  if (item.key === "theme") {
    themePickerOpen.value = true;
    return;
  }
  navTo(item.href);
}

function toneColor(tone: QuickTone = "muted"): string {
  switch (tone) {
    case "brand":
      return "var(--v5-brand)";
    case "purple":
      return "var(--v5-tech-cyan)";
    case "orange":
      return "var(--v5-brand-2)";
    case "success":
      return "var(--v5-success)";
    case "warning":
      return "var(--v5-warning)";
    case "danger":
      return "var(--v5-danger)";
    default:
      return "var(--v5-ink-2)";
  }
}

// BUG 173 骨架:高度对齐 TrialPromoBanner 的 18px+4px+18px 上下留白 + 两行文本,
// 让 pending → visible 的替换不发生任何纵向位移。
const trialSkeletonStyle: CSSProperties = {
  padding: "18px 0",
  display: "flex",
  alignItems: "center",
  gap: "14px",
};
const trialSkeletonTitleStyle: CSSProperties = {
  width: "58%",
  height: "20px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-ink) 8%, transparent)",
};
const trialSkeletonSubStyle: CSSProperties = {
  marginLeft: "14px",
  width: "34%",
  height: "18px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-ink) 6%, transparent)",
};

const quickGridCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "18px 10px",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};
const quickGridStyle: CSSProperties = {
  display: "grid",
  columnGap: "4px",
  rowGap: "18px",
};
const quickItemStyle: CSSProperties = {
  minHeight: "76px",
  padding: "4px 2px",
  borderRadius: "12px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "7px",
};
function quickIconStyle(tone: QuickTone = "muted"): CSSProperties {
  const color = toneColor(tone);
  return {
    position: "relative",
    width: "44px",
    height: "44px",
    borderRadius: "14px",
    display: "grid",
    placeItems: "center",
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    color,
  };
}
// Plain unread dot — same accent family as the numeric badge, no count.
const quickDotStyle: CSSProperties = {
  position: "absolute",
  top: "-2px",
  right: "-2px",
  width: "9px",
  height: "9px",
  borderRadius: "999px",
  background: "var(--v5-brand-2)",
};
const quickBadgeStyle: CSSProperties = {
  position: "absolute",
  top: "-4px",
  right: "-4px",
  minWidth: "17px",
  height: "17px",
  padding: "0 4px",
  borderRadius: "999px",
  background: "var(--v5-brand-2)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 600,
  lineHeight: "17px",
  textAlign: "center",
};
const quickLabelStyle: CSSProperties = {
  maxWidth: "100%",
  fontFamily: "var(--font-v5)",
  fontSize: "clamp(10px, 3vw, 12px)",
  fontWeight: 500,
  lineHeight: 1.2,
  color: "var(--v5-ink)",
  textAlign: "center",
  whiteSpace: "normal",
  wordBreak: "normal",
};
function quickMetaStyle(tone: QuickTone = "muted"): CSSProperties {
  return {
    maxWidth: "100%",
    marginTop: "-3px",
    fontFamily: "var(--font-v5)",
    fontSize: "12px",
    lineHeight: 1.2,
    color: toneColor(tone),
    textAlign: "center",
    opacity: 0.9,
    whiteSpace: "normal",
    overflowWrap: "break-word",
  };
}

async function handleSignOut() {
  const ok = await uiConfirm({
    title: t.value.me.signOutConfirmTitle,
    message: t.value.me.signOutConfirmMsg,
    danger: true,
    icon: "warn",
    confirmLabel: t.value.me.signOutConfirmLabel,
  });
  if (ok) {
    const logoutAccount = auth.accountId;
    const logoutRevision = sessionVault.revision();
    conversations.discardHumanOutbox();
    // Self sign-out: void in-flight tasks (rollback) + release the shared
    // session record (other tabs see "logged-out") before clearing auth.
    app.interruptAllTasks("logged-out");
    try {
      if (remoteApiEnabled) {
        // Stop new heartbeats, let any healthy POST finish, then pause this phone
        // before the authenticated session is revoked. Offline failure falls
        // back to the server's 120-second heartbeat timeout.
        await app.pauseLocalPhoneRuntimeBeforeSignOut();
        if (auth.accountId !== logoutAccount || (sessionVault.revision() !== logoutRevision
            && !sessionVault.isRefreshContinuation(logoutRevision))) return;
        await authApi.logout();
      }
    } catch {
      // Local shell cleanup still runs. A native deletion marker is retried
      // by platform preparation on the next startup; do not claim success.
      toast.warn(t.value.session.nativeStorageFailure);
    }
    // The vault's logout CAS protects a newer login; its page shell must obey
    // the same result after the awaited remote request.
    if (remoteApiEnabled && (sessionVault.read() || auth.accountId !== logoutAccount)) return;
    session.signOutSession();
    auth.signOut();
    // 登出兜底:清全部账号级数据的内存残留(P2-8 纵深防御;下次登录会重绑真账号)。
    // app(余额/设备/收益,account-cloud 快照)+ 其余 28 个账号级 store 一并归 default。
    app.bindAccount("default");
    rebindAccountScopedStores("default");
    navReset({ url: "/pages/login/login", fail: () => {} });
  }
}

const signOutStyle: CSSProperties = {
  gap: "6px",
  // Footer action: separated from the last settings section by the page's own
  // section rhythm (24px), not crammed against it (was 6px — tighter than the
  // 12px base gap, so the exit action read as part of Help & Support).
  marginTop: "24px",
  height: "44px",
  padding: "0 18px",
  // 《03》§4 零 border。⚠️ 不要换成 --v5-danger-soft 底:danger 文字压在 danger-soft 上
  // 亮主题实测 3.73:1 反而不达 AA(surface 底是 4.71)。零 border 已达成,底色不必动。
  background: "var(--v5-surface)",
  color: "var(--v5-danger)",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "var(--ui-type-list-title)",
  letterSpacing: "-0.005em",
};


</script>

<style scoped>
.me-shortcut-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--v5-space-3) var(--v5-space-1); padding: var(--v5-space-3) 0 var(--v5-space-1); }
.me-shortcut { display: flex; flex-direction: column; align-items: center; gap: var(--v5-space-2); min-width: 0; min-height: 80px; cursor: pointer; }
.me-shortcut__label { font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); text-align: center; overflow-wrap: anywhere; }
.me-row-icon { --me-icon: var(--v5-ink-2); --me-icon-bg: var(--v5-surface-3); position: relative; display: grid; place-items: center; flex: none; width: var(--v5-space-8); height: var(--v5-space-8); border-radius: var(--v5-radius-s); color: var(--me-icon); background: var(--me-icon-bg); }
.me-shortcut__icon { width: var(--v5-space-10); height: var(--v5-space-10); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--me-icon) 14%, transparent); }
.me-tone--brand { --me-icon: var(--v5-brand); --me-icon-bg: var(--v5-brand-soft); }
.me-tone--blue { --me-icon: var(--ui-device-ink); --me-icon-bg: var(--ui-device-soft); }
.me-tone--purple { --me-icon: var(--v5-nex); --me-icon-bg: var(--v5-nex-soft); }
.me-tone--orange, .me-tone--warning { --me-icon: var(--v5-warning-ink); --me-icon-bg: var(--v5-warning-soft); }
.me-tone--success { --me-icon: var(--v5-success-ink); --me-icon-bg: var(--v5-success-soft); }
.me-tone--danger { --me-icon: var(--v5-danger); --me-icon-bg: var(--v5-danger-soft); }
.me-row-dot { position: absolute; right: 0; top: 0; width: var(--v5-space-2); height: var(--v5-space-2); border-radius: var(--v5-radius-full); background: var(--v5-danger); box-shadow: 0 0 0 2px var(--v5-bg); }
.me-network-item__meta { margin-top: -4px; font: 400 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-3); text-align: center; overflow-wrap: anywhere; }
.me-shortcut:focus-visible, .me-network-item:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; border-radius: var(--v5-radius-s); }
.me-shortcut:active, .me-network-item:active { opacity: .72; }
</style>
