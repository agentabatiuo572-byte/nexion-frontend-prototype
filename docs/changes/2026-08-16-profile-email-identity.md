# 2026-08-16 profile-email-identity(pkg/zr-profile-email · S 级)

**Why**:2026-08-15 date-locale T1 独立验收发现#2 —— 中文界面 profile 页昵称正下方直出裸英文 `default`(截图 `evidence-date-locale/profile-zh.png`),违反项目不变量「页面文案禁止字段名/枚举值」。与 date-locale 包无关的既有问题。

**根因**(三层,详见 PORT-PITFALLS **P-099**):
1. `user.email` 兜底链把账号内部 key 当联系身份灌入(匿名 boot key 字面 = `"default"`);
2. 竞态铸造:`bindAccount("default")` 抢在 boot 种子落盘前执行时,用 rawAccountKey 重播种**并持久化**,毒行棘轮式永存;
3. 静态评审路由(`?nx_device=off`)下会话 bootstrap 直接 return,bind 永不执行 —— 修绑定闸的第一版对走查/验收视角无效(实测推翻后重定位咽喉)。

**What changes**:
- `src/store/account-cloud.ts` · `readAccountSnapshot`:归一化内置于全部存储读的唯一入口(9 个消费点、含三路 merge 的 latest 视图)——email 非邮箱形一律归一为 demo 身份 `alex@nexgrid.ai`。判据「含 @」,不枚举 key 形状(开放集合)。存量毒行读取即痊愈,merge 三视图天然一致(只折叠空串会被 merge 当 latest 差异反噬,实测中招后改整体归一)。
- `src/store/app.ts`:`asEmailIdentity` 筛接入两个快照工厂(`createSeedSnapshot` / `createServerEmptySnapshot`)——铸造侧不再产毒。`hydrateSnapshotEconomics` / bindAccount :844 保持原样(读层归一后无需重复)。
- `scripts/profile-identity-check.mjs` **新增运行时门**,挂入 `verify-h5-runtime.mjs` 并行组(verify 链内,非孤儿):fresh boot + 毒快照注入双场景,断言 profile 页无 standalone `default` 文本节点且渲出 demo 邮箱。
- out-of-scope:`Number#toLocaleString` 族、profile.vue 模板(零改动)、远端模式身份投影(1813 行电话覆写,原样)。

**Done-when(全部达成)**:
1. ✅ zh/en profile 页身份行为邮箱形,全页无裸 `default` —— 运行时门双场景 PASS + 独立 tester 实景验收;
2. ✅ 注入旧 bug 真实落盘形状的毒快照后重载,页面仍干净(存量用户自愈)—— 门场景 B;
3. ✅ 门红测:M-A 撤 read 层归一 → 毒场景红(served 产物核过变异真生效);修法在场 → 双场景绿;
4. ✅ vue-tsc 0 错;verify 全链绿(含新门)。

**红测台账**(每轮冷启动 + served 产物核变异,防 stale module graph 假象):
| 轮 | 变异 | 结果 |
|---|---|---|
| M1(旧架构) | 撤 bind :844 筛 | 毒场景红 ✅(后该架构被 3 号根因推翻,844 筛随之撤销) |
| R1'' | 修法在场(scrub+空串版) | 裸 default 消失但 demo 邮箱缺失 → 暴露 merge 反噬 → 改整体归一 |
| M-A(终架构) | 撤 readAccountSnapshot 归一 | 毒场景红 ✅(served hits=0 证变异生效) |
| 终绿 | 修法在场(整体归一版) | 双场景 PASS ✅(served hits=1 证修法在场) |

**诚实边界**:seed 工厂筛被 read 层遮蔽(竞态窗不可外部确定性触发,留作纵深防御);`createServerEmptySnapshot`(remote)无可达渲染面(remote profile 走 phoneE164),靠 review;`Intl`/数字 toLocaleString 族不属本包。

**验收**:独立黑盒 tester 报告 `2026-08-16-profile-email-identity-t1-test.md`(zh 真实 UI 切换链路 + en 默认链路 + 截图 `evidence-profile-email/profile-zh.png`)。

**状态**:Shipped(分支 pkg/zr-profile-email;合并回主线 UniApp 后生效)。
