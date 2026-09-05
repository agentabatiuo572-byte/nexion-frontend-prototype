# Change Proposal — NEX 改造 + 取消 Premium + 取消质押

- **日期**: 2026-06-17
- **状态**: Aligned（主人已 4 项拍板）→ 实现中
- **工作线**: ④ uniapp（前端唯一实现面）+ ② admin 后台（跨线）
- **slug**: nex-points-premium-refactor

## Why
主人新需求：① 全项目取消 premium；② NEX 取消质押、NEX 取代积分，提现摩擦由「积分硬绑/硬拦截」改为「NEX 优惠抵扣手续费、无 NEX 则高费率但仍可提」；③ NEX 保留兑换 USDT，但抵扣手续费时按高于市价的优惠率换算；④ 前端 + 后台一致性修改。

## 主人拍板（4 项）
1. **范围** = 仅活跃面（uniapp + admin）；H5 已冻结保持原样。
2. **费模型** = 统一优惠抵扣模型。
3. **全额抵扣后** = 完全免费（烧够 NEX → $0 费）。
4. **质押** = 只删 **NEX 质押**（主人 2026-06-17 澄清：USDT 质押保留）。admin G1 留 USDT 档删 NEX 档；账本删 #8(NEX 池)留 #2/#3(USDT)；前端 staking 页/store/复投/staking_boost 全留，只清 NEX 的质押角色文案/入口。

## 核心模型（提现费 + NEX 抵扣）
后台可调单源参数（uniapp `product-phase.ts` ↔ admin `D.withdraw.*`，结构镜像、可接真后台）：
- `withdrawPenaltyFeeRate` = 0.20（无 NEX 时按金额 ×20% 收惩罚费）
- `nexFeeOffsetRate` = 0.40 USDT/NEX（1 NEX 抵 $0.40 手续费；市价 ~$0.027 → ~15× = #3「高于兑换价值」）

计算（提现金额 A）：
1. grossFee = A × penaltyFeeRate（$100 → $20）
2. requiredNex = ceil(grossFee / nexFeeOffsetRate)（$100 → 50 NEX）✓ 对齐主人「100 需 50 NEX」
3. nexBurned = min(userNex, requiredNex)
4. feeWaived = min(grossFee, nexBurned × nexFeeOffsetRate)
5. actualFee = grossFee − feeWaived（烧够 → $0）
6. **无硬拦截**：NEX 不足也能提，按 actualFee 收费；userReceive = A − actualFee
7. KYC/钱包配对门照旧（与费用独立）

示例（A=$100，rate 20% / offset $0.40）：
- 0 NEX → fee $20，到账 $80
- 25 NEX → 烧 25，抵 $10，fee $10，到账 $90，NEX −25
- ≥50 NEX → 烧 50，抵 $20，fee $0，到账 $100，NEX −50

## What changes
### Premium 移除
- uniapp: earn `taskLock*` 文案去 "Premium" 措辞（保留设备升级漏斗，改「更高算力档」）；`unilevel.rateTiers.premium` 改名；market-board / quick-action-row 等引用清理；en/zh 镜像。
- admin: 已 2026-06-15 下线，清 b.ts/h.ts/j.ts/g.ts 死引用与「7 闸含 Premium」措辞。

### NEX 质押移除（USDT 质押 + 复投全保留）
> 主人 2026-06-17 澄清：USDT 质押保留，只删「NEX 质押」。前端 staking store 已是纯 USDT；复投是 USDT 90 天锁仓，保留。
- uniapp **保留**：`pages/staking/*`、`store/staking.ts`、`components/staking/*`、复投(`wallet-repurchase`)、staking i18n namespace、`staking_boost` powerup。
- uniapp 删 NEX 质押角色：wallet-nex 2 个 NEX→质押入口（quickCells stake 删→grid-cols-3 / useTiles stake→替换为 feeOffset tile 指向提现页）；nexInfo 去「质押」；NEX 质押奖励文案（walletExplainer src3「质押利息以 NEX 支付」/use3「质押锁定 NEX 收益」）删；zh:966「NEX…质押」去质押；orphan i18n(nexWallet.actions.stake/useNex.stake/stakeSub)删，加 useNex.feeOffset/feeOffsetSub。
- admin 删 NEX 质押档：G1 保留删 `NEX_TIERS`(nex30d/90d/180d/365d)留 `USDT_TIERS`；g-tabs/data.ts 删 NEX 池/NEX position 样例；ledger.ts 删 #8 lock_other(NEX 池 0.25M)留 #2/#3 + 覆盖率重算；registry/g-view 注释改「Staking USDT-only」；kill-switch 质押闸**保留**(USDT 质押在)。⚠️ agent B 误「全删」已 git 还原（$649 预存定价工作完整保留）。

### 提现费新模型
- uniapp `wallet-withdraw.vue`：删旧「硬燃烧 NEX + needMoreNex 硬拦截 + 2% 网络费」；接新模型计算 + 费用明细 UI（grossFee/烧 NEX/抵扣/实付/到账）；`nex-faucet.ts` 的 `nexRequiredFor` 改为新 requiredNex 派生；`product-phase.ts` 用新参数替换 `withdrawalNexPer100`。
- admin D5(`d5-params.tsx`)/H1：新增 `D.withdraw.penaltyFeeRate`、`D.withdraw.nexFeeOffsetRate` 可调（setParam + 审计 + B1 红线方向判定）；旧 nexGate(10/$100) 语义迁移。

### 兑换（保留）
- `wallet-exchange.vue` 功能不动；可选加一句「NEX 抵手续费比兑现更划算」提示（低优先）。

## Impact
- 页面：uniapp staking(删)/wallet-withdraw(重写费)/earn(文案)/me/search/genesis；admin G/D/H/J/B 域。
- store：uniapp staking(删)/nex-faucet/product-phase/bills；admin platform-config/ledger。
- i18n：staking/walletV3.stakeAlt/headerTitles.staking/earn.taskLock/unilevel.premium（en+zh 镜像）。
- 不变量风险：单源账本（删账户须覆盖率不崩/无 NaN）、双语镜像、mock 可接真（新费参数结构化）、数字可信、on-brand 文字色。
- PRD 章节：前端提现/质押章；后台 D/G/H/J 域 + 经济模型（待主人确认后同步）。

## Done-when（P6 逐条回测）
1. uniapp `grep premium`（除无关词）= 0；NEX 质押角色清零（wallet-nex 无 NEX→质押入口、nexInfo 无质押、NEX 质押奖励文案删）；USDT 质押页/store/复投/staking_boost 保留可用。admin NEX 质押档清零、USDT 档保留。
2. uniapp 提现实景：0 NEX 提 $100 → 成功、费 $20、到账 $80；25 NEX → 烧 25、费 $10、到账 $90；≥50 NEX → 烧 50、费 $0、到账 $100，余额 −$100 & NEX 相应减。无硬拦截。
3. admin：G1 留 USDT 档、NEX 档消失；账本去 #8(NEX 池)后覆盖率自洽（无 NaN）、#2/#3 保留、质押闸保留；新 2 个提现参数 setParam 可改 + 审计 + 单源镜像前端。
4. 机器门：uniapp vue-tsc 0 + verify.sh 绿；admin tsc 0 + verify.sh 绿；i18n 硬编码 grep=0；两端改动路由 console=0。

## Out of scope
- H5（冻结）。
- 兑换核心机制改动（仅保留 + 可选提示）。
- NEX 赚取侧（faucet/daily/mining 已是积分替代，保持）。
