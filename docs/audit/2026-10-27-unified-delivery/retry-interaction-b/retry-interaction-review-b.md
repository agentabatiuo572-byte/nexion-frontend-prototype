# APP 紧凑错误提示交互复审 B — r5 冻结交付

**结论：r5 未整体通过。当前 2 项 P2，最低 8.8/10；P0/P1 未发现。** 已完成部分的证据保留，不重复已通过的试用、清空流程或后台/支付矩阵。按用户最新要求先交付本轮，等待 r6 的新增遗漏定点复验。

**Owned port：5252**。本地 mock 服务由 B 启动，PID 21028，exec session 20392，工作目录 D:/WORKS/PLAN/.wt/uvel-design-20261025-app。启动命令 node scripts/prototype-preview-server.mjs，DEMO_PORT=5252，DEMO_BUILD_ROOT 明确指向该 APP 工作树 dist/build/h5，未使用共享状态文件。5252 仍运行，父 QA 5249 和用户页面未操作。

## 未通过项

| 项目 | 评分 | 独立实景读回 | 证据/处置 |
|---|---:|---|---|
| P2：320 中文商城局部提示标题孤字行 | 8.8 | 标题实际分行为“暂时无法读取最新信” / “息”；左侧宽 186.90px，右侧 CTA 89.10×44px，间距 12px。按钮正确，但标题的最后单字孤立，影响紧凑排版质量 | [商城截图](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/07-store-zh-dark-320.jpg)。保持右侧按钮和长文案预留空间，修复孤字行；B 未改产品 |
| P2：团队财务汇总重试字号漏统一 | 8.8 | .team-ledger__retry 实际 12px / 18px、font-weight 400，高度约 44px；没有共享 inline 祖先 | [团队截图](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/10-team-financial-retry-exclusion-vi-light-320.jpg)。用户随后明确要求该选择器采用 600 13px/20px + nowrap；父线程已报源码修复，尚未构建，因此仍待 r6 实景读回 |

第二项最初作为“财务重试没有被全局覆盖”的边界读回保留；按用户补充的明确选择器要求，现将其归为字体漏项，**不继续宣称该项通过**。源码修复不等于本轮 r5 运行态已修复。

## 当前构建与继承范围

- 最终绑定：**assets/index-B0RqUdly.js / assets/index-M9lx7jQr.css**，浏览器中独立读回。
- r5 JS SHA256：8b042c452c892d9806d7667a56d33779c71d8c1cb0509023402de95d57badf1d。
- CSS SHA256：cb6e856366695ee7d9f4b103d92f1c4563c0a842405fba37313934c9d6829645。
- index.html SHA256：fdac51b2c0ce82c3fb44b8fd0800ffb3151fd4499f6a7bf50ea4eed876df5749。
- r5 静态复核：inline-recovery.css SHA256 c88bd0d162c44538c28fec9b2f24cdde0fe738cbec846c76ac716b8f85412a66；搜索页 SHA256 1cd11c487d173c815e8275e56d80c7f9ffda3de62b9356c08d29e3689cb83f39。
- 01-earn-zh-dark-390 是先前 **index-Bo1e4G3-.js** 的独立截图。用户说明 Bo→r5 仅搜索提示 opt-in class 改变，CSS M9lx7jQr 不变；本报告将该中文 390 Earn 证据按此边界保留，不改写为 r5 点击。其余截图均为 B0RqUdly。
- 初始 DHpU0CEC 只做启动前磁盘核对，没有把它当最终构建实景分数。
- 父线程在 r5 后修改了 team-ledger 源码但未重建；本报告只对上述实际构建和截图负责。

## 已完成代表性矩阵

