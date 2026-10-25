<template><view class="reward-page"><slot /></view></template>
<style scoped>
.reward-page {
  --reward-accent: #c5f45a;
  --reward-glass: linear-gradient(135deg, rgba(68, 71, 76, .68), rgba(24, 26, 29, .82));
  --reward-edge: rgba(223, 228, 235, .36);
  --reward-panel: linear-gradient(135deg, rgba(40, 43, 46, .88), rgba(17, 19, 21, .94));
  --reward-panel-edge: rgba(210, 216, 224, .16);
  color: var(--v5-ink); padding-bottom: 28px; overflow-wrap: anywhere;
}
.reward-page :deep(.reward-summary-panel) { padding: 0 18px 16px; border: 1px solid var(--reward-panel-edge); border-radius: 20px; background: var(--reward-panel); }
.reward-page :deep(.reward-summary-panel), .reward-page :deep(.reward-hero--panel) { --v5-ink: #f7f8fa; --v5-ink-2: #cdd3da; --v5-ink-3: #a1a9b3; --v5-border: rgba(223, 228, 235, .14); color: var(--v5-ink); }
.reward-page :deep(.reward-cta) {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  box-sizing: border-box; min-height: 44px; max-width: 100%; padding: 11px 18px;
  border: 1px solid var(--reward-edge); border-radius: 999px;
  background: var(--reward-glass); color: #f7f8fa; backdrop-filter: blur(16px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08); font-size: 13px; font-weight: 600;
  line-height: 1.45; text-align: center; cursor: pointer;
}
.reward-page :deep(.reward-cta::after) { content: '→'; flex-shrink: 0; font-size: 19px; font-weight: 400; }
.reward-page :deep(.reward-cta:focus-visible) { outline: 2px solid var(--reward-accent); outline-offset: 3px; }
.reward-page :deep(.reward-cta[aria-disabled="true"]) { opacity: .5; cursor: default; }
.reward-page :deep(.reward-cta > svg) { display: none; }
.reward-page :deep(.reward-cta > text) { color: inherit !important; }
.reward-page :deep(.reward-cta--wide) { display: flex; width: 100%; }
.reward-page :deep(.nx-empty__cta) { gap: 9px; background: var(--reward-glass) !important; border: 1px solid var(--reward-edge); backdrop-filter: blur(16px); }
.reward-page :deep(.nx-empty__cta > text) { color: #f7f8fa !important; }
.reward-page :deep(.nx-empty__cta::after) { content: '→'; color: #f7f8fa; font-size: 19px; }
.reward-page :deep(.nx-empty__cta:focus-visible) { outline: 2px solid var(--reward-accent); outline-offset: 3px; }
.reward-page :deep(.reward-amount) { display: block; margin-top: 8px; font-size: clamp(26px, 8vw, 36px); font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; letter-spacing: -.025em; overflow-wrap: anywhere; }
.reward-page :deep(.reward-caption) { color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; }
.reward-page :deep(.reward-rule-link) { margin-top: var(--ui-space-inline); }
@media (prefers-reduced-transparency: reduce) { .reward-page :deep(.reward-cta) { background: #27292d; backdrop-filter: none; } }
</style>
