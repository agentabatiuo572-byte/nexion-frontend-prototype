# ST2 验收报告 — 首页网络脉搏卡 + on-grid 区块单源化(独立黑盒 tester)

- 日期:2026-07-24 · tester:独立验收 agent(实现方≠验收方,只读+浏览器)
- 对象:`#/pages/index/index` 网络脉搏卡(network-pulse-card)+ on-grid 区块(on-grid-section)
- 环境:dev http://localhost:5173(vite)· `?nx_device=off` · 390×844 · headless Chromium(Playwright,项目内置)
- **总判定:PASS(4/4 条款全过)**

## 验收方法说明(环境假阴排除)

会话共享的 Playwright MCP 浏览器 tab 被并行 tester(st1/st3)争用(中途被导航至 team 页,tab console 含其注入轮询的 TypeError)。为排除污染,全部证据改由**独立 headless Chromium(全新 profile,与 MCP tab 无关)**重新采集:

- 语言注入:`localStorage["nexgrid-locale-v1"] = {"type":"object","data":{"code":"<loc>","userSet":true}}`(uni 包装格式,已对照 app 实际写入格式核实;本工程 uni H5 存储键为裸键无 `uni_` 前缀)。
- 弹层抑制:预 seed `nexgrid-voucher-claim-sheet-v1` / `nexgrid-trial-claim-sheet-v1` 的 `lastClosedAt`(冷却期内不自动弹,不遮挡截图)。
- 文本证据取 `document.body.innerText`(渲染 flat tree,穿透 uni-app H5 的 shadow DOM);元素定位用 Playwright text locator(同样穿透;`querySelectorAll` 在本工程穿不透 shadow root,是环境特性不是 bug)。

## 条款 1 — 2×2 指标 + on-grid 同读数:PASS

en 实测(innerText 同一快照解析,截图 `assets/st2-pulse-ongrid-en.png`):

| 指标 | 期望 | 实测 | 判定 |
|---|---|---|---|
| ① Members | 1.42M,sub 含 registered | `1.42M` · sub `registered · +2.9% /mo` | ✅ |
| ② Paid today | **$682K**(非 $1.24M) | `$682K` · sub `+1.9% vs yest.` | ✅ |
| ③ Devices | 28,4xx 且=on-grid footer 读数(±1) | 卡内 `28,432` = footer `28,432 online`(同屏同快照,差 0) | ✅ |
| ④ Your rank | #18,742 | `#18,742` · sub `↑ 12 in 24h` | ✅ |

③ 加强证据:90 秒 16 次采样中**每一次**卡内 Devices 与 on-grid footer 读数逐次完全相等(28,432→28,425→28,431 双向抖动同步变化)——是同一 live 数据源(`app.global.activeDevices`)的两个渲染点,非两份硬拷贝。

## 条款 2 — 速率行为 + 旧值清零:PASS

**脉搏卡 header 速率**(en,采样 16 次 / 跨度 91s,05:34:39→05:36:10 UTC):

```
7.6  7.8  7.9  8.1  7.7  7.7  7.9  7.7  8.2  8.1  8.0  7.8  8.2  8.0  8.2  7.8   (+$x.x/sec)
```

- 全程落在 7.5~8.3:min 7.6 / max 8.2 ✅(理论域:7.9±0.3 对称抖动)
- 无单调上升:序列多次升降交替;末值 7.8 − 首值 7.6 = **+0.2** ≤ 0.5 ✅
- **on-grid footer 速率:16/16 采样恒为 `+$7.9/sec`**(静态锚)✅;三语复访亦均为 `+$7.9/sec`

**旧值整页文本抓取**(en/zh/vi 三语,全页滚动后 body.innerText 全文扫描,含大小写不敏感 phones/hubs 复扫):

| 禁词 | en | zh | vi |
|---|---|---|---|
| `+$215/sec` / `$1.24M` / `Phones` / `Hubs` / `手机` / `枢纽` | 0 命中 | 0 命中 | 0 命中 |

唯一近似词:算力列队区一行 `Your phone`(单数、机队设备名,非旧指标标签 `Phones`;zh/vi 页该设备名同样渲染英文 `Your phone`,故 `手机` 全页 0 命中)。判定不属旧值残留。

## 条款 3 — 三语核对:PASS

| 语言 | 卡标题 | Members label | Devices label | 值(Members / Paid / Devices / Rank) | 截图 |
|---|---|---|---|---|---|
| en | Network pulse | `Members` | `Devices` | 1.42M / $682K / 28,432 / #18,742 | `assets/st2-pulse-ongrid-en.png` |
| zh | 网络脉搏 | `注册用户` | `在线设备` | 1.42M / $682K / 28,431¹ / #18,742 | `assets/st2-pulse-ongrid-zh.png` |
| vi | Nhịp mạng lưới | `Thành viên` | `Thiết bị` | 1.42M / $682K / 28,433¹ / #18,742 | `assets/st2-pulse-ongrid-vi.png` |

¹ Devices 为 live 计数(±1/秒对称抖动),三语访问为三次独立加载,28,431/28,432/28,433 属同锚抖动;**每语言页内**卡内值与 on-grid footer 逐次相等。其余三值三语逐字一致。

## 条款 4 — console error:PASS

独立浏览器全程(3 语言 × 2 轮加载 + en 91s 采样窗)`console.error` = **0**,`pageerror` = **0**。
(共享 MCP tab 上的 TypeError 经 st3 归因为各 tester 注入轮询的读空,非 app 错误,且不在本报告证据链内。)

## 观察项(不阻塞,供 main 裁量)

1. 脉搏卡 4 条 sub(`registered · +2.9% /mo`、`+1.9% vs yest.`、`live · 4,820 jobs/s`、`↑ 12 in 24h`)在 zh/vi 下保持英文——组件注释声明 subs 为「dense mock stat strings」(有意为之),且本条款①亦以英文 `registered` 为验收标尺;如需三语化属另立 i18n 任务。
2. zh 机队行设备名渲染英文 `Your phone`(store 种子设备名,非本次改动面)。
3. zh on-grid 标题「NexGrid 网格实时 实时」(onGridTitle 含「实时」+ onGridNow「实时」叠字)——存量文案,非 ST2 diff。

## 证据文件

- 截图(保留):`docs/changes/assets/st2-pulse-ongrid-{en,zh,vi}.png`
- 三语全页文本 + 采样 JSON:tester 会话 scratchpad(临时,不入库)
- headless 浏览器:已随脚本 `browser.close()` 正常退出,无孤儿进程遗留
