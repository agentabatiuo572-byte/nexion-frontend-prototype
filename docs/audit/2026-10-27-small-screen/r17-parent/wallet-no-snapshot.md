# r17 无快照钱包主线程补验

2026-10-28；IAB新建隐藏标签5272，未清空浏览器数据，既有隔离只读代理精准wallet-funds503。读回入口index-BQJ7beyl.js，390中文暗色。

- [失败帧](wallet-no-snapshot-390.png)：余额显示—，原充值/提现/兑换按钮不渲染；保留44px刷新钱包、记录等只读入口。没有把有效零或旧快照当未知。
- 将代理恢复off后点击同页原“刷新钱包”，[恢复帧](wallet-no-snapshot-restored-390.png)显示$52,800.64及三项资金入口；没有执行资金动作。
- [DOM读回](wallet-no-snapshot-390.json)仅可见标签/几何/入口指纹，无应用内部存储或token。
- 本项是主线程补验，不代替独立B的N/T或真实TEST验收。
