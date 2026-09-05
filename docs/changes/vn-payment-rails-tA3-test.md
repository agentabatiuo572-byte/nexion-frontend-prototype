# tA3 独立验收报告 — 充值页重构 · USDT 链上 tab + 获取指引页

- 日期:2026-07-24 · tester:独立验收 agent(黑盒,未参与实现)
- 环境:dev http://localhost:5173(`?nx_device=off`),`agent-browser` headless Chrome 390×844 真点真看;每语言轮次 `localStorage.clear()` + 冷 reload 取干净基线
- 驱动:console `__nxDev.simulateIncomingTransfer / setChannelEnabled`;语言注入 `nexgrid-locale-v1` = `{"type":"object","data":{"code":"zh|vi|en","userSet":true}}`
- 截图:session scratchpad `…\scratchpad\shots\`(证据同时以页面实测文本/computed-style 落在本文,不依赖截图存续)

## 总判定:FAIL(9 pass / 1 fail,AC8 zh/vi 银行卡段 3 处硬编码英文;修复量级 ≈ 3 个 i18n 键 + 1 处 uni toast 配置)

| AC | 判定 | 一句话 |
|----|------|--------|
| 1 segmented 两段 | PASS | 恰 2 段无死入口;卡表单可输可校验,Change/更换/Đổi 回 USDT 段 |
| 2 三网络 chip + 地址/QR/toast + 费率矩阵 | PASS | TRC20 推荐居首;T/0x 形态正确;1·$10·20 / 1·$10·15 / 5·$10·12 全中 |
| 3 常驻警示语义 | PASS | 三语均「专属地址长期有效」;普通流零过期文案、零提现承诺 |
| 4 最近入金闭环 | PASS | 空态 composed;100 TRC20 实时 0/20→19/20→~12s Credited;5 ERC20 → 已转人工处理;点行跳交易详情 |
| 5 指引页 + 工单 | PASS | usdt-guide 4 步 + 返回充值 CTA(三语);充单未到账 → 工单创建面板打开 |
| 6 停用态 | PASS | ERC20 置灰 0.45 + toast 拒选;三停整块 paused(图标+文案);恢复正常 |
| 7 kyc=1 零回归 | PASS | 三网络;生成地址 + 29:59→29:57 倒计时正常(en/zh/vi) |
| 8 三语扫描 | **FAIL** | zh/vi 银行卡段 3 处英文硬编码 + 复制系统 toast 中文漏出,详见下 |
| 9 骨架 + console | PASS | 专属 `nx-dep-sk-sweep` 骨架(非转圈);全程 error 0 warning 0 |
| 10 设计评分 | 92/100 | <95,扣分点清单见下 |

---

## 逐 AC 证据

### AC1 — PASS
- `[class*="nx-topup-seg-"]` 计数 = **2**(`nx-topup-seg-crypto`「USDT on-chain/USDT 链上」+ `nx-topup-seg-card`「Bank card/银行卡」),无第三入口。
- 卡段 = 原卡表单:卡号输入自动格式化(输 `4242424242424242` → `4242 4242 4242 4242`)、Expiry/CVV/持卡人/国家/邮编齐全、金额默认 $50、费率行「Card fee 3.5% · $1.75」「Card charged $51.75」;**Pay CTA 表单未完整时灰(rgb(31,31,31)),全字段有效后变 volt(rgb(158,220,29))**——校验闸门真实生效。
- 「Change/更换/Đổi」点击 → 回 USDT 段(zh 轮实测 `changeWorked:true`,en 轮页面文本回到「Send via TRC20」)。

### AC2 — PASS
- chip 顺序 TRC20(首位,「Recommended · lowest fee/推荐 · 手续费最低」)→ BEP20 → ERC20。
- 逐 chip 点击实测(en):

| 网络 | 标题 | 地址形态 | 费/最低/确认数 |
|---|---|---|---|
| TRC20 | Send via TRC20 | `TF8E6CAA6636…C57B267A`(T 开头,复制全串 34 位) | Fee 1 USDT · Min $10 · Confirmations **20** |
| BEP20 | Send via BEP20 | `0x6f8236ead5…52e98b66` | Fee 1 USDT · Min $10 · Confirmations **15** |
| ERC20 | Send via ERC20 | `0x4043d38576…6c95cd8a` | Fee 5 USDT · Min $10 · Confirmations **12** |

- QR:白底 160×160 卡内 144×144 图案块,三网络均在。复制:clipboard spy 抓到全地址 `TF8E6CAA6636DB6447AE686C65C57B267A`,app toast「Address copied / Đã sao chép địa chỉ」`nx-toast--success` + `aria-live=polite`,复制按钮变绿勾状态。
- Observation(不计 fail,已计入评分):QR 为纯 CSS 均匀圆点纹理(radial-gradient 12px 重复),无三角定位角,且**三网络图案完全相同**——细看会穿帮(详见评分「业务可信」)。

### AC3 — PASS
- en:「This is your dedicated deposit address — **valid long-term**…」;zh:「这是你的专属充值地址,**长期有效**…」;vi:「…**có hiệu lực lâu dài**…」。
- 普通充值流三语全文扫描:无「expire/30 分钟/失效」类过期文案(KYC-Express 流保留 30 分钟倒计时属预期,见 AC7);充值页无「充值可提现」类承诺。

### AC4 — PASS
- 干净基线空态 = 圆形下箭头 icon + 「No deposits yet / 还没有充值记录 / Chưa có lịch sử nạp」,composed 非裸文本。
- `simulateIncomingTransfer("usdt-trc20",100)` → **1s 内**出行「USDT deposit +99.00 · TRC20 · DP-20260724-6470 · Confirming 0/20」→ 每秒 ~2 确认实时跳(0→1→3→…→19/20,无需刷新)→ **第 12s「Credited/已到账/Đã vào tài khoản」**(≈11s 达标)。
- `simulateIncomingTransfer("usdt-erc20",5)` → 短暂 Confirming 0/12 后 ~1s 转「**Below the minimum deposit — moved to manual handling / 金额低于最低充值额,已转人工处理 / Số tiền dưới mức nạp tối thiểu, đã chuyển xử lý thủ công**」,不入账。
- 点击 credited 行 → 跳 `#/pages/tx/hash?hash=0x4bb4…`(pages/tx/hash 交易详情页,渲染正常)。
- 🔶 Observation(交实现方,评分已扣):tx 详情页为通用 mock 浏览器页,其数据与所点入金**互相矛盾**——Value 1080.74 USDT(实际 99)、Ethereum Mainnet chain id 1(实际 TRC20)、Confirmations 50(实际 20)。好奇用户点进即穿帮,建议按入金记录传参渲染或改跳账单详情。

