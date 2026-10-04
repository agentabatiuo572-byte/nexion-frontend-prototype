<!--
  Developer Hub — ported from Nexion-prototype/app/(main)/developer/page.tsx.

  Hero + 4-tab segmented control (Overview / Docs / API keys / Webhooks).
  Overview: 4 API cards + partner grid + request-access form (3 inputs +
  submit → toast). Docs/keys/webhooks: empty/preview states.

  Wrapped in <AppChassis active="me"> (reached from /me). SetPageHeader
  backHref="/me" → SubPageHeader back="/pages/me/me". SegmentedControl →
  inline pill tabs (mirrors earn.vue PillTabs). Banned hex from source
  (#3DA9FF accent, #0F0F0F gradient stop) → var(--v5-tech-cyan) + surface
  tokens. lucide → inline <svg>.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)" class="pb-2">
      <SubPageHeader back="/pages/me/me" />

      <!-- Hero -->
      <view class="nx-glass-card mx-4 border rounded-2xl relative overflow-hidden" :style="heroStyle">
        <view class="absolute grid place-items-center" :style="heroIconBoxStyle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>
        </view>
        <text class="block" style="font-size: 12px; letter-spacing: 0.18em; color: var(--v5-tech-cyan)">{{ t.developer.headline }}</text>
        <text class="block" :style="heroTaglineStyle">{{ t.developer.tagline }}</text>
        <view v-if="!remoteApiEnabled" class="mt-4 flex flex-wrap" style="gap: 6px">
          <text class="block" :style="badgeStyle">{{ t.developer.badgeEnterprise }}</text>
          <text class="block" :style="badgeStyle">{{ t.developer.badgeUptime }}</text>
          <text class="block" :style="badgeStyle">{{ t.developer.badgeAuth }}</text>
        </view>
      </view>

      <!-- Tabs — SegmentedControl (HIG 44pt, accent = tech-cyan) -->
      <view class="mx-4 mt-3">
        <GlassSegments :label="t.developer.headline" v-model="tab" :options="tabOptions"  />
      </view>

      <!-- Overview -->
      <template v-if="tab === 'overview'">
        <view v-if="remoteApiEnabled" class="mx-4 mt-3 rounded-xl" :style="requestStatusStyle">
          <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.capabilityRoadmap }}</text>
        </view>
        <view class="mx-4 mt-3" :style="apiListStyle">
          <view v-for="(c, i) in apiCards" :key="c.title" class="flex items-start" :style="apiRowStyle(i === apiCards.length - 1)">
            <view class="grid place-items-center shrink-0" :style="apiIconBoxStyle(c.color)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="c.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in c.icon" :key="di" :d="d" /><template v-for="(r, ri) in (c.rects || [])" :key="`r${ri}`"><rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" :rx="r.rx" /></template><template v-for="(e, ei) in (c.ellipses || [])" :key="`e${ei}`"><ellipse :cx="e.cx" :cy="e.cy" :rx="e.rx" :ry="e.ry" /></template><template v-for="(ln, li) in (c.lines || [])" :key="`l${li}`"><line :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2" /></template></svg>
            </view>
            <view class="flex-1">
              <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ c.title }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px; line-height: 1.625">{{ c.desc }}</text>
            </view>
          </view>
        </view>

        <!-- Partners -->
        <view v-if="!remoteApiEnabled" class="mx-4 mt-4">
          <text class="block" :style="partnerTitleStyle">{{ t.developer.partners }}</text>
          <view class="nx-glass-card rounded-2xl grid" :style="partnerGridStyle">
            <view v-for="p in PARTNERS" :key="p.id" class="grid place-items-center" :style="partnerCellStyle">
              <text style="font-size: 12px; color: var(--v5-ink-3); font-weight: 500">{{ p.label }}</text>
            </view>
          </view>
        </view>

        <!-- Request access form -->
        <view class="nx-glass-card mx-4 mt-4 mb-6 rounded-2xl" :style="formCardStyle">
          <view class="flex items-center" style="gap: 8px; margin-bottom: 4px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.developer.requestAccess }}</text>
          </view>
          <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.developer.requestAccessHint }}</text>
          <view v-if="remoteApiEnabled && latestRequest" class="nx-glass-inset rounded-xl" :style="requestStatusStyle">
            <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-tech-cyan)">{{ latestRequest.requestNo }} · {{ latestRequestStatusLabel }}</text>
            <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ new Date(latestRequest.submittedAt).toLocaleString(dateLocale()) }}</text>
            <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ latestRequestStatusDetail }}</text>
            <text v-if="requestReviewReason" class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ developerCopy[requestReviewReason] }}</text>
          </view>
          <view v-if="remoteApiEnabled && latestLoadFailed" class="nx-glass-inset rounded-xl" :style="requestStatusStyle">
            <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.latestLoadFailed }}</text>
            <view role="button" tabindex="0" :aria-label="t.network.retry" style="min-height: 44px; display: grid; place-items: center; margin-top: 6px" @click="loadLatestRequest"><text>{{ t.network.retry }}</text></view>
          </view>
          <view v-if="canSubmitAccessRequest" class="space-y-2">
            <input v-model="company" :maxlength="120" :placeholder="t.developer.formCompany" :style="formInputStyle" placeholder-class="nx-dev-ph"
              :aria-label="t.developer.formCompany" :aria-invalid="accessIssue === ISSUE_COMPANY ? 'true' : 'false'"
              :aria-describedby="accessIssue === ISSUE_COMPANY ? 'dev-company-error' : undefined" />
            <text v-if="accessIssue === ISSUE_COMPANY" id="dev-company-error" class="block" :style="fieldErrorStyle" role="alert">{{ t.developer.companyInvalid }}</text>
            <input v-model="email" type="email" :maxlength="254" :placeholder="t.developer.formEmail" :style="formInputStyle" placeholder-class="nx-dev-ph"
              :aria-label="t.developer.formEmail" :aria-invalid="accessIssue === ISSUE_EMAIL ? 'true' : 'false'"
              :aria-describedby="accessIssue === ISSUE_EMAIL ? 'dev-email-error' : undefined" />
            <text v-if="accessIssue === ISSUE_EMAIL" id="dev-email-error" class="block" :style="fieldErrorStyle" role="alert">{{ t.developer.emailInvalid }}</text>
            <textarea v-model="useCase" :maxlength="2000" :placeholder="t.developer.formUseCasePlaceholder" :style="formTextareaStyle" placeholder-class="nx-dev-ph"
              :aria-label="t.developer.formUseCase" :aria-invalid="accessIssue === ISSUE_USE_CASE ? 'true' : 'false'"
              :aria-describedby="accessIssue === ISSUE_USE_CASE ? 'dev-usecase-error' : undefined" />
            <text v-if="accessIssue === ISSUE_USE_CASE" id="dev-usecase-error" class="block" :style="fieldErrorStyle" role="alert">{{ t.developer.useCaseInvalid }}</text>
          </view>
          <view v-if="canSubmitAccessRequest" class="mt-3 rounded-xl flex items-center justify-center active:opacity-85" :style="submitBtnStyle" role="button" tabindex="0" :aria-label="t.developer.formSubmit" :aria-busy="submitting ? 'true' : 'false'" @click="submitRequest">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-on-brand)">{{ submitting ? "…" : t.developer.formSubmit }}</text>
          </view>
        </view>
      </template>

      <!-- Docs -->
      <view v-else-if="tab === 'docs'" class="mx-4 mt-3 mb-6">
        <view class="nx-glass-card rounded-2xl" :style="formCardStyle">
          <view class="flex items-center" style="gap: 8px; margin-bottom: 8px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.developer.docsPreview }}</text>
          </view>
          <view v-if="remoteApiEnabled && docsNotReleased" class="rounded-xl" :style="docsComingStyle"><text style="font-size: 12px; color: color-mix(in srgb, var(--v5-warning) 90%, transparent)">{{ t.developer.docsTabComing }}</text></view>
          <view v-else-if="remoteApiEnabled && docsLoadFailed" class="rounded-xl" :style="requestStatusStyle" role="button" tabindex="0" :aria-label="t.network.retry" @click="loadDocs"><text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.resourceLoadFailed }}</text><text class="block" style="font-size: 12px; margin-top: 6px">{{ t.network.retry }}</text></view>
          <template v-else-if="!remoteApiEnabled || docs">
            <view v-if="docs" class="rounded-lg" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-tech-cyan)">{{ docs.version }} · {{ docs.locale }}</text><text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ fmt(t.developer.docsCounts, { endpoints: docs.endpoints.length, events: docs.events.length }) }}</text></view>
            <scroll-view scroll-x :style="snippetWrapStyle"><text class="font-mono-tabular" :style="snippetTextStyle">{{ docsSnippet }}</text></scroll-view>
            <view v-if="docs" class="mt-3 rounded-lg" :style="requestStatusStyle">
              <view v-for="(endpoint, index) in docs.endpoints" :key="`${endpoint.method}:${endpoint.path}:${index}`" style="padding: 6px 0; overflow-wrap: anywhere">
                <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-tech-cyan)">{{ endpoint.method }}</text>
                <text class="font-mono-tabular" style="margin-left: 8px; font-size: 12px">{{ endpoint.path }}</text>
              </view>
            </view>
            <view v-if="!remoteApiEnabled" class="mt-3 rounded-lg" :style="docsComingStyle"><text style="font-size: 12px; color: color-mix(in srgb, var(--v5-warning) 90%, transparent)">{{ t.developer.docsTabComing }}</text></view>
            <view v-if="docs" class="mt-3 rounded-lg" :style="requestStatusStyle"><text class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.developer.docsEvents, { events: docs.events.join(" · ") }) }}</text></view>
          </template>
        </view>
      </view>

      <!-- API keys -->
      <view v-else-if="tab === 'keys'" class="mx-4 mt-3 mb-6">
        <view class="rounded-2xl" :style="formCardStyle">
          <view v-if="!remoteApiEnabled" class="rounded-xl" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.remoteRequired }}</text></view>
          <view v-else>
            <view v-if="resourcesApprovalRequired" class="rounded-xl" :style="requestStatusStyle">
              <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.approvalRequired }}</text>
              <view role="button" tabindex="0" :aria-label="t.developer.requestAccess" style="min-height: 44px; display: grid; place-items: center" @click="tab = 'overview'"  @keydown.enter.prevent="tab = 'overview'" @keydown.space.prevent="tab = 'overview'"><text>{{ t.developer.requestAccess }}</text></view>
            </view>
            <view v-if="resourcesNotReleased" class="rounded-xl" :style="requestStatusStyle">
              <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.apiCapabilityUnavailable }}</text>
            </view>
            <view v-else-if="resourcesLoadFailed" class="rounded-xl" :style="requestStatusStyle">
              <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.resourceLoadFailed }}</text>
              <view role="button" tabindex="0" :aria-label="t.network.retry" style="min-height: 44px; display: grid; place-items: center; margin-top: 6px" @click="retryLoadResources"><text>{{ t.network.retry }}</text></view>
            </view>
            <view v-for="item in (canManageResources ? apiKeys : [])" :key="item.id" class="flex items-center" :style="resourceRowStyle">
              <view class="flex-1"><text class="block" style="font-size: 13px; font-weight: 600">{{ item.name }}</text><text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 3px">{{ item.prefix }}••••{{ item.last4 }} · {{ item.status }}</text></view>
              <view v-if="item.status === 'ACTIVE'" class="rounded-lg" :style="resourceActionStyle(dangerBtnStyle, `revoke-key:${item.id}`)" role="button" tabindex="0" @click="revokeApiKey(item.id)"><text style="font-size: 12px">{{ t.developer.revoke }}</text></view>
            </view>
            <view v-if="!resourcesNotReleased" class="mt-3 rounded-xl" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.apiCapabilityUnavailable }}</text></view>
            <view v-if="resourcesReady && !apiKeys.length" class="mt-3 rounded-xl" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.developer.keysEmpty }}</text></view>
          </view>
        </view>
      </view>

      <!-- Webhooks -->
      <view v-else class="mx-4 mt-3 mb-6">
        <view class="rounded-2xl" :style="formCardStyle">
          <view v-if="!remoteApiEnabled" class="rounded-xl" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.remoteRequired }}</text></view>
          <view v-else>
            <view v-if="resourcesApprovalRequired" class="rounded-xl" :style="requestStatusStyle">
              <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.approvalRequired }}</text>
              <view role="button" tabindex="0" :aria-label="t.developer.requestAccess" style="min-height: 44px; display: grid; place-items: center" @click="tab = 'overview'"  @keydown.enter.prevent="tab = 'overview'" @keydown.space.prevent="tab = 'overview'"><text>{{ t.developer.requestAccess }}</text></view>
            </view>
            <view v-if="resourcesNotReleased" class="rounded-xl" :style="requestStatusStyle">
              <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.apiCapabilityUnavailable }}</text>
            </view>
            <view v-else-if="resourcesLoadFailed" class="rounded-xl" :style="requestStatusStyle">
              <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.resourceLoadFailed }}</text>
              <view role="button" tabindex="0" :aria-label="t.network.retry" style="min-height: 44px; display: grid; place-items: center; margin-top: 6px" @click="retryLoadResources"><text>{{ t.network.retry }}</text></view>
            </view>
            <view v-for="item in (canManageResources ? webhooks : [])" :key="item.id" :style="resourceRowStyle">
              <view class="flex items-center">
                <view class="flex-1"><text class="block" style="font-size: 13px; font-weight: 600">{{ item.name }}</text><text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 3px">{{ item.url }} · {{ item.deliveryStatus }}</text></view>
                <view v-if="item.status !== 'DELETED'" class="flex" style="gap: 5px; flex-wrap: wrap; justify-content: flex-end"><view class="rounded-lg" :style="resourceActionStyle(smallActionBtnStyle, `toggle-webhook:${item.id}`)" role="button" tabindex="0" @click="setWebhookEnabled(item, item.status !== 'ACTIVE')"><text style="font-size: 12px">{{ item.status === 'ACTIVE' ? t.developer.disable : t.developer.enable }}</text></view><view class="rounded-lg" :style="resourceActionStyle(smallActionBtnStyle, `deliveries-webhook:${item.id}`)" role="button" tabindex="0" @click="loadWebhookDeliveries(item)"><text style="font-size: 12px">{{ t.developer.deliveryAttempts }}</text></view><view class="rounded-lg" :style="resourceActionStyle(smallActionBtnStyle, `rotate-webhook:${item.id}`)" role="button" tabindex="0" @click="rotateWebhook(item)"><text style="font-size: 12px">{{ t.developer.rotate }}</text></view><view class="rounded-lg" :style="resourceActionStyle(dangerBtnStyle, `delete-webhook:${item.id}`)" role="button" tabindex="0" @click="deleteWebhook(item.id)"><text style="font-size: 12px">{{ t.developer.delete }}</text></view></view>
              </view>
              <view v-if="rotationRecovery[item.id]" class="mt-2 rounded-xl" :style="requestStatusStyle"><text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.rotationUnknownWarning }}</text></view>
              <view v-if="webhookDeliveries[item.id]?.length" class="mt-2 rounded-xl" :style="requestStatusStyle">
                <view v-for="delivery in webhookDeliveries[item.id]" :key="delivery.id" class="flex items-center" style="gap: 6px; padding: 4px 0"><text class="flex-1 block" style="font-size: 12px; color: var(--v5-ink-3)">{{ delivery.eventType }} · {{ delivery.status }} · {{ delivery.attemptCount }}/{{ delivery.maxAttempts }}</text><text v-if="delivery.lastStatusCode" style="font-size: 12px; color: var(--v5-ink-3)">{{ delivery.lastStatusCode }}</text><text v-if="delivery.lastError" style="font-size: 12px; color: var(--v5-warning)">{{ deliveryFailureLabel(delivery.lastError) }}</text></view>
              </view>
              <view v-else-if="webhookDeliveries[item.id]" class="mt-2 rounded-xl" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.developer.deliveryEmpty }}</text></view>
            </view>
            <view v-if="resourcesReady && !webhooks.length" class="rounded-xl" :style="requestStatusStyle"><text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.developer.webhooksEmpty }}</text></view>
            <template v-if="canManageResources">
            <input v-model="webhookName" :maxlength="100" :placeholder="t.developer.webhookName" :aria-label="t.developer.webhookName" :style="formInputStyle" placeholder-class="nx-dev-ph" />
            <input v-model="webhookUrl" :maxlength="-1" :placeholder="t.developer.webhookUrl" :aria-label="t.developer.webhookUrl" :style="formInputStyle" placeholder-class="nx-dev-ph" />
            <input v-model="webhookEvents" :maxlength="-1" :placeholder="t.developer.webhookEvents" :aria-label="t.developer.webhookEvents" :style="formInputStyle" placeholder-class="nx-dev-ph" />
            <view class="mt-3 rounded-xl flex items-center justify-center active:opacity-85" :style="resourceActionStyle(submitBtnStyle, 'create-webhook')" role="button" tabindex="0" @click="createWebhook"><text style="font-size: 13px; font-weight: 600; color: var(--v5-on-brand)">{{ t.developer.webhooksAdd }}</text></view>
            </template>
            <view v-if="newWebhookSecret && canManageResources" class="mt-3 rounded-xl" :style="requestStatusStyle"><text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.secretOnce }}</text><text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-tech-cyan); margin-top: 5px; word-break: break-all">{{ newWebhookSecret }}</text><text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 5px">{{ t.developer.deliveryDisabled }}</text></view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { confirm, toast, useUI } from "@/store/ui";
