<!--
  Security — ported from Nexion-prototype/app/(main)/me/security/page.tsx.
  Password change (collapsible inline form) · 2FA toggle ·
  active sessions (revoke / revoke-all) · danger zone (delete account).

  Wrapped in <AppChassis active="me">; SubPageHeader (back chevron) scrolls
  with content. The source iOS grouped-list primitives (IOSList/IOSToggle, which
  hardcode #1C1C1E + text-white) are rebuilt here with the me-domain token
  surfaces — same structure, token-disciplined. Delete-account omits the
  /api/gate/logout reviewer-cookie fetch (no Next middleware in uni); it signs
  out + reLaunches to login, matching /me sign-out.
-->
<template>
  <AppChassis active="me">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" :title="t.security.title" />
      <view class="mx-4" :style="mockModeBannerStyle" data-testid="mock-security-label">
        <text :style="mockModeBannerTextStyle">{{ modeLabel }}</text>
      </view>

      <view
        v-if="retiredFlow"
        data-qa="retired-flow-notice"
        aria-live="polite"
        class="mx-4"
        style="margin-bottom: 14px; padding: 12px 14px; border: 1px solid var(--v5-warning); border-radius: 12px; background: var(--v5-warning-soft); color: var(--v5-ink-2)"
      >
        <text class="block" style="font-size: 13px; line-height: 1.5">{{ t.topupChrome.flowRetired }}</text>
      </view>

      <!-- ───── Password + Two-factor (merged, de-carded group) ───── -->
      <view class="mx-4" :style="cardStyle">
        <view class="flex items-center active:opacity-90" :style="rowStyle" @click="editingPwd = !editingPwd">
          <view class="grid place-items-center shrink-0" :style="iconBox('var(--v5-danger-soft)')">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block" :style="rowLabelStyle">{{ t.security.passwordTitle }}</text>
            <text class="block truncate" :style="rowSubStyle">{{ passwordHintLine }}</text>
          </view>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="chevronStyle"><path d="m6 9 6 6 6-6" /></svg>
        </view>
        <view v-if="editingPwd" :style="pwdFormStyle">
          <input class="w-full" :style="pwdInputStyle" password :value="current" :placeholder="t.security.currentPassword" :maxlength="PASSWORD_MAX_LENGTH" @input="onCurrent" />
          <input class="w-full" :style="pwdInputStyle" password :value="next" :placeholder="t.security.newPassword" :maxlength="PASSWORD_MAX_LENGTH" @input="onNext" />
          <input class="w-full" :style="pwdInputStyle" password :value="confirmPwd" :placeholder="t.security.confirmPassword" :maxlength="PASSWORD_MAX_LENGTH" @input="onConfirmPwd" />
          <text v-if="err" class="block" :style="errStyle">{{ err }}</text>
          <view class="flex" style="gap: 8px; margin-top: 4px">
            <view class="flex-1 flex items-center justify-center active:opacity-70" :style="pwdCancelStyle" @click="cancelPwd">
              <text :style="pwdCancelLabelStyle">{{ t.ui.cancel }}</text>
            </view>
            <view class="flex-1 flex items-center justify-center active:opacity-80" :style="pwdSaveStyle" @click="submitPasswordChange">
              <text :style="pwdSaveLabelStyle">{{ t.ui.save }}</text>
            </view>
          </view>
        </view>
        <view class="flex items-center" :style="rowBorderedStyle">
          <view class="grid place-items-center shrink-0" :style="iconBox(twoFactorEnabled ? 'var(--v5-success-soft)' : 'var(--v5-surface-3)')">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" :stroke="twoFactorEnabled ? 'var(--v5-success)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block" :style="rowLabelStyle">{{ t.security.twoFactorTitle }}</text>
          </view>
          <view class="shrink-0 active:opacity-70 transition-opacity" :style="toggleTrackStyle" @click="toggleTwoFactor(!twoFactorEnabled)">
            <view :style="toggleThumbStyle" />
          </view>
        </view>
        <view :style="pwdFormStyle">
          <input class="w-full" :style="pwdInputStyle" password :value="twoFactorPassword" :placeholder="t.security.currentPassword" :maxlength="PASSWORD_MAX_LENGTH" @input="onTwoFactorPassword" />
        </view>
      </view>
      <text class="block mx-4" :style="footerStyle">{{ t.security.twoFactorHint }}</text>


      <!-- ───── Active sessions ───── -->
      <text class="block mx-4" :style="sectionHeadStyle">{{ t.security.sessionsTitle }}</text>
      <view class="mx-4" :style="[cardStyle, groupGap]">
        <view v-for="(s, i) in sessions" :key="s.id" class="flex items-center" :style="i === 0 ? rowStyle : rowBorderedStyle">
          <view class="grid place-items-center shrink-0" :style="iconBox(s.current ? 'var(--v5-success-soft)' : 'var(--v5-surface-3)')">
            <!-- Smartphone -->
            <svg v-if="deviceIconKind(s.deviceName) === 'phone'" width="17" height="17" viewBox="0 0 24 24" fill="none" :stroke="s.current ? 'var(--v5-success)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
            <!-- Tablet -->
            <svg v-else-if="deviceIconKind(s.deviceName) === 'tablet'" width="17" height="17" viewBox="0 0 24 24" fill="none" :stroke="s.current ? 'var(--v5-success)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2" /><line x1="12" x2="12.01" y1="18" y2="18" /></svg>
            <!-- Monitor -->
            <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" :stroke="s.current ? 'var(--v5-success)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block truncate" :style="rowLabelStyle">{{ sessionDeviceLabel(s) }}</text>
            <text class="block truncate" :style="rowSubStyle">{{ sessionSecondaryLabel(s) }}</text>
          </view>
          <text v-if="s.current" :style="currentBadgeStyle">{{ t.security.sessionCurrent }}</text>
          <view v-else class="grid place-items-center active:opacity-70" :style="revokeBtnStyle" @click="handleRevoke(s)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>
        <view v-if="hasOtherSessions" class="flex items-center justify-center active:opacity-70" :style="revokeAllRowStyle" @click="handleRevokeAll">
          <text :style="revokeAllLabelStyle">{{ t.security.revokeAll }}</text>
        </view>
      </view>
      <text class="block mx-4" :style="footerStyle">{{ t.security.sessionsHint }}</text>

      <!-- ───── Danger zone ───── -->
      <view class="mx-4" :style="[cardStyle, groupGap]">
        <view class="flex items-center" :class="deletionPending ? '' : 'active:opacity-90'" :style="rowStyle" @click="handleDeleteAccount">
          <view class="grid place-items-center shrink-0" :style="iconBox('var(--v5-danger-soft)')">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block" :style="dangerLabelStyle">{{ t.security.deleteAccount }}</text>
          </view>
        </view>
        <view v-if="remoteApiEnabled && !deletionPending" :style="pwdFormStyle">
          <input class="w-full" :style="pwdInputStyle" password :value="deletionPassword" :placeholder="t.security.currentPassword" :maxlength="PASSWORD_MAX_LENGTH" @input="onDeletionPassword" />
        </view>
        <view v-if="remoteApiEnabled && deletionCanCancel" class="flex items-center justify-center active:opacity-70"
          :style="revokeAllRowStyle" role="button" tabindex="0" :aria-label="t.security.cancelDeletionRequest"
          @click="handleCancelAccountDeletion">
          <text :style="revokeAllLabelStyle">{{ t.security.cancelDeletionRequest }}</text>
        </view>
      </view>
      <text class="block mx-4" :style="footerStyle">{{ deletionStatus.status === 'BLOCKED' ? t.publicCopy.accountDeletionBlocked : deletionPending ? t.security.deleteAccountPending : t.security.deleteAccountHint }}</text>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useSecurity } from "@/store/security";
