<template>
  <view class="nx-profile-uid flex items-center" style="min-height: 44px; gap: 2px; pointer-events: none">
    <text class="truncate" style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 13px; color: var(--v5-ink-2)">UID {{ profile.uid || '—' }}</text>
    <view v-if="profile.uid" class="grid place-items-center shrink-0 active:opacity-70" style="width: 44px; height: 44px; pointer-events: auto; color: var(--v5-ink-2)" role="button" tabindex="0" :aria-label="t.profile.copyUid" @click.stop="copyUid" @keydown.enter.stop.prevent="copyUid" @keydown.space.stop.prevent="copyUid">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useProfile } from "@/store/profile";
import { useT } from "@/i18n/use-t";
import { toast } from "@/store/ui";
import { copyText } from "@/lib/share";

const profile = useProfile();
const t = useT();

async function copyUid() {
  const uid = profile.uid;
  if (!uid) return;
  const copied = await copyText(uid);
  if (profile.uid !== uid) return;
  if (copied) toast.success(t.value.profile.uidCopied);
  else toast.error(t.value.share.copyFailed);
}
</script>
