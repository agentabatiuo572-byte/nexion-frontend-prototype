# 福利卡 r13 行为测试更新

2026-10-27 · **READY，3 文件 41/41 通过，退出 0。** 本轮仅修改 [trial-benefits-lifecycle.behavior.test.ts](../../../src/components/home/trial-benefits-lifecycle.behavior.test.ts)。生产源码、另两份测试均未改；不作视觉评分，没有构建、浏览器操作、提交或 H5 同步。

原 21 用例保留：中英越 active/grace/ended/converted 的点击改为根 `nx-trial-hero--card-entry`，明确状态卡不再有 CTA；未领取/满容量继续使用原 CTA。根卡 role、tabindex、完整状态名称＋机型＋操作 aria 均有精确断言。原 `$11.37`、禁止拿估算 `$50.00` 冒充当前金额、失败不显示 `$0.00`、unknown、重新领取权限、领取后常驻与券卡消失后的单列判断均保留。

标题倒计时增量：active/grace 可见 badge 对应新的 `cardActiveTitle/cardGraceTitle`，完整状态名称在 badge 和主卡 aria 中验证；标题后 `trial-header-countdown` 精确为 **`2d 0h:03`**（2 天＋123000ms），原完整剩余时间仍在倒计时 aria 中验证。卡入口不再渲染独立时间组；失败时标题倒计时精确为 **`-`**，ended/converted 不渲染倒计时。

新增 5 个用例，生命周期文件合计 26 项：

- 未领取 CTA 仍存在，点击只打开一次领取面板，事件停止冒泡。
- Enter / Space 两例：只有事件 target 就是根卡时才阻止默认行为并进入详情；子节点冒泡到根卡不触发入口。
- Tab / Escape / ArrowDown 及嵌套 retry 的键盘事件不被根卡劫持。
- 同一真实 SFC 响应式渲染中检查 12 组倒计时边界：0、1ms、整分钟前/整分/整分后、整小时前/整时/整时后、整天前/整天/整天后，以及 `2d 23h:44` 示例。明确部分分钟向上取整、小时/天进位正确，显示 0 不自行把服务端 active 状态改为 ended，金额和路由无副作用。

原失败读取用例同时改为沿 renderer 父链派发 retry click，验证实际编译后的 Vue `.stop` 阻止根卡进入详情；refresh 恰好一次、导航和领取均不发生。事件派发器只提供 target/currentTarget 和冒泡，`.self/.prevent/.stop` 仍由真实 SFC 编译的处理函数执行；没有 CSS 快照。

## 执行结果与边界

原命令：`node node_modules/vitest/vitest.mjs run src/components/home/trial-benefits-lifecycle.behavior.test.ts src/components/trial-offer-stability.test.ts src/components/voucher-banner.behavior.test.ts --reporter=verbose`。

- 首次根卡增量：20:50:33，40/40 通过。
- 最新标题倒计时增量：**20:52:33，41/41 通过，2.22s**；生命周期 26/26、金额/轮询稳定性 11/11、券卡 4/4。
- 修改的测试文件 `git diff --check` 通过。原 r12 失败与修复历史未覆盖。
- 未验证浏览器原生按键合成 click、读屏、字体尺寸、图像位置或左右卡等高；这些仍由父线程构建和独立实景检查。renderer 的非劫持断言不等于嵌套 retry 键盘激活实测。

最新取证前后，四个生产文件及另两份测试 SHA-256 均一致。对应本次读取的父线程版本：

| 文件 | SHA-256 |
|---|---|
| trial-hero-banner.vue | `f77aed23d65c2fe9e6cde2f0d21f5898dcc7c8ca7bc2792caaca2314a282bc66` |
| voucher-banner.vue | `17d2e1118f9f24b16091837c9ed86858de04462d5dee23970ee9cd8c0372aab2` |
| home/home-benefits.vue | `8a45e4c67f46d89d4f591a8d1068317048696e4435bd6821b164a6a281a159b7` |
| trial-lifecycle.ts | `ae65b770f8179aea330eb886bd471f29dd55b8ebc4b0996a26f6010abae65007` |
| 本轮修改的 trial-benefits-lifecycle.behavior.test.ts | `501fa0f011a76746b5d4dadefe3ba13821585214a39aec92f0334aaa983ff514` |
