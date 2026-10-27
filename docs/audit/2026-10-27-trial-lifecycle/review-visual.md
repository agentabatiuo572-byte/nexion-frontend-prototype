# 试用生命周期与队列：独立视觉、人工操作审查

最终结论：当前 APP 来源构建的本地模拟视觉与人工操作审查通过。需求 1：**9.2/10**；需求 2：**9.2/10**。无开放 P0/P1/P2；本审查发现的 TV-01 已由主线修补并经本审查者独立实景关闭。评分是人工审查判断，不是像素相似度或正式服务验收分数。

- taskId: `uvel-trial-20261027`
- stepId: `integration-visual`
- reviewer: `/root/trial_visual_final_review`（未参与产品实现）
- repo: `D:/WORKS/PLAN/.wt/uvel-trial-20261027-app`
- HEAD: `19f1a42b6b0dbda7ba6579aae236158f5adf7b93`，包含本任务未提交 WIP。
- verdict: `pass`（仅限本报告明确的本地模拟 UI/交互范围）。
- snapshotHash / sourceFingerprint: `fa477e96988a9d887dd804d0d27205351539293b7a3eaadfa4be42d5da47a0e0`。
- buildFingerprint: `a80abea6f1a40f40561485691d41fdc9d26729f5a8981ddba156a30b744e4152`；实操载入 `/assets/index-BhLOGPgB.js`。
- 以上指纹由本审查者在 `2026-10-27T08:32:54.963Z` 独立计算；算法与运行脚本相同：所有已跟踪/未忽略未跟踪 `src/`、`scripts/` 文件按路径排序，依次以路径及文件字节更新 SHA-256；构建以 index.html 和其直接引用的 JS/CSS 字节连接计算。记录见 `visual/final-fingerprint.json`。
- 约束：产品源码、配置、PRD 只读；仅写本报告及经主线明确允许的 `artifacts/uvel-trial-20261027/visual/` 审查证据。仅使用本任务 5251 模拟服务，未操作 5237 或其他服务。

## 独立重建的验收

来源：本工作树 `PRD/UVEL_试用生命周期与队列_20261027.md` 的 FEAT-TRIAL03/04、主线转交的当前用户要求、`docs/audit/2026-10-25-ui-design-implementation.md` 的最终用户决定，以及本任务 `docs/audit/2026-10-27-trial-lifecycle/plan.md`。

1. 福利卡领取后持续呈现 active、grace、ended、converted；确认、取消、激活中、成功、失败重试闭合；随时可主动提前购机。确认按钮明确激活开始，指定删除的冗余说明不再出现；预计抵扣与实际可用抵扣仍区分。
2. 首页、Earn、设备管理分别呈现独立试用行：试用标记、时间、当前可抵扣、预计值、进度、详情和提前购机。原已购设备保持可见；两台已购设备加一试用为 3/6；实际模拟转购后试用行退出、第三台已购设备替换且不重复占槽。
3. 320/390、zh/en/vi、明暗主题无任务相关的文字裁切或横向溢出；深色保持黑灰与青柠、浅色保持电光蓝，既有 Liquid Glass 控件保留；关闭/取消出口和触摸目标可达；减少动态与底部安全距离有证据。
4. 资格、金额、时长及再领条件依权威状态；不从图示推断新的经济政策，不把模拟验收说成正式 TEST、真实付款或原生硬件验收。

## 已完成的证据检查

- 已读 `nexion-workflow`、`task-workflow`、`nexion-audit`、`done-review`、工作树 AGENTS、CLAUDE、package.json 与目标 PRD。
- `runtime-acceptance/report.json` 为 simulation=true、pass=true、errors=[]，包含 320/390 × zh/en/vi × light/dark 共 12 组。审查者已亲看这 12 组确认层截图和 12 组首页 active-fleet 截图；另亲看成功、失败、最后 12 小时、grace、ended、converted、详情、管理、Earn、支付二次确认、转购订单及第三台设备截图。没有把读取 report.json 当作自己点击过。
- 12 组确认层均无被要求删除的说明；产品、3 天、预计抵扣与激活按钮清楚，长语言没有横向裁切。报告中 12 组底部 padding/bottomGap 为 38px，dismiss 高度为 44px；这只证明浏览器布局，不能代替原生安全区实测。
- 首次 12 组证据 source=`0eb1973db4ad8dd71681709f4e1cf5c8670872ad4e27c8d75ca13e46603dba1b`、build=`65b7c249b687ccf6728198abdff021b55db23f5540dbf58975da56976e81eb4f`。已用 `git diff --name-only e5810fc5 19f1a42b... -- src scripts` 确认该次快进仅涉及钱包、消息、通知及相应测试，未改变试用 UI 源。
- 随后 `runtime-integrated/report.json` 的新快照 source=`30f1a8570569394389af647243954e992761c9e5cee053a3f03eb9a0ad4b7924`、build=`9f3c4c5c8e91394b9a7f0912e7a5258e58fb36f8eb69ac9a3346204e30220747`、`index-ChX2izrk.js`，390-zh-dark 完整模拟链 pass。此后 Earn 圆角及检查脚本继续修改，因此该次通过保留为历史证据，最终签署已绑定本报告顶部的新构建。
- 释放浏览器后，主线生成 `.cache/trial-lifecycle/runtime-final-approved/report.json`；本审查者随后亲自读取其元数据，确认 source=`fa477e96988a9d887dd804d0d27205351539293b7a3eaadfa4be42d5da47a0e0`、build=`a80abea6f1a40f40561485691d41fdc9d26729f5a8981ddba156a30b744e4152` 与本次独立指纹完全一致，390-zh-dark 完整链 pass=true、errors=0。这是主线运行的附加证据，不替代下文独立实操。

