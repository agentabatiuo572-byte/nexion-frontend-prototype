<template>
  <StandalonePageShell>
    <view class="privacy-page">
      <view role="button" tabindex="0" class="privacy-back" data-system-chrome-primary @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><text>← {{ t.privacy.back }}</text></view>
      <text class="privacy-title">{{ t.privacy.title }}</text>
      <text v-if="loading" class="privacy-copy">{{ t.terms.loading }}</text>
      <view v-else-if="failed" role="alert">
        <text class="privacy-copy">{{ t.privacy.unavailable }}</text>
        <view role="button" tabindex="0" class="privacy-back" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ t.ui.retry }}</text></view>
      </view>
      <view v-else-if="policy">
        <text class="privacy-copy">{{ t.privacy.version }} {{ policy.version }} · {{ policy.locale }}</text>
        <text class="privacy-copy">{{ policy.hero }}</text>
        <view v-for="section in policy.sections" :key="section.id" class="privacy-section">
          <text class="privacy-section-title">{{ section.title }}</text>
          <text class="privacy-copy">{{ section.body }}</text>
        </view>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { onMounted, onUnmounted, ref, watch } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { privacyPolicyApi } from "@/api/runtime";
import type { PrivacyPolicy } from "@/api/privacy-policy-api";
import { navBack } from "@/lib/route";
import { resolvePrivacyReturn } from "@/lib/privacy-return";
const t = useT();
const locale = useLocaleStore();
const policy = ref<PrivacyPolicy | null>(null);
const loading = ref(false);
const failed = ref(false);
let generation = 0;
const returnTo = ref("/pages/onboarding/intro");
async function load() {
  const request = ++generation;
  loading.value = true;
  failed.value = false;
  policy.value = null;
  try { const value = await privacyPolicyApi.current(locale.code); if (request === generation) policy.value = value; }
  catch { if (request === generation) failed.value = true; }
  finally { if (request === generation) loading.value = false; }
}
function goBack() { navBack(returnTo.value); }
onLoad((options) => { returnTo.value = resolvePrivacyReturn(options?.return); });
onMounted(() => { void load(); });
watch(() => locale.code, () => { void load(); });
onUnmounted(() => { generation += 1; });
</script>

<style scoped>
.privacy-page { padding: 24px 20px 48px; color: var(--v5-ink); }
.privacy-title { display: block; font-size: 26px; font-weight: 700; margin: 24px 0 16px; }
.privacy-back { color: var(--v5-brand); padding: 8px 0; cursor: pointer; }
.privacy-section { margin-top: 24px; }
.privacy-section-title { display: block; font-size: 15px; font-weight: 600; }
.privacy-copy { display: block; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 10px; color: var(--v5-ink-2); }
</style>
