# 个人中心「我的奖励」入口 + 红点 · Change Proposal

- **工作线**:④ uniapp
- **日期**:2026-07-09
- **状态**:Shipped(主人 2026-07-09 验收;PRD §11.5a 已同步)
- **规格**:`PRD/specs/FEAT-ME01-rewards-entry-reddot.md`(三位一体,spec-lint --strict 过)

## Why
「我的奖励」页(`/me/rewards`)已实现并入 PRD §11.5a,但入口从未落地(PRD 写的「赚取」分组在实现里不存在)→ 孤儿页:用户领完优惠券后无处查看。

## What changes
- `/me`「账户」分组宫格新增「我的奖励」项(占原「风险提示书」格位,分组保持 8 项 2×4),跳 `/me/rewards`。
- 入口红点:有未使用有效券 **或** 有新入账奖励(账单奖励类条目 ts > 上次查看时间)时,图标右上小圆点;打开奖励页即记录已读,奖励侧红点熄灭,券侧红点持续到券用掉 / 过期。
- 「风险提示书」项移入「帮助与支持」分组末位(6→7 项),行为不变。
- **Out of scope**:不改 `/me/rewards` 页面本体;不改风险提示书页面与强制确认逻辑;入口不加数字角标 / meta 计数(红点即可,需要再加)。

## Impact
- **页面 / 路由**:`pages/me/me.vue`(quickSections 增删项 + dot 渲染)、`pages/me/rewards.vue`(打开时标记已读);无新路由。
- **Store / model**:新增 `store/rewards-seen.ts`(`rewardsSeenAt` 已读水位,持久化;真后台 = 用户档案字段 + `PATCH /api/me/rewards/seen`,server-canonical)—— 🔴 backend-replaceable。红点派生与奖励页分区共用同一奖励条目判定(单源)。
- **i18n**:`me` namespace 加 `rewardsRow` key(en/zh 同序镜像)。
- **设计**:QuickItem 加 `dot` 变体(纯圆点,区别于数字 badge);token 用 `--v5-*`,走 `nexion-design`。
- **PRD 章节**:§11.5a 入口句修订 + 红点规则 —— P7 `nexion-prd-sync` 同步对象。
- **不变量风险**:双语镜像;mock 可接真(已读水位 server-canonical);mobile-first(宫格项 tap 区不变)。

## Done-when
- [x] `/me`「账户」分组渲染「我的奖励」项,点击实际落在 `/me/rewards`(运行时导航验证 ✅ 2026-07-09 Playwright)。
- [x] 持有 ≥1 张已领未用有效券时入口红点可见;该券标记使用后(无未读奖励前提)红点消失(✅ 注入 claim → dot=1;置 usedAt → dot=0)。
- [x] 账单新增一条奖励类入账 → `/me` 红点出现;打开 `/me/rewards` 返回后(券侧为 0 时)红点消失(✅ 水位双向实测:ts>seenAt 亮、markSeen 后灭)。
- [x] 「风险提示书」从「账户」分组消失、出现在「帮助与支持」分组,点击仍达 `/me/risk-disclosure`(✅ accountKeys 枚举 + 点击落地实测)。
- [x] 新增文案 en/zh 镜像,verify i18n 哨兵过;硬编码 grep = 0(✅ verify.sh 174/174;双语 label 实景切换;附加:dark/light 双主题红点均可见)。

## v2 修订(2026-07-09 主人口述:多层级 IA)

**What changes(v2)**:`/me/rewards` 改 L1 类别汇总(优惠券张数 / USDT 累计 / NEX 累计,三行常显);新增 L2 `/me/rewards/list?cat=voucher|usdt|nex`(pages/me/rewards-list)——券页沿用原样式,USDT/NEX 记录页一屏 10 条滚动自动续载(receipts 同款哨兵);非法 cat 回退 voucher。红点/已读水位逻辑不变(已读写在 L1)。

**Done-when(v2,全部 ✅ 2026-07-09 Playwright)**:
- [x] L1 三行数值与持久层逐分对账(+$32.50 / +5,380 NEX 与 storage 求和精确一致;成就补发入账实时反映)。
- [x] L2 usdt 分页:每批 +10,滚动容器(.nx-scroll)触底自动续载至 21/21;每批严格 10 条。
- [x] `?cat=bogus` 回退优惠券视图不白屏;L2→L1→me 返回链逐级正确。
- [x] 两轮审查 APPROVE(P0=P1=P2=0);LOW 2 条已修(bills.add 时钟单源化 + secSystem 死键删除)。
- 备注:全零空态 hint 行为模板级 v-if 验证(测试 profile 的成就 store 会自动补发奖励,真全零仅存在于全新账号);零值格式化(0 张可用 / +$0.00)已实景验证。
