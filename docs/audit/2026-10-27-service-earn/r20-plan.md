# R20 当前结果与初始清单

2026-10-27：收益卡/按钮双审均 ≥9；正式 USER_VIEW 后端实现与迁移完成，独立后端主体 9.1–9.3；精确拒绝、终态读回及后续页面镜像两个 P2 已修并由两位非实现者复核。APP 396 项定向回归、类型、生产浏览器与原生资源编译通过，当前入口 UGGOR9u8。父线程已执行独立合成环境的实际页面恢复链、稳定草稿通知、存活页清空及重复边界新草稿验证。原始失败与分数仍见各独立报告。

以下为初始计划及历史推导，不代表当前仍待实施。机器 r3 只签代码回归，最终状态保留在仓外 workflow state；正式 TEST/真实 JWT/WS/物理设备未签。试用子任务已获用户恢复授权，完成后整合 APP，再统一同步 H5。未使用重置卡。

## 初始有界实施与验收清单（历史）
2026-10-27 · sidecar：Averroes（规划，不实施、不计独立视觉审查）。**以下产品检查均未由本 sidecar 执行；所有验收待证据。**

用户已否决 **R19 三卡视觉保真**。旧 9.x 分数和 R19 的测试/构建绿灯保留为历史，不能结转成 R20 视觉通过。以原始 [design-board.png](./design-board.png) 和本轮用户要求为准；旧「中性色素材再加 CSS aura」提示不是新的验收标准。

| 工作线 | 固定入口/基线 | 负责人 |
|---|---|---|
| APP | `D:/WORKS/PLAN/.wt/uvel-design-20261025-app` · `e5810fc5`（已只读核实） | Parent：三卡、前端接入、最终整合 |
| 正式后端 | `D:/WORKS/PLAN/.wt/uvel-support-clear-20261027-backend` · `090a7e50`（已只读核实） | Jason 实施；Noether 只读复审 |
| H5 | `D:/WORKS/PLAN/.wt/uvel-design-20261025-h5` · `f9bf7b1`（已只读核实） | Parent；APP 验收后再同步 |
| 实景双审 | 同一最终源码/原图资产/构建指纹 | Einstein、Nash 各自操作 live browser、各自评分 |

这些 HEAD 是起始基线，不是仍在修改的工作树或最终构建指纹。Parent/Jason 的在途改动不得覆盖或回滚。

## 有限验收门
- [ ] **R20-ART / Parent**：三卡使用原稿的 phone/staking/GPU 及原始发光裁片，暗 lime、浅 blue 的光强/位置/物体比例与原稿并排核对；不把整卡、固定语言文字或按钮烘成图片。文案/按钮保留真实 UI、44px 点击区、可访问标签及原有轻触反馈；无循环装饰动画。提交原图→裁片/映射坐标→构建资产的对应关系和 hash。
- [ ] **R20-APP-CONTRACT / Parent**：配置未就绪和开关仍正确；Android 要求、质押期限/提前退出、GPU 空闲算力和 slotsFull 信息完整。APP 进入既有校准/设备，H5 进入下载；按钮只触发一次且返回后可继续使用。三语自然增长不截断、不挡 CTA；devices 复用入口和 bottomnav 保持其既有功能，不虚构收益。
- [ ] **R20-VISUAL / Einstein + Nash**：两位分别操作最终构建，逐一检查三卡，**每位 >=9/10**，无未解决的实质缺陷；分数不得代替原稿对照和交互证据。有限布局集：390/zh 明暗两组，320/en、320/vi 各明暗两组（共六组；三卡含下方 GPU 均须可见）。在同一组完成 CTA、滚动、返回；可复用 Parent 已有截图定位，但两位各自记录 live 操作及新观察，不互相转签。
- [ ] **R20-BACKEND / Jason**：真实服务按认证账号+稳定 peer 持久化 USER_VIEW 水位，覆盖同 peer 全部旧 CID；取消/失败不本地假清空，超时用原幂等键读回/重试。不同账号、不同 peer、缺 peer 的独立 CID 不串范围；版本/并发水位单调，旧响应和命令重放不复活历史。
- [ ] **R20-PERSISTENCE / Jason + Noether**：隔离账号中创建旧历史→清空→同会话读回→退出登录/重登→另一全新浏览器存储或设备登录。列表、旧 CID 详情、分页、实时补入、命令恢复和用户附件读取均不得重新暴露边界前内容；边界后新消息与未读正常，同 CID 可继续，第二次清空仍有效。对照客服 API/数据记录证明原始消息、附件、审计仍在；记录实际使用的服务/迁移/DB 版本。纯单元、mock/demo、另一个浏览器标签页或刷新不等于服务持久化/新设备证明。
- [ ] **R20-PRD-AUDIT / Parent**：更新 [现有 PRD](../../../PRD/UVEL_客服会话连续性与用户侧清空_20261027.md) 和主 audit；保留 R19 用户否决与历史评分原文，新增当前证据、未覆盖项和实际部署边界。不能在仅代码完成时把「正式后端后置」直接改成已上线。
- [ ] **R20-H5 / Parent**：APP 相关功能、当前原稿实景双审和正式后端合同验收完成后，固定 APP commit/候选树，按现有 sync plan/apply/check/repin 流程同步；保留 H5 下载/原生能力边界，做受影响三卡和 USER_VIEW 恢复实景。H5 来源 pin、构建和运行指纹须与本轮相符；离线 pin 或 APP 绿灯不代替 H5 验收。

