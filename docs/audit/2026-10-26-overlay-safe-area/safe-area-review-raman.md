# 独立审查 A / Raman — 全站弹窗 Home Indicator 安全区

生成时间（UTC）：2026-10-26T06:45:02.615Z。仓库：D:/WORKS/PLAN/.wt/uvel-design-20261025-app。

## 结论与边界

最终源码覆盖评分 **9/10**；下表 44 个审查项均为静态 9/10，当前范围内无已识别的剩余代码阻断点。9 分仅表示指定源码范围内未发现具体缺陷，不表示全部状态、语言、主题或平台已实景通过。没有因缺少真机而压低静态评分。

本审查未使用浏览器、未操作共享右侧实景、未改业务代码。本次唯一输出为此报告。最终构建、typecheck、235 tests 通过由主 agent 报告；reviewer 不将该转述计为独立重跑。远端 APP b098bb68 / H5 0c2a14b 的 scan/chassis 变更不扩展本轮审查范围。

当前本地 HEAD：`b098bb68e5606491756262532c58b8ce03b7e7b8`。弹层审查文件相对 HEAD 的 diff SHA-256：`4f20c6121a6739d428685053561a46b5041205f16fbe8d9dcc7140b79cb0b33f`。文件级指纹见末尾。runtime JSON 没有逐文件构建指纹，不能把其中全部历史记录自动绑定到此最终 HEAD；其 notes 已明确多数记录早于后续 picker/image/country 修复。

## 最后修复复核

1. **H5 picker：静态缺口关闭。** [tokens.css](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/styles/tokens.css) 的 H5 条件和宽度≤499 或高度≤499 media 将移动分支与框架桌面分支分开；更具体选择器覆盖框架高度。内部内容使用 `min(238px, calc(100vh - top - bottom - 45px))`，320px 高、bottom inset=34 时为213px，头部45+内容213+底部50=308px，等于320-顶部12，不再依赖被框架事件拦截的外层默认滚动。未修改 node_modules。**runtime pending**，JSON无country-picker对应实测。
2. **图片预览：静态缺口关闭。** [conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue) 已把 widthFix 改为 aspectFit，明确 width:100%、可用高度及 flex:none；高度预算扣除顶部、底部、44px关闭控件与16px间隔，避免只限高却由widthFix重算高度造成比例问题。原生previewImage与自绘fallback分支保持区分。**runtime pending**，不从其他弹窗推定长图/横图通过。
3. **区号 scroll-view：静态修复与指定实景范围闭环。** [country-code-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/country-code-sheet.vue) 由 flex:1/max-height 改为 flex:none/显式height，并移除列表底部12px padding，保留水平padding。72px=grab(4+10)+header(44+8+6)；列表高度扣除同源面板高度、72px头部和实际底部留白。避免外层flex收缩而uni内部仍沿用旧max-height的失配。

### 区号缺陷与最终复测证据链

修复前主 agent 在320×568、inset0实测：sheet bottom568/padding40，外list top约219、height308、bottom528；内部.uni-scroll-view client352、bottom572、scrollHeight896。内部越过预留区，旧静态判断据此被推翻；不得把该记录算通过。

主 agent 已报告在最终构建复测；以下最终数据也存在于runtime JSON的final-end记录。本reviewer独立核对了数值与源码公式，并查看了本地截图，但没有自己运行CDP。

| 最终范围 | 外/内滚动底边（主agent报告） | scrollTop | scrollHeight | clientHeight | 最后项bottom | 距视口底部 | 结论 |
|---|---:|---:|---:|---:|---:|---:|---|
| 320×568，inset0 | 528 / 528 | 588 | 896 | 308 | 527.6875 | 40.3125 | 该范围通过 |
| 320×568，inset34 | 510 / 510 | 606 | 896 | 290 | 509.6875 | 58.3125 | 该范围通过 |

scrollTop+clientHeight均等于896，证明滚到列表末尾；最终间距与40/58px规则相符。JSON final-end含内部scrollBottom，内外对齐结论另由用户明确报告。截图：[safe-area-country-final.png](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-country-final.png)，reviewer已查看；单张截图不用于推定两种inset数值。