import { captureAccountScope, isCurrentAccountScope, rebindAccountScopedStores } from "@/lib/account-scope";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
// ↓ 注销的提交前明示要用锁仓本金(PRD §4.5a.1:提交前逐条明示,金额取提交时刻真实数值)
import { useStaking } from "@/store/staking";
import { navTo } from "@/lib/route";
import { useSession, type SessionListItem } from "@/store/session";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { isPasswordOk, PASSWORD_MAX_LENGTH } from "@/auth/password-rules";
import { accountApi, authApi, remoteApiEnabled } from "@/api/runtime";
import { deleteMockAuthAccount } from "@/api/mock-auth-api";
import type { SecurityState } from "@/api/contracts";
import type { AccountDeletionStatus } from "@/api/account-api";


const t = useT();
const retiredFlow = ref(false);

// 已下线验证流深链兜底：toast 提供即时反馈，页内 notice 保持可发现，
// 避免冷启较快时 toast 在验收/用户看清之前到时消失。
onLoad((options) => {
  if ((options as Record<string, string> | undefined)?.from === "retired-flow") {
    retiredFlow.value = true;
    toast.info(t.value.topupChrome.flowRetired);
  }
  if (remoteApiEnabled) void loadRemoteSecurity();
});
const security = useSecurity();
const auth = useAuth();
const app = useApp();
const staking = useStaking();
const session = useSession();

