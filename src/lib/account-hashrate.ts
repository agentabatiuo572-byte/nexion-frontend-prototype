// 账号总有效算力(TOPS)—— 首页「你的排名」入参 `myTotalHashrate` 的唯一生产者
// (规格 FEAT-HOME02 ③)。lib/network-rank.ts 只负责「算力 → 百分位 → 名次」,
// 算力本身由这里聚合出来。
//
// 🔴 本文件**只做聚合**,单台的算力口径一条都不新造,全部回既有模型取:
//   · 手机的实时有效算力 = lib/hashpower.ts `computeLiveHashpower`
//     (设备卡上那个跳动的 TOPS 就是它,components/earn/device-card-pc.vue:456);
//   · 手机的算力天花板   = `device.capabilityTops`(标定值),缺失时同款回退
//     `fallbackCapability()` —— 与设备卡同一行写法(device-card-pc.vue:451);
//   · 非手机的天花板     = 设备自己那行 GPU 规格串 `device.gpu`(如 "8× NVIDIA A100"),
//     用 lib/gpu-tiers.ts 既有的 `matchGpuTier()` 解成档位 TOPS,再乘串里写明的张数。
//     🔴 档位表**必须由调用方穿进来**(store 传 `cfg.config.computeShare.gpuTiers`),
//     本文件禁止 import 编译期常量当档位表 —— 这张表运营可编辑(admin E6 改档位
//     TOPS / 增删识别词),读常量的话运营一改,排名跟不上:改档形态少算 0.725×,
//     新识别词落 G2 兜底最多少算 7.3 倍,当下就翻转名次(台账 2026-08-05 新缺陷,
//     实测)。哨兵:本文件出现 GPU_TIERS 字样、或 matchGpuTier 单参调用,
//     selfcheck-account-hashrate.mjs 即红。
//     覆盖不到型号关键词的串(cloud-share 的 "Distributed")落到 `matchGpuTier` 自带的
//     G2 兜底 —— 那是它既有的声明行为,不在这里另发明补丁。
//
// ⚠️ **已知天花板(台账 P1-3 残留半边),在本文件之外,别在这里另发明公式去凑**:
//   ① `lib/gpu-tiers.ts` 最高档 G6 把 RTX 4090 / 5090 / A100 / H100 收在同一档(660),
//      于是 Pro / Pro v2 / Rack P1 / Rack P2 四个 SKU 天花板并列 5280 —— $1,199 与
//      $7,499 的机器算力读数相同;同算力必同名次(规格 ③ 确定性),这四个 SKU 之间
//      名次不区分。要解必须给 G6 以上补档(gpu-tiers.ts + 运营配置两侧一起动)。
//   ② 分位表封顶 —— **已收口(2026-08-05)**:mock/platform-config.ts 种子扩到
//      53,000 TOPS(10 档),覆盖最大合理舰队;8 档参考舰队名次互不相同且随算力
//      严格前进,由 selfcheck-account-hashrate.mjs 固定靶钉住。
//
// 🔴 **任务量递减不进排名**。store/device-lifecycle.ts 的 `getEfficiency` **降的不是算力**:
// 平台语义是硬件算力恒定不变,随时间递减的是它**能接到的任务量**。该文件自陈是
// 「hardware degradation」那套说法的继任者,档位表叫 `TASK_CAPACITY_BANDS`,豁免清单
// 注释写的是 "exempt from the **task-mix decline**",后台开关叫「参与任务递减」;它乘的是
// `device.baseRate`(USD/日),产物全是钱(app.ts settleDevice 已经在用)。
// 所以把「接多少活」乘进「跑多快」**本身就是语义错**,不是「会不会倒退」的权衡题。
// 真乘了才会出现「用户什么都不做算力也下降、名次持续倒退」,规格阳光路径4「名次永不倒退」
// 当场失效(今天被分位表 96% 封顶掩盖,一抬档就发作)。这里取天花板不打折 —— 拿掉之后
// 算力不随时间变,单调性天然成立,**不需要任何单调性兜底代码**。
// 排名格回答的也正是「你投入了多少算力」:那是采购决策,不该因设备变老而惩罚,
// 何况任务量递减已经在收益侧罚过一次,进排名等于罚两遍。
//
// 「在不在产」的参照系是 app.ts `settleDevice` 那张不结算清单 —— 它实际是 **5 条**
// (store/app.ts:234-240):① activatedAt===null ② status!=="online" ③ kind==="cloud-share"
// ④ pausedReason!=null ⑤ kind==="phone" 且(isCharging===false 或 isWifiConnected===false)。
// 🔴 排名的在产判据只取其中 ①②④ 三条,**不是全等关系**,差出来的两条是刻意取舍,
// 下一个人别按「权威=那张清单」把它们改回去:
//   · ③ cloud-share:收益另路、算力在网 —— 不走 settleDevice 计息是收益侧的安排,
//     排名照算它的档位算力(G2 兜底 90)。
//   · ⑤ 手机不充电:结算给 $0,排名照算打折后的正数(charge 因子 0.6,28.3 标定实测
//     16.5 TOPS)—— 与设备卡显示自洽(设备卡对不充电的手机也显示正 TOPS),
//     展示≠结算,排名跟展示对齐。断网那半条殊途同归:既有模型的 network 因子把它
//     归 0,与结算侧一致,但守它的是因子不是这张清单。
// 也**不是** `isDeviceOnline` —— 后者只回答「有没有常驻 App 心跳」(决定拿满档还是拿
// hosted 档)。拿它当在产判据的后果:H5 上一台正按 $0.036/日 真给钱、设备卡显示
// 16.4 TOPS 的手机,在排名里被算成 0,首页对着一个正在赚钱的用户说
// 「未上榜,激活设备就上榜」。心跳新鲜与否照旧原样传给既有单台模型,由它给档。
//
// 🔴 不吃抖动:`computeLiveHashpower` 的 jitter 是展示用的呼吸感(≈0.955–1.0 来回摆)。
// 让它进名次,排名每秒抖一次、还会倒退 —— 规格 ③「同输入必同输出」与阳光路径 4
// 「名次永不倒退」当场失效。这里给它一个**固定种子**把抖动冻成常数因子,
// 而不是另写一份「无抖动版算力」(那就成了第二套口径)。
//
// Backend-replaceable:PROD 由服务端在 `GET /api/platform/rank` 里算同一个和,
// client 这份是 mock 期的同构实现。
import type { Device } from "@/store/types";
import type { GpuTier } from "@/store/config-types";
import { computeLiveHashpower, isDeviceOnline } from "./hashpower";
import { fallbackCapability } from "./device-capability";
import { matchGpuTier } from "./gpu-tiers";

