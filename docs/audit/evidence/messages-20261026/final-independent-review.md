# 消息修复最终独立复核

日期：2026-10-26，Asia/Tokyo。范围：658 通知点击黑屏、659 服务实时连接不可用。

结论：**658、659 的本轮技术验收均为 PASS，当前证据具备关闭依据，无未关闭的代码或验收阻断项。** 本结论不等于已更改禅道状态；正式闭环须主线程通过官方入口执行解决/关闭并读回。本复核未操作手机、浏览器、凭据或平台，未改动业务源码。

## 版本与证据来源

- 独立读取 App 候选 HEAD：`4ff18cf7e70cf91076fd6cc563f4ed9bf91106bc`；后端候选 HEAD：`93db54cca5acf9e18408cc497f3165b249c07008`。两个候选目录均无未提交改动。
- 主线程已确认 TEST 后端 361、App 296 的 broker 状态为 DEPLOYED，运行 SHA 与候选一致。本复核未独立访问发布平台。
- 独立计算 `native-final/app-service.js` SHA256：`E750698F8B415CEFA40FC52FB58846FFF0EF6894B3D0A0D248CB1B5366BB08B7`，与主线程确认的真机资源哈希一致。
- 独立解析该最终产物：261 个正则字面量，Unicode property escape 为 0；存在 1 个与候选生成结果一致的 Mark 正则构造器；`UvelRealtime` 临时诊断标记不存在。最终启动记录中未检出 SyntaxError、Invalid property name、TypeError、ReferenceError 或 USER_ONBOARDING_REQUIRED。

## 658：通知点击黑屏

**PASS。** 原始故障是原生引擎解析 `/\p{Mark}/u` 失败，发生在通知页面模块载入阶段。修复复用现有 regexpu 生成链，将完整 Unicode Mark 集合展开为旧引擎可解析的正则，未改变摘要的阅读阈值。

独立全码点核对覆盖 U+0000 至 U+10FFFF，与本机 Unicode 17 的 Mark 结果零差异，共 2543 个匹配码点；既有 BANK_HOLDER_NAME_RE、HAN_SCRIPT_RE 内容保留。越南语分解附标、其他组合标记、补充平面 Mark 和中英文阅读边界的针对性测试通过。

已实际查看 `notification-expanded-native-final.png`：最终原生资源下通知分类、真实欢迎通知标题/正文和“打开”操作均可见，页面显示全部已读，无黑屏。主线程已复走首页铃铛、展开和重入；诊断阶段另有已读 1→0 及目标页面打开记录，未把旧截图替代最终页面证据。

## 659：服务实时连接不可用

**PASS。** 精确根因为现场原生账号尚未完成初始设置，客服 realtime-ticket 被业务写入门禁以 HTTP 428 USER_ONBOARDING_REQUIRED 拦截。已完成初始设置的 H5 账号原本可连接，不能单独替代此原生根因的验证。

修复仅豁免 7 类精确 HTTP 客服方法/路径，并移除客户 WebSocket 通信的初始设置业务门禁。独立核查确认 JWT、有效会话、禁用/撤销状态、环境隔离、会话归属、附件归属和 ADMIN 写权限仍由原调用链校验。工单与转工单不在豁免列表；未知后缀、尾斜杠、编码路径及错误方法不匹配该列表。订单和 VietQR 仍受初始设置门禁保护。

已实际查看以下最终真机截图：

- `service-restored-native-final.png`：服务分区正确显示当前空态，无实时连接不可用提示。
- `conversations-empty-native-final.png`：会话中心显示“暂无会话”和“联系专属客服”，未恢复工单入口。
- `chat-unassigned-native-final.png`：未分配专属客服的输入页面、留言说明和输入框正常显示。

主线程确认该原生账号仍未完成初始设置，未通过补做初始设置规避原错误。`native-service-recovery-phases.txt` 记录真实诊断资源的 TICKET_READY→SOCKET_OPEN→AUTH_READY→RECONCILE_READY，后续重新连接也恢复到 RECONCILE_READY。最终无诊断资源再次通过可见页面检查。

`h5-after-release-network.json` 包含发布后实际客服 HTTP 200、WS 101、ready、pong；`h5-existing-history.json` 显示既有会话历史可读且无实时不可用提示。这补充证明共享链路和历史读取正常。

## 独立测试与边界

- App：本复核独立运行 7 个相关测试文件，97/97 通过；旧工单空态夹具收口后，相关生命周期测试再次 14/14 通过。历史工单含未读和旧错误的夹具不再污染当前服务空态及未读计数。
- 后端：作者 9 组共 86 项通过；本复核另行独立实跑写入门禁 26 项、真实 HTTP/WebSocket 安全链 6 项，共 32/32，失败/错误/跳过均为 0。独立报告保存在 `backend-independent-security-reports/`。
- 独立安全链验证包括未完成初始设置的客服 ticket/WS create/reply/read 可达、订单及 VietQR 仍返回 428、跨客户会话返回 404、撤销会话和无效/被禁用身份返回 401、只读 ADMIN 的 WS 写入返回 403。
- 上述 create/reply 是隔离测试中的业务控制器 mock 分派证据；本轮没有真实发送新消息或附件，不能据此签署消息投递、客服接收、附件上传/下载的端到端验收。这些能力不是 658/659 当前故障关闭的必要新增动作。
- 原生阶段日志来自临时诊断资源，最终资源已删除诊断；H5 网络采集标记 `truncated: true`，其记录足以证明列出的成功链路，不能外推为所有网络请求均无错误。
- 当前可见验收覆盖现场 Android 中文深色与真实 H5 既有历史；不外推其他设备、所有语言/主题、长时间稳定性或所有离线故障。没有必要为这两项已明确根因的故障追加重复 full 验证。

技术复核无需新增阻断项。主线程完成禅道 658、659 的官方解决/关闭并读回后，即可将这两项故障报告为正式闭环。
