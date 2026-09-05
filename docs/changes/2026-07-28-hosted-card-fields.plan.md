# 卡数据托管边界 · 实施方案

- **配对提案**:`2026-07-28-hosted-card-fields.md` · **PRD**:`PRD/NexGrid_产品功能架构设计文档_v3.7.md` §9.2 / §7 · **定级**:L
- **北极星**:卡号与 CVV 在前端只存在于 `hosted-card-fields.vue` 一个文件里;三个调用方在代码上拿不到,切真收单方时只换这一个文件。
- **状态**:InProgress —— T1-T6 实现完毕 + 机器门过 + 实现方冒烟通过;**等 3 个独立验收人回报后才打勾**(实现方≠验收方)。

## 实现期实测记录(实现方自查,不算验收)

| 项 | 证据 |
|---|---|
| 类型门 | `npm run type-check` 0 错 |
| 卡纯逻辑 | `selfcheck-cards` 27 pass / 0 fail;**4 类变异注入全被抓**(卡组织放宽 / CVV 封顶 / 卡号分组 / 长度门),非假绿 |
| 边界哨兵 | `card-data-boundary` selftest 阳性 8 / 阴性 12 / 0 失败;全量 0 违例(扫 392 文件 / 46 输入框);真文件红测 3 类违例全变红、还原回绿 |
| 全量 verify | 347 pass / 1 fail —— 该 1 fail 是 `/pages/team/network` 零-border,**scoped-stash 后在纯 HEAD 上一模一样复现**,与本改动无关,已单开任务 |
| 充值实景 | 卡号分组 / MC·VISA 徽章 / 越界拦截(橙提示+禁用)/ 支付成功 / **回执号=入金单 authCode=账单 ref 三处同源** / 入金单无明文字段 / console 0 错 |
| 绑卡实景 | 落库 `tokenId=tok_+24hex`(来自 tokenize 而非本地 uuid)· 字段仅 tokenId/brand/last4/expiry/holder/boundAt · **零明文** |
| 结账实景 | 显示真实已绑卡 `Visa •••• 1111`(不再是写死的 4242)· CVV 计数 0/4→3/4 · 2 位不放行 3 位放行 · 手续费 $22.72=649×3.5% |

## nexion-audit ⓪墨菲前置层的产出(动手审之前先列「最可能崩的点」)

两条都是本次改造**自己引入**的,靠「假设它一定崩」翻出来,不是等 agent 报:

| # | 靶子 | 根因 | 修法 | 运行时证明 |
|---|---|---|---|---|
| M1 | 拒付后点重试,整张卡被清空 | vault 只包了表单分支;切失败态 → 分支卸载 → vault 连同已输入卡一起销毁。改造前这些值住在页面组件里,不随分支卸载 | vault 上提包住**全部阶段**;字段无状态、状态在 vault,故字段可随分支来去而值仍在 | ✅ 临时置 `CARD_DECLINE_RATE=1` 强制拒付 → 重试 → 卡号/有效期/CVV/姓名**全部保留**(`4111 1111 1111 1111` · `11/30` · `456` · `RETRY TEST`);测毕已还原,`git diff --stat` 确认该文件只剩 +6 行本职改动 |
| M2 | 挂载时无卡 → 绑完卡回来选中态仍空,CVV 区永不出现 | 选中态是挂载那一刻的**快照**,不随卡列表变化 | 只存「用户显式选了哪张」,生效值派生:显式选择 ?? 默认卡 ?? 第一张 | 待独立验收人覆盖(空态→绑卡→返回路径) |

M1 的修复本身有个新风险(把 vault 上提到根节点会不会破坏 `space-y-3` 的子元素间距),已实测:根容器 5 个子元素,首子 `0px`、其余各 `12px`,间距完好。

## nexion-audit ②层 main 自审的产出(不等 agent,自己逐单元过)

| # | 单元 | 结论 |
|---|---|---|
| A1 | `handleBind` 拿不到 token 时的加载态 | ✅ 无缺陷:`isBinding=true` 设在 null 检查**之后**,按钮不会卡死 |
| A2 | vault 的 provide 面 | 🔴 **哨兵盲区**:`display(kind)` 返回明文,slot 内任何后代 `inject` 一下即可读卡号,而原有两条判据(绑定 / ref 声明)完全抓不到。**边界的真实缺口在注入面不在绑定面** → 已加 `vault-inject` 判据 + 2 条红测样本(现共 10 阳性 / 12 阴性) |
| A3 | `cards.add()` 同 token | 🔴 **真缺口**:mock 的 token 随机所以撞不上,但真实收单方对**同一张卡返回同一个 token**,同卡再绑一次会落两行(列表两条 / remove 删俩 / find 只中头一条)。违反「mock 必须 100% 真后台结构」。已改为「同 token 即更新不新增」。<br>✅ 运行时证明:临时固定 token 为常量 → 同卡绑两次 → 只留 1 行且内容更新为最新;测毕已还原,`grep TEMP-REDTEST\|deadbeef` = 0 |

