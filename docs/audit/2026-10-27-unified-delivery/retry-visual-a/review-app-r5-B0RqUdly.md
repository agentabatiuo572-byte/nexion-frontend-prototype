# R20 APP手机卡与紧凑retry独立视觉扩展 — r5

冻结时间（UTC）：2026-10-27T10:08:17.052Z。

**当前结论：APP来源的手机卡孤字P2已关闭，手机卡9.2；字体统一仍有3处P2，团队项8.6、消息顶栏项8.8，未给总体通过。** 小卡业务布局、弹窗及全页EmptyState按父线程最新范围保留，不因纵向布局另外扣分。

## 实际版本、浏览器与隔离

- 每个有入口读回的样本均为 `assets/index-B0RqUdly.js`；全局样式 `assets/index-M9lx7jQr.css`。此前Bo1e4G3-未形成正式复验结论，不混标为r5。
- 官方CUA，Chrome扩展浏览器（browserId=4），本人新建任务标签 `1733372888`，sessionName为“🧪 R20 Retry视觉复验”。本会话没有IAB入口，使用了用户此前明确授权的独立Chrome替代方式；未接管或读取其他用户标签。
- 唯一审查端口 `http://127.0.0.1:5254/preview`。本审查按授权只启动预览：APP目录 `node scripts/prototype-preview-server.mjs`，DEMO_PORT=5254，buildRoot明确指向APP的dist/build/h5。
- 启动前5254无监听，启动后监听者为本人进程PID12200；默认场景仅存该服务进程内存，未读取共享DEMO_STATE_FILE。启动日志保存在本目录。
- 未操作用户5237/5249，未改产品、重建、运行测试或进行Git操作。本次浏览器检查不代表原生安装、正式Java/真实HTTP服务或手机触摸硬件验收。

## 独立分数

| 项目 | /10 | 本次结论 |
| --- | ---: | --- |
| 手机卡320中文明暗孤字修复 | 9.2 | 两格“连接 Android 手机”均完整单行，无横溢；原图发光与构图保留。 |
| Earn紧凑提示 | 9.2 | 已看设备读取、收益汇总、流水及作业失败提示；右侧预留12px间距，动作字体13px/600/20px，长越文先在左列换行。 |
| Home紧凑提示 | 9.2 | 收益失败与队列读取状态的右侧动作不与文案碰撞，字体和44px外层符合。队列“管理”是管理动作，未冒称重试。 |
| 购机活动内联提示 | 9.2 | 320越文提示左文右侧“重新加载/箭头”，无溢出，动作13px/600/20px，高44px。 |
| 客服列表紧凑提示 | 9.2 | 320越文客服列表失败提示右侧重试，13px/600/20px，44×44，无横溢出。 |
| 搜索部分来源失败提示（r5补点） | 9.2 | 真实输入越文“đội”，已有本地结果与部分失败说明同时可见；明暗均右侧44×44，根与文字叶节点13px/600/20px。 |
| 团队文字retry | **8.6** | 两处字体未统一，见RV-01/02。已有内联“重新加载→”正确，不用这一处通过代签团队所有retry。 |
| 消息顶栏更新失败retry | **8.8** | 顶栏文字仍12px/600/18px，见RV-03；通知正文retry本身13px/600/20px正确。 |
| 已测动作44px外层及溢出 | 9.2 | 所有被测retry外层高约44px，最小宽44px；已读回样本的文档横向溢出均0。只证明浏览器几何。 |
| 底部Liquid Glass保留 | 9.2 | Home/Earn/Team实际画面保留玻璃轨道、边缘与选中态；稳定读回为svg。部分初始切页读回曾是frosted回退，不将组件存在或一次策略值单独当作视觉通过。 |

分数为人工视觉/排版判断，不是像素相似率，不平均。无P0/P1；本报告未宣称全站文字retry清单已穷尽。

## 未关闭的P2

### RV-01 — 团队收益读取retry字号/字重遗漏