### AC5 — PASS
- 「How to get USDT」→ `pages/me/usdt-guide`:导语「USDT is a digital dollar」+ **4 步**(合规交易所购买 → 选一致网络提现 → 粘贴专属地址 → 等待到账)+「Before you send」警示卡 + 满宽 volt「Back to top-up / 返回充值 / Quay lại nạp tiền」CTA,点击实测回充值页。三语全译。
- 「Deposit not arrived? / 充值未到账? / Chưa nhận được tiền nạp?」→ `#/pages/me/support-tickets?mode=create` 工单创建面板直接打开(分类 chip / 主题 / 描述 / Cancel / Submit)。
- 🔶 Observation:从充值入口进入时分类预选 **Withdrawal**(volt 高亮)而非 **Deposit**——上下文没带过去,用户需手动改类。

### AC6 — PASS
- `setChannelEnabled("usdt-erc20",false)` → ERC20 chip `opacity:0.45` 置灰;点它:选中仍 TRC20 不切换 + toast「Paused — please choose another network」。
- 三网络全停 → 地址块整体替换为 paused 态(圆形暂停 icon + 提示文案),QR/地址/费率行消失;`setChannelEnabled(…,true)`×3 → 全部恢复(chip opacity 1、Scan QR 块回来)。
- 🔶 Observation:全停时文案仍是「please choose another network」,与「无网络可选」自相矛盾,建议全停态单独文案(如「充值通道维护中,请稍后再试」)。