**持续不变量**：5237 原始聊天、草稿和现场保持不变；不为清空测试操作它的账号、存储或原始数据。Parent 负责必要的只读前后保存证据，清空实验放独立账号/数据库和独立浏览器上下文；sidecar 不复制、清理或播种这些数据。

## 最少命令与证据边界
命令逐 argv 见本地 `.cache/r20/inputs/commands.json`；本轮只核对路径与源码，**未运行下列命令**。

| 检查 | 已存在的入口 | 证明范围 / 当前缺口 |
|---|---|---|
| APP 定向回归 | `node node_modules/vitest/vitest.mjs run src/pages/earn/earn-more-ways.behavior.test.ts src/api/conversation-management.test.ts src/store/conversations-threads.test.ts --reporter=verbose` | 三卡功能 + APP USER_VIEW parser/store mock 合同；核实非零用例、0 skip；不能证明原稿保真或正式 DB |
| APP 类型 | `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit --pretty false` | 类型兼容 |
| 最终 Web / APP 编译 | `node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build` / 加 `-p app-plus` | Parent 统一冻结后运行一次；编译不等于浏览器、原生安装或耳听证明 |
| 后端旧回归 | Maven `-Dtest=AppConversationInboxControllerTest,AppConversationInboxServiceTest,CustomerConversationReuseTest test` | 类存在，但 Inbox 是旧 dismiss；需 Jason 提供新增 USER_VIEW 测试类与实际 Maven 路径 |
| 旧 MySQL 夹具 | `AppConversationInboxMySqlTest`，需 `NEXION_INBOX_IT=true` | 当前硬编码本机 3306 并用随机 schema；未开环境会跳过，不能当清空持久化通过。本机 PATH/README 指定 Maven 路径未找到，未尝试启动 |
| H5 来源核验 | `node scripts/app-h5-sync.mjs check --source <上述APP绝对路径> --target <上述H5绝对路径>` | 仅在 Parent 实际同步后执行；真实源/目标内容，不证明后端已部署 |

后端最小新增证据应覆盖：迁移幂等、认证/peer 权限、版本与并发、同 key 恢复、真实持久化/重登新客户端、客服保留。已有旧测试可作回归，但其名称相近不表示已覆盖。外部数据库权限、可用服务和部署路径由 Jason 核实，不在计划里猜测或保存凭据。

无需重复 R19 全部 539/66 或新增 full verify。重跑限于输入变化、失败修复及最终整合；记录用例数/skip、耗时、输入 hash、日志位置。重型 DB/构建先由负责人记录预计空间、隔离资源、终止与清理入口，未知成本写 unknown，不补零。

## 本地机器交接
接口已回源读取 [task-workflow](D:/WORKS/PLAN/scripts/codex-workflow/skills/task-workflow/SKILL.md)、[nexion-workflow](D:/WORKS/PLAN/scripts/codex-workflow/skills/nexion-workflow/SKILL.md)、[IMPLEMENTATION](D:/WORKS/PLAN/scripts/codex-workflow/IMPLEMENTATION.md) 和 [CODEX_WORKFLOW](D:/WORKS/PLAN/scripts/codex-workflow/CODEX_WORKFLOW.md)。已用实际 `loadPlan()` 核验子计划结构与来源文件；这不是产品检查或 CLI 初始化。

