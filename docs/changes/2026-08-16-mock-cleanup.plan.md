# 生产化清扫(mock 脚手架全退役)— 台账与执行大纲

> 状态:**⏸ Signed-then-Deferred** — 主人 2026-08-16 签字「按 P0-P7 顺序走」,同日改令**延期至「所有前端优化完毕」**再启动。
> 本文件 = 清扫战役唯一权威台账;重启时新会话从这里续跑,勿重做侦察。
> 背景:生产级定调(本仓 CLAUDE.md 架构节)+ push 纪律(远端只收纯净生产代码,主人 2026-08-16 令)。

## 重启条件与重启时拍板项

1. **触发** = 主人宣布「前端优化全部完成」。
2. 🔴 **重启时必须先解决的拍板**(P0 已查明,本机无解):清扫后前端数据源从哪来——
   A. 主人给远程沙箱地址(改 `VITE_NEXGRID_API_PREVIEW_TARGET` 指过去,零安装,依赖对端在线);
   B. 后端运行件装本机(jar + JDK17 + MySQL + Redis + MinIO,一次性置办后独立);
   C. 后端 docker 一键包(若存在,最干净)。
3. 执行载体 = **专用新会话 + 自建全新 worktree**(`git worktree add .claude/worktrees/<新名> -b pkg/<新字母>-<短名> origin/UniApp`)。🔴 严禁复用在册 worktree(2026-08-16 已实测共树撞车:两会话互卷未提交改动)。
4. 在途包排空:开工前 `git branch -a` 核对无超前于远端的活跃 pkg 分支,主检出与远端对齐。
5. 🔴 **8 个「无后端对位」功能逐项拍板**(见附录 B):清扫后这些功能会直接消失,届时每项三选一——后端补接口 / 功能下架 / 改纯客户端形态。

## P0 侦察成果(2026-08-16,有效期注意:代码面会漂移,重启时按「方法」重扫)

### 后端事实
- 沙箱/生产后端 = 兄弟仓 `nexion-backend`(Java,:8110),**不在 PLAN 工作区,也不在本机**(D:\nexion、D:\workspace、D:\software 均不存在,本机无 java)。
- 08-15 全绿验收(在另一台机器完成):App 门链 441/0/0、后端 Maven 3748 测试 0 失败、真实/Mock/HOLD 覆盖矩阵——见 admin-ops 仓 `docs/验收报告/APP剩余模块真实接口验收-20260815/FINAL-REPORT.md`(§3 矩阵 = 哪些数据服务端真实/哪些沙箱 Mock/哪些生产 HOLD 的权威口径)。
- admin-ops 起后端的现成写法:`scripts/acceptance/g-final9-disposable.ps1`(java -jar + MySQL/Redis/MinIO 全套参数)。
- 本仓另有 `scripts/dev-stub-backend.mjs --port 8110`(门测试专用桩,非全量后端,勿混淆)。

### mock 面硬数字(2026-08-16 快照,远端 f130316)
- `src/mock/` 20 文件,**两种性质混居**:真配置(生产逻辑 import 的单源:products/tradein-config/platform-config/eligibility/phone-tiers/tokens 等)vs 捏造数据(storefront-social-proof/conversations/sponsors/ai-clients/leaderboard/events/achievements/globe-regions 等)。清扫 = 真配置迁家 + 捏造数据删除,不是一删了之。
- API 三模式 mock|sandbox|remote(`src/api/runtime.ts` 十余能力旗标;mock-auth-api、funds-sandbox-api 适配器)。
- dev-only 入口残留 2 文件(replay-tour / nx_device 族);任意 6 位验证码;sandbox i18n 键。
- `scripts/` 225 个门脚本 = CI 资产,不进构建产物(P6 验证此断言即可,勿删)。
- `.env.acceptance-h5` / `.env.example` 无密钥,gitignore 白名单刻意设计,保留。
- 远端已清项:`.trash` 误入库台账已摘(f130316);「反向教育样本」定位语已全域清(活文档层)。

## 执行大纲(P0-P7,已签字)

