# 创世节点 · 后台配置对齐 + 预售倒计时 + 二级市场 FOMO 运营引擎

> 规格:`PRD/specs/FEAT-GEN09-admin-parity-fomo.md`(FEAT-GEN09 / GEN10 / ADM-G4c)
> 状态:**Verified — 代码全绿、8 条 Done-when 全部运行时坐实、audit P0=0**;**暂缓提交**(工作树多会话交织,待统一提交)
> 验收日期:2026-07-10　|　工作线:🅰 uniapp + 🅱 admin G4

## Why
主人查后台 :3002/finance-products/genesis 发现配置缺口(售罄跳价/权益/上架/二级挂单均无入口),并要新增二级市场 FOMO 运营引擎(运营挂单用户可真买真入账 + 虚拟成交不入账本)。

## What changes(三单元)
- **GEN09**:阶梯档位可配(tiers[] 增删改)+ 预售锁定倒计时(saleStartAt/showCountdown)+ 商城显隐(showcaseEnabled)+ 权益 4 项可配(perks)。
- **GEN10**:二级运营挂单(opsListings,用户真承接走既有资格门→扣款→入账链)+ FOMO 虚拟成交引擎(自动 tick + 手动注单,**物理解耦不碰 bills/soldSlots/持仓**)+ 盘面统计单源(marketStats)。
- **ADM-G4c**:后台 G4 追加七卡(阶梯表 CRUD / 倒计时 / 权益文本 / 上架 toggle / 挂单 CRUD / FOMO 引擎 / 统计),全走 openActionConfirm(edit 契约 + 理由≥8字 + A2 审计)。

## 验收:8 条 Done-when 全绿(运行时证据)
| # | 判据 | 证据 |
|---|---|---|
| 1 | 后台七卡可操作+确认+理由+审计 | 实景:七卡全渲染 console 0;"+增档"弹确认(目标新值+理由≥8字+写A2);ops-actions gate built 141/0 |
| 2 | 改档价→哨兵报红 | 探针:admin t1 9999→9998 报 `tiers[1]漂移` 退出1、还原退出0 |
| 3 | 倒计时未来锁/开关/过去解锁 | 实景三态:"Opens in 8d 05:28:31"→"Sale opening soon"(无时间)→"Claim seat" |
| 4 | showcaseEnabled 关→尊享区消失 | 实景:整区消失无残留 |
| 5 | 承接运营挂单真扣款真入账+挂单消失 | 实景:点#903→bills+1(GENESIS-SEC-903 −14200)+myOwned 1+挂单消失 |
| 6 | 虚拟成交出现+bills 不变 | 实景正交断言:注入#9127→activity 出现、bills 46→46 不变 |
| 7 | 后台改权益→前端同步 | 实景:注入 perks[0]→第1项覆盖、2-4项回退 i18n |
| 8 | 两仓 tsc/verify/canon/i18n/console 0 | tsc 0×2 · uniapp verify 232/0 · canon 逐档绿 · i18n 镜像 · console 0 |

## Audit(nexion-audit v4 五层,4 agent 对抗)
- **genesis 范围 confirmed P0 = 0**(资金链/解耦/门序/状态机全证伪通过)。
- **P1 已修**:`my-token-card.vue` 硬编码 FLOOR=13400 漏读 marketStats.floor 单源 → 改 `computed(cfg.config.marketStats.floor)`(实景坐实:改 floor→持仓卡 $15.0K)。
- **关键 P2 已修**:① `marketplace.vue` genFomoSale band clamp `Math.max(0,min(0.9))`+正价保证 防误配负价;② `genesis.vue` tier labelKey 按位置派生(首wl/末Final/中间Public,运营加档不错位);③ `g4-genesis.tsx` addTier id 唯一化(删中间档再增档不撞号)。
- **对抗 kill 1**:"二级承接不查 preSale"判为 by-design(spec saleStartAt 独立、二级常开受资格+cap 门)。
- **P2 台账(未修,记录)**:sanitizeTiers hydrate minTotal=0(后台 tiersProblem 有完整校验兜底、前端末档 fail-safe 不崩,架构妥协);marketStats hydrate 无 partial 校验;editStat min:0 挡住 floorDeltaPct 合法负值 + 计数字段可填小数;fomoDailyCap 为"每次挂载上限"非单日(ephemeral);genesis.vue 文件头/data.ts unitPrice 9999 legacy 注释 stale。

## 🔴 两个超范围发现(非本任务 WIP)
1. **account-scope.ts:42 语法 bug — 已由并发会话修复**:注释 `session/risk-*/earning-release` 的 `*/` 提前闭合 JSDoc → esbuild 500 + build:h5 会炸(被 31 store import)。并发会话已改 `risk-cluster · risk-identity`,curl 验证 500 解除。**注意:vue-tsc 假绿没抓到此语法错**(机器门盲区)。
2. **app.ts 提现负余额 P0 — 既有全平台,非 WIP 引入**:提现门(app.ts:814)只 check withdrawableUsdt 不 check usdtBalance,debitBalance 只减 usdtBalance 不同步 withdrawableUsdt → 任何购买后可提现超实际余额、usdtBalance 变负。涉全部购买链(checkout/staking/trial/genesis),注释证"Round 7 ported"既有。建议单独任务修(提现门补 usdtBalance check)。

## 待统一提交时的文件清单
**genesis 专属(可干净文件级 add)**:
- 新:`src/store/genesis-config.ts` · `src/composables/use-genesis-sale-gate.ts` · `use-genesis-eligibility.ts` · `src/components/genesis/eligibility-sheet.vue` · `src/components/store/genesis-showcase-card.vue`
- 改:`src/store/genesis.ts` · `src/pages/genesis/genesis.vue` · `marketplace.vue` · `src/components/genesis/my-token-card.vue` · `purchase-sheet.vue` · `src/pages/store/store.vue`
- 删:`src/components/genesis-dock-host.vue` · `src/store/genesis-dock.ts`(dock 折入 genesis.vue)
- admin:`app/components/domain-views/g-tabs/g4-genesis.tsx` · `data.ts` · `scripts/canon-sentinel.mjs` · `docs/ops-actions.manifest.json`(OPS-G-13..18) · `docs/OPS-ACTIONS-MATRIX.md`

**交织共享文件(需谨慎,不能整文件 add)**:
- `src/i18n/messages/en.ts` / `zh.ts` — 混 genesisEligibility(genesis)+ replay 删除 + me-rewards + team 等并发会话 i18n。统一提交时用 patch 分离或整批一起提交。
- admin `manifest`/audit 文档 — 多功能登记交织。

## 提交策略(主人 2026-07-10 拍板)
暂不提交。工作树多会话并行开发,i18n 等共享文件交织,`git add -p` 本环境不可用无法干净分离。待所有并发会话(account-scope / me-rewards / team 等)完成后统一提交。genesis 功能代码已就绪、验收通过,不阻塞。
