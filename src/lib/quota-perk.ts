// A percentage alone can describe a legitimate hardware perk. Hide only
// annualized claims when the catalog inputs needed to explain them are absent.
export function isAnnualizedQuotaPerk(perk: string): boolean {
  return /(?:年化|annual|\b(?:roi|apy|apr)\b|%\s*\/\s*năm)/i.test(perk);
}
