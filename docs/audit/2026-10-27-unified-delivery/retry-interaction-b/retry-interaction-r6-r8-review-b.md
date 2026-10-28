# APP 紧凑重试增量复审 B — r8 冻结

结论：本次限定范围通过，最低 **9.3/10**；未发现新增 P0/P1/P2。r5 的商城孤字行、team-ledger 字体漏项两项 P2 已关闭。此结论仅覆盖下表实际检查项，不代表全部新增字体选择器或 H5 同步验收。

## 构建与证据归属

- 独立入口：http://127.0.0.1:5252/preview；owned port **5252**。B 自建本地 mock，未操作用户 5249 或其他审查端口。CUA Chrome 独立任务标签 1733372897；没有使用外部浏览器脚本。
- 最终浏览器实际入口：**assets/index-BSpOlTnk.js**；主样式 **assets/index-8t-HDpGw.css**。r8 商城截图直接绑定此入口。
- r8 JS SHA256：`64F1E788B059542C957571FFFA31727D797ED183562AE74B17BF6FB02A4B05A8`。
- 主 CSS SHA256：`EF9523A26C7D0E928999D9D89308A117969D2542595DCF9A019CB944651D9FAC`。
- index.html SHA256：`E7143931E97A1F85804EC781A2B9BB2754D024D842187AD153BF71C10D5ECA74`。
- APP 工作树 HEAD：`f7c9de55af6f539b457bc12fc63d2ecbfadecc22`；候选包含冻结工作树改动，HEAD 本身不等于候选构建标识。
- 本轮字体实景实际采集于 **r7 index-BYkotkfZ.js**。未获得可用 r6 实景截图，因此不冒称 r6 点击通过。按父线程给出的变更边界，r6→r7→r8 主 CSS 相同，仅商城中文标题/说明改变；团队与邀请字体、触控和请求证据据此保留到 r8，不改写原证据入口。
- [原 r5 冻结报告](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/retry-interaction-review-b.md)及原截图未修改，原始最低 8.8 保留。

## 限定实景评分

| 项目 | 实际视图 / 构建 | 分数 | 独立读回与结果 |
|---|---|---:|---|
| 商城中文短标题、短说明及右侧重试 | 320×693 中文暗 / r8 | **9.4** | “信息暂不可用”单行，字面宽 114px；“选择已保留，重试后确认。”单行，宽 156px。文案列 186.90px，动作列 89.10px，中间 12px，提示总宽 288px。按钮 89.10×44px、600 13px/20px、nowrap。无孤字、交叠或文档水平溢出。设备目录整块错误卡和底部导航仍保持原布局。 |
| team-ledger 财务汇总字体 | 320×693 中文暗 / r7，同 CSS 继承 | **9.4** | `.team-ledger__retry` 从 r5 的 12px/18px/400 修为 13px/20px/600、nowrap；目标 44×44px，中心命中可点击控件。提示仍在原财务汇总行中，没有变成整页通用网格。 |
| team-summary 卡内重试 | 320×693 中文暗 / r7，同 CSS 继承 | **9.3** | `.team-summary__status .team-summary__action` 实测 13px/20px/600、44×44px，中心命中。卡内原纵向说明与动作布局保留；没有强制把整张卡改成局部左右提示。 |
| 邀请分享弹层加载失败 | 320×693 中文暗 / r7，同 CSS 继承 | **9.3** | `.ss-retry` 实测 13px/20px/600、58×44px，中心命中。长说明在左侧自然换行，按钮在右侧；280px 宽状态行不挤压，弹层插画、关闭按钮和各分享行保留。仅检查失败重试，没有分享给他人。 |

截图：

- [r8 商城最终图](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/r8-01-store-final-zh-dark-320.jpg)
- [team-ledger 字体](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/r7-02-team-ledger-zh-dark-320.jpg)
- [team-summary 卡内布局](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/r7-03-team-summary-zh-dark-320.jpg)
- [邀请弹层](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/r7-04-share-sheet-retry-zh-dark-320.jpg)

`r7-01-store-title-zh-dark-320.jpg` 是中间候选，正文仍存在父线程发现的孤行；保留过程证据，但不用于最终商城通过结论。

## 实际点击与请求

均由 B 在自己的 5252 mock 上通过 CUA 点击实际可见控件，CDP Network 记录点击窗口内的新请求：

| 控件 | 实际新增读取 | 响应 |
|---|---|---|
| team-ledger 重试 | GET /api/app/team/network；GET /api/app/team/insights/commissions | 503 / 503 |
| team-summary 重试 | GET /api/app/team/network | 503 |
| 邀请弹层重试 | GET /api/config/platform；GET /api/config/referral-rewards | 503 / 200 |

失败场景由预览面板控制，503 是预期模拟状态；可以确认重试仍发起读取，不将其当作正式服务恢复证明。点击窗口可能含并发读取，不把所有背景请求归因于按钮。mock 的 analytics POST 409 没有作为字体或刷新缺陷计分。

商城刷新操作沿用 r5 已冻结的交互证据；r8 仅重拍变动的中文排版，没有重复点击或宣称 r8 全流程再验。完整原始读回、入口、尺寸与本轮点击请求见 [增量证据 JSON](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/r7-r8-incremental-evidence.json)。截图为 CUA 原始 JPEG，扩展名与内容一致。

## 覆盖边界与冻结

- 按用户最后指令收口现有已完成范围，不扩展矩阵。通知顶栏新字体、订单读取、试用不可用、其他新选择器没有新增实景分数；此前 r5 的多语言/明暗/宽度样本及发送失败、整页 EmptyState 边界仅保留各自构建记录。
- 远端 origin/test=fb301913 尚未合并的紧凑试用设备行/设备管理布局不属于 r8；后续仅需对设备行与重试交叉点做增量检查，本报告不覆盖该变化。
- 未改产品源码，未构建、运行测试、commit 或 push。父线程报告的 types/回归/native 通过不列为 B 独立执行结果。
- 全部业务交互仅本地模拟账号，无正式服务、真实支付、原生设备或 H5 同步验收结论。此前 H5 冻结报告保持原样。
- 本报告与五张新增/中间截图及 JSON 冻结；5252 服务保留供后续明确增量使用。
