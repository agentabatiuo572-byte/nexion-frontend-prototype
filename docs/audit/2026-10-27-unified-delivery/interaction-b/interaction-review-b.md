# 统一 H5 交互复审 B — uC44u8Io 范围冻结

**既有五项范围通过，最低 9.1/10。该范围新发现的未关闭 P0/P1/P2：0/0/0。** 本报告冻结在 assets/index-uC44u8Io.js；不作为后续错误提示修复版或最终 H5 提交的放行结论。

父线程在审查期间另行接到 Earn 数据失败 banner 的新要求：重试按钮放右侧，长文案提前换行预留按钮空间。此项由父线程修复，**当前未触发或复评该错误场景，须新 build 后单独补验**，不用重做已通过的整条试用链。本报告没有把这个待验项标记为已解决。

## 冻结身份与边界

- 唯一操作来源：http://127.0.0.1:5248/preview，内置 CUA IAB 自建任务标签。
- 所有 27 张截图的 iframe 入口均独立读到 http://127.0.0.1:5248/assets/index-uC44u8Io.js。
- 所有记录均保留主样式 http://127.0.0.1:5248/assets/index-vThkQq5P.css。
- H5 来源 f7c9de55、3012 控制文件 PASS 及先前测试/构建/native 结果是用户提供的背景；本轮没有重跑或把它们冒充 B 的实操证据。
- 仓外输出只在 D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/。没有修改产品源码、重建、运行测试、commit 或 push。
- 没有操作 5237/5251/5246/5247 或其他账号/标签。模拟试用激活及会话删除仅作用于自己的 5248 账号。
- 当前文档浏览器资源记录中 184 条 /api/ 资源均来自 5248。外部字体和 DCloud 运行时 CDN 也有加载；它们不是正式业务/支付服务验证。
- 以下金额、设备、日期、余额、试用状态及会话都是合成原型数据。没有点击立即支付/Thanh toán ngay，未进行真实支付、下载安装或正式后台操作。

## 每项评分与结果

评分是本次可达性、状态连贯性、交互反馈和布局的人工评级，不是自动化覆盖率。

| 项目 | 分数 | 真实操作及结果 | 核心证据 |
|---|---:|---|---|
| 1 首页试用取消/激活与刷新保留 | 9.4 | 立即领取→确认层→我再想想，保持未领取和 2/6；再次确认激活，首页持续免费试用中；完整刷新等待设备读取完成后仍为 3/6，恰 1 试用+2 已购 | [确认层](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/02-trial-confirm-before-cancel.png) / [取消](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/03-trial-cancel-keeps-unclaimed.png) / [持续试用中](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/05-home-card-active.png) / [刷新后队列](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/06-queue-after-refresh-one-trial-two-owned.png) |
| 2 队列/详情→提前购买报价→取消 | 9.3 | 首页队列提前购买→试用详情→立即购买→trial 来源报价；滚动露出取消并实点，回到仍在试用的详情，返回首页队列仍 3/6；越文浅色也实点同一路径和取消 | [详情](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/07-trial-detail-from-queue.png) / [中文报价取消](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/08b-quote-cancel-visible.png) / [返回详情](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/09-quote-cancel-returns-active-trial.png) / [越文报价](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/19-quote-vi-light-320-cancel-visible.png) / [越文取消返回](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/20-quote-cancel-vi-light-320.png) |
| 3 服务会话删除二次确认与清空刷新 | 9.4 | 对演示客服行按键盘 Delete→确认层默认焦点在取消；取消后原会话和 1 未读保留；再次 Delete→删除并清空，服务空态；完整刷新后从消息→服务重进仍为空，通知 3 未读保留 | [删除确认](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/11-delete-second-confirm.png) / [取消保留](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/12-delete-cancel-retains-conversation.png) / [确认清空](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/13-delete-confirm-empty-service.png) / [刷新仍为空](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/14-service-empty-after-full-refresh.png) |
| 4 320 越文浅色同入口可达与布局 | 9.1 | 实走首页试用卡、队列 Mua sớm、详情 Mua ngay、报价 Hủy、服务 Hỗ trợ 以及手机下载入口；文案换行完整，没有水平溢出或关键按钮遮挡；试用行两按钮约 123.41×57.22px | [服务](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/15-service-empty-vi-light-320.png) / [首页](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/16-home-active-vi-light-320.png) / [队列](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/17-queue-vi-light-320.png) / [详情](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/18-trial-detail-vi-light-320.png) / [Earn 入口](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/21-earn-h5-phone-entry-vi-light-320.png) |
| 5 H5 手机下载引导与 Liquid Glass | 9.3 | 320 越文浅色及 390 中文暗色均由 Earn 手机 CTA 实点进入下载引导，再浏览器 Back 返回 Earn；五项底部导航保留折射、透色、光泽/细边缘和活动指示，已实用首页/赚取导航 | [浅色导航](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/21-earn-h5-phone-entry-vi-light-320.png) / [越文下载引导](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/22-h5-phone-download-guide-vi-light-320.png) / [暗色导航](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/23-earn-h5-phone-entry-zh-dark-390.png) / [中文引导](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/24-h5-phone-download-guide-zh-dark-390.png) / [返回 Earn](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/25-download-back-retains-earn-glass.png) |

