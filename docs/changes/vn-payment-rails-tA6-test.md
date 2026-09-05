# A6「提现地址换绑」独立验收报告(tester: test-A6)

## 复验轮(2026-07-24 · 修复轮落地后)

修复方修完 4 点后独立复验(全新 default 账号,整页 reload,console 0)。**4 点全 PASS,上轮 C6 FAIL 已修复。A6 总判定 PASS。**

| 点 | 判定 | 运行时铁证 |
|---|------|-----------|
| 1 tracking reason 修复(上轮 FAIL) | ✅ PASS | 换绑生效→`rebindClearFreeze()`→UI 提交 $1000→tracking 页 WD-20260724-8067「人工审核中」区**三条 bullet 全渲染**:「· 新绑定地址处于保护期 / · 首次提现需人工确认 / · 提现地址更换未满 7 天,大额提现需人工审核」(截图 r2-c1-tracking-3reasons-bottom)。存储 `riskReasons=["new-address-hold","first-withdrawal-review","new-address-large-amount"]` ⟺ 渲染三条 1:1,上轮被 `.filter(Boolean)` 静默吞的第三条现在在。根因已收口:三渲染源(wallet-withdraw 预览:386 / tracking:119 / wallet 弹层:139)统一 import `@/lib/risk-reason-text` 的 `riskReasonLines()` 单源 dict(含 `new-address-large-amount`+`rebind-freeze` 扩展码)。顺带 wallet 页审核弹层实景打开正常(截图 r2-c1-wallet-pending-sheet):其 reason 源是**簇评估** `evaluateAccountCluster().reasons`(非 withdrawal 码),当前账号簇 clear 故无扩展 bullet——`new-address-large-amount` 语义上不进簇层,"三源同源"指共用同一函数 dict(代码铁证),非同样三条,符合设计 |
| 2 冻结下沉评估层(HIGH-1) | ✅ PASS | **主证**:换绑生效冻结期内,console 绕 UI 直调 `evaluateWithdrawal('default','USDT-TRC20',<新址>,24856,100)` → `route=freeze / canSubmit=false / reasons 含 rebind-freeze`,且 `latestWithdrawal=null`、余额未动(不建单不扣钱)。**对照证**:`rebindClearFreeze()` 后同址同调 → `route` 降为 manual、`canSubmit=true`、`rebind-freeze` 从 reasons **消失**——证明 `rebind-freeze` 分支正是那道抬 route/闭 canSubmit 的评估层硬门(UI 灰按钮之外的二层 server-canonical guard,console 直调不可绕);逻辑落在 `withdrawal-eligibility.ts:64-77`(`isRebindFrozen(binding.freezeUntil)` → `worse(route,"freeze")`) |
| 3 网络随绑定只读(HIGH-2) | ✅ PASS(上轮已确认,保留) | 提现页网络行只读展示绑定网络「USDT (TRC20) · 手续费最低」+ 说明「网络随绑定地址确定;如需使用其他网络,请更换提现地址」,无选择器 chip,无法造跨链矛盾单(`wallet-withdraw.vue:113-121` 只读派生 `t.addrRebind.networkFollowsBinding`) |
| 4 startRebind 阳光路径不受影响 | ✅ PASS(上轮已确认,保留) | 阳光换绑快速复走一遍仍通:form→开始验证→验证视图($1/平台地址/QR/倒计时/三步)→`rebindVerified()`→「新地址已生效」→回提现页地址行换新 `TREVERIF…GHJK55`+冻结横幅 23:59:55 真倒计时,startRebind 失败态修复未回归正常路径 |

**console**:复验轮全程 page errors=0、console error/warn=0(多点采样,过滤 devtools/vue 提示后)。

**终态(已复位)**:default 账号 activeBinding=`TREVERIFYROU…`(usdt-trc20)、freezeUntil=null、lastRebindAt=null、rebindOrder=active(终态不阻塞)。**残留(无 dev 驱动可清,如实登记)**:本轮点1 提交产生的在途单 WD-20260724-8067($1000,review-pending,manual 不自动推进)+ 余额已扣至 $23857.56 + 风险披露已 accepted + locale=zh(userSet)——后续测试需干净态请清 storage 重建账号。浏览器隔离会话已关闭,无孤儿进程;截图仅存 scratchpad。

