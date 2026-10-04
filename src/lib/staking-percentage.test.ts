import {describe,expect,it} from 'vitest';
import {formatStakingPercentage} from './staking-percentage';
describe('staking percentages preserve canonical precision',()=>{
  it.each([[0,'0'],[0.05,'5'],[0.055,'5.5'],[0.0525,'5.25'],[1.23456789,'123.456789']])('formats %s without integer rounding',(rate,expected)=>{
    expect(formatStakingPercentage(rate as number)).toBe(expected);
  });
  it('does not publish nonfinite values',()=>{
    expect(formatStakingPercentage(NaN)).toBe('—');
    expect(formatStakingPercentage(Infinity)).toBe('—');
  });
});
