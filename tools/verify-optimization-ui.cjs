// Production Electron UI with synthetic state, credentials and disk failures.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'user-data','optimization-ui');
app.setPath('userData',profile);
app.disableHardwareAcceleration();
let win,stored,exported,failSave=false,failExport=false,failLoad=false,holdSave=false,heldSaves=[];
async function held(){for(let i=0;i<200;i++){if(heldSaves.length)return;await sleep(10);}throw Error("Save did not start");}
function releaseSaves(){holdSave=false;heldSaves.splice(0).forEach(resolve=>resolve());}
const results=[],errors=[],blank=()=>({schemaVersion:1,lineups:[],accounts:[],activeAccount:'',deletedPresetIds:[]});
const ui=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<200;i++){if(await ui(code))return;await sleep(25);}throw Error('UI timeout: '+code);}
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});console.error(name,e.message);}finally{releaseSaves();}}
async function capture(name){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await sleep(350);await fs.writeFile(path.join(profile,name+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));data.officialUpdate={autoUpdate:false};stored=blank();
 const local=(name,fn)=>{ipcMain.handle(name,(_e,...args)=>fn(...args));if(name==='export-json')ipcMain.handle('export-json-text',(_e,p)=>fn({name:p.name,data:JSON.parse(p.text)}));if(['load-data','load-state'].includes(name))ipcMain.handle(name+'-json',async(_e,...args)=>JSON.stringify(await fn(...args)));if(['save-state','save-parsed-state'].includes(name))ipcMain.handle(name+'-json',(_e,text)=>fn(JSON.parse(text)));};
 local('save-state-fields-json',async text=>{if(holdSave)await new Promise(resolve=>heldSaves.push(resolve));if(failSave)throw Error('synthetic disk full');if(!stored)return {needsSnapshot:true};stored={...JSON.parse(text),lineups:stored.lineups};return {saved:true};});
 local('parse-json',text=>JSON.parse(text));local('save-parsed-delta',()=>({needsSnapshot:true}));
 let status={authenticated:false,busy:false,stage:'idle',servers:[],selected_avatar:'',remembered_accounts:[]};
 local('load-data',()=>data);local('load-state',()=>{if(failLoad)throw Error('synthetic corrupt database');return stored;});
 for(const channel of ['save-state','save-parsed-state'])local(channel,async s=>{if(holdSave)await new Promise(resolve=>heldSaves.push(resolve));if(failSave)throw Error('synthetic disk full');stored=structuredClone(s);return {saved:true};});
 local('export-json',payload=>{if(failExport)throw Error('synthetic read-only target');exported=structuredClone(payload.data);return true;});
 local('ta-status',()=>status);local('ta-action',(_action,p)=>{status={...status,risk_accepted:p?.accepted};return status;});local('ta-logout',()=>status);
 local('copy-code',()=>({copied:true}));local('import-files',()=>[]);
 for(const channel of ['official-status','official-auto','official-refresh','official-cancel'])local(channel,()=>({autoUpdate:false}));
 local('ta-query',()=>{throw Error('synthetic offline');});local('decode',()=>{throw Error('synthetic offline');});
 win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 await win.loadFile(path.join(root,'app/index.html'));win.webContents.setZoomFactor(1);await sleep(80);await until('!!DATA && document.getElementById("loading").hidden');await ui('TALogin.ready()');
 const raw={format:'mumu-snapshot-v1',completeness:'complete',player:{name:'验收库存',serverId:'10014',shortId:'synthetic'},heroes:{a:{heroId:608,level:40,star:6,awake:1,skinfo:[[6081,1]]}},hero_equips:[]};
 const file=json=>'[{name:"synthetic.json",size:1024,text:async()=>'+JSON.stringify(JSON.stringify(json))+'}]';
 await check('账号导入失败保持原账号和原库存',async()=>{
  const before=await ui('JSON.stringify(STATE)');failSave=true;
  await ui('importMode="accounts";handleFiles('+file(raw)+')');failSave=false;
  assert.equal(await ui('JSON.stringify(STATE)')===before,true,'状态应保持一致');
 });
 await ui('STATE='+JSON.stringify(blank())+';updateAccountSelect()');
 await check('结构化阵容保存失败保持原库',async()=>{
  const before=await ui('JSON.stringify(STATE.lineups)');failSave=true;
  await ui('importMode="lineup";handleFiles('+file({...data.lineups[0],id:'synthetic-new'})+')');failSave=false;
  assert.equal(await ui('JSON.stringify(STATE.lineups)')===before,true,'阵容库应保持一致');
 });
 await check('导出失败有可见反馈并且不会误报成功',async()=>{
  failExport=true;const ok=await ui('exportJSON("synthetic.json",STATE)');failExport=false;
  assert.equal(ok,false);assert.match(await ui('document.getElementById("toast").textContent'),/导出失败/);
 });failExport=false;
 await check('解析回包不覆盖正在编辑的草稿，换码不串元数据',async()=>{
  await ui('selectView("decode");document.getElementById("code-input").value=DATA.lineups[0].code;updateCode();document.getElementById("code-title").value="用户正在写的标题";document.getElementById("code-title").dispatchEvent(new Event("input",{bubbles:true}));showCodeResult({...DATA.lineups[0],title:"迟到的解析标题"})');
  assert.equal(await ui('document.getElementById("code-title").value'),'用户正在写的标题');
  await ui('document.getElementById("code-input").value="|TA|new-synthetic-code";updateCode()');
  assert.equal(await ui('document.getElementById("code-title").value'),'');
 });
 await check('编辑保存失败恢复解析器并保留编辑内容',async()=>{
  await ui('editLineup(DATA.lineups[0].id);document.getElementById("edit-title").value="保留的编辑草稿";parseReport={phase:"running",total:1,completed:0}');failSave=true;
  await ui('saveLineupManagement()');failSave=false;
  assert.equal(await ui('parseReport.phase'),'idle');
  assert.equal(await ui('document.getElementById("edit-title").value'),'保留的编辑草稿');
 });
 await ui('document.getElementById("detail-dialog").close()');
 await check('进度刷新保留失败明细和键盘焦点',async()=>{
  await ui('STATE.lineups=[{...DATA.lineups[0],lastParseError:"服务器未返回该阵容（代码 31279）"}];selectView("library");renderParseFailures();document.querySelector("#parse-failures details").open=true;');await until('!!document.querySelector("#parse-failures tbody details")');await ui('window.qaFailure=document.querySelector("#parse-failures tbody details");qaFailure.open=true;window.qaButton=document.querySelector("#parse-failures [data-edit-lineup]");qaButton.focus();renderParseProgress()');
  assert.equal(await ui('qaFailure.isConnected&&qaFailure.open&&document.activeElement===qaButton'),true);
 });
 await check('恢复备份先预览，保存失败不覆盖，成功后可撤销',async()=>{
  const before=await ui('JSON.stringify(STATE)');const backup={...blank(),format:'onmyoji-atlas-backup',exportedAt:'2026-09-22T00:00:00Z'};
  await ui('importMode="backup";handleFiles('+file(backup)+')');
  assert.equal(await ui('JSON.stringify(STATE)')===before,true,'状态应保持一致');
  assert.equal(await ui('!!document.getElementById("confirm-restore-backup")'),true);
  failSave=true;await ui('applyBackupRestore()');failSave=false;assert.equal(await ui('JSON.stringify(STATE)')===before,true,'状态应保持一致');
  await ui('applyBackupRestore()');assert.equal(stored.lineups.length,318);assert.equal(await ui('lineups().length'),318);
  await ui('undoBackupRestore()');assert.equal(await ui('JSON.stringify(STATE)')===before,true,'状态应保持一致');
 });
 await check('损坏数据库仍可恢复备份并继续使用',async()=>{
  failLoad=true;await win.loadFile(path.join(root,'app/index.html'));await until('document.getElementById("loading").textContent.includes("synthetic corrupt database")');
  assert.equal(await ui('document.getElementById("restore-backup").disabled'),false);
  const backup={...blank(),format:'onmyoji-atlas-backup'};
  await ui('importMode="backup";handleFiles('+file(backup)+');');await ui('applyBackupRestore()');
  assert.equal(await ui('document.getElementById("loading").hidden'),true);failLoad=false;
 });

 await check('解析提交后取消，已落盘的数据仍与内存同步',async()=>{
  holdSave=true;await ui('window.qaParseAllowed=true;window.qaParseSave=commitState(s=>({...s,qaMarker:"parsed"}),sessionRevision,()=>window.qaParseAllowed);void 0');await held();
  await ui('window.qaParseAllowed=false');releaseSaves();await ui('window.qaParseSave');
  assert.equal(await ui('STATE.qaMarker'),'parsed');assert.equal(stored.qaMarker,'parsed');
 });
 await check('恢复确认排队期间数据变化，取消覆盖并更新预览',async()=>{
  const backup={...blank(),format:'onmyoji-atlas-backup'};
  await ui('importMode="backup";handleFiles('+file(backup)+')');
  holdSave=true;await ui('window.qaEdit=commitState(s=>({...s,qaMarker:"new edit"}));void 0');await held();
  await ui('window.qaRestore=applyBackupRestore();void 0');releaseSaves();await ui('Promise.all([window.qaEdit,window.qaRestore])');
  assert.equal(await ui('STATE.qaMarker'),'new edit');assert.equal(stored.qaMarker,'new edit');
  assert.equal(await ui('document.getElementById("detail-dialog").open'),true);
  await ui('document.getElementById("detail-dialog").close()');
 });
 await check('撤销恢复排队期间的新编辑不能被覆盖',async()=>{
  const backup={...blank(),format:'onmyoji-atlas-backup'};await ui('importMode="backup";handleFiles('+file(backup)+')');await ui('applyBackupRestore()');
  holdSave=true;await ui('window.qaEdit=commitState(s=>({...s,qaMarker:"after restore"}));void 0');await held();
  await ui('window.qaUndo=undoBackupRestore();void 0');releaseSaves();await ui('Promise.all([window.qaEdit,window.qaUndo])');
  assert.equal(await ui('STATE.qaMarker'),'after restore');assert.equal(stored.qaMarker,'after restore');
 });
 await check('恢复确认前预设更新会重算预览，不应用旧结果',async()=>{
  const backup={...blank(),format:'onmyoji-atlas-backup'};await ui('importMode="backup";handleFiles('+file(backup)+')');
  await ui('window.qaOldRestore=pendingBackup.next;DATA={...DATA,lineups:[...DATA.lineups,{...DATA.lineups[0],id:"late-preset",title:"更新后的预设",code:"|TA|late-preset",updatedAt:"2026-09-22"}]};void 0');
  await ui('applyBackupRestore()');
  assert.equal(await ui('pendingBackup.next!==qaOldRestore&&pendingBackup.next.lineups.some(l=>l.id==="late-preset")'),true);
  assert.equal(stored.lineups.some(l=>l.id==='late-preset'),false);
  await ui('document.getElementById("detail-dialog").close();DATA={...DATA,lineups:DATA.lineups.filter(l=>l.id!=="late-preset")};void 0');
 });
 await check('恢复写盘期间预设更新，已落盘的恢复仍可撤销至原库存',async()=>{
  const backup={...blank(),format:'onmyoji-atlas-backup'};
  await ui('STATE={...STATE,accounts:[C.parseAccount('+JSON.stringify(raw)+')],activeAccount:"10014:synthetic"};window.qaBeforeDataRace=JSON.stringify(STATE);void 0');
  await ui('importMode="backup";handleFiles('+file(backup)+')');
  holdSave=true;await ui('window.qaDataRace=applyBackupRestore();void 0');await held();
  await ui('DATA={...DATA};void 0');releaseSaves();await ui('window.qaDataRace');
  assert.equal(stored.accounts.length,0);assert.equal(await ui('backupUndo?.restored===STATE'),true);
  await ui('undoBackupRestore()');assert.equal(await ui('JSON.stringify(STATE)===qaBeforeDataRace'),true);assert.equal(stored.accounts.length,1);
 });
 await check('保存 A 时切换编辑 B，不切回 A 也不丢 B 草稿',async()=>{
  await ui('selectView("decode");document.getElementById("code-input").value=DATA.lineups[0].code;updateCode();document.getElementById("code-title").value="A 保存标题";document.getElementById("code-title").dispatchEvent(new Event("input"))');
  holdSave=true;await ui('window.qaSaveA=saveCode();void 0');await held();
  await ui('document.getElementById("code-input").value=DATA.lineups[1].code;updateCode();document.getElementById("code-title").value="B 尚未保存的草稿";document.getElementById("code-title").dispatchEvent(new Event("input"))');
  releaseSaves();await ui('window.qaSaveA');
  assert.equal(await ui('document.getElementById("code-input").value===DATA.lineups[1].code'),true);
  assert.equal(await ui('document.getElementById("code-title").value'),'B 尚未保存的草稿');
  await ui('document.getElementById("code-input").value=DATA.lineups[0].code;updateCode();document.getElementById("code-input").value=DATA.lineups[1].code;updateCode()');
  assert.equal(await ui('document.getElementById("code-title").value'),'B 尚未保存的草稿');
 });
 await check('导出整理最新阵容与预设，保持当前阵容库不变',async()=>{
  await ui('STATE={...STATE,lineups:[{...DATA.lineups[0],id:"export-old",title:"导出冲突",code:"|TA|export-old",updatedAt:"2026-09-20"},{...DATA.lineups[0],id:"export-new",title:"导出冲突",code:"|TA|export-new",updatedAt:"2026-09-21"}],deletedPresetIds:[],lineupReplacements:{}};window.qaBeforeExport=JSON.stringify(STATE);void 0');
  assert.equal(await ui('exportBackup()'),true);
  assert.equal(exported.lineups.length,319);assert.equal(exported.lineups.some(l=>l.id==='export-old'),false);assert.equal(exported.lineups.some(l=>l.id==='export-new'),true);
  assert.equal(await ui('JSON.stringify(STATE)===qaBeforeExport'),true);
 });
 await check('真实备份入口合并本机独有阵容，按最新时间处理同名同码同 ID 和预设冲突',async()=>{
  const make=(id,title,code,updatedAt)=>({...data.lineups[0],id,title,code,updatedAt});
  const localRows=[make('old-title','同名冲突','|TA|old-title','2026-09-20'),make('new-code','本机同码新版','|TA|same-code','2026-09-22'),make('same-id','本机 ID 新版','|TA|new-id','2026-09-22'),make('local-only','本机独有','|TA|local-only','2026-09-20'),make('preset-new','新版预设',''+data.lineups[0].code,'2026-09-22')];
  const backupRows=[make('new-title','同名冲突','|TA|new-title','2026-09-21'),make('old-code','备份同码旧版','|TA|same-code','2026-09-20'),make('same-id','备份 ID 旧版','|TA|old-id','2026-09-20'),make('backup-only','备份独有','|TA|backup-only','2026-09-20')];
  await ui('STATE={...'+JSON.stringify(blank())+',accounts:[C.parseAccount('+JSON.stringify(raw)+')],lineups:'+JSON.stringify(localRows)+'};STATE.activeAccount=STATE.accounts[0].id;STATE.targetLineups={[STATE.activeAccount]:["old-title","local-only",DATA.lineups[0].id]};window.qaBeforeMerge=JSON.stringify(STATE);void 0');
  const account=await ui('STATE.accounts[0]'),backup={...blank(),format:'onmyoji-atlas-backup',accounts:[account],activeAccount:account.id,lineups:backupRows,targetLineups:{[account.id]:['old-code','backup-only']},builderDraft:{savedId:'old-title',title:'待继续编辑'}};
  await ui('importMode="backup";handleFiles('+file(backup)+')');
  assert.match(await ui('document.getElementById("dialog-body").textContent'),/本机独有阵容会保留/);
  assert.equal(await ui('JSON.stringify(STATE)===qaBeforeMerge'),true);
  await capture('backup-merge-preview');await ui('applyBackupRestore()');
  for(const id of ['new-title','new-code','same-id','local-only','backup-only','preset-new'])assert.equal(stored.lineups.some(l=>l.id===id),true,id+' '+await ui('document.getElementById("toast").textContent'));
  for(const id of ['old-title','old-code',data.lineups[0].id])assert.equal(stored.lineups.some(l=>l.id===id),false,id);
  assert.equal(stored.lineups.find(l=>l.id==='same-id').code,'|TA|new-id');
  assert.deepEqual(new Set(stored.targetLineups[account.id]),new Set(['new-title','local-only','preset-new','new-code','backup-only']));
  assert.equal(stored.builderDraft.savedId,'new-title');
  const merged=JSON.stringify(stored);await ui('importMode="backup";handleFiles('+file(backup)+')');await ui('applyBackupRestore()');assert.deepEqual(JSON.parse(JSON.stringify(stored)),JSON.parse(merged));
  await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA && document.getElementById("loading").hidden');
  assert.equal(await ui('lineups().some(l=>l.id===DATA.lineups[0].id)'),false);
  assert.equal(await ui('lineups().some(l=>l.id==="local-only")'),true);
 });
 await check('新版库存经真实文件入口导入，扩展集合与提醒可见且安全转义',async()=>{
  const latest={...raw,capturedAt:'2026-09-23T00:00:00Z',scope:{heroes:true,souls:true,taskRecords:false},heroesBagEntries:[['synthetic-stack',17]],heroesBagCount:17,heroBookShards:[[1,2,3,4]],realmCards:[['card',1,2,[3,4]]],storyTasks:[[9,[0,1]],[9,[1,0]]],taskRecords:{},warnings:['<img src=x onerror="window.qaInjected=true">采集提醒']};
  await ui('importMode="accounts";document.getElementById("merge-import").checked=false;handleFiles('+file(latest)+')');
  assert.equal(stored.accounts[0].snapshot.stackedHeroes,17);assert.equal(stored.accounts[0].raw.storyTasks.length,2);
  await ui('selectView("accounts");document.querySelector("#account-summary .inventory-notes").open=true;document.getElementById("account-snapshot-extra").open=true');
  await ui('renderAccounts(false)');assert.equal(await ui('document.getElementById("account-snapshot-extra").open&&document.getElementById("account-inventory-notes").open'),true);
  const content=await ui('document.getElementById("account-summary").textContent');assert.match(content,/17 个/);assert.match(content,/任务记录：未采集/);assert.match(content,/采集提醒/);
  assert.equal(await ui('!!window.qaInjected'),false);assert.equal(await ui('document.querySelectorAll("#account-summary img").length'),0);
  await ui('document.getElementById("toast").classList.remove("show");document.getElementById("account-snapshot-extra").scrollIntoView({block:"start",behavior:"instant"})');await until('view==="accounts"&&!document.getElementById("view-accounts").hidden');await capture('snapshot-v094');
 });
 await check('新版批量导入含损坏文件时，整批不覆盖已有库存',async()=>{
  const before=JSON.stringify(stored),valid={...raw,player:{...raw.player,shortId:'another-synthetic'}},invalid={...raw,heroes:{broken:{heroId:608}}};
  const files='['+file(valid).slice(1,-1)+','+file(invalid).slice(1,-1)+']';
  await ui('importMode="accounts";handleFiles('+files+')');assert.equal(JSON.stringify(stored),before);
  assert.match(await ui('document.getElementById("toast").textContent'),/导入失败/);
 });
 await check('旧缓存重启重新解析原始库存，备份再恢复不丢新版数据',async()=>{
  delete stored.accounts[0].snapshot;delete stored.accounts[0].coverage;stored.accounts[0].warnings=[];
  await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA && document.getElementById("loading").hidden');
  assert.equal(await ui('STATE.accounts[0].snapshot.stackedHeroes'),17);assert.equal(await ui('STATE.accounts[0].warnings.length'),1);
  assert.equal(await ui('exportBackup()'),true);const backup=structuredClone(exported);
  await ui('importMode="backup";handleFiles('+file(backup)+')');await ui('applyBackupRestore()');
  assert.equal(stored.accounts[0].raw.storyTasks.length,2);assert.equal(stored.accounts[0].snapshot.sections.realmCards,1);
  await ui('selectView("accounts");document.getElementById("account-snapshot-extra").open=true');win.setContentSize(720,960);
  assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);await ui('document.getElementById("toast").classList.remove("show");document.getElementById("account-snapshot-extra").scrollIntoView({block:"start",behavior:"instant"})');await capture('snapshot-v094-narrow');win.setContentSize(1440,960);
 });
 if(process.argv.includes('--visual')){
  await ui('STATE='+JSON.stringify(blank())+';backupUndo=null;document.getElementById("undo-restore").hidden=true;document.getElementById("toast").classList.remove("show");document.getElementById("code-input").value="";updateCode();updateAccountSelect();fillFilters();selectView("library")');
  for(const width of [1440,900,720]){
   win.setContentSize(width,960);
   for(const page of ['library','decode','accounts','manage','audit']){
    await ui('selectView('+JSON.stringify(page)+')');await sleep(100);
    await check(page+' '+width+' 无横向溢出',async()=>assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true));
    if(width!==900)await capture(page+'-'+width);if(page==='library'&&width===1440){await ui('document.getElementById("lineup-grid").scrollIntoView({block:"start",behavior:"instant"})');await capture('library-results');await ui('window.scrollTo(0,0)');}
   }
  }
  win.setContentSize(1440,960);await ui('showLineup(lineups().find(l=>l.members.length))');await capture('detail');await ui('document.getElementById("detail-dialog").close();document.getElementById("open-login").click()');await capture('login');
  status={...status,authenticated:true,query_ready:false,stage:'roles_empty',roles_loaded:true,message:'暂无可用角色。请先在阴阳师手游中创建角色，再刷新。'};
  win.webContents.send('ta-status-changed',status);await sleep(100);await capture('login-no-roles');
  await check('无角色界面明确创建指引',async()=>assert.match(await ui('document.getElementById("ta-query-tip").textContent'),/创建角色/));
  await ui('document.getElementById("ta-enter").click()');win.webContents.setZoomFactor(2);await sleep(100);
  for(const page of ['library','accounts','decode','manage','audit']){await ui('selectView('+JSON.stringify(page)+')');await check(page+' 200%缩放',async()=>assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true));}
 }
 const report={version:require('../package.json').version,results,errors,synthetic:true,method:'生产 Electron 页面、预加载脚本与合成 IPC；失败注入、慢保存竞态、1440/900/720 像素及 200% 缩放。真实手机扫码与网易服务未在本轮实测。'};
 await fs.writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));
 await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification','optimization-ui-v'+report.version.replaceAll('.','')+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),profile,errors},null,2));
 app.exit(results.every(r=>r.passed)&&errors.length===0?0:1);
}
main().catch(async e=>{console.error(e);await fs.writeFile(path.join(profile,'error.txt'),e.stack).catch(()=>{});app.exit(1);});
