# vn-payment-rails 批次 A 收口 — 全站实景走查报告

- **日期**:2026-07-24
- **环境**:Nexion-uniapp H5 dev @ `http://localhost:5173`(`?nx_device=off` 直渲 app 本体),hash 路由
- **方法**:Playwright MCP 真实点击/输入/截图;store 注入走 uni 包装格式 `{type:'object',data:{…}}`;账号 `default`(L2,可提 $24856.56)
- **独立性**:本 agent 为独立走查方,非本批次实现方(验收独立性)
- **总判定**:**PASS-with-gaps** — 本批次 5 条支付路由核心改动全绿,**无 P0/P1**;发现 1×P2 + 2×LOW(均 i18n 文案);**3 个维度未完整覆盖**(见 §未覆盖),建议补验后再宣布收口。

---

## 环境处置(走查前置)

- 首次 `browser_navigate` 两次报 `Target page… has been closed`。诊断:**20 个孤儿 `@playwright/mcp` node server 进程堆积**(正常应 1 个),headless chromium 无一存活 → 当前活跃 server 拉不起浏览器。系统性清掉 20 个孤儿 server 后,harness 干净重启,浏览器正常。属跨会话资源泄漏,已一次性清理。
- **操作教训(已用于后续)**:uni H5 页面实例缓存 —— hash-only 导航(同 path 改 query/store)不重触发 onLoad、store 不重 hydrate。所有 localStorage 注入后**必须用 search 段 cache-bust(`&_t=N`)强制 document 整体 reload**,否则注入假阴性。tx/hash 无参回退一度显示 TRC20 粘连,即此缓存假象,证伪后确认非产品 bug(真实入口走 navTo push 新实例,onLoad 必跑)。

---

## 逐维结论

### 维度 1 — 全路由渲染 · **PASS**
5 条路由全部无白屏、无 console error、无裸 i18n key:

| 路由 | 证据 | console |
|---|---|---|
| `me/wallet-topup`(regular) | 三段 segmented(USDT 链上/银行转账/银行卡)全渲染;USDT 段=三网络 chip(TRC20 推荐·手续费最低 / BEP20 1 USDT / ERC20 5 USDT)+ 专属地址 `TF8E…267A` + QR + Min $10/Fee/Confirmations 20 + 最近入金空态;银行段=FxRateLine `1 USDT≈26,390₫·锁定30min`+金额+付款单;卡段=Visa/Mastercard 表单 + Checkout.com PCI 说明 | 0 |
| `me/wallet-topup?kyc=1` | 仅验 KYC gate 入口(withdraw 未配对态显示 "Complete KYC-Express $1");**完整流 select→awaiting→verifying→complete 未走**(见 §未覆盖) | — |
| `me/usdt-guide` | Header + "USDT is a digital dollar" + 4 步指引 + Before-you-send + Back-to-top-up | 0 |
| `me/wallet-withdraw` | 未配对=KYC gate + 地址"—" + submit[disabled]"Verification required";已配对=verified pill + 绑定地址派生 + 网络随绑定 + 三条 warning | 0 |
| `me/wallet-address-rebind` | form(新地址+三网络+安全提示)→ verify($1+QR+30min倒计时+三步)→ success(新地址生效+旧失效+24h冻结)全状态机 | 0 |
| `tx/hash?net=TRC20` / 无参 | 带参:TRON 地址+Value 25 USDT(随 amount)+Confirmations 18(随 confs)+Gas `Energy`+`Tron Network`+TRONScan;无参回退:0x 地址+`Gwei`+`Ethereum Mainnet`+Etherscan | 0 |

### 维度 2 — 5 tab 基线回归 · **未执行(NOT RUN)**
home/earn/store/team/me 五主 tab **本轮未走查**(被叫停前未覆盖)。无法断言支付改动对其它页零波及。**建议补一轮**。

### 维度 3 — 双语 zh + vi · **PASS**
- **zh**:topup 三段(充值入金/USDT 链上/银行转账/银行卡/牌价·下单锁定30分钟/生成付款单/卡上扣款)、withdraw(提现/KYC-Express 已认证/全部提现/可提现/更换/提交提现申请)、rebind(更换提现地址/开始验证/取消更换)—— 中文完整,无英文残留(USDT/TRC20/Checkout.com/Visa 属白名单)。
- **vi**:真 vi 文案存在(非 fallback en):Nạp tiền/Chuyển khoản/Thẻ ngân hàng/Khuyên dùng·phí thấp nhất/Chuyển qua TRC20;withdraw Rút tiền/Đã xác minh KYC-Express/Rút tối đa;rebind Đổi địa chỉ rút tiền/Bắt đầu xác minh。console 0。
- 详见 §发现 的 P2 + LOW。