const remoteSecurity = ref<SecurityState | null>(null);
const deletionStatus = ref<AccountDeletionStatus>({ status: "NONE" });
const deletionPending = computed(() => deletionStatus.value.status !== "NONE"
  && (deletionStatus.value.status === "REQUESTED" || deletionStatus.value.status === "IN_REVIEW" || deletionStatus.value.status === "BLOCKED"));
const deletionCanCancel = computed(() => deletionStatus.value.status === "REQUESTED"
  || deletionStatus.value.status === "IN_REVIEW" || deletionStatus.value.status === "BLOCKED");
const securityBusy = ref(false);
const twoFactorPassword = ref("");
const deletionPassword = ref("");
const deletionCommandKey = ref("");
const twoFactorEnabled = computed(() => remoteApiEnabled
  ? remoteSecurity.value?.twoFactorEnabled === true
  : security.twoFactorEnabled);
const modeLabel = computed(() => t.value.security.mockModeLabel);
const sessions = computed<SessionListItem[]>(() => remoteApiEnabled
  ? (remoteSecurity.value?.sessions ?? []).map((item) => ({
      id: item.id,
      deviceName: item.deviceName,
      device: item.deviceName,
      location: item.ipMasked,
      ip: item.ipMasked,
      lastActiveMs: Date.parse(item.lastActiveAt),
      current: item.current,
      entrySurface: "h5",
    }))
  : session.activeSessions);
const hasOtherSessions = computed(() => sessions.value.some((s) => !s.current));

const editingPwd = ref(false);
const current = ref("");
const next = ref("");
const confirmPwd = ref("");
const err = ref("");

const passwordHintLine = computed(() =>
  t.value.security.passwordHint.replace("{when}", relativeWhen(
    remoteApiEnabled
      ? Date.parse(remoteSecurity.value?.passwordChangedAt ?? "")
      : security.passwordChangedAt,
  )),
);

async function loadRemoteSecurity(): Promise<boolean> {
  const scope = captureAccountScope();
  const accountKey = auth.accountId;
  try {
    const [securityState, accountDeletion] = await Promise.all([
      accountApi.securityOverview(),
      accountApi.accountDeletionStatus(),
    ]);
    if (!isCurrentAccountScope(scope) || auth.accountId !== accountKey) return false;
    remoteSecurity.value = securityState;
    deletionStatus.value = accountDeletion;
    return true;
  } catch (cause) {
    if (!isCurrentAccountScope(scope) || auth.accountId !== accountKey) return false;
    console.warn("[security] overview load failed:", cause);
    err.value = t.value.security.opFailed;
    return false;
  }
}

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onCurrent(e: Event) {
  current.value = detailVal(e);
}
function onNext(e: Event) {
  next.value = detailVal(e);
}
function onConfirmPwd(e: Event) {
  confirmPwd.value = detailVal(e);
}
function onTwoFactorPassword(e: Event) {
  twoFactorPassword.value = detailVal(e);
}
function onDeletionPassword(e: Event) {
  deletionPassword.value = detailVal(e);
}

function deviceIconKind(label: string): "phone" | "tablet" | "monitor" {
  if (/iPhone|Android|Phone/i.test(label)) return "phone";
  if (/iPad|Tablet/i.test(label)) return "tablet";
  return "monitor";
}

