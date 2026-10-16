<template>
  <!-- uni injects the renderjs module into template scope. -->
  <!-- @vue-ignore -->
  <view class="native-gpu-observer" aria-hidden="true" :gpu-request="request" :change:gpu-request="gpuView.observe" />
</template>
<script lang="ts">
import { defineComponent } from "vue";
export default defineComponent({
  props: { request: { type: Number, required: true } },
  emits: ["observation"],
  methods: {
    receiveGpuObservation(value: unknown) { this.$emit("observation", value); },
  },
});
</script>
<script module="gpuView" lang="renderjs">
import { observeAppWebglGpu } from "@/lib/native-phone-gpu";
// @ts-expect-error vue-tsc treats uni's renderjs custom block as a second normal script.
export default {
  methods: {
    observe(id, previous, owner) {
      if (!Number.isInteger(id) || id <= 0 || id === previous) return;
      owner.callMethod("receiveGpuObservation", { id, ...observeAppWebglGpu(document) });
    },
  },
};
</script>
<style>
.native-gpu-observer { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
</style>