### AC7 — PASS(零回归)
- `#/pages/me/wallet-topup?kyc=1`:KYC-Express 合规卡(Chainalysis KYT · MiCA-aligned)、验证保证金 $1.00、**三网络**(TRC20/BEP20/ERC20 含费率时长)、法规行。
- Generate → TRC20 地址 `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` + 倒计时 **29:59 → 29:57(2.5s 后,真实递减)** + Send exactly 1.00 USDT + auto-detect 等待条 + 「I've completed the payment」。zh(29:58,全中文)/ vi(29:58,全越)同验通过。

### AC8 — FAIL(点名清单)
**主段(USDT 链上)、指引页、KYC 流三语均干净**(白名单外零残留;zh 充值页整页英文残留 = 0,vi 亦仅白名单)。fail 集中在**银行卡段**:

| # | 位置 | zh 实测 | vi 实测 | 判据 |
|---|------|---------|---------|------|
| 1 | 费率行 | 「Card fee 3.5% · $1.75」英文 | 同英文 | 同卡内「卡上扣款/Đã trừ thẻ」已译,非设计保留 |
| 2 | 主 CTA | 「Pay $51.75」英文 | 同英文 | 主按钮直接英文,等同缺键 |
| 3 | 信任脚注 | 「Card processed by Checkout.com (PCI DSS Level 1). NexGrid never sees your full card number. 3D Secure 2.2 enforced…」整段英文 | 同英文 | 信任文案 zh/vi 用户不可读,伤转化;Checkout.com/PCI/3DS 专名可保留,句子应译 |

次要(一并列出,severity 低):
- a. **复制动作双 toast**:app toast(本地化正确)+ uni 运行时系统 toast「**内容已复制**」同时弹,后者 en/vi 下仍中文(uni `setClipboardData` 默认提示未关)。截图 `copy-double-toast-vi.png` 实锤。
- b. vi 段控「USDT on-chain」未译(zh 有「USDT 链上」对照;越南加密圈常保留英文,请实现方回源确认是显式 vi 值还是缺键回退)。
- c. vi header 主副标题重复「Nạp tiền / Nạp tiền」(en: Add funds/Top-up、zh: 充值入金/充值 均有区分)。
- d. 三语「Card charged$51.75 / 卡上扣款$51.75 / Đã trừ thẻ$51.75」标签与金额之间缺空格/间距。

### AC9 — PASS
- 骨架:冷载 t≈208ms 时 header+segmented 先出,同时 **5 个 leaf view 跑 `nx-dep-sk-sweep-f92f3bb2` 扫光动画**,t≈873ms 换真实内容——专属骨架,非通用转圈(全程未检出 spinner 类元素)。页内返回(guide→topup)走页面栈缓存不重放骨架,合理。
- console:`agent-browser console` + `errors` 全 session(7 次冷载 + 三语全交互 + 模拟入金/停用/KYC)= **error 0、warning 0**(仅 vite debug connect)。

---

## AC10 设计 6 维评分 — 总分 92/100(<95)

页面类型 = **转化型**(来源:任务指定;权重 30/15/15/10/15/15)。

| 维度 | 权重 | 得分 | 证据(实测) |
|---|---|---|---|
| 转化引导 | 30% | 93 | 落地即 TRC20 推荐 + 地址/QR 就绪,0 步到达充值信息;guide 页解「没有 USDT」最大异议并以满宽 volt「Back to top-up」闭环;min $10 低门槛与卡段 $50 预设直给。扣:工单入口丢上下文(预选 Withdrawal);zh/vi 卡段信任脚注英文不可读,削弱法币用户下单信心 |
| 交互就绪 | 15% | 92 | 复制→按钮变绿勾+成功 toast(aria-live);停用 chip 点击有 toast 反馈非死区;Pay CTA 灰→volt 校验闸;确认数逐秒实时跳;Change/返回出口全通。扣:复制**双 toast 叠弹**且系统条中文(截图 copy-double-toast-vi.png),最关键动作上的反馈噪音 |
| 信息架构 | 15% | 94 | 纵向流「通道→网络→地址→费/最低/确认三列行→警示→帮助→历史」一屏扫读;机器串(地址/DP 单号)一律 mono;三列参数行把决策数字并排。扣:vi 标题副标题重复;chip 副文案与参数行的 Fee 双重出现(轻) |
| 业务可信 | 10% | 82 | 费率矩阵在 chip、参数行、KYC 列表、**运行时账本**四处一致(100 入 → fee 1 → +99.00 credited 实证);dust 不入账有显式人工处理态。扣:**入金行点进 tx 详情页数据矛盾**(1080.74 USDT/Ethereum/50 confs vs 实际 99/TRC20/20);QR 为三网络同一张静态点阵、无定位角,细看穿帮;dust 行 +5.00 绿色正号与「未入账」状态并置略歧义 |
| 系统工艺 | 15% | 93 | volt/暗面/amber 警示 token 一致;卡圆角/间距节奏统一;三语无溢出无孤字;骨架专属实现;toast 带 aria。扣:「Card charged$51.75」缺空格(三语);uni 系统中文 toast 漏出为工艺毛边 |
| 视觉品牌 | 15% | 94 | V5 dark + volt 气质完整;白底 QR 卡在暗面上形成焦点;guide 数字步进 chip、KYC 合规橙卡均在语言体系内。扣:QR 点阵质感偏「贴纸装饰」,离高保真拟真差半档 |

