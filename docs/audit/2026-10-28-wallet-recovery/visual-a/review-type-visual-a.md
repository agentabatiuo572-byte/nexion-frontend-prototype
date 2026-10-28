# 响应式列表字号增量：独立视觉审查 A

2026-10-28。**本次有限范围评分 9.2/10，通过；未发现已覆盖范围内需阻断的 P2。** 本人使用官方 CUA 的独立 Chrome 标签完成截图目检和 DOM 量测，仅操作 5291。钱包前轮各项评分、长金额旧 8.4 及后续 9.2 关闭历史保持不变，详见[钱包报告](review-visual-a.md)；本报告不重签钱包或全站。

**实际版本与 diff**

5291 服务读回及全部 17 条浏览器记录中的实际入口均为 `index-DDUUBFKu.js`，公共 CSS 为 `index-gu3lZQtt.css`。已核对发布根 `wallet-r25/web-final` 与固定根 `wallet-r25/web-type` 的 index HTML、入口 JS、公共 CSS，SHA256 分别相等。[构建与四个源文件指纹](r25-type-build.json)。

本人读取了 `tokens.css`、`nx-list-row.vue`、`nx-section.vue`、`profile-row.vue` 的实际 git diff：列表 title/subtitle 接入响应式角色变量并允许换行；≤374px 行最小高度 56px、间距 8px；分区标题和 profile 名称分别接入变量。点击与键盘 handler、disabled 条件没有在这四份 diff 中变化。

diff 还包含两点需要准确限定范围：① `--ui-text-body` 在 ≤389px / ≤339px 分别改为 14px / 13px，现有消费者还包括 `home-action-row.vue` 和 `developer.vue` 的加载提示；② ≥414px 分区标题有 16px/22px 规则。本次没有实景这两个额外消费者或 ≥414px，不能从本报告推导它们通过。旧文档说明注释替换不作为功能验证。

**逐项评分**

| 项目 | 分数 | 本人实景范围与判断 |
|---|---:|---|
| 320 个人中心设置/帮助列表 | 9.2 | 越语明暗两套。13px/18px 标题已缩小，客服长标题可自然两行；右侧说明独立换行，未挤压、截断或横溢。实际行高至少 56px。 |
| 360 个人中心设置/帮助列表 | 9.3 | 越语明暗两套。14px/20px 标题，实际行高至少 56px；列表密度与长文案均可读。 |
| 390 标准个人中心列表 | 9.3 | 越语浅色、中文暗色。15px/20px 标题，实际行高至少 64px，标准档层级未被小屏规则压缩。 |
| 分区标题与 profile 名称 | 9.3 | 六个个人中心组合均匹配：section 14/20、14/20、15/20；profile 18、19、20px。profile 点击区域为 64px 高。 |
| 复用 `nx-list-row` 的商城入口 | 9.2 | “Nút Genesis”真实标题、副文案和右侧“Sắp ra mắt”。320 浅色、360 暗色、390 浅色均实测，副文案分别 12/16、12/16、13/18；多行内容自然增高，未碰右槽。 |

分数是对上述具体画面和量测的视觉判断，不以平均分抵消缺项，也不是全站字体迁移签核。

**实际 CSS 读回**

| CSS 视口宽 | 列表 title | 列表 subtitle（商城实际节点） | section | profile | 个人中心最小行高 | 商城样本行高 |
|---:|---|---|---|---|---:|---:|
| 320 | 13px / 18px | 12px / 16px | 14px / 20px | 18px | 56px | 68px |
| 360 | 14px / 20px | 12px / 16px | 14px / 20px | 19px | 56px | 70px |
| 390 | 15px / 20px | 13px / 18px | 15px / 20px | 20px | 64px | 78px |

上述均读自实际渲染节点，不只检查 token。个人中心右侧帮助说明使用的是 `__value`，不是 `__subtitle`；因此另取商城真实 `__subtitle` 证明副文案档位。title 字重 500、subtitle 400、section/profile 600。

个人中心每套读取 12 个列表行，宽度未溢出；320/360 文案 copy 与右侧 value/chevron 的最小间隔约 8px，390 约 12px。所有已测列表 role=button 区域均高于 44px。320 的末行最初处于底导航之后，随后真实滚动获取完整帮助列表截图，未把滚动中的遮挡当成裁切，也未用 DOM 注入改变布局。完整数据见[17 条运行记录](r25-type-runtime.json)、[量测摘要](r25-type-summary.json)。