- 节点：`.team-ledger__retry`，父为`.team-ledger__feedback-item.is-active`；源码位置对应 `src/components/team/team-ledger-card.vue`。
- 实际样式为 **12px / 400 / 18px**，不符合13px / 600 / 20px。
- 320越文明暗及390中文读回一致；外层44×44，本项不是触区问题。
- 实景：[320越文浅色](r5-retry-team-ledger-font-vi-light-320.jpg)、[320越文暗色](r5-retry-team-ledger-font-vi-dark-320.jpg)。
- 最小修法：只将该文字动作opt-in统一字体契约，保留现有反馈行/业务布局和动作。

### RV-02 — 团队摘要卡retry行高未统一

- 节点：`.team-summary__action`，源码对应 `src/components/team/team-summary-card.vue`。
- **按钮根节点和实际文字叶节点**均为13px / 600 / **18.2px**，尚未满足20px行高，外层仍高44px。
- 实景：[390中文暗色摘要卡](r5-retry-team-summary-zh-dark-390.jpg)、[320越文浅色](r5-retry-team-vi-light-320.jpg)。
- 仅要求统一文字样式；按父线程最新指示，小卡的纵向业务排版保留，不把它作为独立布局P2，也不要求将小卡强制改成横向错误条。

### RV-03 — 消息顶栏“更新失败 · 重试”遗漏

- 消息通知页顶栏文字动作 `.message-button`，实际文本“更新失败 · 重试”。
- 实测 **12px / 600 / 18px**；其262×44外层合格，问题只在文字契约。
- 同页通知正文 `.message-button.message-retry` 是13px / 600 / 20px，不能用正文正确代签顶栏。
- 实景：[390中文暗色消息页](r5-retry-messages-zh-dark-390.jpg)，另有[320越文浅色](r5-retry-messages-vi-light-320.jpg)。
- 最小修法：仅给顶栏这个文字动作统一13px/600/20px，保留导航轨道、44px返回/设置和整页错误布局。

## 范围澄清与失败历史

审查期间先将团队摘要纵向retry和通知整页居中retry作为“未采用右侧布局”的候选观察回报。父线程随后明确小卡/弹窗业务布局和全页EmptyState保留；因此本报告撤去这两处布局阻塞，图片及实际纵向布局观察仍保留。该范围澄清没有消除RV-01/02/03的字体差异，三个P2仍未签署。

手机卡原8.8报告未改：`D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/visual-a/review-h5-visual-a-uC44u8Io.md`。本次9.2只绑定APP来源r5的实际明暗照片，不把旧H5的uC44u8Io追认成已修或提前宣布H5同步通过。

## 实际覆盖与操作

- 手机卡：320×693中文暗、浅；说明完整单行，正文列约136.61px，文档溢出0。
- 紧凑retry主样本：320×693越文浅色，覆盖Earn、Home、购机活动、团队、通知、客服列表、搜索部分来源失败。
- 暗色补验：320越文Earn、团队收益提示和搜索部分来源提示；390中文暗色Earn、Home、消息及团队摘要。
- Earn四个内联提示的已测文案/右侧动作间距均12px；最窄动作44×44，带额外水平padding的流水动作65×44，活动带箭头动作约73.22×44。
- 实际通过预览的“加载失败”控件产生错误，没有修改DOM或伪造业务状态。搜索是真输入“đội”，实际出现本地页面结果与部分来源失败说明；对右侧按钮按Enter后仍留在搜索页，关键词保留，来源仍失败，未声称恢复成功。
- 服务列表与通知分别检查。通知正文的字体合格，保留其整页居中缺省布局；客服列表使用紧凑右侧动作。
- 未执行购买、激活、清空会话或其他业务写入；未重跑既有试用/业务完整矩阵。一次消息截图接口超时后，先观察稳定实景，再重取成功图片，失败尝试不计入通过照片。

## 最小增量复验建议