- `.cache/r20/inputs/user-request.md`：U01–U09 来源；`inputs/commands.json`：已核实命令、前置条件和覆盖边界。
- 当前使用 `.cache/r20/app-regression-r2.plan.json`：按 task-workflow **schemaVersion 2** 的 APP **代码回归子计划**，固定 repo/base、逐项来源和检查映射，`integration.reviewRequired=true`。原 `app-regression.plan.json` 保留其 pretest blocked 记录，详见下方 r2 修订。子计划不代表 R20 总计划，也不承担视觉评分、后端/H5/PRD 门。
- `.cache/r20/status.json`：sidecar 待办/缺口，所有产品门 pending、无成绩、无运行证据；**不是 CLI state.json**。仅计划 loader 的可读性可单列记录，不转成产品通过。
- `task-workflow` CLI 每计划一个 repo，runner 的 cwd 固定为该 repo，没有每 check 的 repo/cwd 字段；外部 inputs 只能绑定材料，不能授予跨仓 scope 或把另一仓的报告当本仓通过。完整 R20 需主线协调独立 APP/backend/H5 计划与人工交接。
- UI 的机器验收须有真实 `record/capability:runtime` 生产器，绑定当前 `WORKFLOW_*` 标识、逐项 evidence、资源目录与安全中止。当前未确认有可直接用的 R20 实景/持久化生产器，故不造空命令、不把图片/静态检查冒充 runtime。
- CLI state-dir 必须在 APP 仓外；Parent 已选定 `D:/WORKS/PLAN/.wt/uvel-design-preview/r20-workflow-state`。本 sidecar 仅只读核对旧状态，不执行 init/bind/start/run/review/finish，也不写仓外或全局 workflow state。integration 会自动重跑子检查，应计入预算，不能再叠加全量矩阵。
- `.cache/r20/**` 仅本地，不暂存、不交付 H5；当前 Git 显示为未跟踪而非已忽略，Parent 应选择性暂存，仅交付需要的文档。保留至主线接手且后续证据不再引用；本轮未执行清理，也未改 ignore 规则。

当前尚缺：最终构建/资产指纹、Einstein 与 Nash 各自新实景 >=9 报告、正式服务持久化及客服保留证据、Noether 后端复审、PRD/audit 更新、APP 通过后的 H5 同步/运行结果。评分和结论由各负责人实际验收后填入，Averroes 不为自己编写的 R19 卡片提供独立评分。

## 资源路径修订 r2（2026-10-27，独立于产品验收）
Parent 已对原计划执行 init/start/run，仓外 state root 为 `D:/WORKS/PLAN/.wt/uvel-design-preview/r20-workflow-state`。唯一一次 run `76d8c993-2df2-4c08-bfa2-0f0936dda481` 在 18.535ms 的资源预检阶段被 `linked path refused: .../node_modules` 阻塞，`checks=[]`、无 receipt。**这是环境路径阻塞，不是产品红测，也没有产生覆盖。**用户报告的普通 Vitest 14 passed 单独保留，不包装成这次 workflow 的通过。

原资源路径经过共享 `node_modules` 链接；`fs.realpathSync` 得到 **`D:/WORKS/PLAN/nexion-frontend-uniapp/node_modules/.vite`**。`vitest.config.ts` 不覆盖 cacheDir；网页 `vite.config.ts` 的独立缓存配置不用于这条 Vitest 命令。已用实际 `resourceGuard()` 只读预检物理路径：18 文件、994054 字节，扫描约 3.294ms；只证明当前资源门可读取，未运行产品测试。

资源声明是计划契约：原 `app-regression.plan.json`、blocked state、run log 均保留；新增 `.cache/r20/app-regression-r2.plan.json`，ID 为 `r20-app-regression-20261027-r2`，仅改 ID 与资源 root，测试命令、超时、容量、验收项不变。监察记录为 `.cache/r20/resource-path-review.json`。Averroes 独立于 Parent 的执行，但也是计划/修订作者，不把这次修订当作自己的独立验收签署。

交 Parent 执行的确切命令（sidecar **未执行**）：

```powershell
$workflowCli = 'D:/WORKS/PLAN/scripts/codex-workflow/workflow.mjs'
$r20Plan = 'D:/WORKS/PLAN/.wt/uvel-design-20261025-app/.cache/r20/app-regression-r2.plan.json'
$r20State = 'D:/WORKS/PLAN/.wt/uvel-design-preview/r20-workflow-state'
node $workflowCli init $r20Plan --state-dir $r20State
node $workflowCli start $r20Plan app-regression --state-dir $r20State
node $workflowCli run $r20Plan app-regression --state-dir $r20State
node $workflowCli status $r20Plan --state-dir $r20State
```

若旧计划已绑定会话，由 Parent 核实无运行进程/写锁后按既有 `bind --replace` 规则处理真实会话 ID；不删除旧状态、不 recover 成功、不迁入旧绿灯。共享缓存只纳入元数据预算，不能作为本任务可随意清理的临时目录；若有同时写入，协调实际运行窗口，不扩大为全库验证。真实 UI/后端实施和独立审查仍优先，其他 R20 门保持未验证。
