// Explicitly run with Electron and --live. Uses production login, queue, cache,
// codec and adapter. Reports contain lineup data only, never account credentials.
'use strict';
const {app,safeStorage,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {TACredentials}=require('../desktop/ta-credentials.cjs'),{TASession}=require('../desktop/ta-session.cjs');
const {TAQueryQueue}=require('../desktop/ta-query-queue.cjs'),{TAResponseCache}=require('../desktop/ta-response-cache.cjs');
const TA=require('../desktop/ta-codec.cjs'),C=require('../app/core.js'),Errors=require('../app/parse-errors.js');
const root=path.resolve(__dirname,'..'),source=require('../data/excel.json'),data=require('../data/bundle.json');
const profile=path.join(root,'user-data','live-current'),reportFile=path.join(root,'verification','workbook-current.json');
const realProfile=path.join(app.getPath('appData'),'onmyoji-lineup-atlas');
// safeStorage on Windows also uses Chromium's profile key. Any credentials
// intended for the installed app must be encrypted in that same profile.
app.setPath('userData',process.argv.includes('--live')?realProfile:profile);
let session,win,finished=false,epoch=0,authenticated=false,waiter=null,screen={};
const rows=[...new Map(source.entries.map(e=>[C.normalizeCode(e.code),C.inspectCode(e.code)])).values()].map(r=>({
  ...r,format:C.classifyCode(r.code),sources:source.entries.filter(e=>C.normalizeCode(e.code)===r.code).map(e=>({sourceFile:e.sourceFile,sheet:e.sheet,row:e.row,cell:e.cell,title:e.title})),
 status:'not-queried',reason:'尚未取得手机扫码授权，未向服务器查询此码'
}));
// A follow-up login check or format-only audit must not erase real results.
if(fs.existsSync(reportFile)){
 const previous=JSON.parse(fs.readFileSync(reportFile,'utf8'));
 if(previous.sourceSha256===source.sha256)for(const row of rows){const old=previous.rows?.find(r=>r.code===row.code);if(old&&old.status!=='not-queried')Object.assign(row,old);}
}
const archived=require('../verification/workbook-v073.json'),archivedSource=(source.sources||[]).find(s=>s.sha256===archived.sourceSha256);
if(archivedSource){const allowed=new Set(source.entries.filter(e=>e.sourceFile===archivedSource.source).map(e=>e.code));for(const row of rows){const old=archived.rows.find(r=>r.code===row.code&&r.status==='decoded');if(row.status==='not-queried'&&allowed.has(row.code)&&old)Object.assign(row,{...old,sources:row.sources});}}
const report={version:require('../package.json').version,source:source.source,sources:source.sources,sourceSha256:source.sha256,occurrences:source.occurrences,uniqueCodes:rows.length,startedAt:new Date().toISOString(),mode:process.argv.includes('--live')?'live':'format-only',session:{phoneConfirmed:false,remembered:false,restoredWithoutScan:false},rows};
function save(){
 report.counts=Object.fromEntries([...new Set(rows.map(r=>r.status))].map(s=>[s,rows.filter(r=>r.status===s).length]));
 fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile+'.tmp',JSON.stringify(report,null,2));fs.renameSync(reportFile+'.tmp',reportFile);
  fs.writeFileSync(path.join(profile,'progress.json'),JSON.stringify({counts:report.counts,session:report.session,stage:screen.stage,message:screen.message,error:screen.error,completed:finished}));
  if(finished&&report.mode==='live'){
   const file=path.join(root,'verification','login-pc-v073.json');
   const audit=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{attempts:[]};
   const attempt={startedAt:report.startedAt,completedAt:report.completedAt||new Date().toISOString(),qrCv:'c4.19.1',qrRemember:'2',resumeOnly:process.argv.includes('--resume-only'),stoppedReason:report.stoppedReason||'',...report.session};
   const index=audit.attempts.findIndex(a=>a.startedAt===report.startedAt);if(index<0)audit.attempts.push(attempt);else audit.attempts[index]=attempt;
   fs.writeFileSync(file,JSON.stringify(audit,null,2));
  }
}
function display(){if(!win||win.isDestroyed())return;const value={message:screen.error||screen.message||'',qr:screen.qr_image||'',counts:report.counts||{},remembered:report.session.remembered};win.webContents.executeJavaScript('window.showStatus('+JSON.stringify(value)+')').catch(()=>{});}
function status(value){
 screen=value;
 if(value.authenticated!==authenticated){authenticated=value.authenticated;epoch++;}
 if(value.qr_image){const match=value.qr_image.match(/^data:image\/png;base64,(.+)$/);if(match)fs.writeFileSync(path.join(profile,'login-qr.png'),Buffer.from(match[1],'base64'));}
 save();display();
 if(waiter&&value.authenticated&&!value.busy&&value.selected_avatar){const resolve=waiter;waiter=null;resolve();}
}
async function waitForPhone(){
 await session.request('init');
 for(let attempt=0;attempt<6;attempt++){
  let timer;const ready=new Promise((resolve,reject)=>{waiter=resolve;timer=setTimeout(()=>{waiter=null;reject(new Error('等待手机确认超时'));},185000);});
  ready.catch(()=>{});
  try{await session.request('qr');await ready;report.session.phoneConfirmed=true;return;}
  catch(error){if(screen.stage!=='qr_expired'||attempt===5)throw error;}
  finally{clearTimeout(timer);waiter=null;}
 }
}
async function main(){
  await app.whenReady();fs.mkdirSync(profile,{recursive:true});
  for(const s of source.sources||[source]){const workbook=path.join(root,s.source),hash=crypto.createHash('sha256').update(fs.readFileSync(workbook)).digest('hex');if(hash!==s.sha256)throw new Error('工作簿已变化，必须重新提取单元格后再查询：'+s.source);}
 for(const row of rows)if(row.format!=='pipe-ta'){row.status='invalid-format';row.reason='格式未通过校验，未发送请求';}
 save();if(!process.argv.includes('--live')){console.log(JSON.stringify({formatOnly:true,uniqueCodes:rows.length,invalid:rows.filter(r=>r.status==='invalid-format').length}));app.exit(0);return;}
  // Keep live verification independent of rebuilding the packaged helper.
  const runtime=path.join(profile,'ta-runtime');
  fs.cpSync(path.join(root,'release','ta-runtime','atlas-ta-helper'),runtime,{recursive:true});
  win=new BrowserWindow({width:640,height:660,show:true,autoHideMenuBar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>御契 · 保存登录实际验证</title><style>body{font:16px "Microsoft YaHei",sans-serif;padding:24px;background:#101820;color:#eee}img{width:280px;height:280px;display:block;margin:20px auto;background:white}p{line-height:1.7}pre{white-space:pre-wrap}</style><h2>保存登录实际验证</h2><p>用阴阳师手游扫描，并在手机勾选记住登录。二维码过期后会自动刷新；关闭窗口可结束验证。</p><p>'+(process.argv.includes('--remember-only')?'本次检查免扫码续用，并查询一个已有阵容码核验角色连接。':'确认登录后将查询两份表格中尚未取得结果的原码。')+'</p><img id="qr" hidden><p id="message">正在准备…</p><pre id="counts"></pre><script>window.showStatus=s=>{document.getElementById("message").textContent=s.message;const img=document.getElementById("qr");img.hidden=!s.qr;if(s.qr)img.src=s.qr;document.getElementById("counts").textContent=JSON.stringify(s.counts,null,2);}</script>'));
 win.on('closed',()=>{if(!finished){report.stoppedReason='验证窗口已关闭';session?.stop();app.quit();}});
 const credentials=new TACredentials({file:path.join(realProfile,'remembered-accounts.bin'),safeStorage});
 const accept=credentials.accept.bind(credentials);
 credentials.accept=event=>{
   const user=event.credentials?.mpay_user,ext=user?.pc_ext_info,flag=ext?.is_remember;
   report.session.channelObservations??=[];
   report.session.channelObservations.push({stage:screen.stage,serverId:event.server_id,invalidate:event.invalidate===true,loginChannel:user?.login_channel,loginType:user?.login_type,
    source:Object.fromEntries(['src_client_type','src_app_channel','src_app_channel2','src_sdk_version','src_pay_channel'].filter(k=>ext&&Object.hasOwn(ext,k)).map(k=>[k,ext[k]]))});
  report.session.rememberDiagnostics={userFieldNames:Object.keys(user||{}),extensionFieldNames:Object.keys(ext||{}),flagType:typeof flag,flag:[true,false,0,1,'true','false','0','1'].includes(flag)?flag:'missing-or-other'};
  report.session.consentObservation=event.consent_observation;
  accept(event);report.session.storageError=credentials.status().storage_error;
 };
  session=new TASession({helperPath:path.join(runtime,'atlas-ta-helper.exe'),credentials,onStatus:status});
 const cache=new TAResponseCache(path.join(realProfile,'ta-responses'));
  if(credentials.data.activeId){try{await session.resume(credentials.data.activeId);report.session.restoredWithoutScan=true;}catch(error){if(process.argv.includes('--resume-only'))throw error;}}
  if(!session.status().authenticated){if(process.argv.includes('--resume-only'))throw new Error('重启后未能免扫码恢复');await waitForPhone();}
  const active=session.status().current_account;
  report.session.remembered=credentials.status().remembered_accounts.some(a=>a.id===active&&!a.needs_login);
  if(process.argv.includes('--remember-only')&&report.session.phoneConfirmed){
   try{const reply=await session.request('query',{code:rows.find(r=>r.status==='decoded').code});report.session.freshRoleQuery={success:reply.err===0,serverCode:reply.err};}
   catch(error){report.session.freshRoleQuery={success:false,error:error.message};}
  }
 if(report.session.remembered&&!report.session.restoredWithoutScan){
  await session.resume(active);report.session.restoredWithoutScan=session.status().authenticated===true;
 }
  if(process.argv.includes('--remember-only')&&report.session.restoredWithoutScan){
   const reply=await session.request('query',{code:rows.find(r=>r.status==='decoded').code});
   report.session.restoredRoleQuery={success:reply.err===0,serverCode:reply.err};
   if(reply.err!==0)throw new Error('免扫码恢复后的角色查询未通过：'+reply.err);
  }
  const queryEpoch=epoch,check=()=>{if(!session.status().authenticated||epoch!==queryEpoch)throw new Error('当前登录会话已结束，剩余阵容码未查询');};
 const queue=new TAQueryQueue({execute:code=>session.request('query',{code})});
 let consecutiveTemporary=0;
 for(const row of rows){
  if(process.argv.includes('--remember-only'))break;
   if(['invalid-format','decoded'].includes(row.status))continue;check();const started=Date.now();
  try{
   const cached=await cache.read(row.code),response=cached||await queue.query(row.code,check);check();
   row.source=cached?'cached-official-response':'live-official-response';row.attempts=cached?0:response.queryAttempts;row.serverCode=response.err;row.fetchedAt=cached?.fetchedAt||new Date().toISOString();
   if(!cached&&response.err===0)await cache.write(row.code,response,check);
   const parsed=TA.decodeInput(response);
   if(parsed.ok){parsed.origin='official-query';const lineup=C.validateLineup(C.adaptTA(parsed,data));row.status='decoded';row.reason='取得并解析官方阵容内容';row.lineup=lineup;consecutiveTemporary=0;}
   else{row.status=parsed.failure?.kind||parsed.state;row.reason=parsed.error;consecutiveTemporary=response.err===90011?consecutiveTemporary+1:0;}
  }catch(error){row.status='query-error';row.reason=error.message;}
  row.durationMs=Date.now()-started;save();display();
  // Pause a repeatedly rejecting service instead of looking for its threshold.
  if(consecutiveTemporary>=3){report.stoppedReason='连续三个不同原码均返回暂时拒绝，已暂停本轮请求';break;}
 }
 finished=true;report.completedAt=new Date().toISOString();session.stop('实际验证结束；已记住的账号仍可在软件使用');
 for(const row of rows)if(row.status==='not-queried')row.reason=report.stoppedReason||'本轮未取得可查询会话';
 save();console.log(JSON.stringify({report:reportFile,counts:report.counts,session:report.session}));win?.destroy();app.quit();
}
main().catch(error=>{report.stoppedReason=error.message;for(const row of rows)if(row.status==='not-queried')row.reason=error.message;finished=true;session?.stop();try{save();}catch{}console.log(JSON.stringify({report:reportFile,error:error.message}));app.exit(1);});
app.on('before-quit',()=>session?.stop());
