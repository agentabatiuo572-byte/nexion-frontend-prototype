<template><view class="reward-page"><slot /></view></template>
<style scoped>
.reward-page {
  --reward-accent: #c5f45a;
  --reward-panel: linear-gradient(135deg, rgba(40, 43, 46, .88), rgba(17, 19, 21, .94));
  --reward-panel-edge: rgba(210, 216, 224, .16);
  color: var(--v5-ink); padding-bottom: 28px; overflow-wrap: anywhere;
}
.reward-page :deep(.reward-summary-panel) { padding: 0 18px 16px; border: 1px solid var(--reward-panel-edge); border-radius: 20px; background: var(--reward-panel); }
.reward-page :deep(.reward-summary-panel), .reward-page :deep(.reward-hero--panel) { --v5-ink: #f7f8fa; --v5-ink-2: #cdd3da; --v5-ink-3: #a1a9b3; --v5-border: rgba(223, 228, 235, .14); color: var(--v5-ink); }
/* Reward CTAs share the neutral glass material from tokens.css (design system 03 §3.1):
   an in-card entry is M (40px surface, 44px hit area, arrow to the next page); the wide
   return action is L (48px, full width, no arrow). Retries use the text button instead. */
.reward-page :deep(.reward-cta) {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  box-sizing: border-box; min-height: 40px; max-width: 100%; padding: 8px 16px; border-radius: 999px;
  font: var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5);
  text-align: center; cursor: pointer;
}
.reward-page :deep(.reward-cta:not(.reward-cta--wide)::before) { content: ''; position: absolute; inset: -2px 0; }
.reward-page :deep(.reward-cta:not(.reward-cta--wide)::after) { content: '→'; flex-shrink: 0; }
.reward-page :deep(.reward-cta:focus-visible) { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.reward-page :deep(.reward-cta[aria-disabled="true"]) { opacity: .5; cursor: default; }
.reward-page :deep(.reward-cta > svg) { display: none; }
.reward-page :deep(.reward-cta > text) { color: inherit !important; }
.reward-page :deep(.reward-cta--wide) { display: flex; width: 100%; min-height: 48px; padding: 10px 20px; }
.reward-page :deep(.reward-amount) { font-family: var(--font-amount); display: block; margin-top: 8px; font-size: clamp(26px, 8vw, 36px); font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; letter-spacing: -.025em; overflow-wrap: anywhere; }
.reward-page :deep(.reward-caption) { color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; }
.reward-page :deep(.reward-rule-link) { margin-top: var(--ui-space-inline); }
</style>
