// Exercises the actual loopback simulation server and real built UI.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:5190';
const output=path.resolve(process.env.DESIGN_OUTPUT||'../uvel-design-preview/evidence/demo');
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),records=[],errors=[];
const routes=['index/index','store/store','missions/missions','events/events','events/events?source=legacy','daily/daily','me/achievements','learn/courses','genesis/genesis','me/devices','store/orders','me/wallet','me/wallet-bills','me/rewards','team/team','team/rank','earn/earn','me/me','me/notifications?section=notifications','trust/trust','me/security'];
routes.push('team/commissions','team/leaderboard','team/leadership-pool','events/promotion-rewards','events/genesis-raffle',...['stellarbox-s1','stellarbox-pro','stellarbox-pro-v2','stellarrack-p1','stellarrack-p2','cloud-share'].map(id=>'store/detail?id='+id));
routes.push('me/goals','me/receipts','me/wallet-cards','me/profile','me/support','me/preferences');
const readyText={'index/index':/2\s*\/\s*6/,'learn/courses':/认识算力作业/,'me/wallet':/52800.64/,'me/me':/52800.64/,'earn/earn':/2\s*\/\s*6/,'team/team':/UVELDEMO/,'store/store':/Cloud Share/,'team/commissions':/250/,'team/leaderboard':/Maya/,'team/leadership-pool':/周池/,'events/genesis-raffle':/已开奖记录/,'events/promotion-rewards':/UVEL\s*Box S1/};
try {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.request.post(base+'/__demo/state',{data:{reset:true}});
  for(const [index,route] of routes.entries()){
    await page.goto(base+'/?nx_device=off&demoView='+index+'#/pages/'+route,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.body.innerText.trim().length>0);
    if(readyText[route])await page.getByText(readyText[route],{exact:false}).first().waitFor({state:'visible'});
    await page.waitForFunction(()=>!/(正在加载教程中心|正在读取设备|正在读取数据)/.test(document.body.innerText));
    await page.evaluate(()=>document.fonts.ready);
    const text=await page.locator('body').innerText();
    assert.ok(text.trim().length>0,route+' rendered');
    const key=route.replace(/[^a-z0-9-]/gi,'-');
    await page.screenshot({animations:'disabled',path:path.join(output,key+'.png')});
    records.push({route,text});
    await writeFile(path.join(output,'routes-report.json'),JSON.stringify({records,errors},null,2));
    console.log(route+': '+text.replace(/\s+/g,' ').slice(0,150));
  }
  await writeFile(path.join(output,'routes-report.json'),JSON.stringify({records,errors},null,2));
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
