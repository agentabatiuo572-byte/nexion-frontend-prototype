# T5 复验 · 每日提现笔数限制(FEAT-WD01b)

- 日期:2026-07-31
- 角色:独立验收方(实现方≠验收方)
- 方式:Playwright 真页面实测。所有结论均为运行时证据(DOM 实读 / localStorage 实际值 / store 动作返回值),**不采信「代码里写了」**
- 环境:已在跑的 dev server `http://localhost:5173`(未重启、未杀 node);全部访问带 `?nx_device=off`
- 被测持久键:`nexgrid-withdraw-daily-count-v1`;配置默认值 `src/mock/platform-config.ts` → `dailyWithdrawLimitCount: 1`

## 大白话结论

| # | 验什么 | 结果 | 一句话 |
|---|--------|------|--------|
| **主** | 两个标签页并发提交第 2 笔 | **FAIL** | **12 轮 12 中**:两个单号都建出来了,落盘只记了 1 笔、只扣了 1 次钱,另一单凭空消失 |
| 1 | 达上限置灰 + 说明 + 下次可提时刻 | PASS | 按钮灰、文案「今日提现次数已用完,08-01 00:00 后可再提。」 |
| 2 | 超限不建单不扣款 | PASS | 余额 / 账单条数 / 落盘计数三项全不动 |
| 3 | 上限 1→3 当日立即生效 | PASS | 不用刷新就解灰,第 2、3 笔放行,第 4 笔拦 |
| 4 | 跨日归零 | PASS | 越南 23:59 与 00:01 各一笔都放行,计数重新从 1 计 |
| 5 | 「每日限额 X 笔/日」随配置变 | PASS | 1 / 3 / 7 三档 × zh/en/vi 九组全对 |
| 6 | 失败提交不占额度 | PASS | 余额不足 / 低于最低额 / 风控 reject 三类都不占,之后仍能正常提 1 笔 |
| 7 | 平台日按越南时间(UTC+7)切 + 绝对时刻文案 | PASS | 重置点实测落在越南当地 0 点;三语都给 `MM-DD HH:mm`,无「明日」类相对词 |
| 8 | 坏数据韧性 | **FAIL** | 12 种注入 10 种安全;**计数被改成超大值(1e9 / 接近 MAX)会把当天提现锁死** |
| 9 | 哨兵红测有效性 | PASS | 基线 63 pass / 0 fail;4 处注入破坏全部被抓;cp 还原后 sha256 一致、哨兵回绿 |

**要主人拍板的**:主目标 AC3 未修复,是否继续本轮(见下方「根因与建议」);AC8 超大值锁死属于「只锁当天、跨日自愈」,是否要在本轮一并处理。

---

## 主目标 AC3:两个标签页并发提交第 2 笔 —— **FAIL**

### 复现结果(压缩到 ~0ms 点击时间差)

| 批次 | 轮数 | 两单都成 | 备注 |
|------|------|----------|------|
| 首测 | 3 | **3 / 3** | 每轮独立 browser context,零污染 |
| 正式 | 6 | **6 / 6** | 同上 |
| 同/异进程对照 | 2 | **2 / 2** | 独立标签页 |
| 证据轮 | 1 | **1 / 1** | 采完整 DOM 证据 |
| **合计** | **12** | **12 / 12** | 100% 复现 |

实测点击时间差 `clickSkewMs` = -0.2 ~ 0.1 ms;两次 `submitWithdrawal` 真实调用时间差 `submitCallSkewMs` = **0.4 ~ 1.6 ms**。

### 一轮完整运行时证据(证据轮)

```
A submitWithdrawal 返回: [ 'WD-20260731-4799' ]     ← 非 null = 建单成功
B submitWithdrawal 返回: [ 'WD-20260731-8522' ]     ← 非 null = 建单成功
追踪页A: hash= #/pages/me/wallet-withdraw-tracking
    WD-20260731-8522 | 金额 | $25.00 | ... | 进度 | 已提交 ...
追踪页B: hash= #/pages/me/wallet-withdraw-tracking
    WD-20260731-8522 | 金额 | $25.00 | ... | 进度 | 已提交 ...
落盘计数: {"dayIndex":20665,"count":1}   上限: 1   今日计数: 1
余额: 起 24856.56 → A内存 24831.56 → 落盘 24831.56
新开标签页读到的余额(merge 后): 24831.56
提现账单条数: 2 (基线 1)
提现账单明细: [{"ref":"WD-20260731-8522","amount":-15,"symbol":"NEX"},
              {"ref":"WD-20260731-8522","amount":-25,"symbol":"USDT"},
              {"ref":"WD-20260516-3284","amount":-20,"symbol":"USDT"}]
```

