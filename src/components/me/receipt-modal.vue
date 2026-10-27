<!--
  ReceiptModal — ported from
  Nexion-prototype/app/components/receipt/receipt-modal.tsx.
  Bottom-anchored detail sheet for a Proof-of-Compute (or legacy wallet-verification) receipt. Scrim +
  slide-up card (nx-step-in, tokens.css). Sections rendered generically from a
  computed `sections` descriptor (the source's Row/RowCopy/Section/DetailsRows
  components collapse into {k, v, accent, muted, strong, copyValue, hint} rows).
  framer AnimatePresence → v-if + CSS. ESC handler dropped (mobile).
  Tap-to-copy on hash/signature/wallet rows (uni.setClipboardData + toast +
  transient ✓ icon, mirrors prototype RowCopy). Driven by
  :receipt prop (null = hidden) + @close emit (P-032: page-mounted sheet,
  prop/emit — no chassis-level overlay host).
-->
<template>
  <view v-if="receipt" class="nx-receipt-modal-root" role="dialog" aria-modal="true" :aria-label="isLegacyVerification ? t.receipt.typeWalletPairing : t.receipt.proofOfCompute">
    <view class="nx-receipt-scrim" :style="scrimStyle" @click="emit('close')">
    <view class="nx-step-in" :style="sheetStyle" @click.stop>
      <!-- Close -->
      <view class="grid place-items-center active:opacity-60" :style="closeBtnStyle" role="button" tabindex="0" :aria-label="t.ui.close" @click="emit('close')" @keydown.enter.prevent="emit('close')" @keydown.space.prevent="emit('close')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </view>

      <!-- Header -->
      <view :style="headerStyle">
        <text class="block" :style="headerKickerStyle">{{ isLegacyVerification ? t.receipt.typeWalletPairing : t.receipt.proofOfCompute }}</text>
        <view class="flex items-center flex-wrap" style="margin-top: 8px; gap: 8px">
          <text v-if="isReceiptSettled" class="inline-flex items-center" :style="stampStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :stroke="stampColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <text style="margin-left: 4px">{{ t.receipt.stampVerified }}</text>
          </text>
          <text style="font-size: 13px; color: var(--v5-ink-2)">{{ receiptStatus }} · {{ fmtDate(receipt.settledAt) }}</text>
        </view>
      </view>

      <view class="nx-receipt-body" :style="bodyStyle">
      <view :style="summaryStyle">
        <text class="block" style="font-size:13px;color:var(--v5-ink-2)">{{ copy.result }}</text>
        <text class="block tabular-nums" style="margin-top:6px;font-size:26px;line-height:1.3;font-weight:600;overflow-wrap:anywhere">{{ summaryAmount }}</text>
      </view>
      <!-- Only identifiers and hashes use monospace; raw values remain unchanged. -->
      <view v-for="(sec, si) in visibleSections" :key="si" :style="sectionStyle(si)">
        <text class="block" :style="sectionHeadStyle">{{ sec.heading || sectionHeading(sec) }}</text>
        <view
          v-for="(row, ri) in sec.rows"
          :key="ri"
          class="nx-receipt-row"
          :style="rowStyle"
        >
          <text style="min-width:0;color:var(--v5-ink-2);overflow-wrap:anywhere">{{ fieldLabel(row.k) }}</text>
          <view v-if="row.divider" :style="dividerStyle" />
          <view
            v-else-if="row.copyValue"
            class="flex items-center active:opacity-60"
            :style="copyRowStyle"
            role="button"
            tabindex="0"
            :aria-label="copy.copy + ' ' + fieldLabel(row.k)"
            @click="copyRow(row.copyKey ?? row.k, row.copyValue ?? '')"
            @keydown.enter.prevent="copyRow(row.copyKey ?? row.k, row.copyValue ?? '')"
            @keydown.space.prevent="copyRow(row.copyKey ?? row.k, row.copyValue ?? '')"
          >
            <text style="min-width:0;overflow-wrap:anywhere;font-family:var(--font-jet-mono),ui-monospace,monospace;color:var(--v5-ink)">{{ row.v }}</text>
            <text v-if="row.hint" style="color:var(--v5-ink-2);font-size:12px">({{ row.hint }})</text>
            <!-- Check when just-copied, else Copy affordance (mirrors prototype RowCopy) -->
            <svg v-if="copiedField === (row.copyKey ?? row.k)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M20 6 9 17l-5-5" /></svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          </view>
          <text v-else class="text-right" :style="valueStyle(row)">{{ row.v }}</text>
        </view>
        <!-- 历史验证回执的核验清单(渲染兜底,仅存量数据) -->
        <view v-if="sec.checks" style="margin-top: 4px">
          <view v-for="chk in sec.checks" :key="chk" class="flex items-center" style="gap: 8px; padding: 2px 0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M20 6 9 17l-5-5" /></svg>
            <text style="font-size:13px;color:var(--v5-ink-2)">{{ chk }}</text>
            <text style="margin-left:auto;font-size:13px;color:var(--v5-ink-2)">{{ t.uiChrome.passed }}</text>
          </view>
        </view>
      </view>
      </view>
    </view>
  </view>
  </view>