加权:93×.30+92×.15+94×.15+82×.10+93×.15+94×.15 = **92.05 ≈ 92**。

**扣分点清单(修复即可上 95+,按性价比排序)**:
1. 入金行 → tx 详情页数据对齐(或改跳账单详情)——业务可信最大失分项
2. 卡段 3 处 i18n 键补译(与 AC8 fail 同源)+「charged$」空格
3. 关掉 uni 复制系统 toast(只留 app toast)
4. 工单入口带 Deposit 分类上下文
5. QR 加定位角/按地址派生图案(或至少三网络不同)
6. 全停态专用文案;vi 副标题与「USDT on-chain」斟酌

---

## 复现速查

```js
// http://localhost:5173/?nx_device=off#/pages/me/wallet-topup
__nxDev.simulateIncomingTransfer("usdt-trc20", 100)   // ~1s 出行,~11s Credited
__nxDev.simulateIncomingTransfer("usdt-erc20", 5)     // ~1s 转「已转人工处理」
__nxDev.setChannelEnabled("usdt-erc20", false)        // chip 置灰;三个全 false = 整块 paused
localStorage.setItem('nexgrid-locale-v1', JSON.stringify({type:'object',data:{code:'zh',userSet:true}})) // 后 reload
// KYC:#/pages/me/wallet-topup?kyc=1 → Generate deposit address
```

## 环境备注(证伪记录,非产品问题)
1. Claude Browser pane 隐藏态触发 Chrome 后台 intensive timer throttling(链式 timer 被钳制),会假性卡死 11s 入金进度——已换 `agent-browser` headless(实测 8×200ms=1624ms 无节流)后全部时序正常。判环境,非代码。
2. 本页 localStorage 常驻持久:跨轮验收必须每语言轮 `localStorage.clear()`+冷 reload,否则前轮入金记录/里程碑弹层残留污染空态判定(首轮曾复现 tA2 遗留 DP-20260723-* 记录)。
3. 新种子账号进页会弹「$1,000+ 里程碑」庆祝层,~3s 自动消失,不拦截点击,与本任务无关。

---

# 复验轮(修复后,2026-07-24)

**复验轮总判定:FAIL(仅 AC8 残留 1 处,量级 1 键)· 评分 96/100(≥95 达标)**
6 条扣分点 6/6 消除;卡支付 processing→3DS→成功/失败四态三语走通;console 全程 0 error 0 warning;en 无回归(卡段/QR/复制/入金流原形态)。

## AC8 复验 — 点名 3 处全修 + 7 态文案,残留 1 处新点名

| 上轮点名 | zh 实测 | vi 实测 | 判定 |
|---|---|---|---|
| 费率行 | 「卡通道费 3.5% · $1.75」 | 「Phí thẻ 3.5% · $1.75」 | ✅ |
| 主 CTA | 「支付 $51.75」 | 「Thanh toán $51.75」 | ✅ |
| 信任脚注 | 「银行卡由 Checkout.com 处理(PCI DSS Level 1),NexGrid 不会接触你的完整卡号;超过 $50 的交易强制 3D Secure 2.2 验证。」 | 「Thẻ được xử lý bởi Checkout.com…」全越 | ✅(专名保留属预期) |
| charged 间隔 | 「卡上扣款」right=311 →「$51.75」left=315,**4px 实测间隔** | 同组件同修 | ✅ |
| vi 副标题重复 | – | 「Nạp tiền / **Nạp vào ví**」不再重复 | ✅ |

