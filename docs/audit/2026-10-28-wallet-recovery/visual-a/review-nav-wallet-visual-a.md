# R25 导航与钱包增量 · 独立视觉 A

日期：2026-10-28（JST）。结论：下列限定项均达到 9 分，无新增 P0/P1/P2；不签全站、正式服务、独立 H5 交付或物理设备。本人通过官方 CUA 在独立 Chrome 标签操作 **5291**，未接触用户 5237 或 B 的 5294。没有修改生产、构建、运行测试或提交。

## 版本与证据归属

1. 导航全宽、点击/减弱动画、320/360 钱包双主题与少量金额回归来自固定 `wallet-r25/web-nav-final`：`index-B_6NMEBX.js` / `index-H57LADHv.css`，HTML SHA256 `08a91a4f2b09a222d7c3c17b99555a2061e3fcf1f1fc401a1753a896d35ca175`。本人核对了固定根、发布根文件 hash，以及实际页面加载入口。见[构建核对](r25-nav-wallet-build.json)、[12 条运行记录](r25-nav-wallet-runtime.json)。
2. 用户随后要求标准屏余额改为 550。最终增量实景来自固定 `wallet-r25/web-wallet-weight`：`index-DQPnbcrO.js` / `index-H57LADHv.css`，HTML SHA256 `a0e8a98f80207ed78c1209aa0d2d12118c7d156c25afd1da2bc28c7e63cb6073`。实际懒加载样式为 `me-l-IteFiy.css`；主 CSS hash 与前版相同。只补验 375/390/430 普通余额双主题及 320 快速读回，未重标前版截图。见[最终构建核对](r25-wallet-weight-build.json)、[7 条补验记录](r25-wallet-weight-runtime.json)。
3. 源码阅读限于 `app-chassis.vue`、`glass-segments.vue`、`wallet-card.vue` 和相关 token。最终余额规则为 `@media (min-width:375px)` 的 `font-weight:550`，小屏仍 500。父线程提供的 type/browser/native、定向测试通过信息属于父线程验证，本人未重复执行，也不据此代替实景。

## 分项评分（各自独立，不取平均）

| 项目 | 分数 / 10 | 本人证据与结论 |
|---|---:|---|
| 导航 320/360/375/390/430 图标布局、名称、玻璃 | **9.2** | 五档主体均 56px；五个 link 无文本节点内容，均有对应 aria-label，当前项有 `aria-current=page`。静态图标实际约 23.98×23.98px，入口高 46px、最窄约 55.59px。轨道与选中指示器均实际挂载 LiquidGlass，读到 svg strategy / backdrop filter，截图可见材质与选中态，无横向溢出。 |
| 导航普通点击选中动画 | **9.3** | 375 同源实景点“商城”，真实路由到商城且当前项变化；捕获 `nx-tab-select-d84abd90` start/end，CSS duration `0.26s`、end elapsedTime `0.26`，最终图标恢复约 23.98px。不是只查 CSS 声明。 |
| 导航 reduced-motion | **9.2** | 实际媒体为 reduce 时点“我的”，选中与路由仍改变；图标 `animation-name:none`，没有新增选择动画事件，静态比例保持 1.09。恢复媒体后读回 false。 |
| 钱包 320/360 普通金额双主题 | **9.3** | 前版四格均完整显示 `$52,800.64`，36px/500；紫色钱包 glyph 24px、UVT 圆标 20px、内 glyph 16px；两段间隔 20/12px，UVT link 高 44px。明暗小数与 ink3 相符，不换行或裁切。最终包 320 普通值快速复验仍 500。 |
| 最终钱包 375/390/430 普通金额双主题 | **9.3** | 最终包六格实际 total/amount/fraction 均 550，36px 不变；完整整数和 `.64` 均可读。24/20/16、20/12 和 44px 均保持，普通金额没有溢出，层级符合本次加重要求。 |
| 320 长金额回归 | **9.2** | 前版实际 `$1,234,567,890.12` 全精度、单行，字号约 23.5294px/500，未遮挡小数或右缘。最终增量只作用于 ≥375；本行证据仍明确归前版，不冒称本人已测最终标准屏长金额。 |
| 零值、未知值与一次实点恢复 | **9.2** | 前版零值为 `$0.00`；首次 funds 读取故障为 `$—`，fraction 节点不存在，UVT/估值也使用未知占位，无凭空补零。关闭故障后原页点实际“Thử lại”，错误卡消失、余额恢复 `$52,800.64`。 |

**没有待修复阻塞。** 最终标准屏长金额/零值/未知值依最后分工由 B 另测，本报告不代签其结果。前版导航与小屏证据按用户限定继承，不借最终包重新命名或声称所有矩阵都重跑。

## 导航截图与量测