</template>

<script setup lang="ts">
import { formatDisplayDateTime } from "@/lib/display-date";
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { computed, ref, onUnmounted, type CSSProperties } from "vue";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import type { Receipt, ReceiptDetails } from "@/mock/receipt";
import { shortenHex } from "@/mock/receipt";
import type { CanonicalComputeReceipt } from "@/api/task-assignment-api";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { workloadLabel } from "@/lib/workload-label";
import { toast } from "@/store/ui";

const props = defineProps<{ receipt: Receipt | CanonicalComputeReceipt | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

const t = useT();
const locale = useLocaleStore();
// 2026-10 review: user-facing labels are localized; identifiers and proof values stay exact.
const copyByLocale = {
  zh: { result:"收益金额", copy:"复制", job:"作业与凭证", client:"委托方", device:"执行设备", runtime:"执行时间与用量", rewards:"收益明细", proof:"核验信息", checks:"历史核验记录", pending:"待结算", failed:"结算失败", unknown:"状态待确认", purpose:"钱包归属证明", images:"张图像" },
  en: { result:"Reward amount", copy:"Copy", job:"Job and receipt", client:"Client", device:"Execution device", runtime:"Runtime and usage", rewards:"Reward breakdown", proof:"Verification details", checks:"Historical verification", pending:"Pending settlement", failed:"Settlement failed", unknown:"Status unconfirmed", purpose:"Wallet ownership proof", images:"images" },
  vi: { result:"Số tiền thu nhập", copy:"Sao chép", job:"Tác vụ và biên nhận", client:"Khách hàng", device:"Thiết bị thực hiện", runtime:"Thời gian và mức sử dụng", rewards:"Chi tiết thu nhập", proof:"Thông tin xác minh", checks:"Xác minh trước đây", pending:"Chờ quyết toán", failed:"Quyết toán thất bại", unknown:"Chưa xác nhận trạng thái", purpose:"Bằng chứng sở hữu ví", images:"hình ảnh" },
};
const receiptLocale = computed(() => locale.code === "zh" || locale.code === "vi" ? locale.code : "en");
const copy = computed(() => copyByLocale[receiptLocale.value]);
const fieldLabels: Record<string, readonly [string, string, string]> = {
  receipt_no:["凭证编号","Receipt number","Mã biên nhận"],
  task_no:["作业编号","Job number","Mã tác vụ"],
  task_type:["作业类型","Job type","Loại tác vụ"],
  task_name:["作业名称","Job name","Tên tác vụ"],
  model:["模型","Model","Mô hình"],
  client:["委托方","Client","Khách hàng"],
  status:["结算状态","Settlement status","Trạng thái quyết toán"],
  device:["设备","Device","Thiết bị"],
  device_instance:["设备编号","Device number","Mã thiết bị"],
  device_type:["设备型号","Device model","Mẫu thiết bị"],
  gpu:["显卡","GPU","GPU"],
  vram:["显存","Video memory","Bộ nhớ GPU"],
  started_at:["开始时间","Started","Bắt đầu"],
  duration:["执行时长","Duration","Thời lượng"],
  completed_at:["完成时间","Completed","Hoàn thành"],
  reward_usdt:["USDT 收益","USDT reward","Thu nhập USDT"],
  reward_nex:["UVT 奖励","UVT reward","Phần thưởng UVT"],
  proof_hash:["证明哈希","Proof hash","Mã băm bằng chứng"],
  compliance_id:["核验编号","Verification number","Mã xác minh"],
  type:["类型","Type","Loại"],
  program:["核验程序","Verification program","Chương trình xác minh"],
  authority:["核验方","Verifier","Bên xác minh"],
  paired_wallet:["关联钱包","Linked wallet","Ví liên kết"],
  network:["网络","Network","Mạng"],
  signature:["签名","Signature","Chữ ký"],
  deposit:["存入金额","Deposited amount","Số tiền nạp"],
  purpose:["用途","Purpose","Mục đích"],
  credited:["到账金额","Credited amount","Số tiền đã nhận"],
  tx_hash:["交易哈希","Transaction hash","Mã băm giao dịch"],
  block:["区块编号","Block number","Số khối"],
  verified_at:["核验时间","Verified","Thời gian xác minh"],
  job_id:["作业编号","Job number","Mã tác vụ"],
  client_addr:["委托方地址","Client address","Địa chỉ khách hàng"],
  gpu_fingerprint:["显卡标识","GPU identifier","Mã nhận dạng GPU"],
  vram_peak:["峰值显存 / 总显存","Peak / total memory","Bộ nhớ đỉnh / tổng"],
  energy:["耗电量","Energy used","Điện năng tiêu thụ"],
  unit_price:["单价","Unit price","Đơn giá"],
  units:["计费数量","Billed units","Số lượng tính phí"],
  gross:["总收益","Gross reward","Tổng thu nhập"],
  network_fee:["网络费用","Network fee","Phí mạng"],
  net_paid:["到账金额","Credited amount","Số tiền đã nhận"],
  resolution:["分辨率","Resolution","Độ phân giải"],
  batch_size:["批次大小","Batch size","Kích thước lô"],
  output:["产出","Output","Kết quả"],
  clip_duration:["视频时长","Clip duration","Thời lượng video"],
  fps:["帧率","Frame rate","Tốc độ khung hình"],
  frames:["帧数","Frame count","Số khung hình"],
  model_size:["模型规模","Model size","Quy mô mô hình"],
  input_tokens:["输入词元","Input tokens","Token đầu vào"],
  output_tokens:["输出词元","Output tokens","Token đầu ra"],
  latency:["响应延迟","Response latency","Độ trễ phản hồi"],
  training_steps:["训练步数","Training steps","Số bước huấn luyện"],
  final_loss:["最终损失值","Final loss","Giá trị mất mát cuối"],
  chunks:["文本分块","Text chunks","Khối văn bản"],
  total_tokens:["总词元数","Total tokens","Tổng số token"],
  embedding_dim:["向量维度","Embedding dimensions","Số chiều vector"],
  audio_duration:["音频时长","Audio duration","Thời lượng âm thanh"],
  wer:["词错误率","Word error rate","Tỷ lệ lỗi từ"],
  language:["识别语言","Detected language","Ngôn ngữ nhận diện"],
};
const localeIndex = { zh:0, en:1, vi:2 } as const;
function fieldLabel(key: string): string {
  return fieldLabels[key]?.[localeIndex[receiptLocale.value]] ?? key;
}
const identifierFields = new Set(["receipt_no","task_no","compliance_id","job_id","device_instance","gpu_fingerprint","block"]);
useDialogA11y(computed(() => props.receipt !== null), ".nx-receipt-modal-root", () => emit("close"));
// "KY" = 存量验证类回执(机制已删,历史数据保留可查 —— 白名单字段)。
function isCanonicalComputeReceipt(
  receipt: Receipt | CanonicalComputeReceipt,
): receipt is CanonicalComputeReceipt {
  return "receiptNo" in receipt && "proofHash" in receipt;
}

const isLegacyVerification = computed(() => {
  const receipt = props.receipt;
  return receipt ? !isCanonicalComputeReceipt(receipt) && receipt.category === "KY" : false;
});
const stampColor = computed(() => (isLegacyVerification.value ? "var(--v5-tech-cyan)" : "var(--v5-brand)"));
const isReceiptSettled = computed(() => {
  const r = props.receipt;
  return !!r && (!isCanonicalComputeReceipt(r) || /^(POSTED|SUCCESS|SETTLED|CREDITED|PAID)$/.test(r.earningStatus.toUpperCase()));
});
const receiptStatus = computed(() => {
  const r = props.receipt;
  if (!r || isLegacyVerification.value) return t.value.receipt.statusRecorded;
  if (!isCanonicalComputeReceipt(r)) return t.value.receipt.statusSettled;
  const status = r.earningStatus.toUpperCase();
  if (/^(POSTED|SUCCESS|SETTLED|CREDITED|PAID)$/.test(status)) return t.value.receipt.statusSettled;
  if (/^(PENDING|PROCESSING)$/.test(status)) return copy.value.pending;
  if (/^(FAILED|REJECTED)$/.test(status)) return copy.value.failed;
  return copy.value.unknown;
});
const summaryAmount = computed(() => {
  const r = props.receipt;
  if (!r) return "";
  const amount = formatGroupedAmount(isCanonicalComputeReceipt(r) ? r.rewardUsdt : r.netPaid);
  return (amount.startsWith("-") || amount === "0.00" ? "" : "+") + amount + " USDT";
});

// ── tap-to-copy (matches prototype RowCopy: copy on tap, transient ✓ icon) ──
// Backend-replaceable: copies the full underlying value; no real backend call.
const copiedField = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the uni clipboard API below.
  }
  return new Promise((resolve) => {
    try {
      uni.setClipboardData({
        data: text,
        showToast: false,
        success: () => resolve(true),
        fail: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });
}

async function copyRow(field: string, value: string): Promise<void> {
  const ok = await writeClipboard(value);
  if (!ok) return;
  copiedField.value = field;
  toast.success(t.value.receipt.copied);
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copiedField.value = null;
    copyResetTimer = null;
  }, 1400);
}

