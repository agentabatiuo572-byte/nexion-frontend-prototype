# G7 original-request status query

Source candidate contract, 2026-10-14. Deployment and live original-request acceptance are separate requirements.

`GET /api/repurchase/orders/open-status?amountUsdt=<original amount>` uses normal authenticated USER access and the original `Idempotency-Key` header. The key is not placed in the URL. The controller derives the user ID from authentication; caller-provided owner, scope or environment cannot choose another user's record.

The service requires the existing canonical production runtime (`dev` or `prod`), validates a positive amount, and uses the same six-decimal HALF_UP normalized `OpenRequest` hash as POST open. It reads only the exact user's G7 open scope and key through the shared `recoveryStatus`/`selectCurrent` path. Expired retained states can be read without reclaiming or transitioning them.

Before parsing the amount, the service validates the original trimmed key (required, at most 128 characters). The controller passes amount text without constructing a BigDecimal. Text is at most 64 characters; parsed precision is at most 32, scale is -12 through 18, and integer digits are at most 12 before normalization or hash. After the existing six-decimal HALF_UP normalization, the amount must be positive and at most `999999999999.999999`, matching the canonical `nx_staking_position.amount_usdt DECIMAL(18,6)` range. Canonical historical amounts remain queryable independently of current product gates, minimum amount or balance. Bounded scientific notation such as `1e2`, plain `100` and `100.0000001` all retain the original `100.000000` request hash. Extreme exponent or oversized representations are rejected with a fixed amount-invalid code; their legal canonical amount can be used instead. POST open normalization is unchanged.

The existing API envelope contains only:

| Field | Meaning |
| --- | --- |
| `status` | `SUCCEEDED`, `FAILED`, `PROCESSING`, `UNKNOWN`, `NOT_FOUND` or `MISMATCH` |
| `repurchaseCommandProtocol` | `1` |
| `sourceEnvironment` | `PRODUCTION` |
| `runId` | Empty string |

The query cannot claim/reset/retry a command, execute a financial action, run `matureDue`, settle funds, return error text, return the key, or return/deserialise historical wallet/order receipts. FAILED describes a confirmed failed attempt; it does not identify the initial underlying rejection or SQL reason.

The App/H5 recovery button reads the existing durable key without acquiring a new one and issues only this GET. Uncertain/missing/mismatched states, read failures and account changes preserve the original unresolved intent. Only confirmed SUCCEEDED/FAILED may clear the local intent. The check never issues an automatic history GET or updates wallet/orders from a historical response. Normal history refresh has existing maturity-update semantics, so it is a separate user action and is not strict read-only diagnostic evidence. A new financial submission remains a separate explicit action with the normal confirmation.

Source: `AppRepurchaseController#openStatus`, `AppRepurchaseService#openStatus`, `AdminIdempotencyService#recoveryStatus`, `AdminIdempotencyTransactionExecutor#recoveryStatus`, `repurchase-api.ts#openStatus`, `store/repurchase.ts#checkPendingOpen`, and the recovery branch of `wallet-repurchase.vue`.

Mock service/controller/API/store and actual-template/handler checks cover ownership, normalized hash, fixed parsing/range/key boundaries, no business writes, no replay, terminal/uncertain status, amount above balance, unavailable product reads, three languages and late account changes. The actual controller/service/exception-handler chain rejects hostile queries before any record or business call. App/H5 full gates are required. These checks do not establish deployment, native/H5 business acceptance or completion of the original 100 request investigation.
