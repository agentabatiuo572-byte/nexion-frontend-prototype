# T7 · NexGrid 改名全路由独立走查报告(2026-07-22)

本页判定目标=全站用户可见层品牌词 0 残留 + header logo 已换新(来源:change 提案 docs/changes/2026-07-22-nexgrid-rebrand.md 明写)。

- **走查方**:独立端到端走查 agent(非实现方)
- **对象**:`D:\WORKS\PLAN\Nexion-uniapp` dev server `http://localhost:5173`(探活 localhost=200、[::1]=200,未重启)
- **方法**:playwright(工程自带)逐路由访问 `/?nx_device=off#/<route>`(绕 device-shell iframe),networkidle+700ms 后取 `document.body.innerText` 匹配 `/nexion/i`;console error 逐页收集(favicon 除外);登录态=清 storage 后的默认 demo 账号(auth-guard-verify 同款前提:默认已认证);storage 注入用 uni 包装 `{type:"object",data:X}`(locale 键 `nexgrid-locale-v1`、theme 键 `nexgrid-theme-v1`)

## 总结论

| 项 | 结果 |
|---|---|
| 可见文本层品牌词残留 | **0 处**(88/88 路由 + 三语横切 15 扫 + 带参复扫 12 扫,`/nexion/i` 全 0 命中) |
| header logo | **已换新** ✅ dark 显 `header-logo-dark.png`、light 显 `header-logo-light.png`(`/static/img/brand/`),截图肉眼确认字样为 **NexGrid** |
| 浏览器 tab 标题 | 不含 Nexion ✅(实测全路由 `document.title` = 空串,见附注 ①) |
| console error(排除环境假象后) | **0**(7 条均为走查器自身资源耗尽伪象,新浏览器复扫即 0,见「环境假阴排除」) |
| 已知欠账(不算 fail) | 旧 NEXION 像素设备渲染图运行时出现在 **store 商品列表 + store 详情** 两个位置,共 3 个文件在用(清单见下) |

## 环境假阴排除(fail 先证伪环境)

1. **探活**:localhost 与 [::1] 均 200,未重启 dev server。
2. **iframe**:全程 `?nx_device=off` 直渲 app 本体,无 device-shell 外壳干扰。
3. **走查器自身崩溃两次**:同一浏览器上下文连续 70+ 次整页 reload 后出现 `net::ERR_INSUFFICIENT_RESOURCES`(动态模块 fetch 失败→页面空白),先后波及 me/help、me/support-tickets、support/messages 并最终 wedge 浏览器。**根因是走查器资源耗尽,不是应用 bug**——换新浏览器复扫上述 3 页:内容完整渲染(609/712/76 chars)、console 0、残留 0。
4. **薄页(<40 chars)9 页逐一处理**:带参页(store/detail、earn/device-detail、me/rewards-list、support/chat)补真实参数复扫全部出实内容;store/orders(30ch)与 store/order-detail(18ch)为新 demo 账号无订单的合法空态/not-found 面(订单 id 不存在可带,该空态即用户可达面);均 0 残留。
5. **等待不足**:networkidle + 700ms(复扫 900ms),与既有 verify 脚本同量级。

## 逐路由结果(88/88,主扫 · locale=en · 默认 demo 登录态)

