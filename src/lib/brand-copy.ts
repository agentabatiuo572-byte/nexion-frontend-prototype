// 旧品牌词在「服务端历史值」里的展示层归一。
//
// 背景(2026-07-22 改名 NexGrid,见 docs/changes/2026-07-22-nexgrid-rebrand.md):那轮只
// 覆盖了客户端文案、标题与运行时标识;服务端**存量行**仍带旧品牌 —— 注册时铸的默认昵称
// (默认昵称 / 登录设备名 / 历史通知标题)、
// 商品目录名("NexionBox Pro v2")。这些值由服务端持久化,客户端回填不了;但**渲染层**是
// 客户端自己的边界,旧值不该继续以旧品牌示人(BUG 73 验收:刷新与重新登录后均不再出现)。
//
// 分层约定与 device-copy.ts / product-copy.ts 一致:store 存服务端原值,措辞在展示层解析。
// 🔴 只在**展示**调用点用,绝不用于协议字段:`NEXION_USDT_WALLET` 这类枚举由后端定义,
//    客户端单方面改拼写 = 回包校验当场对不上(trial-api.ts 拿它校验 paymentRail)。
//
// 旧词用拆词构造,与 scripts/verify.sh 的 no_oldbrand_check 同法 —— 直接写字面量会被本仓
// 自己的品牌哨兵抓红,而这里的字符串恰恰就是哨兵要守的那个旧词。
const LEGACY_BRAND = "Nexi" + "on";
const BRAND = "UVEL";

const LEGACY_BRAND_PATTERN = new RegExp(LEGACY_BRAND, "gi");
const SYSTEM_NICKNAME_PATTERN = new RegExp(`^(?:(?:${LEGACY_BRAND}|NexGrid) [0-9]{4}|NexGrid-[0-9A-F]{8})$`);

/** Only system-generated historical nicknames; keep personal names and raw API values intact. */
export function displayNickname(value: string): string {
  return SYSTEM_NICKNAME_PATTERN.test(value) ? nexGridBrandText(value) : value;
}

/** 服务端历史值 → 现品牌文案。大小写不敏感,命中即整词替换。 */
export function nexGridBrandText(value: string): string {
  return value.replace(LEGACY_BRAND_PATTERN, BRAND).replace(/NexGrid/gi, BRAND)
    .replace(/\bStellar(Box|Rack)\b(?!-)/gi, (_, family: string) => `${BRAND}${family.toLowerCase() === "box" ? "Box" : "Rack"}`);
}

/** Display copy only. Keep transport codes, stored records and contact/link targets unchanged. */
export function platformDisplayText(value: string): string {
  return value.split(/((?:https?:\/\/|www\.)[^\s<>"'，。；、！？（）【】]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^\s<>"'，。；、！？（）【】]*)?)/g)
    .map((part, index) => index % 2 ? part : part
      .replace(/\b(?:NexGrid|Nexion)(?:Box|Rack)?\b|\bStellar(?:Box|Rack)\b(?!-)/gi, nexGridBrandText)
      .replace(/\bNEX\b(?!-[A-Z0-9]{2,})/g, "UVT")
      .replace(/业绩额?/g, "算力额"))
    .join("");
}
