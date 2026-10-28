<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamAgent" />

      <view v-if="remoteApiEnabled && pageReadState !== 'ready' && !(pageReadState === 'loading' && policy)" class="px-4 text-center" style="padding-top: 32px" role="status" aria-live="polite" :aria-busy="pageReadState === 'loading'">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2)">{{ pageReadState === 'loading' ? t.agent.loading : t.agent.loadError }}</text>
        <view v-if="pageReadState === 'error'" class="agent-cta agent-retry" role="button" tabindex="0" @click="retryAgentPage" @keydown.enter.prevent="retryAgentPage" @keydown.space.prevent="retryAgentPage"><text>{{ t.agent.retry }}</text><text aria-hidden="true">→</text></view>
      </view>
      <view class="agent-content">
        <view class="agent-hero">
          <view class="agent-hero-copy">
            <text class="agent-eyebrow">{{ t.agent.heroLabel }}</text>
            <text class="agent-headline">{{ t.agent.heroHeadline }}</text>
          </view>
          <TeamArt kind="growth" :size="112" />
        </view>
        <text class="agent-intro">{{ fmt(t.agent.heroBody, { rank: requiredRankLabel }) }}</text>

        <view class="agent-eligibility">
          <TeamRankEmblem :rank="rankReady ? myRank : null" :size="52" />
          <view class="agent-eligibility-copy">
            <view class="agent-rank-summary">
              <view><text class="agent-rank-label">{{ t.rank.currentRank }}</text><VBadge v-if="rankReady" :v="myRank" size="sm" :show-title="false" /><text v-else>—</text></view>
              <view><text class="agent-rank-label">{{ t.rank.conditionsLabel }}</text><text>{{ requiredRankLabel }}+</text></view>
            </view>
            <text v-if="unlocked" class="agent-eligible-heading">{{ t.agent.eligible }}</text>
            <text class="agent-eligibility-note">{{ unlocked ? t.agent.budgetReviewHint : rankReady ? fmt(t.agent.previewOnly, { rank: requiredRankLabel }) : t.profile.rankUnavailable }}</text>
          </view>
          <view v-if="!unlocked" class="agent-cta agent-path" :style="pathCtaStyle" role="button" tabindex="0" @click="go('/pages/team/rank')" @keydown.enter.prevent="go('/pages/team/rank')" @keydown.space.prevent="go('/pages/team/rank')">
            <text>{{ t.agent.pathCta }}</text><text aria-hidden="true">→</text>
          </view>
        </view>

        <!-- buckets — transparent hairline rows -->
        <view :style="bucketsGroupStyle">
          <view
            v-for="(b, i) in BUCKETS"
            :key="b.id"
            class="flex items-start agent-bucket" :class="{ 'agent-bucket--selected': selectedBucketId === b.id }"
            :style="bucketRowStyle(i === BUCKETS.length - 1)"
            role="button"
            :tabindex="submitting || (remoteApiEnabled && pageReadState !== 'ready') ? -1 : 0"
            :aria-label="b.title"
            :aria-pressed="selectedBucketId === b.id"
            :aria-disabled="submitting || (remoteApiEnabled && pageReadState !== 'ready')"
            @click.capture="selectBucket(b)"
            @keydown.enter.prevent="selectBucket(b)"
            @keydown.space.prevent="selectBucket(b)"
          >
            <view class="grid place-items-center shrink-0" :style="bucketIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="b.tint" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in b.paths" :key="pi" :d="p" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <view class="flex items-center justify-between" style="gap: 6px; flex-wrap: wrap">
                <text :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ b.title }}</text>
                <text class="font-display tabular-nums" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ b.range }}</text>
              </view>
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '4px', lineHeight: 1.6 }">{{ b.rule }}</text>
            </view>
          </view>
        </view>
        <text v-if="selectedBucketTitle" class="block text-center" :style="selectedBucketStyle">{{ selectedBucketTitle }} · {{ t.agent.newApplication }}</text>

        <!-- The form stays on the floor; only its input controls have borders. -->
        <view :style="formBlockStyle">
          <text class="block font-mono-tabular" :style="formCapStyle">{{ t.agent.newApplication }}</text>
          <view style="display: flex; flex-direction: column; gap: 8px">
            <view :style="fieldStyle">
              <view class="flex items-center" style="gap: 6px; margin-bottom: 4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <text class="font-mono-tabular" :style="fieldLabelStyle">{{ t.agent.fieldEventDate }}</text>
              </view>
              <input
                v-model="date"
                :aria-label="t.agent.fieldEventDate"
                type="text"
                :disabled="!formReady || submitting"
                placeholder="YYYY-MM-DD"
                :style="inputStyle"
                placeholder-style="color: var(--v5-ink-2)"
              />
            </view>
            <view :style="fieldStyle">
              <view class="flex items-center" style="gap: 6px; margin-bottom: 4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
                <text class="font-mono-tabular" :style="fieldLabelStyle">{{ t.agent.fieldCity }}</text>
              </view>
              <input
                v-model="city"
                :aria-label="t.agent.fieldCity"
                type="text"
                :disabled="!formReady || submitting"
                :placeholder="t.agent.cityPlaceholder"
                :style="inputStyle"
                placeholder-style="color: var(--v5-ink-2)"
              />
            </view>
            <view :style="fieldStyle">
              <view class="flex items-center" style="gap: 6px; margin-bottom: 4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>
                <text class="font-mono-tabular" :style="fieldLabelStyle">{{ auditCopy.budgetLabel }}</text>
              </view>
              <view class="flex items-center agent-budget-control">
                <text class="font-display" :style="{ fontSize: '13px', color: 'var(--v5-ink-3)', marginRight: '12px' }">USDT</text>
                <input
                  v-model="budgetText"
                  :aria-label="auditCopy.budgetLabel"
                  type="text"
                  inputmode="decimal"
                  :disabled="!formReady || submitting"
                  :style="budgetInputStyle"
                />
              </view>
            </view>
          </view>

          <view class="agent-cta agent-submit" :style="submitStyle" role="button" :tabindex="formReady && !submitting ? 0 : -1" :aria-disabled="!formReady || submitting ? 'true' : 'false'" :aria-busy="submitting" @click="submit" @keydown.enter.prevent="submit" @keydown.space.prevent="submit">
            <text>{{ t.agent.submitForReview }}</text><text aria-hidden="true">{{ submitting ? '…' : '→' }}</text>
          </view>

          <view v-if="draft.touched" class="agent-cta" role="button" :tabindex="submitting || (remoteApiEnabled && pageReadState !== 'ready') ? -1 : 0" :aria-disabled="submitting || (remoteApiEnabled && pageReadState !== 'ready')" @click="discardDraft"><text>{{ logicCopy.discardDraft }}</text></view>
          <text v-if="!unlocked" class="block text-center" :style="previewOnlyStyle">{{ fmt(t.agent.previewOnly, { rank: requiredRankLabel }) }}</text>
        </view>

        <!-- approved cases — transparent hairline rows -->
        <view v-if="remoteApiEnabled && applications.length > 0" :style="casesBlockStyle">
          <text class="block font-mono-tabular" :style="approvedCapStyle">{{ t.agent.serverApplication }}</text>
          <view :style="casesGroupStyle">
            <view v-for="(application, index) in applications" :key="application.applicationId ?? index" :style="caseRowStyle(index === applications.length - 1)">
              <view class="agent-application-heading">
                <view>
                  <text class="block" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ application.city }} · {{ application.eventDate }}</text>
                </view>
                <text class="font-mono-tabular" :style="{ fontSize: '12px', color: applicationStatusColor(application) }">{{ applicationStatusText(application) }}</text>
              </view>
              <view class="agent-application-details">
                <text>{{ application.bucket ? t.agent.buckets[application.bucket].title : '—' }}</text>
                <text class="agent-application-budget">{{ t.agent.budgetRequested }} · {{ applicationBudget(application.budgetUsdt) }}</text>
                <text>{{ applicationIdLabel }} · {{ application.applicationId ?? '—' }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="!remoteApiEnabled" :style="casesBlockStyle">
          <text class="block font-mono-tabular" :style="approvedCapStyle">{{ t.agent.recentlyApproved }}</text>
          <view :style="casesGroupStyle">
            <view v-for="(c, i) in APPROVED_CASES" :key="i" :style="caseRowStyle(i === APPROVED_CASES.length - 1)">
              <view class="flex items-start justify-between">
                <view>
                  <text class="block" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ c.name }}</text>
                  <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ hostedByText(c) }}</text>
                </view>
                <text class="font-display tabular-nums" :style="{ fontSize: '15px', fontWeight: 600, color: 'var(--v5-ink)' }">${{ formatFinanceAmount(c.amount) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { teamLogicCopy } from "@/i18n/team-logic-copy";
import { ambassadorDraftCache, clearAmbassadorDraft, beginAmbassadorDraftSubmit, endAmbassadorDraftSubmit, type AmbassadorDraftForm } from "@/lib/ambassador-draft-session";
import { navTo } from "@/lib/route";
import { ref, shallowRef, computed, watch, type CSSProperties } from "vue";
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import TeamArt from "@/components/team/team-art.vue";
import TeamRankEmblem from "@/components/team/team-rank-emblem.vue";
import { useVRank } from "@/store/v-rank";
import { rankTitle, rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { useAuth } from '@/store/auth';
import { useApp } from "@/store/app";
import { ambassadorApplicationApi, apiRuntimeConfig, remoteApiEnabled } from "@/api/runtime";
import type { AmbassadorApplication, AmbassadorApplicationInput, AmbassadorPolicy,
  AmbassadorPolicyBucket } from "@/api/ambassador-application-api";
import { isAmbassadorApplicationPending } from "@/api/ambassador-application-api";
import { isSettledRejection } from "@/api/errors";
import { acquireAmbassadorCommandKey, finishAmbassadorCommand } from "@/lib/ambassador-command-key";
import {
  isCurrentTeamP31718Request,
  ambassadorSubmitErrorRecovery,
  parseAmbassadorApplicationDraft,
  successfulAmbassadorApplicationState,
  type AmbassadorAgentFormState,
  type TeamP31718Request,
} from "@/lib/team-p3-17-18-request-scope";

const t = useT();
const vrank = useVRank();
const locale = useLocaleStore();
const logicCopy = computed(() => teamLogicCopy(locale.code));
const auditCopy = computed(() => networkReauditCopy(locale.code));
const app = useApp();
const auth = useAuth();
const readEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const environmentCurrent = () => !environmentInvalidated && readEnvironment[0] === apiRuntimeConfig.environment && readEnvironment[1] === apiRuntimeConfig.baseUrl;

const myRank = computed(() => vrank.myRank);
const rankReady = computed(() => vrank.remoteReady);
const requiredRankLabel = computed(() => rankLabel(5, locale.code, vrank.ladder));
const unlocked = computed(() => rankReady.value && vrank.myRank >= 5);
const formReady = computed(() => (!remoteApiEnabled || pageReadState.value === 'ready') && unlocked.value);

interface Bucket {
  id: AmbassadorPolicyBucket["id"];
  title: string;
  range: string;
  rule: string;
  tint: string;
  paths: string[];
}
const BUCKET_VISUALS: Record<AmbassadorPolicyBucket["id"], Pick<Bucket, "tint" | "paths">> = {
  venue: { tint: "var(--v5-brand)", paths: ["M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z", "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2", "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2", "M10 6h4M10 10h4M10 14h4M10 18h4"] },
  kol: { tint: "var(--v5-tech-cyan)", paths: ["m3 11 18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"] },
  print: { tint: "var(--v5-warning)", paths: ["M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 9V2h12v7", "M6 14h12v8H6z"] },
  dev: { tint: "var(--v5-tech-cyan)", paths: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"] },
};
const policy = ref<AmbassadorPolicy | null>(null);
const pageReadState = ref<"loading" | "ready" | "error">(remoteApiEnabled ? "loading" : "ready");
// Bucket ids are a closed server enum (venue/kol/print/dev) but the policy rows
// carry only the operator's English title/rule. Resolve the visible name and
// rule from the locale dictionary; the server copy stays the fallback for any
// id a future release adds before its translation ships.
const BUCKETS = computed<Bucket[]>(() => (policy.value?.buckets ?? []).map((bucket) => {
  const copy = t.value.agent.buckets[bucket.id];
  return {
    id: bucket.id, title: copy?.title || bucket.title,
    range: `${formatFinanceAmount(bucket.minBudgetUsdt)}–${formatFinanceAmount(bucket.maxBudgetUsdt)} USDT`,
    rule: copy?.rule || bucket.rule,
    ...BUCKET_VISUALS[bucket.id],
  };
}));

interface ApprovedCase {
  name: string;
  host: string;
  amount: number;
  attendees: number;
}
const APPROVED_CASES: ApprovedCase[] = [
  { name: "Tokyo Web3 Summit", host: "Sarah K.", amount: 8500, attendees: 247 },
  { name: "Berlin DePIN Meetup", host: "Marina K.", amount: 3200, attendees: 142 },
  { name: "São Paulo AI Devcon", host: "Diego P.", amount: 6700, attendees: 198 },
];

const draft = shallowRef(ambassadorDraftCache.forAccount({ accountKey: app.accountKey, accountEpoch: app.accountBindingEpoch }));
function draftField<K extends keyof AmbassadorDraftForm>(key: K) {
  return computed({ get: () => draft.value.form[key], set: (value: AmbassadorDraftForm[K]) => {
    if (draft.value.pending || !agentMounted || (remoteApiEnabled && pageReadState.value !== "ready")) return;
    draft.value.form[key] = value;
    draft.value.touched = true;
  } });
}
const date = draftField('date');
const city = draftField('city');
const budgetText = draftField('budgetText');
const selectedBucketTitle = draftField('bucketTitle');
const selectedBucketId = draftField('bucketId');
const submitting = computed(() => draft.value.pending !== null);
const latestApplication = ref<AmbassadorApplication>({ applicationId: null, status: "NONE", city: null,
  eventDate: null, budgetUsdt: null, bucket: null, submittedAt: null, source: "server",
  sourceEnvironment: "PRODUCTION", runId: "" });
const applications = ref<AmbassadorApplication[]>([]);

const applicationStatusText = (application: AmbassadorApplication) => t.value.agent.applicationStatuses[application.status];
const applicationIdLabel = computed(() => locale.code === 'zh' ? '申请编号' : locale.code === 'vi' ? 'Mã đơn đề nghị' : 'Application ID');
// This is a submitted budget, not a two-decimal balance overview. Keep every
// accepted decimal from the contract, and never feed this display into commands.
function applicationBudget(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '— USDT';
  const [integer, fraction] = String(value).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : '.00'} USDT`;
}
const applicationStatusColor = (application: AmbassadorApplication) => ({
  NONE: 'var(--v5-ink-3)',
  PENDING: 'var(--v5-warning-ink)',
  APPROVED: 'var(--v5-success-ink)',
  REJECTED: 'var(--v5-danger)',
}[application.status]);

let agentMounted = true;
let agentRequestGeneration = 0;
function emptyApplication(): AmbassadorApplication {
  return { applicationId: null, status: "NONE", city: null, eventDate: null, budgetUsdt: null, bucket: null,
    submittedAt: null, source: "server", sourceEnvironment: "PRODUCTION", runId: "" };
}
function captureAgentRequest(): TeamP31718Request {
  return {
    accountKey: app.accountKey,
    accountEpoch: app.accountBindingEpoch,
    generation: agentRequestGeneration,
  };
}
function requestIsCurrent(request: TeamP31718Request): boolean {
  return (!remoteApiEnabled || auth.isAuthenticated) && environmentCurrent() && isCurrentTeamP31718Request(request, {
    mounted: agentMounted,
    accountKey: app.accountKey,
    accountEpoch: app.accountBindingEpoch,
    generation: agentRequestGeneration,
  });
}
function invalidateAgentRequests(): void {
  agentRequestGeneration += 1;
}
function clearAgentFormState(form: AmbassadorAgentFormState = {
  date: "", city: "", budgetText: "3000", bucketId: "", bucketTitle: "",
}): void {
  clearAmbassadorDraft(draft.value);
  Object.assign(draft.value.form, form);
}
function resetAgentPageState(): void {
  invalidateAgentRequests();
  pageReadState.value = remoteApiEnabled ? "loading" : "ready";
  latestApplication.value = emptyApplication();
  applications.value = [];
  policy.value = null;
}
function discardDraft(): void {
  if (submitting.value || !agentMounted || (remoteApiEnabled && pageReadState.value !== "ready")) return;
  clearAmbassadorDraft(draft.value, String(policy.value?.defaultBudgetUsdt ?? 3000));
}

const lockedSubText = computed(() =>
  fmt(t.value.agent.lockedSub, { n: rankReady.value ? vrank.myRank : "—", title: rankReady.value ? rankTitle(vrank.myRank, locale.code, vrank.ladder) : "—" }),
);
function hostedByText(c: ApprovedCase): string {
  return fmt(t.value.agent.hostedBy, { name: c.host, attendees: c.attendees });
}

function selectBucket(b: Bucket) {
  if (submitting.value || !agentMounted || (remoteApiEnabled && pageReadState.value !== "ready")) return;
  selectedBucketTitle.value = b.title;
  selectedBucketId.value = b.id as AmbassadorApplicationInput["bucket"];
}

function payloadIdentity(input: AmbassadorApplicationInput): string {
  return JSON.stringify([input.eventDate, input.city, input.budgetUsdt, input.bucket]);
}

async function refreshLatest(requestScope = captureAgentRequest()): Promise<AmbassadorApplication> {
  const value = await ambassadorApplicationApi.latest();
  if (requestIsCurrent(requestScope)) latestApplication.value = value;
  return value;
}

async function refreshHistory(requestScope = captureAgentRequest()): Promise<AmbassadorApplication[]> {
  const value = await ambassadorApplicationApi.history();
  if (requestIsCurrent(requestScope)) applications.value = value;
  return value;
}

async function submit() {
  if (submitting.value || !agentMounted || (remoteApiEnabled && pageReadState.value !== "ready")) return;
  if (!unlocked.value) {
    toast.error(t.value.agent.toastV5Required, fmt(t.value.agent.toastV5RequiredSub, { rank: requiredRankLabel.value }));
    return;
  }
  let parsedInput: AmbassadorApplicationInput | null;
  try {
    parsedInput = parseAmbassadorApplicationDraft({
      eventDate: date.value,
      city: city.value,
      budgetText: budgetText.value,
      bucket: selectedBucketId.value,
    });
  } catch {
    toast.error(t.value.agent.toastRemoteFailed, t.value.agent.submitUnconfirmedBody);
    return;
  }
  const input = parsedInput;
  if (!input) {
    toast.error(t.value.agent.invalidFormTitle, t.value.agent.invalidFormBody);
    return;
  }
  const activeBucket = policy.value?.buckets.find((bucket) => bucket.id === input.bucket);
  if (remoteApiEnabled && (!activeBucket || input.budgetUsdt < activeBucket.minBudgetUsdt
      || input.budgetUsdt > activeBucket.maxBudgetUsdt)) {
    toast.error(t.value.agent.invalidFormTitle, t.value.agent.invalidFormBody);
    return;
  }
  if (remoteApiEnabled) {
    if (submitting.value) return;
    const identity = payloadIdentity(input);
    // A page-load read may still be in flight. It must not replace this POST's
    // authoritative receipt when it settles later.
    invalidateAgentRequests();
    const requestScope = captureAgentRequest();
    let key: string;
    try {
      key = acquireAmbassadorCommandKey(requestScope.accountKey, identity);
    } catch {
      toast.error(t.value.agent.toastRemoteFailed, t.value.agent.submitUnconfirmedBody);
      return;
    }
    const submittedDraft = draft.value;
    const submitToken = beginAmbassadorDraftSubmit(submittedDraft);
    if (!submitToken) return;
    try {
      const result = await ambassadorApplicationApi.submit(input, key);
      // A successful command can settle the same account's cached draft while
      // hidden/unloaded. Page reads/receipts still require the full request fence.
      if (requestScope.accountKey !== app.accountKey || requestScope.accountEpoch !== app.accountBindingEpoch) return;
      finishAmbassadorCommand(requestScope.accountKey, identity);
      endAmbassadorDraftSubmit(submittedDraft, submitToken, true);
      if (!requestIsCurrent(requestScope)) {
        if (agentMounted) { invalidateAgentRequests(); refreshAgentPage(); }
        return;
      }
      latestApplication.value = result;
      void refreshHistory(requestScope).catch(() => undefined);
    } catch (error) {
      if (!requestIsCurrent(requestScope)) return;
      const pending = isAmbassadorApplicationPending(error);
      const recovery = ambassadorSubmitErrorRecovery(pending || isSettledRejection(error));
      try {
        if (pending) await refreshHistory(requestScope);
        else if (recovery.refreshLatestForDisplay) await refreshLatest(requestScope);
        if (!requestIsCurrent(requestScope)) return;
      } catch {
        if (!requestIsCurrent(requestScope)) return;
      }
      if (!requestIsCurrent(requestScope)) return;
      if (recovery.finishCommand) finishAmbassadorCommand(requestScope.accountKey, identity);
      toast.error(pending ? t.value.agent.pendingApplicationTitle : t.value.agent.toastRemoteFailed,
        pending ? t.value.agent.pendingApplicationBody : t.value.agent.submitUnconfirmedBody);
      return;
    } finally {
      endAmbassadorDraftSubmit(submittedDraft, submitToken);
    }
  }
  toast.success(
    t.value.agent.toastSubmitted,
    fmt(t.value.agent.toastSubmittedSub.replace('${budget}', '{budget}'), { city: input.city, budget: applicationBudget(input.budgetUsdt) }),
  );
  const settled = successfulAmbassadorApplicationState(latestApplication.value);
  latestApplication.value = settled.receipt;
  clearAgentFormState(settled.form);
}

function refreshAgentPage(): void {
  if (!remoteApiEnabled || !agentMounted || !auth.isAuthenticated || !environmentCurrent()) return;
  invalidateAgentRequests();
  const requestScope = captureAgentRequest();
  pageReadState.value = "loading";
  // 🔴 本页的契约是三条大使读取(policy / latest / history),**不是**等级阶梯(zentao #204)。
  // 此前就绪判据写成 `vrank.remoteReady && policy.value`,而等级读挂在另一个端点、另一份契约上:
  // 那边一有风吹草动(响应缺字段、契约漂移、服务端尚未部署),整页就报「无法读取大使信息」——
  // 预算规则、活动类型、申请记录全都读到了也照样不显示,而且重试永远复现,因为重试跑的是同一组读。
  // 现在:三条大使读取成功即就绪;等级失败只降级「资格横幅」(unlocked 仍要求 rankReady,
  // rankReady=false 时渲染未知态),不再吃掉整页。
  void Promise.all([
    refreshLatest(requestScope),
    refreshHistory(requestScope),
    ambassadorApplicationApi.policy().then((value) => {
      if (!requestIsCurrent(requestScope)) return;
      policy.value = value;
      if (!draft.value.touched && !submitting.value) draft.value.form.budgetText = String(value.defaultBudgetUsdt);
      // Preserve an edited/removed selection for validation against the new
      // policy; never silently replace a user's budget or selected category.
      const bucket = value.buckets.find(row => row.id === selectedBucketId.value);
      if (bucket) draft.value.form.bucketTitle = t.value.agent.buckets[bucket.id]?.title || bucket.title;
    }),
    // 等级读单独吞掉自己的失败:它只喂资格横幅(rankReady/unlocked),失败由 store 记进
    // remoteError、由横幅渲染未知态。挂在这里是为了让「等级不是本页的就绪前提」成为本页
    // 自己的显式契约,而不是依赖 store 恰好不 rethrow 这个内部细节。
    vrank.refreshCanonicalVRank().catch(() => undefined),
  ]).then(() => {
    if (requestIsCurrent(requestScope)) pageReadState.value = policy.value ? "ready" : "error";
  }).catch(() => {
    if (requestIsCurrent(requestScope)) {
      invalidateAgentRequests();
      policy.value = null; applications.value = []; latestApplication.value = emptyApplication(); pageReadState.value = "error";
    }
  });
}

function retryAgentPage(): void {
  resetAgentPageState();
  refreshAgentPage();
}

watch([() => app.accountKey, () => app.accountBindingEpoch, () => auth.isAuthenticated, () => locale.code, () => apiRuntimeConfig.environment, () => apiRuntimeConfig.baseUrl], () => {
  draft.value = ambassadorDraftCache.forAccount({ accountKey: app.accountKey, accountEpoch: app.accountBindingEpoch });
  resetAgentPageState();
  if (agentMounted) refreshAgentPage();
}, { flush: "sync" });

onShow(() => {
  draft.value = ambassadorDraftCache.forAccount({ accountKey: app.accountKey, accountEpoch: app.accountBindingEpoch });
  agentMounted = true;
  invalidateAgentRequests();
  refreshAgentPage();
});

onHide(() => {
  agentMounted = false;
  invalidateAgentRequests();
  pageReadState.value = remoteApiEnabled ? "loading" : "ready";
});

onUnload(() => {
  agentMounted = false;
  resetAgentPageState();
});

function go(url: string) {
  navTo(url);
}

// Rules and records stay flat; eligibility and input controls have distinct boundaries.
const pathCtaStyle: CSSProperties = { color: "var(--v5-ink)" };
const bucketsGroupStyle: CSSProperties = { borderTop: "1px solid var(--v5-border)" };
function bucketRowStyle(isLast: boolean): CSSProperties {
  return { padding: "18px 0", gap: "12px", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
const selectedBucketStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.5 };
const bucketIconStyle: CSSProperties = { width: "32px", height: "32px" };
const formBlockStyle: CSSProperties = { paddingTop: "8px" };
const formCapStyle: CSSProperties = { fontSize: "17px", fontWeight: 600, color: "var(--v5-ink)", marginBottom: "12px" };
const fieldStyle: CSSProperties = { padding: "8px 0" };
const fieldLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const inputStyle: CSSProperties = { width: "100%", minHeight: "44px", padding: "0 12px", boxSizing: "border-box", border: "1px solid var(--v5-border)", borderRadius: "10px", background: "transparent", fontSize: "var(--ui-type-input)",
  lineHeight: "var(--ui-type-input-lh)", color: "var(--v5-ink)" };
const budgetInputStyle: CSSProperties = { flex: "1", minWidth: 0, minHeight: "44px", background: "transparent", fontSize: "var(--ui-type-input)",
  lineHeight: "var(--ui-type-input-lh)", color: "var(--v5-ink)", fontFamily: "var(--font-v5)" };
const submitStyle = computed<CSSProperties>(() => ({
  marginTop: "24px", opacity: (pageReadState.value === 'loading' || (!rankReady.value && !vrank.remoteError)) && !submitting.value ? 1 : formReady.value && !submitting.value ? 1 : 0.45,
}));
const previewOnlyStyle: CSSProperties = { marginTop: "12px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };
const casesBlockStyle: CSSProperties = { paddingTop: "8px" };
const approvedCapStyle: CSSProperties = { marginBottom: "16px", fontSize: "17px", fontWeight: 600, color: "var(--v5-ink)" };
const casesGroupStyle: CSSProperties = { borderTop: "1px solid var(--v5-border)" };
function caseRowStyle(isLast: boolean): CSSProperties {
  return { padding: "16px 0", borderBottom: isLast ? "none" : "1px solid var(--v5-border)", overflowWrap: "anywhere" };
}
</script>

<style scoped>
.agent-application-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
.agent-application-heading > view { min-width: 0; overflow-wrap: anywhere; }
.agent-application-details { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-3); overflow-wrap: anywhere; }
.agent-application-budget { color: var(--v5-ink-2); font-variant-numeric: tabular-nums; }
.agent-content { display: flex; flex-direction: column; gap: 24px; padding: var(--ui-space-inset) 20px 24px; }
.agent-hero { display: flex; align-items: center; gap: var(--ui-space-inline); }
.agent-hero-copy { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.agent-eyebrow { display: block; font-size: 12px; color: var(--v5-ink-3); line-height: 1.5; }
.agent-headline { display: block; font-size: 25px; font-weight: 600; line-height: 1.3; margin-top: 8px; }
.agent-intro { display: block; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2); line-height: 1.7; margin-top: -12px; }
.agent-eligibility { display: grid; grid-template-columns:52px minmax(0,1fr); align-items: center; gap: var(--ui-space-inline); padding: var(--ui-space-inset); border: 1px solid var(--v5-border); border-radius: 20px; background: color-mix(in srgb, var(--v5-ink) 4%, var(--v5-bg)); }
.agent-eligibility-copy { min-width: 0; overflow-wrap: break-word; }
.agent-rank-summary { display: flex; flex-wrap: wrap; gap: var(--ui-space-inline) 20px; font-size: 14px; margin-bottom: 8px; }
.agent-rank-label { display: block; font-size: 11px; line-height: 1.5; color: var(--v5-ink-3); margin-bottom: 4px; }
.agent-budget-control { padding: 0 12px; border: 1px solid var(--v5-border); border-radius: 10px; }
.agent-eligible-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; font-weight: 600; }
.agent-eligibility-note { display: block; font-size: 12px; line-height: 1.6; color: var(--v5-ink-3); margin-top: 6px; }
.agent-cta { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); min-height: 48px; padding: var(--ui-space-inline) 20px; box-sizing: border-box; border: 1px solid var(--v5-border); border-radius: 999px; background: color-mix(in srgb, var(--v5-ink) 6%, transparent); color: var(--v5-ink); font-size: 14px; font-weight: 500; }
.agent-retry { margin-top: var(--ui-space-section); }
.agent-path { grid-column:1/-1; justify-self:stretch; padding: var(--ui-space-row-y) 14px; min-height: 44px; font-size: 12px; }
.agent-bucket { position: relative; }
.agent-bucket--selected::before { content: ""; position: absolute; left: -10px; top: 18px; bottom: 18px; width: 2px; background: var(--v5-brand); }
.agent-submit[aria-disabled="true"] { cursor: default; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 380px) { .agent-content { padding-left: 16px; padding-right: 16px; } .agent-headline { font-size: 22px; } .agent-hero :deep(.team-art) { width: 88px !important; height: 88px !important; }  }
</style>
