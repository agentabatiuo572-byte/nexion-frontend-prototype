# Historical pause for owner restart

Resumed at the owner's request on 2026-10-27. This file preserves the pause snapshot; current acceptance is in [acceptance.md](acceptance.md), and exact final commits/remote readback are in [final-handoff.md](/D:/WORKS/PLAN/artifacts/uvel-trial-20261027/final-handoff.md). Per the latest coordinated user direction, H5 is reserved for the main chat; this module does not sync or push it.

User explicitly requested pause to restart on 2026-10-27. Do not resume implementation or testing until requested. All implementation/review agents were interrupted; no full verify, commit, push or H5 synchronization has been performed.

## Recovery locations

- APP detached worktree: D:/WORKS/PLAN/.wt/uvel-trial-20261027-app, base e5810fc575eb95178da9519c8b1f281d978b2b6d. Its origin is the formal nexion-frontend-uniapp repository, target test.
- Backend detached worktree: D:/WORKS/PLAN/.wt/uvel-trial-20261027-backend, base 090a7e5032a8f6e781150201ce51005d554890de, target test.
- Restart snapshot/backup: D:/WORKS/PLAN/artifacts/uvel-trial-20261027/pause/. It contains both tracked patches, scoped changed/untracked source backups and git statuses. Worktrees are still the primary implementation.
- Preview5251 state: D:/WORKS/PLAN/artifacts/uvel-trial-20261027/pause/preview-state-5251.json. This is local simulation state, never commit it.
- Independent preview5251 is still running (owned server session48754 at pause, PID20920). After an app/process restart, restore from APP tree using DEMO_PORT=5251, DEMO_STATE_FILE=<saved state file>, npm run preview:prototype. Existing dist/build/h5 is the latest APP-source browser build. Never stop/reset 5237 or other previews.
- Original5237 and other preview listeners5240/5242/5243 were still running at pause. Parent R20 earnings/support worktree was not edited. Only minimal trial queue lines in this isolated earn.vue changed; preserve parent WIP when integrating.

## Implemented and verified so far

- Persistent Home benefit lifecycle card, explicit claim/activation/success/retry, independent trial row on Home/Earn/management, correct one-slot count and preserved purchased devices. Trial stays outside app.devices[]. Early purchase uses existing atomic convert.
- Parser/store preserve server offsetUsdt/remainderUsdt/priceUsdt. Checkout uses claim price and canonical credit, fails closed on unknown quote, and does not quote vouchers unsupported by convert. EXTENDED estimated credit uses pinned earning duration. Known rejected start intent may retire only after authoritative nonactive readback.
- User browser annotation: removed the entire extra sentence below estimated-credit block, in all three languages, plus its unused copy/style. Confirmation button and existing estimate labels remain. Current production bundle includes this change.
- APP targeted tests: 179/179 passed in ten files at 15:36 JST. Type-check exit0, production H5 representation build exit0. These are browser artifacts from the APP source; no H5 repository synchronization occurred.
- Backend first pass:287/287 tests,0 skipped,including26 real isolated MySQL cases. Independent review found E5 and PC current-read/capacity gaps; implementer repaired them and reported214/214 targeted tests,0 skipped,including13 actual MySQL tests. Root also added reserved ordinary orders to ordinary device activation and verified its test class exit0. These sets overlap; do not sum them as a single suite count.
- Backend special MySQL33329 was cleaned and shut down; no listener remained at pause. Latest backend follow-up patch/snapshot export was interrupted, so re-read actual diff and XML before trusting older backend.patch fingerprint.

## Acceptance still open

1. Latest runtime-final report is FAILED, not an acceptance pass:320-zh-dark and320-zh-light completed, then English count assertion expected3/6 but actual localized text was3 of6. Fix locale-aware assertion and later wait-for-count; never weaken actual count3/cap6. Preserve failed report/screenshots. Earlier runtime-r2 quick390zhdark passed but predates final color/build changes and is not final evidence.
2. Visual reviewer found a current320 unclaimed-card P2: device illustration overlaps the claim button at bottom. Review screenshot .cache/trial-lifecycle/runtime-final/320-zh-dark-unclaimed.png, repair only local card geometry, then rebuild and rerun affected states plus final matrix. Final-day fixture now correctly shows11:59:58; prior stale fixture capture was fixed by forcing reload.
3. Full matrix320/390 × zh/en/vi × light/dark is unfinished. Actual simulated UI conversion/payment confirmation→order→three purchased devices→reload and duplicate protection still need independent browser verification; current runtime only reaches checkout. Do not claim real TEST HTTP/native/financial acceptance.
4. Both independent frontend reviews remain below9 and unfinalized. Business initially8.0/8.5; visual has current overlap finding. Re-evaluate current source/build after fixes; both requirements need two independent>=9 reviews. Third backend review needs to recheck the latest E5/PC repair against previous open BE-01/02/03 report.
5. Product log update and final PRD consistency check remain. Main PRD§5.4/5.6/9.11 and new UVEL_试用生命周期与队列_20261027.md already changed, but old neighboring trial API text may still need current-contract cleanup.
6. No full verify has run. Existing inner-loop baseline reds include seven free-trial.promo-visibility tests looking for a retired Me skeleton, eleven global a11y entries outside changed trial components, and old proof/product-card source contracts. Do not bypass hooks, suppress these, or claim full pass. Establish scope/reproduction before any repair.
7. Fetch shared remote test again before any integration; parent chat may publish concurrent R20/support changes. Do not force push or include parent WIP. APP and backend are uncommitted. No H5 sync/push until APP acceptance gates pass.

## Independent agents at pause

- trial_rules: original backend implementer, interrupted while exporting current patch/snapshot after reporting214/214 follow-up checks.
- trial_review_business: independent contract/UI reviewer; findings led to price/voucher/EXTENDED/intent fixes, still awaiting final matrix and actual conversion.
- trial_review_visual: independent visual/UI reviewer; final color rule is dark lime/light electric blue through brand token, UVT purple retained;320 image/button overlap remains open.
- trial_review_backend: initial independent backend review ended with open E5/PC findings; resume for latest repair review after owner asks to continue.

The work is paused with code/state preserved. It is not completed, not pushed, and not yet approved by the two independent reviewers.
