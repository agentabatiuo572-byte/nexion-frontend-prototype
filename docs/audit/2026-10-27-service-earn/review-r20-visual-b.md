# R20 independent UI/runtime review B — PASS

Reviewer B independently accepts the reviewed cards at **9.0/10 minimum** on final entry **assets/index-Bxu7X-7j.js**. **Open P0: 0; P1: 0; P2: 0** within the scope below. Earlier candidate failures are retained in the finding history; the earlier 8.8 GPU rating does not apply to the corrected final copy.

This is reviewer B's sign-off only. The author owns integration and the second independent review. B did not edit source, commit, push, reset demo business state, or operate the user's 5237 preview or another reviewer's tab.

## Scope and independent evidence

- APP worktree: D:/WORKS/PLAN/.wt/uvel-design-20261025-app, Git base e5810fc575eb95178da9519c8b1f281d978b2b6d with the author's R20 dirty changes.
- Own hidden CUA IAB tab, dedicated origin http://127.0.0.1:5243/preview. The old own 5240 page was navigated away before the scored isolated runs. No Chrome fallback was needed. ego-browser CLI was unavailable; it was not installed.
- Actual iframe: http://127.0.0.1:5243/?nx_device=off#/pages/earn/earn. The browser DOM independently reported assets/index-Bxu7X-7j.js for every final capture.
- Required views: 390×844 Chinese dark/light and 320×693 Vietnamese dark/light. Supplemental final GPU checks: 390 Vietnamese dark/light and 320 English dark/light.
- B opened the approved original PNG, independently scrolled the actual .nx-content.nx-scroll container, measured DOM bounds/text ink/touch targets, inspected own screenshots, and clicked all three CTA routes with real return actions. No author's or other reviewer's screenshots were used as evidence.
- The final build changes only the three GPU body strings. Per the user's instruction, the final pass targeted that copy and its layout rather than replaying unchanged CTA navigation. Exact coverage and inherited evidence are identified below.

Approved reference: [original 1536×1024 image](C:/Users/FL/.codex/generated_images/01a170cf-40d7-73f1-baa2-bd03f7eeb5bf/exec-c853a52e-4909-4ce6-a16f-26b832fc2ffa.png). Dark reference cards occupy approximately x31–737 and y111–395 / 410–695 / 709–985; light cards x800–1505.

## Per-card visual scores

These are independent manual ratings of model/glow/material, relative scale, native typography/layout, and CTA reproduction. They are not an automated pixel-similarity percentage. Intentional copy, business information and locale variants are preserved rather than treated as wrong text.

| Final live view | Phone | Staking | GPU | Own evidence |
|---|---:|---:|---:|---|
| 390 Chinese dark | 9.3 | 9.3 | 9.2 | [full phone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-dark-zh-390.png) |
| 390 Chinese light | 9.3 | 9.3 | 9.3 | [full phone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-light-zh-390.png) |
| 320 Vietnamese dark | 9.0 | 9.2 | 9.1 | [overview](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-dark-vi-320.png) / [lower](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-dark-vi-320-lower.png) |
| 320 Vietnamese light | 9.1 | 9.2 | 9.2 | [overview](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-light-vi-320.png) / [lower](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-light-vi-320-lower.png) |
| 390 Vietnamese dark, supplemental | — | — | 9.2 | [GPU copy check](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-dark-vi-390.png) |
| 390 Vietnamese light, supplemental | — | — | 9.3 | [GPU copy check](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-light-vi-390.png) |
| 320 English dark, supplemental | — | — | 9.1 | [overview](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-dark-en-320.png) / [lower](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-dark-en-320-lower.png) |
| 320 English light, supplemental | — | — | 9.2 | [overview](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-light-en-320.png) / [lower](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/final-light-en-320-lower.png) |

**Phone:** the approved tilted black phone, silver sidewall/pedestal, orbit/sphere and transparent emissive chips are present. The pedestal rim and spill are chartreuse in dark and electric blue in light. The top bezel remains visible after the bounded vertical mask. At 320 Vietnamese the two-line heading makes the card taller and the model less dominant than the reference, accounting for the lower score.

**Staking:** the glass cube, three silver U coins, distinct polished highlights, luminous top/right edges and floor reflection remain recognizable at both widths. This is the approved cube, not a substitute model or tinted circular disk. Narrow rendering softens the smallest glass/coin details.

**GPU:** the reference fan/blade geometry, angular silver housing, two orbital arcs, detached sphere and reflected floor light are retained. The bottom/left orbit tail is softer under the CSS edge mask than in the original raster. The final short body stays separate from the artwork in every checked locale; no stranded “位。” or “toán.” remains.

## CTA comparison with the approved image