## 状态与布局读回

### 试用唯一性和刷新

| 实测时点 | 队列标识 | 试用行 | 已购行 |
|---|---|---:|---:|
| 激活完成后 | 3/6 | 1 | 2 |
| 完整刷新、设备读取完成 | 3/6 | 1 | 2 |
| 报价取消并返回首页 | 3/6 | 1 | 2 |
| 320 越文浅色首页 | 3/6 | 1 | 2 |

已购行是 UVEL Box S1 与 UVELBox Pro；唯一试用行是 UVELBox S1，带试用设备标识、剩余时间、当前抵扣和试用详情/提前购买两个动作。计数限定在对应队列 DOM 区域，没有把首页福利卡或待办的同一试用入口误算为第二台设备。

刷新时先出现“—/—、正在读取设备”的骨架状态，随后读出 3/6 和两台已购设备。本轮保留了 [加载中截图](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/06a-refresh-loading-state.png)，结论使用明确等待设备行出现后的稳定读回，不将加载中误判为持久化丢失。抵扣数值随模拟时间累积，没有把它锁成固定金额或伪造生产收益。

### 报价取消

实际报价路径：/pages/me/trial → /pages/store/checkout?product=stellarbox-s1&source=trial。中文取消和越文 Hủy 均回到 /pages/me/trial，保留活动试用和当前累积抵扣。返回首页后仍是一试用加两已购。

中文取消起初在可视区域下方，内置定位点击发生一次自动化 shadow-root 检查失败；读回确认它只是屏外控件，正常滚动到底后同一语义按钮可点击并正确返回。该工具问题未被当成产品 P2，也没有通过脚本调用业务方法绕过 UI。没有继续模拟付款或重复子任务支付穷举。

### 删除确认

删除路径采用实际键盘 Delete，不声称已覆盖触摸左滑手势。二次确认清楚提示清空聊天记录、客服侧保留记录和后续新消息正常接收。取消恢复会话行焦点；确认后服务会话消失，服务计数为 0。消息总未读从 4 降为 3，通知侧未读没有被一并清空。

完整刷新后重新通过消息入口进入服务，仍显示“暂无服务消息”。再切 320 越文浅色，Hỗ trợ 中仍为 Chưa có tin nhắn hỗ trợ。这里只验证了同一模拟账号的本地刷新持久化，没有验证真实跨设备、重新登录或客服后台同步。

### 320 越文浅色