import { developerAccessApi, developerResourcesApi, remoteApiEnabled, apiClient, expectedApiEnvironment } from "@/api/runtime";
import type { DeveloperAccessReceipt } from "@/api/developer-access-api";
import type { DeveloperApiKey, DeveloperWebhook, DeveloperWebhookDelivery } from "@/api/developer-resources-api";
import { useApp } from "@/store/app";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { createDeveloperResourceFenceReader, type DeveloperResourceFence } from "./developer-resource-fence";
import { runConfirmedDeveloperMutation } from "./developer-resource-confirmation";
import { createDeveloperDocsFenceReader, type DeveloperDocsFence } from "./developer-docs-fence";
import { isApiKeyRevoked, isWebhookDeleted, isWebhookEnabled, readDeveloperResourceSnapshot } from "./developer-resource-reconciliation";
import { createDeveloperRotationJournal, developerRotationUniStorage, type DeveloperRotationRecoveryState } from "./developer-rotation-journal";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision } from "@/api/order-api";

import { createDeveloperDocsApi, type DeveloperDocs } from "@/api/developer-docs-api";
import { useLocaleStore } from "@/store/locale";
import { validateDeveloperAccess, validateDeveloperWebhook, type DeveloperFormIssue } from "./developer-form-validation";
import { developerAccessReviewReasonKey, developerAccessState, isDeveloperApprovalRequired, isDeveloperCapabilityUnavailable, isDeveloperDocsNotReleased, type DeveloperAccessCopyKey } from "./developer-access-state";

