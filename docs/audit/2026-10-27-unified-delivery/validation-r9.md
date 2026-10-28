# 合并后定向验证 · r9

源提交：`e58039e57c9cc5192cc3fe5642b9ecac5564dce9`。合并提交 `a3bc695f` 同时保留重试排版 `a842e025` 与试用子会话 `3b4d6dab`；随后只为试用详情重试补齐字体规则。

浏览器入口：`index-Dj39Z2mj.js`，主样式：`index-8t-HDpGw.css`。动态页面另有独立资源，不能仅凭主 CSS 名称相同推定页面全部未变。最终视觉与行为报告须使用这个入口读回。

## 已执行

- `npx vitest run` 指定以下 8 个文件，109/109 通过，无跳过：
  - `src/components/trial-device-row.behavior.test.ts`：22。
  - `src/components/trial-fleet-integration.behavior.test.ts`：11。
  - `src/composables/use-trial-presentation.test.ts`：11。
  - `src/components/me/device-inventory-row.behavior.test.ts`：14。
  - `src/components/earn/compute-share-entry.behavior.test.ts`：4。
  - `src/pages/me/devices-layout.behavior.test.ts`：4。
  - `src/pages/me/devices-tradein-refresh.test.ts`：10。
  - `src/pages/me/trial-catalog-loading.behavior.test.ts`：33。
- `npm run type-check`：退出 0。
- `npm run build:h5:prod`：完成。此处是 APP 仓的浏览器构建，不代替 H5 仓同步或验收。
- `npm run build:custom -- app`：完成；仅证明 APP 资源编译，不是原生安装或软键盘验收。
- `git diff --check`：通过。

原始命令日志在本机 `D:/WORKS/PLAN/.wt/uvel-design-preview/r20-backend-test/retry-merge-app-*-r9.log`。没有以此批测试代替 full verify，也没有将此前有交集的批次相加。

## 合并边界

两处冲突已人工合并：试用行采用子会话的紧凑标题与展开内容，保留父会话的右侧重试样式；更新日志保留两方章节。提前转购的新经济方案只交付文字，未改变报价、权益补齐或优惠金额，未重新添加已删除的可点原型。

真实 TEST 部署、JWT/WS、跨物理设备登录、原生安装和软键盘仍未验收。两位浏览器审查及最终 H5 读回另列于统一交付报告。
