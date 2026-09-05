# 结账卡支付 · 独立验收报告(tester-B)

- 日期:2026-07-28
- 验收人:独立 tester-B(黑盒;未读实现说明文档,只按 AC 真点真输)
- 被测面:`Nexion-uniapp` 商城结账卡支付(`#/pages/store/checkout` → 卡支付步骤)
- dev server:`http://localhost:5173`(全程带 `?nx_device=off`)

## 总判定

**12 / 12 AC 全 PASS。** 1 项(AC4)按钮实际文案与验收单措辞不同但语义等价,已在下方标注。
另有 1 条超出 AC 范围的 i18n 硬编码观察,见文末。

---

## 环境隔离与假阴排除(先说这个)

本轮**没有报出任何 fail**,但过程中命中过 2 次"看起来是 fail、实为环境/探针问题",按纪律记录:

| # | 现象 | 真因 | 处理 |
|---|---|---|---|
| 1 | 共享浏览器里 URL 自己从 `#/pages/index/index` 漂到 `#/pages/me/wallet-topup` | 同会话另一个 agent(tester-cards-A)在驱动**同一个 Playwright MCP 浏览器** | 弃用共享浏览器,改用 `chromium.launchPersistentContext` 起**独立 profile**,全程零干扰;共享浏览器只做过 1 次只读 evaluate |
| 2 | AC7 首测"聚焦态无变化"(bg/border/shadow 前后全等) | **探针打错节点**——我取的是 `input.closest('uni-input').parentElement`,而聚焦样式挂在 `uni-input` 本身 | 改成沿 input 向上遍历 6 层逐层 diff,聚焦态立刻显现 → AC7 实为 PASS |

其余已逐条排除的脆性:`?nx_device=off` 全程带上;只用 `localhost` 不用 `127.0.0.1`;换页走 `location.href=…; location.reload()`;uni storage 注入用 `{type:'object',data:X}` 包装;输入不改 `.value` 而用 `pressSequentially` 真敲键;顶部「付款」确认是步骤条文字未误点。

**额外拦路点(非 bug,记录以便复现)**:进结账先弹 trade-in 拦截 sheet(`.tis-backdrop` 吃掉所有点击)。必须先选「Pay full price · keep current devices」,否则 ① 点不动「继续」② 选置换会把金额从 $649 改掉,AC9 数字对不上。

---

## A. 已绑卡真实可见

### AC1 — 账号下有一张真实绑的卡 · **PASS**

在 `#/pages/me/wallet-cards-new` 真填真提交(4111111111111111 / 0930 / 737 / ALEX NEXGRID),4 个输入框自动格式化为 `4111 1111 1111 1111` / `09/30`,点「Complete binding」。

落盘证据(`nexgrid-cards-accounts-v1`):

```json
{"type":"object","data":{"default":{"cards":[{"tokenId":"tok_eea503b2073990d3505fb6af",
"brand":"visa","last4":"1111","expiry":"09/30","holder":"ALEX NEXGRID",
"boundAt":1785220149169}],"defaultTokenId":"tok_eea503b2073990d3505fb6af"}}}
```

跳回卡列表页显示 `Visa •••• 1111 / Default / Exp 09/30 · ALEX NEXGRID`。console error = 0。
注意:**明文卡号与 CVV 均未落盘**,只留了 brand / last4 / expiry / holder。

### AC2 — 卡支付步骤显示刚绑的那张卡 · **PASS**

走完 选支付方式(Card) → 继续 → 核对订单 → 继续支付,卡列表渲染:

```
Visa •••• 1111
Expires 09/30 · ALEX NEXGRID       (zh: 有效期 09/30 · ALEX NEXGRID)
```

**未出现 `•••• 4242`。** 已用 `4242` 做过全页文本反查,零命中。该卡默认选中(带勾选态高亮),与 `defaultTokenId` 一致。

### AC3 — 清空绑卡后显示空状态且不是死路 · **PASS**

`localStorage.removeItem('nexgrid-cards-accounts-v1')` → reload → 重走到卡支付步骤。

渲染三件套齐全,非空白容器:

- **图标**:44×44 圆角盒(`radius 12px`,`bg rgb(31,31,31)`)内含 20×20 卡片 SVG(`stroke var(--v5-ink-3)`),实测 `visible: true`
- **文案**:`还没有绑定银行卡`
- **出口**:`去绑定银行卡` 按钮 → 点击后 URL 变为 `#/pages/me/wallet-cards-new`,绑卡页正常渲染(卡号 / 有效期 / CVV / 持卡人姓名 4 个字段都在)

同屏另有「取消」出口 + 付款按钮降级为 `选择银行卡`(灰态不可点),无死路。console error = 0。

---

## B. CVV 复验

### AC4 — 未输入时按钮不可点 + 计数器 0/4 · **PASS**(文案措辞与验收单不同,语义等价)

实测:

| 项 | 实际值 |
|---|---|
| 计数器(右上角) | `0/4` ✓ |
| 付款按钮文案 | `Enter CVV` / zh `输入 CVV` |
| 付款按钮态 | `bg rgb(31,31,31)` + `color rgb(107,115,133)` = 灰底灰字禁用态 |
| 点击效果 | 页面无任何跳转/变化(见 AC5 反证) |

