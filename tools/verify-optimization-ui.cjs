// Production Electron UI with synthetic state, credentials and disk failures.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {readIndex,readTable,readEncounters,readRecords}=require('../desktop/dungeon-catalog.cjs');
const {createRuneRunner}=require('../desktop/rune-runner.cjs');
const {Background}=require('../desktop/background.cjs');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'user-data','optimization-ui');
app.setPath('userData',profile);
app.disableHardwareAcceleration();
let win,stored,exported,failSave=false,failExport=false,failLoad=false,holdSave=false,heldSaves=[];
async function held(){for(let i=0;i<200;i++){if(heldSaves.length)return;await sleep(10);}throw Error("Save did not start");}
function releaseSaves(){holdSave=false;heldSaves.splice(0).forEach(resolve=>resolve());}
const results=[],errors=[],blank=()=>({schemaVersion:1,lineups:[],accounts:[],activeAccount:'',deletedPresetIds:[]});
const ui=async code=>{
 try{return await win.webContents.executeJavaScript(code);}
 catch(error){throw Error(error.message+' · '+code.slice(0,180));}
},sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code,timeout=5000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await ui(code))return;await sleep(25);}throw Error('UI timeout: '+code);}
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});console.error(name,e.message);}finally{releaseSaves();}}
async function capture(name){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await sleep(350);await fs.writeFile(path.join(profile,name+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));data.officialUpdate={autoUpdate:false};stored=blank();
 const background=new Background(),shareCalls=[];
 const local=(name,fn)=>{ipcMain.handle(name,(_e,...args)=>fn(...args));if(name==='export-json')ipcMain.handle('export-json-text',(_e,p)=>fn({name:p.name,data:JSON.parse(p.text)}));if(['load-data','load-state'].includes(name))ipcMain.handle(name+'-json',async(_e,...args)=>JSON.stringify(await fn(...args)));if(['save-state','save-parsed-state'].includes(name))ipcMain.handle(name+'-json',(_e,text)=>fn(JSON.parse(text)));};
 local('save-state-fields-json',async text=>{if(holdSave)await new Promise(resolve=>heldSaves.push(resolve));if(failSave)throw Error('synthetic disk full');if(!stored)return {needsSnapshot:true};stored={...JSON.parse(text),lineups:stored.lineups};return {saved:true};});
 local('parse-json',text=>JSON.parse(text));local('save-parsed-delta',()=>({needsSnapshot:true}));
 let status={authenticated:false,busy:false,stage:'idle',servers:[],selected_avatar:'',remembered_accounts:[]};
 local('load-data',()=>data);local('load-state',()=>{if(failLoad)throw Error('synthetic corrupt database');return stored;});
 for(const channel of ['save-state','save-parsed-state'])local(channel,async s=>{if(holdSave)await new Promise(resolve=>heldSaves.push(resolve));if(failSave)throw Error('synthetic disk full');stored=structuredClone(s);return {saved:true};});
 local('export-json',payload=>{if(failExport)throw Error('synthetic read-only target');exported=structuredClone(payload.data);return true;});
 local('ta-status',()=>status);local('ta-action',(_action,p)=>{status={...status,risk_accepted:p?.accepted};return status;});local('ta-logout',()=>status);
 local('copy-code',()=>({copied:true}));local('import-files',()=>[]);
 local('build-lineup',input=>background.run('build',{input,catalog:data}));
 local('ta-share',async code=>{
  shareCalls.push(code);
  return {code:await background.run('verify-share',{code,response:{err:0,share_key:'qa-stock-share',lineup_data:code}})};
 });
 for(const channel of ['official-status','official-auto','official-refresh','official-cancel'])local(channel,()=>({autoUpdate:false}));
 local('ta-query',()=>{throw Error('synthetic offline');});local('decode',()=>{throw Error('synthetic offline');});
 const catalog=await readIndex(path.join(root,'data/dungeon-catalog')).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
 local('dungeon-catalog-index',()=>catalog?.index||null);
 local('dungeon-catalog-table',name=>readTable(catalog,name));
 local('dungeon-catalog-encounters',()=>readEncounters(catalog));
 local('dungeon-catalog-records',(table,keys)=>readRecords(catalog,table,keys));
 const rune=process.env.ATLAS_RUNE_RUNTIME?createRuneRunner({configPath:process.env.ATLAS_RUNE_RUNTIME,scriptRoot:path.join(root,'tools'),suits:data.suits}):null;
 let runeEnabled=false,replayPlan=null,mockBattle=null,mockRandom=null,stopRandom=null;
 local('rune-battle-status',()=>runeEnabled?(rune?.status()||{available:true,resourceVersion:'0.0.816'}):{available:false});
 local('rune-battle-run',(plan,options)=>{
  replayPlan=plan;
  return mockBattle?.(plan,options)||rune?.run(plan,options)||{seed:options?.seed??0,engineSeconds:13,completed:true,outcome:'win',wavesCleared:3,bouts:6,overlapMs:873,unresolvedActions:0,spirit:{id:plan.spirit.id,star:plan.spirit.star,level:plan.spirit.lv}};
 });
 local('rune-battle-verify-random',(plan,seed,id)=>{
  const progress=update=>win.webContents.send('rune-battle-random-progress',id,update);
  return mockRandom?mockRandom(plan,seed,progress):rune?.verifyRandom(plan,seed,progress);
 });
 local('rune-battle-stop',()=>stopRandom?stopRandom():rune?.stop());
 win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 await win.loadFile(path.join(root,'app/index.html'));win.webContents.setZoomFactor(1);await sleep(80);await until('!!DATA && document.getElementById("loading").hidden');await ui('TALogin.ready()');
 if(catalog)await check('全副本目录搜索关卡、跳转敌方编组和查看活动规则',async()=>{
  await ui('selectView("library");document.getElementById("client-dungeons").open=true');
  if(catalog.index.encounters){
   await until('!!document.querySelector("#client-dungeons-encounter-list button")');
   await ui('window.qaEncounterInput=(family,query)=>{$("client-dungeons-encounter-family").value=family;const input=$("client-dungeons-encounter-query");input.value=query;input.dispatchEvent(new Event("input"));document.querySelector("#client-dungeons-encounter-list button").click();};qaEncounterInput("daily","魂王")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("御魂本p3-大蛇神")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/神罚.*攻击调整.*战斗站位/s);
   await ui('[...document.querySelectorAll(".dungeon-encounter-waves summary")].find(el=>el.textContent.includes("御魂本p3-大蛇神")).click()');
   await until('$("client-dungeons-encounter-detail").textContent.includes("单次受到伤害最多不超过100000")');
   await ui('qaEncounterInput("guild","贪婪的铁鼠")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("不能被复活")');
   await ui('qaEncounterInput("guild","狭间暗域 鬼童丸")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("击败副将后，首领战中的同名怪物血量减少50%")');
   await ui('qaEncounterInput("event","将魂试炼")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("2025-10-30 23:59")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/活动开放配置.*敌方初始鬼火.*敌方编组/s);
   await ui('$("client-dungeons").scrollIntoView({block:"start",behavior:"instant"})');
   await capture('client-dungeon-encounter');
   await ui('document.querySelector("#client-dungeons-encounter-detail .encounter-source button").click()');
   await until('$("client-dungeons-table").value==="act_team_battle"&&!$("client-dungeons-records").hidden');
   await ui('$("client-dungeons-table").value="pve_stage_data";$("client-dungeons-table").dispatchEvent(new Event("change"))');
  }
  await until('!document.getElementById("client-dungeons-records").hidden');
  await ui('window.qaCatalogInput=(id,value)=>{const el=document.getElementById("client-dungeons-"+id);el.value=value;el.dispatchEvent(new Event(el.tagName==="SELECT"?"change":"input"));};qaCatalogInput("row-query","3345301");document.querySelector("#client-dungeons-list button").click()');
  assert.match(await ui('document.getElementById("client-dungeons-detail").textContent'),/礁石.*敌方初始鬼火/s);
  await ui('document.querySelector("#client-dungeons-detail button").click()');
  await until('document.getElementById("client-dungeons-detail").textContent.includes("3345301")');
  assert.equal(await ui('document.getElementById("client-dungeons-table").value'),'BattleMonstersInfo');
  await ui('qaCatalogInput("family","event");qaCatalogInput("query","组队战斗");qaCatalogInput("table","act_team_battle")');
  await until('!document.getElementById("client-dungeons-records").hidden');
  await ui('qaCatalogInput("row-query","将魂试炼");document.querySelector("#client-dungeons-list button").click()');
  assert.match(await ui('document.getElementById("client-dungeons-detail").textContent'),/将魂试炼.*team_player_num/s);
  await ui('document.getElementById("client-dungeons").scrollIntoView({block:"start",behavior:"instant"});document.querySelector("#client-dungeons-detail details").open=true');
  await capture('client-dungeon-catalog');
  await ui('document.querySelector("#client-dungeons-detail button").click()');
  await until('document.getElementById("client-dungeons-detail").textContent.includes("SSR3困难")');
  assert.equal(await ui('document.getElementById("client-dungeons-table").value'),'pve_stage_data');
  await ui('qaCatalogInput("family","guild");qaCatalogInput("query","首领退治");qaCatalogInput("table","guild_boss_show")');
  await until('!document.getElementById("client-dungeons-records").hidden');
  await ui('qaCatalogInput("row-query","贪婪的铁鼠");document.querySelector("#client-dungeons-list button").click()');
  assert.match(await ui('document.getElementById("client-dungeons-detail").textContent'),/首领机制.*不能被复活/s);
  await ui('document.getElementById("client-dungeons").open=false');
 });
 if(catalog?.index.encounters&&catalog.entries.has('tipsInfoData_cn'))await check('通用关卡默认场景、站位以及原版战斗和秘闻规则可查',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  await ui('qaEncounterInput("battle","3345301")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("通用 PvE 默认场景")');
  const rocks=await ui('$("client-dungeons-encounter-detail").textContent');
  assert.match(rocks,/礁石.*默认场景.*819.*站位配置 ID.*418.*战斗站位.*敌方 1 号位.*55\.0,0\.0,0\.0,1\.6,270\.0/s);
  await ui('qaEncounterInput("battle","12136001")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("首领凝炼5朵磐长花")');
  assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/通用战斗规则原文.*叩岩.*击退行动条的概率提升到100%/s);
  await ui('qaEncounterInput("daily","流萤之夏")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("虫师根据场上存活目标的奇偶")');
  const rules=await ui('document.querySelector(".encounter-rule-text").textContent');
  assert.match(rules,/秘闻副本·流萤之夏.*会优先被虫师化为虫茧/s);
  assert.doesNotMatch(rules,/<(?:green|orange)>|<\/>/);
  win.setContentSize(720,960);
  assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);
  win.setContentSize(1440,1000);
  await ui('document.querySelector(".encounter-rule-text").closest("section").scrollIntoView({block:"start",behavior:"instant"})');
  await capture('client-dungeon-verified-rule');
  await ui('$("client-dungeons").open=false');
 });
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
  await check('旧弹窗的延迟关闭事件不清空已重新打开的备份预览',async()=>{
   const before=await ui('JSON.stringify(STATE)'),backup={...blank(),format:'onmyoji-atlas-backup'};
   try{
    await ui('importMode="backup";handleFiles('+file(backup)+')');
    await ui('new Promise(resolve=>{const dialog=document.getElementById("detail-dialog");dialog.addEventListener("close",()=>resolve(),{once:true});dialog.close();previewBackupRestore();})');
    assert.equal(await ui('document.getElementById("detail-dialog").open'),true);
    assert.equal(await ui('!!pendingBackup'),true,'旧 close 事件不能取消新预览');
    assert.equal(await ui('JSON.stringify(STATE)'),before);
   }finally{
    await ui('new Promise(resolve=>{const dialog=document.getElementById("detail-dialog");if(!dialog.open)return resolve();dialog.addEventListener("close",()=>resolve(),{once:true});dialog.close();})');
   }
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
  assert.match(await ui('document.getElementById("account-import-error").textContent'),/导入失败.*synthetic\.json/);
 });
 await check('魂王按原码筛选，排除其他副本的勾选项',async()=>{
  await ui('selectView("library");document.getElementById("dungeon-workbench").open=true;renderDungeonRules()');
  assert.equal(await ui('selectedDungeon().id'),102);
  assert.equal(await ui('document.querySelectorAll(".dungeon-wave").length'),3);
  assert.equal(await ui('document.querySelectorAll(".dungeon-wave li").length'),9);
  assert.match(await ui('document.getElementById("dungeon-rules-details").textContent'),/0\.0\.816.*大蛇神/);
  await ui('document.getElementById("dungeon-show-lineups").click()');
  assert.equal(await ui('filteredLineups().length>0&&filteredLineups().every(l=>Number(l.gameSceneId)===1001001)'),true);
  await ui('const row=filteredLineups().find(C.hasParsedContent);selectedLineups.add(row.id);renderSelection();document.getElementById("dungeon-workbench").scrollIntoView({block:"start"})');
  assert.equal(await ui('document.getElementById("dungeon-match-selected").disabled'),false);
  assert.match(await ui('document.getElementById("dungeon-rules-details").textContent'),/我方 3 \/ 敌方 2.*攻击加成率 \+200%.*攻击加成率 \+240%.*攻击加成率 \+220%/s);
  assert.match(await ui('document.getElementById("dungeon-rules-details").textContent'),/开场速度 135.*生命 800,001.*攻击 6,858\.24.*防御 580/s);
  await capture('dungeon-soul-12');
  await ui('document.getElementById("dungeon-match-selected").click()');
  await until('matchJobIds.size===0');
  assert.match(await ui('document.getElementById("dungeon-match-status").textContent'),/已核对 1 个/);
  await ui('document.getElementById("dungeon-workbench").open=false;document.getElementById("clear-filters").click()');
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
  const desktopRaw={...raw,format:'yys-desktop-cache-v1',heroCount:1,inventoryCount:1,retainedCount:1,excludedCount:0,heroes:{a:{...raw.heroes.a,equips:['desktop-first']}},souls:[{id:'desktop-first',slot:1,quality:6,level:15,setId:'招财猫',mainAttrType:'attack_flat',mainAttrValue:25,subAttributes:[{type:'crit_rate',value:.03}],equippedState:null}],equipPresets:[['合成桌面预设',['desktop-first']]]};
  delete desktopRaw.hero_equips;
  const desktopCache={version:2,rawSha256:'a'.repeat(64),sourceKind:'desktop',sourcePayload:desktopRaw,normalizedSouls:[]};
  await check('桌面版本 2 缓存经后台导入后显示实际式神、御魂和预设',async()=>{
   await ui('importMode="accounts";document.getElementById("merge-import").checked=false;handleFiles('+file(desktopCache)+')');
   assert.equal(stored.accounts[0].raw.format,'yys-desktop-cache-v1');assert.equal(stored.accounts[0].souls['desktop-first'].stats.attack,25);
   assert.equal(Object.hasOwn(stored.accounts[0].raw,'hero_equips'),false);
   await ui('selectView("accounts");window.scrollTo(0,0)');
   assert.deepEqual(await ui('[...document.querySelectorAll("#account-summary .overview strong")].map(e=>e.textContent)'),['1','1','1','1']);
   const summary=await ui('document.getElementById("account-summary").textContent');
   assert.match(summary,/御魂：完整/);assert.match(summary,/1 件已穿戴，0 件未穿戴/);await capture('snapshot-desktop-cache');
  });
  await check('桌面与旧版库存交叉合并，导出备份、重启和恢复均保留旧御魂',async()=>{
   await ui('document.getElementById("merge-import").checked=true;importMode="accounts";handleFiles('+file(raw)+')');
   assert.equal(stored.accounts[0].raw.format,'mumu-snapshot-v1');assert.equal(stored.accounts[0].raw.hero_equips.length,1);
   assert.equal(Object.hasOwn(stored.accounts[0].raw,'souls'),false);
   assert.equal(await ui('STATE.accounts[0].presets.length'),1);
   assert.match(await ui('document.getElementById("account-summary").textContent'),/全仓库的穿戴归属待核对/);
   const latest={...desktopRaw,souls:[{...desktopRaw.souls[0],id:'desktop-second',mainAttrValue:40}]};
   await ui('importMode="accounts";handleFiles('+file(latest)+')');
   assert.equal(stored.accounts[0].raw.souls.length,2);assert.equal(Object.hasOwn(stored.accounts[0].raw,'hero_equips'),false);
   assert.equal(await ui('exportBackup()'),true);const backup=structuredClone(exported);
   await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA && document.getElementById("loading").hidden');
   assert.equal(await ui('Object.keys(STATE.accounts[0].souls).length'),2);
   await ui('importMode="backup";handleFiles('+file(backup)+')');await ui('applyBackupRestore()');
   assert.equal(stored.accounts[0].souls['desktop-first'].stats.attack,25);assert.equal(stored.accounts[0].souls['desktop-second'].stats.attack,40);
   assert.equal(stored.accounts[0].merged,true);assert.equal(stored.accounts[0].raw.souls.length,2);
  });
 await check('勾选魂王阵容后原版复跑遵守不佩戴御魂，并带入真实选中的契灵',async()=>{
  const source=data.lineups.find(l=>l.gameSceneId===1001001&&l.members.length===6&&!l.members[0].qiling&&l.members[0].onmyojiId==='11');
  const lineup={...source,id:'qa-rune-e2e',code:'|TA|qa-rune-e2e',title:'魂王复跑验收',requirementsComplete:true,
   members:source.members.map(m=>m.kind==='onmyoji'?{...m,qiling:{id:101,star:5,lv:3,mark_gid:2,marks:[9,9]}}:
    {...m,config:m.index===5?{scope:'all',keepCurrent:true,protocol:{...m.config.protocol,notCalcFlag:1}}:{scope:'all'},aiSkill:0})};
  const roles=lineup.members.filter(m=>m.kind==='shikigami');
  const heroes=Object.fromEntries(roles.map(m=>[`native-${m.index}`,{
   heroId:Number(m.shikigamiId),level:40,star:6,awake:m.awakening,skinfo:m.skills.map(s=>[s.id,s.level]),
   equips:Array.from({length:6},(_,i)=>`gear-${m.index}-${i}`),
   attrs:[[8000,0,0,0],[101,0,0,0],[.5,0,0,0],[.1,0,0,0],[500,0,0,0],[2500,0,0,0],0,0],
  }]));
  const hero_equips=roles.flatMap(m=>Array.from({length:6},(_,i)=>({id:`gear-${m.index}-${i}`,slot:i+1,quality:6,level:15,
   setId:'招财猫',mainAttrType:'attack_flat',mainAttrValue:40,subAttributes:[]})));
  const spirit={id:101,star:6,lv:5,shiny:false,marks:[9,9,10]};
  const roster={...raw,heroes,hero_equips,hunlings:[{...spirit,uid:'qa-spirit',mark_gid:2}]};
  runeEnabled=true;
  await ui(`stopMatch();STATE={...${JSON.stringify(blank())},lineups:[${JSON.stringify(lineup)}],accounts:[C.parseAccount(${JSON.stringify(roster)})]};STATE.activeAccount=STATE.accounts[0].id;matchResults={};runeStatus=null;selectView('library');$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.add('qa-rune-e2e');renderSelection();`);
  await until('!$("dungeon-match-selected").disabled&&$("dungeon-match-selected").textContent.includes("复跑")');
  await ui('$("dungeon-match-selected").click()');
  await until('dungeonBattle?.rows.every(row=>row.state==="finished")',110000);
  assert.match(await ui('$("dungeon-battle-results").textContent'),/本次复跑(失败|通关).*随机分支/s);
  assert.match(await ui('$("dungeon-battle-results").textContent'),/已佩戴.*6 星 5 级/);
  assert.deepEqual(replayPlan.spirit,spirit);
  assert.equal(replayPlan.members.length,5);
  assert.equal(new Set(replayPlan.members.flatMap(member=>member.souls.map(soul=>soul.id))).size,24);
  assert.equal(replayPlan.members.at(-1).souls.length,0);
  await ui('$("dungeon-workbench").scrollIntoView({block:"start"})');await capture('dungeon-selected-replay');
  await ui('showLineup(lineups().find(l=>l.id==="qa-rune-e2e"))');
  assert.match(await ui('document.querySelector("[data-member=\\"5\\"]").textContent'),/原码要求不佩戴御魂/);
  assert.equal(await ui('document.querySelectorAll("[data-member=\\"5\\"] .soul-slot").length'),0);
  await ui('$("detail-dialog").close()');
  try{
   for(const verdict of ['unknown','loss','pass']){
    const seeds=[];
    mockBattle=(_plan,options)=>{
     assert.equal(options.fixedStep,true);seeds.push(options.seed);
     const outcome=options.seed===1&&verdict!=='pass'?verdict:'win';
     return {seed:options.seed,completed:outcome!=='unknown',outcome,wavesCleared:outcome==='win'?3:1,bouts:6,engineSeconds:13};
    };
    await ui('$("dungeon-match-selected").click()');
    await until(`dungeonBattle?.rows[0]?.verdict===${JSON.stringify(verdict)}&&!dungeonBattle.running`);
    const all=verdict==='pass';
    assert.deepEqual(seeds,all?[0,1,2,3,7,42]:[0,1]);
    assert.equal(await ui('$("dungeon-search-stock").hidden'),verdict!=='loss');
    const status=await ui('$("dungeon-battle-results").textContent');
    assert.match(status,/种子 0.*本次复跑通关/s);
    if(all)assert.match(status,/已通过 6 个采样种子.*种子 42/s);
    else if(verdict==='unknown')assert.match(status,/复跑结算待核对/);
    else assert.match(status,/种子 1 未通关/);
   }
  }finally{mockBattle=null;}
  await ui('stopMatch();$("dungeon-workbench").open=false');
 });
 await check('勾选原码无解后才开放备选，分开显示各个种子的战报',async()=>{
  const source=data.lineups.find(l=>l.gameSceneId===1001001&&l.members.length===6&&!l.members[0].qiling&&l.members[0].onmyojiId==='11');
  const lineup={...source,id:'qa-stock-search',code:'|TA|qa-stock-search'};
  const ids=[591,389,596,557,379,372,554];
  const heroes=Object.fromEntries(ids.map(id=>['stock-'+id,{heroId:id,level:40,star:6,awake:1,equips:[],
   skinfo:data.gameConfig.heroes[id].skills.map(s=>[s,1])}]));
  const stats=[['attack_flat',486],['speed',57],['defense_flat',104],['attack_rate',.55],['hp_flat',2052],['crit_rate',.55]];
  const hero_equips=['海月火玉','针女','火灵','元兴寺','心眼','网切'].flatMap((setId,i)=>stats.map(([mainAttrType,mainAttrValue],j)=>({
   id:`stock-${i}-${j}`,slot:j+1,quality:6,level:15,setId,mainAttrType,mainAttrValue,subAttributes:[{type:'crit_rate',value:.1}]
  })));
  const calls=[];let winner;
  mockBattle=(plan,options)=>{
   const ids=JSON.stringify(plan.members.map(m=>[m.instanceId,m.souls.map(q=>q.id)]));
   winner??=ids;calls.push({ids,options});
   const win=winner===ids;
   return {seed:options.seed,engineSeconds:13+options.seed,completed:true,outcome:win?'win':'loss',
    wavesCleared:win?3:1,bouts:6,overlapMs:873,unresolvedActions:0,randomObservations:{observed:75,other:12,alternatives:9},monsterHealth:[
     {wave:2,cleared:win,monsters:[{id:4741297,initialHp:198501,lowestHp:5000,lastHp:win?0:120000,regainedHp:135000,zeroToAlive:0}]}
    ]};
  };
  try{
   await ui(`stopMatch();DATA={...DATA,lineups:[]};STATE={...${JSON.stringify(blank())},lineups:[${JSON.stringify(lineup)}],accounts:[C.parseAccount(${JSON.stringify({...raw,heroes,hero_equips})})]};STATE.activeAccount=STATE.accounts[0].id;matchResults={};selectView('library');$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.add('qa-stock-search');renderSelection();`);
   assert.equal(await ui('$("dungeon-search-stock").hidden'),true);
   await ui('$("dungeon-match-selected").click()');
   await until('!$("dungeon-search-stock").hidden');
   assert.equal(calls.length,0);
   assert.match(await ui('$("dungeon-match-status").textContent'),/勾选的阵容均已证明库存无解/);
   await ui('$("dungeon-search-stock").click()');
   await until('dungeonStock&&!dungeonStock.running',20000);
   assert.deepEqual(calls.filter(x=>x.ids===winner).map(x=>x.options),[0,1,2,3,7,42].map(seed=>({seed,fixedStep:true})));
   assert.ok(calls.some(x=>x.ids!==winner),'需要至少一个落败的合成候选');
   const top=await ui('document.querySelector(".dungeon-stock-card").textContent');
   assert.match(top,/种子 0.*本次复跑通关.*种子 42.*本次复跑通关/s);
   assert.match(await ui('$("dungeon-stock-list").textContent'),/本次复跑失败/);
   assert.match(await ui('$("dungeon-stock-results").textContent'),/所有随机分支仍待验证/);
   await ui('document.querySelector(".dungeon-stock-card summary").click()');
   assert.match(await ui('document.querySelector(".dungeon-stock-card details[open]").textContent'),/速度.*暴击.*×/s);
   await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=health] summary").click()');
   assert.match(await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=health][open]").textContent'),/日和坊.*最低 5,000.*生命回升 135,000/s);
   await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=random] summary").click()');
   assert.match(await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=random][open]").textContent'),/可达随机分支仍待验证.*75 次概率判断.*9 次可以翻转.*12 次其他随机调用/s);
   const result={seed:0,eligible:9,sites:3,planned:2,baseline:{bouts:8,engineSeconds:20},trials:[
    {index:4,method:'randomAttack',line:84,wave:1,comparison:'lt',threshold:.5,before:true,completed:true,outcome:'win',wavesCleared:3,bouts:6,engineSeconds:18},
    {index:9,method:'randomBuff',line:19,wave:3,comparison:'lt',threshold:.4,before:false,completed:true,outcome:'loss',wavesCleared:2,bouts:9,engineSeconds:24},
   ]};
   const startAudit=()=>ui('document.querySelector("[data-stock-audit]").click()');
   mockRandom=(_plan,seed,progress)=>{
    assert.equal(seed,0);progress({...result,trials:result.trials.slice(0,1)});
    return new Promise((_resolve,reject)=>{stopRandom=()=>reject(Error('已停止'));});
   };
   await startAudit();
   await until('document.querySelector("[data-stock-section$=random][open]").textContent.includes("正在测试 1/2")');
   assert.equal(await ui('document.querySelector("[data-stock-audit]").disabled'),true);
   await ui('$("dungeon-stop-battle").click()');
   await until('!dungeonStopPending&&!document.querySelector("[data-stock-audit]").disabled');
   assert.match(await ui('document.querySelector("[data-stock-section$=random][open]").textContent'),/已停止 1\/2.*减少 2 回合.*快 2\.00 秒/s);
   assert.equal(await ui('document.activeElement.dataset.stockAudit'),'0');
   mockRandom=(_plan,seed,progress)=>{
    assert.equal(seed,0);progress({...result,trials:[]});return result;
   };
   await startAudit();
   await until('document.querySelector("[data-stock-section$=random][open]").textContent.includes("已结束 2/2")');
   assert.match(await ui('document.querySelector("[data-stock-section$=random][open]").textContent'),/1 次通关，1 次未通关.*第 9 次 · 未通关 · 2 波/s);
   assert.match(await ui('document.querySelector("[data-stock-section$=random][open]").textContent'),/第 1、3 波已有判断完成测试/);
   await ui('document.querySelector("[data-stock-section$=random][open]").scrollIntoView({block:"start",behavior:"instant"})');
   await capture('dungeon-stock-random-trials');
   stopRandom=null;mockRandom=null;
   await ui('$("dungeon-stock-results").scrollIntoView({block:"start"})');await capture('dungeon-stock-search');
   win.setContentSize(720,960);
   try{assert.equal(await ui('$("dungeon-stock-results").scrollWidth<=$("dungeon-stock-results").clientWidth+2'),true);}
   finally{win.setContentSize(1440,1000);}
   assert.equal(await ui('document.querySelectorAll("[data-stock-preview]").length'),1);
   await ui('document.querySelector("[data-stock-preview]").click()');
   await until('document.querySelector(".rune-code-preview img")?.naturalWidth>0');
   assert.equal(await ui('!!$("stock-candidate-upload")'),false);
   const code=await ui('$("stock-candidate-code").value');assert.match(code,/^#TA#/);
   assert.equal(shareCalls.length,0);
   await capture('dungeon-candidate-code');
   await ui('$("stock-candidate-save").click()');
   await until('$("stock-candidate-status").textContent.includes("已保存")');
   const saved=stored.lineups.find(l=>l.code===code);assert.equal(saved.runeReceipts.length,1);
   await ui('$("detail-dialog").close()');
   const offline=status;
   status={...status,authenticated:true,risk_accepted:true,query_ready:true,selected_server:String(raw.player.serverId),selected_avatar:'synthetic',
    servers:[{id:String(raw.player.serverId),name:'测试区改名',category:'测试',available:true,roles:[{avatar_id:'synthetic',name:'测试角色'}]}]};
   win.webContents.send('ta-status-changed',status);
   try{
    await until('TALogin.status().selected_avatar==="synthetic"&&account().server==="测试区改名"');
    await ui('reloadOfficial()');
    await ui('document.querySelector("[data-stock-preview]").click()');
    await ui('$("stock-candidate-upload").click()');
    try{
     await until('$("stock-candidate-short").textContent==="|TA|qa-stock-share"&&!$("stock-candidate-short").hidden');
     await until('STATE.lineups.some(l=>l.shortCode==="|TA|qa-stock-share")');
    }catch(error){throw Error(error.message+' · '+await ui('$("stock-candidate-status")?.textContent'));}
    assert.deepEqual(shareCalls,[code]);
    assert.equal(stored.lineups.find(l=>l.id===saved.id).shortCode,'|TA|qa-stock-share');
   }finally{status=offline;win.webContents.send('ta-status-changed',status);}
   await ui(`$("detail-dialog").close();showLineup(lineups().find(l=>l.id===${JSON.stringify(saved.id)}));$("export-lineup").click()`);
   await until('!$("dialog-feedback").hidden');
   assert.equal(Object.hasOwn(exported,'runeReceipts'),false);
   await win.loadFile(path.join(root,'app/index.html'));
   await until('!!DATA && $("loading").hidden');
   await ui(`$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.add(${JSON.stringify(saved.id)});renderSelection()`);
   await until('!$("dungeon-match-selected").disabled&&$("dungeon-match-selected").textContent.includes("复跑")');
   await ui('$("dungeon-match-selected").click()');
   await until('dungeonBattle?.rows[0]?.state==="finished"',10000);
   assert.match(await ui('$("dungeon-battle-results").textContent'),/按已保存配装.*本次复跑通关/s);
   assert.equal(calls.at(-1).ids,winner);
   assert.deepEqual(replayPlan.onmyoji.skinfo,[[1003,5],[1008,5],[1011,5]]);
  }finally{mockBattle=null;mockRandom=null;stopRandom=null;await ui('stopMatch();$("dungeon-workbench").open=false');}
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
 await background.close();
 await fs.writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));
  await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(process.env.YUQI_UI_REPORT||path.join(root,'verification','optimization-ui-v'+report.version.replaceAll('.','')+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),profile,errors},null,2));
 app.exit(results.every(r=>r.passed)&&errors.length===0?0:1);
}
main().catch(async e=>{console.error(e);await fs.writeFile(path.join(profile,'error.txt'),e.stack).catch(()=>{});app.exit(1);});
