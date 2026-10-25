import{afterEach,expect,it,vi}from'vitest';import{rewardAmount,displayDeadline}from'./promotion-display';import type{RewardSpec}from'../api/promotion-api';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('formats two decimal rewards without binary money arithmetic or mixing assets',()=>{const reward={type:'NEX',amount:'999999999999.000001'}as RewardSpec;expect(rewardAmount(reward,100)).toBe('99999999999900.00');expect(rewardAmount({...reward,amount:'0.000001'},3)).toBe('0.00');expect(rewardAmount({...reward,amount:'20.000000'})).toBe('20.00');});
it('keeps explicit UTC in deadlines and never invents a countdown from invalid input',()=>{expect(displayDeadline('not-a-time','zh')).toBe('');expect(displayDeadline('2026-10-31T23:59:00+09:00','en')).toContain('UTC');});
it.each([['zh','2026-10-25'],['en','25/10/2026'],['vi','25/10/2026']])('formats %s UTC deadlines without native locale support',(language,day)=>{
  vi.stubGlobal('Intl',undefined);
  const nativeLocale=vi.spyOn(Date.prototype,'toLocaleString').mockReturnValue('Sun Oct 25 2026 12:50:00 GMT+0800 (CST)');
  expect(displayDeadline('2026-10-25T04:50:00Z',language)).toBe(`${day} 04:50 · UTC`);
  expect(displayDeadline('2026-10-25T05:00:00Z',language)).toBe(`${day} 05:00 · UTC`);
  expect(nativeLocale).not.toHaveBeenCalled();
});
it('converts offset timestamps across day and year boundaries using UTC getters',()=>{
  expect(displayDeadline('2027-01-01T00:05:00+09:00','zh')).toBe('2026-12-31 15:05 · UTC');
  expect(displayDeadline('2026-12-31T23:05:00-07:00','en')).toBe('01/01/2027 06:05 · UTC');
  expect(displayDeadline('2026-10-25T00:00:00Z','vi')).toBe('25/10/2026 00:00 · UTC');
});
