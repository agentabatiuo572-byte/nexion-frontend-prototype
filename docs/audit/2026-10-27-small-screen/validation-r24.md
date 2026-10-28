# R24 最终合并与首页币种角标增量验证

2026-10-28。R23提交78e81a1e后、推送前再次fetch发现远端test新增e10f6825（iPhone手机算力校准）。正常merge保留双方历史；前端日志与三语文件共四处冲突保留双方内容，短标题/短操作/USDT不回退，手机引导改为手机App并保留新增iPhone字段。未覆盖推送或重置原工作树。

## 实际检查

| 项目 | 结果及边界 |
| --- | --- |
| 合并相关回归 | 7文件111/111：onboarding-calibration-api、device-signals、native-phone-runtime、phone-activation-guidance、phone-calibration-pages、home-real-copy、action-list。 |
| 类型检查 | npm run type-check退出0。 |
| 浏览器生产构建 | 退出0，仓外r24-frozen-web，入口index-Ddn2nKUH.js / index-DPMvPy7r.css。 |
| APP资源编译 | 退出0，仓外r24-frozen-native；不代表真机运行通过。 |
| 独立视觉A | [单帧报告](compact-r24-visual-a.md) 9.2；390中文暗色USDT完整、金额不受影响。 |
| 独立交互B | [只读报告](compact-r24-interaction-b.md) 9.3；USDT完整，金额与标题行间隔10px，今天10.5px。 |
| 合并源码复核 | [四处冲突报告](integration-r24-conflicts.md)：三语短文/USDT、双方日志及新手机App语义完整保留；不代签新增业务。 |

两位独立审查只使用本人新建的临时Chrome标签，未改用户IAB、演示状态或storage，审后关闭本人标签。此前R22三语/320/390明暗代表矩阵保持原始记录；本轮没有重复声明全面重测。

## 当前5237与构建身份

- JS SHA256：4EAA6431B783308649C2116FE711C9B1527927CC912BDEE5D11116CFB20A96E8；5237实际GET及两位审查DOM均匹配index-Ddn2nKUH.js。
- 主CSS、签到daily-check-in-row-BoXMjQFA.css、intro-CIkBy_3L.css与R23逐字节相同。新远端iPhone功能不借这些CSS指纹获取业务通过结论。
- 原5237服务未重启，静态资源先发布、index最后更新；发布前后演示state逐字节相同，备份仅仓外保存。没有清空聊天、试用记录或替换演示服务。
- 用户原标签刷新后恢复320×693、中文、暗色；实际USDT12px、今天10.5px/14px、奖励数字12px。[用户原入口图](r24-user-5237.png)及[有界DOM](r24-user-5237-dom.json)。

## 未完成及未覆盖

- 钱包恢复操作字体旧8.8仍待新wallet-overview组件补验；旧intro公共统计契约失败、R23两条旧Node契约失败继续保留，不称全量绿色。
- 远端FEAT-TRIAL05早购与e10f6825 iPhone功能及其PRD正常保留。本轮仅合并相关测试/源码检查，未完成新增页面、真实报价/支付/退款、iPhone实体设备完整验收。
- 原5237保留旧演示服务，新增早购后台场景未单独签核。浏览器原型、APP资源编译与正式TEST部署不同；真实账号换机清空、原生键盘和安装未覆盖。
- APP完整队列和两位独立审查门槛尚未全部完成，因此最终H5同步/推送继续等待。禁止使用额度重置卡。
