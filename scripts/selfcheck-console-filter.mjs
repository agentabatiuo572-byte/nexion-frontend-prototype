import { isThirdPartyResourceError } from "./lib/console-origin-filter.mjs";
const B = "http://localhost:5173";
const cases = [
  ["外部字体 CDN 500 → 忽略", "Failed to load resource: the server responded with a status of 500 ()", "https://api.fontshare.com/v2/css?f=x", B, true],
  ["自家资源 500 → **不忽略**", "Failed to load resource: the server responded with a status of 500 ()", "http://localhost:5173/src/store/app.ts", B, false],
  ["自家 404 → 不忽略", "Failed to load resource: the server responded with a status of 404 ()", "http://localhost:5173/static/x.png", B, false],
  ["第三方的**JS 报错**(非资源加载)→ 不忽略", "TypeError: x is not a function", "https://cdn.example.com/a.js", B, false],
  ["自家 JS 报错 → 不忽略", "TypeError: x is not a function", "http://localhost:5173/src/a.ts", B, false],
  ["没有来源 URL → 不忽略(宁可报也不吞)", "Failed to load resource: 500", undefined, B, false],
  ["坏 URL → 不忽略", "Failed to load resource: 500", "not-a-url", B, false],
  ["外部 net::ERR → 忽略", "net::ERR_CONNECTION_REFUSED", "https://api.fontshare.com/x", B, true],
];
let bad = 0;
for (const [name, text, src, base, want] of cases) {
  const got = isThirdPartyResourceError(text, src, base);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${cases.length - bad} pass / ${bad} fail`);
process.exit(bad ? 1 : 0);
