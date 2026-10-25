# 团队素材生成记录 · 2026-10-26

使用内置 imagegen，transparent_background=true。参考是本轮团队重构稿 `D:/WORKS/PLAN/.wt/uvel-design-preview/design-proposals/2026-10-25-fidelity/team-overview-v2.png`，不是Claude原始七画板。原输出保留在Codex generated_images，项目复制为独立PNG；未把页面文字、金额或按钮烘焙进图。

## first-purchase-v2

接入文件：`src/static/img/team-20261025/first-purchase-v2.png`

完整prompt：

```text
Create a production UI asset on a genuinely transparent background. Use the attached full mobile design solely as the exact material and composition reference. Reproduce ONLY the small illustration at the right side of the 好友首购礼 card: one compact brushed silver UVELBox S1 server with black front ventilation grilles, tiny white UVEL wordmark, three-quarter view with its right side visible, standing on a polished thin silver round elliptical disk pedestal. A glossy chartreuse/lime ribbon gift bow sits at the lower-right of the server on the same pedestal, its tails drape over the pedestal edge. Match the reference server proportions, pedestal, silver metal and subtle lime reflections, luxury dark tech app art. No separate gift box. No typography outside tiny UVEL label, no UI, no card background, no floor rectangle, no stars/dots/background, no border. The complete device, bow, and round pedestal all contained within a square canvas with only 5 percent transparent margins. Fine subtle contact shadow only within the pedestal region. Asset will display at about 145 CSS pixels, so keep the server silhouette clean and bow clearly lime. Preserve true alpha transparency.
```

## invite-v2

接入文件：`src/static/img/team-20261025/invite-v2.png`

完整prompt：

```text
Create one production transparent PNG UI asset. Match ONLY the illustration on the right side of the invitation card in the attached UVEL mobile design, not the whole UI. A broad horizontal translucent smoky silver glass envelope, CLOSED flap with an elegant V fold, tilted clockwise by 12 degrees in three-quarter perspective. Glossy silver bevel edges. One large sharp chartreuse lime paper airplane placed in front of its upper-right corner, pointing up-right. A single thin lime elliptical orbital ring surrounds the lower envelope, two small luminous lime orbit nodes at opposite ends. The envelope is wide, not a tall upright opened envelope. No letters flying from it. Match the reference's exact horizontal silhouette, smoked glass/metal material, lime color #B4EB20, black/gray app premium tech aesthetic. No text, no UI, no black rectangle or background, no floor, no extra decorative objects. TRUE ALPHA transparent background, including inside the orbit. Center the complete envelope, plane and orbit with about 6 percent transparent margins, a 4:3 composition useful at 165px width. Preserve sharp legibility at UI size.
```

## members-v2

接入文件：`src/static/img/team-20261025/members-v2.png`

完整prompt：

```text
Create one production transparent PNG UI asset. Use the attached UVEL mobile design as the precise visual reference. Reproduce ONLY the small illustration in the right side of the 我的团队 member card: at its CENTER a clearly recognizable chartreuse lime person bust icon (spherical head and broad shoulder torso) inside a subtle smoky round glass medallion; surrounding it a tilted thin silver circular orbital path with FIVE small glossy metallic silver/graphite sphere nodes, and ONE small chartreuse node near the upper right. The central lime person must be unmistakable, not a sphere. Composition matches the original member card, slightly tilted 3D circle in frontal perspective with generous open spaces between the nodes. Silver glass/metal, restrained lime #B4EB20, high-end dark technology interface asset, clean non-toy proportions. No text, no UI, no square/rectangle background, no pedestal, no neon aura outside the icon; true alpha transparent background. Square canvas with the complete orbital system contained inside and only 6 percent transparent margins; crisp enough at 96px.
```
