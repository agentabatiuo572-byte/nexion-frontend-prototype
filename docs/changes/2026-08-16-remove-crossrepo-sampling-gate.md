# 2026-08-16 摘除跨仓采样门 + 退役 legacy-suite 路径契约

主人 2026-08-16 拍板:`D:\WORKS\PLAN\NX1.0-UniApp-UI`(原 `NX1.0-UniApp`)为旧 Codex 线快照,停更归档(该仓根有 `_STALE_LINE_DO_NOT_USE.md` 标记)。verify.sh 的跨仓采样门专审该线,审计对象消失后恒红且无意义,主人令摘除(本日两次拍板:先「回滚」修门尝试,后「摘」门本体)。

## 摘了什么

- `scripts/verify.sh`:`cross_repo_sampling_gate` 函数 + 调用 + 注释块(原 2662-2685 行)。
- `scripts/legacy-suite-path-contract.test.mjs`:退役(副本在 `.trash/20260816-degate/`;其断言含「审计脚本必指 NX1.0-UniApp、禁指 Nexion-uniapp」,与 2026-08-10 legacy-suite 裁决一同归档)。
- `scripts/run-contract-suite.mjs`:REGISTRY 中对应登记行(文件与登记同一提交移除,不留孤儿登记)。

## 不摘什么

- SPEC-7 parity 门(`platform-config-contract-parity.mjs` 调用):靶是本仓 `$PROJECT_DIR`,与死线无关,保留。
- admin-ops 侧 `scripts/uniapp-port-coverage-audit.mjs` 原样不动(admin 仓自己的工具;其 `remediation:preflight` 对死线的引用是 admin 仓自己的议题)。
- `docs/changes/2026-08-10-legacy-suite-adjudication.md` 等历史台账原样保留(历史证据,不改写)。
