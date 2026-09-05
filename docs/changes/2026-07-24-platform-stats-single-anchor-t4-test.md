# ST4 独立验收报告 — i18n 死 key 清理 + platform_stats_anchor 哨兵

- 日期:2026-07-24 · 验收人:独立 tester agent(实现方≠验收方)
- 方式:只读(Read/Grep + 只读脚本 `i18n-key-mirror.mjs`;未修改任何仓库源文件)
- 结论:**PASS(4/4 条款全过,0 现行违例;附 2 条 LOW 加固 finding + 1 条设计观察)**

---

## 条款 1 — 8 个死 key 三语绝迹:PASS

命令(键名合并为 6 个去重词干,case-sensitive):

```
Grep 'activeDevices|paidToday|paidToCreators|deviceOnline|devicesOnline|leaderboardHint' src/i18n/messages/
→ No matches found(en/zh/vi 三文件 0 命中)
```

已知答案探针(防「grep 错文件」假阴性,合法保留键必须还在):

```
Grep 'networkPaidToday|networkDevices' src/i18n/messages/
→ zh.ts:323/324 · vi.ts:335/336 · en.ts:334/335 各 2 键命中 ✔
```

- `networkPaidToday` 含大写 `PaidToday`,case-sensitive 的 `paidToday` 模式不会误伤 → 无误报。
- 8 键(home.activeDevices / home.paidToday / home.paidToCreators / home.deviceOnline / home.devicesOnline / me.deviceOnline / me.devicesOnline / team.leaderboardHint)在三语 message 文件全部不存在。

## 条款 2 — 三语镜像 0 差异 + vi 机器门:PASS

```
node scripts/i18n-key-mirror.mjs → EXIT=0
uniapp i18n mirror PASS: en/zh/vi 4209 keys · 507 条带插值文案占位符对齐
(另有 zh 4 条 / vi 2 条占位符集合差异,脚本自注明 INFO 级语法差异不 fail,属既有设计)
```

**vi 是否有机器门:有。** 脚本 L71-80:en 为 SoT,`LOCALES = [zh, vi]` 两语各自对 en 做 missing+extra 双向断言,任一差异 `process.exit(1)`(注释明记 2026-07-21 加入 vi)。且 `verify.sh:71` 调用该脚本 → 已接入机器门链。

## 条款 3 — platform_stats_anchor 哨兵 + 只读红测:PASS(附 finding)

### 3a 存在且被调用

`scripts/verify.sh`:L1345 定义,L1369 顶层调用;`bad()` 累加 `fail`,脚本末行 `[ $fail -eq 0 ]` → 任一违例 verify 非零退出,真实 gate。脚本头部 `cd "$PROJECT_DIR"`,`grep -r … src` 路径与调用方 cwd 无关。

### 3b 5 项检查逻辑 = 描述,逐项手工重放(全部当前 0 违例/全命中)

| # | 描述 | 实现(L 行) | 重放结果 |
|---|---|---|---|
| 1 | 旧字面量绝迹 | L1348-1352:10 个 pattern(`1247893`/`1,247,893`/`\$1\.24M`/`\+\$215/sec`/`paidToday`/`todayIncrement`/`networkPhones`/`networkHubs`/`paidToCreators`/`leaderboardHint`)`grep -rqEI` src | 10/10 pattern 各 **hits=0** |
| 2 | 锚字面量仅 lib | L1354-1355:`682368\|682,368\|127_438_905\|127,438,905` 排除 `lib/platform-stats.ts` | 命中文件仅 `src/lib/platform-stats.ts` ✔ |
| 3 | 28,432 角色守卫 | L1358-1359:`28,432\|28432` 仅允许 lib + `pages/trust/trust.vue` | 命中文件恰为该两文件;trust.vue 仅 L256 一处(Q3 managed snapshot 行,与注释描述一致) ✔ |
| 4 | 5 消费者 import | L1361-1363:5 文件各 `grep -q 'lib/platform-stats'` | 5/5 均为**真实 import 语句**(network-pulse-card.vue:51 / on-grid-section.vue:42 / intro.vue:143 / ref/code.vue:139 / store/app.ts:14),非仅注释 ✔ |
| 5 | 三语 41,286 | L1365-1366:`grep -lF '41,286'` 三 locale 计数 =3 | count=3 ✔ |

