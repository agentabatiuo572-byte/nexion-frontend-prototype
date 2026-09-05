# 第1波三包收口 · 审计与走查发现台账(2026-08-03)

> 来源:uniapp 审计 wf_3baec95a(44 agent)· admin 审计 wf_bdb94dda(45 agent)· 4 路实景走查 · persona 剧本
> 状态:已收齐,待逐条回源裁决 + 机械/机制分类

---

# A. uniapp 审计

## A1 CONFIRMED(对抗存活)(8)

### [P0] src/store/free-trial.ts:215
**convert() and poll() together allow post-grace conversion with full offset — user offline past graceEndsAt still gets $21 credit**

- 依据:convert() (215-221) only checks in-memory status (`status !== 'active' && status !== 'grace' → return false`). It does NOT compare `mockServerNow()` against `graceEndsAt`. poll() (235-250) advances state one step per call and `return`s at line 243 after active→grace, so grace→ended is not cascaded in the same tick. In App.vue:132-144, pollTrial runs on setInterval(TRIAL_TICK_MS = 4000ms). Meanwhile, liveShadowUSD (261-270) caps active accrual at `cfg.trialDays * ONE_DAY_MS`, so a stale active state past graceEndsAt still returns full $21 shadow.
- 场景:User claims trial day 0 (expiresAt=day 3, graceEndsAt=day 10). User is offline until day 15. On app open: (a) storage hydrates status='active', (b) user taps checkout before the first 4s poll tick, or (c) the first poll fires active→grace and returns; user immediately confirms convert within the 4s gap before second poll advances to ended. checkout.vue:670 snapshots `liveShadowUSD(Date.now())` = min(3d, 15d)*$7 = $21 (capped by trialDays inside liveShadowUSD). checkout.vue:710 calls `freeTrial.convert()` which sees status active|grace → converted. Order at line 696-704 is placed with `trialOffsetUSD: 21` even though the trial+grace timeline expired 5 days ago. Platform gives out unearned discount + shadow-remainder cash. Repeatable on any account that goes cold past graceEndsAt. Fix: convert() must call poll(mockServerNow()) or inline the same time-boundary check before flipping status, 

### [P0] lib/mock/admin/compute-config.ts:1
**compute-config.ts mock module is dead code with stale PROD-endpoint annotations**

- 依据:File exports COMPUTE_FLAGS / COMPUTE_COEFFICIENTS / COMPUTE_YIELD_ESTIMATE / COMPUTE_GPU_TIERS / COMPUTE_DOWNLOAD_CONTENT + related paramKey helpers, but grep of admin-ops shows ZERO runtime importers: `lib/admin/registry/e.ts` does not import it, `app/components/domain-views/e-tabs/e6-compute-config.tsx` imports only `@/lib/admin/e6-client`. The E6 tab already uses ctx.e6Config (real backend GET /api/admin/devices/compute-config aggregate view, per e6-compute-config.tsx:6 header). The mock module is dead; its 5-line JSDoc header + 4 inline `PROD 替换点` blocks (lines 2-12, 80-83, 103-106, 184-186) describe a REST contract nobody consumes. Fails check (d): annotation says 'backend-replaceable / mock seed' as if this were live-mock scaffolding, but the code path was already replaced by e6-client + `app/api/admin/devices/[...path]/route.ts` proxy. Anyone reading these annotations will believe
- 场景:Developer opens lib/mock/admin/compute-config.ts to understand the E6 flow, reads the PROD replacement notes, wastes an afternoon wiring backend to endpoints that don't exist, or blocks progress waiting for a mock→real migration that already happened via a different aggregate endpoint. Cleanup: delete the file (Move to .trash per project rule) or rewrite the header to say 'kept as backend seed/reference only; runtime path is e6-client.ts'.

### [P1] src/store/nex-faucet.ts:279
**isWithdrawalFeeSnapshotValid 只校内部等式,不与权威 config 交叉复核 networkConfirmUsd —— 客户端可伪造 $0 费快照**

- 依据:docstring 272-278 明写 PROD 语义是「server 以权威费率重算并拒不一致单」并称「mock 同构」,但实现只做 ①意图守恒 + ②内部等式 |actualFeeUsd − max(0, networkConfirmUsd − nexBurned×offsetRate)| ≤ 0.0001 两件事。函数签名(279-283)完全没有 network / cfg 参数,自然不可能把 fee.networkConfirmUsd 与 cfg.config.withdrawRules.networkConfirmFeeUsd[network] 做等值比较。等式对任意「自洽三元组」都放行——{networkConfirmUsd:0, nexBurned:0, actualFeeUsd:0} 命中 0 = max(0, 0 − 0×0.4) 一路绿。app.ts:1029 是这条检查的唯一 server 端入口,除此之外再无二道防线;`isNetworkFeeConfigUsable` 只在 UI 那侧(config.ts:77-79 + wallet-withdraw.vue:508)用,server 从不调用。scripts/selfcheck-withdrawfee.mjs 也只覆盖等式/意图/边界(154-165),没有『networkConfirmUsd ≠ 权威值 → 拒』这条固定靶——现在改坏它,机器门全绿。
- 场景:1) 攻击者对 uniapp 页开 devtools:`useConfig().config.withdrawRules.networkConfirmFeeUsd.erc20 = 0`(0 是 isNetworkFeeConfigUsable 合法值,line 240-243)。2) feeConfigUsable 仍返 true,UI 不弹失败态。3) 选 USDT-ERC20 提 $100,handleSubmit 构造 fee={networkConfirmUsd:0, nexBurned:0, actualFeeUsd:0},offsetWithNex=false。4) app.ts:1029 调 isWithdrawalFeeSnapshotValid:parts 全 ≥0 finite ✓,!offsetWithNex && nexBurned===0 ✓,|0 − max(0, 0−0×0.4)|=0 ≤ 0.0001 ✓ → 放行。5) withdrawal 落盘 actualFeeUsd=$0、netReceive=$100(app.ts:1105、types.ts:249);usdtBalance 只扣 amount($100)不扣 fee(app.ts:1129 `usdt = u.usdtBalance - amount`)。真后台按 mock 这份『同构』器件接线,直接 $5 ERC20 gas 由平台吃——正是 whyRisky『用户按 A 费下单、平台按 B 费扣款』的资金 P0 场景。修法:validator 加 (network, authoritativeCfg) 入参,`if (fee.networkConfirmUsd !== authoritativeCfg[network]) return false;`,与 offsetRate 那侧同源同刻用 `cfg.config.withdrawRules.networkConfirmFeeUsd[network]` 取。scripts/selfcheck-withdrawfee.mj

### [P1] src/store/app.ts:851
**refundFailedWithdrawals 只退 USDT 不退 NEX,失败提现永久烧毁 nexBurned NEX**

- 依据:refundFailedWithdrawals 循环只调用 `creditRewardBucketOnce("refund:" + wd.id, "withdrawable", wd.amount)`,只退 USDT 主本金,完全忽略 `wd.fee.nexBurned`。而 wallet-withdraw.vue:864 在调用 submitWithdrawal 前会 `app.debitNex(toBurn)` 真实扣掉 NEX(toBurn=quoted.nexBurned),NEX 债务通过 wd.fee.nexBurned 落盘到单据里。当单据后续进入 review-rejected/address-invalid/tx-failed/refunded 终态(App.vue:95 触发),refundFailedWithdrawals 把 USDT 加回来,但 NEX 一分不退。真后端行为:失败提现 = 网络费从未真正付掉 → nex 抵扣也是白烧 → 必须一并退。函数注释还赫然写着「必须把钱还给用户 …退款与置账单失败必须在**同一处**完成,否则接后端时必然只做一半」,而它自己就是「只做一半」的现场。审计明确点名这一处必须成对,却漏掉了对称的 NEX 侧。
- 场景:普通触发路径,不需要恶意:任何 fastLane=false/共用地址/风控命中导致的 review 拒付、address-invalid、tx-failed 都会经过此路径。每一次失败的抵扣提现,用户都白烧一次 NEX。
- 失败场景:用户提现 $80 打开 NEX 抵扣,quoted.nexBurned=5,quoted.actualFee=0。wallet-withdraw.vue:864 debitNex(5) → nexBalance −5;submitWithdrawal 落盘 wd={amount:80, fee:{nexBurned:5, actualFeeUsd:0}, status:'submitted'};风控后续把该单据推进到 'review-rejected'(freeze 路由被人工/自动置为 rejected,或 pass 路由被 tx-failed);App.vue:95 触发 refundFailedWithdrawals → USDT +80 回到用户账户,但 5 NEX 永久归零。用户没花任何网络费,却永远失去了 5 NEX。fee.nexBurned 越大损失越大。

### [P1] src/store/free-trial.ts:238
**elapsedMs cap uses current cfg.trialDays instead of user's frozen trial window — admin raising trialDays retroactively inflates shadow accrual**

- 依据:poll() line 238: `Math.min(cfg.trialDays, (now - startedAt) / ONE_DAY_MS)`. liveShadowUSD line 265: `Math.min(cfg.trialDays * ONE_DAY_MS, now - s.startedAt)`. liveShadowNEX line 276: same. All three read `cfg.trialDays` at compute time, not the user's actual promised window. `expiresAt` was frozen at start() line 199 (`now + cfg.trialDays * ONE_DAY_MS`), but the cap in accrual math is not.
- 场景:User starts trial day 0 with cfg.trialDays=3 → expiresAt=day 3. Admin raises trialDays to 7 on day 4 (config store update() persists globally, no per-user snapshot). User's status is still 'active' in memory (poll hasn't reached the day-3 boundary yet or it ran after admin change). User views trial page day 5. liveShadowUSD computes elapsedMs = min(7d, 5d) = 5d → shadow = $35 shown. Should be $21 (bounded by the 3-day promise). If the user then converts, they get a $35 offset. Reverse case: admin lowering trialDays mid-flight to 1 caps user at $7 even though they were promised 3 days. Fix: cap by user's actual window — `Math.min(expiresAt - startedAt, now - startedAt)` (uses stored `expiresAt`, not live cfg).

### [P1] src/store/free-trial.ts:247
**poll() grace→ended sets finishedAt=now instead of the actual graceEndsAt boundary**

- 依据:Line 247: `finishedAt.value = now;` — but the trial actually ended at `graceEndsAt`, potentially days earlier. Server cron in production would stamp finishedAt at the boundary; mock's lazy poll can fire arbitrarily later. This desyncs UI ('ended today' shown for a trial that ended 5 days ago), any bill/order reconciliation that matches on finishedAt, and the trial history page's chronology.
- 场景:User opens app on day 15. Grace ended day 10. Poll fires (assuming cascade fix from finding #1), sets status='ended', finishedAt=day 15. Trial page shows 'Trial ended: 2026-08-03 12:34' (today). Should show '2026-07-29' (day 10 boundary). If any admin audit reconciles user finishedAt against server cron ledger, they diverge. Also breaks the invariant that finishedAt ≤ graceEndsAt for auto-expiry endings. Fix: `finishedAt.value = graceEndsAt.value ?? now;` on grace→ended (line 247). Cancel path stays as now (user-triggered = actual click time).

### [P1] src/pages/store/checkout.vue:596
**Voucher expiration mid-checkout → silent overcharge (quote snapshot missing voucher context)**

- 依据:Line 596 declares `let trialQuote: { applied: boolean } = { applied: false };` — the confirm-time snapshot captures ONLY the trial-active flag. It captures neither the voucher id, its discount, promo, nor the confirmed chargeTotal. At pay time (confirmed step) line 626-627 does `const discount = voucherDiscount.value; const usedVoucherId = voucherMatch.value?.def.id ?? null;` as FRESH reads. `voucherMatch` computed re-runs `voucher.bestVoucherFor(p.id, p.price, ...)` which iterates `claimedUnused.value`; `claimedUnused` filters by `isVoucherValid(def)` (voucher.ts:110-118) which uses `mockServerNow()` (mock/vouchers.ts:110) — i.e. purely time-based. The five explicit pay-time bail guards (lines 634-638 trade-in invalidation, 643-649 phase gate, 652-655 purchase gate, 660-665 trial-mode flipped, 682-687 insufficient balance) do NOT re-verify the voucher discount was preserved. On line 675
- 场景:User claims a stackable voucher with expiration T. At T−90s user opens checkout for a matching SKU, sees `−$X` on the confirm page, taps `Pay Now` → pay-instructions. They spend >90s completing the USDT transfer (or entering card details, or simply reading the QR). Voucher clock crosses T. User taps `I've paid` → 2.4s → confirmed. `voucherDiscount.value` re-reads null → `discount=0` → chargeTotal higher than confirmed → `debitBalance` succeeds → order posted at full price. The voucher's markUsed (line 740) is skipped (guard `discount > 0 && usedVoucherId`), so the voucher isn't even consumed — it just silently disappears from the applicable set. Bill memo omits the voucher part. Result: silent overcharge equal to lost voucher discount; user has no in-app signal that the price changed.

### [P1] src/pages/register/register.vue:546
**register.vue 礼包成功 toast 副标题硬编码英文 "Sponsored by" — 违反 🔴 i18n 铁律**

- 依据:line 546: `toast.success(\`+$${gift.usdt} + ${gift.nex} NEX\`, sponsorPreview.value ? \`Sponsored by ${sponsorPreview.value.name}\` : t.value.register.giftCreditedToastSub);`  对比 i18n 三份翻译文件均存在 giftCreditedToastSub 键(zh.ts:272 '已存入钱包' / vi.ts:284 'Đã vào ví' / en.ts:283 'Credited to wallet'),说明这里本应走翻译。当带 sponsor 参数注册且立即入账(giftRoute === 'withdrawable')时,中/越/繁体中文用户会在 toast 副标看到裸英文 'Sponsored by X',违反项目 🔴 铁律「i18n 不硬编码 / 硬编码英文 = regression」。翻译键缺失(register.sponsoredBy 之类的模板)也是同一根因 — 需要新增翻译键并 fmt() 注入 name。
- 场景:1) 用户在支持中文的设备打开 H5 或 APP(locale=zh) 2) 使用 ?ref=XXX 进入注册页,sponsorPreview 被 pickSponsor 填充 3) 走完三步 finish() → sponsorship.bind 成功 → ensureGiftClaim 返回 gift → creditRewardBucketOnce posted=true 且 registration.giftRoute === 'withdrawable' → giftPosted=true 分支 4) 545-546 行 toast.success 触发,副标显示 `Sponsored by ${name}` 而非中文 → 用户体验断裂

## A2 UNCONTESTED(超对抗配额,未经证伪,待人审)(8)

### [P1] app/components/domain-views/d-tabs/d2-withdrawals.tsx:225
**D2 batch withdraw execute acts on rows the operator has since filtered out**

- 依据:`selected: Set<string>` persists across `ruleFilter` changes. `visibleRows = ruleFilter ? rows.records.filter(...) : rows.records` is a purely client-side memo. `load()` (the only path that clears `selected`) fires on `[status, page, pageSize]` — never on `ruleFilter`. `confirmBatch()` at line 271 sends `Array.from(selected)` to `reviewD2WithdrawalsBatch` (line 287), while the modal detail (line 275) reports `已选择 ${ids.length} 笔` including the hidden withdrawals.
- 场景:Operator opens D2, keyword-selects 25 pending rows across 20-row page. Types 'RISK_HIT' into 命中规则 (ruleFilter) to focus review; visibleRows collapses to 3 rows. Picks batchAction=APPROVE (or REJECT/DELAY/FREEZE), clicks 批量执行. Modal reads '已选择 25 笔' but operator visually only sees 3 rows on-screen. Confirms with 8-char reason → backend applies action to all 25 withdrawalNos, including the 22 filtered-out ones. Money moves / decisions land on invisible rows.

### [P1] app/components/domain-views/d-tabs/d2-withdrawals.tsx:185
**D2 batchAction defaults to APPROVE and is never synced to authority-filtered dropdown options**

- 依据:`const [batchAction, setBatchAction] = useState<...>("APPROVE")` initializes to APPROVE. The dropdown at line 323-325 filters options via `.filter((action) => hasAuthority(ACTION_AUTHORITY[action]))`. When operator has `finance_d2_withdrawal_batch` + `_reject`/`_delay`/`_freeze` but NOT `_approve`, the <select value="APPROVE"> has no matching <option> (blank display) yet state stays "APPROVE". Line 287 sends `reviewD2WithdrawalsBatch(batchAction, ids, ...)` with `action:"APPROVE"`. No `useEffect` normalizes batchAction to a valid authorized action.
- 场景:Grant a role `finance_d2_withdrawal_batch` + `finance_d2_withdrawal_reject` only (per typical junior-reviewer pattern). On mount select shows blank/no selection but internal state is APPROVE. Operator selects rows and clicks 批量执行, thinking they are executing the only visible option (REJECT). ConfirmBatch sends `{action:'APPROVE', ...}`. If backend authority check is per-endpoint (finance/withdrawals/batch) rather than per-(endpoint,action), the operator has bypassed the approve gate.

### [P1] app/api/admin/auth/login/route.ts:78
**Admin login sets full-access cookie even when passwordChangeRequired=true; proxy layer only checks cookie presence**

