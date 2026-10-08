param([ValidateSet('Behavior','Integration')][string]$Suite='Behavior')
$ErrorActionPreference='Stop'
$taskRepo=Split-Path -Parent $PSScriptRoot
Push-Location $taskRepo
try {
  if (-not $env:NEXGRID_BACKEND_ROOT) { $env:NEXGRID_BACKEND_ROOT='D:/WORKS/PLAN/.wt/growth-promotions-prd-20261007-backend' }
  & node scripts/generate-promotion-contracts.mjs --check
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & npx.cmd vitest run src/api/promotion-api.test.ts src/api/order-api-list.test.ts src/api/wallet-bills-api.test.ts src/lib/promotion-checkout-session.test.ts src/lib/promotion-leave-guard.test.ts src/lib/promotion-display.test.ts src/lib/promotion-entry.test.ts src/lib/promotion-public-route.test.ts src/lib/home-task-carousel.test.ts src/routing/safe-return-to.test.ts src/auth/post-sign-in-route.test.ts src/auth/session-restore-route.test.ts src/lib/route.test.ts src/components/promotion/promotion-render.test.ts src/components/promotion/promotion-reward-list.behavior.test.ts src/components/promotion/referral-progress.behavior.test.ts src/pages/events/promotion-receipt-flow.behavior.test.ts src/pages/me/wallet-bills-precision.behavior.test.ts src/pages/me/rewards-state.behavior.test.ts src/pages/me/rewards-list-precision.behavior.test.ts src/pages/earn/device-detail-remote-fleet.contract.test.ts src/pages/store/order-detail-runtime.behavior.test.ts src/store/bills-pagination.test.ts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($Suite -eq 'Integration') {
    & npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
} finally { Pop-Location }
