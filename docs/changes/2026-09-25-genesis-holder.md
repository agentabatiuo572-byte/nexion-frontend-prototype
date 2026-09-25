# Genesis holder presentation and purchase receipt

Approved A3 presentation adds a gold holder badge and page-wide mineral textures. Dark mode retains the black/lime theme; light mode retains cream/blue. Existing UVEL artwork, empty state, holdings, pre-listing allocation, post-listing emissions and six holder rights remain driven by their existing stores.

The holder card uses a text-free background extracted from the supplied reference through the built-in image editing tool. Its obsidian texture, gold corners and lime network are rendered from `src/static/img/genesis/holder-card-background.png`, with a transparent outer glow. The card remains black/gold in both page themes; the original white UVEL wordmark and live text are overlaid in code. The six seat benefits use the personal center's centered icon-tile styling in a three-column grid. Activating a tile opens its existing description in the shared accessible dialog.

Asset prompt: remove the logo, badge, all text, numbers and data dividers; retain the supplied card's exact dark texture, gold rounded border, corner bloom and lime network; make the outside transparent. The supplied screenshot is a flattened image, so the obscured areas are inpainted rather than recovered source layers.

A settled primary purchase opens a dismissible success dialog. Its “查看我的创世节点” action navigates to `/pages/genesis/holder`; pending or failed purchases never open it. The pending purchase sheet cannot be dismissed and reopened to reset its submission guard. The success dialog reuses the existing focus-management helper.

No prices, eligibility, settlement rules, allocation or emission calculations changed. The current frontend uses fixed mock mode; browser purchases below run only in disposable accounts. This is not evidence of a production payment transaction. No economic PRD changes are required for this presentation and receipt-navigation change.

`npm run test:genesis-holder` runs real browser actions in isolated contexts for Chinese, English and Vietnamese in both themes, 320/430px geometry, reference card proportions, all six benefit dialogs, Arabic English fallback with a forced RTL layout stress test, all holder states, persisted purchase/readback, double submission, insufficient funds, closed/capped sales, dialog keyboard access, dismiss/reopen and focus restoration. Global automatic RTL remains outside this change. The command is registered in the full `npm run verify` chain. Runtime screenshots and assertions are written to the report directory printed by the command.