type Tab = "overview" | "docs" | "keys" | "webhooks";

const t = useT();
const app = useApp();
const locale = useLocaleStore();
const docsApi = createDeveloperDocsApi(apiClient, expectedApiEnvironment);
const docs = ref<DeveloperDocs | null>(null);
const docsLoadFailed = ref(false);
const docsNotReleased = ref(false);
const tab = ref<Tab>("overview");
const company = ref("");
const email = ref("");
const useCase = ref("");
// 就地校验态:只存「哪一个字段不合法」,让每个字段各自挂 aria-invalid/aria-describedby。
// 此前校验只在提交时弹 toast,读屏既定位不到出错字段,也读不到原因(BUG 105)。
//
// 三个 issue 码提成常量(而不是把 'companyInvalid' 直接写进模板三元):门的
// aria-describedby 判据会把绑定表达式里的**所有**单引号字面量当成 id 引用,
// 写进模板的 'companyInvalid' 会被判成悬空 id。常量比对后表达式里只剩一个
// id 字面量,与 login.vue / register.vue 的既有写法同形。
const ISSUE_COMPANY = "companyInvalid";
const ISSUE_EMAIL = "emailInvalid";
const ISSUE_USE_CASE = "useCaseInvalid";
const accessIssue = ref<DeveloperFormIssue | null>(null);
const submitting = ref(false);
const latestRequest = ref<DeveloperAccessReceipt | null>(null);
const latestLoadFailed = ref(false);
const apiKeys = ref<DeveloperApiKey[]>([]);
const webhooks = ref<DeveloperWebhook[]>([]);
const webhookDeliveries = ref<Record<number, DeveloperWebhookDelivery[]>>({});
const resourcesLoading = ref(false);
const resourcesReady = ref(false);
const resourcesLoadFailed = ref(false);
const resourcesApprovalRequired = ref(false);
const resourcesNotReleased = ref(false);
const canManageResources = computed(() => resourcesReady.value && !resourcesLoading.value && !resourcesApprovalRequired.value && !resourcesNotReleased.value);
const resourceBusyKeys = ref(new Set<string>());
const resourceIntentKeys = new Map<string, string>();
const webhookName = ref("");
const webhookUrl = ref("");
const webhookEvents = ref("order.updated");
const newWebhookSecret = ref<string | null>(null);
let requestKey: string | null = null;
let requestGeneration = 0;
let resourceGeneration = 0;
let resourceReadVersion = 0;
let docsGeneration = 0;
let confirmationSequence = 0;
const developerConfirmOwners = new Set<string>();
const resourceFenceReader = createDeveloperResourceFenceReader(() => String(app.accountKey), () => resourceGeneration);
const docsFenceReader = createDeveloperDocsFenceReader(() => String(app.accountKey), () => locale.code, () => docsGeneration);
const rotationRecovery = ref<Record<number, DeveloperRotationRecoveryState>>({});
const rotationStorageUnavailable = ref(false);
const rotationJournal = createDeveloperRotationJournal(
  developerRotationUniStorage,
  () => `${expectedApiEnvironment.toUpperCase()}:${String(app.accountKey)}`,
);
const requestState = computed(() => developerAccessState(latestRequest.value));
const requestReviewReason = computed(() => developerAccessReviewReasonKey(latestRequest.value));
const canSubmitAccessRequest = computed(() => requestState.value?.canReapply ?? true);
const developerCopy = computed(() => t.value.developer as unknown as Record<DeveloperAccessCopyKey, string>);
const latestRequestStatusLabel = computed(() => requestState.value ? developerCopy.value[requestState.value.label] : "");
const latestRequestStatusDetail = computed(() => requestState.value ? developerCopy.value[requestState.value.detail] : "");

