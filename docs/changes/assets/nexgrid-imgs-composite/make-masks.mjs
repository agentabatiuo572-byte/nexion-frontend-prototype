// make-masks.mjs — build edit masks: opaque everywhere, alpha=0 in lettering zones
import sharp from "file:///D:/WORKS/PLAN/Nexion-admin-prototype/node_modules/sharp/lib/index.js";
const DIR = "C:/Users/jason/AppData/Local/Temp/claude/D--WORKS-PLAN/245207f6-8655-45e1-9933-cb897bdd6fe7/scratchpad/";

const zones = {
  "mask-box.png": [
    { x0: 728, y0: 235, x1: 828, y1: 750 },  // side panel vertical logotype strip
    { x0: 358, y0: 362, x1: 440, y1: 404 },  // pump face small logo
  ],
  "mask-rack.png": [
    { x0: 385, y0: 540, x1: 805, y1: 675 },  // front band logotype
  ],
};

for (const [name, rects] of Object.entries(zones)) {
  const W = 1024, H = 1024, buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = 0; buf[i * 4 + 1] = 0; buf[i * 4 + 2] = 0; buf[i * 4 + 3] = 255; }
  for (const r of rects)
    for (let y = r.y0; y < r.y1; y++)
      for (let x = r.x0; x < r.x1; x++) buf[(y * W + x) * 4 + 3] = 0;
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(DIR + name);
  console.log(name, "ok");
}
