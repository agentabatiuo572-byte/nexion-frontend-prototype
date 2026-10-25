import { describe, expect, it } from 'vitest';
import type { CanonicalQuest, QuestSnapshot } from '@/api/quest-api';
import { homeTaskSummary } from './home-task-summary';
const now = Date.parse('2026-10-25T00:00:00Z');
function snapshot(): Pick<QuestSnapshot, 'quests' | 'dayOneRewardNex' | 'dayOneRequiredTaskCount' | 'dayOneSnapshotStatus'> {
  return { dayOneRewardNex:500, dayOneRequiredTaskCount:6, dayOneSnapshotStatus:'SNAPSHOT', quests:Array.from({length:6},(_,i) => ({questCode:`task-${i}`, name:`Task ${i}`, layer:'DAY_ONE', rewardNex:0, status:i<3?'COMPLETED':'PENDING', category:'explore', actionRoute:'/pages/learn/courses', instanceKey:'DAY_ONE:test', eligibleFrom:new Date(now-3600000).toISOString(), eligibleUntil:new Date(now+18*3600000).toISOString(), eligible:true} as CanonicalQuest)) };
}
describe('home newcomer action summary', () => {
  it('uses the frozen denominator, including claimed and claimable members', () => {
    const data = snapshot(); data.quests[0].status='CLAIMED'; data.quests[0].eligible=false; data.quests[1].status='CLAIMABLE';
    expect(homeTaskSummary(data,now)).toMatchObject({done:3,total:6,reward:500,remainingHours:18,claimable:false});
  });
  it('keeps a completed group actionable until its reward is claimed', () => {
    const data = snapshot(); data.quests.forEach(row=>row.status='COMPLETED');
    expect(homeTaskSummary(data,now)).toMatchObject({done:6,total:6,claimable:true});
    data.quests.forEach(row=>{row.status='CLAIMED';row.eligible=false;});
    expect(homeTaskSummary(data,now)).toBeNull();
  });
  it('does not show expired, future or empty groups as to-dos', () => {
    const data = snapshot();
    expect(homeTaskSummary(data,now+18*3600000)).toBeNull();
    expect(homeTaskSummary(data,now-2*3600000)).toBeNull();
    data.quests=[]; data.dayOneSnapshotStatus='EMPTY'; data.dayOneRequiredTaskCount=0;
    expect(homeTaskSummary(data,now)).toBeNull();
  });
  it('does not invent totals or reward claims for legacy or inconsistent snapshots', () => {
    const data = snapshot(); data.dayOneSnapshotStatus='LEGACY_UNVERIFIED'; data.dayOneRequiredTaskCount=null;
    expect(homeTaskSummary(data,now)).toMatchObject({done:null,total:null,reward:null,claimable:false});
    const inconsistent = snapshot(); inconsistent.quests.pop();
    expect(homeTaskSummary(inconsistent,now)).toMatchObject({done:null,total:null,reward:null});
  });
  it('shows countdown only in the final day and never rounds remaining time to zero', () => {
    const data = snapshot(); data.quests.forEach(row=>row.eligibleUntil=new Date(now+25*3600000).toISOString());
    expect(homeTaskSummary(data,now)).toMatchObject({remainingHours:null,remainingMinutes:null});
    expect(homeTaskSummary(data,now+25*3600000-1000)).toMatchObject({remainingHours:null,remainingMinutes:1});
  });
});
