# 远端刷新韧性门修复(z6 轮)

**Status**: Shipped(分支 pkg/z6-wd-debit-selfheal)
**Why**: `selfcheck-remote-refresh-resilience` 13 FAIL——10 条刷新缝在权威不可达时 reject 冒泡、
free-trial 缝在 harness 里加载即崩、基数台账过期(16 vs 实扫 27)、真凭据断言连带红。

## 判据锚层决策:「缝必须 resolve」(维持门现有不变量)

不选「fire-and-forget 调用点必须带 .catch」。理由:

1. **语义归属**:27 条缝全是远端读路径(拉快照刷视图),无一是资金动作。「权威不可达→降级态」
   是读路径自身的契约,焊在被调用方后,开放的消费面(含未来新增调用点)自动安全;
   调用点方案每新增一个裸 void 就漏一个。
2. **门的强度**:现门是运行时行为门(esbuild 载真 store 真 await);调用点方案必然退化成
   文本形状门——`.catch(() => {})` 存在 ≠ 降级正确,且 catch 回调自身 throw 照样 unhandled。
3. **本仓既有 idiom**:cards / quest / daily-powerup / voucher / event-quest / nex-faucet /
   free-trial 七个 store 的刷新缝早已是「自吞返 boolean」——本轮是把剩余 10 条对齐既有惯例。
4. **需要失败信号的消费方改走返回值 / store 状态字段**,逐点分档(见下表)。

**例外(preparePendingRun ×2)**:conversations / tickets 的 `preparePendingRun` 多数消费方
(refresh / load / reconcile)**靠 reject 工作**(error 横幅、load throw)→ 契约保持 reject,
只修 bindAccount 里的裸 `void ...().then(...)` 调用点(加 `.catch`)。门的 rejection 计数断言
覆盖此路径(红测 3 证明)。

## 逐缝分档

| 缝 | 原形态 | 修法 |
|---|---|---|
| app#refreshRemoteFleet | 降级完备后重抛 | `Promise<boolean>`,去 throw;773 死兜底 catch 清 |
| bills#refreshFundsSandboxLedger | 降级完备后重抛 | 去 throw(保持 void;页面横幅走 serverError 双源);251 死 catch 清。PROVIDER_NOT_CONFIGURED 配置错误 throw 保留(信号型) |
| deposits#refreshFundsSandboxDeposits | 同 bills | 同 bills;185 死 catch 清 |
| commission#refreshCanonicalBinary | 裸 await 无降级 | try/catch 吞,保持清空态 |
| v-rank#refreshCanonicalVRank | 裸 await 无降级 | try/catch 吞,保留现值 |
| genesis#syncRemote | public 段裸 await | try/catch 吞,保留 hydrate 现值(⚠️ 该文件修法被并发会话 commit 673c1fc 裹挟入库) |
| payout-address#refreshRemote | 裸 await | `Promise<boolean>`;superseded 返 true(非失败事实);saveRemoteAddress 动作路径把 false 升 `PAYOUT_ADDRESS_READBACK_UNAVAILABLE` throw |
| repurchase#refresh | 分支降级完备后重抛 | 去 throw 改 `return null`(同 mock 分支先例);176 死 catch 清 |
| staking#syncRemote | 降级完备后重抛 | `Promise<boolean>`,去 throw;242 死 catch 清 |
| free-trial#refreshRemote | 已自吞返 boolean(合规) | 不动;修 harness(见下) |

## 消费面改动(靠 reject 工作的信号型,逐点换信号源)

- staking.vue:199 `.catch(toast stale)` → `.then((ok) => !ok && toast)`;185/200/stake-sheet:195 死 catch 清
- rebind.vue:537 `.catch(toast startFailed)` → `.then((ok) => !ok && toast)`
- checkout.vue / tradein-sheets.vue 的 `completeVerifiedMutation` 适配层:`refreshFleet` 把 false 升
  `E3_FLEET_REFRESH_UNAVAILABLE` throw(验证链语义保真,不再误报 READBACK_MISMATCH);
  `handleNoActiveDeviceDecision` 的适配点保持吞(coordinator 注释明言 best-effort)
- tradein:666 keep-buy 手工 await 同样升 throw(保持「刷新失败→toast 重试」原行为)
- checkout:933 `void orders.refreshRemote()` 裸发补 `.catch`(见门盲区)
- App.vue / profile / wallet-withdraw / 各 store bindAccount 的死 `.catch(() => undefined)` 清理
- earn.vue:150 的死 catch **未清**(当时该文件正被并发会话修改,避让;行为无损)

## 门自身修复

1. **esbuild define 补 env**:`runtime-config.ts` 模块加载期读 `import.meta.env.VITE_*`,
   free-trial 模块图拉进它即 TypeError(13 FAIL 里形态特殊的那条)。补三个 VITE_ 键靶态值 +
   `"import.meta.env": "{}"` 兜底(最长匹配优先),未来新增 env 键读 undefined 而不是崩。
2. **EXPECTED_SEAMS 16 → 27**:27 条逐一回源确认全部是「remote 开 + void 触发」的远端读缝;
   新增 11 条系 z1 R2 扫描面三族扩收后进来的既有缝,非本轮新增行为。
3. **已知盲区注释**(独立审计后修订):真正的盲区 = 跨文件声明/调用对(.vue 与 .ts 均算)
   + 无 void 关键字的裸调用(定时器回调)+ 非 async 声明的 promise 包装函数。已核成员:
   orders#refreshRemote(调用点全带 catch,契约保留 reject;checkout:933 补 .catch)、
   order-canonical / use-remote-account-state(自吞,安全)、market#syncRemote(**审计 P0
   实锤**:wallet-nex 的 setInterval 裸发 tickPrice,原 throw 每 3s 一个 unhandledRejection
   ——已改自吞返 boolean,三处死 catch 同步清理)。扩面到跨文件扫描待议。

## 审计轮(nexion-audit,两 skeptic 对抗证伪)

- **P0×1 修复**:market#syncRemote 自吞化(见上)。
- **P1×5 处置**:①payout saveRemoteAddress 回读改直读服务端(并发后台刷新抢 version 会让
  superseded→true 假成功——回读在写之后单调最新,++version 作废在飞旧读后直接应用);
  ②③盲区表述修订(见上);④esbuild define 解构盲区记入门注释(当前 0 使用,dormant);
  ⑤门增第 6 断言:boolean 缝靶态下必须 false(反「谎报成功」),红测类 6 配套。
- **P2×5 记录不修**:app.ts 双切号竞态残留 loading(新行为更正确,5s 自愈);wallet-bills
  死 try/catch(serverError 双源已盖);checkout 合成错误 kind 恒 network(方向保守安全,
  幂等键保留=防重复下单);genesis.ts:475 死 catch(已清,升级为修);earn.vue:150(已披露,
  等 trial 线)。

## 红测(变异→门必红→还原,5/5)

| # | 变异 | 门反应 |
|---|---|---|
| 1 | staking catch 恢复 throw | 缝 FAIL + 真凭据 26≠27 连带红 ✓ |
| 2 | v-rank catch 改不吞 | 同上 ✓ |
| 3 | conversations bindAccount 摘 .catch | unhandledRejection=1 红 ✓ |
| 4 | 摘 define env 键 | free-trial 原始崩溃复现红 ✓ |
| 5 | EXPECTED_SEAMS 27→26 | 台账断言红 ✓ |

还原后终态:5 pass / 0 fail,EXIT=0(直读,非管道)。`REDTEST-MUTATION` 残留 grep = 0。
