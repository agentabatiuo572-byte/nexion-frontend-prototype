#!/usr/bin/env node
// FEAT-WD01c 提现页费率门控自检 — node 直跑:
//   node scripts/selfcheck-feegate.mjs
//
// 🔴 守两条,都是 2026-07-31 独立验收实测出来、且**当时四道机器门全绿放行**的漏网点:
//   ① 费率不可用时,页面上**任何吃费用数据的区块都不许渲染数字**。
//      漏网史:只给费用明细区加了门,漏了旁边的 NEX 抵扣面板 —— 坏配置下漏 3 处 NaN;
//      失败态下更糟:上方写「费率不可用、已暂停提交」,同屏下方还笃定显示
//      「52.5 NEX 已抵扣 · 手续费全免」,自相矛盾。
//   ② 可用性判据必须含「配置真拉到了」这一项。
//      漏网史:只判了「值合法」。配置拉取失败时 store 仍保留前端种子,值看着合法 →
//      按写死值算费并放行下单,正是规格禁止的回退。
//
// 为什么用文本断言而不是行为断言:这两条是**模板门控**,不是纯逻辑;
// Vue 模板的条件渲染没法脱壳跑。故此处 pin 模板结构,并由浏览器实景走查兜底
// (逐态截图,见 docs/changes 的 T3 验收报告)。文本断言的已知弱点是可被重排绕过,
// 但它守的是「有没有加门」这种增删型改动,不是「控制流搬迁」那种语义型改动。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(path.join(root, "src", "pages", "me", "wallet-withdraw.vue"), "utf8");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// 剥注释:本文件注释里会提到这些串,不剥会让判据被自己的说明污染。
const code = page
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

// ── ① 可用性判据:**整式逐字**匹配,不用前缀正则 ──────
// 🔴 漏网史(2026-07-31 第 3 轮复验,已被真实踩中):原判据只锚前缀,
//    在尾部追加 `|| true`(伪装成临时调试开关)即可让整式恒真、把资金门整个架空,
//    而本哨兵与其余四道门**全绿放行**,坏配置下全页 6 处 NaN、失败态再不出现。
//    这与 selfcheck-fastlane 已修掉的「追加析取项」是同一个弱点,在兄弟哨兵里原样复发。
const norm = (s) => s.replace(/\s+/g, " ").trim();
const flat = norm(code);
// z1(2026-08-10):D5 remote-only 后判据换源 —— cfg.syncFailed/feeConfigValid 由
// withdrawalPolicy 三合取取代(policy 非 null = 配置真拉到了;当前网络已启用;抵扣率 > 0)。
// 「整串逐字、尾部不得追加任何分支」的防 || true 设计原样保留。
const FEE_USABLE_DEF = "const feeConfigUsable = computed(() => { const policy = withdrawalPolicy.value; return policy !== null && policy.enabledNetworks.includes(network.value) && policy.nexFeeOffsetRate > 0; });";
check("🔴 费率可用性定义逐字符合规(三个合取项,尾部不得追加任何分支)",
  flat.includes(FEE_USABLE_DEF),
  "定义已偏离 —— 追加 `|| true` 之类会让门恒真而看不出来");
check("不可用时提交被拦(submitDisabledReason 里有这道门)",
  /if \(!feeConfigUsable\.value\) return/.test(code));

// ── ② 所有吃费用数据的区块都挂同一个门 ────────────────
// 🔴 漏网史:原判据只查「门的字面量在文件里存在」,把它搬到一个无害空元素上、
//    再把真面板改回只按金额门控,哨兵照样全绿(重构残留的常见形态)。
//    改法:锚定**这个门和 NEX 面板的容器写在同一个标签上**。
check("🔴 NEX 抵扣面板本体挂了 feeConfigUsable 门(坏配置不渲染 NaN)",
  // 结构锚定 + **允许附加条件**:pin 整串会在正当地多挂一道门时假红(2026-08-01 加
  // quoteBlocked「提交不了就不给报价」时踩到),但仍必须与 nexGateStyle 写在同一标签上。
  (() => {
    const m = code.match(/<view v-if="([^"]*)"[^>]*:style="nexGateStyle">/);
    return !!m && m[1].includes("feeConfigUsable") && m[1].includes("amountNum > 0");
  })(),
  "该面板只按金额门控 = 坏配置漏 NaN + 失败态显示与提示矛盾的费用数字");
