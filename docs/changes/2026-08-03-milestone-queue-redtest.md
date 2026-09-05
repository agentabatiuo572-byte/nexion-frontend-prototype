# 2026-08-03 — 里程碑庆祝队列门红测记录(selfcheck-milestone-queue)

背景:三路独立走查(结算 / 试用 / 提现)各自撞上里程碑庆祝弹层抢戏,同族定案。
修法:`.ms-overlay` 9300→8900 降层 + `active` 单槽改 `pendingCelebrations` 队列 +
钱链路路由挂起(只压 UI,奖励/记账不受牵连)。机器门 `scripts/selfcheck-milestone-queue.mjs`
焊进 `scripts/verify.sh`(milestone_queue_gate)。

红测纪律:按合取项**逐个隔离**注入;注入形态取自真实事故现场;还原一律 `cp` 备份
(备份于 scratchpad `fix-milestone/backup/`,**未用 git checkout**);每次还原后复跑复绿。
基线:27 pass / 0 fail。

| # | 注入(事故形态) | 注入点 | 预期红 | 实际红(FAIL 行) | 其余族 | 还原后 |
|---|---|---|---|---|---|---|
| R① | 白名单漂移:删 `pages/store/checkout` 前缀(路由改名后白名单静默失效) | `milestones.ts` MONEY_FLOW_ROUTE_PREFIXES | ①族 checkout 见证断言 + ④「钱链路路由全命中」(同一合取项的两个见证面) | 4 条:①[checkout] 挂起 / ①挂起覆盖 3/4 / ①显示中闯入(经 checkout) / ④钱链路路由全命中 — pages/store/checkout | ②③与其余④全绿 | 27/0 ✅ |
| R② | 单槽回归:`show()` 改回 `pendingCelebrations.value = [milestone]` 覆盖写(事故原形:第二级覆盖第一级) | `milestones.ts` show() | ②族全部 | 7 条,全部为 ② 前缀(队列保两条 → ["earn-500"];离场第一条 → earn-500;总量 ["earn-500"]) | ①③④全绿 | 27/0 ✅ |
| R③ | z-index 回归:`.ms-overlay` 8900→9300(事故原值) | `milestone-celebration.vue` | ③两条不等式 | 2 条:③.ms-overlay < .nx-mask / ③.ms-overlay < .nx-toast-host(③解析断言仍绿,值照常解析) | ①②④全绿 | 27/0 ✅ |
| R④ | 白名单过宽:追加 `pages/index/index`(「演示期先把首页也压了」式事故) | `milestones.ts` MONEY_FLOW_ROUTE_PREFIXES | ④普通页即时弹 + ④不误伤 | 2 条:④普通页照常即时弹 / ④白名单不误伤普通路由 — pages/index/index | ①②③全绿 | 27/0 ✅ |

判据自身也测过:③ 的 z 值解析若找不到 selector 直接 FAIL(样本量 3 selector 打进 PASS 行),
不存在「空集全过」假绿;①②④ 均为行为断言(esbuild 载真 `src/store/milestones.ts` 跑正主),
不是词法哨兵。取样路由刻意错开(①用 4 条钱链路,②钱链路相用 trial、离场用 pages/me/me,
④用 pages/index/index),使每条注入的红集合不跨族串染。

奖励/UI 分离的跨文件半边由 ① 的 App.vue 源结构断言把守:pollMilestones 体内
markFired→creditNex→bills.add→show 四步齐且有序、无 isMoneyFlowRoute / stopMilestonePoll
接线 —— 任何把「挂起」焊到奖励侧的改法(= 变成钱链路期间不发奖励)会当场红。
