// Loopback-only presentation server. No request is proxied to a real backend.
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { installFormalProbeSession } from './lib/formal-probe-session.mjs';
import { demoDefaults, demoFixture, demoOptions } from './lib/prototype-demo-data.mjs';
const root=path.resolve(process.env.DEMO_BUILD_ROOT||path.join(import.meta.dirname,'../dist/build/h5'));
const port=Number(process.env.DEMO_PORT||5190);
const state=structuredClone(demoDefaults),routes=[],init=[];
let locale='zh';
await installFormalProbeSession({addInitScript:async(fn,arg)=>init.push('('+fn.toString()+')('+JSON.stringify(arg)+');'),route:async(matcher,handler)=>routes.push({matcher,handler}),routeWebSocket:async()=>{}},{responseFor:(url,request)=>demoFixture(url,locale,state,request)});
const seed='<script>'+init.join('\n')+"for(const [key,data] of [['nexgrid-locale-v1',{code:'zh',userSet:true}],['nexgrid-theme-v1',{mode:'dark'}]]){if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({type:'object',data}));}</script>";
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.mp4':'video/mp4'};
const sendJson=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':mime['.json']});res.end(JSON.stringify(value));};
const modeledWrite=/^\/(auth\/users\/refresh|api\/(me\/notification-preferences|goals(?:\/\d+(?:\/status)?)?|orders(?:\/(quote|bundle|DEMO-ORDER-\d+\/(pay|cancel)))?|withdrawals\/eligibility|points\/sign-in|points\/streak-saver\/use|earnings\/milestones\/evaluate|points\/milestones\/\d+\/claim|points\/power-ups\/\d+\/activate|quests\/[^/]+\/claim|trial\/start|vouchers\/V-DESIGN\/claim|events\/demo-[^/]+\/(join|claim|spin|reminder)|events\/genesis-raffle\/demo-draw-0\/enter|content\/trust\/sections\/[^/]+\/view|content\/learning\/courses\/review-course-\d\/(start|complete|quiz)|notifications\/(read|read-all|\d+\/(read|actions))|app\/support\/conversations(?:\/DEMO-SUPPORT-\d+\/(read|replies|dismiss))?|app\/team\/ambassador-applications|app\/trade-in\/(eligibility|capacity-quote)))$/;
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    res.setHeader('Cache-Control','no-store');
    if(url.pathname==='/preview'){res.setHeader('Content-Type',mime['.html']);return res.end(await readFile(path.join(import.meta.dirname,'prototype-preview.html')));}
    if(url.pathname==='/__demo/state') {
      if(req.method==='POST') {
        let body='';for await(const chunk of req)body+=chunk;
        const update=JSON.parse(body||'{}');
        if(update.reset){for(const key of Object.keys(state))delete state[key];Object.assign(state,structuredClone(demoDefaults));}
        for(const [key,options] of Object.entries(demoOptions)) if(options.some(([value])=>value===update[key]))state[key]=update[key];
        if(update.taskState)for(const key of ['weekClaims','dayOneClaimed'])delete state[key];
        if(update.streakState){delete state.saverUsed;state.checkedIn=false;state.milestoneClaims=[];}
        if(typeof update.allCoursesDone==='boolean'){delete state.learningResults;delete state.learningReceipts;}
        if(update.ambassadorState)for(const key of ['ambassadorSubmission','ambassadorCommands'])delete state[key];
        if(update.eventState)for(const key of ['eventStatuses','reminders','spun','spinHistory','raffleEntries'])delete state[key];
        if(update.benefitState)for(const key of ['trialStarted','voucherClaimed','voucherUsed'])delete state[key];
        if(typeof update.highestRank==='boolean')state.highestRank=update.highestRank;
        if(typeof update.allCoursesDone==='boolean')state.completed=update.allCoursesDone?[1,2,3]:[];
      }
      return sendJson(res,{state,options:demoOptions,simulation:true});
    }
    if(url.pathname==='/preview-language'){locale=['zh','en','vi'].includes(url.searchParams.get('code'))?url.searchParams.get('code'):'zh';return res.end('OK');}
    if(/^\/(api|auth)\//.test(url.pathname)) {
      if(url.pathname==='/auth/users/refresh')return sendJson(res,{code:0,message:'OK',data:{accessToken:'local-demo-token',refreshToken:null,tokenType:'Bearer',user:{userId:900001,countryCode:'+86',phone:'13800000000',nickname:'Alex',onboardingComplete:true}}});
      if(req.method!=='GET'&&!modeledWrite.test(url.pathname))return sendJson(res,{code:409,message:'该演示操作尚未配置，请使用外侧面板切换状态',data:null},409);
      const businessRead=req.method==='GET'&&/^\/api\/(config\/(platform|v-rank|exchange|repurchase|staking|commission)|store\/(catalog|purchase-eligibility)|team\/(rank|binary)|app\/(team|payments|deposits|home\/overview|proof|network|security|support|developer)|content\/(learning|trust|how-it-works)|quests\/state|events|points\/state|devices\/earnings|exchange|repurchase|withdrawals|payout-addresses|deposits|notifications|goals|promotions|promotion-rewards|tasks|payment-methods|developer|public\/referrals|legal\/(privacy|risk)|staking|stakes)/.test(url.pathname);
      if(businessRead&&state.dataState==='error')return sendJson(res,{code:503,message:'暂时无法加载，请重试',data:null},503);
      if(businessRead&&state.dataState==='loading')await new Promise(resolve=>setTimeout(resolve,5000));
      let body='';for await(const chunk of req)body+=chunk;
      if(url.pathname==='/api/legal/terms/current')return sendJson(res,{code:0,message:'OK',data:demoFixture(url,locale,state,{method:()=>req.method,postDataJSON:()=>({}),headers:()=>req.headers})});
      for(const route of [...routes].reverse()) {
        if(route.matcher!=='**/*'&&!route.matcher(url))continue;
        await route.handler({request:()=>({url:()=>url.href,method:()=>req.method,headers:()=>req.headers,postDataJSON:()=>JSON.parse(body||'{}')}),fulfill:async response=>{res.writeHead(response.status||200,{'Content-Type':response.contentType||mime['.json']});res.end(response.body);},continue:async()=>{}});
        if(res.writableEnded)return;
      }
      return sendJson(res,{code:404,message:'暂无演示内容',data:null},404);
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(url.pathname==='/'||(await stat(file).catch(()=>null))?.isDirectory())file=path.join(file,'index.html');
    const bytes=await readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.end(path.extname(file)==='.html'?bytes.toString().replace('<head>','<head>'+seed):bytes);
  }catch(error){console.error(req.method,req.url,error.message);if(Number.isInteger(error.status)&&error.status>=400&&error.status<600)return sendJson(res,{code:error.status,message:error.message,data:null},error.status);res.writeHead(error.code==='ENOENT'?404:500);res.end('Preview resource unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('UVEL simulation: http://127.0.0.1:'+port+'/preview'));