## Findings

### TV-01 — P2 — Earn 新试用行直角背景覆盖设备池圆角

- 触发：ACTIVE 试用，进入 Earn；浅色主题尤其明显。
- 位置：`src/components/earn/empty-slots-hint.vue:131-132` 的外框有圆角但未约束子背景；`src/components/trial-device-row.vue:39` 新增实色背景无圆角。
- 影响：Earn 顶部出现直角矩形，而首页通过父容器裁切、管理通过传入圆角保持圆角，三个同形入口的视觉结构不一致。
- 证据：`.cache/trial-lifecycle/runtime-acceptance/320-en-light-earn.png`。该截图已由本审查者亲看，主线也已回源确认。
- 状态：**closed**。主线在 `empty-slots-hint.vue:133` 为首个试用行加上方圆角；本审查者回源后，在 `index-BhLOGPgB.js` 的 320×693 英文浅色 Earn 现场测得左上、右上均为 **28px**，并亲看 `visual/02-earn-320-en-light.png`、`visual/03-earn-320-en-light-scrolled.png`，直角覆盖已消除。
- 最终无开放 P0/P1/P2。

## 本审查者实际操作与读回

浏览器使用既有 ego-browser TaskSpace 1、p1；未另建空间、未启动别的浏览器。所有场景只在 `http://127.0.0.1:5251/preview` 内完成。脚本、JSON 和截图均位于本报告旁 `visual/`。

| 操作 | 观察与证据 |
|---|---|
| 320×693、英文、浅色，进入 Earn 并用真实滚轮下滑 | 一个标记清楚的试用行，时间、$38.53 起累计抵扣、$50.00 预计值及进度分开；保留 S1/Pro 两台设备；修补后左右上圆角 28px；文档宽 320px。`02-earn-320-en-light.json`、`03-earn-320-en-light-scrolled.png`。 |
| Earn 详情 → 提前购机 → 支付二次确认 | 实际点击进入试用详情，再进入结算；确认层显示金额和取消/确认支付。`04-detail-320-en-light.png`、`05-checkout-confirm-320-en-light.png`。 |
| 显式确认模拟付款 → 订单 → 返回首页并刷新 | 订单 `TRC-DEMO1793089508385` 为 PAID/ACTIVATED，实际展示已激活和数量 1；模拟余额从 52,800.64 到 51,560.25，只有一个订单；刷新后 converted、0 试用行、3 已购设备行、`3 of 6`。`06-purchased-order-320-en-light.png`、`07-conversion-readback.json`。 |
| 320×693、越南语、浅色，确认后取消再进入 | 取消后未产生 ACTIVE 领取；重新打开有设备、3 天、预计抵扣，指定冗余说明不存在。主按钮 48px，关闭/取消各 44px，底部间距约 38px，无横向溢出。`09-confirm-320-vi-light.json/.png`。 |
| 真激活中 → 成功 | 仅对该浏览器临时加 700ms 网络延时，实际点击激活后捕捉到 busy 文案与禁用反馈，然后等权威读回到成功层；不是改 DOM 伪造状态。`10-activating-320-vi-light.png`、`11-success-320-vi-light.png`。延时随后清除。 |
| 减少动态 | `prefers-reduced-motion: reduce` 下，插画 animationName 和确认层 animationName 均为 `none`；详见 `09-confirm-320-vi-light.json`。仿真随后清除。 |
| 成功层查看设备 → 设备管理 → 键盘详情 | 实际点击成功层主按钮进入管理，试用行含可操作详情/提前购机和取消；以 Enter 打开详情成功。`12-management-320-vi-light.png`、`13-activation-reload.json`。该阶段保留先前转购产生的第三台已购设备，另加试用，故 4/6 是正确场景，未用来冒充原 2+1 验收。 |
| 重置本任务合成场景为 2 台已购设备，激活失败 → 明确重试 → 成功 → 刷新 | 错误层无成功标记、越南语明确重试按钮；再次点击成功后刷新为 active、1 试用行+2 已购设备、3/6。`14-claim-error-390-vi-light.png`、`15-failure-retry-reload-states.json`。 |
| grace / ended | 同一新构建中 grace 保留 1 试用行、2 已购设备、3/6；ended 只移除试用行，2 台设备保留、2/6。`15-failure-retry-reload-states.json`。 |

