# 2026-08-16 profile 身份行邮箱化 — T1 独立黑盒验收报告

本页判定目标=profile 身份行不得直出内部枚举值(来源:2026-08-15 T1 发现#2 + 项目不变量『页面文案禁止字段名/枚举值』)

- 被测:`http://127.0.0.1:5399`(worktree `zr-profile-email`,mock 模式,dev server 由外部维持,本轮未动)
- 方法:仓库自带 playwright,chromium headless,viewport 390×844,colorScheme dark;每场景全新 browser context,无任何存储注入;点击语言行后 1.5s,经 `about:blank` 中转再 goto profile,保证 profile 是全新文档加载;`?nx_device=off` 均在 `#` 之前
- 测者:独立黑盒 tester,未读任何实现代码 / 实现叙述,未改任何 src 文件
- 原始证据与脚本归档:`docs/changes/evidence-profile-email/`(`t1-profile-email.cjs` 测试脚本、`evidence.json` 全量文本节点/console 原始记录、`profile-zh.png`、`profile-en.png`)

## AC 判定

### AC1 zh 界面 profile 身份行 — **PASS**

步骤:全新 context → `http://127.0.0.1:5399/?nx_device=off#/pages/me/language`(1 次成功)→ 等「简体中文」行可见 → 真实点击(locator `text=简体中文`,页面命中 1 处,行坐标 x18/y182/w354)→ 1.5s → `about:blank` → goto `http://127.0.0.1:5399/?nx_device=off#/pages/me/profile`(1 次成功)→ 等页面文本出现。语言切换生效确认:整页含中文(「个人资料 / 加入时间 2026年7月17日 / 公开资料…」)。

- 昵称节点实测:`Hyper Drift 41`(span,x98 / y72.5)
- 昵称正下方一行实测原文(文档序后继与视觉正下方两种判法结果一致,均为同一节点):**`alex@nexgrid.ai`**(span,x98 / y93.5)——含 `@`,邮箱形 ✔
- 整页文本节点逐一扫描:trimmed 内容等于 `default`(不分大小写)的节点 = **0**;`innerText` 按行切分后等于 `default` 的行 = **0** ✔
- 2026-08-15 发现#2 报告的「昵称下裸值 `default`」在本轮 **未复现**,该位置现渲染为邮箱。

zh 整页 innerText 原文(全量):

```
个人资料
H
Hyper Drift 41
alex@nexgrid.ai
加入时间 2026年7月17日
公开资料
昵称
Hyper Drift 41
更换
团队成员可见
等级
活跃
距离 升级候选 · 62%
提现地址
尚未设置
设置地址
保存修改
```

### AC2 en 界面同型 — **PASS**

步骤:全新 context(不点语言,默认 en)→ 直接 goto profile(1 次成功)。整页无 CJK,确认默认英文。

- 昵称节点实测:`Hyper Drift 41`(x98 / y73)
- 昵称正下方一行实测原文(两种判法一致):**`alex@nexgrid.ai`**(x98 / y94)——含 `@`,邮箱形 ✔
- 裸 `default` 节点 = 0,裸 `default` 行 = 0 ✔

en 整页 innerText 原文(全量):

```
Profile
H
Hyper Drift 41
alex@nexgrid.ai
Joined on Jul 17, 2026
Public profile
Display name
Hyper Drift 41
Change
Visible to your team
Tier
Active
Progress to Upgrade-ready · 62%
Wallet address
Not set yet
Set address
Save Changes
```

### AC3 console 干净 — **PASS**

两场景全程 `console.error` 型消息 = **0**,`pageerror` = **0**。捕获到的全部 console 消息原文(均为 debug 级):

zh 场景(语言页 + profile 页两次文档加载,故 connecting/connected 出现两轮):

```
[debug] [vite] connecting...
[debug] [vite] connected.
[debug] [vite] hot updated: /__uno.css
[debug] [vite] connecting...
[debug] [vite] connected.
```

en 场景:

```
[debug] [vite] connecting...
[debug] [vite] connected.
[debug] [vite] hot updated: /__uno.css
```

vite connecting/connected 属豁免项;`hot updated: /__uno.css` 为 debug 级非 error,不触判定(另见 AC 外发现 #1)。favicon 404 本轮未出现。

### AC4 截图 — **PASS**

`docs/changes/evidence-profile-email/profile-zh.png`(fullPage)已存并目检:深色页面,顶部居中标题「个人资料」,左上返回键、右上铃铛;身份区为绿色圆形头像(字母 H,带角标)、加粗白字昵称「Hyper Drift 41」,**其正下方灰色小字一行清晰可读为 `alex@nexgrid.ai`**,再下一行为时钟图标 +「加入时间 2026年7月17日」;下方依次为「公开资料 / 昵称输入框(Hyper Drift 41)+ 更换 / 团队成员可见 / 等级 活跃 + 进度条 / 距离 升级候选 · 62% / 提现地址 尚未设置 + 设置地址 / 保存修改」。全图未见任何 `default` 字样。en 侧同型截图 `profile-en.png` 一并归档(超出 AC 要求,补充证据)。

## AC 之外的发现(全量列出,不合并、不自我审查;归因均超出黑盒范围)

1. **dev 资源请求中断(无法归因,疑 dev 环境固有)**:zh 场景捕获 1 条 requestfailed:`http://127.0.0.1:5399/__uno.css?t=1786847612484 :: net::ERR_ABORTED`,伴随 debug 消息 `[vite] hot updated: /__uno.css`(两场景各 1 次)。为 UnoCSS 按需生成触发的 HMR 重取被中断,非 console.error / pageerror,不影响 AC3 判定;是否与本修复包相关我无法归因(黑盒不读实现),更像 dev server 常态噪声。
2. **zh 进度文案含西文空格(无法归因,疑既有问题,与本修复无关)**:等级区进度标签是**单个文本节点**,原文=`距离 升级候选 · 62%`——「距离」与「升级候选」之间有一个空格(evidence.json 节点 x18/y341 可证),中文排版惯例应为「距离升级候选 · 62%」。en 侧 `Progress to Upgrade-ready · 62%` 无此问题。疑似档位名插值时沿用了英文空格拼接;是否本轮引入我无法归因,如实上报。
3. **观察项(非缺陷断言)**:「保存修改 / Save Changes」按钮在未做任何修改的初始态呈灰字弱化样式(截图可见),符合表单未脏时禁用的常见预期;其可点击性与交互行为不在本轮 AC 内,未验证,仅记录在案。
4. **观察项(非缺陷断言)**:身份行邮箱 `alex@nexgrid.ai` 在 zh / en 两语言下同值,与语言无关,符合「账号事实字段不随语言变化」的预期。

## 环境失败记录(不计入功能判定)

无。所有 goto 均第一次成功(zh:lang 1/3、zh:profile 1/3、en:profile 1/3),未触发 3s 重试;未杀、未重启 dev server;未在 5173 取证。

## 结论

4 条 AC 全 PASS。2026-08-15 T1 发现#2 的「zh 界面昵称下裸值 `default`」在 zh / en 两场景均未复现,身份行现渲染为邮箱形 `alex@nexgrid.ai`,整页无独立成行/成节点的裸 `default`,console 干净。轮次结论仅由上述证据决定;AC 外另报 2 项无法归因的观察级发现(#1 dev 噪声、#2 zh 进度文案空格)供裁决方回源。