## 独立验收人回报

| 验收人 | 范围 | 结论 |
|---|---|---|
| tester-B | 商城结账卡支付(12 条 AC) | **12/12 PASS**。关键:① 显示真实已绑卡 `Visa •••• 1111`,全站 0 处 `4242` ② **费率单源实测** —— 常量改 5% 后三处文案 + 两个金额全部同步,无一滞后 ③ 哨兵红测确认非假绿 ④ 三语 × 三步共 9 个采样点无 `{rate}` 字面量残留 |

tester-B 的两条附注:
- AC4 措辞偏差(判 pass 未判 fail):按钮文案是「输入 CVV」,而「输入 CVV 完成支付」是字段标签;两者都在屏上、按钮确实禁用,实质成立。
- 范围外:`checkout.vue:269-272` 支付方式副标硬编码英文,zh/vi 下不翻译;**且 `en.ts:1791-1792` 已有两个对应 key 无人消费**。已另开任务,未并入本轮。

## 范围外顺带收口(同一根因,按「修一处必全站排查同类」)

- 费率写死不止 T6 写的 1 处:**代码 4 处 + 文案 9 条**(`checkout.vue` 另有 2 处 `0.035`;i18n 三语各 3 条把 `3.5%` 写死)。全部改走 `CARD_FEE_RATE` / 新增的 `cardFeeRateLabel()` 单源。
- `selfcheck-cards` 接进 verify 的已有 money selfcheck 家族(deposits · fx · rebind · cards),不另起门。
  ⚠️ 过程教训:我先用 `grep "selfcheck-deposits"` 判断「没接线」→ 假阴性(脚本名是 `scripts/selfcheck-$sc.mjs` 拼出来的,字面量不存在),据此多加了一道重复的门,靠输出里重复两次才发现。**判「有没有接线」不能只 grep 字面量,要看构造式调用。**

## 待报主人(不在本次范围,已记)

- `checkout.vue` 的 `PAYMENT_METHODS` 四条副标全是硬编码英文(`Lowest fee · 5 min` 等),违反 i18n 不硬编码不变量。本次只把其中的费率改成单源派生,i18n 化未做。

## 子任务

## 子任务

### [ ] T1 · 建 hosted-card-fields 共用组件
- **范围**:`src/components/me/hosted-card-fields.vue`(新增,1 个文件)
- **AC**:
  - AC1:Given 组件以 `mode="full"` 挂载,When 用户依次填入卡号/有效期/CVV,Then 每次输入都 `emit change {ready, brand}`,且 brand 随卡号前缀正确变化(4→visa / 5·2→mastercard / 34·37→amex / 62→unionpay)
  - AC2:Given 字段未填全,When 父组件调 `tokenize()`,Then 返回 `null` 且不产生 token
  - AC3:Given 字段填全,When 调 `tokenize()`,Then 返回 `{ token, last4, brand, expiry }`,其中 last4 = 卡号后四位,token 形如 `tok_*` 且两次调用不重复
  - AC4:Given `mode="cvv-only"`,When 渲染,Then 只出 CVV 一个框;`tokenize()` 返回 `{ cvvToken }` 形态,不含 last4/brand
  - AC5:组件外部**无法**读到 PAN/CVV——`defineExpose` 只暴露 `tokenize`,无 PAN/CVV 的 props 回传或 v-model
- **测试指令**:5173 · `?nx_device=off` · 组件级先用充值页挂载点验;brand 用测试卡号前缀 4/51/34/62 各试一次
- **敏感度**:🔴 钱(加 code-review agent)
- **tester 报告**:
- **回源三问**:

### [ ] T2 · 充值卡表单接入(full)
- **范围**:`src/components/me/topup-card-form.vue`
- **AC**:
  - AC1:`<script setup>` 内 grep 不到 `cardNum` / `cvv` / `expiry` 的 ref 与 input 绑定
  - AC2:Given 打开充值→银行卡,When 只填金额未填卡,Then 提交按钮禁用态(灰底 + 无按压反馈),与改前一致
  - AC3:Given 金额与卡信息全填妥,When 提交,Then 走 processing→3DS→success,收据行显示的授权号 = store 记录的 `authCode` = 账单 ref(三处同源不回归)
  - AC4:Given 金额越界($30 下限 / $5,000 上限),When 输入,Then 限额提示转警示色且按钮禁用(改前行为保持)
  - AC5:卡组织图标(CardBrandBadge)仍随卡号前缀出现,位置与改前一致
- **测试指令**:5173 · `/#/pages/me/wallet-topup` → 银行卡 tab · `?nx_device=off`
- **敏感度**:🔴 钱(加 code-review agent)
- **tester 报告**:
- **回源三问**:

### [ ] T3 · 绑卡页接入(full)
- **范围**:`src/pages/me/wallet-cards-new.vue`
- **AC**:
  - AC1:`<script setup>` 内 grep 不到 `pan` / `cvv` 的 ref 与 input 绑定
  - AC2:Given 卡信息填全 + 持卡人姓名,When 点绑定,Then `useCards().add()` 落库的记录含 tokenId/last4/brand/expiry/holder,且 **不含** PAN/CVV 字段
  - AC3:Given 字段未填全,When 点提交,Then 按钮显示禁用文案且 `aria-disabled="true"`(改前 a11y 行为保持)
  - AC4:Given `?trial=1`,When 打开,Then 自动扣款披露区照常显示(不被改造波及)
  - AC5:绑定成功后返回卡列表,新卡以 `•••• {last4}` 正确显示
- **测试指令**:5173 · `/#/pages/me/wallet-cards-new` 及 `?trial=1` · `?nx_device=off`
- **敏感度**:🔴 钱(加 code-review agent)
- **tester 报告**:
- **回源三问**:

### [ ] T4 · 商城结账 CVV 复验接入(cvv-only)
- **范围**:`src/components/store/card-payment.vue`
- **AC**:
  - AC1:`<script setup>` 内 grep 不到 `cvv` ref 与 input 绑定
  - AC2:Given 已选卡但 CVV 未填,When 看付款按钮,Then 显示「输入 CVV 完成支付」且不可点(改前行为保持)
  - AC3:Given CVV 填 3-4 位,When 点付款,Then `emit complete` 正常触发,结账流程走通
  - AC4:CVV 字符计数(`n/4`)与聚焦态样式保持改前表现
- **测试指令**:5173 · 商城 → 任一商品 → 结账 → 选卡支付 · `?nx_device=off`
- **敏感度**:🔴 钱(加 code-review agent)
- **tester 报告**:
- **回源三问**:

### [ ] T5 · 哨兵接线 + 红测
- **范围**:`scripts/verify.sh`(+ 必要时 `scripts/` 下新增哨兵脚本)
- **AC**:
  - AC1:哨兵断言 `src/` 下除 `hosted-card-fields.vue` 外无卡数据绑定(判据:`:value="pan|cardNum|cvv"` 及同义绑定形态),PASS 行**打印扫描样本量**(扫了几个 .vue),防判据失效导致空集全过
  - AC2:红测——在任一其它 `.vue` 临时加一行 `:value="cvv"` → 哨兵必须 FAIL;移除后回 PASS(红绿都测,不只测绿)
  - AC3:`bash scripts/verify.sh` 全量仍全绿
- **测试指令**:`cd Nexion-uniapp && bash scripts/verify.sh`;红测用 scratchpad 备份原文件再还原(禁硬删)
- **敏感度**:普通
- **tester 报告**:
- **回源三问**:

### [ ] T6 · (待主人定)结账页两处存量 bug
> 与本次根因不同,签字时决定并入还是另开任务。
- **范围**:`src/components/store/card-payment.vue`
- **内容**:① 写死假卡 `tok_mock_1` → 改接 `useCards()`,用户绑的卡结账可见 ② 硬编码费率 `0.035` → 改走 `CARD_FEE_RATE` 单源

## 总回测(全部打勾后才进)
- [ ] 全量机器门:`npm run type-check` 0 + `bash scripts/verify.sh` 全绿
- [ ] nexion-audit(④对抗层 skeptic agent)confirmed P0=P1=0
- [ ] 独立端到端走查 agent 报告(三处页面 + 双语 + console 0):
- [ ] done-review 6 维(证据全部来自 agent / 机器产出)
- [ ] 提案 4 条 Done-when 逐条打勾
