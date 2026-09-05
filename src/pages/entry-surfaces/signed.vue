<template>
  <EntrySurfaceHome surface="signed" />
</template>

<script setup lang="ts">
import EntrySurfaceHome from "@/components/entry-surfaces/entry-surface-home.vue";
import { useSetPageHeader } from "@/composables/use-page-header";
import { useT } from "@/i18n/use-t";

const t = useT();

// getter 形式 —— 切语言时 nav header 跟着变。标题/副标题复用入口页行标题与算力模式,不另起 key。
useSetPageHeader(() => ({
  title: t.value.entrySurface.surfaces.signed.linkLabel,
  subtitle: t.value.entrySurface.surfaces.signed.modeValue,
  backHref: "/pages/entry-surfaces/index",
}));
</script>
