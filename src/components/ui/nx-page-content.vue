<template><view v-if="embedded"><slot /></view><AppChassis v-else :active="active"><slot /></AppChassis></template>
<script setup lang="ts">
import AppChassis from '@/components/app-chassis.vue';
defineProps<{ embedded?: boolean; active: 'home' | 'earn' | 'store' | 'team' | 'me' }>();
</script>