| 页面/分支 | 视图 | 分数 | 结果 |
|---|---|---:|---|
| Earn 设备失败、收益汇总失败 | 390 中文暗；320 越文浅；320 英文暗 | 9.4 | 右侧按钮留位，600 13px/20px，最小 44×44，12px 间距；长文案在左列换行，无文字/按钮重叠 |
| Home 收益失败及队列不可用提示 | 390 英文浅 | 9.3 | 收益 Retry 实测 50.06×44，字体 600 13/20；队列 Manage 保持导航语义并右对齐 |
| 消息已有列表后的局部失败 | 320 越文浅 | 9.3 | 保留已有通知，局部提示两行；右侧 44×44、600 13/20、12px 间距；点击重新读取通知 |
| 设备整页 EmptyState | 390 英文浅 | 9.3 | 仍为居中插图、标题、说明和独立 CTA；没有套局部两列网格，重试仍请求数据 |
| 设备缓存正常基线 | 320 越文浅 | 不给错误分支分数 | 仍显示两台已有设备；不能冒称已触发 inventoryStale。设备局部 warning 只做了源码范围复核，本轮未拿到稳定的该分支实景 |
| 商城局部提示 | 320 中文暗 | **8.8** | 右侧 CTA 格式和刷新请求通过，标题孤字行未通过，见 P2 |
| 团队成员网络 | 390 越文暗 | 9.3 | 经团队内真实“Mạng lưới thành viên”入口进入；右侧 67.44×44、600 13/20、12px 间距；刷新网络请求可见 |
| 团队财务汇总提示 | 320 越文浅 | **8.8** | 12/18/400 漏项，父线程已报源码修复待 r6 |
| 搜索部分来源失败，r5 增量 | 320 越文浅 | 9.3 | 输入 thiết bị，保留已有页面/帮助结果，真实显示部分来源失败；右侧 44×44、600 13/20、12px 间距，点击重新读取多个来源 |
| 320 中文手机卡新短文案 | 明/暗两主题 | 9.2 | 实际文案“连接 Android 手机”，单行高度 19.5px，13px 字号，卡 288×148.43；不再有尾字孤行 |
| 发送失败气泡重试排除边界 | 320 中文暗 | 9.2（仅布局边界） | 仅向自己的 mock 发送一条 R5 retry layout probe，失败后保留回执重试图标；它仍为独立 44×44 控件，没有 nx-inline-recovery 祖先，未被改成通用两列提示；没有再点重发 |

这是局部代表性矩阵，不是 320/390×三语×两主题×每个页面的笛卡尔全覆盖。三语言、明暗和两种宽度均有实际样本；没有用一张图替代未操作分支。

## 关键实测

- Earn 中文 390 顶部条：根区域 358×68，文案列 278px，动作列 44px，间距 12px。320 越文顶部条：288×78，动作 44×44，长描述在左列分行。收益汇总长越文提示同样没有进入动作区域。
- Home 英文 390 收益行：354×44，Retry 50.06×44。其他单纯导航动作仍保持原动作语义，没有为“统一重试”替换成错误业务动作。
- 消息局部错误：288×68，右侧 44×44，左列多行；真实保留了先前通知条目，不是用整页空态代替列表。证据 [09-notifications-cached-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/09-notifications-cached-vi-light-320.jpg)。
- 搜索 r5：真实展示“Chưa tải được một phần thông tin. Bạn vẫn có thể xem các kết quả hiện có.”，下面的页面/帮助结果仍可见。局部区 288×44，重试 44×44、nowrap、600 13/20。**这是实景验证，不仅是源码推定。** 证据 [11-search-source-state-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/11-search-source-state-vi-light-320.jpg)。
- 全部已记录局部 copy/action 区未测到水平文字重叠；文档水平溢出为 false。屏外动作的 hit=false 表示不在该截图视口内，不等同禁用或产品触控失效。
- 手机卡明暗两种截图均为 r5；文案 body 高度恰为单行 line-height 19.5px。[浅色](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/12-phone-short-copy-zh-light-320.jpg) / [暗色](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/13-phone-short-copy-zh-dark-320.jpg)。

## 重试请求与恢复证据

B 通过内置 CUA 点击控件，以该标签页 CDP Network 事件记录点击后的本地请求。下表只列 GET 路径；并发页面读取/轮询也可能出现在窗口内，不将每一条都断言为该按钮唯一发起。关键被测读取路径在点击后有新请求。

