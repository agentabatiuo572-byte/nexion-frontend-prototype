<template>
  <view>
    <SubPageHeader :back="back" />
    <view v-if="loading" class="mx-4" style="padding: 28px 0; color: var(--v5-ink-3);" role="status"><text>{{ t.howPublished.loading }}</text></view>
    <view v-else-if="error" class="mx-4" style="padding: 28px 0;" role="alert">
      <view style="padding: 14px; border-radius: 12px; background: var(--v5-surface-2); color: var(--v5-ink-2);">
        <text class="block" style="font-size: 15px; font-weight: 600;">{{ t.howPublished.unavailableTitle }}</text>
        <text class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-3);">{{ t.howPublished.unavailableBody }}</text>
        <view class="flex items-center justify-center" style="margin-top: 12px; height: 40px; border-radius: 999px; background: var(--v5-brand); color: var(--v5-on-brand);" role="button" tabindex="0" @click="load">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>
    </view>
    <view v-else-if="content" class="pb-8">
      <HowHero :label="heroLabel(content.contentKey)" :title="content.blocks[0]?.title ?? content.contentKey" :sub="content.blocks[0] ? renderBody(content.blocks[0]) : ''" accent="purple" />
      <view v-if="content.blocks[0]?.items?.length" class="mx-4" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px">
        <view v-for="(item, itemIndex) in content.blocks[0].items" :key="itemIndex" style="display: flex; gap: 8px">
          <text style="color: var(--v5-brand);">•</text><text :style="bodyStyle">{{ item }}</text>
        </view>
      </view>
      <template v-for="(block, index) in content.blocks.slice(1)" :key="block.id">
        <HowSection v-if="block.kind !== 'callout'" :title="block.title" :accent="index % 2 ? 'purple' : 'lemon'">
          <text class="block" :style="bodyStyle">{{ renderBody(block) }}</text>
          <view v-if="block.items?.length" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px">
            <view v-for="item in block.items" :key="item" style="display: flex; gap: 8px">
              <text style="color: var(--v5-brand);">•</text><text :style="bodyStyle">{{ item }}</text>
            </view>
          </view>
        </HowSection>
        <HowCalloutBox v-else class="mx-4" :title="block.title" :body="renderBody(block)" tone="purple" />
      </template>
      <view class="mx-4" style="margin-top: 24px; padding: 10px 12px; border-radius: 10px; background: var(--v5-surface-2); color: var(--v5-ink-3); font-size: 12px;">
        <text v-if="content.versionSource !== 'DOCUMENT_FALLBACK'">{{ fmt(t.howPublished.versionMeta, { version: content.version, locale: content.locale }) }}</text>
        <text v-else>{{ fmt(t.howPublished.versionMetaDocumentFallback, { locale: content.locale }) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowCalloutBox from "@/components/how/how-callout-box.vue";
import { howContentApi, remoteApiEnabled } from "@/api/runtime";
import type { HowContentDocument, HowContentKey, HowContentBlock } from "@/api/how-content-api";
import { useLocaleStore } from "@/store/locale";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { PublishedContentRequestFence } from "./p3-14-published-request-fence";

const props = defineProps<{ contentKey: HowContentKey; back: string }>();
const emit = defineEmits<{ unavailable: [] }>();
const locale = useLocaleStore();
const t = useT();
const content = ref<HowContentDocument | null>(null);
const loading = ref(true);
const error = ref(false);
const bodyStyle = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 };
const requestFence = new PublishedContentRequestFence();

function heroLabel(contentKey: HowContentKey): string {
  switch (contentKey) {
    case "wallet-exchange-how": return t.value.exchangeHowItWorks.heroLabel;
    case "wallet-repurchase-how": return t.value.repurchaseHowItWorks.heroLabel;
    case "genesis-how": return t.value.genesisHowItWorks.heroLabel;
    case "team-binary-how": return t.value.binaryHowItWorks.heroLabel;
    case "team-commissions-how": return t.value.commissionsHowItWorks.heroLabel;
    case "team-unilevel-how": return t.value.unilevelHowItWorks.heroLabel;
  }
}

function renderBody(block: HowContentBlock): string {
  if (block.kind !== "ruleRef" || !block.ref) return block.body;
  return block.body.replaceAll("{value}", `${block.ref.key} · ${block.ref.version}`);
}
async function load() {
  const requestKey = `${props.contentKey}:${locale.code}`;
  const generation = requestFence.begin(requestKey);
  if (generation === null) return;

  loading.value = true;
  error.value = false;
  try {
    const next = await howContentApi.published(props.contentKey, locale.code);
    if (!requestFence.isCurrent(generation)) return;
    content.value = next;
  } catch {
    if (!requestFence.isCurrent(generation)) return;
    content.value = null;
    error.value = true;
    emit("unavailable");
  } finally {
    if (!requestFence.isCurrent(generation)) return;
    loading.value = false;
    requestFence.settle(generation);
  }
}
watch(
  () => [props.contentKey, locale.code] as const,
  () => {
    if (remoteApiEnabled) {
      void load();
      return;
    }
    requestFence.invalidate();
    content.value = null;
    error.value = false;
    loading.value = false;
  },
  { immediate: true },
);
onUnmounted(() => requestFence.invalidate());
</script>
