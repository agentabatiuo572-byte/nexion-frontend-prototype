# APP r15 独立交互复审 B（按用户指令冻结）

**READY，可构建r16。当前动作已完成，旧包浏览停止。** 最后只保存已打开的320越文浅色slot并按Space关闭；没有扩展暗色或剩余分支。

**不是整包通过**：21个消费者中，17个在下列真实可达分支为9.2–9.3；ref读取按钮/恢复操作9.2，但恢复后的页面仍有 **8.7 P2 OPEN**；另3个消费者未触发，不签分。不得据本报告宣称21/21通过。

## 构建与方法

- 精确运行入口：`index-efmh8j2a.js` / `index-CqtM5MAW.css`，每次DOM测量断言当前入口。
- JS SHA256：`B71A62DA4B1DC16CAD841957EA7E4FB240D80377B5B3DD681432F1D2B8442D47`。
- CSS SHA256：`68979FF1B8B61F391ED057A0F6FCCF2766220D59B3AD8F29ED2B25D7F3192CCA`。
- 本人5252原mock；5272→5252精确GET故障代理；5262→5252只读库存响应代理。未访问其他审查员/用户端口。
- 全部浏览器操作经内置CUA Chrome。5252原E场景先完成；5272 READY后上游保持normal，只执行提供的set-mode.mjs、固定5272端口，off后在原失败页用原点击/Enter/Space恢复。没有重跑verify/verify-balance。
- 5272后段使用标准浏览器320×693手机viewport emulation，不写产品DOM/store。邀请灰条证据05–08是320×693桌面viewport；其原生条问题不以手机仿真自动隐藏滚动条的表现代签。
- 一些早期连拍/视口截图不稳定，保留原件但在JSON标记EXCLUDED；不参与视觉评分。后续有效截图以对应b/c、phone、settled文件及本表为准。17号误标light的原件实际dark，已排除，浅色使用17b。
- 动态CSS实际随每条运行路由加载并记录，不按主CSS相同推断组件不变；资源SHA清单另存。父线程已在源码做r16 WIP，但dist仍r15，当前源码不作为本包来源证明。

## 21消费者逐项范围

| # / 消费者 | 分数 | 实际分支与证据 |
| --- | --- | --- |
| 1 terms | 9.3 | 5272 terms模式，320VI浅暗；65×44根、32面、13/600/20、右下正常流，长文不压按钮。off后Enter原重试恢复正文；不点“已了解”。有效16b/17b。 |
| 2 store | 9.3 | store-catalog模式下硬刷新，无商品快照错误卡真实出现；92.875×44/32，Space恢复目录。18。之前5252保留快照尝试未代签此卡。 |
| 3 bundle | 9.3 | 不带activityId；目录E与bundle-policy独立失败都出现指定卡，Enter/Space各自原重试恢复。01/20。未动receipt写恢复、未选商品/下单。 |
| 4 wallet | 9.2 | 资金Space恢复、总收益44根上沿内2px点击恢复；释放详情以wallet-release单故障、Enter恢复。quiet32面/44根，长VI右下。02/19。**余额大字号是r16 OPEN，不在此分数中。** |
| 5 daily | 9.2 | 顶部daily-points、余额wallet-funds（points健康）、历史wallet-summary分别触发并原Enter恢复；31/21/22b。未签到/领奖/启用加成。慢读取期间顶部原按钮改成加载文案，不伪称当时仍有disabled按钮。 |
| 6 reward-published-guide | 9.2 | binary-how失败、Space原内容键恢复；玻璃填充/边缘/箭头可见，32面/44根、blur16。09。只签HTTP错误分支，语言fallback及unilevel独立入口未另签。 |
| 7 how-published-content | 9.2 | genesis/how-it-works的发布内容错误；原Enter恢复。10c。其他说明路线/语言fallback未另签。 |
| 8 commissions-how | 9.2 | 原E集体读取失败说明块、Enter恢复，玻璃32面/44根。11c。未将同一次E声称为每个规则源独立故障。 |
| 9 staking FAQ | **N/T** | 未出现目标卡：实际exchangeApi.fetchCaps读取`/api/config/exchange/caps`，当前exchange-config只故障`/api/config/exchange`。硬刷新后仍正常FAQ；已报告fixture路径缺口，不改源码/状态强造。转r16余项。 |
| 10 wallet-cards | **N/T** | cards模式真实进入后被现有cardBindingAvailable gate重定向wallet-cards-new。未以绑定页替代旧卡恢复消费者；未改能力标记、未填字段/发短信。 |
| 11 wallet-repurchase historyError | **N/T** | 用户已确认只读入口缺口：refresh()外层错误不等于refreshHistory()专属错误。未执行资金命令造状态，未签。 |
| 12 deposit-usdt-pane history | 9.2 | deposit-history只故障VietQR receipts，进入USDT通道，原地址/CR-77行保留；65×44/32 quiet，Enter后历史错误消失。23。非充值整页出口、不转账。 |
| 13 security | 9.2 | 原资料读取错误条、Enter恢复，65×44/32，右侧槽位/长VI保留。13c。未更改安全资料。 |
| 14 rewards | 9.2 | wallet-summary和vouchers分别触发汇总右槽，原Enter/Space恢复。24/30。未领奖。 |
| 15 rewards-list | 9.2 | usdt账单和voucher分类分别故障/恢复；正确分类新挂载后确认标题，未把USDT缓存当voucher。25/29。nex分类和补页未另签。 |
| 16 orders | 9.2 | 普通orders源读取失败、原Enter恢复；92.875×44/32。27。其他订单来源未分别故障，不付款/取消。 |
| 17 order-detail | 9.2 | 正常先读DEMO-ORDER-004，再启orders、离开/返回触发原详情刷新错误，保留既有已激活订单；Space原重试恢复。28。不是无效ID/找不到出口。 |
| 18 ref/code | **按钮9.2；整页8.7 OPEN** | 合法UVELDEMO：错误、Enter慢读、disabled=true/tabindex=-1、65×44/32、正常恢复均真实；恢复后document clientWidth305对innerWidth320，右侧15px原生灰条，实际滚0→66.67。05–08。长VI/主CTA新增要求归r16，未注册/接受条款/点主CTA。 |
| 19 wallet-bills | 9.2 | wallet-bills模式，首次读取quiet恢复，保留32可见面、扩44根，Enter恢复。26。无nextPage，补页错误N/T。 |
| 20 team/network | 9.2 | 实际E读取错误、Enter恢复；独立86.104×44/32右槽，越文不压按钮。14b。 |
| 21 team/tree | 9.2 | 同源数据、不同页面独立错误/Enter恢复；86.104×44/32右槽。15b。 |

