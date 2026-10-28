# 小屏问题定界源码巡检

**当前冻结复核：下列两编号已由父线程修复并在源码范围关闭**，详见末节。保留发现时原文与失败原因；不将源码关闭冒称原生设备或全站实景通过。

2026-10-27 · Averroes。APP 工作树 `D:/WORKS/PLAN/.wt/uvel-design-20261025-app`，基线 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9` 加当时 WIP。只读定向检索与源码核对，未测试、构建、操作浏览器或修改产品。此项是用户新增的扩展巡检，范围超出此前18文件；不等于全站所有页面/状态已验收。

**结果：新增确认 1 组 P2，涉及3个弹窗关闭控件；既有 Native SVG P2 顶部已修、签到仍有一处覆盖问题。** 没有根据“越文可能很长”新增布局缺陷或要求全库改写。Noether福利双卡正在更新，本轮只记录其归属，不抢签在途实现。

## 确认的 P2

### SMALL-SCREEN-HIT-01 · 三处关闭按钮把可见尺寸直接当命中尺寸

| 可达入口 | 精确源码 | 失败原因 |
|---|---|---|
| 收益/设备添加入口 → 槽位操作弹窗 | [slot-action-sheet.vue:26](../../../src/components/slot-action-sheet.vue#L26)，[尺寸:272](../../../src/components/slot-action-sheet.vue#L272) | `@click="hide"`、role、tabindex 全在 `.sas-close` 本身；根宽高36px，没有44px外壳、padding扩展或伪元素命中层。 |
| 个人资料 → 昵称编辑 | [nickname-sheet.vue:16](../../../src/components/me/nickname-sheet.vue#L16)，[尺寸:145](../../../src/components/me/nickname-sheet.vue#L145) | `emit('close')` 直接绑定内联32×32px的根，`shrink-0`只防收缩，不会补到44px。 |
| 设备管理 → 运行任务设备停用确认 | [device-deactivate-sheet.vue:21](../../../src/components/me/device-deactivate-sheet.vue#L21)，[尺寸:156](../../../src/components/me/device-deactivate-sheet.vue#L156) | `emit('dismiss')` 直接绑定36×36px的根，未发现局部或全局 min-width/min-height44 覆盖。 |

三处都不满足本项目本轮强调的44px事件根要求；小屏没有额外命中补偿。这是现存遗漏，**不是本轮缩小CSS引入的回归**。最小修复是在所属控件保留44px根，按需要将32/36px可见圆面放在内部，维持现有事件、键盘和aria；无需改变关闭业务或建立新全局组件。

旧 [安全区审查](../2026-10-26-overlay-safe-area/safe-area-review-raman.md#L45) 签署的是限高、滚动及底部间距，并非这三处44px命中几何。本次没有重开其安全区结论。对照同类 voucher/trial/质押/receipt 的关闭根已有44px，不能因它们的可见图标更小而误报。

### COMPACT-R11-NATIVE-SVG-01 · 已有编号，不重复立项

详见 [原审查及补丁复核](compact-r10-code-review.md)。顶部内层SVG100%补丁已关闭源码缺口；签到 [daily-check-in-row.vue:95](../../../src/components/home/daily-check-in-row.vue#L95) 的 wrapper 普通18px声明仍输给 NativeSvg内联20px，需补有效最大尺寸约束。未冒称APP设备测过。390正常签到的默认模板、脚本与基础CSS已确认保留。

## 已巡检的其余边界与排除理由

| 范围 | 当前源码依据与结论 |
|---|---|
| ≤350/374将紧凑CTA强制整行 | 已检查实际断点命中及相关调用。签到旧整行CTA已删除。剩余 [sticky-cta-bar.vue:182](../../../src/components/sticky-cta-bar.vue#L182) 是底部购机主操作，含金额/数量选择；它的整行不是紧凑状态恢复。 [weekly-quest-hero.vue:310](../../../src/components/home/weekly-quest-hero.vue#L310) 改的是奖励说明区flex-basis，不是将领取按钮强制整行。未据此新增P2。 |
| 团队双卡与长VI | [team.vue:549](../../../src/pages/team/team.vue#L549) 两列minmax(0,1fr)、子卡min-width0；summary标题可换行，数字有容器自适应和横向滚动，direct标签可换行。rank标题/说明没有nowrap或固定裁剪高度；现有“Đội nhóm của tôi / Hạng của tôi / Quyền lợi và phần thưởng”可按词换行。不能仅因双列或15px标题判定溢出。team-ledger的大金额已使用overflow-x:auto，未以极端金额构造新失败。 |
| 目标期限 | [goals.vue:431](../../../src/pages/me/goals.vue#L431) 预设根44px、min-width0、水平padding4；标签12px/18px，四个值30/90/180/365，文案为“{days} ngày / {days} days”。不是此前担心的高字号单行按钮。320px时按当前外边距/内边距/列距，单项内容预算约58.5px；字体实际宽度未测，不将该预算当通过测量，也不将正常字符串臆定为失败。 |
| 错误提示独行 | 已对照 shared inline-recovery、team-ledger、team-summary、promotion-entry、goals、message-center。紧凑横向恢复行已有右动作槽、min-width0/换行；team-summary纵向小卡状态、goals无快照/推荐失败内容块、全页EmptyState并非相同结构。r8视觉已明确保留summary纵向布局，故未机械把全部错误态改横排或重开已签字体P2。 |
| 消息头＋输入 | [chat.vue:1805](../../../src/pages/support/chat.vue#L1805) 两侧44、中间minmax；身份max-width100%且名称可换行。 [conversation-thread.vue:1284](../../../src/components/support/conversation-thread.vue#L1284) composefield/content有min-width0，textarea宽100%、上限min(144px,34dvh)，计数flex-wrap，policy retry44px，输入/失败恢复底部均保留env+22px。未发现新的源码溢出证据；旧header/counter/history修复继续按其原签范围保留，不重跑生命周期矩阵。 |
| 弹窗safe area/短视口 | 定向读NxSheet、country-code、trial/voucher、slot、nickname/device-deactivate、质押、receipt、invite-detail/share-channel/share-poster及tradein的面板约束。均有可用高度上限及滚动路径，底部使用overlay变量或env+留白；未发现此次巡检范围内后置padding覆盖安全区的新证据。关闭触区问题单列上文，不混同底部被遮挡。真实软键盘/原生WebView设备仍非本次覆盖。 |
| 福利双卡 | home-benefits及trial/voucher由Noether正在修改，巡检过程中源码已变化。用户反馈已有实施责任人；不拿中间字节另开重复P2，不给最终评分，待其READY后按最终diff独立复核。 |

## 已关闭项保护及最小后续

- 已读 r10 [视觉A](compact-r10-visual-a/review-r10-visual-a.md) / [交互B](compact-r10-interaction-b/review-r10-interaction-b.md)：试用双按钮、设备字号、Logo与44px边缘点击已限定关闭，不扩展旧矩阵；底部320 VI NAV-01仍按r11新构建确认。
- 已读 r6–r8及r9实景报告：team-ledger/summary/message-header字体、商城文案、trial-read-retry已修后签署；不从历史8.8段落复活旧问题。消息header/counter参考 [最终队列报告](../2026-10-26-message-theme/review-final-queue.md#L27)，安全区参考前述Raman报告，保留其真实设备覆盖边界。
- 对新P2只需在各现有入口确认关闭根44px及原关闭动作；NativeSVG只需核对原定小屏入口的wrapper/内层尺寸。布局没有源码确证的新缺陷，不追加整套主题×语言×状态矩阵。现阶段没有测试/构建/运行时的新通过记录。

本轮唯一写入：此仓外清单及原 compact-r10-code-review.md 的定界补丁复核；没有更改产品或共享主文档。

## 冻结补丁复核：已关闭

2026-10-27。父线程最新diff已读回：slot-action、nickname、device-deactivate关闭事件根均44×44、border-box，padding分别4/6/4px，正常态背景裁切保留36/32/36px；模板/事件/键盘/aria不变。**SMALL-SCREEN-HIT-01源码9.2/10，关闭。** 其安全区和滚动规则未变，不重开旧报告。

签到NativeSvg wrapper已补max-width/max-height18px，内联20px不再阻止其缩小；内层SVG100%及顶部同类内外约束保留。**COMPACT-R11-NATIVE-SVG-01源码9.2/10，关闭**，两轮8.8证据保留在[原报告](compact-r10-code-review.md)。390签到默认样式再次比对未变。

Noether福利四文件随后READY，已完成独立[源码复核9.1](benefits-r12-code-review.md)，取代上表的“在途未签”状态。当前巡检无尚未修复的已确认P2；并非所有未运行场景都已通过。本次没有测试、构建、浏览器或设备测量，代码评分仅限实际读回diff。
