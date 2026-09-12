// Explicit interactive QA: fresh phone authorization; only the requested TA key.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {TASession}=require('../desktop/ta-session.cjs');
const {decodeInput}=require('../desktop/ta-codec.cjs');
const C=require('../app/core.js');

async function main(){
 const code=process.argv[2];if(!/^\|TA\|[a-fA-F0-9]{32}$/.test(code||''))throw new Error('Pass the authorized TA code');
 const helperPath=path.resolve(process.argv[3]||'release/ta-runtime/atlas-ta-helper/atlas-ta-helper.exe');
 let resolveLogin,rejectLogin,previous='',qrSaved=false;
 const login=new Promise((resolve,reject)=>{resolveLogin=resolve;rejectLogin=reject;});
 const session=new TASession({helperPath,onStatus:state=>{
  if(state.stage!==previous){previous=state.stage;console.log(JSON.stringify({stage:state.stage,message:state.message,error:state.error}));}
  if(state.qr_image&&!qrSaved){qrSaved=true;fs.mkdir('user-data',{recursive:true}).then(()=>fs.writeFile('user-data/ta-login-qa.png',Buffer.from(state.qr_image.split(',')[1],'base64'))).then(()=>console.log('QR_READY: user-data/ta-login-qa.png')).catch(rejectLogin);}
  if(['roles_ready','roles_partial'].includes(state.stage)&&state.authenticated&&!state.busy)resolveLogin(state);
  if(state.stage==='error')rejectLogin(new Error(state.error));
  if(state.stage==='qr_expired')rejectLogin(new Error('二维码已过期'));
 }});
 const timer=setTimeout(()=>rejectLogin(new Error('等待手机授权超时')),240000);
 try{
  await session.request('init');
  const servers=session.status().servers;
  console.log(JSON.stringify({servers:servers.length,available:servers.filter(s=>s.available).length}));
  await session.request('qr');
  const logged=await login;clearTimeout(timer);
  console.log(JSON.stringify({selectedServer:logged.selected_server,roles:logged.servers.reduce((n,s)=>n+s.roles.length,0)}));
  assert.ok(logged.selected_avatar,'No returned role selected');
  const data=JSON.parse(await fs.readFile('data/bundle.json','utf8')),results=[];
  for(let i=0;i<2;i++){
   const response=await session.request('query',{code});
   assert.equal(response.share_key,code.slice(4));assert.equal(response.err,0);
   const decoded=decodeInput(response);assert.equal(decoded.ok,true,decoded.error);decoded.origin='official-query';
   const lineup=C.validateLineup(C.adaptTA(decoded,data));
   assert.equal(lineup.code,code);assert.equal(lineup.decodeState,'decoded-server');
   results.push({members:lineup.members.length,title:lineup.title,version:lineup.protocolVersion,ids:lineup.members.map(m=>m.shikigamiId||m.onmyojiId),mainSlots:lineup.members.map(m=>Object.keys(m.config?.mainStats||{}))});
   // Keep the actual payload only in the ignored QA directory.
   if(i===0)await fs.writeFile('user-data/ta-live-response.json',JSON.stringify(response));
  }
  const report={checkedAt:new Date().toISOString(),helperPath,serverCount:servers.length,roles:logged.servers.reduce((n,s)=>n+s.roles.length,0),selectedServer:logged.selected_server,queries:results,logoutCleared:false};
  session.stop();report.logoutCleared=!session.status().authenticated&&!session.status().qr_image&&!session.child;
  await fs.writeFile('verification/ta-live-v040.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{clearTimeout(timer);session.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