/** 排名口径的固定抖动种子(见文件头)。任何常数都行,重点是**不随时间变**。 */
const RANK_JITTER_SEED = 0;

/** 规格串开头写明的张数:"8× NVIDIA A100" → 8;没写数量的按 1 张。 */
const GPU_COUNT_RE = /^\s*(\d+)\s*[×x*]\s*/i;

/** 在线加成系数(配置 store 的 `config.onlineBonus`,后端可接管)。 */
export interface OnlineBonusInput {
  h5BaseFactor: number;
  continuityFullHours: number;
}

/** 单台的算力天花板(TOPS)。手机用自己的标定值,其余读设备自己那行 GPU 规格串,
 *  用**调用方穿进来的运营档位表**解档(见文件头:禁编译期常量,运营改档要跟得上)。 */
export function deviceBaselineTops(device: Device, gpuTiers: GpuTier[]): number {
  if (device.kind === "phone") return device.capabilityTops ?? fallbackCapability().tops;
  const gpu = device.gpu ?? "";
  return Number(GPU_COUNT_RE.exec(gpu)?.[1] ?? 1) * matchGpuTier(gpu, gpuTiers).tops;
}

/**
 * 单台的**有效**算力(TOPS)。不在产 → 0(规格 ③「不计」)。
 *
 * 注意零值有两种来源且都正确:设备不在产(这里判),以及设备在产但条件因子把它压到 0
 * (如手机断网 → network 因子 0,由既有模型判)。两者都不该由本文件解释成「未上榜」——
 * 那是 network-rank.ts 的事。
 */
export function deviceEffectiveTops(
  device: Device,
  now: number,
  onlineBonus: OnlineBonusInput,
  gpuTiers: GpuTier[],
): number {
  // 在产判据 = settleDevice 不结算清单(5 条)里的 ①②④ 三条;cloud-share 与
  // 手机不充电两条是刻意不取的取舍,别改回去 —— 逐条理由见文件头。
  if (device.activatedAt === null || device.status !== "online" || device.pausedReason != null) return 0;
  const baselineTops = deviceBaselineTops(device, gpuTiers);

  if (device.kind === "phone") {
    return computeLiveHashpower({
      baselineTops,
      // 心跳新鲜 → 满档;H5 / App 被杀 → 既有模型的 hosted 档(与设备卡上那个数同源)。
      online: isDeviceOnline(device, now),
      isCharging: device.isCharging !== false,
      isOnline: device.isWifiConnected !== false,
      thermalState: device.thermalState,
      continuityMs: device.miningSince ? Math.max(0, now - device.miningSince) : 0,
      nowSeed: RANK_JITTER_SEED,
      onlineBonus,
    }).effectiveTops;
  }

  return baselineTops;
}

/**
 * 账号总有效算力 = 全部已激活且在线设备的有效算力之和。
 * 无设备 / 全部未激活 / 全部离线 → 0(**不在这里判「未上榜」**,那是排名函数的三态)。
 *
 * 非有限值(配置或设备数据坏了)按 0 计:让 NaN 流进 computeRank 会被它判成
 * `unranked`(未上榜),用户看到的是「你还没上榜」而不是「数据更新中」—— 错的状态。
 */
export function accountTotalHashrate(
  devices: readonly Device[],
  now: number,
  onlineBonus: OnlineBonusInput,
  gpuTiers: GpuTier[],
): number {
  return devices.reduce((sum, device) => {
    const tops = deviceEffectiveTops(device, now, onlineBonus, gpuTiers);
    return Number.isFinite(tops) && tops > 0 ? sum + tops : sum;
  }, 0);
}
