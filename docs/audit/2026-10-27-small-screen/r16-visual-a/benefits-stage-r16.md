# R16 福利阶段：独立视觉 A

实际入口 **index-CCvSPlak.js**，全局CSS index-DPMvPy7r.css（页面index-C4EufXXG.css另存runtime）。官方CUA Chrome4，自有5254；不是源码分。

| 子项 | 分数/10 | 实际范围 |
| --- | --- | --- |
| 未领取小按钮/布局 | 9.2 | 320/390 VI浅、ZH暗均只保留领取按钮在右下；CTA根44高，子trial-cta__surface及LiquidGlass为32高。未实际领取。 |
| 已领取整卡/无CTA | 9.1 | 同4组合active，CTA0，rolebutton/tabindex0/完整aria；320ZH实际Enter到/pages/me/trial。 |
| 双卡等高/机图不缩小 | 9.2 | 八格两卡逐格等高，所有机型容器及image118×118。320未领取204.33/active219；390未领取211.33，active中文206/越文225.33。各格排版完整无横溢。不虚报所有active相较旧版本都有数值缩短。 |
| 投影归位与悬浮 | 9.2 | floor位于trial-art内；320VIactive实际4.3066秒324帧DOM采样：image centerDX=0，floor centerDX约-0.0104px稳定；imageY -4..0，floorScale .9..1，均4.2s周期。只签当前可观察动画/截图，不称GPU FPS或连续视频。 |

8张截图位于本目录r16-benefits-*；完整几何及RAF原始样本见[阶段JSON](benefits-runtime-r16.json)。初次可见机图与动画均实际目检，未以DOM存在代替外观判断。

签到checked/未领取对照尚待后续；当前白名单无checked或unauth模式，先查合法入口，不通过领奖/登出造状态。导航<=374新图标方案属于R17，当前带文字导航不视作本轮回归。

本阶段不代表整轮钱包/ref/剩余只读卡已完成。