check("费用明细区在不可用时整块换成失败态",
  /v-else-if="!feeConfigUsable"/.test(code));
// 警告框那句「上方手续费可抵扣」也吃费用语境(同一类的第三例)
// 抵扣半句必须**两个条件都挂**:费率可用 + 已输入金额。
// 漏网史:第 4 轮只挂了前者 —— 未输入金额时明细区是「输入金额后显示费用明细」,
// 上方并无任何手续费,这句就成了悬空指代;而那正是打开提现页的落地首屏。
check("🔴 警告框的抵扣提示同时挂「费率可用」与「已输入金额」两个门",
  (() => {
    // 同上:锚定到抵扣半句**自己**那个 <text> 的 v-if,允许其上再叠别的门。
    const m = code.match(/<text v-if="([^"]*)">\{\{ t\.wallet\.minWithdrawNoteOffset \}\}<\/text>/);
    return !!m && m[1].includes("feeConfigUsable") && m[1].includes("amountNum > 0");
  })(),
  "少任一个都会变成悬空指代(失败态 / 未输入金额态)");
// 🔴 分隔符必须放在**各语言串自身**,模板里不得硬编码空格。
// 漏网史:第 5 轮我在模板里硬编码了一个西文空格修 `$20.The` 粘连,
// 结果中文渲染成「$20。 上方手续费…」—— 中文句号自带字宽间距,再补空格是排版错误。
// 这是「改一个语言、漏另一个」的同类第 6 例。分隔符归串自身:en/vi 带前导空格,zh 不带。
check("模板不硬编码分隔空格(分隔符归各语言串,CJK 才不会多空格)",
  !/\{\{ ' ' \}\}\{\{ t\.wallet\.minWithdrawNoteOffset \}\}/.test(code));