| 点击记录 | 点击窗口内 GET 路径 | 响应状态 |
|---|---|---|
| earn-fleet-zh-dark | /api/devices/earnings, /api/tasks/assignments | 503 |
| earn-fleet-vi-light | /api/devices/earnings, /api/tasks/assignments | 503 |
| earn-summary-vi-error | /api/app/home/overview | 503 |
| earn-fleet-recovery-200 | /api/withdrawals, /api/devices/earnings, /api/tasks/assignments, /api/tasks/route, /api/app/support/conversation-management, /api/app/support/conversations/cursor, /api/app/support/conversation-dismissals | 200 |
| earn-summary-recovery-200 | /api/app/home/overview, /api/quests/state | 200 |
| home-earnings-retry-en | /api/app/home/overview | 503 |
| devices-full-empty-retry | /api/store/catalog, /api/devices/earnings, /api/tasks/assignments, /api/trial/state, /api/vouchers, /api/config/commission/rates, /api/team/binary, /api/app/team/insights/commissions, /api/config/v-ranks, /api/team/rank, /api/app/team/network, /api/app/network/device-rank, /api/genesis/state | 503/200 |
| store-promotion-retry | /api/app/support/conversation-management, /api/app/support/conversations/cursor, /api/app/support/conversation-dismissals, /api/store/catalog, /api/promotions, /api/config/v-ranks, /api/team/rank, /api/config/commission/rates, /api/team/binary, /api/app/team/insights/commissions, /api/vouchers, /api/app/team/network, /api/app/network/device-rank | 503/200 |
| team-network-retry | /api/app/team/network | 503 |
| notifications-inline-retry | /api/notifications | 503 |
| search-partial-source-retry-r5 | /api/tasks/assignments, /api/devices/earnings, /api/app/home/overview, /api/app/support/faqs/page, /api/store/catalog, /api/config/v-ranks, /api/team/rank, /api/config/commission/rates, /api/team/binary, /api/app/team/insights/commissions, /api/vouchers, /api/app/team/network, /api/app/network/device-rank, /api/config/staking/pools, /api/stakes | 503/200 |
| earn-en-dark-retry | /api/app/support/conversation-management, /api/app/support/conversations/cursor, /api/app/support/conversation-dismissals, /api/devices/earnings, /api/tasks/assignments | 503 |

最明确的恢复闭环：在自己的外侧 mock 面板勾选“数据场景仅更新后台”，先把失败源恢复为正常，保持原错误页面，再点原设备/收益重试。设备和任务读取由 503 变 200，收益 overview 由 503 变 200，错误区移除，页面恢复 $16.24 与已购设备。见 [03-earn-vi-light-recovered](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/03-earn-vi-light-recovered.jpg)。没有通过调用产品内部方法或改 DOM 文案来伪造恢复。

模拟服务对 analytics POST 返回 409 是本地未建模事件，不作为产品缺陷；本报告不据此推断正式服务状况。没有正式支付/财务提交，没有进行试用激活/转购或会话清空回归。

## 排除范围与未覆盖项

- **整页 EmptyState**：设备页 root nx-empty 仍 display:flex、居中；CTA 无 inline-recovery 祖先。不是右侧局部文案列布局。
- **发送失败控件**：nx-conv-receipt--action 保持原回执图标行为，读回 44×44、10px/18px、400，没有 inline 祖先。此处不强制套 13/20 的一般错误提示字体；只检查没有一刀切布局污染，未重发消息/复测发送契约。
- **团队财务台账**：是否应统一字体，已按用户最新选择器要求归为上方 P2；不能再以“财务排除”为理由接受 12px/400。其他财务交易重试未进行写操作或穷举。
- 设备 inventoryStale 局部 warning 在本面板组合中未稳定触发，本轮未冒称实景通过。相关 class/handler 静态确认仍按右侧动作 opt-in；下一轮只在明确需要时补该分支。
- 试图对自己的本地设备读取做标签页级定点阻断时，Chrome 调试通道挂起；没有获得有效的该故障注入结果。旧自有标签已关闭，之后新建同属 B 的 Chrome 标签继续；**没有把失败的阻断当成产品证据**。
- IAB 本轮不可用，全部实操通过内置 CUA 的独立 Chrome“🧪 Retry B”标签完成；没有外部脚本浏览器。第一次原始截图接口超时后改用内置 tab.screenshot，截图均实际保存。

## 下一轮最小回归

