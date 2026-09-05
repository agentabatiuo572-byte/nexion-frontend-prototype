# verify 三档制 + 门链去重 · 实施方案

> 配对提案:`2026-08-17-verify-tiering.md`(同目录;原稿 `D:\WORKS\PLAN\WORKFLOW-PROPOSAL-verify-tiering-2026-08-17.md`,主人 2026-08-17 拍板 Q1A-Q5A;Q3 同日签 A)· **定级**:L · **包**:`pkg/ar-verify-tiering`(worktree `.claude/worktrees/ar-verify-tiering`)+ admin-ops `pkg/as-verify-runall`(已合并 origin/main 94da56b)
> **北极星**:门仍绕不过、宣布 done / 合并前必有一次全量绿;但内循环从 ~30 min 降到分钟级,全量去重;任何跳过三态点名。
> **状态**:Done(待 pkg.mjs close 合并)

## 子任务

### [x] T2 · 链 runner + tsc 缓存壳 + h5 探针只跑一遍 + 跑完汇总
- **范围**:`scripts/verify-chain.mjs`(新)`scripts/typecheck-cached.mjs`(新)`scripts/lib/verify-scope.mjs`(新)`scripts/lib/dev-server-pool.mjs`(新)`scripts/lib/find-bash.mjs`(新)`scripts/verify-h5-runtime.mjs` `scripts/run-legacy-suite.mjs` `scripts/verify.sh` `package.json` `.gitignore`
- **AC 结果**:AC1 ✅(不 fail-fast,五态汇总,记录 last-run.json/.verify-chain.code)· AC2 ⚠ 全量实测 25.8 min(≤18 未达;基线 29.1;h5 探针只跑一遍、tsc 缓存生效;server 共享 pool 因抖动/拥塞默认关)· AC3 ✅ 注入 tsc 错→红(修正:`--incremental` 双向假结论,已禁用并加 selftest);改 src→缓存失效;树指纹不等→h5 门拒绝复用(实景负向证据)
- **tester 报告**:`2026-08-17-verify-tiering-tA-test.md`(A1/A2/A4-A10 PASS;A3 机制 PASS 干净计时 NOT-TESTED;P0 修后复验通过)
- **回源三问**:① 仍服务北极星(门未放宽,只去重 + 缩范围)② 偏差 = 预估过乐观(全量 15→~24、static 1.5→3-4;规格未错、实现无错,数字已回填提案 §8)③ 下步成立(T3-T6 照做)

### [x] T3 · verify.sh 范围化:manifest + `scope_hit` + 三态 + static 模式
- **范围**:`scripts/verify.sh` `scripts/gates.manifest.json`(新)`scripts/lib/verify-scope.mjs`
- **AC 结果**:AC1 ✅(store 改动 → 15/20 门 RUN、`login-entry-chrome-runtime` SKIP;结果行三数与 plan 对上)· AC2 ✅(命中全局清单升 full)· AC3 ✅(未声明门照跑)· AC4 ✅(static 无 server 434/0/16,exit 0)· AC5 ✅(manifest lint 注入 bogus 即红)
- **tester 报告**:同上 tA
- **回源三问**:① 是 ② 偏差:scoped 对 store 类改动接近全量(清单口径粗)——规格粒度问题,已记 §8 下一步拆细 ③ 成立

### [x] T4 · Stop hook 改 static + 合并守卫 + 红测
- **范围**:`.claude/hooks/verify-on-stop.mjs` `PLAN/.claude/hooks/verify-fresh-before-merge.mjs`(新)+ `test-verify-fresh-before-merge.mjs`(28 条)`PLAN/.claude/settings.json` `D:/WORKS/PLAN/scripts/pkg.mjs`
- **AC 结果**:AC1 ✅(树未变 1s;只改文档 1s;功能面变了跑 static;红 exit 2)· AC2 ✅(tester B 对抗抓出 P1 ×1 + P2 ×5:-m 后置多词消息可冒充主线树 / +ref 强推 / 裸 push / origin HEAD / 全局选项 / -C 指别仓误判 / 阀裸子串误消费 —— 全修,焊进红测 17→28 条)· AC3 ✅ hooks-selftest 0 FAIL
- **tester 报告**:`D:/WORKS/PLAN/.claude/evidence/verify-timing-2026-08-17/tB-hooks-test.md`
- **回源三问**:① 是 ② 偏差 = 解析器实现漏洞(实现错,已修)③ 成立

