// selfcheck-slacopy —— 「对用户承诺的时限,必须来自配置」哨兵。
//
// 缘起(2026-08-01 独立走查 P0-2):同一笔提现,页面给了四个互相打架的到账说法 ——
// 网络行「5 分钟」、免审横幅「立即处理」、页脚「首次审核 24 小时」,而**提交前强制勾选确认**的
// 风险披露 §04 写着「标准提现约 30 天」「> $1,000 进 45 天窗口」。系统实际:提交 + payoutSlaHours,
// 大额审查窗口当前阶段配置为 0 天。写死的数字既对不上实现,运营改配置也不会跟着变。
//
// 🔴 本文件 2026-08-01 被哨兵自审推翻重写过一次。旧版三宗罪,写在这里免得重犯:
//   ① 判据 /\b\d+\s*(天|days?|ngày)\b/ —— JS 的 \b 只认 ASCII,「30 天。」尾部不成边界,
//      **中文那一面完全不设防**,而中文是验收看的那一面。为 P0 建的门对该 P0 原文敞开。
//   ② 用 indexOf + slice 抠字符串取值 —— 折行 / 单引号 / 嵌套同名 key / 跨 namespace 全踩,
//      且 indexOf 未命中返回 -1 喂给 slice 切出空串后**判 PASS**(候选为空全过)。
//   ③ 红测靠「{h} 被删掉」变红,那条「不许写死时长」的子判据**从头到尾没被触发过**。
// 现版:真解析读对象 + 判据写成语义(挖掉占位符后不许剩数字)+ 每个合取项各有独立红测。
//
// z1 判决(2026-08-10):c37e642 起时限承诺有意改版为「以服务端订单状态为准」({h} 插值退场,
// 三语同步),披露正文渲染源改远端 chapters。本哨兵剩下的职责 = 时限文案不许写死数字
// (非空 + 三语相异)+ 披露页渲染源钉远端。
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMessages, at, hasHardcodedNumber } from "./lib/i18n-load.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const LOCALES = ["zh", "en", "vi"];
const msgs = {};
for (const l of LOCALES) msgs[l] = await loadMessages(l);

// 🔴 时限文案 key 白名单。范围收窄到枚举出来的 key,而不是「扫整个 namespace 前 4000 字」——
// 后者既会被 staking 的正当锁仓档位(30/90/180/365)误伤,又会因窗口截断漏掉块尾新增的 key。
const SLA_KEYS = [
  "riskDisclosure.s4Body",
  "riskDisclosure.s4BodyLargeAmount",
  "terms.s6Body",
];

for (const l of LOCALES) {
  for (const key of SLA_KEYS) {
    const v = at(msgs[l], key);
    // 候选为空必须判失败:key 被改名 / 删掉时,这里要红,不能因为「没扫到就没违规」而放行。
    check(`[${l}] ${key} 存在`, typeof v === "string" && v.length > 0, v === undefined ? "取不到值" : String(v));
    check(`[${l}] ${key} 不含写死数字(挖掉占位符后)`, !hasHardcodedNumber(v),
      typeof v === "string" ? v.slice(0, 70) : "取不到值");
  }
  // z1 判决(2026-08-10):{h} 时限承诺句已有意改版为服务端口径(以服务端订单状态为准),
  // s4Body / terms.s6Body 的占位符断言退役;无写死数字 + 非空 + 三语相异照守
  // (前两者由上面 SLA_KEYS 循环覆盖,三语相异在循环后单独断言)。
  // s4BodyLargeAmount 仍是插值句,必须带的占位符照旧(缺了 = 数字没接上配置)。
  check(`[${l}] s4BodyLargeAmount 带 {d} 与 {large}`,
    ["{d}", "{large}"].every((m) => String(at(msgs[l], "riskDisclosure.s4BodyLargeAmount") ?? "").includes(m)));
  // 首审提示改成不给时间承诺后,它自己也不许再出现数字
  check(`[${l}] wallet.firstTimeReview 不做时间承诺(系统对人工复核无推进机制)`,
    !hasHardcodedNumber(at(msgs[l], "wallet.firstTimeReview")),
    String(at(msgs[l], "wallet.firstTimeReview") ?? ""));
}

// 三语互不相同:整份复制粘贴 = 有值但没翻译,「存在 + 无数字」两道门都看不出来。
for (const key of ["riskDisclosure.s4Body", "terms.s6Body"]) {
  const vals = LOCALES.map((l) => at(msgs[l], key));
  check(`${key} 三语互不相同`,
    new Set(vals.map((v) => String(v))).size === LOCALES.length,
    vals.map((v) => String(v).slice(0, 40)).join(" | "));
}

// ── 接线门:披露正文的渲染源 ──────────────────────────────────────────────
// 判据跑在剥注释后的源码上(注释里出现判定式文本不得哄绿)。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const rd = stripComments(read("src/pages/me/risk-disclosure.vue"));

// z1 判决(2026-08-10):§04 渲染源改为远端 chapters(risk store 拉取)后,本地派生
// withdrawWindowBody 断链成死代码、已随本判决删除;原先钉它的 4 条结构断言
// (s4Body 插值 / 大额句门控 / d: clamp / 门控 clamp)绿着守死代码 = 假绿,同批退役。
// 换钉远端渲染源三合取,逐项独立断言(各自可红):
check("🔴 披露正文渲染源 = 远端 chapters(disclosure.value?.chapters 真进渲染管线)",
  rd.includes("disclosure.value?.chapters"));
check("🔴 进页真的拉远端披露(risk.refresh())", rd.includes("risk.refresh()"));
check("🔴 拉取失败有失败态出口(loadError 提示 + 重试)", rd.includes("loadError"));

// z1 判决(2026-08-10):terms §06 的插值机制(normalizeSlaHours + payoutSlaHours +
// w.s6Body 三合取断言)随 {h} 文案改版一并移除 —— terms.vue §06 与其余 section 同形
// 直铺 body: w.s6Body,无特有结构可钉;文案面仍由上方 i18n 门(非空/无写死数字/三语相异)守。

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
