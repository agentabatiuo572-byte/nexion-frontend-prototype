import { describe, expect, it } from 'vitest';
import { formatComputePoints, sumComputePoints } from './compute-points';
describe('platform compute point quantities', () => {
  it('distinguishes unknown from zero without inventing a money conversion', () => {
    expect(formatComputePoints(undefined, 'zh')).toBe('—');
    expect(formatComputePoints(null, 'zh')).toBe('—');
    expect(formatComputePoints(0, 'zh')).toBe('0 算力点');
    expect(formatComputePoints(12800, 'zh')).toBe('12,800 算力点');
    expect(formatComputePoints(1280.25, 'vi')).toBe('1.280,25 điểm tính toán');
    expect(formatComputePoints(-1, 'en')).toBe('—');
  });
  it('does not turn an incomplete team into a zero or partial total', () => {
    expect(sumComputePoints([1280, null, 640])).toBe(null);
    expect(sumComputePoints([1280, 640])).toBe(1920);
    expect(sumComputePoints([])).toBe(0);
  });
});