### [x] T5 · 元门:manifest lint + `--deep` 双跑比对
- **范围**:`scripts/verify-scope-audit.mjs`(新)`scripts/verify.sh`(lint 一格)
- **AC 结果**:lint 注入漏配即红 ✅(tester A A7);`--deep` 脚本落地未跑(两遍全量成本;改 manifest 时按 CLAUDE.md 指引跑)
- **回源三问**:① 是 ② 无 ③ 成立

### [x] T6 · 工作流文本
- **范围**:nexion-workflow SKILL(P2/P3/P5/§8/路由表②④)· done-review ⑥ · nexion-prd-sync Step1 · nexion-uniapp-port §2 · nexion-audit Step0 · nexion-sprint(admin-ops 口径)· WORKFLOW.md [4][5]/§三/§四 · uniapp CLAUDE.md · EVOLUTION-LEDGER WF-18/WF-19 · audit-routing 路由表②
- **AC 结果**:audit-routing 只剩既有 ⑤ 两红;文本无「无机制的增量」句;三档命令与耗时口径已按实测回填
- **回源三问**:① 是 ② 无 ③ 成立

### [x] T7 · admin-ops verify.mjs 同款
- **AC 结果**:64 齿跑完汇总、pass 计数、gear 27/44 合一、gear 31 走解析器、gear 65 显式 skip、`--static`/`--only`、last-run.json;tester C 6/7 PASS(1 条判据字面项:注释里提到旧路径)· 已合并 origin/main 94da56b
- **tester 报告**:`admin-ops/docs/changes/2026-08-17-verify-runall-tC-test.md`

### [x] T8 · 陈旧 hook 修复
- **AC 结果**:audit-pending-tracker 覆盖 admin-ops app/lib + worktree 路径(红测 17+19)· admin-ops/.claude/settings.json 挂同一套门 · 退役线 Stop tsc hook 摘除 · 19 个残留阀归 .trash · 健康检查改双栈探测(janus 假 down 修)· tester D 全 PASS + F1-F4 已修
- **tester 报告**:`D:/WORKS/PLAN/.claude/evidence/verify-timing-2026-08-17/tD-hooks-test.md`

### [x] T9 · 审计轮次收敛(主人同日签 A)
- **范围**:`PLAN/.claude/workflows/nexion-audit-ledger.mjs`(新,init/args/merge/resolve/summary/selftest,守恒核对 + 篡改检测)`nexion-audit-v4.mjs`(范围轮只审改动 + open finding 单元;killed 未变不派 skeptic;open 未变 carried;P2 carried 记数;done 须全量轮)`nexion-audit/SKILL.md`(模式 A 步骤 + 完成条件 + 报告 open 曲线)
- **AC 结果**:selftest 12/12 → R3 后 27/27;逻辑自证 PASS;tester E 三轮报告 `D:/WORKS/PLAN/.claude/evidence/verify-timing-2026-08-17/tE-audit-ledger-test.md` / `-r2.md` / `-r3.md`(R1/R2/R3 发现全修)
- **回源三问**:① 是(不设轮上限 / 全报 / 独立性未动;台账 = 事实交底)② 待 tester E ③ 成立

