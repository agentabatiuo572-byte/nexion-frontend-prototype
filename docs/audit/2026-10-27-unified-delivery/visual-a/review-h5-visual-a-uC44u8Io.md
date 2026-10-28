# R20 统一H5独立视觉回归 A — uC44u8Io 冻结记录

冻结时间（UTC）：2026-10-27T09:42:01.160Z。

**结论：本版仍有1项P2，手机收益卡8.8/10，未达到该项9分门槛；其余6项在本文限定的本地H5范围内通过。不得用平均分宣布本版全部通过。** 新增retry布局、文案和字体要求尚待下一构建，本报告不提前签署。

## 实际版本与操作边界

- 独立审查端口：`http://127.0.0.1:5247/preview`。
- 浏览器：官方CUA的ChatGPT内置浏览器（IAB，browserId=2），本审查新建隐藏标签tabId=1。
- 所有有版本读回的样本均实际加载：`assets/index-uC44u8Io.js`；全局CSS为`assets/index-vThkQq5P.css`。
- 父线程提供的同步来源为`f7c9de55`，并提供3012文件同步检查、types/build通过信息。本审查没有重新执行这些检查，也不将其代替视觉证据。
- 本人实际选择中/越、390×844/320×693、明暗主题及试用场景，滚动首页与Earn，点底部导航切页；在390中文暗色和320越文浅色实际打开领取确认并取消。试用中来自预览场景选择，未冒称为本人真实激活、付款或完成全生命周期业务链。
- 仅操作5247。未操作5237、5251、5246、5248；未改产品源码、重建、运行测试或进行Git操作。
- 本目录只存本报告与42张原始PNG。截图手机裁切已校正外层浏览器缩放，PNG尺寸均为390×844或320×693；不将其称为与设计稿逐像素一致的证明。

## 逐项分数

| 项目 | /10 | 结论与主要证据 |
| --- | ---: | --- |
| 手机收益卡 | **8.8** | P2 H5V-01：320中文说明末行仅“算。”；原手机屏幕发光方块、底座亮边及地面反射仍保留。 |
| 质押收益卡 | 9.2 | 明暗主题的玻璃立方体、银币层次、发光棱线及地面反射保留；无图文碰撞或截断。 |
| GPU收益卡 | 9.2 | 金属环、设备主体、落地反光保留；中越短句完整单行，旧孤字/孤词未复现；320下半部经实际滚动目检。 |
| 首页福利/未领取试用卡 | 9.1 | 中越、明暗、320/390均完整显示设备、3天、无需付款及领取入口；窄屏允许两行CTA，未见插图盖字。 |
| 试用中福利卡与字段层次 | 9.1 | 持续入口、剩余时间、当前抵扣均清楚；较长越文卡自然增高，内容和按钮保留。队列当前金额与预计50.00分开显示。 |
| 队列首行圆角 | 9.2 | 8格Earn首行实际读回左右上角28px且目检无直角背景覆盖；首页由22px父容器overflow:hidden裁切，4个代表帧另拍。 |
| 底部Liquid Glass保留 | 9.2 | 实景保留圆角玻璃轨道、边缘光及选中态；实际底部导航可切首页/Earn。读回为svg策略，评分同时依据图像而非仅组件存在。 |

人工分数是本轮视觉与排版判断，不是像素相似率；不沿用APP分数直接给H5通过。

## H5V-01 — P2 — 320中文手机说明孤字

- 当前文字：“Android 手机参与计算。”；320中文暗色与浅色均第二行仅剩“算。”。
- 实景：[暗色](earn-cards-zh-dark-320.png)、[浅色](earn-cards-zh-light-320.png)。这些图是在各自实际320×693、对应data-theme下获取，入口均为uC44u8Io。
- 影响：说明句末形成明显孤字，破坏本轮原稿复刻的紧凑文字层次；不能用手机图光效正确掩盖排版不合格。
- 定位：手机卡中文说明与`earn-way-card`正文预留列的组合。无需改变原图裁切、发光、CTA或再次放宽文字覆盖图案。
- 最小修法建议：局部缩短中文说明，例如“Android 手机计算。”，保留Android及计算含义。由主线程决定并实施，本审查未改产品。
- 最小补验：新包320中文明暗手机说明两格，必要时390中文确认短句层次。其余已通过试用链和完整业务矩阵不必因此重跑。

