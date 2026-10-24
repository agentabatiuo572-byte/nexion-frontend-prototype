<template>
  <view class="third-party-auth" data-testid="third-party-auth">
    <text class="oauth-title">{{ intent === 'LINK' ? t.thirdParty.linkTitle : t.thirdParty.signInTitle }}</text>
    <AuthProviderGrid :providers="['Google', 'Apple', 'Telegram']" :linked="linkedLabels" :busy="disabled || !!flow || submitting" @select="start" />
    <view v-if="flow" class="oauth-panel" aria-live="polite">
      <text class="oauth-copy">{{ t.thirdParty.confirmIdentity }}</text>
      <text class="oauth-title">{{ flow.displayName }}</text>
      <text class="oauth-copy">{{ t.prototypeAuth.identityHint }}</text>
      <view role="group" :aria-label="t.prototypeAuth.identityHint" class="oauth-identities">
        <view v-for="(subject, index) in prototypeProviderSubjects" :key="subject" role="button" tabindex="0" class="oauth-button oauth-secondary" :aria-pressed="flow.subject === subject" @click="selectIdentity(subject)">
          <text>{{ index === 0 ? t.prototypeAuth.identityOne : t.prototypeAuth.identityTwo }}{{ flow.subject === subject ? ' ✓' : '' }}</text>
        </view>
      </view>
      <input v-if="intent === 'LINK'" v-model="password" password :maxlength="64" :placeholder="t.security.currentPassword" :aria-label="t.security.currentPassword" class="oauth-input" />
      <view v-if="needsCode">
        <text class="oauth-copy">{{ t.prototypeAuth.verifyNumber }} {{ deliveryHint }}</text>
        <text class="oauth-copy" role="status">{{ fmt(t.prototypeAuth.codeHint, { code: PROTOTYPE_DEMO_CODE }) }}</text>
        <input v-model="code" type="number" maxlength="6" :placeholder="t.thirdParty.codeLabel" :aria-label="t.thirdParty.codeLabel" class="oauth-input" />
      </view>
      <view class="oauth-button" role="button" :tabindex="completionDisabled ? -1 : 0" :aria-disabled="completionDisabled" :aria-busy="submitting" @click="complete">
        <text>{{ submitting ? '…' : intent === 'LINK' ? t.thirdParty.confirmLink : t.thirdParty.continueLogin }}</text>
      </view>
      <view class="oauth-button oauth-secondary" role="button" tabindex="0" @click="cancel"><text>{{ t.ui.cancel }}</text></view>
    </view>
    <text v-if="message" class="oauth-copy" role="status">{{ message }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onHide } from "@dcloudio/uni-app";
import AuthProviderGrid from "@/components/auth-provider-grid.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { PROTOTYPE_DEMO_CODE } from "@/auth/prototype-demo";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { completeSignIn } from "@/auth/complete-sign-in";
import { sessionVault } from "@/api/runtime";
import { linkedPrototypeProviders, startPrototypeProvider, cancelPrototypeProvider, linkPrototypeProvider, signInPrototypeProvider, acknowledgePrototypeProviderRegistration, prototypeProviderSubjects, type PrototypeProviderSubject, type PrototypeProvider, type PrototypeProviderFlow } from "@/api/prototype-account-api";

