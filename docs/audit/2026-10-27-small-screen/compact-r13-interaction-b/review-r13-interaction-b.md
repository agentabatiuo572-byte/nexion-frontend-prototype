# r13 增量交互复审 B — 冻结 / READY

**已按用户滚动条反馈立即停止 r13，旧包标签关闭，可以构建 r14。当前 3 项 P2 均为 8.8 / OPEN，不签整包通过。** 其余下表已完成项保留有界结果；未触发的路由不给通过分，不继续扩大旧包矩阵。

## 精确构建与证据

- 实际入口 **index-DfgZV_HM.js / index-64PWOPxR.css**。21 张 B 独立截图各自有入口读回；另原样保存 1 张用户提供的滚动条 PNG，不能计作 B 独立截图。
- JS SHA256：`3D5813115238A56C508D7D6508A52A2196FF9E0EA4243F0C9342CF33CF8C4C4E`。
- 主 CSS SHA256：`DB936DD72551D4EC173B303482337C0608E4C6FC6A10EBCF049E93DA74B323DE`。
- [36 个实载资源指纹](./artifact-fingerprints-r13.json)全部在冻结时读到文件。动态 CSS 独立记录，没有因主 CSS 与 r12 相同便推断组件相同。
- [完整运行态 JSON](./runtime-evidence-r13.json)；[截图 SHA256 清单](./image-manifest-r13.json)。
- 独立内置 CUA，自己的 **5252** mock、标签 1733372929。仅操作该入口；未导航或操作用户 5237/5240/5249/5251 等标签。5237 仍是唯一用户验收入口。
- 当前源码已在准备 r14，远端业务日历已合并；这些后续源码变化不冒称进入 Dfg。原始截图保留真实主题：首帧实际暗色，已改名为 `01-benefits-active-vi-dark-320.jpg`，没有伪标浅色。

## 三项未通过

| P2 / 当前分数 | 确凿证据 | 边界及后续 |
|---|---|---|
| **320 越文未领取卡排版：8.8 OPEN** | “Nhận dùng thử”在 108.67×44 的胶囊内分成“Nhận dùng / thử”，末词孤行；两卡均被拉至约 283.33px，券卡留白明显增大。[截图](./12-benefits-unclaimed-vi-light-320.jpg) | 这是可见排版与胶囊比例问题，不把某个旧高度当硬性规格。A 的 8.7 与 B 的 8.8 分别保留，不取平均。父线程已安排仅 ≤350 修复，390 原批准未领取卡保留；修复尚未入 Dfg。 |
| **首页普通设备 Online 绿点未绘制：8.8 OPEN** | 两行普通设备确认为 online；`.hf-status-dot` 声明 7×7，却为 `display:inline`，实际矩形 **宽 0px、高 14px**。绿色背景虽存在但没有可见宽度。截图中普通两行只有 Online 文字。[截图](./14-home-online-vi-light-320.jpg) | 限定首页普通设备。库存、Earn 和试用行的 7px 绿点正常。请勿因其他位置已显示而关闭首页遗漏。完整 computed 值在 JSON 的 homeDotEvidence。 |
| **注册/引导成功长页原生滚动条：8.8 OPEN** | B 的注册完成 retry 图和用户新图都能看到右侧整条宽灰色原生滚动条。[B 图](./retry-04-register-success-synthetic-vi-light-320.jpg) / [用户原图](./user-success-native-scrollbar.png) | **B 的漏检成立**：先前只核对 retry 字体，漏掉整页视觉问题。该页不能签通过，字体读回不能代签整页。r14 必须实际上下滚动，含浅暗、320/390 代表，检查顶部及底部内容可达；不得用 overflow:hidden 锁死内容掩盖滚动条。未检查的其他引导长页保留同类风险，不冒称全部独立复现。 |

## 按现行口径已完成的范围