function surfaceLabel(s: SessionListItem): string {
  if (s.entrySurface === "signed-app") return t.value.security.sessionSurfaceSigned;
  if (s.entrySurface === "white-app") return t.value.security.sessionSurfaceWhite;
  return t.value.security.sessionSurfaceH5;
}

function sessionDeviceLabel(s: SessionListItem): string {
  return remoteApiEnabled ? s.deviceName : `${s.deviceName} · ${surfaceLabel(s)}`;
}

function sessionSecondaryLabel(s: SessionListItem): string {
  const location = remoteApiEnabled ? s.ip : t.value.security.sessionLocation;
  return `${location} · ${lastActiveLabel(s.lastActiveMs)}`;
}

function lastActiveLabel(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 5 * 60 * 1000) return t.value.security.timeJustNow;
  if (diff < 3600 * 1000) return fmt(t.value.security.timeMinutesAgo, { n: Math.floor(diff / 60000) });
  if (diff < 24 * 3600 * 1000) return fmt(t.value.security.timeHoursAgo, { n: Math.floor(diff / 3600000) });
  return fmt(t.value.security.timeDaysAgo, { n: Math.floor(diff / (24 * 3600 * 1000)) });
}

function relativeWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const days = Math.floor((Date.now() - ms) / (24 * 3600 * 1000));
  if (days < 1) return t.value.security.timeToday;
  if (days < 30) return fmt(t.value.security.timeDaysAgo, { n: days });
  if (days < 365) return fmt(t.value.security.timeMonthsAgo, { n: Math.floor(days / 30) });
  return fmt(t.value.security.timeYearsAgo, { n: Math.floor(days / 365) });
}

function cancelPwd() {
  editingPwd.value = false;
  err.value = "";
  current.value = "";
  next.value = "";
  confirmPwd.value = "";
}

async function submitPasswordChange() {
  if (securityBusy.value) return;
  err.value = "";
  if (!current.value) {
    err.value = t.value.login.errorInvalidPassword;
    return;
  }
  if (!isPasswordOk(next.value)) {
    err.value = t.value.security.passwordShort;
    return;
  }
  if (next.value !== confirmPwd.value) {
    err.value = t.value.security.passwordMismatch;
    return;
  }
  securityBusy.value = true;
  try {
      if (remoteApiEnabled) {
        await accountApi.changePassword(current.value, next.value);
        if (!(await loadRemoteSecurity())) throw new Error("SECURITY_READBACK_FAILED");
    } else {
      security.changePassword(current.value, next.value);
    }
  } catch (cause) {
    console.warn("[security] password update failed:", cause);
    err.value = cause instanceof Error && cause.message === "USER_INVALID_CREDENTIALS"
      ? t.value.login.errorInvalidCredentials
      : t.value.security.opFailed;
    securityBusy.value = false;
    return;
  }
  securityBusy.value = false;
  current.value = "";
  next.value = "";
  confirmPwd.value = "";
  editingPwd.value = false;
  toast.success(t.value.security.passwordSaved);
}

