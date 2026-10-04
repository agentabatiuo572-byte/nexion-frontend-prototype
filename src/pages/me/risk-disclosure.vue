<!--
  Platform risk disclosure (ported from Nexion-prototype/app/(main)/me/risk-disclosure/page.tsx).
  Required reading before first withdrawal / staking lock. The accept button gates
  on (a) scroll-to-bottom (uni-app scrolltolower plus a P-019-safe sentinel)
  and (b) an explicit checkbox tick.
  Acceptance persists via the risk-disclosure
  store. Reads `?return=` for where to land. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <scroll-view :key="nativeScrollSurface.key" scroll-y :scroll-top="scrollTop" style="height: 100vh" :onScroll="nativeScrollSurface.events.scroll" :onScrolltolower="nativeScrollSurface.events.scrolltolower">
    <view style="padding-bottom: 32px">
      <SubPageHeader :back="returnTo" />

      <!-- Hero -->
      <view class="nx-glass-card mx-4" :style="heroStyle">
        <view class="flex items-center" style="gap: 8px; margin-bottom: 6px">
          <view class="grid place-items-center" :style="heroIconBoxStyle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          </view>
          <text :style="heroLabelStyle">{{ w.heroLabel }}</text>
        </view>
        <text class="block" :style="heroTitleStyle">{{ w.heroTitle }}</text>
        <text class="block" :style="heroSubStyle">{{ w.heroSubtitle }}</text>
        <text v-if="disclosure" class="block" :style="heroContextStyle">{{ disclosureContext }}</text>
        <text v-if="languageFallback" class="block" :style="languageFallbackStyle">{{ w.languageFallback }}</text>
        <view v-if="accepted" class="flex items-center" :style="acceptedChipStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
          <text>{{ w.alreadyAccepted }}</text>
        </view>
        <view v-else-if="loadError" :style="hintStyle">
          <text :style="hintTextStyle">{{ loadError }}</text>
          <text v-if="canRetryLoad" class="block active:opacity-70" :style="retryStyle" role="button" tabindex="0" @click="reload"  @keydown.enter.prevent="reload" @keydown.space.prevent="reload">{{ w.reloadRegionCta }}</text>
        </view>
      </view>

      <!-- Sections -->
      <view class="mx-4" :style="sectionsStyle">
        <view
          v-for="b in blocks"
          :key="b.n"
          class="active:opacity-70 transition-opacity"
          :style="blockStyle(selectedBlock === b.n)"
          role="button"
          tabindex="0"
          :aria-label="b.title"
          @click="selectedBlock = b.n"
        >
          <view class="flex items-baseline" style="gap: 8px; margin-bottom: 4px">
            <text :style="blockNumStyle">{{ String(b.n).padStart(2, "0") }}</text>
            <text :style="blockTitleStyle">{{ b.title }}</text>
          </view>
          <text v-if="selectedBlock === b.n" class="block" :style="selectedBlockStyle">{{ sectionSelectedLabel(b.n) }}</text>
          <text class="block" :style="blockBodyStyle">{{ b.body }}</text>
        </view>
      </view>

      <!--
        H5/iOS chassis can miss scrolltolower at nested-scroll boundaries. Keep
        the uni event above as the native path and observe this real bottom marker
        as a second, equivalent signal. The template ref resolves through $el.
      -->
      <view ref="sentinelRef" class="mx-4" style="height: 1px; margin-top: 12px" />

      <!-- Scroll hint -->
      <view v-if="disclosure?.acknowledgmentToken && !scrolledToBottom && !accepted" class="mx-4 flex items-center" :style="hintStyle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
        <text :style="hintTextStyle">{{ w.scrollHint }}</text>
      </view>

      <!-- Acknowledge -->
      <view v-if="disclosure?.acknowledgmentToken || accepted" class="mx-4" :style="ackCardStyle">
        <!-- 反馈走 scale:同 P-058,inline style 里已有 opacity(未读完时 0.55),写 opacity 反馈会被压掉 -->
        <view
          class="flex items-start active:scale-[0.98] transition-transform"
          :style="{ gap: '10px', opacity: scrolledToBottom && !accepted ? 1 : 0.55 }"
          role="checkbox"
          tabindex="0"
          :aria-checked="checked || accepted"
          :aria-disabled="!scrolledToBottom || accepted"
          :aria-label="w.checkboxLabel"
          @click="toggleCheck"

          @keydown.enter.prevent="toggleCheck" @keydown.space.prevent="toggleCheck"
        >
          <view class="grid place-items-center shrink-0" :style="checkboxStyle">
            <svg v-if="checked || accepted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </view>
          <text :style="checkLabelStyle" style="flex: 1">{{ w.checkboxLabel }}</text>
        </view>

        <view
          class="flex items-center justify-center active:opacity-80"
          :style="acceptBtnStyle"
          role="button"
          tabindex="0"
          :aria-disabled="!canAccept && !accepted"
          @click="onAccept"

          @keydown.enter.prevent="onAccept" @keydown.space.prevent="onAccept"
        >
          <template v-if="accepted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <text>{{ w.alreadyAcceptedCta }}</text>
          </template>
          <text v-else>{{ w.acceptCta }}</text>
        </view>
        <text class="block text-center" :style="disclaimerStyle">{{ disclaimerText }}</text>
      </view>
    </view>
    </scroll-view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import { navBack } from "@/lib/route";