**四项计数(按主人要求)**

| 指标 | 实测值 | 应有值 |
|------|--------|--------|
| 成功建单数 | **2**(`WD-20260731-4799` + `WD-20260731-8522`,两个不同单号) | 1 |
| 落盘计数 | **1**(`{dayIndex:20665, count:1}`) | 2(或第二笔根本不该建) |
| 余额扣了几次 | **1**($24856.56 → $24831.56,共 −$25) | 与建单数一致 |
| 提现账单条数 | **+1**(只有 B 的 `WD-20260731-8522`) | 与建单数一致 |

**次生损伤(并发本身之外的账目问题)**:A 的单 `WD-20260731-4799` 建出来了,但**没有账单行、追踪页也看不到、也没扣它那 $25**。两个标签页各自建了一单,最终落盘只留下 B 的;A 那单在 client 侧凭空消失。真接后端时这就是「两条 POST /api/withdrawals 都成功、client 只认一条」——多出来的一单会照常出金。

### 复现步骤(可直接重跑)

1. 一个干净的 browser context 里开两个标签页 A、B(同 context = 同 localStorage,是真「两个标签页」)。
2. A:`http://localhost:5173/?nx_device=off#/pages/index/index` → `useWalletPairing().complete({address, network:"USDT-TRC20"})` 完成 KYC 配对 → `useRiskDisclosure().accept()`。
3. B:同 URL 加载(读同一份已配对 storage),同样 `accept()`。
   - ⚠️ B 加载时**不会**踢掉 A:`resumeOrClaim` 对「同账号+同设备+同 surface」是复用会话,两页同时活着,这是产品支持的状态。
4. 两页都进 `#/pages/me/wallet-withdraw`,金额都填 `25`(≥ 最低 $20,≤ 小额免审阈 $50 → route=pass)。
5. 两页各自 `setTimeout` 对齐到同一个墙钟时刻 `T`,到点 `dispatchEvent(new MouseEvent("click"))` 点提交(靠脚本对齐,不靠手速,时间差 <1ms)。
6. 等 3 秒(提交前有 600ms 风控评估)后读:两页的 `submitWithdrawal` 返回值、`location.hash`、`nexgrid-withdraw-daily-count-v1`、账号快照余额、bills 列表。

### 根因(实测定位,只报不修)

`claimWithdrawSlot` 的「同步读-改-写」**只在单个渲染进程内是原子的**。对照实验:

```
separate-tab              r1: A=[WD-...-6671] B=[WD-...-6527] counter={dayIndex:20665,count:1}  建单=2  ← FAIL
separate-tab              r2: A=[WD-...-1033] B=[WD-...-7215] counter={dayIndex:20665,count:1}  建单=2  ← FAIL
window.open(same-process) r1: A=[WD-...-2033] B=[]            counter={dayIndex:20665,count:1}  建单=1  ← 拦住了
window.open(same-process) r2: A=[WD-...-4759] B=[]            counter={dayIndex:20665,count:1}  建单=1  ← 拦住了
```

同进程(`window.open` 出来的标签页)拦得住,独立标签页拦不住。Chrome 对独立打开的同源标签页用**不同渲染进程**,localStorage 跨进程同步是异步的:两个进程在 ~1ms 内各自 `getStorageSync` 都读到写入**之前**的值(都是 `null`),各自算出 `count:1` 并各自写盘,后写的覆盖先写的 —— 所以最终 `count` 是 1 而不是 2。把 claim 从「建单后」挪到「建单前」把窗口从 600ms 收到 ~1ms,**但没有消除它**。

### 竞态窗口实测宽度(补充信息)

| 两次点击人为错开 | 结果 |
|---|---|
| 0 ms | 2/2 两单都成 |
| 5 ms | 1/2 两单都成 |
| 25 ms | 0/2(第二页连 `submitWithdrawal` 都没调,UI 预判已拦) |
| 100 / 300 / 700 ms | 0/2 |

