# NexGrid 产品渲染图字样重制工具(2026-07-23 存档)

改名收尾 R6:两张 photoreal 设备渲染图机身旧品牌字样 → NEXGRID。两条路径都在此存档,**最终上线 = 路径① AI 重生成**(主人 2026-07-23 提供 key 后拍板);路径③本地合成为无 key 期间的过渡产物,留作应急回退。

## 路径① AI 重生成(最终采用)
- `gen-edit.sh` — 调 OpenAI `images/edits`,模型 `gpt-image-2`(key 读 `Nexion-uniapp/.env.local` 的 `OPENAI_API_KEY`;不支持 `input_fidelity` 参数)。每场景出 2 版备选。
- `make-masks.mjs` + `mask-box.png` / `mask-rack.png` — 编辑遮罩(alpha=0 的字样区=允许重画);遮罩坐标来自对原图的像素探测。
- ⚠️ edits 会**整图重绘**(灯光/细节微变,产品形态保真)——产出必须人工终检:字样逐字母拼写、GPU 标签、整体一致性。
- 上线记录:`ai-box-2` / `ai-rack-2` → `src/static/img/products/nexionbox-pro-v2.png` / `nexionrack-p1-v2.png`(2026-07-23)。

## 路径③ 本地确定性合成(应急回退,无 key 可用)
- `compose.html` — Playwright headless 合成页:手绘 SVG 字形库 + 克隆/合成擦除 + 渐变/挤出/辉光;`?scene=box|rack|debug`。
- `run-compose.mjs` — 渲染脚本,见文件头用法。
- 坑位备忘:SVG 纯水平/垂直单线 path 的 bbox 为零,`objectBoundingBox` 渐变整段不渲染 → 必须 `gradientUnits="userSpaceOnUse"`。

## 公共
- `box.png` / `rack.png` — 原始(旧字样)底图,两条路径的输入源。
- 替换在用图前,旧图先移 `.trash/<时间戳>/`(历史备份:`20260723-nexgrid-product-imgs`=最初原图,`20260723-composite-superseded`=路径③产物)。
