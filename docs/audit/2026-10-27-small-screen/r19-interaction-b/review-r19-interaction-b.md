# APP r19 intro 独立交互 B — 有界冻结 / READY

2026-10-28 JST。因并发web产物变更，按父线程“每例读入口首尾，若包改变停报，不混签”指示停止。本报告不是完整r19通过。

## 指纹和停止点

- 两个有效案例：实际运行 assets/index-PPFyVDQc.js / assets/index-DPMvPy7r.css，动态intro-BZbJTasF.css。每例首尾均验证DOM入口与本地webdist/index.html，均为PP；截图后再次核对。
- PP JS SHA256：5DAAE8CBAD9671EDEA0EC05FC44E38DEEE59885F71A38B45B8FDA5BA6B6F52CC。
- 主CSS SHA256：361F8178B8E346B1B8C3A0E2E168938DE62036EEF456B13962803AD0E07FA80D。
- 只读intro源码SHA256：1697A09A44584BACE1802F7BBDC500800EEF152EB30F5FA836BD6651AABCE72E（初始读取时）。
- 原语言弹窗Enter已打开，AX显示中文/English/Tiếng Việt；准备拍弹窗的前置产物校验发现 **/assets/index-B0QjbsFt.js**，主CSS名仍DPMvPy7r。该工具调用在校验处终止，后续选中文/拍中文等语句未执行。没有读取新包页面或混入B0截图。

## 已完成范围

| 实景 | 评分 | 读回/目视证据 |
|---|---:|---|
| 320×693 VI浅色起始页 | 9.2 | root/document/body的scrollHeight均693、clientHeight693，scrollTop0，无横溢。品牌图、完整越文标题/说明、两项统计、开始/登录、法律提示及两法律入口全部在一屏。开始/登录均280×44，语言根约62.92×44；法律link均44高。root实际693.333px、content655.333px，实留38px底部安全空间，root padding-bottom38px。 |
| 320×568 VI暗色短屏 | 9.2 | root/document/body均scrollHeight=clientHeight568，scrollTop0，无横溢。所有同上内容完整可见，无底部遮挡；法律末边至root底约38px，未以overflow:hidden锁内容。 |

原图：[320693 VI浅](01-intro-320693-vi-light.jpg)、[320568 VI暗](02-intro-320568-vi-dark.jpg)。完整geometry/首尾产物记录见[运行证据](runtime-r19-interaction-b.json)。

当前模拟 /api/config/home-display 只读GET返回HTTP200、data:{}，所以两项数值为“—”，统计标签完整。评分仅覆盖这个实际合法占位形态；未填造数值，未证明已发布长数字形态。本轮没有扩大到统计服务修复。

## 明确未覆盖 / N/T

- 390×844代表视图；ZH/EN及相应双主题代表。
- 语言弹窗已原按钮打开，但无选语言完成、关闭或布局截图证据，N/T。
- Start→register、Login→login原route；terms/privacy原入口；reduce代表。
- 真实APP设备safe-area、系统大字、长数字统计布局及历史其他页面。

已测两例没有新的P0/P1/P2；整体增量因未完成而不评分、不签≥9。产物变化是审查停止条件，不冒称产品P2。

## 操作与下一步

仅本人5252隔离CUA Chrome任务标签1733373031。未改源码、构建、跑测试、commit/push、清storage、写store、注册、接受协议或变更业务。未触碰/代签并行钱包文件；新签到CSS未追加检查。本人标签在存档后关闭，QA服务保留。

READY：当前证据已冻结，可由父线程锁定webdist并提供最终明确fingerprint后，仅补未完成的intro代表视图与原入口；无需重复这两个已测PP视图来凑矩阵，但不能把PP分数自动移给后续变化包。
