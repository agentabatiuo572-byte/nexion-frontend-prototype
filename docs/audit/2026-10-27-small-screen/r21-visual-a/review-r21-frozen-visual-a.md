# R21 固定快照：独立视觉 A 最终冻结

**READY。两项均通过本报告列出的本地代表范围，无新增P0/P1/P2。** 官方CUA Chrome4、自有5269/preview标签1733373036；固定DEMO_BUILD_ROOT为r21-frozen-web，未操作用户5237或其他QA服务。

| 本轮项目 | 独立分数/10 | 结论 |
| --- | --- | --- |
| Intro小/短屏完整一屏、触区与视觉层次 | **9.2** | 12个三语/双主题代表完整手机PNG，逐例首尾入口一致；所有实测doc scroll宽高等于视口，内容距底37.67–38px。未通过隐藏球体、文案、统计、CTA或法律入口塞入一屏；球体随高度收紧、文字换行自然、主次清楚。 |
| Home签到主题蓝阴影＋今天标签10.5px | **9.2** | 12个代表帧，越文完整覆盖320/390×浅暗×未签/已签，再补中英两状态；浅色按钮阴影/今天边框及下缘光为主题蓝，暗色保留绿；三语今天标签10.5px完整可读，日期数字未同步缩小。 |

## 当前候选与证据

实际入口 **index-BuAxQ2Gz.js / index-DPMvPy7r.css**。每例截图前后均读回入口、实际路由、主题、语言和懒CSS；未再出现R19共享dist漂移。开始和结束均校验固定文件SHA256：

| 文件 | SHA256 |
| --- | --- |
| index-BuAxQ2Gz.js | 1AFAF0767B26DD949208AE492B42D99B00D2BB59230397866D91CD65A26A7361 |
| index-DPMvPy7r.css | 361F8178B8E346B1B8C3A0E2E168938DE62036EEF456B13962803AD0E07FA80D |
| intro-CIkBy_3L.css | BE9BDC4988BCCDB36CB57BC39336203D0BAD41F40A7F11234DC7F0D976DE1680 |
| daily-check-in-row-BoXMjQFA.css | F2F298720942752297BEE9C78098D5F117FF8EE0A33A76750DE662C676522E64 |

[50条原始读回、24张PNG及SHA256](runtime-r21-frozen-visual-a.json) / [逐例覆盖与几何颜色表](coverage-r21.json)。所有PNG为官方CUA控制下的CDP原生完整手机裁切，无缩放修改或遮盖元素。美感评分依据实际目检，不由computed或源码分自动推导。

## Intro：实际覆盖与关键几何

每一尺寸各取 **VI浅、VI暗、ZH暗、EN浅**，共12帧，属于明确代表范围，未冒称18格全组合。

| 尺寸 | VI浅/暗 | ZH暗 | EN浅 |
| --- | --- | --- | --- |
| 320×693 | [浅](r21-intro-vi-light-320x693.png) / [暗](r21-intro-vi-dark-320x693.png) | [图](r21-intro-zh-dark-320x693.png) | [图](r21-intro-en-light-320x693.png) |
| 320×568 | [浅](r21-intro-vi-light-320x568.png) / [暗](r21-intro-vi-dark-320x568.png) | [图](r21-intro-zh-dark-320x568.png) | [图](r21-intro-en-light-320x568.png) |
| 390×844 | [浅](r21-intro-vi-light-390x844.png) / [暗](r21-intro-vi-dark-390x844.png) | [图](r21-intro-zh-dark-390x844.png) | [图](r21-intro-en-light-390x844.png) |

