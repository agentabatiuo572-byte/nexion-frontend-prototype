# r21/r22 起始页、签到和首页币种标签验证

日期：2026-10-28。仅记录本轮修订，不替代全站、H5或原生真机验收。

## 修订范围

- 起始页根据屏高收紧视觉区域和文案间距，保留全部入口与底部安全区；短法律链接补齐44×44px。
- 签到浅色按钮阴影和今天格的底色、描边、光晕跟随主题蓝；暗色保持绿色。
- 今天/Today/Hôm nay字号11.5px→10.5px，14px行高及奖励数字字号不变。
- 收益角标三语均显示USDT；币种文案键由techStreaming改为techEarningsCurrency，原金额、未知值和刷新行为未变。

## 实际验证

| 验证 | 实际结果 |
| --- | --- |
| r21浏览器生产构建 | 退出0；入口index-BuAxQ2Gz.js。固定产物独立服务5268/5269，未随并行dist覆盖。 |
| r21 APP资源编译 | 退出0；不代表安装或物理设备运行。 |
| r21两位实景 | 视觉A起始页/签到各9.2；交互B相应项9.2–9.3；见各自冻结报告及明确代表矩阵。 |
| r21集成回归 | 7文件116/116：route、trial-benefits-lifecycle、intro-privacy、intro-motion、home-display-player、wallet-held-authority、wallet-service-history-date。 |
| r22标签回归 | 既有home-real-copy测试按新币种键更新，1文件6/6；未为单条文案新增镜像测试。 |
| r22类型检查 | npm run type-check退出0。 |
| r22浏览器生产构建 | 退出0；入口index-C1VSW6rq.js / index-DPMvPy7r.css。 |
| r22 APP资源编译 | 退出0。 |
| r22实景增量 | [视觉A](r22-visual-a/review-r22-frozen-visual-a.md) 9.2、[交互B](r22-interaction-b/review-r22-interaction-b.md) 9.3；三语、320/390明暗代表无裁切/挤压，签到10.5px及浅色蓝色回归通过；未重复全站矩阵。 |

不同测试批次不相加宣称一次全量验证。未运行full verify。此前intro-public-stats-authority旧实现字符串断言4pass/1fail的原始批次继续保留；HEAD已换用HomeDisplayStats，本次CSS不回退该数据源，也未删/skip旧用例。后续需按当前组件契约维护。

## 指纹与集成

- r22 JS SHA256：`C7E8F60650F9E1CBE0E8BA2290EDDB6B07A0E69C2C54D8506DE5FF8CFE61781E`。
- 主CSS：`361F8178B8E346B1B8C3A0E2E168938DE62036EEF456B13962803AD0E07FA80D`。
- 签到CSS daily-check-in-row-BoXMjQFA：`F2F298720942752297BEE9C78098D5F117FF8EE0A33A76750DE662C676522E64`，与r21一致。
- 起始页CSS intro-CIkBy_3L：`BE9BDC4988BCCDB36CB57BC39336203D0BAD41F40A7F11234DC7F0D976DE1680`，与r21一致。
- r19包从PPFyVDQc漂移至B0QjbsFt后，两位即停止采样，有限评分/未覆盖未改签；r21开始使用固定快照。
- 独立集成工作树从ddcea906正常合入远端55075a49，保留个人中心合并钱包的新提交及本地既有修订。预览入口同时保留360尺寸选项与删除旧钱包/复投选项，旧wallet.vue保持删除。src/scripts与原构建源逐项对照一致；没有在原工作树重置或移动其他任务WIP。
- 功能规则未新增，记录于前端修改日志；既有试用/清空PRD保持。钱包读取恢复字体8.8仍未由本轮签核，正式TEST、真实换机、系统大字和原生键盘未覆盖。H5最终统一同步仍待APP队列全部关闭。

## 用户原预览更新

- 5237静态资源先合入、index最后替换；不重启实例、不清理旧资源、不重置业务状态。更新前后`/__demo/state`逐字节相同，备份保留仓外。
- 实际HTTP读取入口为`index-C1VSW6rq.js`，JS哈希与冻结包相同。原标签刷新后恢复320×693/中文/暗色，DOM读回USDT 12px、“今天”10.5px/14px；演示设备3/6、已转购卡及原消息记录继续保留。
- [实际用户入口截图](r22-user-5237.png)及[有界DOM读回](r22-user-5237-dom.json)。未向仓库写入完整演示state。
