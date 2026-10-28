# APP r21 独立交互复审 B — FROZEN / READY

2026-10-28 JST。仅intro补验和签到增量，指定代表项均≥9，无新增P0/P1/P2。使用本人5268合成服务；钱包N/T。旧r19因并发包变化的有界冻结结论保留，本次结论来自r21新实景。

## 精确包与证据

- frozen root：`r21-frozen-web`（仓外构建目录，原路径见[指纹记录](fingerprint-r21.json)，未复制）。
- 实际入口index-BuAxQ2Gz.js / index-DPMvPy7r.css；每个geometry案例首尾核对实际DOM入口与冻结index.html，保存各自lazy CSS。
- JS SHA256：1AFAF0767B26DD949208AE492B42D99B00D2BB59230397866D91CD65A26A7361；主CSS SHA256：361F8178B8E346B1B8C3A0E2E168938DE62036EEF456B13962803AD0E07FA80D。收尾另只读GET5268所服务JS，HTTP200且SHA256完全一致。
- [指纹记录](fingerprint-r21.json)、[完整运行证据](runtime-r21-interaction-b.json)、[精简geometry/字号/颜色](geometry-summary-r21.json)。19个geometry截图案例，其中3张过渡图明确excluded；另有原Start注册页完整浏览器截图。
- 独立CUA Chrome标签1733373039。01–06为原生手机区域截图；后续因裁剪截图API超时，使用受支持的原始完整浏览器截图，手机bounds在JSON内。没有修图、改DOM或借另一审查员截图/评分。

## Intro单项评分

| 项目 | /10 | 实景结果 |
|---|---:|---|
| 390×844三语代表、一屏与安全区 | 9.3 | VI浅色01、ZH暗色03、EN浅色04。root/document scrollHeight=clientHeight844、scrollTop0，宽度无横溢。品牌图、完整标题/说明、两项统计标签、开始/登录和两个法律入口全部在一屏；底部实测37.99996px≈38px。主/次按钮54px，语言/法律入口≥44px。 |
| 320×693与320×568复验 | 9.3 | 05 EN浅色693、06 VI暗色568；root/document均scrollHeight=clientHeight对应viewport，无横溢。按钮44px、语言44px、法律link44px。两幅实际内容末边至root底38.00004/37.99998px，未锁死overflow；VI短屏完整文案可读。 |
| 原语言弹窗、选语言及关闭 | 9.3 | 原语言按钮Enter打开原位modal；分别选择Tiếng Việt/中文/English，实际切换语言code和intro文案并关闭sheet，未离开intro。02保存modal；另一次Escape实际关闭、仍在intro。原sheet底部38px、各语言行≥48px。 |
| Start/Login原入口 | 9.2 | 320VI代表：原Start Space实际到/pages/register/register，注册内容可见；未填字段或发送验证码。原Login Enter实际到/pages/login/login，登录内容可见；没有提交账号。证据07-start-original-route-full-browser.jpg、08b-login-settled-original-route.jpg及动作JSON。 |
| Terms/Privacy只读入口 | 9.2 | 原Terms Enter实际到/pages/onboarding/terms，越文版本正文呈现；未点“Đã hiểu”，用原Quay lại返回。原Privacy Enter到/pages/onboarding/privacy?return=%252Fpages%252Fonboarding%252Fintro，实际越文正文呈现，原返回后可继续操作intro；不接受协议。原route及正文都存JSON，未为此重跑法律业务矩阵。 |
| reduced-motion代表 | 9.3 | 320×568 VI暗色实际media reduce=true，SMIL animate/animateMotion节点0，intro主要元素和背景节点无CSSAnimations；17完整原图成功保存。媒体设置已恢复false。 |

当前intro统计实际为“—”占位，两项标签存在；不填造发布数据、不签真实统计或长数字形态。代表矩阵按上表披露，未声称3语×所有尺寸×双主题全组合。

## 签到单项评分

| 项目 | /10 | 实际覆盖与证据 |
|---|---:|---|
| 浅色右上按钮蓝影、今天格蓝底/边/光 | 9.3 | 320VI浅色09/10、390ZH浅色11b/12。brand实读#0E48E6；surface shadow的srgb=0.054902/0.282353/0.901961，320为15% 0/3/10px，390为28% 0/6/18px；今天格边框、渐变底和两层光晕均同主题蓝。未签与已签都实景检查。 |
| 暗色保绿 | 9.3 | 390EN暗色13b/14、320VI暗色15/16。brand实读#9EDC1D；对应shadow srgb=0.619608/0.862745/0.113725，320为15%、390为28%，今天格为绿色主题token。原图可见绿色按钮/光，不把浅色token变更一刀切成蓝。 |
| 今天标签三语10.5px、数字档保留 | 9.3 | 所有前后案例的今天/Today/Hôm nay均10.5px/14px；普通日数字2–7仍11.5px，+5 day-mark仍12px。VI文字ink41.80px容于52px今天格；ZH21px、EN28.29px容于约41.52px格。完整三语无截字或叠压，标题/meta按现有断行呈现。具体computed font/ink/box及照片见geometry-summary。 |
| 原签到前后与daily入口 | 9.3 | 四个代表场景均由原按钮在本地模拟完成一次签到，状态实际从未签变已签；未签/已签aria分别完整保留签到/已签到、Check in/Checked in、Điểm danh/Đã điểm danh。根均44px；320可见32px，390未签40px/已签36px。实点根顶部内2px完成签到，VI已签同一外沿进入/pages/daily/daily并原Quay lại返回。未验证网络提交次数、生产奖励或财务记账。 |

四代表：320VI浅、390ZH浅、390EN暗、320VI暗，各前后。均为5268原演示连续签到/断签fixture，只有原UI操作；不清storage、不写store。11b/13b是通过原fixture重新进入未签状态后补拍的稳定前帧；对应真实签到动作和12/14已签帧保留，没有伪造DOM状态。未扩大到签到全日历/补签/真实奖励业务。

## 取证限制与排除图

- 裁剪截图Page.captureScreenshot多次超时，未保存失败图片；改用原生完整浏览器截图成功。reduce初始取证限制已由17补成，未把超时当产品缺陷。
- 08-login-original-route.jpg的DOM已切Login但光栅仍为旧intro过渡帧，excluded，用08b。
- 11-checkin-390-zh-light-before.jpg及13-checkin-390-en-dark-before.jpg为祖先入场opacity尚未完成的空白帧，excluded；用11b/13b。原始历史不删除。
- 钱包所有分支N/T，不读取/改动并行钱包产品文件、不借父线程或另一审查员通过代签。物理APP safe-area/系统大字/真实服务和付款均N/T。

## 冻结

没有改源码、构建、运行测试、commit/push、注册或接受协议；没有操作5237/其他QA服务或用户标签。只操作5268合成账号和原UI，未启用错误代理。原QA服务不动。报告/读回存档后关闭本人标签；5268服务保留。

指定intro与签到增量已达门槛，READY；不代表钱包、生产业务或未列全组合通过，不再扩展矩阵。