const tabOptions = computed(() => [
  { value: "overview" as Tab, label: t.value.developer.apiOverviewTab },
  { value: "docs" as Tab, label: t.value.developer.docsTab },
  { value: "keys" as Tab, label: t.value.developer.keysTab },
  { value: "webhooks" as Tab, label: t.value.developer.webhooksTab },
]);
/** tablist 的左右方向键:移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。 */
function moveTab(index: number, delta: number): void {
  const options = tabOptions.value;
  const next = options[(index + delta + options.length) % options.length];
  if (!next || next.value === tab.value) return;
  tab.value = next.value;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-dev-tab[tabindex="0"]')?.focus();
  });
}

const PARTNERS = [
  { id: "aws", label: "AWS" },
  { id: "gcp", label: "Google Cloud" },
  { id: "az", label: "Azure" },
  { id: "tf", label: "Terraform" },
  { id: "k8s", label: "Kubernetes" },
  { id: "grafana", label: "Grafana" },
  { id: "slack", label: "Slack" },
  { id: "pd", label: "PagerDuty" },
];

const MOCK_API_SNIPPET = `POST /v1/inference/dispatch HTTP/1.1
Host: api.nexgrid.ai
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxx
Content-Type: application/json
X-NexGrid-Signature: t=1747432411,v1=2fae...

{
  "model": "flux-1.dev",
  "input": {
    "prompt": "neon cyberpunk city",
    "steps": 30
  },
  "max_tokens": 2048,
  "webhook": "https://your.app/cb"
}

→ 200 OK
{
  "job_id": "ig_2026A78214",
  "status": "queued",
  "eta_seconds": 4,
  "node": "sg-pool-09"
}`;
const docsSnippet = computed(() => {
  if (remoteApiEnabled) return docs.value ? `${docs.value.example.request}\n\n→ ${docs.value.example.response}` : "";
  return MOCK_API_SNIPPET;
});

