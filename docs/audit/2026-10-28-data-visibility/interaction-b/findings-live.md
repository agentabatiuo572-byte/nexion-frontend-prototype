# 隐私增量 B 实时发现

当前包 index-BfQ3iod9.js。尚未整体签核。

P2-01：隐藏aria-pressed=true后，首页/#/ .network-compact__cell:nth-child(3) .network-compact__value 仍显示个人绑定设备排名#184；该格role=button的子文本构成可访问名称。source network-pulse-card.vue rankCell.v读取useNetworkRank.currentRank，未消费data-visibility。隐私完整覆盖暂8.7。保留公共会员/设备总量，只遮第三格。

证据P2-home-personal-device-rank-visible-while-hidden.png。其余项目继续实测，不能用局部合格关闭此项。

P2-02：Earn .earn-capacity-info Enter打开既有capacity-explainer-sheet后，320VI暗关闭Đóng实际29.34375×30px，before/after content none，外侧6px不能命中。closeBtnStyle固定30且未防flex收缩。说明弹层操作8.8；建议44根不收缩、保留30面。证据earn-capacity-sheet-320-vi-dark.png。

BJuG9oWu增量：P2-01排名已修复，隐藏时第三格••••、公开总量仍在，显示恢复#184。P2-02关闭仍29.34375×30无伪层，保持8.8。新火箭22/44，1.6/.72/.9s真实iteration与reduce静态/Space打开原sheet已测；deep兼容新包待指纹。

2zHt78Yy终包冻结：排名P2-01闭环；火箭1.6/.72/.9真实iteration、reduce与点击通过。P2-02再次29.34375×30，仍8.8；父线程已明确接手44热区/30可见面。其它项冻结，最终细表见report.md。

C5I8XvUO最终局部：320VI暗/390ZH浅均44根30面，8次边缘实点均trusted且命中关闭按钮，留Earn回焦。P2-02 8.8→9.2关闭，旧失败保留；详见close-hitbox-final/report.md。
