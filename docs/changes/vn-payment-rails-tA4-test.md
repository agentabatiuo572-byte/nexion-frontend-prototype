# tA4 独立验收报告 — A4 VietQR 银行转账入金(附 A5 牌价组件运行时 AC)

- 验收人:独立 tester(黑盒,实现方≠验收方)
- 日期:2026-07-24
- 环境:http://localhost:5173/?nx_device=off(H5,agent-browser 隔离会话,真实 CDP 点击/输入驱动;`__nxDev.*` console 驱动)
- 账号:default;余额种子 $24,856.56;牌价 26,390 = 26,000 × (1+1.5%) 派生
- **总判定:PASS(7/7 全过,0 个 fail;3 条范围外观察项)**

## 逐条判定

### 1. A5 牌价行(PAY03 运行时 AC)— PASS

| 子项 | 结果 | 证据 |
|---|---|---|
| 牌价行文案 | ✓ | 「牌价 1 USDT ≈ 26,390₫ · 下单锁定 30 分钟」渲染于银行段顶部(截图 a5-sheet/实测文本) |
| 信息 icon 热区可点 | ✓ | `aria-label="牌价说明"`,实测热区 44×44px;真点后弹半屏 sheet |
| 牌价说明半屏 | ✓ | 标题「牌价说明」+ 两段说明(锁价 30 分钟/0 手续费)+「知道了」;点「知道了」收起(DOM 复验说明文案消失) |
| setFxFailure(true) 灰态 | ✓ | 牌价行替换为「牌价更新中,请稍后再试」,换算显示「≈ —」,输入区/脚注整段变暗,CTA 变灰(bg rgb(31,31,31)/字 muted);真点 CTA 无反应、storage 无 intent 生成 → 禁下单实证 |
| setFxFailure(false) 恢复 | ✓ | 无需刷新即恢复牌价行 + 换算 + CTA(base 仍在内存,syncFailed 翻回即恢复) |

### 2. 换算与校验 — PASS

| 输入 | 结果 | 证据 |
|---|---|---|
| 25 | ✓ ≈659,750₫ | 25 × 26,390 = 659,750,精确到盾 |
| 9 | ✓ 红字 + 按钮灰 | 换算 237,510₫(算术仍精确);红字提示 rgb(255,92,92);CTA 灰(bg 31,31,31 / 字 107,115,133),真点无 intent 生成 |
| 6000 | ✓ 红字 + 按钮灰 | 同上红字 + 灰 CTA |

备注:最低/上限共用一条合并红字「最低充值 $10,单笔上限 $5,000」(两个边界都点名,AC 语义满足)。

### 3. 阳光路径(25 USDT)— PASS

- 付款单视图(截图 a4-payorder):VietQR 点阵**带三个定位角** ✓;收款户名 `CTY TNHH NEXGRID VIETNAM` / 账号 `1023 8829 5501` / 银行 `Vietcombank` ✓(第二单轮换到 Techcombank `1903 6688 8842`,pickBankAccount 轮换实证);应付 **659,750₫** 大字 ✓;附言码 `NX-APPC48`(NX-XXXXXX 格式)+ 复制 ✓;真倒计时(29:44 → 3s 后 29:41;remount 后续接 25:49,派生自 expireAt 不重置)✓;三步指引 1/2/3 ✓。
- 「我已完成转账」→ 等待态「等待到账确认 / 已收到你的转账确认,正在与银行回单核对…」+「充值未到账?」出口 ✓。
- `bankCallback()` → 成功态「充值成功 +25.00 USDT / 已计入余额 · 牌价 26,390 · **手续费 0**」✓;intent→credited、record `{channel:bank-vietqr, credited:25, fee:0}` ✓。
- 下游:余额 24,856.56 → **24,881.56**(account-cloud 快照,+25 ✓,刷新后仍在);账单页新行「充值 已入账 Top-up · Bank VietQR·DP-20260724-4502 +25.0000 USDT」✓;最近入金列表「**银行转账充值** 25.00 / VietQR · DP-20260724-4502 / 已到账」(标题非「USDT 充值」)✓;整页刷新后全部保留 ✓。
- 附言码复制:控件在、handler 接线(uni.setClipboardData → 成功 toast「附言码已复制」);headless 环境剪贴板写入被拒(navigator.clipboard + execCommand 双探针均 denied,已证伪为环境非代码),成功 toast 无法在本环境实证,真机可复验。
- 说明:钱包页「可提现 USDT」不含充值本金属**产品设计**(app.ts 不变量 withdrawableUsdt ≤ usdtBalance,充值本金可花不可提),与 AC6「无充值可提现承诺」自洽;总余额 +25 以快照为准。

