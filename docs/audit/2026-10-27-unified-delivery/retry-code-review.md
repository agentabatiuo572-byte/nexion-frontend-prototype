# 紧凑恢复提示独立源码复审

## 当前结论：修复后 9.2/10

2026-10-27 · Averroes · **RETRY-CODE-P2-01 已关闭，本次源码审查无未关闭 P2+，达到 9 分门槛。**

只读复核 [search.vue:73](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/search/search.vue:73)：root/copy/action 已接入共享三类，root 旧 `display:flex`、`align-items`、`gap` 已移除。两列 grid 正常接管布局；按钮直接匹配共享字体规则，使用 **600 13px/20px**，不会继承文案的 12px/18px。原颜色、左侧文案字号、至少 44px 点击区及 `t.ui.retry` 保留。

本次增量仅模板 class 与上述 CSS 删除；`showSourceError` 条件、click/Enter/Space handlers、`retrySearchSources` 和完整 EmptyState 均未改变。原发现所述字号遗漏已在源码层闭环。

父线程已提供修复后 **r5 APP：`index-B0RqUdly.js` / `index-M9lx7jQr.css`**，并报告搜索定向 **2 文件、12 项测试通过**。本审查未重跑测试、构建或浏览器，上述构建与测试结果按父线程提供的证据记录；9.2 分与 P2 关闭结论来自独立源码复核，不代替实景验收。下方 **Bo1e4G3- / M9lx7jQr** 与 8.8 分保留为修复前历史。

## 首轮历史（8.8/10，原文保留）

2026-10-27 · Averroes · **8.8/10，未达到 9 分门槛：1 项 P2 待修。** 此分数仅评价本次恢复提示的源码与契约保持，不是视觉评分。

基线 `f7c9de55af6f539b457bc12fc63d2ecbfadecc22`；审查 APP 未提交的 25 个 tracked src 文件及新增 `src/styles/inline-recovery.css`。父线程最终构建标识为 **Bo1e4G3- / M9lx7jQr**（本审查未启动浏览器核验）。新增 `src/i18n/remainder-ui.ts` 的 phoneBody 修订不属本报告。26 文件按路径排序、以路径 NUL 字节内容 NUL 串联的 SHA-256：`ee116ba00e23726b9c776d60e596ea6bfdaca368b0154b0b73e60fa5a77b43ac`；最终读回未变。

## RETRY-CODE-P2-01：搜索部分来源失败仍保留旧字号

当搜索已有结果、任一远端来源失败时，[search-source-state.ts:42](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/search-source-state.ts:42) 会显示保留结果的降级提示。[search.vue:73](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/search/search.vue:73) 的 `nx-search-source-note` / `nx-search-source-retry` 未接入共享规则；父容器在 [454 行](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/search/search.vue:454) 指定 `12px`、`line-height:1.5`，按钮仅指定字重 600，因此仍是 **600 12px/18px**，与同页已统一的导航失败按钮 **600 13px/20px** 不一致。

这是既有提示漏纳入本轮明确的字号统一要求，不是新出现的重试业务错误。它已有正确的右侧布局及至少 44px 点击区，使用的文案也是 `t.ui.retry`。最小修复是让这个紧凑降级提示接入共享样式或等效的统一字体；保留 `retrySearchSources`、结果保留条件和全页 EmptyState，无需扩展业务改动。

## 其余核对

- **布局边界：**共享 `minmax(0,1fr) auto`、文案 `min-width:0/overflow-wrap:anywhere`、按钮 `nowrap` 预留右侧宽度；局部原 flex 容器已移除覆盖或显式切 grid。通知仅在已有数据时横排，空列表错误仍保留原纵向结构。
- **字体与触达：**[共享字体选择器](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/styles/inline-recovery.css:22) 优先级 `(0,3,0)` 高于 NxButton scoped 字体规则 `(0,2,0)`，能统一已接入按钮。NxButton small/medium 根点击区至少 44px，内部 surface 的 32/40px 不是命中区缩小；默认 large 仍至少 48px。ledger 已接入同一字体并去掉旧 monospace/12px；收益页两处和任务提示的“请重试”已改用 `t.ui.retry`。
- **交互与业务：**23 个 Vue 文件相对 HEAD 的事件绑定、条件分支及 disabled/busy/tabindex/aria 状态表达式均未变化；脚本差异仅搜索、network、tree 的样式常量。NxButton 禁用、忙碌、按键重复守卫未动；已有手写键盘处理和全局键盘激活层保持，未新增重复激活路径。
- **EmptyState：**组件实现及本轮涉及的完整空态入口未改，共享选择器仅显式 opt-in，不会把全页插画/说明/CTA 改成左右两列。“重新打开”“重新同步”“管理”等业务动作仍保留原语义。

执行边界：仅阅读 diff、依赖源码及文本对比，未运行测试、构建或浏览器，未审后端、未修改产品。未独立验收 320/390、多语言最终几何或原生设备键盘表现；这些不被上述源码评分替代。本轮只需关闭上述一处明确遗漏后复核，无新增大矩阵要求。
