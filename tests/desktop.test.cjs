// Exercise the production IPC handlers with an isolated filesystem and mock
// window. No GUI control, account fixtures or outbound requests are involved.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
async function harness(fetcher=async()=>new Response('{}')){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-ipc-test-')),handlers={};let external=[];
 class Window{constructor(){this.webContents={setWindowOpenHandler(fn){this.open=fn;},on(){}};}loadURL(){}}
 const electron={app:{getPath:()=>tmp,setPath(){},whenReady:()=>Promise.resolve(),on(){}},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{showSaveDialog:async()=>({canceled:false,filePath:path.join(tmp,'backup.json')})},shell:{openExternal:u=>external.push(u)},session:{defaultSession:{setPermissionRequestHandler(){}}}};
 const dirname=path.resolve('desktop');
 vm.runInNewContext(fs.readFileSync('desktop/main.cjs','utf8'),{require:n=>n==='electron'?electron:require(n),__dirname:dirname,process:{argv:[],env:{}},fetch:fetcher,AbortSignal,Buffer,console,setTimeout,URL},{filename:'desktop/main.cjs'});
 await new Promise(resolve=>setImmediate(resolve));
 const event={senderFrame:{url:pathToFileURL(path.resolve('app/index.html')).href}};
 return {handlers,event,tmp,cleanup:()=>{assert.ok(tmp.startsWith(path.join(os.tmpdir(),'atlas-ipc-test-')));fs.rmSync(tmp,{recursive:true,force:true});}};
}
test('Windows实际原子写入支持覆盖与并发保存顺序',async()=>{const h=await harness();try{assert.equal(await h.handlers['load-state'](h.event),null);await h.handlers['save-state'](h.event,{schemaVersion:1,notes:'初次中文保存'});await Promise.all([h.handlers['save-state'](h.event,{revision:2}),h.handlers['save-state'](h.event,{revision:3})]);const loaded=await h.handlers['load-state'](h.event);assert.equal(loaded.revision,3);assert.equal(fs.existsSync(path.join(h.tmp,'library-v1.json.tmp')),false);await h.handlers['export-json'](h.event,{name:'backup.json',data:loaded});assert.equal(JSON.parse(fs.readFileSync(path.join(h.tmp,'backup.json'))).revision,3);}finally{h.cleanup();}});
test('IPC拒绝外部页面读取和写入本地状态',async()=>{const h=await harness();try{await assert.rejects(h.handlers['load-state']({senderFrame:{url:'https://example.com'}}),/不受信任/);await assert.rejects(h.handlers['save-state']({senderFrame:{url:'file:///other.html'}},{}),/不受信任/);}finally{h.cleanup();}});
test('本地页片段导航不破坏保存权限',async()=>{const h=await harness();try{const e={senderFrame:{url:h.event.senderFrame.url+'#library'}};await h.handlers['save-state'](e,{revision:1});assert.equal((await h.handlers['load-state'](e)).revision,1);}finally{h.cleanup();}});
test('联网解析只发当前原码，保留400失败且不制造详情',async()=>{let requested;const h=await harness(async(url,options)=>{requested={url,options};return new Response(JSON.stringify({ok:false,error:'阵容码不是有效的 Base64'}),{status:400});});try{const code='|TA|'+'1'.repeat(32);const result=await h.handlers.decode(h.event,code);assert.equal(result.ok,false);assert.equal(result.status,400);assert.equal(result.error,'阵容码不是有效的 Base64');assert.equal(requested.url,'https://api.fireschain.org/onmyoji/v1/team-code/decode');assert.deepEqual(JSON.parse(requested.options.body),{teamCode:code});assert.equal(requested.options.redirect,'manual');const again=await h.handlers.decode(h.event,code);assert.equal(again.state,'rate-limited');}finally{h.cleanup();}});
test('大错误响应同样受1MiB限制，非法输入不发请求',async()=>{let count=0;const h=await harness(async()=>{count++;return new Response('x'.repeat(1048577),{status:500});});try{assert.equal((await h.handlers.decode(h.event,'bad')).state,'invalid-input');assert.equal(count,0);assert.match((await h.handlers.decode(h.event,'|TA|'+'2'.repeat(32))).error,/1 MiB/);}finally{h.cleanup();}});
