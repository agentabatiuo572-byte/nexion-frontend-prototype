# 信任中心分类资料字段契约

前端承接契约，沿用 `GET /api/content/trust/sections/current` 与 `usePublishedTrust()`。
不新增 API、sectionKey、请求或本地资料；不改变服务端发布审核、来源校验与空值过滤。
六个既有 section 及其版本、字段数量等校验保持不变。

## 分类与字段归属

| 页面分类 | 现有 sectionKey | 内容字段 | 文档/徽章字段前缀 |
| --- | --- | --- | --- |
| 合规与牌照 | `complianceBadges` | `badgeNLabel`、`badgeNBody` | `badgeN` |
| 设备托管 | `nexNarrative` | `hostingContent` | `hostingDocumentN` |
| 保修与售后 | `nexNarrative` | `warrantyContent` | `warrantyDocumentN` |
| 安全 | `nexNarrative` | `securityContent` | `securityDocumentN` |

`N` 为从 1 开始的编号，允许不连续，按数字升序展示。三类新增资料使用独立前缀，
不占用审计 `documentN` 或团队 `leaderN`，不将服务资料误称为审计证明。
放入已有 `nexNarrative.fields` 的可选命名空间，也避免依赖 `auditsReserves` 的
`document1Url` 发布过滤条件。原 UVT 说明仍只读取自身字段。

## 可选内容与文档

每个字段仍是 `{ key, label, value }`；`label` 是编辑器标签，不作为用户资料正文。

- `hostingContent` / `warrantyContent` / `securityContent`：纯文本说明，保留换行。
- `<prefix>Primary`：文档标题；缺失时使用当前语言的“查看资料”。
- `<prefix>Secondary`：可选说明。
- `<prefix>Url`：文档地址。必须通过页面既有校验：HTTPS、无用户名密码，或符合既有规则的 `/pages/...` 路由。
- `<prefix>Type` / `<prefix>Date` / `<prefix>Size`：可选类型、日期和大小，按原值展示，不推断文件扩展名、有效期或大小。

例如发布端以后可提供 `hostingContent.zh`、`hostingDocument1Primary.zh`、
`hostingDocument1Url`、`hostingDocument1Type` 等键。本契约不附带任何实际资质、
文件或 URL，也不自动给生产写入示例值。

内容和文档互相独立：有正文即可展示正文；只有安全 URL 也可展示文档入口。
标题或文件 metadata 单独存在不算已有文档。URL 为空或无效时整条文档不展示；
既无正文又无可打开文档时显示“资料尚未发布”。

## 合规徽章

沿用已存在的 `badgeNLabel` / `badgeNBody`。非空名称才能生成一条内容；
只有名称也如实显示，不添加“已验证”“持有牌照”等推断。
可选 `badgeNUrl` / `badgeNType` / `badgeNDate` / `badgeNSize` 与上面的链接、metadata 规则一致。
没有有效 URL 的已发布徽章显示为普通文本，不伪装成可点击证明；有有效 URL 才提供链接。

仅消费公开 current 响应中返回的非空值，不读取后台草稿、历史 migration 或
`description` / `structure` 来补齐资料。服务端将缺乏依据的徽章值清空时，前端继续 pending。

## 语言与更新

沿用 `localizedTrustFieldValue`：文案使用 `.zh` / `.vi` / `.en` 后缀；没有任何语言变体时
可以使用无后缀字段。一旦存在语言变体，缺少当前语言不回退到其他语言或旧的通用文案。
URL 与文件 metadata 可以共用无后缀字段，也可以按相同规则本地化。
正文、说明及 metadata 都以文本插值渲染，不执行 HTML。

切换语言、刷新发布快照、清空或撤回资料时，分类内容跟随共享读取状态更新；
沿用原来的错误提示、重试和 runtime 失效处理。

## 发布衔接范围

本次只实现前端承接，不修改发布端固定字段 schema，也不解除后端对合规资料的过滤。
真实文件及其发布接入后置：发布端需按现有流程登记这些可选字段并发布到 current 投影，
保持每个 section 最多 80 个字段以及现有三语完整性要求。不能只在草稿中增加键就视为已经上线。

专用回归：`src/pages/trust/trust-category-material.behavior.test.ts`；另跑已有 Trust API、
共享读取、链接与页面生命周期测试以及 `npm run type-check`。本任务不构建或发布。
