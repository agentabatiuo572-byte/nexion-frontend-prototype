import { expect,it } from 'vitest';
import { derivedRegisteredUsers,publicStatsHealth,tickOffset,type PublicStatsShape } from './platform-stats';
import { parsePlatformPublicStats } from '@/api/platform-config-api';
const stats:PublicStatsShape={fleetDevices:1000,onlineRatePct:100,onlineJitter:0,realUserCount:42,virtualUserCount:0,hashratePercentileTable:[],registeredUsersBase:100,registeredUsersAnchorAt:100000,registeredUsersMonthlyGrowthPct:20,registeredUsersTickIntervalSec:10,registeredUsersTickStepMin:2,registeredUsersTickStepMax:2};
it('derives exact tick boundaries without accumulating drift or changing measured users',()=>{expect(derivedRegisteredUsers(stats,99999)).toBe(100);expect(derivedRegisteredUsers(stats,109999)).toBe(100);expect(derivedRegisteredUsers(stats,110000)).toBe(102);expect(derivedRegisteredUsers(stats,130000)).toBe(106);expect(derivedRegisteredUsers(stats,110000)).toBe(102);expect(stats.realUserCount).toBe(42);});
it.each([{registeredUsersTickIntervalSec:0},{registeredUsersTickIntervalSec:1.5},{registeredUsersTickStepMin:-1},{registeredUsersTickStepMax:Infinity},{registeredUsersTickStepMin:5,registeredUsersTickStepMax:4},{registeredUsersBase:NaN},{registeredUsersAnchorAt:-1},{registeredUsersTickStepMax:undefined}])('hides invalid optional settings %j',patch=>{expect(publicStatsHealth({...stats,...patch}).membersOk).toBe(false);expect(Number.isNaN(derivedRegisteredUsers({...stats,...patch},200000))).toBe(true);});
it('accepts zero increments and refuses unsafe overflow',()=>{expect(derivedRegisteredUsers({...stats,registeredUsersTickStepMin:0,registeredUsersTickStepMax:0},200000)).toBe(100);expect(Number.isNaN(derivedRegisteredUsers({...stats,registeredUsersTickStepMin:100000000,registeredUsersTickStepMax:100000000,registeredUsersTickIntervalSec:1},Number.MAX_SAFE_INTEGER))).toBe(true);});
it('reads the published values envelope without replacing actual counts',()=>{const parsed=parsePlatformPublicStats({serverCanonical:true,source:'server:nx_config_item,nx_user',sourceEnvironment:'PRODUCTION',runId:'',version:1,realUserCount:42,values:stats});expect(publicStatsHealth(parsed.config).membersOk).toBe(true);expect(derivedRegisteredUsers(parsed.config,110000)).toBe(102);expect(parsed.config.realUserCount).toBe(42);expect(parsed.config.fleetDevices).toBe(0);});
it('reads a single-step server as a fixed range',()=>{const {registeredUsersTickStepMin:_min,registeredUsersTickStepMax:_max,...legacy}=stats;const parsed=parsePlatformPublicStats({serverCanonical:true,source:'server:nx_config_item,nx_user',sourceEnvironment:'PRODUCTION',runId:'',version:1,realUserCount:42,values:{...legacy,registeredUsersTickStep:2}});expect(parsed.config.registeredUsersTickStepMin).toBe(2);expect(parsed.config.registeredUsersTickStepMax).toBe(2);expect(derivedRegisteredUsers(parsed.config,130000)).toBe(106);});
// Shared with the server (GrowthPublicStatsServiceTest.rangedTicksMatchTheSharedReferenceVectors): both sides must agree bit for bit.
const anchor=1793163582637;
const ranged={...stats,registeredUsersBase:1420000,registeredUsersAnchorAt:anchor,registeredUsersTickIntervalSec:60,registeredUsersTickStepMin:3,registeredUsersTickStepMax:10};
it('matches the server reference vectors for 60 s, +3 to +10',()=>{
  expect([0,1,2,3,4,5,6,7].map(k=>derivedRegisteredUsers(ranged,anchor+k*60000+59999))).toEqual([1420000,1420006,1420014,1420022,1420029,1420035,1420040,1420047]);
  expect(derivedRegisteredUsers(ranged,anchor+86400000)).toBe(1429363);
  expect(Array.from({length:12},(_,i)=>tickOffset(anchor,i+1,3))).toEqual([0,1,3,3,3,1,2,2,2,3,3,0]);
});
it('adds between the configured bounds every tick and averages the midpoint',()=>{
  let previous=1420000,total=0;const seen=new Set<number>();
  for(let k=1;k<=20000;k++){const value=derivedRegisteredUsers(ranged,anchor+k*60000);const step=value-previous;expect(step).toBeGreaterThanOrEqual(3);expect(step).toBeLessThanOrEqual(10);seen.add(step);total+=step;previous=value;}
  expect([...seen].sort((a,b)=>a-b)).toEqual([3,4,5,6,7,8,9,10]);
  expect(total/20000).toBeCloseTo(6.5,1);
});