即:**危险窗口 ≈ 5ms 以内**。人手双击两个标签页很难命中,脚本/自动化必中。

---

## 回归项(上轮 PASS,防修复引入回归)

### 1. 今日达上限 → 置灰 + 说明文案 + 下次可提时刻 —— PASS

```
PASS  前置:第1笔放行   {"id":"WD-20260731-1605","counter":{"dayIndex":20665,"count":1},"limit":1}
PASS  a 按钮置灰        {"ariaDisabled":"true","bg":"rgb(31, 31, 31)"}
PASS  b 有说明文案      {"text":"提交提现申请\n今日提现次数已用完,08-01 00:00 后可再提。"}
PASS  c 下次可提绝对时刻 {"stamp":"08-01 00:00"}
```

### 2. 超限时不建单不扣款 —— PASS

```
PASS  超限不建单        {"calls":[]}                      ← submitWithdrawal 根本没被调用
PASS  余额未变          {"before":24831.56,"after":24831.56}
PASS  提现账单条数未变   {"before":2,"after":2}
PASS  落盘计数未变       {"before":{"dayIndex":20665,"count":1},"after":{...count:1}}
```

### 3. 后台把上限从 1 调到 3 —— PASS

```
PASS  a 上限1时第2笔置灰        {"aria":"true"}
PASS  b 调到3后立即解灰(无需刷新) {"aria":"false"}
PASS  c 第2、3笔放行            {"first":"WD-...-3130","second":"WD-...-2951","third":"WD-...-9153"}
PASS  d 计数=3                 {"counter":{"dayIndex":20665,"count":3}}
PASS  e 第4笔被拦(不建单)      {"calls":0,"counter":{"dayIndex":20665,"count":3}}
PASS  f 第4笔后计数仍=3         {"counter":{"dayIndex":20665,"count":3}}
```

### 4. 跨日归零:平台日边界两侧各提一笔都放行 —— PASS

用 `page.clock.setFixedTime` 把时钟钉在平台日边界(越南 00:00 = UTC 17:00)两侧各 1 分钟:

```
PASS  a 边界前一分钟(越南 08-01 23:59)放行  {"id":"WD-20260801-9462","counter":{"dayIndex":20666,"count":1},"todayCount":1}
PASS  b 同一平台日第2笔被拦                 {"aria":"true"}          ← 证明限额真生效,不是没跑
PASS  c 不刷新、仅改金额即解灰               {"aria":"false","freshStatus":{"reached":false,...}}
PASS  d 过界后重开页面按钮解灰               {"aria":"false"}
PASS  e 边界后一分钟(越南 08-02 00:01)放行  {"id1":"WD-20260801-9462","id2":"WD-20260801-9878"}
PASS  f 新平台日计数重新从 1 计              {"before":{"dayIndex":20666,"count":1},"after":{"dayIndex":20667,"count":1}}
```

### 5. 「每日限额 X 笔/日」文案随配置变(1 / 3 / 7)× zh/en/vi —— PASS

| 上限 | zh | en | vi |
|---|---|---|---|
| 1 | 每日限额:1 笔/日。 | Daily limit: 1 per day. | Giới hạn mỗi ngày: 1 lần. |
| 3 | 每日限额:3 笔/日。 | Daily limit: 3 per day. | Giới hạn mỗi ngày: 3 lần. |
| 7 | 每日限额:7 笔/日。 | Daily limit: 7 per day. | Giới hạn mỗi ngày: 7 lần. |

---

## 本轮新改项

### 6. 额度占用时机:被拒绝的提交不占额度 —— PASS

| 拒绝原因 | 层级 | 结果 |
|---|---|---|
| 余额不足($999999 > 余额) | store 直调 | `submitWithdrawal` 返回 `null`,`readWithdrawCounter` 仍为 `null`(计数根本没落盘) |
| 风控 route=reject | store 直调 | 返回 `null`,计数仍 `null` |
| 金额低于最低额($5 < $20) | 真实 UI | 按钮 `aria-disabled=true`,点了不调 `submitWithdrawal`,计数仍 `null` |
| 风控 reject(UI 全链路:同地址被别账户用过 + `sameAddressRoute=reject`) | 真实 UI | 评估结果 `{route:"reject",canSubmit:false,reasons:["high-risk-score","shared-address"]}`,按钮灰,计数仍 `null` |

