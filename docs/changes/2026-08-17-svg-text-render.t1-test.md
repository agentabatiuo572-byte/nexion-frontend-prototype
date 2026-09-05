本页判定目标 = 示意图内文字可见且正确(来源:提案 docs/changes/2026-08-17-svg-text-render.md Done-when)

# T1 黑盒验收 — SVG 示意图文字渲染

- 验收方式:独立黑盒。只看浏览器实测(DOM 度量 + 像素采样 + 人眼看图),未读实现源码。
- 靶子:`http://localhost:5231/?nx_device=off#/<route>`(既有 mock dev server,未另起 server)。
- 视口 414×896,headless Chromium,`deviceScaleFactor=2`。
- 覆盖面:4 路由 × 3 语言(en/zh/vi)× 2 主题(dark/light)= **24 组**,全部实测(任务只要求 dark×3 + light×en,此处做满 light×3 作为加严)。
- 每个语言 / 主题一个**独立 browser context**,`addInitScript` 在 app 启动前写入 uni storage-shell 格式;实测 `data-theme` 与回读的 `nexgrid-locale-v1` 均与请求一致。
- 产物目录:`D:\WORKS\PLAN\Nexion-uniapp\.claude\worktrees\aw-svg-text\.claude\pkg-dev\tester\`
  (`results.json` 原始度量 / `analysis.json` 逐条判定 / `contrast.json` 像素对比度 / `*.png` 截图)

## 判定表(24 行)

AC-1 = `svg text` 计数 ≥ 期望且 `svg uni-text` = 0;AC-2 = 最小 bbox(px,所有 label 均 >0 且文本非空);
AC-3 = 全部落在所属 `<svg>` 框内(容差 2px);AC-4 = `font-size` 属性 == computed(±0.01);
AC-5 = 语言文案匹配;AC-6 = console.error / pageerror 数(已滤 favicon);AC-7 = 截图已取且人眼判读;
AC-8 = network 中心 label 计算色 / 底色 / 对比度。

| 路由 | 语言 | 主题 | AC-1 | AC-2 最小 bbox | AC-3 | AC-4 | AC-5 | AC-6 | AC-7 | AC-8 | 截图 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| team/network | en | dark | 4/4, uni=0 | 16.1x10.0 | PASS | PASS | PASS | 0 | PASS | rgb(10,10,10) on rgb(158,220,29) = 11.98:1 | network-en-dark.png |
| team/binary-how | en | dark | 5/5, uni=0 | 6.0x11.0 | PASS | PASS | PASS | 0 | PASS | n/a | binaryhow-en-dark.png |
| globe/globe | en | dark | 1/1, uni=0 | 14.4x8.0 | PASS | PASS | PASS | 0 | PASS | n/a | globe-en-dark.png |
| store/detail?id=cloud-share | en | dark | 6/6, uni=0 | 12.5x5.0 | PASS | PASS | PASS | 0 | PASS | n/a | cloudshare-en-dark.png |
| team/network | zh | dark | 4/4, uni=0 | 14.0x10.0 | PASS | PASS | PASS | 0 | PASS | rgb(10,10,10) on rgb(158,220,29) = 11.98:1 | network-zh-dark.png |
| team/binary-how | zh | dark | 5/5, uni=0 | 6.0x11.0 | PASS | PASS | PASS | 0 | PASS | n/a | binaryhow-zh-dark.png |
| globe/globe | zh | dark | 1/1, uni=0 | 9.0x8.0 | PASS | PASS | PASS | 0 | PASS | n/a | globe-zh-dark.png |
| store/detail?id=cloud-share | zh | dark | 6/6, uni=0 | 12.5x5.0 | PASS | PASS | PASS | 0 | PASS | n/a | cloudshare-zh-dark.png |
| team/network | vi | dark | 4/4, uni=0 | 16.1x10.0 | PASS | PASS | PASS | 0 | PASS | rgb(10,10,10) on rgb(158,220,29) = 11.98:1 | network-vi-dark.png |
| team/binary-how | vi | dark | 5/5, uni=0 | 6.0x11.0 | PASS | PASS | PASS | 0 | PASS | n/a | binaryhow-vi-dark.png |
| globe/globe | vi | dark | 1/1, uni=0 | 15.3x9.0 | PASS | PASS | PASS | 0 | PASS | n/a | globe-vi-dark.png |
| store/detail?id=cloud-share | vi | dark | 6/6, uni=0 | 12.5x5.0 | PASS | PASS | PASS | 0 | PASS | n/a | cloudshare-vi-dark.png |
| team/network | en | light | 4/4, uni=0 | 16.1x10.0 | PASS | PASS | PASS | 0 | PASS | rgb(255,255,255) on rgb(14,72,230) = 6.8:1 | network-en-light.png |
| team/binary-how | en | light | 5/5, uni=0 | 6.0x11.0 | PASS | PASS | PASS | 0 | PASS | n/a | binaryhow-en-light.png |
| globe/globe | en | light | 1/1, uni=0 | 14.4x8.0 | PASS | PASS | PASS | 0 | PASS | n/a | globe-en-light.png |
| store/detail?id=cloud-share | en | light | 6/6, uni=0 | 12.5x5.0 | PASS | PASS | PASS | 0 | PASS | n/a | cloudshare-en-light.png |
| team/network | zh | light | 4/4, uni=0 | 14.0x10.0 | PASS | PASS | PASS | 0 | PASS | rgb(255,255,255) on rgb(14,72,230) = 6.8:1 | network-zh-light.png |
| team/binary-how | zh | light | 5/5, uni=0 | 6.0x11.0 | PASS | PASS | PASS | 0 | PASS | n/a | binaryhow-zh-light.png |
| globe/globe | zh | light | 1/1, uni=0 | 9.0x8.0 | PASS | PASS | PASS | 0 | PASS | n/a | globe-zh-light.png |
| store/detail?id=cloud-share | zh | light | 6/6, uni=0 | 12.5x5.0 | PASS | PASS | PASS | 0 | PASS | n/a | cloudshare-zh-light.png |
| team/network | vi | light | 4/4, uni=0 | 16.1x10.0 | PASS | PASS | PASS | 0 | PASS | rgb(255,255,255) on rgb(14,72,230) = 6.8:1 | network-vi-light.png |
| team/binary-how | vi | light | 5/5, uni=0 | 6.0x11.0 | PASS | PASS | PASS | 0 | PASS | n/a | binaryhow-vi-light.png |
| globe/globe | vi | light | 1/1, uni=0 | 15.3x9.0 | PASS | PASS | PASS | 0 | PASS | n/a | globe-vi-light.png |
| store/detail?id=cloud-share | vi | light | 6/6, uni=0 | 12.5x5.0 | PASS | PASS | PASS | 0 | PASS | n/a | cloudshare-vi-light.png |

**FAIL 清单:无。** 24 行 × 8 项全部通过。

## AC-5 实测文案(dark;light 同文案)

`svg text` 按 DOM 顺序取到的实际内容:

| 路由 | en | zh | vi |
|---|---|---|---|
| team/network | `YOU / V2 / DIRECT / EXTENDED` | `你 / V2 / 直推 / 扩展` | `BẠN / V2 / TRỰC TIẾP / MỞ RỘNG` |
| team/binary-how | `YOU / A / Track A / B / Track B` | `你 / A / A 轨道 / B / B 轨道` | `BẠN / A / Nhánh A / B / Nhánh B` |
| globe/globe | `You` | `你` | `Bạn` |
| store/detail?id=cloud-share | `CLOUD SHARE / DISTRIBUTED · NO HARDWARE / GPU / CPU / RAM / SSD` | 同 en | 同 en |

- 三个 i18n 路由的三语渲染结果**两两不同(distinct 3/3)**,证明三个 context 确实各跑各的语言,不存在「三遍其实测了同一种语言」。
- Cloud Share 丝印与 chip 三语**全一致为英文(distinct 1/3)**,与任务说明的「by design」一致,按要求只记录不判错。
- `V2`(段位)三语均为 `V2`,属不翻译的段位代号。

## AC-4 字号实测(dark/en;其余语言主题同值)

写进属性的字号被完整尊重,24 组无一例外:

| 路由 | label → `font-size` 属性 / computed |
|---|---|
| team/network | `YOU` 11/11 · `V2` 9/9 · `DIRECT` 7/7 · `EXTENDED` 7/7 |
| team/binary-how | `YOU` 10/10 · `A` 9/9 · `Track A` 9.5/9.5 · `B` 9/9 · `Track B` 9.5/9.5 |
| globe/globe | `You` 10/10 |
| store/detail?id=cloud-share | `CLOUD SHARE` 22/22 · `DISTRIBUTED · NO HARDWARE` 10/10 · `GPU/CPU/RAM/SSD` 13/13 |

注:屏幕 bbox 与字号不等比(如 `CLOUD SHARE` 22px 字号 → 屏幕高 10px,network `YOU` 11px → 屏幕高 15px),原因是各 SVG 有自己的 viewBox 缩放;`getComputedStyle` 返回的是未缩放的用户单位值,与属性一致,故 AC-4 成立。宽高同比例缩放,内部自洽。

## AC-8 中心 label 配色(两主题)

| 主题 | 文字色 | 底色(circle) | 对比度(计算) | 对比度(像素实测) |
|---|---|---|---|---|
| dark | `rgb(10,10,10)` 近黑 | `rgb(158,220,29)` 柠檬绿 | 11.98:1 | 11.99:1 |
| light | `rgb(255,255,255)` 白 | `rgb(14,72,230)` 蓝 | 6.80:1 | 6.80:1 |

**两个主题都清晰可读**,均超过 WCAG AA 正文 4.5:1。三语一致(`YOU` / `你` / `BẠN`)。
注意 light 主题下中心圆不是柠檬绿而是蓝色,配白字;柠檬绿+近黑是 dark 主题的方案。两种组合各自成立。

## 记录项(note,非 FAIL)

按任务口径:label 已渲染且可辨认 → 记录对比度关切,不判 FAIL。以下均已放大到 4–6 倍逐个人眼确认「字确实在、笔画可辨」。

1. **`binary-how` 的 `B` 是全场最低对比度**:dark 1.29:1 / light 1.14:1(fill `rgba(142,114,255,0.2)`,即 20% 透明度)。放大后 dark 下是紫底上略亮的紫字、light 下是浅青底上的白字,**能认出是 B**。同一图里 `A` 是 `rgb(158,220,29)` 实色(6.58:1)。看形态是**刻意把未激活的 B 轨道做暗**(节点圆、连线、文字整体一起暗),属设计意图而非渲染缺陷 —— 但 1.14:1 已低到「知道那儿有字才看得见」,若 B 轨道文案需要被读,建议提高 alpha。
2. **light 主题下 network 的三个非中心 label 偏淡**:`V2` 1.08:1、`EXTENDED`/`扩展`/`MỞ RỘNG` 1.77:1,`DIRECT` 亦明显偏淡。这些是柠檬绿 / 浅紫写在近白奶油底上 —— 该配色在 dark 底上很好(`V2` 9.5:1、`DIRECT` 13.5:1),移到 light 底就几乎失效。**放大 4 倍后字形可读**,1:1 手机尺寸下吃力。这是 light 主题的配色适配问题,不是本次文字渲染改动引入的。
3. **light 主题下 Cloud Share 产品图仍是深色面板**:丝印 `CLOUD SHARE` 1.75:1、chip `GPU/CPU/RAM/SSD` 2.61:1(蓝字写在深藏青上)。可读但偏暗。
4. **`globe` 的 `You` 在 light 下 1.79:1**(青字写在奶油底),可读但淡;dark 下 4.1:1 正常。

## 度量方法的已知偏差(影响上面的对比度数字怎么读)

像素对比度的取法是「label bbox 内**离背景中位亮度最远**的那个像素 = 墨色」。当 bbox 内混进了非文字元素(节点圆点、轨道描边),该像素会来自那个元素而非文字本身,**数值会被高估**。已实锤一例:light 下 `DIRECT` 报 5.16:1,但 `ink=rgb(25,80,230)` 是蓝色节点圆点的颜色,而 `DIRECT` 自身 fill 是柠檬绿 —— 真实对比度远低于 5.16。

所以:**报低的可信(是上界),报高的不一定可信**。故 AC-7 最终以人眼看图为准,像素数字仅作佐证;AC-8 因中心 label 落在纯色圆内、bbox 无杂质,计算值与像素值吻合到小数点后一位(11.98 vs 11.99、6.80 vs 6.80),可直接采信。

## 排除掉的环境干扰(不是缺陷)

- **mock 里程碑弹层 `.ms-overlay`**(fixed,z-index 780,满屏,内含 `.ms-backdrop` `blur(8px)`)会盖在示意图上并把底下内容糊掉,且**内部没有任何按钮**,点背景也不消失。首轮截图因此被污染,一度把 `network/zh/light` 的中心字测成 1.13:1(实际 6.8:1)。
  处理:**DOM 度量全程不动 app**(弹层不改变 `getBoundingClientRect` / `getComputedStyle`,AC-1..AC-6、AC-8 不受影响),只在**截图前**移除该弹层。复核手段:像素实测与计算值吻合(11.99 vs 11.98、6.80 vs 6.80)即证明截图已干净。
  该弹层出现与否**不稳定**(重跑后 24 组里只 1 组命中),所以是逐次移除而非一次性判断。
- `cloudshare` 截图顶部偶见 "Quest complete · +100 NEX" 横幅,压在图形上方空白区,未遮挡 6 个 label。
- 三语 / 双主题必须在 app 启动前经 `addInitScript` 注入,且各用独立 context —— 已按此执行并回读校验(`data-theme` 与 `nexgrid-locale-v1` 均与请求一致)。

## 自验(主人可自查 3 步)

1. 打开 `http://localhost:5231/?nx_device=off#/pages/team/network`(注意 `?nx_device=off` 必须在 `#` 前面)。
2. 控制台跑 `document.querySelectorAll('svg text').length` → 应为 `4`;跑 `document.querySelectorAll('svg uni-text').length` → 应为 `0`。
3. 眼看:中心柠檬绿圆里有黑色 `YOU`,上方有 `V2`,内外圈各有 `DIRECT` / `EXTENDED`。切中文应变成 `你 / 直推 / 扩展`。

VERDICT: PASS 24/24
