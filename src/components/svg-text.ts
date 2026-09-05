// SvgText —— 内联 SVG 里的文字节点,**只许用在 `<svg>` 之内**(P-121)。
//
// 为什么存在:uni 把模板里的 `<text>` 一律编译成它的文本组件(H5 渲染成自定义元素 `<uni-text>`),
// 而原生 SVG 需要的是 SVG 命名空间下的 `<text>` 元素;`<uni-text>` 不是合法 SVG 子元素,浏览器不排版
// (实测 `getBoundingClientRect()` 0×0,不报错、不留痕)。也就是说 `<text>` 在本仓有两个意思,
// 写在 `<svg>` 里的那个是静默失效的 —— 这个组件给 SVG 那个意思一个不会被 uni 改写的名字。
//
// 怎么做到:渲染函数直接 `h("text", …)`,不经模板编译的标签改写;Vue 把父级 `<svg>` 的命名空间
// 传给子组件的子树,所以这里的 `text` 会以 `createElementNS(svg, "text")` 创建 = 真 SVG 文字。
// 属性(x / y / text-anchor / font-size / fill…)、绑定、事件、`v-if` / `v-for`、插值子节点全部原样透传。
//
// 用法(与原生 SVG 文本一模一样,只是标签名不同):
//   <svg viewBox="0 0 360 360">
//     <SvgText x="180" y="181" text-anchor="middle" font-size="11" fill="var(--v5-on-brand)">{{ t.network.diagramYou }}</SvgText>
//   </svg>
//
// 边界(如实):
//   · 只解决 H5(uni-h5)。App-vue 的视图层对模板里的整个 `<svg>` 都是 `document.createElement` 建的
//     HTML 未知元素(读 uni-app-view.umd.js 的 CREATE 分支),图本身就不出,不是本组件能救的 —— 见 P-121 追记与 HANDOFF。
//   · SVG 文字不换行;要换行的长文案请放 SVG 外。
//   · `ref` 拿到的是**组件实例**不是 DOM 元素(原生 `<text ref>` 给 Element);要元素走 `$el`。13 处现用法都没用 ref。
//   · 目标端是 H5 + App-vue;小程序端(mp-*)本仓不是目标 —— 那边压根没有内联 SVG,渲染函数组件也不走同一条编译路。
//   · 机器门:`scripts/svg-text-source-gate.mjs`(svg 内禁 `<text`,本组件只许在 svg 内)+
//     `scripts/svg-text-render-probe.mjs`(运行时 bbox > 0 · 字号属性未被 CSS 劫持)。
import { defineComponent, h } from "vue";

export default defineComponent({
  name: "SvgText",
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    // data-svgtext 是给运行时门认「这条 svg text 是从本组件出来的」的出处标记(scripts/svg-text-render-probe.mjs [count] 只数带标记的,
    // 否则页面上任何别的 svg 文字都能顶数 —— 独立审计 A2 P0-1)。不影响渲染;attrs 在后,调用方写了同名属性以调用方为准。
    return () => h("text", { "data-svgtext": "", ...attrs }, slots.default?.());
  },
});
