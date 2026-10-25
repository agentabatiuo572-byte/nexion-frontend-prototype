/** Platform compute points are a count, never a currency conversion or physical TOPS. */
const COPY = {
  zh: { unit: '算力点', self: '自购算力', team: '团队算力', month: '本月算力', lifetime: '累计算力', needSelf: '自购算力还差 {n}', needTeam: '团队算力还差 {n}', conditionsPending: '算力条件待公布', memberSummary: '{n} 名成员 · {points}' },
  en: { unit: 'compute pts', self: 'Own compute', team: 'Team compute', month: 'Monthly compute', lifetime: 'Total compute', needSelf: '{n} more own compute', needTeam: '{n} more team compute', conditionsPending: 'Compute requirements pending', memberSummary: '{n} members · {points}' },
  vi: { unit: 'điểm tính toán', self: 'Năng lực tự mua', team: 'Năng lực đội', month: 'Năng lực tháng', lifetime: 'Năng lực tích lũy', needSelf: 'Còn thiếu {n} tự mua', needTeam: 'Đội còn thiếu {n}', conditionsPending: 'Chưa công bố điều kiện điểm', memberSummary: '{n} thành viên · {points}' },
};
export function computePointsCopy(locale: string) {
  return COPY[locale.split('-')[0] as keyof typeof COPY] ?? COPY.en;
}
export function formatComputePoints(value: number | null | undefined, locale: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  // Expand scientific notation and round decimal digits without Intl or binary toFixed ties.
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = integer + fraction;
  const point = integer.length + Number(exponent);
  const whole = point > 0 ? digits.slice(0, point).padEnd(point, '0') : '0';
  const tail = (point < 0 ? '0'.repeat(-point) : '') + digits.slice(Math.max(0, point));
  const rounded = [...whole, ...tail.slice(0, 6).padEnd(6, '0')];
  if (tail[6] >= '5') {
    let carry = true;
    for (let i = rounded.length - 1; i >= 0 && carry; i--) {
      if (rounded[i] === '9') rounded[i] = '0';
      else { rounded[i] = String(Number(rounded[i]) + 1); carry = false; }
    }
    if (carry) rounded.unshift('1');
  }
  const fixed = rounded.join('');
  const decimals = fixed.slice(-6).replace(/0+$/, '');
  const vi = locale.split('-')[0] === 'vi';
  const number = fixed.slice(0, -6).replace(/\B(?=(\d{3})+(?!\d))/g, vi ? '.' : ',') + (decimals ? (vi ? ',' : '.') + decimals : '');
  return `${number} ${computePointsCopy(locale).unit}`;
}
/** Missing any member's value means the aggregate is unknown, not zero. */
export function sumComputePoints(values: readonly (number | null | undefined)[]): number | null {
  if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null;
  return values.reduce<number>((sum, value) => sum + (value as number), 0);
}
