# 子任务 A1 独立验收报告 — 支付通道/网络收窄 + BEP20

- 验收人:独立 tester(黑盒,未参与实现)
- 日期:2026-07-24
- 环境:dev http://localhost:5173,`?nx_device=off` 直渲 app 本体,Playwright MCP 真点真看
- 截图目录:`.playwright-mcp/`(相对本仓库根)

## 总判定:FAIL(6 pass / 1 fail,AC6 zh 侧充值页 i18n 不过)

| AC | 判定 | 一句话 |
|----|------|--------|
| 1 通道列表与顺序 | PASS | TRC20 → BEP20 → ERC20 → Visa/MC,无 BTC/ETH,卡 Min $30 |
| 2 三链地址形态 + BEP20 费率 | PASS | T 开头 / 0x / 0x,BEP20 Fee 1 USDT |
| 3 提现网络三项 + BEP20 占位 | PASS | 仅三网络,TRC20 带推荐,BEP20 占位 0x...(en/zh 双验) |
| 4 结账无 Bitcoin 含 BEP20 | PASS | TRC20/BEP20/ERC20/Card 四项 |
| 5 kyc=1 KYC-Express | PASS | 渲染 + 生成地址流程推进正常,无报错(en/zh) |
| 6 zh/en 双语无缺键 | **FAIL** | zh 充值页通道副文案/警示语硬编码英文,详见下 |
| 7 console error = 0 | PASS | 全程 0 error,0 warning |

---

## AC1 充值页通道列表 — PASS

`#/pages/me/wallet-topup`,页面文本摘录(en):

1. USDT (TRC20) — Fee 1 USDT · 5 min · Min $10
2. USDT (BEP20) — Fee 1 USDT · 5 min · Min $10
3. USDT (ERC20) — Fee 5 USDT · 15 min · Min $10
4. Visa / Mastercard — Fee 3.5% · Instant · **Min $30**

顺序恰为 TRC20 → BEP20 → ERC20 → 国际卡;整页无 BTC/ETH 字样。
证据:`tA1-ac1-topup-channels.png`

## AC2 三链地址形态 + BEP20 费率 — PASS

依次点选三通道,地址展示:

| 通道 | 标题 | 地址 | 形态 |
|------|------|------|------|
| TRC20 | Send via USDT-TRC20 | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | T 开头 ✓ |
| BEP20 | Send via USDT-BEP20 | `0x4f7a2c8e9b1d3f5a6c8e0b2d4f6a8c0e21abcdef` | 0x ✓ |
| ERC20 | Send via USDT-ERC20 | `0x4f7a2c8e9b1d3f5a6c8e0b2d4f6a8c0e21abcdef` | 0x ✓ |

BEP20 有独立条目与费率说明「Fee 1 USDT · 5 min · Min $10」(区别于 ERC20 的 5 USDT)。BEP20/ERC20 共用同一 0x 地址,符合 EVM 链同地址现实,不判异常。
证据:`tA1-ac2-trc20-address.png` / `tA1-ac2-bep20-address.png` / `tA1-ac2-erc20-address.png`

## AC3 提现页网络 — PASS

`#/pages/me/wallet-withdraw`,Network 区恰为三项(en):

- USDT (TRC20) + **Recommended** 徽标 — Lowest fee · 5 min
- USDT (BEP20) — Low fee · 5 min
- USDT (ERC20) — 15 min · for large amounts

无 BTC/ETH。默认 TRC20 时地址占位 `TR7NHq...`;点选 BEP20 后占位变 `0x...`(en/zh 两轮均验证)。
证据:`tA1-ac3-withdraw-networks.png` / `tA1-ac3-withdraw-bep20-placeholder.png` / `tA1-ac6-withdraw-zh-bep20.png`

## AC4 结账支付方式 — PASS

`#/pages/store/checkout` Payment 步,支付方式恰为:

- USDT (TRC20) — Lowest fee · 5 min
- USDT (BEP20) — Low fee · 5 min
- USDT (ERC20) — 15 min
- Card — Instant · +3.5% fee

无 Bitcoin/BTC/ETH 字样,含 BEP20。
证据:`tA1-ac4-checkout-payment-methods.png`

## AC5 kyc=1 KYC-Express — PASS

`#/pages/me/wallet-topup?kyc=1`:KYC-Express 页正常渲染(Compliance check · Verification deposit $1.00 USDT locked · 网络选择 · Generate deposit address)。点「Generate deposit address」流程推进到付款页:TRC20 地址 + 29:56 倒计时 + Send exactly 1.00 USDT + 「I've completed the payment」,无任何报错。zh 下重进同样正常(合规检查/验证保证金/生成入金地址)。
证据:`tA1-ac5-kyc-express.png` / `tA1-ac5-kyc-express-generated.png` / `tA1-ac6-kyc-zh.png`

## AC6 zh/en 双语 — FAIL(zh 侧充值页)

**en 侧**:充值/提现两页全量扫过,无缺键、无裸 key、无 `[object]`。PASS。

**zh 侧**:提现页本地化完整且质量好——网络副文案「手续费最低 · 约 5 分钟」「手续费低 · 约 5 分钟」「约 15 分钟 · 适合大额」、推荐徽标「推荐」全中文。**但充值页(含 kyc=1 形态)通道/网络关键文案保留英文**:

- 通道副文案整行英文:「Fee 1 USDT · 5 min · Min $10」「Fee 3.5% · Instant · Min $30」(zh 用户看到的费率/到账时间/最低额门槛全是英文);
- 地址页警示语整句英文:「Address expires in 30:00 minutes. Send only the selected asset…」等。

回源证实非缺键而是**未走 i18n 的硬编码**(`src/pages/me/wallet-topup.vue`):

- L64 / L173:模板硬编码 `Fee {{ c.fee }} · {{ c.time }} (· Min {{ c.min }})`
- L116 / L201:两句地址警示语整句硬编码英文
- L232-235:通道数据常量 `fee: "1 USDT", time: "5 min" / "Instant", min: "$10"`

判 FAIL 依据:同一 App 提现页同类文案有完整中文对照,证明非「设计保留英文」;工程 CLAUDE.md 明文「硬编码英文 = regression」、项目不变量「i18n 不硬编码」为🔴铁律。zh 通道文案事实上等同缺键。
证据:`tA1-ac6-topup-zh.png`(对照 `tA1-ac3-withdraw-networks.png` zh 版即 `tA1-ac6-withdraw-zh-bep20.png`)、`tA1-ac6-kyc-zh.png`

**复现步骤**:localStorage 写 `nexgrid-locale-v1` = `{"type":"object","data":{"code":"zh","userSet":true}}` → 刷新 → 打开 `#/pages/me/wallet-topup` → 看四条通道副文案与地址页底部警示语。

## AC7 console — PASS

全 session(en+zh,充值/提现/结账/KYC 全流程真点):error 0,warning 0(仅 2 条 info)。

---

## 环境备注(证伪过,非产品 bug)

1. **点击被 backdrop 拦截**(`ms-backdrop` / `tis-backdrop`):hash 直跳导航不整页刷新,uni-app 页面栈里 checkout 页的 trade-in sheet 残留罩住视口。整页 reload 后消失。真实用户按返回键路径不会遇到,判环境噪音。
2. **提现页 KYC 状态自动推进**:en 轮生成 KYC 地址后 mock 约 12s auto-detect 自动确认,zh 轮提现页顶部变为「KYC-Express 已认证」、提交按钮解锁。属 mock 设计,顺带覆盖了认证前/后两种形态,均正常。
3. 语言切换未走页面入口,按任务授权直写 `nexgrid-locale-v1` 持久键(uni 包装格式)注入。

## 观察项(不计 pass/fail,交实现方/main 裁决)