const props = withDefaults(defineProps<{ intent?: 'LOGIN' | 'LINK'; disabled?: boolean; returnTo?: string | null; sponsorCode?: string | null }>(), { intent: 'LOGIN', disabled: false, returnTo: null, sponsorCode: null });
const emit = defineEmits<{ (event: 'busy', value: boolean): void }>();
const t = useT(), auth = useAuth();
const linked = ref<PrototypeProvider[]>([]), flow = ref<PrototypeProviderFlow | null>(null);
const password = ref(''), code = ref(''), message = ref(''), deliveryHint = ref('');
const needsCode = ref(false), submitting = ref(false);
let owner = '', wasAuthenticated = false, revision = 0;
const names = { GOOGLE: 'Google', APPLE: 'Apple', TELEGRAM: 'Telegram' } as const;
const linkedLabels = computed(() => props.intent === 'LINK' ? linked.value.map(provider => names[provider]) : []);
const completionDisabled = computed(() => submitting.value || props.disabled || (props.intent === 'LINK' && !password.value) || (needsCode.value && !/^\d{6}$/.test(code.value)));
function cancel() {
  if (flow.value) cancelPrototypeProvider(flow.value.id);
  flow.value = null; password.value = ''; code.value = ''; needsCode.value = false;
  submitting.value = false; emit('busy', false);
}
function loadLinked() {
  try { linked.value = props.intent === 'LINK' ? linkedPrototypeProviders(auth.accountId) : []; }
  catch { message.value = t.value.thirdParty.unavailable; }
}
watch(() => auth.accountId, () => { cancel(); loadLinked(); }, { immediate: true });
watch(() => auth.isAuthenticated, () => cancel());
function start(label: string) {
  if (props.disabled || flow.value || submitting.value) return;
  const provider = (Object.keys(names) as PrototypeProvider[]).find(key => names[key] === label);
  if (!provider || props.intent === 'LINK' && linked.value.includes(provider)) return;
  owner = auth.accountId; wasAuthenticated = auth.isAuthenticated; revision = sessionVault.revision(); message.value = '';
  flow.value = startPrototypeProvider(provider, props.intent === 'LINK' ? owner : null, undefined, props.sponsorCode);
  emit('busy', true);
}
function selectIdentity(subject: PrototypeProviderSubject) {
  if (!flow.value || submitting.value || flow.value.subject === subject) return;
  const provider = flow.value.provider;
  cancelPrototypeProvider(flow.value.id);
  password.value = ''; code.value = ''; needsCode.value = false; message.value = ''; deliveryHint.value = '';
  flow.value = startPrototypeProvider(provider, props.intent === 'LINK' ? owner : null, subject, props.sponsorCode);
}
function complete() {
  if (!flow.value || completionDisabled.value) return;
  if (owner !== auth.accountId || wasAuthenticated !== auth.isAuthenticated || revision !== sessionVault.revision()) { cancel(); message.value = t.value.thirdParty.expired; return; }
  submitting.value = true; message.value = '';
  try {
    if (props.intent === 'LINK') {
      linkPrototypeProvider(flow.value.id, owner, password.value);
      loadLinked(); cancel(); message.value = t.value.thirdParty.linkSuccess;
    } else {
      const result = signInPrototypeProvider(flow.value.id, needsCode.value ? code.value : undefined);
      if (result.kind === 'challenge') { needsCode.value = true; deliveryHint.value = result.deliveryHint; return; }
      let acceptedRevision: number | null = null;
      try {
        useApp().withStrictPrototypeSnapshot(() => {
          const revision = sessionVault.revision();
          if (!sessionVault.saveIfUnchanged({ accessToken: `mock-access-${result.user.userId}`, refreshToken: `mock-refresh-${result.user.userId}`, tokenType: 'Bearer', user: result.user }, revision)) throw new Error('SESSION_CONFLICT');
          acceptedRevision = sessionVault.revision();
          const completed = completeSignIn({ identity: result.accountId, returnTo: result.registrationReceipt ? '/pages/register/success' : props.returnTo, serverProfile: result.user, deferNavigation: !!result.registrationReceipt });
          if (!completed.ok) throw new Error(completed.error);
        }, { allowAccountSwitch: true });
      } catch (cause) {
        if (acceptedRevision !== null) sessionVault.clearIfUnchanged(acceptedRevision);
        throw cause;
      }
      if (result.registrationReceipt) {
        // persist-verdict-ok: acknowledgement failure keeps the receipt pending
        // for the next login; this accepted session and its gift remain valid.
        acknowledgePrototypeProviderRegistration(result.accountId);
        // #ifdef H5
        uni.reLaunch({ url: '/pages/register/success' });
        // #endif
        // #ifndef H5
        uni.reLaunch({ url: '/pages/onboarding/estimator' });
        // #endif
      }
      cancel();
    }
  } catch (cause) {
    const key = cause instanceof Error ? cause.message : '';
    message.value = key === 'PROTOTYPE_REGISTRATION_RETRY' ? t.value.prototypeAuth.registrationRetry
      : key === 'PROTOTYPE_REGISTRATION_BLOCKED' ? t.value.prototypeAuth.registrationBlocked
      : key === 'OAUTH_LINK_PASSWORD_INVALID' ? t.value.thirdParty.passwordInvalid
      : key === 'OAUTH_IDENTITY_ALREADY_LINKED' ? t.value.thirdParty.linkConflict
      : key === 'USER_TWO_FACTOR_CHALLENGE_INVALID' ? t.value.thirdParty.codeInvalid
      : key === 'OAUTH_FLOW_EXPIRED' ? t.value.thirdParty.expired : t.value.thirdParty.failed;
  } finally { submitting.value = false; password.value = ''; }
}
onHide(cancel);
onUnmounted(cancel);
</script>

<style scoped>
.third-party-auth { margin: 20px 0; color: var(--v5-ink); }
.oauth-title { display: block; font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.oauth-copy { display: block; font-size: 13px; line-height: 1.6; color: var(--v5-ink-2); margin: 10px 0; overflow-wrap: anywhere; }
.oauth-panel { padding: 14px; margin-top: 12px; border-radius: 16px; background: var(--v5-surface); }
.oauth-input { box-sizing: border-box; min-height: 44px; width: 100%; padding: 10px; border-radius: 10px; color: var(--v5-ink); background: var(--v5-surface-2); margin: 12px 0; }
.oauth-button { min-height: 44px; display: flex; align-items: center; justify-content: center; margin-top: 10px; border-radius: 12px; background: var(--v5-brand); color: var(--v5-on-brand); font-size: 15px; }
.oauth-button[aria-disabled="true"] { opacity: .5; }
.oauth-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.oauth-secondary { background: var(--v5-surface-2); color: var(--v5-ink); }
</style>