未发现其他P0/P1/P2。父线程转达的Earn数据失败提示紧凑左右排版、retry文案与字体新要求属于后续构建增量，本版不评分、不提前关闭，也不因此重开已通过的试用视觉范围。

## 独立覆盖与截图

参照已目检的APP获批原设计板：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-27-service-earn/design-board.png`，以及已读取的`docs/audit/2026-10-27-trial-lifecycle/review-visual.md`和`acceptance.md`。APP报告只用于重建关注点和边界，不作为本人点击H5的替代。

| 实际组合 | 首页福利未领取 | 首页试用中 | Earn试用首行 | 收益三卡 |
| --- | --- | --- | --- | --- |
| zh-dark-390 | [未领取](home-available-zh-dark-390.png) | [试用中](home-active-zh-dark-390.png) | [Earn首行](earn-queue-zh-dark-390.png) | [三卡](earn-cards-zh-dark-390.png) |
| zh-light-390 | [未领取](home-available-zh-light-390.png) | [试用中](home-active-zh-light-390.png) | [Earn首行](earn-queue-zh-light-390.png) | [三卡](earn-cards-zh-light-390.png) |
| zh-dark-320 | [未领取](home-available-zh-dark-320.png) | [试用中](home-active-zh-dark-320.png) | [Earn首行](earn-queue-zh-dark-320.png) | [三卡](earn-cards-zh-dark-320.png) / [滚动下半部](earn-cards-zh-dark-320-lower.png) |
| zh-light-320 | [未领取](home-available-zh-light-320.png) | [试用中](home-active-zh-light-320.png) | [Earn首行](earn-queue-zh-light-320.png) | [三卡](earn-cards-zh-light-320.png) / [滚动下半部](earn-cards-zh-light-320-lower.png) |
| vi-dark-390 | [未领取](home-available-vi-dark-390.png) | [试用中](home-active-vi-dark-390.png) | [Earn首行](earn-queue-vi-dark-390.png) | [三卡](earn-cards-vi-dark-390.png) |
| vi-light-390 | [未领取](home-available-vi-light-390.png) | [试用中](home-active-vi-light-390.png) | [Earn首行](earn-queue-vi-light-390.png) | [三卡](earn-cards-vi-light-390.png) |
| vi-dark-320 | [未领取](home-available-vi-dark-320.png) | [试用中](home-active-vi-dark-320.png) | [Earn首行](earn-queue-vi-dark-320.png) | [三卡](earn-cards-vi-dark-320.png) / [滚动下半部](earn-cards-vi-dark-320-lower.png) |
| vi-light-320 | [未领取](home-available-vi-light-320.png) | [试用中](home-active-vi-light-320.png) | [Earn首行](earn-queue-vi-light-320.png) | [三卡](earn-cards-vi-light-320.png) / [滚动下半部](earn-cards-vi-light-320-lower.png) |

首页队列代表帧：[390中文暗](home-queue-zh-dark-390.png)、[390中文浅](home-queue-zh-light-390.png)、[320越文暗](home-queue-vi-dark-320.png)、[320越文浅](home-queue-vi-light-320.png)。确认层实操：[390中文暗](trial-confirm-zh-dark-390.png)、[320越文浅](trial-confirm-vi-light-320.png)。两次均实际取消，未点击激活或购买。

部分未领取图下方存在异步设备骨架；这些骨架不作为队列通过依据。队列判断使用已加载试用行及两台正式设备的独立队列截图。试用金额随模拟时间小幅累计，不要求不同采集时刻金额完全相同。

## 关键读回与视觉判断

- 8种组合的文档横向溢出均为0；手机卡P2是孤字排版，不是横向溢出。
- 三张收益卡外层CTA约44px，薄边、暗色局部映光/浅色淡蓝保留；允许功能文案及翻译不同于生图文字。手机图、立方体和GPU均直接目检了发光边和地面反射，没有仅用DOM背景图存在来判断保真。
- 390中文双福利卡未领取约172.79×183.99px，试用中约172.79×230.00px；320中文约137.94×265.55/271.79px。
- 390越文双卡未领取/试用中约172.79×275.89/250.50px；320越文约137.94×283.55/321.61px。相邻券卡跟随同一行高度，较高长卡容纳完整长语言文案，本轮未见裁字或操作入口丢失。
- Earn首行左右上角28px；首页行本身为0px，但父`hf-grid`为22px且overflow:hidden，实际边缘圆滑，不将子节点0px误判为裁切失败。
- 底部玻璃条：390视口约y754–822，320视口约y603–671，均为约68px高，底部保留约22px指示区。仅证明浏览器布局，不能代替手机原生安全区实测。
- 320越文确认层主按钮约48px、取消约44px，取消按钮底边约655px，在693px视口中留约38px。布局实景完整，不冒称原生触摸硬件或支付链已验。

取证工具曾在一次主题/取消后的重载中多次读取到未就绪文档；失败尝试未形成该格通过截图。随后改为分步操作并等待真实页面恢复，重新取得完整320越文暗色证据。未将工具错误当作产品通过，也未修改页面DOM来制造视觉结果。

## 后续与边界

本报告冻结在uC44u8Io，当前总体结论为“局部需修补”，不宣称整个H5发布已验收。后续只需对H5V-01与父线程新增的错误提示布局/字体做新构建增量审查。原业务矩阵、真实领取/转换/付款链没有在本视觉回归中重跑。

正式Java服务、真实HTTP交易、真实支付/下载、原生安装、物理手机/键盘/安全区均未由本报告验收。原参考APP的通过范围也不被本报告扩写。

## 运行读回摘要

下列数据来自本审查的5247标签，保留各自版本、主题及尺寸。

```json
[
  {
    "label": "home-available-zh-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "免费试用 3 天\nUVELBox S1\n免费体验\n无需付款\n立即领取",
    "trialRows": [],
    "cards": []
  },
  {
    "label": "home-active-zh-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "免费试用中\nUVELBox S1\n剩余时间\n1天 23小时\n本次购机可抵\n$38.54\n查看试用",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ]
      }
    ],
    "cards": []
  },
  {
    "label": "earn-cards-zh-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-zh-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "免费试用 3 天\nUVELBox S1\n免费体验\n无需付款\n立即领取",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-zh-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "免费试用中\nUVELBox S1\n剩余时间\n1天 23小时\n本次购机可抵\n$38.52\n查看试用",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-queue-zh-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "免费试用中\nUVELBox S1\n剩余时间\n1天 23小时\n本次购机可抵\n$38.52\n查看试用",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-zh-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-zh-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-vi-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "Dùng thử 3 ngày\nUVELBox S1\nDùng thử miễn phí\nKhông cần thanh toán\nNhận dùng thử",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-vi-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "Đang dùng thử miễn phí\nUVELBox S1\nThời gian còn lại\n1 ngày 23 giờ\nKhấu trừ khi mua máy\n$38.52\nXem dùng thử",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-queue-vi-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "Đang dùng thử miễn phí\nUVELBox S1\nThời gian còn lại\n1 ngày 23 giờ\nKhấu trừ khi mua máy\n$38.52\nXem dùng thử",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-vi-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-vi-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-vi-light-320-lower",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-vi-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "Dùng thử 3 ngày\nUVELBox S1\nDùng thử miễn phí\nKhông cần thanh toán\nNhận dùng thử",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-vi-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "Đang dùng thử miễn phí\nUVELBox S1\nThời gian còn lại\n1 ngày 23 giờ\nKhấu trừ khi mua máy\n$38.52\nXem dùng thử",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-queue-vi-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "Đang dùng thử miễn phí\nUVELBox S1\nThời gian còn lại\n1 ngày 23 giờ\nKhấu trừ khi mua máy\n$38.52\nXem dùng thử",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-vi-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-vi-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-vi-dark-320-lower",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-zh-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "免费试用 3 天\nUVELBox S1\n免费体验\n无需付款\n立即领取",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-zh-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "免费试用中\nUVELBox S1\n剩余时间\n1天 23小时\n本次购机可抵\n$38.52\n查看试用",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-zh-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-zh-dark-320",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-zh-dark-320-lower",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-zh-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "免费试用 3 天\nUVELBox S1\n免费体验\n无需付款\n立即领取",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-zh-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "免费试用中\nUVELBox S1\n剩余时间\n1天 23小时\n本次购机可抵\n$38.52\n查看试用",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-zh-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-zh-light-320",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-zh-light-320-lower",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "zh",
    "viewport": [
      320,
      693
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "手机算力",
        "body": "Android 手机参与计算。",
        "bodyLines": 2,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "质押",
        "body": "期限及提前退出规则。",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      },
      {
        "title": "共享电脑算力",
        "body": "闲置 GPU · 占 1 个槽位",
        "bodyLines": 1,
        "buttonHeight": 43.993988037109375
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-vi-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "Dùng thử 3 ngày\nUVELBox S1\nDùng thử miễn phí\nKhông cần thanh toán\nNhận dùng thử",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-vi-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "Đang dùng thử miễn phí\nUVELBox S1\nThời gian còn lại\n1 ngày 23 giờ\nKhấu trừ khi mua máy\n$38.52\nXem dùng thử",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-vi-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-vi-light-390",
    "entry": "index-uC44u8Io.js",
    "theme": "light",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "home-available-vi-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "available",
    "overflow": 0,
    "trialText": "Dùng thử 3 ngày\nUVELBox S1\nDùng thử miễn phí\nKhông cần thanh toán\nNhận dùng thử",
    "trialRows": [],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "home-active-vi-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialText": "Đang dùng thử miễn phí\nUVELBox S1\nThời gian còn lại\n1 ngày 23 giờ\nKhấu trừ khi mua máy\n$38.52\nXem dùng thử",
    "trialRows": [
      {
        "radius": [
          "0px",
          "0px"
        ],
        "parent": {
          "cls": "hf-grid",
          "radius": "22px",
          "overflow": "hidden"
        }
      }
    ],
    "cards": [],
    "navStrategy": "svg"
  },
  {
    "label": "earn-queue-vi-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  },
  {
    "label": "earn-cards-vi-dark-390",
    "entry": "index-uC44u8Io.js",
    "theme": "dark",
    "locale": "vi",
    "viewport": [
      390,
      844
    ],
    "trialControl": "active",
    "overflow": 0,
    "trialRows": [
      {
        "radius": [
          "28px",
          "28px"
        ],
        "parent": {
          "cls": "earn-fleet-content",
          "radius": "0px",
          "overflow": "visible"
        }
      }
    ],
    "cards": [
      {
        "title": "Tính toán di động",
        "body": "Kết nối điện thoại Android.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Staking",
        "body": "Kỳ hạn và quy tắc rút sớm.",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      },
      {
        "title": "Chia sẻ GPU",
        "body": "GPU nhàn rỗi · 1 khe",
        "bodyLines": 1,
        "buttonHeight": 43.989070892333984
      }
    ],
    "navStrategy": "svg"
  }
]
```

## 冻结截图索引

| 文件 | PNG宽×高 | SHA-256 |
| --- | --- | --- |
| [home-available-zh-dark-390.png](home-available-zh-dark-390.png) | 390×844 | `969cfef327bceab7e7b2cf1bdde5690718c459e843eba2e1c387302bcf65ef28` |
| [trial-confirm-zh-dark-390.png](trial-confirm-zh-dark-390.png) | 390×844 | `9ce007b4d8219c98a86c6ffbbea20b6e261a5f7e78f022ab3f5b24a5dad32c28` |
| [home-active-zh-dark-390.png](home-active-zh-dark-390.png) | 390×844 | `197b722bd553f1f664b26948dab57f921991b50a1a73ee1df37aebcd11b9fa9a` |
| [home-queue-zh-dark-390.png](home-queue-zh-dark-390.png) | 390×844 | `d2b802fe59ecb7f49080c79bd43b96c448b12670ae0797f53dacf8a24b991b0f` |
| [earn-queue-zh-dark-390.png](earn-queue-zh-dark-390.png) | 390×844 | `26eb499e00df3b04e3f28e1abf9111dab24907df6ac2e082704359db8e958d5f` |
| [earn-cards-zh-dark-390.png](earn-cards-zh-dark-390.png) | 390×844 | `4947891eac5f02c588868e63d50865b851af8cddcdd68ce2136e07fe204e4d4b` |
| [home-available-zh-light-390.png](home-available-zh-light-390.png) | 390×844 | `458d5165a1dcedb0adc45bdc9ccd4eb11a70ecf9153ecaf72d39dd5f32ee4108` |
| [home-active-zh-light-390.png](home-active-zh-light-390.png) | 390×844 | `96e1a821ba13fdba31a8d3322909d7e1a70ff647f040a68a4e0099a009633055` |
| [home-queue-zh-light-390.png](home-queue-zh-light-390.png) | 390×844 | `fd6b73f23565be9c9302320c3fdad1052f8b5192087f3e0cdca87273da33735d` |
| [earn-queue-zh-light-390.png](earn-queue-zh-light-390.png) | 390×844 | `ab9ced13ee450d3a44ccb377157820a8ad8d7c186af3152bae40bab9c52f9c9a` |
| [earn-cards-zh-light-390.png](earn-cards-zh-light-390.png) | 390×844 | `6c9df54c248dd949bbe299528ec6550c9688ada0f14cdc2f620abf877c95b6b5` |
| [home-available-vi-light-320.png](home-available-vi-light-320.png) | 320×693 | `a9d7490c4b3d96aa01072e7113e6f36f1faca659f5e577023a85eb0e10e37951` |
| [home-active-vi-light-320.png](home-active-vi-light-320.png) | 320×693 | `a462573aa3bca95dc3e0ded8ffcaf275aa9481b2e0ebec382e85a8a964e17231` |
| [home-queue-vi-light-320.png](home-queue-vi-light-320.png) | 320×693 | `1312a3341fc98161038f539166f3eb18e907cd7a6dc4bded65474fdc4034a338` |
| [earn-queue-vi-light-320.png](earn-queue-vi-light-320.png) | 320×693 | `e577cf5df558a694010fa8bbbc66c4bc9d530f9335ed5e9827a07ec5f3b497eb` |
| [earn-cards-vi-light-320.png](earn-cards-vi-light-320.png) | 320×693 | `8a07304f125f2c8302207ed8ea8b7dfb53840dcb6aa0d45def949232b5a01345` |
| [earn-cards-vi-light-320-lower.png](earn-cards-vi-light-320-lower.png) | 320×693 | `a3ecdb5dd307bcc6ceb79969b2e8dcd5fd026aea49fa3410a94ee287017045ff` |
| [trial-confirm-vi-light-320.png](trial-confirm-vi-light-320.png) | 320×693 | `6b305e61f60bb0f93549bae22c6d0acffbde45b63474c1199ecb09e51f6c63e0` |
| [home-available-vi-dark-320.png](home-available-vi-dark-320.png) | 320×693 | `5b78539ee71c0712bdf47d9b560c50459d5640b4666e016a9aa491a3da22064f` |
| [home-active-vi-dark-320.png](home-active-vi-dark-320.png) | 320×693 | `c58a38511a928d6d2c5b721c70f447c183c0d4f7a162292b68b1def92c73ccad` |
| [home-queue-vi-dark-320.png](home-queue-vi-dark-320.png) | 320×693 | `7496a102c86ff8f9a940d1415386e5b3c7936194796bc4ee8f016516d58aa8cd` |
| [earn-queue-vi-dark-320.png](earn-queue-vi-dark-320.png) | 320×693 | `e7174cd3663fb481ec91b8f4e86f85bcd12266d88a20489aaad07b0bee07e377` |
| [earn-cards-vi-dark-320.png](earn-cards-vi-dark-320.png) | 320×693 | `27113f2dab0cca4f5bbedf80bce88035f9cc3868e562c21eef391d0575bb7ab8` |
| [earn-cards-vi-dark-320-lower.png](earn-cards-vi-dark-320-lower.png) | 320×693 | `6c6db9b5d30a1feba356606c0f422afd605f73f1f6338f5deb17187bc1992c83` |
| [home-available-zh-dark-320.png](home-available-zh-dark-320.png) | 320×693 | `f4423af6be0ae86e3eb21b02cf2de9c6fe3b954ebd28d7a0832d16bd984569db` |
| [home-active-zh-dark-320.png](home-active-zh-dark-320.png) | 320×693 | `2461a74b57a56432ac7b933791a7976aa8a566d72c9204c86e362b44d8ea9484` |
| [earn-queue-zh-dark-320.png](earn-queue-zh-dark-320.png) | 320×693 | `8e21c0ea83dc436ea7790180c7531b8dc2f82db6172ec90f90418d95607f1cd5` |
| [earn-cards-zh-dark-320.png](earn-cards-zh-dark-320.png) | 320×693 | `f2feed54a24380b87fd918ad4b87813122deadb85834ab2fdbaf8156ce0606ee` |
| [earn-cards-zh-dark-320-lower.png](earn-cards-zh-dark-320-lower.png) | 320×693 | `6ac4fc3b5dfe1ba32fb90ac57fc8566282ebead1327391ac250cb0697a88404b` |
| [home-available-zh-light-320.png](home-available-zh-light-320.png) | 320×693 | `1df572798ef582bb0e4d06ca3f815d8a3e548cbaf731b844b943a2c4441da558` |
| [home-active-zh-light-320.png](home-active-zh-light-320.png) | 320×693 | `a128d210a51749b70c6cc62d7b9f975fae7db42187aca2eb7e2734eb56750ff8` |
| [earn-queue-zh-light-320.png](earn-queue-zh-light-320.png) | 320×693 | `233ec988aa13f3e4248e00f0c0693c9b19dcf4d14431f62c34813f14a90c3b2e` |
| [earn-cards-zh-light-320.png](earn-cards-zh-light-320.png) | 320×693 | `4889fd3c3c8cf37e9786449756823edd0a8951b6a3bb538158d23c45948f1508` |
| [earn-cards-zh-light-320-lower.png](earn-cards-zh-light-320-lower.png) | 320×693 | `7a9dd759de58b34197fc441d1d0367f93e506d82f2306c3f5d0a10f6d897cf4c` |
| [home-available-vi-light-390.png](home-available-vi-light-390.png) | 390×844 | `7e7be834112882382f6e8a03795c5a2c9d8729bec3c4bbc617998eebc3237e18` |
| [home-active-vi-light-390.png](home-active-vi-light-390.png) | 390×844 | `8835c97cca85d9f1dd6f110188ba2d5522f13ba5ef386a9455f1f4ad3eb4c795` |
| [earn-queue-vi-light-390.png](earn-queue-vi-light-390.png) | 390×844 | `5af0bc816b6598e9e3e349af6ee424f17573f63a68f7a2cfd851601099191a26` |
| [earn-cards-vi-light-390.png](earn-cards-vi-light-390.png) | 390×844 | `3f4fca908313ea51ad688065b482c9163dd0577981c4b0f42be938e4e249b203` |
| [home-available-vi-dark-390.png](home-available-vi-dark-390.png) | 390×844 | `a55f1631b08f0c32592d2291c8d26e8aefe4d2d367e43115997c2076658fbe01` |
| [home-active-vi-dark-390.png](home-active-vi-dark-390.png) | 390×844 | `912cbb0d3677bf3efb46af0b85f9590776370b1e3021fa7a2b90850519d36380` |
| [earn-queue-vi-dark-390.png](earn-queue-vi-dark-390.png) | 390×844 | `ed08e837dd449b4b5e4be41db53fac4c92fa2cb3ca93a34d224f055e84a54b6e` |
| [earn-cards-vi-dark-390.png](earn-cards-vi-dark-390.png) | 390×844 | `d55a1266188b066284a6f2bd74deed50fc6359666baa4f21d5a87d1ecfb2144b` |
