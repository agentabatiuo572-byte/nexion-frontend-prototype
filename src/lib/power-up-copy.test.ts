import { expect, it } from 'vitest';
import { powerUpEffectText } from './power-up-copy';
it('shows the published multiplier as a benefit and never exposes unknown config keys',()=>{
  expect(powerUpEffectText('CHECKIN_MULTIPLIER','1.5','zh')).toBe('签到奖励 × 1.5');
  expect(powerUpEffectText('INTERNAL_ONLY','1.5','en')).toBe('');
  expect(powerUpEffectText('CHECKIN_MULTIPLIER','','zh')).toBe('');
});
