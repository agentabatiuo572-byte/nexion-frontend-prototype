# 2026-08-04 结算页试用报价单源化 — 红测留痕(R2 P0)

## 缺陷

`src/pages/store/checkout.vue` 同一次结算里,试用相关的值来自**两个状态源**:

- `trialConversionMode` / `promoDiscount` / `trialOffsetView` 读 store 里**未推进的原始 `status` ref**(只有 4s poll 或 `convert()` 会推进);
- `liveShadowUSD/NEX(Date.now())` 走 `resolveTrialAt`,**实时看得到宽限期边界跨越**并返回 0。

宽限期刚过、下一次 poll 未到的窗口里两边给出互斥答案:`applyTrial=true`(原始状态说 grace)· `shadowUSDNow=0`(解析器说 ended)· `promo≠0`(原始状态)→ `net` 被拼成一个**报价页从未展示过的更高数字**并直接 `debitBalance`;`convert()` 内部按真实时点返回 `false`,但**返回值被丢弃**且发生在扣款之后,无回滚。

根因是第 1 轮 P0 的**同型漏网**:第 1 轮把时间边界收敛成纯函数 `resolveTrialAt`,只收了 store 内部,没收 `checkout.vue` 这个消费者。

## 修法(收全族,不是补窗口)

1. **单一时刻、单一解析**:新增 `trialQuoteAt(now)` —— 一次 `resolveTrialAt`,`applied / promo / offsetUSD / remainderUSD / shadowNEX` 全部从这一次解析派生。展示侧 `trialView = computed(() => trialQuoteAt(nowTick.value))`(1s ticker),支付侧 `trialQuoteAt(mockServerNow())`。页面**再无一处读原始 `freeTrial.status`**,`liveShadowUSD/NEX` 的 import 也已删除。
2. **展示与扣款同源**:`onConfirmPay` 把展示侧那一次解析(`trialView.value`)整份冻结成 `trialQuote`,并快照 `quotedTotal = netPrice + cardFee`。扣款金额只认快照;支付时刻的重新解析**只做闸不改数字**。
3. **越界拒单**:`trialQuote.applied && !payQuote.applied` → 回 `select-payment` + 提示重新确认(与既有 voucher / trade-in 守卫同构)。
4. **`convert()` 返回值不许丢弃**,且判定在扣款之前:`if (!freeTrial.convert()) { 拒单 }` 排在 `debitBalance` 之前;余额充足性先只读判定(validate → apply 两段式),保证 convert 成功后扣款必成功,不留「已转化但没扣款」的半执行窗口。
5. **族级兜底闸**:`chargeTotal > quotedTotal` 一律拒单 —— 覆盖任何在确认页之后变差的输入(如旧机抵扣随累计收益跌档),不只试用。反向(变便宜)放行。

## 机器门

`scripts/selfcheck-checkout-trial-quote.mjs`(已焊进 `scripts/verify.sh`),**44 asserts**(quote=7 settle=22 wiring=15)。
执行的是真实现:`trial-boundary.ts` 经 esbuild bundle 真跑;`computeTrialOffset/computeDiscountedPrice` 从 `trial-config.ts` 切片;`trialQuoteAt` / 展示侧 computed / `netPrice` / **支付时刻整段结算块**从 `checkout.vue` 源码切片转译后执行 —— 把守卫从页面里摘掉,门立刻转红。切片缺失 / 断言总数 < 40 → `exit 1`(找不到 ≠ 全过)。

## 红测(逐条隔离,`cp` 还原,禁 `git checkout`)

基线 44 asserts 全绿。逐条注入 → 只红对应断言 → `cp` 还原 → byte-identical → 复绿。

