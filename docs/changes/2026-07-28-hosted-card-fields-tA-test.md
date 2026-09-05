# 独立验收报告 — 托管卡字段改造(tA)

- **验收人**:独立验收 agent(黑盒,未参与实现)
- **日期**:2026-07-28
- **被测面**:`/#/pages/me/wallet-topup`(银行卡通道) · `/#/pages/me/wallet-cards-new`(绑卡页)
- **环境**:dev server `localhost:5173`,H5 `?nx_device=off`,视口 414×896,Playwright 真实交互
- **结论**:**13/13 AC 全部 PASS**,0 fail。

## 被测版本指纹(关键)

验收期间实现方在**并发改动源码**(见「重大环境事件」)。最终一轮验收与 AC13 静态检查均针对下列指纹版本:

| 文件 | md5 |
|---|---|
| `src/components/me/topup-card-form.vue` | `23462d2bd58b8ee1bfc1f2b7858d4cec` |
| `src/pages/me/wallet-cards-new.vue` | `4ea7960193f38932e4c39203a0a673f8` |

## 逐条判定

### A. 充值页卡通道

| AC | 判定 | 证据 |
|---|---|---|
| AC1 布局六字段 | **PASS** | `getBoundingClientRect` 实测:卡号 x16 w382(独占行,右侧徽章)· 有效期 x16 w187 / CVV x211 w187(**同一行 y=437** 两列)· 持卡人姓名 x16 w382(独占行)· 国家 x16 w254 / 邮编 x278 w120(**同一行 y=617**)。国家为 picker 非 input,故 DOM 里 uni-input 共 6 个(含金额)。 |
| AC2 未填卡即禁用 | **PASS** | 金额已填 50、卡为空时:`background rgb(31,31,31)`(灰)、`color rgb(107,115,133)`(弱化)、class **不含** `active:opacity-90`(无按压反馈)。对照:填全后 `rgb(158,220,29)` 品牌绿 + `active:opacity-90`。 |
| AC3 分组 + 卡组织徽章 | **PASS** | 真实键盘逐字输入:`5555444433332222` → 显示 `5555 4444 3333 2222`,徽章 **MC**;`4111111111111111` → `4111 1111 1111 1111`,徽章 **VISA**;`2000000000000000` → `2000 0000 0000 0000`,徽章 **•••**(未误判为 Mastercard)。 |
| AC4 限额越界 | **PASS** | `9000` → 提示色 `rgb(255,122,61)`(橙)+ 按钮 `rgb(31,31,31)` 无 active;`5` → 同上;回到 `50` → 按钮恢复 `rgb(158,220,29)` + `active:opacity-90`。限额文案 `Per-transaction limit $30 – $5,000`。 |
| AC5 三阶段 + 回执 | **PASS** | 200ms 轮询捕获完整相位序列:①`Authorizing card… Submitting to issuing bank` → ②`3D Secure verification · Your bank may text you a code` → ③`Payment successful`。成功页:`Receipt #CK-962510 · Charged $51.75 to ••••2222`。**卡尾号 2222 与输入的 5555444433332222 后四位一致**。 |
| AC6 三处号码同源 | **PASS** (n=2) | 交易一:屏幕 `#CK-870104` = deposit `authCode:"CK-870104"` = bill `ref:"CK-870104"`;交易二:屏幕 `#CK-962510` = `authCode:"CK-962510"` = `ref:"CK-962510"`。两笔均三处完全一致。 |
| AC7 入金记录口径 + 无明文 | **PASS** | 两笔均 `grossAmountUsdt 51.75 − feeUsdt 1.75 = creditedUsdt 50` ✓。记录 key 全集 = `depositId / channel / grossAmountUsdt / feeUsdt / creditedUsdt / authCode / status / createdAt / creditedAt` —— **无 pan / cvv / cardNumber 之类**,连 last4 都不落。原始串正则扫描无明文命中。 |

### B. 绑卡页