**支付四态实走**(zh 真填真点;失败态以 `Math.random` stub 强制 10% 分支;vi 双态同验):
- processing:「正在授权银行卡… / 正在提交发卡行 · 请勿关闭本页」✅ 3DS:「3D Secure 验证 / 银行可能向你发送短信验证码…」✅
- 成功:「支付成功 / 50.00 USDT 已入钱包余额 / 返回钱包」(vi「Thanh toán thành công…Quay lại ví」)✅
- 失败:「银行卡被拒绝 / 原因:发卡行拒绝(do_not_honor) / …本次未产生任何费用 / 重试」(vi「Thẻ bị từ chối…Thử lại」)✅ 含重试出口与零扣费安抚

**残留 FAIL 项(新点名,1 处)**:成功态回执行 `Receipt #CK-xxxxxx · Charged $51.75 to ••••4242` zh/vi 下仍整句英文。回源实锤(dev server 编译产物):`topup-card-form.vue` `receiptLine` computed 为硬编码模板串,未走 i18n。"Charged … to" 是英文句子非机器串,周边全译 → 判残留。修法量级:1 键 3 参。
次要观察(不计 fail):失败态括号内 `do_not_honor` 原样枚举码,与项目「页面文案禁错误码」不变量有张力,但发卡行拒付码属行业惯例展示,交实现方斟酌;vi 段控「USDT on-chain」维持上轮观察(越南加密惯例可辩,请回源确认非缺键回退)。

## 评分 6 条扣分点复核(6/6 消)

| # | 上轮扣分点 | 复验实测 | 判定 |
|---|---|---|---|
| ① | tx 详情值矛盾 | 转 100 → 详情 **Value 100.00 USDT**(gross,与真实浏览器口径一致)/ **Tron Network (TRC20)** / From/To/Contract 全 T 形态,To=**用户实际充值地址** TF8E6CAA…7B267A / Confirmations 20;列表侧 +99 与充值页 Fee 1 USDT 可对账 | ✅ 消 |
| ② | QR 静态点阵 | 21×21 DOM 模块矩阵;三网络图案互异(签名 hash 625231109/2242479099/2813435772,暗块 245/231/248)+ **左上/右上 7×7 三角定位块结构实证**(1111111/1000001/1011101… 教科书 finder) | ✅ 消 |
| ③ | 复制双 toast | 仅 app toast「Address copied」,uni 系统中文条 0 次出现(采样 6×350ms),剪贴板仍写入全地址;源码见 `showToast:false` + `hideToast()` | ✅ 消 |
| ④ | 全停态文案 | 「Deposit channels under maintenance — please try again later」维护中语义,不再自相矛盾 | ✅ 消 |
| ⑤ | 工单预选 | 从「充值未到账?」进入,active 分类 = **Deposit**(volt 高亮实测) | ✅ 消 |
| ⑥ | dust 行 + 前缀 | dust 行「5.00」无 +,中性白;credited 行「99.00」volt 绿。注:credited 的 + 也一并去掉,与账单页「+99.0000」惯例存在跨页微差,色彩仍承载语义,记观察不扣重 | ✅ 消 |

## 复验轮设计评分 — 总分 96/100(转化型权重,≥95 达标)

