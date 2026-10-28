# R16 独立视觉 A：立即冻结 / READY

冻结 2026-10-27T14:26:07.952Z。实际入口 **index-CCvSPlak.js**；全局 **index-DPMvPy7r.css**，首页动态 **index-C4EufXXG.css**。官方CUA Chrome4，仅自有5254/5274。源代码和R17在研改动不等于本次运行。没有修改产品、构建、运行测试或提交。

**READY，允许构建R17。** 用户停止指令后没有新增页面、截图或矩阵；仅汇总现有REPL、保存报告、将自有5274模式还原off及关闭本人标签。所有QA服务保持运行。当前结果是限定范围，不是整轮/全站通过。

[完整冻结JSON](runtime-r16-frozen.json)：26条原始读回、18张已保存截图，保留REPL。先前[福利阶段记录](benefits-stage-r16.md)保留为阶段历史，其中“checked待验”已由下表后续实证补齐。

## 仅已有证据的分数

| 项目 | 分数/10 | 已证明范围 |
| --- | --- | --- |
| 未领取小领取右下 | 9.2 | 320/390 VI浅、ZH暗八格中的未领取：根44，trial-cta__surface/LiquidGlass32，短文案右下；未点击领取。 |
| active整卡无CTA | 9.1 | 同4组合active均CTA0、role=button/tabindex0/完整aria；320ZH实际Enter进入/pages/me/trial。 |
| 双卡等高/118机图 | 9.2 | 八格逐格等高，art及image均118×118；仅available/active，不覆盖capacityFull/grace/ended/converted。 |
| floor对齐/悬浮 | 9.2 | floor在art内；320VIactive实采4.3066s/324个DOM帧，中心差约-0.0104px稳定，imageY-4..0、floorScale.9..1，均4.2s。不是GPU FPS或连续视频。 |
| 签到checked紧凑/未签到原布局 | 9.2 | 用户明确授权独立5254一次模拟签到；320VI浅原未签到右上81.25×44，checked文本空、svg18、根44、完整aria；390ZH暗checked同44/18。 |
| wallet常规金额 | 9.2 | 320VI浅30px，390ZH暗36px；$52,800.64完整、边距正常。 |
| wallet长金额 | 9.1 | QA-only $1,234,567,890.12：320VI浅25.7014px，390ZH暗32.0362px；单行完整无横溢。明确长额不是所有状态30–36的证明。 |
| wallet320零/未知/原恢复 | 9.2 | 320VI浅有效零$0.00/30px，冷启动503无快照—/30px；off后原资金按钮恢复$52,800.64。 |

## 福利实景与几何

八格均为实际页面，组合为320/390 × VI浅/ZH暗 × available/active；不存在capacityFull混签。

| 组合 | 未领取双卡高 | active双卡高 | 图 |
| --- | --- | --- | --- |
| 320VI浅 | 204.33 | 219 | [未领](r16-benefits-unclaimed-vi-light-320.png) / [active](r16-benefits-active-vi-light-320.png) |
| 390VI浅 | 211.33 | 225.33 | [未领](r16-benefits-unclaimed-vi-light-390.png) / [active](r16-benefits-active-vi-light-390.png) |
| 390ZH暗 | 211.33 | 206 | [未领](r16-benefits-unclaimed-zh-dark-390.png) / [active](r16-benefits-active-zh-dark-390.png) |
| 320ZH暗 | 204.33 | 219 | [未领](r16-benefits-unclaimed-zh-dark-320.png) / [active](r16-benefits-active-zh-dark-320.png) |

每格两卡等高、art/image118×118，短领取为32可见/44命中。active独立CTA0，实际Enter到试用详情。floor在art内，同水平中心；4.3066秒324帧仅是DOM几何/transform实际采样，不声称视频全过程无掉帧或物理GPU性能。图片/阴影均4.2s，图片Y -4..0、阴影scale .9..1，floor中心偏差约.01px且不漂移。

**容量满旧失败继续OPEN。** 用户连续指出capacityFull长越文拉高，此状态本轮未拍，不能因普通八格9分而关闭。R17短说明/短管理/去重复无需付款、118图保留必须独立补图，不预签源代码。

## 签到已补

用户在本任务明确授权后，仅5254“模拟数据、不连接真实服务”执行一次原签到。未领取按钮原右上81.25×44；之后checked无可见长文、svg18、根44，完整越文aria保留。390ZH暗同44/18。[未签到](r16-checkin-unchecked-vi-light-320.png) / [checked VI320](r16-checkin-checked-vi-light-320.png) / [checked ZH390](r16-checkin-checked-zh-dark-390.png)。只签本地模拟可观察UI，不是真实奖品或正式服务到账。