| AC | 判定 | 证据 |
|---|---|---|
| AC8 四字段 + 默认开关 | **PASS** | 渲染 Card number / Expiry / CVV / Cardholder name,及 `switch "Set as default payment card" [checked]`(状态标 ON)。 |
| AC9 未填全禁用 | **PASS** | 按钮文案 `Fill in all fields`,`aria-disabled="true"`,`aria-label="Fill in all fields"`,底色 `rgb(31,31,31)`。填全后变 `Complete binding` + `aria-disabled="false"` + 品牌绿。 |
| AC10 Visa + 有效期 | **PASS** | 输入 `4111111111111111`/`0930`/`737`/`ALEX NEXGRID` → 卡号显示 `4111 1111 1111 1111`,**有效期显示 `09/30`**,头部卡组织标识显示 **Visa**。 |
| AC11 落库字段 | **PASS** | `nexgrid-cards-accounts-v1` → `{tokenId:"tok_0c1c80aca459eac92d441b6d", brand:"visa", last4:"1111", expiry:"09/30", holder:"ALEX NEXGRID", boundAt:1785220920866}`。key 集合**恰好**为 6 项(排序后 `boundAt,brand,expiry,holder,last4,tokenId`),无明文卡号/CVV;`tokenId` 匹配 `^tok_[0-9a-f]{24}$`;last4/brand/expiry 全部符合。原始串扫描 `4111`/`cvv`/`pan`/`737` 均无命中。 |
| AC12 `?trial=1` 披露区 | **PASS** | 顶部照常渲染:`Auto-charge when the trial ends — When your 3-day free trial ends, this card will be used to complete the NexGridBox S1 purchase $649…`。 |

### C. 越权检查

| AC | 判定 | 证据 |
|---|---|---|
| AC13 无明文持有 | **PASS** | 对指纹版本做 AST 外的正则扫描,三类禁用形态(`const {pan\|cvv\|cardNum\|...} = ref(`、`:value="pan\|cvv\|..."`、`v-model="pan\|cvv\|..."`)在**两个文件全文**(不限 `<script setup>`)命中数 **0**。两文件各含 3 个合法 `kind="pan"/"expiry"/"cvv"` 字段选择器。明文三个 ref 只存在于 `src/components/me/hosted-card-vault.vue`(信任边界内,`defineExpose` 只暴露 `tokenize`/`tokenizeCvv`)。 |

## 重大环境事件 — 实现方与验收并发

**验收全程实现方在改动源码**,监视器捕获到 **7 次**改动(15:30:40 / 15:30:56 / 15:31:17 / 15:34:25 / 15:34:51 / 15:35:25 / 15:36:48 / 15:38:57 / 15:39:56 / 15:40:42)。HMR 触发整页 reload,**3 次在填表中途清空表单**。处置:每轮先等文件静默 15-20s 并取 md5 指纹,再跑该轮 AC;最终结论一律以上表指纹版本为准。

### 排除的两处环境假阴(重要 — 都不是缺陷)

1. **`tok_deadbeefdeadbeefdeadbeef`**。15:40:29 那次绑卡落库的 tokenId 是硬编码常量。回源 grep 全仓 `deadbeef` **零命中**,`mintToken()` 是真随机。13 秒后(15:40:42)源码再次变动;**清空 store + 强制整页 reload 后重绑,得到 `tok_0c1c80aca459eac92d441b6d`(真随机)**。判定:该常量是实现方对 `scripts/card-data-boundary.mjs` 哨兵做红测时的临时桩,已撤除,非缺陷。
   - 附带排除:第一次「重绑」拿到完全相同的 `boundAt`,原因是 SPA **改 hash 不重新挂载**,Pinia store 内存态未清、`persist()` 把旧记录写回 —— 是我的操作假阴,非去重逻辑 bug。
2. **`CARD_FEE_RATE = 0.05` 但注释仍写 3.5%**。15:34:25 读到的瞬时状态。当前值已回到 `0.035`,与注释一致,页面实扣 `$51.75`(50 + 3.5%)自洽。判定:同为红测残留,非缺陷。

### 其它已排除的环境假阴

- **首次点击被 `.ms-backdrop` 拦截**:里程碑庆祝弹窗(`$10,000+ Lifetime earnings`)遮挡 tab,属无关功能的定时浮层,非卡通道缺陷。
- **控制台 10 errors**(`HostedCardField 必须放在 <HostedCardVault> 内` / 模块 500):模块 URL 带 `?t=1785218497606` 等**旧时间戳**,是并发编辑窗口内 HMR 失败的陈旧记录。关页重开后干净加载,**0 error**,六字段全部正常挂载。
- **`input.value` 直接赋值不分组**:合成事件下模型已更新(徽章正确切换)但 uni-input 不回写 DOM 显示,属 uni 固有行为;改真实键盘输入后分组正常,故 AC3 全部以真实键入结论为准。
- **末轮全流程复验**:0 console error。

## 结论

13 条 AC 全部 PASS,未发现功能缺陷。唯一需要主人知悉的是**验收与实现并发**这一流程问题:本轮结论只对上表 md5 指纹版本成立,若实现方在此之后继续改动 `topup-card-form.vue` / `wallet-cards-new.vue`,需按该指纹重新比对后再决定是否复验。
