export function powerUpEffectText(effectType: string, rawValue: string | number, locale: string): string {
  // Unknown effects have no safe display interpretation; keep the published name.
  if (String(rawValue).trim() === '') return '';
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return '';
  if (effectType !== 'CHECKIN_MULTIPLIER') return '';
  const copy = locale === 'zh' ? '签到奖励 × {n}' : locale === 'vi' ? 'Thưởng điểm danh × {n}' : 'Check-in reward × {n}';
  return copy.replace('{n}', String(value));
}