- 依据:Login handler (lines 78-96): `if (accessToken && parsed.data?.session) { ...response.cookies.set(ADMIN_TOKEN_COOKIE, accessToken, {httpOnly, ...maxAge=8h}); return response; }` — cookie is set unconditionally on session+token, with no check on `parsed.data.session.passwordChangeRequired`. Every proxy route (`app/api/admin/finance/[...path]/route.ts:81-83`, `withdraw/[[...path]]/route.ts:18-19`, `emergency/[...path]/route.ts:32-33`, `users/*`, `bills`, `config`, `content`, `devices`, `risk`, ...) only checks `cookies().get(ADMIN_TOKEN_COOKIE)?.value`, then forwards with `Authorization: Bearer ${token}`. Client `useAdminAuth.signIn` (lib/store/admin-auth.ts:34) sets `isAuthenticated: !session.passwordChangeRequired` which merely hides console UI while showing the change-password form.
- 场景:1) POST /api/admin/auth/login with valid initial credentials whose account has passwordChangeRequired=true. 2) Response sets nexion_admin_token cookie (valid 8h). 3) Instead of submitting the change-password form, open devtools and `fetch('/api/admin/finance/withdrawals/W001/review', {method:'POST', headers:{'Idempotency-Key':'x','Content-Type':'application/json'}, body:JSON.stringify({action:'APPROVE',...})})`. 4) Proxy sees cookie → forwards to backend. 5) If backend does not re-check passwordChangeRequired per request (unverified from admin-ops repo), the operation succeeds — the client-side change-password gate is entirely bypassed.

### [P1] lib/admin/user360-client.ts:456
**user360-client idempotency keys are process-memory only; page reload loses replay guard for sensitive C-domain mutations**

- 依据:Line 456: `const pendingUserMutationKeys = new Map<string, string>();` is a module-level in-memory Map with no persistence. Contrast with `lib/admin/d-client.ts:459` which persists identical shape to `sessionStorage` via `PENDING_MUTATION_STORAGE_KEY` + TTL (`readPersistedPendingMutations`/`rememberPendingMutation`/`forgetPendingMutation`, lines 473-554). Callers that use `idempotencyPrefix` (auto-generated key) — `updateUserStatus` (line 1416), `startUserImpersonation` (line 1432), `terminateUserImpersonation` (line 1452), `upsertUserAccountList` (line 1460), `removeUserAccountList` (line 1468) — mint a fresh Idempotency-Key after any page reload.
- 场景:Operator clicks 冻结 on user U00000123 → POST /profiles/123/status is in-flight. Network drops (VPN blip / laptop sleep). Browser shows spinner then times out. Operator refreshes tab (Ctrl-R); pendingUserMutationKeys is wiped. Operator clicks 冻结 again with same reason → new fingerprint → new commandKey. If the first request had already reached the backend and committed, the second request creates a duplicate audit trail + potentially double-emits C2/K1 events (freeze applied twice, second one no-op but backend log shows two operator actions). Same class of bug applies to impersonation-start (two overlapping impersonation tokens), account-list upsert (two audit rows), and account status flips. Not defensible by fingerprint dedup because the fingerprint is derived from same-intent inputs but keyed by a new random.

### [P1] app/components/domain-views/c-tabs/c3-adjust.tsx:161
**c3-adjust submission fingerprint + review/reverse command keys wiped on reload; double-execute risk on finance mutations**

- 依据:Line 161: `const [submission, setSubmission] = useState<{fingerprint;key}|null>(null)` — React state, cleared on remount. Lines 165-166: `reviewCommandKeys = useRef(new Map())`, `reverseCommandKeys = useRef(new Map())` — component-local refs, cleared on remount. `newIdempotencyKey` at line 120 uses `crypto.randomUUID()` — a fresh UUID every call. `submitAdjustment` (line 295): `submission?.fingerprint === fingerprint ? submission.key : newIdempotencyKey(...)`. So if `submission` state is lost (page refresh, navigation), a same-intent retry mints a new key.
- 场景:Client A creates a $500 USDT CREDIT adjustment for U0001 with reason 'compensation for outage'; request POSTs to /profiles/1/asset-adjustments. Server commits the adjustment + emits ledger row + writes audit. Response gets lost (backend 200 but connection dropped after DB commit). Client sees fetch throw → toast error. Operator navigates away then back to C3, re-enters same fields, clicks 确认并执行 → new Idempotency-Key → server accepts a SECOND CREDIT of $500. User now has +$1000 instead of +$500. Same failure mode on `reviewLargeRequest` (approveUserAssetAdjustment/rejectUserAssetAdjustment) and `reverseAdjustment` (reverseUserAssetAdjustment).

### [P1] lib/mock/admin/compute-config.ts:10
**compute-config.ts PROD comments name endpoints that do not match the real REST contract**

- 依据:compute-config.ts:10-12 claims `GET /api/admin/config/feature-flags` + `PATCH /api/admin/config/feature-flags/:key`; lines 81-83 claim `GET/PATCH /api/admin/config/compute-share/yield-estimate/:key`; lines 103-106 claim `GET/PATCH /api/admin/config/compute-share/gpu-tiers/:id`; lines 184-186 claim `GET/PATCH /api/admin/config/compute-share/download-content`. None of these 4 endpoint families exist anywhere in admin-ops: grep across `app/api`, `tests/e2e`, `lib/admin` returns 0 hits for `/api/admin/config/feature-flags` and `/api/admin/config/compute-share/*`. Real E6 endpoint is a single aggregate `GET /api/admin/devices/compute-config` + `PATCH /api/admin/devices/compute-config/params/{paramKey}` (confirmed in lib/admin/e6-client.ts:7,116,139 and every e2e spec: e-domain-owner-20260728.spec.ts:126,163,170,193 · e6-nonowner-d-terminal-20260728.spec.ts:237 · e-domain-permission-fixtures-2
- 场景:A backend engineer implementing the mock→prod cutover follows the mock's header comments and builds `/api/admin/config/feature-flags` in Java Spring; frontend keeps calling `/api/admin/devices/compute-config`; nothing lights up; wasted round-trip before someone rereads e6-client.ts. Fix: overwrite the PROD comments to reference the actual aggregate + params endpoints, or delete the mock file entirely.

### [P1] lib/mock/admin/compute-config.ts:8
**compute-config.ts DR-7 note asserts admin is still mock-only after admin was wired to real backend**

- 依据:Line 8: `DR-7:本期 admin 改 flag 与 uniapp 读 flag 各自 mock, 结构一致即可, 不真打通后端。` Line 44-45 repeats the same DR-7 claim for coefficients. Both are factually wrong: `lib/admin/e6-client.ts` posts to `/api/admin/devices/compute-config/params/{paramKey}` with real Idempotency-Key + reason + operator; `app/api/admin/devices/[...path]/route.ts` proxies to Spring backend at 127.0.0.1:8110 (NEXION_BACKEND_URL env). Admin IS wired. Fails check (d) fake-patch: annotation sounds authoritative ('本期不真打通') but the code moved past it, and rule 9 says 'comment ≠ fix' — the reverse also holds: an outdated comment invalidates its own assertion.
- 场景:New team member reads DR-7, believes E6 param writes don't hit real backend, spends time hunting for the mock storage bridge, or worse: assumes tests are unnecessary because 'it's just mock'. Since packages A/F/I were merged recently with real backend wiring, this DR-7 note is now systemically stale — grep for `DR-7` in admin-ops shows 2 hits, both in this dead mock file, so removal is safe. Fix: remove the DR-7 assertion or replace with 'admin now proxies to Spring backend (see e6-client.ts); mock exports kept for seed/reference only.'

### [P1] docs/cgm/cgm.manifest.json:2309
**CGM-E-016 manifest annotation flags a PRD §9.11a violation that has never been resolved — annotation-as-fake-patch**

- 依据:Line 2309: `serverCanonical: 头注 ⚠️ PRD CONTRACT VIOLATION:§9.11a 已写明 server 为 chargeFailRate 唯一源, 当前仍 client Math.random()(有意 mock);接真后台删 mockChargeAttempt, 扣款走 POST /api/trial/charge, chargeFailRate 字段移除`. This is the ONLY `PRD CONTRACT VIOLATION` in the entire manifest (grep count = 1) and it explicitly admits the frontend is violating a written PRD contract. Passes checks (a) accurate description and (b) specific endpoint `POST /api/trial/charge`, but fails check (d) fake-patch pattern: the annotation has documented the violation without a scheduled fix, owner, ticket ID, or deadline. Per rule 9 ('修补必回归验证 "加注释=修了" 是陷阱') and rule 13 ('P1 本轮修完不「提示下次」, 累积变 P0'), an annotation that says 'this is a violation, someday we'll fix' is exactly the trap.
- 场景:Anyone auditing 9.11a compliance sees the ⚠️ marker, feels reassured it's known, moves on. Meanwhile client Math.random() drives chargeFailRate in a legally-sensitive auto-charge path (per §9.11a, trial price/charge fail rate is server-owned + legally-required disclosure). Real users see a made-up fail rate; auditors have no way to verify it against the disclosure copy. Fix: either (i) attach owner + resolution ticket + target sprint to the annotation, (ii) escalate to a real P0 finding in nexion-audit, or (iii) delete `chargeFailRate` from client config today and gate the mockChargeAttempt behind NODE_ENV !== 'production' so the field can't leak.

## A3 KILLED(对抗证伪,记录不修)(2)

### [P1] src/store/free-trial.ts:122
**migrateRow extended→grace loses shadowFrozenAtUSD when legacy row lacks the field — legacy grace users get $0 offset**

- 依据:Line 92-97 maps legacy `status='extended'` → new `status='grace'` and merges graceEndsAt/extendedEndsAt. Line 122-123 sets `shadowFrozenAtUSD: row.shadowFrozenAtUSD ?? 0`, `shadowFrozenAtNEX: row.shadowFrozenAtNEX ?? 0`. LegacyTrialRow interface at 70-75 makes these fields OPTIONAL (`Partial<FreeTrialState>` superset). If card-era rows persisted before shadow-tracking existed, or under a different key, the field is undefined and migration silently zeroes it. Since reaching 'extended' in the old machine implied the full trial had already elapsed, the new-machine invariant is `shadowFrozenAtUSD = shadowDailyUSD × trialDays` at that point — currently violated.
- 场景:Legacy user was in card-era 'extended' state (they completed the 3-day trial and entered grace). Migration runs at app boot: reads row, sees status='extended' + no `shadowFrozenAtUSD`. Sets new state {status:'grace', shadowFrozenAtUSD:0, shadowFrozenAtNEX:0}. User navigates to checkout during grace, `computeTrialOffset(cfg, 0)` returns {offsetUSD:0, remainderUSD:0}. User is silently denied the $21 offset they earned. This is direct value loss to legacy users, and it's asymmetric — new-machine users get proper freeze, legacy users get robbed. Fix: in the extended→grace branch, back-compute the shadow when the legacy field is missing: `shadowFrozenAtUSD ??= cfg.shadowDailyUSD * cfg.trialDays` (same for NEX). Requires reading useTrialConfig inside migrateRow — call site is at hydrate() during store setup, Pinia context is available.

### [P1] scripts/verify.sh:639
**SPEC-7 param parity 只对 Nexion-admin-prototype 核对,不覆盖当前授权 admin 实现面 admin-ops**

- 依据:verify.sh:40 `ADMIN_ROOT="$PROJECT_DIR/../Nexion-admin-prototype"` + 639 `ADMIN_CFG="$ADMIN_ROOT/lib/mock/admin/compute-config.ts"` + 644-681 循环对 16 键(riskCluster 11 + otpGate 数值 5)只对 Nexion-admin-prototype/lib/mock/admin/compute-config.ts 做键存在 + 值 parity 检查。但 MEMORY(project_batch12_reqs_20260731 + 2026-07-31 决议)明写「后台实现面=admin-ops(:3012)两仓 parity 核对」,而实测 admin-ops 侧 lib/admin/k-client.ts:582-588 用 K1_REQUIRED_PARAM_KEYS 常量 + validateK1ParamValue 校验值域,没有 defaultVal 字面量供本哨兵抓取;admin-ops/lib/mock/admin/ 目录里也不存在 compute-config.ts。同批 WD02 哨兵(703-738)已改锚到 ../admin-ops/tests/wd02-network-confirm-fee-contract.test.mjs 上,证明维护者知道 admin-ops 是权威,但 SPEC-7 循环没跟进升级 —— 现在的行为是 Nexion-admin-prototype 一改就红、admin-ops 独自漂移全绿。
- 场景:运营在 admin-ops 后台改 K1 参数值 → admin-ops runtime patch endpoint 落库 → uniapp 侧仍执行 seed 值 → verify.sh 每次仍绿(它比对的是 Nexion-admin-prototype 里的静态 defaultVal 数字,与 admin-ops 无关)
- 失败场景:后台在 admin-ops 独立发版把 maxAccountsPerDevice 权威值从 2 改到 5(合规压力放宽),Nexion-admin-prototype 未跟进 —— verify.sh 全绿放行;uniapp 客户端仍按 2 判定注册,而真实运营(admin-ops :3012)按 5 放行,双端风控口径分裂。同族攻击面:任何 SPEC-7 键(freePhoneSlotsPerCluster / duplicateAccountFreezeFrom / clusterFreezeSuggestThreshold / otpGate.resendSeconds 等 16 键)在 admin-ops 单边改都发生同样静默漂移。这就是 cross_repo_value_parity 教训里「键在但值抄错」的复发形态,只是漂移面换成了另一个 admin 仓。

## A4 P2(23)

### [P2] src/store/nex-faucet.ts:287
**isWithdrawalFeeSnapshotValid 未镜像引擎的 rate≤0 守卫 —— 未来若某 phase 把 offsetRate 调为 0,用户可被诱导白烧 NEX**

- 依据:computeWithdrawFee line 265 明确用 `offsetWithNex && rate > 0` 守卫 nexBurned=0 (line 262-263 注释就是为了防 ceil(fee/0)=Infinity 烧光 NEX)。但 isWithdrawalFeeSnapshotValid 只查等式:rate=0 时 nexBurned×0=0,等式 `actualFeeUsd = max(0, networkConfirmUsd − 0)` = networkConfirmUsd,任意 nexBurned 都能通过。当前 product-phase.ts 51/62/73/84/95/106 全档 rate=0.4 不可达,但『可配置指针派生 live』纪律要求消费点守卫必须与生产点对齐,否则某天促销/夜间档把 rate 短暂置 0,handleSubmit 里 debitNex(toBurn) 立刻真扣 NEX(wallet-withdraw.vue:864),用户零抵扣损失 N NEX。
- 场景:1) 运营配置(未来 admin K/L 域)把某档 nexFeeOffsetRate 临时置 0。2) UI 侧引擎 (line 265) 正确返 nexBurned=0,页面显示看似正常。3) 攻击者/被钓鱼用户改本地 quoted.nexBurned=5、actualFeeUsd=1,networkConfirmUsd=1 提交。4) app.ts:1029 用同刻 resolveActivePhase 拿到 rate=0,快照校验:parts ≥0 ✓,offsetWithNex=true 时 nexBurned 无守卫,|1 − max(0, 1 − 5×0)|=|1−1|=0 ≤ 0.0001 ✓ → 放行。5) wallet-withdraw.vue:864 app.debitNex(5) 真烧 5 NEX。修法:在等式前加 `if (nexFeeOffsetRate <= 0 && fee.nexBurned !== 0) return false;`,与引擎守卫对齐。selfcheck 加固定靶。

### [P2] src/pages/me/wallet-withdraw.vue:898
**feeSnapshotStale 三分归因分支是死代码——用冻结的 rateSnapshot 校验用同一 rateSnapshot 算出的 quoted,恒 true**

- 依据:line 898-902:const feeSnapshotStale = !isWithdrawalFeeSnapshotValid({networkConfirmUsd, nexBurned, actualFeeUsd}, offsetSnapshot, rateSnapshot)。quoted 由 feeCalc 计算,feeCalc 内部通过 nexFeeOffsetRate.value 使用 rateSnapshot 作为费率(line 494-501 / 261-267)。isWithdrawalFeeSnapshotValid 的核心等式 |actualFee - max(0, networkConfirmUsd - nexBurned*rate)| ≤ 0.0001,rate 传的是同一 rateSnapshot,代入 quoted 的定义 actualFee = max(0, fee - nexBurned*rateSnapshot),两侧完全相等 → 恒 pass → feeSnapshotStale 恒 false。offsetSnapshot=false 时 computeWithdrawFee(line 265)保证 nexBurned=0,这一子分支也恒 pass。intent(注释 892-894)是「store 因费率过期/拼装错拒单时说『费率已更新』」,实际这条 toast 永远不会出。当前所有 phase 的 nexFeeOffsetRate 都是 0.4(product-phase.ts:51/62/73/84/95/106),store 侧 line 1029 isWithdrawalFeeSnapshotValid 也不会真拒单——所以现在没实际伤害。但若未来任一 phase 改成非 0.4(比如运营对新 phase 上调抵扣率),用户在 phase 边界或 pin 切换过程中提交,store 用 offsetRateNow 拒单,页面归因走死分支不能命中,显示「余额不足」而非「费率已更新」,把可重试的场景说成不可重试。
- 场景:1) 前置条件(未来):某 phase 的 nexFeeOffsetRate 被改成 ≠0.4;2) 用户在 phase 边界前提交(rateSnapshot=0.4);3) store 内 resolveActivePhase 已切换到新 phase(offsetRateNow=0.5),line 1029 因等式不成立拒单 → 返回 null;4) 页面 line 898 feeSnapshotStale 用 rateSnapshot(0.4)复验 quoted(用 0.4 算),恒 pass → toast 显示 withdrawInsufficient(误)或 dailyLimitReachedText(若配额恰好也满)。用户以为余额不够,实际重试即可