| 路由 | 残留命中 | console err | 备注 |
|---|---|---|---|
| pages/index/index | 0 | 0 |  |
| pages/entry-surfaces/index | 0 | 0 |  |
| pages/entry-surfaces/signed | 0 | 0 |  |
| pages/entry-surfaces/h5 | 0 | 0 |  |
| pages/entry-surfaces/white | 0 | 0 |  |
| pages/onboarding/intro | 0 | 0 |  |
| pages/onboarding/estimator | 0 | 0 |  |
| pages/onboarding/connect | 0 | 0 |  |
| pages/onboarding/terms | 0 | 0 |  |
| pages/register/register | 0 | 0 |  |
| pages/register/success | 0 | 0 |  |
| pages/login/login | 0 | 0 |  |
| pages/session/kicked | 0 | 0 |  |
| pages/store/store | 0 | 0 | 旧名图×3(欠账位) |
| pages/store/detail | 0 | 0 | 薄页(29ch)· 已带参复扫 |
| pages/store/checkout | 0 | 0 |  |
| pages/store/orders | 0 | 0 | 合法空态(30ch)· 复扫同 |
| pages/store/order-detail | 0 | 0 | not-found 态(18ch,demo 无订单 id 可带) |
| pages/store/bundle | 0 | 0 |  |
| pages/earn/earn | 0 | 0 |  |
| pages/earn/device-detail | 0 | 0 | 薄页(19ch)· 已带参复扫 |
| pages/compute-share/download | 0 | 0 | H5 自动跳转 → /pages/me/devices(页面自身逻辑) |
| pages/me/me | 0 | 0 |  |
| pages/me/wallet | 0 | 0 |  |
| pages/me/wallet-topup | 0 | 0 |  |
| pages/me/wallet-withdraw | 0 | 0 |  |
| pages/me/devices | 0 | 0 |  |
| pages/me/profile | 0 | 0 |  |
| pages/me/security | 0 | 0 |  |
| pages/me/kyc | 0 | 0 |  |
| pages/me/goals | 0 | 0 |  |
| pages/me/wallet-bills | 0 | 0 |  |
| pages/me/wallet-exchange | 0 | 0 |  |
| pages/me/wallet-nex | 0 | 0 |  |
| pages/me/wallet-cards | 0 | 0 |  |
| pages/me/wallet-cards-new | 0 | 0 |  |
| pages/me/receipts | 0 | 0 |  |
| pages/me/rewards | 0 | 0 |  |
| pages/me/rewards-list | 0 | 0 | 薄页(27ch)· 已带参复扫(usdt/nex 两 cat) |
| pages/me/proof | 0 | 0 |  |
| pages/market/market | 0 | 0 |  |
| pages/team/team | 0 | 0 |  |
| pages/team/commissions | 0 | 0 |  |
| pages/team/binary | 0 | 0 |  |
| pages/team/agent | 0 | 0 |  |
| pages/team/rank | 0 | 0 |  |
| pages/team/rank-how | 0 | 0 |  |
| pages/team/leaderboard | 0 | 0 |  |
| pages/team/leadership-pool | 0 | 0 |  |
| pages/team/leadership-pool-how | 0 | 0 |  |
| pages/team/network | 0 | 0 |  |
| pages/team/quota | 0 | 0 |  |
| pages/team/tree | 0 | 0 |  |
| pages/team/unilevel | 0 | 0 |  |
| pages/team/unilevel-how | 0 | 0 |  |
| pages/team/binary-how | 0 | 0 |  |
| pages/team/commissions-how | 0 | 0 |  |
| pages/genesis/genesis | 0 | 0 |  |
| pages/genesis/holder | 0 | 0 |  |
| pages/genesis/marketplace | 0 | 0 |  |
| pages/genesis/how-it-works | 0 | 0 |  |
| pages/staking/staking | 0 | 0 |  |
| pages/staking/how-it-works | 0 | 0 |  |
| pages/daily/daily | 0 | 0 |  |
| pages/missions/missions | 0 | 0 |  |
| pages/events/events | 0 | 0 |  |
| pages/globe/globe | 0 | 0 |  |
| pages/developer/developer | 0 | 0 |  |
| pages/search/search | 0 | 0 |  |
| pages/me/achievements | 0 | 0 |  |
| pages/me/help | 0 | 2(环境伪象) | 复扫:609ch · 0 err · 0 残留 |
| pages/me/support | 0 | 0 |  |
| pages/me/support-tickets | 0 | 2(环境伪象) | 复扫:712ch · 0 err · 0 残留 |
| pages/support/messages | 0 | 3(环境伪象) | 复扫:76ch · 0 err · 0 残留 |
| pages/support/chat | 0 | 0 | 薄页(15ch)· 已带参(type=ai)复扫 |
| pages/me/language | 0 | 0 |  |
| pages/me/notifications | 0 | 0 |  |
| pages/me/preferences | 0 | 0 |  |
| pages/me/risk-disclosure | 0 | 0 |  |
| pages/me/trial | 0 | 0 |  |
| pages/me/wallet-repurchase | 0 | 0 |  |
| pages/me/wallet-repurchase-how | 0 | 0 |  |
| pages/me/wallet-exchange-how | 0 | 0 |  |
| pages/me/wallet-withdraw-tracking | 0 | 0 |  |
| pages/trust/trust | 0 | 0 |  |
| pages/trust/nex | 0 | 0 |  |
| pages/ref/code | 0 | 0 |  |
| pages/tx/hash | 0 | 0 |  |

## 三语横切(zh / en / vi × 五 tab 主页)

locale 注入:`localStorage["nexgrid-locale-v1"] = {type:"object",data:{code,userSet:true}}` + 整页刷新(键名已在 `src/store/locale.ts` 确认)。

| 路由 | zh | en | vi |
|---|---|---|---|
| pages/index/index | 0 残留 · 0 err | 0 · 0 | 0 · 0 |
| pages/earn/earn | 0 · 0 | 0 · 0 | 0 · 0 |
| pages/store/store | 0 · 0 | 0 · 0 | 0 · 0 |
| pages/team/team | 0 · 0 | 0 · 0 | 0 · 0 |
| pages/me/me | 0 · 0 | 0 · 0 | 0 · 0 |