// API cards — lucide icons inlined as path/rect/ellipse/line arrays.
interface ApiCardDef {
  title: string;
  desc: string;
  color: string;
  icon: string[];
  rects?: Array<{ x: number; y: number; w: number; h: number; rx: number }>;
  ellipses?: Array<{ cx: number; cy: number; rx: number; ry: number }>;
  lines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}
const apiCards = computed<ApiCardDef[]>(() => [
  {
    title: t.value.developer.apiCompute,
    desc: t.value.developer.apiComputeD,
    color: "var(--v5-brand)",
    icon: ["M6 12h.01", "M6 16h.01"],
    rects: [{ x: 2, y: 2, w: 20, h: 8, rx: 2 }, { x: 2, y: 14, w: 20, h: 8, rx: 2 }],
  },
  {
    title: t.value.developer.apiEarnings,
    desc: t.value.developer.apiEarningsD,
    color: "var(--v5-warning)",
    icon: ["M3 5V19A9 3 0 0 0 21 19V5", "M3 12A9 3 0 0 0 21 12"],
    ellipses: [{ cx: 12, cy: 5, rx: 9, ry: 3 }],
  },
  {
    title: t.value.developer.apiMarket,
    desc: t.value.developer.apiMarketD,
    color: "var(--v5-tech-cyan)",
    icon: ["M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"],
  },
  {
    title: t.value.developer.apiWebhooks,
    desc: t.value.developer.apiWebhooksD,
    color: "var(--v5-tech-cyan)",
    icon: ["M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3s1.34-3 3.01-3H18", "m21 12-3-3 3-3", "M3 12a9 9 0 0 0 9 9"],
  },
]);

