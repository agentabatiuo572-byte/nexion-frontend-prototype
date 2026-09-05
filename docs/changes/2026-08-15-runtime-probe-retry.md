# 运行时探针族抖动加固(harness 层可见重试) · Change Proposal

- **工作线**:④ uniapp(scripts/ 门体系 harness 层,非业务代码)
- **日期**:2026-08-15
- **状态**:Shipped(2026-08-15 合并 `3b26371` 并推远端;纯 harness 免 PRD 同步,验收档见同目录 t4-test)
- **来源**:任务卡 task_38c9417f;三轮实测证据见 memory `project_uniapp_crossrepo_gate_pairing`

## Why
同一份代码(811e0f1)连跑 `npm run test:legacy-suite` 三轮,**每轮恰好一个随机运行时探针挂、轮轮不同、复跑自愈**(轮2 AUTH02-zh Frame-detached 崩溃 / 轮3 H5 门 20s 周期守卫场景超时;彼此无依赖重叠)。探针时序余量在本机负载下不够。抖动不治,门体系「红=有问题」的警报语义被稀释(狼来了效应),每次全绿验收平白多花 15 分钟重跑。

**P1-a 既有裁决**:已搜 docs/changes / PORT-PITFALLS / memory(关键词 retry·重试·抖动·flak·轮询·时序·存活性),无「禁止重试」类裁决;同族先例=对单探针做内部硬化(「守卫存活性探针轮询化」,治冷启时序),本提案在**族层**加统一重试,与单点硬化互补不冲突。
**P1-b 前提核验**:「抖动是探针环境脆性、非产品 bug」为 [INFERRED] 高置信(轮换分布 / 复跑自愈 / en-zh 不对称 / detach 是基建拆帧签名 / 专职守卫存活性门 3/3 全绿),但设计上仍保留逃生口——重试**必须大声**,真实的偶发产品 bug 会以「反复 after-retry」形态持续可见,不被静默吞掉。

## What changes
- verify.sh 新增 bash 包装函数 `run_probe_with_retry`:runtime 探针脚本退出非零时**自动重跑 1 次**,以第二次结果为准;首次失败的明细日志保留并打印「⚠ retry」标记。
- **重试必须大声**:pass-after-retry 在该门行尾带显式标记,且总结行追加计数,如 `━━ result: 440 pass (1 after-retry ⚠), 1 fail`。静默重试=吞真信号,禁止。
- **只包 runtime 探针族**(读 BASE_URL / 起 Playwright 的一类,实施第一步精确清点,预估 10-15 个调用点);静态哨兵 / 逻辑门 / 红测自证门**一律不包**(确定性门失败重跑无意义,反而掩盖本不该存在的非确定性)。
- 包装函数自带 selftest(红测三变异,见拆解 T3),与实现同一提交落地。
- **Out of scope(明确不做)**:不改任何被测业务代码;不动单个探针脚本内部的等待逻辑(20s 超时等——重试给了第二个完整窗口,若某探针 1 次重试仍频繁穿透,再按其内部硬化单独立项);不改 run-legacy-suite.mjs 的起服机制;不动 SPEC-7 parity(另一会话在修)。

## Impact
- **文件**:`scripts/verify.sh`(新增函数 + 探针族调用点换包装)+ `scripts/` 新增 1 个 selftest 脚本;预估 2 文件
- **页面/Store/i18n/设计**:无(纯 harness)
- **PRD 章节**:无(不触产品契约;P7 免 PRD 同步,产品更新日志亦可跳——纯环境/门体系改动)
- **不变量风险**:门体系语义——重试只许改变「偶发抖动」的结局,**不许改变「稳定红」的结局**(T3 红测钉死);「焊了规则≠执行了规则」——selftest 断言被包调用点数 ≥ 清点数,防函数写了没人用
- **并发协调**:另一会话正修 SPEC-7(同仓、大概率同文件 verify.sh)。**本提案实现排在其落地之后串行开工**,避免同文件冲突;若其久拖再改用内容锚定 Edit 并行
- **分支**:按包分支铁律落 `pkg/<字母>-probe-retry`(开工时核实字母未占用)

## Done-when(P6 逐条回测)
- [ ] D1 注入「必失败」假探针经包装:重试 1 次后**终判红**,套件退出码非零(稳定红不被洗绿)
- [ ] D2 注入「首败后成」假探针经包装:终判绿,门行带 ⚠ 标记,总结行 after-retry 计数 = 1(重试大声可见)
- [ ] D3 selftest 断言:runtime 族清点数 = 实际被包调用点数,人为解包 1 个调用点 → selftest 红(接线完整性)
- [ ] D4 同机连跑 3 轮 legacy-suite:除 SPEC-7(或其已修态)外 0 条未解释红;如出现 after-retry 标记,逐条留痕可查

## 修订(T4 独立 tester 证伪后,2026-08-15)
- tester 报 P1=1/P2=10(P0=0),合并修:selftest 演习换草稿登记簿(P1-1 常噪)· ⚠ 色码走格式串(P2-1)· 重定向收进函数+首败存档 `.attempt1`(P2-2)· 接线判据锚定行首+绝对路径+弃 `|| echo 0`(P2-3/4/10)· skipped() 也消费标志(P2-9)。
- **偏离原稿一处**:dom-qa/tap-feedback 的 `--selftest` 行经 tester 实锤「顶层真起 chromium」,由不包改**入族**(launch 抖动面真实);theme/zero-border 的 selftest 纯函数先退,维持不包。族=14 脚本/16 调用点。
- 记录不处置:`test:h5-runtime` 第二入口无包装(P2-8);计数门天然不守新增探针(census 有账)。

## 实施拆解(M 级内联)
- [ ] **T1 清点探针族**:grep verify.sh 全部 runtime 探针调用点(读 BASE_URL / Playwright 类),产出清单(文件:行号),区分「包」与「不包」并写入 selftest 的期望数 — AC:清单覆盖三轮日志里出现过的全部抖动成员;测试:清单 vs 16-fail 假红名单交叉核对
- [ ] **T2 实现包装函数 + 换装**:`run_probe_with_retry` 落 verify.sh;T1 清单逐点换装,失败明细日志双份保留(首败 + 终判) — AC:全量 suite 跑通,绿门行为与改前一致;测试:`npm run test:legacy-suite`
- [ ] **T3 红测三变异**(selftest 脚本,同一提交):①恒败探针→终红 ②首败后成→绿+标记+计数 ③解包 1 个调用点→selftest 红;每个变异先证注入生效再看判定(红测铁律:先证起点) — AC:三变异全部按预期变色,还原后复绿;测试:selftest 独立可跑 + 挂进 suite
- [ ] **T4 三轮回归 + 收尾**:D4 连跑三轮取证;独立 tester agent 黑盒复核 D1-D4;EVOLUTION/PITFALLS 记条;memory 更新 — AC:tester 报告齐,Done-when 全勾
