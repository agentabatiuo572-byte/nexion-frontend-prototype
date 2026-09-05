<!--
  Me — ported from Nexion-prototype/app/(main)/me/page.tsx (13 sections).
  Top→bottom: ProfileRow → WalletCard → WithdrawalLockedWarning (if balance < $20)
  → TrialEntry (hero, if eligible) → OKX-style quick sections (network / devices
  / account / preferences / help) → TrialEntry (active row, if
  trial running) → OrdersCard (if any orders) → Sign out → version footer.

  Account section carries the "My rewards" entry (/me/rewards) with an unread
  dot: unused valid vouchers OR reward credits newer than the seen-watermark
  (rewards-seen store). Risk disclosure lives in Help & Support (moved from
  account, 2026-07-09).

  Wrapped in <AppChassis active="me">; entrance via <CardStagger>.

  Secondary settings-row display values are wired to the live ported stores
  (security 2FA / achievements count / notifications unread / receipts / orders /
  points), matching the source.
  Some settings targets are not-yet-ported pages → nav fail:()=>{}.

  Account section's "orders" row was relocated here from store.vue's old
  bottom Orders chip (single canonical entry point, not scroll-buried);
  account section's "notifications" row was removed (duplicated the chassis
  header bell → message drawer already present on every tab route).

  Settings-row value formatting matches the source: mono-tabular accent text.
