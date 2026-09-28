# Home Liquid Glass design

Generated with the built-in imagegen tool on 2026-09-28; no CLI/API fallback or model override. `reference.png` is the paired dark/light design. Production artwork: `src/static/img/home-glass-20260928/atlas.png`, 1536×1024 RGBA, six equally-sized cells. Native text, status and amounts are rendered from existing stores, never baked into the UI.

## Implementation contract

- At 390px: 16px gutters, 358px module width. Banner approximately 176px high; phone notice approximately 176px, centered copy and 44px pill; fleet uses two 173px columns with 12px gap and >=192px cards. Translated content may grow vertically. At320px retain two larger 138px slots; never collapse back to the old48px strip.
- All surfaces/palette/font/radius are existing `--v5-*` tokens. Dark lime and light blue follow the theme; device art remains neutral silver/graphite, with existing hardware LEDs only. No invented discount, SKU, status, urgency or financial number.
- Reference money values are illustrative snapshots; actual UI retains live values and original precision. The wide two-bay Pro silhouette in production artwork follows the product reference (the generated board's Pro resembled S1 and is not hardware authority).
- Atlas cells in reading order: coupon, phone, Cloud Share, Box S1, Box Pro family, Rack family. Production CSS clips cells, preserving alpha. Source images remain unchanged. PC GPU retains a generic computer glyph rather than pretending to be purchased hardware.
- Shared LiquidGlass optical layer provides the rounded rim. Decorative layer compresses under pressure and rebounds on release; text and hit areas stay fixed. Illustration motion is small and disabled under reduced-motion. Reduced transparency/strong contrast retain opaque readable surfaces.
- Existing coupon visibility/claim flow, phone policy, active inventory, earnings, cap, detail/manage/add destinations remain authoritative. The redundant icon strip+list becomes one card per device, one focus/action per card.

## Design board prompt

```text
Use case: ui-mockup
Asset type: final high-fidelity implementation reference for three UVEL mobile app components in dark and light theme.
Primary request: Design an exceptionally polished, precise mobile UI with Liquid Glass edge optics and physically beautiful hardware illustrations. Produce a flat front-on 2-column design board: left is dark mode, right is light mode. Each column is exactly 390 logical pixels wide, rendered at high resolution, with 16 px side gutters (358 px content). No phone frame, no extra explanatory labels.
Input images: references 1-5 are the existing UVEL hardware identity references: phone, Cloud Share rack, Box S1, Box Pro, Rack P1. Preserve their silhouettes and neutral graphite/silver finishes; show them as isolated miniature product renders in the device cards, without the reference backgrounds.
Color palette: DARK page #000000, card #141414, raised #1F1F1F, text #F5F7FA, secondary #9BA3B5, sole accent #9EDC1D. LIGHT page #F4F1E9, card #FFFFFF, raised #FAF7F0, text #13141A, secondary #6A6E77, sole accent #0E48E6. No purple, pink, red, orange, cyan or gold. Neutral silver glass is allowed.
Composition in EACH column, same geometry:
1. Coupon banner, 358 x 148 logical px, 28 px corners. Left two-thirds text and CTA; right a beautiful large floating pair of translucent silver-glass coupon tickets at a gentle 3D angle, rounded notched edges, restrained theme-colored specular reflections, NO value or discount printed. Banner solid readable surface with a subtle brand glow behind tickets, a fine neutral light rim. Exact text at left: title '你有可领取的代金券' (15 px semibold, two short lines if needed), sub '点击领取设备优惠' (12.5 px). Bottom-left a 44px high brand capsule CTA '领取' with right arrow. Tasteful, airy composition, no excessive shine.
24 px gap.
2. Phone setup notice, 358 x 148 logical px, 28 px corners, smooth neutral glass rim and softly tinted surface. Centered small smartphone outline icon near top. Centered message in two lines, verbatim '在 APP 中绑定并激活当前手机后，才能执行手机算力任务。' (13.5 px regular, readable). Centered full-width 44px high pill action '设置手机算力', 18px side inset, dark near-black text on lime or white text on blue. All text truly centered.
32px gap.
3. Fleet header, left '我的算力列队', immediately followed by small muted '5 / 6'; right a neutral small glass pill '管理 →' (44px touch height). Below a 2-column x 3-row grid, columns 173px wide, gap 12px, each card 182px high, 24px corners. Big neutral graphite/silver 3D hardware illustration in the center top (approximately 96px x 80px, no photos with rectangular backgrounds), a subtle elliptical liquid-glass docking plinth underneath, gently lit with brand light. A compact text status pill at top-right (no dot-only statuses). Bottom-left device name (13.5px semibold), beneath today earnings (18px semibold), and a subtle bottom-right arrow.
Cells in reading order:
phone (offline), title '你的手机', status '离线', earnings '+$0.040'.
Cloud Share reference, title 'Cloud Share', status '在线', earnings '+$0.000'.
Box S1 reference, title 'UVELBox S1', status '在线', earnings '+$75.60'.
Box Pro reference, title 'UVELBox Pro', status '在线', earnings '+$124.84'.
Rack P1 reference, title 'UVELRack P1', status '在线', earnings '+$514.25'.
Empty slot: a softly lit empty docking plinth with large plus sign, title '添加设备', no earnings and no fake status; quieter dashed neutral rounded border.
Materials: Liquid Glass, clear shaped edge reflections, restrained refraction on the plinths, thick smooth anti-aliased rounded contours. Content areas retain high opacity and crisp text. Refined premium product UI, NOT frosted blur, not neon gaming, no rainbow, no big blurry glows, no ornamental particles.
Typography: General Sans-like Latin and modern clean Chinese sans, weights 400-600. All buttons are fully rounded capsules. No other modules, no fabricated promises, no percentages, no invented labels, no new logo. Pixel-faithful implementable layout.
```

## Alpha atlas prompt

```text
Use case: product-mockup
Asset type: ONE production transparent PNG sprite atlas for a mobile app, exactly 1536 x 1024, 3 equal columns by 2 equal rows, each 512 x 512 cell.
Primary request: Extract/recreate the six isolated illustrations from the supplied UI design board, with consistent high-end silver/graphite photographic materials and smooth Liquid Glass plinths. The board is style/composition reference only; remaining images are authoritative existing hardware shapes. Actual alpha transparent background, no checkerboard baked in, no rectangular floors or environment.
Fixed atlas placement (centers at 256,256; 768,256;1280,256;256,768;768,768;1280,768):
TOP LEFT: exactly two overlapping beautiful transparent thick-glass coupon tickets with softly rounded concave side notches, rear tilted -18 degrees, front tilted +8 degrees. Neutral silver crystal, smooth polished edges, white glints, subtle translucent body; absolutely NO letters, symbols, currency, numbers, logos or discount markings. No colored tint. Fits inside cell bounds x76..436 y80..420.
TOP MIDDLE: existing neutral dark titanium smartphone pair, front and back, matching phone reference. Standing upright on a wide, low, thin, clear optical-glass elliptical docking plinth. Overall artwork fits x588..948 y90..425.
TOP RIGHT: existing Cloud Share graphite three-bay horizontal server appliance, match its wide low shape and three vertical grille bays, a tiny #9EDC1D power indicator and tiny UVEL identity only. On a thin clear elliptical glass plinth. Fits x1100..1460 y100..425.
BOTTOM LEFT: existing Box S1 single-bay silver mini-tower, black grille front, match hardware reference precisely. Small UVEL letters only. On thin clear glass elliptical plinth. Fits x76..436 y595..935.
BOTTOM MIDDLE: Box Pro appliance, visibly wider than S1, TWO front black grille bays with a metal center divider, silver/graphite chassis. Preserve correct two-bay hardware shape, NOT another copy of S1. Small UVEL letters only. On thin glass elliptical plinth. Fits x588..948 y595..935.
BOTTOM RIGHT: Rack P1 wide low rack server, TWO big grille bays, mounting ears with handles on both sides; match existing reference. Small UVEL letters only. On thin clear glass elliptical plinth. Fits x1100..1460 y615..935.
Composition: every illustration centered in its cell, completely separate, NO overlaps between cells, no dividers, no labels, no UI cards, no buttons, no statuses or money. Each cell exactly 512px square. Glass plinth bottom is near 425px within each cell, objects centered above it. Camera consistent three-quarter front-right view, soft high-end product lighting, clean anti-aliased contours, readable silhouettes at 100px display size. Keep every object comfortably away from cell edges for CSS sprite use. Transparent neutral glass plinths work on black OR warm white background. Neutral greys, metallic silver, off-white, tiniest existing lime power LED; no rainbow, no dramatic colored beams, no fog, no background glow. Refined, tactile, believable hardware, not cartoon toys.
```

Board references: existing `src/static/img/devices/generated-phone-alpha.png` and UVEL v3 cloud/S1/Pro v2/Rack P1 media. Atlas references: generated board plus four hardware photos. One rejected atlas call exceeded the tool's five-reference limit; rerun with those five inputs, unchanged artwork intent. Generated alpha corner/gap verified zero.
