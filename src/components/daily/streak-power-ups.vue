<!--
  StreakPowerUps — high-value perks unlocked at streak milestones
  7 / 14 / 30 / 60 (ported from
  Nexion-prototype/app/components/daily/streak-power-ups.tsx).

  Unlock state derives from current streak vs threshold; the "activated"
  decision is durable in the daily-powerup store. Claim routes the user into a
  deeper linked touchpoint (genesis / NEX / unilevel). Source
  tints (#C6FF3A / #7C5CFF / #FFBE3D / #FFFFFF) → v5 tokens for token discipline.
  Achievement-badge side-effect from the source is omitted (no achievements
  store in this sample).
-->
<template>
  <view class="overflow-hidden" :style="cardStyle">
    <view class="px-4 flex items-center justify-between" style="padding-top: 12px; padding-bottom: 8px">
      <text class="inline-flex items-center" :style="headLabelStyle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
        <text>{{ w.label }}</text>
      </text>
      <text :style="streakStatStyle">{{ streakStatText }}</text>
    </view>

    <view class="px-2" style="padding-bottom: 8px">
      <view v-for="(p, i) in powerUps" :key="p.id" :style="liStyle(i === powerUps.length - 1)">
        <view class="flex items-center" style="gap: 12px; padding: 12px 8px; min-height: 56px">
          <view class="grid place-items-center shrink-0" :style="iconBoxStyle(p)">
            <!-- claimed = check / locked = lock / unlocked = per-perk icon -->
            <svg v-if="isClaimed(p.id)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <svg v-else-if="!isUnlocked(p)" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <!-- royalty_boost (Zap) -->
            <svg v-else-if="p.id === 'royalty_boost'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>
            <!-- nex_boost (Crown) -->
            <svg v-else-if="p.id === 'nex_boost'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
            <!-- staking_boost (ShieldCheck) -->
            <svg v-else-if="p.id === 'staking_boost'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <!-- genesis_whitelist (Gem) -->
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <view class="flex items-center" style="gap: 8px">
              <text class="tabular-nums" :style="thresholdChipStyle(p)">{{ thresholdText(p.threshold) }}</text>
              <text :style="labelStyle(p)">{{ p.labelText ?? w[`${p.key}_label`] }}</text>
            </view>
            <text class="block" :style="descStyle">{{ isUnlocked(p) ? (p.descText ?? w[`${p.key}_desc`]) : daysToUnlockText(p.threshold) }}</text>
          </view>
          <!-- activated badge / activate CTA / locked label -->
          <text v-if="isClaimed(p.id)" :style="activatedBadgeStyle">{{ w.activated }}</text>
          <view v-else-if="isUnlocked(p)" class="inline-flex items-center active:opacity-85" :style="activateBtnStyle(p)" @click="handleClaim(p)">
            <text>{{ w.activate }}</text>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 3px"><path d="m9 18 6-6-6-6" /></svg>
          </view>
          <text v-else :style="lockedLabelStyle">{{ w.locked }}</text>
        </view>
      </view>
    </view>

    <!-- Dynamic footer -->
    <view v-if="nextUnclaimedUnlocked" class="mx-2 flex items-center" :style="footerReadyStyle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="nextUnclaimedUnlocked.tint" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
      <text :style="{ fontWeight: 600, color: nextUnclaimedUnlocked.tint }">{{ footerReadyText }}</text>
    </view>
    <view v-else-if="nextLocked" class="mx-2 flex items-center" :style="footerNextStyle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
      <text style="color: var(--v5-ink-2)">{{ footerNextText }}</text>
    </view>
    <view v-else class="mx-2 flex items-center" :style="footerAllStyle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
      <text style="color: var(--v5-success); font-weight: 600">{{ footerAllText }}</text>
    </view>

    <text class="block px-4" :style="footerNoteStyle">{{ w.footer }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNexFaucet } from "@/store/nex-faucet";
import { useDailyPowerUp, type StreakPowerUpId } from "@/store/daily-powerup";
import { toast } from "@/store/ui";
import { remoteApiEnabled } from "@/api/runtime";

interface PowerUp {
  id: StreakPowerUpId;
  threshold: number;
  tint: string;
  key: "royalty_boost" | "nex_boost" | "staking_boost" | "genesis_whitelist";
  href: string;
  labelText?: string;
  descText?: string;
  status?: "LOCKED" | "AVAILABLE" | "ACTIVATED";
}

const t = useT();
// `w` indexes dynamic `${key}_label/_desc` props → type as a string record.
const w = computed(() => t.value.daily.powerUps as unknown as Record<string, string>);
const faucet = useNexFaucet();
const powerUp = useDailyPowerUp();

const POWERUPS: PowerUp[] = [
  { id: "royalty_boost", threshold: 7, tint: "var(--v5-success)", key: "royalty_boost", href: "/pages/team/team" },
  { id: "nex_boost", threshold: 14, tint: "var(--v5-brand)", key: "nex_boost", href: "/pages/me/wallet" },
  { id: "staking_boost", threshold: 30, tint: "var(--v5-warning)", key: "staking_boost", href: "/pages/staking/staking" },
  { id: "genesis_whitelist", threshold: 60, tint: "var(--v5-ink)", key: "genesis_whitelist", href: "/pages/genesis/genesis" },
];

const powerUps = computed<PowerUp[]>(() => remoteApiEnabled
  ? faucet.remotePowerUps.map((item) => ({
      id: item.powerUpCode.toLowerCase() as StreakPowerUpId,
      threshold: item.unlockStreakDays,
      tint: "var(--v5-success)", key: item.powerUpCode.toLowerCase() as PowerUp["key"], href: item.targetPath,
      labelText: item.name, descText: `${item.effectType}: ${item.effectValue}`,
      status: item.status,
    }))
  : POWERUPS);

const streak = computed(() => faucet.signInStreak);

function isUnlocked(p: PowerUp): boolean {
  return remoteApiEnabled
    ? p.status === "AVAILABLE" || p.status === "ACTIVATED"
    : streak.value >= p.threshold;
}

function isClaimed(id: StreakPowerUpId): boolean {
  if (remoteApiEnabled) return powerUps.value.find((p) => p.id === id)?.status === "ACTIVATED";
  return powerUp.hasClaimed(id);
}

const nextUnclaimedUnlocked = computed(() =>
  powerUps.value.find((p) => isUnlocked(p) && !isClaimed(p.id)),
);
const nextLocked = computed(() => powerUps.value.find((p) => !isUnlocked(p)));
const activatedCount = computed(() => powerUps.value.filter((p) => isClaimed(p.id)).length);

const streakStatText = computed(() => fmt(w.value.streakStat, { n: streak.value }));
function thresholdText(n: number): string {
  return fmt(w.value.threshold, { n });
}
function daysToUnlockText(threshold: number): string {
  return fmt(w.value.daysToUnlock, { n: Math.max(0, threshold - streak.value) });
}
const footerReadyText = computed(() =>
  nextUnclaimedUnlocked.value ? fmt(w.value.footerReady, { name: nextUnclaimedUnlocked.value.labelText ?? w.value[`${nextUnclaimedUnlocked.value.key}_label`] }) : "",
);
const footerNextText = computed(() =>
  nextLocked.value
    ? fmt(w.value.footerNext, {
        days: nextLocked.value.threshold - streak.value,
        name: nextLocked.value.labelText ?? w.value[`${nextLocked.value.key}_label`],
      })
    : "",
);
const footerAllText = computed(() => fmt(w.value.footerAll, { n: activatedCount.value }));

async function handleClaim(p: PowerUp) {
  if (remoteApiEnabled) {
    if (await powerUp.claimRemote(p.id)) {
      toast.success(fmt(w.value.toastTitle, { name: p.labelText ?? w.value[`${p.key}_label`] }), p.descText ?? w.value.toastBody);
    } else {
      toast.error(t.value.authOtp.errorServiceUnavailable);
    }
    return;
  }
  const r = powerUp.claim(p.id);
  if (r.ok) {
    toast.success(fmt(w.value.toastTitle, { name: w.value[`${p.key}_label`] }), w.value.toastBody);
  } else if (r.conflict) {
    // 这一档增益在别处已经激活过,store 已把最新领取态刷回来 —— 说清楚,别让用户点了没反应。
    toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
  }
  // Route into the deeper linked touchpoint (no-op if not yet ported).
  uni.navigateTo({ url: p.href, fail: () => {} });
}

// ── styles ──
// Form-b: filled container, no border — game rows (tinted icons, activate CTAs,
// dynamic footer) keep their full visual weight inside.
const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const headLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-success)",
  letterSpacing: "0.06em",
};
const streakStatStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
function liStyle(isLast: boolean): CSSProperties {
  return { borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
function iconBoxStyle(p: PowerUp): CSSProperties {
  const unlocked = streak.value >= p.threshold;
  return {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    background: unlocked ? `color-mix(in srgb, ${p.tint} 10%, transparent)` : "var(--v5-surface-2)",
    color: unlocked ? p.tint : "var(--v5-ink-4)",
  };
}
function thresholdChipStyle(p: PowerUp): CSSProperties {
  const unlocked = streak.value >= p.threshold;
  return {
    padding: "1px 6px",
    borderRadius: "4px",
    background: unlocked ? `color-mix(in srgb, ${p.tint} 10%, transparent)` : "var(--v5-surface-2)",
    color: unlocked ? p.tint : "var(--v5-ink-4)",
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    fontWeight: 500,
  };
}
function labelStyle(p: PowerUp): CSSProperties {
  const claimed = powerUp.hasClaimed(p.id);
  const unlocked = streak.value >= p.threshold;
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "13px",
    color: claimed ? "var(--v5-ink-4)" : unlocked ? "var(--v5-ink)" : "var(--v5-ink-3)",
    textDecoration: claimed ? "line-through" : "none",
    letterSpacing: "-0.008em",
  };
}
const descStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.4 };
const activatedBadgeStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: "6px",
  background: "var(--v5-surface-2)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
function activateBtnStyle(p: PowerUp): CSSProperties {
  return {
    gap: "3px",
    height: "32px",
    padding: "0 12px",
    borderRadius: "999px",
    background: p.tint,
    color: "var(--v5-on-brand)",
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "12px",
    letterSpacing: "-0.005em",
  };
}
const lockedLabelStyle: CSSProperties = {
  padding: "3px 8px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const footerReadyStyle = computed<CSSProperties>(() => ({
  padding: "8px 12px",
  borderRadius: "10px",
  gap: "6px",
  fontSize: "12px",
  background: nextUnclaimedUnlocked.value
    ? `color-mix(in srgb, ${nextUnclaimedUnlocked.value.tint} 8%, transparent)`
    : "transparent",
  marginBottom: "8px",
}));
const footerNextStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "10px",
  gap: "6px",
  background: "var(--v5-surface-2)",
  fontSize: "12px",
  marginBottom: "8px",
};
const footerAllStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "10px",
  gap: "6px",
  background: "var(--v5-success-soft)",
  fontSize: "12px",
  marginBottom: "8px",
};
const footerNoteStyle: CSSProperties = {
  paddingBottom: "12px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.5,
};
</script>
