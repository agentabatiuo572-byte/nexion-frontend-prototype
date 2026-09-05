# 返回按钮冷开卡死修复 · Change Proposal

- **工作线**：④ uniapp
- **日期**：2026-06-17
- **状态**：Aligned ✅ → 实现+验证完成（实景 4 路径绿 · console 0 · verify 仅余 pre-existing unilevel/wallet-nex 类型错）→ 待主人定 PRD 后标 Shipped

## Why（问题 / 动机）
Deep-link / 刷新直开任一子页（如 `/#/pages/store/detail?id=stellarbox-s1`）后点返回按钮**无反应、卡死**。运行时坐实根因：uni-app H5 在**单页栈**（`getCurrentPages().length===1`）时 `uni.navigateBack()` 走 **success 空操作、fail 不触发**，导致 `navigateBack({ fail: () => 回退 })` 这一模式的回退分支是**死代码**。全站 12 处返回逻辑都用此模式 → 系统性 bug，非 detail 单页。

证据（Playwright 实景）：冷开 detail 栈深=1，点返回 URL 不变；`navigateBack` 探针返回 `SUCCESS (no-op, fail never fires)`；对照 in-app 栈深>1 时正常 pop 回 store。

## What changes（改动点）
- 新增共享 helper `route.ts > navBack(fallbackHref?)`：`getCurrentPages().length>1` 才 `navigateBack`；否则（冷开/无历史）直接 `reLaunch`→backHref（带 navTo 兜底）。
- 12 处调用全部收口到 helper：
  - 共享组件 ×2：`app-chassis.vue` navBack、`sub-page-header.vue` goBack
  - 页面 goBack 副本 ×10：onboarding/terms、support/chat、me/wrapped、team/{binary,commissions,leadership-pool,rank,unilevel}-how、me/wallet-cards-new
- **Out of scope（明确不做）**：不改返回按钮的视觉/位置/图标；不改各页 backHref 目标；不碰 5 个一级 tab 页与受保护的 index.vue；不引入路由库。

## Impact（影响面）
- **页面 / 路由**：上述 10 页 + 经 2 共享组件间接覆盖的全部 chassis/SubPageHeader 子页
- **新增**：`src/lib/route.ts` 加 `navBack()`（纯函数，无状态，backend 无关）
- **Store / model**：无
- **i18n**：无（纯导航逻辑）
- **设计**：无视觉改动
- **PRD 章节**：无（bug 修复，行为回归到「返回应可用」；P7 视情决定是否需同步，倾向只记产品更新日志 ✏️）
- **不变量风险**：mobile-first（返回是核心可用性）；不涉及双语/双币/数字/on-brand

## Done-when（2-4 条可证伪、行为级判据）
- [ ] 冷开 `/#/pages/store/detail?id=stellarbox-s1` 点返回 → URL 实际变为 `/pages/store/store`（实景）
- [ ] in-app store→detail→返回 仍正常 pop 回 store（无回归）
- [ ] 抽验 ≥2 个 *-how 页 + terms + chat 冷开返回 → 各自落到声明的 backHref
- [ ] `grep -r "navigateBack({ fail"`（含多行）全站 = 0，全部走 `navBack()` helper
- [ ] `npm run type-check` 0 错 + `bash scripts/verify.sh` 全绿