| # | 注入(破坏一个合取项) | 实际转红 | 隔离 |
|---|---|---|---|
| R1 | 删掉越界拒单守卫 `if (trialQuote.applied && !payQuote.applied)` | `①c 状态机误放行时,越界解析仍独立拒单零扣款` | ✅ 1 条 |
| R2 | 扣款金额改回支付时刻活值(`trialQuote.offsetUSD` → `payQuote.offsetUSD`) | `④d 扣款仍按快照 615` · `W6 结算金额全部取自 trialQuote 快照` | ✅ 2 条 |
| R3 | `convert()` 返回值被丢弃 | `⑤convert 拒绝 → 不成交` · `⑤零扣款` · `⑤回报价步 + 提示` · `W7 返回值被判定` | ✅ 4 条 |
| R4 | 展示侧 `trialConversionMode` 改回读原始 `freeTrial.status`(混源复发) | `②grace 内:模式生效` · `W1 不再读原始 status` · `W3 四个 computed 由 trialView 派生` | ✅ 3 条 |
| R5 | 删掉族级兜底闸 `chargeTotal > quotedTotal` | `④b 抵扣跌档 → 拒单不静默多扣 60` · `W10 兜底闸在位` | ✅ 2 条 |
| R6 | 报价快照改成二次重算(`trialQuote = trialQuoteAt(mockServerNow())`) | `W4 报价快照直接取展示侧那次解析` | ✅ 1 条 |
| R7 | 删掉 zh 的 `coTotalQuoteChanged` 文案(守卫哑火) | `W13-zh 文案存在` | ✅ 1 条 |
| R8 | **判据自破坏**:`trialQuoteAt` 改名(切片标记消失) | `die: 切片缺失`,exit≠0 | ✅ fail-closed |
| R9 | **判据自破坏**:③ + ⑤ 固定靶整段删除(44 → 36) | `die: 地板`,exit≠0 | ✅ 样本量地板拦住 |

还原后三个被注入文件(`checkout.vue` / 自检脚本 / `zh.ts`)均 **byte-identical**,复绿 44 asserts。
红测脚本:`<scratchpad>/fix-r2-checkout/redtest.mjs`,输出留档 `redtest-output.txt`。

R1 单独说明:该注入只红一条,是因为固定靶 `①c` 专门为隔离这道守卫而设 —— 强制状态机误放行(`convert` 返回 true),这样 `convert` 兜底不会替它挡住,守卫一被摘掉就必然扣款。若不设这条靶,`①` 的其余断言会被 `convert` 守卫兜住而假绿(合取项互相遮蔽)。

## 运行时证明(真浏览器,`http://localhost:5173/?nx_device=off`)

注入:`nexgrid-trial-accounts-v1` 种 `grace` 行(`shadowFrozenAtUSD=21`),`graceEndsAt` 定在若干秒后;屏蔽 4s 轮询定时器(`App.vue TRIAL_TICK_MS=4000`)= 精确模拟「宽限期刚过、poll 未到」。修复前后跑**同一套注入**。

| | 确认页展示 | 结算时点 | 扣款前余额 | 扣款后余额 | 实扣 | 落点 | 试用状态 | console error |
|---|---|---|---|---|---|---|---|---|
| **修复前** | Subtotal $649 · 试用折扣 −$20.00 · 试用抵扣 −$21.00 · **Total $608** | 越界后 1010ms | 24856.56 | 24227.56 | **$629** ❌ | 已下单(activating) | `ended`(试用被烧掉且没转化) | 0 |
| **修复后** | 同上(**Total $608**) | 越界后 995ms | 24856.56 | **24856.56** | **$0** ✅ | 回 select-payment + 提示「Trial pricing changed」,Total 回全价 $649 | `grace`(未被烧) | 0 |
| **修复后·正常单**(未越界) | 同上(**Total $608**) | 宽限期内 | 24856.56 | 24248.56 | **$608** ✅(== 展示) | 已下单 + NEX 入账 | `converted` | 0 |

修复前**多扣 $21**,正好是确认页展示了、而解析器已归零的那笔试用抵扣。
截图:`<scratchpad>/fix-r2-checkout/{BEFORE,AFTER,AFTER-HAPPY}-{1-select-payment,2-confirm,3-pay-instructions,4-after-settle}.png`。

## 同类消费者全扫(`grep -rn "freeTrial\.\|useFreeTrial()" src/`)

- **涉钱的只有 `checkout.vue` 一处**,已收口。
- 已经走解析器、无需改:`free-trial.ts` 的 `convert / poll / eligibility / liveShadowUSD / liveShadowNEX`(第 1 轮收敛 + `selfcheck-trial-boundary.mjs` 接线门看守);`app-chassis.vue` / `trial-claim-sheet.vue` / `trial-hero-banner.vue` 走 `canStart()/eligibility()`;`App.vue pollTrial` 读的是 `poll()` **推进之后**的状态。
- 读原始 `status` 但**只影响展示、不影响钱**(≤4s 视觉滞后,下一次 poll 自愈),且都在本次文件边界之外:`trial-promo-banner.vue` · `trial-ghost-slot.vue` · `me/trial.vue` · `me/devices.vue` · `me/me.vue` · `me/trial-entry.vue`;以及 `free-trial.ts` 的 `trialReservesSlotNow()`(槽位计数,被 10 处引用,影响的是「槽位已满」提示而非金额)。→ **建议单独一轮把这些也收进 `resolveTrialAt`**,本轮不动(文件边界 + 并发 agent)。
