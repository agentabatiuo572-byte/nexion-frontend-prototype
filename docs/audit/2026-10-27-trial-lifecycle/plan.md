# Trial lifecycle implementation and acceptance

Owner: current trial chat. APP base: e5810fc575eb95178da9519c8b1f281d978b2b6d, fetched origin/test. Backend base: 090a7e5032a8f6e781150201ce51005d554890de, fetched origin/test. Both use detached isolated worktrees; original WIP, earnings-card changes, support changes and preview 5237 are outside scope.

Inputs: delegated user requirements (persistent benefits card, activation feedback, early purchase, trial fleet item); docs/audit/2026-10-25-ux-audit.md plus final approved choices in 2026-10-25-ui-design-implementation.md; existing trial state/start/convert/cancel implementation; PRD/UVEL_试用生命周期与队列_20261027.md. User's later browser annotation removes the extra text below the estimated-credit block in all three languages.

## Dependencies and acceptance

1. Contract: verify actual backend lifecycle, claim-owned credit and purchase settlement. Keep economic values and repeat-eligibility policy. Accept only server-confirmed claim/conversion; estimates never become wallet balances. Verify parser, current split, price drift, quote increase, stale account, failed command and retry.
2. Presentation: persistent benefit card; confirmation, activating, success and retry; active/grace/ended/converted; independent trial row on Home/Earn/management with details and early-purchase path. Trial never becomes a fabricated purchased asset. Count actual occupied physical slots plus exactly one trial; preserve all purchased devices. Targeted rendered SFC and store tests precede browser integration.
3. Capacity: one production/account trial reservation shared across acquisition paths. Claim and ordinary acquisition obey the same cap; conversion substitutes its own reserved slot. Actual isolated MySQL and service tests verify full-capacity, terminal, deleted, other-account and current-read behavior. Independently review backend diff and test isolation.
4. Integration: current APP production bundle, isolated loopback demo 5251, 320/390 × zh/en/vi × light/dark. Exercise claim→readback→success→reload→queue→details→checkout, management, expiry, conversion and failures. Measure text/control bounds, indicator spacing, touch targets and reduced motion; save current source/build fingerprints and screenshots. Then two independent reviewers assess both requirements; below 9 requires repair/review.
5. Delivery: sync PRD and product log; run the targeted checks, builds and actual UI acceptance required by current worktree AGENTS (2026-10-21). Full verify is optional; do not claim it passed when unrun, and keep known unrelated reds explicit. Before commit/push refetch and compare shared test, integrate only scoped changes without overwriting concurrent commits. Latest coordinated user direction: deliver this module's APP/backend to test, and leave all H5 synchronization to the main chat after its R20 queue and this module close. This chat must not sync or push H5.

## Minimal test cost and resources

- Inner loop: targeted Vitest/rendered SFC tests (seconds, <10MiB logs), one production bundle (tens of seconds, rebuildable dist), own loopback 5251 only.
- Runtime: serial scenarios, twelve fresh contexts; screenshots/report under .cache/trial-lifecycle/runtime, expected <50MiB. No full user dataset or original preview state copied/reset. Standalone images are retained only for acceptance/review.
- Backend: synthetic MySQL on owned port33329, each test creates/drops its own schema; temporary datadir ~114MiB, shutdown confirmed by implementer. No live account, production wallet, or real payment operation is used.
- Full verify: optional under current repository rules. Do not bypass hooks or convert unverified checks into pass. Targeted money/state, capacity, browser and native resource checks remain required for this scope.

## Artifact ownership and recovery

Keep both worktrees and backend patch/evidence until integration. Own preview5251 may be rebuilt using its own state snapshot; no other preview process may be stopped. .cache runtime evidence and synthetic backend datadir can be archived after independent review. All remaining blockers and unverified deployed/native behavior must stay explicit.
