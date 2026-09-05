import { defineConfig, presetWind3 } from "unocss";

// NexGrid uni-app UnoCSS config.
// presetWind3 = Tailwind v3-compatible utilities (covers the ~5449 className
// usages ported from the Next.js prototype, including arbitrary values like
// text-[var(--v5-ink)] / bg-[var(--v5-surface)] which resolve against the CSS
// custom properties defined in src/styles/tokens.css).
// We keep px (not rpx): H5 + App(webview .vue) both render standard CSS.
//
// 🔴 不要再加 presetAttributify(2026-08-17 摘除,P-123):它把源码里**任何**属性都当属性式工具类扫,
// 而全仓没有一处属性式用法 —— 它唯一的产出是几十条撞上 SVG 呈现属性的意外规则:`font-size="9.5"` →
// `[font-size~="9.5"]{font-size:2.375rem}`(SVG 文字大 4 倍)、`:opacity="d.bright ? 0.5 : 0.25"` →
// `[opacity~="0.25"]{opacity:0.0025}`(全球节点图 669 个大陆点隐形,独立审计 A1 实测)。
// ignoreAttributes 只挡裸属性、挡不住绑定式(提取器先查表后剥 `:`),所以「加豁免」不算修,摘掉才是。
// 守卫:scripts/svg-text-source-gate.mjs [attributify](启用即红,除非 prefixedOnly:true)+
//       scripts/svg-text-render-probe.mjs [attr-hijacked](运行时,SVG 呈现属性值 == 计算值)。
export default defineConfig({
  presets: [presetWind3()],
});