function newRequestKey(): string { return `developer-access:${requireCryptoUuid()}`; }
function resourceBusy(intent: string): boolean { return resourceBusyKeys.value.has(intent); }
function setResourceBusy(intent: string, busy: boolean): void {
  const next = new Set(resourceBusyKeys.value);
  if (busy) next.add(intent); else next.delete(intent);
  resourceBusyKeys.value = next;
}
function resourceActionStyle(base: CSSProperties, intent: string): CSSProperties {
  return { ...base, opacity: resourceBusy(intent) ? 0.55 : 1, pointerEvents: resourceBusy(intent) ? "none" : "auto" };
}
function resourceKey(intent: string): string {
  const existing = resourceIntentKeys.get(intent);
  if (existing) return existing;
  const key = `developer-resource:${requireCryptoUuid()}`;
  resourceIntentKeys.set(intent, key);
  return key;
}
function completeResourceIntent(intent: string): void { resourceIntentKeys.delete(intent); }
function askDeveloperConfirmation(title: string, message: string): Promise<boolean> {
  const owner = `developer-resources:${resourceGeneration}:${++confirmationSequence}`;
  developerConfirmOwners.add(owner);
  return confirm({ title, message, owner }).finally(() => developerConfirmOwners.delete(owner));
}
function clearDeveloperConfirms(): void {
  const ui = useUI();
  developerConfirmOwners.forEach((owner) => ui.clearConfirmsBy(owner));
  developerConfirmOwners.clear();
}
function resourceFence(): DeveloperResourceFence { return resourceFenceReader.capture(); }
function resourceFenceCurrent(fence: DeveloperResourceFence): boolean {
  const current = resourceFenceReader.isCurrent(fence);
  // A catalog RunID can change without an account watcher firing. If this is
  // still the active generation, clear visible resource state immediately;
  // the response that discovered the stale run must not leave a spinner or
  // secret from the previous rail behind.
  if (!current && fence.generation === resourceGeneration) {
    clearDeveloperConfirms();
    resetResourceScope();
  }
  return current;
}
function resetResourceScope(): void {
  resourceGeneration += 1;
  resourceReadVersion += 1;
  apiKeys.value = [];
  webhooks.value = [];
  webhookDeliveries.value = {};
  newWebhookSecret.value = null;
  resourcesLoading.value = false;
  resourcesReady.value = false;
  resourcesLoadFailed.value = false;
  resourcesApprovalRequired.value = false;
  resourcesNotReleased.value = false;
  resourceBusyKeys.value = new Set();
  resourceIntentKeys.clear();
  rotationRecovery.value = {};
  rotationStorageUnavailable.value = false;
}
function docsFenceCurrent(fence: DeveloperDocsFence): boolean {
  const current = docsFenceReader.isCurrent(fence);
  if (!current && fence.generation === docsGeneration) resetDocsScope();
  return current;
}
function resetDocsScope(): void {
  docsGeneration += 1;
  docs.value = null;
  docsLoadFailed.value = false;
  docsNotReleased.value = false;
}
function refreshRotationRecovery(items: DeveloperWebhook[]): void {
  const scope = rotationJournal.captureScope();
  const next: Record<number, DeveloperRotationRecoveryState> = {};
  rotationStorageUnavailable.value = false;
  for (const item of items) {
    const status = rotationJournal.statusFor(scope, item.id);
    if (!status.available) {
      rotationStorageUnavailable.value = true;
      continue;
    }
    if (status.state) next[item.id] = status.state;
  }
  rotationRecovery.value = next;
}
async function reconcileResourceFailure<T>(
  fence: DeveloperResourceFence,
  list: () => Promise<T[]>,
  confirmed: (items: T[]) => boolean,
): Promise<{ items: T[]; confirmed: boolean } | null> {
  return readDeveloperResourceSnapshot(list, () => resourceFenceCurrent(fence), confirmed);
}
async function submitRequest() {
  if (submitting.value) return;
  if (!canSubmitAccessRequest.value) {
    const state = requestState.value;
    if (state) toast.info(developerCopy.value[state.detail]);
    return;
  }
  const issue = validateDeveloperAccess({ company: company.value, email: email.value, useCase: useCase.value });
  accessIssue.value = issue;
  if (issue) return toast.warn(t.value.developer[issue]);
  if (remoteApiEnabled) {
    const accountKey = String(app.accountKey);
    const accountScope = captureAccountScope();
    const runScope = captureRuntimeRevision();
    const generation = ++requestGeneration;
    const current = () => generation === requestGeneration && accountKey === String(app.accountKey)
      && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
    submitting.value = true;
    try {
      requestKey ??= newRequestKey();
      const submitted = await developerAccessApi.submit({ company: company.value.trim(), email: email.value.trim(), useCase: useCase.value.trim() }, requestKey);
      if (!current()) { if (generation === requestGeneration) latestRequest.value = null; return; }
      latestRequest.value = submitted;
      requestKey = null; toast.success(t.value.developer.formSubmittedToast);
      company.value = ""; email.value = ""; useCase.value = "";
    } catch {
      try {
        const latest = await developerAccessApi.latest();
        if (!current()) { if (generation === requestGeneration) latestRequest.value = null; return; }
        if (latest && latest.idempotencyKey === requestKey) { latestRequest.value = latest; requestKey = null; toast.success(t.value.developer.formSubmittedToast); }
        else toast.warn(t.value.developer.requestAccessHint);
      } catch {
        if (current()) toast.warn(t.value.developer.requestAccessHint);
        else if (generation === requestGeneration) latestRequest.value = null;
      }
    } finally {
      if (generation === requestGeneration) submitting.value = false;
    }
    return;
  }
  toast.success(t.value.developer.formSubmittedToast);
  company.value = "";
  email.value = "";
  useCase.value = "";
}
function loadLatestRequest() {
  if (!remoteApiEnabled) return;
  const accountKey = String(app.accountKey);
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  const generation = ++requestGeneration;
  latestRequest.value = null;
  latestLoadFailed.value = false;
  const current = () => generation === requestGeneration && accountKey === String(app.accountKey)
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  void developerAccessApi.latest().then((value) => {
    if (current()) {
      latestRequest.value = value;
      latestLoadFailed.value = false;
      if (requestKey && value?.idempotencyKey === requestKey) {
        requestKey = null;
      }
    }
  }).catch(() => {
    if (current()) latestLoadFailed.value = true;
    else if (generation === requestGeneration) { latestRequest.value = null; latestLoadFailed.value = false; }
  });
}
async function loadResources(fence = resourceFence()) {
  if (!remoteApiEnabled || !resourceFenceCurrent(fence)) return;
  // A mutation must start a fresh read even if an older list request is pending.
  const readVersion = ++resourceReadVersion;
  const current = () => resourceFenceCurrent(fence) && readVersion === resourceReadVersion;
  setResourceBusy("load", true);
  resourcesLoading.value = true;
  resourcesReady.value = false;
  resourcesLoadFailed.value = false;
  try {
    const [keys, hooks] = await Promise.all([developerResourcesApi.listKeys(), developerResourcesApi.listWebhooks()]);
    if (!current()) return;
    apiKeys.value = keys;
    webhooks.value = hooks;
    refreshRotationRecovery(hooks);
    resourcesLoadFailed.value = false;
    resourcesApprovalRequired.value = false;
    resourcesNotReleased.value = false;
    resourcesReady.value = true;
  } catch (cause) {
    if (current()) {
      resourcesApprovalRequired.value = isDeveloperApprovalRequired(cause);
      // A capability the server has not deployed (503 DEVELOPER_*) is a product
      // state, not a failed load: it must not render as a retryable error next
      // to the not-released copy.
      resourcesNotReleased.value = isDeveloperCapabilityUnavailable(cause);
      resourcesLoadFailed.value = !resourcesApprovalRequired.value && !resourcesNotReleased.value;
      apiKeys.value = [];
      webhooks.value = [];
      webhookDeliveries.value = {};
      if (resourcesApprovalRequired.value || resourcesNotReleased.value) newWebhookSecret.value = null;
    }
  } finally {
    if (current()) {
      resourcesLoading.value = false;
      setResourceBusy("load", false);
    }
  }
}
async function loadDocs() {
  if (!remoteApiEnabled) return;
  const fence = docsFenceReader.capture();
  docsLoadFailed.value = false;
  docsNotReleased.value = false;
  try {
    const value = await docsApi.published(fence.localeCode);
    if (!docsFenceCurrent(fence)) return;
    docs.value = value;
  } catch (cause) {
    if (!docsFenceCurrent(fence)) return;
    docs.value = null;
    // "No documentation published yet" is a product state, not a failed load.
    if (isDeveloperDocsNotReleased(cause)) docsNotReleased.value = true;
    else docsLoadFailed.value = true;
  }
}
function retryLoadResources(): void { void loadResources(); }
async function revokeApiKey(id: number) {
  if (!canManageResources.value) return;
  const intent = `revoke-key:${id}`;
  if (resourceBusy(intent)) return;
  const fence = resourceFence();
  setResourceBusy(intent, true);
  try {
    const result = await runConfirmedDeveloperMutation(
      () => askDeveloperConfirmation(t.value.developer.revokeConfirmTitle, t.value.developer.revokeConfirmBody),
      () => resourceFenceCurrent(fence) && canManageResources.value,
      () => developerResourcesApi.revokeKey(id, resourceKey(intent)),
    );
    if (!result.confirmed || !resourceFenceCurrent(fence)) return;
    completeResourceIntent(intent);
    await loadResources(fence);
  } catch {
    const keys = await reconcileResourceFailure(fence, () => developerResourcesApi.listKeys(), (items) => isApiKeyRevoked(items, id));
    if (!resourceFenceCurrent(fence)) return;
    if (keys) await loadResources(fence);
    if (!resourceFenceCurrent(fence)) return;
    if (keys?.confirmed) {
      completeResourceIntent(intent);
    } else if (resourceFenceCurrent(fence)) toast.warn(t.value.developer.resourceActionUnknown);
  } finally {
    if (resourceFenceCurrent(fence)) setResourceBusy(intent, false);
  }
}
async function loadWebhookDeliveries(item: DeveloperWebhook) {
  if (!canManageResources.value) return;
  const intent = `deliveries-webhook:${item.id}`;
  if (resourceBusy(intent)) return;
  const fence = resourceFence();
  setResourceBusy(intent, true);
  try {
    const deliveries = await developerResourcesApi.listWebhookDeliveries(item.id);
    if (!resourceFenceCurrent(fence)) return;
    webhookDeliveries.value = { ...webhookDeliveries.value, [item.id]: deliveries };
  } catch {
    if (resourceFenceCurrent(fence)) toast.warn(t.value.developer.resourceActionFailed);
  } finally {
    if (resourceFenceCurrent(fence)) setResourceBusy(intent, false);
  }
}
async function setWebhookEnabled(item: DeveloperWebhook, enabled: boolean) {
  if (!canManageResources.value) return;
  const intent = `toggle-webhook:${item.id}`;
  if (resourceBusy(intent)) return;
  const fence = resourceFence();
  setResourceBusy(intent, true);
  try {
    await developerResourcesApi.setWebhookEnabled(item.id, enabled, resourceKey(intent));
    if (!resourceFenceCurrent(fence)) return;
    completeResourceIntent(intent);
    await loadResources(fence);
  } catch {
    const hooks = await reconcileResourceFailure(fence, () => developerResourcesApi.listWebhooks(), (items) => isWebhookEnabled(items, item.id, enabled));
    if (!resourceFenceCurrent(fence)) return;
    if (hooks) {
      await loadResources(fence);
    }
    if (!resourceFenceCurrent(fence)) return;
    if (hooks?.confirmed) {
      completeResourceIntent(intent);
    } else if (resourceFenceCurrent(fence)) toast.warn(t.value.developer.resourceActionUnknown);
  } finally {
    if (resourceFenceCurrent(fence)) setResourceBusy(intent, false);
  }
}
async function createWebhook() {
  if (!canManageResources.value) return;
  const events = webhookEvents.value.split(",").map((value) => value.trim()).filter(Boolean);
  const name = webhookName.value.trim();
  const url = webhookUrl.value.trim();
  const issue = validateDeveloperWebhook({ name, url, events });
  if (issue) return toast.warn(t.value.developer[issue]);
  const intent = `create-webhook:${name}:${url}:${events.join(",")}`;
  if (resourceBusy("create-webhook")) return;
  const fence = resourceFence();
  setResourceBusy("create-webhook", true);
  try {
    const value = await developerResourcesApi.createWebhook({ name, url, events }, resourceKey(intent));
    if (!resourceFenceCurrent(fence)) return;
    newWebhookSecret.value = value.secret ?? null;
    webhookName.value = "";
    webhookUrl.value = "";
    completeResourceIntent(intent);
    await loadResources(fence);
  } catch {
    if (resourceFenceCurrent(fence)) toast.warn(t.value.developer.resourceActionFailed);
  } finally {
    if (resourceFenceCurrent(fence)) setResourceBusy("create-webhook", false);
  }
}
async function deleteWebhook(id: number) {
  if (!canManageResources.value) return;
  const intent = `delete-webhook:${id}`;
  if (resourceBusy(intent)) return;
  const fence = resourceFence();
  const journalScope = rotationJournal.captureScope();
  setResourceBusy(intent, true);
  try {
    const result = await runConfirmedDeveloperMutation(
      () => askDeveloperConfirmation(t.value.developer.deleteConfirmTitle, t.value.developer.deleteConfirmBody),
      () => resourceFenceCurrent(fence) && canManageResources.value,
      () => developerResourcesApi.deleteWebhook(id, resourceKey(intent)),
    );
    if (!result.confirmed || !resourceFenceCurrent(fence)) return;
    rotationJournal.clear(journalScope, id);
    completeResourceIntent(intent);
    await loadResources(fence);
  } catch {
    const hooks = await reconcileResourceFailure(fence, () => developerResourcesApi.listWebhooks(), (items) => isWebhookDeleted(items, id));
    if (!resourceFenceCurrent(fence)) return;
    if (hooks) {
      await loadResources(fence);
    }
    if (!resourceFenceCurrent(fence)) return;
    if (hooks?.confirmed) {
      webhookDeliveries.value = Object.fromEntries(Object.entries(webhookDeliveries.value).filter(([key]) => Number(key) !== id));
      rotationJournal.clear(journalScope, id);
      refreshRotationRecovery(webhooks.value);
      completeResourceIntent(intent);
    } else if (resourceFenceCurrent(fence)) toast.warn(t.value.developer.resourceActionUnknown);
  } finally {
    if (resourceFenceCurrent(fence)) setResourceBusy(intent, false);
  }
}
async function rotateWebhook(item: DeveloperWebhook) {
  if (!canManageResources.value) return;
  const intent = `rotate-webhook:${item.id}`;
  if (resourceBusy(intent)) return;
  const fence = resourceFence();
  const journalScope = rotationJournal.captureScope();
  const journalStatus = rotationJournal.statusFor(journalScope, item.id);
  if (!journalStatus.available) {
    rotationStorageUnavailable.value = true;
    toast.warn(t.value.developer.rotationStorageUnavailable);
    return;
  }
  setResourceBusy(intent, true);
  let storageUnavailable = false;
  try {
    const result = await runConfirmedDeveloperMutation(
      () => askDeveloperConfirmation(
        t.value.developer.rotateConfirmTitle,
        journalStatus.state ? t.value.developer.rotateRecoveryConfirmBody : t.value.developer.rotateConfirmBody,
      ),
      () => resourceFenceCurrent(fence) && canManageResources.value,
      () => {
        // A rotation response is the only place the new secret exists. Never retry
        // this request with the same key; persist and read back uncertainty first.
        if (!resourceFenceCurrent(fence) || !rotationJournal.isCurrentScope(journalScope)
          || !rotationJournal.markPending(journalScope, item.id)) {
          storageUnavailable = true;
          throw new Error("DEVELOPER_ROTATION_JOURNAL_UNAVAILABLE");
        }
        return developerResourcesApi.rotateWebhookSecret(item.id, `developer-resource:${requireCryptoUuid()}`);
      },
    );
    if (!result.confirmed || !resourceFenceCurrent(fence) || !rotationJournal.isCurrentScope(journalScope)) return;
    if (!result.value.secret) {
      if (!rotationJournal.markUnknown(journalScope, item.id)) {
        rotationStorageUnavailable.value = true;
        toast.warn(t.value.developer.rotationStorageUnavailable);
        return;
      }
      refreshRotationRecovery(webhooks.value);
      toast.warn(t.value.developer.rotationUnknownWarning);
      return;
    }
    rotationJournal.clear(journalScope, item.id);
    refreshRotationRecovery(webhooks.value);
    newWebhookSecret.value = result.value.secret;
    toast.success(t.value.developer.secretOnce);
  } catch {
    if (resourceFenceCurrent(fence) && rotationJournal.isCurrentScope(journalScope)) {
      if (storageUnavailable || !rotationJournal.markUnknown(journalScope, item.id)) {
        rotationStorageUnavailable.value = true;
        toast.warn(t.value.developer.rotationStorageUnavailable);
        return;
      }
      refreshRotationRecovery(webhooks.value);
      toast.warn(t.value.developer.rotationUnknownWarning);
    }
  } finally {
    if (resourceFenceCurrent(fence)) setResourceBusy(intent, false);
  }
}
function deliveryFailureLabel(value: string): string {
  return /^[A-Z0-9_:-]{1,120}$/.test(value) ? value : t.value.developer.deliveryFailureRedacted;
}
onShow(() => {
  loadLatestRequest();
  void loadResources();
  void loadDocs();
});
onHide(() => {
  clearDeveloperConfirms();
  requestGeneration += 1;
  latestRequest.value = null;
  latestLoadFailed.value = false;
  resetDocsScope();
  resetResourceScope();
});
onUnmounted(() => {
  clearDeveloperConfirms();
  requestGeneration += 1;
  resetDocsScope();
  resetResourceScope();
});
watch(() => String(app.accountKey), () => {
  clearDeveloperConfirms();
  requestGeneration += 1;
  requestKey = null;
  submitting.value = false;
  latestRequest.value = null;
  latestLoadFailed.value = false;
  resetDocsScope();
  loadLatestRequest();
  resetResourceScope();
  loadResources();
  void loadDocs();
});
watch(() => locale.code, () => { resetDocsScope(); void loadDocs(); });
// 已报出的字段错误在用户改正后立刻消失 —— 否则 aria-invalid="true" 会一直挂在
// 已经合法的字段上,读屏继续宣告一个不存在的错误。
watch([company, email, useCase], () => {
  if (accessIssue.value) accessIssue.value = validateDeveloperAccess({ company: company.value, email: email.value, useCase: useCase.value });
});

