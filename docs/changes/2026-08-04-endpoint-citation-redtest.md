# 接口引用台账门 · 红测留痕(2026-08-04)

缺陷族:**代码注释里声明的 PROD 接口地址与 PRD 对不上 / 纯属虚构**。同型 ≥3 次,
tsc 与既有 verify 全绿也抓不到 —— 注释不参与编译,死代码更没人读。

机器门:`scripts/endpoint-citation-sentinel.mjs`(两仓各一份)。扫全部**注释行**里的
`/api/…` 引用,对**写在哨兵脚本内**的台账逐条比对。台账刻意不写在被查文件里 —— 否则
改注释时顺手改台账,门等于没有。台账每条注明出处(uniapp = `PRD §X.Y` 或 `TBD: 原因`;
admin-ops = `route: <真实 route handler 文件>` 或 `TBD: 原因`)。

## 三向判据

| 方向 | 触发条件 | 为什么需要 |
|---|---|---|
| ① 代码有、台账没有 | 新接口没登记,或笔误 / 虚构 | 本次 5 处缺陷的主形态 |
| ② 台账有、代码没有 | 台账过期 | 防台账变成只增不减的垃圾场;删注释后台账留假条目 |
| ③ 扫到 0 条 | 扫描判据本身失效 | **空集全过是哨兵最常见的假绿**([[feedback_sentinel_green_without_checking]]) |

## 红测结果

还原一律 `cp` 备份(**禁 `git checkout`** —— 工作树有并发 agent 的未提交改动,
checkout 会连坐抹掉整轮工作)。每靶注入后先 `grep` 自证落盘,**注入未生效即报错终止**;
还原后复跑必须回绿。

### Nexion-uniapp

基线 `exit=0` — 181 处注释接口引用 / 102 个去重地址 / 扫描 396 个源文件 / 台账 102 条(27 条 PRD 未定义)。

> 红测跑完后并发的 staking-CAS 改造把 `stake-sheet.vue` 里 `POST /api/staking/open`
> 那条注释改写掉了,门当场以「台账过期」报红 —— 按流程从台账删除该条,现基线为
> 180 处 / 101 个去重地址 / 台账 101 条。**这正是②方向要的行为**,不是噪声。

| 靶 | 注入 | exit | 判定 | 还原复绿 |
|---|---|---|---|---|
| ① | `src/mock/tradein-config.ts:3` 的 `GET /api/config/tradein` → `/api/config/trade-in` | 1 | PASS(红) | exit=0 |
| ② | 台账加 `POST /api/nonexistent/redtest` | 1 | PASS(红) | exit=0 |
| ③ | `markCommentLines()` 提前 return(注释识别恒 false) | 1 | PASS(红) | exit=0 |

靶①报文:``未登记的接口引用 `GET /api/config/trade-in`(1 处):src/mock/tradein-config.ts:3``
靶②报文:``台账条目 `POST /api/nonexistent/redtest` 在代码注释里已不存在 —— 台账过期``
靶③报文:``扫描 0 命中 —— 判据失效(扫了 396 个文件却一条 /api/ 注释引用都没找到)``

### admin-ops

基线 `exit=0` — 19 处注释接口引用 / 15 个去重地址 / 扫描 348 个源文件 / 台账 15 条。

| 靶 | 注入 | exit | 判定 | 还原复绿 |
|---|---|---|---|---|
| ① | `lib/admin/e6-client.ts:6` 的 `…/compute-config` → `…/compute-cfg` | 1 | PASS(红) | exit=0 |
| ② | 台账加 `POST /api/admin/nonexistent/redtest` | 1 | PASS(红) | exit=0 |
| ③ | `markCommentLines()` 提前 return | 1 | PASS(红) | exit=0 |

## 建门过程中判据自己被抓到一次(值得记)

第一版扫描用**行首前缀**判注释(`^\s*(//|\*|/\*|<!--)`)。靶②的孤儿检查当场把它顶了回来:
台账里 `GET /api/me/bills` 报「代码里已不存在」,回源一看 —— `rewards.vue` 的
`<!-- … -->` 块**续行没有任何前缀**,整片多行注释被漏扫。同理漏掉 `tradein-sheets.vue`
里的 `POST /api/store/checkout`(**虚构**:那是页面路由不是 API)。

改成带块状态的 `markCommentLines()` 后,uniapp 侧多扫出 3 个地址、admin-ops 侧多扫出
12 个 —— 其中就有本次缺陷族里漏网的第 6 处。

教训:**「台账有、代码没有」这一向不只是防台账过期,它同时在反向体检扫描判据本身**。
只做①单向的哨兵,判据缩水时会静默变绿。

## 接线

- uniapp:`scripts/verify.sh` 末尾 `endpoint_citation_gate`
- admin-ops:`scripts/verify.mjs` 的 `GEARS` 表(production build 之前一齿)

## 加新接口引用时怎么办

1. 先查前端 PRD(`D:\WORKS\PLAN\PRD\NexGrid_产品功能架构设计文档_v3.7.md`)/ admin 侧查 `app/api/**` 真实 route。
2. PRD 有 → 注释写成与 PRD **完全一致**,台账登记 `PRD §X.Y`。
3. PRD 没有 → **不许自己编**:注释侧显式写 `TBD` / 候选,台账登记 `TBD: <原因>`。
4. `node scripts/endpoint-citation-sentinel.mjs --dump` 可列出实际扫到的全部引用,用来对齐台账。