父线程等待 Noether 清单一次收口再构建 r6。下一轮应只核对新增字体遗漏：team-ledger__retry 的 600 13/20、nowrap 和 44px，以及父线程明确列出的其他新遗漏；搜索和已通过的一般局部提示不重复全矩阵。商城孤字 P2 仍需明确处置；若随 r6 修改，只补 320 中文对应提示。原 H5 uC44u8Io 冻结报告保持原样。

## 自有截图索引

| 截图 | 尺寸/主题 | 真实入口 | UTC 时间 |
|---|---|---|---|
| [01-earn-zh-dark-390](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/01-earn-zh-dark-390.jpg) | 390×844 / dark | index-Bo1e4G3-.js | 2026-10-27T09:47:42.013Z |
| [02-earn-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/02-earn-vi-light-320.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T09:50:30.454Z |
| [03-earn-vi-light-recovered](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/03-earn-vi-light-recovered.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T09:51:24.736Z |
| [04-devices-vi-light-320-cached-baseline](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/04-devices-vi-light-320-cached-baseline.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T09:51:48.249Z |
| [05-home-en-light-390](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/05-home-en-light-390.jpg) | 390×844 / light | index-B0RqUdly.js | 2026-10-27T09:58:37.410Z |
| [06-devices-full-empty-en-light-390](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/06-devices-full-empty-en-light-390.jpg) | 390×844 / light | index-B0RqUdly.js | 2026-10-27T09:58:50.816Z |
| [07-store-zh-dark-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/07-store-zh-dark-320.jpg) | 320×693 / dark | index-B0RqUdly.js | 2026-10-27T09:59:21.475Z |
| [08-team-network-vi-dark-390](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/08-team-network-vi-dark-390.jpg) | 390×844 / dark | index-B0RqUdly.js | 2026-10-27T10:01:43.831Z |
| [09-notifications-cached-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/09-notifications-cached-vi-light-320.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T10:03:22.287Z |
| [10-team-financial-retry-exclusion-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/10-team-financial-retry-exclusion-vi-light-320.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T10:03:48.310Z |
| [11-search-source-state-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/11-search-source-state-vi-light-320.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T10:04:02.803Z |
| [12-phone-short-copy-zh-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/12-phone-short-copy-zh-light-320.jpg) | 320×693 / light | index-B0RqUdly.js | 2026-10-27T10:05:16.868Z |
| [13-phone-short-copy-zh-dark-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/13-phone-short-copy-zh-dark-320.jpg) | 320×693 / dark | index-B0RqUdly.js | 2026-10-27T10:05:21.053Z |
| [14-earn-en-dark-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/14-earn-en-dark-320.jpg) | 320×693 / dark | index-B0RqUdly.js | 2026-10-27T10:07:07.078Z |
| [15-sender-failure-exclusion-zh-dark-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/15-sender-failure-exclusion-zh-dark-320.jpg) | 320×693 / dark | index-B0RqUdly.js | 2026-10-27T10:09:06.175Z |

## 冻结范围

APP 源目录 D:/WORKS/PLAN/.wt/uvel-design-20261025-app；报告和截图只写 D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-interaction-b/。B 未修改源码、构建、运行测试、commit 或 push。原 H5 interaction-b/ 证据未改。当前只冻结 r5 已完成检查与失败项，**不放行整体 r5，也不将未构建的源码修复算通过**。

磁盘 r5 指纹最后读取：2026-10-27 19:10:25 JST。Owned local mock 5252 / PID 21028 保持运行，供父线程下一轮按明确 fingerprint 使用。

交付校验：15 个截图链接均存在，尺寸为 390×844 或 320×693；除明确继承的 01 Bo1e 截图外，其余均绑定 B0RqUdly。已清除临时视口并关闭自己的 Chrome 标签；5252 mock 服务保持运行。当前 mock 为正常数据、发送失败样例场景，保留一条自己的未发送布局 probe，未清空会话。此项是 APP 源码的浏览器 mock 复审，不是原生设备或生产后台认证。

截图格式校验：内置 Chrome 截图内容为原生 JPEG，已将自有证据扩展名和报告链接改为 .jpg；未重编码或改动图像内容。按 JPEG SOF 读取的实际尺寸均为 390×844 或 320×693。