```
PASS  e 多次失败提交后当天仍可正常提 1 笔  {"id":"WD-20260731-4179","counter":{"dayIndex":20665,"count":1},"limit":1}
PASS  f 这一笔之后额度才用完              {"aria":"true"}
```

### 7. 平台日边界按越南时间(UTC+7)切 + 绝对时刻文案 —— PASS

```
PASS  a 平台时区偏移 = UTC+7
      {"offsetHours":7,"resetAtIso":"2026-07-31T17:00:00.000Z",
       "resetAtVN":"2026-08-01T00:00:00.000Z",
       "resetAtLocal":"Sat Aug 01 2026 00:00:00 GMT+0700 (中南半岛时间)"}
PASS  b 重置时刻落在越南当地 0 点  {"vn":"2026-08-01T00:00:00.000Z"}
```

文案(实测两个时区 × 三语,全部是 `MM-DD HH:mm` 绝对时刻,无「明日 / tomorrow / ngày mai」):

| 浏览器时区 | zh | en | vi |
|---|---|---|---|
| Asia/Ho_Chi_Minh | 今日提现次数已用完,**08-01 00:00** 后可再提。 | Daily withdrawal limit reached. Next withdrawal available **08-01 00:00**. | Đã hết số lần rút hôm nay. Có thể rút tiếp từ **08-01 00:00**. |
| Asia/Shanghai | 今日提现次数已用完,**08-01 01:00** 后可再提。 | … available **08-01 01:00**. | … từ **08-01 01:00**. |

越南本地显示 00:00、中国本地显示 01:00 —— 同一个 UTC 时刻按各自本地时钟换算,越南用户看到的正是自己的午夜。

### 8. 坏数据韧性 —— **FAIL(1 类)**

上限固定为 1,注入后重开页面(先自证注入被 store 真读到),再连点 3 次提交:

| 注入 | store 读到 | `todayCountFrom` | 当天建单成功数 | (a) 限额失效 | (b) 提现锁死 |
|---|---|---|---|---|---|
| `count: NaN`(原文非法 JSON) | `null` | 0 | 1 | 否 | 否 |
| `count: null`(NaN 经序列化的真实落盘形态) | `null` | 0 | 1 | 否 | 否 |
| `count: -5` | `{20665,-5}` | 0 | 1 | 否 | 否 |
| **`count: 1e9`** | `{20665,1e9}` | 1e9 | **0** | 否 | **是** |
| **`count: 1.797…e308`** | `{20665,1.797e308}` | 1.797e308 | **0** | 否 | **是** |
| `count: "3"`(字符串) | `null` | 0 | 1 | 否 | 否 |
| `dayIndex: NaN`(原文) | `null` | 0 | 1 | 否 | 否 |
| `dayIndex: null` | `null` | 0 | 1 | 否 | 否 |
| `dayIndex: 今日+99999` | `{120664,99}` | 0 | 1 | 否 | 否 |
| `dayIndex: -1` | `{-1,99}` | 0 | 1 | 否 | 否 |
| 整行 = `5`(非对象) | `null` | 0 | 1 | 否 | 否 |
| 整表 = 字符串 garbage | `null` | 0 | 1 | 否 | 否 |

**结论**:12 种注入里 **(a) 限额失效 0 例**;**(b) 提现锁死 2 例** —— 计数被改成超大值时,当天完全提不了。

严重度限定(实测确认,供分级参考):

```
超大值当天 : {"ariaDisabled":"true","label":"提交提现申请\n今日提现次数已用完,08-02 00:00 后可再提。"}
跨日后     : {"ariaDisabled":"false","bg":"rgb(158, 220, 29)"}   counter={dayIndex:20666,count:1000000000} todayCount=0
```

- 只锁**当天**,过了平台日边界自动恢复(`dayIndex` 对不上就归 0),不是永久锁死;
- UI 有正确说明 + 正确的绝对重置时刻,不是白屏/静默;
- `claimWithdrawSlot` 自己永远写不出这种值(它写的是 `todayCountFrom(...) + 1`,已被 clamp 成有限非负),只能来自外部篡改或存储损坏。

但代码对 `NaN` / 负数都做了消毒(`Number.isFinite` + `Math.max(0, …)`),对「超大值」这一侧没做 —— 消毒不对称。按主人给的判据「两种都不该发生」,记 FAIL。