onUnmounted(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

interface DescRow {
  k: string;
  v?: string;
  accent?: boolean;
  muted?: boolean;
  strong?: boolean;
  copyValue?: string;
  copyKey?: string;
  hint?: string;
  divider?: boolean;
}
interface DescSection {
  heading?: string;
  rows: DescRow[];
  checks?: string[];
}

function detailRows(d: ReceiptDetails): DescRow[] {
  switch (d.kind) {
    case "IG":
      return [
        { k: "resolution", v: d.resolution },
        { k: "batch_size", v: String(d.batchSize) },
        { k: "output", v: `${d.outputCount} ${copy.value.images}` },
      ];
    case "VG":
      return [
        { k: "resolution", v: d.resolution },
        { k: "clip_duration", v: `${d.durationSec}s` },
        { k: "fps", v: String(d.fps) },
        { k: "frames", v: String(d.frames) },
      ];
    case "LL":
      return [
        { k: "model_size", v: d.modelSize },
        { k: "input_tokens", v: d.inputTokens.toLocaleString() },
        { k: "output_tokens", v: d.outputTokens.toLocaleString() },
        { k: "latency", v: `p50 ${d.latencyP50ms}ms · p95 ${d.latencyP95ms}ms` },
      ];
    case "FT":
      return [
        { k: "training_steps", v: String(d.trainingSteps) },
        { k: "final_loss", v: d.finalLoss.toFixed(3) },
      ];
    case "EM":
      return [
        { k: "chunks", v: d.chunksCount.toLocaleString() },
        { k: "total_tokens", v: d.totalTokens.toLocaleString() },
        { k: "embedding_dim", v: String(d.embeddingDim) },
      ];
    case "SP":
      return [
        { k: "audio_duration", v: `${(d.audioDurationSec / 60).toFixed(1)} min` },
        { k: "wer", v: d.wer.toFixed(3) },
        { k: "language", v: d.languageDetected },
      ];
  }
}

// Stable internal keys also identify copied fields. The current review explicitly
// replaces the former raw-key presentation with localized, grouped labels.
const sections = computed<DescSection[]>(() => {
  const r = props.receipt;
  if (!r) return [];
  if (isCanonicalComputeReceipt(r)) {
    return [
      {
        rows: [
          { k: "receipt_no", v: r.receiptNo, accent: true },
          { k: "task_no", v: r.taskNo },
          { k: "task_type", v: workloadLabel(t.value, r.taskClass) },
          { k: "task_name", v: r.taskName },
          { k: "model", v: r.model || "—" },
        ],
      },
      {
        rows: [
          { k: "client", v: r.client },
          { k: "status", v: receiptStatus.value },
        ],
      },
      {
        rows: [
          { k: "device", v: r.deviceName },
          { k: "device_instance", v: r.deviceInstanceNo },
          { k: "device_type", v: r.deviceType },
          ...(r.deviceGpu ? [{ k: "gpu", v: r.deviceGpu }] : []),
          ...(r.vramTotalGb !== null ? [{ k: "vram", v: `${r.vramTotalGb} GB` }] : []),
        ],
      },
      {
        rows: [
          { k: "started_at", v: fmtDate(r.startedAt) },
          { k: "duration", v: fmtDuration(r.durationSec) },
          { k: "completed_at", v: fmtDate(r.completedAt) },
        ],
      },
      {
        rows: [
          { k: "reward_usdt", v: `+${formatAmount(r.rewardUsdt)} USDT`, accent: true, strong: true },
          ...(r.rewardNex > 0 ? [{ k: "reward_nex", v: `+${formatAmount(r.rewardNex)} UVT`, accent: true }] : []),
        ],
      },
      {
        rows: [
          { k: "proof_hash", copyKey: "proof_hash", copyValue: r.proofHash, v: shortenHex(r.proofHash, 8, 6) },
        ],
      },
    ];
  }
  if (r.category === "KY") {
    return [
      {
        rows: [
          { k: "compliance_id", v: r.id, accent: true },
          { k: "type", v: workloadLabel(t.value, r.category) },
          { k: "program", v: r.model },
          { k: "authority", v: r.client },
        ],
      },
      {
        rows: [
          { k: "paired_wallet", copyKey: "paired_wallet", copyValue: r.verificationWalletAddress ?? "0x", v: shortenHex(r.verificationWalletAddress ?? "0x", 6, 4) },
          { k: "network", v: r.verificationNetwork ?? "—" },
          { k: "signature", copyKey: "verification_signature", copyValue: r.signature, v: shortenHex(r.signature, 8, 6), hint: "rsa-sha256" },
        ],
      },
      {
        heading: copy.value.checks,
        rows: [],
        checks: r.verificationChecks ?? [],
      },
      {
        rows: [
          { k: "deposit", v: `${formatAmount(r.gross)} USDT` },
          { k: "purpose", v: copy.value.purpose, muted: true },
          { k: "credited", v: `+$${formatAmount(r.netPaid)}`, accent: true, strong: true },
        ],
      },
      {
        rows: [
          { k: "tx_hash", copyKey: "tx_hash", copyValue: r.txHash, v: shortenHex(r.txHash, 8, 6) },
          { k: "block", v: `#${r.blockNumber.toLocaleString()}` },
          { k: "verified_at", v: fmtDate(r.settledAt) },
        ],
      },
    ];
  }
  // Task receipt
  return [
    {
      rows: [
        { k: "job_id", v: r.id, accent: true },
        { k: "type", v: workloadLabel(t.value, r.category) },
        { k: "model", v: r.model },
        ...(r.details ? detailRows(r.details) : []),
      ],
    },
    {
      rows: [
        { k: "client", v: r.client },
        { k: "client_addr", copyKey: "client_addr", copyValue: r.clientAddress, v: shortenHex(r.clientAddress, 6, 4) },
        { k: "signature", copyKey: "signature", copyValue: r.signature, v: shortenHex(r.signature, 8, 6), hint: "rsa-sha256" },
      ],
    },
    {
      rows: [
        { k: "device", v: r.deviceName },
        { k: "gpu", v: r.deviceGpu },
        { k: "gpu_fingerprint", v: r.deviceFingerprint },
      ],
    },
    {
      rows: [
        { k: "duration", v: fmtDuration(r.durationSec) },
        ...(r.vramTotalGb > 0 ? [{ k: "vram_peak", v: `${r.vramPeakGb.toFixed(1)} / ${r.vramTotalGb} GB` }] : []),
        { k: "energy", v: `${r.energyKwh.toFixed(3)} kWh` },
      ],
    },
    {
      rows: [
        { k: "unit_price", v: r.unitPriceLabel.replace(/^\$([0-9]+(?:\.[0-9]+)?)/, (_match, amount: string) => `$${formatAmount(amount)}`) },
        { k: "units", v: r.unitsLabel },
        { k: "gross", v: `$${formatAmount(r.gross)}` },
        { k: "network_fee", v: `-$${formatAmount(r.fee)}`, muted: true },
        { k: "net_paid", v: `+${formatAmount(r.netPaid)} USDT`, accent: true, strong: true },
      ],
    },
    {
      rows: [
        { k: "tx_hash", copyKey: "tx_hash", copyValue: r.txHash, v: shortenHex(r.txHash, 8, 6) },
        { k: "block", v: `#${r.blockNumber.toLocaleString()}` },
      ],
    },
  ];
});

// The main amount is already presented above the sections.
const visibleSections = computed(() => sections.value
  .map(section => ({ ...section, rows: section.rows.filter(row => !row.strong) }))
  .filter(section => section.rows.length > 0 || section.checks?.length));
function sectionHeading(section: DescSection): string {
  const first = section.rows[0]?.k ?? "";
  if (["receipt_no","job_id","compliance_id"].includes(first)) return copy.value.job;
  if (["client","client_addr"].includes(first)) return copy.value.client;
  if (first === "device") return copy.value.device;
  if (["started_at","duration"].includes(first)) return copy.value.runtime;
  if (["reward_nex","deposit","unit_price"].includes(first)) return copy.value.rewards;
  return copy.value.proof;
}

function fmtDuration(sec: number): string {
  const units = receiptLocale.value === 'zh' ? ['分', '秒'] : receiptLocale.value === 'vi' ? ['phút', 'giây'] : ['min', 'sec'];
  if (sec < 60) return `${sec} ${units[1]}`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} ${units[0]} ${s.toString().padStart(2, "0")} ${units[1]} (${sec} ${units[1]})`;
}
function fmtDate(ts: number): string {
  return formatDisplayDateTime(ts, receiptLocale.value);
}

// ── styles ──
const scrimStyle: CSSProperties = {
  position: "fixed",
  left: "0",
  right: "0",
  top: "0",
  bottom: "0",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  padding: "var(--nx-overlay-top) 16px var(--nx-overlay-bottom)",
  background: "rgba(0,0,0,0.7)",
};
const sheetStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: "480px",
  boxSizing: "border-box",
  maxHeight: "min(85vh, calc(100vh - var(--nx-overlay-top) - var(--nx-overlay-bottom)))",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--v5-surface)",
  border: "1px solid var(--v5-surface-2)",
  borderRadius: "16px",
  fontFamily: "var(--font-v5)",
  color: "var(--v5-ink)",
};
const closeBtnStyle: CSSProperties = {
  position: "absolute",
  top: "8px",
  right: "8px",
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  zIndex: 10,
};
const headerStyle: CSSProperties = {
  padding: "20px 60px 16px 20px",
  flexShrink: 0,
  borderBottom: "1px solid color-mix(in srgb, var(--v5-surface-2) 70%, transparent)",
};
const headerKickerStyle: CSSProperties = {
  fontSize: "19px",
  fontWeight: 600,
  lineHeight: 1.4,
  color: "var(--v5-ink)",
};
const bodyStyle: CSSProperties = { minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingBottom: "16px" };
const summaryStyle: CSSProperties = { padding: "20px", borderBottom: "1px solid var(--v5-border)" };
const stampStyle = computed<CSSProperties>(() => ({
  alignItems: "center",
  // Prototype: px-1.5 py-0.5 = 2px 6px, rounded-md = 6px, rotate(-4deg).
  padding: "2px 6px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: stampColor.value,
  background: `color-mix(in srgb, ${stampColor.value} 8%, transparent)`,
  transform: "rotate(-4deg)",
}));
function sectionStyle(si: number): CSSProperties {
  return {
    padding: "16px 20px",
    borderTop: si === 0 ? "none" : "1px solid color-mix(in srgb, var(--v5-surface-2) 70%, transparent)",
  };
}
const sectionHeadStyle: CSSProperties = {
  marginBottom: "10px",
  fontSize: "14px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
// Prototype Section uses `space-y-1` = 4px gap between rows. `padding: 2px 0`
// on every row yields the same 4px inter-row spacing.
const rowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, .9fr) minmax(0, 1.25fr)", alignItems: "center", gap: "12px", fontSize: "13px", lineHeight: 1.5, padding: "6px 0" };
const dividerStyle: CSSProperties = {
  flex: "1",
  height: "1px",
  margin: "6px 0",
  background: "color-mix(in srgb, var(--v5-surface-2) 70%, transparent)",
};
function valueStyle(row: DescRow): CSSProperties {
  return {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontFamily: identifierFields.has(row.k) ? "var(--font-jet-mono), ui-monospace, monospace" : "var(--font-v5)",
    color: row.muted ? "var(--v5-ink-2)" : "var(--v5-ink)",
    fontWeight: row.strong ? 600 : 400,
  };
}
// Prototype RowCopy: `flex items-center gap-1` (4px) — value + hint + copy icon.
const copyRowStyle: CSSProperties = { gap: "6px", minHeight: "44px", minWidth: "44px", justifyContent: "flex-end", flexWrap: "wrap" };
</script>
