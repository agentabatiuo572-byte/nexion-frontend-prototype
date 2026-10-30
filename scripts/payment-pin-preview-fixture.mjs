// Optional loopback-only frontend preview data. This is not a product service or a payment implementation.
import http from 'node:http';
import { createPaymentPinFlowFixture } from './lib/payment-pin-flow-fixture.mjs';
const fixture=createPaymentPinFlowFixture();fixture.state.loggedIn=true;
const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536){res.writeHead(413);res.end();return;}}
  try{
    const result=fixture.handle(new URL(req.url,'http://127.0.0.1:8338'),{method:()=>req.method,headers:()=>req.headers,postDataJSON:()=>raw?JSON.parse(raw):{}});
    res.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({code:result.status===200?0:result.status,message:result.message,data:result.data}));
  }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({code:500,message:'FRONTEND_FIXTURE_ERROR',data:null}));}
});
server.listen(8338,'127.0.0.1',()=>console.log('Frontend preview fixture: 127.0.0.1:8338; synthetic data only; no database or real payment.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
