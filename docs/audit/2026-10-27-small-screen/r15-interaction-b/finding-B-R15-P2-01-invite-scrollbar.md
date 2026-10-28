# B-R15-P2-01 — r15邀请读取恢复后出现原生灰滚动条

状态 **P2 OPEN，8.7/10**。独立CUA Chrome，APP-source入口 **index-efmh8j2a.js / index-CqtM5MAW.css**，仅本人5252，合法既有fixture **UVELDEMO**。

320×693越文浅色，从现有error状态看到quiet重试，Enter触发5秒慢读取，实际观察aria-disabled=true/tabindex=-1、根65×44和32px伪层，随后原请求恢复正常邀请内容。恢复后出现右侧宽灰document scrollbar：innerWidth320，documentElement.clientWidth305，原生条占15px；scrollHeight760/clientHeight693，真实滚轮0→66.67，内容可滚到底。错误态没有此条，不能以错误按钮通过代签正常恢复页面。

[恢复后顶部](07-invite-recovered-vi-light-320.jpg) / [真实滚到底](08-invite-recovered-scroll-bottom-vi-light-320.jpg) / [disabled状态](06-invite-read-loading-disabled-vi-light-320.jpg)。本次为受支持CUA标签直接导航后用Chrome viewport emulation 320×693，未改DOM/store/业务数据；同源preview控制只改本人mock error/loading/normal。未创建账号、未接受条款、未点击进入UVEL主CTA。

建议在该独立页面实际滚动所属边界隐藏原生条并保留纵向滚动；新包需同路由上下滚到底验证，不能overflow:hidden锁内容。此finding不是H5部署/物理Android已复现声明。