## 钱包已完成与不能追认的部分

- 常规[320VI浅](r16-wallet-normal-vi-light-320.png)30px、[390ZH暗](r16-wallet-normal-zh-dark-390.png)36px，52,800.64完整。
- QA长额[320](r16-wallet-long-vi-light-320.png)25.7014px、[390稳定图](r16-wallet-long-zh-dark-390-settled.png)32.0362px，单行完整、可读、无横溢。**长额是自适应例外，不写成所有状态30–36。** 合成仅响应副本walletUsdt一个字段，不是生产余额或业务金额一致性验收。
- 320[零额](r16-wallet-zero-vi-light-320.png)实际$0.00、[未知](r16-wallet-unknown-vi-light-320.png)实际—；未知off后原资金重试回52800.64。曾有zero模式仍旧长额的旧快照读回，保留为探测记录；普通新URL导航后实际GET200与balance-zero响应标头及正确PNG已确认，不误报产品零值bug。
- **390零额只完成DOM读回$0.00/36px，没有保存截图目检，不能追认为视觉通过；390未知尚未执行。** 后续只补必要这两帧/恢复，不重跑完整钱包矩阵。
- 首张390长额是入场暗帧，排除对比评分，以settled替代；不覆写历史图片。

## R17待验队列，完整保留

| 项目 | 当前状态与下一步 |
| --- | --- |
| capacityFull | **OPEN**。用户明确报告R16容量满长越文拉高；A本轮未进入此状态，不沿用普通8格评分，不给未经实景的分数。 R17 embedded-only短说明/短管理、去重复无需付款；118图保留，独立320VI至少实景。 |
| 新导航<=374 | **N/T new R17**。只图标放大+选中短回弹未构建到R16；旧文字导航不是本轮回归。 R17新指纹下独立复验选中/点击/回弹/减少动态，范围按主线程通知。 |
| Ref/code R16修复 | **N/T in R16; old R15 8.6 OPEN**。本轮尚未进入R16邀请页，不能用新source或R15分代签。 正常authed、合法可只读unauthed、error→原按钮恢复；实际上下滚/根无灰条、精简三语/小主CTA、归因奖励及法律入口保留。用户已授权自有5254/5274原设置退出合成账户；尚未执行，不新账号/不接受协议/不伪造store。 |
| wallet390零额 | **DOM ONLY, visual N/T**。已读$0.00、36px及几何；用户中断前尚未保存/目检该状态截图。 R17只补1张390暗零额稳定帧，不重跑已过完整矩阵。 |
| wallet390未知/恢复 | **N/T**。未切入390无成功快照故障。 R17冷启动wallet-funds→—截图、off后原资金重试；不拿320代签。 |
| staking FAQ | **N/T**。R15暖运行目标未出现，R16尚未补。 5274 exchange-config，保留staking正常，冷启动目标FAQ，不用外层错误代签。 |
| deposit历史 | **N/T**。R16未进入目标卡。 5274 deposit-history，仅receipts故障、USDT通道，保留地址/Cregis正常；不提交入金。 |
| network/tree | **N/T separately**。R16未到达两个独立消费者。 5274 network mode下分别实景各自32面44hit/布局/原读取恢复。 |
| wallet收益/security原恢复 | **N/T remaining behavior**。R15有视觉证据但未有最后稳定恢复清除；R16尚未补。 定向wallet-overview/commissions及security，off→原恢复稳定读回；不重复已过全部错误卡。 |
| 旧wallet-cards列表 | **N/T route gap**。R15实际重定向wallet-cards-new；R16未新证。 只在合法可达入口出现后签，不拿绑定页代测。 |
| repurchase historyError/无下一页 | **N/T boundary**。只读UI无historyError入口，账单/奖励mock nextPage:null。 不调用store、执行资金命令或伪造分页造状态；主线程若无合法fixture则保持边界。 |

R16 Ref尚未进入新构建正常authed/unauthed或error恢复，R15原8.6为历史OPEN，不是本轮新评分。用户已授权仅自有合成账户原设置退出；本轮尚未执行，不通过伪造store、新账号或条款接受造状态。

<=374新图标导航/选中短回弹属于R17 **未验**，当前旧文字导航不误报为R16回归。正式后端、物理APP安装/键盘及最终H5均不由此代签。

自有5274已off；5254只保留用户授权后的本地模拟checked状态，不反向造业务记录。未停QA服务、未操作用户5237/5251。下一轮以R17实际入口补增量，旧报告/截图/REPL全部保留。