## 逐项 review scope / 静态 score / runtime scope

“已记录”只指JSON中对应标签所描述的样例几何；不是全状态绿。未列明的业务态、语言/主题组合和原生分支均pending。

| # | 审查项 | review scope | 静态 score | runtime scope |
|---:|---|---|---:|---|
| 1 | 本地验证码 | 居中安全边距、卡片限高及滚动；[captcha-slider.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/captcha-slider.vue) | 9/10 | pending：无对应有效实测记录 |
| 2 | 服务端验证码 | 居中安全边距、卡片限高及滚动；[server-captcha-slider.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/server-captcha-slider.vue) | 9/10 | pending：无对应有效实测记录 |
| 3 | 全局确认 | 有/无取消按钮、长内容滚动；[global-ui.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/global-ui.vue) | 9/10 | 已记录：`global-confirm-390x420-inset0`；仅该样例范围 |
| 4 | 网络错误 | 网络错误卡片、重试动作；[global-ui.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/global-ui.vue) | 9/10 | pending：无对应有效实测记录 |
| 5 | 里程碑庆祝 | 居中卡片、限高、内部滚动；[milestone-celebration.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/milestone-celebration.vue) | 9/10 | pending：无对应有效实测记录 |
| 6 | 国家区号 | 外壳安全区、显式列表高度、真实内部滚动层；[country-code-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/country-code-sheet.vue) | 9/10 | 已记录：`country-final-end-320x568-inset0`、`country-final-end-320x568-inset34`；仅该样例范围 |
| 7 | 幸运转盘 | 展开内容、原留白保留、面板限高；[lucky-spin-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/lucky-spin-sheet.vue) | 9/10 | 已记录：`lucky-spin-expanded-390x420-inset0`；仅该样例范围；controls为空，仅面板限高/溢出量，末项可达pending |
| 8 | 槽位操作 | 面板滚动及内部50vh设备列表；[slot-action-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/slot-action-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 9 | 换机系列 | 公共面板及各条件分支；[tradein-sheets.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/tradein-sheets.vue) | 9/10 | pending：无对应有效实测记录 |
| 10 | 试用领取 | 保留env+38、限高及末尾动作；[trial-claim-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/trial-claim-sheet.vue) | 9/10 | 已记录：`trial-320x568-inset0`；仅该样例范围 |
| 11 | 券领取 | 保留env+38、面板滚动及末尾动作；[voucher-claim-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/voucher-claim-sheet.vue) | 9/10 | 已记录：`voucher-panel-320x568-inset0`；仅该样例范围 |
| 12 | NxSheet无footer | 安全区归外壳、body收缩滚动；[nx-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/ui/nx-sheet.vue) | 9/10 | 已记录：`nx-sheet-nofooter-320x568-inset0`；仅该样例范围；仅记录关闭控件，末尾内容几何pending |
| 13 | NxSheet有footer | footer与外壳不重复计安全区；[nx-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/ui/nx-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 14 | 容量说明 | 原子类定位、内联留白和限高；[capacity-explainer-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/earn/capacity-explainer-sheet.vue) | 9/10 | 已记录：`capacity-390x420-inset0`；仅该样例范围 |
| 15 | 设备快捷菜单 | 内联定位与padding优先级、末尾动作；[device-card-pc.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/earn/device-card-pc.vue) | 9/10 | pending：无对应有效实测记录 |
| 16 | Genesis资格 | 多原因列表、CTA、整体滚动；[eligibility-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/genesis/eligibility-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 17 | Genesis购买 | 保留env+38、限高及整体滚动；[purchase-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/genesis/purchase-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 18 | Genesis成功 | 独立居中卡片、上下安全距；[purchase-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/genesis/purchase-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 19 | 设备停用 | 任务信息、三个动作、整体滚动；[device-deactivate-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/device-deactivate-sheet.vue) | 9/10 | 已记录：`device-deactivate-390x420-inset0`；仅该样例范围 |
| 20 | 汇率说明 | 长说明及确认动作、限高；[fx-rate-line.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/fx-rate-line.vue) | 9/10 | pending：无对应有效实测记录 |
| 21 | 昵称编辑 | 居中限高、滚动前关闭及滚动后末尾动作；[nickname-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/nickname-sheet.vue) | 9/10 | 已记录：`nickname-390x420-inset0`、`nickname-scrolled-390x420-inset0`；仅该样例范围 |
| 22 | 收据 | 固定头部、body收缩滚动、复制入口；[receipt-modal.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/receipt-modal.vue) | 9/10 | 已记录：`receipt-390x420-inset0`；仅该样例范围 |
| 23 | 主题选择 | 居中边距、限高及滚动；[theme-picker-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/theme-picker-sheet.vue) | 9/10 | 已记录：`theme-centered-390x420-inset0`；仅该样例范围 |
| 24 | 换机阶梯 | 内联留白、原子类定位、整体滚动；[tradein-ladder-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/tradein-ladder-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 25 | 推广离开确认 | scoped覆盖公共promotion.css、居中限高；[promotion-checkout.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/promotion/promotion-checkout.vue) | 9/10 | pending：无对应有效实测记录 |
| 26 | 优惠券选择 | 委托NxSheet无footer分支；[promotion-checkout.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/promotion/promotion-checkout.vue) | 9/10 | pending：无对应有效实测记录 |
| 27 | 结算活动条款 | 委托PromotionTerms/NxSheet；[promotion-checkout.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/promotion/promotion-checkout.vue) | 9/10 | pending：无对应有效实测记录 |
| 28 | 奖励状态筛选 | 委托NxSheet，不从通用样例推定业务态通过；[promotion-reward-list.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/promotion/promotion-reward-list.vue) | 9/10 | pending：无对应有效实测记录 |
| 29 | 活动条款 | 相对导入链、无footer长内容；[promotion-terms.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/promotion/promotion-terms.vue) | 9/10 | pending：无对应有效实测记录 |
| 30 | 质押正常态 | 面板留白、整体滚动及提交动作；[stake-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/staking/stake-sheet.vue) | 9/10 | 已记录：`stake-390x420-inset0`；仅该样例范围；恢复态/不可用态不由本记录推定 |
| 31 | 质押恢复态 | recovering/pendingOpenRejection共用受限高面板；[stake-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/staking/stake-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 32 | 质押不可用态 | 已补nx-sheet-panel类、定位与限高；[stake-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/staking/stake-sheet.vue) | 9/10 | pending：无对应有效实测记录 |
| 33 | 自绘图片预览 | aspectFit、width100%、明确可用高度、关闭不收缩；[conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue) | 9/10 | pending：无对应有效实测记录 |
| 34 | 邀请详情 | 规则/记录分支、内部body滚动；[invite-detail-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/team/invite-detail-sheet.vue) | 9/10 | 已记录：`invite-rules-320x568-inset34`、`invite-rules-320x568-inset0`；仅该样例范围；规则已测，记录模式pending |
| 35 | 分享渠道 | 外壳留白、body滚动、展开规则和取消动作；[share-channel-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/team/share-channel-sheet.vue) | 9/10 | 已记录：`share-390x844-inset34`、`share-expanded-390x420-inset34`；仅该样例范围 |
| 36 | 分享海报 | 生成中/失败/展示分支，底部动作属于ps-body；[share-poster-sheet.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/team/share-poster-sheet.vue) | 9/10 | 已记录：`poster-390x420-inset34`；仅该样例范围；未明确genState，不推定生成中/失败/全部渠道通过 |
| 37 | 试用规则页 | env+38、面板限高及滚动；[trial.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/trial.vue) | 9/10 | 已记录：`trial-rules-390x420-inset0`；仅该样例范围 |
| 38 | 提现费用说明 | 内联限高、说明和关闭入口；[wallet-withdraw.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/wallet-withdraw.vue) | 9/10 | 已记录：`withdraw-fee-settled-390x420-inset0`；仅该样例范围 |
| 39 | 引导语言选择 | 外层面板和内部语言scroll-view边界；[intro.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/onboarding/intro.vue) | 9/10 | 已记录：`intro-language-vi-320x568-inset0`；仅该样例范围 |
| 40 | 团队网络 | 成员面板限高、48/58px留白公式；[network.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/team/network.vue) | 9/10 | 已记录：`network-member-390x844-inset0`；仅该样例范围；未记录末尾详情边界 |
| 41 | Globe | 保留既有外层安全距及卡片滚动；[globe.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/globe/globe.vue) | 9/10 | pending：无对应有效实测记录 |
| 42 | H5国家picker | 框架portal、移动media、45px头部及滚轮可用高度；[topup-card-form.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/me/topup-card-form.vue) | 9/10 | pending：无对应有效实测记录 |
| 43 | 消息中心/聊天输入区 | 独立页面分类；聊天原输入/只读条保留安全区，不套modal；[notifications.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/notifications.vue) | 9/10 | pending：无对应有效实测记录 |
| 44 | Toast/非modal边界 | 普通/结算toast保留env+96/112；不对普通展开区与设备chrome一刀切；[global-ui.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/global-ui.vue) | 9/10 | pending：无对应有效实测记录 |

## runtime JSON独立核对

来源：[safe-area-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-runtime.json)，SHA-256 `5f7d25830682226325068dbdf968361062a0b94c83960ce6534b72f64c11cd36`。声明范围：CUA local mock prototype only; no native device or real service。共27条原始记录；明确排除3条动画/修复前记录，另外保留子卡和滚动前样例的限定含义。19类有样例记录与“19类全部状态通过”不同。

| record label | 证据资格与已测边界 | 面板bottom | padding-bottom | 末项/动作说明 |
|---|---|---:|---|---|
| `share-390x844-inset34` | 样例几何记录；仅此标签范围 | 844 | 34px | 控件7项；取消 gap=46 |
| `share-expanded-390x420-inset34` | 样例几何记录；仅此标签范围 | 420 | 34px | 控件7项；取消 gap=45.5729 |
| `poster-390x420-inset34` | 样例几何记录；仅此标签范围 | 420 | 34px | 控件3项；复制链接 gap=51.8646 |
| `invite-rules-320x568-inset34` | 样例几何记录；仅此标签范围 | 568 | 58px | 控件3项；奖励记录 gap=70 |
| `invite-rules-320x568-inset0` | 样例几何记录；仅此标签范围 | 568 | 40px | 控件3项；奖励记录 gap=52 |
| `voucher-320x568-inset0` | 券子卡补充；不能替代券外壳验收 | 470 | 14px | 控件1项；立即领取 gap=112 |
| `voucher-panel-320x568-inset0` | 样例几何记录；仅此标签范围 | 568.0334 | 38px | 控件3项；暂不领取 gap=37.9666 |
| `trial-320x568-inset0` | 样例几何记录；仅此标签范围 | 568 | 38px | 控件3项；我再想想 gap=38 |
| `nx-sheet-nofooter-320x568-inset0` | 样例几何记录；仅此标签范围 | 568 | 24px | 控件1项；关闭 gap=439.8333 |
| `theme-centered-390x420-inset0` | 样例几何记录；仅此标签范围 | 341 | 20px | 控件1项；关闭 gap=295 |
| `global-confirm-390x420-inset0` | 样例几何记录；仅此标签范围 | 279.4167 | 16px | 控件2项；退出登录 gap=156.5833 |
| `device-deactivate-390x420-inset0` | 样例几何记录；仅此标签范围 | 420 | 38px | 控件4项；返回 gap=38 |
| `nickname-390x420-inset0` | 滚动前状态；用于初始关闭入口，不据此判末项失败 | 380 | 20px | 控件3项；确认选择 gap=-75.3333 |
| `nickname-scrolled-390x420-inset0` | 样例几何记录；仅此标签范围 | 380 | 20px | 控件3项；确认选择 gap=60 |
| `trial-rules-390x420-inset0` | 样例几何记录；仅此标签范围 | 420 | 38px | 控件2项；知道了 gap=38 |
| `stake-390x420-inset0` | 样例几何记录；仅此标签范围 | 420 | 38px | 控件7项；锁仓 $20.00 共 30 天 gap=67.2708 |
| `receipt-390x420-inset0` | 样例几何记录；仅此标签范围 | 374.5 | 0px | 控件2项；复制 证明哈希 gap=84.1146 |
| `intro-language-vi-320x568-inset0` | 样例几何记录；仅此标签范围 | 568 | 38px | 控件3项；Tiếng Việt gap=38 |
| `country-vi-320x568-inset0` | 动画中诊断；排除验收 | 612.3665 | 40px | 控件1项；Đóng bộ chọn quốc gia gap=309.946 |
| `country-vi-320x568-inset0-settled` | 修复前外壳测量；排除最终验收 | 568 | 40px | 控件1项；Đóng bộ chọn quốc gia gap=354.3125 |
| `country-final-end-320x568-inset0` | 样例几何记录；仅此标签范围 | 568 | — | 末项gap=40.3125；st=588, sh=896, ch=308 |
| `country-final-end-320x568-inset34` | 样例几何记录；仅此标签范围 | — | 58px | 末项gap=58.3125；st=606, sh=896, ch=290 |
| `network-member-390x844-inset0` | 样例几何记录；仅此标签范围 | 844 | 48px | 控件1项；关闭 gap=327.5 |
| `lucky-spin-expanded-390x420-inset0` | 样例几何记录；仅此标签范围 | 420 | 40px | 无控件边界；不能证明末项动作可达 |
| `withdraw-fee-390x420-inset0` | 动画中诊断；排除验收 | 512.1052 | 38px | 控件1项；关闭 gap=92.5614 |
| `withdraw-fee-settled-390x420-inset0` | 样例几何记录；仅此标签范围 | 420 | 38px | 控件1项；关闭 gap=184.6667 |
| `capacity-390x420-inset0` | 样例几何记录；仅此标签范围 | 420 | 40px | 控件2项；查看更高算力设备 gap=40 |

昵称滚动前末尾动作在视口外，滚动后动作bottom360/gap60；这是两种滚动位置，不把未滚动测量当最终失败。质押/分享等滚动后上方控件负坐标同样不自动等同越界缺陷，但JSON未证明所有返回顶部/关闭路径。国家picker不同于country-code-sheet，区号通过不能代替picker通过。

当前明确pending包括：两个验证码、网络错误、庆祝、槽位/换机系列、NxSheet有footer、设备快捷菜单、Genesis资格/购买/成功、汇率、换机阶梯、推广离开确认、质押恢复/不可用、自绘图片预览、H5框架picker、Globe；以及各已测类中未记录的异常态、语言/主题、视口/inset组合。原生设备、真实服务和真实支付未包含于本JSON，也不作为本轮静态评分必须达到9分的条件。

## 补充依赖清单：25条

以TypeScript AST读取所有Vue脚本静态import，解析@/和相对路径、压缩写法以及tabs到子页面的导入链；与pages JSON的sharedOverlayDependencies/directOverlayComponents交叉比较。实际100页，pages JSON列100页，漏页0；另发现25条页面→弹层依赖未在该JSON列出。它们是入口/交接缺口，不是25个UI缺陷。三个完全漏列的组件owner为invite-detail-sheet、share-channel-sheet、share-poster-sheet，nested清单已有覆盖；合并报告应补页面关系。下表保留所有25条，不去重成组件数量。

| # | 页面/route | 应补弹层owner | 导入链 |
|---:|---|---|---|
| 1 | `/pages/events/events` | `src/components/ui/nx-sheet.vue` | `src/pages/events/events.vue` → `src/components/promotion/promotion-entry.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 2 | `/pages/events/promotion-reward-detail` | `src/components/global-ui.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/global-ui.vue` |
| 3 | `/pages/events/promotion-reward-detail` | `src/components/lucky-spin-sheet.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/lucky-spin-sheet.vue` |
| 4 | `/pages/events/promotion-reward-detail` | `src/components/milestone-celebration.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/global-ui.vue` → `src/components/milestone-celebration.vue` |
| 5 | `/pages/events/promotion-reward-detail` | `src/components/slot-action-sheet.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/slot-action-sheet.vue` |
| 6 | `/pages/events/promotion-reward-detail` | `src/components/tradein-sheets.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/tradein-sheets.vue` |
| 7 | `/pages/events/promotion-reward-detail` | `src/components/trial-claim-sheet.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/trial-claim-sheet.vue` |
| 8 | `/pages/events/promotion-reward-detail` | `src/components/voucher-claim-sheet.vue` | `src/pages/events/promotion-reward-detail.vue` → `src/components/app-chassis.vue` → `src/components/voucher-claim-sheet.vue` |
| 9 | `/pages/index/index` | `src/components/ui/nx-sheet.vue` | `src/pages/index/index.vue` → `src/components/promotion/promotion-entry.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 10 | `/pages/missions/missions` | `src/components/ui/nx-sheet.vue` | `src/pages/missions/missions.vue` → `src/pages/events/events.vue` → `src/components/promotion/promotion-entry.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 11 | `/pages/store/bundle` | `src/components/ui/nx-sheet.vue` | `src/pages/store/bundle.vue` → `src/components/promotion/promotion-bundle.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 12 | `/pages/store/detail` | `src/components/ui/nx-sheet.vue` | `src/pages/store/detail.vue` → `src/components/promotion/promotion-product.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 13 | `/pages/store/store` | `src/components/ui/nx-sheet.vue` | `src/pages/store/store.vue` → `src/components/promotion/promotion-entry.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 14 | `/pages/tabs/tabs` | `src/components/earn/capacity-explainer-sheet.vue` | `src/pages/tabs/tabs.vue` → `src/pages/earn/earn.vue` → `src/components/earn/capacity-explainer-sheet.vue` |
| 15 | `/pages/tabs/tabs` | `src/components/earn/device-card-pc.vue` | `src/pages/tabs/tabs.vue` → `src/pages/earn/earn.vue` → `src/components/earn/device-card-pc.vue` |
| 16 | `/pages/tabs/tabs` | `src/components/me/receipt-modal.vue` | `src/pages/tabs/tabs.vue` → `src/pages/earn/earn.vue` → `src/components/earn/task-center.vue` → `src/components/me/receipt-modal.vue` |
| 17 | `/pages/tabs/tabs` | `src/components/me/theme-picker-sheet.vue` | `src/pages/tabs/tabs.vue` → `src/pages/me/me.vue` → `src/components/me/theme-picker-sheet.vue` |
| 18 | `/pages/tabs/tabs` | `src/components/team/invite-detail-sheet.vue` | `src/pages/tabs/tabs.vue` → `src/pages/team/team.vue` → `src/components/team/invite-earn-card.vue` → `src/components/team/invite-detail-sheet.vue` |
| 19 | `/pages/tabs/tabs` | `src/components/team/share-channel-sheet.vue` | `src/pages/tabs/tabs.vue` → `src/pages/team/team.vue` → `src/components/team/invite-earn-card.vue` → `src/components/team/share-channel-sheet.vue` |
| 20 | `/pages/tabs/tabs` | `src/components/team/share-poster-sheet.vue` | `src/pages/tabs/tabs.vue` → `src/pages/team/team.vue` → `src/components/team/invite-earn-card.vue` → `src/components/team/share-poster-sheet.vue` |
| 21 | `/pages/tabs/tabs` | `src/components/ui/nx-sheet.vue` | `src/pages/tabs/tabs.vue` → `src/pages/index/index.vue` → `src/components/promotion/promotion-entry.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |
| 22 | `/pages/team/team` | `src/components/team/invite-detail-sheet.vue` | `src/pages/team/team.vue` → `src/components/team/invite-earn-card.vue` → `src/components/team/invite-detail-sheet.vue` |
| 23 | `/pages/team/team` | `src/components/team/share-channel-sheet.vue` | `src/pages/team/team.vue` → `src/components/team/invite-earn-card.vue` → `src/components/team/share-channel-sheet.vue` |
| 24 | `/pages/team/team` | `src/components/team/share-poster-sheet.vue` | `src/pages/team/team.vue` → `src/components/team/invite-earn-card.vue` → `src/components/team/share-poster-sheet.vue` |
| 25 | `/pages/team/team` | `src/components/ui/nx-sheet.vue` | `src/pages/team/team.vue` → `src/components/promotion/referral-progress.vue` → `src/components/promotion/promotion-terms.vue` → `src/components/ui/nx-sheet.vue` |

## 静态验证与审查指纹

本reviewer本次独立执行：31个变更Vue SFC解析、31个脚本块TypeScript语法转译、26个内嵌样式块编译、tokens.css编译、图片预览模板编译；错误0。git diff --check通过。语法转译不等于完整typecheck，CSS编译不等于浏览器布局。主agent提供的build/types/tests证据由主报告记录，不重复宣称独立执行。

未覆盖到分数中的对象：所有无关业务逻辑、scan/chassis新功能、真实交易行为。原生UI仅检查委托边界；toast保留既有外距，普通下拉/内联展开、离屏canvas、设备chrome不被统一modal补丁修改。当前CSS采用局部类/内联样式和H5 picker专用规则，未发现通用role选择器加错包裹层或重复安全区的覆盖问题。

| 审查文件 | SHA-256 |
|---|---|
| `src/components/captcha-slider.vue` | `4d6c8a1e4f62573563d7dc130291d11ee7ce9309f99d40096bceac2edc5f57d0` |
| `src/components/country-code-sheet.vue` | `0c74fb6419e5d0d5bff38770dbfc14744179f0ae4e327c37a9407c34b45954fc` |
| `src/components/earn/capacity-explainer-sheet.vue` | `09f8a9ea89abe5071539781c5858e9fae79d20c814ae91a5d9ed4fa94c7821d4` |
| `src/components/earn/device-card-pc.vue` | `4a69c4b1cf10b58a6194432f6e18232bf6fd250c6282ae9c58fecb891079512f` |
| `src/components/genesis/eligibility-sheet.vue` | `fb6f913a79175f4ca85aed75902737560ec6bcba4a73af3bc99d409c48a60342` |
| `src/components/genesis/purchase-sheet.vue` | `968f3d596e14f3db133f044e9517b8e7d8e8cc4b6095afba136d0d3931d6a846` |
| `src/components/global-ui.vue` | `783d3b6f5e74c134e12ee998f871a1c7456811164742af92af8bf317126bf2b9` |
| `src/components/lucky-spin-sheet.vue` | `6413bbde98616f7eaf2550ee22b1cddad8a0d186dabdffd0a0d798e0db17386f` |
| `src/components/me/device-deactivate-sheet.vue` | `808481fbf6548a83c2c0bc8d0d0ef7de482e6ac134da6161f5149e80cbec88c4` |
| `src/components/me/fx-rate-line.vue` | `21bfb3d7c65626c4ca0f812b63aa582b07cb623109cd4fe48f878258aaeffba4` |
| `src/components/me/nickname-sheet.vue` | `4cc823038b95594ccaedbffda0d1c043f4427de5ace200d724b0ae8cbb4adc1a` |
| `src/components/me/receipt-modal.vue` | `fa83c7bef1ae41d7bc42fd853ac69ffe23bdf4fa9935c2e5a7af45123aef867b` |
| `src/components/me/theme-picker-sheet.vue` | `8b2c1cd956d58c52f30f993298131c40b64bc54fc3fb0e2c2c0e9c7546dac731` |
| `src/components/me/topup-card-form.vue` | `8db925a1df06c920f9b2ead7609210626fad28f042185b30083eecd2df0616f9` |
| `src/components/me/tradein-ladder-sheet.vue` | `f92416588da6c520487370f5640bf74daac471b21f91f005ee7408dfcdc9cef4` |
| `src/components/milestone-celebration.vue` | `52c61514eeaff264f9d5ba04225889559233ef8932ebae8e9193e15371721e85` |
| `src/components/promotion/promotion-checkout.vue` | `2d582b6f07ca30154e410ef6a1f15d70f368bdfbfd2a3ad5e84487e25d520823` |
| `src/components/promotion/promotion-reward-list.vue` | `88bdaaf7e839674e3272f5bb79ee96e4ef5ee8217ae08efb828656d6fd3db0e4` |
| `src/components/promotion/promotion-terms.vue` | `e3b430fbd4f32de9e69d648c5cfc7fdbe87c83a11de3a77a21fdc28fffb2545a` |
| `src/components/server-captcha-slider.vue` | `eaccbe914f0413e50672b7ca01d7fed63651acaacb0e16a8c63dec41deed80c3` |
| `src/components/slot-action-sheet.vue` | `2ac7acb6755bf5bb0743bec06619a5fb04cfb9c38ca66b771b8955ccf01e2c04` |
| `src/components/staking/stake-sheet.vue` | `67bc97cd1ebb0a15909b25257fbf2e1cf2ad6c4ed437ddf5e98fdd8049dd189e` |
| `src/components/support/conversation-thread.vue` | `ebe2f09a608b5c1dcea93746e4d8b1960633612c0a603edfcdd80598c6101274` |
| `src/components/team/invite-detail-sheet.vue` | `31ea1bb94d9b2a2f2f67030933f157b0dc529ddfa9809ffc956959ab65ed0262` |
| `src/components/team/share-channel-sheet.vue` | `505914f21cd87b7b642e473fd0c8cad3bca70b1050bd2258e7f2035009faf54e` |
| `src/components/team/share-poster-sheet.vue` | `840d2edd57cf74e9115c8abd015f4d2a2bfe1e9d5564051a1a885788e3858b54` |
| `src/components/tradein-sheets.vue` | `ff78bd9f6334277a8ebc12e987cdd305cfa796f896e211e24cd778036d3acecb` |
| `src/components/trial-claim-sheet.vue` | `9ecf2ea531b060bd23ef72ae079797c66e2f528df9344f19821969ad2db2b64d` |
| `src/components/ui/nx-sheet.vue` | `d96da0f2ea0db25f6e7b89554adc1ae2397e10ee012849e28cdd2607bf83d49e` |
| `src/components/voucher-claim-sheet.vue` | `94587774b7a8efb109f077110bda71fc18dbe0d1f2e98bd737a19bfeab6eddeb` |
| `src/pages/globe/globe.vue` | `ec4f2a81fcd17ae1eeca0f49a08df8f79e868a27bffa84f3effeb3703aec0519` |
| `src/pages/me/notifications.vue` | `162abd46c16175061f5cadc3218e22d913b815125782202518d106afa178b1d6` |
| `src/pages/me/trial.vue` | `88d2f052cc5a12ae11e1213b38c3af36dd7892c9fca9ec7376ba15b9b095987d` |
| `src/pages/me/wallet-withdraw.vue` | `4c532908bb4d6f7f93a82bb0670517b1f05ac3ff601bea5b954286de82c75ece` |
| `src/pages/onboarding/intro.vue` | `9cac24ef6f53ce8e6ccceda84f2670aba94148b5abe14e358eb1e3209bc07ae2` |
| `src/pages/support/chat.vue` | `051df70e9f70d951fd694ae65dd3f78abbcbe1685d4c12e486844144fcc67a5d` |
| `src/pages/team/network.vue` | `0b5a2f7ec9f26bf90d034e89912dd133f376166fb3a393810495da9e4e10cfbd` |
| `src/styles/message-center.css` | `cae9b4793fb2831c7bb05df94ad3e59c02efe046669a876ce7d70ac33afbf564` |
| `src/styles/tokens.css` | `53d79077b53ed1010832b43efdb34db60f4d81f1edb0bb401688be5676252fe6` |

报告与[主审查报告](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-overlay-safe-area.md)合并时，静态9/10、上述限定范围runtime记录、pending和已排除诊断必须分栏保留。不得将未实景状态自动改成通过。