| 宽度 | 已目检场景 | 点击区域最小值 |
|---|---|---|
| 320 | [VI dark](r25-nav-wallet-320-vi-dark.png)、[VI light](r25-nav-wallet-320-vi-light.png) | 约 55.59×46px |
| 360 | [VI light](r25-nav-wallet-360-vi-light.png)、[VI dark](r25-nav-wallet-360-vi-dark.png) | 约 63.59×46px |
| 375 | [ZH light 稳定图](r25-nav-375-zh-light-settled.png) | 约 66.67×46px |
| 390 | [ZH dark](r25-nav-wallet-390-zh-dark.png) | 约 69.59×46px |
| 430 | [ZH light](r25-nav-wallet-430-zh-light.png) | 约 77.59×46px |

预览 UI 没有 375 选项，因此本人另开 5291 同源应用标签，以官方 CDP 设备视口设为 375×812。初次尺寸切换后的[过渡图](r25-nav-375-zh-light.png)保留为过程证据，当时指示器几何尚在切换，不作为最终量测；其后稳定图与 `moving=false` / 正常轨道、指示器位置才用于签核。未注入页面 CSS 或改业务状态。

[动画记录](r25-nav-animation-runtime.json)包含普通起止事件、减弱模式前后事件计数和实际选中项；[减弱模式选中图](r25-nav-375-reduced-selected.png)。CDP Animation 域不受支持，改为临时 DOM 动画事件观察，结束移除监听和临时对象。reduce 下读取到的两个 renderer WAAPI 轨道是 **paused、1ms**，因此这里只断言“选择图标没有播放动画”，没有写成页面完全不存在 Animation 对象；不以事件时间差冒充 GPU 帧率。

截图玻璃后可透出下方页面文字；导航自身五个 link 的 `textContent` 均空，这些背景文字不是残留导航标签。未通过隐藏背景来制造纯图标结果。

## 钱包最终 550 补验

| 宽度 | 暗色 | 浅色 | 实际样式 |
|---|---|---|---|
| 375 | [截图](r25-wallet-weight-375-zh-dark.png) | [截图](r25-wallet-weight-375-zh-light.png) | 36px / 550，`.64` 同字重 |
| 390 | [截图](r25-wallet-weight-390-zh-dark.png) | [截图](r25-wallet-weight-390-zh-light.png) | 36px / 550，`.64` 同字重 |
| 430 | [截图](r25-wallet-weight-430-zh-dark.png) | [截图](r25-wallet-weight-430-zh-light.png) | 36px / 550，`.64` 同字重 |

最终 [320 ZH light 快速回读](r25-wallet-weight-320-zh-light-quick.png)仍为 36px / 500，没有被 ≥375 的规则波及。六个标准屏和该快速格的金额总区 `clientWidth == scrollWidth`；页面根也没有横向溢出。

前版与最终版明暗小数均分别实际为 `rgb(106,110,119)` / `rgb(155,163,181)`，匹配 `--v5-ink-3` 的 `#6A6E77` / `#9BA3B5`。这里的完整精度指展示字符串保留该 fixture 的全部两位小数，不把一条样例推导为任意业务精度合同。

少量回归：[长金额](r25-nav-wallet-320-vi-light-long.png)、[零值](r25-nav-wallet-320-vi-dark-zero.png)、[未知](r25-nav-wallet-320-vi-dark-unknown.png)、[实点恢复](r25-nav-wallet-320-vi-dark-restored.png)。恢复图已因实际按钮聚焦发生页面滚动，仅用于确认错误卡移除和金额恢复；完整钱包外观以标准格为准。没有重跑旧六来源错误矩阵。

## 已完成字体增量与历史

[独立字体报告](review-type-visual-a.md)已保存：320/360/390 的个人中心列表、分区/profile，以及商城 NxListRow 复用，限定结论 **9.2**；首页 `--ui-text-body` 待办 320 为 13px、360 为 14px，分别 **9.2**。该报告绑定之前 `index-DDUUBFKu.js`，不改写为此次新包。

开发者瞬时 loading 自然进入后已消失，仍为 **N/T、不评分**。未扩大为全站字体通过。此前钱包长金额 **8.4 失败历史**及随后修复的独立复验仍保留在[原钱包报告](review-visual-a.md)，本次没有删除或重标。

## 覆盖边界与收尾

只签本人实际操作的本地 Chrome 原型和上述尺寸/主题/值。无物理设备触摸、系统字号放大、屏幕阅读器、原生 APP 听感/渲染、真实登录/Java 服务或完整语言矩阵证据；44px 是 DOM 热区量测，不是实际手指触边实验。B 的独立标准屏金额结果不属于本人证据。

本轮保存 13 张前版图（含 1 张尺寸切换过程图）、7 张最终补验图；JSON 仅包含构建 hash、必要 DOM/样式、动画观察及本人模式/收尾记录，未保存认证、storage、原始业务 API 或演示状态备份。

两阶段本人标签均已关闭，375 设备视口清除，减弱动态媒体恢复 false，5291 代理 off，5290/5291 服务保留。见[前段收尾](r25-nav-wallet-cleanup.json)、[最终收尾](r25-wallet-weight-cleanup.json)。产品、其它报告、用户 5237 均未改动。
