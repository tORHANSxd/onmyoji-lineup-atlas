// Exercise the production IPC handlers with an isolated filesystem and mock
// window. No GUI control, account fixtures or outbound requests are involved.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
async function harness(fetcher=async()=>new Response('{}'),{signedIn=true,fsProxy,remembered=false}={}){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-ipc-test-')),handlers={};let external=[],ready,ta;const copied=[];const loaded=new Promise(resolve=>ready=resolve);
 class Window{constructor(){this.webContents={setWindowOpenHandler(fn){this.open=fn;},on(){},send(){}};}isDestroyed(){return false;}loadURL(){ready();}}
 const protocols={};const electron={app:{getPath:()=>tmp,setPath(){},whenReady:()=>Promise.resolve(),on(){}},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{showSaveDialog:async()=>({canceled:false,filePath:path.join(tmp,'backup.json')})},shell:{openExternal:u=>external.push(u)},session:{defaultSession:{setPermissionRequestHandler(){}}},protocol:{registerSchemesAsPrivileged(){},handle:(name,handler)=>protocols[name]=handler},net:{fetch:u=>u},nativeImage:{},clipboard:{writeText:async code=>copied.push(code)}};
 const dirname=path.resolve('desktop');
 vm.runInNewContext(fs.readFileSync('desktop/main.cjs','utf8'),{require:n=>n==='electron'?electron:n==='node:fs/promises'&&fsProxy?fsProxy:n==='./ta-query-queue.cjs'?{TAQueryQueue:class extends require('../desktop/ta-query-queue.cjs').TAQueryQueue{constructor(options){super({...options,intervalMs:0,cooldownMs:0,retryDelays:[0,0]});}}}:n==='./ta-session.cjs'?{TASession:class extends require('../desktop/ta-session.cjs').TASession{constructor(options){super(options);ta=this;if(remembered){this.credentials.data.activeId='a'.repeat(64);this.startupResumes=0;this.resume=async()=>this.startupResumes++;}}}}:require(n.startsWith('.')?path.join(dirname,n):n),__dirname:dirname,process:{argv:[],env:{}},fetch:fetcher,AbortSignal,Buffer,console,setTimeout:()=>0,setInterval:()=>({unref(){}}),URL,Response},{filename:'desktop/main.cjs'});
 await loaded;
 const event={senderFrame:{url:pathToFileURL(path.resolve('app/index.html')).href}};
 const signIn=()=>{const accepted=handlers['ta-action'](event,'risk',{accepted:true});ta.state={...ta.state,authenticated:true};ta.emit();return accepted;};if(signedIn)await signIn();
 return {handlers,event,tmp,protocols,copied,ta,signIn,dialog:electron.dialog,clipboard:electron.clipboard,cleanup:()=>{assert.ok(tmp.startsWith(path.join(os.tmpdir(),'atlas-ipc-test-')));fs.rmSync(tmp,{recursive:true,force:true});}};
}
test('Windows实际原子写入支持覆盖与并发保存顺序',async()=>{const h=await harness();try{assert.equal(await h.handlers['load-state'](h.event),null);await h.handlers['save-state'](h.event,{schemaVersion:1,notes:'初次中文保存'});await Promise.all([h.handlers['save-state'](h.event,{revision:2}),h.handlers['save-state'](h.event,{revision:3})]);const loaded=await h.handlers['load-state'](h.event);assert.equal(loaded.revision,3);assert.equal(fs.existsSync(path.join(h.tmp,'library-v1.json.tmp')),false);await h.handlers['export-json'](h.event,{name:'backup.json',data:loaded});assert.equal(JSON.parse(fs.readFileSync(path.join(h.tmp,'backup.json'))).revision,3);}finally{h.cleanup();}});
test('IPC拒绝外部页面读取和写入本地状态',async()=>{const h=await harness();try{await assert.rejects(h.handlers['load-state']({senderFrame:{url:'https://example.com'}}),/不受信任/);await assert.rejects(h.handlers['save-state']({senderFrame:{url:'file:///other.html'}},{}),/不受信任/);}finally{h.cleanup();}});
test('本地页片段导航不破坏保存权限',async()=>{const h=await harness();try{const e={senderFrame:{url:h.event.senderFrame.url+'#library'}};await h.handlers['save-state'](e,{revision:1});assert.equal((await h.handlers['load-state'](e)).revision,1);}finally{h.cleanup();}});
test('桌面本地解析与分享键分流均不请求第三方',async()=>{let count=0;const h=await harness(async()=>{count++;throw new Error('No outbound requests permitted');});try{const pending=await h.handlers.decode(h.event,'|TA|opaque-key');assert.equal(pending.state,'lookup-required');const v=require('./fixtures/ta-vectors.json')[0],decoded=await h.handlers.decode(h.event,'#TA#'+v.payload);assert.equal(decoded.ok,true);assert.deepEqual(decoded.data,v.expected);assert.equal(count,0);}finally{h.cleanup();}});
test('非法输入拒绝，外部页不能解析或触发更新',async()=>{const h=await harness();try{assert.equal((await h.handlers.decode(h.event,'bad')).ok,false);const external={senderFrame:{url:'https://example.com'}};await assert.rejects(h.handlers.decode(external,'#TA#abc'),/不受信任/);await assert.rejects(h.handlers['official-refresh'](external,{}),/不受信任/);await assert.rejects(h.handlers['official-auto'](external,true),/不受信任/);}finally{h.cleanup();}});
test('官方缓存资源协议仅允许哈希图片，不能读取账号或任意文件',async()=>{const h=await harness();try{const handler=h.protocols['atlas-asset'];for(const url of ['atlas-asset://cache/library-v1.json','atlas-asset://other/'+'a'.repeat(64)+'.png','atlas-asset://cache/%2e%2e%2flibrary-v1.json','atlas-asset://cache/'+'a'.repeat(64)+'.png?path=x'])assert.equal((await handler({url})).status,404);const url=await handler({url:'atlas-asset://cache/'+'a'.repeat(64)+'.png'});assert.ok(url.startsWith(pathToFileURL(path.join(h.tmp,'official-cache','images')).href));}finally{h.cleanup();}});
test('自动更新选择可持久保存且账户状态互不覆盖',async()=>{const h=await harness();try{await h.handlers['save-state'](h.event,{accounts:[{id:'synthetic'}]});const s=await h.handlers['official-auto'](h.event,false);assert.equal(s.autoUpdate,false);assert.equal(JSON.parse(fs.readFileSync(path.join(h.tmp,'official-cache','settings.json'))).autoUpdate,false);assert.equal((await h.handlers['load-state'](h.event)).accounts.length,1);}finally{h.cleanup();}});
test('本地页通过受限IPC完整复制长短阵容码',async()=>{const h=await harness();try{for(const code of ['|TA|opaque-key','#TA#'+require('./fixtures/ta-vectors.json')[0].payload]){assert.equal((await h.handlers['copy-code'](h.event,code)).copied,true);assert.equal(h.copied.at(-1),code);}}finally{h.cleanup();}});
test('外部来源、空值与超大内容不能写入剪贴板',async()=>{const h=await harness();try{await assert.rejects(h.handlers['copy-code']({senderFrame:{url:'https://example.com'}},'|TA|key'),/不受信任/);for(const code of [null,42,'',' \n','x'.repeat(32*1024*1024+1)])await assert.rejects(h.handlers['copy-code'](h.event,code),/阵容码为空或超过/);assert.equal(h.copied.length,0);}finally{h.cleanup();}});
test('复制成功必须等待Electron异步写入，失败不可提前报告成功',async()=>{const h=await harness();try{let complete,settled=false;h.clipboard.writeText=()=>new Promise(resolve=>complete=resolve);const copy=h.handlers['copy-code'](h.event,'|TA|async-key').then(r=>{settled=true;return r;});await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);complete();assert.equal((await copy).copied,true);h.clipboard.writeText=async()=>{throw new Error('Clipboard unavailable');};await assert.rejects(h.handlers['copy-code'](h.event,'|TA|async-key'),/Clipboard unavailable/);}finally{h.cleanup();}});
test('外部页面不能读取登录状态、扫码、查询或退出会话',async()=>{const h=await harness();try{let called=0;h.ta.request=async()=>called++;const e={senderFrame:{url:'https://example.com'}};for(const name of ['ta-status','ta-action','ta-query','ta-logout'])await assert.rejects(h.handlers[name](e,'query',{}),/不受信任/);assert.equal(called,0);}finally{h.cleanup();}});
test('文字码查询经过原解码器并保持原码，错配和错误响应不能成功',async()=>{const h=await harness();try{const code='|TA|'+'a'.repeat(32),response={code,err:0,share_key:code.slice(4),lineup_data:require('./fixtures/ta-vectors.json')[9].payload};h.ta.request=async(action,params)=>{assert.equal(action,'query');assert.equal(params.code,code);return response;};const r=await h.handlers['ta-query'](h.event,code);assert.equal(r.ok,true);assert.equal(r.origin,'official-query');assert.equal(r.code,code);assert.equal(r.kinds.length,6);for(const bad of [{...response,share_key:'b'.repeat(32)},{...response,code:'|TA|'+'b'.repeat(32)}]){h.ta.request=async()=>bad;await assert.rejects(h.handlers['ta-query'](h.event,code,{force:true}),/不一致/);}}finally{h.cleanup();}});
test('登录IPC仅开放约定操作，退出后状态不可持久化为已登录',async()=>{const h=await harness();try{await assert.rejects(h.handlers['ta-action'](h.event,'shell',{}),/不支持/);const s=await h.handlers['ta-logout'](h.event);assert.equal(s.authenticated,false);assert.equal(s.qr_image,'');assert.equal(await h.handlers['load-state'](h.event),null);assert.equal(fs.existsSync(path.join(h.tmp,'library-v1.json')),false);}finally{h.cleanup();}});
test('生产IPC将暂时失败有限重试，过期与未知错误按结构返回',async()=>{
 const h=await harness();try{const code='|TA|'+'a'.repeat(32);for(const [err,kind,count] of [[90011,'retry-later',3],[31279,'expired-code',1],[17,'server-error',1]]){
  let calls=0;h.ta.request=async()=>{calls++;return {code,share_key:code.slice(4),err};};const r=await h.handlers['ta-query'](h.event,code);
  assert.equal(r.ok,false);assert.equal(r.failure.kind,kind);assert.equal(calls,count);assert.equal(r.failure.attempts,count);
 }}finally{h.cleanup();}
});
test('切换已有角色后丢弃旧角色的在途结果',async()=>{
 const h=await harness();try{let finish;const code='|TA|'+'a'.repeat(32);h.ta.request=()=>new Promise(r=>finish=r);const query=h.handlers['ta-query'](h.event,code),rejected=assert.rejects(query,/请先扫码登录|会话已变化/);
  while(!finish)await new Promise(r=>setTimeout(r,2));h.ta.state={...h.ta.state,selected_avatar:'new-role'};h.ta.emit();finish({code,share_key:code.slice(4),err:31279});await rejected;
 }finally{h.cleanup();}
});
test('离线可读写本地库、复制及读取图片；解析仍必须登录',async()=>{
 const h=await harness(undefined,{signedIn:false});try{
  let queries=0;h.ta.request=async()=>queries++;
  await h.handlers['save-state'](h.event,{accounts:[{id:'offline'}]});assert.equal((await h.handlers['load-state'](h.event)).accounts[0].id,'offline');
  assert.ok((await h.handlers['load-data'](h.event)).lineups.length);assert.equal((await h.handlers['copy-code'](h.event,'|TA|offline')).copied,true);
  for(const [name,args]of Object.entries({decode:['#TA#x'],'ta-query':['|TA|'+'a'.repeat(32)],'save-parsed-state':[{}]}))await assert.rejects(h.handlers[name](h.event,...args),/请先扫码登录/);
  assert.equal(queries,0);assert.equal(typeof h.protocols['atlas-asset']({url:'atlas-asset://cache/'+'a'.repeat(64)+'.png'}),'string');
 }finally{h.cleanup();}
});
test('本地快照不提供登录权限，注销后库仍可访问',async()=>{
 const h=await harness(undefined,{signedIn:false});try{
  await h.handlers['save-state'](h.event,{authenticated:true,accounts:[{id:'synthetic'}]});assert.equal((await h.handlers['ta-status'](h.event)).authenticated,false);
  h.signIn();await h.handlers['ta-logout'](h.event);assert.equal((await h.handlers['load-state'](h.event)).accounts.length,1);await assert.rejects(h.handlers.decode(h.event,'#TA#x'),/请先扫码登录/);
 }finally{h.cleanup();}
});
test('注销阻止旧解析结果落盘，但不撤销用户的离线导出',async()=>{
 const h=await harness();try{
  const pendingSave=h.handlers['save-parsed-state'](h.event,{revision:1});await h.handlers['ta-logout'](h.event);await assert.rejects(pendingSave,/请先扫码登录/);assert.equal(fs.existsSync(path.join(h.tmp,'library-v1.json')),false);
  h.signIn();let finish;h.dialog.showSaveDialog=()=>new Promise(resolve=>finish=resolve);const pendingExport=h.handlers['export-json'](h.event,{name:'export.json',data:{private:'synthetic'}});
  await h.handlers['ta-logout'](h.event);h.signIn();finish({canceled:false,filePath:path.join(h.tmp,'should-not-exist.json')});await pendingExport;assert.equal(fs.existsSync(path.join(h.tmp,'should-not-exist.json')),true);
 }finally{h.cleanup();}
});
test('临时文件写入中注销会丢弃旧快照，新会话读取等待写入队列',async()=>{
 const real=require('node:fs/promises');let release,entered,slow=false;const pending=new Promise(resolve=>entered=resolve);
 const h=await harness(undefined,{fsProxy:{...real,writeFile:async(...args)=>{await real.writeFile(...args);if(slow&&String(args[0]).endsWith('library-v1.json.tmp')){entered();await new Promise(resolve=>release=resolve);}}}});
 try{
  await h.handlers['save-state'](h.event,{revision:'confirmed'});slow=true;
  const saving=h.handlers['save-parsed-state'](h.event,{revision:'obsolete'});await pending;
  const rejected=assert.rejects(saving,/请先扫码登录/);await h.handlers['ta-logout'](h.event);h.signIn();
  let readDone=false;const reading=h.handlers['load-state'](h.event).then(value=>{readDone=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(readDone,false);release();await rejected;
  assert.equal((await reading).revision,'confirmed');assert.equal(fs.existsSync(path.join(h.tmp,'library-v1.json.tmp')),false);
 }finally{release?.();h.cleanup();}
});

test('首次启动即使有保存账号也不能自动连接，所有登录入口均先确认风险',async()=>{
 const h=await harness(undefined,{signedIn:false,remembered:true});try{
  let requests=0;h.ta.request=async()=>requests++;
  assert.equal(h.ta.startupResumes,0);assert.equal((await h.handlers['ta-status'](h.event)).risk_accepted,false);
  for(const action of ['init','qr','roles','select','resume'])await assert.rejects(h.handlers['ta-action'](h.event,action,action==='resume'?{account_id:'a'.repeat(64)}:{}),/免责声明/);
  assert.equal(requests,0);assert.equal(h.ta.startupResumes,0);assert.equal(h.ta.child,null);
  await h.handlers['save-state'](h.event,{risk_accepted:true});await assert.rejects(h.handlers['ta-action'](h.event,'qr',{}),/免责声明/);
 }finally{h.cleanup();}
});
test('风险确认必须为受信任来源的布尔值，确认后扫码和已保存账号续用可用',async()=>{
 const h=await harness(undefined,{signedIn:false,remembered:true});try{
  for(const params of [undefined,null,[],{},true,{accepted:'true'},{accepted:true,extra:1}])await assert.rejects(h.handlers['ta-action'](h.event,'risk',params),/风险确认参数/);
  await assert.rejects(h.handlers['ta-action']({senderFrame:{url:'https://example.com'}},'risk',{accepted:true}),/不受信任/);
  assert.equal((await h.handlers['ta-status'](h.event)).risk_accepted,false);
  const calls=[];h.ta.request=async action=>calls.push(action);
  assert.equal((await h.handlers['ta-action'](h.event,'risk',{accepted:true})).risk_accepted,true);
  for(const name of ['init','qr'])await h.handlers['ta-action'](h.event,name,{});
  await h.handlers['ta-action'](h.event,'resume',{account_id:'a'.repeat(64)});
  assert.deepEqual(calls,['init','qr']);assert.equal(h.ta.startupResumes,1);
  assert.equal(fs.existsSync(path.join(h.tmp,'library-v1.json')),false);
 }finally{h.cleanup();}
});
test('撤销风险确认停止会话和旧查询，退出后再次登录必须重新确认',async()=>{
 const h=await harness();try{
  let finish;const code='|TA|'+'b'.repeat(32);h.ta.request=()=>new Promise(resolve=>finish=resolve);
  const query=h.handlers['ta-query'](h.event,code),rejected=assert.rejects(query,/请先扫码登录|会话已变化/);
  while(!finish)await new Promise(resolve=>setTimeout(resolve,2));
  const revoked=await h.handlers['ta-action'](h.event,'risk',{accepted:false});
  assert.equal(revoked.risk_accepted,false);assert.equal(revoked.authenticated,false);assert.equal(h.ta.child,null);
  finish({code,share_key:code.slice(4),err:31279});await rejected;
  await assert.rejects(h.handlers['ta-action'](h.event,'qr',{}),/免责声明/);
  await h.signIn();const loggedOut=await h.handlers['ta-logout'](h.event);assert.equal(loggedOut.risk_accepted,false);
  await assert.rejects(h.handlers['ta-action'](h.event,'resume',{account_id:'a'.repeat(64)}),/免责声明/);
  await h.handlers['save-state'](h.event,{notes:'仍可离线保存'});assert.equal((await h.handlers['load-state'](h.event)).notes,'仍可离线保存');
 }finally{h.cleanup();}
});
test('未确认风险也能忘记本机账号，已有认证状态不能绕过风险确认',async()=>{
 const h=await harness(undefined,{signedIn:false});try{
  let forgotten;h.ta.forget=id=>forgotten=id;
  await h.handlers['ta-action'](h.event,'forget',{account_id:'a'.repeat(64)});assert.equal(forgotten,'a'.repeat(64));
  h.ta.state.authenticated=true;
  await assert.rejects(h.handlers['ta-query'](h.event,'|TA|'+'a'.repeat(32)),/免责声明/);
 }finally{h.cleanup();}
});