The rejected heavy green double edge is gone. Final dark CTAs have one thin, subdued yellow-green rim with restrained light on the right/lower area and no broad external neon halo. Light CTAs use a pale-blue translucent fill, fine blue rim and dark text/arrow. The visible pills retain the reference's slim proportions and horizontal arrow layout.

Approximate reference pills are 200×62px for phone/staking and 240×62px for GPU. At the 390 card's width ratio of 358.31/706, that corresponds to roughly 102×31.5px and 122×31.5px. Measured final Chinese visible pills are 101.99×32.00, 99.98×32.00 and 123.99×32.00px. Their interactive wrappers are about 44px high. This is close to the reference's apparent size while retaining a larger invisible hit area.

The final native button text is 12px / weight 500 / 16.8px line-height; the arrow is a native SVG. Native glyph rasterization, the rim gradient and blur are not identical to a baked image. These residual differences prevent a 10/10 or pixel-perfect claim.

## Final geometry and copy boundaries

All values below are CSS pixels from the live iframe. A reported 43.996px is the browser's subpixel representation of the 44px hit target at the existing browser zoom.

| View | Card width | Heights: phone / staking / GPU | Art window | Titles | CTA hit widths: phone / staking / GPU |
|---|---:|---|---|---|---|
| 390 Chinese, both themes | 358.31 | 150.68 / 150.68 / 150.68 | 185.69×139.26 | 20px / 24px | 101.99 / 99.98 / 123.99 |
| 320 Vietnamese, both themes | 288.01 | 189.38 / 167.78 / 148.29 | 140.53×105.40 | 18px / 21.6px | 111.90 / 108.92 / 109.05 |

Body text remains 13px / 19.5px. All listed hit targets have about 44px height and their visible pills about 32px height. The card x coordinate is about 15.99 in both widths. The 390 native card is about 6.5px taller than a strict width-scaled reference; 320 locale wraps increase the phone/staking height. These are native responsive layouts, not stretched whole-card screenshots.

| Final GPU copy | Tested widths/themes | Body lines | Text ink right | Art left | Clear horizontal gap |
|---|---|---:|---:|---:|---:|
| 闲置 GPU · 占 1 个槽位 | 390 dark/light | 1 | 164.57 | 186.01 | 21.44 |
| GPU nhàn rỗi · 1 khe | 390 dark/light | 1 | 151.68 | 186.01 | 34.34 |
| GPU nhàn rỗi · 1 khe | 320 dark/light | 1 | 145.67 | 160.87 | 15.20 |
| Idle GPU · 1 slot | 320 dark/light | 1 | 120.69 | 160.87 | 40.18 |

No document/card horizontal overflow was measured. At 320 the overview scroll leaves the GPU CTA behind the existing fixed navigation; ordinary lower scrolling exposes the complete card/button. In the lower captures all three CTA center hit tests resolve to their own button. The English GPU CTA is 127.37×44px and remains inside the card. The model is pointer-events:none and does not steal the control target.

## Actual CTA navigation and inheritance boundary

| View/build actually exercised | CTA | Actual destination | Actual return |
|---|---|---|---|
| 390 Chinese dark, index-CPeHA444.js | 下载 APP | /pages/register/success?download=1 | Browser Back to earn |
| 390 Chinese dark, index-CPeHA444.js | 查看质押 | /pages/staking/staking | Visible 返回 to earn |
| 390 Chinese dark, index-CPeHA444.js | 查看连接方式 | /pages/compute-share/download | Visible 返回 to earn |
| 320 Vietnamese dark, index-CkMCrJTe.js | Tải ứng dụng | /pages/register/success?download=1 | Browser Back to earn |
| 320 Vietnamese dark, index-CkMCrJTe.js | Xem staking | /pages/staking/staking | Visible Quay lại to earn |
| 320 Vietnamese dark, index-CkMCrJTe.js | Cách kết nối | /pages/compute-share/download | Visible Quay lại to earn |

Own route evidence: [Chinese phone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/nav-dark-zh-390-phone.png), [Chinese staking](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/nav-dark-zh-390-staking.png), [Chinese GPU](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/nav-dark-zh-390-gpu.png); [Vietnamese phone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate3-nav-dark-vi-320-phone.png), [Vietnamese staking](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate3-nav-dark-vi-320-staking.png), [Vietnamese GPU](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate3-nav-dark-vi-320-gpu.png).

The Ck→Bxu delta is only three GPU body strings in remainder-ui.ts. The visual component SHA, earn page and compute-share entry SHA are unchanged; CTA labels, handlers, destinations, styles and the atlas are unchanged. The user explicitly authorized retaining the existing navigation evidence and performing only the final GPU layout recheck. Therefore navigation is inherited, **not represented as clicks rerun on Bxu**. Final Bxu theme/locale selections, scrolling, bounds and screenshots were performed live. No light-theme CTA click matrix or native-device tap/haptic claim is made.