| 维度 | 权重 | 前分→新分 | 证据 |
|---|---|---|---|
| 转化引导 | 30% | 93→**96** | 信任脚注 zh/vi 可读;工单带 Deposit 上下文;支付失败态有「重试+零扣费安抚」留客出口。残:成功态回执行英文(信任时刻的毛边) |
| 交互就绪 | 15% | 92→**97** | 复制单 toast;四态状态机含 processing 防重复提交(「请勿关闭本页」)与失败重试;实测无死点 |
| 信息架构 | 15% | 94→**96** | vi 主副标题去重(Nạp tiền/Nạp vào ví);其余结构同前轮优点 |
| 业务可信 | 10% | 82→**93** | ①②⑥全消(gross 口径+真地址对位+QR 拟真)。残:tx 页脚注「settle on Ethereum Mainnet」与同页 Tron Network 矛盾、Tron tx 仍并列 Etherscan 入口、「Gas used 37.21 Gwei」单位口径(Gwei 是 gas price 单位且 Tron 不用 Gwei) |
| 系统工艺 | 15% | 93→**96** | charged 间隔 4px 实测;uni toast 收敛进组件;残:receiptLine 硬编码(与 AC8 残留同源) |
| 视觉品牌 | 15% | 94→**97** | QR 从装饰贴纸升级为可信 21×21 矩阵,白卡焦点更立得住 |

加权:96×.30+97×.15+96×.15+93×.10+96×.15+97×.15 = **96.0**。

**剩余扣分点(修完可上 97+)**:1) receiptLine 走 i18n(1 键,与 AC8 残留同一处);2) tx 页脚注按网络动态化 + 按网络只展示对应 explorer;3) 「Gas used」字段名/单位斟酌(Tron 侧 Energy)。

## 复验复现速查
```js
// 失败态强制:提交前 console 执行 Math.random = () => 0.05(验完恢复)
// 回执行残留:zh/vi 卡段付款成功即见 Receipt #CK-… · Charged … to ••••
// QR 矩阵签名:比较三网络 21×21 暗块分布(本报告 hash 三元组)
```

---

# 终轮微复验(残留扫净后,2026-07-24)

**终轮总判定:PASS(A3 验收闭环)· AC8 终判 PASS · 评分 96.5/100 维持 ≥95**

| # | 检查项 | 实测 | 判定 |
|---|---|---|---|
| 1 | 回执行三语化(AC8 闭环) | zh:「**回执 #CK-910000 · 已扣款 $51.75 · 卡尾号 ••••4242**」;vi:「**Biên nhận #CK-472096 · Đã trừ $51.75 vào thẻ ••••4242**」(均真填真付实走成功态);en 原形态 Receipt #CK-… 不回归 | ✅ |
| 2 | TRC20 tx 详情 | 浏览器入口仅 **TRONScan** 单按钮(Etherscan 0 命中);费用行「**23304 Energy**」非 Gwei;整页无「Ethereum Mainnet」,页脚改中性「All NexGrid transactions settle on **their native network** with batch finality」 | ✅ |
| 3 | ERC20 不误伤 | ERC20 入金行进入:入口仅 **Etherscan**、费用行「**36.83 Gwei**」照旧;Network 行「Ethereum Mainnet (ERC20)」(该处为真实网络标注,合理保留) | ✅ |
| 4 | console | 干净路径复跑(冷载→sim→credited→点行→back):console 0 error 0 warning,page errors 0 | ✅ |

AC8 终判:**PASS**——上轮唯一残留 receiptLine 已 i18n 化,充值页+指引页三语无缺键/裸 key/漏翻(专名/法规白名单外零残留)。

评分更新:业务可信 93→**96**(tx 页三残项全消),系统工艺 96→**97**(receiptLine 收敛);其余维持。加权 = 96×.30+97×.15+96×.15+96×.10+97×.15+97×.15 = **96.45 ≈ 96.5**(≥95)。

环境备注(终轮新增,均已证伪为 harness 噪音):
1. **中途 `localStorage.clear()` 会触发 session 守卫踢出**至 `pages/session/kicked`(「此会话已因安全原因停用」)——终轮曾在带存量状态的页面上先清存储再模拟入金,~14s 后被踢。规范做法:清存储后必须**立刻冷 reload** 再操作;干净路径无此现象。该页存在本身属产品正常防护。
2. 入金行在 confirming→credited 翻转瞬间点击可能命中 stale 节点(dispatch 成功但不导航),等 600ms 重取节点再点即通;真实用户手速不构成问题。
3. 上一轮 `errors` 里 4 条空 message page error 归因于上述两条竞态(踢出重定向 + stale 点击),干净复跑为 0,非产品缺陷。