---

## 首轮(2026-07-24)

- 日期:2026-07-24 · 环境:http://localhost:5173 `?nx_device=off` · agent-browser 隔离会话(nx-ta6)
- 方式:黑盒运行时驱动。账号从**清空 storage 的全新 default** 起步,KYC 走真实 UI 点击(`wallet-topup?kyc=1` 三步);换绑服务端事件走 console `__nxDev.rebindVerified()/rebindWrongSource()/rebindClearFreeze()`;语言注入 `nexgrid-locale-v1`(uni 包装 `{type:'object',data:{code,userSet}}`,注入后必须**真重载**——同 URL `open` 是 hash 级导航不触发 reload)。
- 截图证据:scratchpad `…/scratchpad/ta6/`(c1b-kyc-gate / c1a-withdraw-addr-row / c2-verify-view / c2-success / c2-freeze-banner / c4-wrong-source / c4-cancel-dialog / c5-cooldown-toast / c6-1000-reason-line / c6-tracking-manual-review / c3-inflight-blocked / c8-vi-freeze-banner)。

## 总判定:7 PASS + 1 FAIL(C6 部分:路由对、tracking 页 reason 丢行,P1)

| # | 标准 | 判定 | 关键证据(全部运行时实测) |
|---|------|------|--------------------------|
| 1 | 提现页地址行 + 未 KYC 引导 | ✅ PASS | 地址行 `T4EEB83F2C…E74BEB`(中段省略)+「更换」入口;未 KYC 进换绑页 → 页内 KYC 引导态(MiCA/FATF 话术 + 「完成 KYC-Express($1)」CTA,URL 不弹回、不白屏,CTA 正确导航 `wallet-topup?kyc=1`) |
| 2 | 换绑阳光路径 | ✅ PASS | form:新地址输入 + 三网络 chip(TRC20 推荐/BEP20/ERC20)+ 安全提示「冻结 24 小时;每 7 天…」;开始验证 → 验证视图:$1 大字(绿)、平台地址 `TF8E6CAA…B267A`、QR 21×21 点阵**三定位角清晰**(截图)、倒计时 29:42→29:39 真跳动、三步指示(1✓/2 进行/3 待);`rebindVerified()`→true → 三步动画 → 「新地址已生效」成功态;回提现页:地址行/头部 chip 均已换新 `TNEWADDRTE…GHJKL1`,冻结横幅「…安全冻结中 · 剩余 23:59:33→23:59:30」hh:mm:ss 真倒计时,提交按钮 `aria-disabled=true` + 「地址更换后安全冻结中,暂不可提现」;**刷新后** 横幅 23:59:16 连续递减(freezeUntil 持久,非重开) |
| 3 | 异常1 在途提现单 | ✅ PASS | 用 C6 的 $1000 在途单(review-pending ∈ 在途)复用验证:「更换」入口 `aria-disabled=true` + 置灰 bg `rgb(31,31,31)` + 原因行「有提现处理中,完成后才能更换地址」;点击不导航(URL 不变)且弹同文案 toast。※偏差说明:任务写"小额在途",实测用 $1000 审核单——拦截判定是状态基(submitted~processing),与金额无关;另避开「每日限额 1 笔」使 C6 可测 |
| 4 | 异常2 来源不符 | ✅ PASS | `rebindWrongSource()`→true → 红字「本次转账来自其他地址,验证未通过。请从新地址转出 $1 后重试。」(危险色横条+图标,截图);规则行「验证转账必须从要绑定的地址发出」常驻;窗口不中断(29:45→29:43 连续);**可重试实证**:同窗口 `rebindVerified()` 直接成功;「取消更换」出口:确认弹窗「取消本次更换?验证单将被取消,当前提现地址继续生效」→ 确认后单据 cancelled、回 form 视图 |
| 5 | 异常3 频控 | ✅ PASS | 成功换绑后(不清状态)立即再发起 → toast「每 7 天最多更换一次提现地址」,不建单。※任务括号里"先 rebindClearFreeze() 再发起"按字面走**不会**触发拦截——该工具按注释设计「清除冻结 + 频控锚点」,实测清后再发起直接进入验证窗口(这正是给 tester 的复位语义,非 bug);频控发起拦截与 24h 冻结互相独立,冻结不拦「发起换绑」只拦「提现提交」 |
| 6 | 异常4 账龄大额 | ❌ FAIL(部分,P1 展示缺陷;路由本身 ✅) | 预提交对比:$500 → 风控提示无账龄行;$1000 → 新增「提现地址更换未满 7 天,大额提现需人工审核」;提交 $1000 → WD-20260724-5243 status=review-pending,tracking 页「人工审核中/提现正在等待账户和地址审核,不会自动推进到打款」manual 话术 ✓;**BUG**:存储 `riskReasons=["new-address-hold","first-withdrawal-review","new-address-large-amount"]`,tracking 页只渲染前两条(「新绑定地址处于保护期/首次提现需人工确认」),A6 专属的账龄大额 reason 被静默丢弃 |
| 7 | 换号不继承 | ✅ PASS | 注入 `tester-b@nexgrid.dev` 重载:walletPaired=false、无冻结横幅、无旧地址、无在途提示,提现页/换绑页均为 KYC 引导态;切回 default:绑定 TVILOCAL…、in-flight review-pending 全部原样恢复 |
| 8 | 三语抽查 + console | ✅ PASS | zh:全流程截图(form/验证视图/红字/成功/冻结横幅/频控 toast)无英文残留;vi:注入重载后首屏即 vi,全链「Đổi địa chỉ rút tiền / Bắt đầu xác minh / Giao dịch đến từ một địa chỉ khác… / Địa chỉ mới đã có hiệu lực / Địa chỉ rút tiền đã thay đổi, đang đóng băng bảo mật · còn 23:59:55」,拉丁词宽扫仅越南语无变音片段(假阳性),0 英文残留;console error/warn = 0(多点采样:C1b 后、C4 后、终检) |

