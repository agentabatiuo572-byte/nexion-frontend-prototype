# Tab后台恢复内容保留：定向修复与验证

基线：App候选7fcfa71e002a08124c4e39c8a52c20451ee21113。ROOT的Samsung SM_A5760/HBuilder TEST录屏显示：首页→Android Home后台超过3秒→Recents回前台，在全屏恢复后16.25秒变暗、16.5/16.75秒仅保留header/footer，17秒正文重现。原视频和contact sheet留output，不纳入Git。

根因：tabs.vue的前台visible同时控制NativeTabContent的v-show和可见生命周期；onHide发送display:none，仅内容子树隐藏，外层header/footer仍在。原生逻辑/视图异步提交可在恢复后短暂呈现该隐藏状态。不是数据刷新整体loading gate；本轮不重建缓存、不清快照、不修改账号epoch或重选页面。

修复：选中Tab active只控制渲染，原foreground visible只控制既有生命周期。后台当前内容仍保留布局，计时/被动读取继续暂停，非选中Tab仍隐藏；账号/语言/环境隔离不变。

## 本轮场景与结果

| 场景 | 方法 | 结果 |
|---|---|---|
| 当前Tab后台时保持DOM布局，生命周期计时暂停；前台同实例恢复 | 实际tabs.vue/native-tab-content.vue编译后的Vue renderer行为测试 | 原版红例：display:none；修复后通过，最终断言以Home为当前Tab |
| 五Tab切换、查询替换、账号/epoch/语言/环境变更及卸载 | 同一实际SFC行为测试的既有断言 | 通过 |
| 可见生命周期与passive reads保持后台暂停和同账号边界 | 相关现有行为测试 | 通过；连同滚动恢复4文件32项 |
| 类型/APP目标编译 | vue-tsc --noEmit；uni build -p app --mode production | 均exit0；产物留外部output，不部署 |
| 原Samsung后台/Recents恢复逐帧复验，包含完整内容、亮度、滚动与错误恢复 | ROOT在新构建上实际操作 | 待ROOT；本地测试不作为真机PASS |
| H5共享源码同步与相关检查 | ROOT官方sync流程 | 待ROOT整合 |

本子任务不推送、发布、操作手机或服务器；保留正式目录无关WIP。原始缺陷不能用前后两张截图或单元测试关闭。

本地命令：`node node_modules/vitest/vitest.mjs run src/pages/tabs/tabs-retention.behavior.test.ts src/composables/use-tab-page-lifecycle.test.ts src/pages/tabs/tab-passive-read-consumers.behavior.test.ts src/lib/liquid-glass-view.behavior.test.ts`，4文件32项通过。最终把当前Tab显式切回Home后，仅重跑变更的tabs-retention单项通过。`npm run type-check`通过；APP目标编译使用外部outDir `output/brand-uvt-gate-20261028/app-background-retention-native-check`，没有覆盖或安装手机资源。未执行full verify。