async function toggleTwoFactor(value: boolean) {
  if (securityBusy.value) return;
  if (!twoFactorPassword.value) {
    err.value = t.value.login.errorInvalidPassword;
    return;
  }
  if (!value && twoFactorEnabled.value) {
    const ok = await uiConfirm({
      title: t.value.security.twoFactorDisable,
      message: t.value.security.twoFactorConfirmDisable,
      danger: true,
      confirmLabel: t.value.security.twoFactorDisable,
    });
    if (ok) {
      securityBusy.value = true;
      try {
        if (remoteApiEnabled) {
          await accountApi.updateTwoFactor(false, twoFactorPassword.value);
          if (!(await loadRemoteSecurity())) throw new Error("SECURITY_READBACK_FAILED");
          twoFactorPassword.value = "";
        } else security.setTwoFactor(false, twoFactorPassword.value);
        twoFactorPassword.value = "";
        toast.warn(t.value.security.twoFactorDisabledToast);
      } catch (cause) {
        console.warn("[security] 2FA update failed:", cause);
        err.value = cause instanceof Error && cause.message === "USER_INVALID_CREDENTIALS"
          ? t.value.login.errorInvalidCredentials
          : t.value.security.opFailed;
      } finally {
        securityBusy.value = false;
      }
    }
  } else if (value && !twoFactorEnabled.value) {
    securityBusy.value = true;
    try {
      if (remoteApiEnabled) {
        await accountApi.updateTwoFactor(true, twoFactorPassword.value);
        if (!(await loadRemoteSecurity())) throw new Error("SECURITY_READBACK_FAILED");
        twoFactorPassword.value = "";
      } else security.setTwoFactor(true, twoFactorPassword.value);
      twoFactorPassword.value = "";
      toast.success(t.value.security.twoFactorEnabledToast);
    } catch (cause) {
      console.warn("[security] 2FA update failed:", cause);
      err.value = cause instanceof Error && cause.message === "USER_INVALID_CREDENTIALS"
        ? t.value.login.errorInvalidCredentials
        : t.value.security.opFailed;
    } finally {
      securityBusy.value = false;
    }
  }
}

async function handleRevoke(s: SessionListItem) {
  const ok = await uiConfirm({
    title: t.value.security.sessionRevoke,
    message: `${t.value.security.sessionRevokeConfirm}\n\n${sessionDeviceLabel(s)} · ${t.value.security.sessionLocation}`,
    danger: true,
  });
  if (ok) {
    try {
      if (remoteApiEnabled) {
        await accountApi.revokeSession(s.id);
        if (!(await loadRemoteSecurity())) throw new Error("SECURITY_READBACK_FAILED");
      } else session.revokeSession(s.id);
      toast.success(t.value.security.sessionRevoked);
    } catch {
      toast.error(t.value.security.opFailed);
    }
  }
}

async function handleRevokeAll() {
  if (!hasOtherSessions.value) return;
  const ok = await uiConfirm({
    title: t.value.security.revokeAll,
    message: t.value.security.revokeAllConfirm,
    danger: true,
  });
  if (ok) {
    try {
      if (remoteApiEnabled) {
        await accountApi.revokeOtherSessions();
        if (!(await loadRemoteSecurity())) throw new Error("SECURITY_READBACK_FAILED");
      } else session.revokeAllOtherSessions();
      toast.success(t.value.security.revokeAllDone);
    } catch {
      toast.error(t.value.security.opFailed);
    }
  }
}