**截图索引**

| 场景 | Profile | 设置/分区/帮助 |
|---|---|---|
| 320 VI light | [profile](r25-type-320-vi-light-profile.png) | [设置](r25-type-320-vi-light-settings.png)、[完整帮助](r25-type-320-vi-light-help.png) |
| 320 VI dark | [profile](r25-type-320-vi-dark-profile.png) | [设置](r25-type-320-vi-dark-settings.png)、[完整帮助](r25-type-320-vi-dark-help.png) |
| 360 VI light | [profile](r25-type-360-vi-light-profile.png) | [设置与帮助](r25-type-360-vi-light-settings.png) |
| 360 VI dark | [profile](r25-type-360-vi-dark-profile.png) | [设置与帮助](r25-type-360-vi-dark-settings.png) |
| 390 VI light | [profile](r25-type-390-vi-light-profile.png) | [设置与帮助](r25-type-390-vi-light-settings.png) |
| 390 ZH dark | [profile](r25-type-390-zh-dark-profile.png) | [设置与帮助](r25-type-390-zh-dark-settings.png) |

商城复用：[320 VI light](r25-type-320-vi-light-store-reuse.png)、[360 VI dark](r25-type-360-vi-dark-store-reuse.png)、[390 VI light](r25-type-390-vi-light-store-reuse.png)。只签这些图中的列表行字体/排版，不连带重签上方商品卡、金额或图像加载过程。

**边界与收尾**

没有通过 storage/store 或修改 HTML/CSS 制造画面，没有改产品、跑测试、构建、提交或重启服务；未触碰 5237 或 B 的 5294。44px 结论来自实际 DOM 点击区域几何，不宣称物理设备触摸边缘测试。未验证用户自定义超长昵称、系统字体放大、屏幕阅读器、完整各语言矩阵、其它复用组件页面、正式服务、原生 APP 或独立 H5 交付。源码中的页面局部字号覆盖不因共享 token 通过而自动获得签核。

本次共 17 张本人截图、17 条 DOM 记录。5291 全程保持 off 并在收尾再次确认；本人标签已关闭，预览服务保留。此前钱包评分及失败证据未修改。

**`--ui-text-body` 两消费者 quick 补验（同包，2026-10-28）**

按新增授权再次只读 rg，生产消费位置仅 `home-action-row.vue` 的 `.home-action-title` 与 `developer.vue` 的 `.developer-loading`。5291 服务及两张首页实景的入口仍为 `index-DDUUBFKu.js`，没有切换构建，也没有为取证改状态。

| 本次实际测项 | 分数 | 实景读回 |
|---|---:|---|
| 首页待办 320 VI light | 9.2 | 当前真实 `quest` 行的“Nhiệm vụ mới”是 **13px / 500 / 20px**；行高 78px，宽约 286.667px，clientWidth/scrollWidth 为 287/287。标题、500 UVT 奖励与剩余时间均完整，未与进度环或箭头相撞。[截图](r25-body-home-320-vi-light.png)。 |
| 首页待办 360 VI dark | 9.2 | 同行标题为 **14px / 500 / 20px**；行高 78px，宽约 326.667px，clientWidth/scrollWidth 为 327/327，文字和换行正常。[截图](r25-body-home-360-vi-dark.png)。 |

两张截图与 DOM 均由本人取得，见[补验运行记录](r25-body-consumers-runtime.json)。该同构补验只覆盖现有 `quest` 待办，不推导绑定手机、安全提醒等未出现分支，也不重签截图里的其它首页卡片。

开发者 loading **未覆盖、无分数**：本人通过外侧页面选择自然进入开发者中心，真实页面已到“概览”完成态，`.developer-loading` 节点数量为 0，未捕获可供目检的稳定加载文本。没有通过慢速模拟、store/storage 或样式注入延长 loading。根 token 读到 14px 只说明变量值，不能代替 loading 实景。

本次新增 2 张截图；原列表/profile/钱包评分及失败历史保持。收尾关闭本人标签，5291 为 off，保留预览服务，未触碰 5237、产品或其他审查者端口。
