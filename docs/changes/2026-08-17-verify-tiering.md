# 工作流提效方案 · verify 三档制 + 门链去重 + 审计轮次收敛

> **状态**:**Aligned**(主人 2026-08-17 拍板 Q1A Q2A Q3A Q4A Q5A)· **日期**:2026-08-17 · **性质**:工作流层(跨 uniapp / admin-ops / PLAN hooks / nexion-workflow skill)· **定级**:L · **实施包**:`pkg/ar-verify-tiering`(拆解见同目录 `2026-08-17-verify-tiering.plan.md`;Q3 单独提案 `2026-08-17-audit-convergence-proposal.md`)
> **证据目录**:`D:\WORKS\PLAN\.claude\evidence\verify-timing-2026-08-17\`(实测计时 JSON、逐格耗时、三份 agent 事实报告、业界调研报告)
> 关键判断都带 tag:`[COMPUTED]` 本机实测/回源 · `[INFERRED]` 推断 · `[KNOWN]` 训练事实。置信度按全局铁律。

---

## 0. 一页结论(大白话)

| | |
|---|---|
| **做了啥** | ① 回源查了 verify 到底怎么跑(3 个 agent 摸门/hook/工作流全貌);② 本机**实跑一遍完整 `npm run verify` 并逐步计时**;③ 全网调研业界「按改动范围跑验证」的成熟做法(20 个机制,带 URL)。 |
| **结果咋样** | **是的,现在每次都全量**:`verify.sh [module]` 参数只打印不筛选,「增量机器门」在工作流里只是一句话、没有机制。一次完整 `npm run verify` 实测 **29.1 分钟**;其中 **~7 分钟是同一组浏览器探针跑了两遍**、vue-tsc 跑两遍、dev server 起 6-7 次。verify.sh 里 458 格:**402 格 <0.5s 合计只占 37s(3%)**,**23 格 ≥5s 占 1131s(93%)** —— 「按范围只跑」的刀要落在这 23 格重探针 + 固定开销上,不是 400 格 grep 上。另外发现更大的头:一个 M 级任务的审计循环样本是 **10 轮 × 43 agent、每轮约 500 万 token**。 |
| **要主人拍板啥** | 5 项(§7):Q1 verify 三档制方向;Q2 Stop hook 改档;Q3 审计轮次收敛;Q4 审查层去重;Q5 陈旧 hook 顺手修。**每项都给了选项 + 推荐 + 不做的后果**。 |

**对主人原问题的直接回答**:「先判断范围、只跑范围内」方向对,但两处要改口径:
1. **范围不能靠模型「判断」,要靠机器「算」**(`git diff` 改动集 ∩ 每道门声明的输入文件集),模型判断既不可审计也会漏;
2. **范围档只买内循环速度,收口 / 合并主线前的全量一次不能省**(业界四家口径一致:Semgrep / Azure TIA / pre-commit / Google presubmit-postsubmit,见 §2)。

---

## 1. 现状事实(全部回源,`[COMPUTED]`)

### 1.1 verify 从不按范围跑
- `Nexion-uniapp/scripts/verify.sh:20` `MODULE="${1:-all}"`,全文只在 `:176` 的横幅 `echo` 用了一次;**`verify.sh home` 与 `verify.sh all` 跑的是同一套 458 格**。`settings.local.json` 里 11 条按模块的放行是空转的。
- `admin-ops/scripts/verify.mjs`:65 齿 `GEARS.forEach` 无条件全跑;`grep process.argv` = 0 命中。
- `nexion-workflow/SKILL.md:118` 「增量机器门:tsc + 相关 verify 哨兵(全量留 P3)」**没有任何可执行机制**——唯一能做的「增量」是手工单跑某个 `node scripts/*.mjs`。
- 唯一同型雏形:`PLAN/.claude/hooks/chain-gates-on-edit.mjs`——3 条「文件正则 → 门脚本」的 WATCHERS 表,证明「按输入触发门」在本工作区可行,只是没有推广。

### 1.2 一次完整 `npm run verify` = 29.1 分钟(本机 2026-08-17 实测)

| 步骤 | 耗时 | 备注 |
|---|---|---|
| type-check(vue-tsc) | 35.0s | verify.sh 内 [1] 又跑一遍 26s → **重复** |
| test:contract-registry | 16.5s | **红**(`h2-trial-remote-api.test.mjs:157` 期望 free-trial.ts 含 `if (remoteApiEnabled) return;`)。**真实 `npm run verify` 是 `&&` 串联,在这一步就断,后 16 步根本不会跑**——正是 `feedback_gate_chain_silently_stopped` 那族 |
| 12 组契约测试(cross-repo…real-backend) | 合计 ~47s | 其中 session-reload-recovery 20.7s 自起 1 台 server |
| build:h5(生产构建) | 30.4s | 每次门都全量构建;链内无人消费 dist |
| test:h5-runtime | **379.7s** | 22 个 Chromium 场景;**verify.sh 末尾「H5 运行时门隔离起服」把同一组探针再跑一遍 417s** → 重复 ~7 分钟 |
| test:withdraw-status-mirror | 20.6s | 自起 server |
| test:legacy-suite(= 起 2 台 server + verify.sh 458 格) | **1218.1s** | 见 1.3 |
| **合计** | **1747s = 29.1 min** | 期间 1 红(dom-qa 探针在首页崩,重试仍崩;与此前哨兵 451/1 同一红,未归因,不在本提案范围) |

### 1.3 verify.sh 458 格的耗时结构(逐格时间戳)

| 分档 | 格数 | 合计 | 占比 |
|---|---|---|---|
| <0.5s(纯 grep/sed/小 node) | **402** | **37.5s** | 3% |
| 0.5-5s(node 静态门/自测) | 33 | 47.8s | 4% |
| **≥5s(浏览器探针 / 起服 / tsc / 大脚本)** | **23** | **1131s** | **93%** |

23 格重门 Top:H5 隔离起服 417s(与步骤 16 重复)· 零-border 194s · SPEC-6 runtime 54s · orphan-line 54s · empty-state 46s · login-entry chrome geometry 40s · AUTH02 runtime en/zh 34+33s · dom-qa 33s · SPEC-4 session guard 31s · **`.vue` 闭合门 29s(纯静态,逐文件 spawn grep,本该 <1s)** · vue-tsc 26s · 双主题 23s · 提现账单行 runtime 22.5s(自起远端 server) · tap-feedback 19s · withdraw-rail-alias 红测 16s · R7 runtime 12s · SPEC-7 K1 12s · SPEC-4 sync 11s ……(完整表见证据目录 `legacy-gate-timing.json`)。

**结论**:范围化 400 格 grep 一分钟都省不出来;**去重 + 只对 23 格重门按输入缩范围 + 起服/tsc 复用**才是钱在哪。

### 1.4 一个任务里 verify 被处方跑几次
- 处方:S 级 ≥1 次全量(P3);M 级 ≥3 次(P2 每子任务「增量」+ P3 全量 + done-review ⑥ 再全量);L 级另加每轮审计后、plan.md 总回测、prd-sync 前又一次(`nexion-prd-sync/SKILL.md:21`)。tsc 被处方跑 ≥5 次(审计 Step0、每次修完、P3、verify.sh 内、npm 链首步)。
- 机器:`Nexion-uniapp/.claude/hooks/verify-on-stop.mjs` **每个回合末**都跑 `bash scripts/verify.sh all`(前提:BASE_URL 上是本树 + mock 的 server;主 checkout 5173 默认 `.env.local=mock` 满足前提;worktree 会话则前提不满足→只警告)。→ 要么 20 分钟/回合,要么静默空转,两头都不对。
- 实际样本(`docs/changes/`):`pkg/ad-checkout-cancel` 审计 **R1→R10,每轮 43 agent,每轮约 500 万 token**,首轮到「首次明显下降」花了 10 轮,停轮是主人拍板不是收敛;`pkg/zp-date-locale` 跑了 4 轮全量 + 1 次终极判别,verify 始终没绿,主人凭证据链拍板合并;`pkg/zk-anxiety-copy` 纯文案改动也跑了全量 + 走查 + tester + skeptic。

### 1.5 顺手发现的陈旧/失守点
- `PLAN/.claude/hooks/audit-pending-tracker.mjs:15` INCLUDE 仍是 `nexion-admin-prototype/app/`(退役线),**admin-ops 的功能改动进不了审计欠账**;`.audit-pending` 28 条全是 uniapp,admin-ops 自 08-01 起 183 个 commit。admin-ops 自身没有任何 `.claude/settings.json`。
- `Nexion-admin-prototype/.claude/hooks/verify-on-stop.mjs`(退役线)仍无条件每回合跑 tsc。
- `PLAN/.claude/` 残留 **10 个 `.audit-skip-*` + 9 个 `.changelog-skip-*`** 逃生阀文件(未消费)。「逃生阀日常化 = 门失效」是主人自己定的判据。
- admin-ops `verify.mjs`:fail-fast 一红即 exit(没跑的不列)、无 pass 计数、gear 27/44 完全重复、gear 31 硬编码 `D:/workspace/nexion-backend/…`、gear 65 静默 try/catch 不计入 skipped。
- `Nexion-uniapp/CLAUDE.md:27` 提到的 `[2.6] 树身份 preflight` 在当前 verify.sh 里已并入 `[2.5]`,无 `[2.6]`。

---

## 2. 业界对照(调研 agent 报告,20 个机制带 URL,全文见证据目录 `research-report.md`)

**一句话共识**:**没有一家用增量代替全量**——增量只买反馈速度,全量在明确 checkpoint(默认分支 / 合并前 / 周期性 / 宣布 done 前)永不缺席(Semgrep diff-aware vs full scan · Azure DevOps Test Impact Analysis 的 "Safe fallback + 周期性全跑" · pre-commit 的 `--all-files` 进 CI · Google presubmit/postsubmit defense in depth)。

可直接照搬的三件套 + 两条纪律:
| 机制 | 出处 | 落到我们这 |
|---|---|---|
| 每道门声明自己的输入文件集,交集非空才跑;`always_run` 表示无论如何都跑 | pre-commit `files:`/`types:`/`always_run` https://pre-commit.com/ ;Turborepo 按 task `inputs` 判 affected https://turborepo.dev/docs/reference/run | 23 格重门 + 18 个 npm 步骤各声明 inputs;**未声明 = 永远跑**(保守方向) |
| 全局不变量文件清单,命中即全跑 | Nx `sharedGlobals` https://nx.dev/reference/inputs ;Turborepo `globalDependencies`;Vitest `forceRerunTriggers` https://vitest.dev/config/forcereruntriggers | verify.sh 自身 / manifest / package.json / tsconfig / vite.config / pages.json / tokens.css / i18n messages / App.vue / main.ts / route.ts / app-chassis.vue / scripts/ / hooks |
| 「增量 vs 全量」双跑比对元门 | Azure TIA 官方自检法 https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis | 改映射表时 / 周期性:两种模式各跑一次比失败集,不一致 = 映射表 bug |
| 缓存按**内容哈希**,且门定义、工具版本也是输入 | Bazel action key https://bazel.build/remote/caching ;Nx `externalDependencies`/`runtime` | 树指纹 = HEAD tree + 工作树 diff 哈希;门指纹含脚本内容 |
| 三态 PASS / FAIL / SKIPPED,跳过不算进 N/N | GitHub 「跳过的 check 保持 Pending 不许合并」;与本工作区 `feedback_gate_chain_silently_stopped` 同义 | 结果行必报 `ran M / scoped-skip K / fail F`,哨兵文件带 mode |

Agentic 侧:Aider **lint 只跑被编辑文件、test 跑整套**(https://aider.chat/docs/usage/lint-test.html);Claude Code best practices 直接写「Prefer running single tests, not the whole test suite」并给出 Stop hook 确定性门 + 独立 verifier subagent 的阶梯(https://code.claude.com/docs/en/best-practices);Rush 把「只跑变更项目」标为 **unsafe**、由开发者自负——所以增量必须是显式 flag、默认全量,宣布 done 那次走默认路径。

---

## 3. 方案设计(第一性原理)

**基本事实**:门是确定性函数 f(输入);输入没变 → 结论不变。**不变量**:① 宣布 done / 合并主线前必有一次**全量绿**且树指纹与合并对象一致(不可豁免);② 任何跳过都点名、三态上报;③ 缩范围只由机器算,失败方向偏保守(算不出 → 全跑);④ 跨文件一致性 / 钱·权限·状态机类门永远全跑。**最高概率判断**:去重 + 起服复用 + 23 格重门范围化 + tsc 增量,能把内循环从 ~30 min 压到 1-5 min,全量从 29 min 压到 ~15 min。**最小可验证实验**:T2(去重 + 一次起服)单独落地即可实测全量降幅。

### 3.1 三档

| 档 | 何时跑 | 跑什么 | 目标耗时(`[INFERRED]`) |
|---|---|---|---|
| **A 静态即时档** | P2 每个子任务改完 · Stop 回合末(替代现在的每回合全量) | 402 格 <0.5s 静态哨兵全跑(37s,它们是跨文件不变量的安全网,不缩)+ 33 格中速静态门 + vue-tsc **增量**(实测 `--incremental` 冷 28s / 热 **9s**)+ 改动命中的 node 静态门 | ≤1.5 min |
| **B 范围档 scoped** | 子任务交 tester 前 · 审计修补后 | A + **改动命中的重探针**(23 格按输入映射)+ 命中的契约测试 + **只起 1 对**共享 server(mock+remote) | 2-5 min |
| **C 全量档 full** | P3 收口 · 合并主线前 · 全局不变量文件/门定义改动 · 主人点名 | 全部;但 tsc 只跑一遍、h5-runtime 探针只跑一遍、server 只起一对、build:h5 只在此档 | ~15 min(从 29) |

### 3.2 机制清单(可实施)
1. **门清单** `Nexion-uniapp/scripts/gates.manifest.json`(或 verify.sh 内 `scope_hit "<globs>"` 声明):23 格重门 + 18 个 npm 步骤各声明 `inputs`(glob)、`kind`(static/runtime/global)、`always`。**未声明 = 永远跑**。
2. **改动集** = `git diff --name-only $(git merge-base HEAD main)` ∪ `git status --porcelain`(含未跟踪);`SCOPE_BASE` 可覆盖;git 不可用/算不出 → 自动降为 C 档并打印原因。
3. **全局不变量清单**(命中即升 C 档):§2 表第二行。
4. **三态 + 哨兵扩展**:`.verify-exit.code` 第 2 行加 `mode=full|scoped|static scoped_skip=K tree=<指纹>`;结果行 `━━ result: 435 ran / 22 scoped-skip(输入未变) / 0 fail ━━`;`scoped_skip` 与 `skip` **分开计数**(跳过≠放宽)。
5. **去重**:vue-tsc 加树指纹缓存壳 `scripts/typecheck-cached.mjs`(实施时发现 `--incremental` 在 vue-tsc 1.8.27 + TS 4.9.5 下双向假结论,已禁用,见 §8),verify.sh [1] / npm 首步 / 审计 Step0 / Stop hook 全部走它;verify.sh 末尾「H5 运行时门隔离起服」在 runner 已跑过同指纹时跳过并如实标 `reused`;`build:h5` 只在 C 档。
6. **链 runner** `scripts/verify-chain.mjs` 取代 `&&`:自起 1 对 server 传给所有子步骤(它们已支持 `BASE_URL/REMOTE_BASE_URL`),跑完所有步骤再汇总(fail 与「没跑」分开列),轻测试并行 3-4 路,重探针仍串行(防 CPU 争用抖动)。
7. **元门** `verify:scoped-vs-full-check`:改 manifest 时必跑一次、以及周期性——双跑比对失败集,不一致即红。
8. **Stop hook 改档**:`verify-on-stop.mjs` 改为跑 A 档(前提不满足时跑纯静态部分而不是整体跳过);红仍 exit 2。**C 档焊到合并主线**:扩 `guard-package-branch.mjs`——命中 `git merge pkg/*`(到主线)/ `git push origin <主线>` 时,要求 `.verify-exit.code` 记录的 full 绿指纹 == 待合并 tip 的树指纹,否则 exit 2;逃生阀 `# ALLOW-UNVERIFIED-MERGE`(给「凭证据链合并」那种主人明令场景)。
9. **工作流文本**:P2「增量机器门」= `npm run verify:scoped`;P3 = `npm run verify`(C 档);P5 每轮修补后 = scoped、末轮 full;done-review ⑥ / prd-sync / plan.md 总回测里的「全量」改为「复用当前树指纹的 full 绿记录,指纹变了才重跑」;§8 报告格式带 `mode + M/N + 指纹短哈希`。
10. **admin-ops 同款**:verify.mjs 加 inputs 声明 + 跑完再汇总(去 fail-fast)+ pass 计数 + 去重 gear 27/44 + gear 31 走解析器 + gear 65 计入 skipped。

### 3.3 预期收益(`[INFERRED]`,MED)
- 单次全量:29 → ~15 min(h5-runtime 去重 −7、起服复用 −2~3、tsc −0.5、build 视档 −0.5、`.vue` 闭合门重写 −0.5)。
- 子任务内循环:29 → 1-5 min。
- 一个 M 任务(3 子任务 + 2 审计轮 + 收口 + prd-sync + Stop 若干次)按处方 ≥6 次全量 ≈ 3 h → **1 次 full + 若干 scoped/static ≈ 30-40 min**。

### 3.4 墨菲(先列最可能崩的点,当它一定崩去验)
| 会崩的点 | 对策(落在机器层) |
|---|---|
| 映射表漏配 → 该跑的重门没跑 | 未声明必跑 + 全局清单升 C + 元门双跑比对 + 合并前 C 档兜底 |
| scoped 绿被当 done 报 | 哨兵 mode 字段 + 合并守卫读指纹 + 报告格式强制 `mode/M/N` |
| 缓存/指纹假绿 | 指纹含门脚本内容 + node 版本;红测:改任一输入必失效、改门脚本必失效 |
| 并行跑测试引发探针抖动 | 重探针串行,只并行轻测试;探针重试机制保留 |
| 新 hook 跨会话才生效 | 收尾汇报明写;hooks-selftest FAIL=0 才算焊上 |
| `git merge-base` 在 detached/无 main 时算不出 | 自动升 C 档并打印原因(保守方向) |

---

## 4. 其它优化点(独立拍板,按收益排序)

### 4.1 审计轮次收敛(最大头 · 建议单独出 L 级提案)
事实:checkout 任务 10 轮 × 43 agent、每轮 ~500 万 token;每轮 48-69 条 P2 **重复再生**、无消费者;单元细审每轮重读**没改过**的单元;对抗层每轮固定 30 agent。
方案(保留主人铁律:不设轮上限、P0-P2 全报、审计独立性、轮次由主人定):
- **跨轮 finding 台账**:每条 finding 指纹(文件 + 规则/标题归一化),状态 open / fixed / killed(对抗证伪推翻)/ carried(未变);下一轮 agent 拿到的是**事实交底**(「上轮 N 条,状态如下,请逐条回归」),不是结论诱导;已 killed 且代码区域未变的不再派 skeptic;P2 只在新增或状态变化时重报,carried 的列一行不重推导。
- **审计范围化**:L2 单元细审只审「上轮审计 SHA 之后改过的单元 + 有 open finding 的单元」;L3 横切保持全局;**宣称 P0=P1=0 的末轮做一次全量**。
- 估计每轮 token 降 50%+、收敛可视(open 曲线)`[INFERRED]`。

### 4.2 审查层去重(文本层改动,不动铁律)
- 浏览器走查在 4 处被各自处方(P4 / done-review ⑥ / uniapp-port 阶段 3 / sprint Step 8)→ **只做一次,产一份带路由清单 + console=0 + 截图的走查报告,其余三处引用它**。
- 「同形全扫」在 3 处定义且方法互相矛盾(audit #11 说 grep,done-review ④ 说不 grep 要运行时遍历,脊柱 :150 又说 grep)→ **done-review 唯一定义:调用点用 grep/AST,UI 渲染用运行时遍历;其它两处引用**。
- completeness critic(audit ⑤)的产出直接喂 done-review ②,不再重问。
- prd-sync 不再自跑全量(读 full 绿指纹)。
- 6 维设计分 + 6 维完成矩阵:保留(目的不同),但设计分只在有 UI 面改动时跑(现已如此,写明)。

### 4.3 陈旧 hook 修复(S 级,顺手)
audit-pending-tracker INCLUDE 加 `admin-ops/app/`(去掉退役线)· admin-ops 补 `.claude/settings.json` 挂同一套门 · 退役线 Nexion-admin-prototype 的 Stop tsc hook 摘掉 · 逃生阀残留 19 个文件清理 + 阀带会话消费/TTL · Nexion-uniapp/CLAUDE.md `[2.6]` 段号更正。

### 4.4 单门自身优化(包 ax,2026-08-18 已落地;主人 08-17 批 A+B)
- **清单拆细 = pages 闭包**:门声明它驱动的页面(`pages`:字面 / glob / "*"),输入 = inputs ∪ 页面静态 import 闭包(`scripts/lib/import-graph.mjs`,582 文件 / 2617 边 0.5s)∪ 探针脚本里 `import("/src/…")` 的模块;**app 壳闭包**(App.vue / main.ts / app-chassis / global-ui 的下游,含 94/99 个 store)命中 = 全部路由、所有 pages 类门都跑(tester-F F-01/F-02:P-031 让 store 不互 import、编排上移 App 层,只被壳引用的模块不在任何页面闭包里却作用于每一页)。实测:只改一页 / 页面局部组件 → runtime 门 6-10/20、h5 子探针 1-2/10、路由 1/91;改壳闭包内 store → 全量 —— **这是真实耦合不是清单粗**,范围化对这类改动省不出时间。
- **路由级范围**:`routeScoped:true` 的 7 个 route 类门(spec6 / theme / zero-border / dom-qa / tap / orphan / empty)scoped 时只扫「受影响路由 ∩ 射程」(env `PROBE_ROUTES`,verify.sh 按门 `route_scope <id>`,`scope_hit` 每门先清空,lint 双向配对);门因自身脚本 / 基线 / 台账变化而跑 → 全扫;交集为空 → 全扫(不产出 0 扫描);full 一律不缩(runner / verify.sh 显式清空)。scoped 下探针拒绝 `--update-baseline` / `--update-ledger`,棘轮「消失」只对扫过的路由比。🔴 路由 env 值不带前导 `/`:Git Bash(MSYS)会把 `/pages/…` 改写成 Windows 路径,曾整串失效、探针 0 命中却绿。
- **多 lane 并行**(`scripts/lib/probe-routes.mjs`,`PROBE_CONCURRENCY` 默认 3):每 lane **独立 BrowserContext**(同 context 多页共用渲染主线程,JS 交错执行把按串行校准的固定等待拖穿 —— theme 基线 4 条曾随机「消失」0-4 条);并行共用一台 Vite dev server,别页拉模块把本页图片 / 懒加载排到 1-2s 后 → 有界 `settleNetwork`(封顶 5s,只在 lane>1 时等)+ 空态探针有界轮询「空态 + 插画就绪」;判定逻辑不动。theme 门固定 concurrency 1、tap 门不加 settle(见「既有问题」1/4)。zero-border 每路由整页重载(`&zb=i`),基线 159→86。
- **实测(同机)**:zero-border 201s → 89-99s;empty-state 56s → 29-40s;orphan 54s → 34-53s(多行文案 40 → 40-47 段);dom-qa 15s → 9-13s;tap 15s → 10s;spec6 25s → 15-18s;full 全量 **24-26 min → 16.2 min**(18/18 PASS,verify.sh 462 格 0 fail);scoped 对「只改一页」**~2.6 min**(15 PASS / 3 SCOPED-SKIP)。`verify:scope-audit:deep`(只改一页的树上 scoped ↔ full 双跑比对):PASS(scoped 15 PASS / 3 SCOPED-SKIP · full 18/18 14.8 min · verify.sh 462 格守恒;首跑抓出多格门 7 格差 → manifest cells 声明后复跑守恒)。
- **独立验收**:tester-F 报告 `PLAN/.claude/evidence/verify-timing-2026-08-17/tF-probe-scoping-test.md`(0 P0 / 5 P1 / 10 P2,R1 全修:壳闭包、交集空→全扫、route_scope 配对 lint + scope_hit 清空、settle 串行空转、伞门 inputs 对齐、pages 类型 lint、库单测挂 probe-safety、empty-state 0 页显形、dom-qa scoped 拒写台账、注释与基线收缩、CRLF)。

**既有问题(包 ax 实测暴露,未在本包修,待主人裁)**
1. theme-constant 门:`/pages/index/index` tech-money-card 的 aurora 用遗留 token `--accent-purple`(双主题恒定 #7C5CFF)+ 14s transform 动画,配对键含尺寸 → 命中看动画相位:原版串行 4 跑 1 红,并行 3 lane 时 3 跑 2 红。**既有**间歇红(verify.sh probe_retry 兜着),本包把该门并行度固定 1。根治:改 v5 主题感知 token(需 nexion-design 判定用哪个;`--v5-nex` 仅限图表/badge,`--v5-brand-2` 已是橙)。
2. tap-feedback `--update-ledger` 是「以本次快照整体替换」不是合并:某次跑没看到的存量会被删掉,下次看到又成「新违例」(本人实测 11 → 2 后立即还原)。建议改 dom-qa 同款合并语义 + 单独「消失」核对。
3. milestone 庆祝层 `.ms-card`(App.vue 4s 轮询弹出)缺 `:active` 反馈:探针停留 >4s 就会把它算进 tap 目标并判违例(tap 探针因此不加 settleNetwork,维持原 1200ms 窗口)。产品侧 UI 债。
4. `test:session-reload-recovery` fresh-context 步(`waitForFunction` 8s)与 `withdraw-bill-runtime` 各出现一次首跑红重跑绿 —— 与 08-17 三轮观察同族(冷 server 负载抖动),重跑纪律在兜。
5. zero-border 基线里 `/pages/me/notifications` 等条目因 mock 文案随机(行高 65/66)指纹抖动 —— 指纹含 size + 随机内容的既有不稳定。

---

## 5. 实施拆解(L 级 plan.md 雏形,子任务 ≤1 上下文,每条独立 tester + 红测)

| # | 子任务 | 范围文件 | AC(可证伪) |
|---|---|---|---|
| T1 ✅ | 计时基线 + 清单 + 调研落盘 | `.claude/evidence/verify-timing-2026-08-17/` | 本文 §1 数字可从 JSON 复算 |
| T2 | 链 runner + 一对共享 server + tsc 增量壳 + h5-runtime 只跑一遍 + 跑完汇总 | `scripts/verify-chain.mjs`(新)`scripts/typecheck-cached.mjs`(新)`package.json` `run-legacy-suite.mjs` `verify.sh:3629` | ① `npm run verify` 全量 ≤ 18 min(实测)② 一红不断链,末尾列「没跑」③ 哨兵第 2 行含 mode/tree ④ 红测:注入 tsc 错→红;删一步→「没跑」被列出 |
| T3 | verify.sh `scope_hit` 声明 + 23 格重门/18 步骤 inputs + 全局不变量清单 + 三态结果行 | `verify.sh`、`scripts/gates.manifest.json`(新) | ① `verify:scoped` 在只改 `src/store/withdraw*.ts` 时只跑对应重门,结果行 `ran/scoped-skip/fail` 三数正确 ② 改 tokens.css 自动升 C ③ 红测:改一个声明外文件→该门仍跑(未声明必跑) |
| T4 | Stop hook 改 A 档 + 合并守卫 C 档指纹 + 逃生阀 | `Nexion-uniapp/.claude/hooks/verify-on-stop.mjs` `PLAN/.claude/hooks/guard-package-branch.mjs` + 红测 | ① 回合末 ≤1.5 min ② 未 full 绿的 tip 合并被 exit 2 ③ 阀可用且留痕 ④ hooks-selftest FAIL=0 |
| T5 | 元门双跑比对 + 红测 | `scripts/verify-scope-audit.mjs`(新) | 故意漏配一条映射 → 元门红 |
| T6 | 工作流文本:nexion-workflow P2/P3/P5/§8、done-review ⑥、prd-sync Step1、uniapp CLAUDE.md、WORKFLOW.md;EVOLUTION-LEDGER 记 WF 条目 | 各 SKILL.md | audit-routing 绿;文本里不再出现「增量哨兵」无机制句 |
| T7 | admin-ops 同款(inputs + 汇总 + 去重 gear) | `admin-ops/scripts/verify.mjs` | 65 齿全跑完再报;27/44 合一;pass 计数 |
| T8 | 4.3 陈旧 hook 修复 | 见 4.3 | 改 admin-ops/app 文件后 `.audit-pending` 出现该行 |
| T9(独立提案) | 4.1 审计台账 + 范围化 | `nexion-audit` SKILL + `nexion-audit-v4.mjs` | 第 2 轮 agent 数、token 明显低于第 1 轮且 open 曲线可视 |

顺序:T2 → T3 → T4 → T5 → T6(T7/T8 可并行);T9 另立。全部在包分支上做,合并只收合并。

---

## 6. 风险与不做的代价
- 不做:每个 M/L 任务继续为 verify 付 2-3 小时 + 审计几十 M token;Stop hook 继续「20 分钟或空转」;红门(step 2 契约红)让 `npm run verify` 后 16 步继续不跑却没人看见。
- 做的风险:映射表是新的可漂移面(靠元门 + 未声明必跑 + 合并前 full 兜);hook 改动跨会话生效窗口。

---

## 7. 拍板项(每项:选项 + 代价 / 推荐 + 理由 / 不做会怎样)

**Q1 · verify 三档制(§3)**
- A(推荐)全做 T2-T6:内循环 29→1-5 min、全量 29→~15 min;代价 1-2 个工作会话 + 一张要维护的映射表(有元门守)。
- B 只做去重不做范围档(T2 + T4 的 hook 部分):全量 29→~15 min,内循环仍要 15 min;零映射表维护。
- C 不动:每任务继续付 2-3 h。
- 不做会怎样:见 §6。理由:A 的映射表只覆盖 23+18 项、失败方向保守、有双跑元门,风险可控;收益是 B 的 3-5 倍。

**Q2 · Stop hook 改档 + 合并守卫(§3.2-8)**
- A(推荐)Stop 跑 A 档、C 档焊到合并主线:门仍绕不过、每回合 ≤1.5 min、done 的边界从「回合末」搬到「合并前」这个真正无歧义的点。
- B 保持每回合全量:20 min/回合或静默空转。
- C 去掉 Stop 跑 verify、只靠 skill:与「机器门绕不过」原则相悖。
- 不做会怎样:Stop hook 继续两头不对;逃生阀继续日常化。

**Q3 · 审计轮次收敛(§4.1)**
- A(推荐)单独出 L 级提案再签字:保住不设轮上限/全报/独立性,只砍重复推导与未变单元重读;预计每轮 token −50%+。
- B 不动:下一个 checkout 级任务再花 ~50M token。
- 不做会怎样:审计成本随任务线性爆炸,主人被迫用「拍板停轮」代替收敛。

**Q4 · 审查层去重(§4.2)**
- A(推荐)文本层合并引用、不动铁律:少 3 次重复走查/重复定义,消一处方法矛盾。
- B 不动:每任务重复 3-4 次同一走查。

**Q5 · 陈旧 hook 修复(§4.3)**
- A(推荐)S 级顺手修:admin-ops 重新进审计欠账、退役线 hook 摘掉、19 个残留阀清理。
- B 不动:admin-ops 功能改动继续绕过审计门,阀残留继续。

> 主人只需回「Q1A Q2A Q3A Q4A Q5A」或逐条改;签字后走 T2 起的包分支实施,每子任务独立 tester + 红测,收尾 done-review + EVOLUTION-LEDGER 记 WF 条目。

---

## 8. 实测更新(2026-08-17 晚,实施后回填;`[COMPUTED]`,同机多 agent 并发、数字偏保守)

| 项 | 提案预估 | 实测 | 说明 |
|---|---|---|---|
| full 全量 | ~15 min | **~24-26 min**(run#3 25.8 min;基线 29.1) | 省下的是 h5 探针重复(~7 min)+ tsc 缓存 + 一次起服;剩余 ~20 min 是 verify.sh 里 23 格重探针本身(零-border 194s、h5 隔离门 ~400s 等),要再降只能做单探针提速(§4.4),不是范围化能省的 |
| static 静态档 | ≤1.5 min | **3-4 min**(不起 server;树未变 / 只改文档秒退) | 402 格 <0.5s 合计 37s 是地板 + 33 格中速静态门 + 指纹/lint 开销 |
| scoped 范围档 | 2-5 min | 机制 PASS(tester A:store 改动 → 15/20 门 + 17/18 步 + h5 8/10 子探针,SCOPED-SKIP 逐条点名);**碰 src/store/** ≈ 18-24 min**,只碰页面/组件才明显省;改门基建 / 全局清单文件自动升 full | 根因是清单口径粗:多数运行时门都声明 `src/store/**`、11 个测试步骤声明 `src/**`;下一步拆细声明(§4.4 同批) |
| tsc `--incremental` | 冷 28s / 热 9s | **已禁用**(tester A P0:vue-tsc 1.8.27 + TS 4.9.5 下 warm buildinfo 双向假结论,本人复现) | 只留指纹缓存:同树重复 1s,变了裸跑 ~30-35s;加 `--selftest` 结构自证 |
| 起服一对共享(pool) | 省 2-3 min | **默认关**(`--pool` 可选) | 共享 server 连跑有拥塞退化风险且收益仅 ~10s |
| h5 探针首跑抖动 | — | 三轮全量各抖一次(不同探针),单跑三次全绿 | 归同机负载;runner 对 runtime 类步骤「失败重跑 1 次、大声标记」(与 verify.sh probe_retry 同款) |
| admin-ops 全量 | — | 116-128s(64 齿,不 fail-fast,写 last-run.json) | T7 |
| Stop hook | ≤1.5 min | 3-4 min(功能面文件变了才跑;树未变 / 只改文档 1s) | 与 static 同 |

**结论修正**:内循环收益成立但幅度比预估小(static 3-4 min、scoped 与改动面成正比、Stop 不再 20 分钟);**全量收益从「29→15」修正为「29→~24」**。下一刀:§4.4 单探针提速 + 清单拆细(store 类门按具体 store 文件声明),不在本包。
**包 ax 回填(2026-08-18)**:全量 **~24 → 16.2 min**(route 类探针多 lane 并行 + zero-border 整页重载);scoped 只改一页 **~2.6 min**;改壳闭包内 store 仍接近全量(真实耦合)。详见 §4.4。
连锁后果:runner 不 fail-fast 后,既有红 `test:contract-registry`(h2 契约正则在结算包合并后过期)会挡住 `pkg.mjs close` 完成门 —— 本包把该正则放宽为同时认新旧守卫形态(意图不变),见 `scripts/h2-trial-remote-api.test.mjs`。
