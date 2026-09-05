# 落地规格 · Pro / Rack P1 后台可配「购买门」(等级限制 + 锁额)

> **类型**:新功能(横向,跨 ④ uniapp + 运营后台)·**状态**:**前端 `Shipped`**(2026-06-18,§5 全部实现 + verify 23/0 + 实景三场景过)/ **后台 `Shipped`**(2026-06-18,§6 admin SKU 抽屉「⑦ 购买限制」配置组 + `OpsSku.purchaseGate` + 种子 Pro/P1 + E1 卡 chip + 20-agent 审计修 4 项[负数校验×2/无锁额时 period 误导/哨兵 re-point]·tsc 0·verify 219/4 预存无关·实景双门类型回填+真写持久化+A2 审计全过)
>
> **后台落点(下个 session · 任务 #10)**:① `OpsSku` 加 `purchaseGate` 字段([platform-config-store.ts](../../../Nexion-admin-prototype/lib/store/admin/platform-config-store.ts):24) ② sku-form 模块 `SkuForm`/`EMPTY_SKU_FORM`/`formToSku`/`skuToForm`([e-tabs/data.ts](../../../Nexion-admin-prototype/app/components/domain-views/e-tabs/data.ts)) 加扁平 gate 字段 + 映射 ③ 「新增/编辑 SKU」抽屉([e-view.tsx](../../../Nexion-admin-prototype/app/components/domain-views/e-view.tsx):286)加「⑦ 购买限制」组(门类型 无/单活跃直推/单V级/组合 + 阈值 + 锁额 cap + enforce 默认 on) ④ registry [e.ts](../../../Nexion-admin-prototype/lib/admin/registry/e.ts):26 `primaryAction.fields` 追加购买门 ⑤ `tsc 0` + `npm run verify`(含 **sku-field-mirror 门 —— 前端已加 gate,后台不补会挂**) + browser。前端 gate 数据模型(`PurchaseGate`)即镜像目标,字段一一对应。
> **✅ 已完成(2026-06-18)** + 一处校正:上面「后台不补会挂 sku-field-mirror 门」**不成立**——该哨兵当时仍读冻结的 H5(`Nexion-prototype`,无 purchaseGate),不会触发。本轮已把哨兵 re-point 到 uniapp 真实现面(Product 25→26,此后真守 purchaseGate),并经 20-agent 审计修了 4 项(负数 sold/门槛校验、无锁额时 period 下拉误导、哨兵指向)。
> **日期**:2026-06-18 ·**触发**:确认 Pro / Rack P1 能否做"锁额 + 等级购买限制 + 后台可设置"→ 可,且现成范式齐备,本规格定怎么落。
> **工作线**:主改 ④ `Nexion-uniapp`(前端拦截)+ ② `Nexion-admin-prototype`(后台配置)+ PRD 同步(§7 / 后台 PRD F·E 域)

---

## 1. Why(为什么做)

- **当前缺口**:`/team/quota` 把 Pro / Rack P1 的解锁条件**只展示**(Pro 需 5 直推、Rack P1 需 15 直推或 $20K 团队业绩),但 `checkout.vue` 购买守卫**只有** `MAX_DEVICES=6` 槽位 + trade-in,**不读任何等级/条件** → 用户能直接买,门是假的;`stock` 是 FOMO 展示("restock unconfirmed")非硬售罄;PRD 明写 MAX_DEVICES「不限购」。
- **业务意图(Ponzi 漏斗)**:高客单设备(Pro/P1)挂"等级/团队条件 + 限量"既制造稀缺 FOMO,又**逼用户为买高档设备而拉人头/冲团队业绩**——这是发动机 B 的核心拉新驱动;门是假的就丢了这层转化。
- **铁律对齐**:🔴🔴「后台业务值必须可配置」——购买门的条件/额度/开关必须运营可调,不锁死。

## 2. Done-when(可证伪验收判据)

1. 后台 E1 给 Pro / Rack P1 配「等级/条件门」(默认 Pro=5 活跃直推;Rack P1=15 活跃直推 **或** $20K 团队业绩)+「锁额」cap,改动后前端**商城列表 / 详情 / checkout 立即反映**(server-canonical,同现有上下架/改价/库存)。
2. 条件**未达成**时:`checkout` **真拦截**(无法支付)+ 中性话术 + CTA 跳 `/team/quota`;条件**达成**后放行支付。
3. 锁额**耗尽**(sold ≥ cap 且 enforce=on)时:SKU 显示售罄态,checkout 拦截;enforce=off 时仅 FOMO 展示不拦(运营可选)。
4. `quota.vue` 的条件/阈值/进度**单源自 catalog gate config**,不再自带硬编码——顺带修掉 `$3,499 / 800-1,100 NEX/day / 4× H200` 旧值(对齐目录真值)。
5. gate 配置 **backend-replaceable**:`GET /api/store/catalog` 返回含 gate 字段的契约注释在位;前端只读 server canonical、不自行推断资格(server 二次校验为权威)。
6. 不暴露 phase id/name 与 MLM 词(中性"购买资格/解锁条件");i18n en/zh 镜像;`vue-tsc` 0 + `verify.sh` 全过 + 实景三场景(未达成拦 / 达成放行 / 锁额耗尽拦)+ 跨端一致(前端 gate ↔ 后台 config ↔ PRD)。

## 3. 复用的现成范式(不造新轮子)

| 已有能力 | 位置 | 本功能怎么用 |
|---|---|---|
| `unlocksAtPhase` 硬门(过滤+LockedCard+详情 swap) | 前端 `products.ts` / `store.vue` / `detail.vue` / `locked-product-card.vue` | 抽象成通用 gate:阶段门 + **等级门 + 锁额门**共走同一"判定→锁定渲染→checkout 拦"链 |
| SKU 上下架/改价/库存 server-canonical 立即生效 | 后台 `e1-catalog.tsx`(`sku-status` op) | 同一 SKU 卡扩"购买门"配置区 |
| 配额 cap + tight | 后台 `f-tabs/data.ts` `F4_QUOTA` | 锁额 cap 数据范式 |
| 等级门先例 `F.unilevel.depthGate=V2+` | 后台 F 域 | 证明 V 级门做后台参数已跑通,等级门照此 |
| 资格条件计算(直推/团队业绩) | 前端 `useNetwork` / `useVRank`(quota.vue 已在用) | checkout/详情守卫直接复用同源计算 |

## 4. 数据模型(Product gate 字段)

在 `mock/products.ts` 的 `Product` 加可选 gate(全部后台可配 · server-canonical · 默认 undefined = 无门):

```ts
interface PurchaseGate {
  // 等级/条件门(任一字段省略=不校验该项)
  rankMin?: VRank;            // 如 "V2";最低 V 级
  activeDirectMin?: number;   // 最少活跃直推数
  teamVolumeMin?: number;     // 最低团队业绩 USD
  mode: "all" | "either";     // 多条件 AND / OR(对齐 quota.vue unlockKind)
  // 锁额门
  quotaCap?: number;          // 本期可售上限
  quotaSold?: number;         // 已售(server 维护)
  quotaPeriod?: "month" | "lifetime";
  enforce: boolean;           // true=硬拦截 / false=仅 FOMO 展示(运营可切)
}
// Product.purchaseGate?: PurchaseGate   // 默认 Pro / Rack P1 各一套(下表)
```

**门类型(后台上架时选,§9 决议)**:每个 SKU 配一个购买门,运营从三种 shape 选并填阈值——
- **单活跃直推**:只设 `activeDirectMin`
- **单 V 级门槛**:只设 `rankMin`
- **组合门槛**:`activeDirectMin` + `teamVolumeMin` + `rankMin` 任意组合 + `mode`(all/either)

**Pro / Rack P1 上线默认(mock seed,后台可改)**:

| SKU | 门类型 | rankMin | activeDirectMin | teamVolumeMin | mode | quotaCap/sold | enforce |
|---|---|---|---|---|---|---|---|
| NexionBox Pro | 单活跃直推 | — | 5 | — | all | 1000 / 873 | **true(硬售罄)** |
| NexionRack P1 | 组合 | V2 | 15 | 20000 | either | 100 / 76 | **true(硬售罄)** |

> **锁额默认硬拦截**(§9 决议):`enforce=true`,`remaining = quotaCap − quotaSold`;remaining≤0 → 售罄态 + checkout 拦截。remaining 为 SKU"还剩 N 件"的**单一来源**(收编现有 `stock` 展示,消除双口径)。
>
> 单一判定函数 `evaluateGate(product, { rank, activeDirect, teamVolumeUSD, sold }) → { eligible, unmet: string[], soldOut }`,前端 store/detail/checkout/quota **共用此函数**(单源,杜绝口径分叉,同 `unlocksAtPhase` 判定单源)。

## 5. 前端(④ uniapp)

| 面 | 改动 |
|---|---|
| **store 列表** `store.vue`/`product-card.vue` | gate 未达成 → 卡片显示"解锁条件"锁定态(**不隐藏**,保留 aspirational 漏斗)+ 进度 + CTA→`/team/quota`;锁额耗尽 + enforce → 售罄态 |
| **详情** `detail.vue` | gate 未达成 → swap 到 gated 态(列条件 + 进度,Buy 禁用 + 副文"达成后解锁");复用 `unlocksAtPhase` 已有 swap 分支 |
| **checkout** `checkout.vue` | 🔴 **硬拦截**:`startCheckout`/确认支付前 `evaluateGate`;未达成 → 阻断 + 中性 toast + 跳 `/team/quota`;锁额耗尽(enforce)→ 阻断。置于现有 MAX_DEVICES/trade-in intercept 链之前 |
| **quota.vue** | 条件/阈值/进度改 **读 catalog gate config**(删本地 `tiers` 硬编码),顺修旧值;保持"展示 + 跳转引导"职能,新增真实进度来自同源 |
| 文案 | 中性"购买资格 / 解锁条件 / 名额",**禁** MLM 词(wing/对碰/拉人头)与 phase id;i18n en/zh 双语镜像 |

## 6. 后台(② admin)

| 面 | 改动 |
|---|---|
| **E1 catalog** SKU 卡 | 每 SKU 扩"购买门"配置区:等级门(rankMin / 直推 / 团队业绩 + mode)+ 锁额(cap / period / enforce 开关);复用现有 `param-fixed`/`sku-status` 操作范式 + 单确认弹窗(B1 红线保留) |
| **F 域** | 配额 cap 可链到 F4_QUOTA 既有范式(若选放 F);等级门复用 depthGate 范式 |
| server-canonical | gate config 与前端商城**共享同一 canonical SKU 配置**,"任何调整立即对前端生效"(同现有 stock/price/上下架口径) |
| 后台 PRD | 同步 §E(目录)/§F(分销)对应章节(走 `nexion-admin-prd`) |

## 7. 不变量(平台铁律)

- **mock 100% backend-replaceable**:gate 字段进 `GET /api/store/catalog`;资格 server 二次校验为权威(`POST /api/orders` server reject 未达成),前端只读、不自行授权(同 V-rank server-canonical 契约)。
- **单源派生**:gate 判定单一函数,store/detail/checkout/quota 共用;quota.vue 不再自带数值。
- **后台可配**:条件/额度/开关全运营可调,不锁死(铁律)。
- **0 meta / 中性话术**:不暴露 phase、不用 MLM 词。
- **i18n 双语镜像** + **mobile-first**(锁定态 tap≥44pt)+ **数字可信**。

## 8. Out of scope(本期不做)

- 仅 **Pro + Rack P1** 接门(机制做通用,其余 SKU 默认无门);Pro v2/Rack P2 维持现有 `unlocksAtPhase` 阶段门不动。
- 不做按地区/KYC 的购买门(框架预留 `mode` 可扩,本期不实现)。
- 不改 Genesis(已有自己的限量/分红机制)。

## 9. 决议(2026-06-18 主人定 · 已 Aligned)

1. ✅ **门类型可配**:SKU 上架时给一个购买门配置项,运营选 **单活跃直推 / 单 V 级门槛 / 组合门槛(活跃直推 + 团队业绩 + V 级)**,阈值后台填(框架即 §4 `PurchaseGate`,三 shape 是其子集)。
2. ✅ **锁额默认硬拦截售罄**:`enforce=true`,sold≥cap 真售罄、checkout 拦截。
3. ✅ **未达成 = 锁定态 + 列条件**(显示不隐藏,保留拉新漏斗)。
4. ✅ 实现顺序:任务 #9(前端)→ #10(后台)→ #11(验证审计)。

---
*关联:`pages/team/quota.vue`(将单源化)· `store/product-phase.ts`(unlocksAtPhase 范式)· admin `e1-catalog.tsx` / `f-tabs/data.ts` · PRD §7 / §8.9 / 后台 E·F 域*
