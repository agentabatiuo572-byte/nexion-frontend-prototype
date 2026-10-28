# R14 独立视觉 A：限定增量冻结

冻结：2026-10-27T12:51:04.616Z。**index-CpjEudmG.js / index-DFU7A7hB.css**；官方 CUA Chrome4，本人独立5254/tab1733372940。未操作用户5237/5240/5249，未改源码、未构建、未运行测试或提交。

[运行读回及截图索引](./runtime-r14-frozen.json)。r13 [失败历史](../compact-r13-visual-a/review-r13-frozen-visual-a.md)保留，未覆盖旧证据。

| 项目 | 分数/10 | 结论 |
| --- | --- | --- |
| ≤350未领取福利 | 9.1 | 限定通过。320VI浅暗138×237.33，CTA103.74×44单行；390ZH暗173×184保留原构图。 |
| 注册/引导原生滚动条 | 9.2 | 限定通过。320VI浅暗success实际0→38→0且底部最后按钮可达；390VI浅暗全部内容适配844高，实际wheel不移动为无溢出；320VI注册表单0→28.67→0。overflow:auto保留。 |
| Terms旧44触区 | 9.2 | 旧目标通过，最新样式待r15。真实失败69×44，label13/600/20；解阻后点重试恢复条款。新要求32可见面+右下不在r14，未签。 |
| 首页Online实绘绿点 | 9.2 | 限定通过。320VI浅暗截图可见普通设备2行Online，UNI-VIEW点7×7，浅rgb14,142,74/暗rgb158,220,29。 |
| 库存全局键盘 | 9.2 | 限定通过。390ZH暗及320VI浅同一heading：Enter false→true，Space true→false，第二行保持false；URL不离库存。未执行停用或激活。 |
| Android平台提示 | 9.1 | 代表通过。390ZH暗库存与320VI浅库存文案完整，320换3行无横溢；注册VI浅暗提示明确Android。未冒称六key各入口/英文/物理APP全验。 |
| 奖励详情读取重试字体 | 9.2 | 局部通过。demo-reward-3实际503→页面重试→200；13/600/20，252×44。错误卡未来右下风格仍待r15，不用字体分代签新布局。 |

## 关键实景

- **原生滚动条 P2在本地代表范围关闭。** [320VI浅色顶部](./r14-success-vi-light-320-top.png)/[到底](./r14-success-vi-light-320-bottom.png)，[暗色顶部](./r14-success-vi-dark-320-top.png)/[到底](./r14-success-vi-dark-320-bottom.png)：根scrollHeight731/client693，实际浏览器wheel产生0→38→0；scrollbar-width:none、webkit宽0，overflow:auto，最后按钮bottom655.33<693。不是overflow:hidden锁死。
- [390VI浅](./r14-success-vi-light-390.png)/[暗](./r14-success-vi-dark-390.png)：scrollHeight=clientHeight844，最后按钮bottom806；执行wheel后仍0是整页已容纳，不假称产生过滚动。
- [注册长表单320VI到底](./r14-register-vi-light-320-bottom.png)：scrollHeight722/client693，真实wheel0→28.67→0，法律链接可见；未填写提交注册。隐私和正常条款当前fixture较短，未借此声称长法律全文全部覆盖。
- **未领取卡 P2本地关闭。** [320VI浅](./r14-unclaimed-vi-light-320.png)/[暗](./r14-unclaimed-vi-dark-320.png)：从r13的283.33降至237.33，92px机型保留，领取单行且44热区，券卡同步等高留白收紧。[390ZH暗](./r14-unclaimed-zh-dark-390.png)仍173×184，批准构图未被窄屏规则带改。
- **首页绿点 P2本地关闭。** [浅](./r14-home-online-dot-vi-light-320.png)/[暗](./r14-home-online-dot-vi-dark-320.png)都实际可见；status父与dot均UNI-VIEW，点7×7；Online完整。仅当前ONLINE普通设备代表，不推定离线/未知状态。
- [Terms失败按钮](./r14-terms-retry44-vi-light-320-confirmed.png)：69×44、13/600/20。仅自有标签阻断legal/terms GET后复现；已清Network阻断，实际点retry恢复正文，没有接受协议。**最新“右下+32可见面”不在当前包，继续待r15，不能用旧目标9.2签新要求。**
- [库存390ZH](./r14-inventory-enter-platform-zh-dark-390.png)/[320VI](./r14-inventory-enter-platform-vi-light-320.png)：真实Enter仅展开第一项，第二项false；Space收回，未见重复toggle。截图可见的粗主题轮廓是键盘focus态，不当成常态外观。Android说明完整，320越文三行仍在宽度内；未执行停用、激活或购买。
- [奖励详情真实读取失败](./r14-reward-detail-retry-vi-light-320.png)/[原ID重试恢复](./r14-reward-detail-recovered-vi-light-320.png)：既有fixture **demo-reward-3**（ISSUED/DEMO-ORDER-004/REVIEW-S1），正常详情后切dataState:error并点页面“刷新进度”，Network证实GET原ID503。恢复normal保留失败页，点Tải lại后原ID200、error label0。不是无效ID或奖励业务RETRYABLE_FAILED冒充读取错误。只签字体/44根/读取恢复；同类错误卡新排布仍随r15复验。

## 明确剩余边界

1. **r15新需求未验：** terms及同类错误卡右下、32px可见/44px命中。当前不存在其他新发现的P2；这不是宣称全站通过。
2. **槽位及激活未覆盖：** 已读Jason的fixture核对说明，现有41/42都已激活，Add按契约去商城；无普通库存选择层、无activate成功写入模拟。未改fixture/store、未执行停用制造状态，源码44审查不代替实景签核。
3. **平台提示范围：** 实际中越库存+越文注册完成代表通过，不冒称六key全入口、英文或物理Android能力已验证。
4. 其他r13字体分支仍按原包记录继承，未重跑旧矩阵。正常隐私/条款fixture短，不把它们列成长文滚动通过。多行/键盘实机、正式Java、原生安装及最终H5均不由此代签。
5. **排除误标：** r14-terms-retry-vi-light-320.png实际是iframe刷新返回首页，label数组为空，不作terms通过证据。有效图带retry44-confirmed后缀，保留原始误标记录不覆写。

**READY：本次r14必要增量完成并冻结。r15只需复验新错误卡样式及主线程明确变更，不重开已通过矩阵。**
