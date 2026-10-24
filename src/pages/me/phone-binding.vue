<template>
  <AppChassis active="me">
    <view class="phone-page">
      <SubPageHeader back="/pages/me/security" :title="changing ? t.security.phoneChangeTitle : t.security.phoneBindingTitle" />
      <view class="phone-card">
        <text v-if="done" role="status">{{ t.security.phoneBindingDone }}</text>
        <template v-else>
          <text v-if="changing && policy" class="phone-note">{{ fmt(t.security.phoneChangeSummary, { used: policy.usedChanges, max: policy.maxChanges, days: policy.windowDays }) }}</text>
          <text v-if="changing && policy?.remainingChanges === 0" class="phone-note">{{ t.security.phoneChangeLimit }} {{ policy.nextAvailableAt ? new Date(policy.nextAvailableAt).toLocaleDateString() : '' }}</text>
          <template v-if="!challenge">
            <view class="phone-number">
              <view role="button" tabindex="0" class="phone-country" :aria-label="t.countryCodes.title" :aria-expanded="showCountries" @click="showCountries = true"><text>{{ countryCode }} ▾</text></view>
              <input v-model="phone" type="number" inputmode="numeric" maxlength="15" :placeholder="t.security.phoneChangeNew" :aria-label="t.security.phoneChangeNew" />
            </view>
            <input v-if="changing" v-model="password" password maxlength="64" :placeholder="t.security.currentPassword" :aria-label="t.security.currentPassword" />
            <text class="phone-note">{{ changing ? t.security.phoneChangeCheckInput : t.security.phoneBindingRequired }}</text>
            <view class="phone-action" role="button" :tabindex="canSend ? 0 : -1" :aria-disabled="!canSend" :aria-busy="busy" @click="send">
              <text>{{ busy ? '…' : resendLeft ? `${t.security.phoneBindingResend} ${resendLeft}s` : t.prototypeAuth.getCode }}</text>
            </view>
          </template>
          <template v-else>
            <text class="phone-note">{{ changing ? fmt(t.prototypeAuth.verifyBothNumbers, { old: challenge.oldPhoneMasked, next: challenge.newPhoneMasked }) : `${t.prototypeAuth.verifyNumber} ${challenge.newPhoneMasked}` }}</text>
            <text class="phone-note" role="status">{{ fmt(t.prototypeAuth.codeHint, { code: PROTOTYPE_DEMO_CODE }) }}</text>
            <input v-if="changing" v-model="oldCode" type="number" maxlength="6" :placeholder="t.prototypeAuth.oldNumberCode" :aria-label="t.prototypeAuth.oldNumberCode" />
            <input v-model="newCode" type="number" maxlength="6" :placeholder="t.prototypeAuth.newNumberCode" :aria-label="t.prototypeAuth.newNumberCode" />
            <view class="phone-action" role="button" :tabindex="canSubmit ? 0 : -1" :aria-disabled="!canSubmit" :aria-busy="busy" @click="submit"><text>{{ busy ? '…' : changing ? t.security.phoneChangeConfirm : t.security.phoneBindingConfirm }}</text></view>
            <view class="phone-action phone-secondary" role="button" tabindex="0" @click="reset"><text>{{ t.security.phoneChangeRestart }}</text></view>
          </template>
          <text v-if="error" class="phone-error" role="alert">{{ error }}</text>
          <view v-if="loadFailed" class="phone-action phone-secondary" role="button" tabindex="0" @click="refresh"><text>{{ t.ui.retry }}</text></view>
        </template>
        <view class="phone-action phone-secondary" role="button" tabindex="0" @click="leave"><text>{{ done ? t.security.back : t.ui.cancel }}</text></view>
      </view>
      <CountryCodeSheet :open="showCountries" :model-value="countryCode" @select="countryCode = $event" @close="showCountries = false" />
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CountryCodeSheet from "@/components/country-code-sheet.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { useSession } from "@/store/session";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { navTo } from "@/lib/route";
import { sessionVault } from "@/api/runtime";
import { dialCodeForLocale, validateNationalPhone } from "@/auth/phone-number";
import { prototypeAccountPhone, prototypePhonePolicy, startPrototypePhone, confirmPrototypePhone, cancelPrototypePhone, type PrototypePhoneChallenge } from "@/api/prototype-account-api";
import { toast } from "@/store/ui";
import { PROTOTYPE_DEMO_CODE } from "@/auth/prototype-demo";
const t = useT(), auth = useAuth();
const countryCode = ref(dialCodeForLocale(useLocaleStore().code)), phone = ref(''), password = ref('');
const oldCode = ref(''), newCode = ref(''), error = ref('');
const showCountries = ref(false), busy = ref(false), done = ref(false), changing = ref(false), loadFailed = ref(false);
const challenge = ref<PrototypePhoneChallenge | null>(null), resendLeft = ref(0);
const policy = ref<ReturnType<typeof prototypePhonePolicy> | null>(null);
let owner = '', timer: ReturnType<typeof setInterval> | undefined;
const canSend = computed(() => !busy.value && !loadFailed.value && !resendLeft.value && validateNationalPhone(countryCode.value, phone.value) && (!changing.value || !!password.value && !!policy.value?.remainingChanges));
const canSubmit = computed(() => !busy.value && /^\d{6}$/.test(newCode.value) && (!changing.value || /^\d{6}$/.test(oldCode.value)));
function reset() { if (challenge.value) cancelPrototypePhone(challenge.value.challengeNo); challenge.value = null; oldCode.value = ''; newCode.value = ''; password.value = ''; error.value = ''; }
function refresh() {
  reset();
  if (owner !== auth.accountId) {
    if (timer) clearInterval(timer);
    timer = undefined; resendLeft.value = 0; phone.value = ''; countryCode.value = dialCodeForLocale(useLocaleStore().code);
    done.value = false; busy.value = false; showCountries.value = false; changing.value = false; policy.value = null;
  }
  owner = auth.accountId; loadFailed.value = false;
  try { changing.value = !!prototypeAccountPhone(owner)?.phone; policy.value = prototypePhonePolicy(owner); }
  catch { loadFailed.value = true; error.value = t.value.security.phoneChangeUnavailable; }
}
function failure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  return message === 'OAUTH_LINK_PASSWORD_INVALID' ? t.value.thirdParty.passwordInvalid
    : message === 'USER_PHONE_ALREADY_IN_USE' ? t.value.security.phoneChangeInUse
    : message === 'USER_PHONE_CHANGE_LIMIT_REACHED' ? t.value.security.phoneChangeLimit
    : message === 'USER_PHONE_CHANGE_CODE_INVALID' ? t.value.security.phoneChangeInvalidCode
    : message === 'USER_PHONE_CHANGE_EXPIRED' ? t.value.security.phoneChangeExpired
    : message === 'USER_PHONE_CHANGE_CHALLENGE_RATE_LIMITED' ? t.value.security.phoneChangeRateLimited
    : message === 'USER_PHONE_INVALID' || message === 'USER_PHONE_UNCHANGED' ? t.value.security.phoneChangeInvalidNumber : t.value.security.phoneBindingFailed;
}
function send() {
  if (!canSend.value || owner !== auth.accountId || !auth.isAuthenticated) return;
  busy.value = true; error.value = '';
  try {
    challenge.value = startPrototypePhone(owner, countryCode.value, phone.value, password.value);
    password.value = ''; resendLeft.value = challenge.value.resendAfterSec;
    if (timer) clearInterval(timer);
    timer = setInterval(() => { resendLeft.value = Math.max(0, resendLeft.value - 1); if (!resendLeft.value && timer) clearInterval(timer); }, 1000);
  } catch (cause) { error.value = failure(cause); }
  finally { busy.value = false; }
}
function submit() {
  if (!challenge.value || !canSubmit.value || owner !== auth.accountId || !auth.isAuthenticated) return;
  busy.value = true; error.value = '';
  try {
    confirmPrototypePhone(owner, challenge.value.challengeNo, newCode.value, oldCode.value);
    const current = prototypeAccountPhone(owner);
    if (!current || current.countryCode !== countryCode.value || current.phone !== phone.value.replace(/\D/g, '')) throw new Error('READBACK_FAILED');
    if (changing.value) {
      useApp().interruptAllTasks('logged-out');
      sessionVault.clear(); useSession().signOutSession(); auth.signOut();
      useApp().bindAccount('default'); rebindAccountScopedStores('default');
      toast.success(t.value.security.phoneChangeDone);
      uni.reLaunch({ url: '/pages/login/login', fail: () => {} });
    } else {
      const snapshot = sessionVault.read();
      if (snapshot) sessionVault.save({ ...snapshot, user: { ...snapshot.user, ...current } });
      done.value = true; reset();
    }
  } catch (cause) { error.value = failure(cause); }
  finally { busy.value = false; }
}
function leave() { reset(); navTo('/pages/me/security'); }
watch(() => auth.accountId, () => { reset(); refresh(); });
onShow(refresh);
onHide(reset);
onUnmounted(() => { reset(); if (timer) clearInterval(timer); });
</script>

<style scoped>
.phone-page { min-height: 100vh; padding-bottom: 32px; color: var(--v5-ink); }
.phone-card { margin: 20px 16px; padding: 20px; border-radius: 18px; background: var(--v5-surface); display: grid; gap: 16px; }
.phone-note { color: var(--v5-ink-2); line-height: 1.5; font-size: 13px; }
.phone-number { display: flex; gap: 12px; align-items: center; }
.phone-country, input { padding: 12px; border: 1px solid var(--v5-border); border-radius: 10px; min-height: 44px; box-sizing: border-box; }
.phone-number input { flex: 1; min-width: 0; }
.phone-action { min-height: 44px; padding: 10px; display: grid; place-items: center; border-radius: 10px; background: var(--v5-brand); color: var(--v5-on-brand); font-size: 14px; }
.phone-action[aria-disabled="true"] { opacity: .5; }
.phone-secondary { background: var(--v5-surface-2); color: var(--v5-ink); }
.phone-error { color: var(--v5-danger); font-size: 13px; }
.phone-action:focus-visible, .phone-country:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
</style>