// ── styles ──
const heroStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  background:
    "var(--nx-glass-fill)",
  borderColor: "transparent",
  padding: "20px",
};
const heroIconBoxStyle: CSSProperties = {
  top: "12px",
  right: "12px",
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 15%, transparent)",
};
const heroTaglineStyle: CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  marginTop: "4px",
  maxWidth: "270px",
  lineHeight: 1.375,
};
const badgeStyle: CSSProperties = {
  fontSize: "12px",
  padding: "2px 8px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-ink) 5%, transparent)",
  color: "var(--v5-ink-2)",
};
const segWrapStyle: CSSProperties = {
  // 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 tech-cyan 实底,不撞色
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "4px",
  gap: "2px",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};
function pillStyle(v: Tab): CSSProperties {
  const on = tab.value === v;
  return {
    height: "44px",
    borderRadius: "10px",
    background: on ? "var(--v5-tech-cyan)" : "transparent",
  };
}
function pillLabelStyle(v: Tab): CSSProperties {
  const on = tab.value === v;
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: on ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
// De-carded: the 4 API cards merge into a transparent hairline list (rows carry
// their own dividers, last = none) instead of 4 stacked bordered cards.
const apiListStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function apiRowStyle(last: boolean): CSSProperties {
  return {
    padding: "14px 0",
    gap: "12px",
    borderBottom: last ? "none" : "1px solid var(--v5-border)",
  };
}
function apiIconBoxStyle(color: string): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    // 原版 `${color}1A` hex-alpha = 0x1A/0xFF ≈ 10%
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
  };
}
const partnerTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink-3)",
  letterSpacing: "-0.025em",
  padding: "12px 8px 4px",
};
const partnerGridStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  padding: "16px",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "12px",
};
const partnerCellStyle: CSSProperties = {
  aspectRatio: "3 / 2",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
};
const formCardStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  padding: "16px",
};
const formInputStyle: CSSProperties = {
  width: "100%",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  color: "var(--v5-ink)",
  boxSizing: "border-box",
};
const formTextareaStyle: CSSProperties = {
  width: "100%",
  height: "72px",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  color: "var(--v5-ink)",
  boxSizing: "border-box",
};
/** 字段级错误提示:与输入框同列,读屏经 aria-describedby 关联(BUG 105)。 */
const fieldErrorStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  fontSize: "12px",
  color: "var(--v5-danger)",
};
const submitBtnStyle: CSSProperties = {
  height: "48px",
  background: "var(--v5-tech-cyan)",
};
const requestStatusStyle: CSSProperties = { padding: "10px 12px", marginBottom: "12px", };
const resourceRowStyle: CSSProperties = { padding: "12px 0", gap: "10px", borderBottom: "1px solid var(--v5-border)" };
const dangerBtnStyle: CSSProperties = { padding: "7px 10px", color: "var(--v5-warning)", background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)" };
const smallActionBtnStyle: CSSProperties = { padding: "7px 10px", color: "var(--v5-tech-cyan)", background: "color-mix(in srgb, var(--v5-tech-cyan) 10%, transparent)" };
const snippetWrapStyle: CSSProperties = {
  background: "var(--v5-surface-3)",
  borderRadius: "8px",
  padding: "12px",
  whiteSpace: "nowrap",
};
const snippetTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-success)",
  lineHeight: 1.625,
  whiteSpace: "pre",
};
const docsComingStyle: CSSProperties = {
  padding: "8px 12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--v5-warning) 25%, transparent)",
};
// White-list empty state: dashed border-strong, no fill.
const emptyTabStyle: CSSProperties = {
  padding: "32px",
  border: "1px dashed var(--v5-border-strong)",
  background: "transparent",
};
const smallBtnStyle: CSSProperties = {
  height: "36px",
  padding: "0 16px",
  background: "var(--v5-tech-cyan)",
  alignItems: "center",
};

import GlassSegments from "@/components/glass-segments.vue";
</script>

<style scoped>
.nx-dev-ph {
  color: var(--v5-ink-4);
}
</style>