| 项目 | 分数 | 独立实景结果 |
|---|---:|---|
| active/grace/ended/converted 福利状态卡布局及入口 | **9.2** | 320 越文均无独立 CTA，根 role=button、tabindex=0、完整 aria。active 单击、grace Enter、ended Space 都进入既有试用详情；converted 单击进入设备页。不是每态穷举全部按键，已覆盖共享单击、Enter、Space 和各实际目的地。左右等高：active/grace 约 201.33、ended 223.33、converted 205.33px；图 96px、位于文字下方及地板光影上方。 |
| 行内紧凑倒计时及顺序 | **9.2** | 320 为 10.5px、390 为 11px；文字完整单行，标题与时间不相撞，数字没有截断。**用户已明确 14/12 是被替代的旧方案，原仅凭数字差异给出的 P2 已撤回；不是代码修复。** 实际 meta order=0、art order=1，未复现排序错误，取消源码疑点。 |
| 390 中文暗色未领取结构对照 | **9.2** | 双卡均 173×184；原独立“立即领取”80×44 保留，图约 118px，没有套领取后无 CTA 的状态卡结构。[截图](./04-benefits-unclaimed-zh-dark-390.jpg)。未操作 5237，也不宣称取得其批准图做逐像素比对。 |
| 360 英文浅色未领取代表 | **9.1，仅本帧** | 双卡同高约 275.33，完整英文文案和 Claim trial 单行可见、目标高 44，无文字覆盖或页面横向溢出。该帧不替代 320 越文低分项。 |
| 未领取入口的原业务流程 | **9.3，仅交互** | 320 越文实际点击领取 CTA，打开既有确认弹层，显示设备及预计抵扣；点击“Để sau”取消，未激活试用。此交互通过不抵消该 CTA 的排版 8.8。 |
| 库存普通/试用大图和紧凑动作 | **9.3** | 320 图框均 56×56、标题行均高 80；390 图框 64×64。普通规格在左，停用动作在右，根 **64×44**、伪元素可见面 **32px**。实际点根 y+2 外沿打开停用确认，再关闭；未执行等待或强制停用。仅测停用分支，未因共享样式便宣称未激活库存的激活分支也实测过。 |
| 库存/Earn/试用 Online | **9.3，仅已显示位置** | 库存普通及试用均为 Online；7×7 绿点实测 `rgb(14,142,74)`。Earn 普通/试用点可见。首页试用点也可见；首页普通点缺失仍单列 P2。 |
| 多行消息末行可见性 | **9.3** | 新草稿长 147 字符，输入区高 144、scrollHeight=240。实际在框内向下滚动，scrollTop **0→96**（最大值），截图完整显示 `R13-END không gửi.`，发送按钮未覆盖文字。未发送，草稿已清除。[前](./16-message-tail-before-scroll-vi-light-320.jpg) / [后](./17-message-tail-after-scroll-vi-light-320.jpg)。可关闭 r12 的末行未证实项，仍不代签物理软键盘。 |

## 8 个 retry 文件的必要实景与界限

点击记录均为 CUA 实际操作；只列关键本地 GET，窗口也可能包含轮询。analytics POST 409 属本地未建模写入，不算读取恢复。没有注册、验证码提交、抽奖报名或支付。

