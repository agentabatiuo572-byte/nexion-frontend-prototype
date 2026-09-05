# ALIGNMENT-LEDGER —— UniApp 当前实现面对齐台账（SoT）

> 长线任务唯一事实源。换 window / 续作时**第一件事读它**。基准 = `Nexion-uniapp` 当前实现面；
> 例外：**主人已决产品决策优先于原版**（见 plan「真相源校正层」：NOVA 改名、5 一级页优化）。
> 计划全文：`C:\Users\jason\.claude\plans\uniapp-uniapp-delegated-hejlsberg.md`

## 状态机
`未审 → 差异已记(S2冻结) → 已修(S3) → 已交叉验(S4双端实景) → DONE(S5审计P0=P1=0)`

## 🔴 禁改清单（5 一级页 + 私有组件 · 严禁改本体/回退）
- `src/pages/index/index.vue`（首页）、`pages/earn/earn.vue`、`pages/store/store.vue`、`pages/team/team.vue`、`pages/me/me.vue`
- 这些页引用的私有组件（home/* 等）凡仅服务一级页的，一并禁改。
- 触发逻辑触及这些页 → 一律全局/chassis 落点（`isHome`/route guard），只加行为不改本体；5 页基线守卫证零回退。

> **⚠ 2026-06-22 · 代金券功能(chassis 注入,主人授权)**：代金券 banner 经 chassis 内容层顶部注入,展示在 home/store/me/earn（零改 5 页本体,符合上条「chassis 落点」约定）；并新增首页领券 auto-popup（1300ms,优先于 trial）。**这两项是授权的功能新增,会改变 5 页观感** → `scripts/.baseline/baseline/` 金线现已陈旧(不含 banner),`diff baseline current` 会把 banner 报为差异(**预期,非回退**)。`chrome-baseline.mjs` 已补 voucher-claim-sheet cooldown seed（基线中抑制 popup、保留 banner）。**重拍金线**：先把旧 `scripts/.baseline` Move 到 `.trash`(备份铁律),dev 在 5173 → `node scripts/chrome-baseline.mjs capture baseline`。由本对齐任务择机重拍。

## 端口锁（共享层同时只一批持锁，防并发踩同文件）
| 锁定文件 | 批次 | 时间戳 | 状态 |
|---|---|---|---|
| — | — | — | 空闲 |

---

## 范围对账（防漏：行数必须吻合）
- 原版子页面：75（80 路由 − 5 一级页）｜uniapp 子页面：~77
- 弹窗/模态：原版 14 ｜ uniapp ~20（9 个"有 store 待补 UI"）
- 自动触发行为：29（BEHAVIOR-PARITY 分区）

**已发现的页数差异（待 S1 逐条确认，可能是缺页 / 拆分 / 历史残留）**：
- 原版有 `me/wallet/nex-v2-lock`、`me/wallet/premium` → uniapp 列表未见同名，待核（缺页？合并？）。
- uniapp 有 `me/wallet-withdraw-tracking` → 原版未单列，待核（uniapp 净增？）。
- uniapp `support/messages`、`support/chat` vs 原版 `me/support`、`me/support/tickets` → 命名/结构差，待核。
- uniapp net-new：`onboarding/terms`（无源对标，保留）。

---

## B1 · store 子页 ✅ DONE（2026-06-17：5页全转架构 nav row+内容 diff，verify 19/19·5页基线 PASS·各页 console 0·tsc 0）
| 页面 | 源路由 | uni 文件 | 状态 | diff(P0/P1/P2) | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 结账 | store/checkout | pages/store/checkout | ✅ DONE | 架构+内容0 | 0 | nav row「Checkout」console0 | backHref→detail(原 goBack 错指 /store) |
| 订单列表 | store/orders | pages/store/orders | ✅ DONE | 架构+标题1 | 0 | nav row「Orders+副标」console0 | title 改 headerTitles.storeOrders+副标 |
| 订单详情 | store/orders/[id] | pages/store/order-detail | ✅ DONE | 架构 | 0 | nav row(订单号)console0 | getter title=order.id backHref=/store/orders |
| 套装 | store/bundle | pages/store/bundle | ✅ DONE | 架构+标题1 | 0 | nav row「Bundle」console0 | title 改 headerTitles.storeBundle |
| 商品详情 | store/[productId] | pages/store/detail | ✅ DONE | 架构3修+内容0 | 0 | 2026-06-17 架构实景验+内容回源裁决 | 架构(吸顶/磨砂/吸底/标题居中)已修；内容字段级 diff = 忠实 port 0 真差异(agent 报的 gap/padding 2条经回源裁决=假阳性:gap-2=8px、pr-6=24px 两边相同) |
| 结账 | store/checkout | pages/store/checkout | 未审 | - | - | - | |
| 订单列表 | store/orders | pages/store/orders | 未审 | - | - | - | |
| 订单详情 | store/orders/[id] | pages/store/order-detail | 未审 | - | - | - | |
| 套装 | store/bundle | pages/store/bundle | 未审 | - | - | - | |

## B2 · me-wallet
| 页面 | 源路由 | uni 文件 | 状态 | diff | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 钱包总览 | me/wallet | pages/me/wallet | 未审 | - | - | - | |
| 充值 | me/wallet/topup | pages/me/wallet-topup | 未审 | - | - | - | |
| 提现 | me/wallet/withdraw | pages/me/wallet-withdraw | 未审 | - | - | - | |
| 提现跟踪 | (待核) | pages/me/wallet-withdraw-tracking | 未审 | - | - | - | uniapp 净增？ |
| 兑换 | me/wallet/exchange | pages/me/wallet-exchange | 未审 | - | - | - | |
| 兑换说明 | me/wallet/exchange/how-it-works | pages/me/wallet-exchange-how | 未审 | - | - | - | |
| NEX 资产 | me/wallet/nex | pages/me/wallet-nex | 未审 | - | - | - | |
| NEX 锁仓 | me/wallet/nex-v2-lock | (待核) | 未审 | - | - | - | uniapp 缺页？ |
| 高级会员 | me/wallet/premium | (待核) | 未审 | - | - | - | uniapp 缺页？ |
| 账单 | me/wallet/bills | pages/me/wallet-bills | 未审 | - | - | - | |
| 绑卡 | me/wallet/cards | pages/me/wallet-cards | 未审 | - | - | - | |
| 新增卡 | me/wallet/cards/new | pages/me/wallet-cards-new | 未审 | - | - | - | |
| 升级换新 | me/wallet/repurchase | pages/me/wallet-repurchase | 未审 | - | - | - | |
| 升级说明 | me/wallet/repurchase/how-it-works | pages/me/wallet-repurchase-how | 未审 | - | - | - | |

## B3 · me-其余
| 页面 | 源路由 | uni 文件 | 状态 | diff | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 成就 | me/achievements | pages/me/achievements | 未审 | - | - | - | |
| 设备 | me/devices | pages/me/devices | 未审 | - | - | - | |
| 目标 | me/goals | pages/me/goals | 未审 | - | - | - | |
| 帮助 | me/help | pages/me/help | 未审 | - | - | - | |
| 语言 | me/language | pages/me/language | 未审 | - | - | - | |
| 通知 | me/notifications | pages/me/notifications | 未审 | - | - | - | |
| 偏好 | me/preferences | pages/me/preferences | 未审 | - | - | - | |
| 资料 | me/profile | pages/me/profile | 未审 | - | - | - | |
| 实名 | me/proof | pages/me/proof | 未审 | - | - | - | |
| 收据 | me/receipts | pages/me/receipts | 未审 | - | - | - | 含 ReceiptModal |
| 重放教程 | me/replay-tour | pages/me/replay-tour | 未审 | - | - | - | |
| 风险披露 | me/risk-disclosure | pages/me/risk-disclosure | 未审 | - | - | - | |
| 安全 | me/security | pages/me/security | 未审 | - | - | - | |
| KYC | me/security/kyc-express | pages/me/kyc | 未审 | - | - | - | 命名差待核 |
| 客服 | me/support | pages/me/support | 未审 | - | - | - | |
| 工单 | me/support/tickets | pages/me/support-tickets | 未审 | - | - | - | |
| 试用 | me/trial | pages/me/trial | 未审 | - | - | - | |
| 年度总结 | me/wrapped | pages/me/wrapped | 未审 | - | - | - | |

## B4 · team 子页
| 页面 | 源路由 | uni 文件 | 状态 | diff | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 对碰 | team/binary | pages/team/binary | 未审 | - | - | - | |
| 对碰说明 | team/binary/how-it-works | pages/team/binary-how | 未审 | - | - | - | |
| 佣金 | team/commissions | pages/team/commissions | 未审 | - | - | - | |
| 佣金说明 | team/commissions/how-it-works | pages/team/commissions-how | 未审 | - | - | - | |
| 邀请榜 | team/leaderboard | pages/team/leaderboard | 未审 | - | - | - | |
| 领导池 | team/leadership-pool | pages/team/leadership-pool | 未审 | - | - | - | |
| 领导池说明 | team/leadership-pool/how-it-works | pages/team/leadership-pool-how | 未审 | - | - | - | |
| 网络 | team/network | pages/team/network | 未审 | - | - | - | HIGH 动画 |
| 配额 | team/quota | pages/team/quota | 未审 | - | - | - | |
| V级 | team/rank | pages/team/rank | 未审 | - | - | - | |
| V级说明 | team/rank/how-it-works | pages/team/rank-how | 未审 | - | - | - | |
| 族谱树 | team/tree | pages/team/tree | 未审 | - | - | - | HIGH |
| 单层 | team/unilevel | pages/team/unilevel | 未审 | - | - | - | |
| 单层说明 | team/unilevel/how-it-works | pages/team/unilevel-how | 未审 | - | - | - | |
| 大使 | team/agent | pages/team/agent | 未审 | - | - | - | |

## B5 · genesis+staking+trust
| 页面 | 源路由 | uni 文件 | 状态 | diff | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 创世 | genesis | pages/genesis/genesis | 未审 | - | - | - | 一级？否，子页 |
| 持有人 | genesis/holder | pages/genesis/holder | 未审 | - | - | - | |
| 节点市场 | genesis/marketplace | pages/genesis/marketplace | 未审 | - | - | - | 含 OpenSeaModal |
| 创世说明 | genesis/how-it-works | pages/genesis/how-it-works | 未审 | - | - | - | |
| 质押 | staking | pages/staking/staking | 未审 | - | - | - | HIGH |
| 质押说明 | staking/how-it-works | pages/staking/how-it-works | 未审 | - | - | - | |
| 信任 | trust | pages/trust/trust | 未审 | - | - | - | |
| NEX 信任 | trust/nex | pages/trust/nex | 未审 | - | - | - | |

## B6 · 任务/活动/学习
| 页面 | 源路由 | uni 文件 | 状态 | diff | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 签到 | daily | pages/daily/daily | 未审 | - | - | - | HIGH 动画 |
| 任务 | missions | pages/missions/missions | 未审 | - | - | - | |
| 活动 | events | pages/events/events | 未审 | - | - | - | HIGH 抽奖 |
| 学习 | learn | pages/learn/learn | 未审 | - | - | - | |
| 全球 | globe | pages/globe/globe | 未审 | - | - | - | HIGH 动画 |
| 开发者 | developer | pages/developer/developer | 未审 | - | - | - | |
| 搜索 | search | pages/search/search | 未审 | - | - | - | |
| 市场 | market | pages/market/market | 未审 | - | - | - | |

## B7 · onboarding/auth/动态段
| 页面 | 源路由 | uni 文件 | 状态 | diff | 残留 | 证据 | 备注 |
|---|---|---|---|---|---|---|---|
| 引导序幕 | onboarding/intro | pages/onboarding/intro | 未审 | - | - | - | 独立框架 |
| 收益预估 | onboarding/estimator | pages/onboarding/estimator | 未审 | - | - | - | |
| 钱包连接 | onboarding/connect | pages/onboarding/connect | 未审 | - | - | - | |
| 服务条款 | (net-new) | pages/onboarding/terms | 未审 | - | - | - | 无源对标 |
| 注册 | register | pages/register/register | 未审 | - | - | - | |
| 登录 | login | pages/login/login | 未审 | - | - | - | |
| 邀请着陆 | ref/[code] | pages/ref/code | 未审 | - | - | - | |
| 交易详情 | tx/[hash] | pages/tx/hash | 未审 | - | - | - | |
| 消息中心 | (待核) | pages/support/messages | 未审 | - | - | - | vs 原版 MessageDrawer？ |
| 聊天 | (待核) | pages/support/chat | 未审 | - | - | - | NOVA 对话页 |

---

## 弹窗 / 模态（Pass C · ~20）
| 组件 | uni 文件 | 宿主 | 状态 | 备注 |
|---|---|---|---|---|
| NovaBubble(原 Stella) | components/stella→nova/*-bubble | chassis tab | 未审 | Pass 0.5 改名 |
| NovaDrawer | (bubble 内) | chassis | 未审 | |
| TrialClaimSheet | trial-claim-sheet | chassis | 未审 | |
| TrialExtensionSheet | trial-extension-sheet | chassis | 未审 | 有 store 待补 UI |
| TrialUnbindRetentionSheet | trial-unbind-retention-sheet | chassis | 未审 | 有 store 待补 UI |
| SlotActionSheet | slot-action-sheet | chassis | 未审 | 有 store 待补 UI |
| TradeinSheets | tradein-sheets | chassis | 未审 | 有 store 待补 UI |
| LuckySpinSheet | lucky-spin-sheet | chassis | 未审 | 有 store 待补 UI · HIGH |
| MessageDrawer | message-drawer | chassis | 未审 | 有 store 待补 UI |
| GenesisDockHost | genesis-dock-host | chassis | 未审 | 有 store 待补 UI |
| StickyCtaBar | sticky-cta-bar | chassis | 未审 | Pass A 接线 |
| PurchaseSheet(genesis) | genesis/purchase-sheet | genesis 页 | 未审 | |
| StakeSheet | staking/stake-sheet | staking 页 | 未审 | |
| DeviceDeactivateSheet | me/device-deactivate-sheet | devices 页 | 未审 | |
| ReceiptModal | me/receipt-modal | receipts 页 | 未审 | |
| OpenSeaModal | genesis/opensea-modal | marketplace 页 | 未审 | |
| ConfirmDialog/Toast | global-ui | chassis | 未审 | |
| BottomSheetPicker | (待核 uniapp 有无) | 表单页 | 未审 | 原版有 |
| TrialPromoBanner | trial-promo-banner | — | 未审 | 横幅 |
| TrialHeroBanner | trial-hero-banner | — | 未审 | 横幅 |

---

## BEHAVIOR-PARITY · 29 自动触发行为（Pass B-行为）
> 校验法：源码级触发回源 + **5173 运行时模拟实测**（清 localStorage/改时间戳/带 query/置业务态）。旧 H5 只保留历史样本，不再作为 P0 对位判据。
> 状态：未审 / 已记 / 已修 / 已验。落点遵红线（触及 5 页 → 全局/chassis）。

| # | 行为 | 触发源 | 条件 | 原版位置 | uni 状态 | 落点 |
|---|---|---|---|---|---|---|
| 1 | 试用弹窗自动推送 | 进页+延时 | 进首页 canStart&&autoPushEnabled, 1500ms, 24h冷却/会话1次 | home/mission-control.tsx | ✅ **已修+验**(chassis onMounted+isHome+延时内复查route;trial-check: home弹/me不弹/console0;5页基线 PASS) | chassis isHome（首页文件未碰,红线守住） |
| 2 | Genesis Dock 自动显示 | 进页 | 进 /genesis | genesis/page.tsx:70 | 未审 | 页/全局 |
| 3 | 签到倒计时秒刷 | 进页+1s轮询 | 进 /daily | daily/page.tsx | 未审 | 页 |
| 4 | Compliance 横幅 | 进页+600ms | complianceHoldEnabled | compliance-reverify-banner | 未审 | 全局 |
| 5 | 页面入场动画 | 进页 | PageTransition | page-transition.tsx | 已有 nx-page-enter | chassis |
| 6 | 卡片入场动画 | 进页 | CardStagger | card-stagger.tsx | 未审 | 组件 |
| 7 | 收益/效率 60s 刷新 | 进页+60s | /earn banners | missed-income/device-lifecycle/task-lock banner | 未审 | 全局/earn(不改) |
| 8 | NOVA 团队事件推送 | 14s+90s轮询 | 全局 | stella-triggers-v3.tsx:169 | 未审 | chassis |
| 9 | NOVA 质押事件推送 | 50s+4m轮询 | 全局 | stella-triggers-v3.tsx:192 | 未审 | chassis |
| 10 | NOVA 市场事件推送 | 35s+6m轮询 | 全局 | stella-triggers-v3.tsx:216 | 未审 | chassis |
| 11 | 首页 ticker 动画 | 1500ms轮询 | 进首页 | home/mission-control.tsx:65 | 未审 | 全局/home(不改) |
| 12 | 设备效率 60s 刷新 | 60s | /earn | device-lifecycle-banner | 未审 | earn(不改) |
| 13 | 任务锁定额度 60s | 60s | /earn | task-lock-cumulative-banner | 未审 | earn(不改) |
| 14 | 里程碑派奖 | 4s轮询 | 跨阈值 | milestone-watcher.tsx | 未审 | 全局 |
| 15 | 试用延期倒计时 1s | sheet开时1s | TrialExtensionSheet | trial-extension-sheet:50 | 未审 | 组件 |
| 16 | Tradein 晋升冷却 | localStorage | 24h/会话上限 | tradein-promo-banner | 未审 | earn 区 |
| 17 | Compliance 24h 冷却 | localStorage | DISMISS_KEY | compliance-reverify-banner | 未审 | 全局 |
| 18 | 试用推送冷却 | store lastClosedAt | cooldownHours | trial-claim-sheet store | 未审 | =#1 |
| 19 | LuckySpin 每日重置 | UTC 时间 | hasFreeSpinToday | lucky-spin-sheet:54 | 未审 | events |
| 20 | Day-30 派券+开轮盘 | 里程碑后 | claimedDay===30 | daily/page.tsx | 未审 | daily |
| 21 | 骨架屏 mounted | mounted | hydration-safe | 多处 banner | 未审 | 多页 |
| 22 | 试用绑卡 deep-link | ?trial=1 | /me/trial?trial=1 | trial-claim-sheet:50 | 未审 | trial 页 |
| 23 | 绑卡返回重定向 | returnTo query | cards/new?returnTo | trial-claim-sheet:48 | 未审 | cards 页 |
| 24 | 宽限期→延期弹窗 | 状态轮询 | status=grace&&eligible | simulation-provider:196 | 未审 | 全局 |
| 25 | 试用转化派奖+购机 | 状态转移 | after=redeemed | simulation-provider:82 | 未审 | 全局 |
| 26 | Genesis 自动成交 | 18%概率轮询 | orderId | simulation-provider:44 | 未审 | 全局 |
| 27 | 试用紧迫推送 | 状态+toast | remainingMs<24h/1h | simulation-provider:185 | 未审 | 全局 |
| 28 | 下拉刷新 | touch阈值 | scrollY=0&&pull>TRIG | pull-to-refresh.tsx | 已有 nx-refresher | chassis |
| 29 | 网络错误覆盖层 | UI状态 | netError.visible | net-error-overlay.tsx | 未审(global-ui?) | chassis |

---

## 冲突挂起清单（uniapp 疑似更对 / 已决决策 · 醒后主人复核）
> 自主模式：默认保留 uniapp + 记此 + 继续，不阻塞。
| # | 页面/点 | 原版 | uniapp | 为何疑似 uniapp 更对 | 主人裁决(2026-06-17) |
|---|---|---|---|---|---|
| 1 | me/wallet/nex-v2-lock | 原版有此页(NEX V2 锁仓) | uniapp 缺 | 经济模型重校准 | ✅ **不补迁**——锁仓保持纯 USDT;NEX 锁仓弃用 |
| 2 | me/wallet/premium | 原版有此页(高级会员) | uniapp 缺 | premium 已并入设备产出 | ✅ **确认弃用**——保持缺失 |
| 3 | detail mult-badge 倍数 | round 到整十(120×) | un-rounded(117×) | 6-16 经济重校准主人把倍数定 117×(已决) | ⏸ **保 117×**(不改回原版 round-10);待主人确认 117 还是 120 |

## 🔴 关键方法教训(2026-06-17 主人揪出 detail 间距漏报)
**结构级"忠实 port"≠ 值级像素 1:1**。B1 当初判 detail 内容"忠实"是**结构对比**,漏了**硬编码 CSS 值差**(SectionHeader margin 0/2/8 vs 原版 22/18/12;评论/FAQ 行高 1.5 vs 1.625;qty active opacity vs scale)——正是原版 CLAUDE.md Phase 5 警告的"截图看着像、CSS 值不同"陷阱。**改法**:像素 1:1 必做**逐字段 CSS 值审计**(font-size/weight/line-height/letter-spacing/color/margin/padding/gap/height/border/radius 逐值,Tailwind 换算要准),不能止于结构。**全站排查同类**:B1/B2 其它页("内容忠实"结论)同样可能藏值差,后续每页补逐字段值审计。
- **detail 已逐字段重审完**:修 SectionHeader 间距(detail wrapper `padding:22px 16px 4px`+组件 margin=有效 22/18/12)+ 评论/FAQ 行高 1.625 + qty active scale;mult-badge 117× 列冲突#3。verify 20/20·基线 PASS·实景验。

## 锁仓调查结论 + $20 改动（2026-06-17）
- **锁仓 = 纯 USDT**(确认,FAQ 亦自证 "USDT-only");流程与原版 1:1 正确(扣款→建仓→记账·4 档 30/90/180/365·APY 12/35/80/180%·罚金 5/15/30/50%·到期 claim·提前赎回)。NEX 锁仓删干净无死链。
- **最小金额 $100→$20**(主人定):`STAKING_MIN` 提进 `store/staking.ts` 单源(原散在 2 vue 重复) + FAQ en/zh $50→$20。verify 20/20·基线 PASS·实景验。
- 🔴 **后台待同步(主人另开 session)**:admin **G1 USDT 锁仓最小额 $100→$20**(对齐前端单源);admin G1 **NEX 池 4 档 + LEDGER 科目#5 "NEX v2 未来兑付"** 标 deprecated/迁历史(前端弃用 NEX 锁仓后的死配置);premium 已两侧下线。
- **子页标题补回**:`SubPageHeader` 未传 title 时路由派生(46 路由映射,镜像原版 getHeaderTitleKey),~36 页一次性补回标题。verify 20/20·基线 PASS·实景验双语。

---

## 工具/守卫笔记（进化）
- **5 页守卫 `scripts/chrome-baseline.mjs`**：capture/diff，FAIL>0.1%。确定性三冻结（缺一就假阳性）：① `setInterval`→no-op（停 home ticker/NOVA 轮询）② `Date.now()`+argless `new Date()`→固定 epoch（earn missed-income/device/task 用 Date.now 派生，秒级外会漂）③ `Math.random`→mulberry32 种子（home aurora/粒子随机）。自洽测试 15/15 全 0px。每批改共享层前 `capture baseline`、改后 `capture current` + `diff`。
- **改名排坑**：`stellar*`(SKU 硬件) ≠ `stella`(AI 助手 NOVA)，重命名必词级排除 stellar/Stellar。
- 🔴 **uni H5 子页 header 双机制**(B2 关键学习)：① **detail + B1 store 5 页** = 外壳 store nav row(`useSetPageHeader` 页面级,onShow 兜 back-nav);② **55 个用 `<SubPageHeader>` 的页** = 该组件已改 **in-content `position:sticky`**(吸顶+磨砂+居中标题+glass tile,与 ① 尺寸**完全一致**视觉等同)。**为何两套**:uni H5 的 `onShow`/`onActivated` **不投递给子组件**(实测 rank→rank-how→back 用组件 store 注册器 header 消失),故组件只能走 sticky in-content(per-page 持久无 staleness);页面级才能用 store。两者 frosting 都靠 `.nx-content` 普通 overflow:auto 同绘制面(P-041)。哨兵:`subpage_header_sticky` 守 SubPageHeader 必 sticky。**Pass D 可考虑统一**(把 5 页也转 `<SubPageHeader>` 删 store nav row),非必须(视觉已一致)。
- **SubPageHeader 改 sticky = 55 页一次性吸顶**(1 组件改,API 不变,跨 me/team/genesis/staking/trust/daily/events/... 全域)。
- 🔴 **uni H5 storage 格式**:`uni.setStorageSync` 在 H5 存为 `localStorage[k]={"type":"object","data":{...}}`(有外层 wrapper!裸 JSON 注入读不到)。守卫注入试用冷却必用此格式。
- **守卫 trial 注入**:home 现会自动弹试用弹窗(B-行为#1),baseline 截图里会污染 home。`chrome-baseline.mjs` addInitScript 注入 `nexion-trial-claim-sheet-v1={type,data:{lastClosedAt:远未来}}` → tryAutoPush inCooldown 不弹 → home 截图纯净;弹窗行为由 `trial-check.mjs` 单独验(home弹/me不弹)。**别全局抑制 setTimeout**(会误伤其它页 ≥1s 延时内容,基线假 FAIL)。

## 全量逐字段 CSS 值重审进度(2026-06-17 主人指示:除5一级页全量)
> 方法:每页逐字段 CSS 值审计(font/margin/padding/gap/color/border/radius/active…)+ 修页面本地视觉差。**只修视觉,不动数据/数字/文案(6-16 重校准是主人决策)**;共享组件(被一级页用的)+ 数据冲突只 flag。每域:audit→fix→verify(verify20/基线PASS/console0)。
- **store 域 ✅**:detail(SectionHeader间距+行高+qty active;mult-badge 117×冲突#3 flag) + checkout/orders/order-detail(-soft→15% / border→70% / active scale / live渐变 / Earn spotlight / value ink-90/95) + bundle(本就一致)。4 子页专用组件(chain/card-payment/checkout-row/order-detail-row)页面本地修。verify20·基线PASS·console0。
- **系统性根因(各域复用,逐实例核非blanket)**:`-soft`(20%)误替原版`/15`;border实心误替`/70~80`;active opacity 误替 scale;value 实心 ink 误替 ink/90~95;行高1.5误替1.625(leading-relaxed)。
- **me-wallet 域 ✅**(12 页):borders 实心→`/25-35`(原版按用处加透明度,uniapp token 是实心 45%——per-instance color-mix 修)、行高 1.5/1.6→1.625、active opacity→scale、value ink→ink/90-95、bills 分段控件(tap 34→44pt + brand 指示 + label 12.5/on-brand)、cards-new 图标/容器尺寸偏小、exchange MAX/placeholder、repurchase CTA on-brand 箭头。verify20·基线PASS·console0。
- **flag(待后续 shared-sub-component pass,均子页专用·非一级页·可安全修)**:topup 子组件(topup-card-form/verify-row/complete-row 同款 border/active/ink 漂移)、how/* 6 组件(how-it-works 页共享)、cards-new input focus 边框(uni `<input>` 不支持 CSS :focus,需 JS 态)。
- **保留(uniapp 改进非回归)**:exchange/cards refresh/flip 等加的 active affordance(Mobile-First rest-state)、card-brand-badge #fff 对比、repurchase color-mix tint(原版 `${tint}12` 拼 var() 是无效 CSS)。
- **me-其余 域 ✅**(18 页):主因=**`leading-*` 全站误映射**(relaxed→1.6 应 1.625 / snug→1.4 应 1.375 / tight→1.2 应 1.25 / 误写 1.5/1.55)——共数十处行高;另 tap 36→44pt(notifications/help chip)、字距 tracking-tight -0.025em、value ink→ink/90、border→/70、active scale、wrapped card2 mt-4、proof/profile tint hex-alpha 换算(`${tint}22`=13% 非 22%)。verify20·基线PASS·console0。
- 🔴 **待做 shared-sub-component pass(子页专用·非一级页·可安全修,各 agent 已 flag)**:`components/me/`(preference-toggle-row/replay-*-row/device-inventory-row/ticket-row 的 1.4→1.375)、`components/how/*`(6 个)、topup 子组件(topup-card-form/verify-row/complete-row border/active/ink)、order/checkout 子组件已在 store 域修过。一次修完惠及多页。
- **team 域 ✅**(15 页):leading-* 行高、active scale、tint hex-alpha(`${c}18`=9%/`22`=13%)、**quota hero 色 bug brand-2橙→tech-cyan 紫**、agent bucket locked opacity 0.7 gate、unilevel-how 表头字距/行 border /60。verify20·基线PASS·console0。
- 🔴 **跨页 SegmentedControl 分段控件同形差**(systematic):leaderboard/events/market/developer/genesis-marketplace 的内联分段控件都偏离原版 SegmentedControl 规格——**wallet-bills 已确立正确规格**:容器 padding4/radius16、段高 **44pt**/radius10、active=**brand 填充 + on-brand 字**(无 box-shadow)、label 12.5/500/-0.005em、amount tabular-nums。其余实例按此统一修(各域 agent 已被告知)。
- **genesis-staking-trust 域 ✅**(8 页):genesis 4 页仅 leading-* 5 处(高保真);staking/trust 4 页 leading-* + trust 名片字距 -0.025em + leadership/listing-chip **tint hex-alpha**(`${c}30`≈18.8%/`10`≈6.3%/`20`≈12.5%)+ CTA 去多余 shadow;trust-doc-row/nex-anchor-section 两 trust 专属子组件行高。运行时复验 1.625/-0.025em 达标。verify(我的域)tsc0·基线PASS·console0。
- **任务/活动/学习 域 ✅**(8 页):events/developer/market **SegmentedControl 改到规格**(段高 34→44pt、r12→16/pad3→4、active surface→brand 填充、删 shadow、label 11.5→12.5/统一500/补 font-v5+-0.005em);多页 footer/empty 1.6→1.625;learn 分类 tab 补 active:scale;daily/missions 已忠实零改。flag:events/learn 的 featured-hero/card + market nex-chart/token-row 子组件未碰(逐字段核为准确 port,需另起轮次);developer/market 亮底按钮 uniapp 用 on-brand✓(原版用 --v5-ink dark 近隐形,保留不回退)。基线PASS·console0。
- 🔴🔴 **[并发冲突·flag 主人] team/unilevel.vue + unilevel-how.vue `RateTierId.elite`/`tierEliteName/Volume/Perk` 类型错**(17:52/17:57 被**另一 session 改**,非本任务):模板引用 elite 评级档,但 `RATE_TIER` 映射 + i18n 类型没补 elite(改到一半)。**判定=主人"同步后台分档"线在飞**,补 elite 需档名/业绩/权益数据(我无)+撞车风险→**不碰交主人**。全量 verify 因此卡 19/20(唯一 fail=这俩文件 tsc),我这批 4 域 tsc 干净隔离。team/unilevel **运行时或因 `RATE_TIER[elite]` undefined 崩**,请主人那条线补全 elite 闭环。
- **onboarding/auth 域 ✅**(8 页):intro/estimator/connect/terms + login/register/tx-hash/ref-code。leading-*/字距 -0.025em;connect 缺 mono 字体(font-jet-mono)6 处补;estimator phone icon 缺 ring;login/register 错 hex rgba→color-mix token + social btn active scale + sponsor name truncate;**tx/hash 翠绿光被错 token 成柠檬 success→还原翠绿**;**ref/code 角落光 brand-2橙→tech-cyan紫**(又一例 tint 色 bug)。flag:uni `<input>` 不支持 :focus-within(login/register 表单·不可页面本地修);shared trust-stat/tx-stat 字号(ref 用·未碰)。verify21/0·基线PASS·console0(含动态段)。
- 🎉 **全部内容子页面域完成(8 域 ~58 页)**——主人"除五一级页全量重审"的 page-.vue 级已收口。
- **shared-sub-component pass ✅**(3 agent,红线 grep 全做):
  - me/*:**标记 15 个一级页/chassis 可达组件跳过不改**(section-header/profile-row/wallet-card/...),修 12 个纯子页组件(preference-toggle-row/replay-*-row/device-inventory-row/ticket-row/ticket-stat-box/wallet-list-row/complete-row/verify-row/stake-alternative-card/device-deactivate-sheet):leading-snug 1.4→1.375、active opacity→`active:bg-surface-2`/scale[0.98]、tint alpha(`1F`=12%/`10`=6%/`33`=20%)、verify-row border→color-mix30%。
  - how/topup/trust:how/* 6 个全忠实零改;修 trust-stat/tx-stat/tx-row 漏 `tabular-nums`、topup-card-form 3 处 leading-relaxed 1.5/1.6→1.625 + 缺字距。
  - events/learn/market:7 组件全过红线(纯子页),修 hex-alpha 误换(`30`→18.8% 误作30%/`40`→25%)、leading-tight 1.15→1.25 / snug 1.35→1.375、active opacity→scale;learn-stats-card/nex-chart/token-row 验证零漂移。
  - **收尾门**:full verify 21/0·5 页基线 PASS(证跳过的可达组件没泄漏)·8 消费子页 console 0。
- 🎉🎉 **「除五一级页全量重审」全部收口**:8 内容域 ~58 page-.vue + 全部子页共享组件,逐字段 CSS 值对齐 + 三门验证(tsc/verify/baseline/console)。
- **弹窗 Pass C ✅**(12 弹窗,触发态实景验):
  - trial 簇(claim/extension/unbind):leading-* 全错(1.2→1.25/1.35→1.375/1.5→1.625)、hero 数字补 tabular-nums、font-size/margin 精度、补 active 态。**flag:trial-claim 自动显示在首页之上——只改弹窗本体未碰 index.vue**。
  - genesis/store 簇(purchase/opensea/slot-action/lucky-spin/tradein):purchase divider margin、slot-action radius/stroke、tradein leading+tabular。**lucky-spin 转盘奖品文字原本不可见(uni 把 SVG 内 `<text>` 编译成 `<uni-text>` 不渲染 P-007 族)→ v-html slicesSvg 修好(8 标签现可见)**。opensea 零改。
  - misc 簇(message-drawer/receipt-modal/stake-sheet):message-drawer 9 处(leading/tint 10%/圆角8/缩进48)、receipt-modal 印章补 rotate(-4deg)+theme-safe 值色;stake-sheet 逐字段全对零改。
  - **收尾门**:full verify 21/0·5 页基线 PASS(弹窗默认态无泄漏)·12 弹窗触发态 console 0+截图。
- 🔴 **Pass C 功能缺口 flag(非 CSS·需主人定夺)**:① receipt-modal 复制行无 `@click`(渲染成 brand 像复制入口但点无反应)+ 缺 Explorer/Share 两 CTA(原版有,port 全漏)→ agent 已把误导性注释改如实,功能未补;② tradein replace-sheet lowestText 缺原版英文 "today" 后缀(补则引硬编码英文违 i18n,留待 i18n 化或接受短式);③ connect 政策行缺逐行图标、ref 行内链接 tap<44pt、uni `<input>` 不支持 :focus-within(login/register 表单)、learn LessonSheet 抽屉原版有 uni 未港——均结构/功能层,非本次 CSS 范围。
- 🎉🎉🎉 **「除五一级页全量重审」彻底收口**:8 内容域 ~58 page-.vue + 全部子页共享组件 + 12 弹窗,逐字段 CSS 对齐 + 三门(tsc/verify21/基线/console)全验。
- **Pass B-行为 ✅(对抗复核 + 按真实产品标准补齐)**:对抗 workflow 复核 20 个自动触发行为 = **15 已对齐**(主 tick/试用状态机·延期·紧迫·冷却·首页自动推/Nova 三频道+冷却/社交证明/首页时钟+佣金跳数/NEX 价格轮询/订单详情 tick/设备自动激活/deep-link query)——粗盘点把这些全误判缺失,对抗轮证实都已 port。**真补 5 项**(全落 App.vue/global-ui/新 store,backend-replaceable,绝不碰五一级页本体):
  - ① 全局订单自动推进 + ② Genesis 6s 随机转卖:App.vue ORDER_TICK_MS=6000 loop(tickOrders + myListings 18% fulfillSale→creditBalance(net −2.5%版税)+bills bonus+i18n toast);修 order-detail.vue 错误注释。
  - ③ 收益里程碑撒花:新建 store/milestones.ts(EARNINGS_MILESTONES 5 档 + firedIds persist nexion-milestones-v1)+ App.vue 4s poll(markFired+creditNex+bills achievement+show)+ 新 milestone-celebration.vue(撒花+奖牌卡 5.2s,挂 global-ui)+ i18n。
  - ④ 路由访问完成任务:新建 store/quest.ts(QUEST_TASKS 幂等 markComplete persist nexion-quest-v1)+ App.vue 1s route watcher(visit_earn/visit_store/view_product_roi→creditNex+toast);**day-one-quest-card 在首页受保护·只做数据/奖励侧·显示侧 flag 交主人**。
  - ⑤ auth 守卫:**已实现(主人定:demo 友好)**——auth.ts 默认改 authed+onboarded(冷启进首页·守卫休眠·基线不破),只在 signOut 后受保护路由 reLaunch onboarding(白名单 onboarding/login/register/ref/tx 防循环);App.vue onShow+1s tick 双触发、reLaunch 前 bail。运行时三态验过(默认停 earn/signOut 跳 intro/onboarding 不循环)。me.vue 仅用 auth.signOut 不按 auth 渲染→翻默认零改受保护页。
  - **三门 + 运行时实景验**:tsc 0·verify 21/21·5 页基线 PASS;milestone overlay 实弹(firedIds:["earn-100"] 持久化)·quest toast 实弹(+30 NEX,store 幂等)·order/genesis loop 活跃 console 0。lifecycle:onShow 启 5 poll/onHide 全停。
- (并发 team/unilevel elite 档已被另一 session 自行收口,全量 tsc 现 0 错)
- **业务流程文档 ✅**:`docs/业务流程说明.md`(9 流程·8 mermaid 状态机/时序图·后端 API 映射·§10 已知缺口),主人点名"让开发理解产品业务流程"已交付。
- **Pass D 终审 ✅**:3 路并行审计——集成/竞态 PASS(P0=0·P1=0,6 循环幂等、跨 store 编排正确、auth 守卫无死循环)、运行时 sweep 16 页 console 0 + 新行为复验、完成度机器核验(i18n mirror 3727·NOVA 用户层 0·新 key en/zh 齐·tsc 0·verify)。抓到 1 P1 已修(下条)。7 P2=仿真口径瑕疵无碍。
- **P1 修复 ✅**:me 页 3 卡片(network/orders/my-devices)`<SectionHeader>` 漏 import(Vue 局部注册不级联)→ Vue warn + 标题缺渲染。主人直接指令修:3 组件各补 import + verify.sh 加 `section_header_imported` 哨兵(同形全扫)。验:header 渲染、0 warn、verify 22/0、**me.png 基线 0px(回归修复非改优化)**。
- **原型 stella→nova 重命名 ✅**(冻结 Nexion-prototype):25 文件改名(store/mock/cadence/components/static)、标识符/CSS/i18n/注释全改、**133 处 stellar* SKU 零误伤**(0 `novar`)、tsc 0、verify 230/0、Next 重启 3001→200、运行时 Nova 浮标+抽屉+nova-float/pulse/halo 动画验过+0 Stella 泄漏。**flag 主人**:BUILD_PLAN.md ~30 处历史构建日志旧名未动(改写会篡改历史记录,待主人定)。
- **剩余**:PRD 同步(附流程图,主人已批"现在同步")+ 清理临时产物。
- **加速提示**:行高漂移是主导且全站同形——后续域可先 grep `line-height: 1.6|1.55|1.4|1.2` 批量核(但值随原版 leading 类变,仍逐实例确认,别 blanket)。

## 批次进度
| Pass | 内容 | 状态 |
|---|---|---|
| 0 | 守卫+台账+对账 | ✅ 完成（守卫 15/15 0px·verify 17/17·NOVA 哨兵） |
| 0.5 | stella→nova 重命名 | ✅ 完成（tsc0·verify17·i18n-mirror·grep0·index.vue仅2行·5页0px·console0） |
| A | 架构基座 | ✅ 完成（page-header store+composable·chassis nav row 吸顶·useStickyCTA 吸底·detail 样板·verify 19/19·5页守卫 chrome 0px·detail console 0 + nav/CTA/eyebrow 实景验） |
| B1 | store 子页(5) | ✅ 完成（detail/checkout/orders/order-detail/bundle 全转架构+内容验） |
| **header 架构(全站)** | 67 子页吸顶+磨砂 | ✅ **完成**：5 页 chassis store nav row(detail/B1) + 62 页 sticky SubPageHeader(me/team/genesis/staking/trust/daily/market/...)；特殊页(login/register/onboarding-terms/me-wrapped/support-chat)按原版保留自有头；support-tickets 模式切换器=原版亦有(非双 header)。verify 20/20·5页基线 PASS·多页 sticky pin+console0 实景验 |
| B2 | me-wallet(14) | ✅ 结构完成（9 SubPageHeader+3 手搓转换；2 缺页 nex-v2-lock/premium 进挂起清单）；内容字段 = B1 证忠实，spot-check 通过 |
| B3-B7 | me-其余/team/genesis/staking/任务/auth | header 已全部对齐(上行)；剩余=内容字段 diff(B1 证多为忠实 port,低产)+ 域特定 issue |
| B-行为 | 29 触发(含试用弹窗) | **待**(高优,主人点名) |
| C | 20 弹窗 | 待 |
| B-行为 | 29 触发对账 | 待 |
| C | 20 弹窗 | 待 |
| D | 收尾+原型重命名 | 待 |
