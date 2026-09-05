# R5 独立验收报告 — scripts/verify 哨兵重焊(Nexion→NexGrid)

- 日期:2026-07-22 · tester:独立验收 agent(非实现方)
- 范围:品牌改名子任务 R5(scripts/ 走查脚本 + verify.sh 哨兵)
- 环境:dev server http://localhost:5173(验收前探活 200,未重启;验收后复探仍 200)

## 结论一览

| AC | 内容 | 结果 |
|---|---|---|
| AC-R5-1 | type-check 0 错 | ✅ PASS |
| AC-R5-2 | verify.sh 完整跑完 0 fail | ✅ PASS(314 pass, 0 fail) |
| AC-R5-3 | scripts/ 无 nexion 品牌残留,键/域/文案与新品牌一致 | ✅ PASS |
| AC-R5-4 | 品牌相关哨兵仍是主动断言未被弱化 | ✅ PASS |

**R5 整体:PASS。**

---

## AC-R5-1 type-check ✅

- 命令:`cd D:/WORKS/PLAN/Nexion-uniapp && npm run type-check`(工程目录内跑,非裸 npx vue-tsc)
- 输出:`vue-tsc --noEmit` 无任何错误行;真实退出码 `TSC_EXIT=0`(用 `PIPESTATUS[0]` 取 vue-tsc 本体退出码,未被管道吞)。

## AC-R5-2 verify.sh 完整跑 ✅

- 命令:`bash scripts/verify.sh > verify-r5.log 2>&1; echo VERIFY_EXIT=$?`(先落文件再读,退出码单独回写,未接管道判断)
- 日志共 321 行,完整跑到收尾(最后一个门 dom-qa core 也 PASS)。
- **result 行原文**(log 第 320 行,含 ANSI 码的原始字节 → 转义呈现):

  ```
  ^[[0;36m━━ result: ^[[0;32m314 pass^[[0m, ^[[0;32m0 fail^[[0m ━━
  ```

  去 ANSI 后即:`━━ result: 314 pass, 0 fail ━━`
- 交叉验证:全文 `grep -c FAIL` = **0**;`grep -c PASS` = **314**(与 result 行一致);`VERIFY_EXIT=0`。
- 关键 runtime 门均真实跑过(非跳过):SPEC-6 entry / R7 device detail / SPEC-7 K1 gate / FEAT-AUTH02 en+zh / SPEC-4 app-sync + session guard / device-yield parity / value-ladder / dom-qa 全 PASS。

## AC-R5-3 scripts/ 品牌一致性 ✅

`grep -rniE "nexion" scripts/` 共 **6 处**,全部为 `Nexion-admin-prototype` 目录溯源引用(允许类):

| 位置 | 性质 |
|---|---|
| dom-qa.mjs:11 · value-ladder-sentinel.mjs:8 | 注释:admin 同源双胞胎脚本路径 |
| verify.sh:459 | `ADMIN_CFG="../Nexion-admin-prototype/lib/mock/admin/compute-config.ts"`(双端 parity 数据源路径) |
| verify.sh:1562/1566/1580 | admin 采样证据单源脚本路径 + 指引文案 |

无任何品牌串/存储键/域名残留。正向核对:

- **存储键**:scripts/*.mjs 内全部版本化存储键字面量 = 10 个,全为 `nexgrid-*-v1`(account-cloud / account-sessions / bills-accounts / commission-accounts / device-id / milestones-accounts / orders-accounts / risk-registry / sponsorship / v3-staking-accounts);src/ 侧 `grep -rn "nexion-" src/` = **0** 命中,src 存储键同为 `nexgrid-*-v1` 全套 —— 脚本键↔app 键一致(且 SPEC-4/6/7 runtime PASS 从运行时证明注入键真被 app 读到)。
- **账号域**:auth-register-existing-runtime.mjs 8 处全部 `@demo.nexgrid.ai`(行 7/382/384/386/388/501/702/748)。
- **文案断言**:auth-register-existing-runtime.mjs:24-25 `"Welcome to NexGrid"` / `"欢迎加入 NexGrid"`(en/zh 双语,verify.sh:916 循环真跑且双双 PASS = app 实际渲染的就是新品牌文案);release-gate-walkthrough.mjs:121 `await domClick(/NexGridBox Pro v2/)` 设备名已随品牌。

**观察项(非缺陷,LOW 风险)**:内部 SKU `kind` 标识符仍为 `stellarbox-s1/-pro/-pro-v2`(scripts 与 src 两侧一致,src 68 处)。这是代码内部 id 非用户可见品牌(同行可证:market-board.vue:105 `kind: "stellarbox-pro"` 对应用户可见名 `"NexGridBox Pro"`),与 verify.sh:1231 NOVA/Stella「内部标识符豁免、用户可见必新品牌」carve-out 同一先例;改它会牵动持久化设备数据迁移,不属 R5 范围。

## AC-R5-4 哨兵未被静默弱化 ✅

机制:`sentinel_present`(verify.sh:55)= `grep -qE pattern file`,缺失即调 `bad()` → `fail=fail+1` → result 行计 fail + 退出码非 0。是硬断言,不是提示。

verify.sh 内引用 nexgrid 的哨兵共 5 处,**全部为顶层主动调用,无一被注释/包进跳过分支**(抽查上下文均为顺序执行区):

| 行号 | 哨兵 | 断言内容 |
|---|---|---|
| verify.sh:302 | `sentinel_present "SPEC-7 risk registry isolated storage" src/store/risk-identity.ts 'nexgrid-risk-registry-v1'` | 风控注册表独立存储键 |
| verify.sh:309 | `sentinel_present "SPEC-7 release ledger exists (R1)" src/store/earning-release.ts 'nexgrid-earning-ledger-v1'` | 释放台账存储键 |
| verify.sh:927 | `sentinel_present "SPEC-4 account-cloud storage exists" src/store/account-cloud.ts 'nexgrid-account-cloud-v1'` | 账号云快照存储键 |
| verify.sh:934 | `sentinel_present "SPEC-4 session registry storage exists" src/store/session.ts 'nexgrid-account-sessions-v1'` | 会话注册表存储键 |
| verify.sh:980 | `sentinel_present "P2-8 milestones spec6 guard tracks new key" scripts/spec6-entry-surface-runtime.mjs 'nexgrid-milestones-accounts-v1'` | 守卫脚本自身跟踪新键(哨兵盯哨兵) |

品牌相关 runtime 断言同样在跑:verify.sh:916 `for AUTH02_LOCALE in en zh` 循环调用 auth-register-existing-runtime.mjs(内含 Welcome to NexGrid 断言),失败路径是 `bad`,本轮 en/zh 双 PASS。

AC 例举的「设备名 parity」核实定性:verify 链内的设备 parity 门是 `device_yield_parity`(verify.sh:1314-1321,调 check-device-yield-parity.mjs),按 SKU id 比对**数值**(宣传=实发),设计上品牌中性,改名无需重焊、本轮 PASS;字面设备名断言在 release-gate-walkthrough.mjs:121(独立 gate,已用新名 NexGridBox Pro v2)。i18n 结构 parity(i18n-key-mirror,verify.sh:71)与品牌串守卫(no_userfacing_stella,verify.sh:1238-1245 主动调用)均在跑。

## 清理

- verify 结束后扫描:**无** ms-playwright 孤儿 chromium 进程(verify 各 playwright 脚本自身收尾干净);真实用户 Chrome(39 进程)未触碰。
- dev server 5173 验收前后均 200,未重启。
