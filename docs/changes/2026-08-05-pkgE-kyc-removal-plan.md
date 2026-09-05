# 包 E · 删 KYC + 提现地址直管 — 实施拆解

> 规格:`PRD/specs/FEAT-KYC-RM01-remove-kyc-and-pairing.md`(**Signed**,主人 2026-07-31 签字)
> 定级 **L** · 本文是规格要求的「实施拆解」,**待主人签字后才进实现**。
> 规格硬性前置:「实现线**必须先产全量引用清单**(六类逐文件列出,基线 34+ 文件)再动手,**删一类验一类**」。

---

## 一、全量引用清单(2026-08-05 实测,**53 个文件** > 规格基线 34)

| 类 | 数量 | 文件 |
|---|---|---|
| ① 页面 | **11** | `me/kyc.vue`(本体)· `me/me.vue` · `me/security.vue` · `me/support-tickets.vue` · `me/wallet-address-rebind.vue` · `me/wallet-bills.vue` · `me/wallet-exchange.vue` · `me/wallet-topup.vue` · `me/wallet-withdraw.vue` · `store/detail.vue` · `trust/trust.vue` |
| ② 组件 | **9** | `me/verify-row.vue` · `me/profile-row.vue` · `me/complete-row.vue` · `me/receipt-modal.vue` · `me/bill-type-icon.vue` · `genesis/purchase-sheet.vue` · `app-chassis.vue` · `captcha-slider.vue` · `sticky-cta-bar.vue` |
| ③ store/lib/composable/mock | **15** | `store/wallet-pairing.ts` · `store/wallet-pairing-core.ts` · `store/exchange-v3.ts` · `store/bills.ts` · `store/types.ts` · `store/sticky-cta-bar.ts` · `lib/account-scope.ts` · `lib/header-title.ts` · `lib/workload-label.ts` · `composables/use-device-eligibility.ts` · `mock/eligibility.ts` · `mock/faq.ts` · `mock/receipt.ts` · `mock/tickets.ts` · `mock/tradein-config.ts` |
| ④ 路由 | 1 | `pages.json`(`pages/me/kyc` 注册项) |
| ⑤ 文案 | 三语各 **59-63 行** | 含整个 `kycExpress` 命名空间 + `kyc: "实名认证"` / `kycVerified` / `kycPending` 等 |
| ⑥ 脚本哨兵 | **17** | 见下节分类 |

---

## 二、🔴 最险的一处:哨兵会在删机制后**静默变绿**

17 个哨兵按「删了 KYC 会怎样」分类:

| 分类 | 数量 | 处置 |
|---|---|---|
| 🔴 **判据依赖被删对象** | **2** | 见下,必须**先改判据** |
| ✅ 假阳性 | 1 | `selfcheck-checkout-trial-quote.mjs` 命中的是「大括号不**配对**」,与钱包配对无关 |
| ✅ 只在注释/文案里提到 | 14 | 改注释即可,不影响判定 |

**两个真依赖的**:

1. **`selfcheck-rebind.mjs`** — 整个文件的被测对象就是 `store/wallet-pairing-core.ts`。
   删了该文件 → 哨兵 `readFileSync` **直接抛错**。抛错比空转好,但仍需重写为「地址管理」的新判据。
2. 🔴 **`selfcheck-fastlane.mjs`** — **最危险**。它断言提现快车道要检查
   `wallet-pairing.ts` 里的在途提现闸(`pairingSrc.includes("useApp().inFlightWithdrawals.length > 0")`),
   还有一处文件清单硬编码了两个配对文件。删了 store → **扫不到 → 判定「没有违规」→ 静默变绿**。

**因此动手顺序必须反过来**:

```
先改哨兵判据(指向新的地址管理机制)
  → 再删机制
  → 每删一类,立刻验哨兵**还会不会红**(红测,不是看它绿)
```

绝不能「先删完再修哨兵」—— 中间那段窗口里全部哨兵都是假绿。

---

## 三、子任务拆解(每个 ≤1 个上下文,tester pass 才许打勾)