### [P2] src/pages/me/wallet-withdraw.vue:861
**报价快照仅在 eligibility await 之后冻结,pre-freeze 窗口内 feeCalc 保持 live,提交值可能≠点击时用户所见值**

- 依据:line 810 submitting.value=true 启动 spinner;line 820-827 await requestWithdrawalEligibility(固定 600ms setTimeout,withdrawal-eligibility.ts:161);line 853 才 const quoted = feeCalc.value 冻结;line 861 才 submittingQuote.value=quoted 冻结显示。这 ~600ms 窗口内,activeFee = submittingQuote ?? feeCalc 仍取 feeCalc(live)。feeCalc 依赖 nexBalance,nexBalance = submittingNexBalance ?? app.user.nexBalance,pre-freeze 时 submittingNexBalance=null,所以随 app.user.nexBalance 变化。amountNum(输入禁用+useMax/useSmallAmountLine/undoSmallAmountLine 三处 submitting 守卫)、offsetWithNex(toggleOffset 守卫)、rate(user.joinedAt 静态)、networkConfirmFee(cfg 静态)都稳定,唯 app.user.nexBalance 可被跨 tab storage 事件或后台奖励 tick 改变。line 861 的 quoted 用 post-await 状态,若 app.user.nexBalance 在 600ms 内减少(另一 tab 消费 NEX),nexBurned=min(userNex, requiredNex) 中 userNex 减少 → nexBurned 减少 → actualFee 增大,用户支付的 USDT 费用高于点击时看到的费用。line 811-817 的 amountSnapshot 注释解释了 amount 为何要在 810 前冻结
- 场景:1) 用户在 tab A 打开提现页,输 $100,开启 NEX offset,当前 nexBalance=10 NEX,requiredNex=13,页面显示「烧 10 NEX,付 $1 手续费」;2) 用户在 tab A 点击 submit,submitting=true,spinner 转;3) 用户或后台流程在 tab B 消费 5 NEX(比如兑换、赠礼、Nova 奖励撤销),storage 事件同步到 tab A → app.user.nexBalance=5;4) 600ms 后,line 853 feeCalc 用 nexBalance=5 计算:nexBurned=5,actualFee=$5-5*0.4=$3;5) line 861 冻结这个 quote,line 864 debitNex(5),line 874 submitWithdrawal 以 $3 fee 建单;6) 用户看到最终 spinner 结束跳转,以为付了 $1,实际 bills 记 -$100 提现 + memo 显示 fee=$3.00,与点击时所见 $1 不符。仅在 600ms 内 nexBalance 减少时触发,罕见但真实

### [P2] src/store/app.ts:851
**refundFailedWithdrawals 无条件把退款全额注入 withdrawable 桶,把本金洗成可提余额**

- 依据:退款调用 `creditRewardBucketOnce("refund:" + wd.id, "withdrawable", wd.amount)`,route="withdrawable" 分支(app.ts:964-967)会同时把 wd.amount 加到 usdtBalance 和 earningBuckets.withdrawableUsdt。但 submitWithdrawal 的 applyDebit(app.ts:1127-1140)先耗可提再耗本金:withdrawable 会被 clamp 到 max(0, withdrawable-amount);超出 withdrawable 的差额 = 从本金扣的。退款时不区分原来到底扣了多少 withdrawable / 本金,一律全额充到 withdrawable,导致 withdrawable 净膨胀 = min(amount, 本金消耗量)。虽然 2026-07-31 规则变更后提现门改用 usdtBalance 不再看 withdrawable(app.ts:1033-1037 comment),withdrawable 仍然是 withdrawal-eligibility-core.ts:469 canSubmit 判据(withdrawableUsdt >= minWithdrawableUsdt),并且是 use-product-phase 等业务判据的输入 — 桶间转移仍然影响 UI 语义与快车道判定。
- 场景:正常业务路径,无需恶意:任何 review-rejected/address-invalid/tx-failed 单据的退款都会触发。用户可主动构造:小额充值本金 + 反复提交必然失败的地址 → 每次失败都能把本金转成 withdrawable。
- 失败场景:用户 usdtBalance=100 = 70 本金 + 30 withdrawable。提现 amount=80: applyDebit 后 usdt=20, withdrawable=min(max(0, 30-80), 20)=0。单据 review-rejected → refund 加 +80 到 withdrawable 且 +80 到 usdt: usdt=100(正确恢复),withdrawable=80(应该只是 30)。相当于把 50 本金洗成 withdrawable。canSubmit 的 min 门槛检查从此以膨胀值放行;若后续再产生 refund 循环叠加,withdrawable 有可能突破 usdtBalance(靠 account-cloud.ts:393 的 clamp 兜底)。

### [P2] src/store/nex-faucet.ts:288
**isWithdrawalFeeSnapshotValid 不给 nexBurned 上界,客户端可任意夸大 nexBurned 只要 actualFeeUsd=0**

- 依据:复验只做等式 `|actualFeeUsd − max(0, networkConfirmUsd − nexBurned×offsetRate)| ≤ 0.0001` 与非负 + 意图守恒。但不校验 `nexBurned <= ceil(networkConfirmUsd / offsetRate)`(实际所需上限)。因为 `max(0, 负数) = 0`,当 nexBurned×offsetRate > networkConfirmUsd 时 actualFeeUsd 恒为 0,等式两边同为 0 → 无论 nexBurned 传多离谱都通过。真后端会独立以 `computeWithdrawFee`(nex-faucet.ts:251-270)权威重算,`nexBurned = min(userNex, requiredNex)` 天然设了上界,mock 侧只用等式复验就漏了这道闸。虽然 wallet-withdraw.vue 通过 feeCalc.value 传入的 quoted.nexBurned 是 clamp 过的(nex-faucet.ts:265),Store 层不再独立验证 = 直接调 submitWithdrawal(dev bridge / e2e harness / 未来入口)可以旁路。
- 场景:① dev bridge / Playwright 脚本 / 第三方接入直接 submitWithdrawal;② 页面代码被改写去掉 debitNex 那一步;③ 未来新增第二个入口页面复用 submitWithdrawal 但忘了 debitNex。核心是「等式复验」不等于「服务端权威重算」,而 comment 号称「mock 同构 server 边界」。
- 失败场景:直接调用 `app.submitWithdrawal(80, 'trc20', addr, {networkConfirmUsd: 2, nexBurned: 1e15, actualFeeUsd: 0}, true, ...)`:Math.max(0, 2 − 1e15 * 0.40) = 0,|0 − 0| ≤ 0.0001 → 通过。单据落盘 wd.fee.nexBurned=1e15。虽然 store 不 debit NEX(那是页面职责),但 wd.fee 会被追踪页、账单页、审计流读取,polluted 数据向下游扩散;若未来有基于 fee.nexBurned 的返利/等级/统计逻辑,直接被欺诈值污染。

### [P2] src/store/app.ts:1086
**提现单 ID 只有 9000 种取值,同日碰撞导致 refund 被幂等键吞掉,用户丢第二笔失败提现的钱**

- 依据:`const seq = Math.floor(1000 + Math.random() * 9000); const id = 'WD-' + yyyymmdd + '-' + seq;` — 单个平台日单账户只有 9000 种 ID。生日悖论:100 笔/日碰撞概率 43%,50 笔/日 12.9%。ID 直接被用作:① wd 的主键(withdrawals 列表按 id 去重合并 account-cloud.ts:330-347);② appliedRewardKeys[id] 幂等键(app.ts:1138);③ refund 幂等键 `'refund:' + wd.id`(app.ts:851)。carrier 是 mergeWithdrawals 只保留 rank 更高的一份 → 碰撞时先建的可能被覆盖,而 refund 一旦对同一 id 生效过就永远不再退第二次。
- 场景:高频提现用户自然触发。恶意用户可以主动:提交足够多的失败提现(小额、故意错地址、共用地址触发风控)直到出现碰撞 → 用碰撞条把自己已经失败的其它单据「捎带退款」不了。虽然攻击者本身赚不到钱,但可让运营侧应付一大堆「明明单据显示 rejected 为什么没退款」的客诉。
- 失败场景:同一日两笔提现 A/B 意外撞到同一 id X(概率 ~1/9000)。A amount=$50 status=review-rejected,B amount=$30 status=review-rejected。refundFailedWithdrawals 遍历:第一次 wd=A → creditRewardBucketOnce('refund:X', ..., 50) 成功,appliedRewardKeys['refund:X']=true,退回 $50。第二次 wd=B → creditRewardBucketOnce('refund:X', ..., 30) 见幂等键已存在,直接 return true 但**不做任何 credit**,B 的 $30 永远丢失。用户被扣了 $80,只拿回 $50。同时 mergeWithdrawals 按 status rank 去重后,列表里可能只保留一条(rank 相同则后写的胜出),用户在 UI 上根本看不到丢失的那一单。

### [P2] src/store/trial-config.ts:93
**computeDiscountedPrice / computeTrialOffset lack clamp guards — admin misconfig can produce negative order totals or negative offsets**

- 依据:computeDiscountedPrice (93-101): `discount = Math.min(subtotal * discountRate, discountCapUSD)`. If admin sets `discountRate > 1.0` OR `discountCapUSD > subtotal`, discount exceeds subtotal → `total = subtotal - discount < 0`. computeTrialOffset (109-117): `offsetUSD = Math.min(earnings, trialOffsetCapUSD)`. If admin sets `trialOffsetCapUSD < 0`, offsetUSD is negative. TrialConfig interface (10-36) has no min/max annotations; useTrialConfig.update() at line 80-83 accepts any Partial<TrialConfig>. No admin-side validation observed for these bounds.
- 场景:Admin fat-fingers discountRate=1.5 (meant 0.15) or discountCapUSD=2000 (meant 20). computeDiscountedPrice returns discount=973.5 on subtotal=649, total=-324.5. checkout.vue:675 does `Math.max(0, ...)` on net which clamps to 0 — so device is free but the promoDiscount row shows negative math. Worse: if trialOffsetCapUSD becomes negative, trialSplit.offsetUSD is negative → line 675 `p.price - discount - tradeInCredit - promo - trialSplit.offsetUSD` subtracts a negative = adds — user pays MORE than sticker (bug that hits users, not platform). Fix: clamp inside the two compute functions: `discount = Math.max(0, Math.min(discount, subtotal))`; `offsetUSD = Math.max(0, Math.min(earnings, Math.max(0, config.trialOffsetCapUSD)))`. Defensive layer even if admin UI validates.

### [P2] src/store/free-trial.ts:226
**cancel() silently no-ops in grace state — user has no explicit exit from grace**

- 依据:Line 226: `if (status.value !== 'active') return;`. Spec comment on 223-224 says 'grace has nothing left to cancel (production already stopped)'. Combined with the eligibility rule that returns 'in-progress' for grace (line 179), users in grace cannot: (a) end grace early, (b) claim a new trial, (c) restart. Only exits are convert (with money) or wait for graceEndsAt (which as of finding #1 might not fire timely).
- 场景:Not a security exploit — UX friction and possible support burden. User claims trial, decides on day 4 (already in grace) they don't want the device. They tap 'cancel trial' in UI (assuming cancel() is wired to a button). Nothing happens (silent no-op). UI likely still shows in-progress badge. Confusion follows. Note: this MAY be intentional per spec ④ (I flagged for double-check). If intentional, cancel() should at minimum log/toast a reason instead of returning silently, or the UI should hide the cancel affordance in grace state. Verify against spec 异常2/异常3 wording before changing behavior — this is design intent, not a code bug I can decide unilaterally.

### [P2] src/pages/store/checkout.vue:481
**Trial + trade-in quad-stacking possible via pre-existing appliedTradein (spec-forbidden combination)**

- 依据:Line 478 comment declares the design invariant: `promo + credit + trade-in + voucher quad-stacking is undefined by spec`. The only enforcement is line 481 `if (trialConversionMode.value) return;` inside `fireTradeinIntercept` — this only blocks a NEW intercept sheet from opening in trial mode. It does NOT clear or filter a pre-existing `tradein.appliedTradein`. `appliedTradeinView` (line 396-409) has no trial-mode filter: it accepts any applied trade-in whose `targetKind === p.id`. In trial mode `p.id === trialCfg.value.trialProductId`, so an applied trade-in targeting the trial SKU is honored. On line 435-446 `netPrice` subtracts ALL four terms `voucherDiscount + tradeinCredit + promoDiscount + trialOffsetView.offsetUSD` unconditionally. On line 691-694 the confirmed block deletes the old device (`app.devices = app.devices.filter(...)`) even in trial mode. The pay-time trade-in guard on
- 场景:Two realistic paths: (1) Race path — user applied trade-in for SKU S (e.g., via the store-grid intercept) BEFORE trial was granted; ops later runs a trial promotion that reuses SKU S as `trialProductId` (or a personalized trial grant lands). User revisits checkout via any entry → trialConversionMode=true, appliedTradeinView non-null → all four discounts stack; user pays near-$0 (clamped max(0,...)) while burning: a stackable voucher (markUsed), an old device (deleted), the trial (freeTrial.convert), the promo. (2) Multi-tab path — user opens SKU S product page in tab A (trial inactive), fires intercept, applies trade-in. In tab B they redeem the trial. In tab A they proceed to checkout — same result. Net loss vs spec: trade-in credit amount (potentially the full retirable device value). The intercept-guard-only design cannot detect a state that was set outside its window.

### [P2] src/pages/store/checkout.vue:519
**No pay-time slot-cap re-verification → capped user's paid order can stall in `provisioning` indefinitely**

- 依据:Line 519-527 declare `capped` (displayed as a warning banner on select-payment via `<view v-if="capped">` line 110). But the confirmed block (lines 618-758) has NO capped re-check. The only pay-time gates are trade-in invalidation, phase, purchaseGate, trial-mode flip, and debit-success. `purchaseGate` (from `usePurchaseGate`) is level/quota/soldOut — NOT slot capacity. When `activeSlotCount + reservedSlots >= MAX_DEVICES` the checkout still proceeds: line 681 debits, line 696 createOrder, line 762 auto-advance to activating. Provisioning routes through `orders.ts` `advanceOrder` (line 189-201): `activateDevice(spawnedDeviceId, reservedSlots)` returns false when slot full → `activationBlocked=true` → `targetStatus = cur.status` (line 202). The order gets stuck in `paid`/`provisioning` with timeline note `Waiting for an empty device slot`. Money is debited; no device is delivered; no bail
- 场景:User has (MAX_DEVICES − 1) active devices + 1 trial reserved slot (`reservedSlots=1`, `cappedRaw=true`). They visit a NON-trial SKU checkout (trialConversionMode=false so `capped=cappedRaw=true`). They see the `slotsFullText` warning but tap Continue → Confirm → Pay anyway. Debit succeeds (unrelated wallet). advanceOrder loop tries activate → blocked. Order stalls. User's funds moved, no device provisioned. Recovery requires user to notice, then retire something (which itself has flow gates). Not direct theft — the device eventually provisions when a slot frees — but purchase went through an explicit gate warning that had no teeth.

### [P2] src/pages/store/checkout.vue:681
**Non-atomic side-effect chain: partial state on any mid-block throw between debitBalance and bills.add(purchase)**

- 依据:Lines 681-758 form a linear side-effect chain executed synchronously with NO try/catch and NO compensating rollback: debitBalance (681) → app.devices.filter + persistAccountSnapshot + tradein.clearApplied (692-694) → orders.createOrder (696) → orderId.value = ord.id (705) → freeTrial.convert (710) → app.creditBalance + bills.add(bonus USDT) (713-721) → app.creditNex + bills.add(bonus NEX) (724-732) → toast (737) → voucher.markUsed (740) → bills.add(purchase) (748-757). If ANY intermediate step throws (`creditNex` NaN guard flip, storage quota, sync validation), the failure leaves an inconsistent snapshot: funds debited, old device deleted, trial converted, but no purchase bill, or voucher consumed without matching bill, etc. There is no `orderId.value` guard against re-entry on the next `watch` fire if the block threw mid-way — but on real re-entry, `orderId.value` is already set (line 7
- 场景:Any transient throw within the chain (e.g., account-cloud storage full during `persistAccountSnapshot`, or a devtools-injected voucher.markUsed override) leaves the user with money gone AND (depending on where it threw) either no order, no purchase bill, or no voucher-usage record. Because the confirmed block is idempotent-only via `if (!orderId.value)`, and orderId is set BEFORE the credits/bills/markUsed calls, throw at line 710+ pins orderId.value permanently. A subsequent `select-payment` retry would find `orderId.value` non-null and skip the entire block (line 622 guard), so the user cannot recover in-app — they have to contact support. No mock-mode disclaimer; the same pattern goes to production per the file comment `// PRODUCTION: server side POST /api/orders authorize+capture atomically` (line 677-678) — but the CLIENT here still handles cross-store mutation optimistically.

### [P2] src/pages/register/register.vue:571
**completeActivatedRegistration 失败双回滚顺序错乱 — auth 已注销但 app.accountKey 被回绑到 previousAccountKey**

- 依据:line 569-576 completeActivatedRegistration: if (!restoreActivatedRegistrationSession(accountId)) { restorePreviousAccountScope?.(); ... }  路径: - register.vue:502-506 捕获 previousAccountKey = app.accountKey || 'default';restorePreviousAccountScope 仅做 app.bindAccount + rebindStores。 - 进入 completeActivatedRegistration 时 restoreActivatedRegistrationSession(complete-registration.ts:14-36)如走 abortRestore(session.signOutSession + auth.signOut + app.bindAccount('default') + rebindStores('default')),再回到 completeActivatedRegistration 又调 restorePreviousAccountScope?.()  → app.bindAccount(previousAccountKey) + rebindStores(previousAccountKey)。 - 若 previousAccountKey ≠ 'default'(注册页从已登录状态进入),最终态:auth.isAuthenticated=false + session 已 signOut,而 app.accountKey=previousAccountKey → 冒名顶替风险 + 幂等键悬空(下一次读 useAuth().accountId ≠ app.accountKey)。  触发概率低但违反 whyRisky 明列的「必须回滚 accountKey 与 rebindAccountScopedStore
- 场景:1) 用户 A 已登录(app.accountKey=A);从个人中心跳转到注册页 2) 用手机 B 走完注册 → finalizeVerifiedRegistration 成功(账号 B 已 active) 3) restoreActivatedRegistrationSession 内 session.claim 或 readAccountSessionRecords 检查失败(localStorage 竞争/quota) → abortRestore → app=default + auth signOut 4) completeActivatedRegistration 补跑 restorePreviousAccountScope → app.bindAccount('A') + rebindStores('A'),但 auth 已 signOut 5) 此时 app 显示是 A 账号的资产/滚动位置,但没有登录态;用户在 UI 层看到「熟悉的 A 账号数据」误以为仍登录,后续任何写操作会写入 A 账号的 scope 却没有 auth 校验