### 3c pattern 绕过评估(红测,只读重放)

- **大小写**:全部 pattern 无 `-i`,属**必要设计**——`paidToday` 若加 `-i` 会误伤合法键 `networkPaidToday`(子串 `PaidToday`)。大小写变体重引入(如 `PaidToday:`)= 不同键名,由 en-SoT + 镜像门兜底,非实用绕过。
- **注释绕过**:检查 1/2/3 为「必须不存在」型,grep 连注释一起抓 → 注释里复活也报警,方向更严,无绕过。
- **FINDING-1(LOW,加固建议)— 数字分隔符变体未覆盖**:lib 自身的权威写法是下划线形(`platform-stats.ts:13 FLEET_DEVICES = 28_432`、`:31 …= 127_438_905`),但检查 3 的 pattern 不含 `28_432`、检查 2 不含 `682_368` 与纯数字 `127438905`、检查 1 不含 `1_247_893`。**从 lib 复制常量值到消费者(最可能的 drift 路径)恰好是哨兵抓不到的写法**。已重放确认当前 src(除 lib 外)四种变体 0 命中,无现行违例;建议 pattern 补 `[_,]?` 变体。
- **FINDING-2(LOW,加固建议)— 检查 4 needle 可被注释满足**:`grep -q 'lib/platform-stats'` 不区分 import 与注释;`network-pulse-card.vue:5` 注释本身含该子串,若日后删真 import 留注释,哨兵仍绿(项目错题集「子串哨兵必剥注释」同类)。当前 5 文件均验为真实 import,无现行违例;建议 needle 收紧为 `from "@/lib/platform-stats"`。
- **观察(非缺陷)**:哨兵旧字面量表覆盖 8 死 key 中的 3 个词干(paidToday/paidToCreators/leaderboardHint);`activeDevices`/`deviceOnline`/`devicesOnline` 未入表——因这些名字合法存在于数据模型(store 字段 `app.global.activeDevices`、device-card-pc.vue 本地 computed `deviceOnline`),入表必稳定误报。该 3 名的回归防护由「en.ts 无此键 + 镜像门 + tsc(访问不存在键报错)」承担,设计合理。

## 条款 4 — 运行时死 key 引用 = 0:PASS

```
Grep 'home\.activeDevices|home\.paidToday|home\.paidToCreators|home\.deviceOnline|home\.devicesOnline|me\.deviceOnline|me\.devicesOnline|team\.leaderboardHint' src/
→ No matches found
```

裸词干全 src 复扫(`activeDevices|deviceOnline|devicesOnline`):所有命中均为合法非 i18n 标识——store 数据模型字段 `activeDevices`(app.ts/types.ts/globe/on-grid/network-pulse/trust 读取)、页面本地 computed `activeDevices`/`inactiveDevices`(me/devices.vue、empty-slots-hint.vue、slot-action-sheet.vue)、device-card-pc.vue 本地 computed `deviceOnline`(L440 定义,任务书已白名单);`devicesOnline` 全 src 0 命中;`t.` / `t.value.` 形态的死 key 访问 0。

---

## 汇总

| 条款 | 结果 |
|---|---|
| 1 三语死 key 绝迹 | PASS |
| 2 镜像 0 差异 + vi 有机器门 | PASS(vi 有门) |
| 3 哨兵存在/被调/5 项相符/当前 0 违例 | PASS + 2 LOW finding |
| 4 运行时引用 0 | PASS |

FINDING-1/2 均为**加固建议**(当前无任何现行违例),不构成本轮验收阻断。