check("🔴 最低提现额从配置插值,不写死(否则运营调值后同屏两个最低额)",
  /minWithdrawNoteText = computed\(\(\) => fmt\(t\.value\.wallet\.minWithdrawNote, \{ n: minWithdrawable\.value/.test(code));
// ── ②b z1 B2(2026-08-10):质押劝阻卡禁在空表单渲染 ──────
// 漏网史:minWithdrawable 回退 0 时 `amountNum >= minWithdrawable` 对空表单(0)恒真,
// 劝阻卡在用户一个字没输时就弹出(真回归,z1 修掉)。三门齐挂:已输入金额 /
// 达到最低额 / 报价未被拦(这笔提交不了就不劝改质押)。整串钉在组件标签上防挪门。
check("🔴 质押劝阻卡 v-if 三合取齐挂(>0 · ≥最低额 · !quoteBlocked,空表单不渲染)",
  code.includes('<StakeAlternativeCard v-if="amountNum > 0 && amountNum >= minWithdrawable && !quoteBlocked"'),
  "minWithdrawable 回退 0 后 `0 >= 0` 恒真 —— 少 amountNum > 0 这道门,空表单直接弹劝阻卡");

// ── ③ 四态齐且**加载态可达** ──────────────────────────
// 漏网史:加载态原本排在失败态**后面**,而重试只可能从失败态发起,
// 此时失败态 v-if 恒真 → 骨架永远抢不到 → 死 UI(25ms 采样 14 帧从未出现)。
const orderLoading = code.indexOf('v-if="feeConfigLoading"');
const orderUnusable = code.indexOf('v-else-if="!feeConfigUsable"');
const orderEmpty = code.indexOf('v-else-if="amountNum <= 0"');
check("🔴 加载态排在失败态之前(否则重试期间骨架永远抢不到 = 死 UI)",
  orderLoading >= 0 && orderUnusable > orderLoading,
  `loading@${orderLoading} unusable@${orderUnusable}`);
check("空状态(未输入金额)存在且排在默认态之前",
  orderEmpty > orderUnusable);
check("四态齐(加载 / 不可用 / 未输入 / 默认)",
  orderLoading >= 0 && orderUnusable >= 0 && orderEmpty >= 0 && /v-else class="mx-4 mt-4 space-y-1\.5"/.test(code));
check("失败态给了重试出口",
  /@click="retryFeeConfig"/.test(code) && /async function retryFeeConfig/.test(code));
check("重试真能重拉配置(不是只清本地标志)",
  // z1(2026-08-10):重试改走 loadWithdrawalPolicy(仍是真重拉,只是换了通道)。
  /await loadWithdrawalPolicy\(\)/.test(code));

// ── ④ FEAT-WD02:惩罚费概念清零 + 抵扣意图链 ──────────
// 新模型 = 固定网络确认费 + 自选 NEX 抵扣。守三条:
//  a) 页面不得残留惩罚费语汇(penaltyFeeRate / feePenaltyRow / penaltyPctText);
//  b) 费用引擎必须吃 offsetWithNex 开关(删了它 = 回到强制自动烧);
//  c) 提交链必须把开关快照传进 submitWithdrawal(server 侧意图字段,PROD POST body 必填)。
check("🔴 页面无惩罚费残留(penaltyFeeRate/feePenaltyRow/penaltyPctText,注释已剥)",
  !/penaltyFeeRate|feePenaltyRow|penaltyPctText/.test(code));
check("🔴 报价引擎吃 offsetWithNex 开关(删判断 = 恒烧,回到旧强制抵扣)",
  /computeWithdrawFee\(\s*amountNum\.value,\s*nexBalance\.value,\s*offsetWithNex\.value,/.test(flat.replace(/ /g, "")) ||
  /computeWithdrawFee\( amountNum\.value, nexBalance\.value, offsetWithNex\.value,/.test(flat),
  "feeCalc 不再传开关 —— NEX 会被无意图自动烧掉");
// 2026-08-04:开关快照并入统一提交快照 snap(三条 P1 同族收口,见 selfcheck-withdraw-freeze)。
// 2026-08-11 幂等 P0:抵扣意图多了一个来源 —— 未收口的上一次尝试(重放要发的是那一笔的
// 开关状态,不是当前开关)。判据只放行这一个前缀,换任何别的来源照红。
check("🔴 提交链传开关快照(offset 入 snap 且 snap.offset 进 submitWithdrawal —— server 意图字段)",
  /const snap = \{[\s\S]{0,600}?offset: (pending\?\.offset \?\? )?offsetWithNex\.value,/.test(code) &&
  /app\.submitWithdrawal\([\s\S]{0,400}?snap\.offset,/.test(code));
check("🔴 开关在提交期间冻结(toggleOffset 走 inputsLocked = submitting || confirmingSubmit)",
  /function toggleOffset\(\)[\s\S]{0,200}?if \(inputsLocked\.value\) return;/.test(code)
  && /const inputsLocked = computed\(\(\) => submitting\.value \|\| confirmingSubmit\.value\)/.test(code));
check("费用行按当前绑定网络取键(networkConfirmFeeUsd[NETWORK_FEE_KEY[network]])",
  /networkConfirmFeeUsd\[NETWORK_FEE_KEY\[network\.value\]\]/.test(code));
check("「?」费用说明半屏存在且可开合",
  /feeWhyOpen = true/.test(code) && /feeWhyOpen = false/.test(code) && /feeWhyNetworkBody/.test(code));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
