// Production Electron UI with synthetic state, credentials and disk failures.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {readIndex,readTable,readEncounters,readRecords}=require('../desktop/dungeon-catalog.cjs');
const {createRuneRunner}=require('../desktop/rune-runner.cjs');
const {createRuneFloorRunner}=require('../desktop/rune-floor-runner.cjs');
const {createPveStageRunner}=require('../desktop/pve-stage-runner.cjs');
const {sampleSeeds:commonSeeds,teamKey}=require('../app/rune-search.js');
const game=require('../app/game-config.js');
const {Background}=require('../desktop/background.cjs');
const {applyLatestHeroes}=require('../desktop/latest-heroes.cjs');
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
 const data=applyLatestHeroes(JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8')));data.officialUpdate={autoUpdate:false};stored=blank();
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
 const runtime={configPath:process.env.ATLAS_RUNE_RUNTIME,scriptRoot:path.join(root,'tools'),suits:data.suits};
 const rune=runtime.configPath?createRuneRunner(runtime):null;
 const runeFloor=runtime.configPath?createRuneFloorRunner(runtime):null,floorCalls=[];
 const pve=runtime.configPath?createPveStageRunner(runtime):null;
 let mockPve=null,stopPve=null;
 local('pve-stage-status',()=>({available:true,resourceVersion:'0.0.816',battleModes:[3,29,266,267,306,528,2000,2001]}));
 local('pve-stage-run',(plan,options)=>mockPve?mockPve(plan,options):pve.run(plan,options));
 local('pve-stage-stop',()=>stopPve?stopPve():pve?.stop());
 let runeEnabled=false,replayPlan=null,mockBattle=null,mockRandom=null,stopRandom=null,mockSeeds=null,stopSeeds=null,savedEvidence=null;
 const seedEvidence=(props={})=>({scope:'local-solo-rune',status:'incomplete',total:10000,wins:73,loss:null,
  slowest:{seed:13,engineSeconds:25.5,combatMs:14400},...props});
 local('rune-battle-status',async()=>runeEnabled?{...(await rune?.status()||{available:true,resourceVersion:'0.0.816'}),floors:[101,102,103]}:{available:false});
 local('rune-battle-run',(plan,options)=>{
  replayPlan=plan;
  if(options?.dungeonId===101)floorCalls.push(options);
  const runner=options?.dungeonId===101?runeFloor:rune;
  return mockBattle?.(plan,options)||runner?.run(plan,options)||{seed:options?.seed??0,engineSeconds:13,completed:true,outcome:'win',wavesCleared:3,bouts:6,overlapMs:873,unresolvedActions:0,spirit:plan.spirit&&{id:plan.spirit.id,star:plan.spirit.star,level:plan.spirit.lv}};
 });
 local('rune-battle-verify-random',(plan,seed,id)=>{
  const progress=update=>win.webContents.send('rune-battle-random-progress',id,update);
  return mockRandom?mockRandom(plan,seed,progress):rune?.verifyRandom(plan,seed,progress);
 });
 local('rune-battle-seed-evidence',(plan,dungeonId)=>savedEvidence?.(plan,dungeonId)??null);
 local('rune-battle-verify-seeds',(plan,id,dungeonId)=>mockSeeds(plan,update=>win.webContents.send('rune-battle-seeds-progress',id,update),dungeonId));
 local('rune-battle-stop',()=>stopSeeds?stopSeeds():stopRandom?stopRandom():runeFloor?.stop()||rune?.stop());
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
   if(catalog.entries.has('gve_monster_wave')){
    await ui('qaEncounterInput("guild","阴界之门 入口 101")');
    await until('$("client-dungeons-encounter-detail").textContent.includes("70 波 · 查看随机编组与属性修正")');
    const detail='$("client-dungeons-encounter-detail")';
    assert.match(await ui(detail+'.textContent'),/阴界之门入口 · 101.*我方起始共享鬼火 2.*敌方起始鬼火 4.*四轮队伍/s);
    assert.equal(await ui(detail+'.querySelectorAll(".dungeon-encounter-waves").length'),0);
    await ui(`window.qaOpenUnderworld=(text)=>[...${detail}.querySelectorAll('summary')].find(el=>el.textContent.includes(text)).click();qaOpenUnderworld('70 波 · 查看')`);
    await until(detail+'.textContent.includes("第 70 波 · 40 级 · 随机组 300050")');
    await ui('qaOpenUnderworld("第 1 波 · 10 级")');
    await until(detail+'.textContent.includes("天邪鬼绿 · 10 级 · 2 号位")');
    assert.equal(await ui(detail+'.querySelector("select").options.length'),207);
    await ui(`{const menu=${detail}.querySelector('select');menu.value='1';menu.dispatchEvent(new Event('change'));}`);
    await until(detail+'.textContent.includes("唐纸伞妖 · 10 级 · 2 号位")');
    await ui('qaOpenUnderworld("第 70 波 · 40 级")');
    await until(detail+'.textContent.includes("清姬【裂缝BOSS】 · 40 级 · 1 号位")');
    assert.match(await ui(detail+'.textContent'),/攻击 \+1,300%.*速度 \+75/s);
   }
   await ui('qaEncounterInput("event","将魂试炼")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("2025-10-30 23:59")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/活动开放配置.*敌方初始鬼火.*敌方编组/s);
   if(catalog.entries.has('battle_team_routes')){
    const detail=await ui('$("client-dungeons-encounter-detail").textContent');
    assert.match(detail,/原版组队战斗入口 · 3507.*战斗模式 ID2507.*战斗引擎类FakeGod7GeneralSoulBattleEngine/s);
    assert.match(detail,/战斗模式默认规则 · 2507.*跨轮保留敌方生命否.*默认战斗时限（秒）180.*共享敌方生命是/s);
   }
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
 if(catalog?.index.encounters&&JSON.parse(await readEncounters(catalog)).entries.some(entry=>entry.table==='story_room')){
  await check('按原版路径从探索入口跳转战斗点和主线单场战斗',async()=>{
   await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click();qaEncounterInput("daily","阴阳之理 地图探索入口")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("大天狗挑战难度1")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/玩法入口 ID18.*探索战斗点 · 大天狗挑战难度1 · 1801/s);
   await ui('[...$("client-dungeons-encounter-detail").querySelectorAll(".encounter-source")].find(el=>el.querySelector("h4").textContent.endsWith(" · 1801")).querySelector("button:last-child").click()');
   await until('$("client-dungeons-encounter-detail").textContent.includes("探索敌方编组 · 31811")');
   const detail=await ui('$("client-dungeons-encounter-detail").textContent');
   assert.match(detail,/阴阳之理 · 大天狗挑战难度1.*探索 PvE 关卡.*31811.*探索敌方编组 · 31811.*战斗站位/s);
   await capture('client-exploration-room');
   await ui('qaEncounterInput("daily","主线剧情进程 犬神战斗")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("主线单场战斗")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/剧情目标.*找出故弄玄虚者的蛛丝马迹.*主线单场战斗.*30101/s);
   await ui('$("client-dungeons").open=false');
  });
 }
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
 if(catalog?.index.encounters&&catalog.entries.has('journey_hardbattle'))await check('京畿净化区分资源参数和首领挑战，首领显示原版波次和规则',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  await ui('qaEncounterInput("event","京畿净化战斗参数 金币 棋盘 11 战斗参数 20 300")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("战斗参数编号20")');
  const parameters=await ui('$("client-dungeons-encounter-detail").textContent');
  assert.match(parameters,/金币 · 棋盘 11 · 战斗参数 20.*攻击参数.*速度参数.*权重23/s);
  assert.doesNotMatch(parameters,/敌方编组|通用 PvE 关卡|未找到对应记录/);
  await ui('qaEncounterInput("event","京畿净化战斗参数 御魂")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("御魂 · 棋盘")');
  await ui('qaEncounterInput("event","京畿净化首领挑战 七人岬·扇")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("每层首领挑战祝福")');
  const challenge=await ui('$("client-dungeons-encounter-detail").textContent');
  assert.match(challenge,/七人岬·扇.*首领挑战关卡.*731001.*体力消耗3.*每层首领挑战祝福.*敌方编组 · 731001/s);
  assert.equal(await ui('$("client-dungeons-encounter-detail").querySelectorAll(".dungeon-encounter-waves ul").length'),1);
  await ui('document.querySelector(".encounter-rule-text").closest("section").scrollIntoView({block:"start",behavior:"instant"})');
  await capture('client-journey-challenge');
  await ui('$("client-dungeons").open=false');
 });
 if(catalog?.index.encounters&&catalog.entries.get('battle_mode_routes')?.fields.includes('scene_engine'))await check('可从战斗模式查找场景声明引擎和原脚本来源',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  await ui('qaEncounterInput("battle","MODE_PVE MonstarGuanKaEngine")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("MonsterGuanKaScene.py")');
  const pve=await ui('$("client-dungeons-encounter-detail").textContent');
  assert.match(pve,/战斗模式 3 · MODE_PVE · MonstarGuanKaEngine.*场景声明引擎MonstarGuanKaEngine.*scenemembers\/MonsterGuanKaScene\.py.*6d10449fa0d389ec0e7d53591abc3d97e049d1ebad146095996bf14369b6a802/s);
  await ui('qaEncounterInput("battle","MODE_AWAKE_FB AwakeFbEngine")');
  await until('$("client-dungeons-encounter-detail").textContent.includes("AwakeFbScene.py")');
  assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/场景声明引擎AwakeFbEngine.*可选用其他引擎或场景/s);
  await ui('$("client-dungeons").scrollIntoView({block:"start",behavior:"instant"})');
  await capture('client-awake-scene-engine');
  await ui('$("client-dungeons").open=false');
 });
 const raw={format:'mumu-snapshot-v1',completeness:'complete',player:{name:'验收库存',serverId:'10014',shortId:'synthetic'},heroes:{a:{heroId:608,level:40,star:6,awake:1,skinfo:[[6081,1]]}},hero_equips:[]};
 if(catalog?.index.encounters)await check('通用 PvE 优先复跑勾选原码，觉醒和秘闻按原版开场测试库存与阵容码',async()=>{
  const ids=[591,389,596,554,379,557],heroes={},items=[];
  for(const id of ids){
   const prototype=data.gameConfig.heroes[id],prefix='pve-'+id;
   const skinfo=prototype.skills.map(skill=>[skill,game.levels(data.gameConfig,skill,1).at(-1).level]);
   const equips=Array.from({length:6},(_,i)=>prefix+'-soul-'+i);
   heroes[prefix]={heroId:id,level:40,star:6,awake:1,skinfo,equips,
    attrs:[[8000,0,0,0],[101,0,0,0],[.5,0,0,0],[.1,0,0,0],[500,0,0,0],[2500,0,0,0],0,0]};
   equips.forEach((id,i)=>items.push({id,slot:i+1,quality:6,level:15,setId:'火灵',
    mainAttrType:['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'][i],
    mainAttrValue:[486,57,104,.55,2052,.55][i],subAttributes:[{type:'crit_rate',value:.1}]}));
  }
  const fighters=ids.slice(0,3).map((id,index)=>({index:index+1,kind:'shikigami',name:data.gameConfig.heroes[id].name,
   shikigamiId:String(id),level:40,star:6,awakening:1,skills:heroes['pve-'+id].skinfo.map(([id,level])=>({id,level})),
   aiSkill:0,config:{keepCurrent:true}}));
  const selected=[10,13].map((id,i)=>({id:'qa-pve-'+id,title:'复跑原码 '+i,code:'|TA|qa-pve-'+id,
   gameSceneId:1001001,requirementsComplete:true,decodeState:'decoded-local',members:[
    {index:0,kind:'onmyoji',name:data.gameConfig.heroes[id].name,onmyojiId:String(id),level:60,star:2,awakening:0,aiSkill:0,
     skills:(i?[1304,1302]:[1008,1011]).map(id=>({id,level:5}))},...fighters]}));
  const boot=await ui('JSON.stringify(STATE)');
  const calls=[],sample={completed:true,outcome:'win',waveCount:1,wavesCleared:1,bouts:3,engineSeconds:18,
   animationPlayback:{combatElapsedMs:6910,combatOverlapMs:1100,interruptedClips:0,unresolved:0}};
  let mode='loss';
  mockPve=(plan,options)=>{
   const {stageId,groupId,seed}=options;
   assert.equal(stageId,31811);assert.equal(groupId,31811);
   assert.equal(plan.members.length,3);
   assert.equal(new Set(plan.members.map(row=>row.instanceId)).size,3);
   const souls=plan.members.flatMap(row=>row.souls.map(q=>q.id));
   assert.equal(new Set(souls).size,souls.length);
   assert.ok(souls.every(id=>items.some(q=>q.id===id)));
   calls.push({actor:plan.onmyoji.heroId,seed});
   if(mode==='hold')return new Promise(resolve=>{stopPve=()=>resolve({...sample,seed});});
   return mode==='loss'?{...sample,seed,outcome:'loss',wavesCleared:0}:{...sample,seed};
  };
  const reports='document.querySelector("[data-pve-results]")';
  const status='document.querySelector("[data-pve-status]")';
  const stock='document.querySelector("[data-pve-stock]")';
  try{
   await ui(`stopMatch();STATE={...STATE,lineups:${JSON.stringify(selected)},accounts:[C.parseAccount(${JSON.stringify({...raw,heroes,hero_equips:items})})]};
    STATE.activeAccount=STATE.accounts[0].id;selectView('library');$('client-dungeons').open=true;
    $('client-dungeons-mode-encounters').click();qaEncounterInput('battle','31811');
    selectedLineups=new Set(['qa-pve-13','qa-pve-10']);renderSelection();`);
   await until('!!document.querySelector("[data-pve-start]:not([disabled])")');
   assert.equal(await ui(stock+'.hidden'),true);
   await ui('document.querySelector("[data-pve-start]").click()');
   await until('!!document.querySelector("[data-pve-stock]:not([hidden]):not([disabled])")',15000);
   assert.deepEqual(calls,[{actor:13,seed:0},{actor:10,seed:0}]);
   assert.match(await ui(reports+'.textContent'),/复跑原码 1.*种子 0 未通关.*复跑原码 0.*种子 0 未通关/s);
   mode='win';await ui(stock+'.click()');
   await until(status+'.textContent.includes("全随机分支待验证")',18000);
   assert.match(await ui(reports+'.textContent'),/通过 6 个采样种子.*开战至结算 6\.91 秒/s);
   assert.match(await ui(reports+'.textContent'),/复跑原码 1.*种子 0 未通关.*复跑原码 0.*种子 0 未通关/s);
   assert.deepEqual(calls.slice(2,8).map(row=>row.seed),[0,1,2,3,7,42]);
   await ui(reports+'.querySelector("details").open=true;'+status+'.scrollIntoView({block:"start",behavior:"instant"})');
   await capture('pve-stock-samples');
   win.setContentSize(720,960);
   try{assert.equal(await ui(reports+'.scrollWidth<='+reports+'.clientWidth+2'),true);}
   finally{win.setContentSize(1440,1000);}
   mode='hold';
   await ui('document.querySelector("[data-pve-start]").focus();document.querySelector("[data-pve-start]").click()');
   await until(status+'.textContent.includes("种子 0")',12000);
   assert.equal(await ui('document.activeElement.matches("[data-pve-stop]")'),true);
   await ui('document.activeElement.click()');
   await until(status+'.textContent.includes("复跑已停止")');
   assert.equal(await ui('document.activeElement.matches("[data-pve-start]")'),true);
   assert.doesNotMatch(await ui(reports+'.textContent'),/本次复跑通关/);
   await ui('qaEncounterInput("battle","30101 剧情：晴明单挑犬神")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("剧情：晴明单挑犬神")');
   assert.equal(await ui('document.querySelector("[data-pve-start]")===null'),true);
   const awakeCalls=[];
   mockPve=(plan,options)=>{
    assert.deepEqual(options,{stageId:40,groupId:4,battleMode:29,seed:options.seed,damageFloor:true});
    assert.equal(plan.members.length,5);
    assert.equal(new Set(plan.members.map(row=>row.instanceId)).size,5);
    awakeCalls.push(options.seed);
    return {...sample,...options};
   };
   await ui('selectedLineups.clear();renderSelection();qaEncounterInput("daily","天雷鼓 拾层")');
   await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
   const awake=await ui('$("client-dungeons-encounter-detail").textContent');
   assert.match(awake,/天雷鼓 · 拾层.*我方鬼火 2 · 敌方鬼火 4 · 阴阳师等级要求 30.*第十层.*觉醒普通单人编组/s);
   assert.match(awake,/雷麒麟 · 40 级 · 1 号位 · 开场速度 160.*原版开场 · 生命 58,445\.17 · 攻击 6,483\.18 · 防御 711\.04 · 暴击 60%/s);
   assert.match(awake,/雷麒麟小怪 · 40 级 · 6 号位 · 开场速度 155/s);
   await ui('[...document.querySelectorAll(".dungeon-encounter-waves summary")].find(el=>el.textContent.includes("雷麒麟 · 40 级")).click()');
   await until('$("client-dungeons-encounter-detail").textContent.includes("10%的概率眩晕目标")');
   await ui(stock+'.click()');
   await until(status+'.textContent.includes("全随机分支待验证")',20000);
   assert.deepEqual(awakeCalls.slice(0,6),[0,1,2,3,7,42]);
   await ui('const opening=$("client-dungeons-encounter-detail");opening.scrollIntoView({block:"start",behavior:"instant"});');
   await capture('client-awake-solo');
   await ui('document.querySelector("[data-pve-code]").click()');
   assert.match(await ui('$("stock-candidate-code").value'),/^#TA#/);
   assert.equal(await ui('!!document.querySelector(".rune-code-preview img")'),true);
   assert.match(await ui('$("detail-heading").textContent'),/雷麒麟·拾层/);
   await ui('$("stock-candidate-save").click()');
   await until('$("stock-candidate-status").textContent.includes("已保存到阵容库")');
   const saved=stored.lineups.find(lineup=>lineup.title.startsWith('雷麒麟·拾层'));
   assert.equal(Number(saved?.gameSceneId),10023001);
   assert.equal(saved.members.filter(member=>member.kind==='shikigami').length,5);
   await ui('$("close-dialog").click()');
   await ui(`window.qaSecretEncounter=(id,query)=>{
    qaEncounterInput("daily",query);
    [...document.querySelectorAll("#client-dungeons-encounter-list button")].find(button=>
     button.querySelector("small").textContent.split(" · ")[1]===String(id)).click();
   };qaSecretEncounter(18,"红叶的羁绊 捌 痴迷")`);
   await until('$("client-dungeons-encounter-detail").textContent.includes("游戏内走组队入口")');
   assert.equal(await ui('document.querySelector("[data-pve-stock]")===null'),true);
   const secretCalls=[];
   mockPve=(plan,options)=>{
    assert.deepEqual(options,{stageId:11,groupId:11,battleMode:266,seed:options.seed,damageFloor:true});
    assert.equal(plan.members.length,5);
    secretCalls.push(options.seed);
    return {...sample,...options,waveCount:3,wavesCleared:3};
   };
   await ui('qaSecretEncounter(11,"红叶的羁绊 壹 邂逅")');
   await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
   assert.match(await ui('$("client-dungeons-encounter-list").textContent'),/1011 · 竞速.*11 · 单人/s);
   const secret=await ui('$("client-dungeons-encounter-detail").textContent');
   assert.match(secret,/红叶的羁绊 · 壹·邂逅.*3 波.*需阴阳师 20 级.*消耗 3 体力.*游戏内走单人入口.*秘闻普通单人/s);
   assert.match(secret,/第 1 波.*开场速度.*原版开场.*第 2 波.*原版开场.*第 3 波/s);
   await ui(stock+'.click()');
   await until(status+'.textContent.includes("全随机分支待验证")',20000);
   assert.deepEqual(secretCalls.slice(0,6),[0,1,2,3,7,42]);
   await ui('document.querySelector("[data-pve-code]").click()');
   assert.match(await ui('$("stock-candidate-code").value'),/^#TA#/);
   assert.match(await ui('$("detail-heading").textContent'),/红叶的羁绊·壹层/);
   await ui('$("close-dialog").click();$("client-dungeons-encounter-detail").scrollIntoView({block:"start",behavior:"instant"});');
   await capture('client-secret-solo');
   await ui('qaSecretEncounter(118,"海怪的温柔 捌 惴惴")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("复制我方 6 号位")');
   const copy=await ui('$("client-dungeons-encounter-detail").textContent');
   assert.match(copy,/复制位读取我方同号位的式神及御魂技能.*第 3 波.*复制我方 2 号位.*复制我方 6 号位/s);
   await ui('qaSecretEncounter(358,"溯问鲤踪 捌 鲤影")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("助战单位阵亡判负")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/101 号位.*31708001.*末三位为 209/s);
   await ui('qaSecretEncounter(1071,"1071 开心的山兔")');
   await until('$("client-dungeons-encounter-detail").textContent.includes("竞速配置")');
   assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/7 号位 · 开场速度 -9.*8 号位 · 开场速度 -9/s);
   if(JSON.parse(await readEncounters(catalog)).entries.some(entry=>entry.kind==='经验妖怪')){
    const experienceCalls=[];
    mockPve=(plan,options)=>{
     assert.deepEqual(options,{stageId:2111,groupId:2111,battleMode:528,seed:options.seed,damageFloor:true});
     assert.equal(plan.members.length,5);
     experienceCalls.push(options.seed);
     return {...sample,...options,waveCount:1,wavesCleared:0,
      experience:{kills:30,requiredKills:30,timedOut:false,deadlineSeconds:150}};
    };
    await ui('qaEncounterInput("daily","经验妖怪 新服首次")');
    await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
    assert.equal(await ui('$("client-dungeons-encounter-list").querySelector("small").textContent'),'经验妖怪 · 2111');
    assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/击杀 30 只.*击杀后补位.*引擎时限 150 秒.*开场速度 88/s);
    await ui(stock+'.click()');
    await until(status+'.textContent.includes("全随机分支待验证")',20000);
    assert.deepEqual(experienceCalls.slice(0,6),[0,1,2,3,7,42]);
    assert.match(await ui(reports+'.textContent'),/原版胜利 · 击杀 30 \/ 30/);
    assert.equal(await ui('document.querySelector("[data-pve-code]")===null'),true);
    await ui('$("client-dungeons-encounter-detail").scrollIntoView({block:"start",behavior:"instant"});');
    await capture('client-resource-first-experience');
    await ui('qaEncounterInput("daily","金币妖怪 编组 2009")');
    await until('$("client-dungeons-encounter-detail").textContent.includes("金币结算随首领剩余生命变化")');
    assert.equal(await ui('document.querySelector("[data-pve-stock]")===null'),true);
   }
   const yulingCalls=[];
   mockPve=(plan,options)=>{
    assert.deepEqual(options,{stageId:3,groupId:3,battleMode:267,seed:options.seed,damageFloor:true});
    assert.equal(plan.members.length,5);
    yulingCalls.push(options.seed);
    return {...sample,...options,waveCount:1,wavesCleared:1,formationsVerified:1};
   };
   await ui('qaEncounterInput("daily","暗·神龙 叁层")');
   await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
   const guardian=await ui('$("client-dungeons-encounter-detail").textContent');
   assert.match(guardian,/开场 3 火.*消耗 1 张御灵境之钥.*阴阳师 40 级 · 御灵 40 级.*只有第一只参与行动.*御灵单人配装/s);
   assert.match(guardian,/暗·神龙 · 40 级 · 1 号位 · 开场速度 170.*生命 517,762/s);
   await ui('[...document.querySelectorAll(".dungeon-encounter-waves summary")].find(el=>el.textContent.includes("暗·神龙 · 40 级")).click()');
   await until('$("client-dungeons-encounter-detail").textContent.includes("多段攻击不重复触发")');
   await ui(stock+'.click()');
   await until(status+'.textContent.includes("全随机分支待验证")',20000);
   assert.deepEqual(yulingCalls.slice(0,6),[0,1,2,3,7,42]);
   await ui('document.querySelector("[data-pve-code]").click()');
   assert.match(await ui('$("stock-candidate-code").value'),/^#TA#/);
   assert.match(await ui('$("detail-heading").textContent'),/神龙·叁层/);
   await ui('$("close-dialog").click();$("client-dungeons-encounter-detail").scrollIntoView({block:"start",behavior:"instant"});');
   await capture('client-yuling-solo');
   if(JSON.parse(await readEncounters(catalog)).entries.some(entry=>entry.table==='gve_battleinfo')){
    const huntingCalls=new Map(),tacticalCalls=[];
    mockPve=(plan,options)=>{
     assert.deepEqual(options,{stageId:61,groupId:61,battleMode:2000,seed:options.seed,damageFloor:true});
     assert.equal(plan.members.length,5);
     const key=teamKey(plan);
     if(!huntingCalls.has(key))huntingCalls.set(key,[]);
     huntingCalls.get(key).push(options.seed);
     if(plan.tactics)tacticalCalls.push({tactics:plan.tactics,seed:options.seed});
     const firstCandidate=key===huntingCalls.keys().next().value;
     const failed=firstCandidate&&options.seed===2;
     const damage=firstCandidate?(failed?500000:options.seed===0?3000000:5000000):plan.tactics?.manualOpening?2500000:2000000;
     return {...sample,...options,outcome:failed?'loss':'win',waveCount:1,wavesCleared:0,guildHunt:{damage,tactics:plan.tactics}};
    };
    await ui(`window.qaGuildEncounter=(id,query)=>{
     qaEncounterInput("guild",query);
     [...$("client-dungeons-encounter-list").querySelectorAll("button")].find(el=>el.querySelector("small").textContent.endsWith(" · "+id)).click();
    };qaGuildEncounter(61,"麒麟狩猎 火麒麟")`);
    await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
    assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/挑战时限 240 秒.*30 秒和 150 秒触发分裂.*90 秒触发属性召唤/s);
    await ui(stock+'.click()');
    await until(status+'.textContent.includes("按平均伤害排序")',20000);
    assert.deepEqual(huntingCalls.values().next().value,[0,1,2,3,7,42]);
    assert.deepEqual(tacticalCalls.filter(call=>call.tactics.manualOpening).map(call=>call.seed),[0,1,2,3,7,42]);
    assert.deepEqual(tacticalCalls.filter(call=>call.seed===0&&call.tactics.autoMode).map(call=>call.tactics.autoMode.mode),['spell','basic']);
    assert.match(await ui(reports+'.firstElementChild.textContent'),/5 \/ 6 场有效结算.*平均伤害 3,916,667.*单场最高 5,000,000.*最低 500,000.*个人结算失败 · 未清场/s);
    assert.match(await ui(reports+'.textContent'),/平均伤害 2,000,000/);
    assert.match(await ui(reports+'.children[1].textContent'),/平均伤害 2,500,000.*首动普攻首领后切自动。红标首领。绿标/s);
    await ui('document.querySelector("[data-pve-code]").click()');
    const tacticalCode=await ui('$("stock-candidate-code").value');
    assert.match(tacticalCode,/^#TA#/);
    assert.match(await ui('document.querySelector(".rune-code-preview").textContent'),/首动普攻首领后切自动。红标首领。/);
    const {readScoreInstructions}=require('../app/rune-candidate.js');
    const decoded=require('../desktop/ta-codec.cjs').decodeLineupData(tacticalCode);
    assert.deepEqual(readScoreInstructions(decoded.desc),tacticalCalls.find(call=>call.tactics.manualOpening).tactics);
    assert.match(await ui('$("detail-heading").textContent'),/狩猎战·火麒麟/);
    await ui('$("close-dialog").click();$("client-dungeons-encounter-detail").scrollIntoView({block:"start",behavior:"instant"});');
    await capture('client-guild-hunting');
    const underworldCalls=[];
    mockPve=(plan,options)=>{
     assert.deepEqual(options,{stageId:101,groupId:101,battleMode:2001,seed:options.seed,damageFloor:true});
     assert.ok(plan.rounds.length>=1&&plan.rounds.length<=4);
     const instances=plan.rounds.flatMap(round=>round.members.map(member=>member.instanceId));
     assert.equal(new Set(instances).size,instances.length);
     underworldCalls.push(options.seed);
     return {...sample,...options,waveCount:70,wavesCleared:options.seed===0?48:54,
      underworld:{teams:[{team:1,startWave:1,onmyojiId:10}],leftAfterLastTeam:true}};
    };
    await ui('qaGuildEncounter(101,"阴界之门")');
    await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
    await ui(stock+'.click()');
    await until(status+'.textContent.includes("按最低清波数排序")',20000);
    assert.deepEqual(underworldCalls.slice(0,6),[0,1,2,3,7,42]);
    assert.match(await ui(reports+'.firstElementChild.textContent'),/最低 48 波 · 平均 53.0 波 · 最高 54 波.*第 1 队在第 1 波上场/s);
    await ui('document.querySelector("[data-pve-code]").click()');
    assert.equal(require('../desktop/ta-codec.cjs').decodeLineupData(await ui('$("stock-candidate-code").value')).select_stage_id,19005);
    await ui('$("stock-candidate-save").click()');
    await until('$("stock-candidate-status").textContent.includes("已保存到阵容库")');
    const savedRelay=stored.lineups.find(lineup=>Number(lineup.gameSceneId)===19005);
    await ui(`$('close-dialog').click();selectedLineups.add(${JSON.stringify(savedRelay.id)});AtlasPveWorkbench.refresh();`);
    await until('!!document.querySelector("[data-pve-start]:not([disabled]):not([hidden])")');
    await ui('document.querySelector("[data-pve-start]").click()');
    await until(status+'.textContent.includes("按最低清波数排序")',20000);
    assert.deepEqual(underworldCalls.slice(-6),[0,1,2,3,7,42]);
    await ui('selectedLineups.clear();');
    await ui('qaEncounterInput("guild","贪婪的铁鼠")');
    await until('$("client-dungeons-encounter-detail").textContent.includes("查看机关编组 122")');
    await ui('[...$("client-dungeons-encounter-detail").querySelectorAll("button")].find(el=>el.textContent==="查看机关编组 122").click()');
    await until('$("client-dungeons-encounter-detail").textContent.includes("我方 · 40 级 · 100 号位")');
    await ui('qaGuildEncounter(1,"首领退治 难度")');
    await until('$("client-dungeons-encounter-detail").textContent.includes("各轮攻击调整")');
    assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/开启消耗阴阳寮勋章350.*退治首领池和阶段属性/s);
    const retreatCalls=[];
    mockPve=(plan,options)=>{
     assert.deepEqual(options,{stageId:1,groupId:103,battleMode:306,seed:options.seed,damageFloor:true,
      retreat:{raidRound:3,guildMembers:5,windowSeconds:180}});
     retreatCalls.push(options.seed);
     return {...sample,...options,outcome:'loss',waveCount:1,wavesCleared:0,guildRetreat:{
      damage:plan.tactics?.redBoss?350000:300000,reason:'window-expired',combatSeconds:180,phases:['limao'],tactics:plan.tactics}};
    };
    await until('!!document.querySelector("[data-pve-stock]:not([disabled])")');
    await ui(`(() => {const area=$('client-dungeons-encounter-detail');
      const fields=area.querySelectorAll('select');
      ['103','3','180'].forEach((value,i)=>{fields[i].value=value;fields[i].dispatchEvent(new Event('change'));});
      const members=area.querySelector('input[type=number]');members.value='5';members.dispatchEvent(new Event('change'));
    })()`);
    assert.match(await ui('$("client-dungeons-encounter-detail").textContent'),/贪婪的铁鼠.*生命14,600,832.*个人伤害/s);
    await ui(stock+'.click()');
    await until(status+'.textContent.includes("按平均伤害排序")',20000);
    assert.deepEqual(retreatCalls.slice(0,2),[0,1]);
    assert.match(await ui(reports+'.firstElementChild.textContent'),/6 \/ 6 场有效结算.*平均伤害 350,000.*达到比较时长.*1 次阶段切换/s);
    assert.doesNotMatch(await ui(reports+'.textContent'),/麒麟/);
    await ui('document.querySelector("[data-pve-code]").click()');
    const retreatCode=await ui('$("stock-candidate-code").value');
    assert.equal(require('../desktop/ta-codec.cjs').decodeLineupData(retreatCode).select_stage_id,10020205);
    await ui('$("close-dialog").click();$("client-dungeons-encounter-detail").scrollIntoView({block:"start",behavior:"instant"});');
    await capture('client-guild-retreat-damage');
   }
  }finally{
   mockPve=null;stopPve=null;
   await ui(`stopMatch();STATE=${boot};selectedLineups.clear();$('client-dungeons').open=false;renderSelection();`);
  }
 });
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
 await check('悲鸣显示原版开场面板，虚无区分两波战斗和原表附加波次',async()=>{
  await ui('selectView("library");$("dungeon-workbench").open=true;$("dungeon-rules-select").value="101";renderDungeonRules()');
  const rules=()=>ui('$("dungeon-rules-details").textContent');
  assert.match(await rules(),/原版战斗 3 波.*八岐大蛇.*开场速度 134.*生命 199,999\.99.*攻击 27,861\.6.*防御 577\.28/s);
  await ui('$("dungeon-rules-select").value="103";renderDungeonRules()');
  assert.match(await rules(),/原版战斗 2 波.*每波基础时限 120 秒.*不能参加第二波.*首领剩余生命比例扣减第二波时间.*原表附加波次 3/s);
  assert.match(await rules(),/伊邪那美.*开场速度 130.*生命 750,001/s);
  assert.equal(await ui('document.querySelector(".dungeon-wave:last-child").textContent.includes("开场速度")'),false);
  await ui('$("dungeon-rules-details").scrollIntoView({block:"start",behavior:"instant"})');await capture('dungeon-soul-13-openings');
  await ui('$("dungeon-rules-select").value="102";renderDungeonRules();$("dungeon-workbench").open=false');
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
  const desktopRaw={...raw,capturedAt:'2026-11-25T00:00:00Z',format:'yys-desktop-cache-v1',heroCount:1,inventoryCount:1,retainedCount:1,excludedCount:0,heroes:{a:{...raw.heroes.a,equips:['desktop-first']}},souls:[{id:'desktop-first',slot:1,quality:6,level:15,setId:'招财猫',mainAttrType:'attack_flat',mainAttrValue:25,subAttributes:[{type:'crit_rate',value:.03}],equippedState:null}],equipPresets:[['合成桌面预设',['desktop-first']]],lineupPresets:{version:1,
   teamPresets:{groups:[{id:'qa-group',name:'日常队伍分组',teamIds:['qa-team','missing-team']}],teams:[{id:'qa-team',name:'离线验收队伍',heroIds:['a',null,'unknown']}]},
   soulPlans:{groups:[{name:'常用御魂分组',boxIds:[1]}],plans:[{boxId:1,name:'离线验收方案',equipIds:['desktop-first','unknown'],bindings:[['a','qa-ref']]}]}},
   accountComparison:{version:1,items:{synthetic:1},realm:{synthetic:2}}};
  delete desktopRaw.hero_equips;
  const desktopCache={version:2,rawSha256:'a'.repeat(64),sourceKind:'desktop',sourcePayload:desktopRaw,normalizedSouls:[]};
  await check('桌面版本 2 缓存经后台导入后显示实际式神、御魂和预设',async()=>{
   await ui('importMode="accounts";document.getElementById("merge-import").checked=false;handleFiles('+file(desktopCache)+')');
   assert.equal(stored.accounts[0].raw.format,'yys-desktop-cache-v1');assert.equal(stored.accounts[0].souls['desktop-first'].stats.attack,25);
   assert.equal(Object.hasOwn(stored.accounts[0].raw,'hero_equips'),false);
   await ui('selectView("accounts");window.scrollTo(0,0)');
   assert.deepEqual(await ui('[...document.querySelectorAll("#account-summary .overview strong")].map(e=>e.textContent)'),['1','1','1','1']);
   const summary=await ui('document.getElementById("account-summary").textContent');
   assert.match(summary,/御魂：完整/);assert.match(summary,/1 件已穿戴，0 件未穿戴/);assert.match(summary,/游戏阵容预设格式版本 1/);
   await ui('$("account-game-lineup-presets").open=true;$("account-game-lineup-presets").scrollIntoView({block:"center",behavior:"instant"})');
   const presets=await ui('$("account-game-lineup-presets").textContent');
   assert.match(presets,/离线验收队伍.*空位、库存未提供该式神/s);
   assert.match(presets,/日常队伍分组.*离线验收队伍、库存未提供该预设/s);
   assert.match(presets,/离线验收方案.*引用 2 件御魂 · 库存中可找到 1 件 · 1 条绑定/s);
   assert.match(presets,/常用御魂分组.*离线验收方案/s);
   await capture('snapshot-desktop-cache');
  });
  await check('桌面与旧版库存交叉合并，导出备份、重启和恢复均保留旧御魂',async()=>{
   await ui('document.getElementById("merge-import").checked=true;importMode="accounts";handleFiles('+file(raw)+')');
   assert.equal(stored.accounts[0].raw.format,'mumu-snapshot-v1');assert.equal(stored.accounts[0].raw.hero_equips.length,1);
   assert.equal(Object.hasOwn(stored.accounts[0].raw,'souls'),false);
   assert.equal(await ui('STATE.accounts[0].presets.length'),1);
   assert.match(await ui('document.getElementById("account-summary").textContent'),/全仓库的穿戴归属待核对/);
   const latest={...desktopRaw,scope:{souls:true,items:false,realmCards:true},accountComparison:{version:1,items:null,realm:{synthetic:3}},souls:[{...desktopRaw.souls[0],id:'desktop-second',mainAttrValue:40}]};
   await ui('importMode="accounts";handleFiles('+file(latest)+')');
   assert.equal(stored.accounts[0].raw.souls.length,2);assert.equal(Object.hasOwn(stored.accounts[0].raw,'hero_equips'),false);
   assert.equal(await ui('exportBackup()'),true);const backup=structuredClone(exported);
   await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA && document.getElementById("loading").hidden');
   assert.equal(await ui('Object.keys(STATE.accounts[0].souls).length'),2);
   await ui('importMode="backup";handleFiles('+file(backup)+')');await ui('applyBackupRestore()');
   assert.equal(stored.accounts[0].souls['desktop-first'].stats.attack,25);assert.equal(stored.accounts[0].souls['desktop-second'].stats.attack,40);
   assert.equal(stored.accounts[0].merged,true);assert.equal(stored.accounts[0].raw.souls.length,2);
   assert.deepEqual(stored.accounts[0].raw.accountComparison,{version:1,items:{synthetic:1},realm:{synthetic:3}});
   assert.deepEqual(stored.accounts[0].raw.lineupPresets,desktopRaw.lineupPresets);
   await ui('selectView("accounts");document.getElementById("account-snapshot-extra").open=true');
   assert.match(await ui('document.getElementById("account-snapshot-extra").textContent'),/账号概况 · 物品已提供本次未采集 · 沿用 2026-11-25T00:00:00Z 的旧记录/);
  });
 await check('魂王和悲鸣走各自的原版复跑，保留库存契灵及穿戴限制',async()=>{
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
  assert.match(await ui('$("dungeon-battle-results").textContent'),/本次复跑(失败|通关).*常规单人本地入口和当前配装/s);
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
    assert.deepEqual(seeds,all?commonSeeds:[0,1]);
    assert.equal(await ui('$("dungeon-search-stock").hidden'),verdict!=='loss');
    const status=await ui('$("dungeon-battle-results").textContent');
    assert.match(status,/种子 0.*本次复跑通关/s);
    if(all)assert.match(status,/已通过 9 个采样种子.*种子 8929.*种子 2016.*种子 7698/s);
    else if(verdict==='unknown')assert.match(status,/复跑结算待核对/);
    else assert.match(status,/种子 1 未通关/);
    if(all){
     mockSeeds=(plan,progress)=>{
      assert.deepEqual(plan,replayPlan);progress(seedEvidence());
      return new Promise(resolve=>{stopSeeds=()=>resolve(seedEvidence({wins:74,stopped:true}));});
     };
     await ui('document.querySelector("[data-battle-full]").click()');
     await until('document.querySelector(".dungeon-full-seeds progress")?.value===73');
     assert.equal(await ui('$("dungeon-stop-battle").textContent'),'暂停全种子验收');
     assert.equal(await ui('document.querySelector("[data-battle-extra]").disabled'),true);
     assert.equal(await ui('document.querySelector("[data-battle-full]")===null'),true);
     win.setContentSize(720,960);
     try{assert.equal(await ui('$("dungeon-battle-results").scrollWidth<=$("dungeon-battle-results").clientWidth+2'),true);}
     finally{win.setContentSize(1440,1000);}
     await ui('document.querySelector(".dungeon-full-seeds").scrollIntoView({block:"center",behavior:"instant"})');
     await capture('dungeon-full-seed-progress');
     await ui('$("dungeon-stop-battle").click()');
     await until('!dungeonBattle.activeFullSeedAudit&&!dungeonStopPending');
     assert.match(await ui('$("dungeon-battle-results").textContent'),/已暂停全种子验收.*74 \/ 10,000.*继续全种子验收/s);
     assert.equal(await ui('document.activeElement.dataset.battleFull'),'qa-rune-e2e');
     stopSeeds=null;mockSeeds=null;
     const waveReport={seed:13,completed:true,outcome:'win',wavesCleared:3,bouts:6,engineSeconds:25.5,
      animationPlayback:{combatElapsedMs:14400,combatOverlapMs:3200,overlapMs:5000,unresolved:0,interruptedClips:0},
      monsterHealth:[{wave:2,cleared:true,startMs:2200,endMs:9300,monsters:[
       {id:4741297,position:4,initialHp:198501,lowestHp:0,lastHp:0,regainedHp:7100,zeroToAlive:1}
      ]}]};
     const inspect=()=>ui('document.querySelector("[data-battle-wave-report]").click()');
     const auditedPlan=replayPlan;
     let matchTiming=false;
     mockBattle=(plan,options)=>{
      assert.deepEqual(plan,auditedPlan);assert.deepEqual(options,{seed:13,fixedStep:true,dungeonId:102});
      return matchTiming?waveReport:{...waveReport,engineSeconds:26};
     };
     await inspect();
     await until('$("dungeon-battle-results").textContent.includes("本次复跑与已保存结算不一致")');
     assert.equal(await ui('!!document.querySelector(".dungeon-wave-report")'),false);
     matchTiming=true;await inspect();
     await until('!!document.querySelector(".dungeon-wave-report")');
     assert.match(await ui('document.querySelector(".dungeon-wave-report").textContent'),/种子 13.*第 2 波.*敌方进场至清场 7\.10 秒.*生命回升 7,100.*回到正值 1 次/s);
     assert.equal(await ui('dungeonBattle.rows[0].fullSeedAudit.progress.wins'),74);
     await ui('document.querySelector(".dungeon-wave-report").scrollIntoView({block:"center",behavior:"instant"})');
     await capture('dungeon-wave-report');
     let nextOutcome='blocked';
     mockBattle=(_plan,options)=>{
      const {seed,fixedStep}=options;assert.equal(fixedStep,true);seeds.push(seed);
      if(seed===5&&nextOutcome==='blocked')return new Promise((_resolve,reject)=>{stopRandom=()=>reject(Error('已停止'));});
      const outcome=seed===5?nextOutcome:'win';
      return {seed,completed:outcome!=='unknown',outcome,wavesCleared:outcome==='win'?3:1,bouts:6,engineSeconds:13};
     };
     const startExtra=()=>ui('document.querySelector("[data-battle-extra]").click()');
     await startExtra();
     await until('dungeonBattle.activeSeedAudit?.samples.length===1');
     assert.equal(await ui('$("dungeon-match-selected").disabled'),true);
     await ui('$("dungeon-stop-battle").click()');
     await until('!dungeonBattle.activeSeedAudit&&!dungeonStopPending');
     assert.match(await ui('$("dungeon-battle-results").textContent'),/已停止补测.*1\/19/);
     nextOutcome='unknown';await startExtra();
     await until('dungeonBattle.rows[0].seedAudit.verdict==="unknown"');
     assert.equal(await ui('$("dungeon-search-stock").hidden'),true);
     nextOutcome='loss';await startExtra();
     await until('!$("dungeon-search-stock").hidden');
     assert.match(await ui('$("dungeon-battle-results").textContent'),/补测种子 5 未通关.*种子 4.*种子 5.*本次复跑失败/s);
     assert.deepEqual(seeds.slice(commonSeeds.length),[4,5,5,5]);
     await ui('$("dungeon-match-selected").click()');
     await until('!$("dungeon-search-stock").hidden');
     assert.match(await ui('$("dungeon-battle-results").textContent'),/补测种子 5 未通关/);
    }
   }
  }finally{mockBattle=null;stopRandom=null;mockSeeds=null;stopSeeds=null;}
  const sorrow={...lineup,id:'qa-rune-101',gameSceneId:1001002,code:'|TA|qa-rune-101',title:'悲鸣复跑验收'};
  await ui(`stopMatch();STATE={...STATE,lineups:[${JSON.stringify(sorrow)}]};$("dungeon-rules-select").value="101";renderDungeonRules();$("dungeon-show-lineups").click();selectedLineups.add("qa-rune-101");renderSelection()`);
  await until('!$("dungeon-match-selected").disabled&&$("dungeon-match-selected").textContent.includes("复跑")');
  await ui('$("dungeon-match-selected").click()');
  await until('dungeonBattle?.dungeonId===101&&dungeonBattle.rows[0].state==="finished"&&!dungeonBattle.running',110000);
  assert.match(await ui('$("dungeon-battle-results").textContent'),/悲鸣复跑验收.*本次复跑(通关|失败).*当前版本的常规单人本地入口/s);
  assert.equal(await ui('!!document.querySelector("[data-battle-full]")'),await ui('dungeonBattle.rows[0].verdict==="pass"'));
  assert.equal(await ui('$("dungeon-search-stock").hidden'),await ui('dungeonBattle.rows[0].verdict!=="loss"'));
  assert.ok(floorCalls.length);
  assert.deepEqual(floorCalls,commonSeeds.slice(0,Math.min(floorCalls.length,6)).map(seed=>({dungeonId:101,seed,fixedStep:true})));
  assert.deepEqual(replayPlan.spirit,spirit);
  assert.equal(replayPlan.members.at(-1).souls.length,0);
  await capture('dungeon-soul-11-replay');
  await ui('$("dungeon-rules-select").value="102";renderDungeonRules()');
  assert.equal(await ui('$("dungeon-battle-results").hidden'),true);
  await ui('stopMatch();$("clear-filters").click();$("dungeon-workbench").open=false');
 });
 await check('勾选原码无解后才开放备选，分开显示各个种子的战报',async()=>{
  const source=data.lineups.find(l=>l.gameSceneId===1001001&&l.members.length===6&&!l.members[0].qiling&&l.members[0].onmyojiId==='11');
  const lineup={...source,id:'qa-stock-search',code:'|TA|qa-stock-search'};
  const ids=[591,389,596,557,379,372,554];
  const heroes=Object.fromEntries(ids.map(id=>['stock-'+id,{heroId:id,level:40,star:6,awake:1,equips:[],
   skinfo:data.gameConfig.heroes[id].skills.map(s=>[s,1])}]));
  const stats=[['attack_flat',486],['speed',57],['defense_flat',104],['attack_rate',.55],['hp_flat',2052],['crit_rate',.55]];
  const hero_equips=['海月火玉','破势','火灵','元兴寺','心眼','狂骨'].flatMap((setId,i)=>stats.map(([mainAttrType,mainAttrValue],j)=>({
   id:`stock-${i}-${j}`,slot:j+1,quality:6,level:15,setId,mainAttrType,mainAttrValue,subAttributes:[{type:'crit_rate',value:.1}]
  })));
  const calls=[];let winner,lateLoser;
  mockBattle=(plan,options)=>{
   const ids=JSON.stringify(plan.members.map(m=>[m.instanceId,m.souls.map(q=>q.id)]));
   winner??=ids;
   if(ids!==winner)lateLoser??=ids;
   calls.push({ids,options});
   const win=winner===ids||lateLoser===ids&&options.seed!==8929;
   return {seed:options.seed,engineSeconds:options.seed>42?35:13+options.seed,completed:true,outcome:win?'win':'loss',
    wavesCleared:win?3:1,bouts:6,overlapMs:873,unresolvedActions:0,
    animationPlayback:{combatElapsedMs:options.seed===7698?18234:11234,combatOverlapMs:1250,overlapMs:3000,interruptedClips:5,unresolved:2},
    randomObservations:{observed:75,other:12,alternatives:9},monsterHealth:[
     {wave:2,cleared:win,startMs:1300,endMs:4000,monsters:[{id:4741297,initialHp:198501,lowestHp:5000,lastHp:win?0:120000,regainedHp:135000,zeroToAlive:0}]}
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
   const expectedCalls=commonSeeds.map(seed=>({seed,fixedStep:true}));
   assert.deepEqual(calls.filter(x=>x.ids===winner).map(x=>x.options),expectedCalls);
   assert.deepEqual(calls.filter(x=>x.ids===lateLoser).map(x=>x.options),expectedCalls.slice(0,7),'种子 8929 落败后停在该队');
   const top=await ui('document.querySelector(".dungeon-stock-card").textContent');
   assert.match(top,/种子 0.*本次复跑通关.*种子 42.*本次复跑通关/s);
   assert.match(top,/共同种子中最慢 · 种子 7698 · 开战至结算 18\.23 秒/);
   assert.match(top,/引擎开战至结算 11\.23 秒.*交战动作重叠估算 1\.25 秒（5 段提前结束，2 项待核对）.*引擎全程 13\.00 秒/s);
   assert.match(await ui('$("dungeon-stock-list").textContent'),/本次复跑失败/);
   assert.match(await ui('$("dungeon-stock-list").textContent'),/种子 8929 未通关/);
   assert.equal(await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=samples]").open'),false);
   assert.match(await ui('$("dungeon-stock-results").textContent'),/所有随机分支仍待验证/);
   await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=gear] summary").click()');
   assert.match(await ui('document.querySelector(".dungeon-stock-card details[open]").textContent'),/速度.*暴击.*×/s);
   await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=health] summary").click()');
   assert.match(await ui('document.querySelector(".dungeon-stock-card [data-stock-section$=health][open]").textContent'),/敌方进场至清场 2\.70 秒.*日和坊.*最低 5,000.*生命回升 135,000/s);
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
    assert.equal(seed,0);progress({...result,trials:[]});
    return {...result,planned:3,trials:[...result.trials,
     {...result.trials[0],index:11,indices:[4,11],wave:2,bouts:10,engineSeconds:22}]};
   };
   await startAudit();
   await until('document.querySelector("[data-stock-section$=random][open]").textContent.includes("已结束 3/3")');
   const results=await ui('document.querySelector("[data-stock-section$=random][open]").textContent');
   assert.match(results,/2 次通关，1 次未通关.*第 9 次 · 未通关 · 2 波/s);
   assert.match(results,/第 1、2、3 波已有判断完成测试/);
   assert.match(results,/联合测试 4 → 11 · 通关 · 3 波 · 10 回合 · 22\.00 秒/);
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
   assert.deepEqual(saved.runeReceipts[0].samples.map(r=>r.seed),commonSeeds);
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
   const observedLoss=seedEvidence({status:'seed-loss',loss:{seed:3167,wavesCleared:2}});
   mockSeeds=async plan=>{
    assert.equal(JSON.stringify(plan.members.map(m=>[m.instanceId,m.souls.map(q=>q.id)])),winner);
    return observedLoss;
   };
   await ui('$("detail-dialog").close();document.querySelector("[data-stock-full]").click()');
   await until('$("dungeon-stock-list").textContent.includes("种子 3167 未通关")');
   assert.equal(await ui('document.querySelectorAll("[data-stock-preview]").length'),0);
   assert.match(await ui('$("dungeon-stock-status").textContent'),/0 队已通过 9 个共同种子/);
   savedEvidence=()=>observedLoss;
   await win.loadFile(path.join(root,'app/index.html'));
   await until('!!DATA && $("loading").hidden');
   await ui(`$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.add(${JSON.stringify(saved.id)});renderSelection()`);
   await until('!$("dungeon-match-selected").disabled&&$("dungeon-match-selected").textContent.includes("复跑")');
   await ui('$("dungeon-match-selected").click()');
   await until('dungeonBattle?.rows[0]?.state==="finished"',10000);
   assert.match(await ui('$("dungeon-battle-results").textContent'),/按已保存配装.*本次复跑通关/s);
   assert.match(await ui('$("dungeon-battle-results").textContent'),/全种子验收.*种子 3167 未通关.*通过 2 波/s);
   assert.equal(await ui('$("dungeon-search-stock").hidden'),false);
   assert.equal(calls.at(-1).ids,winner);
   assert.deepEqual(replayPlan.onmyoji.skinfo,[[1003,5],[1008,5],[1011,5]]);
   savedEvidence=null;
   const sorrow={...lineup,id:'qa-sorrow-stock',gameSceneId:1001002,code:'|TA|qa-sorrow-stock'};
   const sorrowSamples=[];let winningPlan;
   mockBattle=(plan,options)=>{
    assert.equal(options.dungeonId,101);
    const key=JSON.stringify(plan);
    winningPlan??=key;
    if(key===winningPlan)sorrowSamples.push(options.seed);
    const win=key===winningPlan;
    return {seed:options.seed,engineSeconds:22,completed:true,outcome:win?'win':'loss',wavesCleared:win?3:2,bouts:7,
     monsterHealth:[{wave:1,cleared:true,startMs:400,endMs:3500,monsters:[]}]};
   };
   await ui(`stopMatch();STATE={...STATE,lineups:[...STATE.lineups,${JSON.stringify(sorrow)}]};$('dungeon-rules-select').value='101';renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.add('qa-sorrow-stock');renderSelection()`);
   assert.equal(await ui('$("dungeon-search-stock").hidden'),true);
   await ui('$("dungeon-match-selected").click()');
   await until('!$("dungeon-search-stock").hidden');
   assert.equal(sorrowSamples.length,0);
   await ui('$("dungeon-search-stock").click()');
   await until('dungeonStock?.dungeonId===101&&!dungeonStock.running',20000);
   assert.deepEqual(sorrowSamples,commonSeeds.slice(0,6));
   const auditRow=seedEvidence({wins:74,stopped:true,slowest:{seed:13,engineSeconds:22,combatMs:null}});
   mockSeeds=(plan,progress,dungeonId)=>{
    assert.equal(dungeonId,101);assert.equal(JSON.stringify(plan),winningPlan);
    progress({...auditRow,stopped:false,wins:73});
    return new Promise(resolve=>{stopSeeds=()=>{stopSeeds=null;resolve(auditRow);};});
   };
   await ui('document.querySelector("[data-stock-full]").click()');
   await until('!!document.querySelector(".dungeon-full-seeds progress[value=\\"73\\"]")');
   await ui('$("dungeon-stop-battle").click()');
   await until('$("dungeon-stock-list").textContent.includes("已暂停全种子验收") && !dungeonStock.activeFullSeedAudit');
   await ui('document.querySelector("[data-stock-preview]").click()');
   await until('document.querySelector(".rune-code-preview img")?.naturalWidth>0');
   assert.match(await ui('$("detail-dialog").textContent'),/魂土.*离线采样通过/s);
   const sorrowCode=await ui('$("stock-candidate-code").value');
   await ui('$("stock-candidate-save").click()');
   await until('$("stock-candidate-status").textContent.includes("已保存")');
   const savedSorrow=stored.lineups.find(l=>l.code===sorrowCode);
   assert.equal(savedSorrow.gameSceneId,1001002);
   assert.equal(savedSorrow.runeReceipts[0].dungeonId,101);
   savedEvidence=(plan,dungeonId)=>dungeonId===101&&JSON.stringify(plan)===winningPlan?auditRow:null;
   await ui('$("detail-dialog").close()');
   await win.loadFile(path.join(root,'app/index.html'));
   await until('!!DATA && $("loading").hidden');
   await ui(`$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-rules-select').value='101';renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.add(${JSON.stringify(savedSorrow.id)});renderSelection()`);
   await until('!$("dungeon-match-selected").disabled&&$("dungeon-match-selected").textContent.includes("复跑")');
   await ui('$("dungeon-match-selected").click()');
   await until('dungeonBattle?.rows[0]?.state==="finished"&&!dungeonBattle.running');
   assert.equal(JSON.stringify(replayPlan),winningPlan);
   assert.match(await ui('$("dungeon-battle-results").textContent'),/按已保存配装.*已通过 6 个采样种子/s);
   assert.match(await ui('$("dungeon-battle-results").textContent'),/已保存全种子验收进度.*74 \/ 10,000 已通过/s);
   await ui('document.querySelector("[data-battle-wave-report]").click()');
   await until('!dungeonBattle.activeSeedAudit');
   assert.equal(floorCalls.at(-1).seed,13);
   assert.match(await ui('$("dungeon-battle-results").textContent'),/种子 13.*第 1 波.*3\.10 秒/s);
   await capture('dungeon-soul-11-saved-candidate');
  }finally{mockBattle=null;mockRandom=null;stopRandom=null;stopSeeds=null;mockSeeds=null;savedEvidence=null;await ui('stopMatch();$("dungeon-workbench").open=false');}
 });
 await check('全种子通过结果显示单人本地范围和最慢一场',async()=>{
  const complete=JSON.stringify(seedEvidence({status:'all-local-seeds-passed',wins:10000}));
  const markup=await ui(`fullSeedAuditMarkup({samples:AtlasRuneSearch.sampleSeeds.map(seed=>({seed,completed:true,outcome:'win',wavesCleared:3,engineSeconds:13})),fullSeedAudit:{progress:${complete}}},'data-full-seeds-fixture',false,null,{id:102})`);
  assert.match(markup,/常规单人本地入口的 10,000 个种子全部通过.*最慢种子 13.*引擎全程 25\.50 秒.*开战至结算 14\.40 秒/s);
  assert.doesNotMatch(markup,/data-full-seeds-fixture|<progress/);
 });
 await check('虚无先复跑勾选原码，失败后从库存生成、保存并核对两波备选码',async()=>{
  const fighters=data.lineups.find(l=>l.gameSceneId===1001001&&l.members.length===6&&
   new Set(l.members.filter(m=>m.kind==='shikigami').map(m=>m.shikigamiId)).size===5).members.filter(m=>m.kind==='shikigami');
  const heroes={},items=[];
  for(let wave=1;wave<=2;wave++)for(const m of fighters){
   const prefix=`h13-${wave}-${m.index}`;
   const equips=Array.from({length:6},(_,i)=>`${prefix}-${i}`);
   heroes[prefix]={heroId:Number(m.shikigamiId),level:m.level,star:m.star,awake:m.awakening,
    skinfo:m.skills.map(s=>[s.id,s.level]),equips,
    attrs:[[8000,0,0,0],[101,0,0,0],[.5,0,0,0],[.1,0,0,0],[500,0,0,0],[2500,0,0,0],0,0]};
   equips.forEach((id,i)=>items.push({id,slot:i+1,quality:6,level:15,setId:'火灵',
    mainAttrType:['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'][i],
    mainAttrValue:[486,57,104,.55,2052,.55][i],subAttributes:[{type:'crit_rate',value:.1}]}));
  }
  const lineups=[10,13].map((id,wave)=>({id:`qa-hun13-${wave+1}`,title:wave?'虚无第二队':'虚无第一队',code:`|TA|qa-hun13-${wave+1}`,
   gameSceneId:1001000,requirementsComplete:true,decodeState:'decoded-local',members:[
    {index:0,name:data.gameConfig.heroes[id].name,kind:'onmyoji',onmyojiId:String(id),level:60,star:2,awakening:0,
     skills:(wave?[1304,1302]:[1008,1011]).map(id=>({id,level:5})),aiSkill:0},
    ...fighters.map(m=>({...m,borrowed:false,config:{keepCurrent:true},aiSkill:0}))]}));
  const incomplete={...raw,heroes:Object.fromEntries(Object.entries(heroes).filter(([id])=>id.startsWith('h13-1-'))),hero_equips:items.slice(0,30)};
  for(const id of [591,389,596,557,379])for(let copy=0;copy<2;copy++){
   const skinfo=data.gameConfig.heroes[id].skills.map(skill=>[skill,game.levels(data.gameConfig,skill,1).at(-1).level]);
   heroes[`h13-stock-${id}-${copy}`]={heroId:id,level:40,star:6,awake:1,skinfo,equips:[]};
  }
  const available={...raw,heroes,hero_equips:[...items,...items.slice(0,18).map(q=>({...q,id:q.id+'-extra',setId:'海月火玉'}))]};
  async function setup(inventory){
   await ui(`stopMatch();STATE={...STATE,lineups:${JSON.stringify(lineups)},accounts:[C.parseAccount(${JSON.stringify(inventory)})]};STATE.activeAccount=STATE.accounts[0].id;matchResults={};runeStatus=null;selectView('library');$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-rules-select').value='103';renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups.clear();${lineups.map(l=>`selectedLineups.add('${l.id}');`).join('')}renderSelection()`);
   await until('!$("dungeon-match-selected").disabled && $("dungeon-match-selected").textContent.includes("两波")');
  }
  let calls=0;
  runeEnabled=true;
  mockBattle=(plan,options)=>{
   calls++;
   const ids=calls<3?[13,10]:[10,13];
   assert.deepEqual(options,{dungeonId:103,seed:calls===2?1:0,fixedStep:true});
   assert.deepEqual(plan.rounds.map(r=>r.onmyoji.heroId),ids);
   assert.equal(new Set(plan.rounds.flatMap(r=>r.members.map(m=>m.instanceId))).size,10);
   assert.equal(new Set(plan.rounds.flatMap(r=>r.members.flatMap(m=>m.souls.map(q=>q.id)))).size,60);
   const win=calls===1;
   return {seed:options.seed,completed:true,outcome:win?'win':'loss',wavesCleared:win?1:0,engineSeconds:86.6,rounds:[
    {wave:1,onmyojiId:ids[0],cleared:false,availableSeconds:120,seconds:22.48,carriedSeconds:-72.04},
    {wave:2,onmyojiId:ids[1],cleared:win,availableSeconds:48,seconds:39.3}],animationPlayback:{combatOverlapMs:24139}};
  };
  try{
   await setup(incomplete);await ui('$("dungeon-match-selected").click()');
   await until('dungeonHun13&&!dungeonHun13.running',20000);
   assert.match(await ui('$("dungeon-hun13-samples").textContent'),/无法同时配装/);
   assert.equal(calls,0);
   await setup(available);
   assert.equal(await ui('$("dungeon-search-stock").hidden'),true);
   await ui('$("dungeon-hun13-first").value="qa-hun13-2";$("dungeon-hun13-second").value="qa-hun13-1";renderDungeonSelection();$("dungeon-match-selected").click()');
   await until('dungeonHun13&&!dungeonHun13.running',20000);
   assert.equal(calls,3);
   assert.match(await ui('$("dungeon-hun13-status").textContent'),/第 1 波 虚无第一队.*第 2 波 虚无第二队.*未通过全部采样/);
   assert.match(await ui('$("dungeon-hun13-samples").textContent'),/原版结算胜利，有波次未清场.*源博雅.*晴明.*时限 48 秒/s);
   assert.equal(await ui('$("dungeon-search-stock").hidden'),false);
   await ui('$("dungeon-hun13-rounds").scrollIntoView({block:"center",behavior:"instant"})');
   await capture('dungeon-hun13-pair');
   win.setContentSize(720,960);
   try{assert.equal(await ui('$("dungeon-hun13-rounds").scrollWidth<=$("dungeon-hun13-rounds").clientWidth+2'),true);}
   finally{win.setContentSize(1440,1000);}
   let firstPlan;
   mockBattle=(plan,options)=>{
    const signature=JSON.stringify(plan);firstPlan??=signature;
    const win=signature===firstPlan;
    assert.equal(new Set(plan.rounds.flatMap(round=>round.members.map(m=>m.instanceId))).size,10);
    assert.equal(new Set(plan.rounds.flatMap(round=>round.members.flatMap(m=>m.souls.map(q=>q.id)))).size,60);
    return {seed:options.seed,completed:true,outcome:win?'win':'loss',wavesCleared:win?2:0,engineSeconds:90,
     rounds:[{wave:1,onmyojiId:10,cleared:win,availableSeconds:120,seconds:25,carriedSeconds:95},
      {wave:2,onmyojiId:10,cleared:win,availableSeconds:215,seconds:45}],
     animationPlayback:{combatElapsedMs:80000,combatOverlapMs:24139}};
   };
   await ui('$("dungeon-search-stock").click()');
   await until('dungeonHun13?.kind==="stock"&&!dungeonHun13.running',50000);
   assert.match(await ui('$("dungeon-hun13-status").textContent'),/1 组通过 7 个采样种子/);
   await ui('document.querySelector("[data-hun13-code]").click()');
   await until('document.querySelectorAll(".rune-code-preview img").length===2 && [...document.querySelectorAll(".rune-code-preview img")].every(img=>img.naturalWidth>0)');
   const pair=await ui('[0,1].map(index=>$("hun13-code-"+index).value)');
   assert.ok(pair[0]!==pair[1]&&pair.every(code=>code.startsWith('#TA#')));
   await ui('$("hun13-code-save").click()');await until('$("hun13-code-feedback").textContent.includes("已保存")');
   assert.equal(stored.lineups.filter(l=>pair.includes(l.code)&&l.gameSceneId===1001000).length,2);
   await capture('dungeon-hun13-stock-codes');
   await ui('$("detail-dialog").close()');
   const offline=status,priorShares=shareCalls.length;
   status={...status,authenticated:true,risk_accepted:true,query_ready:true,selected_server:String(raw.player.serverId),selected_avatar:'synthetic',
    servers:[{id:String(raw.player.serverId),name:'虚无测试区',category:'测试',available:true,roles:[{avatar_id:'synthetic',name:'测试角色'}]}]};
   win.webContents.send('ta-status-changed',status);
   try{
    await until('TALogin.status().selected_avatar==="synthetic"&&account().server==="虚无测试区"');
    await ui('reloadOfficial()');
    await ui('document.querySelector("[data-hun13-code]").click()');
    await ui('$("hun13-code-share").click()');
    await until('$("hun13-code-feedback").textContent.includes("短码已生成")');
    assert.deepEqual(shareCalls.slice(priorShares),pair);
    assert.equal(stored.lineups.filter(l=>pair.includes(l.code)&&l.shortCode).length,2);
    await ui('$("detail-dialog").close()');
   }finally{status=offline;win.webContents.send('ta-status-changed',status);}
   const scope='normal-solo-hun13',recordSHA256='a'.repeat(64);
   const slowest={seed:13,engineSeconds:90,combatMs:80000,wavesCleared:1,recordSHA256};
   const progress=seedEvidence({scope,bothWavesWins:0,slowest});
   mockSeeds=(plan,update,dungeonId)=>{
    assert.equal(dungeonId,103);assert.equal(JSON.stringify(plan),firstPlan);
    update(progress);
    return new Promise(resolve=>{stopSeeds=()=>{stopSeeds=null;resolve({...progress,wins:74,stopped:true});};});
   };
   const startFull=()=>ui('document.querySelector("[data-hun13-full]").click()');
   await startFull();
   await until('document.querySelector("#dungeon-hun13-result progress")?.value===73');
   assert.equal(await ui('$("dungeon-stop-battle").textContent'),'暂停全种子验收');
   assert.equal(await ui('document.querySelector("[data-hun13-code]").disabled'),true);
   await ui('$("dungeon-stop-battle").click()');
   await until('!dungeonHun13.activeFullSeedAudit&&!dungeonStopPending');
   assert.match(await ui('$("dungeon-hun13-samples").textContent'),/已暂停全种子验收.*74 \/ 10,000 已通过.*两波均清场 0 场/s);
   mockBattle=(plan,options)=>{
    assert.equal(JSON.stringify(plan),firstPlan);assert.deepEqual(options,{dungeonId:103,seed:13,fixedStep:true});
    return {seed:13,completed:true,outcome:'win',wavesCleared:1,engineSeconds:90,recordSHA256,
     rounds:[{wave:1,onmyojiId:10,cleared:false,availableSeconds:120,seconds:25,carriedSeconds:-30},
      {wave:2,onmyojiId:10,cleared:true,availableSeconds:90,seconds:45}],animationPlayback:{combatElapsedMs:80000}};
   };
   await ui('document.querySelector("[data-hun13-detail]").click()');
   await until('!!document.querySelector("#dungeon-hun13-result .dungeon-wave-report")');
   assert.match(await ui('document.querySelector("#dungeon-hun13-result .dungeon-wave-report").textContent'),/种子 13.*有波次未清场.*时限 90 秒/s);
   await capture('dungeon-hun13-full-seeds');
   mockSeeds=async()=>({...progress,wins:74,status:'seed-loss',loss:{seed:3167,wavesCleared:1}});
   await startFull();
   await until('!dungeonHun13.activeFullSeedAudit');
   assert.match(await ui('$("dungeon-hun13-samples").textContent'),/种子 3167 未通关/);
   assert.equal(await ui('document.querySelector("[data-hun13-code]")===null'),true);
   assert.equal(stored.lineups.filter(l=>pair.includes(l.code)).length,2);
  }finally{mockBattle=null;mockSeeds=null;stopSeeds=null;await ui('stopMatch();$("dungeon-workbench").open=false');}
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
