// Real production renderer and preload; synthetic service responses and an isolated profile.
// This runner and its synthetic data are excluded from the release.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/core.js'),B=require('../app/bulk-import.js'),TA=require('../desktop/ta-codec.cjs'),{TAQueryQueue}=require('../desktop/ta-query-queue.cjs');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'user-data','bulk-ui-v060');app.setPath('userData',profile);
let win,authenticated=false,epoch=0,writes=0,failSave=false,time=0,holdCode='',releaseHeld;
const errors=[],queries=[],copies=[],code=n=>'|TA|'+n.toString(16).padStart(32,'0');
const server={id:'10014',name:'验证服务器',category:'网易双平台',available:true,roles:[],roles_known:false};
let state={authenticated:false,stage:'idle',message:'准备扫码',error:'',busy:false,servers:[],selected_server:'10014',selected_avatar:'',qr_image:''};
const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6gAAAABJRU5ErkJggg==';
function publish(patch){state={...state,...patch};if(authenticated!==state.authenticated){authenticated=state.authenticated;epoch++;queue.reset();}win.webContents.send('ta-status-changed',state);}
const ui=source=>Promise.race([win.webContents.executeJavaScript(source),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Renderer call timed out: '+source)),20000);timer.unref();})]),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await ui(expression))return;await sleep(25);}throw new Error('UI condition timed out: '+expression);}
async function screenshot(name){await win.webContents.capturePage();win.webContents.invalidate();await sleep(150);await fs.writeFile(path.join(profile,name+'.png'),(await win.webContents.capturePage()).toPNG());}
function payload(input){return {ok:true,format:'ta-payload',origin:'official-query',code:input,kinds:['shikigami'],data:{ver:3,title:'官方返回的名称',desc:'官方返回的说明',hconf:[{hero_id:608,star:6,level:40,awake:1,skills:[[6081,1]],equip_info:{criteria:7,yuhun_lv:[15,15],yuhun_star:[6],suit:[],two_suit:[],main_attr:{},limit:{spd:[100,200]}}}]}};}
const queue=new TAQueryQueue({now:()=>time,sleep:async ms=>{time+=ms;},execute:async input=>{queries.push(input);if(input===holdCode){holdCode='';await new Promise(resolve=>releaseHeld=resolve);}return payload(input);}});
async function draft(text,auto=false){await ui('document.getElementById("add-bulk").click();document.getElementById("bulk-input").value='+JSON.stringify(text)+';document.getElementById("bulk-input").dispatchEvent(new Event("input"));document.getElementById("bulk-auto-parse").checked='+auto+';void 0');}
const clickApply=()=>ui('window.bulkJob=applyBulkImport();void 0');
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));data.officialUpdate={lastSuccessAt:null};
 data.lineups=data.lineups.map(l=>({...l,...C.adaptTA(payload(l.code),data),id:l.id,title:l.title}));
 let stored={schemaVersion:1,lineups:[{...data.lineups[0],title:'原有缓存名称',notes:'原有缓存备注'}],accounts:[],activeAccount:''};
 const original=JSON.stringify(stored.lineups[0]);
 const handle=(name,fn)=>ipcMain.handle(name,async(_event,...args)=>{if(!authenticated)throw new Error('请先扫码登录');const current=epoch,result=await fn(...args);if(!authenticated||current!==epoch)throw new Error('登录已结束');return result;});
 ipcMain.handle('ta-status',()=>state);ipcMain.handle('ta-action',(_event,action,params)=>{if(action==='init')publish({servers:[server],stage:'ready'});if(action==='qr')publish({stage:'qr_waiting',qr_image:qr});if(action==='select')publish({selected_server:params.server_id,selected_avatar:params.avatar_id});return state;});
 ipcMain.handle('ta-logout',()=>{publish({authenticated:false,stage:'idle',selected_avatar:'',servers:[server],qr_image:''});return state;});
 handle('load-data',()=>data);handle('load-state',()=>stored);
 handle('save-state',async value=>{if(failSave){failSave=false;throw new Error('合成测试：磁盘保存失败');}await fs.writeFile(path.join(profile,'library-v1.json'),JSON.stringify(value));stored=structuredClone(value);writes++;return {saved:true};});
 handle('decode',TA.decodeInput);handle('copy-code',text=>{copies.push(text);return {copied:true};});handle('official-status',()=>({autoUpdate:false}));handle('official-auto',()=>({autoUpdate:false}));
 handle('ta-query',input=>queue.query(input,()=>{if(!authenticated)throw new Error('已注销');}));
 for(const name of ['import-files','export-json','official-refresh','official-cancel'])handle(name,()=>null);
 win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',details=>{if(details.level==='error'&&!details.message.includes('合成测试：磁盘保存失败'))errors.push(details.message);});
 await win.loadFile(path.join(root,'app/index.html'));await ui('TALogin.ready()');
 const signedIn=()=>publish({authenticated:true,busy:false,stage:'roles_ready',selected_avatar:'qa-role',qr_image:'',servers:[{...server,roles_known:true,roles:[{avatar_id:'qa-role',server_id:server.id,name:'验证角色',level:1}]}]});
 signedIn();await until('!!DATA && parseReport.phase==="complete"');assert.equal(queries.length,0);
 const reports={method:'Real Electron production renderer/preload with isolated synthetic local state and TAQueryQueue; synthetic login/query service, virtual rate-limit clock. No real inventory or phone login.'};
 const text=[data.lineups[0].code+' || 不覆盖旧名',code(101)+' || 魂土速刷 || 魂土 || 配速 155 / 游戏内操作',code(101)+' || 重复名','错误文本',code(102)+' || <img src=x onerror=alert(1)> || 契灵 || 第二条'].join('\n');
 await draft(text);await ui('document.getElementById("bulk-template").click()');await until('document.getElementById("bulk-status").textContent.includes("模板已复制")');assert.equal(copies[0],B.TEMPLATE);
 assert.deepEqual(await ui('renderBulkPreview().stats'),{total:5,valid:2,duplicate:2,invalid:1});assert.equal(writes,0);assert.equal(queries.length,0);assert.equal(await ui('document.querySelectorAll("#bulk-preview img").length'),0);
 await ui('document.getElementById("bulk-status").textContent=""');await screenshot('bulk-preview');
 win.setSize(880,760);await sleep(100);assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);assert.equal(await ui('(()=>{const b=document.getElementById("bulk-apply"),r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()'),true);await screenshot('bulk-preview-small');win.setSize(1440,1000);
 await clickApply();await until('!bulkBusy && document.getElementById("bulk-status").textContent.includes("已添加 2 条")');assert.equal(stored.lineups.length,3);assert.equal(queries.length,0);assert.equal(JSON.stringify(stored.lineups.find(l=>l.code===data.lineups[0].code)),original);
 assert.equal(await ui('document.getElementById("bulk-apply").disabled'),true);await ui('document.getElementById("bulk-view").click()');assert.equal(await ui('document.getElementById("source-filter").value'), 'user');assert.equal(await ui('document.getElementById("lineup-sort").value'),'recent');
 assert.equal(await ui('document.querySelector("#lineup-grid h3").textContent'),'魂土速刷');reports.preview={valid:2,duplicate:2,invalid:1,noQueryOrSaveBeforeApply:true,escapedMarkup:true,templateCopied:true,narrowWindow880:true};reports.manualImport={saved:2,metadataPreserved:true,existingCacheUnchanged:true,automaticParseCanBeDisabled:true,recentlyAddedNavigation:true};
 holdCode=code(101);await ui('startLibraryParse();void 0');await until('parseReport.phase==="running"');assert.deepEqual(queries,[code(101)]);
 const full=(await fs.readFile(path.join(root,'verification/fixtures/ta-example.txt'),'utf8')).trim();await ui('document.getElementById("code-input").value='+JSON.stringify(full)+';updateCode();void 0');
 await draft(code(103)+' || 新码优先 || 御灵 || 优先处理',true);await clickApply();await until('bulkBusy && parseReport.phase==="pausing"');await sleep(450);assert.equal(stored.lineups.length,3);releaseHeld();await ui('bulkJob');await until('parseReport.phase==="complete"');assert.deepEqual(queries,[code(101),code(103),code(102)]);
 const named=stored.lineups.find(l=>l.code===code(101));assert.equal(named.title,'魂土速刷');assert.equal(named.notes,'配速 155 / 游戏内操作');assert.equal(named.dungeon,'魂土');assert.ok(named.createdAt&&named.parsedAt&&named.members.length);assert.equal(JSON.stringify(stored.lineups.find(l=>l.code===data.lineups[0].code)),original);
 reports.activeBatch={waitsForCurrentSave:true,pendingSingleDecodeTimerStopped:true,newCodeFirst:true,queryOrder:queries.map(c=>Number.parseInt(c.slice(4),16)),metadataKeptAfterDecode:true};
 await ui('document.getElementById("close-bulk").click()');const beforeReload=queries.length;await win.reload();await until('!!DATA && parseReport.phase==="complete"');assert.equal(queries.length,beforeReload);assert.equal((JSON.parse(await fs.readFile(path.join(profile,'library-v1.json'),'utf8'))).lineups.length,4);reports.reloadUsesSavedContent=true;
 failSave=true;await draft(code(104));await clickApply();await until('!bulkBusy && document.getElementById("bulk-status").textContent.includes("保存失败")');assert.equal(stored.lineups.length,4);assert.equal(await ui('lineups().some(l=>l.code==='+JSON.stringify(code(104))+')'),false);assert.equal(await ui('renderBulkPreview().entries.length'),1);assert.equal(await ui('document.getElementById("bulk-input").value'),code(104));
 await clickApply();await ui('bulkJob');assert.equal(stored.lineups.length,5);reports.diskFailure={noMemoryOnlyEntry:true,inputRetained:true,retrySucceeds:true};
 const beforeLarge=writes;await draft(Array.from({length:1000},(_,i)=>code(i+10000)).join('\n'));assert.equal(await ui('renderBulkPreview().entries.length'),1000);assert.equal(await ui('document.querySelectorAll("#bulk-preview tbody tr").length'),50);await ui('document.getElementById("bulk-more").click()');assert.equal(await ui('document.querySelectorAll("#bulk-preview tbody tr").length'),100);assert.equal(writes,beforeLarge);reports.thousandRowPreview={valid:1000,initialRendered:50,expandable:true};
 const fileText='\uFEFF阵容码\t名称\t副本/用途\t备注\r\n'+code(105)+'\t表格名称\t日轮\t表格备注';
 await ui('readBulkFile(new File(['+JSON.stringify(fileText)+'],"阵容.tsv",{type:"text/tab-separated-values"}))');assert.equal(await ui('renderBulkPreview().entries[0].notes'),'表格备注');
 await ui('readBulkFile({size:1,name:"编码错误.txt",text:async()=>"\\ufffd"})');assert.match(await ui('document.getElementById("bulk-status").textContent'),/UTF-8/);assert.equal(await ui('renderBulkPreview().entries[0].notes'),'表格备注');
 await ui('window.pendingRead=readBulkFile({size:1,name:"延迟.txt",text:()=>new Promise(resolve=>window.finishRead=resolve)});void 0');await ui('document.getElementById("bulk-input").value='+JSON.stringify(code(106))+';document.getElementById("bulk-input").dispatchEvent(new Event("input"));finishRead('+JSON.stringify(code(107))+');pendingRead');assert.equal(await ui('document.getElementById("bulk-input").value'),code(106));reports.files={utf8BomAndTsv:true,badEncodingKeepsDraft:true,lateReadCannotReplaceEdits:true};
 await ui('window.pendingRead=readBulkFile({size:1,name:"旧会话.txt",text:()=>new Promise(resolve=>window.finishRead=resolve)});void 0');await ui('taLogin.logout()');await until('!DATA');assert.equal(await ui('document.getElementById("bulk-dialog").open'),false);assert.equal(await ui('document.getElementById("bulk-input").value'),'');
 signedIn();await until('!!DATA && parseReport.phase==="complete"');const afterLoginWrites=writes;await ui('finishRead('+JSON.stringify(code(108))+');pendingRead');assert.equal(writes,afterLoginWrites);assert.equal(await ui('document.getElementById("bulk-input").value'),'');reports.logoutClearsDraftAndDiscardsLateFile=true;
 await draft(code(109));await clickApply();await ui('bulkJob');await ui('document.getElementById("close-bulk").click()');holdCode=code(109);await ui('startLibraryParse();void 0');await until('parseReport.phase==="running"');
 await draft(code(110),true);await clickApply();await until('bulkBusy');await ui('taLogin.logout()');await until('!DATA');signedIn();await until('!!DATA');releaseHeld();await ui('bulkJob');await until('!libraryParser.running');assert.equal(stored.lineups.some(l=>l.code===code(110)),false);assert.equal(await ui('bulkBusy'),false);reports.oldSessionWaitingImportCannotWriteNewSession=true;
 const beforeLocal=queries.length;
 await draft(full.slice(4)+' || 本地完整阵容 || 测试用途 || 用户说明\n'+full,true);assert.equal(await ui('renderBulkPreview().stats.duplicate'),1);await clickApply();await ui('bulkJob');await until('!libraryParser.running');
 const decoded=stored.lineups.find(l=>l.code===full);assert.equal(decoded.members.length,6);assert.equal(decoded.decodeState,'decoded-local');assert.equal(decoded.title,'本地完整阵容');assert.equal(decoded.notes,'用户说明');assert.equal(queries.length,beforeLocal);reports.fullContent={rawBase64AndHashDeduplicate:true,actualLocalDecoder:true,members:6,noNetworkQuery:true};
 assert.deepEqual(errors,[]);reports.rendererErrors=errors;reports.passed=true;
 await fs.writeFile(path.join(root,'verification','bulk-ui-v060.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));win.destroy();app.exit(0);
}
main().catch(async error=>{console.error(error);if(win)try{await screenshot('failure');console.error(await ui('({parseReport,bulkBusy,bulkReading,status:document.getElementById("bulk-status").textContent,loaded:!!DATA})'));}catch{}win?.destroy();app.exit(1);});