### [P2] src/pages/register/register.vue:552
**register.vue finish() try/catch 裸捕 — 丢失异常上下文,永远只报「服务不可用」**

- 依据:line 552-557: `} catch { restorePreviousAccountScope(); completing.value = false; error.value = t.value.authOtp.errorServiceUnavailable; return; }`  try 块内区分了 7 类不同 throw:'risk_registration_unavailable'、'sponsor_bind_unavailable'、'gift_claim_unavailable'、'gift_credit_unavailable'、'gift_bill_unavailable'。裸 catch 不接 error 变量,全部收敛为同一 toast「服务不可用」→ 用户/QA 无法从 UI 判断是风控层失败、sponsor 层失败、余额层失败还是 bills 层失败;测试/沙盒调试要看 devtools 才能定位。  修法:`} catch (err) { console.warn('[register:finish] side-effect failed', err); ... }` 或按 err.message 分派不同 i18n key(至少区分「风控评估失败」/「奖励入账失败」两大类)。
- 场景:1) 用户走完三步 finish() → 到 try 块内某一步失败(如 sponsorship.bind 因 localStorage 满而返 false) 2) throw 'sponsor_bind_unavailable' → 裸 catch 吞掉 err,只显示「服务不可用,请稍后重试」 3) 用户不知道是「邀请码问题」还是「网络问题」还是「奖励发放问题」,盲目重试;若失败原因是 sponsor 层(比如 quota 满永远失败),用户会陷入死循环重试 4) QA/客服拿到「服务不可用」截图无法定位是哪层的锅,只能问用户「有没有邀请码/网络怎样」再复现

### [P2] scripts/verify.sh:461
**AUTH03 seed pin 只剥行注释不剥块注释,与兄弟哨兵剥法不一致 —— 块注释里的旧字面量可替代真 seed 假绿**

- 依据:verify.sh:461 `sed 's|//.*||' src/mock/platform-config.ts | grep -qE 'captchaAlwaysScenes: \["register"\]'` 只剥 // 行注释,不剥 /* */ 块注释。对比 selfcheck-feegate.mjs:33-36 明确同时剥 HTML、JS 块、JS 行三种注释:`.replace(/<!--[\s\S]*?-->/g,"").replace(/\/\*[\s\S]*?\*\//g,"").replace(/^[ \t]*\/\/.*$/gm,"")`。verify.sh:471 auth03_body 提取也只剥 //。现在 platform-config.ts 没有 /* */ 块注释因此没有现存攻击面,但同族哨兵采用不同剥注释规则本身就是易踩点(2026-07 red-test 教训 sentinel_green_without_checking 同族):日后开发者写 JSDoc `/** 保留旧默认:captchaAlwaysScenes: ["register"] */` 又把真 seed 改成 [] 时,pin 会读到 JSDoc 里的旧字面量而假绿。
- 场景:改 platform-config.ts 时在真 seed 前后加 /* 原为 ["register"] */ 块注释 → 改 seed 值 → verify.sh 因 sed 只剥 // 而读到块注释里的旧字面量假绿
- 失败场景:维护者把 captchaAlwaysScenes seed 改成 [] 并加块注释解释:`/* 原为 ["register"] */ captchaAlwaysScenes: []`。sed 's|//.*||' 不动块注释 → grep 命中块注释里的旧字面量 → 哨兵 PASS,而真值已改成空数组,AUTH03 场景强制滑块规则消失。运行时受 auth-register-existing-runtime.mjs:456-458 gateProbe 保护,但仅限 register 场景,若日后新增其他场景(如 reset)以同种方式漂移则无运行时护盾。

### [P2] scripts/selfcheck-feegate.mjs:61
**NEX 抵扣面板哨兵用 includes 子串匹配 feeConfigUsable,前缀改名类哨兵不敏感**

- 依据:selfcheck-feegate.mjs:59-62 判据 `const m = code.match(/<view v-if="([^"]*)"[^>]*:style="nexGateStyle">/); return !!m && m[1].includes("feeConfigUsable") && m[1].includes("amountNum > 0")`。用 String.includes 判断子串存在。若模板里出现 `feeConfigUsable_alt` / `feeConfigUsableXyz` 等前缀相同的标识符,哨兵子串匹配同样 PASS 但真门可能已被替换。同族问题:selfcheck-feegate.mjs:71-76 minWithdrawNoteOffset 判据同法(m[1].includes 子串)也有此弱点。tsc 抓不住:如果新标识符是有效声明(例如 `const feeConfigUsable_alt = ref(true)`),vue-tsc 检查通过,哨兵通过,但门失效。
- 场景:增设一个 name 以 feeConfigUsable 开头的辅助 computed → 把 v-if 拆成 `辅助 || (原门)` → selfcheck 全绿,tsc 全绿
- 失败场景:开发者临时调试写 `const feeConfigUsable_bypassed = true;` 并把模板改成 `<view v-if="feeConfigUsable_bypassed || (feeConfigUsable && amountNum > 0)" :style="nexGateStyle">`。子串 feeConfigUsable 和 amountNum > 0 都在 v-if 里,哨兵 PASS。但配置不可用时 feeConfigUsable_bypassed=true 让整个 v-if 为 true,NEX 面板照渲染 NaN。既有实景 browser 走查兜底 —— 但 tsc + selfcheck 都放行意味着 CI/red-test 层不会自动抓,依赖人肉走查。

### [P2] scripts/verify.sh:674
**值 parity 循环 defaultVal 提取正则遇多元素数组静默截断,未来加数组类键会假绿**

- 依据:verify.sh:672-679 `uni_v=$(grep -oE "\b$k: [^,]+" ...)` + `adm_v=$(grep -A6 "key: \"$k\"," "$ADMIN_CFG" | grep -m1 -oE "defaultVal: [^,]+" ...)`。[^,]+ 遇多元素数组(如 ["login","register"])在首个逗号处截断,提取到 `["login"` 而非完整数组。verify.sh:662-666 注释显式承认此弱点并把 captchaAlwaysScenes 排除在循环外:「数组键须按括号配对整段提取,不能沿用现式」;line 699-701 的 WARN(捕获 captchaAlwaysScenes 未登记 admin)是提醒,不是机器门,不会阻断合并。若后续 admin 支持数组参数后包 A handoff 落实,维护者按提示扩循环时若忘了同步重写正则,两侧 `["login", "register"]` vs `["register", "login"]` 会同被截取为 `["login"` / `["register"` 并按字面比对,漏检不同的第二元素或整体形状差异。
- 场景:扩循环时忽略注释提示 → 继续沿用 [^,]+ 提取 → 多元素数组两侧首元素相同但尾巴差异 → 假绿
- 失败场景:包 A 落地后把 captchaAlwaysScenes 加入循环但没按注释重写正则:uniapp seed 是 ["register","login"] admin defaultVal 是 ["register"] —— uni_v 截取到 `["register"` adm_v 截取到 `["register"` —— 两者字面相等,parity PASS。但真实数组元素数量不同,server 与 client 场景强制策略不一致,登录场景会漏挂滑块。

### [P2] scripts/verify.sh:552
**gate_sites 严格计数(必须恰好 2)锁死实现风格,合法重构会导致哨兵假红**

- 依据:verify.sh:552-557 `gate_sites=$(grep -c 'readAccountSnapshot(acct)?\.user?\.usdtBalance' src/store/app.ts)` + `if [ "${gate_sites:-0}" -eq 2 ]`。用字面表达式的出现次数当作门数,期望恰好 2。若维护者把这个表达式抽成一个 helper `const readBal = () => readAccountSnapshot(acct)?.user?.usdtBalance;` 并在两处调 `readBal()`,原字面表达式出现次数从 2 降到 1(仅定义处),哨兵 FAIL。这个抽助手是合法且更 DRY 的重构。反之,若有人写 `const b1 = readAccountSnapshot(acct)?.user?.usdtBalance; const b2 = readAccountSnapshot(acct)?.user?.usdtBalance;` 复制两次却都不用,字面次数 = 2,哨兵 PASS(哨兵盯上死代码),这正是行 549-551 注释里承认踩过的坑。哨兵改成数「门的道数」但用的是死板字面计数而非语义计数,坑没根治只是换了形态。
- 场景:合法重构:抽 helper 消除重复 → 字面表达式次数从 2 降至 1 → 哨兵 FAIL / 或反过来:引入死代码保留字面 → 哨兵 PASS 但真门缺失
- 失败场景:开发者做 DRY 抽公用函数 → 字面计数从 2 降到 1 → verify.sh 红 → CI 阻断 → 无奈回滚成 DRY 之前的重复代码。反向:开发者在别处新增一个用途相同的 helper `getPersistedBalance` 并替换调用,字面表达式还剩 2 处,但那 2 处都是死代码,真守护点已不见,哨兵仍绿。判据挂在字面而非门函数身上就是这个问题(与 memory feedback_gates_blind_to_deletion 同族)。

### [P2] scripts/verify.sh:473
**AUTH03 body 判据只检查字符串存在,不校验判定在活跃执行路径 —— 死分支或惰性引用可绕过**