| # | 子任务 | 交付 | 独立验收判据 | 状态 |
|---|---|---|---|---|
| E-0 | **哨兵改判据前置**:`selfcheck-rebind` / `selfcheck-fastlane` 判据从「配对 store」改指「地址管理」 | 2 个脚本 | 🔴 **红测**:把新机制的关键行摘掉,两个哨兵必须转红;删除旧 store 后仍能正常判定 | ✅ 2026-08-05:判据先行落地,机制缺席时双哨兵 exit=1(ENOENT 响亮红);摘行红测 **11/11**(core 8 条 + store 接线 3 条,逐合取项隔离,备份还原非 git checkout);旧 store 删除后 rebind 61/61 · fastlane 115/115 绿 |
| E-1 | 提现地址直管数据模型 + store(`payoutAddress[network]`:current/history/freezeUntil/nextChangeAt) | 新 store + 类型 | 行为固定靶:首次添加 / 更换 / 在途单拦截 / 7 天频控 / 24h 冻结 / **换号不继承** | ✅ `payout-address-core.ts`(纯逻辑)+ `payout-address.ts`(账号作用域 store);固定靶全在 selfcheck-rebind;账号作用域挂 account-scope + verify 哨兵;在途闸问整张列表按网络过滤(fastlane pin) |
| E-2 | 存量迁移:已配对地址 → `source:"migrated"`,无保护期无需重验 | 迁移函数 + 门 | 🔴 固定靶:老数据进入新版后**地址仍在且可直接提现**;迁移失败**不得**静默变成空地址 | ✅ `migrateFromPairing` 三态(empty/migrated/**corrupt**);corrupt 不写空行(selfcheck 固定靶);实景:注入 90 天前配对行 → 刷新 → 地址直显 + source=migrated + **无新保护期**(风控首见按原验证时刻登记)+ 管理页「早期地址 · 自动沿用」标记 |
| E-3 | 提现页 / 地址管理页改造(空态引导、掩码展示、冻结横幅倒计时) | 2 页 | 实景:未设地址 → 引导卡(不是拦截横幅);冻结中 → 倒计时且提交禁用 | ✅ 实景走查全链:空态引导卡 → 添加(OTP)→ 保护期标记+首提审横幅+$50 降额 CTA → $30 免审横幅+费用明细 → 更换(OTP+二次确认,取消不重复消费码)→ 冻结横幅 hh:mm:ss 倒计时 + 提交禁用 + 频控**绝对时刻** + 历史列表;console error=0 |
| E-4 | 删 KYC 机制:验证页 + 路由 + 充值页验证分支 + 兑换 $100 门 + 资格规则里的认证条件 | 11 页 + 15 store | 🔴 `?kyc` 深链**不得 404/白屏**;资格其余条件**不放宽** | ✅ kyc.vue/verify-row/complete-row/wallet-pairing×2 → .trash;pages.json 注销;深链兜底实测:`#/pages/me/kyc` 冷开 → 落安全页+「该流程已下线」toast(+989ms 实抓);`topup?kyc=1` → 正常充值+toast;兑换 kyc-required 门删(日限/汇率不变);资格 kyc-tier 条件从规则集移除(种子规则零使用,其余条件原样) |
| E-5 | 文案三语同删同改;账单类型 `kyc` 值保留但标签中性化 | i18n ×3 | 键镜像门全绿;历史账单**仍可查且看得懂** | ✅ 三语各删 1 namespace(kycExpress)+ 50 keys + 18 处深层长文案改写(条款/风险书/FAQ/工单/兑换 how/团队 how);镜像门 PASS(4524 keys);`bills.typeKyc`→「验证(历史)」`kycVerify`→「验证返还(历史)」(动态渲染路径保留) |
| E-6 | 收口 grep:KYC / 实名 / 认证供应商名 / `?kyc` 全站残留 = **0**(历史数据字段与账单类型值白名单显式列出) | 收口报告 | 🔴 **计数必须打进汇报**,不打数字的「已清干净」一律当未验证 | ✅ 计数(src 全域):**实名=0 · 认证供应商名=0 · KYT=0 · i18n「配对」=0**;kyc 命中 46 条全落白名单四类:①历史数据字段/类型值(bills"kyc"/tickets"kyc"/receipt"KY"+kyc* 字段/i18n 键名)②深链兜底实现(App.vue+topup,8)③规格编号 FEAT-KYC-RM01 变更注释(~18)④子串假阳性(stickyCta 含"kyC"、luckyToday 含"kyT"、二进制 png);另揪出并改写 3 条**无 kyc 字样**的旧叙事漏网(风险书 s6 三语「钱包所有权验证/唯一收款地址/Chainalysis 级」) |

---

## 四、主人拍板(2026-08-05,三条全部按建议定案)

| # | 事项 | 定案 |
|---|---|---|
| 1 | 动手顺序 | ✅ **先改哨兵 → 再删机制 → 每删一类立刻验哨兵还会不会红**。多一轮,换掉「整段窗口所有哨兵都在假绿」 |
| 2 | 与包 G 的先后 | ✅ **串行**:先收口包 G,再做包 E。两者共用提现页 / 首页,并行会交织,出了问题分不清是谁引入的 |
| 3 | 在途 $1 | ✅ **一律返还**,并在注释里标明真后台差异 |

**第 3 条的理由值得记下**:规格写「已侦测到的照常返还,未侦测到的给客服」,但
**mock 期根本没有真的链上侦测** —— 那个分支条件只能写死。写死一个「假装能区分」的判断,
比老实承认「本地区分不了、一律返还」更容易骗到后来的人。这与本项目
「mock 可以,但不许假装有能力」的一贯口径一致。

---

## 五、独立审计(2026-08-06,3 agent 并行,实现方≠验收方)

三视角:资金/状态机 · 删除完整性 · 交互/文案。合计 **0 P0 / 4 P1 / 2 P2**,全部采纳修复并复验:

| 级 | 发现(审计方) | 修复 | 复验 |
|---|---|---|---|
| P1 | 迁移丢弃中途换绑单,主人拍板第 3 条「在途 $1 一律返还 + 注释标真后台差异」未落实(removal) | `migrateFromPairing` 侦测 initiated/verifying 单 → `postMoneyBillsOnce` 幂等返还 $1(bonus 账单,稳定 ref)+ 决议注释 | selfcheck-rebind 新增 4 条固定靶(65/65)+ 红测(摘判定→exit1)+ 实景:余额 +$1 整、账单落盘 |
| P1 | 兑换说明 s3Intro「按认证等级」zh 已改 en/vi 漏改(ux) | en/vi 改写为统一日上限表述 | mirror PASS + 渲染复核 |
| P1 | 换址后管理页「冻结禁提」与「保护期可能需复核」双横幅同屏矛盾(ux) | holdNote 加 `!frozenNow` 门(与提现页既有反冗余同型) | 实景:注入冻结+保护期重叠态 → 仅冻结横幅 |
| P1 | 资料页管理入口不带网络参数,非 TRC20 用户落空态(ux) | `walletNetwork` computed(展示与跳转同源)+ 入口带 `?network=` | 实景:仅 BEP20 设址 → 点入落 bep20 显地址 |
| P2 | 提现页网络 chip 在提交评估窗口可点,漂移被确认后校验无谓拒单(money) | `pickNetwork` 加 `inputsLocked` 守卫(与同页三控件同纪律) | 同型判据对齐,快照+确认后校验兜底不变 |
| P2 | 发码撞账号级冷却且无进行中验证码时仅瞬态 toast,按钮似失灵(ux) | 冷却提示同时落表单常驻红字 | 代码路径复核 |

哨兵同轮进化:selfcheck-claim-idempotency 反向入册门抓到新幂等消费者未登记 → payout-address.ts 入册。终态:tsc 0 · verify.sh 412/0 · selfcheck-rebind 65/65 · fastlane 115/115。

## 六、本文件的由来

规格 §⑦ 要求「实现线必须先产全量引用清单再动手」。本文是该清单 + 风险面分析 + 拆解,
**尚未动任何代码**(实测:`src/pages/me/kyc.vue` 仍在,`pages.json` 仍注册该路由)。