async function handleDeleteAccount() {
  // 🔴 重入闸(审计 P2):本函数在「刷新权威面」处有一次真网络往返 —— 没有这道闸,
  //   双击会各推一个确认弹窗进队列(confirm 是队列不是单例),确认完第一个立刻露出
  //   第二个一模一样的,极易连着点两次。同文件另外两个操作(改密 / 2FA)都有同款闸。
  if (securityBusy.value) return;
  if (deletionPending.value) {
    toast.info(t.value.security.deleteAccountPending);
    return;
  }
  if (remoteApiEnabled && !deletionPassword.value) {
    toast.error(t.value.login.errorInvalidPassword);
    return;
  }
  // 🔴 重入闸的另一半:入口挡掉的是「busy 期间再点」,这里保证 busy 覆盖**整个**流程
  //   (含刷新等待与确认弹窗停留),所有出口统一由 finally 放闸 —— 不靠每条 return 记得复位。
  securityBusy.value = true;
  try {
    // ── PRD §4.5a.1:提交前逐条明示 + 在途提现拦截 ──────────────────────────────
    // 🔴 独立审计(BLOCK,2×P0)后的修法,教训记在这儿:
    //   第一版「刷一遍然后直接读」在远端刷新**失败**时会拿到清零态 —— refreshRemoteFleet
    //   的 catch 把 usdtBalance 置 0、staking.syncRemote 的 catch 把 positions 清空,
    //   于是弹窗会写「Balance $0.00 — 不退」而真实余额分文未动,锁仓那行则整行消失。
    //   披露页显示一个具体、格式规整、**错误**的数字,比不显示更糟。
    //   修:两个驱动金额的刷新按返回值判成败,**核不动就阻断提交**(fail-closed:
    //   宁可让用户稍后重试,不让他对着错误披露确认永久放弃)。提现列表刷新失败不阻断 ——
    //   它失败时保留旧值(回源核过),且服务端状态机另有「已阻断」兜底。
    if (remoteApiEnabled) {
      const [fleet, , stake] = await Promise.allSettled([
        app.refreshRemoteFleet(), app.refreshRemoteWithdrawals(), staking.syncRemote(),
      ]);
      const fleetOk = fleet.status === "fulfilled" && fleet.value === true;
      const stakeOk = stake.status === "fulfilled" && stake.value === true;
      if (!fleetOk || !stakeOk) {
        toast.error(t.value.security.deleteAccountVerifyFailed);
        return;
      }
    }
    // 🔴 存在任一在途提现单 ⇒ 禁止提交(不是「提交了再被服务端打回」——规格要的是入口拦截)。
    //   判据复用 app 的 inFlightWithdrawals(按占槽状态过滤),不在页面自造第二套「在途」定义。
    //   PRD §4.5a.1 明文要求「并给出去提现记录的入口」—— 所以是带跳转的确认框,不是一条会
    //   自动消失的 toast(审计 P1:只提示不给路径,用户被拦下后只能自己翻)。
    if (app.inFlightWithdrawals.length > 0) {
      const view = await uiConfirm({
        title: t.value.security.deleteAccount,
        message: t.value.security.deleteAccountBlockedByWithdrawal,
        confirmLabel: t.value.security.deleteAccountViewWithdrawals,
      });
      if (view) navTo("/pages/me/wallet-withdraw-tracking");
      return;
    }
    // 🔴 「不退」必须是提交前的显式告知,不是事后条款:逐条列出具体金额,用户看着数字确认。
    //   锁仓口径 = 本金还没回到余额的每一笔(pending-lock / active / matured 未领取)——
    //   store 的 totalLocked() 只数 active,那是收益展示口径;放弃披露少报即漏报,这里不用它。
    const forfeitPrincipal = staking.positions
      .filter((p) => p.status === "pending-lock" || p.status === "active" || p.status === "matured")
      .reduce((s, p) => s + p.amountUSDT, 0);
    const forfeitLines = [
      t.value.security.deleteAccountForfeitLead,
      fmt(t.value.security.deleteAccountForfeitBalance, { balance: `$${app.user.usdtBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }),
      ...(forfeitPrincipal > 0
        ? [fmt(t.value.security.deleteAccountForfeitPrincipal, { principal: `$${forfeitPrincipal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` })]
        : []),
    ];
    const ok = await uiConfirm({
      title: t.value.security.deleteAccount,
      message: `${forfeitLines.join("\n")}\n\n${t.value.security.deleteAccountConfirm}`,
      danger: true,
      confirmLabel: t.value.security.deleteAccount,
    });
    if (ok) {
      if (remoteApiEnabled) {
        if (!deletionCommandKey.value) {
          deletionCommandKey.value = `app-security:account-deletion:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
        }
        try {
          const request = await accountApi.requestAccountDeletion(deletionPassword.value, deletionCommandKey.value);
          toast.success(t.value.security.deleteAccountToast, request.requestNo);
          deletionCommandKey.value = "";
          await authApi.logout();
        } catch {
          toast.error(t.value.publicCopy.operationUnconfirmed);
          return;
        }
      } else {
        if (!deleteMockAuthAccount(auth.accountId)) {
          toast.error(t.value.security.opFailed);
          return;
        }
        toast.success(t.value.security.deleteAccountToast);
      }
      app.interruptAllTasks("logged-out");
      session.signOutSession();
      auth.signOut();
      // 删除账号即登出兜底:清全部账号级数据内存残留(P2-8 纵深防御)。app + 28 store 归 default。
      app.bindAccount("default");
      rebindAccountScopedStores("default");
      uni.reLaunch({ url: "/pages/login/login", fail: () => {} });
    }
  } finally {
    securityBusy.value = false;
  }
}

async function handleCancelAccountDeletion() {
  if (!remoteApiEnabled || !deletionCanCancel.value || securityBusy.value) return;
  const ok = await uiConfirm({
    title: t.value.security.cancelDeletionRequest,
    message: t.value.security.cancelDeletionMessage,
    danger: true,
    confirmLabel: t.value.security.cancelDeletionRequest,
  });
  if (!ok) return;
  securityBusy.value = true;
  try {
    const current = deletionStatus.value;
    if (current.status === "NONE") return;
    const key = `app-security:account-deletion-cancel:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    await accountApi.cancelAccountDeletion(current.version, key);
    if (!(await loadRemoteSecurity())) throw new Error("SECURITY_READBACK_FAILED");
    toast.success(t.value.security.cancelDeletionSuccess);
  } catch {
    toast.error(t.value.publicCopy.operationUnconfirmed);
    await loadRemoteSecurity();
  } finally {
    securityBusy.value = false;
  }
}

// ── styles ──
function iconBox(bg: string): CSSProperties {
  return {
    width: "28px",
    height: "28px",
    borderRadius: "7px",
    background: bg,
  };
}

// De-carded settings group (form b): filled surface, no border. The first group
// sits at the global 24px header gap (no top margin); groupGap spaces the rest.
const cardStyle: CSSProperties = {
  padding: "0 16px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const groupGap: CSSProperties = { marginTop: "12px" };
const rowStyle: CSSProperties = {
  gap: "12px",
  minHeight: "52px",
  padding: "8px 0",
};
const rowBorderedStyle: CSSProperties = {
  gap: "12px",
  minHeight: "52px",
  padding: "8px 0",
  borderTop: "1px solid var(--v5-border)",
};
const rowLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  color: "var(--v5-ink)",
};
const rowSubStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
const chevronStyle: CSSProperties = { flexShrink: 0 };
const footerStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.625,
};
const mockModeBannerStyle: CSSProperties = {
  marginTop: "10px",
  padding: "8px 10px",
  borderRadius: "8px",
  background: "var(--v5-warning-soft)",
};
const mockModeBannerTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-warning)",
};
// Section label (de-card spec): 15/600/ink.
const sectionHeadStyle: CSSProperties = {
  marginTop: "22px",
  marginBottom: "0",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
const pwdFormStyle: CSSProperties = {
  borderTop: "1px solid var(--v5-border)",
  padding: "12px 0",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};
const pwdInputStyle: CSSProperties = {
  height: "44px",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
  padding: "0 12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  color: "var(--v5-ink)",
};
const errStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-danger)",
};
const pwdCancelStyle: CSSProperties = {
  height: "44px",
  borderRadius: "8px",
  background: "var(--v5-surface-2)",
};
const pwdCancelLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  color: "var(--v5-ink-2)",
};
const pwdSaveStyle: CSSProperties = {
  height: "44px",
  borderRadius: "8px",
  background: "var(--v5-brand)",
};
const pwdSaveLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
const toggleTrackStyle = computed<CSSProperties>(() => ({
  position: "relative",
  width: "51px",
  height: "31px",
  // 《07》tap≥44:开关本体保持 iOS 标准的 51×31 视觉,热区靠上下 padding 撑到 44(box-sizing 已是 border-box 之外的场景用 min-height 兜)
  boxSizing: "content-box",
  padding: "6.5px 0",
  margin: "-6.5px 0",
  borderRadius: "999px",
  background: twoFactorEnabled.value ? "var(--v5-success)" : "var(--v5-surface-3)",
  transition: "background 200ms ease",
}));
const toggleThumbStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  top: "2px",
  left: "2px",
  width: "27px",
  height: "27px",
  borderRadius: "999px",
  background: "#FFFFFF",
  boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
  transform: `translateX(${twoFactorEnabled.value ? 20 : 0}px)`,
  transition: "transform 200ms ease",
}));
const currentBadgeStyle: CSSProperties = {
  flexShrink: 0,
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-success)",
};
const revokeBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  marginRight: "-8px",
  flexShrink: 0,
};
const revokeAllRowStyle: CSSProperties = {
  minHeight: "52px",
  borderTop: "1px solid var(--v5-border)",
};
const revokeAllLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  color: "var(--v5-danger)",
};
const dangerLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  color: "var(--v5-danger)",
};
</script>
