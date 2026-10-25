<template>
  <EntrySurfaceHome surface="white" />
</template>

<script setup lang="ts">
import EntrySurfaceHome from "@/components/entry-surfaces/entry-surface-home.vue";
import { useSetPageHeader } from "@/composables/use-page-header";
import { useEntrySurfaceCopy } from "@/components/entry-surfaces/entry-surface-copy";

const copy = useEntrySurfaceCopy();

// Keep the header in sync when the reader changes language.
useSetPageHeader(() => ({
  title: copy.value.surfaces.white.linkLabel,
  backHref: "/pages/entry-surfaces/index",
}));
</script>
