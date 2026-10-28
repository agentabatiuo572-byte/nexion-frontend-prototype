# R18 独立视觉 A：增量冻结

**READY；旧包取证结束，可构建 R19。** 实际入口 **index-Bl4ZaVBC.js（B后为小写l）/ index-DPMvPy7r.css**。官方CUA Chrome4自有5254/5274，记录逐条保留lazy CSS；19条读回、8张PNG。[原始证据与SHA256](runtime-r18-frozen-visual-a.json)。未改产品、构建、测试、提交；未动5237/5251。旧R17失败历史保留，以本报告另记关闭，不改旧分。

| 本次限定项目 | 分数/10 | 结论和实际证据 |
| --- | --- | --- |
| 中文容量满320/390完整帧＋原管理入口 | **9.2，通过，关闭旧8.8** | [390中文暗](r18-capacity-nav-zh-dark-390.png)、[320中文浅](r18-capacity-nav-zh-light-320.png)：队列已满，先腾出1位，均完整单行；双卡分别173×215.33、138×208.33；机图118×118、floor中心差约0.01px。管理32可见/44命中，实际点击→me/devices。未借普通available状态代签满槽。 |
| 320约24px导航＋一次切换；390不变 | **9.2，通过** | 320实测SVG23.98、bar56、各hit约55.6×46，文字隐藏且aria保留；390SVG22、bar68、hit约69.6×58、文字可见。真实一次首页→赚取，选中正确；最终仅一条nx-tab-select-1498b286 animationstart，0.26s/cubic-bezier(.2,.8,.2,1)。[最终稳定帧](r18-nav-selected-zh-light-320-settled.png)目检玻璃保留，track/selection最终svg且rim/specular各1；indicator区域22，无叠压。只复验指定320浅与390暗，未重跑R17八格/五路由，也未代签物理touch或reduced。 |
| 未登录Ref Tiếp tục根44＋根边缘实际点击 | **9.2，通过，关闭旧8.7** | [320VI浅完整浏览器帧](r18-ref-login44-vi-light-320-browser.png)：实际根44.42×44，min44×44、字12；CSS布局中inline-flex被flex父项blockify为computed flex，触区符合。点击根左上内侧(2,2)而非文字中心，实际到[login?ref=UVELDEMO](r18-ref-edge-click-login-browser.png)。未点击注册、未接受条款、未输入账号。 |
| 独立wallet-commissions只读失败→off→原retry恢复 | **9.1，仅恢复交互通过** | 320VI浅实际GET /api/app/team/insights/commissions?page=1&pageSize=20为503，overview正常200且余额52,800.64保持。[错误](r18-wallet-commissions-error-vi-light-320-browser.png)→[原retry恢复](r18-wallet-commissions-restored-vi-light-320-browser.png)：错误卡移除，累计266.24、团队250.00恢复。ResourceTiming列表未捕获恢复200，仅保留503；不把UI恢复表述成独立网络200证据，不冒称真实后台。 |
| **wallet-retry字体一致性** | **8.8／P2 OPEN** | 此次实际节点.wallet-retry（及UNI-TEXT/SPAN）均**13px/500/normal**，回退此前明确统一的13px/600/20。32面(top6)/44命中和右下位置正常，但字体项未通过。最小修法：仅恢复所属按钮或文字13px、600、20px；无需改资金、布局或重跑整站。 |

## 收尾与未覆盖

- 三处指定源码增量均有当前包真实操作/截图，可按本地原型范围签；独立commissions不再N/T，但字体8.8仍需下一包局部复验，不能平均为全通过。
- 原R17边界继续：复投historyError无合法只读入口、旧wallet-cards读取页重定向新绑定页、nextPage为null仍N/T，未制造资金或分页状态。正式Java、真机安装/触摸未验。R19起始页一屏是新任务，本次未采样；H5未同步或代签。
- 事件观察器已移除；最初events=[]为事件尚未派发，后续稳定记录捕获实际260ms，不按空数组误判。最初light导航frosted过渡帧不作为最终玻璃依据，最终svg稳定帧已另存。
- Ref两次CDP phoneclip超时属工具；改用官方CUA全浏览器PNG，未把失败截图当证据。新增44命中后内容完整，无新横溢。
- 仅本人本地QA按原Me退出确认来观察未登录Ref。之后原演示首页入口实际跳onboarding/intro，**未声称已恢复Alex登录**，未强写认证store/注册；关闭该一次性标签。用户端口会话未动。
- 5274已off（2026-10-27T15:34:38.171Z）。只关闭本人1733373019/1733373023标签，QA服务保留；不再采样旧包。冻结时间2026-10-27T15:37:03.739Z。