1. **KYC-Express 网络列表无 BEP20**:仅 TRC20/ERC20 两项(en/zh 一致)。回源见 `wallet-topup.vue` L237 `KYC_CHANNELS = ALL_CHANNELS.filter(TRC20|ERC20)`,是显式过滤非遗漏。若「BEP20 全线收编」意图涵盖 KYC 小额验证入金,此处需补;若 KYC 故意只留最低费+大额两通道,建议在注释里写明裁决出处。
   → 复测轮已裁决并修复:三网络开放,见下。

---

# 复测轮(修复后,2026-07-24)

修复轮范围:AC6 i18n + AC5 KYC 三网络裁决落地。复测判定:

| 项 | 判定 | 一句话 |
|----|------|--------|
| AC6 i18n 修复 | **FAIL(残留)** | 点名项全修好;同文件仍剩 4 处模板硬编码英文 |
| AC5 KYC 三网络 | PASS | TRC20/BEP20/ERC20 三项,BEP20 流程通(en/zh 双验) |
| console | PASS | 干净整页加载后 0 error 0 warning |

**复测轮总判定:FAIL**(仅 AC6 残留一项,量小)

## AC6 复测 — 点名项全部达成

- zh 充值页四条通道副文案(实测):「手续费 1 USDT · 约 5 分钟 · 最低 $10」×2(TRC20/BEP20)、「手续费 5 USDT · 约 15 分钟 · 最低 $10」(ERC20)、「手续费 3.5% · 即时到账 · 最低 $30」(卡)——与目标形态一致。证据:`tA1-retest-topup-zh.png`
- 链上地址页警示语中文:普通流「…请仅向该地址转入所选资产——**转错资产无法找回**。」(`tA1-retest-topup-zh-address.png`);KYC 流「地址 30 分钟内有效。请仅通过 USDT-BEP20 网络向该地址转账——**跨链转账无法找回**。」(`tA1-retest-kyc-zh-bep20.png`)
- en 不回归:充值页保持「Fee 1 USDT · 5 min · Min $10」等原形态(快照核对,与首轮一致)
- vi 抽查:「Phí 1 USDT · ≈ 5 phút · Tối thiểu $10」「Tức thì」「Chọn kênh nạp」越南语完整。证据:`tA1-retest-topup-vi.png`

## AC6 复测 — 残留 FAIL 项(新点名,系统排查同文件后的全量清单)

`src/pages/me/wallet-topup.vue` 模板仍有 4 处硬编码英文,zh/vi 下渲染英文:

| 行 | 文案 | 出现位置 | 实景证据 |
|----|------|---------|---------|
| L185 | `Send via {{ selected }}` | 普通充值地址页标题 | `tA1-retest-topup-zh-address.png`(zh 下「Send via USDT-TRC20」) |
| L83 | `Send $1.00 via {{ network }}` | KYC 付款页标题 | `tA1-retest-kyc-zh-bep20.png`(zh 下「Send $1.00 via USDT-BEP20」) |
| L123 | `Payment received from {{ senderShort }}` | KYC 支付确认态 | 回源实锤(模板裸英文,zh 下必英文) |
| L125 | `1.00 USDT · {{ network }} · sender wallet` | KYC 支付确认态 | 回源实锤,`sender wallet` 硬编码 |

判 FAIL 依据与首轮同一逻辑:模板硬编码=事实缺键。周边文案已全中文/越南语,该 4 处为漏网,非设计保留(L123/L125 尤其无法论证为设计意图)。修法量级:4 个 i18n 键。
合理保留不计:KYC-Express(产品名)、Chainalysis KYT/MiCA/FATF/FinCEN(品牌与法规引用)、USDT/金额。`wallet-withdraw.vue` 全量扫过,无残留。

**复现步骤**:zh 语言 → `#/pages/me/wallet-topup` → 点任一 USDT 通道 → 地址页标题即「Send via USDT-XXX」英文;KYC 流同(`?kyc=1` → 生成入金地址)。

