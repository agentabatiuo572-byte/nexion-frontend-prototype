# APP r17 独立交互复审 B — FROZEN / READY

2026-10-27。仅复审约定增量及既有待验项；实景已结束，本人 Chrome 标签 1733372999 已关闭，可构建 r18。5252/5262/5272 QA 服务保留；5272最终模式off。未改产品、构建、跑测试、commit/push，未操作5237/5251及其他审查员标签。本报告不签物理APP或生产业务。

## 精确产物与证据

- 实际运行入口：assets/index-BQJ7beyl.js；主CSS assets/index-DPMvPy7r.css。
- JS SHA256：1D7EA486CB6B732ECBA0172F7E92B3F18222EEDA261E310682E354FBD56393C9。
- 主CSS SHA256：361F8178B8E346B1B8C3A0E2E168938DE62036EEF456B13962803AD0E07FA80D。
- 独立CUA实操，5252原模拟服务，5272只读故障代理→5252，5262只读库存代理→5252。页面明确为模拟数据，不连接真实服务。运行记录43个截图案例、44个动作/读回条目，所有案例均绑定BQJ入口并记录各自动态CSS列表；没有靠主CSShash推断组件未变。
- [完整运行读回](runtime-r17-interaction-b.json)、[已先交优先阶段](stage-1-nav-capacity.md)。截图均原生浏览器截图，未修图。

## 本轮实际评分

| 范围 | /10 | 实际操作与结论 | 主要证据 |
|---|---:|---|---|
| 320VI明暗导航五选中态、外沿命中 | 9.3 | 五栏均实际点根顶部内2px，进入正确路由、恰一aria-current；296×56根、约55.6×46栏目，22px图标按1.18实绘25.96px，标题隐藏而完整accessible label保留。文档无横溢。 | 01-nav-320-vi-light-0～4；02-full；03-dark-0～4 |
| 选中回弹/reduced motion | 9.3 | CSSAnimation实测260ms、1次、4关键帧，捕获运行中159–187ms及变化缩放。reduce媒体条件下仍可导航，无运行图标动画、静态scale1.18；已恢复媒体条件。被动animation事件观察器未捕获end，未声称事件计时。 | 03系列运行对象；04-nav-reduced-motion-320-vi-dark.jpg |
| 390ZH原导航/玻璃/底部 | 9.3 | 明暗五栏实际点击；根68px、栏目58px、图标22px、标签显示；底部约22px，LiquidGlass轨道/选中层/光学层/边缘仍在。部分条带截在镜片过渡中，稳定Home整屏另存。 | 05/07五态；06/08 Home整屏 |
| 满槽VI短文/等高/118机图/管理守卫 | 9.2 | 320/390两主题：Hết chỗ. Giải phóng 1 vị trí.；短Quản lý，aria完整Quản lý thiết bị。320双卡226.333px，390双卡215.333px，等高。118×118机图，地板与机图4200ms运行对象同currentTime；44根/32面。四视图实际点根上沿进入/pages/me/devices，原返回，未领取/激活/购买。 | 09～12 full系列 |
| 原签到→checked紧凑图标/跳转 | 9.2 | 5252一次性本地模拟通过原签到按钮完成一次，出现+5UVT模拟反馈及已签；44×44根/32面/18勾，完整aria Đã điểm danh；点根上沿进入/pages/daily/daily并返回。busy/重复点击请求数未捕获，见N/T。 | 13-checkin-result；14-checked-compact |
| 钱包金额响应式/零值/失败原恢复 | 9.2 | 320VI浅色正常$52,800.64用30px；$1,234,567,890.12实读25.7014px，无横溢；390ZH暗色长金额完整。zero真实呈$0.00。wallet-funds失败保留最近确认零快照并明确提示，原Enter“Làm mới ví”在off后恢复$52,800.64。读取按钮13/600/20、44根、32可见面，靠右。无付款操作。 | 15/16/17b/18/19/20钱包系列 |
| Ref旧灰条、长越文、紧凑CTA、原恢复/滚动 | 9.2 | 320×693、mobile:false复现同类原生滚动条条件。错误态Enter原retry→off恢复；根clientWidth=scrollWidth=innerWidth=320，无旧15px灰条。错误文案左换行，右65×44 retry；已登录CTA约116.54×44、右靠。短屏390×420内容555px，实际wheel从0→135.333底，再回0，根宽390，scrollbar-width:none/::-webkit-scrollbar:none而内容仍可滚。3法律link均44且保留；Enter“Điều khoản”进入terms未接受；Space“Vào UVEL”进入首页。 | 21/22；23b真实底部视口；运行条目 |
| staking FAQ exchange-config读取原恢复/禁用 | 9.2 | 重启本人5272读取新/api/config/exchange/caps模式；320VI浅色FAQ原retry实读13/600/20、65×44根、32可见面。Enter重试被动观察到aria-disabled=true/tabindex=-1；故障off后点根顶部2px恢复，错误按钮移除，FAQ正常。未点质押/交换。 | 24-error；25-recovered；运行条目 |
| slot暗色材质/安全边界/三种取消 | 9.2 | 5262合法库存fixture。320VI暗色panel320×302.25，class sas-panel nx-glass-sheet，rgb20/20/20约98%底+渐变，角16/16/0/0；padding18/16/38，末设备底655.33至屏底693.33留38px。关闭44根/36可见面，实点根上沿、Space关闭、遮罩取消均成功。没有点库存设备/激活/购买。 | 26-slot-dark-material-320-vi.jpg；三种关闭动作 |