import { onLoad, onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { resolveRiskDisclosureDisplayLanguage, riskDisclosureChapterCopy } from "@/lib/risk-disclosure-language";
import { canAcknowledgeRiskDisclosure, canCompleteRiskDisclosureReadingFromScrollEvent, EMPTY_RISK_DISCLOSURE_READING_STATE, riskDisclosureDocumentIdentity, updateRiskDisclosureReadingState } from "@/lib/risk-disclosure-reading-gate";
import { toast } from "@/store/ui";
import { useRiskDisclosure } from "@/store/risk-disclosure";
import { safeReturnTo } from "@/routing/safe-return-to";

const SCROLL_THRESHOLD_PX = 24;

const t = useT();
const locale = useLocaleStore();
const w = computed(() => t.value.riskDisclosure);
const risk = useRiskDisclosure();
const accepted = computed(() => risk.accepted);
// BUG 180: 「我的」 tab name comes from the locale dictionary, not from a copy
// string that hardcoded "Me" into the zh/vi body. One template, three locales.
const disclaimerText = computed(() => fmt(w.value.disclaimer, { tab: t.value.tabs.me }));
const disclosure = computed(() => risk.current);
// BUG #60: an unprovisioned/ambiguous region mapping is a configuration fact, not a
// transient failure. Telling the user to retry (and offering the retry CTA) hides the
// real, diagnosable cause behind a network-style message.
const loadError = computed(() => !risk.error ? "" : risk.jurisdictionUnmapped
  ? w.value.jurisdictionUnmapped
  : risk.publicationUnavailable ? w.value.publicationUnavailable : w.value.loadErrorRegion);
const canRetryLoad = computed(() => !risk.jurisdictionUnmapped);
const displayLanguage = computed(() => disclosure.value
  ? resolveRiskDisclosureDisplayLanguage(locale.code, disclosure.value.languageScope)
  : null);
const languageFallback = computed(() => displayLanguage.value?.fallback ?? false);
const disclosureContext = computed(() => disclosure.value ? fmt(w.value.publishedContext, {
  jurisdiction: disclosure.value.jurisdictionName,
  version: disclosure.value.version,
  effectiveDate: disclosure.value.effectiveDate,
}) : "");
const documentIdentity = computed(() => riskDisclosureDocumentIdentity(disclosure.value));

const returnTo = ref("/pages/me/me");
const publicCountry = ref<string | null>(null);
onLoad((options) => {
  returnTo.value = safeReturnTo(options?.return, "/pages/me/me");
  publicCountry.value = typeof options?.country === "string" && /^[A-Z]{2}$/.test(options.country)
    ? options.country : null;
});

const scrolledToBottom = ref(false);
const checked = ref(false);
const selectedBlock = ref<number | null>(null);
const readingIdentity = ref<string | null>(null);
const scrollEventIdentity = ref<string | null>(null);
const scrollTop = ref(0);
const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
let observerGeneration = 0;
let disposed = false;
let pageActive = true;
let pageGeneration = 0;
let nativeGeneration = 0;
const nativeScrollSurface = ref(createNativeScrollSurface(null));

function createNativeScrollSurface(identity: string | null) {
  const generation = ++nativeGeneration;
  const isCurrent = () => !disposed && pageActive && generation === nativeGeneration
    && identity === scrollEventIdentity.value
    && canCompleteRiskDisclosureReadingFromScrollEvent(identity, documentIdentity.value, readingIdentity.value);
  return { key: generation, identity, events: {
    scroll: (event: { detail?: { scrollTop?: number } }) => {
      if (!isCurrent()) return;
      const position = Number(event.detail?.scrollTop);
      if (Number.isFinite(position) && position >= 0) scrollTop.value = position;
    },
    scrolltolower: () => { if (isCurrent()) scrolledToBottom.value = true; },
  } };
}

function resetScrollSurface(identity: string | null) {
  stopBottomObserver();
  scrollEventIdentity.value = null;
  scrollTop.value = 0;
  // Remount the native view: its queued callbacks must retain their original
  // document and generation, rather than use Vue's updated event invoker.
  nativeScrollSurface.value = createNativeScrollSurface(identity);
  return nativeScrollSurface.value.key;
}

async function armReading(identity: string | null, generation: number) {
  await nextTick();
  if (disposed || !pageActive || generation !== nativeGeneration || !identity
      || documentIdentity.value !== identity || readingIdentity.value !== identity) return;
  scrollEventIdentity.value = identity;
  startBottomObserver(identity);
}

function stopBottomObserver() {
  observerGeneration += 1;
  observer?.disconnect();
  observer = null;
}

function setReadingState(state = EMPTY_RISK_DISCLOSURE_READING_STATE) {
  scrolledToBottom.value = state.scrolledToBottom;
  checked.value = state.checked;
  selectedBlock.value = state.selectedBlock;
}

function startBottomObserver(identity = documentIdentity.value) {
  if (disposed || !pageActive) return;
  stopBottomObserver();
  // A failed current-disclosure request leaves the chapter list empty. Do not
  // let that short page satisfy the reading gate before a later retry succeeds.
  if (!disclosure.value || !identity || readingIdentity.value !== identity) return;
  // App webviews without DOM IntersectionObserver still use scrolltolower.
  // We intentionally do not auto-pass the gate when IO is unavailable.
  if (typeof IntersectionObserver === "undefined") return;
  const raw = sentinelRef.value as unknown;
  const el: Element | null = raw instanceof Element
    ? raw
    : (raw as { $el?: unknown } | null)?.$el instanceof Element
      ? (raw as { $el: Element }).$el
      : null;
  if (!el) return;

  const generation = observerGeneration;
  observer = new IntersectionObserver(
    (entries) => {
      if (!disposed && pageActive && generation === observerGeneration
          && documentIdentity.value === identity
          && readingIdentity.value === identity
          && entries.some((entry) => entry.isIntersecting)) {
        scrolledToBottom.value = true;
      }
    },
    { rootMargin: `0px 0px -${SCROLL_THRESHOLD_PX}px 0px` },
  );
  observer.observe(el);
}

watch(documentIdentity, (nextIdentity, previousIdentity) => {
  if (nextIdentity === previousIdentity) return;
  stopBottomObserver();
  scrollEventIdentity.value = null;
  const generation = nextIdentity && pageActive && !disposed ? resetScrollSurface(nextIdentity) : ++nativeGeneration;
  setReadingState(updateRiskDisclosureReadingState(previousIdentity, nextIdentity, {
    scrolledToBottom: scrolledToBottom.value,
    checked: checked.value,
    selectedBlock: selectedBlock.value,
  }));
  readingIdentity.value = nextIdentity;
  if (pageActive) void armReading(nextIdentity, generation);
}, { flush: "sync" });

onMounted(reload);
onHide(() => {
  pageActive = false;
  pageGeneration += 1;
  nativeGeneration += 1;
  stopBottomObserver();
  scrollEventIdentity.value = null;
  setReadingState();
});
onShow(async () => {
  if (disposed || pageActive) return;
  pageActive = true;
  await reload();
});
onUnmounted(() => {
  disposed = true;
  pageActive = false;
  pageGeneration += 1;
  nativeGeneration += 1;
  stopBottomObserver();
  scrollEventIdentity.value = null;
});

const blocks = computed(() => disclosure.value?.chapters.map((chapter) => ({
  n: Number(chapter.no),
  title: riskDisclosureChapterCopy(chapter, displayLanguage.value?.language ?? "zh").title,
  body: riskDisclosureChapterCopy(chapter, displayLanguage.value?.language ?? "zh").body,
})) ?? []);

function sectionSelectedLabel(n: number): string {
  return fmt(w.value.sectionSelected, { n: String(n).padStart(2, "0") });
}

const canAccept = computed(() => canAcknowledgeRiskDisclosure({
  disclosure: disclosure.value,
  documentIdentity: documentIdentity.value,
  readingIdentity: readingIdentity.value,
  reading: {
    scrolledToBottom: scrolledToBottom.value,
    checked: checked.value,
    selectedBlock: selectedBlock.value,
  },
  accepted: accepted.value,
  loading: risk.loading,
}));

function toggleCheck() {
  if (!disposed && pageActive && scrolledToBottom.value && !accepted.value) checked.value = !checked.value;
}
async function onAccept() {
  if (disposed || !pageActive || !disclosure.value || risk.loading || accepted.value) return;
  if (!scrolledToBottom.value) {
    toast.info(w.value.scrollHint);
    return;
  }
  if (!checked.value) {
    toast.info(w.value.checkboxRequired);
    return;
  }
  if (!canAccept.value) return;
  const generation = pageGeneration;
  if (!await risk.accept()) return;
  await nextTick();
  if (disposed || !pageActive || generation !== pageGeneration) return;
  toast.success(w.value.acceptToast);
  // 🔴 用 navigateBack 回到**原来那个页面实例**。navigateTo 是压一个新页:
  // 用户在提现页输的金额随新实例重置为空、原实例被压在栈底,提交意图 100% 丢失,
  // 而且页面栈变成 withdraw → disclosure → withdraw,再按返回会退回披露页(死循环观感)。
  // 冷启动直达本页时栈里只有一页,裸 navigateBack 是空操作(P-054)—— 走 helper,它会按栈深选 pop 还是 reLaunch。
  navBack(returnTo.value);
}
async function reload() {
  if (disposed || !pageActive) return;
  const generation = ++pageGeneration;
  nativeGeneration += 1;
  stopBottomObserver();
  scrollEventIdentity.value = null;
  setReadingState();
  await risk.refresh(publicCountry.value);
  if (disposed || !pageActive || generation !== pageGeneration) return;
  const identity = documentIdentity.value;
  readingIdentity.value = identity;
  const surface = nativeScrollSurface.value;
  // The identity watcher may already have mounted the new native view. Avoid
  // replacing it again while uni-app's mounted nextTick is still pending.
  const nativeKey = surface.identity === identity && surface.key === nativeGeneration
    ? surface.key : identity ? resetScrollSurface(identity) : nativeGeneration;
  await armReading(identity, nativeKey);
}

// Spotlight hero (whitelist ≤1):零 border(《03》§3,C2 第二轮起中性边也删)——
// 边界靠 surface 与页面地板的微差色;the brand-2 mood lives in the icon + label.
// Header provides the 24px top breathing, so no top margin here.
const heroStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  borderRadius: "var(--nx-glass-radius)",
  padding: "16px",
  background: "var(--nx-glass-fill)",
};
const heroIconBoxStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 22%, transparent)",
};
const heroLabelStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-brand-2)" };
const heroTitleStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.25 };
const heroSubStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };
const heroContextStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.5 };
const languageFallbackStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-warning)", lineHeight: 1.5 };
const acceptedChipStyle: CSSProperties = {
  marginTop: "10px",
  alignSelf: "flex-start",
  padding: "4px 10px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-brand) 14%, transparent)",
  color: "var(--v5-brand)",
  fontSize: "12px",
  display: "inline-flex",
};
// De-carded: disclosure sections read on the page floor (legal page → clear,
// legible paragraphs). Card shell dropped; blocks separated by whitespace.
const sectionsStyle: CSSProperties = {
  marginTop: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};
const blockNumStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-brand-2)" };
// Unit title + paragraph body per the de-card typography ladder (body = ink-2,
// never ink-3, at a legible 13.5/1.65 for a legal disclosure).
const blockTitleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.4 };
const blockBodyStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 };
// Selected section keeps a soft brand-2 read-tracking tint (no border — inner
// blocks use soft fill, not a stroke); horizontal bleed reaches the gutter.
function blockStyle(selected: boolean): CSSProperties {
  return {
    borderRadius: "12px",
    padding: "8px 12px",
    margin: "0 -12px",
    background: selected ? "color-mix(in srgb, var(--v5-brand-2) 8%, transparent)" : "transparent",
  };
}
const selectedBlockStyle: CSSProperties = {
  marginBottom: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand-2)",
};
const hintStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
  padding: "12px",
};
const hintTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-warning)" };
const retryStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-brand)" };
// Acknowledgment gate — de-carded onto the page floor; a hairline opens the
// action group (checkbox control + brand CTA pill are whitelisted as-is).
const ackCardStyle: CSSProperties = {
  marginTop: "16px",
  paddingTop: "16px",
  borderTop: "1px solid var(--v5-border)",
};
const checkboxStyle = computed<CSSProperties>(() => ({
  width: "20px",
  height: "20px",
  borderRadius: "6px",
  marginTop: "2px",
  background: checked.value || accepted.value ? "var(--v5-brand)" : "transparent",
  border: checked.value || accepted.value ? "1px solid var(--v5-brand)" : "1px solid var(--v5-border-strong)",
}));
const checkLabelStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.625 };
const acceptBtnStyle = computed<CSSProperties>(() => ({
  marginTop: "16px",
  width: "100%",
  height: "48px",
  borderRadius: "999px",
  background: canAccept.value || accepted.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
  color: canAccept.value || accepted.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
  fontSize: "15px",
  fontWeight: 600,
}));
const disclaimerStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-4)", lineHeight: 1.375 };


</script>
