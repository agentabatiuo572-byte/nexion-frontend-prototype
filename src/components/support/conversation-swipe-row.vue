<template>
  <view class="conversation-swipe" @touchstart="startTouch" @touchmove="moveTouch" @touchend="end" @touchcancel="cancel"
    @mousedown="startMouse" @mousemove="moveMouse" @mouseup="end" @mouseleave="end"
    @keydown.left.prevent="reveal" @keydown.right.prevent="close" @keydown.esc.prevent="close" @keydown.delete.prevent="requestDelete">
    <view v-if="!disabled" class="conversation-swipe__delete" :class="{ 'conversation-swipe__delete--visible': open || dragging }" role="button" :tabindex="open && !busy ? 0 : -1"
      :aria-hidden="!open" :aria-label="deleteLabel + ' · ' + label" :aria-disabled="busy"
      @click.stop="requestDelete" @keydown.enter.stop.prevent="requestDelete" @keydown.space.stop.prevent="requestDelete">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
      <text>{{ deleteLabel }}</text>
    </view>
    <view class="conversation-swipe__content" :class="{ 'conversation-swipe__content--dragging': dragging }"
      :style="{ transform: `translateX(${dragging ? offset : open && !disabled ? -80 : 0}px)` }" @click.capture="captureClick">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{ open: boolean; label: string; deleteLabel: string; disabled?: boolean; busy?: boolean }>(), { disabled: false, busy: false });
const emit = defineEmits<{ (event: 'update:open', value: boolean): void; (event: 'delete'): void }>();
const dragging = ref(false), offset = ref(0);
let start: { x: number; y: number; offset: number } | null = null;
let axis: 'pending' | 'horizontal' | 'vertical' = 'pending';
let suppressClickUntil = 0;

function begin(x: number, y: number) {
  if (props.disabled || props.busy) return;
  start = { x, y, offset: props.open ? -80 : 0 };
  offset.value = start.offset;
  axis = 'pending';
}
function move(x: number, y: number, event: Event) {
  if (!start) return;
  const dx = x - start.x, dy = y - start.y;
  if (axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
    axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
  }
  if (axis !== 'horizontal') return;
  event.preventDefault();
  dragging.value = true;
  offset.value = Math.max(-80, Math.min(0, start.offset + dx));
}
function startTouch(event: TouchEvent) { if (event.touches.length === 1) begin(event.touches[0].clientX, event.touches[0].clientY); }
function moveTouch(event: TouchEvent) { if (event.touches.length === 1) move(event.touches[0].clientX, event.touches[0].clientY, event); }
// uni-app normalizes mouse coordinates but omits button/buttons on H5.
function startMouse(event: MouseEvent) { if (event.button == null || event.button === 0) begin(event.clientX, event.clientY); }
function moveMouse(event: MouseEvent) { if (start && (event.buttons == null || event.buttons === 1)) move(event.clientX, event.clientY, event); }
function end() {
  if (axis === 'horizontal' && start) { emit('update:open', offset.value <= -36); suppressClickUntil = Date.now() + 300; }
  start = null; dragging.value = false;
}
function cancel() { start = null; dragging.value = false; }
function reveal() { if (!props.disabled && !props.busy) emit('update:open', true); }
function close() { emit('update:open', false); }
function requestDelete() { if (!props.disabled && !props.busy) emit('delete'); }
function captureClick(event: Event) {
  if (Date.now() < suppressClickUntil || props.open) { event.preventDefault(); event.stopPropagation(); if (Date.now() >= suppressClickUntil) close(); }
}
</script>

<style scoped>
.conversation-swipe { position: relative; overflow: hidden; touch-action: pan-y; }
.conversation-swipe__content { position: relative; background: var(--v5-bg); transition: transform 180ms ease-out; }
.conversation-swipe__content--dragging { transition: none; user-select: none; }
.conversation-swipe__delete { position: absolute; inset: 1px 0 1px auto; width: 80px; min-height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; visibility: hidden; background: var(--v5-danger); color: #fff; font: 600 12px/1.3 var(--font-v5); cursor: pointer; }
.conversation-swipe__delete--visible { visibility: visible; }
.conversation-swipe__delete:active { opacity: .8; }
.conversation-swipe__delete:focus-visible { outline: 2px solid var(--v5-ink); outline-offset: -3px; }
.conversation-swipe__delete[aria-disabled="true"] { opacity: .5; }
@media (prefers-reduced-motion: reduce) { .conversation-swipe__content { transition: none; } }
</style>