### 4. 异常路径 — PASS

| 场景 | 结果 | 证据 |
|---|---|---|
| bankExpire() | ✓ | 新单 DP-20260724-6078 → 过期态「付款单已过期 / 超过 30 分钟未确认到账…」+「重新生成付款单」(截图 a4-expired) |
| 过期单迟到回单(精确金额) | ✓ | `bankCallback(id, 659750)` → status 仍 expired、receivedVnd 登记;**黄行**「已收到迟到转账,正在人工核对」(字 rgb(255,203,77)、底 20% 琥珀 tint,截图 a4-late-review);余额不变 24,881.56 → **不自动入账** |
| 差额回单(>1,000₫) | ✓ | 重新生成新单 DP-20260724-5708(新锁价)→ `bankCallback(id, 657750)`(差 2,000₫)→ mismatch_review 警示态:琥珀警示 icon +「到账金额与订单不符 / 正在人工核对,一般 2 小时内完成」+ 应付 659,750₫ / 实际到账 657,750₫ 并列(截图 a4-mismatch) |
| resolveBankMismatch(id,"credit") | ✓ | 按实收核销:credited **24.92 = 657,750 ÷ 26,390**(锁定牌价)、fee 0;余额 24,906.48(+24.92 ✓);UI 成功态「+24.92 USDT」 |

### 5. 取消出口 — PASS

- awaiting 单「取消订单」(ghost 弱权重,明显弱于主 CTA)→ 确认弹窗「取消这张付款单?取消后付款单立即失效。若你已完成转账,请保留订单…」+ 保留订单/取消订单(截图 a4-cancel-confirm)→ 确认后回下单前表单,intent → cancelled ✓。
- 终态无取消入口:credited(完成/查看账单)、expired(重新生成/未到账)、mismatch(重新发起充值/未到账)三个终态视图运行时逐一核对,均无取消 ✓;对 cancelled/credited 单再打回调 = no-op(store 409 形态)。

### 6. 三语抽查(zh/vi)— PASS

- zh 全流程(上述 1–5 全部)无英文残留(白名单外):出现的英文仅 VietQR/Vietcombank/Techcombank/CTY TNHH NEXGRID VIETNAM/USDT/NX-/DP- 专名与编码。
- vi 抽查:表单(Tỷ giá ≈ 26,390₫ / Khóa 30 phút / Tối thiểu $10 · tối đa $5,000 / Tạo lệnh thanh toán)、牌价说明(Giải thích tỷ giá + Đã hiểu)、付款单(Tên người nhận/Số tài khoản/Ngân hàng/Nội dung chuyển khoản/Tôi đã chuyển khoản/Hủy lệnh)、过期态(Lệnh thanh toán đã hết hạn/Tạo lệnh mới)全 vi 无中英残留。
- MoMo/ZaloPay:三语 i18n 文件 grep 0 命中 + 运行时未见 ✓。
- 无「充值可提现」承诺:文案为「到账即可用 / vào tài khoản là dùng được」,且可提现口径确实排除充值本金,言行一致 ✓。

### 7. Console — PASS

`errors` 0 条;console 无 error(仅 [debug] vite connecting/connected —— 并发 impl 会话 HMR 噪声,按 AC 排除)。