- 320×693：标题26px/31.2，两CTA280×44，sub13，统计11。最底内容655.33，view clientH693，约37.67px余量（CSS像素取整）；根/视口实际边界间为38px。
- 320×568：标题24px/28.8，两CTA280×44，sub13、统计11；最底530，余量38。越文标题两行、说明两行，球体/统计/CTA/协议全部完整，无原生灰条或纵横溢出。
- 390×844：保留常规title34/sub15/统计12、CTA342×54；并非谎称所有尺寸都26/44。最底806，余量38。中英文及越文层次保持，英文标题整词自然换行。
- 语言入口三语均44高，宽约62.92–67.81。Terms/中文短链接最小实际44×44；VI最长隐私链接约129.18/140.92宽且44高，法律提示自然分行、未被裁切。HomeIndicator与正文无叠压。
- 所有必需内容节点display/visibility/opacity检查与截图一致，无隐藏正文来获取一屏。统计当前为—未知值，未伪造真实平台数字，也不签真实数据格式/后端能力。

## 签到：实际覆盖、字体与颜色

每个状态各取 **VI320浅暗、VI390浅暗、ZH390暗、EN320浅**，共12帧；这覆盖了越文最完整的两宽度/两主题/两状态，未冒称24格全组合。

| 状态 | VI320浅/暗 | VI390浅/暗 | ZH390暗 | EN320浅 |
| --- | --- | --- | --- | --- |
| 未签 | [浅](r21-checkin-unclaimed-vi-light-320x693.png) / [暗](r21-checkin-unclaimed-vi-dark-320x693.png) | [浅](r21-checkin-unclaimed-vi-light-390x844.png) / [暗](r21-checkin-unclaimed-vi-dark-390x844.png) | [图](r21-checkin-unclaimed-zh-dark-390x844.png) | [图](r21-checkin-unclaimed-en-light-320x693.png) |
| 已签 | [浅](r21-checkin-checked-vi-light-320x693.png) / [暗](r21-checkin-checked-vi-dark-320x693.png) | [浅](r21-checkin-checked-vi-light-390x844.png) / [暗](r21-checkin-checked-vi-dark-390x844.png) | [图](r21-checkin-checked-zh-dark-390x844.png) | [图](r21-checkin-checked-en-light-320x693.png) |

- 浅色按钮surface为 **rgb(14,72,230)，#0E48E6**。320外阴影同蓝alpha.15、0 3px 10px；390同蓝alpha.28、0 6px 18px，白色内缘保留。未签及已签均实测，不再出现这两处硬编码绿色阴影。
- 浅色今天格border同蓝alpha.6，阴影为同蓝alpha.1的3px环＋alpha.18的0 6px 16px下缘光，实景为蓝。暗色按钮基色rgb(158,220,29)，对应绿光保留，今天字色rgb(230,255,158)。未将暗色一并改蓝。
- **今天／Today／Hôm nay均10.5px/14px，数字1、2、4–6及+40仍11.5px/14px**；中间day-mark点/奖励标记仍12px。越文today格320宽52、390宽58.125，高50，长标签完整单行，未挤成孤字或隐藏。
- 未签按钮高44，VI320宽81.25/390宽107.46；已签为44×44，仅勾图标，完整已签aria保留。三语copy、标题、奖励提示完整，右上按钮与copy未相互覆盖，全页无横溢。
- 在5269合成账户上仅点一次原Check in按钮，真实观察未签→Checked in/3-day streak，并在主题/语言切换后保持已签；没有写store造状态。仅本地模拟，未声称真实奖励/后台发放。EN320已签帧含正常+5UVT toast，位于签到卡下方，签到卡不受遮挡；其余已签帧为toast消失后的代表。

## 边界与清理

只签上述两项代表范围。未注册、未登录真实账户、未接受条款、未付款；未运行构建/测试或改产品源码。物理APP安装、系统字号放大、真实设备安全区/原生触摸及真实后端未验证，不冒称全站或正式原生通过。

原[R19部分帧及指纹漂移](../r19-visual-a/review-r19-partial-build-drift.md)保留，不能反写为R19已完整通过；本报告是新固定候选的独立结论。钱包8.8旧记录继续OPEN，本次未访问钱包或借新包关闭它。

只关闭本人标签1733373036，5269及其他服务不停止；原QA模拟签到后已签状态保留，不重置用户数据。无新增故障代理模式。冻结时间2026-10-27T16:21:22.005Z。READY。
