# R22 独立视觉 A：USDT小增量冻结

**READY；两项各9.2，无新增P0/P1/P2。** 只在本人5267/preview使用官方CUA Chrome4，6个代表场景、7张完整手机PNG（1张入场过渡保留、6张最终依据），14条首尾DOM读回。未改源、构建、测试或业务场景；未操作5237/其他服务。

| 项目 | 独立分数/10 | 结论 |
| --- | --- | --- |
| 首页收益USDT角标 | **9.2** | 中/英/越均USDT，320/390、浅暗代表无裁切/挤压/横溢。静态角标实测约44.73×19.33、12px/500、JetBrains Mono、nowrap；金额仍$16.24，$20px/整数56px/小数36px层次保留。 |
| 今天10.5px与蓝光代表回归 | **9.2** | 今天/Today/Hôm nay均10.5px/14px，完整可见；日期数字仍11.5px。浅色今天边框/下缘光及右上签到按钮阴影为主题蓝，暗色保持绿；没有把USDT紫/青标签色误用为签到色。 |

## 实际指纹

入口 **index-C1VSW6rq.js / index-DPMvPy7r.css**，首页懒CSS **index-D6_GdV75.css**，签到 **daily-check-in-row-BoXMjQFA.css**。每例截图前后实际入口一致，固定root为r22-frozen-web。

- JS SHA256：C7E8F60650F9E1CBE0E8BA2290EDDB6B07A0E69C2C54D8506DE5FF8CFE61781E。
- 签到CSS SHA256：F2F298720942752297BEE9C78098D5F117FF8EE0A33A76750DE662C676522E64，与R21逐字节相同。
- Intro CSS SHA256：BE9BDC4988BCCDB36CB57BC39336203D0BAD41F40A7F11234DC7F0D976DE1680，与R21逐字节相同；本次未访问intro或重跑其矩阵。

[完整指纹、几何/字号/颜色、原始读回和图片SHA256](runtime-r22-frozen-visual-a.json)。

| 代表场景 | 实际截图 | USDT/金额 | 今天标签 |
| --- | --- | --- | --- |
| ZH390暗 | [图](r22-home-usdt-zh-dark-390x844.png) | USDT / $16.24 | 今天10.5px |
| ZH320浅 | [稳定图](r22-home-usdt-zh-light-320x693-settled.png) | USDT / $16.24 | 今天10.5px |
| VI320浅 | [图](r22-home-usdt-vi-light-320x693.png) | USDT / $16.24 | Hôm nay10.5px |
| VI390暗 | [图](r22-home-usdt-vi-dark-390x844.png) | USDT / $16.24 | Hôm nay10.5px |
| EN320暗 | [图](r22-home-usdt-en-dark-320x693.png) | USDT / $16.24 | Today10.5px |
| EN390浅 | [图](r22-home-usdt-en-light-390x844.png) | USDT / $16.24 | Today10.5px |

角标浅色字rgb(7,122,133)/底rgb(224,246,249)，暗色字rgb(142,114,255)/底rgba(142,114,255,.2)，实际目检文字清晰。320越/英标题与badge最小间隔约116.39px，390约186.39px，未顶挤；badge右缘距视口18px，overflow0。原$符号及金额没有被USDT替换。

浅色今天格border为#0E48E6 alpha.6，下缘光为同蓝alpha.18的0 6px 16px＋alpha.1的3px环；按钮阴影320同蓝alpha.15、0 3px 10px，390同蓝alpha.28、0 6px 18px。暗色仍对应#9EDC1D主题绿光。三语日期数字保持11.5px，today专属标签10.5px；这与R21相同且已在新包实际读回。

## 边界与清理

本轮是6个跨语言/宽度/主题的代表，不冒称全组合。签到新包仅补未签状态的字号/色彩代表，未再次点击签到；R21已签/未签完整证据按相同CSS保留，不改写旧截图为R22。中文浅色最初截图带入场过渡，原图保留，视觉判断采用另存-settled帧；未把一次等待装饰动画的工具超时算产品故障。

只签USDT文案小增量和指定签到回归；钱包8.8继续OPEN且未访问，不涉及正式Java/真实服务/物理APP安装或全站通过。无注册、协议接受、付款、业务写入；只关闭本人标签1733373044，5267及其他服务保留。冻结时间2026-10-27T16:36:54.588Z，READY。