## 范围外观察(不计分,供 main 定夺)

1. 账单页 topup 行的「余额: $85.31」随行余额与钱包总额(2.4 万级)明显不一致——疑 bills seed 运行余额口径问题,非 A4 改动面,建议另开检查。
2. 账单 memo「Top-up · Bank VietQR」为英文台账样式,与既有 seed「Top-up · USDT-TRC20」同款式,一致性 OK,仅备注。
3. 测试中一次误触发现最近入金的银行行可点、路由到 `pages/tx/hash?...&net=VietQR&hash=DP-…`(链上 tx 框架页承载银行单);HMR 抖动下未能稳定复现,建议 impl 一句话核对银行行的落地页是否合意。

## 复验轮(修复落地后,2026-07-24 二次验收;整页 reload 新 profile,余额种子 24,856.56)

| # | 复验点 | 判定 | 证据 |
|---|---|---|---|
| 1 | 迟到补入账边 | **PASS** | DP-20260724-2699:expire → 精确回单出「迟到人工核对」行 → `resolveLateBankTransfer(id)`=true → intent credited、record `{credited:25, fee:0}`(=659,750÷26,390)、余额 24,856.56→24,881.56、账单 ref 命中 1 行、UI 当场翻「充值成功 +25.00 USDT」——余额/账单/记录齐动 ✓ |
| 2 | 账户池熔断 | **PASS** | `setBankAccountEnabled` 5501/8842/2074 ×3 全停 → 银行段空状态「银行通道维护中,请使用 USDT 充值」+ 下单表单移除 + seg pill 置灰(opacity 0.45,截图 a4-rail-paused);仅恢复 8842 → 表单回归,连开 2 单全落 `1903 6688 8842/Techcombank`(轮换只落启用户)✓;测后池已复原(5501/2074 re-enable=true;池为内存态,刷新亦回种子全启用) |
| 3 | mismatch 核销金额 | **PASS** | DP-20260724-4139 差 2,000₫ → credit 核销 → 成功页「充值成功 +24.92 USDT · 牌价 26,390 · 手续费 0」= 实收 657,750÷26,390 折算额,非原下单 25.00 ✓ |
| 4 | 最近入金行路由 | **PASS** | 银行行(VietQR · DP-…-2699)点击 → `#/pages/me/wallet-bills` 账单页 ✓ 不再进 tx 链页;链上行(TRC20 · DP-…-9745)→ `#/pages/tx/hash?hash=0x1040…&net=TRC20` 交易详情 ✓ |
| 5 | KYC complete 三语 | **PASS** | zh:已绑定钱包 / 网络 / 合规编号 / 验证时间 / 继续提现 全中文;vi:Ví đã liên kết / Mạng / Mã tuân thủ / Thời gian xác minh / Tiếp tục rút tiền 全越文;英文仅 KYC-Express / Powered by Chainalysis KYT · MiCA-aligned / USDT-TRC20 / KYC-2026-… 品牌与编码白名单 |

- Console:errors 0、console error 0(全轮)。
- 复验轮补充观察(范围外一句):tx 交易详情页 zh 视图存在「To」英文标签(来自=zh、To=en 不对称),非本轮 5 点范围,留 impl 顺手核。

## 测试环境备注

- 并发 impl 会话导致 dev server 频繁 HMR/重连,页面多次 remount(segment 重置为 crypto);在途单 resume 逻辑每次都正确接回 awaiting 单(顺带验证了「刷新不丢单」)。
- 两次「真点无反应」均已证伪为 harness 视口问题(元素在 566px 视口外,elementFromPoint=null),非产品缺陷;后续步骤改用滚动后点击/元素级 click。
- 截图存于会话 scratchpad(a5-sheet / a5-fx-fail / a4-payorder / a4-expired / a4-late-review / a4-mismatch / a4-cancel-confirm),不入库。
