# Genesis holder presentation and purchase receipt

Approved A3 presentation adds a gold holder badge and page-wide mineral textures. Dark mode retains the black/lime theme; light mode retains cream/blue. Existing UVEL artwork, empty state, holdings, pre-listing allocation, post-listing emissions and six holder rights remain driven by their existing stores.

A settled primary purchase opens a dismissible success dialog. Its “查看我的创世节点” action navigates to `/pages/genesis/holder`; pending or failed purchases never open it. The pending purchase sheet cannot be dismissed and reopened to reset its submission guard. The success dialog reuses the existing focus-management helper.

No prices, eligibility, settlement rules, allocation or emission calculations changed. The current frontend uses fixed mock mode; browser purchases below run only in disposable accounts. This is not evidence of a production payment transaction. No economic PRD changes are required for this presentation and receipt-navigation change.

`npm run test:genesis-holder` runs real browser actions in isolated contexts for Chinese, English and Vietnamese in both themes, 320/430px geometry, Arabic English fallback with a forced RTL layout stress test, all holder states, persisted purchase/readback, double submission, insufficient funds, closed/capped sales, dialog keyboard access, dismiss/reopen and focus restoration. Global automatic RTL remains outside this change. The command is registered in the full `npm run verify` chain. Runtime screenshots and assertions are written to the report directory printed by the command.