后续新构建仅需复验三处字体RV-01/02/03的实际根/叶节点与现有44px外层；团队收益和消息顶栏以320越文代表长文案、390中文代表本次实测短文案即可。若对应改动仅限字体，已通过的手机、Earn/Home/活动/客服和搜索不需要重拍完整矩阵。新包证据必须绑定新入口，继续保留本报告及r5失败截图。

## 读回摘要

```json
[
  {
    "label": "r5-phone-zh-dark-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "viewport": [
      320,
      693
    ],
    "body": "连接 Android 手机",
    "lines": 1,
    "overflow": 0
  },
  {
    "label": "r5-phone-zh-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "viewport": [
      320,
      693
    ],
    "body": "连接 Android 手机",
    "lines": 1,
    "overflow": 0
  },
  {
    "label": "r5-retry-earn-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "nx-inline-recovery mx-4 rounded-xl",
        "text": "Chưa thể cập nhật thiết bị\nChưa thể đọc trạng thái thiết bị. Vui lòng thử lại.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 28,
          "y": 92,
          "width": 208,
          "height": 54,
          "top": 92,
          "right": 236,
          "bottom": 146,
          "left": 28
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 248,
            "y": 97,
            "width": 44,
            "height": 44,
            "top": 97,
            "right": 292,
            "bottom": 141,
            "left": 248
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "nx-inline-recovery mt-2",
        "text": "Chưa làm mới được tổng thu nhập\nChưa thể hiển thị tổng thu nhập. Thẻ thiết bị và lịch sử không bị ảnh hưởng. Vui lòng thử lại sau.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 421.3333435058594,
          "width": 232,
          "height": 66,
          "top": 421.3333435058594,
          "right": 248,
          "bottom": 487.3333435058594,
          "left": 16
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 260,
            "y": 432.3333435058594,
            "width": 44,
            "height": 44,
            "top": 432.3333435058594,
            "right": 304,
            "bottom": 476.3333435058594,
            "left": 260
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "nx-inline-recovery px-2 py-3",
        "text": "Không có dữ liệu\nThử lại",
        "gap": 12,
        "copy": {
          "x": 26,
          "y": 714.6666870117188,
          "width": 191,
          "height": 16,
          "top": 714.6666870117188,
          "right": 217,
          "bottom": 730.6666870117188,
          "left": 26
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 229,
            "y": 700.6666870117188,
            "width": 65,
            "height": 44,
            "top": 700.6666870117188,
            "right": 294,
            "bottom": 744.6666870117188,
            "left": 229
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "mb-3 rounded-xl nx-inline-recovery",
        "text": "Chưa tải được danh sách tác vụ\nChưa tải được tác vụ mới nhất. Hãy thử lại để kiểm tra trạng thái; thông báo này không có nghĩa là việc quyết toán thu nhập đã tạm dừng.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 44,
          "y": 1208.854248046875,
          "width": 176,
          "height": 116,
          "top": 1208.854248046875,
          "right": 220,
          "bottom": 1324.854248046875,
          "left": 44
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 232,
            "y": 1244.854248046875,
            "width": 44,
            "height": 44,
            "top": 1244.854248046875,
            "right": 276,
            "bottom": 1288.854248046875,
            "left": 232
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-home-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "earnings-feedback nx-inline-recovery",
        "text": "Chưa thể cập nhật thu nhập.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 18,
          "y": 222.33334350585938,
          "width": 215,
          "height": 16,
          "top": 222.33334350585938,
          "right": 233,
          "bottom": 238.33334350585938,
          "left": 18
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 245,
            "y": 208.33334350585938,
            "width": 57,
            "height": 44,
            "top": 208.33334350585938,
            "right": 302,
            "bottom": 252.33334350585938,
            "left": 245
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "hf-unavailable nx-inline-recovery",
        "text": "Chưa tải được trạng thái thiết bị\nQuản lý",
        "gap": 12,
        "copy": {
          "x": 32,
          "y": 1034.3333740234375,
          "width": 181.64584350585938,
          "height": 16,
          "top": 1034.3333740234375,
          "right": 213.64584350585938,
          "bottom": 1050.3333740234375,
          "left": 32
        },
        "action": {
          "text": "Quản lý",
          "rect": {
            "x": 225.64584350585938,
            "y": 1020.3333740234375,
            "width": 62.35416793823242,
            "height": 44,
            "top": 1020.3333740234375,
            "right": 288.0000114440918,
            "bottom": 1064.3333740234375,
            "left": 225.64584350585938
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "frosted",
        "svg": 0
      }
    ]
  },
  {
    "label": "r5-retry-promotions-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "entry-status nx-inline-recovery",
        "text": "Chưa đọc được thông tin mới nhất\nLựa chọn vẫn được giữ. Thử lại trước khi xác nhận.\nTải lại\n→",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 319.85418701171875,
          "width": 202.78125,
          "height": 97.375,
          "top": 319.85418701171875,
          "right": 218.78125,
          "bottom": 417.22918701171875,
          "left": 16
        },
        "action": {
          "text": "Tải lại\n→",
          "rect": {
            "x": 230.78125,
            "y": 346.54168701171875,
            "width": 73.21875,
            "height": 44,
            "top": 346.54168701171875,
            "right": 304,
            "bottom": 390.54168701171875,
            "left": 230.78125
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "frosted",
        "svg": 0
      },
      {
        "strategy": "frosted",
        "svg": 0
      }
    ]
  },
  {
    "label": "r5-retry-team-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "referral-recovery nx-inline-recovery",
        "text": "Chưa đọc được thông tin mới nhất\nTải lại\n→",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 1019.5104370117188,
          "width": 202.78125,
          "height": 22.09375,
          "top": 1019.5104370117188,
          "right": 218.78125,
          "bottom": 1041.6041870117188,
          "left": 16
        },
        "action": {
          "text": "Tải lại\n→",
          "rect": {
            "x": 230.78125,
            "y": 1008.5625,
            "width": 73.21875,
            "height": 44,
            "top": 1008.5625,
            "right": 304,
            "bottom": 1052.5625,
            "left": 230.78125
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [
      {
        "text": "Thử lại",
        "class": "team-ledger__retry",
        "rect": {
          "x": 260,
          "y": 345.9895935058594,
          "width": 44,
          "height": 44,
          "top": 345.9895935058594,
          "right": 304,
          "bottom": 389.9895935058594,
          "left": 260
        },
        "font": {
          "fontSize": "12px",
          "fontWeight": "400",
          "lineHeight": "18px",
          "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
        },
        "parentClass": "team-ledger__feedback-item is-active"
      },
      {
        "text": "Thử lại",
        "class": "nx-button nx-button--text nx-button--medium team-summary__action",
        "rect": {
          "x": 56.5,
          "y": 915.8958740234375,
          "width": 57,
          "height": 44,
          "top": 915.8958740234375,
          "right": 113.5,
          "bottom": 959.8958740234375,
          "left": 56.5
        },
        "font": {
          "fontSize": "13px",
          "fontWeight": "600",
          "lineHeight": "18.2px",
          "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
        },
        "parentClass": "team-summary__status"
      }
    ],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-messages-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [],
    "otherRetryButtons": [
      {
        "text": "Thử lại",
        "class": "message-button message-retry",
        "rect": {
          "x": 16,
          "y": 295.5833435058594,
          "width": 288,
          "height": 44,
          "top": 295.5833435058594,
          "right": 304,
          "bottom": 339.5833435058594,
          "left": 16
        },
        "font": {
          "fontSize": "13px",
          "fontWeight": "600",
          "lineHeight": "20px",
          "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
        },
        "parentClass": "message-state"
      }
    ],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      },
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-service-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "service-state nx-inline-recovery",
        "text": "Chưa thể làm mới tin nhắn\nThử lại",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 239.6041717529297,
          "width": 232,
          "height": 20.791667938232422,
          "top": 239.6041717529297,
          "right": 248,
          "bottom": 260.3958396911621,
          "left": 16
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 260,
            "y": 228,
            "width": 44,
            "height": 44,
            "top": 228,
            "right": 304,
            "bottom": 272,
            "left": 260
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      },
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-search-partial-vi-light-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "nx-search-source-note nx-inline-recovery mx-4 mt-3",
        "text": "Chưa tải được một phần thông tin. Bạn vẫn có thể xem các kết quả hiện có.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 132,
          "width": 232,
          "height": 36,
          "top": 132,
          "right": 248,
          "bottom": 168,
          "left": 16
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 260,
            "y": 128,
            "width": 44,
            "height": 44,
            "top": 128,
            "right": 304,
            "bottom": 172,
            "left": 260
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      },
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-search-partial-vi-dark-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "nx-search-source-note nx-inline-recovery mx-4 mt-3",
        "text": "Chưa tải được một phần thông tin. Bạn vẫn có thể xem các kết quả hiện có.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 132.5211181640625,
          "width": 232,
          "height": 36,
          "top": 132.5211181640625,
          "right": 248,
          "bottom": 168.5211181640625,
          "left": 16
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 260,
            "y": 128.5211181640625,
            "width": 44,
            "height": 44,
            "top": 128.5211181640625,
            "right": 304,
            "bottom": 172.5211181640625,
            "left": 260
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      },
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-earn-vi-dark-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "nx-inline-recovery mx-4 rounded-xl",
        "text": "Chưa thể cập nhật thiết bị\nChưa thể đọc trạng thái thiết bị. Vui lòng thử lại.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 28,
          "y": 92.39228820800781,
          "width": 208,
          "height": 54,
          "top": 92.39228820800781,
          "right": 236,
          "bottom": 146.3922882080078,
          "left": 28
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 248,
            "y": 97.39228820800781,
            "width": 44,
            "height": 44,
            "top": 97.39228820800781,
            "right": 292,
            "bottom": 141.3922882080078,
            "left": 248
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "nx-inline-recovery mt-2",
        "text": "Chưa làm mới được tổng thu nhập\nChưa thể hiển thị tổng thu nhập. Thẻ thiết bị và lịch sử không bị ảnh hưởng. Vui lòng thử lại sau.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 421.72564697265625,
          "width": 232,
          "height": 66,
          "top": 421.72564697265625,
          "right": 248,
          "bottom": 487.72564697265625,
          "left": 16
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 260,
            "y": 432.72564697265625,
            "width": 44,
            "height": 44,
            "top": 432.72564697265625,
            "right": 304,
            "bottom": 476.72564697265625,
            "left": 260
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "nx-inline-recovery px-2 py-3",
        "text": "Không có dữ liệu\nThử lại",
        "gap": 12,
        "copy": {
          "x": 26,
          "y": 715.0589599609375,
          "width": 191,
          "height": 16,
          "top": 715.0589599609375,
          "right": 217,
          "bottom": 731.0589599609375,
          "left": 26
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 229,
            "y": 701.0589599609375,
            "width": 65,
            "height": 44,
            "top": 701.0589599609375,
            "right": 294,
            "bottom": 745.0589599609375,
            "left": 229
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "mb-3 rounded-xl nx-inline-recovery",
        "text": "Chưa tải được danh sách tác vụ\nChưa tải được tác vụ mới nhất. Hãy thử lại để kiểm tra trạng thái; thông báo này không có nghĩa là việc quyết toán thu nhập đã tạm dừng.\nThử lại",
        "gap": 12,
        "copy": {
          "x": 44,
          "y": 1209.2464599609375,
          "width": 176,
          "height": 116,
          "top": 1209.2464599609375,
          "right": 220,
          "bottom": 1325.2464599609375,
          "left": 44
        },
        "action": {
          "text": "Thử lại",
          "rect": {
            "x": 232,
            "y": 1245.2464599609375,
            "width": 44,
            "height": 44,
            "top": 1245.2464599609375,
            "right": 276,
            "bottom": 1289.2464599609375,
            "left": 232
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-team-vi-dark-320",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "referral-recovery nx-inline-recovery",
        "text": "Chưa đọc được thông tin mới nhất\nTải lại\n→",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 1007.9315185546875,
          "width": 202.78125,
          "height": 22.09375,
          "top": 1007.9315185546875,
          "right": 218.78125,
          "bottom": 1030.0252685546875,
          "left": 16
        },
        "action": {
          "text": "Tải lại\n→",
          "rect": {
            "x": 230.78125,
            "y": 996.9835815429688,
            "width": 73.21875,
            "height": 44,
            "top": 996.9835815429688,
            "right": 304,
            "bottom": 1040.9835815429688,
            "left": 230.78125
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [
      {
        "text": "Thử lại",
        "class": "team-ledger__retry",
        "rect": {
          "x": 260,
          "y": 334.41064453125,
          "width": 44,
          "height": 44,
          "top": 334.41064453125,
          "right": 304,
          "bottom": 378.41064453125,
          "left": 260
        },
        "font": {
          "fontSize": "12px",
          "fontWeight": "400",
          "lineHeight": "18px",
          "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
        },
        "parentClass": "team-ledger__feedback-item is-active"
      },
      {
        "text": "Thử lại",
        "class": "nx-button nx-button--text nx-button--medium team-summary__action",
        "rect": {
          "x": 56.5,
          "y": 904.31689453125,
          "width": 57,
          "height": 44,
          "top": 904.31689453125,
          "right": 113.5,
          "bottom": 948.31689453125,
          "left": 56.5
        },
        "font": {
          "fontSize": "13px",
          "fontWeight": "600",
          "lineHeight": "18.2px",
          "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
        },
        "parentClass": "team-summary__status"
      }
    ],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-earn-zh-dark-390",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "nx-inline-recovery mt-2",
        "text": "收益汇总暂时无法刷新\n暂无法显示收益汇总。设备卡与历史明细不受影响，请稍后重试。\n重试",
        "gap": 12,
        "copy": {
          "x": 16,
          "y": 300.86468505859375,
          "width": 302,
          "height": 53.99998092651367,
          "top": 300.86468505859375,
          "right": 318,
          "bottom": 354.8646659851074,
          "left": 16
        },
        "action": {
          "text": "重试",
          "rect": {
            "x": 330,
            "y": 305.86468505859375,
            "width": 44,
            "height": 43.99998092651367,
            "top": 305.86468505859375,
            "right": 374,
            "bottom": 349.8646659851074,
            "left": 330
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      },
      {
        "class": "nx-inline-recovery px-2 py-3",
        "text": "暂无数据\n重试",
        "gap": 12,
        "copy": {
          "x": 26,
          "y": 582.197998046875,
          "width": 276,
          "height": 17.33333396911621,
          "top": 582.197998046875,
          "right": 302,
          "bottom": 599.5313320159912,
          "left": 26
        },
        "action": {
          "text": "重试",
          "rect": {
            "x": 314,
            "y": 568.8646850585938,
            "width": 50,
            "height": 44,
            "top": 568.8646850585938,
            "right": 364,
            "bottom": 612.8646850585938,
            "left": 314
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-home-zh-dark-390",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "overflow": 0,
    "rows": [
      {
        "class": "earnings-feedback nx-inline-recovery",
        "text": "收益暂时无法刷新。\n重试",
        "gap": 12,
        "copy": {
          "x": 18,
          "y": 212.7849578857422,
          "width": 298,
          "height": 16,
          "top": 212.7849578857422,
          "right": 316,
          "bottom": 228.7849578857422,
          "left": 18
        },
        "action": {
          "text": "重试",
          "rect": {
            "x": 328,
            "y": 198.7849578857422,
            "width": 44,
            "height": 44,
            "top": 198.7849578857422,
            "right": 372,
            "bottom": 242.7849578857422,
            "left": 328
          },
          "font": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          },
          "leafFont": {
            "fontSize": "13px",
            "fontWeight": "600",
            "lineHeight": "20px",
            "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
          }
        }
      }
    ],
    "otherRetryButtons": [],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-retry-messages-zh-dark-390",
    "entry": [
      "index-B0RqUdly.js"
    ],
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "overflow": 0,
    "rows": [],
    "otherRetryButtons": [
      {
        "text": "重试",
        "class": "message-button message-retry",
        "rect": {
          "x": 16,
          "y": 274.79168701171875,
          "width": 358,
          "height": 44,
          "top": 274.79168701171875,
          "right": 374,
          "bottom": 318.79168701171875,
          "left": 16
        },
        "font": {
          "fontSize": "13px",
          "fontWeight": "600",
          "lineHeight": "20px",
          "fontFamily": "\"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
        },
        "parentClass": "message-state"
      }
    ],
    "nav": [
      {
        "strategy": "svg",
        "svg": 1
      },
      {
        "strategy": "svg",
        "svg": 1
      }
    ]
  },
  {
    "label": "r5-team-leaf-confirmation-zh-dark-390",
    "summary": {
      "display": "flex",
      "direction": "column",
      "copy": {
        "x": 28.666667938232422,
        "y": 819.1315307617188,
        "width": 147.6666717529297,
        "height": 39,
        "top": 819.1315307617188,
        "right": 176.3333396911621,
        "bottom": 858.1315307617188,
        "left": 28.666667938232422
      },
      "action": {
        "x": 80.5,
        "y": 870.1315307617188,
        "width": 44,
        "height": 44,
        "top": 870.1315307617188,
        "right": 124.5,
        "bottom": 914.1315307617188,
        "left": 80.5
      },
      "rootFont": {
        "font": "600 13px / 18.2px \"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif",
        "fontSize": "13px",
        "fontWeight": "600",
        "lineHeight": "18.2px"
      },
      "leafFont": {
        "font": "600 13px / 18.2px \"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif",
        "fontSize": "13px",
        "fontWeight": "600",
        "lineHeight": "18.2px"
      }
    },
    "ledgerFont": {
      "font": "12px / 18px \"General Sans\", \"General Sans\", Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif, Manrope, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"PingFang SC\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif",
      "fontSize": "12px",
      "fontWeight": "400",
      "lineHeight": "18px"
    }
  },
  {
    "label": "r5-message-retry-details-zh-dark-390",
    "buttons": [
      {
        "text": "更新失败 · 重试",
        "class": "message-button",
        "rect": {
          "x": 64,
          "y": 6,
          "width": 262,
          "height": 44,
          "top": 6,
          "right": 326,
          "bottom": 50,
          "left": 64
        },
        "font": [
          "12px",
          "600",
          "18px"
        ]
      },
      {
        "text": "重试",
        "class": "message-button message-retry",
        "rect": {
          "x": 16,
          "y": 274.79168701171875,
          "width": 358,
          "height": 44,
          "top": 274.79168701171875,
          "right": 374,
          "bottom": 318.79168701171875,
          "left": 16
        },
        "font": [
          "13px",
          "600",
          "20px"
        ]
      }
    ]
  }
]
```