⚠️ **措辞差异**:验收单写"按钮显示「输入 CVV 完成支付」"。实现把这句拆成两处 —— 输入框**上方标签**是 `输入 CVV 完成支付`(i18n key `coEnterCvv`),**按钮**是 `输入 CVV`(key `coCvvNeedCvv`)。
两处都真实存在于同屏,按钮确实在提示输入 CVV 且确实不可点,**实质要求满足**,故判 PASS 并在此标注,供主人裁决是否要把按钮文案改成长句。

### AC5 — 2 位仍不可点 / 3 位变可点 · **PASS**

| 输入 | 计数器 | 按钮文案 | 按钮底色 | 可点 |
|---|---|---|---|---|
| `73`(2 位) | `2/4` | `Enter CVV` | `rgb(31,31,31)` 灰 | 否 |
| `737`(3 位) | `3/4` | `Pay $671.72` | `rgb(255,122,61)` 品牌橙 | 是 |

2 位时**真点了一次**付款按钮,点后页面正文与点前完全一致(`advanced? false`),确认不是"看着灰其实能点"。
3 位时按钮文字色同步变为 `rgb(10,10,10)`(`--v5-on-brand`),亮底深字,符合项目 on-brand 不变量。

### AC6 — 含字母输入被剥成纯数字且最多 4 位 · **PASS**

真敲 `abc9999`(7 个字符,含 3 个字母)→ 输入框 `value` 实测为 `"9999"`,计数器 `4/4`,按钮 `Pay $671.72`。
字母被剥掉、数字截到 4 位,两条规则同时生效。

### AC7 — 聚焦态有视觉变化 · **PASS**

样式挂在 `UNI-INPUT` 节点(首测打错节点导致假阴,已排除)。逐层 diff 结果:

| 属性 | 失焦 | 聚焦 |
|---|---|---|
| `background` | `rgb(31, 31, 31)` | `rgb(20, 20, 20)` |
| `border` | `1px solid rgba(255,255,255,0.06)` | `1px solid rgb(255,122,61)` |
| `box-shadow` | `none` | `0 0 0 3px color(srgb 1 .478 .239 / .18)` |

三个属性全部变化,聚焦时是品牌橙描边 + 3px 柔光环,截图肉眼可辨。`document.activeElement` 确认为 `INPUT.uni-input-input`。

---

## C. 费率单源

### AC8 — 费率文案正常、无字面量 `{rate}` · **PASS**

按验收单要求的 3 个位置 × **3 个语言**(zh / en / vi)全扫,并对整页文本做 `{xxx}` 占位符正则扫描:

| 位置 | zh | en | vi |
|---|---|---|---|
| 支付方式列表 Card 副标 | `Instant · +3.5% fee` | `Instant · +3.5% fee` | `Instant · +3.5% fee` |
| 核对订单页费用行 | `信用卡手续费 (3.5%)` | `Card processing fee (3.5%)` | `Phí xử lý thẻ (3.5%)` |
| 卡支付组件费用行 | `信用卡手续费 (3.5%)` | `Card processing fee (3.5%)` | `Phí xử lý thẻ (3.5%)` |

`literalRate`(是否含字面 `{rate}`)= **false**,9 次采样全 false。
`anyPlaceholder`(整页任意未填充 `{xxx}`)= **空数组**,9 次采样全空。i18n 源里 `coCardFeeLabel` 三语都是 `… ({rate})` 模板,运行时确实被 `fmt()` 填掉了。

### AC9 — 金额校验 · **PASS**

商品 $649(NexGridBox S1,选「Pay full price」不走置换):

| 行 | 实测 | 期望 |
|---|---|---|
| 商品小计 | `$649` | $649 ✓ |
| 手续费 | `$22.72` | 649 × 3.5% = 22.715 → `$22.72` ✓ |
| 应付总额 | `$671.72` | `$671.72` ✓ |

核对订单页与卡支付组件两处数字一致。付款按钮也显示 `Pay $671.72`,与合计同源。

### AC10 — 单源验证(临时改 0.035 → 0.05)· **PASS** · 已还原

把 `src/store/deposits-core.ts:164` 的 `CARD_FEE_RATE` 临时改成 `0.05`,等 HMR 生效后重走全流程:

| 位置 | 改前 | 改后(0.05) |
|---|---|---|
| 支付方式列表 Card 副标 | `Instant · +3.5% fee` | `Instant · +5% fee` ✓ |
| 核对订单页费用行 | `信用卡手续费 (3.5%)` | `信用卡手续费 (5%)` ✓ |
| 卡支付组件费用行 | `信用卡手续费 (3.5%)` | `信用卡手续费 (5%)` ✓ |
| 手续费金额 | `$22.72` | `$32.45` ✓(= 649 × 5%,与验收单期望值一致) |
| 应付总额 | `$671.72` | `$681.45` ✓ |

**三处文案 + 两处金额全部跟着单源走,没有一处掉队。** 这条是本次改造的核心目的,已真做。

