#!/usr/bin/env bash
# NexGrid uni-app port verifier — the "自测" stage of the nexgrid-uniapp-port loop.
#
# Usage: bash scripts/verify.sh [module]     # default: all
#   BASE_URL overrides the H5 dev origin (default http://localhost:5173).
#   VERIFY_MODE=full|scoped|static(包 ar,2026-08-17):full 全跑(默认);scoped 只跑「git 改动集 ∩ 门声明输入」
#     命中的重门(清单 scripts/gates.manifest.json,未声明的门照跑,命中全局不变量清单自动升 full);
#     static 不需要 dev server,只跑静态门(runtime/server 类一律 SCOPED-SKIP)。跳过的格三态点名,
#     结果行与 .verify-exit.code 第 2 行都带 mode= scoped_skip=,scoped/static 绿 ≠ 全量绿。
#   包 ax(2026-08-18):门可在清单里声明 `pages`(页面文件 / glob / "*"),范围 = inputs ∪ 页面 import 闭包
#     (scripts/lib/import-graph.mjs);scoped 时 route 类探针(zero-border / theme / dom-qa / tap / orphan / empty / spec6)
#     只扫「受影响路由 ∩ 射程」(env PROBE_ROUTES,由 route_scope <门id> 按门下发;门自身脚本/基线变了仍全扫;full 一律清空)。
#     探针多 lane 并行:PROBE_CONCURRENCY(默认 3;theme 门固定 1;=1 即回到逐路由串行)。
#
# Checks:
#   (1) vue-tsc type-check (whole project, must be 0 errors)
#   (2) H5 routes return HTTP 200 (dev server must be running)
#   (3) grep sentinels over src/ — React residue + reverse-ed/meta words +
#       hardcoded hex (token discipline)
#
# NOTE on rendered needles: uni H5 is a CSR SPA, so `curl` returns the empty
# app shell — it CANNOT see rendered text. Per-page content assertions belong
# in the browser self-check (Playwright evaluate), not here. This script
# verifies compile + routing + source hygiene; the skill's review stage owns
# rendered-DOM verification.

set -u
MODULE="${1:-all}"
# 🔴 export:本脚本 spawn 的**每个**探针都必须打同一个 origin。不 export 时,只读
#   UNI_BASE_URL 的那几个探针(dom-qa / tap-feedback / empty-state / invisible-fill)
#   会各自回落 5173 —— worktree 里主 checkout 正占着 5173,于是它们静默验了别的工程树。
export BASE_URL="${BASE_URL:-http://localhost:5173}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 🔴 判定 locale 钉死(2026-08-15 A/B 实锤,2/2 复现):login shell 的 profile 会带进
#   LANG=zh_CN.UTF-8,同一个 GNU sed 4.9 在多字节模式下对含 emoji 的注释行做
#   `s|…//.*$|…|` 剥除会**静默失败** —— platform-anchor 禁令因此把 platform-stats.ts
#   族B 说明注释误判成代码面(447/1 假红);反向更险:剥注释失败会让「消费计数 ≥2」
#   类门被注释行虚增计数(死代码假绿)。LANG unset(C locale)则剥除干净。
#   门的判定不许随启动者 shell 环境漂移;全部文本门按字节语义跑
#   (脚本内 UTF-8 模式串按字节比对,中文/emoji 字面匹配不受影响)。
export LC_ALL=C

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; C='\033[0;36m'; N='\033[0m'
pass=0; fail=0; skip=0; retried=0

# 🔴 退出码哨兵文件 —— WF-7(2026-07-09)/ WF-10(2026-08-06)两次同型踩坑的挂账修法,
# admin-ops 的 verify.mjs 早焊了,本仓一直欠着(EVOLUTION-LEDGER:「其余工程 verify.sh
# 待复制同款」)。why:`verify.sh | tail -60` 这种顺手写法,管道退出码 = tail 的 0,两次都
# 差点把「门断在半路」读成全绿。外部判定**读这个文件,不读管道**。
# trap EXIT 覆盖所有退出路径,含 set -u 半路暴毙 —— 那条路径连 result 行都不会打,
# 只有哨兵文件还能说出真话。.tmp$$ 带 PID:6 棵树挂着同一个 Stop hook,并发跑不许互相踩。
VERIFY_EXIT_SENTINEL="${VERIFY_EXIT_SENTINEL:-$PROJECT_DIR/.verify-exit.code}"
# 🔴 除退出码外**必须同时写跑了多少格**(2026-08-12 加,同型第二次之后)。
# why:只记退出码分不出两件事 —— 「跑完了,有 N 道门判红」与「跑到一半暴毙」都是非零。
# 实际两次都发生过、两次都差点被读成好消息:
#   ① 跨仓测试 ENOENT 崩在第 2 步 → 后面 15 步一次没跑 → 红门数从 27 掉到 0,像是全修好了;
#   ② 合并时留下一个 unbound variable → 套件崩在第 263 行 → 435 格只跑了 46 格 →
#      红门数从 27 掉到 2,像是修好了 25 条。
# 两次都是靠人眼对比 PASS 条数才看出来的,那不是门。基数写进哨兵,由 run-legacy-suite 设下限。
_write_exit_sentinel() {
  local rc=$?
  # 🔴 第一行**保持纯退出码**不变(文档与既有习惯都是 `cat` 出来直接跟 0 比,加字段会打坏它);
  # 基数另起第二行 `pass=N fail=N skip=N`,新判定读第二行,老读法一个字都不用改。
  # 包 ar:第 2 行追加 mode= scoped_skip= tree=(老读法 pass=/fail=/skip= 位置不变;tree 与开跑时不等 → moved)
  local tree_end="" tree_tag="unknown"
  tree_end=$("${NODE_BIN:-node}" scripts/lib/verify-scope.mjs fingerprint 2>/dev/null | sed -n 's/.*"fingerprint":"\([0-9a-f]*\)".*/\1/p')
  if [ -n "$tree_end" ]; then
    if [ -z "${VERIFY_TREE_START:-}" ] || [ "$tree_end" = "$VERIFY_TREE_START" ]; then tree_tag="$tree_end"; else tree_tag="moved"; fi
  fi
  printf '%s\npass=%s fail=%s skip=%s mode=%s scoped_skip=%s tree=%s\n' "$rc" "${pass:-0}" "${fail:-0}" "${skip:-0}" "${SCOPE_MODE:-full}" "${scoped_skip:-0}" "$tree_tag" > "$VERIFY_EXIT_SENTINEL.tmp$" 2>/dev/null \
    && mv -f "$VERIFY_EXIT_SENTINEL.tmp$" "$VERIFY_EXIT_SENTINEL" 2>/dev/null
  return $rc
}
trap _write_exit_sentinel EXIT
CURL_BIN="${CURL_BIN:-curl}"
if [ -f /proc/version ] && grep -qi microsoft /proc/version && command -v curl.exe >/dev/null 2>&1; then
  CURL_BIN="curl.exe"
fi
NODE_BIN="${NODE_BIN:-node}"
if ! command -v "$NODE_BIN" >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
fi

# admin 仓根解析:当前真实 PC 仓 `../nexion-ops-console` 相对路径优先;linked worktree
# (.claude/worktrees/*)下该相对路径落空 → 用 git common-dir 反推主仓根再取同级
# admin 仓(pkg-i 审查:worktree 内 SPEC-7 因路径假阴恒红)。git 不可用 / 独立打包 /
# admin 仓真缺失时 ADMIN_ROOT 保持原相对值 → 下游各消费点维持原 bad/skip 行为。
ADMIN_ROOT="$PROJECT_DIR/../nexion-ops-console"
if [ ! -d "$ADMIN_ROOT" ]; then
  main_git_dir=$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
  if [ -n "$main_git_dir" ] && [ -d "$(dirname "$main_git_dir")/../nexion-ops-console" ]; then
    ADMIN_ROOT="$(dirname "$main_git_dir")/../nexion-ops-console"
  fi
fi

# ⚠ 标记放格式串不放 %s 参数位:POSIX printf 只在格式串里解释 \033 色码(P2-1);消息位禁 %(无用户输入)
ok()   { local mark=""; if [ "${PROBE_RETRIED_LAST:-0}" = "1" ]; then mark=" ${Y}⚠ after-retry${N}"; PROBE_RETRIED_LAST=0; retried=$((retried+1)); fi; printf "  ${G}PASS${N}  %s$mark\n" "$1"; pass=$((pass+1)); }
bad()  { local mark=""; if [ "${PROBE_RETRIED_LAST:-0}" = "1" ]; then mark=" ${Y}(重试后仍失败,首败明细在 *.attempt1)${N}"; PROBE_RETRIED_LAST=0; fi; printf "  ${R}FAIL${N}  %s$mark\n" "$1"; fail=$((fail+1)); }
# 🔴 SKIP 必须进账。以前 6 处 SKIP 是裸 printf,两个计数器都不碰 —— 于是「0 fail」既可能是
# 「418 道全跑过了」,也可能是「412 道跑了、6 道压根没跑」,退出码分不出这两件事。
skipped() { PROBE_RETRIED_LAST=0; printf "  ${Y}SKIP${N}  %s\n" "$1"; skip=$((skip+1)); }

# ── runtime 探针重试(pkg/zj)────────────────────────────────────────────────
# 族=真起浏览器的 14 个探针(census:docs/changes/2026-08-15-runtime-probe-retry.census.md)。
# 同机三轮实测每轮恰好 1 个随机 runtime 探针抖(Frame detached / 20s 超时),轮轮不同、复跑自愈
# —— 时序余量在本机负载下不够,族层统一「失败自动重跑 1 次,以第二次为准」。
# 🔴 重试必须大声:首败明细留在探针日志(分隔行),事件登记 $PROBE_RETRY_LOG,ok/bad 行尾带
# ⚠ 标记,总结行报 after-retry 计数 —— 静默重试会把真实的偶发产品 bug 一起吞掉,禁止。
# 🔴 只包 runtime 真跑调用点;--selftest / 静态哨兵 / 逻辑门一律不包(确定性门失败重跑无意义,
# 反而掩盖不该存在的非确定性)。稳定红两跑仍红,不被洗绿(probe_retry_selftest 变异①钉死)。
# ponytail: 重试 1 次是当前抖动率(~1/轮)下的够用值;若单探针 1 次重试仍频繁穿透,升级路径=
# 该探针内部等待硬化单独立项,不是加大重试次数。
PROBE_RETRY_LOG="${TMPDIR:-/tmp}/uniapp-probe-retries.$$.log"
: > "$PROBE_RETRY_LOG"   # 开跑清空:防 Windows PID 复用把上一轮残留条目混进本轮回显
PROBE_RETRIED_LAST=0
# 用法:probe_retry <探针日志路径> <命令...>(重定向收进函数:首败整份存档 *.attempt1 后
# 截断重写,主日志永远只有权威的第二次 —— 下游 cat/tail/grep 消费点不吃首败污染)
probe_retry() {
  local plog="$1"; shift
  PROBE_RETRIED_LAST=0
  "$@" > "$plog" 2>&1 && return 0
  local rc=$?
  PROBE_RETRIED_LAST=1
  cp -f "$plog" "$plog.attempt1" 2>/dev/null
  printf '%s | first-exit=%s | attempt1=%s | %s\n' "$(date '+%F %T')" "$rc" "$plog.attempt1" "$*" >> "$PROBE_RETRY_LOG"
  "$@" > "$plog" 2>&1
}

# 红测三变异:①恒败不洗绿 ②首败后成=绿+标记+留痕 ③接线完整性(解包即红)。
# 每个变异先证注入生效(rc/标志文件)再看判定 —— 红测铁律:先证起点。
probe_retry_selftest() {
  local bad_bits="" sroot="${TMPDIR:-/tmp}"
  local tmpflag="$sroot/uniapp-probe-retry-selftest.$$" slog="$sroot/uniapp-probe-retry-selftest-plog.$$"
  # 演习期间换草稿登记簿:selftest 自己注入的失败靶不许污染真登记簿(P1-1 狼来了)
  local real_log="$PROBE_RETRY_LOG"
  PROBE_RETRY_LOG="$sroot/uniapp-probe-retry-selftest-reg.$$"; : > "$PROBE_RETRY_LOG"
  # ① 恒败探针经包装:终判必须仍红(稳定红不被洗绿)
  if probe_retry "$slog" bash -c 'exit 7'; then bad_bits="$bad_bits ①洗绿"; fi
  [ "$PROBE_RETRIED_LAST" = "1" ] || bad_bits="$bad_bits ①未重试"
  PROBE_RETRIED_LAST=0
  # ② 首败后成:终判绿 + 标记置位 + 草稿登记簿长了一行 + 首败明细存档(重试大声)
  rm -f "$tmpflag"
  local before after
  before=$(wc -l < "$PROBE_RETRY_LOG" 2>/dev/null); before=${before:-0}
  if probe_retry "$slog" bash -c "[ -f '$tmpflag' ] || { : > '$tmpflag'; exit 1; }"; then :; else bad_bits="$bad_bits ②未转绿"; fi
  [ "$PROBE_RETRIED_LAST" = "1" ] || bad_bits="$bad_bits ②标记未置位"
  after=$(wc -l < "$PROBE_RETRY_LOG" 2>/dev/null); after=${after:-0}
  [ "$after" -gt "$before" ] || bad_bits="$bad_bits ②未留痕"
  [ -f "$slog.attempt1" ] || bad_bits="$bad_bits ②首败明细未存档"
  rm -f "$tmpflag" "$slog" "$slog.attempt1" "$PROBE_RETRY_LOG"
  PROBE_RETRIED_LAST=0
  PROBE_RETRY_LOG="$real_log"
  # ③ 接线完整性:被包真跑调用点数 = census 期望(解包/漏包即红)。锚定行首 if(注释诱饵免疫,
  # tester M5)+ 绝对路径(cwd≠仓根时 $0 相对路径假红,P2-4)+ 不用 `|| echo 0`(grep -c 零命中
  # 时打印 0 且退出码 1,会产出 "0\n0" 两行值,P2-10)
  local expected_sites=21 actual_sites vfile="$PROJECT_DIR/scripts/verify.sh"  # 2026-08-15 包 zl:+2 = orphan-line 探针(selftest+live);2026-08-17 包 am:+1 = 提现账单行门远端档隔离起服;2026-08-17 包 aw:+2 = SVG 内文字运行时门(selftest+live)
  actual_sites=$(grep -cE '^[[:space:]]*if probe_retry .*"\$NODE_BIN" scripts/' "$vfile" 2>/dev/null); actual_sites=${actual_sites:-0}
  [ "$actual_sites" = "$expected_sites" ] || bad_bits="$bad_bits ③接线数=$actual_sites≠$expected_sites"
  if [ -z "$bad_bits" ]; then
    ok "probe-retry selftest(恒败不洗绿 · 首败后成大声转绿 · 接线 $actual_sites/$expected_sites)"
  else
    bad "probe-retry selftest 失效:$bad_bits —— 重试包装不可信,本轮所有 runtime 探针结论按未包装解读"
  fi
}
probe_retry_selftest

check_http() {
  local label="$1" route="$2"
  local code
  code=$("$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL$route" 2>/dev/null)
  if [ "$code" = "200" ]; then ok "$label [$code] $route"; else bad "$label [$code] $route"; fi
}

# grep sentinel: FAIL if pattern is found in src (excluding allowed paths)
sentinel_absent() {
  local label="$1" pattern="$2"
  local hits
  hits=$(grep -rEnI "$pattern" src 2>/dev/null | grep -vE '(\.d\.ts|/i18n/messages/|/styles/tokens\.css)' | head -5)
  if [ -z "$hits" ]; then ok "$label (0 hits)"; else bad "$label"; echo "$hits" | sed 's/^/        /'; fi
}

# grep sentinel: FAIL if pattern is ABSENT from a specific file (presence assertion)
sentinel_present() {
  local label="$1" file="$2" pattern="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then ok "$label"; else bad "$label (missing /$pattern/ in $file)"; fi
}

# ── 范围化(包 ar,2026-08-17 主人拍板 Q1A):三档 full | scoped | static ──────────────────────
# 范围由机器算(scripts/lib/verify-scope.mjs:git 改动集 ∩ gates.manifest 声明的输入),不由模型判。
# 失败方向偏保守:计划算不出 → 升 full;门未在清单声明 → 照跑;改动命中全局不变量清单 → 升 full。
# 跳过的格走 scoped_skip 计数(与 skip 分开:skip=该跑没跑成=红;scoped_skip=按范围有意不跑=不红,但结果行必点名)。
VERIFY_MODE="${VERIFY_MODE:-full}"
case "$VERIFY_MODE" in full|scoped|static) ;; *) echo "VERIFY_MODE 只认 full|scoped|static(给的是 $VERIFY_MODE)"; exit 2 ;; esac
declare -A SCOPE_RUN SCOPE_WHY SCOPE_ROUTES_FOR SCOPE_CELLS
SCOPE_MODE="$VERIFY_MODE"; SCOPE_REQUESTED="$VERIFY_MODE"; SCOPE_UPGRADED=""; SCOPE_CHANGED_COUNT=-1; SCOPE_BASE_USED=""; SCOPE_ROUTES="*"; SCOPE_ROUTES_NOTE=""; SCOPE_H5_PROBE_ROUTES_JSON=""   # 不叫 SCOPE_BASE:调用方 export 的 SCOPE_BASE 要原样透传给 plan 子进程(tester-A 2026-08-17)
scoped_skip=0
VERIFY_TREE_START=$("$NODE_BIN" scripts/lib/verify-scope.mjs fingerprint 2>/dev/null | sed -n 's/.*"fingerprint":"\([0-9a-f]*\)".*/\1/p')
if [ "$VERIFY_MODE" != "full" ]; then
  if scope_plan=$("$NODE_BIN" scripts/lib/verify-scope.mjs plan --mode "$VERIFY_MODE" --format shell 2>/tmp/uni-scope-plan.err); then
    eval "$scope_plan"
  else
    SCOPE_MODE=full; SCOPE_UPGRADED="范围计划算不出($(head -1 /tmp/uni-scope-plan.err 2>/dev/null))→ full(保守方向)"
  fi
fi
# 路由级范围(包 ax,主人拍板 B):scoped 时 route 类探针(zero-border / theme / dom-qa / tap / orphan / empty / spec6)只扫
#   「受影响路由 ∩ 探针射程」;探针读 env PROBE_ROUTES(scripts/lib/probe-routes.mjs)。门因自身输入(脚本/基线/台账)
#   变化而跑 → SCOPE_ROUTES_FOR[id]='*' 全扫。full 一律清空 —— 外层残留不许把 full 变半量。用法:门的 scope_hit 判定之后紧跟 `route_scope <同一门 id>` 再起探针。
unset PROBE_ROUTES
if [ "$SCOPE_MODE" = "scoped" ] && [ -n "$SCOPE_H5_PROBE_ROUTES_JSON" ]; then export H5_PROBE_ROUTES="$SCOPE_H5_PROBE_ROUTES_JSON"; else unset H5_PROBE_ROUTES; fi
route_scope() {
  local r="${SCOPE_ROUTES_FOR[$1]:-*}"
  if [ "$SCOPE_MODE" = "scoped" ] && [ "$r" != "*" ]; then export PROBE_ROUTES="$r"; else unset PROBE_ROUTES; fi
}
# 用法:if scope_hit <id>; then …真跑… ; fi —— 返回 1 时已自行计数并点名 SCOPED-SKIP;未声明的 id 照跑
scope_hit() {
  local id="$1"
  unset PROBE_ROUTES   # 每道门从干净的路由范围起步(tester-F F-07:route_scope 只 set 不 clear 会前向泄漏);route 类门在 scope_hit 之后再 route_scope 自取
  [ "$SCOPE_MODE" = "full" ] && return 0
  local r="${SCOPE_RUN[$id]:-}"
  if [ -z "$r" ] || [ "$r" = "1" ]; then return 0; fi
  local cells="${SCOPE_CELLS[$id]:-1}"   # 该门在本脚本里出几格(manifest cells,缺省 1):跳过按格计,deep 判据 ③ ran+scoped_skip 才守恒
  scoped_skip=$((scoped_skip+cells))
  printf "  ${Y}SCOPED-SKIP${N}  %s(%s)%s\n" "$id" "${SCOPE_WHY[$id]:-}" "$( [ "$cells" -gt 1 ] && echo " ×$cells 格" )"
  return 1
}

echo -e "${C}━━ NexGrid uni-app verify · module=$MODULE · mode=$SCOPE_MODE${SCOPE_UPGRADED:+(请求 $SCOPE_REQUESTED → $SCOPE_UPGRADED)}${VERIFY_TREE_START:+ · tree ${VERIFY_TREE_START:0:10}} ━━${N}"
if [ "$SCOPE_MODE" = "scoped" ]; then echo "  改动集 $SCOPE_CHANGED_COUNT 个文件(base ${SCOPE_BASE_USED:0:10});未声明输入的门照跑,命中的重门真跑,其余 SCOPED-SKIP"; echo "  路由范围:${SCOPE_ROUTES_NOTE:-全部};route 类探针只扫「受影响 ∩ 射程」,门自身输入变了仍全扫"; fi
# 门的门:manifest ↔ verify.sh 接线一致 + glob 都命中(改了清单没接线 / 接了线没声明 / 路径漂移,任一即红;三档都跑)
if "$NODE_BIN" scripts/lib/verify-scope.mjs lint > /tmp/uni-scope-lint.log 2>&1; then
  ok "gates.manifest 接线门 — $(tail -1 /tmp/uni-scope-lint.log)"
else
  bad "gates.manifest 接线门失败 — node scripts/lib/verify-scope.mjs lint 看明细"; sed 's/^/        /' /tmp/uni-scope-lint.log | head -12
fi

# ── (1) type-check ──
echo -e "${C}[0] 静态门(不依赖 dev server,必须排在任何 preflight 之前)${N}"
# 🔴 前移理由(2026-08-12 独立审计 P1-3):这两道门原本排在 2800+ 行,而 [2.5] preflight
# 曾因一个 unbound variable 在 245 行崩死 —— 于是「能抓这件事的门恰恰跑不到」。
# 判据:不依赖 dev server 的纯静态门,一律排在任何可能中止的 preflight 之前。
conflict_marker_gate() {
  if "$NODE_BIN" scripts/conflict-marker-gate.mjs > /tmp/uniapp-conflict-marker.log 2>&1; then
    ok "冲突标记哨兵 — $(tail -1 /tmp/uniapp-conflict-marker.log)"
  else
    bad "残留冲突标记 — node scripts/conflict-marker-gate.mjs 看明细"
    grep -E "^(FAIL|        )" /tmp/uniapp-conflict-marker.log | head -10 | sed "s/^/        /"
  fi
}
conflict_marker_gate
# 交接书指针门:docs/HANDOFF 只许一行式索引,正文住后台仓(2026-08-14,曾漂 12 条正文 + U-4 撞号重编 U-19)。
# 后台仓缺席的环境(临时 worktree / 独立 checkout)里跨仓半边显式 SKIP,本地判据照跑 —— PASS 行会写明跑了哪半。
handoff_pointer_gate() {
  if "$NODE_BIN" scripts/handoff-pointer-gate.mjs > /tmp/uniapp-handoff-pointer.log 2>&1; then
    ok "交接书指针门 — $(tail -1 /tmp/uniapp-handoff-pointer.log)"
  else
    bad "交接书指针漂移 — node scripts/handoff-pointer-gate.mjs 看明细"
    grep -E "^(FAIL|  - )" /tmp/uniapp-handoff-pointer.log | head -10 | sed "s/^/        /"
  fi
}
handoff_pointer_gate
runtime_flag_parity_gate() {
  if "$NODE_BIN" scripts/runtime-flag-parity-gate.mjs > /tmp/uniapp-flag-parity.log 2>&1; then
    ok "运行时开关等价门 — $(tail -1 /tmp/uniapp-flag-parity.log)"
  else
    bad "运行时开关等价门失败 — node scripts/runtime-flag-parity-gate.mjs 看明细"
    grep -E "^(FAIL|  )" /tmp/uniapp-flag-parity.log | head -8 | sed "s/^/        /"
  fi
}
runtime_flag_parity_gate
api_idempotency_key_gate() {
  if "$NODE_BIN" scripts/api-idempotency-key-gate.mjs > /tmp/uniapp-idem-key.log 2>&1; then
    ok "接口幂等键稳定性门 — $(tail -1 /tmp/uniapp-idem-key.log)"
  else
    bad "接口幂等键不稳定 — node scripts/api-idempotency-key-gate.mjs 看明细"
    grep -E "^(FAIL|  FAIL|        )" /tmp/uniapp-idem-key.log | head -10 | sed "s/^/        /"
  fi
}
api_idempotency_key_gate
# vite 监视器锚定门(P-100):拉黑 .claude 的 ignore 必须锚在本树绝对路径。写成通配
# `**/.claude/**` 会把 worktree(住在 <主 checkout>/.claude/worktrees/<name>/)的全部源码
# 一起拉黑 —— dev server 静默不跟进改动,改完 curl 回来还是旧转译产物,红测因此假绿。
vite_watch_anchor_gate() {
  if "$NODE_BIN" scripts/vite-watch-anchor-gate.mjs > /tmp/uniapp-vite-watch-anchor.log 2>&1; then
    ok "vite 监视器锚定门 — $(grep -E '^PASS' /tmp/uniapp-vite-watch-anchor.log | tail -1)"
  else
    bad "vite 监视器 ignore 没锚在本树 — node scripts/vite-watch-anchor-gate.mjs 看明细"
    grep -E "^FAIL" /tmp/uniapp-vite-watch-anchor.log | head -5 | sed "s/^/        /"
  fi
}
vite_watch_anchor_gate

echo -e "${C}[1] vue-tsc type-check${N}"
# 包 ar:走指纹缓存壳(输入未变 → PASS(cached);变了 → 裸 vue-tsc 真跑;--incremental 因 warm buildinfo 假绿禁用)。同一棵树一轮里 tsc 只算一次。
# 壳的自证先跑(结构判据:不带 --incremental · FAIL 路径必删 pass 记录 · 记录带指纹)—— 2026-08-17 那次 P0 是外部 tester 逮到的,不是门逮到的
if "$NODE_BIN" scripts/typecheck-cached.mjs --selftest >/tmp/uni-tsc-selftest.log 2>&1; then
  ok "typecheck-cached selftest — $(tail -1 /tmp/uni-tsc-selftest.log)"
else
  bad "typecheck-cached selftest 失败 — 缓存壳判据被改坏,本轮 tsc 结论按不可信解读"; tail -5 /tmp/uni-tsc-selftest.log | sed 's/^/        /'
fi
if "$NODE_BIN" scripts/typecheck-cached.mjs >/tmp/uni-tsc.log 2>&1; then
  ok "$(tail -1 /tmp/uni-tsc.log)"
else
  bad "vue-tsc errors"; tail -15 /tmp/uni-tsc.log | sed 's/^/        /'
fi

# 🔴 紧跟类型检查:同一类(编译器能精确判定的)问题归在一处。守的是「store 里不许有
# 不可达代码」—— 2026-08-13 创世五个动作的本地实现全成死代码,而它长得完全正常,
# 还把 selfcheck-genesis-gate 的文本判据哄绿了(判据句就躺在死代码里)。
store_unreachable_gate() {
  if "$NODE_BIN" scripts/store-unreachable-code-gate.mjs > /tmp/uniapp-store-unreachable.log 2>&1; then
    ok "store 不可达代码门 — $(tail -1 /tmp/uniapp-store-unreachable.log)"
  else
    bad "store 里出现不可达代码 — node scripts/store-unreachable-code-gate.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-store-unreachable.log | head -6 | sed "s/^/        /"
  fi
}
if scope_hit store-unreachable; then store_unreachable_gate; fi

echo -e "${C}[1.5] i18n mirror${N}"
if "$NODE_BIN" scripts/i18n-key-mirror.mjs >/tmp/uni-i18n-mirror.log 2>&1; then
  ok "$(cat /tmp/uni-i18n-mirror.log)"
else
  bad "i18n en/zh key mismatch"; head -20 /tmp/uni-i18n-mirror.log | sed 's/^/        /'
fi

# ── 硬编码中文哨兵(2026-08-11)──────────────────────────────────────────────
# 上面的镜像门只保证「已进词典的 key 三语齐」,对**压根没进词典**的字符串无感:
# c37e642 一个提交把 10 个文件的用户可见文案直接写成中文,本文件里所有文案哨兵
# (mock/演示词表 · funnel-meta · TRIAL02 · markdown 残留)全部没响 —— 它们只扫
# src/i18n/messages/*.ts 的值,且判据是**枚举词表**,新词天然不在表里。
# 本门反过来判:src/**/*.{vue,ts} 注释之外**含 CJK 即拦**,不枚举任何词。
i18n_cjk_gate() {
  if "$NODE_BIN" scripts/i18n-hardcoded-cjk-sentinel.mjs --selftest > /tmp/uni-i18n-cjk-selftest.log 2>&1; then
    ok "$(tail -1 /tmp/uni-i18n-cjk-selftest.log)"
  else
    bad "i18n-cjk selftest 失败(哨兵失效即门失效;node scripts/i18n-hardcoded-cjk-sentinel.mjs --selftest 看明细)"
    tail -8 /tmp/uni-i18n-cjk-selftest.log | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/i18n-hardcoded-cjk-sentinel.mjs > /tmp/uni-i18n-cjk.log 2>&1; then
    ok "$(tail -1 /tmp/uni-i18n-cjk.log)"
  else
    bad "页面/组件里有硬编码中文 — 搬进 src/i18n/messages/{en,zh,vi}.ts 三语同序,页面用 useT() 读"
    tail -12 /tmp/uni-i18n-cjk.log | sed 's/^/        /'
  fi
}
i18n_cjk_gate

# ── 硬编码英文用户文案哨兵(2026-08-17)────────────────────────────────────────
# 上面那道门只判**中文**,英文那一面此前无人守(它最后一条红测把纯英文页面明确放行)。
# 实证代价:wallet-card.vue 的槽位行长期写成 `{{ n }} live · {{ m }} slots open`,
# 中文 / 越南语界面直出英文,456 格门一条都没响,是独立验收 agent 在越南语截图里肉眼发现的。
# 本门补这条轴:渲染位(模板文本节点 / 静态可见属性 / 插值展示位 / pages.json 标题)上
# 出现的每个英文词都必须被显式授权(ticker / 品牌 / 认证名 / 单位 / 格式掩码),否则拦。
# 判据形状是实测定的:script 里的字符串字面量有 15579 条候选,那条轴判不了,故不在判定面内。
i18n_en_gate() {
  # 日志名带 PID:多棵树并发跑同一道门时,固定名会让 `tail -1` 打印**别的树**那轮的总结行
  # (memory 里有实付案例:据末行判成 4 红、实为并发别人的)。判决本身取自退出码,不受影响。
  local slog="${TMPDIR:-/tmp}/uni-i18n-en-selftest.$$.log" glog="${TMPDIR:-/tmp}/uni-i18n-en.$$.log"
  if "$NODE_BIN" scripts/i18n-hardcoded-en-copy-sentinel.mjs --selftest > "$slog" 2>&1; then
    ok "$(tail -1 "$slog")"
  else
    bad "i18n-en selftest 失败(哨兵失效即门失效;node scripts/i18n-hardcoded-en-copy-sentinel.mjs --selftest 看明细)"
    tail -8 "$slog" | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/i18n-hardcoded-en-copy-sentinel.mjs > "$glog" 2>&1; then
    ok "$(tail -1 "$glog")"
  else
    bad "页面/组件的渲染位上有硬编码英文用户文案 — 真文案搬进 src/i18n/messages/{en,zh,vi}.ts;技术词进 TECH_TOKENS;属性名进 NON_COPY_ATTRS;工程话写 i18n-en-ok: 理由"
    tail -14 "$glog" | sed 's/^/        /'
  fi
}
i18n_en_gate

# ── SVG 内文字源码门(P-121,2026-08-17)────────────────────────────────────────
# 模板里的 <text> 是 uni 的文本组件,写在 <svg> 里会编成 <uni-text>(不是合法 SVG 子元素)→ 0×0 静默不渲染,
# 源码看起来完全正常、i18n 三道门全绿。判据:svg 内禁 <text>(用 <SvgText>,src/components/svg-text.ts 渲染函数直出真 SVG text)
# + <SvgText> 只许在 svg 内 + 用了必 import(kebab/别名也认)+ 同族 uni 内置标签也禁 + uno.config 不许启用 attributify(它把 font-size="9.5" 劫持成 2.375rem、:opacity 劫持成 0.0025)
# + 判定面塌缩(0 个 svg 块 / 0 个 SvgText)判红。渲染面另有 svg_text_render_gate(运行时 bbox>0)。
svg_text_source_gate() {
  local slog="${TMPDIR:-/tmp}/uni-svg-text-src-selftest.$.log" glog="${TMPDIR:-/tmp}/uni-svg-text-src.$.log"
  if "$NODE_BIN" scripts/svg-text-source-gate.mjs --selftest > "$slog" 2>&1; then
    ok "$(tail -1 "$slog")"
  else
    bad "svg-text-source selftest 失败(哨兵失效即门失效;node scripts/svg-text-source-gate.mjs --selftest 看明细)"
    tail -8 "$slog" | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/svg-text-source-gate.mjs > "$glog" 2>&1; then
    ok "$(tail -1 "$glog")"
  else
    bad "<svg> 里有 <text>(编成 <uni-text> 不渲染)/ <SvgText> 用法或 attributify 豁免有误 —— node scripts/svg-text-source-gate.mjs 看明细"
    grep -E "^FAIL" "$glog" | head -8 | sed 's/^/        /'
  fi
}
svg_text_source_gate

# ── 远端权威契约门(2026-08-10 接线)────────────────────────────────────────────
# 它此前是**孤儿门**:package.json 的 verify 链没有它,本文件也没有它 —— 于是它红了
# 半天没人知道(实测:本轮把 wallet-exchange 的中文文案收进 i18n 后 G2 立刻红,
# 而两条链全绿)。更糟的是它原本把判据锚在中文字面量上,与上面那道「不许有中文」
# 的门方向相反,任何源码状态都不可能同时绿。判据已改锚 i18n key + 三语词典有值,
# 并在**同一提交**里接上链 —— 机器门与被它判的实现不同时落地 = 修了也无从验证。
# 🔴 样本量必须当**判据**,不能只印进标签:`node --test` 对「一条 test 都没有」的文件同样 exit 0
#    (注释掉 / test.skip / 条件为假的 describe 都会走到这一步),于是门退化成「tests 0 · PASS」。
#    上面那道 i18n 门写了「扫不到文件即判红」的假绿防线,这道门得有对等的一条。
"$NODE_BIN" --test scripts/g-remote-authority-contract.test.mjs >/tmp/uni-g-remote-contract.log 2>&1
g_remote_rc=$?
# 判据取 **pass 数**不取 tests 数:红测实测 `test.skip` 时 tests 仍计 4(skipped 1),拿 tests 当门会漏;
# pass 数对「删掉 test」与「skip 掉 test」两种形态都会掉下来。
# 按**字段**取数,别用 `^.` 锚行首:node --test 的汇总行前缀 `ℹ` 是 3 字节,grep 的 `.` 匹配单字节,
# 取出来恒为空 —— 那样门会永远判红(方向安全,但判据其实已经失效,属另一种坏)。
g_remote_pass=$(awk '$(NF-1)=="pass"{v=$NF} END{print v}' /tmp/uni-g-remote-contract.log)
g_remote_fail=$(awk '$(NF-1)=="fail"{v=$NF} END{print v}' /tmp/uni-g-remote-contract.log)
if [ "$g_remote_rc" -eq 0 ] && [ "${g_remote_pass:-0}" -ge 4 ] && [ "${g_remote_fail:-1}" -eq 0 ]; then
  ok "远端权威契约门 pass ${g_remote_pass} / fail ${g_remote_fail}(判据锚 i18n key + exchange 命名空间内有值;pass<4 或 fail>0 一律判红)"
else
  bad "远端权威契约门失败(rc=$g_remote_rc pass=${g_remote_pass:-none} fail=${g_remote_fail:-none};pass 少于 4 = 有 test 被删或 skip,同样按红处理)"
  grep -E "✖|AssertionError|expected" /tmp/uni-g-remote-contract.log | head -6 | sed 's/^/        /'
fi

# Key mirroring proves en/zh/vi agree with EACH OTHER, not that they cover every
# SKU. A product added to products.ts without a store.catalog entry silently
# falls back to English prose on the store card / detail / search (the exact leak
# the 2026-07-28 sweep closed) — assert id parity so the fallback stays dead code.
if "$NODE_BIN" -e '
  const fs=require("fs");
  const ids=[...fs.readFileSync("src/mock/products.ts","utf8").matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map(m=>m[1]);
  if(ids.length===0) throw new Error("no PRODUCTS ids parsed — sentinel is blind, fix the matcher");
  for(const loc of ["en","zh","vi"]){
    const src=fs.readFileSync(`src/i18n/messages/${loc}.ts`,"utf8");
    const block=src.match(/catalog:\s*\{[\s\S]*?\n    \},/);
    if(!block) throw new Error(`${loc}.ts: store.catalog block not found`);
    for(const id of ids){
      if(!block[0].includes(`"${id}"`)) throw new Error(`${loc}.ts: store.catalog missing SKU "${id}"`);
    }
  }
  console.log(`product catalog copy covers all ${ids.length} SKUs x 3 locales`);
' >/tmp/uni-catalog-parity.log 2>&1; then
  ok "$(cat /tmp/uni-catalog-parity.log)"
else
  bad "product catalog i18n parity"; head -5 /tmp/uni-catalog-parity.log | sed 's/^/        /'
fi

# 上面三道 i18n 门整条轴是反的:都在查「中文有没有跑出词典」,没有一道查「英文有没有跑进
# 界面」。实付(P-109):4c32a50 把规格兜底改成 `?? "unavailable"` 五处,中文态渲染出
# 「你的手机 unavailable」等 4 处混排,三道门全绿。本门补这条轴 —— 服务端哨兵值不得当
# client fallback、不得在商品渲染面裸用。selftest 先跑:哨兵失效即门失效。
if "$NODE_BIN" scripts/spec-sentinel-render-gate.mjs --selftest > /tmp/uni-spec-sentinel-selftest.log 2>&1; then
  ok "$(tail -1 /tmp/uni-spec-sentinel-selftest.log)"
else
  bad "spec-sentinel selftest 失败(哨兵失效即门失效;node scripts/spec-sentinel-render-gate.mjs --selftest 看明细)"
  tail -8 /tmp/uni-spec-sentinel-selftest.log | sed 's/^/        /'
fi
if "$NODE_BIN" scripts/spec-sentinel-render-gate.mjs > /tmp/uni-spec-sentinel.log 2>&1; then
  ok "$(tail -1 /tmp/uni-spec-sentinel.log)"
else
  bad "服务端规格哨兵被当兜底/裸渲染 — 走 t.store.specValueUnavailable 降级文案"
  tail -10 /tmp/uni-spec-sentinel.log | sed 's/^/        /'
fi

# 入金/牌价/换绑/卡四条资金纯逻辑自检此前只能手跑,等于资金常量没有机器门 ——
# 改费率/最低额/上限/容差不会红任何一条流水线(2026-07-27 audit 立案)。
# withdraw-freeze(2026-08-04 R2 三条 P1):提交链快照单源化 —— 弹窗展示 = 扣款 = 建单
# 用同一份冻结件,确认后与当前权威值核对不符即拒单;外加 NEX 退款反向分录(账本对得上钱包)。
echo -e "${C}[1.6] money selfchecks(deposits · fx · rebind · cards · withdrawfee · withdraw-freeze · fastlane · feegate)${N}"
for sc in deposits fx rebind cards withdrawfee withdraw-freeze fastlane feegate arrival i18n-interp console-filter slacopy onbrand reward-buckets; do
  if "$NODE_BIN" "scripts/selfcheck-$sc.mjs" >"/tmp/uni-selfcheck-$sc.log" 2>&1; then
    ok "selfcheck-$sc: $(grep -Eo '[0-9]+ pass / [0-9]+ fail' "/tmp/uni-selfcheck-$sc.log" | tail -1)"
  else
    bad "selfcheck-$sc 有断言失败"; grep -E "FAIL|fail" "/tmp/uni-selfcheck-$sc.log" | head -8 | sed 's/^/        /'
  fi
done

# fastlane 的「扣退同档」那格 2026-08-16 因**同义别名**假绿修过一轮(判据只认 remoteApiEnabled
# 字面量,认不出等价的 fundsServerEnabled,退款腿实际已被整条关掉却一路报绿)。
# 修后判据按等价类解析 + 钉正向定型串,而关系型/解析型判据更容易在重构里悄悄失去牙齿 ——
# 6 靶红测钉住它真会红,其中 4 靶是「旧判据漏、新判据抓」的资金缺陷形状。
if scope_hit withdraw-rail-alias-redtest; then
if "$NODE_BIN" scripts/withdraw-rail-alias.redtest.mjs > /tmp/uni-withdraw-rail-alias.log 2>&1; then
  ok "withdraw-rail-alias redtest — $(tail -1 /tmp/uni-withdraw-rail-alias.log)"
else
  bad "withdraw-rail-alias redtest 失败(哨兵失效即门失效;node scripts/withdraw-rail-alias.redtest.mjs 看明细)"
  tail -12 /tmp/uni-withdraw-rail-alias.log | sed 's/^/        /'
fi
fi

# 待支付会话 store(2026-08-16 pkg/ad checkout-cancel):「同账号至多一张活票」不变量 / CAS 跨标签页拒双开 /
# 钱路「落盘 / CAS 判决必须被消费」—— AST 门(审计 R4→R6 同族五次:返回值当语句丢掉)。先自测门本身会红,再扫钱路文件。
if node scripts/selfcheck-persist-verdict.mjs --selftest > /tmp/uni-persist-verdict-selftest.log 2>&1 && node scripts/selfcheck-persist-verdict.mjs > /tmp/uni-persist-verdict.log 2>&1; then
  ok "persist-verdict — $(tail -1 /tmp/uni-persist-verdict.log)"
else
  bad "persist-verdict:钱路上有落盘 / CAS / 资金原语的返回值被丢弃(node scripts/selfcheck-persist-verdict.mjs 看明细)"
  cat /tmp/uni-persist-verdict-selftest.log /tmp/uni-persist-verdict.log | tail -20 | sed 's/^/        /'
fi
# 账号隔离 / 过期剪除 / 一次性离开提示 + 建单落盘契约(createOrder / createOrders 落盘失败返 null,不留内存孤儿单;一批一次落盘)+ 单次券核销 CAS(先占后花,双实例只成一次;release 放回)+ 恢复发票逐项 min 对账 + 存储行取值域 —— vitest 覆盖。vitest 全局钉 remote 档,该测试文件内显式 mock 成 mock 档
# (否则 store 恒空,断言假绿)。独立审计 R1 P0 族(守卫回弹后再点 Pay now 铸出第二张活票)就落在这里。
if scope_hit pending-checkout-vitest; then
if npx vitest run src/store/pending-checkout.test.ts src/store/pending-checkout-core.test.ts src/store/orders.persist.test.ts src/store/voucher.redeem.test.ts src/store/free-trial.persist.test.ts > /tmp/uni-pending-checkout-vitest.log 2>&1; then
  ok "pending-checkout store/core vitest — $(sed 's/[[0-9;]*m//g' /tmp/uni-pending-checkout-vitest.log | grep -Eo 'Tests +[0-9]+ passed' | tail -1)"
else
  bad "pending-checkout vitest 失败(npx vitest run src/store/pending-checkout*.test.ts 看明细)"
  sed 's/[[0-9;]*m//g' /tmp/uni-pending-checkout-vitest.log | tail -15 | sed 's/^/        /'
fi
fi

# ── (2) H5 routing (dev server must be up) ──
if scope_hit route-http; then
echo -e "${C}[2] H5 routes HTTP 200 (${BASE_URL})${N}"
if "$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null | grep -q 200; then
  # 🔴 先认工程再认状态码:同机跑着 CC(:5273)/ janus(:5174),端口被串台时
  # 本段会整体假绿 —— curl 拿到的是 CSR 空壳,任何 Vite SPA 都回 200(实测踩过)。
  # 判据用「取到的是真模块还是 SPA 兜底页」:Vite 对不存在的路径回 index.html,
  # 状态码同样 200,所以只看状态码的探针本身就是个假绿(踩过,红测才揪出来)。
  # vi.ts = 越南语包,本仓独有(janus / CC 只有中英双语),故可作身份标识。
  IDENTITY_BODY=$("$CURL_BIN" -s "$BASE_URL/src/i18n/messages/vi.ts" 2>/dev/null | head -c 200)
  case "$IDENTITY_BODY" in
    "<!DOCTYPE html>"*|"<!doctype html>"*|"")
      bad "$BASE_URL 上跑的不是 Nexion-uniapp(vi.ts 取到 SPA 兜底页)— 别对着别的工程验" ;;
    *) ok "dev server 身份 = Nexion-uniapp(vi.ts 是真模块)" ;;
  esac
  check_http "Home shell" "/"
  # Ported routes append here as Batch 1/2 land:
  # check_http "Earn" "/#/pages/earn/earn"
else
  skipped "dev server not running at $BASE_URL (run: npm run dev:h5)"
fi
fi

# ── (3) source hygiene sentinels ──
# ── [2.5] dev server API 模式前置断言(z1 判决 A,2026-08-10)──
# 老套件的运行时探针全部驱动 mock 业务流;c37e642 后 app 默认 remote(无后端时启动噪声
# + 注册等流程整条绕开 mock 分支),拿 remote 模式 server 跑这些探针 = 静默验错对象。
# 判据:vite dev 转换头会内联整份 env JSON,直接 curl 源模块判 mode;探不到也红(禁跳过)。
echo -e "${C}[2.5] dev server API mode preflight${N}"
# 🔴 两问,缺一不可(z1 R2 对抗审计 P1-24):本门自称要解决「验错对象」,却只问了模式、
#    没问**是哪棵树** —— 同一份 env JSON 里现成就有 VITE_ROOT_DIR。多工作树并发时
#    (本仓实测同时开过 8 个),BASE_URL 指到别人的 checkout 会让下面所有运行时探针
#    给别的工作树发绿灯(feedback_worktree_verify_environment 同族)。
# 🔴 路径规范化必须两边都做,且要抹平**盘符写法**(2026-08-11 合并修正,2026-08-12 再并一次):
#    这门原来的写法是 served 转斜杠、expect 只转反斜杠再各自小写。但 bash 里
#    `PROJECT_DIR=$(pwd)` 在 Git Bash / MSYS 下给的是 `/d/WORKS/...`,而 uni 注入的
#    VITE_ROOT_DIR 是 `D:\WORKS\...` → 转完是 `d:/works/...` vs `/d/works/...`,
#    **永不相等 → 靶子完全正确也恒判红**(用主线原字节实测复现)。恒红的门 = 退出码恒 1,
#    正是这轮要修的「新门翻红不可观测」本身。
#
#    两条支线各自修过这只 bug,覆盖面互补,此处并成**一个**归一化函数(不留两份:
#    同一个概念两处各自推导,正是本仓明令要配 parity 哨兵才许做的事):
#      · 主线侧独有:JSON 里的双反斜杠 `\\`、`/cygdrive/` 前缀;
#      · z3 侧独有:WSL 的 `/mnt/d/`、尾斜杠、以及**判据自己的双向自检**。
#    归一后的正规形:去掉盘符冒号与前导斜杠,统一成 `d/works/x`。
_norm_tree_path() {
  printf '%s' "$1" | tr 'A-Z' 'a-z' \
    | sed 's|\\\\|/|g; s|\\|/|g; s|^/cygdrive/||; s|^/mnt/\([a-z]\)/|\1/|; s|^/mnt/\([a-z]\)$|\1|; s|^/||; s|^\([a-z]\):|\1|; s|//*|/|g; s|/$||'
}
# 判据双向红测(常驻,由 z3 侧带入)。归一化有两种坏法,方向相反,只测一个方向不算数:
#   ① 归不拢 → 同一目录的两种写法判不等,门恒红(2026-08-11 修的就是这只);
#   ② 归过头 → 不同工作树被折成相等,门恒绿地替别人发绿灯(比恒红危险得多)。
#   任一方向坏了,下面那道树身份判断就不许发绿灯。
if [ "$(_norm_tree_path 'D:\WORKS\x')" = "$(_norm_tree_path '/d/WORKS/x')" ] \
   && [ "$(_norm_tree_path 'D:\\WORKS\\x')" = "$(_norm_tree_path '/d/WORKS/x')" ] \
   && [ "$(_norm_tree_path '/cygdrive/d/WORKS/x')" = "$(_norm_tree_path '/d/WORKS/x')" ] \
   && [ "$(_norm_tree_path '/mnt/d/WORKS/x')" = "$(_norm_tree_path 'D:/works/x/')" ] \
   && [ "$(_norm_tree_path '/d/WORKS/x')" != "$(_norm_tree_path '/d/WORKS/x/.claude/worktrees/w1')" ] \
   && [ "$(_norm_tree_path 'D:/WORKS/x')" != "$(_norm_tree_path '/c/WORKS/x')" ]; then
  norm_root_selftest=ok
  ok "树身份判据自检(双向:D:\\ · D:\\\\ · /cygdrive/d/ · /mnt/d/ · D:/ · /d/ 六种写法判等 + 嵌套工作树/异盘符判不等)"
else
  norm_root_selftest=broken
  bad "树身份判据自检失败 —— _norm_tree_path 归一化坏了,下面的树身份判断不可信(动过它就看这条)"
fi
if scope_hit api-mode-preflight; then
served_env_head=$("$CURL_BIN" -s "$BASE_URL/src/api/runtime-config.ts" 2>/dev/null | head -2)
served_root=$(echo "$served_env_head" | grep -oE '"VITE_ROOT_DIR": *"[^"]*"' | head -1 | sed 's/.*: *"//; s/"$//' | sed 's|\\\\|/|g')
expect_root="$PROJECT_DIR"
if [ -z "$served_env_head" ]; then
  bad "API-mode preflight: 拉不到 $BASE_URL/src/api/runtime-config.ts(server 没起或非 vite dev)"
elif ! echo "$served_env_head" | grep -q '"VITE_NEXGRID_API_MODE": *"mock"'; then
  bad "API-mode preflight: server 非 mock 模式 —— 用 npm run test:legacy-suite(自启壳会以 mock 起本工作树),remote 默认值会让全部运行时探针验错对象"
elif [ -z "$served_root" ]; then
  bad "API-mode preflight: env JSON 里读不到 VITE_ROOT_DIR —— 树身份判不了,判据失效必红"
elif [ "$norm_root_selftest" != "ok" ]; then
  bad "API-mode preflight: 树身份判据自检没过 —— 归一化不可信,这道门不发绿灯"
elif [ "$(_norm_tree_path "$served_root")" != "$(_norm_tree_path "$expect_root")" ]; then
  bad "API-mode preflight: server 服的是**别的工作树** —— 它=$served_root,本套件在=$expect_root(归一后 $(_norm_tree_path "$served_root") vs $(_norm_tree_path "$expect_root");并发多工作树时会给别人发绿灯)"
else
  ok "API-mode preflight: mock 模式 + 服的就是本工作树($served_root)"
fi
fi
# B1(z1 判决包):远端刷新缝「权威不可达」韧性 —— API 全抛时必须自吞降级;三处裸 await
# (v-rank/commission/genesis)曾把 6 条 console-error=0 运行时门全部打红。
if scope_hit remote-refresh-resilience; then
if "$NODE_BIN" scripts/selfcheck-remote-refresh-resilience.mjs > /tmp/uni-remote-resilience.log 2>&1; then
  ok "远端刷新韧性门 — $(tail -1 /tmp/uni-remote-resilience.log)"
else
  bad "远端刷新韧性门失败 — node scripts/selfcheck-remote-refresh-resilience.mjs 看明细"
  tail -8 /tmp/uni-remote-resilience.log | sed 's/^/        /'
fi
fi

# ── [2.7] dev server 健康 preflight(P-097 对策③④,环境门)──────────────────
# why:dev server 被喂满一轮 verify 流量后会队列拥塞式退化(实测空载 shell 响应 4~31s、
# 进程 4.8GB 工作集),runtime 探针族「一门一浏览器、20-30s 预算」与该病理共振 → 集体
# 假红,拿病服务器烧 45 分钟出一堆假红,还会被读成「代码坏了」。开跑前对 $BASE_URL/
# 量 2 次裸 shell 延迟,任一次超阈即判「环境红」并直接中止:这不是门红,不代表代码有
# 问题,重启 server 再跑才有结论。收尾处再量 1 次,总结行报首尾延迟(见脚本尾部),
# 首绿尾超阈 = server 在本轮中途退化,后段 runtime 红先疑环境再疑代码。
# 🔴 环境红退出码钉 3(≠1 的门红):.verify-exit.code 老读法只跟 0 比,不受影响;
# 要区分「门红 vs 环境红」的消费者读退出码 3 或 grep 输出里的 ENV-RED 横幅。
HEALTH_MAX_S=2   # P-097 对策③的阈:健康 vite dev 空载 shell 响应在毫秒级,>2s 已是拥塞先兆
_shell_latency() {  # 量一次 $BASE_URL/ 的 time_total(秒);连不上输出空串
  local t rc
  t=$("$CURL_BIN" -s -o /dev/null --max-time 15 -w '%{time_total}' "$BASE_URL/" 2>/dev/null); rc=$?
  case "$rc" in
    0) printf '%s' "$t" ;;
    28) printf '15.000000' ;;   # 响应超 15s 被掐断:按 15s 计必超阈 —— 挂死的 server 不许把探针也拖死
    *) printf '' ;;
  esac
}
_over_health_max() { [ -n "$1" ] && awk -v t="$1" -v m="$HEALTH_MAX_S" 'BEGIN{exit !(t+0 > m+0)}'; }
if scope_hit server-health-preflight; then
echo -e "${C}[2.7] dev server health preflight(P-097 环境门)${N}"
HEALTH_T1=""; HEALTH_T2=""
for _hi in 1 2; do
  _ht=$(_shell_latency)
  if [ "$_hi" = 1 ]; then HEALTH_T1="$_ht"; else HEALTH_T2="$_ht"; fi
  if [ -z "$_ht" ]; then
    skipped "server health preflight 第${_hi}次:$BASE_URL 连不上,量不了(server 没起的红由 [2.5] 负责,此处不重复计红)"
    break
  fi
  if _over_health_max "$_ht"; then
    bad "「环境红」server health preflight 第${_hi}次:shell 延迟 ${_ht}s > ${HEALTH_MAX_S}s —— dev server 队列拥塞/进程退化,重启后再跑(P-097)"
    echo -e "${R}━━ ENV-RED(P-097)环境红,非门红:dev server 已退化,继续跑只会产出连片假红,中止本轮 verify ━━${N}"
    echo -e "${R}   处置:重启 dev server(或 npm run test:legacy-suite 自启壳)后整轮重跑;本轮已出的 PASS/FAIL 一律作废${N}"
    exit 3
  fi
done
if [ -n "$HEALTH_T2" ]; then
  ok "server health preflight:2 次 shell 延迟 ${HEALTH_T1}s / ${HEALTH_T2}s(均 ≤ ${HEALTH_MAX_S}s)"
fi
fi

echo -e "${C}[3] grep sentinels over src/${N}"
# React residue (should never survive a .tsx → .vue port)
sentinel_absent "no className= (use class=)"      'className='
sentinel_absent "no React hooks (useState/useEffect)" '\b(useState|useEffect|useRef|useMemo)\s*\('
sentinel_absent "no framer-motion import"           'from .framer-motion|<motion\.'
sentinel_absent "no JSX self-close div/span"        '</(div|span|button)>'
# Bare-text-in-<view> (PITFALLS P-026): a `<view>` with a direct text/`{{ }}`
# child renders on H5 (uni-view tolerates text nodes) but NOT on App native →
# the copy silently vanishes. vue-tsc + curl-compile + H5 self-check all miss
# it. Direct text under <view> must be wrapped in <text>. (Single-line form;
# multi-line cases caught in review.)
sentinel_absent "no bare {{ }} directly in <view>"  '<view[^>]*>\{\{[^}]+\}\}</view>'
# Pinia setup-store discipline (PITFALLS P-017): an explicit return-type
# annotation on the setup fn — defineStore("x", (): SomeStore => …) — conflicts
# with Ref unwrapping (state typed as a plain value ≠ the returned Ref<T>) →
# TS2740. Setup stores must let Pinia infer the return (cf. market/profile).
sentinel_absent "no defineStore setup return annotation" 'defineStore\(.*\(\): *[A-Za-z_]'
# 付款腿禁止定时器自动推进(2026-08-16 pkg/ad checkout-cancel):chain-payment.vue 曾用 12s setTimeout
# 模拟「网络看到入金」自动 emit("complete") —— 把「取消」变成 12 秒按钮、把用户推进一笔他没确认的扣款。
# 付款完成只能来自用户动作(我已完成支付)或服务端权威回读。判据:付款腿组件里 setTimeout/setInterval
# 的回调体(≤300 字符内)不得出现 emit("complete")。ceiling(如实):回调体超长或经变量间接 emit 抓不到,
# 运行时判据由 tester「扫码页停 60s 不自行推进」+ scripts/pending-checkout-runtime.mjs(停 15s 不推进)兜。
# ceiling 补充(2026-08-16 审计):文件名枚举(第三条腿要手动加进来)/ 变量间接 emit 抓不到;checkout.vue 里
# awaiting→confirmed 的 2.4s 定时器是用户点「我已完成支付」**之后**的 mock 结算腿,不在本门语义内。
# 红测:把 12s 定时器加回 chain-payment → 本门红。
pay_auto=$("$NODE_BIN" -e '
const fs=require("fs");const bad=[];
for (const f of ["src/components/store/chain-payment.vue","src/components/store/card-payment.vue"]) {
  if(!fs.existsSync(f)) { bad.push(f+": missing (payment leg component renamed? update the sentinel)"); continue; }
  const s=fs.readFileSync(f,"utf8"); const re=/set(?:Timeout|Interval)\(([\s\S]{0,300}?)emit\(\s*["'"'"']complete["'"'"']\s*\)/g; let m;
  while((m=re.exec(s))){ const line=s.slice(0,m.index).split(/\r?\n/).length; bad.push(f+":"+line+" timer-driven emit(\"complete\")"); }
}
if(bad.length){console.log(bad.join("\n"));process.exit(1)}' 2>&1)
if [ -z "$pay_auto" ]; then ok "payment leg never auto-completes (no timer-driven emit(\"complete\"))"; else bad "payment leg has a timer-driven complete (mock auto-arrival)"; echo "$pay_auto" | sed 's/^/        /'; fi
# 日期格式化必须跟**应用**语言,不跟设备/浏览器语言(P-096;合并重编号,勿与 P-097=server 退化混淆):toLocale* 不传 locale
# (无参 / undefined / [])= 跟浏览器走,应用 en + 浏览器 zh 时渲染 "Member since 2026年7月",
# 同字符串还会画进 proof 分享海报 canvas。Date 格式化一律传 src/i18n/format.ts 的 dateLocale()。
# 2026-08-15 skeptic 证伪后扩容:除「没传」三形态外,再禁 navigator.* 显式传设备语言、
# 禁字符串字面量 tag(Date 展示必须走 dateLocale() 单源;Number#toLocaleString("en-US") 不受影响,
# 该分支要求 Date 语境)、禁 Intl.DateTimeFormat 的 无参/undefined/[]/navigator 形态。
# ceiling(如实):① 折成多行的调用(grep 按行);② 变量持有的 Date 调裸 .toLocaleString()
# (与数字千分位同形,只兜内联 `new Date(…)` 惯用形);③ Number#toLocaleString()(千分位)有意不管;
# ④ Intl.DateTimeFormat 带字面 tag(钉死某语言、不跟应用语言)不拦,归 review 判断。
sentinel_absent "date toLocale* pins app locale (dateLocale())" 'toLocale(Date|Time)String\(\s*(\)|undefined|\[\s*\]|navigator\.|["'"'"'])|new Date\([^)]*\)\.toLocaleString\(\s*(\)|undefined|\[\s*\]|navigator\.|["'"'"'])|Intl\.DateTimeFormat\(\s*(\)|undefined|\[\s*\]|navigator\.)'
# reverse-ed / meta language must never leak into the product
sentinel_absent "no meta/ponzi words"               '庞氏|割韭菜|杀猪盘|跑路|ponzi|scam|反向教育|揭穿|conversion quest|funnel'
# Funnel-meta vocabulary must not leak into user-facing i18n copy. The sentinel
# above EXCLUDES /i18n/messages/ (to tolerate currency "conversion" + the upsell
# namespace key), so copy-level funnel jargon was blind-spotted there. This gate
# scans the message files directly for unambiguous funnel compounds + a bare
# "转化" value (currency reads 兑换/exchange in copy) → zero false positives.
# (added 2026-06-22: 转化→推荐 task surfaced 3 user-facing leaks past the gate.)
# 2026-08-15 追加「观察者视角」族(真实用户/Real users/Người dùng thật):proof.posterHint 曾以
# 「真实用户会把这种卡片发到…」解说套路 —— 产品要对用户直说,不许旁白解说用户行为。
i18n_meta=$(grep -rEnI '转化路径|转化门槛|转化率|转化漏斗|"转化"|conversion path|conversion gate|conversion funnel|conversion rate|真实用户|[Rr]eal users|Người dùng thật' src/i18n/messages 2>/dev/null | head -5)
if [ -z "$i18n_meta" ]; then ok "no funnel-meta in i18n copy (0 hits)"; else bad "funnel-meta leaked into i18n copy"; echo "$i18n_meta" | sed 's/^/        /'; fi
# 产品语义:NexGrid 出租 AI 算力,不做加密挖矿 —— 用户可见文案里的挖矿词族既是品牌语义错,
# 也是上架合规风险。现场 / 判据 / 两处刻意放行(en "Mine ({n})" = 我的;vi đào tạo = 培训)
# 与判据自检都在 scripts/mining-copy-gate.mjs 里说明。同型第二次:上一轮只删了单句、哨兵也只
# 钉死那单句(见下方 SPEC-4 段仍保留的那条),词族其余成员因此活了下来 → 本门改判整个词族。
if "$NODE_BIN" scripts/mining-copy-gate.mjs >/tmp/uni-mining-copy.log 2>&1; then
  ok "$(cat /tmp/uni-mining-copy.log)"
else
  bad "crypto-mining vocabulary in i18n copy"; sed 's/^/        /' /tmp/uni-mining-copy.log
fi
# copy hygiene: <text> renders raw — markdown tokens (**bold**, `code`) show as
# literal stars/backticks, and route-path literals violate the no-jargon rule.
# (added 2026-07-09: owner caught **直接版税** + `/team/binary` in how-page copy.)
# 🔴 2026-08-13 换成脚本门:原先是对**整个文件**做子串 grep,不剥注释 —— 在 i18n 文件里
# 写一句带 markdown 强调的中文注释就会判红,而它要守的是「用户看得到的文案」里不许有 markdown。
# 本仓记过这一族:子串哨兵必须先剥注释再匹配。新门只在**字符串字面量的值**里找,
# 并对「一条文案都没抠到」判红(候选集为 0 = 判据失效)。红测:文案里塞 → 红;注释里塞 → 绿。
if "$NODE_BIN" scripts/i18n-copy-residue-gate.mjs > /tmp/uniapp-i18n-residue.log 2>&1; then
  ok "i18n 文案 markdown 残留门 — $(tail -1 /tmp/uniapp-i18n-residue.log)"
else
  bad "i18n 文案里有 markdown 残留 — node scripts/i18n-copy-residue-gate.mjs 看明细"
  grep -E "^(FAIL| )" /tmp/uniapp-i18n-residue.log | head -8
fi
# 焦虑词哨兵(2026-08-15 pkg/zk):用户可见字符串禁内部运营/审查术语(人工审核/风控/审查/
# manual review/xét duyệt…)。同 residue 门惯例:剥注释只扫字符串值、候选下限判红;
# 确需保留的行(注销等破坏性流程)用 `anxiety-exempt: <理由>` 行内豁免,豁免清单随 PASS 输出供 review。
if "$NODE_BIN" scripts/anxiety-copy-gate.mjs > /tmp/uniapp-anxiety-copy.log 2>&1; then
  ok "焦虑词哨兵 — $(head -1 /tmp/uniapp-anxiety-copy.log)"
else
  bad "用户可见文案命中焦虑/内部术语禁词 — node scripts/anxiety-copy-gate.mjs --list 看全量"
  grep -E "^(FAIL| )" /tmp/uniapp-anxiety-copy.log | head -8
fi
# token discipline: no hardcoded v5 light hex in components (use var(--v5-*))
# 保留为「无豁免硬地板」:这 4 个是最核心的 token 值,任何形式都不许出现,连 allowlist 也不给。
# 全量覆盖(45 个 token × hex/rgb/rgba 三种写法 + 变 alpha 副本)由下面的 token_copy_gate 承担。
sentinel_absent "no hardcoded #0E48E6/#F4F1E9 hex"  '#0E48E6|#F4F1E9|#FF5A1F|#13141A'
# safe-area base padding (PITFALLS P-065): any padding that references
# env(safe-area-inset-bottom) must carry a base offset ≥22px — a bare env()
# (base 0) or a small base hugs the iOS home indicator. House baseline = 38px
# (bottom sheets); 22px floor admits the chat composer. Both operand orders +
# the env(…, 0px) fallback form are parsed.
sa_bad=$("$NODE_BIN" -e '
const fs=require("fs"),path=require("path");
const bad=[];
const re1=/(\d+(?:\.\d+)?)px\s*\+\s*env\(safe-area-inset-bottom(?:,[^)]*)?\)/;
const re2=/env\(safe-area-inset-bottom(?:,[^)]*)?\)\s*\+\s*(\d+(?:\.\d+)?)px/;
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);
if(s.isDirectory())walk(p);else if(/\.(vue|css)$/.test(f)){
fs.readFileSync(p,"utf8").split(/\r?\n/).forEach((ln,i)=>{
if(!ln.includes("safe-area-inset-bottom"))return;
const m=ln.match(re1)||ln.match(re2);
const base=m?parseFloat(m[1]):0;
if(base<22)bad.push(p.split(path.sep).join("/")+":"+(i+1)+" base="+base+"px");});}}})("src");
if(bad.length){console.log(bad.join("\n"));process.exit(1)}' 2>&1)
if [ -z "$sa_bad" ]; then ok "safe-area-inset-bottom base padding >=22px (P-065)"; else bad "safe-area base padding <22px (iOS home-indicator hug)"; echo "$sa_bad" | sed 's/^/        /'; fi
# Auth/onboarding bare pages must use one system-chrome owner. This catches the
# orthogonal failure where a new flow page looks fine but forgets the status bar,
# Home Indicator, or bottom safe-area reserve (P-069).
if "$NODE_BIN" <<'NODE' >/tmp/uni-auth-system-chrome.log 2>&1
const fs = require("fs");
const path = require("path");
const flowDirs = ["onboarding", "login", "register", "ref", "session"];
const pages = [];
for (const dir of flowDirs) {
  const root = path.join("src/pages", dir);
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const file = path.join(current, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (name.endsWith(".vue")) pages.push(file.split(path.sep).join("/"));
    }
  };
  walk(root);
}
for (const file of pages) {
  const source = fs.readFileSync(file, "utf8");
  if (!/<StandalonePageShell\b/.test(source) || !/import StandalonePageShell from "@\/components\/device\/standalone-page-shell\.vue"/.test(source)) {
    throw new Error(`${file}: missing StandalonePageShell`);
  }
  if (!/data-system-chrome-primary/.test(source)) throw new Error(`${file}: missing runtime primary-control marker`);
}
const shell = fs.readFileSync("src/components/device/standalone-page-shell.vue", "utf8");
if (!/DeviceStatusBar/.test(shell) || !/DeviceHomeIndicator/.test(shell)) throw new Error("standalone shell chrome incomplete");
if (!/BOTTOM_SAFE_PADDING\s*=\s*"calc\(env\(safe-area-inset-bottom, 0px\) \+ 38px\)"/.test(shell)) throw new Error("standalone shell lost 38px bottom safe-area baseline");
if (!/paddingBottom:\s*props\.reserveBottom\s*\?\s*BOTTOM_SAFE_PADDING\s*:\s*"0px"/.test(shell)) throw new Error("standalone shell no longer applies its bottom safe-area baseline");
const chassis = fs.readFileSync("src/components/app-chassis.vue", "utf8");
if (!/<DeviceHomeIndicator\s*\/>/.test(chassis)) throw new Error("AppChassis no longer shares DeviceHomeIndicator");
const estimator = fs.readFileSync("src/pages/onboarding/estimator.vue", "utf8");
if (!/:top-inset="24"/.test(estimator) || !/\.est-cta\s*\{[\s\S]*?margin-right:\s*4px;[\s\S]*?margin-left:\s*4px;/.test(estimator)) {
  throw new Error("estimator CTA no longer aligns to register-success 24px side inset");
}
const success = fs.readFileSync("src/pages/register/success.vue", "utf8");
if (!/\.rs-footer\s*\{[^}]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ 38px\)/.test(success)) {
  throw new Error("register-success CTA lost 38px bottom baseline");
}
NODE
then
  ok "all bare login-entry pages share status bar + Home Indicator shell (P-069)"
else
  bad "bare login-entry system chrome contract"; sed 's/^/        /' /tmp/uni-auth-system-chrome.log
fi
if scope_hit login-entry-chrome-runtime; then
if "$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null | grep -q 200; then
  if probe_retry /tmp/uni-auth-system-chrome-runtime.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/auth-system-chrome-runtime.mjs; then
    ok "bare login-entry system chrome runtime geometry (P-069)"
  else
    bad "bare login-entry system chrome runtime geometry"; sed 's/^/        /' /tmp/uni-auth-system-chrome-runtime.log
  fi
else
  skipped "bare login-entry system chrome runtime geometry (dev server not running at $BASE_URL)"
fi
fi
# ── SPEC-1 R7: factor reads device truth, never the viewing carrier ──
sentinel_present "SPEC-1 R7 online seam exported" src/lib/hashpower.ts 'export function isDeviceOnline'
sentinel_present "SPEC-1 R7 display/settle offline branch" src/lib/hashpower.ts '!input\.online'
sentinel_present "SPEC-1 R7 heartbeat typed" src/store/types.ts 'onlineHeartbeatAt'
sentinel_present "SPEC-1 R7 heartbeat freshest-wins merge" src/store/account-cloud.ts '"onlineHeartbeatAt"'
sentinel_present "SPEC-1 R7 settle reads device online" src/store/app.ts 'isDeviceOnline\(d, now\)'
sentinel_present "SPEC-1 R7 App stamps heartbeat" src/store/app.ts 'onlineHeartbeatAt: now'
sentinel_present "SPEC-1 R7 home row uses true-online seam" src/components/home/device-row.vue 'isDeviceOnline\(props\.device, Date\.now\(\)\)'
sentinel_present "SPEC-1 R7 home slot uses true-online seam" src/components/home/device-slot.vue 'isDeviceOnline\(props\.device, Date\.now\(\)\)'
sentinel_present "SPEC-1 R7 me summary uses true-online seam" src/pages/me/me.vue 'isDeviceOnline\(device, Date\.now\(\)\)'
sentinel_present "SPEC-1 R7 legacy me card uses true-online seam" src/components/me/my-devices-entry.vue 'isDeviceOnline\(device, Date\.now\(\)\)'
sentinel_present "SPEC-1 R7 me summary binds label to true-online count" src/pages/me/me.vue 'onlineLabel.*n: onlineCount\.value'
sentinel_present "SPEC-1 R7 legacy me card binds label to true-online count" src/components/me/my-devices-entry.vue 'onlineLabel.*n: onlineCount\.value'
if grep -nE 'd\.status === "online"|props\.device\.status === "online"' \
  src/components/home/device-row.vue \
  src/components/home/device-slot.vue \
  src/components/earn/device-card-pc.vue \
  src/components/me/wallet-card.vue \
  src/components/me/my-devices-entry.vue \
  src/pages/me/me.vue \
  src/pages/me/proof.vue \
  src/pages/support/chat.vue \
  src/mock/nova-templates.ts >/tmp/uni-r7-ui-status.log 2>&1; then
  bad "SPEC-1 R7 user-facing online state bypasses heartbeat seam"; sed 's/^/        /' /tmp/uni-r7-ui-status.log
else
  ok "SPEC-1 R7 user-facing online state uses heartbeat seam"
fi
sentinel_present "wallet dev reset UI is DEV-only" src/pages/me/wallet-withdraw.vue 'import\.meta\.env\.DEV && options\?\.dev === "1"'
# z1 判决 A(2026-08-10):a8f57f4 把 guard 加强为 `PROD || remoteApiEnabled`,旧判据钉死
# 单条件整串被正常加强撞红。改锚「函数级 PROD 守卫 ≥2 处」(两个 _dev reset 都要有),
# 允许附加析取;剥注释防注释哄绿;0/1 处即红。
# 🔴 逐函数验,不数总数(z1 R2 独立审计:数总数会被「一个函数里写两遍守卫、另一个函数
# 守卫被删」骗过)。剥行注释与块注释,防注释里的守卫字面哄绿。
payout_guard_miss=""
payout_src=$(sed 's|/\*[^*]*\*/||g; s|//.*||' src/store/payout-address.ts | tr -d '\r')
for fn in _devClearRestrictions _devResetAddresses; do
  body=$(echo "$payout_src" | sed -n "/function ${fn}(/,/^  }/p")
  if [ -z "$body" ]; then
    payout_guard_miss="${payout_guard_miss}${fn}(函数体抠不到) "
  elif ! echo "$body" | grep -qE 'if \(import\.meta\.env\.PROD[^)]*\) return'; then
    payout_guard_miss="${payout_guard_miss}${fn}(无 PROD 守卫) "
  fi
done
if [ -z "$payout_guard_miss" ]; then
  ok "payout-address 两个 dev reset 各自函数体内都有 PROD 守卫(允许 || remoteApiEnabled 加强)"
else
  bad "payout-address dev reset PROD 守卫缺失: $payout_guard_miss"
fi
# mock 诊断横幅是**开发**信息面(工程话),按仓规不得上用户的屏。两条断言缺一不可:
#   ① 闸还在(删掉 `isDevBuild &&` 就红)② 文案没被搬回三语词典(搬回去就成了用户文案契约,
#   而词典是普通对象、摇不掉,会原样进生产包 —— 这正是上一版 DEV-gate 没闭合的那半)。
sentinel_present "staking mock notice is DEV-only" src/pages/staking/staking.vue 'v-if="isDevBuild && staking\.isMockMode"'
sentinel_present "exchange mock notice is DEV-only" src/pages/me/wallet-exchange.vue 'v-else-if="isDevBuild && !remoteApiEnabled"'
# 🔴 这条必须自己 grep:sentinel_absent 的默认排除清单里就有 /i18n/messages/,
#    用它来断言「词典里没有某个键」会永远 0 命中 —— 门看着绿,其实压根没扫词典。
mock_key_hits=$(grep -rn "mockModeNotice" src/i18n/messages src/pages src/components 2>/dev/null | head -5)
if [ -z "$mock_key_hits" ]; then ok "mock 诊断文案不在 i18n 契约里 (0 hits · 已扫 i18n/messages + pages + components)"
else bad "mock 诊断文案被搬回 i18n 词典 — 它是工程话,进词典就是用户文案契约,且词典对象摇不掉会原样进生产包"; echo "$mock_key_hits" | sed 's/^/        /'; fi
if grep -qE '5-15%|5-15%' src/i18n/messages/en.ts src/i18n/messages/zh.ts 2>/dev/null; then
  bad "staking disclosure understates 180d/365d principal penalties"
else
  ok "staking disclosure includes canonical high-tier penalties"
fi
sentinel_present "staking risk disclosure EN names all four penalties" src/i18n/messages/en.ts '5% / 15% / 30% / 50% of principal'
sentinel_present "staking how-it-works EN maps all four penalties" src/i18n/messages/en.ts '5% \(30d\).*15% \(90d\).*30% \(180d\).*50% \(365d\)'
sentinel_present "staking risk disclosure ZH names all four penalties" src/i18n/messages/zh.ts '5% / 15% / 30% / 50% 本金'
sentinel_present "staking how-it-works ZH maps all four penalties" src/i18n/messages/zh.ts '30 天扣 5%.*90 天扣 15%.*180 天扣 30%.*365 天扣 50%'
if grep -qE 'simulation engine|simulated\. Real deployments|DEMO CONNECTION|Simulate linking|Simulate connection|模拟引擎|模拟生成|演示连接|模拟连接' src/i18n/messages/en.ts src/i18n/messages/zh.ts 2>/dev/null; then
  bad "user-facing copy exposes mock/simulation internals"
else
  ok "user-facing copy hides mock/simulation internals"
fi
if grep -qE 'mid-operation|运营中期' src/i18n/messages/en.ts src/i18n/messages/zh.ts 2>/dev/null; then
  bad "user-facing copy exposes internal product-phase labels"
else
  ok "user-facing copy hides internal product-phase labels"
fi
sentinel_present "daily sign-in atomic seam names canonical endpoint" src/pages/daily/daily.vue 'POST /api/faucet/sign-in'
sentinel_present "daily milestone atomic seam is honest TBD" src/pages/daily/daily.vue 'milestone-claim endpoint TBD'
# 🔴 2026-08-13 三条重锚:原先钉的是**组件注释**里的 `POST /api/quests/weekly/{tier1|tier2|bonus}`。
#   领奖已下沉到接口层(组件只调 `wq.claim(q)`),那三个路径全仓已无实现,注释也随之删掉 —— 判据过期。
#   重锚到端点**真正被写出来的地方**,而且钉的是**真实代码不是注释**:注释会漂,代码不会。
#   领奖端点现为 `/api/quests/{questCode}/claim`,状态端点为 `/api/quests/state`。
sentinel_present "weekly quest claim seam names canonical endpoint" src/api/quest-api.ts '/api/quests/\$\{encodeURIComponent'
sentinel_present "weekly quest state seam names canonical endpoint" src/api/quest-api.ts '"/api/quests/state"'
sentinel_present "event claim atomic seam is honest TBD" src/pages/events/events.vue 'event-claim endpoint TBD'
if grep -qE 'input\.carrier|carrier ===|getCarrier|from "@/lib/carrier"' src/lib/hashpower.ts 2>/dev/null; then
  bad "SPEC-1 R7 hashpower must not read/import view carrier"
else
  ok "SPEC-1 R7 hashpower reads device online, never view carrier"
fi
if grep -qE 'function settleDevice\([^)]*carrier' src/store/app.ts 2>/dev/null; then
  bad "SPEC-1 R7 settleDevice must not take carrier"
else
  ok "SPEC-1 R7 settleDevice factor is carrier-independent"
fi
if "$NODE_BIN" -e 'const s=require("fs").readFileSync("src/store/app.ts","utf8");const a=s.indexOf("export function settleDeviceBatch");const b=s.indexOf("const settled =",a);const c=s.indexOf("onlineHeartbeatAt: now",a);if(a<0||b<0||c<0||b>c)process.exit(1)' 2>/dev/null; then
  ok "SPEC-1 R7 stale gap settles before heartbeat refresh"
else
  bad "SPEC-1 R7 heartbeat refresh must happen after stale-gap settlement"
fi
sentinel_present "SPEC-1 hosted baseline present" src/lib/hashpower.ts 'H5_BASE_FACTOR'
sentinel_present "SPEC-1 carrier retained only as App heartbeat source" src/lib/carrier.ts '#ifdef APP-PLUS'
# settle-single-source: earnings accrue by WALL-CLOCK Δ via settleDevice (not tick-time / fixed window)
sentinel_present "SPEC-1 settle: settleDevice exists" src/store/app.ts 'function settleDevice'
sentinel_present "SPEC-1 settle: wall-clock lastSettledAt anchor" src/store/app.ts 'now - d\.lastSettledAt'
sentinel_present "SPEC-1 settle: Device.lastSettledAt typed" src/store/types.ts 'lastSettledAt'
# single accrual source: the baseRate accrual must appear EXACTLY once (no 2nd bypass)
SPEC1_ACC=$(grep -cE 'd\.baseRate \* lifeEff \* phoneFactor' src/store/app.ts 2>/dev/null)
if [ "$SPEC1_ACC" = "1" ]; then ok "SPEC-1 settle single-source: 1 accrual site"; else bad "SPEC-1 settle: expected 1 accrual site, found $SPEC1_ACC"; fi
# Device detail chain: owned-device instance id, registered route, expanded body.
sentinel_present "device detail page exists" src/pages/earn/device-detail.vue 'class="nx-device-detail'
sentinel_present "device detail route registered" src/pages.json 'pages/earn/device-detail'
sentinel_present "device detail defaults expanded" src/pages/earn/device-detail.vue 'const expanded = ref\(true\)'
sentinel_present "device detail rejects inactive inventory" src/pages/earn/device-detail.vue 'item\.activatedAt !== null'
sentinel_present "device card secondary controls are keyboard-accessible" src/components/earn/device-card-pc.vue '@keydown\.space\.stop\.prevent="toggleNetwork"'
sentinel_present "device quick menu is a modal dialog" src/components/earn/device-card-pc.vue 'aria-modal="true"'
sentinel_present "device quick menu traps focus" src/components/earn/device-card-pc.vue 'function trapMenuFocus'
sentinel_present "device quick menu traps native H5 keydown in capture phase" src/components/earn/device-card-pc.vue 'addEventListener\("keydown", onDocumentMenuKeydown, true\)'
sentinel_present "home slot opens owned device id" src/components/home/device-slot.vue 'device-detail\?id=\$\{encodeURIComponent\(props\.device\.id\)\}'
sentinel_present "home row opens owned device id" src/components/home/device-row.vue 'device-detail\?id=\$\{encodeURIComponent\(props\.device\.id\)\}'
sentinel_present "home slot device detail is keyboard-accessible" src/components/home/device-slot.vue '@keydown\.enter\.prevent="go"'
sentinel_present "home row device detail is keyboard-accessible" src/components/home/device-row.vue '@keydown\.enter\.prevent="go"'
sentinel_present "shared sub-page back is keyboard-accessible" src/components/sub-page-header.vue '@keydown\.enter\.prevent="goBack"'
# ⚠️ 上面这 4 条 keyboard-accessible 哨兵是**枚举式**的:各盯死一个控件名 + 一个 handler 名。
# 2026-08-11 量面结果说明了枚举式判据的天花板 —— 它们守住 4 个控件,而当时全仓有 151 个
# 自造控件键盘不可达(覆盖率 3%)。构造性判据见文件末尾的 a11y_activate_gate:那道门遍历
# 「全仓每一个模板元素」,新控件天然落进判定域,不需要谁记得往这张清单里补一行。
# 这 4 条保留:它们额外锁的是「这几个具体控件的具体行为别被改掉」,与构造性门不重叠;
# 但**不要再往这张清单里加新的**——加了也追不上问题面的增长速度。
# ── SPEC-7 风险簇/三桶/释放/提现 sentinels(推倒重写版 2026-07-02)──
# 契约层: 全参数寄存器 + 新增整改 key(R1/R2/R4)
sentinel_present "SPEC-7 risk cluster config typed" src/store/config-types.ts 'interface RiskClusterConfig'
sentinel_present "SPEC-7 release mode has no auto variant (R1)" src/store/config-types.ts '"attest_or_manual" \| "manual_only"'
sentinel_present "SPEC-7 free-slot binding gate typed (R4)" src/store/config-types.ts 'freeSlotRequiresBinding: boolean'
sentinel_present "SPEC-7 first-withdrawal-manual typed (R2)" src/store/config-types.ts 'firstWithdrawalManual: boolean'
sentinel_present "SPEC-7 new-address hold typed (R2)" src/store/config-types.ts 'newAddressHoldHours: number'
sentinel_present "SPEC-7 welcome gift lock mode typed" src/store/config-types.ts 'WelcomeGiftLockMode'
sentinel_present "SPEC-7 K4 dimension weights typed (R3)" src/store/config-types.ts 'dimensionWeights'
sentinel_present "SPEC-7 risk cluster seeded" src/mock/platform-config.ts 'releaseMode: "attest_or_manual"'
sentinel_present "SPEC-7 withdraw rules seeded" src/mock/platform-config.ts 'firstWithdrawalManual: true'
sentinel_present "SPEC-7 gift lock seeded" src/mock/platform-config.ts 'lockMode: "risk_bucket"'
# z1 判决 A:克隆逻辑 819a6da 起搬进 lib/platform-config-compat.ts(config store 经
# completePlatformConfigSeed 初始化)。字面 pin 换行为门:克隆隔离 / captchaAlwaysScenes
# 有效值 / WD02 网络费逐键 parity 全走「合成后的有效配置」,种子文件形态属实现细节。
if ADMIN_ROOT="$ADMIN_ROOT" "$NODE_BIN" scripts/selfcheck-config-compat.mjs > /tmp/uni-config-compat.log 2>&1; then
  ok "platform-config compat 行为门 — $(tail -1 /tmp/uni-config-compat.log)"
else
  bad "platform-config compat 行为门失败 — node scripts/selfcheck-config-compat.mjs 看明细"
  tail -12 /tmp/uni-config-compat.log | sed 's/^/        /'
fi
# 引擎层: 身份注册表(独立于会话存储)+ 实时聚簇 + 释放 + 提现前置
sentinel_present "SPEC-7 risk registry isolated storage" src/store/risk-identity.ts 'nexgrid-risk-registry-v1'
sentinel_present "SPEC-7 registry tracks first withdrawal (R2)" src/store/risk-identity.ts 'hasWithdrawn'
sentinel_present "SPEC-7 registry tracks attestation" src/store/risk-identity.ts 'attestedOnlineMs'
sentinel_present "SPEC-7 realtime cluster evaluator (R5)" src/store/risk-cluster.ts 'export function evaluateAccountCluster'
sentinel_present "SPEC-7 multi-dimension clustering (R3)" src/store/risk-cluster.ts 'function dimensionHits'
sentinel_present "SPEC-7 bare identity enters watch (R3)" src/store/risk-cluster.ts 'bare-identity'
sentinel_present "SPEC-7 unbound free slot pends (R4)" src/store/risk-cluster.ts 'unbound-free-slot'
# 【z1 判决 C · 显式退役】「release ledger exists(nexgrid-earning-ledger-v1)」与
# 「cluster circuit breaker(clusterBreakerTripped)」两门删除:c37e642 起客户端释放引擎
# 整体让渡后端(earning-release.ts 只剩远端快照只读 shell),本地账本/熔断的主语已不存在。
# 替代防线:服务端下发 clusterRestricted(earnings-release-api 协议校验 + 新链
# hard-block-k1-runtime-contract 四条)+ 下面两条重锚 pin。服务端账本义务已记 HANDOFF。
sentinel_present "SPEC-7 release status served remotely (read-only client)" src/store/earning-release.ts 'refreshEarningsReleaseStatus'
sentinel_present "SPEC-7 server breaker flag protocol-validated" src/api/earnings-release-api.ts 'clusterRestricted'
sentinel_present "SPEC-7 release sources limited to attest|manual (R1)" src/store/earning-release.ts 'type ReleaseSource = "attest" \| "manual"'
if grep -qE 'releasedBy: *"(timer|auto)"' src/store/earning-release.ts 2>/dev/null; then
  bad "SPEC-7 release engine must not have a time/auto release source (R1)"
else
  ok "SPEC-7 release engine has no auto release source (R1)"
fi
sentinel_present "SPEC-7 eligibility reads live cluster (R5)" src/store/withdrawal-eligibility.ts 'evaluateAccountCluster\(key\)'
# 判定已下沉到 core(shell 只转发原始对象);断言跟着逻辑走,别 pin 在空壳上。
sentinel_present "SPEC-7 first withdrawal reviewed (R2)" src/store/withdrawal-eligibility-core.ts 'first-withdrawal-review'
sentinel_present "SPEC-7 new address hold routed (R2)" src/store/withdrawal-eligibility-core.ts 'new-address-hold'
# 消费层: 注册 / 结算 / 钱包 / 提现
sentinel_present "SPEC-7 register evaluates via engine" src/pages/register/register.vue 'evaluateRegistration\(prospectiveIdentity\(\)'
sentinel_present "SPEC-7 register honors signup gate" src/pages/register/register.vue 'assessment\.gateRoute !== "manual_or_reject"'
sentinel_present "SPEC-7 register OTP verify is async with loading state" src/pages/register/register.vue 'verifying\.value = true'
sentinel_present "SPEC-7 register review copy is reason-aware" src/pages/register/register.vue 'rewardReviewBodyUnbound'
sentinel_present "SPEC-7 register commits canonical account identity" src/pages/register/register.vue 'commitRegistration\(createdIdentity'
sentinel_present "SPEC-7 welcome gift routes through idempotent buckets (R6)" src/pages/register/register.vue 'creditRewardBucketOnce\(registration\.giftRef, registration\.giftRoute'
sentinel_present "SPEC-7 welcome gift claimed per canonical account" src/pages/register/register.vue 'ensureGiftClaim\(createdIdentity'
sentinel_present "SPEC-7 sponsorship tracks claimed accounts" src/store/sponsorship.ts 'giftClaimedByAccount'
# 新人礼金额可配(2026-07-03 主人批): 金额只从 platform config 读,本地常量禁存(CGM-F-020)
sentinel_present "SPEC-7 gift amounts read from config" src/store/sponsorship.ts 'rewards\.welcomeGift'
sentinel_present "SPEC-7 gift usdt amount seeded" src/mock/platform-config.ts 'usdtAmount: 5'
sentinel_present "SPEC-7 gift nex amount seeded" src/mock/platform-config.ts 'nexAmount: 20'
if grep -rqE 'WELCOME_GIFT_USDT|WELCOME_GIFT_NEX' src/ 2>/dev/null; then
  bad "SPEC-7 gift amount local constants must not exist (config is single source)"
else
  ok "SPEC-7 no local gift amount constants (config-derived)"
fi
sentinel_present "SPEC-7 gift copy parameterized (zh)" src/i18n/messages/zh.ts '\{usd\} USDT \+ \{nex\} NEX'
sentinel_present "SPEC-7 gift copy parameterized (en)" src/i18n/messages/en.ts '\{usd\} USDT \+ \{nex\} NEX'
sentinel_present "SPEC-7 settle reads live cluster (R5)" src/store/app.ts 'evaluateAccountCluster\(accountKey\.value\)'
sentinel_present "SPEC-7 settle buckets earnings" src/store/app.ts 'bucketUserEarnings'
# 【z1 判决 C · 假绿清理】原「settle journals ×2」「settle applies release engine」三门
# 删除:appendLedgerEntry / evaluateAttestRelease 在 c37e642 后是恒 no-op 空壳,钉空壳
# 调用点 = 绿着守死代码(哨兵假绿病,盯上重构后没人用的代码)。空壳本体是过渡脚手架,
# 由上方 read-only client pin + 新链契约接管。
sentinel_present "SPEC-7 settle accrues app attestation" src/store/app.ts 'recordAttestation\(accountKey\.value'
sentinel_present "SPEC-7 settle pauses on config sync failure" src/store/app.ts 'if \(cfgStore\.syncFailed\) return'
sentinel_present "SPEC-7 config sync-failed dev toggle prod-guarded" src/store/config.ts '_devSetConfigSyncFailed'
sentinel_present "SPEC-7 wallet shows config sync failure state" src/pages/me/wallet.vue 'syncFailedTitle'

# ── PAY-VN 越南支付架构(规格 PRD/specs/ 下的「越南支付架构规格 v1.0」· 2026-07-24)──
#    注:此处刻意不写规格文件名全称 —— 文件名带旧品牌前缀,写全会被本文件的 brand 哨兵抓,
#    而为它开白名单会因整行过滤放行一大片(见 no_oldbrand_check 处的红测记录)。
# 入金 = USDT(TRC20/ERC20/BEP20)+ VietQR 银行转账 + 卡;出金仅 USDT;BTC/ETH 充提已下线。
if grep -rnE '\b(BTC|Bitcoin|bc1q)\b' src/store/deposits-core.ts src/store/deposits.ts src/store/fx.ts src/store/fx-core.ts src/pages/me/wallet-topup.vue src/pages/me/wallet-withdraw.vue src/pages/me/wallet-address-rebind.vue src/components/me/deposit-usdt-pane.vue src/components/me/deposit-bank-pane.vue src/components/store/chain-payment.vue src/pages/store/checkout.vue src/components/me/topup-card-form.vue >/dev/null 2>&1; then
  bad "PAY-VN BTC/Bitcoin 通道残留(充提已收窄仅 USDT 三网络)"
else
  ok "PAY-VN 支付面无 BTC 通道残留(仅 USDT×3)"
fi
sentinel_present "PAY-VN 通道枚举单源含 VietQR" src/store/types.ts 'bank-vietqr'
sentinel_present "PAY-VN 通道枚举单源含 BEP20" src/store/types.ts 'usdt-bep20'
sentinel_present "PAY-VN 链上通道费表单源" src/store/deposits-core.ts 'export const CHAIN_DEPOSIT_FEE_USDT'
sentinel_present "PAY-VN fx 牌价派生不缓存(computed)" src/store/fx.ts 'quoteRate = computed\(\(\) => computeQuoteRate'
# 换绑冻结的判定从 shell 的 isRebindFrozen() 调用改为 core 内联算(toRawFacts),断言改盯 core 的冻结闸本身。
sentinel_present "PAY-VN 换绑冻结下沉评估层(server-canonical)" src/store/withdrawal-eligibility-core.ts 'rebind-freeze'
# 卡轨四条(2026-07-27 audit:此前卡轨走统一入金账后一条哨兵都没有,改坏无人拦)。
# 记账口径最关键 —— 把 gross 塌回 credited 等于平台白送手续费,而纯逻辑 selfcheck
# 只加载 deposits-core,守不到 deposits.ts 里的记录三元组(变异测试实证全绿)。
sentinel_present "PAY-VN 卡轨记账口径(gross = 实扣额,非入账额)" src/store/deposits.ts 'grossAmountUsdt: cardChargeUsd\(credited\)'
sentinel_present "PAY-VN 卡轨账号守卫(授权等待期跨账号不落账)" src/store/deposits.ts 'expectedAccountKey !== boundKey'
sentinel_present "PAY-VN 入金主键查重(DP 号同日仅 9000 种)" src/store/deposits.ts 'function mintDepositId'
sentinel_present "PAY-VN 卡费整数域(半分边界不被浮点压低)" src/store/deposits-core.ts 'cents \* bps'
if grep -rnE '26,?390' src/store/ src/components/me/ 2>/dev/null | grep -vqE 'fx-core|selfcheck'; then
  bad "PAY-VN 硬编码牌价 26390(必须从 fx-core computeQuoteRate 派生)"
else
  ok "PAY-VN 无硬编码牌价(单源派生)"
fi

# FEAT-AUTH01 OTP 防轰炸闸门(PRD §4.6.2/§16.2.1;规格 PRD/specs/FEAT-AUTH01-otp-antibomb-gate.md)
sentinel_present "AUTH01 captcha ticket must be explicit (audit P0 fix)" src/store/auth-otp.ts '!!captchaTicket &&'
sentinel_present "AUTH01 cooldown rejects without minting new code" src/store/auth-otp.ts 'error: "rate_limited"'
sentinel_present "AUTH01 otpGate thresholds read from config" src/store/auth-otp.ts 'useConfig\(\)\.config\.otpGate'
sentinel_present "AUTH01 otpGate seeded in platform config" src/mock/platform-config.ts 'captchaAfterSends: 2'
sentinel_present "AUTH01 login send gated via store" src/pages/login/login.vue 'await otpSend\('
sentinel_present "AUTH01 register send gated via store" src/pages/register/register.vue 'await otpSend\('
sentinel_present "AUTH01 login verify via store" src/pages/login/login.vue 'await otpVerify\('
sentinel_present "AUTH01 register verify via store" src/pages/register/register.vue 'await otpVerify\('
sentinel_present "AUTH01 captcha fail cap single-source" src/components/captcha-slider.vue 'MAX_CAPTCHA_FAILS'
if grep -qE 'const RESEND_SECONDS' src/pages/login/login.vue src/pages/register/register.vue 2>/dev/null; then
  bad "AUTH01 resend seconds local constants must not exist (otpGate config is single source)"
else
  ok "AUTH01 no local resend-seconds constants (config-derived)"
fi
# FEAT-AUTH03 注册场景滑块前置(规格 PRD/specs/FEAT-AUTH03-register-captcha-always.md)
# z1 判决 A:captchaAlwaysScenes 已出种子进 compat 运行时默认(819a6da/c37e642),
# 值 pin 改由 selfcheck-config-compat 对**合成后的有效配置**行为断言(种子显式覆盖掉
# "register" 一样红);此处只留接线哨兵(下方三条不动)。
# 接线门:判定必须出现在 otpSend 函数体内(剥注释后)。sed 函数头带左括号锚定(防
# otpSendXxx 前缀撞名假绿),截取后剥 // 注释 —— 注释里的同名文本不算接线(红测 b1
# 实抓:decision 注释在函数体内,不剥注释时删掉真判定门仍绿)。文件级 grep 抓不住
# 「判定挪出 otpSend 但仍留在文件里」的形态(quota_claim_before_create 同族)。
# 函数头改名/提取为空时 lines=0 按红处理(fail-closed)。
auth03_body=$(sed -n '/^export async function otpSend(/,/^}/p' src/store/auth-otp.ts | sed 's|//.*||')
auth03_body_lines=$(printf '%s\n' "$auth03_body" | grep -c .)
if [ "$auth03_body_lines" -gt 0 ] && printf '%s' "$auth03_body" | grep -q 'captchaAlwaysScenes\.includes(scene)'; then
  ok "AUTH03 scene-forced captcha wired inside otpSend body (scanned $auth03_body_lines code lines)"
else
  bad "AUTH03 captchaAlwaysScenes.includes(scene) not inside otpSend body (code lines=$auth03_body_lines; 判定未接线或被挪出函数体)"
fi
# UI→store 第三段接线 pin(pkg-i 审查 P2):register 页发码调用点必须字面传 "register"
# 场景(剥 // 注释,防注释诱饵)。漂成 "login"/变量时产品回退到阈值规则而 store 层
# 探针/接线门全绿 —— quota_claim_before_create 同族「判定对 ≠ 接上」缺口的 UI 段。
# 注:login.vue 传 sceneAtRequest 变量是双场景页(login/reset)合法形态,不在 pin 范围。
if sed 's|//.*||' src/pages/register/register.vue | grep -qF 'otpSend(phoneAtRequest, "register"'; then
  ok 'AUTH03 register.vue passes literal "register" scene to otpSend (comment-stripped)'
else
  bad 'AUTH03 register.vue otpSend scene wiring drifted (expect literal otpSend(phoneAtRequest, "register" after comment strip)'
fi
# FEAT-AUTH02 已注册手机号分流：账号目录是唯一事实源；验证码通过后才可发现
# 老号进入既有登录链后，目标页 toast 必须持续展示可读提示。运行时链放在下方 H5
# browser gate。
sentinel_present "AUTH02 phone account directory exists" src/store/auth-account.ts 'AUTH_ACCOUNT_STORAGE_KEY'
sentinel_present "AUTH02 OTP exchanges verified old number" src/store/auth-otp.ts 'exchangeVerifiedSignIn'
sentinel_present "AUTH02 registered-number handoff uses destination toast" src/pages/register/register.vue 'toast\.info\(t\.value\.register\.accountExistsTitle'
sentinel_present "AUTH02 handoff toast is assistive-technology announced" src/components/global-ui.vue 'aria-live="polite"'
sentinel_present "AUTH02 sign-in rejects an unregistered phone identity" src/auth/complete-sign-in.ts '"account_not_found"'
sentinel_present "AUTH02 legacy risk migration seals schema2 barrier" src/store/risk-identity.ts 'sealLegacyRiskRegistryForAuthDirectory'
sentinel_present "AUTH02 sponsorship is rebound per account" src/lib/account-scope.ts 'useSponsorship\(\)\.bindAccount\(accountKey\)'
sentinel_present "AUTH02 sponsorship stores bindings per account" src/store/sponsorship.ts 'bindingsByAccount'
sentinel_present "AUTH02 dev bridge is entrypoint DEV-gated" src/main.ts 'if \(import\.meta\.env\.DEV\)'
sentinel_present "SPEC-7 wallet pending bucket info sheet" src/pages/me/wallet.vue 'pendingSheetTitle'
# 2026-07-24 A6:reason code → 话术码表收口进 lib/risk-reason-text.ts 单源(三渲染源共用,
# 防散抄 dict 漏新增码被 filter(Boolean) 静默吞行);页面哨兵改钉共享函数消费。
sentinel_present "SPEC-7 wallet reasons mapped via i18n (no raw codes)" src/pages/me/wallet.vue 'riskReasonLines\(t\.value'
sentinel_present "SPEC-7 risk reason dict single-source in lib" src/lib/risk-reason-text.ts 't\.wallet\.riskReasons'
sentinel_present "SPEC-7 risk reason dict carries PAY04 rebind codes" src/lib/risk-reason-text.ts '"new-address-large-amount"'
sentinel_present "SPEC-7 payment-instrument overuse mapped (en)" src/i18n/messages/en.ts '"payment-instrument-overuse"'
sentinel_present "SPEC-7 payment-instrument overuse mapped (zh)" src/i18n/messages/zh.ts '"payment-instrument-overuse"'
sentinel_present "SPEC-7 dev bridge is DEV-gated" src/lib/spec7-dev-bridge.ts 'if \(!import\.meta\.env\.DEV\) return'
sentinel_present "SPEC-7 earning buckets typed" src/store/types.ts 'interface EarningBuckets'
sentinel_present "SPEC-7 user carries earningBuckets" src/store/types.ts 'earningBuckets: EarningBuckets'
sentinel_present "SPEC-7 legacy account snapshots receive bucket defaults" src/store/app.ts 'withDefaultEarningBuckets'
sentinel_present "SPEC-7 wallet page reads earning buckets" src/pages/me/wallet.vue 'app\.user\.earningBuckets'
sentinel_present "SPEC-7 wallet card reads earning buckets" src/components/me/wallet-card.vue 'app\.user\.earningBuckets'
# z1 判决 A:2026-07-31「上限=总余额」规则被 D5 server-canonical 新规则取代 ——
# 可提上限 =(总余额 − 服务端 held 两桶)× policy.balanceMaxRatio,且 clusterRestricted /
# 无快照 / 无 policy 三态一律 fail-closed 归 0。判据钉四个承重构件,不钉整串表达式。
# 🔴 必须剥注释再判(z1 R2 独立审计):不剥的话「旧口径备查」式注释就能让四个构件全命中,
# 而实现里 fail-closed 已被删光 —— 资金路径上的注释哄绿。同文件 payout / AUTH03 两块的家法。
wd_avail_src=$(sed -n '/const maxWithdrawable = computed/,/});/p' src/pages/me/wallet-withdraw.vue | sed 's|//.*||' | tr -d '\r')
wd_avail_miss=""
[ -n "$wd_avail_src" ] || wd_avail_miss="${wd_avail_miss}computed-block-missing "
echo "$wd_avail_src" | grep -q 'clusterRestricted) return 0' || wd_avail_miss="${wd_avail_miss}cluster-zero "
echo "$wd_avail_src" | grep -q 'if (!buckets) return 0' || wd_avail_miss="${wd_avail_miss}nobuckets-zero "
echo "$wd_avail_src" | grep -q 'balanceMaxRatio ?? 0' || wd_avail_miss="${wd_avail_miss}ratio-failclosed "
echo "$wd_avail_src" | grep -q 'Math.max(0,' || wd_avail_miss="${wd_avail_miss}held-subtract-clamp "
if [ -z "$wd_avail_miss" ]; then
  ok "withdraw available fail-closed(cluster→0 · 无快照→0 · ×ratio??0 · max(0,余额−held))"
else
  bad "withdraw available fail-closed 缺件: $wd_avail_miss"
fi
# 钱包展示面口径(2026-07-31 立门 → 2026-08-11 主人拍板"标签分离"后改判据)。
#
# 🔴 原判据只有「两处必须同读 usdtBalance」,并在注释里声称"三处同源=总余额"。
#    但提现页的 maxWithdrawable 早已不是总余额(= (总余额−held两桶)×balanceMaxRatio,
#    且三态 fail-closed 归 0),于是这道门**反而把口径分裂锁死了**:值一致的假象保住了,
#    而两边标签都写「可提现」、数却恒不相等(后端缺席时提现页恒 0,钱包页两万四)。
#    → 拍板结论不是把数值统一(那要么钱包页 fail-closed 归 0、要么提现页放宽到总余额
#      架空风控扣留),而是**标签分离**:钱包页显示总余额、但不许自称「可提现」。
#    故本门现在守两面:① 值仍是总余额(原判据,保留);② 标签不含「可提现」语义(新增)。
withdrawable_source_parity() {
  local miss=""
  grep -qE 'const usdt = computed\(\(\) => app\.user\.usdtBalance\)' src/pages/me/wallet.vue || miss="${miss}wallet.vue "
  grep -qE 'const usdt = computed\(\(\) => app\.user\.usdtBalance\)' src/components/me/wallet-card.vue || miss="${miss}wallet-card.vue "
  if [ -z "$miss" ]; then ok "wallet surfaces show total balance (app.user.usdtBalance)";
  else bad "wallet surface value source DRIFT — still on old bucket: $miss"; fi
  # 标签面:显示总余额没问题,标签**不许叫「可提现」** —— 那是提现页那个数的名字。
  # 判据写成语义禁令(禁止某个词义),不枚举具体文案 —— 换句话说改文案可以,改回
  # 「可提现」不行。样本量同时校验:key 少了/被改名 → 判据失锚,必须红而不是静默全过。
  local label_lines label_n bad_labels
  label_lines=$(grep -n 'usdtBalance: "' src/i18n/messages/zh.ts src/i18n/messages/en.ts src/i18n/messages/vi.ts 2>/dev/null | tr -d '\r')
  label_n=$(printf '%s\n' "$label_lines" | grep -c 'usdtBalance: "')
  bad_labels=$(printf '%s\n' "$label_lines" | grep -E '可提现|Withdrawable|có thể rút')
  if [ "${label_n:-0}" -ne 6 ]; then
    bad "usdtBalance 标签样本量应为 6(zh/en/vi × wallet+me),实得 ${label_n:-0} — 判据已失锚,先修判据"
  elif [ -n "$bad_labels" ]; then
    bad "钱包展示面标签仍自称「可提现」,而它显示的是总余额(与提现页可提额恒不等)"
    printf '%s\n' "$bad_labels" | sed 's/^/        /'
  else
    ok "wallet balance label carries no 「可提现」 claim (sample 6/6: zh/en/vi × wallet+me)"
  fi
  # 反向面(2026-07-31 审计 P1):上面只验「新写法在」,不验「旧写法不在」—— 若有人在这三个
  # 文件里顺手加一处引用旧桶的辅助展示(主 computed 仍正确),上面照样全绿而页面口径已分裂。
  local stale
  stale=$(grep -nE '(earningBuckets|buckets(\.value)?)\.withdrawableUsdt' \
    src/pages/me/wallet.vue src/components/me/wallet-card.vue src/pages/me/wallet-withdraw.vue 2>/dev/null | head -4)
  if [ -z "$stale" ]; then ok "no stale withdrawable-bucket reads in wallet surfaces (0 hits)";
  else bad "stale withdrawable-bucket read resurfaced (口径分裂面)"; echo "$stale" | sed 's/^/        /'; fi
}
withdrawable_source_parity
sentinel_present "SPEC-7 withdraw page consumes eligibility engine" src/pages/me/wallet-withdraw.vue 'from "@/store/withdrawal-eligibility"'
sentinel_present "SPEC-7 withdraw submit re-evaluates async at submit (R5)" src/pages/me/wallet-withdraw.vue 'await requestWithdrawalEligibility'
sentinel_present "SPEC-7 withdraw submit uses fresh route" src/pages/me/wallet-withdraw.vue 'fresh\.route'
sentinel_present "SPEC-7 withdraw timeout does not debit" src/pages/me/wallet-withdraw.vue 'riskCheckTimeoutTitle'
sentinel_present "SPEC-7 withdraw shows held buckets line" src/pages/me/wallet-withdraw.vue 'heldBucketsLine'
sentinel_present "SPEC-7 tracking maps risk reasons via i18n" src/pages/me/wallet-withdraw-tracking.vue 'riskReasonLines\(t\.value'
sentinel_present "SPEC-7 tracking has frozen hold variant" src/pages/me/wallet-withdraw-tracking.vue 'routeHeldFrozenTitle'
# (原「SPEC-7 pairing registers payment instrument」哨兵随旧配对机制删除,2026-08-05 包 E。
#  新模型的地址登记走 payout-address → recordWithdrawAddressUse,由 selfcheck-fastlane 接线门覆盖。)
# z1 判决 A:客户端扣款链整删(c37e642),「reject 不扣款」改三层守:
# ① 页面提交前 reject 闸;② API 回包白名单不含 reject(服务端若回 reject 即协议错);
# ③ store 提交函数结构上不再写任何余额字段(负向断言,candidates 缺失即红)。
sentinel_present "SPEC-7 reject route blocks before submit (page gate)" src/pages/me/wallet-withdraw.vue 'fresh\.route === "reject"'
wd_routes_src=$(sed -n '/const allowedRiskRoutes = new Set/,/\]);/p' src/api/withdrawal-api.ts | sed 's|//.*||' | tr -d '\r')
# 🔴 白名单在场 ≠ 白名单被消费(z1 R2 独立审计:摘掉校验行,白名单常量照样在)。
# 两条合取:① 白名单不含 reject;② parseSubmission 真的拿它拒单。
wd_routes_used=$(sed 's|//.*||' src/api/withdrawal-api.ts | tr -d '\r' | grep -cE '!allowedRiskRoutes\.has\(')
if [ -n "$wd_routes_src" ] && ! echo "$wd_routes_src" | grep -q '"reject"' && [ "${wd_routes_used:-0}" -ge 1 ]; then
  ok "SPEC-7 API risk-route whitelist has no reject 且被消费(拒单点 ×${wd_routes_used})"
else
  bad "SPEC-7 allowedRiskRoutes 白名单缺失/含 reject/未被消费(块 ${#wd_routes_src} 字节,消费点 ${wd_routes_used:-0})"
fi
wd_submit_body=$(sed -n '/async function submitWithdrawal(/,/^  }/p' src/store/app.ts | tr -d '\r')
if [ -n "$wd_submit_body" ] && ! echo "$wd_submit_body" | grep -qE 'usdtBalance *[-+:=]|earningBuckets:'; then
  ok "SPEC-7 submitWithdrawal never debits locally(函数体 $(echo "$wd_submit_body" | wc -l) 行无余额写入)"
else
  bad "SPEC-7 submitWithdrawal 函数体缺失或出现余额写入(本地扣款禁复活)"
fi
# z1 判决 A:「风控路由→队列状态」映射换输入源 —— 服务端 status 经 canonicalStatus()
# 白名单映射(FROZEN→frozen 等),未知值必须抛协议错(禁静默降级为 submitted)。
wd_status_src=$(sed -n '/function canonicalStatus(/,/^}/p' src/api/withdrawal-api.ts | sed 's|//.*||' | tr -d '\r')
wd_status_miss=""
[ -n "$wd_status_src" ] || wd_status_miss="fn-missing "
echo "$wd_status_src" | grep -q '"FROZEN"' || wd_status_miss="${wd_status_miss}frozen "
echo "$wd_status_src" | grep -q '"REVIEW_PENDING"' || wd_status_miss="${wd_status_miss}review-pending "
echo "$wd_status_src" | grep -q 'WITHDRAWAL_STATUS_INVALID' || wd_status_miss="${wd_status_miss}unknown-throws "
if [ -z "$wd_status_miss" ]; then
  ok "SPEC-7 server status maps to queue status (canonicalStatus + 未知值抛错)"
else
  bad "SPEC-7 canonicalStatus 缺件: $wd_status_miss"
fi
# 【z1 判决 C · 显式退役】「落盘余额复核 ×2」与「提现扣款 clamp ≥0」两门删除:
# c37e642 起客户端不再本地扣款/落盘提现(submitWithdrawal 只镜像服务端回单),
# 这两门守的操作主语已不存在;并发透支收敛 = 服务端事务 + idempotencyKey。
# 🔴 幂等键 ≠ 并发闸(错题集同款)—— 服务端事务内重读余额的义务已记 HANDOFF。
# 购买链(debitBalance)的姊妹 clamp 仍在,由下面 P0 neg-balance 两门继续守。
sentinel_present "debit clamps withdrawable <= usdt (purchase path)" src/store/app.ts 'withdrawableUsdt: Math\.min\('
# 负余额不变量(2026-07-10 P0): 购买共用 debitBalance 减总余额时必 clamp 可提额度 ≤ 剩余
# 总余额。【z1 判决 C】原第二门「submitWithdrawal 总余额兜底」删除:本地扣款不存在后,
# 超余额请求不再能破坏客户端状态(页面 fail-closed 上限拦 + 服务端 reservation 拒),
# 兜底主语灭失。debitBalance 的 clamp 照守。
sentinel_present "P0 neg-balance: debit clamps withdrawable<=balance" src/store/app.ts 'withdrawableUsdt: Math\.min\(buckets\.withdrawableUsdt, nextUsdt\)'
# merge 层(2026-07-10 审计补): account-cloud 把余额字段当独立加法计数器三路累加,多端并发
# 扣款合并会把总余额扣穿为负 / 可提额度虚高;写盘前必过资金不变量收口(clamp ≥0 + withdrawable
# ≤ balance),补住 debitBalance 单会话 clamp 管不到的这条旁路(2 个独立审计 + 复现脚本证实)。
sentinel_present "P0 neg-balance: account-cloud has fund-invariant clamp" src/store/account-cloud.ts 'function clampAccountFundInvariants'
sentinel_present "P0 neg-balance: merge writes clamped snapshot" src/store/account-cloud.ts 'const merged = clampAccountFundInvariants\(rawMerged\)'
# z1 判决 A:金额有效性守卫随本地扣款链移除,用户流上的守卫在页面层(拒 ≤0 + 输入剥非
# 数字截 2 位);store 直调透传的残余缺口 = 服务端拒非法 amount 的义务,已记 HANDOFF。
sentinel_present "P0 neg-balance: page rejects non-positive amount" src/pages/me/wallet-withdraw.vue 'if \(amount <= 0\) return'
sentinel_present "P0 neg-balance: amount input strips non-numeric" src/pages/me/wallet-withdraw.vue 'replace\(/\[\^0-9\.\]/g, ""\)'
# 2026-08-03 提现资金 2×P1:①费用快照必须与权威配置交叉核对(自洽三元组不再放行,权威值走
# config 纯函数单源);②失败提现退款必须连已烧 NEX 一起退(独立幂等键 refund-nex:)。
# 行为固定靶 + 剥注释接线门在 selfcheck-withdrawfee.mjs(⑥⑦);这两条是快速哨兵层,pin 完整
# 调用形态(短串会在注释里出现,pin 短串必被哄绿)。
# z1 判决 A:5 参交叉核对活在页面提交链(确认后、submit 前),第 5 参权威源从 config
# 纯函数换成服务端 policy;store 侧不再报价。判据钉页面调用形态 + 权威源。
sentinel_present "P1 fee snapshot cross-checks policy authority (page, 5-arg)" src/pages/me/wallet-withdraw.vue 'withdrawalPolicy\.value\?\.networkConfirmFeeUsd \?\? null'
# 2026-08-11 幂等 P0:唯一允许的豁免是**重放**(`!pending &&`)—— 重放送的是首次那份冻结
# body,服务端按冻结的 policyVersion 定价 = 用户当初确认过的那个价;拿今天的费率复验上一次
# 的报价,费率一变就恒不成立,只会让未收口的那笔永远收不了口。判据只放行这一个前缀,
# 换任何别的条件(`!foo &&`)照红,防止「加个开关就把门关了」。
sentinel_present "P1 fee snapshot guard sits in submit chain (replay-exempt only)" src/pages/me/wallet-withdraw.vue 'if \((!pending && )?!quoteStillValid\(snap\.fee, snap\.offset, snap\.network\)\)'
sentinel_present "P1 failed-withdrawal refunds burned NEX via own idem key" src/store/app.ts 'creditRewardBucketOnce\("refund-nex:" \+ wd\.id, "withdrawable", 0, burnedNex\)'
# 脏金额守卫覆盖门(补④):credit/debit × USDT/NEX 四个余额原语必须全带 NaN/负数守卫,
# 否则 debitNex(-x) 会因 `bal < -x` 恒 false 反向增币、脏 amount 污染余额成 NaN。
nex_guard_sites=$(grep -cE '!Number\.isFinite\(amount\) \|\| amount < 0' src/store/app.ts)
if [ "${nex_guard_sites:-0}" -ge 4 ]; then
  ok "P0 dirty-amount: credit/debit × USDT/NEX all reject NaN/negative (×$nex_guard_sites)"
else
  bad "P0 dirty-amount: money primitive missing finite guard (only ${nex_guard_sites:-0}/4)"
fi
# 单源门(补⑤):提现劝阻卡 APY 必须读 STAKING_APY 主表,不硬编码镜像(防 Round-7 式漂移)。
sentinel_present "single-source: stake-alt APY reads STAKING_APY (no hardcoded mirror)" src/components/me/stake-alternative-card.vue 'STAKING_APY\['
# client 零推进: 旧全局推进函数必须已收编为 _dev 前缀(仅 pass 路由)
sentinel_present "SPEC-7 demo advance is _dev-prefixed" src/store/app.ts 'function _devAdvanceWithdrawal'
if grep -qE 'function advanceWithdrawal\(' src/store/app.ts 2>/dev/null; then
  bad "SPEC-7 un-prefixed advanceWithdrawal must not exist (client never advances)"
else
  ok "SPEC-7 no un-prefixed withdrawal advancing"
fi
if [ -f src/store/withdrawal-risk.ts ]; then
  bad "SPEC-7 legacy withdrawal-risk.ts must stay deleted (rewritten as withdrawal-eligibility)"
else
  ok "SPEC-7 legacy withdrawal-risk.ts removed"
fi
# 🔴 剥注释再判,且用 '(' 收尾:新函数名 advanceWithdrawalArrival 是旧禁用串的**超集**,
# 不加这两道会被文件头注释里的一句说明误命中而假红(审计实测)。
if sed 's|//.*||; s|<!--.*-->||' src/pages/me/wallet-withdraw-tracking.vue 2>/dev/null | grep -q 'app\.advanceWithdrawal('; then
  bad "SPEC-7 tracking page must not auto-advance withdrawals"
else
  ok "SPEC-7 tracking page is display-only"
fi
# FEAT-WD01b 到账推进(2026-07-31 规则收窄,签字 plan T6):
# 原 SPEC-7 写「client 零推进」,现允许**一条**推进路径 —— 到达建单时就已承诺的
# estimatedCompletion 后,把 pass 路由推进到 confirmed。人工/延迟/冻结/异常终态永不推进。
# 判定全在 withdrawal-arrival-core 的纯函数里(selfcheck-arrival 55 条行为断言 + 4 路红测),
# 这里只守「推进入口唯一且接的是那个纯函数」——判定守得再严,接错地方一样白守。
# ⚠️ sentinel_present 的 pattern 走 grep -E,括号是分组不是字面量 —— 必须转义,
# 否则哨兵恒假红(本条第一版就这么栽了)。
# ── app-route-single-reader:App.vue 路由读取口唯一(2026-08-07 同形越权洞族根治)──
# 守门/会话驱逐/任务播种全部经 readCurrentRoute 单一读取口(自带 hash 兜底 + 归一化)。
# 曾因「读取函数有两个:一个冷启动返回空、一个返回不同形原文」在三处判据上各咬一口。
# 判据构造性:App.vue 全文(含注释)页面栈原语/地址栏 hash 各只许出现 1 次(都在读取口内),
# 旧双读口函数名必须绝迹 —— 注释里也别写这些字面量,写「页面栈」即可。
# ⚠️ 保护范围如实声明(独立审查 2026-08-07 指出):本哨兵只收口 App.vue 的**守卫判据**;
#    global-ui / milestone-celebration / app-chassis / sub-page-header / tradein-sheets 另有
#    5 份组件级读取口(纯展示/导航用,非权限资金判据),不在本哨兵内 —— 收口它们是独立后续包。
# ⚠️ 计数用 -o 按**出现次数**:grep -c 数的是行数,同一行塞两个读取口不会涨数(审查构造性击穿过)。
arsr_pages=$(grep -o "getCurrentPages" src/App.vue | wc -l | tr -d '[:space:]' || true)
arsr_hash=$(grep -oE "location\.hash" src/App.vue | wc -l | tr -d '[:space:]' || true)
arsr_orh=$(grep -o "readCurrentRouteOrHash" src/App.vue | wc -l | tr -d '[:space:]' || true)
if [ "${arsr_pages:-0}" = "1" ] && [ "${arsr_hash:-0}" = "1" ] && [ "${arsr_orh:-0}" = "0" ]; then
  ok "app-route-single-reader(页面栈原语=1 · hash 兜底=1 · 旧双读口=0)"
else
  bad "app-route-single-reader(页面栈原语=${arsr_pages} 期望1 · hash=${arsr_hash} 期望1 · 旧双读口=${arsr_orh} 期望0)"
fi
# 2026-08-11:advanceArrival 多了第三个必填参数「谁是权威」(远端模式 client 不自推)。
# 这条只守「全表扫 + 每笔都过同一个纯函数」,不钉死实参写法;权威闸本身由
# selfcheck-arrival 第 0 节 + scripts/remote-authority-simulation.test.mjs 行为门守。
sentinel_present "WD01b 到账推进入口唯一(App 层驱动 · 全表扫)" src/store/app.ts 'prev\.map\(\(w\) => advanceArrival\(w, now,[^)]*\) \?\? w\)'
sentinel_present "WD01b 到账推进由 App 层轮询 + onShow 驱动" src/App.vue 'advanceWithdrawalArrival\(\)'
# 扫 store 与页面两层,并容忍冒号后无空格的写法(两处都被审计红测穿过)。
adv_sites=$(grep -rcE 'status: *"confirmed"' src/store src/pages 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
# 🔴 必须 == 1,不能写 <= 1:0 处意味着推进整个没了,那也是坏的。
# 判据里「候选为空」要当失败处理,否则判据一失效就变成永远绿(踩过多次)。
if [ "${adv_sites:-0}" -eq 1 ]; then
  ok "WD01b 恰有一处把提现置为 confirmed(推进路径单源,样本 ${adv_sites})"
else
  bad "WD01b 有 ${adv_sites} 处把提现置为 confirmed(应恰为 1)—— 0=推进丢失,>1=路径散了(单源在 withdrawal-arrival-core.advanceArrival)"
fi
if grep -q 'app\.creditBalance(gift\.usdt)' src/pages/register/register.vue 2>/dev/null; then
  bad "SPEC-7 register gift must not credit USDT balance directly (R6)"
else
  ok "SPEC-7 register gift not directly credited to balance (R6)"
fi
# 【已退役 2026-07-31】原反向哨兵禁止提现页读总余额 —— 那是「充值本金不可提」时代的判据,
# 规则变更后读总余额恰是正解(见上面的 withdraw page available 哨兵)。
# 它真正防的 P0 是「可提额度 > 总余额仍放行 → 余额变负」,那道防线是 app.ts 的总余额门,
# 由下面的 P0 neg-balance 哨兵继续守。此处改守新不变量:held 两桶不得混入可提口径。
if grep -qE 'maxWithdrawable[^\n]*(pendingReviewUsdt|bonusLockedUsdt)' src/pages/me/wallet-withdraw.vue 2>/dev/null; then
  bad "withdraw available must exclude held buckets (pending_review / bonus_locked)"
else
  ok "withdraw available excludes held buckets"
fi
if grep -q 'nexBalance: +(user.value.nexBalance + positiveNexDelta)' src/store/app.ts 2>/dev/null; then
  bad "SPEC-7 settle must not credit NEX balance outside buckets"
else
  ok "SPEC-7 settle NEX route goes through buckets"
fi
# 双端配置契约 parity:当前真实 App platform-config/API ↔ PC server-canonical clients。
# 旧 admin mock compute-config.ts 已从真实 PC 删除,禁止以不存在的 mock 或默认值伪造 parity。
PLATFORM_CONFIG_PARITY="$ADMIN_ROOT/scripts/platform-config-contract-parity.mjs"
if [ ! -f "$PLATFORM_CONFIG_PARITY" ]; then
  bad "SPEC-7 platform-config/API parity script not found at $PLATFORM_CONFIG_PARITY"
else
  parity_arg="$PLATFORM_CONFIG_PARITY"
  app_root_arg="$PROJECT_DIR"
  if [ "$($NODE_BIN -p 'process.platform' 2>/dev/null)" = "win32" ] && command -v wslpath >/dev/null 2>&1; then
    parity_arg=$(wslpath -w "$PLATFORM_CONFIG_PARITY")
    app_root_arg=$(wslpath -w "$PROJECT_DIR")
  fi
  if NEXION_UNIAPP_ROOT="$app_root_arg" "$NODE_BIN" "$parity_arg" > /tmp/spec7-platform-config-parity.log 2>&1; then
    ok "SPEC-7 platform-config/API parity (real App platform config + PC E6/K1/K2 contracts)"
  else
    bad "SPEC-7 platform-config/API parity failed — current App $PROJECT_DIR and PC $ADMIN_ROOT must expose the same server-owned contract"
    tail -25 /tmp/spec7-platform-config-parity.log | sed 's/^/        /'
  fi
fi
# 双端参数 key parity: uniapp 配置契约 ↔ admin main 活源(2026-08-15 改锚,单独立项)。
# 原 mock 参数寄存器已死(admin main 2c477b4 进 .trash;含全键 defaultVal
# 的寄存器只活在 admin 非 main 分支,与 wd02 契约锚无交集分支 → 原门在 main 族恒红)。
# 现锚 main 活源:riskCluster 11 键 → k-client.ts;lockMode → h-client.ts;K3 提现前置 /
# K4 聚簇权重 12 键 main 前端尚未落地(只在 PRD),admin 侧断言降为域锚脚本里的升级哨兵
# (落地即红,提醒接进比对),uniapp 侧契约照旧 24 键全量必含。
# 键清单三处消费(key 循环 / 域锚脚本 argv / 覆盖度门)同源于下面两个变量,勿另抄。
SPEC7_RISKCLUSTER_KEYS="freePhoneSlotsPerCluster duplicateAccountPendingFrom duplicateAccountFreezeFrom pendingReleaseHours appAttestationReleaseHours maxSignupPerIp24h maxAccountsPerDevice maxAccountsPerPaymentInstrument clusterFreezeSuggestThreshold releaseMode freeSlotRequiresBinding"
SPEC7_OTPGATE_KEYS="resendSeconds captchaAfterSends otpTtlSeconds maxVerifyAttempts captchaTicketTtlSeconds"
SPEC7_ADMIN_PENDING_KEYS="minWithdrawableUsdt sameAddressRoute firstWithdrawalManual newAddressHoldHours serverDeviceId ipBucket withdrawAddress paymentInstrument sponsor uaFingerprint signupTiming weakSignalClusterThreshold"
ADMIN_K_CLIENT="$ADMIN_ROOT/lib/admin/k-client.ts"
ADMIN_H_CLIENT="$ADMIN_ROOT/lib/admin/h-client.ts"
if [ ! -f "$ADMIN_K_CLIENT" ] || [ ! -f "$ADMIN_H_CLIENT" ]; then
  bad "SPEC-7 parity: admin main 活源缺失(k-client:$([ -f "$ADMIN_K_CLIENT" ] && echo ok || echo MISS) h-client:$([ -f "$ADMIN_H_CLIENT" ] && echo ok || echo MISS))at $ADMIN_ROOT/lib/admin"
else
  parity_miss=""
  for k in $SPEC7_RISKCLUSTER_KEYS lockMode $SPEC7_ADMIN_PENDING_KEYS; do
    grep -q "$k" src/store/config-types.ts || parity_miss="${parity_miss}uniapp:$k "
  done
  for k in $SPEC7_RISKCLUSTER_KEYS; do
    grep -q "$k" "$ADMIN_K_CLIENT" || parity_miss="${parity_miss}admin:$k "
  done
  grep -q "lockMode" "$ADMIN_H_CLIENT" || parity_miss="${parity_miss}admin:lockMode "
  if [ -z "$parity_miss" ]; then
    ok "SPEC-7 param key parity (uniapp config-types 24 键 ↔ admin k-client/h-client 活源;K3/K4 12 键升级哨兵在域锚脚本)"
  else
    bad "SPEC-7 param key parity missing: $parity_miss"
  fi
  # 双端参数「值」parity → 域锚版:uniapp seed ∈ admin 允许值域/枚举白名单。
  # admin main 已 server-canonical(前端无 defaultVal,字面权威在真后端 DB,本机无仓),
  # 字面级比对的 admin 侧对象消亡 —— 降级语义 / 抓漂范围 / 恢复字面级的条件,见
  # scripts/spec7-admin-domain-parity.mjs 头注释。红测已验:越域 / 假键 / 锚缺失均红。
  # 历史沿革仍有效的部分:z1 判决 A(2026-08-10)captchaAlwaysScenes 出种子进 compat
  # 运行时默认,由 selfcheck-config-compat 行为门看住,不在本键清单。
  if "$NODE_BIN" scripts/spec7-admin-domain-parity.mjs "$ADMIN_ROOT" "$SPEC7_RISKCLUSTER_KEYS" "$SPEC7_OTPGATE_KEYS" \
       > /tmp/uni-spec7-admin-domain.log 2>&1; then
    ok "SPEC-7 param value parity·域锚(seed ∈ admin 域/白名单;$(tail -1 /tmp/uni-spec7-admin-domain.log | tr -d '\r'))"
  else
    bad "SPEC-7 param value parity·域锚失败 — node scripts/spec7-admin-domain-parity.mjs 看明细"
    grep "^FAIL" /tmp/uni-spec7-admin-domain.log | head -8 | sed 's/^/        /'
  fi
  # 值 parity 覆盖度自守(z1 判决 A:硬计数改集合等式,与循环键清单同源):种子块键集
  # 必须与循环键清单完全相等 —— 种子加键没进循环、循环钉着种子已删的键、任一侧提取为空,
  # 都在这里红(2026-07-14 对抗审查 D 项缺口的构造性版本)。
  # 值起始 [^{] 过滤:块首行「riskCluster: {」自己也长得像键,不滤会多出幽灵键(红测实锤)。
  # 🔴 但它同时把**对象值的键**一起滤掉了(z1 R2 对抗审计 P1-13):新增
  #    `deviceFingerprint: { salt, ttlDays }` 这类参数在两侧键集里都看不见 → 静默不进
  #    值 parity 循环,正是 captchaAlwaysScenes 那次的同型。故再加一道:块内**所有**
  #    顶层键(含对象值)必须 = 循环键集 ∪ 显式登记的对象值键(下面登记表当前为空)。
  SPEC7_OBJECT_VALUE_KEYS=""   # 形如 "deviceFingerprint tierWeights";登记即须写明谁在守它的值
  seed_rc_keys=$(sed -n '/riskCluster: {/,/},/p' src/mock/platform-config.ts | grep -E '^\s+\w+: [^{]' | grep -oE '^\s+\w+:' | tr -d ' :\r' | sort)
  seed_og_keys=$(sed -n '/otpGate: {/,/},/p' src/mock/platform-config.ts | grep -E '^\s+\w+: [^{]' | grep -oE '^\s+\w+:' | tr -d ' :\r' | sort)
  seed_all_keys=$(sed -n '/riskCluster: {/,/},/p;/otpGate: {/,/},/p' src/mock/platform-config.ts \
    | grep -E '^\s+\w+:' | grep -oE '^\s+\w+:' | tr -d ' :\r' | grep -vE '^(riskCluster|otpGate)$' | sort -u)
  loop_all_keys=$(printf '%s\n%s\n%s\n' "$SPEC7_RISKCLUSTER_KEYS" "$SPEC7_OTPGATE_KEYS" "$SPEC7_OBJECT_VALUE_KEYS" | tr ' ' '\n' | grep -v '^$' | sort -u)
  unwatched=$(comm -23 <(echo "$seed_all_keys") <(echo "$loop_all_keys"))
  # 🔴 空集必红:抽不到键(文件读不到 / 块形状变了)时上面的差集恒空 → 会假绿。
  #    这条守卫是自己红测时发现的:cwd 漂了一次,判据就静默全过。
  if [ "$(echo "$seed_all_keys" | grep -c .)" -lt 10 ]; then
    bad "SPEC-7 参数键集抽取失败(只抽到 $(echo "$seed_all_keys" | grep -c .) 个,应 ≥10)—— 判据失效必红,禁空集全过"; fails=1
  elif [ -z "$unwatched" ]; then
    ok "SPEC-7 无脱管参数(含对象值键:种子顶层键集 ⊆ 循环键集 ∪ 对象值登记表)"
  else
    bad "SPEC-7 有参数脱离值 parity 看管(多半是对象/数组值的新键,判据的历史盲区):$(echo $unwatched)——补进循环或登记进 SPEC7_OBJECT_VALUE_KEYS 并写明谁守它的值"
  fi
  loop_rc_keys=$(echo "$SPEC7_RISKCLUSTER_KEYS" | tr ' ' '\n' | sort)
  loop_og_keys=$(echo "$SPEC7_OTPGATE_KEYS" | tr ' ' '\n' | sort)
  if [ -n "$seed_rc_keys" ] && [ -n "$seed_og_keys" ] && [ "$seed_rc_keys" = "$loop_rc_keys" ] && [ "$seed_og_keys" = "$loop_og_keys" ]; then
    ok "SPEC-7 value parity coverage(种子键集==循环键集:riskCluster $(echo "$seed_rc_keys" | grep -c .) + otpGate $(echo "$seed_og_keys" | grep -c .))"
  else
    bad "SPEC-7 value parity coverage 键集不等 —— seed(rc)=[$(echo $seed_rc_keys)] loop(rc)=[$(echo $loop_rc_keys)] seed(og)=[$(echo $seed_og_keys)] loop(og)=[$(echo $loop_og_keys)]"
  fi
fi
# ── FEAT-WD02 网络确认费逐键 parity ──
# z1 判决 A(2026-08-10):networkConfirmFeeUsd 已出种子进 compat 运行时默认(819a6da),
# 文本提取器按设计红(判据失效必红,没白跑)。比对迁入 selfcheck-config-compat 行为门:
# 取「合成后的有效值」逐键 vs admin-ops 契约锚(路径双候选 + 锚缺失必红 + 键数覆盖度照守)。
# ── SPEC-2 电脑算力 sentinels ──
spec2_pc_gpu_kind_coverage() {
  local miss=""
  grep -q '"pc-gpu"' src/store/types.ts || miss="${miss}DeviceKind "
  grep -q '"pc-gpu"' src/store/device-types.ts || miss="${miss}device-types "
  grep -q '"pc-gpu"' src/components/earn/device-card-pc.vue || miss="${miss}device-card-icon "
  grep -q '"pc-gpu"' src/components/earn/empty-slots-hint.vue || miss="${miss}slot-grid-icon "
  if [ -z "$miss" ]; then ok "SPEC-2 pc-gpu kind coverage (types/specs/icons)";
  else bad "SPEC-2 pc-gpu kind coverage missing: $miss"; fi
}
spec2_pc_gpu_kind_coverage
sentinel_present "SPEC-2 compute entry gated by feature flag" src/components/earn/compute-share-entry.vue 'isEnabled\("computeShareEnabled"\)'
# 🗑 2026-08-13 退役:原哨兵钉 `if (IS_PRODUCTION) return` 这个**字面写法**,
#   而实现已加严成 `if (remoteApiEnabled || IS_PRODUCTION) return`(多拦一层远端档)—— 判据过期。
#   它守的不变量(开发后门在生产构建里必须失效)**已被 SPEC-2 guard semantics 里的派生判据完全覆盖**:
#   那条枚举 config.ts 里所有 `_dev*` 后门,逐个要求函数体里有 IS_PRODUCTION 早退,
#   写法随便但一个都不许漏 —— 比这条字面哨兵严格更强(它对**新增的后门**是瞎的)。
#   红测证据:拆掉任一后门的守卫 / 新增一个没守的后门,派生判据都判红。
sentinel_present "SPEC-2 compute entry render guarded" src/components/earn/compute-share-entry.vue 'v-if="enabled"'
sentinel_present "SPEC-2 download page guard uses feature flag" src/pages/compute-share/download.vue 'isEnabled\("computeShareEnabled"\)'
sentinel_present "SPEC-2 download body does not render while disabled" src/pages/compute-share/download.vue 'v-if="enabled" class="pb-8"'
sentinel_present "SPEC-2 copy handler re-checks disabled flag" src/pages/compute-share/download.vue 'function copyDownloadUrl\(\)'
sentinel_present "SPEC-2 connect handler re-checks disabled flag" src/pages/compute-share/download.vue 'function connectDemoComputer\(\)'
sentinel_present "SPEC-2 download title reads config content" src/pages/compute-share/download.vue 'cfg\.config\.computeShare\.content'
sentinel_present "SPEC-2 download guide falls back to i18n" src/pages/compute-share/download.vue 'configured \|\| t\.value\.computeShare\.downloadBody'
sentinel_present "SPEC-2 computeShare content typed" src/store/config-types.ts 'interface ComputeShareContent'
sentinel_present "SPEC-2 computeShare zhTitle seeded" src/mock/platform-config.ts 'zhTitle:'
sentinel_present "SPEC-2 computeShare zhGuide seeded" src/mock/platform-config.ts 'zhGuide:'
sentinel_present "SPEC-2 computeShare enTitle seeded" src/mock/platform-config.ts 'enTitle:'
sentinel_present "SPEC-2 computeShare enGuide seeded" src/mock/platform-config.ts 'enGuide:'
sentinel_present "SPEC-2 gpu tiers single source exists" src/lib/gpu-tiers.ts 'export const GPU_TIERS'
sentinel_present "SPEC-2 device factory accepts matched tier" src/store/device-types.ts 'options\.gpuTier \?\? matchGpuTier'
sentinel_present "SPEC-2 connect uses configured GPU tiers" src/store/app.ts 'cfg\.config\.computeShare\.gpuTiers'
sentinel_present "SPEC-2 pc-gpu freezes when flag disabled" src/store/app.ts 'freezeComputeShareDevice'
sentinel_present "SPEC-2 slot cap counts hidden active pc-gpu" src/store/app.ts 'activeSlotCount = computed\(\(\) => devices\.value\.filter'
sentinel_present "SPEC-2 device page slot meter uses authoritative active count" src/pages/me/devices.vue 'app\.activeSlotCount \+ trialReserved\.value'
sentinel_present "SPEC-2 default feature flag is off" src/mock/platform-config.ts 'computeShareEnabled:\s*false'
sentinel_present "SPEC-2 checkout counts trial reserved slot" src/pages/store/checkout.vue 'activeSlotCount \+ reservedSlots\.value'
sentinel_present "SPEC-2 eligibility counts trial reserved slot" src/composables/use-device-eligibility.ts 'activeSlotCount \+ reservedSlots\.value'
sentinel_present "SPEC-2 trade-in choice counts trial reserved slot" src/components/tradein-sheets.vue 'activeSlotCount \+ reservedSlots\.value'
sentinel_present "SPEC-2 trade-in activation receives reserved slots" src/components/tradein-sheets.vue 'activateDevice\(newId, reservedSlots\.value\)'
sentinel_present "SPEC-2 order activation receives reserved slots" src/App.vue 'tickOrders\(trialReservesSlotNow\(\) \? 1 : 0\)'
sentinel_present "SPEC-2 order detail passes trial reserved slot" src/pages/store/order-detail.vue 'advanceOrder\(id\.value, reservedSlots\.value\)'
sentinel_present "SPEC-2 refresh passes trial reserved slot" src/store/refresh.ts 'tickOrders\(trialReservesSlotNow\(\) \? 1 : 0\)'
sentinel_present "SPEC-2 slot sheet counts trial reserved slot" src/components/slot-action-sheet.vue 'slotsUsed\.value >= MAX_DEVICES'
sentinel_present "SPEC-2 slot sheet activation receives reserved slot" src/components/slot-action-sheet.vue 'activateDevice\(d\.id, reservedSlots\.value\)'
sentinel_present "SPEC-2 replace candidate uses slot devices" src/store/tradein-sheet.ts 'useApp\(\)\.slotDevices'
sentinel_present "SPEC-2 purchased hardware helper exists" src/store/device-types.ts 'isPurchasedHardwareKind'
sentinel_present "SPEC-2 download URL defaults to empty" src/mock/platform-config.ts 'downloadUrl:\s*""'
spec2_gpu_tier_monotonic() {
  if "$NODE_BIN" -e '
    const fs=require("fs");
    const s=fs.readFileSync("src/lib/gpu-tiers.ts","utf8");
    const rows=[...s.matchAll(/id:\s*"(G[1-6])"[\s\S]*?tops:\s*(\d+)/g)].map(m=>({id:m[1],tops:+m[2]}));
    const order=["G1","G2","G3","G4","G5","G6"];
    if(rows.length!==6) throw new Error(`expected 6 tiers, got ${rows.length}`);
    const by=new Map(rows.map(r=>[r.id,r.tops]));
    for(let i=1;i<order.length;i++){ if(!(by.get(order[i])>by.get(order[i-1]))) throw new Error(`${order[i]} not > ${order[i-1]}`); }
  ' >/tmp/uni-spec2-gpu.log 2>&1; then
    ok "SPEC-2 gpu-tier monotonic TOPS (G1<...<G6)"
  else
    bad "SPEC-2 gpu-tier monotonic TOPS"; sed 's/^/        /' /tmp/uni-spec2-gpu.log
  fi
}
spec2_gpu_tier_monotonic
spec2_guard_semantics() {
  if "$NODE_BIN" -e '
    const fs=require("fs");
    const download=fs.readFileSync("src/pages/compute-share/download.vue","utf8");
    const app=fs.readFileSync("src/store/app.ts","utf8");
    const deviceTypes=fs.readFileSync("src/store/device-types.ts","utf8");
    const gpu=fs.readFileSync("src/lib/gpu-tiers.ts","utf8");
    if(!/function copyDownloadUrl\(\)[\s\S]*?if \(!enabled\.value\)/.test(download)) throw new Error("copy handler lacks enabled gate");
    if(!/function connectDemoComputer\(\)[\s\S]*?if \(!enabled\.value\)/.test(download)) throw new Error("connect handler lacks enabled gate");
    if(!/addDevice\("pc-gpu", \{ gpuModel: normalizedModel, gpuTier \}\)/.test(app)) throw new Error("pc-gpu creation does not pass matched tier");
    if(!/device\.kind === "pc-gpu" && !computeShareEnabled\.value/.test(app)) throw new Error("pc-gpu activation is not feature-gated");
    if(!/const IS_PRODUCTION = import\.meta\.env\.PROD/.test(fs.readFileSync("src/store/config.ts","utf8"))) throw new Error("dev config mutation lacks production guard constant");
    // 🔴 2026-08-13 重锚:原判据钉的是字面写法 `if (IS_PRODUCTION) return`,而实现已加严成
    //   `if (remoteApiEnabled || IS_PRODUCTION) return`(多拦一层远端档)—— 判据过期,不是回归。
    //   改成**派生**:枚举 config.ts 里所有 `_dev*` 开发后门,逐个要求其函数体开头有
    //   IS_PRODUCTION 早退。写法随便,但一个都不许漏 —— 新增一个没守的后门会自动判红,
    //   而写死函数名的旧判据对「新增的后门」是瞎的。
    const cfg = fs.readFileSync("src/store/config.ts","utf8");
    const devFns = [...cfg.matchAll(/function (_dev[A-Za-z0-9_]*)\s*\(/g)].map((m)=>m[1]);
    if(devFns.length < 3) throw new Error("config.ts 里只找到 "+devFns.length+" 个 _dev* 后门,不像完整实现 —— 判据失效");
    // 🔴 函数体按**大括号配平**抠,不用 indexOf("\n}") —— 这些函数嵌套在 store 里,
    //   结尾是缩进的 `  }`,按 "\n}" 找会一路截到很后面,把**邻居的**守卫也算进来,
    //   于是「拆掉某个后门的守卫」和「新增一个没守的后门」两种变异都不会红(实测过)。
    for(const fn of devFns){
      const at = cfg.indexOf("function "+fn+"(");
      const open = cfg.indexOf("{", at);
      let d=0, close=-1;
      for(let k=open;k<cfg.length;k++){ if(cfg[k]==="{")d++; else if(cfg[k]==="}"&&--d===0){close=k;break;} }
      if(close<0) throw new Error(fn+" 函数体大括号不配平 —— 判据失效");
      const body = cfg.slice(open, close);
      if(!/IS_PRODUCTION/.test(body)) throw new Error(fn+" 是开发后门却没有 IS_PRODUCTION 早退 —— 生产构建里它是活的");
    }
    if(!/const activeSlotCount = computed\(\(\) => devices\.value\.filter\(\(d\) => d\.activatedAt !== null\)\.length\)/.test(app)) throw new Error("slot cap must count hidden active pc-gpu devices");
    const demoKindsMatch = deviceTypes.match(/const demoKinds:[\s\S]*?=\s*\[([^\]]*)\]/);
    if(!demoKindsMatch) throw new Error("default demoKinds seed missing");
    const demoKinds = [...demoKindsMatch[1].matchAll(/"([^"]+)"/g)].map((m)=>m[1]);
    if(demoKinds.includes("pc-gpu")) throw new Error("default demo seed must not include active pc-gpu");
    if(demoKinds.length !== 4) throw new Error(`default demo seed must leave one free slot for pc connect, got ${demoKinds.length} demo kinds`);
    if(/createDevice\("pc-gpu",\s*"pc-gpu-seed"/.test(app)) throw new Error("app store must not append an active pc-gpu seed");
    if(!/const slotDevices = computed\(\(\) =>[\s\S]*computeShareEnabled\.value[\s\S]*devices\.value\.filter\(\(d\) => d\.kind !== "pc-gpu"\)/.test(app)) throw new Error("slotDevices must hide pc-gpu while compute-share is disabled");
    if(!/const slotsUsed = computed\(\(\) => app\.activeSlotCount \+ trialReserved\.value\)/.test(fs.readFileSync("src/pages/me/devices.vue","utf8"))) throw new Error("device page slot meter must use authoritative activeSlotCount");
    if(!/name:\s*"Shared computer"/.test(deviceTypes)) throw new Error("pc-gpu device name still uses tier label");
    if(/PURCHASED_HARDWARE_KINDS[\s\S]*"pc-gpu"/.test(deviceTypes)) throw new Error("pc-gpu must not be a purchased hardware kind");
    const frontText=fs.readFileSync("src/i18n/messages/zh.ts","utf8")+fs.readFileSync("src/i18n/messages/en.ts","utf8");
    if(/原型演示|Prototype path only|运营后台|内部开关|工程字段名|ENV_FILTERED|MANUAL_HOLD/.test(frontText)) throw new Error("front copy leaks internal or engineering language");
    const slotSheet=fs.readFileSync("src/components/slot-action-sheet.vue","utf8");
    const orderDetail=fs.readFileSync("src/pages/store/order-detail.vue","utf8");
    const refresh=fs.readFileSync("src/store/refresh.ts","utf8");
    if(/activateDevice\(d\.id\)/.test(slotSheet)) throw new Error("slot sheet activates without reserved slots");
    if(/advanceOrder\(id\.value\)/.test(orderDetail)) throw new Error("order detail advances without reserved slots");
    if(/tickOrders\(\)/.test(refresh)) throw new Error("refresh advances orders without reserved slots");
    const rows=[...gpu.matchAll(/id:\s*"(G[1-6])"[\s\S]*?keywords:\s*\[([^\]]+)\][\s\S]*?tops:\s*(\d+)/g)];
    const tierFor4070=rows.find(([,id,kw])=>id==="G4" && /rtx 4070/.test(kw));
    const fallbackG2=rows.find(([,id])=>id==="G2");
    if(!tierFor4070) throw new Error("RTX 4070 must map to G4");
    if(!fallbackG2) throw new Error("G2 fallback tier missing");
  ' >/tmp/uni-spec2-guard.log 2>&1; then
    ok "SPEC-2 guard semantics (disabled gate/config tier/hardware naming)"
  else
    bad "SPEC-2 guard semantics"; sed 's/^/        /' /tmp/uni-spec2-guard.log
  fi
}
spec2_guard_semantics
# ── SPEC-3 prototype homes withdrawn ──
spec3_prototype_homes_withdrawn() {
  if "$NODE_BIN" -e '
    const fs=require("fs");
    const pj=JSON.parse(fs.readFileSync("src/pages.json","utf8"));
    const paths=new Set((pj.pages||[]).map(p=>p.path));
    const removedRoutes=["pages/home-signed/home-signed","pages/home-h5/home-h5","pages/home-cloak/home-cloak"];
    for(const p of removedRoutes){ if(paths.has(p)) throw new Error(`removed route still registered: ${p}`); }
    const removedFiles=[
      "src/pages/home-signed/home-signed.vue",
      "src/pages/home-h5/home-h5.vue",
      "src/pages/home-cloak/home-cloak.vue",
      "src/components/home/prototype-home.vue",
    ];
    for(const file of removedFiles){
      if(fs.existsSync(file)) throw new Error(`removed prototype file still exists: ${file}`);
    }
    const chassis=fs.readFileSync("src/components/app-chassis.vue","utf8");
    if(/prototypeHome/.test(chassis)) throw new Error("prototypeHome prop branch should be removed");
    const types=fs.readFileSync("src/store/config-types.ts","utf8");
    if(/HomePrototype|homePrototypes/.test(types)) throw new Error("prototype home config types should be removed");
    const cfg=fs.readFileSync("src/mock/platform-config.ts","utf8");
    if(/homePrototypes|signedApp|h5Mobile|cloakApp/.test(cfg)) throw new Error("prototype home mock seed should be removed");
  ' >/tmp/uni-spec3-prototype-withdrawn.log 2>&1; then
    ok "SPEC-3 prototype home routes removed"
  else
    bad "SPEC-3 prototype home withdrawal"; sed 's/^/        /' /tmp/uni-spec3-prototype-withdrawn.log
  fi
}
spec3_prototype_homes_withdrawn
# ── SPEC-6 new entry-surface homes ──
spec6_entry_surface_homes_present() {
  if "$NODE_BIN" -e '
    const fs=require("fs");
    const pj=JSON.parse(fs.readFileSync("src/pages.json","utf8"));
    const paths=new Set((pj.pages||[]).map(p=>p.path));
    const requiredRoutes=[
      "pages/entry-surfaces/index",
      "pages/entry-surfaces/signed",
      "pages/entry-surfaces/h5",
      "pages/entry-surfaces/white",
    ];
    for(const p of requiredRoutes){ if(!paths.has(p)) throw new Error(`SPEC-6 route missing: ${p}`); }
    const requiredFiles=[
      "src/pages/entry-surfaces/index.vue",
      "src/pages/entry-surfaces/signed.vue",
      "src/pages/entry-surfaces/h5.vue",
      "src/pages/entry-surfaces/white.vue",
      "src/components/entry-surfaces/entry-surface-home.vue",
    ];
    for(const file of requiredFiles){ if(!fs.existsSync(file)) throw new Error(`SPEC-6 file missing: ${file}`); }
    const index=fs.readFileSync("src/pages/entry-surfaces/index.vue","utf8");
    const fullLinks=[
      "/pages/entry-surfaces/signed",
      "/pages/entry-surfaces/h5",
      "/pages/entry-surfaces/white?entry=white-app",
    ];
    for(const link of fullLinks){ if(!index.includes(link)) throw new Error(`SPEC-6 full clickable link missing: ${link}`); }
    // The shown URL must be derived from the runtime origin. A hardcoded host is
    // wrong on every port/host but the one it was written on (worktree dev server
    // on 5174, any deploy) — assert the derivation instead of the old literals.
    if(!/window\.location\.origin/.test(index)) throw new Error("SPEC-6 entry link URL must derive from window.location.origin");
    if(!/\$\{origin\.value\}#\$\{l\.route\}/.test(index)) throw new Error("SPEC-6 entry fullUrl must be composed as <origin>#<route>");
    if(/https?:\/\/localhost/.test(index)) throw new Error("SPEC-6 entry index must not hardcode a localhost origin");
    if(!/@(tap|click)="open\(item\.route\)"/.test(index)) throw new Error("SPEC-6 full links are not clickable rows");
    const signed=fs.readFileSync("src/pages/entry-surfaces/signed.vue","utf8");
    const h5=fs.readFileSync("src/pages/entry-surfaces/h5.vue","utf8");
    const white=fs.readFileSync("src/pages/entry-surfaces/white.vue","utf8");
    if(!/surface="signed"/.test(signed)) throw new Error("signed entry page does not render signed surface");
    if(!/surface="h5"/.test(h5)) throw new Error("h5 entry page does not render h5 surface");
    if(!/surface="white"/.test(white)) throw new Error("white entry page does not render white surface");
    // 三端入口文案 2026-07-28 迁进 i18n(entrySurface 命名空间)——语义 token 与
    // 泄漏守卫跟着文案走,否则组件里没文案了,这两道门会变成永真的空门。
    const nsSlice=(file)=>{
      const src=fs.readFileSync(file,"utf8");
      const m=src.match(/\n  entrySurface: \{[\s\S]*?\n  \},/);
      if(!m) throw new Error(`SPEC-6 i18n namespace entrySurface missing in ${file}`);
      return m[0];
    };
    const i18nCopy=["src/i18n/messages/en.ts","src/i18n/messages/zh.ts","src/i18n/messages/vi.ts"].map(nsSlice).join("\n");
    const body=fs.readFileSync("src/components/entry-surfaces/entry-surface-home.vue","utf8")+index+i18nCopy;
    for(const token of ["在线增强","基础托管","体检融合"]){ if(!body.includes(token)) throw new Error(`SPEC-6 surface semantic token missing: ${token}`); }
    if(/secondary:\s*\{\s*label:\s*"PC sharing path",\s*href:\s*"\/pages\/compute-share\/download"/.test(body)) throw new Error("H5 entry must not advertise a disabled-by-default PC download path as direct CTA");
    if(/ENV_FILTERED|MANUAL_HOLD|keyword\d+|computeShareEnabled|H5_BASE_FACTOR|home-signed|home-h5|home-cloak|原型演示|工程字段名/.test(body)) throw new Error("SPEC-6 entry UI leaks withdrawn or engineering copy");
  ' >/tmp/uni-spec6-entry-surfaces.log 2>&1; then
    ok "SPEC-6 entry-surface homes present (3 independent routes + full links)"
  else
    bad "SPEC-6 entry-surface homes"; sed 's/^/        /' /tmp/uni-spec6-entry-surfaces.log
  fi
}
spec6_entry_surface_homes_present
if scope_hit spec6-entry-runtime; then route_scope spec6-entry-runtime
if "$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null | grep -q 200; then
  if probe_retry /tmp/uni-spec6-entry-runtime.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/spec6-entry-surface-runtime.mjs; then
    ok "$(cat /tmp/uni-spec6-entry-runtime.log)"
  else
    bad "SPEC-6 entry-surface runtime isolation"; sed 's/^/        /' /tmp/uni-spec6-entry-runtime.log
  fi
else
  skipped "SPEC-6 entry-surface runtime isolation (dev server not running at $BASE_URL)"
fi
fi
# R7 pricing order and the device-detail route are runtime contracts: static
# sentinels cannot prove a stale App reopen stays baseline or that taps really navigate.
if scope_hit r7-device-runtime; then
if "$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null | grep -q 200; then
  if probe_retry /tmp/uni-r7-device-detail-runtime.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/r7-device-detail-runtime.mjs; then
    ok "$(cat /tmp/uni-r7-device-detail-runtime.log)"
  else
    bad "R7 + device detail runtime"; sed 's/^/        /' /tmp/uni-r7-device-detail-runtime.log
  fi
else
  skipped "R7 + device detail runtime (dev server not running at $BASE_URL)"
fi
fi
# 注册成功页的平台边界是编译条件,UA 伪造无法证明 App 分支。锁住 H5
# 提醒块、App 无提醒、底部继续入口和官网配置字段这四个不变量。
if "$NODE_BIN" -e '
  const fs=require("fs");
  const ts=require("typescript");
  const postcss=require("postcss");
  const selectorParser=require("postcss-selector-parser");
  const {initPreContext,preHtml,preJs}=require("@dcloudio/uni-cli-shared");
  const {parse}=require("@vue/compiler-sfc");
  const {baseParse}=require("@vue/compiler-dom");
  const successFile="src/pages/register/success.vue";
  const registerFile="src/pages/register/register.vue";
  const success=fs.readFileSync(successFile,"utf8");
  const register=fs.readFileSync(registerFile,"utf8");
  const config=fs.readFileSync("src/store/config-types.ts","utf8");
  function compile(source,file,platform){
    initPreContext(platform);
    return preJs(preHtml(source,file),file);
  }
  function inspect(source,file){
    const {descriptor,errors}=parse(source,{filename:file});
    if(errors.length) throw errors[0];
    const elements=[],templateExpressions=[];
    const template=baseParse(descriptor.template?.content||"");
    (function walk(node,ancestorHidden=false,ancestorClassNames=[],ancestorElements=[]){
      let hidden=ancestorHidden;
      let descendantClassNames=ancestorClassNames;
      let descendantElements=ancestorElements;
      if(node.type===1){
        const staticValue=(name)=>node.props.find((prop)=>prop.type===6&&prop.name===name)?.value?.content||"";
        const constantIf=node.props.find((prop)=>prop.type===7&&prop.name==="if")?.exp?.content?.trim();
        const style=staticValue("style").replace(/\s+/g,"").toLowerCase();
        const classNames=staticValue("class").split(/\s+/).filter(Boolean);
        const attributes=Object.fromEntries(node.props.filter((prop)=>prop.type===6).map((prop)=>[prop.name,prop.value?.content||""]));
        hidden=hidden||constantIf==="false"||node.props.some((prop)=>prop.type===6&&prop.name==="hidden")||/(display:none|visibility:hidden|opacity:0(?:;|$))/.test(style);
        node.__staticallyHidden=hidden;
        node.__ancestorClassNames=ancestorClassNames;
        node.__ancestorElements=ancestorElements;
        descendantClassNames=ancestorClassNames.concat(classNames);
        descendantElements=ancestorElements.concat({tag:String(node.tag||"").toLowerCase(),classNames,attributes});
        elements.push(node);
        for(const prop of node.props){ if(prop.type===7&&prop.exp?.content) templateExpressions.push(prop.exp.content); }
      }
      if(node.type===5&&node.content?.content) templateExpressions.push(node.content.content);
      for(const child of node.children||[]) walk(child,hidden,descendantClassNames,descendantElements);
    })(template,false,[],[]);
    const script=descriptor.scriptSetup?.content||descriptor.script?.content||"";
    const sourceFile=ts.createSourceFile(file,script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const registrationLaunchUrls=[];
    let hasOfficialIdentifier=false,hasWindowOpenCall=false;
    (function walk(node){
      if(ts.isIdentifier(node)&&node.text==="officialDownloadUrl") hasOfficialIdentifier=true;
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&ts.isIdentifier(node.expression.expression)&&node.expression.expression.text==="window"&&node.expression.name.text==="open") hasWindowOpenCall=true;
      ts.forEachChild(node,walk);
    })(sourceFile);
    const launchFunction=sourceFile.statements.find((node)=>ts.isFunctionDeclaration(node)&&node.name?.text==="launchRegistrationSuccess");
    if(launchFunction){
      (function collect(node){
        if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&ts.isIdentifier(node.expression.expression)&&node.expression.expression.text==="uni"&&node.expression.name.text==="reLaunch"){
          const options=node.arguments[0];
          if(options&&ts.isObjectLiteralExpression(options)){
            const url=options.properties.find((prop)=>ts.isPropertyAssignment(prop)&&((ts.isIdentifier(prop.name)&&prop.name.text==="url")||(ts.isStringLiteral(prop.name)&&prop.name.text==="url")));
            if(url&&ts.isStringLiteral(url.initializer)) registrationLaunchUrls.push(url.initializer.text);
          }
        }
        ts.forEachChild(node,collect);
      })(launchFunction);
    }
    const styles=descriptor.styles.map((style)=>style.content).join("\n");
    return {elements,templateExpressions,registrationLaunchUrls,hasOfficialIdentifier,hasWindowOpenCall,styles};
  }
  function staticAttr(element,name){
    return element?.props.find((prop)=>prop.type===6&&prop.name===name)?.value?.content||"";
  }
  function hasClass(element,name){
    return staticAttr(element,"class").split(/\s+/).includes(name);
  }
  function elementByClass(output,name){
    return output.elements.find((element)=>hasClass(element,name));
  }
  function appCssBlocker(styles,element){
    const elementClasses=staticAttr(element,"class").split(/\s+/).filter(Boolean);
    const elementAttributes=Object.fromEntries(element.props.filter((prop)=>prop.type===6).map((prop)=>[prop.name,prop.value?.content||""]));
    const elementChain=[...(element.__ancestorElements||[]),{tag:String(element.tag||"").toLowerCase(),classNames:elementClasses,attributes:elementAttributes}];
    let blocker="";
    function isPrintOnly(rule){
      for(let parent=rule.parent;parent;parent=parent.parent){
        if(parent.type!=="atrule"||parent.name.toLowerCase()!=="media") continue;
        const branches=parent.params.toLowerCase().split(",").map((branch)=>branch.trim()).filter(Boolean);
        if(branches.length&&branches.every((branch)=>/^(?:only\s+)?print(?:\s+and\b|$)/.test(branch))) return true;
      }
      return false;
    }
    function splitSelector(selector){
      const compounds=[[]],combinators=[];
      for(const node of selector.nodes||[]){
        if(node.type==="combinator"){
          combinators.push(node.value.trim()||" ");
          compounds.push([]);
        }else compounds[compounds.length-1].push(node);
      }
      return {compounds,combinators};
    }
    function selectorMatches(selector,elementIndex){
      const {compounds,combinators}=splitSelector(selector);
      function compoundMatches(nodes,index){
        const candidate=elementChain[index];
        if(!candidate) return false;
        for(const node of nodes){
          if(node.type==="class"&&!candidate.classNames.includes(node.value)) return false;
          if(node.type==="tag"&&node.value!=="*"&&candidate.tag!==node.value.toLowerCase()) return false;
          if(node.type==="id"&&candidate.attributes.id!==node.value) return false;
          if(node.type==="pseudo"){
            const name=node.value.toLowerCase();
            const alternatives=node.nodes||[];
            if((name===":is"||name===":where"||name===":matches")&&!alternatives.some((alternative)=>selectorMatchesAt(alternative,index))) return false;
            if(name===":not"&&alternatives.some((alternative)=>selectorMatchesAt(alternative,index))) return false;
          }
        }
        return true;
      }
      function selectorMatchesAt(candidateSelector,index){
        const parsed=splitSelector(candidateSelector);
        return matchFrom(parsed.compounds,parsed.combinators,parsed.compounds.length-1,index);
      }
      function matchFrom(compoundsToMatch,combinatorsToMatch,compoundIndex,elementIndex){
        if(elementIndex<0||!compoundMatches(compoundsToMatch[compoundIndex],elementIndex)) return false;
        if(compoundIndex===0) return true;
        const combinator=combinatorsToMatch[compoundIndex-1];
        if(combinator===">") return matchFrom(compoundsToMatch,combinatorsToMatch,compoundIndex-1,elementIndex-1);
        if(combinator===" "){
          for(let parentIndex=elementIndex-1;parentIndex>=0;parentIndex--){
            if(matchFrom(compoundsToMatch,combinatorsToMatch,compoundIndex-1,parentIndex)) return true;
          }
          return false;
        }
        return true;
      }
      return matchFrom(compounds,combinators,compounds.length-1,elementIndex);
    }
    function selectorCanReachChain(selectorText){
      let reaches=false;
      selectorParser((selectors)=>{
        selectors.each((selector)=>{
          for(let index=0;index<elementChain.length&&!reaches;index++) reaches=selectorMatches(selector,index);
        });
      }).processSync(selectorText);
      return reaches;
    }
    function isZeroOpacity(value){
      let normalized=value.toLowerCase().replace(/\s+/g,"");
      while(/^calc\([^()]+\)$/.test(normalized)) normalized=normalized.slice(5,-1);
      return /^(?:0+(?:\.0*)?|\.0+)(?:%)?$/.test(normalized);
    }
    postcss.parse(styles).walkRules((rule)=>{
      if(blocker||isPrintOnly(rule)||!selectorCanReachChain(rule.selector)) return;
      rule.walkDecls((declaration)=>{
        const property=declaration.prop.toLowerCase();
        const value=declaration.value.toLowerCase().trim();
        const blocks=(property==="display"&&value==="none")||(property==="visibility"&&value==="hidden")||(property==="pointer-events"&&value==="none")||(property==="opacity"&&isZeroOpacity(value));
        if(blocks) blocker=`${rule.selector} { ${property}: ${declaration.value} }`;
      });
    });
    return blocker;
  }
  function hasHandler(element,event,modifiers=[]){
    return !!element?.props.find((prop)=>prop.type===7&&prop.name==="on"&&prop.arg?.content===event&&prop.exp?.content==="continueWeb"&&modifiers.every((modifier)=>prop.modifiers.includes(modifier)));
  }
  const h5Success=inspect(compile(success,successFile,"h5"),successFile);
  const appSuccess=inspect(compile(success,successFile,"app-plus"),successFile);
  const h5Register=inspect(compile(register,registerFile,"h5"),registerFile);
  const appRegister=inspect(compile(register,registerFile,"app-plus"),registerFile);
  for(const token of ["class=\"rs-why\"","class=\"rs-h5-download\""]){
    const className=token.match(/rs-[a-z0-9-]+/)[0];
    if(!elementByClass(h5Success,className)) throw new Error(`H5 output lost real ${className} element`);
    if(elementByClass(appSuccess,className)) throw new Error(`App output retained real ${className} element`);
  }
  const appContinue=elementByClass(appSuccess,"rs-continue");
  if(!appContinue) throw new Error("App output lost the real continue CTA element");
  if(appContinue.__staticallyHidden) throw new Error("App continue CTA is statically unreachable or hidden");
  const appContinueCssBlocker=appCssBlocker(appSuccess.styles,appContinue);
  if(appContinueCssBlocker) throw new Error(`App continue CTA is blocked by platform CSS: ${appContinueCssBlocker}`);
  if(staticAttr(appContinue,"role")!=="button"||staticAttr(appContinue,"tabindex")!=="0") throw new Error("App continue CTA lost button semantics");
  if(!hasHandler(appContinue,"click")||!hasHandler(appContinue,"keydown",["enter","prevent"])||!hasHandler(appContinue,"keydown",["space","prevent"])) throw new Error("App continue CTA lost click/Enter/Space.prevent handlers");
  if(appSuccess.hasOfficialIdentifier||appSuccess.hasWindowOpenCall) throw new Error("App output retained H5 download behavior");
  if(appSuccess.templateExpressions.some((expression)=>/doneWhyApp|doneOfficialDownload/.test(expression))) throw new Error("App output retained H5 reminder copy bindings");
  if(/doneComingSoon|APP 即将上线|APP launching soon/.test(success)) throw new Error("obsolete success-page coming-soon contract remains");
  if(!/appDownload:\s*\{[\s\S]*officialUrl:\s*string/.test(config)) throw new Error("official download URL is not typed in platform config");
  if(!h5Register.registrationLaunchUrls.includes("/pages/register/success")) throw new Error("H5 registration function lost the success reLaunch call");
  if(appRegister.registrationLaunchUrls.includes("/pages/register/success")) throw new Error("App registration function retained the H5 success reLaunch call");
  if(!appRegister.registrationLaunchUrls.includes("/pages/onboarding/estimator")) throw new Error("App registration function lost the onboarding reLaunch call");
  ' >/tmp/uni-register-success-platform.log 2>&1; then
  ok "register success H5/App platform contract"
else
  bad "register success H5/App platform contract"; sed 's/^/        /' /tmp/uni-register-success-platform.log
fi
# FEAT-AUTH02 必须用真实 H5 iframe 回归：页面源码和 vue-tsc 都无法证明
# “老号提示 → 自动登录 → 无重复副作用”这条跨 store/路由链实际可用。
if scope_hit spec7-k1-auth02-runtime; then
if "$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null | grep -q 200; then
  if probe_retry /tmp/uni-spec7-risk-gate-runtime.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/spec7-risk-gate-runtime.mjs; then
    ok "$(cat /tmp/uni-spec7-risk-gate-runtime.log)"
  else
    bad "SPEC-7 K1 device/payment registration gates"; sed 's/^/        /' /tmp/uni-spec7-risk-gate-runtime.log
  fi
  for AUTH02_LOCALE in en zh; do
    if probe_retry /tmp/uni-auth02-runtime-${AUTH02_LOCALE}.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/auth-register-existing-runtime.mjs "$AUTH02_LOCALE"; then
      ok "$(cat /tmp/uni-auth02-runtime-${AUTH02_LOCALE}.log)"
    else
      bad "AUTH02 registered-number runtime handoff (${AUTH02_LOCALE})"; sed 's/^/        /' /tmp/uni-auth02-runtime-${AUTH02_LOCALE}.log
    fi
  done
else
  bad "SPEC-7 K1 device/payment registration gates (dev server not running at $BASE_URL)"
  bad "AUTH02 registered-number + success-page runtime (EN/ZH; dev server not running at $BASE_URL)"
fi
fi
# ── SPEC-4 account-cloud + multi-carrier session sentinels ──
sentinel_present "SPEC-4 account-cloud storage exists" src/store/account-cloud.ts 'nexgrid-account-cloud-v1'
sentinel_present "SPEC-4 app binds account snapshot" src/store/app.ts 'function bindAccount'
sentinel_present "SPEC-4 app persists account snapshot" src/store/app.ts 'function persistAccountSnapshot'
sentinel_present "SPEC-4 login uses canonical sign-in completion" src/pages/login/login.vue 'completeSignIn\('
sentinel_present "SPEC-4 canonical sign-in binds account before session claim" src/auth/complete-sign-in.ts 'app\.bindAccount\(options\.identity\)'
sentinel_present "SPEC-4 register binds canonical account before rewards" src/pages/register/register.vue 'app\.bindAccount\(createdIdentity\)'
sentinel_present "SPEC-4 entry surface supports white-app carrier" src/lib/entry-surface.ts '"white-app"'
sentinel_present "SPEC-4 session registry storage exists" src/store/session.ts 'nexgrid-account-sessions-v1'
sentinel_present "SPEC-4 security page uses live session registry" src/pages/me/security.vue 'session\.activeSessions'
# P2-8 存储作用域:创世持仓/V 等级按账号隔离,账号切换收口必须重绑(防跨账号继承复发)
sentinel_present "P2-8 account-scope helper rebinds genesis" src/lib/account-scope.ts 'useGenesis\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds v-rank" src/lib/account-scope.ts 'useVRank\(\)\.bindAccount\(accountKey\)'
# genesis/v-rank(引爆 P2-8 债的最初两个受害者)补 store 层哨兵,与其余 26 个对齐(28×2=56 条墙)
sentinel_present "P2-8 genesis store is account-scoped" src/store/genesis.ts 'writeAccountRow'
sentinel_present "P2-8 v-rank store is account-scoped" src/store/v-rank.ts 'writeAccountRow'
# P2-8 batch-1 钱类:订单/账单/质押/佣金按账号隔离(收口重绑 + store 用 writeAccountRow;摘任一行必红)
sentinel_present "P2-8 account-scope helper rebinds orders" src/lib/account-scope.ts 'useOrders\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds bills" src/lib/account-scope.ts 'useBills\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds staking" src/lib/account-scope.ts 'useStaking\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds commission" src/lib/account-scope.ts 'useCommission\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 orders store is account-scoped" src/store/orders.ts 'writeAccountRow|createAccountRowCommit'
sentinel_present "P2-8 bills store is account-scoped" src/store/bills.ts 'writeAccountRow'
sentinel_present "P2-8 staking store is account-scoped" src/store/staking.ts 'writeAccountRow'
sentinel_present "P2-8 commission store is account-scoped" src/store/commission.ts 'writeAccountRow'
# P2-8 batch-2 券/试用/兑换:券包/试用/swap/风控计数/绑卡/签到按账号隔离(摘任一行必红)
sentinel_present "P2-8 account-scope helper rebinds voucher" src/lib/account-scope.ts 'useVoucher\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds free-trial" src/lib/account-scope.ts 'useFreeTrial\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds exchange" src/lib/account-scope.ts 'useExchange\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds exchange-v3" src/lib/account-scope.ts 'useExchangeV3\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds cards" src/lib/account-scope.ts 'useCards\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds nex-faucet" src/lib/account-scope.ts 'useNexFaucet\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 voucher store is account-scoped" src/store/voucher.ts 'writeAccountRow|createAccountRowCommit'
sentinel_present "P2-8 free-trial store is account-scoped" src/store/free-trial.ts 'writeAccountRow'
sentinel_present "P2-8 exchange store is account-scoped" src/store/exchange.ts 'writeAccountRow'
sentinel_present "P2-8 exchange-v3 store is account-scoped" src/store/exchange-v3.ts 'writeAccountRow'
sentinel_present "P2-8 cards store is account-scoped" src/store/cards.ts 'writeAccountRow'
sentinel_present "P2-8 nex-faucet store is account-scoped" src/store/nex-faucet.ts 'writeAccountRow|createAccountRowCommit'
# 包 E:提现地址簿按账号隔离(设备级存储会让换号继承他人提现地址,RM01a 异常5)
sentinel_present "P2-8 account-scope helper rebinds payout-address" src/lib/account-scope.ts 'usePayoutAddress\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 payout-address store is account-scoped" src/store/payout-address.ts 'writeAccountRow'
# P2-8 batch-3 任务/成就/游戏化:任务/周任务/活动/里程碑/成就/目标/转盘/增益按账号隔离(摘任一行必红)
sentinel_present "P2-8 account-scope helper rebinds quest" src/lib/account-scope.ts 'useQuest\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds weekly-quest" src/lib/account-scope.ts 'useWeeklyQuest\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds event-quest" src/lib/account-scope.ts 'useEventQuest\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds milestones" src/lib/account-scope.ts 'useMilestones\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds achievements" src/lib/account-scope.ts 'useAchievements\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds goals" src/lib/account-scope.ts 'useGoals\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds lucky-spin" src/lib/account-scope.ts 'useLuckySpin\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds daily-powerup" src/lib/account-scope.ts 'useDailyPowerUp\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 quest store is account-scoped" src/store/quest.ts 'writeAccountRow'
sentinel_present "P2-8 event-quest store is account-scoped" src/store/event-quest.ts 'writeAccountRow'
sentinel_present "P2-8 milestones store is account-scoped" src/store/milestones.ts 'writeAccountRow'
sentinel_present "P2-8 milestones spec6 guard tracks new key" scripts/spec6-entry-surface-runtime.mjs 'nexgrid-milestones-accounts-v1'
sentinel_present "P2-8 achievements store is account-scoped" src/store/achievements.ts 'writeAccountRow'
sentinel_present "P2-8 goals store is account-scoped" src/store/goals.ts 'writeAccountRow'
sentinel_present "P2-8 lucky-spin store is account-scoped" src/store/lucky-spin.ts 'writeAccountRow|createAccountRowCommit'
sentinel_present "P2-8 daily-powerup store is account-scoped" src/store/daily-powerup.ts 'writeAccountRow|createAccountRowCommit'
# P2-8 batch-4 记录/账户:通知/凭证/工单/购物车/资料/安全/奖励水位线按账号隔离(摘任一行必红)
sentinel_present "P2-8 account-scope helper rebinds notifications" src/lib/account-scope.ts 'useNotifications\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds receipts" src/lib/account-scope.ts 'useReceipts\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds tickets" src/lib/account-scope.ts 'useTickets\(\)\.bindAccount\(accountKey\)'
# 🔴 2026-08-13 三条钉函数名的哨兵已退役,换成 account-scope-gate.mjs:
#   它们钉的是 `writeAccountRow` / `useConversations().reset()` 这类**具体写法**,
#   而实现换了更严的机制之后全红 —— tickets 改按「账号+运行会话」双维拼键、
#   weekly-quest 改服务端权威+版次围栏(本地不落盘)、conversations 从 reset 改 bindAccount。
#   新门改钉**不变量本身**:收口面从 account-scope.ts 的真实调用派生(不手写清单),
#   三个 store 必须在收口面里(bindAccount / reset 都算),收口面塌空即判红。
#   红测:摘掉 tickets → 红;把 bindAccount 全改名(收口面塌空)→ 红。
if "$NODE_BIN" scripts/account-scope-gate.mjs > /tmp/uniapp-account-scope.log 2>&1; then
  ok "账号隔离门 — $(tail -1 /tmp/uniapp-account-scope.log)"
else
  bad "账号隔离门失败 — node scripts/account-scope-gate.mjs 看明细"
  grep -E "^  FAIL|^FAIL" /tmp/uniapp-account-scope.log | head -6
fi
sentinel_present "P2-8 account-scope helper rebinds cart" src/lib/account-scope.ts 'useCart\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds profile" src/lib/account-scope.ts 'useProfile\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds security" src/lib/account-scope.ts 'useSecurity\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 account-scope helper rebinds rewards-seen" src/lib/account-scope.ts 'useRewardsSeen\(\)\.bindAccount\(accountKey\)'
sentinel_present "P2-8 notifications store is account-scoped" src/store/notifications.ts 'writeAccountRow'
sentinel_present "P2-8 receipts store is account-scoped" src/store/receipts.ts 'writeAccountRow'
sentinel_present "P2-8 cart store is account-scoped" src/store/cart.ts 'writeAccountRow'
sentinel_present "P2-8 profile store is account-scoped" src/store/profile.ts 'writeAccountRow'
sentinel_present "P2-8 security store is account-scoped" src/store/security.ts 'writeAccountRow'
sentinel_present "P2-8 rewards-seen store is account-scoped" src/store/rewards-seen.ts 'writeAccountRow'
# P2-8 batch-5 会话记录:会话中心/Nova 非持久,换号收口点必须 reset 重播种(防上一账号的客服对话被下一账号看到;audit 2026-07-16)
sentinel_present "P2-8 account-scope helper resets nova" src/lib/account-scope.ts 'useNova\(\)\.reset\(\)'
# 客服会话闲置策略双端 parity(本仓侧 tripwire;admin 侧 canon-sentinel 逐键比 canon-numbers.json):
# 改这两个默认值必须三处同步(uniapp 常量 + admin m-tabs/data.ts + canon json),单独改本仓即红。
sentinel_present "support idle policy warn default pinned (1min · canon parity)" src/mock/conversations.ts 'SUPPORT_IDLE_WARN_MINS = 1'
sentinel_present "support idle policy close default pinned (5min · canon parity)" src/mock/conversations.ts 'SUPPORT_IDLE_CLOSE_MINS = 5'
spec4_account_session_semantics() {
  if "$NODE_BIN" -e '
    const fs=require("fs");
    const session=fs.readFileSync("src/store/session.ts","utf8");
    const app=fs.readFileSync("src/store/app.ts","utf8");
    const appVue=fs.readFileSync("src/App.vue","utf8");
    const login=fs.readFileSync("src/pages/login/login.vue","utf8");
    const register=fs.readFileSync("src/pages/register/register.vue","utf8");
    const signIn=fs.readFileSync("src/auth/complete-sign-in.ts","utf8");
    const entry=fs.readFileSync("src/lib/entry-surface.ts","utf8");
    const wallet=fs.readFileSync("src/pages/me/wallet.vue","utf8");
    const withdrawalTracking=fs.readFileSync("src/pages/me/wallet-withdraw-tracking.vue","utf8");
    if(/function writeActiveRecord|function readActiveRecord|const ACTIVE_KEY/.test(session)) throw new Error("legacy single active-session writer returned");
    if(/rec\.deviceId !== deviceId\.value[\s\S]*return "kicked"/.test(session)) throw new Error("different device login still kicks current session");
    if(!/readAccountSessionRecords/.test(session)) throw new Error("account session list is not exposed");
    if(!/function resumeOrClaim/.test(session)) throw new Error("startup session restore/revoke guard missing");
    if(!/\.resumeOrClaim\(key\)/.test(appVue)) throw new Error("app startup must resume existing session instead of blindly claiming a new one");
    if(!/restored\.status === "kicked"[\s\S]*uni\.reLaunch\(\{ url: "\/pages\/session\/kicked" \}\)/.test(appVue)) throw new Error("app startup must route restored revoked sessions to kicked page");
    if(/useSession\(\)\.claim\(key\)/.test(appVue)) throw new Error("app startup still blindly claims a new session");
    if(!/revokeAllOtherSessions/.test(session)) throw new Error("session revoke-all action missing");
    if(!/mergeAndWriteAccountSnapshotResult\(lastCloudSnapshot, snapshot\)/.test(app)) throw new Error("account snapshot is not merged through app store");
    if(!/adoptAccountSnapshot\(result\.snapshot\)/.test(app)) throw new Error("merged account snapshot is not adopted back into app state");
    if(!/accountKey,\s*entrySurface,\s*accountCloudUpdatedAt/.test(app)) throw new Error("account cloud state is not returned to consumers");
    if(!/completeSignIn\(\{[\s\S]*identity/.test(login)) throw new Error("login does not use the canonical sign-in completion");
    if(!/auth\.signIn\(options\.identity, onboardingComplete\)[\s\S]*app\.bindAccount\(options\.identity\)[\s\S]*session\.(resumeOrClaim|claim)\(options\.identity\)/.test(signIn)) throw new Error("canonical sign-in must bind account before session claim");
    if(!/app\.bindAccount\(createdIdentity\)[\s\S]*rebindAccountScopedStores\(createdIdentity\)[\s\S]*commitRegistration\(createdIdentity/.test(register)) throw new Error("register must bind/rebind canonical account before rewards/session flow");
    if(!/app\.bindAccount\(key\);\s*[\r\n]+\s*rebindAccountScopedStores\(key\)/.test(appVue)) throw new Error("P2-8: app startup must rebind account-scoped stores (genesis/v-rank) right after bindAccount");
    if(!/app\.bindAccount\(options\.identity\);\s*[\r\n]+\s*rebindAccountScopedStores\(options\.identity\)/.test(signIn)) throw new Error("P2-8: canonical sign-in must rebind account-scoped stores right after bindAccount");
    if(!/app\.bindAccount\(createdIdentity\);\s*[\r\n]+\s*rebindAccountScopedStores\(createdIdentity\)/.test(register)) throw new Error("P2-8: register must rebind account-scoped stores right after bindAccount");
    if(!/entry === "white-app" \|\| entry === "white" \|\| entry === "cloak" \|\| entry === "janus"/.test(entry)) throw new Error("white-app entry aliases missing");
    const messages=fs.readFileSync("src/i18n/messages/zh.ts","utf8")+fs.readFileSync("src/i18n/messages/en.ts","utf8");
    if(/同一时间只能有一台设备运行挖矿|only one device runs mining at a time/.test(messages)) throw new Error("old strong single-device copy leaked");
    const walletUi=wallet+withdrawalTracking;
    if(/replace\(\s*\/-\/g/.test(walletUi)) throw new Error("wallet status enum is still transformed into UI copy");
    if(/return "just now"|`\\$\\{m\\}m ago`|`\\$\\{h\\}h ago`|`\\$\\{Math\.floor\(h \/ 24\)\}d ago`/.test(walletUi)) throw new Error("wallet relative time still hardcodes English copy");
    if(/label="My bank cards"|USDT Balance|NEX Boost Active|cards bound|Reused at checkout/.test(wallet)) throw new Error("wallet page still has hardcoded English UI copy");
  ' >/tmp/uni-spec4-session.log 2>&1; then
    ok "SPEC-4 account/session semantics (account cloud + multi-carrier)"
  else
    bad "SPEC-4 account/session semantics"; sed 's/^/        /' /tmp/uni-spec4-session.log
  fi
}
spec4_account_session_semantics
if "$NODE_BIN" scripts/spec4-account-cloud-merge-check.mjs >/tmp/uni-spec4-merge.log 2>&1; then
  ok "$(cat /tmp/uni-spec4-merge.log)"
else
  bad "SPEC-4 account-cloud merge semantics"; sed 's/^/        /' /tmp/uni-spec4-merge.log
fi
if scope_hit spec4-runtime; then
if "$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null | grep -q 200; then
  if probe_retry /tmp/uni-spec4-app-sync.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/spec4-account-cloud-app-sync.mjs; then
    ok "$(cat /tmp/uni-spec4-app-sync.log)"
  else
    bad "SPEC-4 account-cloud app sync"; sed 's/^/        /' /tmp/uni-spec4-app-sync.log
  fi
  if probe_retry /tmp/uni-spec4-runtime-guard.log env BASE_URL="$BASE_URL" "$NODE_BIN" scripts/spec4-runtime-session-guard.mjs; then
    ok "$(cat /tmp/uni-spec4-runtime-guard.log)"
  else
    bad "SPEC-4 runtime session guard"; sed 's/^/        /' /tmp/uni-spec4-runtime-guard.log
  fi
else
  skipped "SPEC-4 account-cloud app sync (dev server not running at $BASE_URL)"
  skipped "SPEC-4 runtime session guard (dev server not running at $BASE_URL)"
fi
fi
# SFC block closure (PITFALLS P-025): a `<script>` block missing its `</script>`
# close tag compiles fine under vue-tsc/volar (lenient: script extends to EOF)
# but THROWS in vite:vue / uni's @vue/compiler-sfc → "Element is missing end tag"
# → page 500s at runtime. vue-tsc green ≠ compiler OK (cf. P-008). Every .vue
# that opens <script> MUST close it; same for <template>/<style>.
sfc_script_closed() {
  # 包 ar:原写法逐文件 spawn 两次 grep(~300 文件 → Windows 上 29s);判据不变,改成两次全量 grep + grep -L 差集(<1s)。
  local miss="" f
  for f in $(grep -rl --include='*.vue' '<script' src 2>/dev/null | xargs -r grep -L '</script>' 2>/dev/null); do miss="$miss$f\n"; done
  for f in $(grep -rl --include='*.vue' '<template' src 2>/dev/null | xargs -r grep -L '</template>' 2>/dev/null); do miss="$miss$f (template)\n"; done
  if [ -z "$miss" ]; then ok "every .vue closes its <script>/<template> (0 hits)";
  else bad "unclosed SFC block (missing </script> or </template>)"; printf "$miss" | sed 's/^/        /'; fi
}
sfc_script_closed
# Native <button> guard (PITFALLS P-036 / cookbook): uni's <button> ships heavy
# default chrome (border + min-height + ::after hairline + bg) so a raw <button>
# renders "样式不对". Use <view @click> + own styles. Migration-note comments
# ("<button>→<view @click>") carry the → arrow and are excluded.
no_native_button() {
  local hits
  hits=$(grep -rnE '<button[ >]' src 2>/dev/null | grep -v '→' | head -5)
  if [ -z "$hits" ]; then ok "no native <button> tag (use <view @click>) (0 hits)";
  else bad "native <button> tag (uni default chrome — use <view @click>)"; echo "$hits" | sed 's/^/        /'; fi
}
no_native_button
# @tap binding guard (PITFALLS P-059): uni H5 registers BOTH @tap and @click as
# click listeners → a dual-bound element fires its handler TWICE per tap/click
# (steppers +2, toggles open-then-close, navigateTo ×2 → stack corruption via
# the navTo fallback chain). uni's compiler maps @click → tap on mp targets, so
# single @click is correct on every platform. Only a LIVE binding is banned:
# comment bodies are blanked first (script //-line + /* */, template <!-- -->), so
# a migration note that QUOTES `@tap="x"` — behavior-analytics.ts JSDoc, earn.vue
# template note — is documentation, not a dual-bind. Blanking keeps the newlines
# so the reported line numbers stay true.
no_tap_binding() {
  local hits
  hits=$("$NODE_BIN" -e '
const fs=require("fs"),path=require("path");
const blank=(m)=>m.replace(/[^\n]/g,"");
const strip=(s)=>s.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g,blank).replace(/^[ \t]*\/\/.*$/gm,"");
const re=/@tap(\.[a-z]+)*=/;
const hits=[];
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);
if(fs.statSync(p).isDirectory())walk(p);else if(/\.(vue|ts|js)$/.test(f)){
strip(fs.readFileSync(p,"utf8")).split(/\r?\n/).forEach((ln,i)=>{
if(re.test(ln))hits.push(p.split(path.sep).join("/")+":"+(i+1)+":"+ln.trim())});}}})("src");
if(hits.length){console.log(hits.slice(0,5).join("\n"));process.exit(1)}' 2>&1)
  if [ -z "$hits" ]; then ok "no @tap binding (single @click correct on all targets, P-059) (0 hits)";
  else bad "@tap binding — H5 double-fires alongside click; use single @click (P-059)"; echo "$hits" | sed 's/^/        /'; fi
}
no_tap_binding
# Raw navigateBack guard (PITFALLS P-054): uni H5 navigateBack on a single-entry
# stack (cold-open/deep-link) returns SUCCESS as a no-op — fail never fires →
# dead back button. Use navBack() helper (src/lib/route.ts, the one legit caller).
no_raw_navigateback() {
  local hits
  hits=$(grep -rnE 'uni\.navigateBack\(' src 2>/dev/null | grep -vE 'src/lib/route\.ts' | head -5)
  if [ -z "$hits" ]; then ok "no raw uni.navigateBack (use navBack() helper) (0 hits)";
  else bad "raw uni.navigateBack — cold-open no-op; use navBack() helper (P-054)"; echo "$hits" | sed 's/^/        /'; fi
}
no_raw_navigateback
# Week-boundary epoch-modulo guard (leadership-pool fix 2026-06-24): the JS epoch
# (1970-01-01) is a THURSDAY, so `now % ONE_WEEK == 0` lands on Thursday 00:00 UTC,
# not Monday. The v3 leadership-pool cycle runs Mon 00:00 → Sun 23:59 UTC (PRD
# §8.5.3). Any week-start MUST derive Monday via getUTCDay/Date.UTC — never
# `x % ONE_WEEK` (no legit use exists; it always mis-aligns to Thursday).
no_epoch_week_modulo() {
  local hits
  # exclude JSDoc/line-comment lines (` * …` / `// …`) — they may quote the
  # anti-pattern for documentation (as the leadership-pool warning does).
  hits=$(grep -rnE '%[[:space:]]*ONE_WEEK' src 2>/dev/null | grep -vE ':[0-9]+:[[:space:]]*(\*|//)' | head -5)
  if [ -z "$hits" ]; then ok "no epoch-modulo week boundary (% ONE_WEEK → Thu, not Mon) (0 hits)";
  else bad "epoch-modulo week boundary aligns to Thursday — use Monday-UTC helper (PRD §8.5.3)"; echo "$hits" | sed 's/^/        /'; fi
}
no_epoch_week_modulo
# Debit return-value guard (trial.vue 账单一致性 fix 2026-07-10): debitBalance/
# debitNex return false on insufficient/NaN/negative and DON'T charge. A bare
# statement `app.debitBalance(x);` discards that boolean → downstream still records
# a "purchased" bill / credits / spawns device with NO money moved (账本不一致).
# Every call MUST consume the return (const x=…;if(!x) / if(!app.debitX) /
# &&!app.debitNex / ?:+if). Row-start bare call ending `);` = the original bug form.
debit_return_checked() {
  local hits
  hits=$(grep -rnE '^[[:space:]]*app\.debit(Balance|Nex)\(.*\);[[:space:]]*$' src 2>/dev/null | head -5)
  if [ -z "$hits" ]; then ok "every app.debitBalance/debitNex consumes its return (no bare charge → 账本一致) (0 hits)";
  else bad "bare debitBalance/debitNex discards false return → bill recorded without charging (fix: const x=…;if(!x){toast;return})"; echo "$hits" | sed 's/^/        /'; fi
}
debit_return_checked

# ── FEAT-TRIAL02 去绑卡不回潮哨兵(2026-08-02 包F)──
# 哨兵A:绑卡时代源码指纹逐合取项清零(每项独立报告,防合并遮蔽;PASS 打样本量)。
# cardTokenId/extendedEndsAt 仅豁免 src/store/free-trial.ts —— 那是 spec 异常6
# 存量行迁移读取器(LegacyTrialRow),必须能读旧字段;其余任何文件出现即回潮。
trial02_source_fingerprints() {
  local files_n
  files_n=$(find src -type f \( -name "*.vue" -o -name "*.ts" \) | wc -l | tr -d ' ')
  local pat hits
  # 🔴 `redeem-early` 是 `redeemEarly` 的**路径拼法**,两条都要钉:2026-08-13 删掉那个方法时,
  #   src 里只剩过一处命中,而它是 `path: "/api/trial/redeem-early"` 这种代码字符串 —— 换个
  #   方法名重新引用同一条旧端点,只钉驼峰名的话一个字都抓不到(接口台账哨兵只扫注释行,
  #   代码字符串它同样看不见,这里是那块盲区的唯一覆盖面)。
  for pat in "startWithCard" "autoChargeAtEnd" "chargeFailRate" "scheduledChargeAt" "trialDisclose" "trialExtension" "trial=1" "redeemEarly" "redeem-early" "markChargeFailed"; do
    hits=$(grep -rnF "$pat" src --include="*.vue" --include="*.ts" 2>/dev/null | head -5)
    if [ -z "$hits" ]; then ok "TRIAL02 src fingerprint '$pat' = 0 (scanned $files_n files)";
    else bad "TRIAL02 card-era fingerprint '$pat' resurfaced in src"; echo "$hits" | sed 's/^/        /'; fi
  done
  # 🔴 2026-08-13:豁免从「一个文件」扩到「逐条配对的 名字→允许文件」,理由与原存量读取器同类 ——
  #   接口层解析服务端响应时**必须**能读旧字段名(线路兼容),否则服务端一发旧名就整份解析失败。
  #   trial-api.ts 的 `row.graceEndsAt ?? row.extendedEndsAt` 正是这种别名回落。
  #   🔴 精确到「名字 × 文件」而不是整文件放行 —— 整文件放行会让真的绑卡代码从这个口子回来。
  #
  # 🔴 2026-08-13(同日晚)撤销 redeemEarly 那条豁免 —— 方法已删,豁免随之作废。
  #   ① 那条豁免从没生效过:名字被加进本轮配对时**没从上面的全禁名单删掉**,于是同一次跑
  #      同时打出一条 FAIL(全禁名单)和一条 PASS(白名单),提交信息里「还原→全绿」读的是
  #      后者。加豁免那笔的红测因此是假的 —— 它验的是「弄坏会红」,没验「还原会绿」。
  #   ② 它也不该被豁免:`/api/trial/redeem-early` 是**卡时代**端点名,2026-08-02 无卡化
  #      (FEAT-TRIAL02)时已随根 PRD §9.11a.2 改名为 `/api/trial/convert`(两行公式逐字相同),
  #      签字规格里只有 convert、无 redeem 概念。全仓零调用、零消费点。
  #   判定与证据链见 docs/changes/2026-08-13-trial-early-buy-adjudication.md。
  for pair in "cardTokenId:src/store/free-trial.ts" "extendedEndsAt:src/store/free-trial.ts|src/api/trial-api.ts"; do
    pat=${pair%%:*}; allow=${pair#*:}
    hits=$(grep -rnF "$pat" src --include="*.vue" --include="*.ts" 2>/dev/null | grep -vE "^($allow):" | head -5)
    if [ -z "$hits" ]; then ok "TRIAL02 src fingerprint '$pat' = 0 outside allow-list [$allow] (scanned $files_n files)";
    else bad "TRIAL02 card-era fingerprint '$pat' resurfaced outside allow-list [$allow]"; echo "$hits" | sed 's/^/        /'; fi
  done
}

# ── 哨兵A':**文档面**的卡时代指纹(2026-08-14 补)────────────────────────
# why:上面 A 只扫 src。`docs/业务流程说明.md` §1 整节把「绑卡 → 到期自动扣款」写成当前
#   流程,足足 11 天没有任何门响 —— 因为它是文档。照那份文档实现,会实现出 FEAT-TRIAL02
#   明令禁止的产品。文档不参与编译,tsc / verify 的源码哨兵都天然看不见它。
#
# 判据不能是「文档里出现即红」—— 那会把**正确的**文档判红:讲清「这些动作已删除」、
#   列出门的禁用名单,都必须原样写出那些名字(本仓三份变更卡与重写后的 §1 都如此)。
# 所以:
#   · `docs/changes/**` 结构性豁免 —— 那里每份都是有日期的变更记录,按定义就是历史;
#   · 其余文档必须**要么零命中,要么在文件里显式写一行 STALE-TERMS-OK 标记 + 理由**。
#     标记是**有意为之且留了字**的动作,不会手滑加上;豁免文件数打进 PASS 行,不许静默增长。
# ⚠️ 已知残余风险:带了标记的文件仍可能自己烂掉。这道门挡的是「无声地把死流程写成活的」,
#   不是「所有文档永远正确」。别把它当成后者。
DOC_STALE_MARKER='STALE-TERMS-OK'
trial02_doc_fingerprints() {
  local docs_n marked_n pat hits bad_hits=0
  docs_n=$(find docs -name "*.md" -not -path "docs/changes/*" 2>/dev/null | wc -l | tr -d ' ')
  marked_n=$(grep -rlF "$DOC_STALE_MARKER" docs --include="*.md" 2>/dev/null \
    | grep -v "^docs/changes/" | wc -l | tr -d ' ')
  for pat in "startWithCard" "autoChargeAtEnd" "chargeFailRate" "scheduledChargeAt" \
             "trialDisclose" "trialExtension" "redeemEarly" "redeem-early" "markChargeFailed"; do
    # 命中文件 − changes/ − 自带标记的文件 = 真正该红的
    hits=$(grep -rlF "$pat" docs --include="*.md" 2>/dev/null \
      | grep -v "^docs/changes/" \
      | while read -r f; do grep -qF "$DOC_STALE_MARKER" "$f" || echo "$f"; done | head -5)
    if [ -n "$hits" ]; then
      bad "TRIAL02 卡时代动作名 '$pat' 出现在**没有 $DOC_STALE_MARKER 标记**的文档里 —— 要么这份文档过期了,要么补标记+理由"
      echo "$hits" | sed 's/^/        /'
      bad_hits=1
    fi
  done
  [ "$bad_hits" -eq 0 ] && ok "TRIAL02 doc fingerprints: 9 个动作名在无标记文档里 0 命中(扫 $docs_n 份非 changes 文档,其中 $marked_n 份带豁免标记)"
  # 🔴 反向对照(正控):本门的 PASS 形态是「0 命中」—— 那正是假绿最爱的形状:
  #   grep 机制一坏(路径写错 / 通配符失效 / docs 被挪走),同样是 0 命中,同样报绿。
  #   所以要有一处**必须扫得到**的地方做对照:docs/changes/ 里的变更卡按定义会原样引用这些
  #   旧动作名(裁决卡 / 红测记录都在讲它们)。那里扫不到 = 扫描机制本身坏了,不是「真干净了」。
  local control
  control=$(grep -rlF "redeemEarly" docs/changes --include="*.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$control" -ge 1 ]; then ok "TRIAL02 doc 扫描机制正控:docs/changes 里扫到 $control 份含旧动作名的变更卡(>0 = grep 确实在工作)";
  else bad "TRIAL02 doc 扫描机制失效 —— 连 docs/changes 里的变更卡都扫不到旧动作名,上面那条「0 命中」是假绿,先修扫描逻辑"; fi
}
trial02_doc_fingerprints
trial02_source_fingerprints

# 哨兵B:i18n 三语自动扣款时代文案清零(en/zh/vi 同扫)。
trial02_i18n_legacy_copy() {
  local lines_n
  lines_n=$(cat src/i18n/messages/en.ts src/i18n/messages/zh.ts src/i18n/messages/vi.ts | wc -l | tr -d ' ')
  local pat hits
  for pat in "Auto-charge" "Auto-purchase" "自动扣款" "自动完成购买" "绑卡后开始试用" "Tự động thu tiền" "Tự động mua"; do
    hits=$(grep -rnF "$pat" src/i18n/messages 2>/dev/null | head -3)
    if [ -z "$hits" ]; then ok "TRIAL02 i18n legacy copy '$pat' = 0 (3 locales, $lines_n lines)";
    else bad "TRIAL02 auto-charge-era copy '$pat' resurfaced in i18n"; echo "$hits" | sed 's/^/        /'; fi
  done
}
trial02_i18n_legacy_copy

# 哨兵C:状态机不变量 —— free-trial.ts 必须声明 convert(),且全文件零钱/设备/账单
# API(spec ④:poll 的 grace→ended 只翻状态;转化侧效应只住 checkout,P-031 同向)。
trial02_machine_invariants() {
  local f="src/store/free-trial.ts"
  if grep -qE 'async[[:space:]]+function[[:space:]]+convert[[:space:]]*\(' "$f" 2>/dev/null; then ok "TRIAL02 free-trial.ts declares async convert() (1 hit)";
  else bad "TRIAL02 free-trial.ts lost convert() — conversion cannot close the machine"; fi
  local money
  money=$(grep -nE "debitBalance|addDevice|bills\.add|creditBalance|creditNex" "$f" 2>/dev/null | head -5)
  if [ -z "$money" ]; then ok "TRIAL02 free-trial.ts touches no money/device/bill APIs (0 hits)";
  else bad "TRIAL02 free-trial.ts gained money/device side effects — poll must flip state only (spec ④)"; echo "$money" | sed 's/^/        /'; fi
}
trial02_machine_invariants

# 哨兵D:试用价双源等值 —— checkout 促销折扣行算自 trial-config.trialPriceUSD,
# 结算基数用商品目录 products[trialProductId].price;后台独立改任意一边即静默
# 脱节。运行时不耦合(生产 = 两张后端表),mock 侧焊值 parity 机器门;提取失败
# (字段/商品被删、指针悬空)同样转红,不允许「找不到 = 静默全过」。
trial02_price_parity() {
  local out
  if out=$("$NODE_BIN" scripts/selfcheck-trial-price-parity.mjs 2>&1); then
    ok "TRIAL02 trial price dual-source parity: $out"
  else
    bad "TRIAL02 trial price dual-source parity broken"
    echo "$out" | sed 's/^/        /'
  fi
}
trial02_price_parity

# 🔴 封装门(2026-08-04 结构性反思产物,见 docs/changes/2026-08-04-structural-reflection.md):
# R1 抽了单一解析器却只扫「定义面」,R2 的 P0 就出在漏网的**消费者**(结算页混源扣款)。
# 同型跨两轮复发 → 根因是「必须经解析器」只是约定、没被机器强制。本门堵死新消费者
# 静默出现:消费者台账写在门脚本里(不在被查文件里,防同批编辑一起删),钱路径一律禁。
trial_encapsulation_gate() {
  local out
  if out=$("$NODE_BIN" scripts/selfcheck-trial-encapsulation.mjs 2>&1); then
    ok "$out"
  else
    bad "试用状态封装门:有未登记消费者或钱路径混源(见 scripts/selfcheck-trial-encapsulation.mjs)"
    echo "$out" | sed 's/^/        /'
  fi
}
trial_encapsulation_gate

# 哨兵E:试用时间边界单一不变量(2026-08-03 缺陷族 P0+3×P1 同根)—— 所有时钟
# 判定收敛到 trial-boundary.ts resolveTrialAt 一个纯函数。固定靶矩阵:①离线跨
# 宽限期 convert 必拒 ②后台改 trialDays 不追溯存量冻结窗口 ③finishedAt=真边界
# 非 now ④graceEndsAt=null 存量行补齐/fail-closed ⑤全迁移矩阵逐档落点 ⑥终态
# 不可变;外加接线门(convert/poll/eligibility/liveShadow*/migrateRow 真路由到
# resolver,cancel 显式窗口不被抢)。跑真实现(esbuild 转译),断言数带地板防空集。
trial02_boundary_invariant() {
  local out
  if out=$("$NODE_BIN" scripts/selfcheck-trial-boundary.mjs 2>&1); then
    ok "TRIAL02 time-boundary single invariant: $(printf '%s\n' "$out" | tail -n 1)"
  else
    bad "TRIAL02 time-boundary single invariant broken"
    echo "$out" | sed 's/^/        /'
  fi
}
trial02_boundary_invariant
# Local-component import guard (terminal-audit P1): Vue SFC component registration
# is LOCAL-scope only — a child .vue that uses <SectionHeader> in its template MUST
# import section-header.vue itself; the parent page's import does NOT cascade. A
# missing import → runtime "[Vue warn] Failed to resolve component: SectionHeader"
# and the header silently vanishes from the DOM (3 me/* cards regressed this way).
section_header_imported() {
  local hits=""
  local f
  for f in $(grep -rlE '<SectionHeader' src --include='*.vue' 2>/dev/null); do
    grep -qE 'import SectionHeader' "$f" || hits="${hits}${f}"$'\n'
  done
  if [ -z "$hits" ]; then ok "every .vue using <SectionHeader> imports it (no resolve-fail)";
  else bad "<SectionHeader> used without import (Vue resolve-fail, header vanishes):"; printf "%s" "$hits" | sed 's/^/        /'; fi
}
section_header_imported
# Chassis chrome completeness (PITFALLS P-037): the prototype's IOSFrame mounts a
# fixed set of ALWAYS-ON chrome — Header + TabBar + NovaBubble (nova 浮标) +
# pull-to-refresh. Batch-0 chassis was simplified and silently dropped the bubble
# + pull-refresh; verify only caught what it was told to look at (cf. P-036). This
# sentinel enumerates the always-on chrome so it can't regress unnoticed.
chassis_chrome_complete() {
  local f="src/components/app-chassis.vue"
  local miss=""
  [ -f "$f" ] || { bad "chassis file missing ($f)"; return; }
  grep -q 'NovaBubble' "$f" || miss="${miss}NovaBubble(nova浮标) "
  grep -q 'nx-refresher' "$f" || miss="${miss}pull-to-refresh(touch) "
  grep -q 'nx-page-enter' "$f" || miss="${miss}page-entrance-anim "
  grep -q 'nx-tabbar-pill' "$f" || miss="${miss}floating-pill-tabbar "
  grep -q 'nx-header' "$f" || miss="${miss}brand-header "
  # frosted-glass chrome must NOT use <scroll-view> for content (P-039): its
  # separate compositing layer kills the fixed chrome's backdrop-filter frosting.
  grep -qE '<scroll-view[^>]*class="nx-content' "$f" && miss="${miss}scroll-view-breaks-frosting(use-overflow-view) "
  if [ -z "$miss" ]; then ok "chassis chrome complete (header + pill + nova浮标 + pull-refresh + entrance, frosting-safe)";
  else bad "chassis chrome INCOMPLETE — missing: $miss"; fi
}
chassis_chrome_complete
# CSS foundation (PITFALLS P-038): the prototype's globals.css `font-family`
# chains reference --font-display / --font-jet-mono (next/font vars injected on
# :root by app/layout.tsx) and rely on Tailwind Preflight's global border-box.
# uni has NO layout.tsx and UnoCSS presetWind3 ships no preflight, so if these
# aren't redefined locally: (a) the undefined var() makes the WHOLE font-family
# declaration invalid → every text node falls back to Times New Roman serif;
# (b) content-box makes height/width+padding elements larger than the prototype.
# Plus the brand fonts must be loaded (index.html) — the prototype loads them in
# layout.tsx. This sentinel guards all three so the foundation can't regress.
css_foundation() {
  local t="src/styles/tokens.css"
  local miss=""
  [ -f "$t" ] || { bad "tokens.css missing"; return; }
  grep -qE '^\s*--font-display:' "$t"  || miss="${miss}--font-display-undef(→TimesNewRoman) "
  grep -qE '^\s*--font-jet-mono:' "$t" || miss="${miss}--font-jet-mono-undef "
  grep -qE 'box-sizing:\s*border-box' "$t" || miss="${miss}no-border-box-reset "
  grep -q 'general-sans' index.html 2>/dev/null || miss="${miss}no-brand-font-link(index.html) "
  if [ -z "$miss" ]; then ok "css foundation (font vars defined + border-box reset + brand font loaded)";
  else bad "css foundation BROKEN — $miss"; fi
}
css_foundation
# Navigation route validity (PITFALLS P-046): every "/pages/..." route LITERAL in
# src must exist in pages.json — else uni's navigateTo({fail:()=>{}}) silently
# does nothing → "点击无跳转" (cf. team Genesis card used /pages/genesis instead of
# /pages/genesis/genesis). Dynamic prototype logical-path hrefs (/genesis,
# /me/wallet/exchange …) must route through src/lib/route.ts navTo(), not raw
# navigateTo, so they're mapped to real flattened uni routes.
nav_routes_valid() {
  local bad_routes
  bad_routes=$("$NODE_BIN" -e '
    const fs=require("fs"), cp=require("child_process");
    const pj=JSON.parse(fs.readFileSync("src/pages.json","utf8"));
    const valid=new Set((pj.pages||[]).map(p=>"/"+p.path));
    // 🔴 2026-08-13 收窄扫描面:测试文件里的路由是**夹具字符串**,不是导航目标 ——
    //   behavior-analytics-race.test.ts 造了个 "/pages/home/index" 喂给 tap 采样器,
    //   它永远不会被 navigateTo 消费,却让本门判红。门守的是「真导航指向不存在的页」,
    //   夹具不在这个域里。只排 *.test.ts / *.spec.ts,不放宽到整目录。
    let out=""; try{out=cp.execSync("grep -rnE \"/pages/[A-Za-z0-9_/-]+\" src --include=*.ts --include=*.vue --include=*.json --exclude=*.test.ts --exclude=*.spec.ts",{encoding:"utf8",maxBuffer:1e8});}catch(e){out=e.stdout||"";}
    const refs=new Set();
    out.split("\n").forEach(line=>{
      const ci=line.indexOf(":", line.indexOf(":")+1);
      const content=ci>=0?line.slice(ci+1):line;
      if(/^\s*(\/\/|\*|<!--|\/\*)/.test(content)) return; // skip comment / doc lines
      (content.match(/\/pages\/[A-Za-z0-9_\/-]+/g)||[]).forEach(m=>refs.add(m.replace(/\/$/,"")));
    });
    const broken=[...refs].filter(r=>!valid.has(r)).sort();
    if(broken.length) process.stdout.write(broken.join(" "));
  ' 2>/dev/null)
  if [ -z "$bad_routes" ]; then ok "nav routes valid (all /pages/ literals exist in pages.json)";
  else bad "INVALID nav routes (navigateTo silently fails): $bad_routes"; fi
}
nav_routes_valid
# User-facing brand must be NOVA, never Stella (已决产品决策 / ALIGNMENT carve-out).
# The AI assistant was renamed Stella→NOVA; code identifiers (nova-bubble.vue,
# useNova, .nx-nova-*) are internal and fine, but no user-VISIBLE "Stella" may
# leak. i18n message VALUES are the authoritative user-facing surface (all copy
# goes through t()), so guard quoted values containing "Stella" there (excluding
# the unrelated 'stellar*' hardware SKU). Keys like `nova: {` aren't quoted values
# so won't match.
no_userfacing_stella() {
  local hits
  hits=$(grep -rnE ':[[:space:]]*"[^"]*[Ss]tella[^"]*"' src/i18n/messages 2>/dev/null | grep -iv 'stellar' | head -8)
  if [ -z "$hits" ]; then ok "no user-facing 'Stella' (brand=NOVA) (0 hits)";
  else bad "user-facing 'Stella' leaked (brand must be NOVA)"; echo "$hits" | sed 's/^/        /'; fi
}
no_userfacing_stella
# Brand rebrand guard (2026-07-22 → NexGrid): 旧品牌词不得回流用户可见/运行时层。
# 白名单:<旧词>-prototype/-uniapp/-admin 溯源引用(注释/路径级工程名)、static/img 旧图文件名。
# i18n messages/tokens.css 也在守备范围(sentinel_absent 的默认排除不适用),故独立实现。
# 旧词用拆词构造,防本文件自指命中(哨兵红测:见 docs/changes/2026-07-22-nexgrid-rebrand.plan.md 总回测)。
no_oldbrand_check() {
  local tok='Nexi'; tok="${tok}on"
  local hits
  # 白名单四类专有名词:①工程/仓库目录名(含后端仓 -backend 与运营台 -ops-console,
  # c37e642 起契约测试按仓路径取材)②skill 名(注释里引用规范来源合法)
  # ③静态图文件名 ④后端契约标识符(x-…-edge-country header 名由后端定,client 只能
  # 跟随;改名义务已记 HANDOFF)。除此之外的旧品牌词一律拦。
  # 🔴 不要为「注释引用 PRD 文件名」加白名单:`grep -viE` 是**整行**过滤,
  #    加 `PRD/…` 等于放行「任何提到 PRD 路径的行」,而品牌散文恰恰住在注释里 ——
  #    红测实证:那样改后 5 条真违规只抓得住 1 条(含用户可见 i18n 串与 DOM 文本)。
  #    需要引用带旧品牌前缀的 PRD 文件名时,注释里省略该前缀即可(见本文件 PAY-VN 段)。
  # 🔴 白名单按 token 抠掉,不整行放行(z1 R2 对抗审计 P1-12):`grep -viE` 是**整行**过滤,
  #    于是「一行里既有合法的后端仓路径、又有真的品牌泄漏」会被整行放走 ——
  #    例:const heroTitle = "Nexion";  // 契约来源:nexion-backend/...  ← 旧判据放行。
  #    改法:先把白名单形态从行里**删掉**,再看这一行还剩不剩旧词;剩了才算命中。
  hits=$("$NODE_BIN" -e '
const fs=require("fs"),path=require("path");
const tok=process.argv[1];
// 🔴 线上契约标识符不算品牌残留(2026-08-13):`NEXION_USDT_WALLET` 是服务端下发的
//   paymentRail 枚举值(trial-api.ts:110 拿它**校验回包**),`__NEXION_TRUSTED_TASK_PROOF__`
//   是原生壳注入的全局键 —— 两个都是**对方定义的名字**,客户端单方面改拼写 = 契约当场对不上。
//   等后端改名再同步。判据只放这两个**具体标识符**,不放宽成「凡大写就算契约」。
// Product names are the one user-visible exception: NexionBox S1 and NexionBox
// Pro v2 are load-bearing catalog fixture names for the server product contract.
// Keep this exact (whole product name) rather than allowing the bare Nexion token;
// a normal brand string must still fail the rebrand gate.
const WHITELIST=new RegExp(`${tok}Box\\s+(?:S1|Pro\\s+v2)|${tok}-(prototype|uniapp|admin|backend|ops-console)|${tok}-(design|workflow|audit|spec|sprint|prd-sync|uniapp-port|admin-prd)|static/img/[^:\\\\s]*${tok}|x-${tok}-edge-country|${tok}_USDT_WALLET|__${tok}_TRUSTED_TASK_PROOF__|${tok}_ACCEPTANCE_RUN_ID`,"gi");
const hits=[];
const walk=(d)=>{ let es=[]; try{es=fs.readdirSync(d,{withFileTypes:true})}catch{return}
  for(const e of es){const p=path.join(d,e.name);
    if(e.isDirectory())walk(p);
    else if(/\.(vue|ts|js|mjs|json|html|css|md)$/.test(e.name)){
      let txt=""; try{txt=fs.readFileSync(p,"utf8")}catch{continue}
      txt.split(/\r?\n/).forEach((ln,i)=>{
        const residual=ln.replace(WHITELIST,"");
        if(new RegExp(tok,"i").test(residual)) hits.push(p.split(path.sep).join("/")+":"+(i+1)+":"+ln.trim().slice(0,120));
      });
    }}};
["src","scripts"].forEach(walk);
try{ const h=fs.readFileSync("index.html","utf8"); h.split(/\r?\n/).forEach((ln,i)=>{ const r=ln.replace(WHITELIST,""); if(new RegExp(tok,"i").test(r)) hits.push("index.html:"+(i+1)+":"+ln.trim().slice(0,120)); }); }catch{}
console.log(hits.slice(0,8).join("\n"));
' "$tok" 2>/dev/null)
  if [ -z "$hits" ]; then ok "brand: no legacy '${tok}' outside whitelist (0 hits)";
  else bad "brand: legacy '${tok}' residual (rebrand=NexGrid, see docs/changes/2026-07-22-nexgrid-rebrand.md)"; echo "$hits" | sed 's/^/        /'; fi
}
no_oldbrand_check
# Pass A architecture (ALIGNMENT): chassis must keep the sub-page nav-row branch
# (sticky page-header registration) + the store + composable. Losing the nav row
# would silently revert converted sub-pages to scrolling in-page headers.
nav_header_arch() {
  local f="src/components/app-chassis.vue"
  local miss=""
  grep -q 'nx-navheader' "$f" || miss="${miss}chassis-nav-row "
  [ -f "src/store/page-header.ts" ] || miss="${miss}page-header-store "
  [ -f "src/composables/use-page-header.ts" ] || miss="${miss}use-page-header-composable "
  if [ -z "$miss" ]; then ok "page nav-header architecture present (chassis row + store + composable)";
  else bad "page nav-header architecture INCOMPLETE — $miss"; fi
}
nav_header_arch
# Converted sub-pages (those calling useSetPageHeader) must NOT also carry an
# in-page back row (back-chevron glyph 'm15 18-6-6') → that doubles the header;
# nor a page-level position:fixed (escapes the overflow:hidden bezel — the old
# detail.vue bug; bottom CTAs go via useStickyCTA → the chassis <StickyCtaBar>).
converted_pages_clean() {
  local hits=""
  local f
  while IFS= read -r f; do
    if grep -q 'useSetPageHeader' "$f"; then
      grep -q 'm15 18-6-6' "$f" && hits="${hits}${f}: in-page back glyph (double header)\n"
      grep -qE 'position:[[:space:]]*("fixed"|fixed;)' "$f" && hits="${hits}${f}: page-level fixed positioning (use useStickyCTA)\n"
    fi
  done < <(find src/pages -name '*.vue')
  if [ -z "$hits" ]; then ok "converted nav-header pages clean (no double header / no page-level fixed) (0 hits)";
  else bad "converted page issue"; printf "$hits" | sed 's/^/        /'; fi
}
converted_pages_clean
# SubPageHeader (used by ~55 sub-pages) must stay STICKY (position:sticky) so the
# header pins on scroll + frosts content (prototype-faithful). Regressing it to a
# scrolling in-content row silently breaks 吸顶/磨砂 across the whole app. (uni H5:
# a component store-registrar can't re-assert on back-nav — onShow/onActivated
# aren't delivered to child components — so sticky in-content is the mechanism.)
subpage_header_sticky() {
  local f="src/components/sub-page-header.vue"
  [ -f "$f" ] || { bad "sub-page-header.vue missing"; return; }
  if grep -qE 'position:\s*sticky' "$f"; then ok "SubPageHeader sticky (pins + frosts on scroll)";
  else bad "SubPageHeader not sticky (吸顶/磨砂 broken for ~55 pages)"; fi
  # De-card sweep 2026-07-09: .spv margin-bottom is the SINGLE SOURCE of the
  # nav→content 24px breathing for ~55 SubPageHeader pages. If it's removed,
  # every sub-page's header jams against content (the "太紧" regression).
  if grep -qE 'margin-bottom:\s*24px' "$f"; then ok "SubPageHeader nav→content 24px gap (single-source breathing)";
  else bad "SubPageHeader lost margin-bottom:24px (~55 pages jam header against content)"; fi
}
subpage_header_sticky
# Genesis current-policy anti-regression: checkout re-verifies the server projection,
# and the 5174 offline mirror keeps the same maxPerUser guard in both growth paths.
gen_gate_l3=$(grep -c "gate.value.eligible" src/components/genesis/purchase-sheet.vue 2>/dev/null || echo 0)
gen_gate_l4=$(grep -c "GENESIS_ELIGIBILITY_POLICY.maxPerUser" src/store/genesis.ts 2>/dev/null || echo 0)
gen_gate_sec=$(grep -c "gatesSecondary" src/pages/genesis/marketplace.vue 2>/dev/null || echo 0)
if [ "$gen_gate_l3" -ge 1 ] && [ "$gen_gate_l4" -ge 2 ] && [ "$gen_gate_sec" -ge 1 ]; then
  ok "genesis current policy wired (server projection re-verify + offline cap guard ×$gen_gate_l4 + secondary gate)"
else
  bad "genesis eligibility gate missing (L3=$gen_gate_l3 need >=1, L4=$gen_gate_l4 need >=2, sec=$gen_gate_sec need >=1)"
fi
# Device daily-yield single-source parity (2026-06-18 drift incident): the same
# per-SKU USDT+NEX daily yield is hand-duplicated across FOUR sources with nothing
# deriving one from another — device-types.ts (DEVICE_SPECS → what the user is
# DELIVERED), products.ts (PRODUCTS → what the store card/detail ADVERTISES), the
# i18n VsPhoneHero sublines (phone + S1) and trial-config.ts (shadowDaily* → what
# the free trial advertises, must equal its trialProductId baseline). They
# silently drifted (phone 2≠10, Cloud 1≠3, Pro v2 14.5/100≠14/90) → advertised ≠
# delivered, a trust bug NONE of the sentinels above caught. This asserts the four
# agree; authoritative values = PRD §7.1/§13.3.
device_yield_parity() {
  if "$NODE_BIN" scripts/check-device-yield-parity.mjs >/tmp/uni-yield-parity.log 2>&1; then
    ok "$(cat /tmp/uni-yield-parity.log)"
  else
    bad "device-yield parity (advertised ≠ delivered drift)"; sed 's/^/        /' /tmp/uni-yield-parity.log
  fi
}
device_yield_parity
# 单源锚哨兵 (2026-07-24 platform-stats-single-anchor): every platform-level
# money/fleet display figure derives from src/lib/platform-stats.ts. Four
# mutually-exclusive daily-flow anchors coexisted before ($1.24M/day home card,
# +$215/sec ⇒ $18.6M/day, ref $1.2M/month ⇒ $40k/day, store seed ⇒ $17.2M/day);
# this pins the class shut: legacy literals dead, anchor confined to the lib,
# consumers must import (derive-not-cache), 28,432 keeps exactly ONE role.
platform_stats_anchor() {
  local fails=0 stray n pat
  # (1) legacy mutually-exclusive anchor literals must stay dead in src/
  for pat in '1247893' '1,247,893' '1_247_893' '\$1\.24M' '\+\$215/sec' 'paidToday' 'todayIncrement' 'networkPhones' 'networkHubs' 'paidToCreators' 'leaderboardHint' '(^|[^0-9])8,432' 'jobs/s' '\bq3(Label|Suffix|ReportTitle)' 'Q3_FINANCIALS'; do
    if grep -rqEI "$pat" src 2>/dev/null; then
      bad "platform-anchor: legacy literal /$pat/ resurfaced in src/"; fails=1
    fi
  done
  # (2) anchor literals (682,368 rate & 127,438,905 cumulative seed) only in the lib
  stray=$(grep -rlEI '682368|682,368|682_368|127_438_905|127,438,905|127438905' src 2>/dev/null | grep -v 'lib/platform-stats.ts' || true)
  if [ -n "$stray" ]; then bad "platform-anchor: anchor literal outside lib/platform-stats.ts: $stray"; fails=1; fi
  # (3) 28,432 role-collision guard: allowed ONLY in the lib (fleet anchor)
  stray=$(grep -rlEI '28,432|28432|28_432' src 2>/dev/null | grep -v 'lib/platform-stats\.ts' || true)
  if [ -n "$stray" ]; then bad "platform-anchor: 28,432 outside the anchor lib (role collision): $stray"; fails=1; fi
  # (3b) 🔴 FEAT-HOME02:首页脉搏卡的「今日支付」格与条头每秒支付流已按规格删除,
  #      原判据「network-pulse-card.vue 必须消费 DAILY_PAYOUT_USD」随之不成立。
  #      规格明写「需同步调整判据**而非放宽哨兵**(防判据失效变空门)」,故改成两条:
  #        ① 锚本身仍在,且 PAYOUT_PER_SEC_USD 仍**从它派生**(链没断,别的页面还在用);
  #        ② 首页脉搏卡**不得**再出现任何平台支付规模数字(删了就不许回来)。
  #      少了 ① 就等于允许有人把锚删掉;少了 ② 就等于允许把那格悄悄加回去。
  if ! grep -qE 'DAILY_PAYOUT_USD *= *FLEET_DEVICES \* FLEET_AVG_DAILY_USD' src/lib/platform-stats.ts 2>/dev/null; then
    bad "platform-anchor: 日支付锚定义不见了(其它页面仍从它派生,不可删)"; fails=1
  fi
  if ! grep -qE 'PAYOUT_PER_SEC_USD *= *DAILY_PAYOUT_USD */ *86_?400' src/lib/platform-stats.ts 2>/dev/null; then
    bad "platform-anchor: 每秒支付流不再从日支付锚派生(派生链断 = 又成两个数)"; fails=1
  fi
  if grep -qE 'DAILY_PAYOUT_USD|MONTHLY_PAYOUT_USD|PAYOUT_PER_SEC_USD|networkPaidToday' src/components/home/network-pulse-card.vue 2>/dev/null; then
    bad "platform-anchor: 首页脉搏卡又出现平台支付规模(FEAT-HOME02 已删,不得回归)"; fails=1
  fi
  # (4) consumers wired to the single source: import present AND anchor symbol consumed
  #     (import-only would let a hardcoded near-value ride under a green light)
  # (4-注)2026-08-06 主人拍板(包 G P2#3 选 a):on-grid 页脚「配置坏回 PAYOUT_PER_SEC_USD
  #        种子锚」退役,改与脉搏卡同判据占位降级 → 该消费对从台账移除(消费关系合法消亡,
  #        非哨兵放宽);常量本身仍由上方 ① 派生链哨兵钉着,payoutPerSecUsdOf 消费对保留。
  # (4-注2)z1 判决 A(2026-08-10):c37e642 把 joiners/fleet 展示从「编译期常量兜底」改成
  #   「配置派生 + publicStatsHealth 门控 + '—' 占位」,MONTHLY_NEW_JOINERS / FLEET_DEVICES
  #   两个消费对合法消亡(符号已从 import 整条移除,非死 import);消费对改钉 health 门控
  #   接线,坏配置回落到编译期像真数据的旧路径若复活,这两条计数会先红。
  for pair in \
    'src/pages/onboarding/intro.vue|paidCumulativeNow' \
    'src/pages/ref/code.vue|publicStatsHealth' \
    'src/store/app.ts|publicStatsHealth' \
    'src/components/home/on-grid-section.vue|payoutPerSecUsdOf' \
    'src/pages/onboarding/intro.vue|fleetDevicesOf' \
    'src/pages/ref/code.vue|monthlyPayoutUsdOf'; do
    f="${pair%%|*}"; sym="${pair##*|}"
    # 🔴 计数剥注释(R2 P2:注释里提符号两次就能给死代码放行);s|…|| 形护 :// 协议串
    if ! grep -q 'from "@/lib/platform-stats"' "$f" 2>/dev/null; then bad "platform-anchor: $f missing platform-stats import"; fails=1; fi
    if [ "$(sed -E 's|(^\|[^:])//.*$|\1|' "$f" 2>/dev/null | grep -c "$sym")" -lt 2 ]; then bad "platform-anchor: $f imports but never consumes $sym"; fails=1; fi
  done
  # 🔴 R2 C5 定案:累计支付是时间积分,禁配置派生版(调低舰队=历史回退)。
  #   这里不能再把字段名本身当成违规:服务端 publicStats 新投影可以合法携带
  #   `paidCumulativeNowOf`,而客户端只读该投影并不产生历史回退。只拦两种真正的
  #   本地派生:platform-stats.ts 自己定义同名计算器,或任意调用把 cfg/config/
  #   publicStats 当作该计算器输入。这样 server projection 过门,本地配置公式仍红。
  if grep -qE '(^|[[:space:]])(function|const)[[:space:]]+paidCumulativeNowOf[[:space:]]*[=(]' src/lib/platform-stats.ts 2>/dev/null; then
    bad "platform-anchor: platform-stats.ts 不得定义 paidCumulativeNowOf —— 累计支付只能由服务端投影"; fails=1
  fi
  if find src -type f \( -name '*.ts' -o -name '*.vue' \) -exec sed -E 's|(^|[^:])//.*$|\1|' {} + 2>/dev/null \
      | grep -qE 'paidCumulativeNowOf[[:space:]]*\([^)]*(cfg|config|publicStats)'; then
    bad "platform-anchor: paidCumulativeNowOf 不得从本地 cfg/config/publicStats 派生"; fails=1
  fi
  # R3 P2:fail-open 补 witness —— 管道故障/空扫描时禁令会静默绿;扫描数必须够量才算判过
  _pcno_scanned=$(find src -type f \( -name '*.ts' -o -name '*.vue' \) 2>/dev/null | wc -l)
  if [ "${_pcno_scanned:-0}" -lt 50 ]; then bad "platform-anchor: 禁令哨兵扫描面异常($_pcno_scanned 文件)——判据失效不许静默过"; fails=1; fi
  # (4b) z1 判决 A · 判据反转(2026-08-10):819a6da 把 publicStats 种子移出 mock,
  #      c37e642 把 compat 默认清零并声明「Deliberately invalid sentinel …
  #      Never replace it with plausible data」—— H9 在服务端投影到达前必须保持不可用。
  #      新不变量:compat 的 publicStats 默认块不得出现任何非零可信值(空表也不得填充);
  #      块提取失败同样红(判据失效不许静默过)。
  # 🔴 白名单式判据(z1 R2 独立审计:原「禁 [1-9]」是黑名单,被 `fleetDevices: PLAUSIBLE_FLEET`
  #    具名常量 / `0.4` 小数 / `0xC350` 十六进制整族绕过)。改成:块内每个字段值只许是
  #    0 / -1 / [] 三种形态,其余一律红。awk 只取**第一个**块(sed 的 /a/,/b/ 会在第二次
  #    出现处重开区间一路吃到文件尾,实测抓到半个文件 —— 那才是判据真正的失效面)。
  compat_ps=$(awk '/RUNTIME_PUBLIC_STATS_DEFAULT/{f=1} f{print} f&&/^};/{exit}' src/lib/platform-config-compat.ts | sed 's|//.*||' | tr -d '\r')
  if [ -z "$compat_ps" ]; then
    bad "platform-anchor: compat publicStats 默认块提取失败(判据失效必红)"; fails=1
  else
    compat_bad=$(echo "$compat_ps" | grep -E '^\s+\w+:' | grep -vE '^\s+\w+: *(0|-1|\[\]),?\s*$' || true)
    if [ -n "$compat_bad" ]; then
      bad "platform-anchor: compat publicStats 默认字段值只许 0 / -1 / [](H9 必须保持 invalid sentinel),越界项:"
      echo "$compat_bad" | sed 's/^/        /'; fails=1
    fi
  fi
  # joiners/fleet 的健康门控接线(z1):坏配置必须落 '—' 占位,不许渲染像真数字。
  if ! sed -E 's|(^\|[^:])//.*$|\1|' src/pages/ref/code.vue 2>/dev/null | grep -q 'membersOk'; then
    bad "platform-anchor: code.vue joiners 未走 membersOk 健康门控"; fails=1
  fi
  # (5) monthly-joiners value mirrored: exactly one 41,286 per locale (poster)
  for lf in src/i18n/messages/en.ts src/i18n/messages/zh.ts src/i18n/messages/vi.ts; do
    if [ "$(grep -cF '41,286' "$lf" 2>/dev/null)" -ne 1 ]; then bad "platform-anchor: $lf joiners 41,286 count != 1"; fails=1; fi
  done
  # 【(6) z1 判决 C · 显式退役】trust Q2 字面量镜像(27,150 / $47.0M ↔ admin i-tabs data.ts)
  # 删除:c37e642 把 trust 页 Q2 财务组整删(QTR_FINANCIALS=[] + 模板段 v-if=false),披露改
  # trustSectionApi 按地区服务端下发;admin 活跃仓(admin-ops)同字段亦已服务端化、无字面量
  # 可镜。编译期 Q2 镜像的主语两侧同时灭失;对照面若回流字面量,由 (1) legacy-literal 禁令
  # 与服务端契约层守。守住「删了不许悄悄回来」:trust.vue 不得再出现本地 Q2 财务字面量。
  # 🔴 禁的是「本地财务数据」这个类,不是那两个旧字符串(z1 R2 对抗审计 P1-11:
  #    留着空的 QTR_FINANCIALS、另起一组 Q4_FINANCIALS 就能整族绕过)。判据两条:
  #    ① 两个旧字面量不得回流;② trust.vue 里不得出现**任何**带内容的 *FINANCIALS 数组。
  for v in '27,150' '\$47\.0M'; do
    if grep -qE "$v" src/pages/trust/trust.vue 2>/dev/null; then
      bad "platform-anchor: trust.vue 本地 Q2 财务字面量回流 /$v/(披露已服务端化,不得回退)"; fails=1
    fi
  done
  fin_arrays=$(sed 's|//.*||' src/pages/trust/trust.vue 2>/dev/null | grep -nE '\w*FINANCIALS\w*[^=]*=\s*\[[^]]' | head -3)
  if [ -n "$fin_arrays" ]; then
    bad "platform-anchor: trust.vue 出现带内容的本地财务数组(披露一律服务端下发,禁另起一组绕过旧字面量禁令)"
    echo "$fin_arrays" | sed 's/^/        /'; fails=1
  fi
  if ! grep -qE 'QTR_FINANCIALS: \{ metric: string; value: string; delta: string \}\[\] = \[\];' src/pages/trust/trust.vue 2>/dev/null; then
    bad "platform-anchor: trust.vue QTR_FINANCIALS 不再是声明空数组(本地财务数据禁回流;产品若恢复本地 Q2 须重立镜像判据)"; fails=1
  fi
  if [ "$fails" -eq 0 ]; then ok "platform-stats single anchor (legacy 0 · lib-confined · consumers+health-gate · joiners 1×3 · compat 全零哨兵 · Q2 本地字面量 0)"; fi
}
platform_stats_anchor
# FEAT-DEV01 等效换皮 P0 (2026-07-06): the task-capacity band literals in
# device-lifecycle.ts must reproduce the retired degradation curve EXACTLY
# (0.25-month-step diff<1e-9, floor, exempt kinds, subsidy display-only) and the
# FEAT-DEV02 credit-ladder literal must be structurally sound (starts at 0,
# contiguous, strictly decreasing creditPct, (0,100], open-ended top band).
# Golden lives in the script — an INTENTIONAL schedule retune must update
# golden + admin canon-numbers.json together.
capacity_curve_parity() {
  if "$NODE_BIN" scripts/check-capacity-curve-parity.mjs >/tmp/uni-capacity-parity.log 2>&1; then
    ok "$(cat /tmp/uni-capacity-parity.log)"
  else
    bad "task-capacity curve parity / credit-ladder structure"; sed 's/^/        /' /tmp/uni-capacity-parity.log
  fi
}
capacity_curve_parity

# 首页任务轮播契约(2026-07-16):0/1/2 张后台投影、5s 自动轮播、展开暂停，
# 两卡等高、奖励色统一 NEX 身份紫(--v5-nex, 2026-07-22)、卡面无外边框；独立审计板块不得重新挂回首页。
home_task_carousel_contract() {
  local page="src/pages/index/index.vue"
  local newcomer="src/components/home/day-one-quest-card.vue"
  local weekly="src/components/home/conversion-banner.vue"
  local flags="src/store/config-types.ts"
  local seed="src/mock/platform-config.ts"
  local zh="src/i18n/messages/zh.ts"
  local miss=""
  grep -q '<swiper' "$page" || miss="${miss}swiper "
  grep -q 'v-if="visibleTaskCards.length"' "$page" || miss="${miss}zero-card-hide "
  grep -q ':autoplay="shouldAutoplay"' "$page" || miss="${miss}autoplay-state "
  grep -q ':interval="TASK_CAROUSEL_INTERVAL_MS"' "$page" || miss="${miss}autoplay-interval-bind "
  grep -q 'TASK_CAROUSEL_INTERVAL_MS = 5000' "$page" || miss="${miss}five-second-interval "
  grep -q ':disable-touch="!hasTaskCarousel"' "$page" || miss="${miss}single-card-static "
  grep -q 'onTaskTouchMove' "$page" || miss="${miss}expanded-swipe-collapse "
  grep -q 'taskCarouselAnnouncement' "$page" || miss="${miss}manual-announcement "
  grep -q 'next-margin="0px"' "$page" || miss="${miss}full-width-slide "
  grep -q 'home-task-carousel__meta' "$page" && miss="${miss}page-number-overlay "
  grep -q 'taskSlide + 1' "$page" && miss="${miss}visible-page-number "
  grep -q '<TrustChipWall' "$page" && miss="${miss}independent-audit-still-mounted "
  grep -q 'event: "update:expanded"' "$newcomer" || miss="${miss}controlled-newcomer-expand "
  grep -q 'expanded: false' "$newcomer" || miss="${miss}newcomer-default-collapse "
  grep -q 'height: "var(--home-task-card-height, 184px)"' "$weekly" || miss="${miss}weekly-equal-height "
  grep -q '/static/img/marketing/trial-hero.png' "$weekly" || miss="${miss}weekly-project-machine-asset "
  grep -q 'PRODUCT_MASK' "$weekly" || miss="${miss}weekly-machine-mask "
  grep -q 'radial-gradient(50% 60% at 100% 0%, var(--v5-brand-soft), transparent 70%)' "$weekly" || miss="${miss}weekly-original-background-glow "
  grep -q 'ellipse 200px 250px at 95% 50%' "$weekly" || miss="${miss}weekly-original-machine-fade "
  grep -q 'top: "-36px"' "$weekly" || miss="${miss}weekly-original-machine-top "
  grep -q 'right: "-50px"' "$weekly" || miss="${miss}weekly-original-machine-right "
  grep -q 'width: "220px"' "$weekly" || miss="${miss}weekly-original-machine-width "
  grep -q 'height: "220px"' "$weekly" || miss="${miss}weekly-original-machine-height "
  grep -q 'class="weekly-quest__header"' "$weekly" || miss="${miss}weekly-redesign-header "
  grep -q 'class="weekly-quest__mark"' "$weekly" || miss="${miss}weekly-redesign-icon "
  grep -q 'class="weekly-quest__body"' "$weekly" || miss="${miss}weekly-redesign-body "
  grep -q 'class="weekly-quest__product"' "$weekly" || miss="${miss}weekly-redesign-product-zone "
  grep -q 'weekly-quest__reward-value' "$weekly" || miss="${miss}weekly-reward-style "
  # 2026-07-23 B1:随《02》14 档迁移由 30px 升 h1 34px(主人已批映射表)。
  grep -q 'font-size: 34px' "$weekly" || miss="${miss}weekly-reward-size-drift "
  grep -q 'color: var(--v5-nex)' "$weekly" || miss="${miss}weekly-reward-color-drift "
  grep -q 'font-weight: 500' "$weekly" || miss="${miss}weekly-reward-weight-drift "
  # 2026-07-23 B1:原 pin 硬编码 hex #9B89E0(哨兵把 token 违规固化了);主人批准
  # 补 --v5-quest-violet token 后改 pin token 名 —— 断言强度不变,且不再锁死违规。
  # 2026-07-23 C1:倒计时是**前景文字**,quest 填充档当文字用时亮主题实测 2.98:1 不达 AA
  # → 改走文字档 --v5-quest-violet-ink(亮主题 5.47,暗主题沿用原色不变)。哨兵同步 pin 文字档。
  grep -q 'color: var(--v5-quest-violet-ink)' "$weekly" || miss="${miss}weekly-countdown-color-drift "
  grep -q 'class="weekly-quest__cta"' "$weekly" || miss="${miss}weekly-cta "
  grep -q 'bottom: 14px' "$weekly" || miss="${miss}weekly-cta-bottom-spacing "
  grep -q 'left: 16px' "$weekly" || miss="${miss}weekly-cta-full-width "
  grep -q 'min-height: 44px' "$weekly" || miss="${miss}weekly-cta-tap-height "
  grep -q 'background: var(--v5-brand-soft)' "$weekly" || miss="${miss}weekly-cta-tone "
  grep -q 'boxShadow: "var(--v5-card-shadow-lift)"' "$weekly" && miss="${miss}weekly-card-edge-returned "
  grep -q 'padding-right: 56px' "$weekly" && miss="${miss}weekly-header-padding-drift "
  # 2026-07-23 B1:16px 随《02》14 档迁移降 body.m/number.mono 15px(主人已批映射表)。
  # 色值原为设计稿钦定 hex,2026-07-23 主人批准收敛为 --v5-quest-violet token。
  grep -q 'font-size: 15px; color: var(--v5-quest-violet-ink)' "$newcomer" || miss="${miss}newcomer-countdown-style-drift "
  grep -q 'newcomer-task__reward-value' "$newcomer" || miss="${miss}newcomer-reward-style "
  grep -q 'color: var(--v5-nex)' "$newcomer" || miss="${miss}newcomer-reward-color-drift "
  grep -q 'minHeight: "44px"' "$newcomer" || miss="${miss}newcomer-toggle-height-drift "
  grep -q 'margin: "14px 16px"' "$newcomer" || miss="${miss}newcomer-toggle-spacing-drift "
  grep -q 'boxShadow: "var(--v5-card-shadow-lift)"' "$newcomer" && miss="${miss}newcomer-card-edge-returned "
  grep -q 'padding-right: 56px' "$newcomer" && miss="${miss}newcomer-header-padding-drift "
  grep -q 'homeNewcomerTasksEnabled: boolean' "$flags" || miss="${miss}newcomer-config-flag "
  grep -q 'homeWeeklyPromoEnabled: boolean' "$flags" || miss="${miss}weekly-config-flag "
  grep -q 'homeNewcomerTasksEnabled: true' "$seed" || miss="${miss}newcomer-mock-projection "
  grep -q 'homeWeeklyPromoEnabled: true' "$seed" || miss="${miss}weekly-mock-projection "
  grep -q 'dayOneFirstDayReward: "新手任务"' "$zh" || miss="${miss}newcomer-copy "
  if "$NODE_BIN" <<'NODE' >/tmp/home-task-carousel-relations.log 2>&1; then
const fs = require("fs");
const ts = require("typescript");
const { baseParse, NodeTypes } = require("@vue/compiler-dom");
const page = fs.readFileSync("src/pages/index/index.vue", "utf8");
const script = page.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("index.vue script setup not found");
const source = ts.createSourceFile("index.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const compact = (value) => value.replace(/\s+/g, "");
const need = (condition, message) => {
  if (!condition) throw new Error(message);
};
function variable(name) {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration;
    }
  }
  throw new Error(`variable not found: ${name}`);
}
function functionBody(name) {
  const declaration = source.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!declaration?.body) throw new Error(`function not found: ${name}`);
  return declaration.body;
}
function computedCallback(name) {
  const initializer = variable(name).initializer;
  need(ts.isCallExpression(initializer), `${name} must remain a computed call`);
  need(initializer.expression.getText(source) === "computed", `${name} must use computed`);
  const callback = initializer.arguments[0];
  need(ts.isArrowFunction(callback), `${name} computed must use an arrow callback`);
  return callback;
}
function unwrap(expression) {
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  return expression;
}
function flattenAnd(expression) {
  expression = unwrap(expression);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return [...flattenAnd(expression.left), ...flattenAnd(expression.right)];
  }
  return [compact(expression.getText(source))];
}

const visible = computedCallback("visibleTaskCards");
need(!ts.isBlock(visible.body), "visibleTaskCards must delegate to the tested derivation helper");
need(compact(visible.body.getText(source)) === compact(`deriveHomeTaskCards(platformConfig.syncFailed, {
  homeNewcomerTasksEnabled: platformConfig.isEnabled("homeNewcomerTasksEnabled"),
  homeWeeklyPromoEnabled:
    platformConfig.isEnabled("homeWeeklyPromoEnabled") && weeklyCardReady.value,
})`), "visibleTaskCards no longer derives exact 0/1/2 state from sync failure + both flags");

const cardinality = computedCallback("hasTaskCarousel");
need(
  !ts.isBlock(cardinality.body) && compact(cardinality.body.getText(source)) === "visibleTaskCards.value.length>1",
  "carousel mode must require more than one visible card",
);

const autoplay = computedCallback("shouldAutoplay");
need(!ts.isBlock(autoplay.body), "shouldAutoplay must remain a direct boolean expression");
const autoplayTerms = flattenAnd(autoplay.body);
need(
  JSON.stringify(autoplayTerms) === JSON.stringify([
    "hasTaskCarousel.value",
    "!newcomerExpanded.value",
    "!prefersReducedMotion.value",
    "!taskFocusWithin.value",
  ]),
  `autoplay guards/operators changed: ${autoplayTerms.join(" | ")}`,
);

const touchStatements = functionBody("onTaskTouchMove").statements.map((statement) => compact(statement.getText(source)));
need(JSON.stringify(touchStatements) === JSON.stringify([
  "if(!taskTouchStart||touchCollapsedExpandedCard)return;",
  "constpoint=readFirstTouch(event);",
  "if(!point)return;",
  "constdx=point.clientX-taskTouchStart.clientX;",
  "constdy=point.clientY-taskTouchStart.clientY;",
  "if(Math.abs(dx)<18||Math.abs(dx)<=Math.abs(dy)*1.15)return;",
  "touchCollapsedExpandedCard=true;",
  "setNewcomerExpanded(false);",
  "blurTaskCarouselFocus();",
]), "touch continuation no longer performs guarded collapse + focus release in reachable order");

const manualCollapseStatements = functionBody("onNewcomerExpandedChange").statements.map((statement) => compact(statement.getText(source)));
need(JSON.stringify(manualCollapseStatements) === JSON.stringify([
  "setNewcomerExpanded(value);",
  "if(!value)blurTaskCarouselFocus();",
]), "manual newcomer collapse no longer releases carousel focus to resume autoplay");

const watcher = source.statements.find((statement) =>
  ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
  statement.expression.expression.getText(source) === "watch" &&
  statement.expression.arguments[0]?.getText(source) === "taskCardSignature"
);
need(watcher, "task-card signature watcher missing");
const watcherCallback = watcher.expression.arguments[1];
need(ts.isArrowFunction(watcherCallback) && ts.isBlock(watcherCallback.body), "task-card signature watcher must use a block callback");
const watcherStatements = watcherCallback.body.statements.map((statement) => compact(statement.getText(source)));
need(JSON.stringify(watcherStatements) === JSON.stringify([
  "taskSlide.value=0;",
  "setNewcomerExpanded(false);",
  "resetTaskTouch();",
  'taskCarouselAnnouncement.value="";',
]), "0/1/2 hot change no longer performs reachable reset in canonical order");

const template = page.match(/<template>([\s\S]*?)<\/template>/)?.[1] || "";
const templateAst = baseParse(template);
function findElement(node, predicate) {
  if (node.type === NodeTypes.ELEMENT && predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}
function attr(node, name) {
  return node.props.find((prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === name)?.value?.content;
}
function meaningfulChildren(node) {
  return node.children.filter((child) =>
    child.type !== NodeTypes.COMMENT && !(child.type === NodeTypes.TEXT && child.content.trim() === "")
  );
}
const carouselNode = findElement(templateAst, (node) => attr(node, "id") === "home-task-carousel");
need(carouselNode, "task carousel template region missing");
const carouselChildren = meaningfulChildren(carouselNode);
need(carouselChildren.length === 2 && carouselChildren[0].tag === "swiper" && carouselChildren[1].tag === "text", "carousel gained an extra visible sibling (page/control overlay)");
const swiperChildren = meaningfulChildren(carouselChildren[0]);
need(swiperChildren.length === 1 && swiperChildren[0].tag === "swiper-item", "swiper content structure changed or gained overlay content");
const itemChildren = meaningfulChildren(swiperChildren[0]);
need(itemChildren.length === 1 && itemChildren[0].tag === "view", "swiper item must contain only the task slide wrapper");
const slideChildren = meaningfulChildren(itemChildren[0]);
need(
  slideChildren.length === 2 && slideChildren[0].tag === "DayOneQuestCard" && slideChildren[1].tag === "ConversionBanner",
  "task slide gained visible content outside the two original cards",
);
const statusNode = carouselChildren[1];
need(attr(statusNode, "class") === "home-task-carousel__status" && attr(statusNode, "aria-live") === "polite", "only the hidden screen-reader status may follow swiper");
const statusChildren = meaningfulChildren(statusNode);
need(
  statusChildren.length === 1 && statusChildren[0].type === NodeTypes.INTERPOLATION && statusChildren[0].content.content === "taskCarouselAnnouncement",
  "carousel status must remain the hidden manual-change announcement only",
);
need(!/home-task-carousel__(meta|count|autoplay)/.test(page), "visible page-number or playback overlay returned");
NODE
    :
  else
    miss="${miss}relationship-gate "
    sed 's/^/        /' /tmp/home-task-carousel-relations.log
  fi
  if [ -z "$miss" ]; then ok "home task carousel contract (0/1/2 + 5s + expand pause + equal crop)";
  else bad "home task carousel contract incomplete — $miss"; fi
}
home_task_carousel_contract

# ── 值域棘轮哨兵(vibe-playbook P2-F 2026-07-22 主人批):档间字号+圆角值集,只拦增量 ──
# 基线 docs/VALUE-LADDER-BASELINE.json;新代码上阶梯(--v5-radius-* / 9 档字号),存量随尺寸迁移工程消化。
value_ladder_gate() {
  if "$NODE_BIN" scripts/value-ladder-sentinel.mjs --selftest > /tmp/uniapp-value-ladder-selftest.log 2>&1; then
    ok "value-ladder selftest(matcher 精度+棘轮方向红测)"
  else
    bad "value-ladder selftest 失败(node scripts/value-ladder-sentinel.mjs --selftest 看明细)"
    tail -4 /tmp/uniapp-value-ladder-selftest.log | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/value-ladder-sentinel.mjs > /tmp/uniapp-value-ladder.log 2>&1; then
    ok "value-ladder 档间字号/离散圆角 无增量(基线 docs/VALUE-LADDER-BASELINE.json)"
  else
    bad "value-ladder 增量违例 — node scripts/value-ladder-sentinel.mjs 看明细;新代码用 9 档字号 + var(--v5-radius-*)/阶梯值"
    tail -8 /tmp/uniapp-value-ladder.log | sed 's/^/        /'
  fi
}
value_ladder_gate

# ── token-copy 哨兵(C1 批次 2026-07-23):token 色值被抄成字面量 = 另一主题必失配 ──
# 旧的 hex 哨兵只钉 4 个色号且只认 #RRGGBB,rgba() 形式与变 alpha 副本全在盲区
# (purchase-ticker 注释曾自陈「特意挪值以免触发哨兵」= 被绕过的实证)。
# 本门:亮暗异值 token 全量 × hex 3/6/8 位 + rgb()/rgba() × 忽略 alpha 比 RGB。
# 豁免走 docs/TOKEN-COPY-ALLOWLIST.json(reason 必填,selftest 校验)。
token_copy_gate() {
  if "$NODE_BIN" scripts/token-copy-sentinel.mjs --selftest > /tmp/uniapp-token-copy-selftest.log 2>&1; then
    ok "token-copy selftest(双向红测:hex/rgb/rgba/变alpha 阳性全中 + 真灰/注释/color-mix 全 0)"
  else
    bad "token-copy selftest 失败(哨兵失效即门失效;node scripts/token-copy-sentinel.mjs --selftest 看明细)"
    tail -6 /tmp/uniapp-token-copy-selftest.log | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/token-copy-sentinel.mjs > /tmp/uniapp-token-copy.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-token-copy.log)"
  else
    bad "token 色值字面副本 — 改 var(--token) 或 color-mix(in srgb, var(--token) N%, transparent)"
    tail -12 /tmp/uniapp-token-copy.log | sed 's/^/        /'
  fi
}
token_copy_gate

# ── 遮罩单源哨兵(C1 批次 2026-07-23):弹层遮罩底色必须走 var(--v5-bg-color-mask) ──
# 起因:清遮罩时用「值」匹配(grep 特定 rgba)只捞到 9/20,漏的 11 个写的是别的值。
# 用值找「扮演某角色的东西」必漏 —— 本门改按角色判(选择器 *-backdrop/*-mask + 内联铺满覆盖层)。
scrim_gate() {
  if "$NODE_BIN" scripts/scrim-single-source.mjs --selftest > /tmp/uniapp-scrim-selftest.log 2>&1; then
    ok "scrim selftest(双向红测:5 种字面值形态阳性全中 + token/非遮罩/注释/渐变全 0)"
  else
    bad "scrim selftest 失败(node scripts/scrim-single-source.mjs --selftest 看明细)"
    tail -6 /tmp/uniapp-scrim-selftest.log | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/scrim-single-source.mjs > /tmp/uniapp-scrim.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-scrim.log)"
  else
    bad "弹层遮罩底色未走单源 token"
    tail -10 /tmp/uniapp-scrim.log | sed 's/^/        /'
  fi
}
scrim_gate

# ── 全站层级秩序门(2026-08-04 第 2 轮审计 P1)──
# 起因:滑块人机验证 .cs-layer 从建档起就是 z-index 90,输给 toast(9000)/确认弹窗(9100)/
# 区号半屏(9001)/庆祝层(8900)。实测注册页三个操作点 elementFromPoint 全被 .cc-row 吃掉、
# 把手拖不动,而发码流程正停在它上面等解开 = 死锁。层级此前没有任何机器门:改一个数字
# tsc/verify/i18n 全绿。本门两个正交断言 —— ① 六层阶梯严格递增(解析不到=红,覆盖「删掉
# z-index」这个遍历看不见的方向);② 天花板:全站扫 z-index,白名单外不许 ≥ 滑块(阶梯只
# 遍历已知成员,新加的 9600 浮层要靠这条才看得见)。
zindex_order_gate() {
  if "$NODE_BIN" scripts/zindex-order.mjs --selftest > /tmp/uniapp-zindex-selftest.log 2>&1; then
    ok "$(grep -c '^PASS' /tmp/uniapp-zindex-selftest.log) 项 zindex-order selftest 全过(逐个相邻对隔离红测 + 事故现场 90 + 删除方向 + 天花板新成员)"
  else
    bad "zindex-order selftest 失败(node scripts/zindex-order.mjs --selftest 看明细)"
    grep -E "^FAIL" /tmp/uniapp-zindex-selftest.log | head -8 | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/zindex-order.mjs > /tmp/uniapp-zindex.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-zindex.log)"
  else
    bad "浮层层级秩序被破坏 — node scripts/zindex-order.mjs 看明细"
    tail -10 /tmp/uniapp-zindex.log | sed 's/^/        /'
  fi
}
zindex_order_gate

# ── 双主题恒定着色 · 运行时正交门(C1 批次 2026-07-23) ──
# 上面两道是静态门,只能钉「我已经想到的写法」。本批同一个坑连踩三次(按值比 token 漏变
# alpha 副本 / 按值 grep 遮罩漏 11 个 / 按值 grep 网格线漏 2 个),根因都是「用值找角色」。
# 本门换正交维度:不问源码怎么写,只问渲染出来跟不跟主题 —— 双主题 computed 完全相同
# 的有色元素即嫌疑。存量走棘轮 docs/THEME-CONSTANT-BASELINE.json,只拦新增。
theme_constant_gate() {
  if "$NODE_BIN" scripts/theme-constant-gate.mjs --selftest > /tmp/uniapp-theme-const-selftest.log 2>&1; then
    ok "theme-constant selftest(判定纯函数双向红测 + 恒定 token 放行)"
  else
    bad "theme-constant selftest 失败(node scripts/theme-constant-gate.mjs --selftest 看明细)"
    tail -6 /tmp/uniapp-theme-const-selftest.log | sed 's/^/        /'
    return
  fi
  if probe_retry /tmp/uniapp-theme-const.log "$NODE_BIN" scripts/theme-constant-gate.mjs; then
    ok "$(tail -1 /tmp/uniapp-theme-const.log)"
  else
    bad "新增「双主题恒定」着色元素 — 该元素亮/暗渲染出来一个色 = 没跟主题"
    tail -10 /tmp/uniapp-theme-const.log | sed 's/^/        /'
  fi
}
if scope_hit theme-constant-runtime; then route_scope theme-constant-runtime; theme_constant_gate; fi

# ── 零-border 铁律 · 运行时门(C2 批次 2026-07-23) ──
# 《03》§3:带 bg 填充的卡片/板块一律零 border,border 只属透明容器(分组 hairline /
# empty-state 虚线);§4:玻璃 chrome(TabBar/Header/浮层)不在此约束内。
# 同样走运行时判(C1 教训:静态 grep 只能钉想到的写法);门内建 3 条规范自带豁免。
zero_border_gate() {
  if "$NODE_BIN" scripts/zero-border-gate.mjs --selftest > /tmp/uniapp-zero-border-selftest.log 2>&1; then
    ok "zero-border selftest(双向红测:实底/tint/渐变+四边框阳性全中 + 透明底/虚线/chrome/隔离环全 0)"
  else
    bad "zero-border selftest 失败(node scripts/zero-border-gate.mjs --selftest 看明细)"
    tail -6 /tmp/uniapp-zero-border-selftest.log | sed 's/^/        /'
    return
  fi
  if probe_retry /tmp/uniapp-zero-border.log "$NODE_BIN" scripts/zero-border-gate.mjs; then
    ok "$(tail -1 /tmp/uniapp-zero-border.log)"
  else
    bad "新增「有填充 + 四边描边」容器 — 《03》§3 层级靠 surface 微差色,不靠描边"
    tail -10 /tmp/uniapp-zero-border.log | sed 's/^/        /'
  fi
}
if scope_hit zero-border-runtime; then route_scope zero-border-runtime; zero_border_gate; fi

# ── DOM-QA 体检哨兵(vibe-playbook P1-A 2026-07-22 主人批):5 探针事实层 ──
# ① 横向溢出 ② 文字<10px(10-12 普查不 gate) ③ tap<44pt ④ img broken ⑤ 按钮无可达名。
# 存量黄灯 = docs/DOM-QA-LEDGER.json;gate 只拦 ledger 外新指纹(新页/改动页硬门)。
# 豁免 = 人工审阅后 --update-ledger 收编 + entry 写 qaOk 理由。selftest = 哨兵自身双向红测。
dom_qa_gate() {
  if probe_retry /tmp/uniapp-dom-qa-selftest.log "$NODE_BIN" scripts/dom-qa.mjs --selftest; then
    ok "dom-qa selftest(双向红测:5 类阳性全中 + 干净 fixture 0)"
  else
    bad "dom-qa selftest 失败(探针失效即门失效;node scripts/dom-qa.mjs --selftest 看明细)"
    tail -5 /tmp/uniapp-dom-qa-selftest.log | sed 's/^/        /'
    return
  fi
  if probe_retry /tmp/uniapp-dom-qa.log "$NODE_BIN" scripts/dom-qa.mjs --sweep core; then
    ok "dom-qa core(5 tab)无新 DOM 违例(存量黄灯见 docs/DOM-QA-LEDGER.json)"
  else
    bad "dom-qa 新 DOM 违例 — node scripts/dom-qa.mjs --sweep core 看明细;确属合法例外 → --update-ledger 收编并写 qaOk 理由"
    tail -12 /tmp/uniapp-dom-qa.log | sed 's/^/        /'
  fi
}
if scope_hit dom-qa-runtime; then route_scope dom-qa-runtime; dom_qa_gate; fi

# ── tap 目标哨兵(C3 2026-07-23):热区 ≥44pt + 按下有可感知反馈 ──
# 与 dom-qa 的 tap 探针**互补不重复**:dom-qa 靠「交互标签/role + cursor:pointer」找候选,
# 而 uni-app 的 <view @click> 编译成 <uni-view> 且不带 cursor:pointer —— 那条路对本工程系统性漏检。
# 本哨兵在页面脚本前 hook addEventListener,拿的是运行时真注册了 click 的元素;
# 反馈判定走 CDP CSS.forcePseudoState 实测(不是 grep class,声明了但被 inline style 压掉的会被抓出来)。
# 存量黄灯 = docs/TAP-FEEDBACK-LEDGER.json;豁免 = --update-ledger 收编 + entry 写 tapOk 理由。
tap_feedback_gate() {
  if scope_hit tap-feedback-runtime; then route_scope tap-feedback-runtime
  if probe_retry /tmp/uniapp-tap-selftest.log "$NODE_BIN" scripts/tap-feedback-probe.mjs --selftest; then
    ok "tap-feedback selftest(双向红测:尺寸/反馈阳性全中 + 过渡·祖先链·不可点三类假阳 0)"
  else
    bad "tap-feedback selftest 失败(探针失效即门失效;node scripts/tap-feedback-probe.mjs --selftest 看明细)"
    tail -6 /tmp/uniapp-tap-selftest.log | sed 's/^/        /'
    return
  fi
  if probe_retry /tmp/uniapp-tap.log "$NODE_BIN" scripts/tap-feedback-probe.mjs; then
    ok "$(tail -1 /tmp/uniapp-tap.log)"
  else
    bad "tap 目标新违例 — node scripts/tap-feedback-probe.mjs 看明细;热区补到 44 或按《08》§2 加 active 反馈,确属豁免 → --update-ledger 收编并写 tapOk 理由"
    tail -12 /tmp/uniapp-tap.log | sed 's/^/        /'
  fi
  fi
  # 孤字断行探针(包 zk 2026-08-15):三语 × 钱链路 5 路由 @375px,CJK 正文末行不得只剩一两个字。
  # 静态门测不出排版结果(同句 390px 不断、375px 断出「些。」),必须真渲染;先跑双向 selftest。
  if scope_hit orphan-line-runtime; then route_scope orphan-line-runtime
  if probe_retry /tmp/uniapp-orphan-selftest.log "$NODE_BIN" scripts/orphan-line-probe.mjs --selftest; then
    ok "orphan-line selftest(双向红测:CJK 孤字必中 · en 单词尾行不误报 · 干净 0)"
  else
    bad "orphan-line selftest 失败(探针失效即门失效;node scripts/orphan-line-probe.mjs --selftest 看明细)"
    tail -4 /tmp/uniapp-orphan-selftest.log | sed 's/^/        /'
    return
  fi
  if probe_retry /tmp/uniapp-orphan.log "$NODE_BIN" scripts/orphan-line-probe.mjs; then
    ok "$(tail -1 /tmp/uniapp-orphan.log)"
  else
    bad "孤字断行新违例 — node scripts/orphan-line-probe.mjs 看明细;改短文案或给数字+单位原子加 nowrap"
    tail -8 /tmp/uniapp-orphan.log | sed 's/^/        /'
  fi
  fi
}
tap_feedback_gate

# ── 标签内注释哨兵(2026-07-23):HTML 注释卡在标签属性之间 = Vue 模板非法位置 ──
# vue-tsc 不报(只看类型)、浏览器多数时候也照常渲染 → 人眼与既有门双双测不到,归机器层。
tag_comment_gate() {
  if "$NODE_BIN" scripts/tag-comment-gate.mjs --selftest > /tmp/uniapp-tagcomment-selftest.log 2>&1; then
    ok "tag-comment selftest(标签内阳性中 + 标签外/子元素间假阳 0)"
  else
    bad "tag-comment selftest 失败(node scripts/tag-comment-gate.mjs --selftest 看明细)"
    tail -4 /tmp/uniapp-tagcomment-selftest.log | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/tag-comment-gate.mjs > /tmp/uniapp-tagcomment.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-tagcomment.log)"
  else
    bad "注释卡在标签属性之间 — 挪到标签外那一行"
    tail -8 /tmp/uniapp-tagcomment.log | sed 's/^/        /'
  fi
}
tag_comment_gate

# ── 卡数据信任边界(2026-07-28):明文卡号 / CVV 只许住托管组件 ──
# 产品文案向用户承诺「NexGrid 不会接触你的完整卡号」;这句话只能靠代码结构守住,
# 任何人在 hosted-card-vault 之外再写一个卡号 / CVV 输入框,承诺即变不实陈述。
# 判据认「数据绑定」不认关键词(cvvLength / cvvFocused / kind="cvv" 均放行)。
card_data_boundary_gate() {
  if "$NODE_BIN" scripts/card-data-boundary.mjs --selftest > /tmp/uniapp-cardboundary-selftest.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-cardboundary-selftest.log)"
  else
    bad "card-data-boundary selftest 失败(判据失效即门失效;node scripts/card-data-boundary.mjs --selftest 看明细)"
    tail -6 /tmp/uniapp-cardboundary-selftest.log | sed 's/^/        /'
    return
  fi
  if "$NODE_BIN" scripts/card-data-boundary.mjs > /tmp/uniapp-cardboundary.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-cardboundary.log)"
  else
    bad "明文卡字段出现在托管组件之外 — 文案承诺「不会接触你的完整卡号」会变成不实陈述"
    tail -10 /tmp/uniapp-cardboundary.log | sed 's/^/        /'
  fi
}
card_data_boundary_gate

# ── 空状态哨兵(C5 2026-07-23):《06》缺省页体系真的渲染得出来 ──
# 强制清空所有 store 的数组字段让空态显形,逐页断言:插画真加载(naturalWidth>0)+ 标题非空
# + 不溢出 + 无 console error。「接上了组件」和「空态真能显示」是两回事。
empty_state_gate() {
  if probe_retry /tmp/uniapp-empty-state.log "$NODE_BIN" scripts/empty-state-probe.mjs; then
    ok "$(tail -1 /tmp/uniapp-empty-state.log)"
  else
    bad "空状态渲染失败 — node scripts/empty-state-probe.mjs 看明细(插画路径 / 标题 key / 布局溢出)"
    grep -E "^FAIL" /tmp/uniapp-empty-state.log | head -8 | sed 's/^/        /'
  fi
}
if scope_hit empty-state-runtime; then route_scope empty-state-runtime; empty_state_gate; fi

# ── SVG 内文字运行时门(P-121,2026-08-17):字真的排出来了吗 ──
# 源码门只能证「没写错的写法」;这道门逐路由真渲染:svg text 数量 ≥ 期望 · 每个 bbox>0 · 非空 · 可见(visibility/opacity/fill 链)· 在 svg 盒内 · 文档内 · 未被祖先裁
# · svg 内 uni-text=0 · 全页 svg 元素呈现属性==计算值(attributify 劫持在这里现形)· console error 与 Vue resolve warn 0;svg 里有文字候选的文件必须登记路由(未登记即红,不静默跳过)。
svg_text_render_gate() {
  local slog="${TMPDIR:-/tmp}/uniapp-svg-text-render-selftest.$.log" glog="${TMPDIR:-/tmp}/uniapp-svg-text-render.$.log"
  if probe_retry "$slog" "$NODE_BIN" scripts/svg-text-render-probe.mjs --selftest; then
    ok "$(tail -1 "$slog")"
  else
    bad "svg-text-render selftest 失败(探针失效即门失效;node scripts/svg-text-render-probe.mjs --selftest 看明细)"
    tail -6 "$slog" | sed 's/^/        /'
    return
  fi
  if probe_retry "$glog" "$NODE_BIN" scripts/svg-text-render-probe.mjs; then
    ok "$(tail -1 "$glog")"
  else
    bad "SVG 内文字没渲染出来 / 看不见 / 呈现属性被劫持 / 新示意图未登记 —— UNI_BASE_URL=$BASE_URL node scripts/svg-text-render-probe.mjs 看明细"
    grep -E "^FAIL|^  \[" "$glog" | head -10 | sed 's/^/        /'
  fi
}
if scope_hit svg-text-runtime; then svg_text_render_gate; fi

# ── 里程碑庆祝队列门(2026-08-03):钱链路挂起 + 逐条补发 + z 层级 ──
# 三路独立走查同族缺陷:.ms-overlay 9300 盖住支付确认/宽限提示/提现表单并吞点击;
# 且 active 单槽,连跨两级门槛前一级被覆盖永久丢通知。判据(esbuild 载真 store 测行为):
# ①钱链路 4 路由 UI 挂起且 App.vue 奖励/记账不接路由门(分离证明) ②连跨两级离场
# 逐条补发先低后高 ③ .ms-overlay < .nx-toast-host < .nx-mask ④普通页即时弹 +
# 白名单前缀不过宽(pages/store/store 等近亲不误伤)。
milestone_queue_gate() {
  if "$NODE_BIN" scripts/selfcheck-milestone-queue.mjs > /tmp/uniapp-milestone-queue.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-milestone-queue.log)"
  else
    bad "里程碑庆祝队列门失败 — node scripts/selfcheck-milestone-queue.mjs 看明细"
    grep -E "^  FAIL" /tmp/uniapp-milestone-queue.log | head -8 | sed 's/^/        /'
  fi
}
milestone_queue_gate

# ── 结算页试用报价单源门(R2 P0,2026-08-04):展示与扣款同一次解析 ──
# 第一轮把时间边界收敛成 resolveTrialAt 时只收了 store 内部,没收 checkout.vue
# 这个消费者:该页一半读未推进的原始 status(模式/促销/抵扣),一半读实时解析器
# (liveShadow*)——宽限期刚过、poll 未到的窗口里两边互斥,net 被拼成报价页从未
# 展示过的数字直接扣款。判据(esbuild 载真实现 + 源码切片跑真结算块):
# ①越界拒单零扣款 ②grace 内正常成交 ③$0 路径同样受守卫 ④展示净额==扣款净额
# ⑤convert 返回 false 零扣款零建单 + 接线门(摘掉任一守卫即红)。
checkout_trial_quote_gate() {
  if "$NODE_BIN" scripts/selfcheck-checkout-trial-quote.mjs > /tmp/uniapp-checkout-trial-quote.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-checkout-trial-quote.log)"
  else
    bad "结算页试用报价单源门失败 — node scripts/selfcheck-checkout-trial-quote.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-checkout-trial-quote.log | head -8 | sed 's/^/        /'
  fi
}
checkout_trial_quote_gate

# ── 兑换成交快照 + 创世购买重入守卫门(存量 2×P1,2026-08-04)──
# 两条同族缺陷:动钱的入口没有重入守卫、跨 await 读活值。兑换页确认后 900ms 内
# 汇率自己跳/用户翻方向改金额,实际成交 ≠ 用户确认的那笔,且额度只按确认那一刻校验
# 过一次(改大金额即绕过每日额度);创世半屏 emitClose 异步生效,双击扣两笔铸两份。
# 判据(抠正主函数原文注入执行,不抄判据副本):①确认后汇率变动→拒单零成交
# ②确认后方向/金额被改→按快照成交 ③连点三次只成交一次 ④创世三击只扣一次
# (含失败路径必解锁的反向靶) ⑤正常路径不受影响 + 结构纪律(快照冻在首个 await 前 /
# 复验拿当前权威值 / 守卫非模块级 / 按钮 disabled 派生)。
exchange_genesis_guard_gate() {
  if "$NODE_BIN" scripts/selfcheck-exchange-genesis-guard.mjs > /tmp/uniapp-exchange-genesis-guard.log 2>&1; then
    ok "$(tail -1 /tmp/uniapp-exchange-genesis-guard.log)"
  else
    bad "兑换/创世重入守卫门失败 — node scripts/selfcheck-exchange-genesis-guard.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-exchange-genesis-guard.log | head -8 | sed 's/^/        /'
  fi
}
exchange_genesis_guard_gate

# ── 质押持仓乐观并发门(存量 P1,2026-08-04):跨标签页竞态双记账 ──
# earlyWithdraw / claim 原是裸 find→map→persist,persist 走纯覆盖式 writeAccountRow,
# 全仓又没有 storage 事件重新水合持仓 —— H5 端 uni storage 就是 localStorage,两个标签页
# 只要都打开过质押页,状态就**永久不同步**;同一笔仓位被两边各领一次,而 usdtBalance 是
# ADDITIVE_NUMBER_KEYS(按增量三路合并)→ 两次入账都记 = 真·双花。判据(esbuild 载真
# store + 真 storage 层跑真代码,两个 store 实例 = 两个标签页共享一份序列化 storage):
# ①陈旧标签页重复领取被拒、余额只增加一次 ①b 读与写之间被插队同样拦得住(rev CAS)
# ②单标签页正常路径不受影响 ③版本冲突与「本来就不该成交」返回值可区分 ④不传版本的老
# 调用方(28 处在用)行为逐项不变 + 爆炸半径只有 staking ⑤建仓冲突重放不丢仓、id 不重号
# ⑥接线门(判定对不对 / 有没有被接上是两道门)。
staking_cas_gate() {
  if "$NODE_BIN" scripts/selfcheck-staking-cas.mjs > /tmp/uniapp-staking-cas.log 2>&1; then
    ok "质押持仓乐观并发门 — $(tail -1 /tmp/uniapp-staking-cas.log)"
  else
    bad "质押持仓乐观并发门失败 — node scripts/selfcheck-staking-cas.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-staking-cas.log | head -8 | sed 's/^/        /'
  fi
}
staking_cas_gate

# ── 资金 ⊗ 收据门(R4 缺陷族,2026-08-04):「钱动了、账没记上」──
# 落盘失败在这一层是**静默**的:account-cloud 写不进去只是 persisted:false,bills.add
# 写不进去只是 return null,两者都不抛异常;调用方却一律按「一定成功」继续铸货、弹成功。
# 实测四处同型(app.ts 四个资金原语丢弃 persist 结果 + 创世购买 / 结算 / 复投丢弃 bills.add
# 返回值),最惨一格是近 $15k 已扣、席位已铸、弹「购买成功」,账单页查无此单。根治 = 一条
# 不变量 + 一个收口点 src/lib/money-receipt.ts(收据即指令,不写收据就动不了钱)。判据
# (esbuild 载真 store + 真收口点跑真代码,假 storage 按 key 定点注入写失败):
# ①资金原语落盘失败→返回 false 且内存不脏 ②bills 写失败→整笔回滚 + 报失败(含反向病症
# 「账记了钱没动」) ③退款把 withdrawableUsdt 还原到扣款前(带裸 creditBalance 负控)
# ④成功路径逐项等价(金额/舍入/clamp/守卫拒绝) ⑤接线门 + 3 语 i18n ⑥迁移棘轮:
# 仍在裸调 bills 写入的存量点只许减不许增 ⑦多腿交易(兑换一进一出)原子性:两条分录
# 一次落盘(数写盘次数),任一环失败 → 两腿资金一起还原、账上零残留(不许只剩一条)。
money_receipt_gate() {
  if "$NODE_BIN" scripts/selfcheck-money-receipt.mjs > /tmp/uniapp-money-receipt.log 2>&1; then
    ok "资金 ⊗ 收据门 — $(tail -1 /tmp/uniapp-money-receipt.log)"
  else
    bad "资金 ⊗ 收据门失败 — node scripts/selfcheck-money-receipt.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-money-receipt.log | head -8 | sed 's/^/        /'
  fi
}
money_receipt_gate

# ── 本地建单权威门(2026-08-11):远端模式下页面不许自己造订单行 ──
# 履约推进已归服务端(store/orders.ts 的 advanceOrder 有闸),但**建单**这一步的闸分散在
# 各购买入口的 SFC 里,store 侧收不了口:createOrder 的返回值在 checkout 那条路上被立刻
# 消费(ord.id),且调用点已越过两步不可逆动作(试用转正 / 旧机下架)——把它改成可空返回,
# 回滚面是残的,比它要防的毛病更险。故这道门守**调用侧的结构不变量**:任何写本地订单行的
# 页面,必须在建单**之前**先判 API 模式。新增购买入口若忘了判,这里立刻报红,而不是等到
# 线上「钱扣了、单子永远停在已支付、机器一台不来」。
# 判据抽成独立函数:真扫与红测自证**共用同一份代码**。分两份写的话,红测验的就不是
# 真判据,自证等于没证。无违规则不输出,有则输出原因。
_loa_violation() {
  local f="$1" co_line guard_line
  co_line=$(grep -nE "orders\.createOrder\(" "$f" | head -1 | cut -d: -f1)
  [ -z "$co_line" ] && return 0
  # 🔴 必须排掉 import 行:它永远在文件顶部,拿它当「判过了」会让位置判据恒真 ——
  #    红测实证(把真正那道闸挪到建单之后)门照样报绿,即假绿。下面形态 B 就守这一点。
  guard_line=$(grep -nE "remoteApiEnabled" "$f" | grep -vE "^[0-9]+:\s*import\b" | head -1 | cut -d: -f1)
  if [ -z "$guard_line" ]; then
    echo "写本地订单行却全文没判 API 模式 — 远端模式下会造出服务端不认的单"
  elif [ "$guard_line" -gt "$co_line" ]; then
    echo "API 模式判断(行 $guard_line)排在建单(行 $co_line)之后 — 挡不住"
  fi
}

local_order_authority_gate() {
  local violations=0 f why tmp red
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    why=$(_loa_violation "$f")
    if [ -n "$why" ]; then
      bad "本地建单权威门:$f $why"
      violations=$((violations + 1))
    fi
  done < <(grep -rlE "orders\.createOrder\(" src/pages/ src/components/ --include=*.vue 2>/dev/null)

  # 🔴 红测自证:两种绕过形态必须各自被判出来,否则这道门是假绿。形态 B 同时守着
  #    「import 行不算判过了」—— 若哪天判据退回取首个命中,B 会静默变绿,这里就报红。
  tmp=$(mktemp -d)
  printf 'const x = 1\norders.createOrder({})\n' > "$tmp/a.vue"
  printf 'import { remoteApiEnabled } from "@/api/runtime"\norders.createOrder({})\nif (remoteApiEnabled) return\n' > "$tmp/b.vue"
  red=0
  [ -n "$(_loa_violation "$tmp/a.vue")" ] && red=$((red + 1))
  [ -n "$(_loa_violation "$tmp/b.vue")" ] && red=$((red + 1))
  rm -rf "$tmp"
  if [ "$red" -ne 2 ]; then
    bad "本地建单权威门:红测自证 $red/2 — 判据认不出绕过形态,这道门是假绿"
    violations=$((violations + 1))
  fi

  [ "$violations" -eq 0 ] && ok "本地建单权威门 — 覆盖页均在建单前判了 API 模式(红测自证 2/2:整页不判 · 判断晚于建单)"
}
local_order_authority_gate
# ── 账单生产者门(z4,2026-08-11):渲染代码存在 ≠ 有生产者 ──
# 缘起:wallet-bills.vue 一直有整套 `type:"withdraw"` 的渲染代码(图标/配色/可点/跳追踪页),
# 但 08-10 的 remote 对齐把提现提交搬到 POST /api/withdrawals 时顺手删掉了页面里的两行
# bills 写入 —— 全仓从此没有任何代码写得出一条正常的提现账单行。剩下的唯一生产者是
# App.vue 里退还 NEX 抵扣费的**冲正**分录(+N NEX),而它要冲正的那条 −N 从没被写过。
# 后果三连:App.vue 的 settleByRef / 两段对账恒空跑;用户被日限拦住时全站没有任何页面
# 答得出「我今天提了哪几笔」;账单上只剩一条平台白送 NEX 的孤行。
# 🔴 因此判据守的是**生产者**不是渲染:出事那天渲染分支一直都在,守它等于没守。
# 判据(ground truth 全部从磁盘取,不手写清单):①BillType 全集解析自类型联合;②扫全站
# 找账单 draft,按「币种 + 方向」(USDT- / NEX+ / seed: 前缀)分类;③实测与脚本内台账
# **双向逐字相等** —— 少一族(生产者被删)红,多一族(新增未登记)也红;④渲染面与
# BillType 全集互相覆盖。细到币种+方向是红测逼出来的:只记「有没有生产者」时,删掉提现
# 主行后 NEX 抵扣腿仍撑着「有 debit 生产者」,门全绿而用户看不到自己提了多少钱。
# 改台账前先跑 `--print` 看实测(本门自己的 swap 那行凭印象手写就被实测当场证伪)。
bill_producer_gate() {
  # 🔴 先红测再判定:哨兵失效即门失效。11 条注入逐个隔离一条 token(主行删 / 不记账文件冒充 /
  # 记账文件冒充 / 多生产者只删其一 / 主行符号反 / 抵扣腿符号反 / 冲正行删 / 新类型未登记 /
  # 种子删 / 嵌套掩护 / 币种改错)+ 1 条负控(无关改动不许红)+ 样本量自校。
  # 注入锚点失配会自曝为 FAIL,不会静默当成「测过了」。
  if "$NODE_BIN" scripts/selfcheck-bill-producers.mjs --selftest > /tmp/uniapp-bill-producers-selftest.log 2>&1; then
    ok "bill-producers selftest: $(grep -Eo '[0-9]+ pass / [0-9]+ fail' /tmp/uniapp-bill-producers-selftest.log | tail -1)"
  else
    bad "bill-producers selftest 失败(哨兵失效即门失效;node scripts/selfcheck-bill-producers.mjs --selftest 看明细)"
    grep -E "^  FAIL" /tmp/uniapp-bill-producers-selftest.log | head -8 | sed 's/^/        /'
  fi
  if "$NODE_BIN" scripts/selfcheck-bill-producers.mjs > /tmp/uniapp-bill-producers.log 2>&1; then
    ok "账单生产者门 — $(tail -1 /tmp/uniapp-bill-producers.log)"
  else
    bad "账单生产者门失败 — node scripts/selfcheck-bill-producers.mjs 看明细;改了账单写入就同步台账(--print 看实测)"
    grep -E "^  FAIL" /tmp/uniapp-bill-producers.log | head -8 | sed 's/^/        /'
  fi
}
bill_producer_gate

# ── 提现账单行 runtime 门(z4 R1,2026-08-11):生产者「存在」≠「跑得到」──
# 上面那道静态门守住了「有没有代码写得出提现账单行」,但守不了可达性:`if (false)` 包起来、
# 挪进一个永不被调用的函数、或者调用点落在走不到的分支上,静态判据全绿。同一轮独立审计还
# 实测出 withdraw 那三条 token 里的 `NEX+`(抵扣费冲正行)在 remote 模式下运行期确实永不执行。
# 本门在**真页面**上把整条链跑一遍:填金额 → 开 NEX 抵扣 → 提交 → 确认 → 写账单 → 跳转,
# 只桩 withdrawalApi 两个方法(建单只认真后端,不桩一步都走不到),其余全是真代码。
# 判据:①两条同单号分录(USDT 负额在途 + NEX 负额)②共用 ts 且真落盘 ③金额取服务端回执
# (故意让回执 ≠ 页面输入)+ memoKey 走 i18n 码位 ④歧义失败零写入、原地重试沿用同一把幂等键
# 并自愈成一对 ⑤账单页渲染成可点行 ⑥零 console error。
# 该门要求 fundsServerEnabled(远端档)server:给了 REMOTE_BASE_URL 就用它;没给就自己起一台远端档隔离 server
# (verify-h5-runtime.mjs --remote-withdraw,同 H5 运行时门的隔离起服机制)—— 裸跑 verify 不再因为只有 mock 靶而必红。
withdraw_bill_runtime_gate() {
  if [ -z "${REMOTE_BASE_URL:-}" ]; then
    if probe_retry /tmp/uniapp-withdraw-bill-runtime.log "$NODE_BIN" scripts/verify-h5-runtime.mjs --remote-withdraw; then
      ok "提现账单行 runtime 门(远端档隔离起服)— $(tail -1 /tmp/uniapp-withdraw-bill-runtime.log)"
    else
      bad "提现账单行 runtime 门失败 — node scripts/verify-h5-runtime.mjs --remote-withdraw 看明细(或给 REMOTE_BASE_URL 指一台远端档 server)"
      grep -E "^  FAIL|Error" /tmp/uniapp-withdraw-bill-runtime.log | head -8 | sed 's/^/        /'
    fi
    return
  fi
  local withdraw_base_url="$REMOTE_BASE_URL"
  if probe_retry /tmp/uniapp-withdraw-bill-runtime.log env BASE_URL="$withdraw_base_url" "$NODE_BIN" scripts/withdraw-bill-runtime.mjs; then
    ok "提现账单行 runtime 门 — $(tail -1 /tmp/uniapp-withdraw-bill-runtime.log)"
  else
    bad "提现账单行 runtime 门失败 — BASE_URL=$withdraw_base_url node scripts/withdraw-bill-runtime.mjs 看明细"
    grep -E "^  FAIL" /tmp/uniapp-withdraw-bill-runtime.log | head -8 | sed 's/^/        /'
  fi
}
if scope_hit withdraw-bill-runtime; then withdraw_bill_runtime_gate; fi

# 🗑 【2026-08-13 回退】这里曾挂过「提现扣款自愈门」(scripts/withdraw-debit-selfheal-runtime.mjs)。
#    它守的实现 —— App.vue 对账里的扣款补扣格 —— 被 R1 独立审计整格否决并回退,门随之退役,
#    脚本已移入 .trash。留着门守一段不存在的代码只会绿着骗人。
#    重做时注意该门当时被审出的覆盖缺口:注入不跨拍(测不到「失败持续时补到成功为止」)、
#    13 秒墙钟落在 2~3 拍之间(同一份代码两种结论)、状态覆盖 2/11、无跑满基数下限(截断即绿)、
#    夹具继承 demo 种子而非构造。详见 docs/changes/2026-08-13-z6-audit-R1.md。

# ── 接口引用台账门(存量缺陷族,2026-08-04):注释里的接口地址与 PRD 对不上 / 纯属虚构 ──
# 实测 5 处同型:`POST /api/stakes/:id/claim`(PRD 是 /api/staking/)、`POST
# /api/genesis/purchase` 和 `POST /api/swap`(PRD 根本没这接口)、试用转化写成
# `POST /api/orders`(PRD 是 /api/trial/convert)、`POST /api/store/checkout`
# (那是页面路由不是 API)。tsc / 既有 verify 全绿也抓不到 —— 注释不参与编译。
# 判据:扫全部注释行的 /api/ 引用,对哨兵脚本内的台账逐条比对(台账不写在被查文件里,
# 否则改注释顺手改台账 = 门等于没有)。三向红:代码有台账没 / 台账有代码没 / 扫到 0 条。
endpoint_citation_gate() {
  if "$NODE_BIN" scripts/endpoint-citation-sentinel.mjs > /tmp/uniapp-endpoint-citation.log 2>&1; then
    ok "接口引用台账门 — $(tail -1 /tmp/uniapp-endpoint-citation.log)"
  else
    bad "接口引用台账门失败 — node scripts/endpoint-citation-sentinel.mjs 看明细"
    grep -E "^  [0-9]+\." /tmp/uniapp-endpoint-citation.log | head -8 | sed 's/^/        /'
  fi
}
endpoint_citation_gate

# ── P1 涉钱/配额 store 乐观并发门(存量 P1 二期,2026-08-04)──
# 质押一期把 writeAccountRowCas 立起来后,同型缺陷还留在五个 store 上:deposits(入金单
# 状态推进 + 到账入账,两端并发推进 = 同一笔充值入账两次)· voucher(同一张券各领一次)·
# nex-faucet / daily-powerup / lucky-spin(每日与一次性配额被覆盖 = 额度绕过)。
# (原第六个 withdraw-daily-count 已于 2026-08-11 随包 z2 整体删除 —— 客户端不再维护日限
# 计数器,今日笔数改由 core 从提现单列表现算,没有第二份状态自然也不需要 CAS 防覆盖。)
# H5 端 uni storage 就是
# localStorage,同源多标签页共享一份且全仓无 storage 事件重新水合 —— 状态**永久不同步**,
# 而 usdtBalance/nexBalance 是 ADDITIVE_NUMBER_KEYS(按增量三路合并)→ 两次入账都记。
# 判据(esbuild 载真 store + 真 storage 层跑真代码,两个 store 实例 = 两个标签页共享一份
# 序列化 storage;只有 deposits 的 app/bills/fx 三个跨 store 组合方换成可观测假账本):
# ①五个 store 各自的陈旧标签页重复领取被拒、余额/计数只动一次 ①b 读与写之间被插队同样
# 拦得住(rev CAS)②单标签页正常路径不受影响 ③版本冲突与「本来就不该成交」可区分
# ④writeAccountRow 逐字节没动 ⑤追加型冲突重放不丢单、主键不重号 ⑥接线门(五个 store
# 全路径走 CAS + 六处页面调用点真的读了 ok/conflict + 3 语 i18n)。
money_cas_gate() {
  if "$NODE_BIN" scripts/selfcheck-money-cas.mjs > /tmp/uniapp-money-cas.log 2>&1; then
    ok "P1 涉钱/配额乐观并发门 — $(tail -1 /tmp/uniapp-money-cas.log)"
  else
    bad "P1 涉钱/配额乐观并发门失败 — node scripts/selfcheck-money-cas.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-money-cas.log | head -8 | sed 's/^/        /'
  fi
}
money_cas_gate

# ── 提现失败路径门(包 z2 R2 结构性反思 · 族 A,2026-08-11)──
# 同一个任务里三次写下「失败时会如何如何」的注释,三次都与实际行为相反(建单后其实没落盘 /
# 跨标签页写入其实进不来 / 落盘失败其实会把刚建的单静默抹掉)。共同根因:**正常路径会跑浏览器、
# 会写固定靶,失败路径只写注释,而注释不参与执行,写什么都不会红。**
# 根治 = 失败路径的行为断言必须有一条注入该失败的测试;本门就是那条测试。
# 判据:载真 app store + 真 account-cloud + 真 storage 语义,注入写失败与刷新。
withdraw_failpaths_gate() {
  if "$NODE_BIN" scripts/selfcheck-withdraw-failpaths.mjs > /tmp/uniapp-withdraw-failpaths.log 2>&1; then
    ok "提现失败路径门 — $(tail -1 /tmp/uniapp-withdraw-failpaths.log)"
  else
    bad "提现失败路径门失败 — node scripts/selfcheck-withdraw-failpaths.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-withdraw-failpaths.log | head -8 | sed 's/^/        /'
  fi
}
withdraw_failpaths_gate

# ── 失败提现「退还已烧 NEX」冲正分录门(包 z6,2026-08-11)──
# 这一族的病形是**代码存在但链路走不到**:冲正分录一直躺在 App.vue 里,判据却锚在一个
# remote 下恒不被写、mock 下压根没有提现单的本地幂等键上 —— 任何真实配置下都不可达,
# 而「有没有这段代码」「有没有生产者」两种静态哨兵**全绿**。静态门对这一族天然瞎。
# 判据:载真 app store + 真 bills store + 真 withdrawalBillDrafts,**把 remoteApiEnabled 翻成
# true**(缺陷只在该模式下发作,共用桩默认 mock = 在本来就好使的模式里自证清白),
# 从服务端回执喂进去,断言账本另一端真的多出那一行。含负向(没退 / 字段缺失 / 退多于烧)
# 与幂等、方向判重、缺陷本体回归。红测实测 R1 删生产者 / R2 换错证据源 / R3 摘不变量 /
# R4 判据丢方向 / R5 删断言,五种改法各自判红。
withdraw_nex_refund_gate() {
  if "$NODE_BIN" scripts/selfcheck-withdraw-nex-refund.mjs > /tmp/uniapp-withdraw-nex-refund.log 2>&1; then
    ok "失败提现退还 NEX 冲正门 — $(tail -1 /tmp/uniapp-withdraw-nex-refund.log)"
  else
    bad "失败提现退还 NEX 冲正门失败 — node scripts/selfcheck-withdraw-nex-refund.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-withdraw-nex-refund.log | head -8 | sed 's/^/        /'
  fi
}
withdraw_nex_refund_gate

# 提现单合并的两条修法并存门(2026-08-12 包 z8 并入主线时立)。主线修「同档位赢家通吃丢字段」,
# 包 z8 修「退款事实随整对象被淘汰 + 金额与时刻须整对同源」—— 二者在同一个函数上,
# 二选一都会丢一半。本门只证**两条同时生效**,不重复各自的单侧断言。
# 红测实测三种拆法各自判红:A 调用点不过 applyRefundEvidence(5 红)/ B 同档位改回整行择一(1 红)/
# C 金额与时刻拆开各取(1 红)。C 是第一版靶漏掉的覆盖洞,由红测本身抓出后补的。
withdrawal_merge_union_gate() {
  if "$NODE_BIN" scripts/selfcheck-withdrawal-merge-union.mjs > /tmp/uniapp-withdrawal-merge-union.log 2>&1; then
    ok "提现单合并两修法并存门 — $(tail -1 /tmp/uniapp-withdrawal-merge-union.log)"
  else
    bad "提现单合并两修法并存门失败 — node scripts/selfcheck-withdrawal-merge-union.mjs 看明细"
    grep -E "^(FAIL|  FAIL|union-probe FAIL)" /tmp/uniapp-withdrawal-merge-union.log | head -8 | sed "s/^/        /"
  fi
}
withdrawal_merge_union_gate

# 冲突标记哨兵(2026-08-12 立,同一会话内连犯两次后焊):`git add` 对 UU 文件的语义是
# 「标记为已解决」,于是 <<<<<<< / >>>>>>> 会原样进提交。实际发生过 3 个文件带标记入库,
# 其中一个是门脚本本身(里面那根针钉的符号名已经不存在了 —— 假绿)。
# tsc 看不到 .md/.mjs,契约登记门只扫 *.test.mjs,这一族此前天然无人看管。
# 判据构造性:扫全部被 git 跟踪的文本文件,不维护类型清单;候选集塌了本门自己判红(已红测)。

# 提现失败分诊的**重放感知**门(2026-08-12 立,两路独立审计各自点名同一根因)。
# 守:重放路径上只有「成功」与「409」算定局,其余一律保留幂等键 —— 401/429/地区策略
# 都是边缘层拒绝,排在服务端幂等查询之前,对「上一次落没落库」零信息量;
# 拿它们退役键 ⇒ 下次新键 ⇒ 服务端出第二笔。
# 红测:A 去掉「确定拒绝」档的 !isReplay → 红;B 日限档改回无条件退役 → 红;
#       C 给 409 档也加 !isReplay → 红;D 删掉抠段锚点 → 判据自失效判红。
withdraw_replay_triage_gate() {
  if "$NODE_BIN" scripts/selfcheck-withdraw-replay-triage.mjs > /tmp/uniapp-replay-triage.log 2>&1; then
    ok "提现分诊重放感知门 — $(tail -1 /tmp/uniapp-replay-triage.log)"
  else
    bad "提现分诊重放感知门失败 — node scripts/selfcheck-withdraw-replay-triage.mjs 看明细"
    grep -E "^(FAIL|  FAIL|AssertionError)" /tmp/uniapp-replay-triage.log | head -8 | sed "s/^/        /"
  fi
}
withdraw_replay_triage_gate

# 提现分诊**数据流**门(2026-08-13 结构性反思的产物)。同型缺陷连两轮复发后换层:
# 前两版都是静态判据(形状 / 字符串),守得住「代码长什么样」,守不住「运行时什么值流到哪」。
# 本门把 catch 段真源码**跑起来**(注入桩),断言喂给判决的上下文与实际副作用次数。
# 红测:页面谎报 isReplay/isDailyLimit/isGeo → 全红;拿掉日限线型守卫 → 红;
#       结果未知也退役 → 红;409 档早退绕过退役 → 红。
withdraw_triage_dataflow_gate() {
  if "$NODE_BIN" scripts/selfcheck-withdraw-triage-dataflow.mjs > /tmp/uniapp-triage-dataflow.log 2>&1; then
    ok "提现分诊数据流门 — $(tail -1 /tmp/uniapp-triage-dataflow.log)"
  else
    bad "提现分诊数据流门失败 — node scripts/selfcheck-withdraw-triage-dataflow.mjs 看明细"
    grep -E "^(FAIL|  FAIL|AssertionError)" /tmp/uniapp-triage-dataflow.log | head -8 | sed "s/^/        /"
  fi
}
withdraw_triage_dataflow_gate

# ── 冲正(回滚)自身门(R5 五项,2026-08-04)——「回滚失败被静默」+「回滚凭空造钱」──
# R4 根治「资金变更的落盘失败被静默忽略」,R5 在**回滚这一层**发现同型:① stake() 的存储
# 异常分支把仓位只塞内存并报成功(同一函数体 4 行后的注释正写明这么做刷新即人间蒸发),
# ② 收口点两处 restoreMoney 的返回值没人接 —— 回滚自己失败时用户看到的仍是「余额没有变化」
# 而钱已经扣了,③ 结算页把不可逆的 convert() 排在扣款之前(扣款的落盘失败路径预检堵不住,
# 试用被烧掉且不可恢复),⑤ restoreMoney 写绝对值,而合并层按增量合并 —— 两个标签页各扣
# $30 各回滚一次,余额从 $100 变 $130(凭空造钱)。判据(esbuild 载真 store + 真收口点跑真
# 代码,假 storage 按 key/第几次写定点注入失败;⑤ 用两个 store 实例 = 两个标签页共享一份
# 序列化 storage —— 单实例跑一遍这条永远测不出来):
# ①存储异常 → ok=false/conflict=false、内存与磁盘都没有这笔(+撤掉注入的反向靶)
# ②回滚失败 → stuck + 交易号 + 待对账队列 + 不再弹通用文案(带「回滚成功仍走通用文案」负控)
# ②b 无事可回滚时不许误报"钱卡住了" ⑤两标签页各扣各回滚,磁盘回到 $100(+单页负控)
# ⑥接线门(两处回滚返回值真被消费 / stake 分支真删了内存兜底 / 两个页面按归因分文案 /
# 结算页 convert 真排在扣款之后)⑦三语文案真解析取值、互不相同、正文含 {id}。
money_rollback_gate() {
  if "$NODE_BIN" scripts/selfcheck-money-rollback.mjs > /tmp/uniapp-money-rollback.log 2>&1; then
    ok "冲正(回滚)自身门 — $(tail -1 /tmp/uniapp-money-rollback.log)"
  else
    bad "冲正(回滚)自身门失败 — node scripts/selfcheck-money-rollback.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-money-rollback.log | head -8 | sed 's/^/        /'
  fi
}
money_rollback_gate

# ── 在途入金单「刷新后必须继续推进」门(2026-08-04 对抗审计)──────────────────
# `scheduleConfirmations` 全仓只在**首次探测到入金时**调用一次,而推进靠内存里的 setTimeout;
# 重绑账号(= 刷新 / 重新登录)只收敛了意向单,链上入金记录一直没人管 —— 于是用户刷新一次,
# 停在 detected|confirming 的单永久失联,页面「确认中」转到天荒地老、钱不入账。
# 这条不需要任何落盘失败就能触发,是每天都会发生的正常操作。
# 判据:① bindAccount 真调 syncChainDeposits ② 只重排 detected|confirming、终态与 dust_hold 不重排
# ③ 已有定时器不重复武装(双推进)④ 推进链路三处落盘失败必须 queue 重排而不是就地放弃
#    (定时器在 step 开头已无条件 delete —— 这个前提本身也是一条断言,它变了上面三条要重新论证)
# 外加红测自证:摘掉判据的目标串,对应断言必须转 false(不许空转)。
deposit_resume_gate() {
  if "$NODE_BIN" scripts/selfcheck-deposit-resume.mjs > /tmp/uniapp-deposit-resume.log 2>&1; then
    ok "在途入金续推门 — $(tail -1 /tmp/uniapp-deposit-resume.log)"
  else
    bad "在途入金续推门失败 — node scripts/selfcheck-deposit-resume.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-deposit-resume.log | head -8 | sed 's/^/        /'
  fi
}
deposit_resume_gate

# ── 领奖族「发钱可重放 · 资格只消费一次」门(2026-08-04 对抗审计)────────────────
# 领奖要同时满足两件互斥的事:资格只能消费一次(防重复领),奖必须发到(不能领了没发)。
# 两种顺序各有一个失效面 —— 先消费资格则发钱失败时奖归零(5 处旧实况);先发钱则消费失败时
# 下一拍再发一次(里程碑那处旧实况,平台重复出钱)。收口点加幂等出口 postMoneyBillsOnce
# 按 ref 判重后,「先发钱后消费」就没有失效面了。
# 判据:① 同 ref 重放不动钱不写第二条且返回 ok(带「换 ref 照常发」的反向靶)
#      ② 首次路径与 postMoneyBills 等价 ③ 空 ref 直接抛错(不静默降级成假幂等)
#      ④ 5 个调用点的 ref 全部稳定(带时间戳 = 判重永不命中) ⑤ 顺序门 + 反不过来那两处的自愈门
deposit_claim_idem_gate() {
  if "$NODE_BIN" scripts/selfcheck-claim-idempotency.mjs > /tmp/uniapp-claim-idem.log 2>&1; then
    ok "领奖幂等门 — $(tail -1 /tmp/uniapp-claim-idem.log)"
  else
    bad "领奖幂等门失败 — node scripts/selfcheck-claim-idempotency.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-claim-idem.log | head -8 | sed 's/^/        /'
  fi
}
deposit_claim_idem_gate

# ── 账户快照三处字面量字段集一致门(2026-08-04 完全版 A 改动③ 的安全网)──────────
# AccountCloudSnapshot 的字段由**三个各自独立的对象字面量**构造(mergeAccountSnapshots 的
# 返回值 / persistAccountSnapshot 拼的快照 / createSeedSnapshot 的种子),加字段必须同时改三处:
#   漏 merge → 每次合并**静默抹掉**该字段,且只在 base&&latest 都在时才走合并,首写看起来正常;
#   漏 persist → 每次落盘写出 undefined;漏 seed → 新账号该字段归属未定义。
# 这三处**没有任何类型检查能兜住**:TS 只管返回类型,而两处都是「先取出再拼回」的写法,
# 少一个字段照样过编译。判据判**集合**不判成员 —— 判成员的话每加一个字段就要记得加一条判据,
# 而「忘了加」正是本门要防的那件事。外加与类型声明对齐 + 判据红测自证。
snapshot_literals_gate() {
  if "$NODE_BIN" scripts/selfcheck-snapshot-literals.mjs > /tmp/uniapp-snap-literals.log 2>&1; then
    ok "快照字面量一致门 — $(tail -1 /tmp/uniapp-snap-literals.log)"
  else
    bad "快照字面量一致门失败 — node scripts/selfcheck-snapshot-literals.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-snap-literals.log | head -8 | sed 's/^/        /'
  fi
}
snapshot_literals_gate

# ── 账户快照必须无条件写盘 ────────────────────────────────────────────────────
# 2026-08-05:曾在写盘路径上加过「内容没变就跳过」的脏检查,写盘次数 60→40 看着是赚的。
# 真浏览器实测把它推翻:setItem 105KB 只要 102µs,跳一次只省 ~177µs 且只有 1/3 的拍能跳
# (折合 59µs),而判据本身每拍要 1126µs —— **花掉的是省下的约 19 倍**,tick 净慢 ~70%。
# 独立证伪另查出:跳过写会连内存新值一起回退,且判据的安全性压在两条没写下来的不变量上
# (红测把 todayEarnings 塞进排除名单 → 钱当场少算,当时全部哨兵照样绿)。
# 本门拦的不是「跳过写一定错」,而是「没量就凭直觉再走一遍这个方向」。
snapshot_write_gate() {
  if "$NODE_BIN" scripts/selfcheck-snapshot-write.mjs > /tmp/uniapp-snap-write.log 2>&1; then
    ok "快照无条件写盘门 — $(tail -1 /tmp/uniapp-snap-write.log)"
  else
    bad "快照无条件写盘门失败 — node scripts/selfcheck-snapshot-write.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-snap-write.log | head -8 | sed 's/^/        /'
  fi
}
snapshot_write_gate

# ── 首页「你的排名」派生的行为门(FEAT-HOME02)──────────────────────────────
# 守规格里三条**对用户的承诺**,不是实现细节:
#   ① 加算力名次只前进不倒退 ② 零算力不编造名次(「未上榜」与「算不出来」不合并)
#   ③ 同输入必同输出(禁随机,刷新不跳动)
# ① 的地基是分位表单调性,所以门拒收非单调表不是洁癖 —— 表一非单调,承诺①当场失效
# 而界面毫无察觉(名次会随算力上升往后掉)。
network_rank_gate() {
  if "$NODE_BIN" scripts/selfcheck-network-rank.mjs > /tmp/uniapp-net-rank.log 2>&1; then
    ok "排名派生行为门 — $(tail -1 /tmp/uniapp-net-rank.log)"
  else
    bad "排名派生行为门失败 — node scripts/selfcheck-network-rank.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-net-rank.log | head -8 | sed 's/^/        /'
  fi
}
network_rank_gate

# ── 排名入参「总有效算力」聚合门(FEAT-HOME02 ③)──────────────────────────────
# 排名函数再对,喂进去的算力错了照样全错。这道门守聚合本身:
#   ① 多台求和(不是只取一台/取平均) ② 未激活不计 ③ 不在产不计、无设备为数字 0
#      —— 参照系 = settleDevice 的不结算清单,实际 **5 条**(未激活 / 非 online /
#      cloud-share / pausedReason / 手机未充电或无 WiFi);排名只取其中 3 条,cloud-share
#      (收益另路、算力在网)与手机不充电(结算给 0、排名照算打折正数,与设备卡显示
#      自洽,展示≠结算)是刻意取舍,别当 bug 修回去。**心跳过期不等于不在产**(H5 上的
#      手机照样按 hosted 档计息,排名判它 0 就是对着一个正在赚钱的用户说「未上榜」)。
#   ④ 口径复用 + 独立锚 —— 手机必须等于 computeLiveHashpower 的输出;非手机必须等于
#      设备自己那行 GPU 规格串解出的 TOPS,期望值写死成字面数字(拿被测函数算期望值
#      是自指判据,天花板整体 ×2 也照样全绿,已实测)。
#   ⑤ GPU 档位单源 —— 排名算力必须读运营可配的档位表(cfg.config.computeShare.gpuTiers
#      穿参进聚合链):行为靶「改一档 tops / 加识别词 → 聚合跟着变」+ 源码哨兵
#      (account-hashrate.ts 出现 GPU_TIERS 字样或 matchGpuTier 单参调用即红)。
#   ⑥ 8 档参考舰队名次固定靶 —— 真种子分位表(已扩到 53,000 TOPS)下,只手机→10 台
#      机架 8 档舰队名次互不相同且随算力严格前进;超表顶封顶不出「第 1 名」。
# 外加时间不变:同一批设备跨时刻必须**全等**,同一台设备持有 1 天与 400 天也必须全等 ——
#   展示用抖动流进排名会每秒抖;任务量递减(算力恒定,降的是接单量)流进排名,
#   会让用户什么都不做名次也往后掉。
account_hashrate_gate() {
  if "$NODE_BIN" scripts/selfcheck-account-hashrate.mjs > /tmp/uniapp-acct-hash.log 2>&1; then
    ok "总有效算力聚合门 — $(tail -1 /tmp/uniapp-acct-hash.log)"
  else
    bad "总有效算力聚合门失败 — node scripts/selfcheck-account-hashrate.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-acct-hash.log | head -8 | sed 's/^/        /'
  fi
}
account_hashrate_gate

# ── 门的门:机器门固定靶完整性(2026-08-05 包 G 结构性反思)────────────────────
# 修复轮自伤 44%,「门假绿」两轮 8 条,共同根因 = 手写闭集 × 开放集合(加一个 SKU,
# 旧门照样全绿放行;pc-gpu 整条判 0 仍 57 pass;语言豁免不带语言维)。本门扫全部门脚本:
# 机型引用集必须等于「全集 / 递减豁免集 / 其补集」之一(全集从真模块导出派生,SKU 一变大
# 所有涉机型的门当场红);点名语言文件必须三语齐点;例外台账逐条带理由且 0 命中即红。
gate_targets_meta() {
  if "$NODE_BIN" scripts/selfcheck-gate-targets.mjs > /tmp/uniapp-gate-targets.log 2>&1; then
    ok "门的门(靶完整性)— $(tail -1 /tmp/uniapp-gate-targets.log)"
  else
    bad "门的门(靶完整性)失败 — node scripts/selfcheck-gate-targets.mjs 看明细"
    grep -E "^  FAIL" /tmp/uniapp-gate-targets.log | head -8 | sed 's/^/        /'
  fi
}
gate_targets_meta

# ── 创世购买可用性「单一派生」门(FEAT-GEN10 ④)────────────────────────────────
# 被一次独立验收逼出来的:此前 composable 注释里写着这个文件名,而文件根本不存在 ——
# 一个凭空的安全感,同轮验收抓到的 4 条缺陷全是这条不变量失守的样本。
# 守两件事:① 优先级链对不对(行为验证,不读源码顺序)② 有没有人绕过它自判(结构验证)。
genesis_gate() {
  if "$NODE_BIN" scripts/selfcheck-genesis-gate.mjs > /tmp/uniapp-gen-gate.log 2>&1; then
    ok "创世单一派生门 — $(tail -1 /tmp/uniapp-gen-gate.log)"
  else
    bad "创世单一派生门失败 — node scripts/selfcheck-genesis-gate.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-gen-gate.log | head -8 | sed 's/^/        /'
  fi
}
genesis_gate

# ── 周任务 × 创世闸的观测门(2026-08-13)────────────────────────────────────────
# 接手 GEN10 门里那句交底:周任务改服务端下发后,「关闭态不派买创世」这条不变量
# 在客户端**没有门守着**了。客户端不做过滤(questCode 是后台手输自由文本,猜错会藏掉
# 用户已挣到的 CLAIMABLE 奖励,比它想防的问题更坏)—— 过滤归派发端(交接书 U-16),
# 客户端只留报警,并焊住「任务面新增跳创世入口必须问闸」这条反向钉。
quest_genesis_tripwire_gate() {
  if "$NODE_BIN" scripts/selfcheck-quest-genesis-tripwire.mjs > /tmp/uniapp-quest-genesis-tripwire.log 2>&1; then
    ok "周任务创世观测门 — $(tail -1 /tmp/uniapp-quest-genesis-tripwire.log)"
  else
    bad "周任务创世观测门失败 — node scripts/selfcheck-quest-genesis-tripwire.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-quest-genesis-tripwire.log | head -8 | sed 's/^/        /'
  fi
}
quest_genesis_tripwire_gate

# ── 守卫存活性门(2026-08-07 · 守卫存活性族第三次复发后的结构根治)──────────────
# 不变量:周期性权限守卫是**安全装置不是业务循环**,只随前台/后台成对开关。
# 前两轮只修「武装侧」(读取口归一 / onShow 无条件启动),没人动「解除武装侧」——
# stopQuestWatch() 藏在 stopBusinessLoops() 里显得天经地义,于是每一处「本页不该跑业务」
# 都会顺手关掉全站唯一的周期守卫;H5 的 App 级 onShow 不随应用内跳转触发 = 关了就没得再开。
# 本门守四条不变量,并每次运行对内存副本做四组缺陷注入自证判据还活着(判据死了也判红)。
guard_liveness_gate() {
  if "$NODE_BIN" scripts/selfcheck-guard-liveness.mjs > /tmp/uniapp-guard-liveness.log 2>&1; then
    ok "守卫存活性门 — $(tail -1 /tmp/uniapp-guard-liveness.log)"
  else
    bad "守卫存活性门失败 — node scripts/selfcheck-guard-liveness.mjs 看明细"
    grep -E "^(FAIL|  FAIL)" /tmp/uniapp-guard-liveness.log | head -8 | sed 's/^/        /'
  fi
}
guard_liveness_gate

# ── 探针覆盖与路由归一化门(2026-08-08 · P-080 同族根治)──────────────────────
# 所有直接读 DOM 的脚本必须绕过 device-shell；视觉/DOM/鉴权探针零覆盖、崩溃或
# 预期路由不符一律判红。权限白名单使用的路由在比较前折叠 dot segments。
probe_safety_gate() {
  if "$NODE_BIN" --test scripts/probe-safety-contract.test.mjs scripts/static-review-routes.test.mjs > /tmp/uniapp-probe-safety.log 2>&1; then
    ok "探针覆盖与路由归一化门 — $(grep -E '^ℹ pass ' /tmp/uniapp-probe-safety.log | tail -1)"
  else
    bad "探针覆盖与路由归一化门失败 — npm run test:probe-safety 看明细"
    tail -16 /tmp/uniapp-probe-safety.log | sed 's/^/        /'
  fi
}
probe_safety_gate

# ── 业务循环存活性门(2026-08-08 · 守卫存活性同根因第三条腿)────────────────────
# 静态评审页必须停业务，但 H5 站内返回业务页不会重发 App.onShow；由常驻守卫
# 重新鉴权并经唯一集中出口幂等恢复。门内含十一组撤回/漏接/孤儿/递归 interval/timeout 变异红测。
business_loop_liveness_gate() {
  if "$NODE_BIN" scripts/selfcheck-business-loop-liveness.mjs > /tmp/uniapp-business-loop-liveness.log 2>&1; then
    ok "业务循环存活性门 — $(tail -1 /tmp/uniapp-business-loop-liveness.log)"
  else
    bad "业务循环存活性门失败 — node scripts/selfcheck-business-loop-liveness.mjs 看明细"
    grep -E "^(FAIL|  FAIL)|AssertionError" /tmp/uniapp-business-loop-liveness.log | head -8 | sed 's/^/        /'
  fi
}
business_loop_liveness_gate

# ── Janus C2 停机取消门 ────────────────────────────────────────────────────────
# 进入评审页、会话失效或 App 后台时，不只清下一轮 timer；已在飞的 report/apply
# 也必须经 AbortSignal + 代次栅栏停止，禁止停机后继续写 runtime 或发送 ACK。
janus_stop_cancellation_gate() {
  if "$NODE_BIN" scripts/janus-stop-cancellation.test.mjs > /tmp/uniapp-janus-stop-cancellation.log 2>&1; then
    ok "Janus C2 停机取消门 — $(tail -1 /tmp/uniapp-janus-stop-cancellation.log)"
  else
    bad "Janus C2 停机取消门失败 — node scripts/janus-stop-cancellation.test.mjs 看明细"
    tail -12 /tmp/uniapp-janus-stop-cancellation.log | sed 's/^/        /'
  fi
}
janus_stop_cancellation_gate

# ── 守卫存活性 · 行为门 ────────────────────────────────────────────────────────
# 上面那道是结构门(看代码形状)。这一族三轮出了三种形状,独立审计 2026-08-07 实测
# 7 种改法能让缺陷复活而结构门全绿 —— 所以再加一道**只看行为**的:登出的人还能不能
# 停在业务页上。代码怎么重构都拦得住。自带反向对照(已登录不许被误踢)与覆盖面 witness
# (读不到路由即判红,P-080:探不到 ≠ 无违例)。
# ── 自造控件键盘可达性 · 构造性门 ──────────────────────────────────────────────
# 本仓禁用原生 <button>(P-036),于是每个自造按钮都得自己写键盘支持 —— 2026-08-11 实测
# 151 处没写(焦点停得上去、按 Enter 没反应)。修法不是逐个补,是补上缺失的平台层
# (src/lib/a11y-activate.ts):声明 role + tabindex 就得到键盘激活,和原生 <button> 一样。
# 这道门守契约的两端:半个承诺(只写 role 或只写 tabindex)会红,平台层被删/未挂载也会红。
# 判据遍历全仓每一个模板元素,不枚举控件名——枚举式判据在这仓被绕过过太多次。
# selftest = 逐条注入违例证明每条判据真的会红(含行为门),哨兵失效即门失效。
a11y_activate_gate() {
  if "$NODE_BIN" scripts/a11y-activate-gate.redtest.mjs > /tmp/uni-a11y-activate-selftest.log 2>&1; then
    ok "a11y-activate selftest — $(tail -1 /tmp/uni-a11y-activate-selftest.log)"
  else
    bad "a11y-activate selftest 失败(哨兵失效即门失效;node scripts/a11y-activate-gate.redtest.mjs 看明细)"
    tail -12 /tmp/uni-a11y-activate-selftest.log | sed 's/^/        /'
  fi
  if "$NODE_BIN" scripts/a11y-activate-gate.mjs > /tmp/uni-a11y-activate.log 2>&1; then
    # 🔴 取带 ✓ 的那行,不能用 head -1:门会先把「判不出」清单打到 stderr,
    # head -1 抓到的是空行 → PASS 不带样本量,一眼看不出它到底扫了多少(本仓禁止这种绿)。
    ok "$(grep -a '✓' /tmp/uni-a11y-activate.log | head -1 | sed 's/^ *✓ *//')"
    grep -a 'ⓘ' /tmp/uni-a11y-activate.log | sed 's/^/        /'
  else
    bad "自造控件键盘可达性门失败 — node scripts/a11y-activate-gate.mjs 看明细"
    tail -14 /tmp/uni-a11y-activate.log | sed 's/^/        /'
  fi
  # --experimental-strip-types:行为门 import 的是 .ts 源,Node <23.6 不带这个 flag 会直接炸。
  if "$NODE_BIN" --experimental-strip-types --test scripts/a11y-activate-behavior.test.mjs > /tmp/uni-a11y-behavior.log 2>&1; then
    # 用 -o 只取计数片段:node --test 的行首是多字节的 ℹ,拿 `^.` 去锚会匹配不上 → PASS 又变空消息。
    ok "a11y 键盘激活行为门 — $(grep -aoE '(pass|fail) [0-9]+' /tmp/uni-a11y-behavior.log | tr '\n' ' ')"
  else
    bad "a11y 键盘激活行为门失败 — node --test scripts/a11y-activate-behavior.test.mjs 看明细"
    tail -14 /tmp/uni-a11y-behavior.log | sed 's/^/        /'
  fi
}
a11y_activate_gate

# Always boot the current worktree on an isolated port; never reuse a stale BASE_URL server.
# 包 ar:runner(verify-chain.mjs)在同一轮里已对同一棵树跑过 test:h5-runtime 并 PASS 时,经 H5_RUNTIME_REUSED_TREE 把
#   当时的树指纹传进来;这里**重新算一次当前树指纹**,相等才复用(树动过一个字都不复用)。复用条明写「复用」,
#   不冒充新跑;裸跑 verify.sh(没有该 env)行为与从前完全一样。
if scope_hit h5-runtime-isolated; then
_h5_tree_now=$("$NODE_BIN" scripts/lib/verify-scope.mjs fingerprint 2>/dev/null | sed -n 's/.*"fingerprint":"\([0-9a-f]*\)".*/\1/p')
if [ -n "${H5_RUNTIME_REUSED_TREE:-}" ] && [ -n "$_h5_tree_now" ] && [ "$H5_RUNTIME_REUSED_TREE" = "$_h5_tree_now" ]; then
  ok "H5 运行时门 — 复用本轮 runner 已跑过的同树结果(tree ${_h5_tree_now:0:10}${H5_RUNTIME_ONLY:+ · scoped 子探针 $H5_RUNTIME_ONLY});未另起服"
else
  if probe_retry /tmp/uni-h5-runtime-gates.log "$NODE_BIN" scripts/verify-h5-runtime.mjs; then
    ok "H5 运行时门隔离起服 — $(tail -1 /tmp/uni-h5-runtime-gates.log)"
  else
    bad "H5 运行时门隔离起服失败 — node scripts/verify-h5-runtime.mjs 看明细"
    tail -12 /tmp/uni-h5-runtime-gates.log | sed 's/^/        /'
  fi
fi
fi

# 重试留痕回显:哪个探针、几点、首败退出码 —— 反复出现同一探针 = 可能是真偶发 bug,要追
if [ -s "$PROBE_RETRY_LOG" ]; then
  echo -e "${Y}⚠ probe retries this run:${N}"
  sed 's/^/    /' "$PROBE_RETRY_LOG"
fi
# ── [2.7] 收尾半程(P-097 对策③):门全部跑完后再量一次 shell 延迟,与 preflight 成对报出。
# 首绿尾超阈 = server 在本轮 verify 中途被探针流量喂退化 —— 后段 runtime 探针的红先疑
# 环境再疑代码。只报不计数不改判:门都跑完了,此处再 abort 无意义,判断权交给读摘要的人。
if [ -n "${HEALTH_T1:-}" ] && [ -n "${HEALTH_T2:-}" ]; then
  HEALTH_T_END=$(_shell_latency)
  if [ -z "$HEALTH_T_END" ]; then
    echo -e "${Y}⚠ server health 首尾延迟:${HEALTH_T1}s/${HEALTH_T2}s → 收尾连不上 $BASE_URL(server 中途死了?)—— 后段 runtime 红先疑环境(P-097)${N}"
  elif _over_health_max "$HEALTH_T_END"; then
    echo -e "${Y}⚠ server health 首尾延迟:${HEALTH_T1}s/${HEALTH_T2}s → ${HEALTH_T_END}s(收尾已超 ${HEALTH_MAX_S}s)—— 跑到后段 server 已退化,本轮后段 runtime 红先重启 server 复跑再定论(P-097)${N}"
  else
    echo "server health 首尾延迟:preflight ${HEALTH_T1}s/${HEALTH_T2}s → 收尾 ${HEALTH_T_END}s(均 ≤ ${HEALTH_MAX_S}s)"
  fi
fi
echo -e "${C}━━ result: ${G}$pass pass${N}$( [ $retried -gt 0 ] && echo -e " ${Y}($retried after-retry ⚠)${N}" ), $( [ $fail -gt 0 ] && echo -e "${R}$fail fail${N}" || echo -e "${G}0 fail${N}" ), $( [ $skip -gt 0 ] && echo -e "${Y}$skip skip${N}" || echo "0 skip" )$( [ "$SCOPE_MODE" != "full" ] && echo -e ", ${Y}$scoped_skip scoped-skip${N} · mode=$SCOPE_MODE(≠ 全量绿:宣布 done / 合并前仍须 full)" ) ━━"
[ $fail -eq 0 ] && [ $skip -eq 0 ]