- 依据:verify.sh:471-476 提取 otpSend 函数体后 grep `captchaAlwaysScenes\.includes(scene)`。判据只验字符串在函数体内出现一次,不验它是否位于活跃控制流。可绕过形态:`if (false) { void cfg.captchaAlwaysScenes.includes(scene); }` 或 `const _dead = cfg.captchaAlwaysScenes.includes(scene); const captchaRequired = false;` 或 `void cfg.captchaAlwaysScenes.includes(scene); /* satisfy sentinel */ const captchaRequired = sends.length >= cfg.captchaAfterSends;` —— 哨兵均 PASS 但闸门实际失效。运行时保护由 auth-register-existing-runtime.mjs:456-458 gateProbe(bare send 期待 captcha_required)提供,但仅针对 register 场景;若日后 captchaAlwaysScenes 增加其他场景(reset / login),将无对应运行时探针,只靠字符串静态检查兜底。
- 场景:在 otpSend 里保留 captchaAlwaysScenes.includes(scene) 字面调用但把结果丢弃,真正的 captchaRequired 走别的表达式
- 失败场景:维护者 debug 时写 `const captchaRequired = /* void cfg.captchaAlwaysScenes.includes(scene); */ sends.length >= cfg.captchaAfterSends;` —— 若未剥块注释 grep 会命中被注释掉的 includes 调用(且 auth03_body 也只剥 //);更彻底:直接把判定接到常量 false 上仍保留 `void includes(scene)` 存活 —— 哨兵绿、tsc 绿、register 场景运行时被 auth02 runtime 探针抓住,但若同种漂移发生在未来新增场景则无运行时探针可抓。

### [P2] app/components/domain-views/d-tabs/d5-params.tsx:30
**D5 asNumber("") returns 0 (finite), lets cleared network-fee input submit as $0/$0/$0 fee waiver**

- 依据:Line 30-33: `function asNumber(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : Number.NaN; }` — `Number("")` is 0 (finite), so an empty string becomes 0. Line 73-75: `confirmFeeValid(v) = Number.isFinite(v) && v >= 0 && v <= 25` — accepts 0. Line 168-171: `feeUnchanged` compares numeric equality to current fee (default 1/1/5), so clearing all three fields yields `feeUnchanged=false`. Line 260 提交 button is enabled whenever `feeValid && !feeUnchanged`. Warning at line 255 fires but is only a colored note, not a blocker.
- 场景:Operator opens D5, sees TRC20=$1/BEP20=$1/ERC20=$5. Wants to abandon changes (perhaps to double-check with peer). Triple-clicks + Backspace to clear the three fee fields, planning to click 刷新. Instead, muscle-memory clicks 提交 (which is enabled). openActionConfirm shows detail: 'TRC20 $1/... → $0/$0/$0'. Operator confirms with 8-char reason. Backend accepts (0 is inside spec value range). All future withdrawals go out with zero network confirmation fees until D5 is rolled back. Compounded because feeAmplifies=true (fee decrease = flow amplification) triggers B1 red-line check server-side but red-line may pass and the change stands.

### [P2] docs/cgm/cgm.manifest.json:97
**94 manifest endpoints are marked TBD·candidate / TBD·建议 without a PRD §9.11 anchor**

- 依据:grep for `TBD·candidate|TBD·建议|TBD candidate` = 94 hits. Representative entries: CGM-A-002 endpoint `读 GET /api/me/session (TBD)`; CGM-A-004 `TBD·建议 GET/PUT /api/me/notification-preferences`; CGM-E-008 `TBD·建议 POST /api/store/checkout`; CGM-E-015 `GET /api/config/tradein(TBD candidate, not in PRD §9.11)`; CGM-G-003 `POST /api/wallet/reinvest`; CGM-G-015 `POST /api/withdrawals`; CGM-G-024 `GET /api/config/staking/pools`. Rule 2 requires `注释 endpoint 必在 PRD §9.11;PRD 关键 endpoint 必被代码引用`. These entries admit their endpoints are not in PRD §9.11 (CGM-E-015 says so explicitly: `not in PRD §9.11`). Rule 3 requires `POST /api/{module}/{action}` full name — most entries have that, but the missing PRD anchor fails check (c). Systemic issue, not per-entry.
- 场景:Frontend/backend teams see 94 proposed-but-uncanon endpoints; each team assumes the other has agreed; PRD §9.11 stays out of sync with what's actually being built. Recent examples: CGM-G-015 `POST /api/withdrawals` is central to package A's FEAT-WD01/WD02b work but the manifest never pinned it to a PRD sub-section anchor, so any admin-side lever change (e.g. FEAT-WD02b just deleted the penalty-rate lever) has no cross-checkable §9.11 line to update. Fix in two waves: (i) batch-attach `PRD §9.11x.y` sub-anchors to the 30 most-touched endpoints (auth, withdraw, checkout, staking, swap, orders, notifications); (ii) queue a PRD §9.11 refresh sprint to canonize the rest or explicitly demote them to §9.11z 'proposed'.

### [P2] docs/cgm/cgm.manifest.json:96
**CGM-A-002 auth annotation cites POST /api/otp/verify without a PRD §9.11d sub-section anchor**

- 依据:Line 96: `serverCanonical: MOCK-ONLY: auth state in localStorage (nexion-auth-v1, OTP verifyCode() 任意 6 位过 — 批量开号入口, _config/README). PRODUCTION: authentication + onboarding gate are server-canonical; OTP must go through POST /api/otp/verify; account enable/disable server-side`. Line 97 endpoint: `写 POST /api/auth/{signup|signin|signout} + POST /api/otp/verify; 读 GET /api/me/session (TBD)`. §9.11d in `docs/PRD/Nexion_运营控制后台_开发落地规格.md:100-101` covers auth/RBAC/session as server-canonical but there is no §9.11d sub-anchor pinned to `POST /api/otp/verify` in the manifest cell. Passes (a) mock/real accurately described and (b) specific POST endpoint, but fails (c) — no PRD anchor cited for the OTP endpoint. Given package I (auth) is currently being merged into master and touches the OTP flow, this annotation should either (i) pin to the §9.11d sub-anchor package I is landing under, or (ii) a
- 场景:Ops-side auth work merges without a shared PRD anchor — subsequent contracts drift because there's no canonical line to point at when the frontend team wants to change OTP length, retry policy, or lockout behavior. Rule 2 says `PRD 关键 endpoint 必被代码引用` — the reverse also matters: code-referenced endpoints must be in PRD, otherwise both sides invent conflicting specs. Fix: after package I merges, backfill this CGM-A-002 row with the §9.11d sub-anchor + the actual code path (admin-ops has no OTP flow, but the Nexion-uniapp counterpart should be name-checked).

### [P2] app/components/domain-views/d-tabs/d5-params.tsx:1
**Regression audit rollup: 10 historic patches + WD01/WD02b task items**

- 依据:Per-item status (已修/半修/未修/误报 + file:line):  1) safeReturnTo — 已修 (存在名为 returnTo 的白名单,不是 safeReturnTo) · app/_console/users/search/[id]/page.tsx:334-337 · 白名单 startsWith("/users/search") + !startsWith("//") (后者冗余但无害)  2) 安全头覆盖动态路由 — 已修 · next.config.ts:66-71 · source: "/(.*)" 匹配全部包括 [...path] 动态路由  3) i18n meta 残留 — 已修/无残留 · 仅 app/globals.css:157 存在"FOMO"字样但位于 CSS 注释内,产品渲染面 grep 干净  4) dev guard — 误报/不适用 · admin-ops 工程内无 _dev/* / setPinned / replay-tour 入口 (uniapp 侧概念),grep 全仓无匹配  5) mock helper 注释 — 已修 · lib/mock/admin/compute-config.ts:1-17 头注释含 "mock, backend-replaceable" + PROD 全名 endpoint (GET /api/admin/config/feature-flags; PATCH /api/admin/config/feature-flags/:key)  6) staking 利率单源 — 已修 · lib/admin/d-client.ts:1472-1489 单一 stakingInterestMode 字段 (LINEAR|AT_MATURITY),消费者 d3-treasury.tsx / _console/overview/liquidity/page.tsx / b2-client.ts 全部读自同一 normalize 结果  7) CSP dev-only — 已修

### [P2] app/components/shell/notification-bell.tsx:155
**notification-bell 未按优先级排序 alerts,mid/low 可埋在高危上方**

- 依据:LEVEL 定义 high/mid/low (line 27-31) 与 severityLevel(sev) 分级 (line 33-37) 都存在,但 alerts 数组 (line 155: `const alerts = [...j1Alerts, ...bAlerts]`) 按插入顺序渲染,无 .sort((a,b)=>weight(b.level)-weight(a.level)) 或类似排序. Drawer 循环 `alerts.map((a)=>...)` (line 250-271) 保持插入序. 后果: j1Alerts (c2/ops/j2/j3) 里的 mid/low 会显示在 bAlerts 里的 high (如 coverage 跌破红线) 上方. Badge 计数 filter 逻辑 (line 156) 正确 (高中危计数),但顺序不反映优先级. 非本轮 WD01/WD02b 修补引入,git log --all 未见任何 notification-priority commit,属预存在 UX 债务. 修法: `[...j1Alerts, ...bAlerts].sort((a,b) => ({high:0,mid:1,low:2}[a.level]-{high:0,mid:1,low:2}[b.level]))` 一行. 归 P2 因为 (a) 未上升到 CRITICAL/HIGH; (b) 单元素高亮清晰 (颜色+label 「高危」/「关注」/「正常」),运营眼动可识别; (c) 非本次任务针对项,不阻塞 D5/D2 修补合并

## A5 CRITIC GAPS(下轮补审面)

- {"what":"Legacy trial 5-tier migration only spot-checked extended->grace (killed). The other legacy shapes ({none, trial-active, cancelled, expired, extended-then-cancelled}) each map through migrateRow to the new none|active|grace|ended|converted enum; each branch can silently produce wrong shadow balance / wrong finishedAt / wrong offset-eligibility. Need to enumerate every legacy shape and diff
- {"what":"App.vue auto-charge orchestration removal was declared in-scope but no unit verified the deletion is complete: dangling timers/intervals, onLaunch/onShow hooks, leftover pinia subscriptions, imports of the deleted composables, and any residual polling for trial auto-charge could still be live. Grep setInterval/setTimeout/onLaunch/onShow + former composable names across App.vue and prior c
- {"what":"'bind-card / retention / extension trio deletion' was named but no unit swept cross-workspace residuals: pages.json route entries + navigator.push callers, zh/en/vi i18n keys, admin-ops or admin-prototype references, dead imports/composables, e2e references, PRD 9.11 endpoint declarations. Partial deletion leaves orphan tap targets navigating to broken states.","kind":"deletion-sweep","su
- {"what":"captchaAlwaysScenes was audited only for register per U6. AUTH03 says '100% mandatory captcha on OTP send'. Other OTP touch points (login OTP, forgot-password OTP, phone-change OTP, high-value txn OTP, KYC OTP) each have their own send-OTP call; if captchaAlwaysScenes is a scene-keyed allowlist, missing scene keys silently regress to captcha-optional. Enumerate every OTP-send callsite and
- {"what":"otpGate 'verify value pin + wire gate' claim was accepted but source-of-truth of the gate flag was not verified. If gate state reads from localStorage / pinia-persisted state a client can flip it. Per bug 8 (localStorage does not hold authoritative state), the gate must be re-derived server-side on every OTP send. Read the gate resolver to confirm it consults server-canonical config, not 
- {"what":"'trial price dual source parity sentinel' was declared PASS in U7 but only forward-tested (assertion holds today). Per sentinel-false-green lesson, a sentinel that never breaks under injected divergence is worthless. Red-test each new sentinel: mutate one source, confirm sentinel exits non-zero; restore. Cover trial-price-parity + any new hollow/needle/mirror sentinels shipped this wave."
- {"what":"WD02 'Withdrawal.fee snapshot structured + historical compat' was shipped. U2/U3 covered new structured write path and validation. Nobody read the withdrawal-history render path that must still display legacy flat-fee records (pre-migration). If the history component destructures fee.networkConfirmUsd/fee.serviceUsd without a fallback, every legacy record renders NaN / undefined / crashes
- {"what":"U5 caught voucher-mid-checkout overcharge but only along the voucher axis. Checkout now stacks: coupon + voucher + trial-offset (converted user has $21 credit) + network fee. Cross-axis: does trial-offset apply on top of a voucher, or is it exclusive? Does converting mid-checkout (grace ends) re-quote? Does discount cap interact with negative-total from stacking? Matrix pass over stacking
- {"what":"Cross-unit not audited: a user who just converted trial (has $21 credited to real balance) immediately submits a withdrawal. Does the fee engine see the correct authoritative balance (including trial-derived credit) for min-withdraw eligibility? Does the NEX self-selected offset path treat trial-earned NEX (nexBurned side) correctly? Trace convert() -> balance mutation -> withdraw eligibi
- {"what":"Killed 'SPEC-7 param parity only covers Nexion-admin-prototype not admin-ops' -- but per batch12 决议 (2026-07-31) admin-ops IS the authorized implementation face. The killed finding may have been dismissed for the wrong reason. Re-run param-parity with admin-ops (:3012) as authoritative and admin-prototype as legacy, not the reverse.","kind":"authorized-face-parity","suggestedUnit":"U17-ad
- {"what":"Fix batch 'grace device gray' -- no unit enumerated every component that renders a device tile: device-list, device-detail, dashboard hero, order-history device row, admin-view device roster, notification device thumb, purchase-flow device confirm. If any one path skips the grace-state style branch, user sees a normal-color device that no longer earns -- inconsistent visual truth across t
- {"what":"Order model extended with conversion-mode field (TRIAL02 side). No unit audited downstream readers: admin order-listing filter/sort/export, refund path (does refund of a converted-trial order roll back the $21 offset?), reporting/statistics aggregations, receipt render path, webhook payloads. A new field silently ignored by any of these is a data-integrity leak.","kind":"cross-unit-combo"
- {"what":"U4 covered convert/poll/migrate but did not enumerate the full transition matrix: none->active, active->grace, grace->ended, grace->converted, active->converted (skip grace), ended->? (re-enter allowed?), converted->? (locked?). Each illegal transition needs guarding; concurrent writes (two tabs, convert() during poll() during migrateRow) should be idempotent. Also: what if trialDays is r
- {"what":"Only ONE i18n violation caught (register.vue toast sub-title). Three packages introduced substantial new copy: WD02 disclosure rewrite + fee state text (4-state) + half-sheet 说明, TRIAL02 conversion prompts + state chips + grace timer text + retention removal replacements, AUTH03 captcha prompts. Full sweep: grep zh-CN string literals in changed .vue files, cross-check each has a t() wrapp
- {"what":"'phase 删惩罚费率' was declared. No unit swept residuals: penalty-rate i18n keys, admin-ops config toggle, ledger BillType classification (was there a PENALTY_FEE type to remove or grandfather?), historical bill records display path, PRD 9.11 endpoint references, and any risk-eng math still summing a penalty component. A half-removed fee type surfaces in legacy user bills as unlabeled deductio
- {"what":"Rollback safety not audited: trial user converts -> $21 offset credited + order created -> checkout payment fails -> order voided. Is the $21 offset rolled back? Is trial state reverted from converted back to grace/ended (was there a time-anchor for grace remaining)? Or is offset silently kept and user gets free credit? Per bug 6 (金融op必须失败回滚), every credit needs a matching debit path on f

---

# B. admin-ops 审计

## B1 CONFIRMED(对抗存活)(8)

### [P0] Nexion-uniapp/src/store/free-trial.ts:26
**free-trial.ts anchors to stale PRD §9.11a table — post-FEAT-TRIAL02 mapping never synced**

- 依据:Header comment (L26–31) claims 'every action maps to a REST endpoint (PRD §9.11a)' and lists cardless mapping: POST /api/trial/start (no body), convert() → POST /api/orders, POST /api/trial/cancel, GET /api/trial/eligibility, GET /api/trial/state. But PRD §9.11a.2 (lines 3576–3583 of PRD/NexGrid_产品功能架构设计文档_v3.7.md) still lists the retired card-based contract: POST /api/trial/start with {cardTokenId} payload, POST /api/trial/redeem-early, POST /api/trial/extension, POST /api/trial/charge — all mapped to non-existent store methods (startWithCard/redeemEarly/acceptExtension/mockChargeAttempt). §9.11a.3/9.11a.4 (lines 3585–3616) reinforce the stale contract. FEAT-TRIAL02 spec signed 2026-07-31 rewrote the machine cardless, but PRD §9.11a was never resynced. Rule 2 violation: comment endpoint anchor points at a PRD section whose table lists a materially different contract; Rule 9 violation: r
- 场景:Backend engineer opens PRD §9.11a following the store's comment pointer, reads {cardTokenId} payload, implements card-required /api/trial/start, wires PSP for auto-charge — production breaks the moment the cardless client calls start() with an empty body OR the client's convert() (which the mock puts inside POST /api/orders) has no matching server-side transaction. Discovery only after cutover.

### [P1] lib/admin/d-client.ts:1223
**netReceive 未与 amount − actualFee/grossFee 挂钩,可注入任意 [0, amount] 数值**

- 依据:L1223(confirm)与 L1238(legacy)都只做 `netReceive < 0 || netReceive > result.amount` 界值,未验 `netReceive = amount − actualFee`(confirm)或 `netReceive = amount − grossFee`(legacy)。反例payload:`d2Row({ networkConfirmUsd: 5, networkFee: null, penaltyFeeRate: null, grossFee: null, networkFeeRate: null, networkFeeMin: null, networkFeeMax: null, nexBurned: 0, feeWaived: 0, actualFee: 5, netReceive: 80 })` —— 应为 95,注入 80 后所有 confirm 不变量通过。d2-withdrawals.tsx L343/348/373 把 `row.netReceive` 直接渲染为『实际到账 {money(row.netReceive)}』给审批人做决策。
- 场景:被入侵/有 bug 的后台把 netReceive 序列化时忘减手续费(或错减)→ 审批人以为用户拿 $80,链上实际到账 $95 → 财务对账缺 $15。normalizeWithdrawal 是唯一的响应侧防线,越过它就没别人拦。同款漏洞见 [feedback_derived_number_must_name_its_source](显示给用户的钱必须能指到单源)。

### [P1] lib/admin/d-client.ts:1237
**legacy 分支:actualFee 仅 ≥ 0 上界,未挂 grossFee − feeWaived 等式(confirm 分支已有 max(0, confirm − nex×rate),不对称)**

- 依据:L1218-1226 confirm 分支强制 `|actualFee − max(0, confirm − nexBurned × nexFeeOffsetRate)| ≤ 0.0001`;L1233-1242 legacy 分支只把 actualFee 放进 `< 0` 界值链,再无任何等式。反例payload:`d2Row()` 默认已经是 `grossFee: 21, feeWaived: 0, actualFee: 21`(内洽),但只需改成 `feeWaived: 0, actualFee: 1` 就过——`actualFee: 1 ≥ 0` 通过,grossFee 不变量也过(21 = 1 + 100*0.2),但 21 − 0 ≠ 1。d2-withdrawals.tsx『毛手续费 · 减免 · 实际手续费 · 到账』四栏并列显示,数字算不上账。
- 场景:旧协议后端 bug/攻击者把 legacy 单的 actualFee 写小或写大,admin 看到的费用与真实链上扣款分裂;因为 legacy 分支被视为『旧单,弱等式够用』的假设完全不成立(只有 grossFee 有等式)。confirm/legacy 应该对称,任一有等式另一必须补,否则老单永远是 admin 面上的盲区。

### [P1] tests/e2e/h1-owner-acceptance-20260727.spec.ts:24
**E2E 契约与 H1 UI 移除不同步:acceptance spec 仍锁定 withdrawPenaltyFeeRate 8 键 + 「x 8 项」表头**

- 依据:H1Phase 已把 withdrawPenaltyFeeRate 从 DIAL_COLUMNS(app/components/domain-views/h-tabs/h1-phase.tsx L27-38)删掉,现在只剩 7 列;但同批未改的 acceptance spec 在 3 处仍锁定 8 键+8 长度+「x 8 项」表头:①L24 `.l-h .ttl` filter hasText `/逐月旋钮矩阵\(\d+ 月 x 8 项\)/` — 若后端也把 dialCount 同步降到 7 或不下发,H1 表头渲染成「x 7 项」,该断言直接红;若后端保 dialCount=8(拿这条 spec 顶着),H1 表头显示「x 7 项」还是「x 8 项」由后端决定,操作者会看到「8 项」但实际表格 7 列(见 h1-phase.tsx L393 `{model.dialCount ?? DIAL_COLUMNS.length}` 与 L527 pagination label 同源);②L50 `expect(Object.keys(currentRow.dials)).toEqual(expect.arrayContaining([...withdrawPenaltyFeeRate...]))` — 后端只要清掉该键 spec 立红;③L60 `expect(b4.dials).toHaveLength(8)` — 同理。whyRisky ① 明确写「后端配合清理」但同一 sprint 未回归 spec,反 16 条 Rule 11(修一处 grep 全站同形 caller 全补)。h1-owner-closure-contract.test.mjs L23 已剥注释扫且断言不残留,与 e2e spec 呈相反契约,任一方推动都会撕裂。
- 场景:后端按 FEAT-WD02 清 withdrawPenaltyFeeRate → phases.monthlyDials.dials 只剩 7 键 + dialCount=7 → npm run test:e2e h1-owner 三处 assert 一起红(表头文本、arrayContaining、b4 dials.length),CI/regression 都会挂。反之后端不清:操作者页面表头显示「x 8 项」但实际只 7 列 chg 高亮,一眼假数。

### [P1] Nexion-uniapp/src/pages/me/wallet-exchange.vue:346
**wallet-exchange: 900ms setTimeout reads latest reactive state, not confirmed snapshot — UI-shown swap != executed swap**

- 依据:handleConfirm() awaits uiConfirm({...}) at line 337, then `setTimeout(() => { const succ = direction.value === 'usdt2nex' ? app.debitBalance(fromAmount.value) : app.debitNex(fromAmount.value); ... app.creditNex(toAmount.value)/app.creditBalance(toAmount.value); exchange.recordSwap({fromSym, toSym, fromAmount:fromAmount.value, toAmount:toAmount.value, rate:rate.value}); ... v3.record(swapUSDValue.value); }, 900)` (lines 346-396). Every value inside the callback is re-read from the ref at execution time — direction.value, fromAmount.value, toAmount.value, rate.value, swapUSDValue.value. Between the user tapping Confirm on the modal and the 900ms setTimeout firing: (a) the 15s `setInterval(() => exchange.refreshRate(), 15000)` at line 233 can fire, jittering rate.value by up to ±0.02 (~24% swing on the base 0.085), so the credited toAmount silently differs from the number shown in the confi
- 场景:User has 100 USDT. Opens swap, types 100, sees `Confirm: USDT 100 → NEX 1176.47` (rate 0.085). Taps CTA → confirm modal shows 1176.47. Presses OK. During the 900ms delay, rate.value jitter fires and lands at 0.100 (upper edge of ±0.02 jitter). setTimeout body runs: reads toAmount = 100/0.100 = 1000 NEX. app.debitBalance(100) succeeds, app.creditNex(1000) — user gets 1000 NEX not the 1176.47 they confirmed. Same mechanism in reverse gifts the user extra NEX. Fits the 'staking 三套利率 3.6× 欺诈教训' shape: confirm-dialog value diverges from the actual credit.

### [P1] Nexion-uniapp/src/store/staking.ts:144
**staking earlyWithdraw / claim: cross-tab read-modify-write race lets refund + interest be credited twice**

- 依据:earlyWithdraw (144-155) and claim (159-171) do read-modify-write on positions[] with no claim-token pattern: `find(status==='active')` → `map(x => x.id===id ? {...x, status:'early-withdrawn'|'claimed'} : x)` → persist → return `{ok:true, refund/interest, principal}`. Persistence writeAccountRow (account-scoped-storage.ts:22-33) is last-write-wins with NO merge (contrast with account-cloud.ts:mergeAccountSnapshots which does 3-way diff). The caller at staking.vue:221-263 does `const r = staking.earlyWithdraw(p.id); if (r.ok) { app.creditBalance(r.refund); bills.add(...); }` and `const r = staking.claim(p.id); if (r.ok) { app.creditBalance(r.principal + r.interest); bills.add(...); }`. `app.creditBalance` is on the account-cloud additive-merge path (usdtBalance is in ADDITIVE_NUMBER_KEYS at account-cloud.ts:33-52). So two concurrent tabs both observe the same 'active' position, both flip t
- 场景:User has stk-1 (active, $500 matured). Opens two tabs on /pages/staking/staking. Taps Claim on both within the ~5ms localStorage propagation window. Tab A: reads active → maps to claimed → persists positions=[claimed]. Tab B: reads still-active (before propagation) → maps to claimed → persists positions=[claimed]. Both return ok:true, principal=500, interest=~44. Both call app.creditBalance(544) → account-cloud merge sees delta -456 → -456 = -912 twice through the additive path (merge line 268: `merged[key] = +(current + delta).toFixed(6)` applied per-tab means user gets $1088 credited for a $500 stake). Same mechanic exploitable with earlyWithdraw on any 'active' position.

### [P1] Nexion-uniapp/src/pages/me/wallet-exchange.vue:286
**wallet-exchange handleConfirm has no reentrancy guard; multiple confirm dialogs can stack and fire independent setTimeouts**

- 依据:handleConfirm (line 286-397) has only `if (!valid.value) return;` as its entry guard. No `confirming.value` / `submitting.value` flag is set. The CTA at line 95 has no disabled state during confirm/setTimeout. wallet-withdraw.vue uses `let confirming = false;` (checkout.vue:514) and `const submitting = ref(false);` (wallet-withdraw.vue:591) explicitly to guard the same shape of flow; the exchange page is missing that pattern entirely. Rapid taps → multiple parallel `await confirm(...)` promises → each user-confirmation independently schedules a 900ms setTimeout → each fires the debit + credit + bills + v3.record chain. Because v3.canExchange (line 290) reads its own store state at each call, two rapid taps both see the same 'used' counter and both pass — see finding #3.
- 场景:User taps Confirm 3 times in rapid succession. If uiConfirm queues modals: 3 modals appear, user confirms all → 3 setTimeouts each debit fromAmount, credit toAmount, and record — a $40 swap becomes 3× $40 debits in a single Confirm burst. Even without stacking modals: the second tap between the first modal appearing and being confirmed still fires a second handleConfirm → second confirm modal → second setTimeout. Combined with finding #3, three swaps at $40 each all pass gate (each sees 0-used counter) → user swapped $120 while store thinks $40.

### [P1] Nexion-uniapp/src/components/genesis/purchase-sheet.vue:154
**purchase-sheet.vue cites fabricated endpoint POST /api/genesis/purchase against wrong PRD anchor §9.11e**

- 依据:Comment: 'PRODUCTION: POST /api/genesis/purchase (PRD §9.11e) is one atomic transaction returning {balance, ownedTokenIds, billId}.' Reality: PRD §9.11e table (lines 3762–3769) enumerates atomic-tx endpoints for auth/staking/withdraw/trial — it has NO row for Genesis primary purchase. A full-file grep of PRD/NexGrid_产品功能架构设计文档_v3.7.md finds NO occurrence of '/api/genesis/purchase' anywhere; only /api/genesis/state (L3664), /api/genesis/marketplace/stats (L3665), and POST /api/genesis/secondary/{list,unlist,fulfill} (L3948). The endpoint name is invented and the section anchor is wrong. Contrast with tradein-sheets.vue L38 which correctly discloses 'Endpoints (all TBD; candidate names, not yet in PRD §9.11)'.  Rule 2 + Rule 3 violation (specific fake endpoint + wrong anchor).
- 场景:Backend engineer greps PRD for /api/genesis/purchase, finds nothing, opens §9.11e per the anchor, still finds nothing, then either invents a contract independently (drift from client shape) or blocks on 'is this endpoint real?'. Same failure mode for the Genesis primary-sale rollback path — currently the client rolls back with app.creditBalance(cost), but no server-side transaction is even specified in the PRD.

## B2 UNCONTESTED(2)

### [P1] Nexion-uniapp/src/store/interrupt.ts:27
**interrupt.ts cites POST /api/device/:id/heartbeat under wrong PRD section §9.11d**

- 依据:Comment: '⚠️ MOCK-ONLY: production runs this clock server-side — the device agent's heartbeat drives it (PRD §9.11d candidate POST /api/device/:id/heartbeat).' The endpoint IS in PRD but at line 5023 in §12 device chapter (payload {isCharging, isWifiConnected, batteryLevel, thermalState}, returns pausedReason). §9.11d (lines 3716–3755) is Kill Switch + Client-tamper Defense + Feature Flag — no device heartbeat contract. Rule 2 violation: pointer sends readers to the wrong PRD section.
- 场景:Backend engineer follows §9.11d anchor, finds kill-switch tables, believes the endpoint is undocumented, either duplicates a heartbeat spec (parity risk with §12's canonical) or delays wiring the interrupt/grace machine.

### [P1] src/pages/events/events.vue:157
**Mock helper 注释 endpoint 命名 — 半修(rule 3 缺 5 处 endpoint candidate)**

- 依据:违反 rule 3(注释给具体 POST /api/{module}/{action} 全名): (1) events.vue:157 `// MOCK-ONLY NON-ATOMIC: PROD event-claim endpoint TBD` — 无 candidate; (2) daily.vue:345 `// PROD milestone-claim endpoint TBD` — 无 candidate; (3) complete-registration.ts:12 `PROD 注册 endpoint/回执契约仍 TBD` — 无 candidate; (4) register.vue:381 `PROD 应由注册事务（endpoint/回执契约 TBD）` — 无 candidate; (5) success.vue:126 `PROD 注册 endpoint/回执契约 TBD` — 无 candidate。 **对照满足 rule 3 的 6 处**:daily.vue:313 `POST /api/faucet/sign-in` ✓ · weekly-quest-list.vue:149,166 `POST /api/quests/weekly/{tier2/:id}|{bonus}` ✓ · weekly-quest-hero.vue:159 `POST /api/quests/weekly/{tier1}` ✓ · wallet-withdraw.vue:842 `POST /api/withdrawals` + Idempotency-Key ✓ · complete-sign-in.ts:41 `POST /api/auth/login`/`otp/verify`/`password/reset` ✓ · register.vue:522 `POST /api/auth/register`(candidate)✓。 修法:5 处补 candidate endpoint,允许 `(TBD; candidate: POST /api/…)` 格

## B3 KILLED(2)

### [P1] scripts/canon-sentinel.mjs:336
**canon-sentinel L336 admin offset check 静默跳过——d-tabs/data.ts 不存在,同型"哨兵假绿"未修**

- 依据:L299 `adminDdata = readIfExists(path.join(ROOT, 'app', 'components', 'domain-views', 'd-tabs', 'data.ts')) ?? ""`,该文件不存在(实测 `ls d-tabs/` = d1-recon.tsx/d2-withdrawals.tsx/d3-treasury.tsx/d4-ledger.tsx/d5-params.tsx/d6-fx.tsx/types.ts — 无 data.ts)。L336 `if (adminDdata) { expectNumber(...) }` — 空字符串 falsy → expectNumber 从未被调用。全仓 grep `key: "nexFeeOffsetRate"` = 0 命中(admin 侧根本没这个 pattern)。**实测运行 sentinel**:6 条 `withdraw.uni.offset.P{1..6}` 检查,ZERO 条 `withdraw.admin.offset` 检查。L292-294 注释吹嘘 offset 从 penalty 解耦防哨兵假绿,L313 uniapp 侧 `phaseCount !== 6 → failures.push` 硬拦——但 admin 侧完全没有对应的显式失败断言,同型漏洞漏改。
- 场景:① 未来任何人给 admin d-client 加一个 `D5_DEFAULT_NEX_FEE_OFFSET_RATE = 0.5`(≠ canon 0.4),canon-sentinel 全绿放行,双端 offset 值域漂移零觉察。② 老的 penalty 模型残留一个 `key: "nexFeeOffsetRate"` 假 pattern 到其它 tsx(如未来 domain-views 加了),sentinel 只查一个死路径,漏检。③ 这道门修辞上覆盖 admin+uniapp 双向 parity,实际只覆盖 uniapp 单向 → 主人误信"跨仓 parity 已焊"而暴露真实盲区。修法两选一:(a) 加显式失败 `if (!adminDdata) failures.push('admin d-tabs/data.ts missing; cannot prove admin offset canon(现实认为该文件不再存在则从注释和 L299/336 一并删,别留死引用)')`,与 uniapp phaseCount 显式失败对称;或 (b) 承认 admin 侧 offset 无源码常量(纯 server-driven via `d5Number(raw.nexFeeOffsetRate, ...)` at d-client.ts L1651),从 sentinel 删掉 L299/L334/L336-338 死代码 + 同步删 L295-296 注释里的 "admin ... D5 OWN_PARAMS(offset,存在才对账)" 承诺。第 (a) 方案更保险,第 (b) 更 lazy——两方案都必须动。

### [P1] Nexion-uniapp/src/store/exchange-v3.ts:116
**exchange-v3 canExchange / record TOCTOU race bypasses daily $50 cap and $100 KYC threshold across tabs**

- 依据:canExchange(usd) at line 116-133 checks lifetime KYC threshold and daily user cap; record(usd) at line 135-140 commits AFTER the fact by incrementing todayUserUsedUSD, todayPlatformUsedUSD, lifetimeExchangedUSD. persistence via writeAccountRow is last-write-wins (account-scoped-storage.ts:22-33) — NOT additive-merge. There is no atomic slot-claim like withdraw-daily-count.ts's claimDailySlot/isClaimOwner (which the withdraw team explicitly wrote to defeat exactly this race, comment at 61-66). In the caller wallet-exchange.vue, the gate is checked at line 290 BEFORE await confirm({...}) at 337 and BEFORE the 900ms setTimeout at 346; v3.record(swapUSDValue.value) fires at line 385 — seconds after the check. Same tab spamming (opening new confirm dialog before the last setTimeout fired) or cross-tab both bypass. Contradicts the file-header claim 'MOCK-ONLY: real backend owns counters server
- 场景:User has lifetimeExchangedUSD=90, kycVerified=false. Opens two tabs on /pages/me/wallet-exchange. Tab A: swap $8 (canExchange: 90+8=98 > 100? false → ok). Tab B: swap $8 (also reads lifetime=90 before A propagates → 90+8=98 > 100? false → ok). Both confirm, both 900ms setTimeout fires, both debit + credit + v3.record($8). Local: A has lifetime=98, B has lifetime=98. writeAccountRow last-write-wins → persisted lifetime=98. Actual swaps executed = $16 → real lifetime should be $106 but recorded as $98 → KYC threshold silently bypassed. Same pattern bypasses USER_DAILY_CAP_USD=$50: two tabs each swap $40, both pass gate (40+40<50 false wait — 0+40 <= 50 true), both record → recorded $40 but actual $80. User exceeded $50/day cap by $30 with zero friction.

## B4 P2(33)

### [P2] app/components/domain-views/d-tabs/d5-params.tsx:30
**Empty fee input silently treated as 0 fee (Number("") === 0 JS quirk); red-text guard specifically excludes empty state so no per-field visual cue**

- 依据:`asNumber("") = Number("") = 0`; `confirmFeeValid(0)` returns true → `feeTrcValid = true`. Line 252 red-text guard is `!feeTrcValid && drafts.feeTrc !== ""` — the `!== ""` branch specifically skips empty state. Result: cleared field silently equals 0, `feeValid` stays true, `feeUnchanged = 0 === params.trc20` is false (assuming server > 0), submit button ENABLED. Same holds for BEP20/ERC20. Whitespace input (" ") also coerces to 0.
- 场景:Operator with `finance_d5_fee_write` intends to only edit BEP20 fee. Clicks TRC20 input by accident, backspaces to clear, gets interrupted, comes back and clicks '预览并提交' assuming they only touched BEP20. Confirm modal beforeAfter text (L260) shows '$1/$1/$5 → $0/$edited/$5' — if operator glances at the change they expected (BEP20 $1→$X) and confirms on autopilot, TRC20 fee silently drops to 0. Post-commit, every real-user TRC20 withdrawal waives network confirmation fee → direct fee-revenue loss until next admin fix. Mitigations: (a) L255 0-value warning fires (shared across all three networks, not tied to specific field); (b) confirm modal shows explicit '$0' — but only visible if operator reads before/after carefully; (c) any-network downshift triggers `feeAmplifies=true` → B1 red-line pre-check server-side (only helps if B1 coverage happens to be below red-line, else 0-fee change goes

### [P2] app/components/domain-views/d-tabs/d5-params.tsx:257
**Three fee inputs (TRC20/BEP20/ERC20) lack visible per-input labels; only aria-label distinguishes them; sighted operators must infer network from position**

- 依据:L257-259: three `<input>` elements have identical `className="l-inp"`, `type="number"`, `min/max/step`, and no `placeholder` — only `aria-label="TRC20/BEP20/ERC20 网络确认费目标值"`. Confirmed via `d-domain.css:182` that `.p-row` is horizontal flex (`display:flex; align-items:center; gap:14px`) — three inputs render side-by-side with no interstitial label. The `.txt` container on the left holds only the group description (L249-256) with example values '默认 TRC20 $1 / BEP20 $1 / ERC20 $5' — visual pairing requires operator to count inputs and match position to the example order.
- 场景:Operator wants to lower BEP20 fee from $1 to $0.5. Visually scans the three inputs; middle position is BEP20 (correct) but with three identical-looking inputs and no visible labels, could easily misclick TRC20 (leftmost) or ERC20 (rightmost). Types $0.5 in wrong input. `feeValid=true`, `feeUnchanged=false`, submit enabled. Confirm modal beforeAfter (L260) DOES show per-network labels ('TRC20 $1 / BEP20 $1 / ERC20 $5 → $0.5 / $1 / $5') — mistake IS visible in modal but relies on operator reading carefully instead of pattern-matching on 'saw a $0.5 change I intended'. Same input-vs-network misalignment risk exists for restore-default flow if operator uses the wrong input to preview an intended value first. Fix: add `placeholder="TRC20"/"BEP20"/"ERC20"` to each input, or wrap each in a small label chip, or split description text into three per-input hint rows.

### [P2] lib/admin/d-client.ts:1235
**legacy 分支:networkFee 只查 [min, max] 界值,未与 amount × networkFeeRate clip 挂钩**

- 依据:L1234-1235 只做 `networkFee < networkFeeMin || networkFee > networkFeeMax`,不检查 `networkFee ≈ Math.min(networkFeeMax, Math.max(networkFeeMin, amount * networkFeeRate))`。反例payload:`d2Row({ amount: 100, networkFeeRate: 0.01, networkFeeMin: 1, networkFeeMax: 25, networkFee: 25, penaltyFeeRate: 0.24, grossFee: 49 })` —— rate 1% 但 fee 收 $25(顶到 max),grossFee 24 + 25 = 49 满足 grossFee 等式。rate 与 fee 完全脱节仍通过。
- 场景:backend 可以在合规界值内挑更贵的 networkFee(比如永远收 max),前端一份 networkFeeRate 说 1%、实际 fee 是 25% —— 用户端看到的展示费率与真实扣费不一致时 admin 侧无法从这个 normalizer 察觉。

### [P2] lib/admin/d-client.ts:1222
**feeWaived 仅 ≥ 0 界值,未与 min(confirm, nexBurned × nexFeeOffsetRate)/grossFee − actualFee 挂钩**

- 依据:L1222(confirm)与 L1237(legacy)都只查 `feeWaived < 0`。confirm 分支的 actualFee 等式左侧就是『应减免后剩下的』,右侧却让 feeWaived 独立可写:`d2Row({ networkConfirmUsd: 5, networkFee: null, penaltyFeeRate: null, grossFee: null, networkFeeRate: null, networkFeeMin: null, networkFeeMax: null, nexBurned: 0, feeWaived: 999, actualFee: 5, netReceive: 95 })` 全过。d2-withdrawals.tsx L342/347/373 把 feeWaived 直接展示为『费用减免 {money(row.feeWaived)}』,并进 NEX 抵扣汇报口径。
- 场景:backend 可以为任何提现单虚报『减免 999 USDT』,admin 看到的 NEX 抵扣数字全部污染;下游 F 域(用户 NEX 回收看板)以此聚合就是虚数。

### [P2] lib/admin/d-client.ts:1221
**nexBurned 与 nexFeeOffsetRate 无上界,乘积经 max(0, ...) 后总归零,超大值全部放行**

- 依据:L1221 confirm、L1236-1237 legacy 只查 `< 0`。反例payload:`d2Row({ networkConfirmUsd: 5, networkFee: null, penaltyFeeRate: null, grossFee: null, networkFeeRate: null, networkFeeMin: null, networkFeeMax: null, nexBurned: 1e12, nexFeeOffsetRate: 1e12, feeWaived: 0, actualFee: 0, netReceive: 100 })` —— `max(0, 5 − 1e24) = 0`,`actualFee: 0` 与之相等,全过。d2-withdrawals.tsx L342 展示『NEX抵扣 {row.nexBurned} × ${row.nexFeeOffsetRate}/NEX』,直接把 1e12 塞到 admin 面前。
- 场景:backend 一旦对 NEX 燃烧字段有数值精度/单位 bug(比如把 wei 当整 NEX 传),normalizer 不会拦;admin 看板出现『某用户单笔提现燃烧 1e12 NEX』的数字,聚合仪表盘、H1 阶段动能测算全部崩掉。补一句 `nexBurned <= someBusinessCap && nexFeeOffsetRate <= 1` 就能挡。

### [P2] lib/admin/d-client.ts:1223
**netReceive > amount 无浮点容差,合法舍入即被 D2_RESPONSE_INVALID 冻结整页**

- 依据:L1223(confirm)与 L1238(legacy)都用 `result.netReceive > result.amount` 严格比较,而附近费用等式统一用 `> 0.0001` 容差。反例payload:`d2Row({ networkConfirmUsd: 5, networkFee: null, penaltyFeeRate: null, grossFee: null, networkFeeRate: null, networkFeeMin: null, networkFeeMax: null, amount: 100, nexBurned: 0, feeWaived: 0, actualFee: 5, netReceive: 100.0000000001 })` 会抛 `D2_RESPONSE_INVALID:withdrawal.financialInvariants`。L1259 `normalizeD2Page` 用 `raw.records.map`,一条行抛错 = 整页翻页失败,不是单条降级。
- 场景:后台 JVM/JS BigDecimal 序列化偶尔多带一位余数(链上 fee 微调后),normalizer 就把整批提现页面全打挂。不是攻击,是运营脆性 —— 与 fee 等式同容差(± 0.0001)即可。

### [P2] app/components/domain-views/d-tabs/d2-withdrawals.tsx:332
**批量 K4-unavailable 门只在渲染层挂 checkbox disabled,batchAction 由非-APPROVE 切到 APPROVE 时既有 selected Set 不清理,confirmBatch 也无 runtime 过滤 → K4-unavailable 行随批量 APPROVE 落到服务端**

- 依据:L332 selectable=actionCandidates(row).includes(batchAction) && !(batchAction==="APPROVE" && routingUnavailable(row)) 只影响下次渲染的 disabled;L334 checkbox checked=selected.has(row.withdrawalNo) 仍取自持久 Set。L323 setBatchAction 只改动作类型,不 setSelected(new Set())。L206 setSelected(new Set()) 只在 load() 里跑,useEffect(L217) deps=[status,page,pageSize] 不含 batchAction。L271-294 confirmBatch: const ids=Array.from(selected) → reviewD2WithdrawalsBatch(batchAction, ids, ...),无 ids.filter(id=>!routingUnavailable(rowMap.get(id))) 过滤;对照单笔 L248-251 有 if (action==="APPROVE" && routingUnavailable(row)) { toast; return; } 强 runtime 门,批量流程既无 checkbox 强清也无 confirmBatch runtime guard 对等物。
- 场景:操作员先在 batchAction=DELAY 下勾选 3 笔 REVIEW_PENDING 提现单(其中 1 笔 riskScore=null 即 K4-unavailable,DELAY 场景下不受 K4 门管) → 从下拉切换 batchAction 到 APPROVE → 视觉上 K4-unavailable 行 checkbox 变 disabled 但仍保留 checked(disabled+checked 组合在密集队列里极易漏看)→ 点"批量执行" → confirmBatch 用 Array.from(selected) 把 K4-unavailable 行 ID 打包 → reviewD2WithdrawalsBatch 提交 APPROVE 含此行 → 服务端 K4 gate 兜底把该行放进 result.rejected,但客户端 K4 门旁路了、审计里多一条被拒的 APPROVE 尝试记录、批次反馈 toast 变'X 成功 / Y 大额转单笔 / Z 冲突' 混合状态易被误读为部分成功。修法:setBatchAction 里 setSelected 只保留新 batchAction 下 selectable 的行(和 load 里 setSelected(new Set()) 同源清理);或 confirmBatch 里对 ids 做 rowMap.get(id).routingUnavailable + batchAction==="APPROVE" 二次过滤并 toast 明示被剔除数。

### [P2] app/components/domain-views/h-tabs/h1-phase.tsx:393
**DIAL_COLUMNS.length 与 model.dialCount 双源不一致:表头/pagination 说明 8 项、表格实际 7 列**

- 依据:L393 `{monthlyRows.length} 月 x {model.dialCount ?? DIAL_COLUMNS.length} 项` 与 L527 pagination label 使用相同 `model.dialCount ?? DIAL_COLUMNS.length` 兜底;DIAL_COLUMNS.length 已随 FEAT-WD02 从 8 降到 7,但 model.dialCount 是后端权威值。E2E h1-owner-acceptance L60 `expect(b4.dials).toHaveLength(8)` 强制后端保 8,则 H1 页面表头必定长期显示「x 8 项」而 tbody 只 render 7 列(L402/L414 用 DIAL_COLUMNS.map),操作者看到「8 项」表头 + 7 列表格,是显示口径与 SoT 冲突。修法二选一:①改用 `Object.keys(row.dials).length` / DIAL_COLUMNS.length 单源;②去掉 `?? DIAL_COLUMNS.length` 兜底,严格听后端,后端不同步则报错(但已经有 e2e 强制 8,依旧撕裂)。回到根因:whyRisky ① 承认「后端配合清理」但当轮没做,dialCount 兜底半新半旧显示。
- 场景:运维打开 /growth/phase → 表头「N 月 x 8 项」/pagination「N 月 x 8 项」都写 8 → tbody 实际 7 列 → 运营者数完 7 项与「8 项」对不上,产生对旋钮矩阵完整性的怀疑,提工单/回滚;若被 audit 复审当成「删控件没删说明」P1 反打回。

### [P2] scripts/canon-sentinel.mjs:321
**networkConfirmFeeUsd 三键 parity 正则锁死 trc20/bep20/erc20 顺序,uniapp/admin 两处同型**

- 依据:L321 `/networkConfirmFeeUsd:\s*\{\s*trc20:\s*([\d.]+),\s*bep20:\s*([\d.]+),\s*erc20:\s*([\d.]+)\s*\}/` 与 L329 `/D5_NETWORK_CONFIRM_FEE_DEFAULT = \{ trc20: ([\d.]+), bep20: ([\d.]+), erc20: ([\d.]+) \}/` 均硬编码 trc20→bep20→erc20 顺序。TypeScript 对象字面量键序自由,任何 lint/prettier auto-fix、字母序重排、或加一条链(如新增 sol/polygon 与三键交错)都会让 seed 变 null。whyRisky 已承认这条风险,复审确认真实。同文件 L68-76 已有可复用的 `parseNumberRecord`,专门处理任意键序的 key:number record。
- 场景:① 有人跑 eslint --fix 触发字母序重排 `{ bep20: 1, erc20: 5, trc20: 1 }` → seed=null → 三个 expectNumber 全报 `null expected 1/5` 假象为"跨仓值不同",实际是键序变了。误导排障方向(会去改 canon-numbers.json 的值而不是重排回来)。② 加一条新链(如 solana)时若开发把它插在 trc20/bep20 之间,同样 seed=null,值实际正确却被拦。修法:用现成的 `parseNumberRecord(src, 'networkConfirmFeeUsd')` 得到 `{trc20, bep20, erc20, ...}` dict 后逐键 expectNumber,顺序 & 新增链都无影响。~5 行改动。

### [P2] scripts/canon-sentinel.mjs:309
**PHASES id 正则 `"(P\d)"` 只覆盖单数字,phaseCount==6 硬编码耦合**

- 依据:L309 `/id:\s*"(P\d)"[\s\S]*?nexFeeOffsetRate:\s*([\d.]+)/g` 中 `\d` = 单个数字,只匹配 P0-P9。L313 硬编码期望 phaseCount == 6。若 PRD 未来加 P7-P9 属于合法扩展,只要同步改 canon-numbers.json 就行,但 sentinel 的 6 是无档案的常量。若加 P10+ 则正则+计数两处都要动。
- 场景:① 加 P7 但忘记改 sentinel 里的 6 → phaseCount!==6 硬失败,提示信息是"expected 6 phases, got 7",看着像 sentinel bug 而非 canon 未同步 —— 排障绕弯。② 加 P10 → 正则 `"(P\d)"` 漏掉它,phaseCount=6(P1-P6 不变),沉默通过。修法:正则改 `"(P\d+)"`,phaseCount 期望值改成从 canon.withdrawal 或 canon.phaseIds 派生。当前 canon-numbers.json L99-108 withdrawal 块没有 phase 清单,加一个 `phaseIds: ["P1".."P6"]` 或 `phaseCount: 6` 字段作为单源。~3 行。

### [P2] scripts/uniapp-persona-walkthrough-proof.mjs:272
**L272 vacuous `.nx-withdraw-address-input` negative assertion — class does not exist in codebase**

- 依据:Grep across D:/WORKS/PLAN/Nexion-uniapp/src for `nx-withdraw-address-input` returns 0 matches — the class was never used (only nx-withdraw-rebind-entry / nx-fee-offset-switch / nx-withdraw-submit-cta actually exist in wallet-withdraw.vue). The assertion `addressInputGone: !document.querySelector('.nx-withdraw-address-input')` therefore returns `true` unconditionally. The intent is enforcing SPEC-4.4.3 single-bound-address principle (no free-text USDT address entry post-KYC), but the check has no teeth. The positive `boundAddressShort` includes-check (L268-270) proves the read-only address renders but does NOT prove absence of an additional editable address input. Suggested fix: assert `Array.from(document.querySelectorAll('input.uni-input-input')).length === 1` on KYC-verified state (amount is the only expected free-text input) OR add positive assertion `Array.from(document.querySelector
- 场景:Regression: developer resurrects prior free-text address input under a different class name (e.g. `.nx-address-entry` or no class). Walkthrough reports GREEN because `.nx-withdraw-address-input` still returns null AND `boundAddressShort` still renders (both coexist). Users can now type a wrong-network address and lose funds. SPEC contract silently unenforced.

### [P2] scripts/uniapp-persona-walkthrough-proof.mjs:266
**L266 `inputValues[0] === '50'` only checks first index, no length assertion**

- 依据:L260 collects `inputValues: Array.from(document.querySelectorAll('input.uni-input-input')).map(...)`. L266 only asserts `seeded.inputValues[0] === '50'`. If a regression injects an extra `input.uni-input-input` AFTER the amount input, the array becomes `['50', '<other>']` and the assertion still passes. This compounds with F1 (vacuous address-input check) — together they leave the 'no extra editable field on withdraw form' invariant unenforced. Add `inputValues.length === 1` in this KYC-verified state.
- 场景:Any refactor that reintroduces a second free-text field (destination memo? tag? off-network reference?) after the amount input is a silent slippage. The walkthrough passes; the extra field could steal user attention or accept wrong data.

### [P2] scripts/uniapp-persona-walkthrough-proof.mjs:324
**L324 `hasAmount: body.includes('$50.00')` is a whole-body substring — passes vacuously if $50.00 appears anywhere on tracking page**

- 依据:The tracking page (`wallet-withdraw-tracking.vue:57`) renders the hero amount as `${{ wd.amount.toFixed(2) }}`. The persona asserts `body.includes('$50.00')` on the entire body. If a promotional card, ETA offset comparison, or 'you saved $X' snippet ever renders `$50.00` (a common round number), the assertion passes even if the hero renders `$500.00`, `$5.00`, or no amount at all. Scope the check to the hero — e.g. `document.querySelector('[data-track-amount]')?.textContent?.includes('$50.00')` or query the `amountStyle`-bearing text.
- 场景:Regression: hero amount rendering bug drops the amount but any secondary card contains `$50.00`. Walkthrough passes; user opens tracking and sees an empty/broken amount hero. Analogous concern for `hasTrackingId` (broadly scoped regex, less likely to false-positive because WD-YYYYMMDD-NNNN is more unique).

### [P2] scripts/uniapp-persona-walkthrough-proof.mjs:304
**L304 regex `/Will use 3 NEX/` is exact-single-space — trivial i18n edit adding whitespace around `{nex}` breaks it silently**

- 依据:en.ts:3529 `feeOffsetOnFull: "Will use {nex} NEX · the fee is fully covered ($0.00)."` — currently interpolates to `Will use 3 NEX · ...` (single spaces). Regex `/Will use 3 NEX/` requires exact single-space match. whyRisky in the audit prompt explicitly flagged this: a copy edit to `"Will use  {nex}  NEX"` (double space, plausible tweak) makes waitForEval time out — misleadingly reporting the offset toggle as broken when the copy just changed. Change to `/Will use\s+3\s+NEX/` for whitespace tolerance without weakening the numeric assertion.
- 场景:i18n team tweaks spacing for CJK line-break aesthetics or accidentally adds Unicode NBSP (U+00A0) instead of ASCII space. Walkthrough throws timeout with confusing 'toggle recalcs quote' failure that points at code, not at the copy. Debugger burns time hunting a nonexistent code regression.

### [P2] tests/d5-withdrawal-limits-closure-contract.test.mjs:27
**D5 UI amplifies-direction assertion only covers TRC20, not BEP20/ERC20**

- 依据:L26 注释说「放大方向 = 任一网络确认费调低」,但 L27 只 assert.match(page, /feeTrc < params\.networkConfirmFeeUsd\.trc20/) —— 三网络中只锚 TRC20 一条。d5-params.tsx L172-176 实际实现是 `feeTrc < ... || feeBep < ... || feeErc < ...` 三网络 OR;若有人重构时把 feeBep/feeErc 那两行删掉,本 assertion 仍会通过(TRC20 那行还在)。wd02 test 与 d5 test 均未补齐 bep20/erc20 UI amplify 断言。同期的行为测试(wd02 L160-164 值域三值分别测)对三网络逐一红测充分,只有 UI amplify direction 这一处只测 1/3。
- 场景:① 开发者 refactor d5-params.tsx 时误删 feeBep/feeErc amplify 分支,只保留 feeTrc → 契约测试全绿通过。② 运营员调低 BEP20/ERC20 确认费 → UI 判定 amplifies=false → 提交前弹窗展示「方向:收紧资金流出,不受覆盖率红线阻断」而不是「放大流出,服务器将强制校验 B1 红线」。③ server 侧仍会强制校验(下游 D5 API 用 authoritative amplifies 计算),但运营员没看到「B1 红线预检」的心智提示,可能在不理解风险的情况下批量提交。修法:增加 `assert.match(page, /feeBep < params\.networkConfirmFeeUsd\.bep20/)` 与 erc20 同款,或改成一条正则 `/feeTrc <[\s\S]{0,120}feeBep <[\s\S]{0,120}feeErc </` 锚定三值同在 OR 表达式中。

### [P2] docs/cgm/cgm.manifest.json:1714
**CGM manifest.json 提到的确认费种子值(TRC20/BEP20 $1、ERC20 $5)未与 d-client 单源联动**

- 依据:L1714 querySurface prose 内嵌硬编码字面量:「固定网络确认费 networkConfirmFeeUsd[网络],TRC20/BEP20 $1、ERC20 $5」;L1829 及 L1830 frontendField/frontendSource 也重复这套种子描述。这些字符串没有任何机器门(scripts/canon-sentinel.mjs L297-318 只对 uniapp product-phase / platform-config 与 admin d-client 三源做 parity,不扫 cgm.manifest.json 的 prose)。whyRisky 已承认「text-only 更新风险低」,但一旦种子调整,prose 会静默陈旧。
- 场景:① 未来运营根据 B1 覆盖率需要把 D5_NETWORK_CONFIRM_FEE_DEFAULT 从 {trc20:1,bep20:1,erc20:5} 调到 {trc20:1.5,bep20:1.5,erc20:6} → d-client + uniapp 两侧被 canon-sentinel 强制同步。② cgm.manifest.json prose 因为没有机器门,保留 TRC20/BEP20 $1、ERC20 $5 描述。③ 后端接线 review 时以 CGM 为「运营字段级覆盖矩阵」权威(该文档定位如此),按 $1/$5 建接口 mock、写单测 → 上线后与 D5 权威值不一致,提现费快照 D2 财务不变量 |actualFee - max(0, confirm - nexBurned*nexOffsetRate)| > 0.0001 触发 D2_RESPONSE_INVALID:financialInvariants,所有新单被 100% 拒。修法:在 scripts/canon-sentinel.mjs 加一个哨兵 —— grep cgm.manifest.json 中 `TRC20/BEP20 \$([\d.]+)、ERC20 \$([\d.]+)` 数字,与 D5_NETWORK_CONFIRM_FEE_DEFAULT 逐键对比;不等则失败。或者更简单:把 prose 里的具体数字换成「按 D5_NETWORK_CONFIRM_FEE_DEFAULT」这类指针式描述,把值本身留给单源。

### [P2] Nexion-uniapp/src/pages/store/checkout.vue:692
**checkout / tradein-sheets: direct assignment to app.devices bypasses store encapsulation and skips syncDeviceRuntime cleanup until persist**

- 依据:Six sites write to app.devices directly from outside the store: checkout.vue:692 `app.devices = app.devices.filter((d) => d.id !== ti.device.id);` (trade-in inside the confirmed step), tradein-sheets.vue:475, 483, 519, 583, 593 (all inside rollback and 'Keep & buy' paths). This mutates the store's exposed ref without going through any store action, bypassing (a) deviceTimers cleanup — the removed device's id lingers in the module-level Map (app.ts:53) until adoptAccountSnapshot's syncDeviceRuntime call (app.ts:340-356) runs, which only happens on the very next persistAccountSnapshot; if that persist throws or is otherwise skipped, deviceTimers leaks and lastTickAggregate.usd/nex still includes the removed device's todayEarnings so the next positive delta is 0 (earnings appear frozen). (b) The store's own device CRUD action deactivateDevice(id) does the proper cleanup atomically (activate
- 场景:Trade-in in checkout completes debitBalance($chargeTotal) succeeds at line 681, then line 692 sets app.devices to filter out ti.device.id. Line 693 calls app.persistAccountSnapshot() — if this throws (writeTable failure in storage-full scenario), the filter has ALREADY mutated the in-memory ref; deviceTimers still holds the old-device timer; lastTickAggregate still counts its todayEarnings. tickOrders (App.vue:215) runs every 6s and can call app.devices' iteration logic against the stale timer map. Next settle() computes positiveUsdDelta = max(0, aggregateToday(without old device) - lastTickAggregate(with old device)) = 0 until other devices earn back the removed device's todayEarnings — user's earning display freezes for however long that takes. Same failure mode in the 5 tradein-sheets sites when their persist path throws.

### [P2] Nexion-uniapp/src/store/account-scoped-storage.ts:22
**staking / orders / bills persist via writeAccountRow last-write-wins — cross-tab writes silently overwrite each other, positions and bills can be lost**

- 依据:writeAccountRow (line 22-33) does raw read-modify-write with no merge: `const raw = uni.getStorageSync(tableKey); const table = raw?{...raw}:{}; table[key] = row; uni.setStorageSync(tableKey, table);` — the row is replaced wholesale from the caller's in-memory copy. staking.ts:91-93, orders.ts:130-132, bills.ts:140-142, exchange-v3.ts:83-92, wallet-pairing.ts:111-122, free-trial.ts:147-158, voucher.ts, deposits.ts:98-103 all use this pattern. In contrast, account-cloud.ts (mergeAndWriteAccountSnapshotResult) does 3-way diff with additive-merge / rank-monotone / identity-key merge to survive cross-tab concurrency (see the extensive comments at withdraw store 296-321). The team clearly knows the shape of the problem — but only applied the fix to app-store (money) and left every other list-shaped store on last-write-wins. Result: two tabs concurrently staking, ordering, taking bills, etc. c
- 场景:User opens two tabs and stakes in each tab within the localStorage propagation window. Tab A: positions.value=[A1, seedX], writeAccountRow writes [A1, seedX]. Tab B (hasn't yet observed A's write via storage event): positions.value=[B1, seedX], writeAccountRow writes [B1, seedX] — A1 is GONE from storage. Meanwhile app.debitBalance was called from each tab on the account-cloud additive-merge path, so each $500 debit correctly adds up to -$1000 total balance. Result: user's balance is -$1000 but only B1 exists in the staking list — A's $500 stake vanished. On refresh both tabs hydrate positions=[B1, seedX]; A1 is lost forever. Same shape applies to bills.add (two tabs each add a bonus row → one bill vanishes) and orders.createOrder (one order vanishes).

### [P2] Nexion-uniapp/src/store/staking.ts:17
**staking.ts endpoint slug diverges from PRD §9.11e (/api/stakes/ vs /api/staking/)**

- 依据:Header L17: 'claim()/earlyWithdraw() route via POST /api/stakes/:id/{claim|early-withdraw}' — plural 'stakes'. L158: 'POST /api/stakes/:id/claim' — same plural. But PRD §9.11e (lines 3763–3765) uses singular: POST /api/staking/open, POST /api/staking/:id/claim, POST /api/staking/:id/early-withdraw. Rule 2: same conceptual endpoint but the strings don't match — grep-based scans (either 'find all callers' or 'PRD needle in code') will silently miss one side.
- 场景:Backend wires /api/staking/... per PRD; client comment implies /api/stakes/...; PRD-vs-code parity linters miss the pair; cutover reveals two endpoints diverged by a single letter, both plausible-looking in isolation.

### [P2] Nexion-uniapp/src/components/staking/stake-sheet.vue:172
**stake-sheet.vue MOCK-ONLY composer comment omits the missing-rollback ceiling**

- 依据:L172–173: '⚠️ MOCK-ONLY CROSS-STORE MUTATION (NON-ATOMIC): debit + stake + bill. PRODUCTION: POST /api/staking/open (PRD §9.11e) is one atomic transaction.' Comment truthfully names the 3 mutations, but code (L165→ debit, L174 → staking.stake, L175→ bills.add) has NO rollback: if bills.add returns null (persist failure — see bills.ts L156 which does return null on persist failure) or staking.stake throws, the debit is already committed and there is no app.creditBalance(cost) recovery. Contrast with same-project purchase-sheet.vue L172–182 which explicitly rolls back on !r.ok. Rule 6 wanted 'failure rollback + failure toast'; the annotation should call this ceiling out (per ponytail comment-with-ceiling pattern used elsewhere in the tree) since MOCK-ONLY readers will assume PRD's atomic tx will fix it — but that leaves the mock with a silent debit-with-no-bill window today.
- 场景:Under storage pressure (quota full / private-mode / iOS Safari lockdown) bills.add persist fails → bills.value already reset (see bills.ts L157), but stake position AND balance debit both remain. User sees stake open, balance down, no bill row — the same 'ghost withdrawal' pattern the wallet-withdraw fix was designed to prevent.

### [P2] Nexion-uniapp/src/store/orders.ts:277
**orders.ts tickOrders comment lacks specific endpoint (weak Rule 3)**

- 依据:L276–279: 'MOCK-ONLY: client unilaterally progresses orders through provisioning with a Math.random()<0.45 gate. PRODUCTION: server pushes order status changes; client only reflects server state.' No specific endpoint at this call site. File header L13 does mention GET /api/orders/:id, and PRD L1825 says 'SSE GET /api/orders/:id' — so the endpoint exists in PRD, but the tick site itself doesn't cite it. Rule 3 wanted specific POST /api/{module}/{action} at each MOCK annotation. Weakness (not a P1 because the header is correct); worth tightening to 'PRODUCTION: SSE GET /api/orders/:id (PRD §7.x) — this tickOrders() deletes entirely.'
- 场景:New contributor reading only the local comment doesn't see the SSE contract, may re-implement client-driven polling when wiring production or forget to delete tickOrders during cutover.

### [P2] src/pages/me/wallet-cards-new.vue:134
**safeReturnTo — 已修(主链) / 半修(wallet-cards-new 局部重复实现)**

- 依据:共享 routing/safe-return-to.ts:13-24 已收口(拒 http/https/协议相对/js/data/vbscript;必须 / 开头)。complete-sign-in.ts:6,127 import + 使用共享;risk-disclosure.vue:95,107 import + 使用共享;login.vue:183 把 o.return 写入 returnParam 后传给 completeSignIn(经共享 helper 收敛,安全)。**但 wallet-cards-new.vue:134-137 自定义了同名 local function safeReturnTo(raw){ if raw.startsWith('/pages/') return raw; return fallback }**,shadow 掉共享 helper —— 语义上更严格(只允许 /pages/)所以不构成开放重定向,但违反 DRY 与「同型 grep 全站补 caller」纪律;将来共享 helper 收紧(如允许 hash/query 白名单),本文件不会跟随。修法:删本地函数,改 `import { safeReturnTo } from '@/routing/safe-return-to'`。
- 场景:非安全洞;若共享 helper 未来放开策略,本处不会同步 → 语义分叉。

### [P2] admin-ops/next.config.ts:66
**安全头覆盖动态路由 — 已修**

- 依据:next.config.ts:66-73 `headers()` 返回 `source: '/(.*)'` catch-all,覆盖所有 App Router 动态段(含 [[...path]] catch-all);CSP/X-Frame-Options: DENY/X-Content-Type-Options: nosniff/Referrer-Policy/Permissions-Policy 全部路由生效。Nexion-admin-prototype/next.config.ts:65-72 同款配置。HSTS 通过 `IS_PROD ? [{...}] : []` 只 prod 挂载。

### [P2] admin-ops/next.config.ts:12
**CSP dev-only 分裂 — 已修**

- 依据:next.config.ts:12-20 `IS_PROD` 三态分裂:prod script-src 掉 unsafe-eval;dev connect-src 允许 http:/ws:/wss: 以支持 HMR;两侧都保留 unsafe-inline(Next runtime bootstrap 必需)。CSP dev/prod 分裂正确;HSTS 只 prod(第 57-59 行)。

### [P2] src/i18n/messages/en.ts:3128
**i18n meta 词残留 — 已修**

- 依据:grep -iE '庞氏|杀猪盘|ponzi|反向教育|conversion.*layer|揭穿|套路|反诈' 命中:en.ts:3128 是 `// ─── v3 reverse-Ponzi sample namespaces ───`(代码注释,非运行时 string);zh.ts:3065 同类注释;zh.ts:2704 `heroTitle: 按实时市价把 NEX 换成 USDT(或反向)` 里的"反向"=swap 方向(NEX↔USDT),非 meta。**用户可见 i18n 值 0 meta 泄漏**。checkout.vue:474 最新 commit 0aedb3b 把 `funnel` 注释改成 `checkout`,收口的哨兵已挂。

### [P2] src/store/product-phase.ts:143
**dev guard(_dev*/setPinned/replay-tour)— 已修(核心 double-guard)**