## 带参/薄页复扫(新浏览器,12 扫)

| 路由(带参) | innerText | 残留 | err |
|---|---|---|---|
| pages/me/help | 609ch | 0 | 0 |
| pages/me/support-tickets | 712ch | 0 | 0 |
| pages/support/messages | 76ch(空收件箱态) | 0 | 0 |
| pages/support/chat?type=ai | 103ch | 0 | 0 |
| pages/store/orders | 30ch(合法空态) | 0 | 0 |
| pages/me/rewards-list?cat=usdt | 316ch | 0 | 0 |
| pages/me/rewards-list?cat=nex | 99ch | 0 | 0 |
| pages/store/detail?id=stellarbox-s1 | 954ch | 0 | 0 |
| pages/store/detail?id=stellarbox-pro-v2 | 50ch(资格门/售罄态) | 0 | 0 |
| pages/store/detail?id=stellarrack-p1 | 953ch | 0 | 0 |
| pages/store/detail?id=stellarrack-p2 | 49ch(资格门/售罄态) | 0 | 0 |
| pages/earn/device-detail?id=phone-1 | 286ch | 0 | 0 |

## header logo + 主题截图证据

DOM 证据(每张截图同帧取):`.nx-logo-img--dark` src=`/static/img/brand/header-logo-dark.png`、`.nx-logo-img--light` src=`/static/img/brand/header-logo-light.png`;dark 主题只显 dark 变体、light 主题只显 light 变体(display 互斥正确)。肉眼确认四张截图 header 字样均为 **NexGrid**(绿/蓝新 logo mark + 文字)。

| 截图 | 路径 |
|---|---|
| Home · dark | `C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\27efd79e-c876-472f-bf4f-81f4726b6b26\scratchpad\t7-home-dark.png` |
| Store · dark | `C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\27efd79e-c876-472f-bf4f-81f4726b6b26\scratchpad\t7-store-dark.png` |
| Me · dark | `C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\27efd79e-c876-472f-bf4f-81f4726b6b26\scratchpad\t7-me-dark.png` |
| Home · light | `C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\27efd79e-c876-472f-bf4f-81f4726b6b26\scratchpad\t7-home-light.png` |

截图内容旁证:store 页文案已显 NexGridBox S1 / NexGridBox Pro / NexGridRack P1、me 页与 home 页无任何 Nexion 字样。

## 已知欠账 · 旧 NEXION 像素设备渲染图出现位置(不算 fail)

运行时全路由 DOM 实测(`<img>` src + uni-image background-image 双通道):

| 在用文件 | 出现路由 |
|---|---|
| `/static/img/products/nexionbox-s1-v4.png` | pages/store/store(商品卡);pages/store/detail?id=stellarbox-s1(详情渲染图) |
| `/static/img/products/nexionbox-pro-v2.png` | pages/store/store(商品卡;pro 与 pro-v2 共用此图) |
| `/static/img/products/nexionrack-p1-v2.png` | pages/store/store(商品卡;rack-p1 与 p2 共用);pages/store/detail?id=stellarrack-p1(详情渲染图) |

未在任何路由出现(源码 0 引用,仅存盘):`nexionbox-s1-ranking.png`、`nexionbox-pro-ranking.png`、`nexionrack-p1-ranking.png`(products/)、`nexionbox-s1-weekly.png`(marketing/)、`src/static/logo.png`(旧 logo,已无引用)。文件名含 nexion 属白名单(路径级标识未改名),此处只记像素欠账位置供 R6 重制后回归。

## 附注(观察项,不影响本页判定)

1. **`document.title` 全路由为空串**:`index.html` `<title></title>` 为空、`manifest.json` name 为空、src 无 title 设置逻辑。按本页判定口径(「不含 Nexion」)PASS;但 R7 AC1 写的是「浏览器 tab 标题/应用名 = NexGrid」,空 ≠ NexGrid,**R7 收口时需补 title**。
2. store 商品卡与详情图即欠账图,等 R6 生图重制后需在 header/商品卡/详情/(排行如启用)四位置回归。
3. compute-share/download 在 H5 环境按自身逻辑跳转 me/devices,属设计行为;该页 APP 端文案不在 H5 可达面内。

## 走查产物

- 结果数据:`scratchpad/t7-results.jsonl`(main 88 + locale 15 + rescan 12 + shot 4)
- 走查脚本:临时脚本已按任务要求清理;截图 4 张保留(路径见上表)