## AC5 增补复测 — PASS

`?kyc=1` 网络选择现为 **TRC20 / BEP20 / ERC20 三项**(裁决落地),zh 副文案中文。选 BEP20 → 生成地址:`0x4f7a…` 0x 形态、29:57 倒计时、「请转入正好 1.00 USDT」「我已完成支付」,流程正常无报错。en 侧同为三项。
证据:`tA1-retest-kyc-zh-bep20.png` / `tA1-retest-kyc-en-3networks.png`

## console — PASS(附环境证伪记录)

- 复测期间首次进入页面时曾见 **17 errors**(`_ctx.chTime is not a function` / `Cannot read properties of undefined (reading 'time5min')`),错误 URL 带多个 Vite HMR 时间戳(`?t=178482172…`)——为修复轮编辑期间 HMR 中间态在长开页面上的累计,**非当前代码问题**。
- 证伪方法:整页 `location.reload()` 取干净基线后,zh/en/vi 三轮加载 + 全部点击流,error 0、warning 0。
- 提醒:若后续会话在页面长开状态下改代码,console 判定必须以干净整页 reload 后为准。

---

# 第三轮(残留 4 处修复后,2026-07-24)

修复范围:上轮点名 4 处走 i18n(sendVia / sendOneVia / paymentReceivedFrom / senderWallet,en/zh/vi);裁决保留:「KYC-Express」(产品专名)、MiCA/FATF/FinCEN 法规引用(原文展示惯例)——不再计缺陷。

**第三轮总判定:PASS(全项通过,A1 验收闭环)**

| 项 | 判定 | 实测 |
|----|------|------|
| zh 四处修复 | PASS | 见下逐条 |
| en 不回归 | PASS | 列表「Fee 1 USDT · 5 min · Min $10」、地址页「Send via USDT-TRC20」原形态 |
| vi 抽查 | PASS | 列表「Phí 1 USDT · ≈ 5 phút」、地址页「Chuyển qua USDT-TRC20」全越南语 |
| console | PASS | zh/en/vi 三轮整页 reload 后全流程 0 error 0 warning |
| zh 全流程扫新漏网 | PASS | 无新漏网(保留项除外) |

## zh 四处修复实测(逐条)

| 上轮点名 | 本轮实测(zh) | 证据 |
|---------|--------------|------|
| L185 `Send via` | 「**通过 USDT-TRC20 转入**」 | `tA1-r3-topup-zh-sendvia.png` |
| L83 `Send $1.00 via` | 「**通过 USDT-TRC20 转入 $1.00**」+ 29:57 倒计时 | `tA1-r3-kyc-zh-await.png` |
| L123 `Payment received from` | 「**已收到转账,来自 T3C445…1C25**」 | `tA1-r3-kyc-zh-received.png` |
| L125 `sender wallet` | 「**1.00 USDT · USDT-TRC20 · 转出钱包**」 | `tA1-r3-kyc-zh-received.png` |

回源复核:上轮 grep 模式复跑 `wallet-topup.vue`,L83/L123/L185 不再命中(改走 i18n 插值),L125 为 `{{ t.topupChrome.senderWallet }}`;剩余命中仅裁决保留项(L26 产品名 / L33/L76 品牌与法规 / L103 金额)。

## zh 充值页全流程漏网扫描

实景走全:通道列表 → 地址页(普通流)→ KYC 表单 → KYC 等待页 → KYC 确认态(自动检测推进,含「Chainalysis KYT 筛查…」「正在将钱包绑定到你的账户…」步骤文案,均中文)。除裁决保留项外无英文残留。

## 验收闭环说明

首轮 7 条 AC:AC1-AC5、AC7 首轮已 PASS;AC6 经两轮修复,本轮 zh/en/vi 三语全过。KYC 三网络(AC5 增补裁决)第二轮已 PASS。**A1 子任务验收最终判定:PASS。**