- 依据:product-phase.ts:143-172 双向 guard —— hydratePinned() 读 IS_PROD ? null 阻止 localStorage 篡改;setPinned() 首行 `if (IS_PROD) return` 阻止写。wallet-pairing.ts:161 `reset()` 首行 `if (import.meta.env.PROD) return` store-layer 二次守卫(page-layer 已在 wallet-withdraw.vue:57 `v-if="devMode"` + :425 `devMode = import.meta.env.DEV && options?.dev === '1'` 三合取门后)。spec7-dev-bridge.ts:15 / auth-otp.ts:464 mountAuthOtpDevBridge / complete-sign-in.ts:36 _devHasCompletedSignIn 均 `if (!import.meta.env.DEV) return`。**双层 guard 全覆盖**。

### [P2] src/pages/register/register.vue:518
**跨 store 原子注释完整性 — 已修(主要资金/权限路径)**

- 依据:register.vue:518-522 完整列出 7 步 mutation:账号目录 pending → account-cloud → K1 风险身份 → 推荐绑定/礼包领取 → 奖励余额回执 → 两条账单 → active finalize;附带失败回滚(冻结 giftRef + 幂等补齐)。wallet-withdraw.vue:841-844 列出 debitNex + submitWithdrawal + bills.add 三合取 + 回滚。stake-sheet.vue:172 / marketplace.vue:312 / staking.vue:220,243 / purchase-sheet.vue:153 / genesis / trade-in-sheets.vue:456,514,567 均带 `⚠️ MOCK-ONLY CROSS-STORE MUTATION (NON-ATOMIC)` 标记。**rule 4 (creditBalance|debitBalance|addBill|push|spend|earn 同函数组合全列)已在 register / wallet-withdraw 两条最长链上落实**。