## Earlier findings and closure

| Finding | Evidence/failing candidate | Final disposition |
|---|---|---|
| P2: heavy double CTA edge | BWD candidate, initial-dark-zh-390.png | Corrected in CP: single rim, lighter 12px text and restrained fill; preserved and seen on final Bxu |
| P2: 390 Vietnamese GPU body enters art fade area | CP, [own screenshot](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate2-dark-vi-390.png); text right 209.55 vs art left 186.01 | Reserved content column fixed this in Ck; final Bxu gap is 34.34px |
| P2: horizontal atlas crop edges in tall 320 dark cards | CP, [own screenshot](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate2-dark-vi-320-lower.png) | Ck bounded vertical masking removes hard top/bottom background transitions; final Bxu keeps the original rim/floor light |
| P2: Chinese GPU “位。” orphan line, GPU score 8.8 | Ck, [dark](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate3-dark-zh-390.png) / [light](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/evidence/r20/reviewer-b/candidate3-light-zh-390.png); GPU 170.18px vs other cards 150.68px | Bxu copy is one line; three Chinese cards are 150.68px. Supplemental Vietnamese “toán.” short tail also removed by the accepted shorter body |

No additional unresolved finding was observed. There is no open <9 item in the reviewed views.

## Exact final fingerprint

Hashes are SHA256 of the local final build/source files, independently read after the final READY. The live browser entry name was separately read from the iframe for every final screenshot.

| Item | SHA256 |
|---|---|
| dist/build/h5/assets/index-Bxu7X-7j.js | 288c2f9df8eda43fada80cea04beab3c20c00df21f0ea5628fe06f42829236e8 |
| dist/build/h5/index.html | 210897dc88744d996a68c1e563d5db7a96f357e075f5a7f3f9f0ef7fed25131f |
| src/components/earn/earn-way-card.vue | c576abde8a031b75fa61573b9355eb64059119dd0be8f92be40be822b135ce0d |
| src/pages/earn/earn.vue | 92d224c57696ec2d208d020e937acf3bdc21ce8be316e806fc1c4907a2eedf2d |
| src/components/earn/compute-share-entry.vue | 41233ad74b559db3a843ce4db2b3867a187d5a453040a2195cb06e15785cfb46 |
| src/i18n/remainder-ui.ts | 774f6662c5ed67c5e2a4185b4158264c92de78e0cd85bc88cb3a39adcfb31077 |
| Approved PNG and src/static/img/earn-20261027/design-art.png | 9cb9f6775a878b66f3d3c40bc8b86cb6f840898e9401024aefe818e82c8d40f1 |

Historical fingerprints retained: CP entry c34b3ef0cb9a1ec84a4168d6c94ccbcb033f8378942edabe9bc79aeaa422c265, CP earn-way-card source 11897e14e7d3a93b5d0a1255652c1b383172b99403ffe8c60cce2dd855fa4b91; Ck entry 1f02d5dbfdea828a6139abd87d4550e20095409d9f613803aa4a781ae6054001 and source c576abde8a031b75fa61573b9355eb64059119dd0be8f92be40be822b135ce0d. Earlier files are not relabeled as final-build execution.

## Limits and evidence integrity

The approved PNG is byte-identical to the atlas asset. The displayed crop is resized and masked: top/bottom/side blending softens the farthest glow and orbit/floor tails. Native copy, controls, fonts, card height and responsive wrapping are rebuilt. **Unchanged raster does not mean an unchanged rendered whole card; this is not a pixel-perfect claim.**

All final-* screenshots were captured by B from Bxu on 5243. Full phone dimensions are 390×844 or 320×693. CDP capture coordinates/scale compensate for the existing 1.1 browser zoom; screenshots were not retouched or composited. Earlier initial-* files from shared 5240 are historical preparation only; scored evidence uses dedicated 5243. B writes only this report and own evidence/r20/reviewer-b screenshots.

This is an APP-source browser preview with local demo data, not APK/IPA installation or Android/iOS native-device certification. Phone navigation reaches an unavailable-download state; GPU navigation reaches an explicit fixture URL. No actual download/install, GPU pairing, payment/staking submission, backend behavior, native haptics, or full verify result is claimed.

Final capture interval (UTC): 2026-10-27T06:09:57.554Z through 2026-10-27T06:15:46.549Z. Source/build fingerprint read: 2026-10-27 15:09:50 JST, with final readback at report validation.

Final validation at 2026-10-27 15:19:25 JST: all 22 linked evidence images exist; all 12 final captures have the stated 390×844 or 320×693 dimensions; all six final build/source readback hashes match the table. The temporary own-tab viewport override was cleared and B's hidden tab closed. Preview servers and other tabs were left running.
