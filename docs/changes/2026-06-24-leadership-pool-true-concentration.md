# Change 提案：领导池「头部集中」叙事落地为真 + 双端单源 canon

**日期**：2026-06-24 ｜ **状态**：Shipped（实现+3轮audit P0=P1=0+双端PRD同步完成 2026-06-24；主人拍板「补机制让叙事成真，做能配合前端业务的真实原型」）
**工作线**：④ uniapp 前端（主） + ② 后台原型 + 双端 PRD（跨线）

## Why

多 agent 审查发现领导池模型无双端单源：后台硬编码「顶部10人吃池≈80%」但前端纯按票比例派生、真值仅 7.85%（自曝失真）；参与门槛 V3/V8/V6 三套打架；周池额 $487k/$214k/$96.4k 三源；结算时点前端文案周一 / store 数学落周四。主人决策走「头部集中」方向——**补机制让叙事真正成立**，而非删叙事。

## What changes（核心 = 让「头部集中」成为可派生的真事实）

### 1. 单源 canon（前端 store 为业务真源，后台镜像，backend-replaceable）
```
WEEKLY_GMV_USDT = 9_746_420       // 周平台 GMV 基数（真后台来自 GET /api/pool/state）
POOL_RATIO      = 0.05            // 5%，运营可配 F.pool.ratio
poolUSDT        = round(GMV×ratio) = 487_321   // 派生，不再三处硬编码
MONTHLY_CAP_USDT= 2_600_000       // 运营预算护栏（月池~2.11M < cap，非约束，可配 F.pool.monthlyCap）
UNLOCK_RANK     = 3               // V3+ 解锁（运营经 F1 配 V3 门槛）
voteWeights     = V3=1 … V12=512  // 指数翻倍，单源 = v-rank.ts leadershipVotes
```

### 2. 重校准 `GLOBAL_V_DISTRIBUTION` 为真实领袖金字塔（让指数权重真正集中到头部）
旧 seed 的 V8–V12=0 人，导致 487 个 V3 按人头碾压、份额倒挂向底部（与叙事相反）。新 seed：
```
V0:84231 V1:12483 V2:3247 | V3:360 V4:84 V5:27 V6:11 V7:6 V8:4 V9:2 V10:2 V11:1 V12:1
```
**实算结果（node 验证）**：合格领袖 498 人 · 总票 2100 · **顶部 10 名领袖（恰为 V8 星上将及以上 10 人）分走 61.0% 奖池**——头部集中**为真**，且 `topConcentrationPct` 由 (分布×票权) 运行时派生，永不硬编码。

样本周分红（可信诱人档）：V3 尝鲜 $232/周 → V6 $1,856 → V8 $7,426 → V10 $29,703 → V12 顶 $118,814/周。

### 3. 结算周界对齐周一（修 epoch 周四 bug）
`weekStart = now - ((now - 4×ONE_DAY) % ONE_WEEK)` → nextPayout 恒落周一 00:00 UTC（node 验证：周一/周三/周日 now 都 → 下周一）。口径统一为「周日 23:59 UTC 快照 → 周一 00:00 UTC 派发」。

### 4. 派生展示，删散落硬编码
- 前端 page/card 份额精度 toFixed(3)→toFixed(1)/区间；新增「顶部集中度」叙事接 `topConcentrationPct`；how 页 share 列改从 store 派生。
- 后台 f4-ops：删 4 处假「80%」→ 接镜像 canon 派生真值（61%）；门槛 V8/V6→V3+；池额从 GMV×ratio 派生（消 f4↔registry 冲突）；log2 柱读 pget（声明=实现）；结算措辞统一。
- registry/f.ts：权重「V6:1/V9:2/V12:3」→指数翻倍口径；门槛 V6/V8→V3+。
- 清 v-rank.ts `leadershipShareApprox` 死字段（若无消费）。

### 5. canon 哨兵（机器门，防再漂）
运行时从 (分布×票权) 算 顶部N占比/参与人数/各档份额，与前后端文案出现的数字断言；池额三端同源；grep 全仓无散落「80%/V8/$214k/$96,400/顶部10人」硬编码。挂 uniapp + admin 两端 verify。

## Out-of-scope（本次不做）
- 不改 V-Rank 晋升条件/其它佣金线（仅领导池）。
- 月 cap 不实现完整 rollover 状态机（当前月池 < cap 非约束，仅作运营预算护栏展示，口径自洽即可）。
- 大使队列重构 / F5 冷却模型 列为后续（本提案聚焦池子集中度叙事成真）。

## Impact
- 页面：`team/leadership-pool.vue`、`team/leadership-pool-how.vue`、`components/home/leadership-pool-card.vue`
- store：`store/leadership-pool.ts`（canon 真源）、`store/v-rank.ts`（清死字段）
- i18n：`zh.ts`/`en.ts` pool + poolHowItWorks namespace
- 后台：`f4-ops.tsx`、`f-tabs/data.ts`、`registry/f.ts`、（必要时 platform-config seed）
- PRD：前端 §8.5 / 后台 PRD F4（机制+结算周界+集中度派生口径）
- 不变量风险：双语镜像、mock 可接真、单源派生、数字可信不自曝、on-brand、mobile-first

## Done-when（P6 逐条回测）
1. 前端 `topConcentrationPct` 运行时 = (分布×票权) 派生真值（≈61%），页面/后台显示同一数；grep 全仓「≈80%」领导池硬编码 = 0。
2. 参与门槛全栈单源 V3+：前端/后台 f4-ops/registry/PRD 四面一致，无 V8/V6 残留。
3. 周池额单源：前端=后台 f4=registry，均 = GMV×ratio 派生；注入旧 persist 不白屏。
4. 结算 nextPayoutTs 实测落周一；前端文案/后台 f4/registry 措辞统一「周日快照→周一派发」。
5. 两端机器门绿（vue-tsc/tsc 0 + verify 全绿 + 新 canon 哨兵）、实景 console=0、nexion-audit P0=0。
