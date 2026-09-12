// Synthetic service responses; real production renderer, preload, worker and query queue.
// This runner is excluded from the release. No credentials or real account data are used.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/core.js'),TA=require('../desktop/ta-codec.cjs'),{TAQueryQueue}=require('../desktop/ta-query-queue.cjs');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'user-data','feature-ui-v050'));
let win,authenticated=false,epoch=0,reads=0,writes=0,failSave=false,time=0,releaseFirst;
const errors=[],queries=[],copies=[];
const first=new Promise(resolve=>releaseFirst=resolve),server={id:'10014',name:'验证服务器',category:'网易双平台',available:true,roles:[],roles_known:false};
let state={authenticated:false,stage:'idle',message:'准备扫码',error:'',busy:false,servers:[],selected_server:'10014',selected_avatar:'',qr_image:''};
const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6gAAAABJRU5ErkJggg==';
function publish(patch){state={...state,...patch};if(authenticated!==state.authenticated){authenticated=state.authenticated;epoch++;queue.reset();}win.webContents.send('ta-status-changed',state);}
const ui=code=>win.webContents.executeJavaScript(code);
async function screenshot(name){await win.webContents.capturePage();win.webContents.invalidate();await new Promise(resolve=>setTimeout(resolve,150));await fs.writeFile(path.join(root,'user-data','feature-ui-v050',name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await ui(expression))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('UI condition timed out: '+expression);}
function payload(code){return {ok:true,format:'ta-payload',origin:'official-query',code,kinds:['shikigami','onmyoji'],data:{ver:3,title:'验证返回的阵容',desc:'原始回包备注',hconf:[{hero_id:608,star:6,level:40,awake:1,skills:[[6081,1],[6082,5],[6083,5]],equip_info:{criteria:7,yuhun_lv:[15,15],yuhun_star:[6],suit:[[300020,4],[300020,2]],two_suit:[],main_attr:{1:[],3:[],5:[]},limit:{spd:[100,200]}}},{hero_id:10,level:60,star:6,skills:[[1001,5]],qiling_info:{id:1,star:6,lv:20,marks:[1,2]}}]}};}
const queue=new TAQueryQueue({now:()=>time,sleep:async ms=>{time+=ms;},execute:async code=>{queries.push(code);if(queries.length===1)await first;return payload(code);}});
async function main(){
 await app.whenReady();
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));
 data.officialUpdate={lastSuccessAt:null};
 data.lineups=data.lineups.map((l,i)=>i<3?{...l,members:[],decodeState:'unattempted'}:{...l,...C.adaptTA(payload(l.code),data),id:l.id,title:l.title});
 const raw=JSON.parse(await fs.readFile(path.join(root,'verification/fixtures/account-synthetic.json'),'utf8'));
 raw.player.name='界面验收账号';for(let i=0;i<134;i++)raw.heroes['material-'+i]={heroId:410+i%4,level:30,star:4,awake:0,skinfo:[[4101,1]]};
 const imported=C.parseAccount(raw),stored={schemaVersion:1,lineups:[],accounts:[imported],activeAccount:imported.id};
 const handle=(name,fn)=>ipcMain.handle(name,async(_e,...args)=>{if(!authenticated)throw new Error('请先扫码登录后使用软件');const start=epoch,result=await fn(...args);if(!authenticated||start!==epoch)throw new Error('请先扫码登录后使用软件');return result;});
 ipcMain.handle('ta-status',()=>state);
 ipcMain.handle('ta-action',(_e,action,params)=>{if(action==='init')publish({servers:[server],stage:'ready'});if(action==='qr')publish({stage:'qr_waiting',qr_image:qr});if(action==='select')publish({selected_server:params.server_id,selected_avatar:params.avatar_id});return state;});
 ipcMain.handle('ta-logout',()=>{publish({authenticated:false,busy:false,stage:'idle',selected_avatar:'',servers:[server],qr_image:''});return state;});
 handle('load-data',()=>{reads++;return data;});handle('load-state',()=>{reads++;return stored;});
 handle('save-state',value=>{if(failSave){failSave=false;throw new Error('合成测试：磁盘保存失败');}writes++;Object.assign(stored,value);return {saved:true};});
 handle('decode',TA.decodeInput);handle('copy-code',code=>{copies.push(code);return {copied:true};});
 let autoUpdate=true;handle('official-status',()=>({autoUpdate}));handle('official-auto',value=>({autoUpdate:(autoUpdate=!!value)}));
 handle('ta-query',code=>queue.query(code,()=>{if(!authenticated)throw new Error('已注销');}));
 for(const name of ['import-files','export-json','official-refresh','official-cancel'])handle(name,()=>null);
 win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',details=>{if(details.level==='error'&&!details.message.includes('合成测试：磁盘保存失败'))errors.push(details.message);});
 await win.loadFile(path.join(root,'app/index.html'));await ui('TALogin.ready()');assert.equal(reads,0);
 const signedIn=()=>publish({authenticated:true,busy:false,stage:'roles_ready',selected_avatar:'qa-role',qr_image:'',servers:[{...server,roles_known:true,roles:[{avatar_id:'qa-role',server_id:server.id,name:'验证角色',level:1}]}]});
 signedIn();await until('!!DATA && parseReport.phase==="running"');assert.equal(queries.length,1);
 await ui('document.querySelector("[data-parse-action=pause]").click()');releaseFirst();await until('parseReport.phase==="paused"');assert.equal(stored.lineups.length,1);
 await ui('document.querySelector("[data-parse-action=start]").click()');await until('parseReport.phase==="complete"');assert.equal(queries.length,3);assert.equal(stored.lineups.length,3);
 assert.ok(stored.lineups.every(l=>l.parsedAt&&l.mapperVersion===2&&l.members.length===2));
 assert.equal(await ui('lineups().filter(l=>!C.hasParsedContent(l)).length'),0);
 await until('!worker && Object.keys(matchResults).length===155');
 const reports={method:'Real Electron production renderer/preload/worker; synthetic authentication and query payloads; virtual clock only for rate limits. No live phone login or real account inventory in UI.',automaticUnparsedBatch:true,eachSuccessPersisted:true,pauseResume:true,cachedContentSkipped:true};
 await ui('document.querySelector("[data-reparse]").click()');await until('document.getElementById("code-status").textContent.includes("频繁重复")');assert.equal(queries.length,3);assert.equal(await ui('!!currentCodeResult?.members.length'),true);reports.manualCooldownKeepsCache=true;
 time+=60000;await ui('document.getElementById("remote-decode").click()');await until('document.getElementById("code-status").textContent.includes("已自动保存在本机")');assert.equal(queries.length,4);reports.singleReparseSaved=true;
 const failedCode='|TA|'+'f'.repeat(32);failSave=true;await ui('document.getElementById("code-input").value='+JSON.stringify(failedCode)+';codeRevision++;localDecode(true)');assert.equal(failSave,false);assert.equal(queries.length,5);assert.match(await ui('document.getElementById("code-status").textContent'),/未能保存到本地/);assert.equal(await ui('lineups().some(l=>l.code==='+JSON.stringify(failedCode)+'&&C.hasParsedContent(l))'),false);reports.failedSaveDoesNotBecomeCached=true;
 await ui('selectView("accounts")');
 assert.equal(await ui('document.querySelectorAll("#account-heroes .owned-hero").length'),60);
 await ui('document.getElementById("account-next-page").click()');assert.match(await ui('document.getElementById("account-page-indicator").textContent'),/第 2 \/ 3 页/);
 await ui('document.getElementById("account-next-page").click()');assert.equal(await ui('document.querySelectorAll("#account-heroes .owned-hero").length'),15);
 await ui('document.getElementById("account-search").value="412";document.getElementById("account-search").dispatchEvent(new Event("input"))');assert.equal(await ui('document.querySelectorAll("#account-heroes .owned-hero").length'),33);assert.ok((await ui('document.getElementById("account-heroes").textContent')).includes('奉为达摩'));
 await ui('document.getElementById("account-search").value="";document.getElementById("account-search").dispatchEvent(new Event("input"))');
 reports.accountPagination={instances:135,pages:3,lastPage:15,search412Count:33,name:'奉为达摩'};
 await until('!worker && Object.keys(matchResults).length===155');await ui('fillCalculator();document.getElementById("soul-calculator").open=true');
 assert.ok(await ui('document.querySelectorAll("#account-recommendations .recommendation").length===6'));
 assert.equal(await ui('document.querySelectorAll("#calculator-output .panel-comparison tbody tr").length'),8);assert.equal(await ui('document.querySelectorAll("#calculator-output .soul-build-table tbody tr").length'),6);
 await ui('calculateSouls()');await until('!calculatorWorker && document.getElementById("calculator-status").textContent.includes("完成")');reports.calculator={sixSlots:true,eightAttributeRows:true,deeperSearch:true,recommendations:6};
 await ui('calculateSouls();window.delayedCalculation=calculatorWorker.onmessage;calculatorWorker.onmessage=()=>{};document.getElementById("code-input").value=lineups().find(l=>l.id===document.getElementById("calculator-lineup").value).code;codeRevision++;void 0');
 time+=60000;await ui('localDecode(true)');assert.equal(await ui('calculatorWorker===null'),true);
 await ui('delayedCalculation({data:{result:{staleTestResult:true},done:true}})');assert.equal(await ui('Object.values(matchResults).some(r=>r.staleTestResult)'),false);reports.reparseCancelsPreviousCalculation=true;
 await until('!worker && Object.keys(matchResults).length===155');await ui('renderCalculator()');
 await fs.mkdir(path.join(root,'user-data','feature-ui-v050'),{recursive:true});await ui('document.getElementById("toast").classList.remove("show");document.getElementById("calculator-output").scrollIntoView({block:"start"})');await screenshot('calculator');
 await ui('selectView("accounts");document.getElementById("soul-calculator").open=false;document.getElementById("account-search").value="412";document.getElementById("account-search").dispatchEvent(new Event("input"));document.getElementById("account-heroes").scrollIntoView({block:"start"})');await screenshot('accounts');
 win.setSize(960,850);await ui('document.getElementById("soul-calculator").open=true;document.getElementById("calculator-output").scrollIntoView({block:"start"})');assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);await screenshot('calculator-small');reports.narrowWindowNoPageOverflow=true;
 win.setSize(1440,1000);const code=await fs.readFile(path.join(root,'verification/fixtures/ta-example.txt'),'utf8'),smoke=await ui('runSmoke('+JSON.stringify({code,login:true})+')');assert.equal(smoke.error,undefined);assert.equal(smoke.detail.members,6);reports.existingFeatures=smoke;
 await ui('reloadOfficial()');await until('!worker && Object.keys(matchResults).length===156');reports.officialRefreshRecalculates=true;
 const beforeQueries=queries.length;await ui('taLogin.logout()');await until('!DATA');assert.equal(await ui('document.getElementById("calculator-output").children.length'),0);
 signedIn();await until('!!DATA && parseReport.phase==="complete"');assert.equal(queries.length,beforeQueries);reports.reloginUsesLocalCache=true;
 await ui('importMode="payload";window.pendingImport=importTAFiles([{name:"delayed.txt",size:1,text:()=>new Promise(resolve=>window.finishDelayed=resolve)}]);void 0');const beforeWrites=writes;
 await ui('taLogin.logout()');await until('!DATA');signedIn();await until('!!DATA && parseReport.phase==="complete"');await ui('finishDelayed('+JSON.stringify(code)+');pendingImport');assert.equal(writes,beforeWrites);reports.previousSessionImportCannotWrite=true;
 assert.deepEqual(errors,[]);reports.rendererErrors=errors;reports.passed=true;
 await fs.writeFile(path.join(root,'verification','features-ui-v050.json'),JSON.stringify(reports,null,2)+'\n');
 console.log(JSON.stringify({passed:true,batchQueries:3,pagination:reports.accountPagination,calculator:reports.calculator}));win.destroy();app.exit(0);
}
main().catch(async error=>{console.error(error);if(win)try{console.error(await ui('({phase:parseReport,error:document.getElementById("code-status").textContent,loaded:!!DATA})'));}catch{}win?.destroy();app.exit(1);});