### [P2] src/:
**Marker 清理 — 已修**

- 依据:grep -rE 'FIXME|TODO|HACK|MARKER' src/ 命中 0 处业务 marker;唯 3 处 `NEXGRID-OG-XXXX` 是 i18n placeholder text(en/vi/zh invitePlaceholder,非清理目标)。ponytail/audit 未在源码留 marker。

### [P2] src/store/notifications.ts:32
**Notification priority retention — 已修**

- 依据:notifications.ts:32-50 PRIORITY_RANK + applyPriorityRetention 按 4 档 (critical 无上限 / high 50 / normal 200 / low 30) 桶容量;push() (line 101-143) 处理同 id 优先级 upgrade(高优先级重置 readAt + ts,unread+1)。card-notifications.ts:39 (unbound → normal) / :58 (rebind → high) 显式带 priority;nova-bubble.vue:128 push 不带 priority → 默认 normal(市场事件不需高优,合理)。**rule 7 (UI 显示值 = 接口返回值) 桶容量与排序全 server-canonical 化,前端只做展示。**

### [P2] src/store/staking.ts:26
**Staking 三套利率(rule 7) — 已修**

- 依据:staking.ts:26-49 STAKING_APY / STAKING_PENALTY / STAKING_MIN 三张 Record 是唯一单源;PRODUCTION 注释 :15-19 `POST /api/stakes/:id/{claim|early-withdraw}` 明确;所有消费者 (stake-sheet.vue:90,118,129,135,180,185 / staking.vue:133,206 / compound-calculator.vue:80,92 / vault-row.vue:43 propaged from :74-76) 一律 import STAKING_APY[term],无硬编码 0.12/0.35/0.80/1.80。position.apy 在 stake 时刻从 STAKING_APY[termDays] 落盘(line 134),后续 claim/earlyWithdraw 用 position 上的 apy — 正确锁定报价、避免运营改 APY 后老仓位重算。**3.6× 欺诈教训已收口。**