### 9. 哨兵红测有效性 —— PASS

基线:`node scripts/selfcheck-fastlane.mjs` → **63 pass / 0 fail**(exit 0)。

自选 4 处判定/接线注入破坏(跨 2 个文件、覆盖接线层 / 时区判定 / 占用判定 / 坏数据防护四类):

| # | 注入 | 哨兵结果 | 被抓到的断言 |
|---|---|---|---|
| S1 | `app.ts` 删掉那句占额度的 `claimWithdrawSlot` 调用 | exit=1 **61 / 2** | `submitWithdrawal 建单前调用 claimWithdrawSlot 并在失败时 return null` / `占额度发生在建单之前` |
| S2 | `PLATFORM_UTC_OFFSET_HOURS` 7 → 0 | exit=1 **61 / 2** | `平台时区偏移 = UTC+7(越南)` / `平台日边界落在越南当地 0 点` |
| S3 | `claimDailySlot` 里 `count: allowed ? used+1 : used` → `count: used+1` | exit=1 **61 / 2** | `第二次占用:今日 1 笔 / 上限 1 → 不准,计数不涨` / `不准时计数不递增` |
| S4 | `todayCountFrom` 删掉 `Number.isFinite` 的 NaN 防护 | exit=1 **61 / 2** | `落盘计数是 NaN → 当 0` / `todayCountFrom 对 NaN 也返回 0` |

**4 / 4 全部变红**。每次注入都先自证「真落盘」(读回文件确认新文本在、旧文本没了),避免「注入没生效的假绿」。

还原纪律:全程 `fs.copyFileSync`(等价 `cp`),**未使用 `git checkout`**(这些文件有未提交改动)。还原后逐文件 sha256 比对:

```
还原后: sha 全部一致=true  哨兵 exit=0 63 pass / 0 fail
  src/store/app.ts                          1751e034…c24d33  == baseline
  src/store/withdrawal-eligibility-core.ts  026b196e…d3a7dc  == baseline
  src/store/withdraw-daily-count.ts         4d1e79c4…6a3b692 == baseline
```

另:`npm run type-check` → 0 错。

---

## Harness 自证伪记录(两次差点误报,留档)

按「点击失败先证伪 harness」纪律,本轮有两处初测报红、经证伪确认是我的测试脚手架问题,**不是被测缺陷**:

1. **AC4 跨日初测报 3 条 FAIL**。原因:改时钟后我只重填了同一个金额(25→25),Vue computed 没有响应式依赖变化 → `eligibility` 用的是缓存值,按钮没重算。换成「改金额 / 重开页面」后全绿;直调 `dailyLimitStatus` 也立刻返回 `reached:false`,证明判定层本身没问题。
2. **AC5 文案初测报 3 条 FAIL**。原因:我用 `document.querySelectorAll("text")` 取节点,而 uni 编译产物是 `<uni-text>`,选择器命中 0 个 → 全 `null`。改用 `document.body.innerText` 后九组全对。

另记一处环境事实:`http://127.0.0.1:5173` 连不通(vite 绑在 `[::1]`),必须用 `localhost:5173`;`page.goto` 只改 hash 属于 same-document navigation **不会重载页面**,会拿着上一轮内存态跑出假结果,加不同 query 参数才是真重载。

---

## 根因与建议(只报不修)

AC3 的残余窗口是**跨渲染进程的 localStorage 非原子读-改-写**,靠「把 claim 挪到更早」无法消除,只能把窗口从 600ms 缩到 ~1ms。可选方向(留给实现方与主人定夺):

- **接受并标注**:client 计数本就只是 UI 预判,PROD 由服务端事务 `UPDATE … WHERE count < limit` 裁决。若采此路,需要的是把「client 侧不可能原子」写进注释与哨兵断言,而不是让 AC3 挂着装作已修。
- **加跨标签页互斥**:`Web Locks API`(`navigator.locks.request`)是浏览器原生跨进程锁,把「读-改-写 + 建单」整段包进去可真正串行化;H5 端可用,App webview 需确认支持面。
- **降级方案**:落盘写入带唯一 token 后回读校验(写后 re-read,发现不是自己的写入就回滚建单),能把窗口再压一个量级但仍非严格原子。

---

裁决: FAIL(2 条)
