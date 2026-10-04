# 正式 APP 手机校准交接

实施目标为正式 Android APP，分支 test；原型未修改。功能契约见 PRD §4.7.3、§6.10、§6.11。

完整跨仓验收提示词与配置顺序见 [后端交接](https://github.com/agentabatiuo572-byte/nexion-backend/blob/test/docs/phone-calibration-handoff.md)。真机验收由同事执行；手机执行边界仍限 Android 原生 App，H5/iOS 不开启手机任务。不把浏览器或模拟桥接测试称为真机验收。

2026-10-03 当前验收契约：手机 login/calibrate/activate/defer/phoneRuntime 均使用普通认证请求及现有安装标识请求体，不再请求 challenge/verify，不依赖 AndroidKeyStore、attestation、包签名或证明资格有效期，不新增开关/TTL。安装标识只保证业务匹配，不是硬件真实性证明。PHONE/MOBILE claim/complete 的 X-Phone-Installation-Id 由后端与当前账号绑定核对；App 当前无此业务入口，不新增。保留账号 scope、SoC/GPU/RAM 采集、规则匹配、canonical/幂等/revision、换机限制、任务及收益结算校验。

登录验收：同安装 BOUND 直接首页且不重新校准；NEEDS_CALIBRATION/REPLACEMENT_REQUIRED 才进入对应流程；读取失败、未知状态或换机拒绝显示错误，可重试或返回首页，不声称已校准或已换机。通用校准/暂缓失败仍必须 fresh-read 回读并保持未激活奖励边界。

历史方案状态：2026-09-28 原生证明、包签名与证明 TTL 方案已 superseded。phone-calibration-*-plan*.json 等冻结计划保留历史内容；以下本机参考目录和过往对齐证据也仅供历史追溯，不代表当前真机或发布验收。

本地关联目录：后端 D:/WORKS/PLAN/nexion-backend；后台 D:/WORKS/PLAN/.wt/phone-calibration-pc-20260928；H5 D:/WORKS/PLAN/Nexion-H5。

验收依赖：me-ui-parity.contract.test.ts 与 me-button-parity.contract.test.ts 读取兄弟目录 NX1.0-Prototype。应使用原型仓历史提交 b8538d45 的 src 参考副本；它与全部固定模板哈希一致。最新原型已改版，不能代入这组历史基线。当前本地参考为 D:/WORKS/PLAN/.wt/NX1.0-Prototype，使用 git archive 提取，不是开发工作树。两组对齐测试已通过，未修改页面或断言；首次引用错误资料的失败日志仍保留。