审查脚本中保留了工具侧失败：预览切换会重载 iframe，曾在旧节点短暂满足条件后读取到空节点；补充观察后等待实际状态恢复。ego 的自动点击也曾未将嵌套滚动区内按钮滚入可点击区域，随后用真实滚轮滚动，按钮正常可点。这些失败未被当作产品通过证据。一次在付款确认层长停留后等待订单页超时，复查仍在结算；重新显式点击支付/确认后观察到上述唯一订单，未把首次超时计作成功。

预览顶层刷新会把尺寸恢复为 390×844。`07-converted-fleet-320-en-light.png` 与 `08-confirm-320-vi-light.png` 曾沿用旧裁切框，因此**排除这两张图片作为尺寸或完整画面证据**；07 的 JSON 读回有效。正式窄屏确认使用重新选定 320×693 后的 09–11 图片及实时尺寸 JSON，转购订单窄屏图使用刷新前的 06。

## Acceptance results 与完整性复核

| id | status | evidence |
|---|---|---|
| TV-TRIAL03-LIFECYCLE | pass | 本次亲点 active、grace、ended、实际转购后的 converted，并用 15/07 JSON 读回；12 组历史矩阵的试用 UI 源在快进前后未变，当前修补点另有独立实景。 |
| TV-TRIAL03-CLAIM | pass | 09–11、14 截图和 15 JSON：取消、busy、成功、失败重试、刷新持久；指定说明三语已删，预计值解释保留。 |
| TV-TRIAL03-EARLY-PURCHASE | pass | 04–07：详情、提前购机、二次确认、模拟订单和转换后刷新；不声称真实付款。 |
| TV-TRIAL03-RESTART | pass | 已回源核对 `canRestart`/`canStartNow` 依后台资格；12 组运行证据覆盖冷却后首页/详情再次开启确认。此项操作证据来自原运行矩阵，不冒称为本审查者再次执行。 |
| TV-TRIAL04-THREE-SURFACES | pass | 12 组首页队列图审，当前构建亲点 Earn、管理、详情及首页读回；TV-01 已关闭。 |
| TV-TRIAL04-CAPACITY-PRESERVATION | pass | 07、13、15 JSON 与实际截图：2+1=3/6，转购置换为3+0=3/6；新增已购设备后再次试用3+1=4/6仍保留全部设备；终态仅释放试用槽。源码采用独立 TrialDeviceRow，未向正式 devices 数组注入试用。 |
| TV-VISUAL-MATRIX | pass | 12 组确认/首页 active 队列截图亲看；当前 320×693 英文/越南语浅色、390×844 状态切换及深色恢复亲自操作；触摸高度、安全底距、无横溢出和减少动态另有测量。 |

coverageReview: `pass`，范围为上述两项用户需求的本地模拟 UI/人工操作验收。从原始需求与当前 PRD 重新核对入口、字段、状态、下一步、失败和退出，没有只审 diff；旧证据与当前新构建证据明确分开。全程未改产品源码，也未以主线给出的分数代替独立评分。

done-review 六维已对照：真写/读回/刷新有 07、13、15；应有字段和入口按原始清单覆盖；确认、取消、重试、键盘和购机可操作；首页/Earn/管理同形核对并发现修补 TV-01；三语/主题/宽度及金额标签覆盖；新构建实景回归已完成。防自欺六问逐项以这些证据回答，未把静态检索、截图存在或编译通过当作自己实际操作。

## 边界、遗留与收尾

- 正式 TEST HTTP、真实付款、原生硬件及原生安全区、任意超长后台商品名未由本审查者实机验证；评分只针对当前指定的 UVELBox S1 和上述浏览器模拟范围。
- 未重新执行主线的 182 条行为测试或 native 编译，不冒称自己运行；机器测试、正式后端事务、H5 同步与部署由相应主线/审查负责。
- 首次旧矩阵 source/build 只支持未改变部分；最终 P2 修复和关键实际操作绑定本报告顶部的 fa477e / a80abe 指纹。
- 5251 已释放给主线；p1 留在 390×844 中文深色首页、ACTIVE、1 试用+2 已购、3/6。网络节流及减少动态仿真已清除；共享 TaskSpace 未关闭，留给主线继续当前用户任务。
- 证据和脚本保留用于交付复核；其中排除使用的裁切图已在上文标注，不硬删或抹除失败记录。

大白话：我独立看图并实际点完了领取、重试、详情和模拟转购，找到并复验关闭了 Earn 的圆角问题；这两项在当前本地构建中达到 9 分门槛，没有新的产品决策需要主人拍板，正式环境与真机仍需按上述边界另验。