### [x] T10 · 包 ax:清单拆细(pages 闭包)+ 探针路由级范围 / 多 lane 并行(主人 2026-08-17 批 A+B;分支 `pkg/ax-probe-scoping`)
- **范围**:`scripts/lib/import-graph.mjs` `scripts/lib/probe-routes.mjs`(新)· `verify-scope.mjs`(pages / 壳闭包 / runIfAny / deleted-src / routeScoped 门级 routes / lint 五项)· `gates.manifest.json`(pages + routeScoped 声明,伞门 inputs 对齐)· `verify-chain.mjs` `verify-h5-runtime.mjs` `verify.sh`(H5_PROBE_ROUTES / route_scope / scope_hit 清空)· 7 个探针接线 · `scripts/verify-scope-lib.test.mjs`(挂 test:probe-safety)· zero-border 基线 159→86
- **AC 结果**:lint PASS + 红测(pages 不存在 / 非登记页 / glob 不命中 / 探针路由未覆盖 / pages 字符串 / route_scope 漏调·多调 全红);库测试 5/5;plan 模拟(单页 → 6-10/20 门 · 1/91 路由;壳下游 → 全路由 · auth-guard 跑;删 src → 全开;globals → full);各探针 A/B(原版 vs 现版 vs concurrency=1)结论一致;full 18/18 16.2 min;scoped 单页 157s;deep 双跑 PASS(scoped 15 PASS / 3 SCOPED-SKIP · full 18/18 14.8 min · verify.sh 462 格守恒;首跑抓出多格门 7 格差 → manifest cells 声明后复跑守恒);tester F 报告 `D:/WORKS/PLAN/.claude/evidence/verify-timing-2026-08-17/tF-probe-scoping-test.md`(0 P0 / 5 P1 / 10 P2 → R1 全修)
- **R2(合并后复验,包 `pkg/ay-scope-r2`)**:tester-F R2 报告 `…/tF-probe-scoping-test-r2.md`(0 P0 / 1 P1 / 9 P2):R2-01 orphan 并行档少检 2/40 段 → 该门固定串行;R2-03 settleNetwork 用实际 lane 数(scoped 单路由不再白等 ~2s);R2-04 `src/static/**` + `src/uni.scss` 进 globals;R2-02/06/07 三条 lint(声明页必须在探针射程内 / route_scope 必须在 scope_hit 之后 / 两伞门 inputs = verify-h5-runtime + 全部子探针);R2-08 注释;R2-09 单测动态找壳独有文件;F-14 CLAUDE.md 第二处 462。R2-05(cells 值靠 deep 判据 ③ 守,lint 只查类型)记为已知。
- **回源三问**:① 是(full 语义不变:PROBE_ROUTES 一律清空;探针判定逻辑不动,只加有界等待;zero-border 导航语义变了已写明)② tester F R1/R2 报告见上 ③ 成立(既有问题 5 条另列于提案 §4.4,未混入)
- **踩坑 → 进化**:MSYS 把以 `/` 开头的 env 值改写成 Windows 路径(PROBE_ROUTES 整串失效、探针 0 命中却绿)→ 路由 env 一律去前导斜杠 + 两边归一 + memory env 条;同 context 多页共用渲染主线程 → 每 lane 独立 context;并行共用 dev server → 有界 settleNetwork(串行空转);探针停留时长变化会暴露定时弹层类既有违例(ms-card)→ 加等待要核「窗口内会不会多出定时 UI」;tap `--update-ledger` 替换语义踩坑(已还原,报既有问题);闭包模型 = 代码引用面 ≠ 渲染影响面 → 壳闭包兜 App 层下游(tester-F);Bash 工具 10 min 上限会杀前台长命令 → 长跑一律 run_in_background。

## 总回测
- [x] 全量机器门:run#3 full 25.8 min,verify.sh 459/0;既有红 contract-registry(h2 正则过期)本包已放宽守卫形态判据 → 全绿待 close 复跑
- [x] 独立 tester A/B/C/D 报告齐(E 待收)
- [x] hooks-selftest FAIL=0(PLAN + admin-ops)
- [x] done-review 6 维:见收尾汇报

## 进化闭环(本包踩的坑)
- WF-19:派 tester 前没写冻结信号 → 跑到一半改被审脚本;已焊 `audit-dispatch-freeze-guard.mjs`(PreToolUse Agent|Workflow)+ 红测 12 条 + 台账 + memory。