以上只对实际出现的卡签分。17个通过消费者中未触发的语言fallback、个别数据源、其他分类和补页，不随组件评分扩张成全覆盖。所有HTTP/页面均为本地合成模拟；源正常状态、认证、订单和金额不代表生产服务。

## 新P2与r16增量

- [B-R15-P2-01原报告](finding-B-R15-P2-01-invite-scrollbar.md)：ref恢复后原生灰条，**8.7 OPEN**，父线程已接收，r15产物未改。
- r16待测：钱包余额常规/长额/零额及无快照边界；ref三语紧凑布局、恢复后可真实上下滚到底、法律入口和已登录“进入UVEL”CTA44及route。不得注册或接受协议。
- 用户最新r16新增：未领取的小领取按钮放右下（不是删除）；已领取无独立CTA、整卡进入；机器图不缩、投影同容器；福利两卡变短；checked签到改紧凑check按钮。r15旧图/旧分不覆盖这些要求。
- 其余未到达恢复卡在r16继续，只补剩余项，不重跑整个历史矩阵。复投historyError和无下一页分支仍需明确N/T，不用业务写入造数据。

## 当前slot修复：仅最后已打开的浅色

独立5262实景入口同efmh8j2a：**320VI light材质/几何9.3，Space关闭9.2**。32号图中不再直接落在灰遮罩上，panel为`sas-panel nx-glass-sheet`，实际fill为白色98%加渐变，`border-radius:16px 16px 0 0`；panel320×302.25，top391.08，底部padding38，最后库存行bottom655.33至693.33边界38px；close44×44、padding4形成36可见圆面、SVG16。实际Space关闭后panel/close不存在，未点购买/激活。

**R15暗色材质、关闭外沿和遮罩取消未在本轮完成**：按用户“当前动作后立即冻结”停止，不继承r14对应通过结论。旧r14浅色误签撤回记录保留；本次只关闭浅色材质范围，不对slot整矩阵预签。

## 原始证据与停止边界

- [错误卡运行时与操作JSON](runtime-r15-interaction-b.json)
- [slot运行时JSON](runtime-r15-slot-interaction-b.json)
- [实际观察到的构建资源SHA](observed-build-resources-sha256.json)
- [slot当前浅色图](32-slot-current-r15-light-vi-320.jpg)

截图均为原始CUA输出，无裁图/重绘。EXCLUDED原件保留但不作签核。模式脚本记录写入JSON；没有逐请求DevTools HTTP抓包，因此不把Jason的56组HTTP验证冒称B实跑，也未执行其verify脚本。

冻结后主实景tab1733372966及slot tab1733372976已关闭；两个控制tab不再操作，关闭接口出现归属限制，未强制关闭或触碰其他标签。5272已off，上游normal，5262/5272及5252服务保留给父线程/r16。未改产品源码、未构建、未跑测试、未commit/push；原H5和r14冻结报告不动。

**最终：READY FOR R16。r15存在上述OPEN/N/T，不能用于整包≥9签核。**