福利卡的标题、剩余时间和 CTA 会换行；完整词语和金额仍可读，没有截断或互相覆盖。队列两动作均约 123.41×57.22px，长的 Chi tiết dùng thử 按两行排入按钮。详情主要购买入口、报价取消和支付页的金额区也有完整可视证据；没有以“必须一行”代替可读性检查。

全 27 个截图时点均未测到文档水平溢出。页面内容高于短屏时通过正常滚动到达对应入口，不把屏外内容当成被裁掉。

### Liquid Glass 与 H5 边界

| 视图 | 底部胶囊 | 五项目标最小宽×高 | 实际玻璃层 |
|---|---|---|---|
| 320 越文浅色 | 296.00×67.99px | 55.60×57.99px | nx-liquid-glass--navigation、selection SVG backdropFilter、tint、specular、rim |
| 390 中文暗色 | 366.31×67.99px | 69.66×57.99px | 同上，保留暗色透色层和内边缘光 |

浅色透色层 rgba(255,255,255,.82)，暗色 rgba(24,24,28,.82)。两个视图均读到导航和选中态的 SVG backdrop-filter，且 screenshot 可见高光、折射和活动项。保留的是现有底部 Liquid Glass，没有扁平化成普通按钮。

手机 CTA 均进入 /pages/register/success?download=1，明确提示登录 Android App 完成校准激活。当前模拟下载地址未开放（中文“官网下载 APP 地址暂未开放”、越文“Chưa có link tải APP”），因此这里只确认 H5 下载引导、语言排版和返回，不声称实际下载安装或浏览器原生算力执行。

## 后续定点回归

父线程新的错误提示紧凑排版需求尚未由 B 实景验收。新 build 提供后只需核对受影响的 Earn/同类错误提示：按钮位于右侧空白、长文案提前换行、320 越文浅色按钮和文案互不覆盖、重试动作仍可用。既有试用、报价取消及删除持久化证据保留，不能用本报告替代新入口的受影响提示回归。

## 证据索引

全部由 B 使用内置 CUA 的当前 iframe 截取，没有借用父线程/另一审查者图片。截图导出按浏览器现有缩放补偿，保留 390×844 或 320×693 手机画面。没有修图、拼接或外部脚本浏览器。

