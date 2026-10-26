# 浅色客服头像资源

- 用户要求：浅色主题不能沿用暗色客服图标，新增浅色版本。
- 工具：内置imagegen，参考现有 `src/static/img/marketing/nova-avatar.png` 生成同角色的浅色材质版本，不覆盖原图。
- 生成文件：`C:/Users/FL/.codex/generated_images/01a170cf-40d7-73f1-baa2-bd03f7eeb5bf/exec-a542c04c-ea48-4d61-bcf7-72c8f3d973b5.png`。
- 发布文件：`src/static/img/marketing/nova-avatar-light-20261026.webp`，192×192、真实Alpha、11820字节。使用常规缩放和WebP编码准备发布资源，保留透明度。
- 设计约束：同一友好耳麦助手角色、原发型与星形识别，珍珠白/铂银/浅灰材质；深灰镜面保留面部轮廓，荧光绿眼睛与小面积点缀；无新增文字、背景或徽标。浅色底座由组件绘制，主题响应走现有resolved theme。
- 提示要点：precise-object-edit; same identity/silhouette/pose; light-theme counterpart; pearl white/platinum silver; restrained lime accents; transparent background; readable at36px; entire centered bust; no surrounding button circle or badge.