## 截图索引

| 文件 | SHA-256 |
| --- | --- |
| [r5-phone-zh-dark-320.jpg](r5-phone-zh-dark-320.jpg) | `0e50924e23c18a4d96a0741825cca7f6ca67bfe718c5ca5a3a28395174d767bc` |
| [r5-phone-zh-light-320.jpg](r5-phone-zh-light-320.jpg) | `6d27b6b53e9e6b5fea807d00b127cb18b8d139b77109c66350dd439e4a7038e8` |
| [r5-retry-earn-vi-light-320.jpg](r5-retry-earn-vi-light-320.jpg) | `19e173374191ae1583dd7b32d835765dcd7227182f2e6f7c455e459683109141` |
| [r5-retry-earn-jobs-vi-light-320.jpg](r5-retry-earn-jobs-vi-light-320.jpg) | `433f55118ee7b7d7c13c793c8f38c13db11489b6f11214703f1b4e3c0451cf63` |
| [r5-retry-home-vi-light-320.jpg](r5-retry-home-vi-light-320.jpg) | `e508503695502abefa9fc8939cd6f2b3b64285957f22697341ae3cc1b78c9eb6` |
| [r5-retry-home-fleet-vi-light-320.jpg](r5-retry-home-fleet-vi-light-320.jpg) | `a56a4f04d8fa9fcf03da120bbd16bede9a25bdcbdae3921d130b22da7f3e78c7` |
| [r5-retry-promotions-vi-light-320.jpg](r5-retry-promotions-vi-light-320.jpg) | `89d7cb96f257a42b96ba00f84dadb03d0c3cd1fb6878febd242b2358f8562d76` |
| [r5-retry-team-vi-light-320.jpg](r5-retry-team-vi-light-320.jpg) | `dec06093d5c81c844521dd2253cfe1af8230116c64d21baed0935a4f12a339b9` |
| [r5-retry-team-ledger-font-vi-light-320.jpg](r5-retry-team-ledger-font-vi-light-320.jpg) | `66c148cfd16fe156d699a1b71752885a48904cf19aaf074ea2a887b3683a01ed` |
| [r5-retry-messages-vi-light-320.jpg](r5-retry-messages-vi-light-320.jpg) | `c0421d081253f81922eada1801266703b7640a631358ee19208b5261e0d4f956` |
| [r5-retry-service-vi-light-320.jpg](r5-retry-service-vi-light-320.jpg) | `453bdc2221a691f913258dda0ff1601966eb5168a9018f771b729aaa5359876f` |
| [r5-retry-search-partial-vi-light-320.jpg](r5-retry-search-partial-vi-light-320.jpg) | `c13f5ada5f4f940c41e74b5f19d66aa67e84c8bf710459a830dc37a3329db7e3` |
| [r5-retry-search-partial-vi-dark-320.jpg](r5-retry-search-partial-vi-dark-320.jpg) | `8d38786237f5f572f116b3050fa11dbb1b1dc0dc91e950b1604660282f60a182` |
| [r5-retry-earn-vi-dark-320.jpg](r5-retry-earn-vi-dark-320.jpg) | `7dcd18a8671aedf6b4ef8fc56f1d2141d22be6957690d990a0ca2b0df34173e3` |
| [r5-retry-team-ledger-font-vi-dark-320.jpg](r5-retry-team-ledger-font-vi-dark-320.jpg) | `a62a4dc7a55b6ebe708353a31a772bd05f0478a84b0b2fdc08447dde5057a9b6` |
| [r5-retry-earn-zh-dark-390.jpg](r5-retry-earn-zh-dark-390.jpg) | `2a7318577313b6a9abc58b797355977672b455afd5350d2915b29fe1f7a76c42` |
| [r5-retry-home-zh-dark-390.jpg](r5-retry-home-zh-dark-390.jpg) | `7b49ea953b2206983787338fb49ba0db92d8c43db5b0c22bbbf310229e1044c8` |
| [r5-retry-messages-zh-dark-390.jpg](r5-retry-messages-zh-dark-390.jpg) | `b2c7de52f43f41178e4e71744144328e7761838f5c35cd565ccdd6056cc9d9e6` |
| [r5-retry-team-summary-zh-dark-390.jpg](r5-retry-team-summary-zh-dark-390.jpg) | `ba8c302c6668d0b3c9f11da0cbe89ca32112274a2fd8cf05155aa553e1d68b16` |