### 维度 4 — 双主题 · **PASS(dark) / 降级(light)**
- **dark**:app 默认强制 `data-theme="dark"`(bg#000/ink#F5F7FA/surface#141414),全程 100+ snapshot + `topup-dark.png` 全页截图,无硬编码色突兀、on-brand 文字对比正常、卡片无违规边框。
- **light**:light tokens **确认存在**(设 `data-theme=light` → bg#F4F1E9/ink#13141A/surface#FFFFFF/brand#0E48E6),但 **light 主题视觉对比截图未取到(browser 工具 evaluate 反复解析限制,环境问题非产品问题)**。各支付组件双主题合规此前由子任务 tester 分别验过。**降级记录,建议单独补 light 截图。**

### 维度 5 — 旧数据迁移 · **PASS**
注入换绑上线前旧 schema 行(仅 `walletPaired`+`pairedWalletAddress`+`pairedNetwork`,**无 `bindings[]`**)+ 清 deposits 行,cache-bust reload:
- withdraw **不白屏**,verified pill + 地址 `TXk9qP2m…H1jL0a · USDT-TRC20` 正常显示;
- `hydrate()` 迁移逻辑合成第一条 active binding 并**幂等写回持久层**(读回 localStorage:`bindings=[{bindingId:AB-20260724-9885, network:usdt-trc20, status:active}]`);
- console 0。印证 `wallet-pairing.ts:79-91` 存量迁移分支生效。

### 维度 6 — 无死控件 · **PASS**
全部可点元素有响应:充值三段切换 ✓ / 网络 chip(TRC20/BEP20/ERC20 切换驱动 placeholder+派生)✓ / Generate payment order → VietQR 付款单(受益人 CTY TNHH NEXGRID VIETNAM / 账号 1023 8829 5501 / Vietcombank / 备注 NX-… / 29:55 倒计时)✓ / Cancel order → 二次确认框(有理由 Keep/Cancel)→ 确认后回退表单 ✓ / Use max → 填最大值 + fee 模型展开(Fee 20% $4971.31 → NEX offset −$2636·6590NEX → 实收 Fee $2335.31 → You receive $22521.25)✓ / Change 换绑入口 → navTo rebind ✓ / 地址输入 → Start verification 激活 ✓ / rebindVerified(dev 钩子)→ success ✓ / Got it → navBack withdraw,**换绑生效跨页联动**(pill/网络 BEP20/地址/24h 冻结横幅 23:59:25/submit 置灰"frozen after address change")全同步 ✓。

---

## 发现

### P2 — 风控横幅硬编码中文标点,非中文语言露馅
- **现象**:withdraw 风控横幅在 **en/vi** 环境结尾出现中文句号「。」、分句用「;」无空格。
  - en:`Newly added address is in a protection window;First withdrawal requires manual confirmation。`
  - vi:`Địa chỉ mới thêm đang trong thời gian bảo vệ;Lần rút đầu tiên cần xác nhận thủ công。`
  - zh:`新绑定地址处于保护期;首次提现需人工确认。`(中文下标点正常)
- **根因**:`src/pages/me/wallet-withdraw.vue:387` `riskNoticeBody`:`lines.join(";") + "。"` 硬编码了中文分号/句号,未随 locale 适配。同页 rebind 的 `safetyNote` 用对了半角标点,反证此为孤立硬编码。
- **性质**:疑为既有 SPEC-7 风控逻辑(非本批次 A 新增),但本轮支付路由暴露;vi 是 vn-payment 主目标市场,观感突兀。
- **严重度**:P2 — 不白屏、不影响功能、无 console error,纯 i18n 文案 polish。**不阻断发布**,建议本轮顺手修(改为按 locale 取标点或统一半角 `; ` / `.`)。

### LOW-1 — vi 下首个 tab「USDT on-chain」未本地化
zh 译为「USDT 链上」,vi 仍显示英文「USDT on-chain」。on-chain 属加密术语越南用户可懂,非硬伤;为一致性建议补 vi 译。(`topupChrome.segUsdt`)

### LOW-2 — 银行卡表单国家选择器值未本地化
zh/vi 环境国家选择器当前值仍显示「🇺🇸 United States」。金融 KYC 场景常保留英文国家名,非硬伤。

---

## 未覆盖(诚实降级 · 建议补验)
1. **5 tab 基线回归**(维度 2)— home/earn/store/team/me 未走,无法断言支付改动零波及其它页。
2. **KYC-Express 完整流** — 仅验 gate 入口,select→awaiting→verifying→complete($1 QR/12s 自动侦测/3 步验证/pairing+creditBalance+kyc bill)未走完整闭环。
3. **light 主题视觉对比** — tokens 确认存在,截图因 browser 工具解析限制未取到。

## 遗留清理
`.playwright-mcp/` 下 `topup-dark.png` 及若干 `page-*.yml` 快照待清理(被限制不再调工具,留后续)。