所有表中已触发范围≥9；本轮未新增B的P0/P1/P2。阶段评分只适用于表内代表条件。

## 历史失败和边界

- B-R16-P2-01：320VI满槽282.333px撑高/8.7保留历史；r17上述226.333px代表实景关闭该VI布局项。
- B-R15-P2-01：Ref根灰条/8.7保留历史；r17相同desktop滚动条条件+真实短屏上下滚动关闭已测范围。
- A独立发现的r17 390ZH满槽“位。”孤字/8.8仍OPEN。本轮B的VI9.2不能代关中文。父线程已告知中文“队列已满，先腾出1位”仅源码修改、尚未进入当前BQJ产物，待r18仅复核390ZH/320ZH及管理入口。
- 满槽来自现有trialState=capacityFull模拟控制；管理页实际仍显示2/6普通库存。这里只验证该已授权合成状态的卡片/入口守卫，未证明生产容量一致性或后端原子领取限制。
- 试图观察签到busy时设置的本标签网络延迟未截获忙碌态，随后已恢复latency0。一次原签到成功与checked路由有实景；忙碌去重/请求次数没有实证，N/T，不重复签到凑证。

## 未触发 / N/T，禁止代签

1. 钱包无成功快照时“—”及无快照操作guard：当前5272恢复的是持久化成功快照，页面明示最近确认余额；没有清存储、写store或伪造冷状态。失败保留$0.00不能算无快照通过。
2. Ref未登录注册CTA：本次合法会话仍登录，未创建未登录fixture；未注册、接受条款。只签已登录原入口及法律阅读导航。
3. 旧wallet-cards消费者：既有能力gate会导向wallet-cards-new，不把新绑定页冒充旧卡错误恢复；未输入账户或验证码。
4. wallet-repurchase historyError：既有只读入口未建立；没有执行复投/钱款命令造历史错误。
5. nextPage=null的追加错误：没有合法下一页，不造分页或冒称追加重试通过。
6. APP物理触控/真实支付、业务容量原子性、后端安全及全历史矩阵均不在此浏览器增量签署内。

## 证据修正与服务状态

- 17-wallet-long-390-zh-dark.jpg是加载中的“—”帧，已标excluded；使用17b settled长金额帧评分。
- 23-ref-short-screen-bottom-no-scrollbar.jpg使用文档y0 clip，未代表滚动后视口，已标excluded；实际滚动DOM读回有效，视觉证据以23b-ref-actual-viewport-bottom.jpg（不带clip）为准。
- 5272修正旧模块缓存：先off，核对监听PID26632及该目录server.mjs 5272命令行后，仅停该PID；相同node/原参数Hidden重启PID28216，上游5252未动；日志另存，历史verification JSON不覆写。[重启记录](proxy-restart-r17.json)。最后模式off。未运行verify脚本。
- 浏览器设备/媒体/网络覆盖均恢复；本人标签已关闭。其他QA服务/标签未关闭。r17实景冻结READY，允许父线程构建r18；此报告不代表整APP在中文OPEN项关闭前通过最终门槛。

## 2026-10-28 钱包冷会话补验尝试

按用户指定尝试从独立IAB隐藏标签补钱包无快照分支；IAB创建失败且浏览器清单只有Chrome，未产生钱包实景、截图或新入口读回。已将5272从wallet-funds恢复off，无快照“—”/禁用guard/原恢复仍N/T。详见[补验界限记录](wallet-no-snapshot-iab-supplement.md)。READY，不阻塞父线程构建r18。
