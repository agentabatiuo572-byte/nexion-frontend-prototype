# 2026-08-15 · date-locale-unify（pkg/zp-date-locale）

**Status**: Shipped（主人 2026-08-16 拍板合并;方向 = 主人转发的独立 tester 判据 + 指定修法;S/M 级机械同型清扫)

## Why

独立 tester 2026-08-15 验收发现(既有问题,非当轮引入):proof 页 "Member since" 用
`toLocaleDateString(undefined, …)` = 跟**浏览器**语言;应用语言 ≠ 设备语言时出混语日期
(实测 en 页 "Member since 2026年7月"、vi 页 "Thành viên từ 2026年7月"),同字符串还画进分享海报 canvas(约 L348)。
全站扫同型共 **22 处 / 17 文件**(无参 / `undefined` / `[]` 三种形态)。
wallet-bills 早已单点修过(本地 `localeTag`)但未扫全站——本包补「修一处必修全部」。

## What changes

- `src/i18n/format.ts` 新增单源 **`dateLocale()`**:应用语言(locale store)→ BCP-47
  (en→en-US / vi→vi-VN / zh→zh-CN;词典未落地语言随 UI 文案回退 en-US,避免反向混语);
  computed 内调用读 store,切语言即重算。
- 22 处 Date 格式化(`toLocaleDateString` / `toLocaleTimeString` / Date 的 `toLocaleString`)全部改传 `dateLocale()`;
  wallet-bills 本地 `localeTag` computed + `useLocaleStore` 引用收编删除。
- `scripts/verify.sh` 焊哨兵 `date toLocale* pins app locale (dateLocale())`;`docs/PORT-PITFALLS.md` 登记 P-097(原编 P-096,合并时与邻会话 junction 环条目撞号顺延)。
- **skeptic 对抗轮**(3 条 P1 全采纳):feed 两处 `toLocaleTimeString` 钉 `hour12: false`(防 en 应用 12h 撑破固定栅格列);
  tag 表补全 11 语 + `Record<LocaleCode, string>` 类型锁,启用与否由 `code in DICTS` 派生(消灭第二张手抄开关表);
  哨兵扩容 4 分支(navigator.* / 字符串字面量 / Intl.DateTimeFormat / `[ ]` 变体),合成探针 11/11 红、真实 src 0 误伤。

**Out of scope**:数字千分位 `Number#toLocaleString()`(~150 处,部分已定点 "en-US")不属于「混语日期」族——
数字分组无月名等语言词,视觉混感极低,且全站统一属产品口径决策(vi 会变 `1.234,56`),不在本包动。

## Done-when

1. 浏览器语言 ≠ 应用语言时,proof 页 memberSince 按**应用**语言渲染(en=英文月名 / vi=越南语 / zh=中文),海报 canvas 同步(同一 `memberSinceText` 源)。
2. 哨兵 grep 修后 = 0 命中;修前基线 22 命中(四种缺陷形态全有真实红证)。
3. proof 页内切换语言不刷新即重算(`joined` 是 computed,依赖 locale store)。
4. `vue-tsc` 0 err;`bash scripts/verify.sh` 全量绿(445 基线不倒退);en/vi/zh 三语浏览器实测截图。

## Impact

- 页面:proof / profile / trial / daily / orders / order-detail / wallet-bills / wallet-exchange / wallet-nex /
  globe / developer / binary / commissions / genesis-holder;组件:trial-countdown-hero / stake-sheet /
  position-row / earnings-ledger-card / live-feed-card;根:App.vue(grace toast)。
- store 无改动;i18n key 无增删;持久键无改动。
- PRD:缺陷修复,恢复 i18n 不变量(文案已随应用语言,日期本就该随)——判**不同步**。

## 实施拆解

- [x] format.ts 落 `dateLocale()` 单源
- [x] 22 处调用点接线(含 wallet-bills 收编)
- [x] verify.sh 哨兵 + PORT-PITFALLS P-097(合并撞号顺延)
- [x] skeptic 证伪轮 → 3 条 P1 修复(hour12 / 类型锁+DICTS 派生 / 哨兵扩容+红测 11/11)
- [x] vue-tsc 0 err
- [~] verify.sh 全量:R3 = **435 PASS / 15 FAIL(exit 1)**——15 条全为运行时探针「加载超时/覆盖为空」族,零断言失败。
  定性为环境红,证据链:① 同套门当日晨间基线 445/0/0;② 三轮 FAIL 集与本包 diff 零交集(auth/register/entry-surfaces 无日期格式化);
  ③ 实测 dev server 喂满一轮探针流量后进程膨胀至 4.8GB、**空载 shell 31s**;④ 最小复现:同一秒内裸 `/` goto 超时 30s、
  紧接的 hash 路由 goto **528ms 成功** = 服务器侧请求队列拥塞(被杀探针客户端的残留转译积压),非页面问题;
  ⑤ 「单浏览器串行耐心」模式当晚 176 次 goto 全成(预热 91/91 + 88/91),一门一浏览器的探针模式则集体超时;
  ⑥ 我的浏览器在「失败」页(index/proof/me)全部秒级实景渲染,console 无应用错误;⑦ 当晚机器同时挂 3 个 uni dev server(两个属其它会话)。
  另:cross-repo sampling 门红 = admin 仓审计脚本指向已改名的 `NX1.0-UniApp`(现 `NX1.0-UniApp-UI`),与本包无关,已挂修复芯片。
  R4(03:46,凌晨静机+全预热)= 436/14,四轮包络 433-436 / 14-17 稳定同族 → 熔断停跑。
  **终极判别(03:50)**:`build:h5`(0 err)产物起零转译静态服务器(:5599),全新上下文裸启动实测——
  bare-boot / entry-surfaces/h5 / onboarding/intro / register / proof 全部 **1-2s 挂载 OK**(正是残差门的目标页);
  且 proof 以「新存储 + zh-CN 浏览器」直出 `Member since Jul 2026` = 在**生产构建**上复现原始缺陷环境并证明已修。
  (注:该案深链直达 proof 时应用语言停留默认 en 而非跟随系统检测——与 locale 写手调查[2026-08-16 跨会话同步]一致:
  `ensureSystemDetected` 只挂首页 index.vue,深链不经过它;locale 全站仅两写手、无隐藏写手,dateLocale() 地基获运行时证据背书。)
  结论:代码全健康;残差 = dev server 转译管线在整文档冷载「启动图」请求形态下的病理(P-098),
  与 SPA 增量导航(我/tester 走的路径,全部通过)分野一致。
  **主人 2026-08-16 拍板:凭上述证据链直接合并**;复跑改为合并后立即执行——邻会话 c86137d 已修
  「vite 监视器走跨仓 junction 环 + dist/.trash 致 OOM」,正是当晚 dev server 膨胀病理(P-097)的根因,
  合并拿到该修复后环境应恢复,runbook:起新 server → 预热 → 全量 verify。
- [x] 浏览器三语实测(proof 页,浏览器语言与应用语言错开)+ 截图(main DOM 断言 + tester 截图双份,`evidence-date-locale/`)
- [x] 独立 tester 黑盒验收 **AC 5/5 pass**(报告 `2026-08-15-date-locale-unify-t1-test.md`;5 条 AC 外发现已裁决:#2 裸值 default 与 #1/#3/#4 均为既有问题,#2 已挂修复芯片)
- [x] 主人 2026-08-16 拍板合并(证据链足);合并后立即复跑 verify(P-098 环境红清账;主线 c86137d 已修其根因 P-096 junction 环)