## FAIL 复现(C6 · P1)

1. 已 KYC 账号完成一次换绑(账龄 <7 天)、清冻结;
2. 提现页输入 ≥$1000 → 提交(首提会先被风险披露页拦:内滚容器滚到底 + 勾选「我已阅读」+「我已知悉 — 继续」);
3. 进入 tracking 页(`wallet-withdraw-tracking`)→ 「人工审核中」reason 列表只有 2 条,**缺**「提现地址更换未满 7 天,大额提现需人工审核」。
- 根因(回源已证):`src/pages/me/wallet-withdraw-tracking.vue:116-117` 只用 `t.wallet.riskReasons` 字典映射 code,未像 `wallet-withdraw.vue:391-393` 那样 merge `"new-address-large-amount": t.addrRebind.reasonNewAddressAge`,`.filter(Boolean)` 把未命中 code 静默吞掉。典型「同 code 两渲染源只修一处」。修法:tracking 页同样 merge 该键(三语 key 均已存在)。
- 运行时铁证:pinia `app.latestWithdrawal.riskReasons` 含 `new-address-large-amount`,页面 bullets 仅 2 条。

## 未覆盖项(验收标准外,如实登记)

- 30min 超时 expired 态与「重新发起」CTA(标准未列);非法地址 inline 报错;BEP20/ERC20 网络的实际换绑链路(三网络仅验证展示+可选,实换走 TRC20);en 语言(标准只点名 zh/vi)。
- 范围外观察:KYC-Express 完成视图(`wallet-topup` 页,非换绑页)zh 下有英文标签「Paired wallet / Network / Compliance ID / Verified at」——属 A6 范围外页面,移交对应负责人判定。

## 终态(已复位)

- `rebindClearFreeze()` 已执行:default 账号 activeBinding=`TVILOCALETESTQWERTYUIOPASDFGHJKL66`(usdt-trc20),freezeUntil=null,lastRebindAt=null,rebindOrder=active(终态、不阻塞)。
- 残留(无 dev 驱动可清,如实登记):① 在途提现单 WD-20260724-5243($1000,review-pending,manual 不自动推进)——会拦「更换」入口与新换绑发起,后续测试如需干净态请清 storage 重建账号;② 风险披露已确认(时间戳);③ locale 持久为 zh(userSet=true);④ 存在空壳账号 tester-b@nexgrid.dev(未 KYC,无资产)。
- 浏览器隔离会话已关闭,无孤儿进程;截图仅存 scratchpad,repo 无测试产物。