| 截图 | 尺寸/主题 | iframe 路径 | UTC 时间 |
|---|---|---|---|
| [01-home-before-trial](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/01-home-before-trial.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:08:07.725Z |
| [02-trial-confirm-before-cancel](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/02-trial-confirm-before-cancel.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:08:25.301Z |
| [03-trial-cancel-keeps-unclaimed](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/03-trial-cancel-keeps-unclaimed.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:08:25.895Z |
| [04-trial-activated-confirmation](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/04-trial-activated-confirmation.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:08:55.710Z |
| [05-home-card-active](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/05-home-card-active.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:09:24.073Z |
| [06a-refresh-loading-state](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/06a-refresh-loading-state.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:09:24.677Z |
| [06-queue-after-refresh-one-trial-two-owned](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/06-queue-after-refresh-one-trial-two-owned.png) | 390×844 / dark | /pages/index/index | 2026-10-27T09:09:41.541Z |
| [07-trial-detail-from-queue](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/07-trial-detail-from-queue.png) | 390×844 / dark | /pages/me/trial | 2026-10-27T09:09:55.287Z |
| [08-early-purchase-quote-no-payment](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/08-early-purchase-quote-no-payment.png) | 390×844 / dark | /pages/store/checkout?product=stellarbox-s1&source=trial | 2026-10-27T09:10:29.182Z |
| [08b-quote-cancel-visible](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/08b-quote-cancel-visible.png) | 390×844 / dark | /pages/store/checkout?product=stellarbox-s1&source=trial | 2026-10-27T09:11:10.811Z |
| [09-quote-cancel-returns-active-trial](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/09-quote-cancel-returns-active-trial.png) | 390×844 / dark | /pages/me/trial | 2026-10-27T09:11:14.023Z |
| [10-service-before-delete](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/10-service-before-delete.png) | 390×844 / dark | /pages/me/notifications?section=service | 2026-10-27T09:11:50.342Z |
| [11-delete-second-confirm](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/11-delete-second-confirm.png) | 390×844 / dark | /pages/me/notifications?section=service | 2026-10-27T09:12:37.737Z |
| [12-delete-cancel-retains-conversation](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/12-delete-cancel-retains-conversation.png) | 390×844 / dark | /pages/me/notifications?section=service | 2026-10-27T09:12:38.174Z |
| [13-delete-confirm-empty-service](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/13-delete-confirm-empty-service.png) | 390×844 / dark | /pages/me/notifications?section=service | 2026-10-27T09:12:38.679Z |
| [14-service-empty-after-full-refresh](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/14-service-empty-after-full-refresh.png) | 390×844 / dark | /pages/me/notifications?section=service | 2026-10-27T09:13:12.839Z |
| [15-service-empty-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/15-service-empty-vi-light-320.png) | 320×693 / light | /pages/me/notifications?section=service | 2026-10-27T09:14:26.145Z |
| [16-home-active-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/16-home-active-vi-light-320.png) | 320×693 / light | / | 2026-10-27T09:15:08.314Z |
| [17-queue-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/17-queue-vi-light-320.png) | 320×693 / light | / | 2026-10-27T09:15:08.444Z |
| [18-trial-detail-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/18-trial-detail-vi-light-320.png) | 320×693 / light | /pages/me/trial | 2026-10-27T09:16:21.521Z |
| [19-quote-vi-light-320-cancel-visible](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/19-quote-vi-light-320-cancel-visible.png) | 320×693 / light | /pages/store/checkout?product=stellarbox-s1&source=trial | 2026-10-27T09:16:24.806Z |
| [20-quote-cancel-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/20-quote-cancel-vi-light-320.png) | 320×693 / light | /pages/me/trial | 2026-10-27T09:16:49.218Z |
| [21-earn-h5-phone-entry-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/21-earn-h5-phone-entry-vi-light-320.png) | 320×693 / light | /pages/earn/earn | 2026-10-27T09:17:46.753Z |
| [22-h5-phone-download-guide-vi-light-320](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/22-h5-phone-download-guide-vi-light-320.png) | 320×693 / light | /pages/register/success?download=1 | 2026-10-27T09:17:50.008Z |
| [23-earn-h5-phone-entry-zh-dark-390](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/23-earn-h5-phone-entry-zh-dark-390.png) | 390×844 / dark | /pages/earn/earn | 2026-10-27T09:18:55.725Z |
| [24-h5-phone-download-guide-zh-dark-390](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/24-h5-phone-download-guide-zh-dark-390.png) | 390×844 / dark | /pages/register/success?download=1 | 2026-10-27T09:18:58.979Z |
| [25-download-back-retains-earn-glass](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/interaction-b/25-download-back-retains-earn-glass.png) | 390×844 / dark | /pages/earn/earn | 2026-10-27T09:20:27.082Z |

## 冻结结论

本轮现有五项范围全部 >=9，没有新发现的 <9 未修 P2。新增错误提示需求仍留待父线程修复和定点补验，最终 H5 提交继续由父线程控制。

冻结时 5248 模拟账号状态：试用已激活、队列 3/6（一试用、两已购）；服务会话已按授权清空；通知仍有 3 未读。最后一张截图仍是 index-uC44u8Io.js / index-vThkQq5P.css。B 没有重置这些状态，也没有停止预览服务。

实际记录区间：2026-10-27T09:08:07.725Z 至 2026-10-27T09:20:27.082Z（UTC）。

冻结校验：27 个截图链接均存在，PNG 尺寸均为 390×844 或 320×693；所有记录只有 index-uC44u8Io.js，主样式均为 index-vThkQq5P.css。已清除本标签页的临时视口并关闭自己的 IAB 标签，5248 服务和模拟账号状态保留，等待后续明确的错误提示定点回归。