| 期 | 内容 | 关键点 |
|---|---|---|
| P0 前置 | 在途包排空 + 数据源拍板落地(上节)+ 后端可达性实测 | 硬前置,过不了就停 |
| P1 焊门(先门后扫) | `build:h5` 产物 mock 指纹=0 门 + src 静态门(mock import 白名单收敛,构造性判据)+ 红测证明门真会红 | 覆盖类任务铁律:先门后存量 |
| P2 mock 二分 | 真配置迁 `src/config/`(或服务端下发);捏造数据删除;**逐文件定性表先给主人过目再动手** | 单源消费面全扫 |
| P3 模式收敛 | mock 模式退役,runtime 收敛 remote+sandbox;mock-auth/任意验证码删除;`remoteApiEnabled` 守卫链按 store-unreachable-code-gate 整链清 | 本地开发改起沙箱后端 |
| P4 dev-only 入口 | replay-tour / ?nx_device=off / demoLifecycle* 删除或 build-time 剔除(含 i18n 键) | |
| P5 捏造性展示(产品语义,单列) | 假社会证明(「今日 247 人已领取」)、live ticker 假名单、假在线数:**逐项列表给主人拍板**(接真数据/删除/运营保留) | 不是纯工程题 |
| P6 测试壳隔离 | test:legacy-suite 等 mock 壳 CI 保留,机器证明不进生产构建;verify 运行时哨兵改打沙箱靶 | |
| P7 收尾 | 打包审计(zip 产物抽查)+ PRD/更新日志/交接书三处记录 + 全量门 + nexion-audit 独立审计 | |

每期 = 独立包分支 + 全套门(tsc/verify/独立 tester/实景),顺序执行。

## 顶层 Done-when

1. `npm run build:h5` 产物内 mock 指纹 grep = 0(机器门,红测过);
2. `src/mock/` 目录不存在;`api/runtime.ts` 无 mock 模式;
3. 前端在「沙箱后端可达」条件下全功能可跑,verify 全绿(靶=沙箱);
4. 生产 remote 模式行为与清扫前逐页 diff 无回归(独立走查);
5. 假社会证明类逐项按主人拍板处置完毕,生产面每个数字有真数据源;
6. GitHub 主线从此纯净,push 前自查清单(无新增日志/截图(约定外)/临时物/密钥)常态化。

## 风险登记

- 🔴 后端不可达 → 前端断粮(重启拍板项 2 解决前不许动存量);
- 🟡 与在途包冲突 → 排空后独占;
- 🟡 捏造数据删除改变页面观感(空态变多)→ P5 逐项拍板吸收。

## 附录 A:前端 API 调用面总账(2026-08-16 枚举,数字会漂移,重启时按方法重扫)

- **分母 = 183 个接口**(remote ∪ sandbox;去重口径 METHOD+逻辑路径):`/auth/*` 11 条 + `/api/*` 165 条 + sandbox 专用 5(funds-sandbox 4 + 绑卡入口闸)+ remote 专用 3(提现地址簿 ×3)。support 域 13 条子路径在 sandbox/production 是两棵 URL 树(按逻辑路径计 1)。
- **重扫方法**:逐个读 `src/api/*-api.ts` 适配器(runtime.ts 是模式路由器);mock 档 apiClient 对一切调用 fail-closed 抛错,故适配器全集即分母。基座:BASE_URL 优先级 `VITE_NEXGRID_API_BASE_URL` > DEV 专用 > 同源;`/auth`+`/api` 两前缀 dev 代理到 8110 不 rewrite;鉴权 Bearer + 401 单飞 refresh 重放;响应 `{code,message,data}` 信封。全站绕过 apiClient 的 HTTP 出口仅 1 处(海报组件读本地 blob,非后端)。

### 附录 B:🔴 无后端对位的 8 个功能(清扫即消失,重启时逐项拍板)

| 功能 | 本地实现 |
|---|---|
| 成就系统(定义+解锁/领取) | src/mock/achievements.ts + store/achievements.ts + pages/me/achievements.vue |
| 收益目标(自定义金额+倒计时) | store/goals.ts |
| 购物车组合折扣阶梯(2件5%/3件8%/4+件12%) | store/cart.ts(后端 bundle 下单不返阶梯) |
| 本地算力回单 PoC(hash/签名者) | store/receipts.ts + mock/receipt.ts + 回单弹窗 |
| 虚构 AI 客户名录(15 家,任务来源/回单签名方) | mock/ai-clients.ts |
| 市场多币种行情列表 | mock/tokens.ts(后端仅 NEX 单币行情) |
| Nova 欢迎语/快捷提示词模板 | mock/nova-templates.ts(AI chat 接口不覆盖) |
| 本地卡令牌生成(PSP 缺位替身) | store/cards-core.ts(remote 档绑卡 fail-closed) |

### 附录 C:有远端对位的 mock 腿 15 组(P2/P3 的拆除工作清单)

注册登录全链(mock-auth-api)· 推荐人绑定 · 领导池计算 · 券目录 · 商品目录 · 以旧换新阶梯 · 任务生成 · 手机档位 · 平台算力配置 · 排行榜 · 全球区域分布 · 活动列表 · 通知卡片 · 社会证明 · 提现地址簿(sandbox 也走本地)——每组=删本地实现+让消费面走既有远端接口,逐组核对消费者。