### [P2] src/store/auth.ts:53
**auth.ts 冷启 fresh-install 默认 isAuthenticated=true — 已修(demo-friendly,documented)**

- 依据:auth.ts:48-53 fresh install(无 localStorage 或 hydrate catch)默认返 `{ isAuthenticated: true, accountId: 'default', onboardingComplete: true }`,直开首页;line 52 明写 `Production seeds this from the real session (GET /api/auth/session)`。有 localStorage 时 line 32-40 已加 `resolveAuthAccountById` 目录复验,pending/非 active 手机号账号强制回 gated 状态 —— rule 8(localStorage 不持 authoritative)在有数据路径上已守卫;fresh-install 默认仅 mock 短路,PROD 由服务端 canonical。**非 P1**。

### [P2] src/auth/complete-sign-in.ts:35
**_devHasCompletedSignIn dead export — P2(cruft)**

- 依据:grep 全仓 `_devHasCompletedSignIn` 只命中定义处(complete-sign-in.ts:35),无 consumer。函数本身守卫正确(`import.meta.env.DEV && …`),仅为死导出;删可省 4 行(留亦无害,不算 rule 5 违反因守卫成立)。修法:删除或补 mountBridge 消费。

### [P2] docs/changes/2026-08-02-pkg-f-redtest.md:34
**本轮 pkg-A / F / I 修补 — 全部命中修补面**

- 依据:pkg-A (WD02 f3a5fa4):use-product-phase.ts 从 override+PHASES 分叉改为 resolveActivePhase 单路径 → server 复验同源(commit body:`pin-aware offset rate in server check`);sentinel-safe comment + fee-stale reject toast 补齐。pkg-F (TRIAL02 eb34b77):新增 scripts/selfcheck-trial-price-parity.mjs D1-D3 红测证据落 docs/changes/2026-08-02-pkg-f-redtest.md:34-52 (每条 cp 备份 → 单侧注入 → FAIL → 还原 → 绿);trial-config.trialPriceUSD 与 products[trialProductId].price 双源等值门装入 verify.sh TRIAL02 段 `trial02_price_parity`。pkg-I (AUTH03 e5af043):otpGate captchaAlwaysScenes 配置化(register 每次必滑),UI 场景 pin + worktree parity。**规格 → 实施 → 红测 → 哨兵 → verify 集成 5 环齐**。

