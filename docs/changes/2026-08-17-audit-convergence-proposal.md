# 审计轮次收敛(跨轮 finding 台账 + 范围化审计)· Change Proposal

> 主人 2026-08-17 拍板 Q3A:「单独出 L 级提案再签字」。本文即该提案(**Draft,等签字**);签字前不改 `nexion-audit` skill 与 `nexion-audit-v4.mjs`。
> 母提案:`2026-08-17-verify-tiering.md` §4.1;证据:`D:\WORKS\PLAN\.claude\evidence\verify-timing-2026-08-17\workflow-cost-report.md` Q4/Q5。

- **工作线**:④ uniapp(nexion-audit skill 跨线通用)· **日期**:2026-08-17 · **状态**:Draft → 待主人签字

## Why(问题 / 动机)
- 样本 `pkg/ad-checkout-cancel`(`docs/changes/2026-08-16-checkout-cancel-pending-bar.md:66-80`):审计 **R1→R10,每轮 43 agent、每轮 ~500 万 token**;每轮 48-69 条 P2 **重复再生**、无消费者;单元细审每轮重读**没改过**的单元;对抗层每轮固定 30 agent;停轮是主人拍板,不是收敛。
- 结构原因:`nexion-audit-v4.mjs` 每轮从零开始(work-list 重发现 → 全部单元重审 → 全部 P0/P1 重派 skeptic),**上一轮的知识不进入下一轮**——同一 finding 被重新推导、被杀过的 finding 再被派 skeptic、P2 每轮重新生产。这与提案母题同构:门是 f(输入) 的确定性函数,输入没变结论不变;审计里「输入」= 单元代码 + 已知 finding 状态。

## What changes(改动点)
1. **跨轮 finding 台账**(`docs/changes/<slug>.audit-ledger.json`,包内落盘):每条 finding 指纹 = `sha1(file + 规则/标题归一化 + 代码区域锚)`;状态机 `open → fixed | killed(对抗证伪推翻)| carried(未变)`;每轮 agent 收到台账作为**事实交底**(「上轮 N 条,状态如下,请逐条回归」),不是结论诱导(不写「应该没问题了」)。
2. **范围化审计**:L2 单元细审只审「上轮审计 SHA 之后改过的单元(`git diff --name-only <上轮SHA>..HEAD` 映射到 work-list 单元)+ 仍有 open finding 的单元」;L3 三维横切保持全局;L4 skeptic 只派给**新增**或**代码区域已变**的 P0/P1(killed 且区域未变的不再派);L5 critic 照常。
3. **末轮全量**:宣称 P0=P1=0 的那一轮必须是全量轮(全部单元 + 全部 open finding 回归),与 verify 三档「收口必 full」同口径。
4. **P2 记账不重推导**:P2 只在新增或状态变化时报;carried 的在报告里列一行(计数 + 指纹),不重复生产内容;台账保证「全报、不丢」——主人铁律「P0/P1/P2 一律不许遗漏、不许合并」由台账守,而不是靠每轮重写。
5. **收敛可视**:每轮报告首行给 open 曲线(R1 open N → R2 open M …)+ 本轮新增/修复/杀掉数;两轮 open 不降触发母 skill 的「结构性反思」条款(已存在,不改)。
- **Out of scope(明确不做)**:不设轮次上限、不设收敛目标(铁律不动);不改 skeptic 的 3 lens;不改 P0/P1 定义;不改 work-list 发现层的口径;不给 agent 任何「期望结论」。

## Impact(影响面)
- `~/.claude/skills/nexion-audit/SKILL.md`(五层说明 + 报告格式)· `D:/WORKS/PLAN/.claude/workflows/nexion-audit-v4.mjs`(读写台账、单元过滤、skeptic 过滤、末轮全量开关)· 报告模板。
- 不变量风险:审计独立性(台账只含事实与状态,派单 prompt 仍禁「结论应长什么样」);全报不漏(台账守恒:上轮 open + 本轮新增 = 本轮 open + fixed + killed,机器核)。

## Done-when(可证伪)
- [ ] 同一任务第 2 轮的 agent 数与 token 明显低于第 1 轮(≥40%),且第 2 轮报告首行有 open 曲线
- [ ] 台账守恒每轮机器核过(缺一条即红)
- [ ] 末轮(P0=P1=0)日志显示为全量轮
- [ ] 红测:把上一轮某条 open finding 从台账里删掉 → 守恒核红;把 killed finding 的代码区域改动 → 该 finding 重新派 skeptic

## 拍板项
- **A(推荐)** 按上面 1-5 实施(改 skill + workflow 脚本 + 模板;红测 4 条),预计 1 个工作会话。理由:保住主人三条铁律,只砍重复推导与未变单元重读,每轮 token 预计 −50%+ `[INFERRED]`。
- **B** 只做 1+4(台账 + P2 不重推导),不做范围化:省 30% 左右,零「漏审」风险。
- **C** 不动:下一个 checkout 级任务再花 ~50M token。
- 不做的后果:审计成本随任务线性爆炸,主人被迫用「拍板停轮」代替收敛。