**还原确认**:
- 改回 `0.035` 后与改动前备份 `diff` → `DEPOSITS_CORE_IDENTICAL_TO_BACKUP`
- 现场复验:`grep` 得 `164:export const CARD_FEE_RATE = 0.035;`
- 运行时复验:卡支付步骤重新显示 `信用卡手续费 (3.5%)` / `$22.72` / `$671.72`
- `git diff` 中无任何 `0.05` 残留

> 旁注:验收期间**另一个 agent 并发修改了同一文件**的 `CARD_DECLINE_RATE`(0.1 → 1)。该改动不是我做的、与本验收无关,我未回滚它。我只碰了 `CARD_FEE_RATE` 这一行,且已精确还原。

---

## D. 明文边界

### AC11 — `card-payment.vue` 无明文 CVV 持有 · **PASS**

`<script setup>` 段全扫:`const cvv =` / `const cvv ` / `:value="cvv"` / `v-model="cvv"` / `cvv.value =` 全部**零命中**。

文件内所有 cvv 相关标识符逐个核对,全是合法非明文用法:

| 标识符 | 位置 | 性质 |
|---|---|---|
| `cvvLength` / `cvvReady` / `cvvFocused` | script | 长度、就绪位、聚焦位(非明文) |
| `cvvInputStyle` / `cvvLabelStyle` / `cvvCountStyle` / `cvvHelpStyle` | script | 样式对象 |
| `mode="cvv-only"` / `kind="cvv"` | template | 传给 `HostedCardVault` / `HostedCardField` 的枚举参数 |
| 第 6、7、134 行的 `cvv` | 注释 | 中文注释文字 |

明文确实归到了 `<HostedCardVault mode="cvv-only">`,组件只通过 `onCvvChange({ready, cvvLength})` 拿到长度和就绪位,付款时走 `vaultRef.tokenizeCvv()` 换 token。

### AC12 — 边界哨兵脚本 + 红测 · **PASS** · 已还原

| 步骤 | 命令 | 结果 |
|---|---|---|
| 自测 | `node scripts/card-data-boundary.mjs --selftest` | `阳性 8 / 阴性 12 · 失败 0`,**exit 0** ✓ |
| 正测 | `node scripts/card-data-boundary.mjs` | `0 违例(扫 392 个源文件 / 46 个输入框 · 边界内豁免 3 个文件)`,**exit 0** ✓ |
| **红测** | 在 `src/pages/store/checkout.vue` 的 `</template>` 前插入 `<input :value="cvv" />` 后重跑 | **exit 1** ✓,且精确报出该文件 |

红测输出原文:

```
卡数据边界:1 处明文卡字段在托管组件之外
  pages/store/checkout.vue:207  [binding] 把明文卡字段绑到了输入框
      <input :value="cvv" />
```

哨兵不是"假绿"——它真的会在违例时炸,且定位到文件 + 行号 + 违例类型。

**还原确认**:删掉注入行后与备份 `diff` → `IDENTICAL`;`grep ':value="cvv"'` → `ABSENT`;重跑正测 `0 违例 / exit 0`,自测 `失败 0 / exit 0`。

---

## 超出 AC 范围的观察(不影响本轮判定)

**支付方式列表的三条副标是硬编码英文,zh / vi 下不翻译。**

`src/pages/store/checkout.vue:269-272`:

```js
{ id: "usdt-trc20", …, hint: "Lowest fee · 5 min", … },
{ id: "usdt-bep20", …, hint: "Low fee · 5 min", … },
{ id: "card",       …, hint: `Instant · +${cardFeeRateLabel()} fee`, … },
```

- 费率部分(`cardFeeRateLabel()`)是单源的,AC8 / AC10 因此通过 —— 这点没问题。
- 但外层 `Instant · +… fee` 是英文字面量,zh / vi 实测原样显示英文。
- `src/i18n/messages/en.ts:1791-1792` 里**已经有** `networkHintTrc20` / `networkHintBep20` 这两个 key 定义好了却没被用。
- 违反项目 🔴 不变量「i18n 不硬编码」。USDT 两条是存量问题,Card 这条是本次改动经手的行。

建议单开一个小任务处理,不建议塞进本轮。

---

## 复现方式

独立 profile 驱动脚本已用完即删。复现要点:

1. 起 dev server(5173),浏览器开 `http://localhost:5173/?nx_device=off#/pages/store/checkout?product=stellarbox-s1`
2. 弹出 trade-in sheet → 点「Pay full price · keep current devices」
3. 选 `Card` → 「继续」→ 核对订单 →「继续支付」→ 到卡支付表单
4. 没绑卡的话先去 `#/pages/me/wallet-cards-new` 绑一张

## 一句话总结

12 条 AC 全部通过 —— 卡列表接的是真实绑卡数据(不再是写死的 `•••• 4242`)、空态有图标有出口不留死路、CVV 三位才放行且明文不进本组件、费率改一处三处文案两处金额全跟着变,两处临时改动(`CARD_FEE_RATE`、红测注入行)均已 diff 校验还原到位。