| 文件代表 | 当前结果 | 请求/边界 |
|---|---|---|
| developer（申请结果及文档） | **9.3**，13px/600/20px | 实点后 GET `/api/app/developer/access-requests/latest`、`/api/developer/docs` 503；文档重试截图可见。未穷举 API key/Webhook 子页。 |
| genesis-raffle 首次失败 | **9.3**，13px/600/20px | GET `/api/events/genesis-raffle` 503；未报名。 |
| genesis marketplace 事实读取 | **9.2**，13px/600/20px | GET state/account/eligibility；mock 返回 200 但事实仍未确认。只签字体和读取可触发，不能称恢复成功；补页错误分支未另测。 |
| register/success 下载配置 | **页面 8.8 OPEN** | 文字确为 13px/600/20px、根高 44，点击 GET `/api/config/platform` 503、referral config 200。仅合成打开成功页，没有实际注册。整页因宽灰滚动条不通过；这是浏览器同源码 H5 条件分支，不是物理 APP 证明。 |
| onboarding/terms | **未覆盖，无通过分** | 从合成注册的条款链接实际进入 privacy 门禁：`/pages/onboarding/privacy?return=...register...`，`.tos-fail__retry-label` 未出现；未接受条款或注册，不追扩门禁流程。 |
| store/detail 资料 | **未覆盖，无通过分** | 正常目录实际进入 `/pages/store/detail?id=stellarbox-s1`；保留当前页、切本地读取失败后从目录重进，目标资料重试标签仍未出现。用户立即冻结时停止，不能用源码 class 代替运行态。 |
| events/detail | **未开始** | 用户滚动条反馈要求立即停止，保留待补，不另开 lazy route。 |
| promotion-reward-detail | **未开始** | 同上。 |

已拍字体图：`retry-01-developer-vi-light-320.jpg`、`retry-02-raffle-vi-light-320.jpg`、`retry-03-market-vi-light-320.jpg`、`retry-04-register-success-synthetic-vi-light-320.jpg`。完整请求和字体在 JSON 的 retryChecks/cases。

## slot 与其它执行边界

- slot 仍无实景通过分。自己的 mock 只有已激活设备，实际“添加设备”按现有 openForSlot 分支直接进商城；无可用未激活库存。没有为了触发弹层而真实停用、购买或伪改应用 store。需要对应合成库存后才能签其关闭/激活交互。
- 用户已通知 r13 之后的库存局部 keydown 撤回、全局 repeat 过滤和 6 个 Android 能力提示将入 r14；不把它们写成 Dfg 已过。
- 用户当前未领取窄屏修复、滚动条修复均尚未进入本报告构建。r14 只需复查这些受影响点、首页绿点、键盘/平台提示及精确指纹；已过状态卡和旧矩阵不全量重跑。
- 本轮实际视图：320 越文浅色为主，390 中文暗色及 360 英文浅色对照，另有一张真实 320 暗色起始帧。不同状态和输入方式有界代表，不冒称全部组合覆盖。
- 当前自己的 mock 数据状态为“加载失败”，下轮需显式恢复正常场景。未改其他端口或用户状态。
- 只写本目录报告/截图/JSON；未改产品、构建、运行测试、commit/push。类型、webgreen、73 测试以及远端日历合并来自父线程，不列为 B 独立执行结果。H5 最终包、物理 APP、原生键盘和真实安全区均未代签。

## 主要截图索引

- 福利：`01-benefits-active-vi-dark-320.jpg`、`02-benefits-active-vi-light-320.jpg`、`03-benefits-active-zh-dark-390.jpg`、`04-benefits-unclaimed-zh-dark-390.jpg`、`09-benefits-grace-vi-light-320.jpg`、`10-benefits-ended-vi-light-320.jpg`、`11-benefits-converted-vi-light-320.jpg`、`12-benefits-unclaimed-vi-light-320.jpg`、`13-benefits-unclaimed-en-light-360.jpg`。
- 设备：`05-inventory-images-online-vi-light-320.jpg`、`06-inventory-action-right-vi-light-320.jpg`、`07-inventory-stop-confirm-only-vi-light-320.jpg`、`08-inventory-images-online-zh-dark-390.jpg`、`14-home-online-vi-light-320.jpg`、`15-earn-online-vi-light-320.jpg`。
- 消息与 retry 见上文。21 张独立原图为 JPEG；390 使用完整预览视口，实际手机仍为 390×844。用户 PNG 仅原样复制，全部图像字节 SHA256 已冻结。

**冻结完成 / READY。** 旧 r12/r10/r9/r8 报告及原失败记录保留，不用新分数改写历史。5252 本地服务保留，B 的 r13 临时标签已关闭；后续仅等待 r14 新指纹增量。
