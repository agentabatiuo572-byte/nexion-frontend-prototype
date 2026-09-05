# 卡数据托管边界 · change 提案

- **状态**：Draft → **Aligned**(主人 2026-07-28 确认范围=三处统一 / 形态=内联托管框)→ Shipped
- **定级**:L(跨模块 + 钱)· **配对拆解**:`2026-07-28-hosted-card-fields.plan.md`
- **PRD**:`PRD/NexGrid_产品功能架构设计文档_v3.7.md` §9.2(充值三通道)· §7(商城结账支付方式)

## Why

产品**已经向用户承诺**卡数据由收单方托管,但代码没做到:

| 现有文案(用户可见) | 实际实现 |
|---|---|
| 充值页脚注:「银行卡由 Checkout.com 处理(PCI DSS Level 1),**NexGrid 不会接触你的完整卡号**」 | `topup-card-form.vue` 自己持有 `cardNum` / `cvv` ref |
| 绑卡页:「256-bit TLS · 通过 PCI DSS Level 1 **token 化**」 | `wallet-cards-new.vue` 自己持有 `pan` / `cvv` ref |

这是「声明≠实现」,且是**对用户的不实承诺**——不是新增能力,是让实现追上已有承诺。**文案无需改动**。

次要收益(合规):卡数据的采集范围决定自评问卷档位,而档位按**整个系统**评——只要还有任一处经手卡号,改另外两处不产生任何合规收益。这是三处必须一起改的原因。

数据层已经正确:`store/cards.ts` 只存 `tokenId` + last4 + brand + expiry + holder,注释已写明「完整 PAN 永不存储,对齐 Stripe/Adyen」。**缺口纯在采集层**。

## What changes

新增 `components/me/hosted-card-fields.vue` —— 卡数据在前端的**唯一停留处**:

- 对外只经 `defineExpose({ tokenize })` 交出 `{ token, last4, brand, expiry }`,并 `emit change {ready, brand}`
- 父组件**在代码上真的拿不到** PAN/CVV(不是视觉声明)
- API 形状对齐 Stripe Elements(`change` 事件带 `complete`/`brand`,提交时 `createToken()`)
- PROD 切换 = 只换本文件内部为 SDK 挂载点,三个调用方零改动

三处消费方接入:充值(full 模式)· 绑卡(full 模式)· 商城结账(cvv-only 模式)。

**视觉零变化**:复用各页现有 `fieldStyle`(surface-2 输入块),用户看到的框位置/样式/交互完全一致。

### Out of scope(本次不做,已单列 T6 待你定)

- `card-payment.vue` 用写死假卡 `tok_mock_1` 而非 `useCards()` → 用户绑的卡结账时看不见
- `card-payment.vue` 硬编码费率 `0.035` 而非 `CARD_FEE_RATE` 单源

两条都是真 bug,但根因与本次(信任边界)不同,不混进来。

## Impact

- **页面**:`/pages/me/wallet-topup`(银行卡 tab)· `/pages/me/wallet-cards-new` · 商城结账卡支付
- **store**:无改动(`cards.ts` 已正确)
- **i18n**:无新增 key(现有 `formSecurityNote` / `trustFootnote` 已覆盖)
- **PRD**:§9.2 卡通道补一句采集边界;§7 无需改
- **不变量风险**:① 视觉零变化 → 走查须核对三处渲染与改前一致 ② 卡组织图标依赖 brand 上抛,不能丢 ③ 提交按钮的可用态依赖 ready 上抛,不能变成永远可点

## Done-when(P6 逐条回测)

1. 三处消费方的 `<script setup>` 内 **grep 不到** `pan` / `cardNum` / `cvv` 任何 ref 或绑定
2. 三处页面实景:卡号框照常输入、卡组织图标照常出现、填全前提交按钮禁用、填全后可提交并成功
3. 充值成功后收据号 = 账单 ref = store 记录的 authCode,三处仍同源(不因改造回归)
4. verify 新哨兵:`src/` 下除 `hosted-card-fields.vue` 外,卡数据绑定命中数 = 0;红测(别处加一行绑定)必红