-->
<template>
  <AppChassis active="me">
    <CardStagger class="px-4 pt-3 pb-4 space-y-3" style="color: var(--v5-ink)">
      <ProfileRow />

      <WalletCard />

      <WithdrawalLockedWarning v-if="showWithdrawalLocked" :balance="usdtBalance" />

      <!-- Hero slot — zero-cost trial activation right after wallet -->
      <TrialEntry v-if="trialIsHero" />

      <view v-for="section in quickSections" :key="section.key">
        <SectionHeader :title="section.title" :count="section.count" />
        <view :style="quickGridCardStyle">
          <view :style="quickGridStyle">
            <view
              v-for="item in section.items"
              :key="item.key"
              class="active:opacity-80"
              :data-quick-key="item.key"
              :style="quickItemStyle"
              @click="handleQuickItem(item)"
            >
              <view :style="quickIconStyle(item.tone)">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path v-for="path in iconPaths[item.icon]" :key="path" :d="path" />
                </svg>
                <text v-if="item.badge" :style="quickBadgeStyle">{{ item.badge }}</text>
                <view v-else-if="item.dot" :style="quickDotStyle" />
              </view>
              <text :style="quickLabelStyle">{{ item.label }}</text>
              <text v-if="item.meta" class="truncate" :style="quickMetaStyle(item.tone)">{{ item.meta }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Active-state row once trial is running -->
      <TrialEntry v-if="trialIsActive" />

      <OrdersCard v-if="orderCount > 0" />

      <!-- Sign out -->
      <view class="w-full inline-flex items-center justify-center active:opacity-90" :style="signOutStyle" @click="handleSignOut">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
        <text style="margin-left: 6px">{{ t.me.signOut }}</text>
      </view>

      <!-- i18n-en-ok: 版本指纹(品牌 · 语义化版本 · 构建号),报障时要跟日志逐字对得上,本地化会让对不上 -->
      <text class="block text-center font-mono-tabular" style="margin-top: 16px; font-size: 12px; color: var(--v5-ink-4)">NexGrid · v3.2.0 · build 6824</text>
    </CardStagger>
  </AppChassis>

  <ThemePickerSheet :open="themePickerOpen" @close="themePickerOpen = false" />
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SectionHeader from "@/components/me/section-header.vue";
import ProfileRow from "@/components/me/profile-row.vue";
import WalletCard from "@/components/me/wallet-card.vue";
import WithdrawalLockedWarning from "@/components/me/withdrawal-locked-warning.vue";
import TrialEntry from "@/components/me/trial-entry.vue";
import OrdersCard from "@/components/me/orders-card.vue";
import ThemePickerSheet from "@/components/me/theme-picker-sheet.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { isDeviceOnline } from "@/lib/hashpower";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useSession } from "@/store/session";
import { useProfile } from "@/store/profile";
import { useReceipts } from "@/store/receipts";
import { useOrders } from "@/store/orders";
import { useLocaleStore } from "@/store/locale";
import { useNexFaucet } from "@/store/nex-faucet";
import { trialReservesSlotNow, useFreeTrial } from "@/store/free-trial";
import { useSecurity } from "@/store/security";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { useNotifications } from "@/store/notifications";
import { useGenesis } from "@/store/genesis";
import { useConfig } from "@/store/config";
import { useAchievements } from "@/store/achievements";
import { useVoucher } from "@/store/voucher";
import { useRewardsSeen } from "@/store/rewards-seen";
import { MAX_DEVICES } from "@/store/device-types";
import { useVRank } from "@/store/v-rank";
import { useTheme } from "@/store/theme";
import { ACHIEVEMENTS } from "@/mock/achievements";
import { confirm as uiConfirm } from "@/store/ui";
import { authApi, remoteApiEnabled } from "@/api/runtime";

const MIN_WITHDRAWAL_USD = 20;

const t = useT();
const app = useApp();
const auth = useAuth();
const session = useSession();
const profile = useProfile();
const receipts = useReceipts();
const orders = useOrders();
const locale = useLocaleStore();
const faucet = useNexFaucet();
const trial = useFreeTrial();
const security = useSecurity();
const notifications = useNotifications();
const achievements = useAchievements();
const voucher = useVoucher();
const rewardsSeen = useRewardsSeen();
const vrank = useVRank();
const theme = useTheme();
const themePickerOpen = ref(false);

const iconPaths = {
  network: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 7a4 4 0 1 0 0 .01", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  rank: ["m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 16.7l-5.2 3.2 1-5.9-4.3-4.2 5.9-.9z"],
  invite: ["M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7", "M16 6l-4-4-4 4", "M12 2v14"],
  commission: ["M12 2v20", "M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"],
  device: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2", "M12 18h.01"],
  plus: ["M12 5v14", "M5 12h14"],
  slots: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  target: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4"],
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
  ticket: ["M2 9a3 3 0 0 0 0 6v3h20v-3a3 3 0 0 0 0-6V6H2z", "M9 9h6", "M9 15h6"],
  messages: ["M4 4h16v11H7l-3 3z", "M8 8h8", "M8 11h5"],
  card: ["M2 7h20v10H2z", "M2 11h20", "M6 15h4"],
} as const;

type QuickIcon = keyof typeof iconPaths;
type QuickTone = "brand" | "purple" | "orange" | "success" | "warning" | "muted" | "danger";

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

const usdtBalance = computed(() => app.user.usdtBalance);
const showWithdrawalLocked = computed(() => usdtBalance.value < MIN_WITHDRAWAL_USD);
const profileName = computed(() => profile.displayName);
const receiptCount = computed(() => receipts.receipts.length);
const orderCount = computed(() => orders.orders.length);
const streakDays = computed(() => faucet.signInStreak);
const localeUpper = computed(() => locale.code.toUpperCase());
const activeCount = computed(() => app.activeSlotCount);
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsUsed = computed(() => activeCount.value + trialSlot.value);
const emptySlots = computed(() => MAX_DEVICES - slotsUsed.value);
const onlineCount = computed(
  () => app.visibleDevices.filter((device) => device.activatedAt !== null && isDeviceOnline(device, Date.now())).length + trialSlot.value,
);
const deviceSectionCount = computed(() => fmt(t.value.myDevices.sectionCount, { n: slotsUsed.value, total: MAX_DEVICES }));
const onlineLabel = computed(() => fmt(t.value.myDevices.onlineLabel, { n: onlineCount.value }));
const emptySlotsLabel = computed(() => fmt(t.value.myDevices.emptySlots, { n: emptySlots.value }));
const deviceOrdersMeta = computed(() => fmt(t.value.me.deviceOrdersMeta, { n: orderCount.value }));
const rankValue = computed(() => `V${vrank.myRank}`);
const themeModeLabel = computed(() =>
  theme.mode === "system"
    ? t.value.me.themeMetaSystem
    : theme.mode === "dark"
      ? t.value.me.themeMetaDark
      : t.value.me.themeMetaLight,
);

// Trial routing — hero slot (eligible to start) vs active row (running).
const trialStatus = computed(() => trial.status);
const trialIsActive = computed(
  () => trialStatus.value === "active" || trialStatus.value === "grace",
);
const trialIsHero = computed(() => !trialIsActive.value && trial.canStart());

// Genesis row surfaces once the user actually owns a Genesis node →
// links to the holder (holdings/dividends) page.
const genesis = useGenesis();
const config = useConfig();
const ownsGenesis = computed(() => genesis.myOwned > 0);
const myGenesisValue = computed(() => fmt(t.value.me.myGenesisNodeValue, { n: String(genesis.myOwned) }));

// ── Secondary display values, wired to the live ported stores (matches source) ──
const twoFactorEnabled = computed(() => security.twoFactorEnabled);
const unreadNotifs = computed(() => notifications.unread);
const achievementsUnlocked = computed(
  () => achievements.records.filter((r) => r.unlockedAt > 0).length,
);
const achievementsTotal = ACHIEVEMENTS.length;
const achievementsValue = computed(() =>
  fmt(t.value.me.achievementsRowValue, { n: achievementsUnlocked.value, total: achievementsTotal }),
);
// Mock urgency — source hardcodes 9 live events (server-driven in the full app).
const eventsLiveLabel = computed(() => fmt(t.value.me.nLive, { n: "9" }));

// My Rewards unread dot — unused valid vouchers keep it lit (state-based)
// OR reward credits newer than the seen-watermark (cleared on page open).
const rewardsDot = computed(() => voucher.claimedUnused.length > 0 || rewardsSeen.hasUnseen);
const quickSections = computed<QuickSection[]>(() => [
  {
    key: "network",
    title: t.value.me.myNetwork,
    items: [
      { key: "team", label: t.value.me.team, href: "/team", icon: "network", meta: t.value.me.networkOverviewMeta, tone: "brand" },
      { key: "invite", label: t.value.me.networkInviteLabel, href: "/team", icon: "invite", meta: fmt(t.value.me.networkInviteMeta, { nex: config.config.rewards.inviterReward.nexAmount }), tone: "orange" },
      { key: "commissions", label: t.value.me.networkCommissionsLabel, href: "/team/commissions", icon: "commission", meta: t.value.me.networkCommissionsMeta, tone: "success" },
      { key: "rank", label: t.value.me.currentRank, href: "/team/rank", icon: "rank", meta: rankValue.value, tone: "purple" },
    ],
  },
  {
    key: "devices",
    title: t.value.myDevices.sectionTitle,
    count: deviceSectionCount.value,
    items: [
      { key: "inventory", label: t.value.myDevices.inventoryTitle, href: "/me/devices", icon: "device", meta: onlineLabel.value, tone: "success" },
      { key: "add", label: t.value.me.deviceAddLabel, href: "/store", icon: "plus", meta: t.value.me.deviceAddMeta, tone: "brand" },
      { key: "slots", label: t.value.myDevices.inventorySlotsLabel, href: "/me/devices", icon: "slots", meta: emptySlotsLabel.value, tone: "purple" },
      { key: "goals", label: t.value.me.goalsRow, href: "/me/goals", icon: "target", meta: t.value.me.setTarget, tone: "orange" },
    ],
  },
  {
    key: "account",
    title: t.value.me.secAccount,
    items: [
      { key: "rewards", label: t.value.rewards.entry, href: "/me/rewards", icon: "gift", dot: rewardsDot.value, tone: "brand" },
      { key: "receipts", label: t.value.me.receiptsRow, href: "/me/receipts", icon: "receipt", meta: String(receiptCount.value), tone: "brand" },
      { key: "orders", label: t.value.store.ordersChip, href: "/store/orders", icon: "package", meta: orderCount.value > 0 ? deviceOrdersMeta.value : undefined, tone: "purple" },
      { key: "genesis", label: t.value.me.genesisNode, href: "/genesis/holder", icon: "crown", meta: ownsGenesis.value ? myGenesisValue.value : undefined, tone: "orange" },
      { key: "cards", label: t.value.me.walletCardsRow, href: "/me/wallet-cards", icon: "card", meta: t.value.me.walletCardsMeta, tone: "muted" },
      { key: "profile", label: t.value.me.profile, href: "/me/profile", icon: "user", meta: profileName.value, tone: "muted" },
      { key: "security", label: t.value.me.security, href: "/me/security", icon: "lock", meta: twoFactorEnabled.value ? t.value.me.secWithPasskey : t.value.me.secNoTwoFa, tone: twoFactorEnabled.value ? "muted" : "orange" },
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
      { key: "messages", label: t.value.me.supportMessagesRow, href: "/support/messages", icon: "messages", badge: unreadNotifs.value > 0 ? String(unreadNotifs.value) : undefined, tone: "purple" },
      { key: "support", label: t.value.me.liveSupportRow, href: "/me/support", icon: "chat", meta: t.value.me.onlineChip, tone: "success" },
      { key: "faq", label: t.value.me.helpFaq, href: "/me/help", icon: "help", tone: "muted" },
      { key: "tickets", label: t.value.me.supportTicketsRow, href: "/me/support-tickets", icon: "ticket", tone: "orange" },
      { key: "trust", label: t.value.me.trustCenter, href: "/trust", icon: "trust", meta: t.value.me.auditsPartners, tone: "success" },
      { key: "learning", label: t.value.me.learningRow, href: "/learn/courses", icon: "book", tone: "brand" },
      { key: "risk", label: t.value.me.riskRow, href: "/me/risk-disclosure", icon: "warning", tone: "orange" },
      { key: "developer", label: t.value.me.developer, href: "/developer", icon: "code", tone: "muted" },
    ],
  },
]);

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

const quickGridCardStyle: CSSProperties = {
  padding: "18px 10px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const quickGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
  maxWidth: "78px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: 1.2,
  color: "var(--v5-ink)",
  textAlign: "center",
  whiteSpace: "normal",
  wordBreak: "break-word",
};
function quickMetaStyle(tone: QuickTone = "muted"): CSSProperties {
  return {
    maxWidth: "76px",
    marginTop: "-3px",
    fontFamily: "var(--font-v5)",
    fontSize: "12px",
    lineHeight: 1.2,
    color: toneColor(tone),
    textAlign: "center",
    opacity: 0.9,
    whiteSpace: "nowrap",
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
    // The server owns refresh-token revocation. authApi.logout always clears
    // this device locally in its finally block, including an offline failure.
    if (remoteApiEnabled) await authApi.logout();
    // Self sign-out: void in-flight tasks (rollback) + release the shared
    // session record (other tabs see "logged-out") before clearing auth.
    app.interruptAllTasks("logged-out");
    session.signOutSession();
    auth.signOut();
    // 登出兜底:清全部账号级数据的内存残留(P2-8 纵深防御;下次登录会重绑真账号)。
    // app(余额/设备/收益,account-cloud 快照)+ 其余 28 个账号级 store 一并归 default。
    app.bindAccount("default");
    rebindAccountScopedStores("default");
    uni.reLaunch({ url: "/pages/login/login", fail: () => {} });
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
  fontSize: "15px",
  letterSpacing: "-0.005em",
};
</script>
