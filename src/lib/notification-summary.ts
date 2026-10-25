/** A deliberately small reading budget, not a claim about rendered line count.
 * Unknown-width text, long tokens and paragraphs stay expandable at narrow widths.
 */
export function isDirectNotificationSummary(body?: string): boolean {
  if (!body) return true;
  if (/[\r\n\u2028\u2029]/u.test(body)) return false;
  let units = 0;
  let tokenUnits = 0;
  for (const char of body.trim()) {
    const width = /\p{Mark}/u.test(char) ? 0 : /^[\x20-\x7e]$/.test(char) ? 1 : 2;
    units += width;
    tokenUnits = /\s/u.test(char) ? 0 : tokenUnits + width;
    if (units > 32 || tokenUnits > 24) return false;
  }
  return true;
}
