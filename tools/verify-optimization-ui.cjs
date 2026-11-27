// Production Electron UI with synthetic state, credentials and disk failures.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {readIndex,readTable,readEncounters,readRecords}=require('../desktop/dungeon-catalog.cjs');
const {createRuneRunner}=require('../desktop/rune-runner.cjs');
const {createRuneFloorRunner}=require('../desktop/rune-floor-runner.cjs');
const {runeFloorIds,hun13FloorIds,sceneForDungeon}=require('../app/rune-lineup.js');
const {createPveStageRunner}=require('../desktop/pve-stage-runner.cjs');
const secretOpenings=require('../app/secret-openings.js');
const {sampleSeeds:commonSeeds}=require('../app/rune-search.js');
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
 const background=new Background();
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
  return {code:await background.run('verify-share',{code,response:{err:0,share_key:'qa-stock-share',lineup_data:code}})};
 });
 for(const channel of ['official-status','official-auto','official-refresh','official-cancel'])local(channel,()=>({autoUpdate:false}));
 local('ta-query',()=>{throw Error('synthetic offline');});local('decode',()=>{throw Error('synthetic offline');});
 const catalog=await readIndex(path.join(root,'data/dungeon-catalog')).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
 const encounterCases=catalog?.index.encounters?JSON.parse(await readEncounters(catalog)).entries:[];
 local('dungeon-catalog-index',()=>catalog?.index||null);
 local('dungeon-catalog-table',name=>readTable(catalog,name));
 local('dungeon-catalog-encounters',()=>readEncounters(catalog));
 local('dungeon-catalog-records',(table,keys)=>readRecords(catalog,table,keys));
 const runtime={configPath:process.env.ATLAS_RUNE_RUNTIME,scriptRoot:path.join(root,'tools'),suits:data.suits};
 const rune=runtime.configPath?createRuneRunner(runtime):null;
 const runeFloor=runtime.configPath?createRuneFloorRunner(runtime):null,floorCalls=[];
 const pve=runtime.configPath?createPveStageRunner(runtime):null;
 let mockPve=null,stopPve=null;
 local('pve-stage-status',()=>({available:true,resourceVersion:'0.0.816',battleModes:[3,26,29,208,266,267,306,320,321,341,402,409,445,502,503,528,534,535,660,813,855,880,912,914,921,923,924,926,933,934,935,936,938,1000,1024,1031,1032,1041,1121,2000,2001,2069,2182,2507,2600,3000,3001,3003,3004,3005,3006,3008,3012,3013,3014,3015,3016,3017,3022,3023,3341,3342,3344,4000,4001,4003,4004,4440,4441,4442,4443,5001,5002,5550,5551,6086,6089,6092,8238,9547,9548,9549,9550,9551,9552,9590,9591,9592,9593,9606]}));
 local('pve-stage-run',(plan,options)=>mockPve?mockPve(plan,options):pve.run(plan,options));
 local('pve-stage-stop',()=>stopPve?stopPve():pve?.stop());
 let runeEnabled=false,replayPlan=null,mockBattle=null,stopRandom=null,mockSeeds=null,stopSeeds=null;
 const seedEvidence=(props={})=>({scope:'local-solo-rune',status:'incomplete',total:10000,wins:73,loss:null,
  slowest:{seed:13,engineSeconds:25.5,combatMs:14400},...props});
 local('rune-battle-status',async()=>runeEnabled?{...(await rune?.status()||{available:true,resourceVersion:'0.0.816'}),floors:[...runeFloorIds,102,...hun13FloorIds]}:{available:false});
 local('rune-battle-run',(plan,options)=>{
  replayPlan=plan;
  if(options?.dungeonId===101)floorCalls.push(options);
  const runner=runeFloorIds.includes(options?.dungeonId)?runeFloor:rune;
  return mockBattle?.(plan,options)||runner?.run(plan,options)||{seed:options?.seed??0,engineSeconds:13,completed:true,outcome:'win',wavesCleared:3,bouts:6,overlapMs:873,unresolvedActions:0,spirit:plan.spirit&&{id:plan.spirit.id,star:plan.spirit.star,level:plan.spirit.lv}};
 });
 local('rune-battle-seed-evidence',()=>null);
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
    assert.equal(await ui(detail+'.querySelector("select:not([data-pve-lineup])").options.length'),207);
    await ui(`{const menu=${detail}.querySelector('select:not([data-pve-lineup])');menu.value='1';menu.dispatchEvent(new Event('change'));}`);
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
   await ui('[...document.querySelectorAll("#client-dungeons-encounter-detail .encounter-source button")].find(button=>button.textContent==="在资料表中查看").click()');
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
  if(catalog.entries.get('skin_bg_index')?.status==='decoded'){
   await ui('qaCatalogInput("family","other");qaCatalogInput("query","皮肤背景");qaCatalogInput("table","skin_bg_index")');
   await until('!$("client-dungeons-records").hidden');
   await ui('qaCatalogInput("row-query","xuetongzi_05");document.querySelector("#client-dungeons-list button").click()');
   assert.match(await ui('$("client-dungeons-detail").textContent'),/xuetongzi_05.*scene\/beijingban\/xuetongzi_dc\/xuetongzi_dc\.scn/s);
   await ui('qaCatalogInput("query","外观系列扩展");qaCatalogInput("table","deco_skin_index_goren_skin")');
   await until('!$("client-dungeons-records").hidden');
   assert.match(await ui('$("client-dungeons-source").textContent'),/deco_skin_index\.py · goren_skin · SHA-256/);
   await ui('qaCatalogInput("query","bindict_proxy")');
   assert.equal(await ui('[...$("client-dungeons-table").options].some(option=>option.value==="bindict_proxy")'),false);
  }
  await ui('document.getElementById("client-dungeons").open=false');
 });
 if(catalog?.index.encounters&&catalog.entries.has('event4'))await check('逢魔实战按十二个入口展示原版编组、评级和奖励',async()=>{
  const panel='$("client-dungeons-encounter-detail")';
  const {encounters,duskWraith,songstress,mirage,mirageX,catfish,catfishX,skeleton,skeletonX,longche,longcheX,spiderLive,spiderNormal}=require('../app/fengmo-live.js'),entries=encounters(new Set(catalog.entries.keys()));
  assert.equal(entries.length,12);
  for(const entry of entries){
   const query=entry.title.replace(' · ',' ');
   await ui(`$('client-dungeons').open=true;$('client-dungeons-mode-encounters').click();qaEncounterInput('daily',${JSON.stringify(query)})`);
   await until(`${panel}.textContent.includes("实战入场与计分")`);
   const info=await ui(panel+'.textContent');
   assert.ok(info.includes(entry.title)&&info.includes(`集结模式 ${entry.fengmoLive.rally}`));
   assert.ok(info.includes(`事件 ${entry.fengmoLive.eventId}`));
   assert.ok(info.includes('客户端玩法说明')&&info.includes(String(entry.fengmoLive.stage)));
   if(entry.fengmoLive.stage===duskWraith.stageId){
    assert.match(info,/五位侍从编组.*真身纸人编组/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-dusk-window]")?.valueAsNumber'),duskWraith.defaultWindow);
    const music=panel+'.querySelector("[data-pve-dusk-music]")';
    assert.equal(await ui(music+'.value'),'2 3 4 5 6');
    await ui(`(()=>{const input=${music};input.value="2 2 4 5 6";input.dispatchEvent(new Event("input"));})()`);
    assert.equal(await ui(music+'.getAttribute("aria-invalid")'),'true');
    await ui(`(()=>{const input=${music};input.value="6，5，4，3，2";input.dispatchEvent(new Event("input"));})()`);
    assert.equal(await ui(music+'.getAttribute("aria-invalid")'),'false');
   }else if(entry.fengmoLive.stage===songstress.stageId){
    assert.match(info,/六位式神和一位阴阳师.*第二阶段黑衣侍女.*白衣侍女击败增益/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-song-window]")?.valueAsNumber'),songstress.defaultWindow);
   }else if(entry.fengmoLive.stage===mirage.stageId){
    assert.match(info,/原版引擎召唤大将和纸人.*大将召唤编组.*蜃气勘破时长/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-mirage-general]")?.valueAsNumber'),mirage.defaultGeneralSeconds);
    assert.deepEqual(await ui('[...'+panel+'.querySelectorAll("[data-pve-mirage-position]")].map(el=>Number(el.value))'),mirage.defaultTruePositions);
   }else if(entry.fengmoLive.stage===mirageX.stageId){
    assert.match(info,/战报记录蜃雾护盾和误杀镜像后的强化.*极版大将召唤编组.*误杀镜像后的暴击抵抗/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-mirage-window]")?.valueAsNumber'),mirageX.defaultWindow);
    assert.equal(await ui(panel+'.querySelector("[data-pve-mirage-weekly]")?.valueAsNumber'),mirageX.weeklyDefault);
    assert.deepEqual(await ui('[...'+panel+'.querySelector("[data-pve-mirage-trait]").options].map(el=>Number(el.value))'),
     mirageX.traits.map(({id})=>id));
   }else if(entry.fengmoLive.stage===catfish.stageId){
    assert.match(info,/海坊主祝福、小猴伤害上限和鸟居结果.*小猴编组.*鸟居时限/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-catfish-window]")?.valueAsNumber'),catfish.defaultWindow);
   }else if(entry.fengmoLive.stage===catfishX.stageId){
    assert.match(info,/跟进皮糙肉厚、小猴增伤和鸟居结果.*极版小猴编组.*异变·斗魂的皮糙肉厚/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-catfish-weekly]")?.valueAsNumber'),catfishX.weeklyDefault);
    assert.equal(await ui(panel+'.querySelector("[data-pve-catfish-armor]")?.valueAsNumber'),catfishX.maxArmorStacks);
    assert.deepEqual(await ui('[...'+panel+'.querySelector("[data-pve-catfish-trait]").options].map(el=>Number(el.value))'),
     catfishX.traits.map(({id})=>id));
   }else if(entry.fengmoLive.stage===skeleton.stageId){
    assert.match(info,/击败两名真部下.*真假部下线索/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-skeleton-window]")?.valueAsNumber'),skeleton.defaultWindow);
    assert.deepEqual(await ui('[...'+panel+'.querySelectorAll("[data-pve-skeleton-position]")].map(el=>Number(el.value))'),skeleton.defaultTruePositions);
   }else if(entry.fengmoLive.stage===skeletonX.stageId){
    assert.match(info,/突变效果、区服上周均时和纸人档位.*秘宝纸人第 5 档/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-skeleton-window]")?.valueAsNumber'),skeletonX.defaultWindow);
    assert.equal(await ui(panel+'.querySelector("[data-pve-skeleton-weekly]")?.valueAsNumber'),skeletonX.weeklyDefault);
    assert.deepEqual(await ui('[...'+panel+'.querySelector("[data-pve-skeleton-trait]").options].map(el=>Number(el.value))'),
     skeletonX.traits.map(({id})=>id));
   }else if(entry.fengmoLive.stage===longche.stageId){
    assert.match(info,/第一套精英编组.*红、蓝修理呱阵位.*统帅与地面线索/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-longche-window]")?.valueAsNumber'),longche.defaultWindow);
    assert.equal(await ui(panel+'.querySelector("[data-pve-longche-repair]")?.valueAsNumber'),longche.defaultRepairSeconds);
    assert.equal(await ui(panel+'.querySelector("[data-pve-longche-commander]")?.value'),String(longche.defaultCommander));
   }else if(entry.fengmoLive.stage===longcheX.stageId){
    assert.match(info,/模拟四只修理呱、吸收强化和金辉赐福.*四只修理呱太.*吸收哐呱后的攻击强化/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-longche-weekly]")?.valueAsNumber'),longcheX.weeklyDefault);
    assert.deepEqual(await ui('[...'+panel+'.querySelectorAll("[data-pve-longche-order]")].map(el=>Number(el.value))'),longcheX.defaultRepairOrder);
   }else if(entry.fengmoLive.stage===spiderLive.stageId){
    assert.match(info,/战报记录部位余血和白茧恢复.*白茧部位配置/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-spider-live-window]")?.valueAsNumber'),spiderLive.windowLimit);
    assert.deepEqual(await ui('[...'+panel+'.querySelector("[data-pve-spider-live-trait]").options].map(el=>Number(el.value))'),
     spiderLive.traits.map(({id})=>id));
   }else if(entry.fengmoLive.stage===spiderNormal.stageId){
    assert.match(info,/触发召唤的弱点.*金色小蜘蛛概率/s);
    assert.equal(await ui(panel+'.querySelector("[data-pve-spider-live-window]")?.valueAsNumber'),spiderNormal.windowLimit);
    assert.deepEqual(await ui('[...'+panel+'.querySelector("[data-pve-spider-normal-weak]").options].map(el=>Number(el.value))'),
     [0,2,3,4]);
   }else assert.equal(await ui(panel+'.querySelector("[data-pve-stock]")'),null);
  }
  await ui('qaEncounterInput("daily","逢魔实战 稀有·土蜘蛛")');
  await until(panel+'.textContent.includes("按个人伤害比较评级门槛")');
  assert.match(await ui(panel+'.textContent'),/星期三.*战斗模式 3003.*个人伤害下限.*2,000,000/s);
  await ui('qaEncounterInput("daily","逢魔实战 极·土蜘蛛")');
  await until(panel+'.textContent.includes("极土蜘蛛个人伤害低于")');
  await ui(`[...${panel}.querySelectorAll('summary')].find(el=>el.textContent==="查看客户端积分与奖励表").click()`);
  await until(panel+'.textContent.includes("个人名次奖励表")');
  assert.match(await ui(panel+'.textContent'),/低于 30,000 时，两项积分均为 0.*60,000.*队伍用时积分表.*个人名次积分表.*71159/s);
  await ui(panel+'.scrollIntoView({block:"start",behavior:"instant"})');
  await capture('client-fengmo-live');
  await ui('$("client-dungeons").open=false');
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
   assert.match(detail,/模拟已知阵容.*3 位式神.*探索原版战斗入口/s);
   assert.ok(await ui('!!$("client-dungeons-encounter-detail").querySelector("[data-pve-start]")'));
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
 if(catalog?.index.encounters&&catalog.entries.has('shilian_liudao'))await check('六道之门按路线显示首领、规则与候选编组',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  const detail='$("client-dungeons-encounter-detail")';
  await ui('qaEncounterInput("daily","六道之门路线 香行域")');
  await until(detail+'.textContent.includes("ShiLianXunXiangXingEngine")');
  const route=await ui(detail+'.textContent');
  assert.match(route,/可选试炼式神 ID.*217.*264.*238.*试炼引擎 ShiLianXunXiangXingEngine.*928.*路线阵容码.*110151.*途中战斗引擎.*927/s);
  assert.match(route,/迷影诡谲.*每前行一步.*结算评级/s);
  await ui('qaEncounterInput("daily","六道之门试炼关卡 香行域")');
  await until(detail+'.textContent.includes("持国天")');
  assert.match(await ui(detail+'.textContent'),/路线阵容码.*110151.*通用 PvE 关卡.*700133.*敌方编组/s);
  await ui('qaEncounterInput("battle","700133")');
  await until(detail+'.textContent.includes("六道之门专用引擎")');
  assert.equal(await ui(detail+'.textContent.includes("模拟已知阵容")'),false);
  await ui('qaEncounterInput("daily","六道之门岛屿 54")');
  await until(detail+'.textContent.includes("原版战斗候选")');
  assert.match(await ui(detail+'.textContent'),/混沌之屿.*事件组26.*岛屿玩法说明.*原版战斗候选/s);
  await ui('$("client-dungeons").open=false');
 });
 if(catalog?.index.encounters&&catalog.entries.has('map_boss'))await check('真蛇展示十层敌方编组、跨层规则与原版入口',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  await ui('qaEncounterInput("daily","真蛇 地图首领入口")');
  const detail='$("client-dungeons-encounter-detail")';
  await until(detail+'.textContent.includes("ZhenDaSheEngine")');
  assert.match(await ui(detail+'.textContent'),/真·八岐大蛇玩法原文.*2名阴阳师.*生命上限.*ZhenDaSheEngine.*第 10 层关卡/s);
  assert.equal(await ui(detail+'.querySelectorAll(".dungeon-encounter-waves ul").length'),10);
  await ui(`[...${detail}.querySelectorAll('section')].find(el=>el.firstChild.textContent.includes('第 10 层关卡')).querySelector('button:last-child').click()`);
  await until(detail+'.textContent.includes("沿用同一场战斗的十层进度")');
  assert.match(await ui(detail+'.textContent'),/第 10 层.*25109.*真·八岐大蛇挑战入口/s);
  assert.equal(await ui(detail+'.querySelectorAll(".dungeon-encounter-waves ul").length'),1);
  await ui('$("client-dungeons").open=false');
 });
 if(encounterCases.some(entry=>entry.table==='map_boss'&&entry.key===73))await check('地图首领展示各档敌方编组、规则与关联入口',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  const detail='$("client-dungeons-encounter-detail")';
  await ui('qaEncounterInput("daily","愤怒的石距 地图首领入口 25308")');
  await until(detail+'.textContent.includes("愤怒的石距玩法原文")');
  assert.match(await ui(detail+'.textContent'),/愤怒暴走.*招福达摩.*WorldBossEngine.*配置等级 10.*25300.*配置等级 50.*25308/s);
  assert.equal(await ui(detail+'.querySelectorAll(".dungeon-encounter-waves ul").length'),9);
  assert.equal(await ui('document.querySelector("[data-map-boss-stage]").options.length'),9);
  await ui(`[...${detail}.querySelectorAll('section')].find(el=>el.firstChild.textContent.includes('配置等级 50')).querySelector('button:last-child').click()`);
  await until('document.querySelector("[data-map-boss-stage]")?.value==="25308"');
  assert.match(await ui(detail+'.textContent'),/25308.*地图首领入口.*73/s);
  assert.match(await ui(detail+'.textContent'),/模拟已知阵容/);
  await ui('qaEncounterInput("daily","年兽 地图首领入口 14608")');
  await until(detail+'.textContent.includes("年兽玩法原文")');
  assert.match(await ui(detail+'.textContent'),/虚弱.*配置等级 50.*14608/s);
  await ui('$("client-dungeons").open=false');
 });
 if(encounterCases.some(entry=>entry.table==='battle_mode_routes'&&entry.key===312))await check('阴阳寮宴会可查原版规则和料理，并跳转到对应食材怪物的原版复跑',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  const detail='$("client-dungeons-encounter-detail")';
  const click=(label)=>ui(`[...${detail}.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(label)}).click()`);
  await ui('qaEncounterInput("guild","阴阳寮宴会 312")');
  await until(detail+'.textContent.includes("式神自动轮换规则")');
  assert.match(await ui(detail+'.textContent'),/15 分钟.*10 次.*40 秒.*GuildDinnerScene.*最多可设置50名式神/s);
  assert.equal(await ui('document.querySelector("[data-pve-start]")===null'),true);
  await click('查看题库');
  await until('$("client-dungeons-table").value==="guild_dinner_question"');
  await ui('$("client-dungeons-mode-encounters").click();qaEncounterInput("guild","阴阳寮宴会 312")');
  await until(detail+'.textContent.includes("式神自动轮换规则")');
  await click('查找宴会料理');
  assert.match(await ui('$("client-dungeons-encounter-count").textContent'),/28 条/);
  await ui('qaEncounterInput("guild","阴阳寮宴会料理 9001")');
  await until(detail+'.textContent.includes("按寮等级查看筹备费用")');
  assert.match(await ui(detail+'.textContent'),/前置料理寿司 3 级.*烹饪次数寿司 10 次.*全寮累计击败石距 × 1.*原表式神经验7,840/s);
  await ui(`[...${detail}.querySelectorAll('section')].find(section=>section.firstChild.textContent.includes('全寮累计击败目标 · 河童')).querySelector('button:last-child').click()`);
  await until(detail+'.textContent.includes("游戏内筹备进度由服务器结算")');
  await click('打开战斗与复跑');
  await until('document.querySelector("[data-pve-start]")!==null');
  assert.match(await ui(detail+'.textContent'),/2722.*模拟已知阵容.*32712.*河童/s);
  await ui('$("client-dungeons").open=false');
 });
 if(encounterCases.some(entry=>entry.table==='dream_act_hero'&&entry.key===592))await check('幻游问梦读取指定阵容、规则和种子并显示原版结算',async()=>{
  const detail='$("client-dungeons-encounter-detail")',start='document.querySelector("[data-dream-start]")';
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click();qaEncounterInput("event","幻游问梦 11721")');
  await until(detail+'.textContent.includes("幻游问梦开放与资源规则")');
  assert.match(await ui(detail+'.textContent'),/2026-11-25.*2026-12-01.*酣梦引/s);
  await ui(`[...${detail}.querySelectorAll('section')].find(section=>section.firstChild.textContent.includes('梦境试炼 · 平将门')).querySelector('button:last-child').click()`);
  await until(start+'?.disabled===false');
  const text=await ui(detail+'.textContent');
  assert.match(text,/40 级 6 星平将门.*7 回合.*无趣梦.*试炼胜负条件/s);
  assert.equal(await ui('document.querySelector("[data-pve-lineup]")===null'),true);
  const seed='document.querySelector("[data-dream-seed]")';
  await ui(`${seed}.value='10000';${seed}.dispatchEvent(new Event('input'))`);
  assert.equal(await ui(start+'.disabled'),true);
  try{
   mockPve=async(plan,request)=>{
    assert.deepEqual(plan,{});
    assert.deepEqual(request,{battleMode:9606,stageId:34266,groupId:34266,seed:37,damageFloor:true});
    return {completed:true,outcome:'win',bouts:1,engineSeconds:4.78,dreamTrial:{turnLimit:7}};
   };
   await ui(`${seed}.value='37';${seed}.dispatchEvent(new Event('input'));${start}.click()`);
   await until(detail+'.textContent.includes("原版胜利")');
   assert.match(await ui(detail+'.textContent'),/种子 37 · 1 \/ 7 回合 · 引擎全程 4.78 秒/);
   mockPve=async(plan,request)=>{
    assert.deepEqual(plan,{manualBasic:true});
    assert.equal(request.seed,37);
    return {completed:true,outcome:'loss',bouts:7,engineSeconds:35.30,dreamTrial:{turnLimit:7,manualAttacks:3}};
   };
   await ui(`document.querySelector('[data-dream-control]').value='basic';${start}.click()`);
   await until(detail+'.textContent.includes("原版失败")');
   assert.match(await ui(detail+'.textContent'),/原版失败.*7 \/ 7 回合.*手动普攻 3 次/s);
  }finally{mockPve=null;await ui('$("client-dungeons").open=false');}
 });
 if(catalog?.index.encounters&&catalog.entries.has('lbs_world_boss_area'))await check('地域鬼王显示原版普通条件、极难词条及玩法专用入口',async()=>{
  await ui('$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click()');
  await ui('qaEncounterInput("daily","地域鬼王 国王湖")');
  const detail='$("client-dungeons-encounter-detail")';
  await until(detail+'.textContent.includes("LBSWorldBossXEngine")');
  const area=await ui(detail+'.textContent');
  assert.match(area,/国王湖.*每日条件及其实际参数由服务器下发.*静态战斗候选（权重 1）.*300092.*普通特殊条件候选（权重 0.2） · 10003.*限定%s回合.*参数池 1\[61,70\]/s);
  assert.match(area,/LBSWorldBossEngine.*LBSWorldBossXEngine.*地域鬼王普通阵容码目录.*10020215.*地域鬼王极难阵容码目录.*10020216/s);
  assert.match(area,/挑战评分计算规则.*回合数.*总血量/s);
  await ui(`[...${detail}.querySelectorAll('section')].find(el=>el.firstChild.textContent.includes('静态战斗候选')).querySelector('button:last-child').click()`);
  await until(detail+'.textContent.includes("离线演练还需要该玩法下发的实际参数")');
  assert.doesNotMatch(await ui(detail+'.textContent'),/用库存离线复跑/);
  await ui('qaEncounterInput("daily","地域鬼王 密歇根湖")');
  await until(detail+'.textContent.includes("权重 0.1 + 0.1")');
  await ui(`[...${detail}.querySelectorAll('section')].find(el=>el.firstChild.textContent.includes('地域鬼王极难引擎及词条')).querySelector('button:last-child').click()`);
  await until(detail+'.textContent.includes("蛇魔侵蚀(召唤)")');
  const hard=await ui(detail+'.textContent');
  assert.match(hard,/守护小纸人.*小纸人不阵亡.*群体加速.*全体提升20点.*蛇魔侵蚀\(召唤\).*额外提升2000积分/s);
  assert.equal(await ui(detail+'.querySelectorAll(".encounter-rule-text").length'),12);
  assert.equal(await ui('$("client-dungeons-encounter-list").children.length'),1);
  assert.match(await ui('$("client-dungeons-encounter-list").textContent'),/地域鬼王极难/);
  const listFits=`[...$("client-dungeons-encounter-list").children].every(button=>button.getBoundingClientRect().right<=$("client-dungeons-encounter-list").getBoundingClientRect().right+1)`;
  assert.equal(await ui(listFits),true);
  win.setContentSize(720,960);
  assert.equal(await ui(listFits),true);
  win.setContentSize(1440,1000);
  await ui(detail+'.querySelector(".encounter-rule-text").closest("section").scrollIntoView({block:"start",behavior:"instant"})');
  await capture('client-regional-boss-hard-rules');
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
 if(catalog?.index.encounters)await check('已知阵容按副本匹配、使用原版入口并保留逐场战报',async()=>{
  const ids=[591,389,596,554,379,557],reserves=[237,395,369,364],heroes={},items=[];
  for(const id of [...ids,...reserves,217,219]){
   const prototype=data.gameConfig.heroes[id],prefix='pve-'+id;
   const skinfo=prototype.skills.map(skill=>[skill,game.levels(data.gameConfig,skill,1).at(-1).level]);
   const equips=Array.from({length:6},(_,i)=>prefix+'-soul-'+i);
   heroes[prefix]={heroId:id,level:40,star:6,awake:1,skinfo,equips,
    attrs:[[8000,0,0,0],[101,0,0,0],[.5,0,0,0],[.1,0,0,0],[500,0,0,0],[2500,0,0,0],0,0]};
   equips.forEach((id,i)=>items.push({id,slot:i+1,quality:6,level:15,setId:'火灵',
    mainAttrType:['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'][i],
    mainAttrValue:[486,57,104,.55,2052,.55][i],subAttributes:[{type:'crit_rate',value:.1}]}));
  }
  const fighter=(id,index)=>({index:index+1,kind:'shikigami',name:data.gameConfig.heroes[id].name,
   shikigamiId:String(id),level:40,star:6,awakening:1,skills:heroes['pve-'+id].skinfo.map(([id,level])=>({id,level})),
   aiSkill:0,config:{keepCurrent:true}});
  const fighters=ids.map(fighter);
  function known(id,gameSceneId,count,onmyoji=10,notes=''){
   return {id:'qa-known-'+id,title:'已知阵容 '+id,code:'|TA|qa-known-'+id,notes,
    gameSceneId,requirementsComplete:true,decodeState:'decoded-local',members:[
     {index:0,kind:'onmyoji',name:data.gameConfig.heroes[onmyoji].name,onmyojiId:String(onmyoji),level:60,star:2,awakening:0,aiSkill:0,
      skills:(onmyoji===13?[1304,1302]:[1008,1011]).map(id=>({id,level:5}))},...fighters.slice(0,count)]};
  }
  const notes='资源 0.0.816，6 场离线结算。我方伤害取下限。阴阳师普攻 1 级。开场操作。入场前把第1位式神设为自动普攻。手动开场，首动普攻首领后切自动。红标首领。绿标第3位式神。全分支待验证。';
  const tactical={manualOpening:true,redBoss:true,greenSlot:3,autoMode:{slot:1,mode:'basic'}};
  const squads=[known('story',1001001,3),known('story-other',1001002,3,13),known('awake',10023001,5),known('secret',10701011,5),
   known('chapter-challenge',1001001,5),known('breakthrough-attack',10020201,5),known('breakthrough-defense',10020201,5,13),
   known('dojo-guardian',10020203,5),known('dojo-defense',10020203,5,13),
   known('secret-race',10700011,5),known('crevice',10020211,5),
   known('superghost',100942,5),known('superghost-five',100943,5),known('shan-feng',null,5),known('ji-boss',null,5),known('gtw-boss',null,5),
   known('gtw-hunt',null,5),known('ji-forest',null,5),known('chaji-boss',null,5),
   known('qinfei-boss',101002,5,10,notes),
   known('exp',1001001,5),known('yuling',10030001,5),known('hunt',10020208,5,10,notes),known('underworld',19005,5),
   known('retreat',10020205,5,10,notes),known('yanwu',100978,6),known('general-soul',100935,5,10,notes),known('spider',10020221,5,10,notes),
   known('spider-normal',10020220,5,10,notes),
   known('dusk-wraith',10020227,5),known('songstress',10020217,6,10,notes),known('mirage',10020218,5,10,notes),
   known('mirage-x',10020219,5,10,notes),
   known('catfish',10020224,5,10,notes),known('catfish-x',10020225,5,10,notes),
   known('skeleton',10020222,5,10,notes),known('skeleton-x',10020223,5,10,notes),
   known('longche',10020226,5,10,notes),known('longche-x',10020229,5,10,notes),
   known('snow',100973,5),known('instant',101009,5),known('tianfa',100969,6),known('lbs-rat',101006,5),
   known('liyu',10733004,5),known('secret-team',10701004,5),known('secret-mirror',10710004,5),known('secret-referee',10718011,5),
   known('region',10020215,5,13),known('region-hard',10020216,5),known('orochi',10020228,6),
   known('hunling',10051005,5),known('hunling-3star',10051004,5),known('hunling-1star',10051006,5),known('qiling-group',10055004,5),
   known('ten-tower',100998,5),known('ten-map',101000,5)];
  const trial=known('six-realms',110151,6);
  trial.members[6]=fighter(217,5);
  const moon=known('moon-trial',110150,6);
  moon.members[6]=fighter(219,5);
  const stageActorOnly=known('stage-actor-only',10723011,5);
  stageActorOnly.members.shift();
  const stageActorWithSlot=known('stage-actor-slot',10725011,5);
  stageActorWithSlot.members[0].skills=[];
  const jinyujiStageActor=known('secret-jinyuji',10717011,5);
  jinyujiStageActor.members.shift();
  const tenBossStageActor=known('ten-boss',100999,5);
  tenBossStageActor.members.shift();
  const trainingStageActor=known('urdtg-training',101014,5);
  trainingStageActor.members.shift();
  const tenExplore=known('ten-explore',101000,5);
  tenExplore.members=tenExplore.members.filter(member=>[591,379].includes(Number(member.shikigamiId)));
  const yanmo=known('yanmo',null,5);
  yanmo.members.shift();
  squads.push(trial,moon,known('six-realms-ineligible',110151,6),stageActorOnly,stageActorWithSlot,jinyujiStageActor,tenBossStageActor,trainingStageActor,tenExplore,yanmo);
  const boot=await ui('JSON.stringify(STATE)');
  const cases=encounterCases;
  const sample={completed:true,outcome:'win',waveCount:1,wavesCleared:1,bouts:3,engineSeconds:18,
   animationPlayback:{combatElapsedMs:6910,combatOverlapMs:1100,interruptedClips:0,unresolved:0}};
  const panel='$("client-dungeons-encounter-detail")';
  const options='document.querySelector("[data-pve-lineup]")';
  const start='document.querySelector("[data-pve-start]")';
  const reports='document.querySelector("[data-pve-results]")';
  const status='document.querySelector("[data-pve-status]")';
  const noSearch=()=>ui('!document.querySelector("[data-pve-stock],#dungeon-search-stock,[data-pve-auto-share],#dungeon-auto-share")');
  async function choose(id){
   await until(options+'?.querySelector("option[value=qa-known-'+id+']")!=null');
   await ui(options+'.value='+JSON.stringify('qa-known-'+id)+';'+options+'.dispatchEvent(new Event("change"))');
   await until(start+'?.disabled===false');
  }
  async function encounter(family,query){
   await ui('qaEncounterInput('+JSON.stringify(family)+','+JSON.stringify(query)+')');
   await until(start+'!==null');
  }
  async function run(id,expected,response={},tactics,actor=10,count=5,live=false){
   const calls=[],verified=[];
   mockPve=async (plan,options)=>{
    assert.deepEqual(options,{...expected,seed:options.seed,damageFloor:true});
    if(expected.battleMode===2001){
     assert.equal(plan.rounds.length,1);plan=plan.rounds[0];
    }
    assert.equal(plan.onmyoji?.heroId??null,actor);
    assert.deepEqual(plan.members.map(member=>member.hero.heroId),ids.slice(0,count));
    assert.deepEqual(plan.tactics,tactics);
    const souls=plan.members.flatMap(row=>row.souls.map(q=>q.id));
    assert.equal(new Set(souls).size,6*count);
    if([4000,4001].includes(expected.battleMode)){
     assert.equal(plan.defender.onmyoji.heroId,13);
     assert.deepEqual(plan.defender.members.map(member=>member.hero.heroId),ids.slice(0,5));
     assert.ok(plan.defender.members.every(member=>member.souls.length===6));
     assert.equal(plan.attackPartySize,expected.battleMode===4001?3:undefined);
    }
    if(expected.battleMode===4003){
     assert.equal(plan.dojoDefense.leader,true);
     assert.equal(plan.dojoDefense.partySize,2);
     const [first,second]=plan.dojoDefense.waves;
     assert.deepEqual(plan.dojoDefense.waves.map(wave=>wave.onmyoji.heroId),[13,10]);
     assert.deepEqual(first.members.map(member=>member.hero.heroId),ids.slice(0,5));
     assert.deepEqual(second.members.map(member=>member.hero.heroId),[ids[1],ids[2],ids[4]]);
     assert.deepEqual(second.omittedSlots,[2,5]);
    }
    calls.push(options.seed);
    if(!live)return {...sample,...options,...response};
    const report=await pve.run(plan,options);
    assert.equal(report.stageId,expected.stageId);
    assert.equal(report.completed,true);
    verified.push({seed:report.seed,outcome:report.outcome,engineSeconds:report.engineSeconds});
    return report;
   };
   await choose(id);
   assert.equal(await noSearch(),true);
   await ui(start+'.click()');
   await until(status+'.textContent.includes("全随机分支待验证")'+(live?'||'+status+'.textContent.includes("未通过本次采样")':''),live?110000:20000);
   assert.deepEqual(calls,[0,1,2,3,7,42].slice(0,live?verified.length:6));
   if(live){
    assert.ok(verified.length);
    console.log(expected.stageId+' selected lineup native results',JSON.stringify(verified));
   }
   return ui(reports+'.textContent');
  }
  try{
   await ui('stopMatch();STATE={...STATE,lineups:'+JSON.stringify(squads)+',accounts:[C.parseAccount('+
    JSON.stringify({...raw,heroes,hero_equips:items})+')]};STATE.activeAccount=STATE.accounts[0].id;selectView("library");'+
    '$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click();selectedLineups.clear();renderSelection()');
   await encounter('daily','阴阳之理 大天狗挑战难度1 1801');
   assert.equal(await ui(start+'.disabled'),true);
   assert.match(await run('story',{stageId:31811,groupId:31811,battleMode:1000,storyRoomId:1801},{},undefined,10,3,!!pve),/已知阵容 story.*(通过 6 个采样种子|种子 \d+ 未通关)/s);
   let held=false;
   mockPve=(_plan,{seed})=>new Promise(resolve=>{held=true;stopPve=()=>resolve({...sample,seed});});
   await ui(start+'.focus();'+start+'.click()');
   await until('document.activeElement.matches("[data-pve-stop]") && '+status+'.textContent.includes("种子 0")',18000);
   assert.equal(held,true);
   await ui('document.activeElement.click()');
   await until(status+'.textContent.includes("复跑已停止")&&document.activeElement.matches("[data-pve-start]")');
   const libraryOrder=[];
   mockPve=(plan,{seed})=>{libraryOrder.push(plan.onmyoji.heroId);return {...sample,seed,outcome:'loss',wavesCleared:0};};
   await ui(options+'.value="";selectedLineups=new Set(["qa-known-story-other","qa-known-story","qa-known-awake"]);renderSelection();'+start+'.click()');
   await until(status+'.textContent.includes("未通过本次采样")');
   assert.deepEqual(libraryOrder,[13,10]);
   await ui('selectedLineups.clear();renderSelection()');
   if(cases.some(entry=>entry.table==='battle_mode_routes'&&entry.key===4000)){
    await encounter('daily','个人结界突破 battle_mode_routes 4000');
    const defense='document.querySelector("[data-pve-defense-lineup]")';
    const defenseAccount='document.querySelector("[data-pve-defense-account]")';
    assert.equal(await ui(start+'.disabled'),true);
    assert.deepEqual(await ui('[...'+defense+'.options].map(item=>item.value).filter(id=>id.startsWith("qa-known-"))'),
     ['qa-known-breakthrough-attack','qa-known-breakthrough-defense']);
    assert.equal(await ui(defenseAccount+'.selectedOptions[0].textContent'),'使用当前账号');
    await ui(defense+'.value="qa-known-breakthrough-defense";'+defense+'.dispatchEvent(new Event("change"))');
    const lineup=actor=>[actor,...ids.slice(0,5)].map((id,i)=>({id,level:i?40:60,attack:2500,hp:24000,speed:128,souls:i?6:0}));
    const breakthrough={attack:lineup(10),defense:lineup(13),referee:{level:8,speed:130,turns:2}};
    assert.match(await run('breakthrough-attack',{stageId:10020201,groupId:100,battleMode:4000},{breakthrough}),
     /进攻胜利 · 鲤鱼旗裁判 8 档 · 速度 130 · 行动 2 次.*查看攻防开场面板/s);
   }
   if(cases.some(entry=>entry.table==='battle_mode_routes'&&entry.key===4001)){
    await encounter('guild','阴阳寮结界突破 battle_mode_routes 4001');
    const field='document.querySelector("[data-pve-attack-party]")';
    const layout='document.querySelector("[data-pve-attack-party-positions]")';
    const defense='document.querySelector("[data-pve-defense-lineup]")';
    assert.deepEqual(await ui('[...'+field+'.options].map(item=>item.text)'),['单人','双人','三人']);
    await ui(field+'.value="2";'+field+'.dispatchEvent(new Event("change"))');
    assert.match(await ui(layout+'.textContent'),/队长 · 5、6 号位；队员 2 · 2、3、4 号位/);
    await ui(field+'.value="3";'+field+'.dispatchEvent(new Event("change"));'+
     defense+'.value="qa-known-breakthrough-defense";'+defense+'.dispatchEvent(new Event("change"))');
    assert.match(await ui(layout+'.textContent'),/队长 · 3 号位；队员 2 · 2、5 号位；队员 3 · 4、6 号位/);
    const lineup=actor=>[actor,...ids.slice(0,5)].map((id,i)=>({id,level:i?40:60,attack:2500,hp:24000,speed:128,souls:i?6:0}));
    const breakthrough={attack:lineup(10),defense:lineup(13),attackParty:[[3],[2,5],[4,6]]};
    const summary=await run('breakthrough-attack',{stageId:10020201,groupId:100,battleMode:4001},{breakthrough});
    assert.match(summary,/进攻胜利 · 3 人进攻.*队长 · 阴阳师 1 号位，式神 3 号位/s);
    assert.doesNotMatch(summary,/鲤鱼旗裁判/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&Number(entry.key)===40051&&entry.refs.some(ref=>ref.key===4004))){
    await encounter('guild','道馆守护 神龙 40051');
    const hp='document.querySelector("[data-pve-dojo-guardian-hp]")';
    const time='document.querySelector("[data-pve-dojo-guardian-window]")';
    assert.equal(await ui(hp+'.max'),'46598400');
    await choose('dojo-guardian');
    await ui(hp+'.value="46598401";'+hp+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(hp+'.value="100000";'+time+'.value="20";'+time+'.dispatchEvent(new Event("input"))');
    const dojoGuardian={hp:100000,windowSeconds:20};
    const summary=await run('dojo-guardian',{stageId:40051,groupId:40051,battleMode:4004,dojoGuardian},
     {outcome:'loss',wavesCleared:0,dojoGuardian:{damage:3600,startHp:100000,remainingHp:96400,combatSeconds:20,
      settlementWaitSeconds:0,timedOut:true,defeated:false}});
    assert.match(summary,/达到模拟时限 · 本队伤害 3,600 · 入场生命 100,000 · 剩余生命 96,400/s);
   }
   if(cases.some(entry=>entry.table==='battle_mode_routes'&&Number(entry.key)===4003&&entry.refs.some(ref=>ref.table==='Combinesceneinfo'))){
    await encounter('guild','道馆 结界师与馆主 4003');
    const leader='document.querySelector("[data-pve-dojo-leader]")';
    const party='document.querySelector("[data-pve-attack-party]")';
    const waveList='document.querySelector("[data-pve-dojo-wave-list]")';
    const open='document.querySelector("[data-pve-dojo-add-wave]")';
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(waveList+'.querySelector("[data-dojo-omissions]").hidden'),true);
    await ui(`${leader}.value='leader';${leader}.dispatchEvent(new Event('change'));
     ${party}.value='2';${party}.dispatchEvent(new Event('change'));${open}.click();`);
    assert.equal(await ui(waveList+'.children.length'),2);
    assert.equal(await ui(waveList+'.children[1].contains(document.activeElement)'),true);
    await ui(`for(const [i,id] of ['dojo-defense','dojo-guardian'].entries()){
     const f=${waveList}.children[i].querySelector('[data-dojo-lineup]');
     f.value='qa-known-'+id;f.dispatchEvent(new Event('change'));
    }
    const second=${waveList}.children[1];
    for(const slot of [2,5]){
     const field=second.querySelector('[data-dojo-omit][value="'+slot+'"]');field.checked=true;
     field.dispatchEvent(new Event('change',{bubbles:true}));
    }`);
    const wave=(wave,actor,members,omittedSlots)=>({wave,outcome:'win',attackHp:[1,2,3,4,5,6],endAttackHp:[1,2,3,4,5,6],
     attackOrbs:4,defenseOrbs:4,refereeSpeed:95,refereeTurns:0,omittedSlots,
     defense:[actor,...members].map((id,position)=>({id,position:position+1,souls:position?6:0,hp:5000}))});
    const dojoDefense={leader:true,attackParty:[[5,6],[2,3,4]],waves:[
     wave(1,13,ids.slice(0,5),[]),wave(2,10,[ids[1],ids[2],ids[4]],[2,5])]};
    const summary=await run('dojo-guardian',{stageId:10020203,groupId:100,battleMode:4003},
     {dojoDefense,waveCount:2,wavesCleared:2});
    assert.match(summary,/通过所选防守 · 馆主 · 2 人进攻 · 已击破 2 \/ 2 波.*第 2 波 · 击破.*已跳过原 2、5 号位/s);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&Number(entry.key)===3340021&&entry.refs.some(ref=>ref.table==='super_ghost6_pve'))){
    const pick=key=>'初翎山风超鬼王 pve_stage_data '+key;
    const shanFeng={actor:{id:1454,level:40,position:1},day:0,deadlineSeconds:180,timedOut:false,damage:220380,combatSeconds:15.04};
    await encounter('event',pick(3340001));
    assert.match(await ui(panel+'.textContent'),/180 秒内清场获胜.*40 级活动山风/s);
    assert.match(await run('shan-feng',{stageId:3340001,groupId:3340001,battleMode:660},{shanFeng},undefined,null),/通过 6 个采样种子.*原版判胜/s);
    await encounter('event',pick(3340021));
    assert.match(await run('shan-feng',{stageId:3340021,groupId:3340021,battleMode:660},{
     outcome:'loss',wavesCleared:0,shanFeng:{...shanFeng,day:3,timedOut:true,damage:6649070,combatSeconds:180},
    },undefined,null),/6 \/ 6 场有效结算.*本场伤害 6,649,070/s);
    await ui('qaEncounterInput("event",'+JSON.stringify(pick(3340022))+')');
    await until(panel+'.textContent.includes("困难编组的首领技能")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='sp_chaji_plot'&&entry.key===3)){
    await ui('qaEncounterInput("event","月曜新章 道满的手下 sp_chaji_plot 3")');
    const fixedStart='document.querySelector("[data-chaji-story-start]")';
    await until(fixedStart+'?.disabled===false');
    assert.match(await ui(panel+'.textContent'),/原版固定阵容 · 泷夜叉姬、卑弥呼/);
    mockPve=async (plan,options)=>{
     assert.deepEqual(plan,{});
     assert.deepEqual(options,{stageId:9808001,groupId:9808001,battleMode:9552,seed:0,damageFloor:true});
     return {...sample,...options,chajiStory:{fixed:true,timedOut:false,combatSeconds:13.52}};
    };
    await ui(fixedStart+'.click()');
    await until(panel+'.textContent.includes("原版胜利")');
    assert.match(await ui(panel+'.textContent'),/已清场 · 战斗至结算 13\.52 秒/);
    await encounter('event','日轮之影 道满剧情一 1014101');
    assert.match(await ui(panel+'.textContent'),/首领保留至少 1 点生命.*剧情按落败结算/);
    const result=await run('chaji-boss',{stageId:1014101,groupId:1014101,battleMode:9550},
     {engineSeconds:155,outcome:'loss',wavesCleared:0,chajiStory:{fixed:false,scriptDefeat:true,timedOut:false,combatSeconds:142.94}});
    assert.match(result,/6 场原版剧情结算.*剧情触发判负.*142\.94 秒/s);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&Number(entry.key)===1014001&&
     entry.refs.some(ref=>ref.table==='battle_team_routes'&&ref.key===1229))){
    await encounter('event','阵练演武 pve_stage_data 1014000');
    assert.match(await ui(panel+'.textContent'),/演武许可 6、体力 6/);
    assert.match(await run('chaji-boss',{stageId:1014000,groupId:1014000,battleMode:9548},
     {engineSeconds:109.52,chajiDrill:{timedOut:false,combatSeconds:98.42,rounds:36}}),
     /已清场.*98\.42 秒 · 我方 36 回合/s);
    await encounter('event','时间裂缝 pve_stage_data 1014001');
    assert.match(await ui(panel+'.textContent'),/10 轮 · 原版时限 600 秒 · 按清轮数结算/);
    assert.match(await run('chaji-boss',{stageId:1014001,groupId:1014001,battleMode:9549},
     {engineSeconds:644.20,waveCount:10,wavesCleared:8,chajiRift:{timedOut:true,combatSeconds:633.1,firstDeathWave:3}}),
     /最低 8 轮 · 平均 8\.0 轮 · 最高 8 轮 · 6 场.*达到原版时限.*清轮 8 \/ 10.*第 3 轮首次减员/s);
   }
   if(cases.some(entry=>entry.table==='sp_chaji_sub_event_battle'&&entry.key===13156)){
    await encounter('event','日轮之影 sp_chaji_sub_event_battle 13156');
    const difficulty='document.querySelector("[data-chaji-difficulty]")';
    assert.equal(await ui(difficulty+'.value'),'6771229');
    assert.match(await ui(panel+'.textContent'),/简单 · 原版时限 180 秒 · 月曜晷针消耗 1 枚/);
    assert.match(await run('chaji-boss',{stageId:6771229,groupId:6771229,battleMode:9547},
     {chajiMap:{hard:false,timedOut:false,combatSeconds:87.28,rounds:33}}),
     /已清场.*战斗至结算 87\.28 秒 · 我方 33 回合/s);
    await ui(difficulty+'.value="6772229";'+difficulty+'.dispatchEvent(new Event("change"))');
    assert.match(await ui(panel+'.textContent'),/困难 · 原版时限 180 秒 · 月曜晷针消耗 5 枚.*刚毅 · 所有友方受到的间接伤害降低80%/s);
    mockPve=async (plan,options)=>{
     assert.equal(plan.members.length,5);
     assert.deepEqual(options,{battleMode:9547,stageId:6772229,groupId:6772229,seed:0,damageFloor:true});
     return {...sample,...options,outcome:'loss',wavesCleared:0,
      chajiMap:{hard:true,timedOut:true,combatSeconds:181.18,rounds:74}};
    };
    await choose('chaji-boss');
    await ui(start+'.click()');
    await until(reports+'.textContent.includes("种子 0 超时")');
    assert.match(await ui(reports+'.textContent'),/达到原版时限.*我方 74 回合/s);
   }
   if(cases.some(entry=>entry.table==='sp_chaji_boss_lv_config'&&entry.key===15)){
    await encounter('event','蔽日轮回 sp_chaji_boss_lv_config 1014215');
    assert.match(await ui(panel+'.textContent'),/芦屋道满.*困难.*原版计分时限 180 秒.*无式神阵亡/s);
    const chajiBoss={scored:true,timedOut:true,combatSeconds:182.02,damage:5915549,
     tasks:[{result:3},{result:2},{result:2}]};
    const scored=await run('chaji-boss',{stageId:1014215,groupId:1014215,battleMode:9551},
     {chajiBoss,wavesCleared:0});
    assert.match(scored,/6 \/ 6 场有效结算 · 限时计分.*达到原版时限.*本场伤害 5,915,549 · 额外任务 2 \/ 3/s);
    await encounter('event','蔽日轮回 pve_stage_data 1014201');
    assert.match(await run('chaji-boss',{stageId:1014201,groupId:1014201,battleMode:9551},
     {chajiBoss:{scored:false,timedOut:false,combatSeconds:90.38,damage:4020839,tasks:[]}}),
     /通过 6 个采样种子.*已清场.*本场伤害 4,020,839/s);
   }
   if(cases.some(entry=>entry.table==='sp_yanmo_xx_fuben'&&entry.key===40)){
    await encounter('event','三途轮回 sp_yanmo_xx_fuben 602840');
    assert.match(await ui(panel+'.textContent'),/觉醒 · 第 10 层.*活动指定的大夜摩天阎魔.*10 回合内获胜/s);
    assert.match(await run('yanmo',{stageId:602840,groupId:602840,battleMode:912},
     {yanmoPractice:{timedOut:false,combatSeconds:118.58,rounds:18,lampBonusCondition:false}},undefined,null),
     /战斗至结算 118\.58 秒 · 18 回合 · 未满足冥河夜灯额外奖励回合条件/);
    await ui('qaEncounterInput("event","百鬼乱狱 pve_stage_data 602851")');
    const trialStart='document.querySelector("[data-yanmo-start]")';
    await until(trialStart+'!==null');
    assert.equal(await ui(start+'===null'),true);
    assert.match(await ui(panel+'.textContent'),/地图 1 · 格/);
    assert.equal(await ui(trialStart+'.disabled'),true);
    const cards=[1476535,1476467,1476492,1476498,1476512];
    await ui(`document.querySelectorAll("[data-yanmo-cards] select").forEach((field,i)=>{
      field.value=String(${JSON.stringify(cards)}[i]);field.dispatchEvent(new Event("change"));
    })`);
    await until(trialStart+'?.disabled===false');
    mockPve=async (plan,options)=>{
     assert.deepEqual(plan,{cards});
     assert.deepEqual(options,{stageId:602851,groupId:602851,battleMode:914,seed:0,damageFloor:true});
     return {...sample,...options,yanmoTrial:{combatSeconds:18.32,timedOut:false}};
    };
    await ui(trialStart+'.click()');
    await until(panel+'.textContent.includes("原版胜利")');
    assert.match(await ui(panel+'.textContent'),/战斗至结算 18\.32 秒/);
   }
   if(cases.some(entry=>entry.table==='ji_tower_monster'&&entry.key===2)){
    await encounter('event','错季之森普通季灵 505001');
    assert.match(await ui(panel+'.textContent'),/1 枚初芽.*180 秒.*6 名敌人/s);
    assert.match(await run('ji-forest',
     {stageId:505001,groupId:505001,battleMode:923},{jiForest:{elite:false,timedOut:false,combatSeconds:15.04}}),
     /已清场.*战斗至结算 15\.04 秒/s);
    await encounter('event','错季之森林中探查 505235');
    assert.match(await ui(panel+'.textContent'),/1 枚萤星.*180 秒.*1 名敌人/s);
    assert.match(await ui(panel+'.textContent'),/白夜.*治疗效果下降30%.*霜枯.*冬暮.*余寒/s);
    assert.match(await run('ji-forest',{stageId:505235,groupId:505235,battleMode:924},
     {jiForest:{elite:true,timedOut:false,combatSeconds:140.88,damage:4815354}}),
     /本场伤害 4,815,354/);
    await ui('qaEncounterInput("event","错季之森林中探查 505282")');
    await until(panel+'.textContent.includes("原版面板在探查达到上限后沿用第 81 级编组")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='shiki_boss'&&entry.key===2)){
    await encounter('event','四时归焉 shiki_boss 双神立 剧情');
    assert.match(await ui(panel+'.textContent'),/40 级、六星的活动季.*300 秒内清场/s);
    const jiBoss={day:2,hard:false,actor:{id:1805,level:40,star:6,replaced:true},deadlineSeconds:300,
     damage:2281840,timedOut:false,combatSeconds:14};
    assert.match(await run('ji-boss',{stageId:505103,groupId:505103,battleMode:926},{jiBoss},undefined,null),
     /通过 6 个采样种子.*已清场.*限时 300 秒/s);
    await encounter('event','四时归焉 pve_stage_data 505104');
    const score={...jiBoss,hard:true,actor:{id:10,level:60,star:2,replaced:false},deadlineSeconds:180,damage:6278606,timedOut:true};
    assert.match(await run('ji-boss',{stageId:505104,groupId:505104,battleMode:926},{wavesCleared:0,jiBoss:score}),
     /6 \/ 6 场有效结算.*达到原版时限.*本场伤害 6,278,606/s);
    await ui('qaEncounterInput("event","四时归焉 pve_stage_data 505105")');
    await until(panel+'.textContent.includes("缺少可用的阴阳师替换配置")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='stake_boss'&&entry.key===2&&entry.kind.includes('决猎庭院'))){
    await encounter('event','决猎庭院 pve_stage_data 813001');
    assert.match(await ui(panel+'.textContent'),/第二阶段 · 入场生命低于全服配置上限的 50%/);
    await choose('gtw-boss');
    const hp='document.querySelector("[data-pve-gtw-hp]")',window='document.querySelector("[data-pve-gtw-window]")';
    const set=(field,value)=>ui(field+'.value='+JSON.stringify(value)+';'+field+'.dispatchEvent(new Event("input"))');
    assert.match(await ui(hp+'.labels[0].textContent'),/首领入场生命/);
    assert.match(await ui(window+'.labels[0].textContent'),/计分时长/);
    await set(hp,'502526970000000');
    assert.ok(await ui(start+'.disabled&&'+hp+'.getAttribute("aria-invalid")==="true"'));
    assert.match(await ui('document.getElementById('+hp+'.getAttribute("aria-describedby")).textContent'),/本阶段入场生命/);
    await set(hp,'502526969999999');
    await set(window,'181');
    assert.ok(await ui(start+'.disabled&&'+window+'.getAttribute("aria-invalid")==="true"'));
    await set(window,'20');
    const gtwBoss={phase:2,bossId:46103,sharedMaxHp:1005053940000000,startHp:502526969999999,remainingHp:502526969573743.1,
     damage:939490,meetsRewardMinimum:false,windowSeconds:20,nativeLimitSeconds:180,combatSeconds:20,
     windowExpired:true,nativeTimedOut:false,defeated:false,cleared:false};
    assert.match(await run('gtw-boss',{stageId:813001,groupId:813001,battleMode:934,gtwBoss:{hp:502526969999999,windowSeconds:20}},
     {outcome:'loss',wavesCleared:0,gtwBoss}),/达到本地计分时限.*个人伤害 939,490.*未达到 400 万伤害门槛/s);
   }
   if(cases.some(entry=>entry.table==='activity_tower_floor'&&entry.key===50&&entry.kind.includes('彷徨猎场'))){
    const clock={deadlineSeconds:3600,timedOut:false,combatSeconds:14};
    const events=cases.filter(entry=>entry.table==='run_group_event'&&entry.refs.some(ref=>
     ref.table==='battle_mode_routes'&&[933,935].includes(ref.key)));
    assert.equal(events.length,20);
    await ui(`window.qaGtwWorkbench=window.AtlasPveWorkbench;
     window.AtlasPveWorkbench={...window.qaGtwWorkbench,mount(target,config){
      window.qaGtwMount=[config.gtwEventId,config.stageId,config.battleMode];
      return window.qaGtwWorkbench.mount(target,config);
     }};void 0`);
    try{
     for(const event of events){
      const stage=Number(event.refs.find(ref=>ref.table==='pve_stage_data').key);
      const mode=event.refs.find(ref=>ref.table==='battle_mode_routes').key;
      await ui('window.qaGtwMount=null;qaEncounterInput("event",'+JSON.stringify('诡城歧事战斗与剧情 '+event.key)+')');
      await until('window.qaGtwMount?.[0]==='+event.key);
      assert.deepEqual(await ui('window.qaGtwMount'),[event.key,stage,mode]);
     }
    }finally{await ui('window.AtlasPveWorkbench=window.qaGtwWorkbench;delete window.qaGtwWorkbench;delete window.qaGtwMount');}
    await encounter('event','彷徨猎场 activity_tower_floor 50');
    assert.match(await ui(panel+'.textContent'),/狩猎封符挑战.*单人清场复跑/s);
    assert.match(await run('gtw-hunt',{stageId:814000,groupId:814000,battleMode:936},
     {gtwHunt:{...clock,activityId:8884,floorId:50}}),/通过 6 个采样种子.*已清场/s);
    await encounter('event','诡城歧事 run_group_event 压制妖鬼');
    assert.match(await ui(panel+'.textContent'),/突围之战.*武大于 14/s);
    assert.match(await run('gtw-hunt',{stageId:812000,groupId:812000,battleMode:935,gtwEventId:11},
     {gtwHunt:{...clock,activityId:8778,eventId:11,chapterId:1,eventType:4}}),/通过 6 个采样种子.*已清场/s);
    await ui('qaEncounterInput("event","未关联事件 pve_stage_data 812100")');
    await until(panel+'.textContent.includes("当前资源没有指向它的活动事件")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='social_play_stage'&&entry.key===28)){
    await encounter('event','四时序战关卡 310028');
    assert.match(await ui(panel+'.textContent'),/第 7 日第 4 关 · 180 秒.*2 人组队增益.*30%.*3 人组队增益.*40%/s);
    assert.match(await ui(panel+'.textContent'),/首通奖励.*150174/s);
    assert.match(await run('tianfa',{stageId:310028,groupId:310028,battleMode:938},
     {socialPlay:{timedOut:false,combatSeconds:11.94}},undefined,null,6),
     /已清场.*战斗至结算 11\.94 秒/s);
    const select='document.querySelector("[data-pve-social-party]")';
    const positions='document.querySelector("[data-pve-social-party-positions]")';
    for(const [partySize,partyPositions,buffRate] of [[2,[[1,5,6],[2,3,4]],0.3],[3,[[1,3],[2,5],[4,6]],0.4]]){
     await ui(`${select}.value="${partySize}";${select}.dispatchEvent(new Event('change'))`);
     const preview=await ui(positions+'.textContent');
     partyPositions.forEach((slots,index)=>assert.ok(preview.includes(`玩家 ${index+1} · ${slots.join('、')} 号位`)));
     const text=await run('tianfa',{stageId:310028,groupId:310028,battleMode:938,socialParty:partySize},
      {socialPlay:{timedOut:false,combatSeconds:11.94,partyPositions,buffRate}},undefined,null,6);
     assert.ok(text.includes(`${partySize} 人组队 · 增伤和减伤各 ${Math.round(buffRate*100)}%`));
    }
   }
   if(cases.some(entry=>entry.table==='BossTower'&&entry.key===39&&entry.refs.some(ref=>ref.table==='friend_fb'))){
    await encounter('daily','探索式神挑战 独眼小僧');
    const difficulty='document.querySelector("[data-friend-difficulty]")';
    assert.equal(await ui(difficulty+'.options.length'),40);
    assert.match(await ui(panel+'.textContent'),/换波时为我方存活单位恢复等于其生命上限 20%.*第 3 波/s);
    await ui(difficulty+'.value="19";'+difficulty+'.dispatchEvent(new Event("change"))');
    assert.match(await ui(panel+'.textContent'),/19 级 · 1 号位/);
    assert.match(await run('chapter-challenge',{stageId:21230,groupId:21230,battleMode:26,friendChallenge:{bossId:39,difficulty:19}},
      {waveCount:3,wavesCleared:3},undefined,10,5,!!pve),/已知阵容 chapter-challenge.*(通过 6 个采样种子|种子 \d+ 未通关)/s);
   }
   if(cases.some(entry=>entry.table==='shilian_event_exam'&&entry.key===3)){
    await encounter('daily','六道之门试炼关卡 香行域');
    assert.match(await ui(panel+'.textContent'),/首领试炼使用档位 1/);
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-six-realms']);
    await choose('six-realms');
    const trialPosition='document.querySelector("[data-pve-trial]")';
    await ui(trialPosition+'.value="1";'+trialPosition+'.dispatchEvent(new Event("change"));'+start+'.click()');
    await until(reports+'.textContent.includes("该位置的式神不属于本路线")');
    await ui(trialPosition+'.value="";'+trialPosition+'.dispatchEvent(new Event("change"))');
    const trialSeeds=[];
    mockPve=(plan,request)=>{
     assert.deepEqual(request,{battleMode:921,stageId:700133,groupId:700133,seed:request.seed,damageFloor:true,trialSlot:6});
     assert.deepEqual(plan.members.map(member=>member.hero.heroId),[...ids.slice(0,5),217]);
     trialSeeds.push(request.seed);
     return {...sample,seed:request.seed,sixRealms:{dao:2,trialSlot:6,trialHero:217,difficulty:1,rounds:4}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("全随机分支待验证")',20000).catch(async error=>{
     throw Error(`六道试炼回放：${await ui(status+'.textContent')} / ${await ui(reports+'.textContent')}`,{cause:error});
    });
    assert.deepEqual(trialSeeds,[0,1,2,3,7,42]);
    assert.match(await ui(reports+'.textContent'),/试炼式神.*4 回合/);
    await encounter('daily','六道之门试炼关卡 月之海 700036');
    assert.match(await ui(panel+'.textContent'),/原版两阶段战斗.*月之海第二阶段场景.*469104/s);
    await choose('moon-trial');
    mockPve=(plan,request)=>{
     assert.deepEqual(request,{battleMode:921,stageId:700036,groupId:700036,seed:request.seed,damageFloor:true,trialSlot:6});
     return {...sample,seed:request.seed,waveCount:2,wavesCleared:2,
      sixRealms:{dao:1,trialSlot:6,trialHero:219,difficulty:1,rounds:4,phases:[{},{}],phasesCleared:2,montageWaitMs:90040}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("全随机分支待验证")',20000);
    assert.match(await ui(reports+'.textContent'),/首领阶段 2 \/ 2 · 服务端演出等待 90\.04 秒/);
    await encounter('daily','六道之门战斗配置 香行域 700101 113');
    await choose('six-realms');
    const moves='document.querySelector("[data-pve-event-moves]")',difficulty='document.querySelector("[data-pve-event-difficulty]")';
    await ui(moves+'.value="-1";'+moves+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(moves+'.value="12";'+moves+'.dispatchEvent(new Event("input"));'+difficulty+'.value="3"');
    const caps='document.querySelectorAll("[data-pve-life-cap]")',marks='document.querySelectorAll("[data-pve-yinji]")';
    await ui(caps+'[0].closest("details").open=true;'+caps+'[0].value="101";'+caps+'[0].dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(caps+'[0].value="98.75";'+caps+'[0].dispatchEvent(new Event("input"));'+caps+'[1].value="0";'+caps+'[1].dispatchEvent(new Event("input"))');
    assert.equal(await ui(marks+'[5].querySelector("option[value=\'670093\']").textContent.trim()'),'印记·暴风 · 3 级 · 大天狗专属');
    await ui(marks+'[5].value="670093";'+marks+'[5].dispatchEvent(new Event("input"))');
    const skill='document.querySelector("[data-pve-skill-choice]")',level='document.querySelector("[data-pve-skill-level]")';
    const add='document.querySelector("[data-pve-add-skill]")';
    const selectSkill=id=>ui(`${skill}.value="${id}";${skill}.dispatchEvent(new Event("change"))`);
    await selectSkill(650029);
    assert.match(await ui(skill+'.selectedOptions[0].textContent'),/生命加成/);
    await ui(level+'.value="2";'+add+'.click()');
    await selectSkill(650029);
    assert.equal(await ui(add+'.disabled'),true);
    await selectSkill(650027);
    await ui(level+'.value="3";'+add+'.click();document.querySelector("[data-remove-skill=\'650027\']").click()');
    assert.match(await ui('document.querySelector("[data-pve-skill-list]").textContent'),/生命加成 · 2 级/);
    const artifact='document.querySelector("[data-pve-artifact-choice]")',rounds='document.querySelector("[data-pve-artifact-rounds]")';
    const addArtifact='document.querySelector("[data-pve-add-artifact]")';
    await ui(artifact+'.value="660012";'+artifact+'.dispatchEvent(new Event("change"));'+rounds+'.value="0，1";'+rounds+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(addArtifact+'.disabled'),true);
    await ui(rounds+'.value="0";'+rounds+'.dispatchEvent(new Event("input"));'+addArtifact+'.click()');
    const coins='document.querySelector("[data-pve-artifact-coins]")';
    await ui(coins+'.value="1234";'+coins+'.dispatchEvent(new Event("input"))');
    assert.match(await ui('document.querySelector("[data-pve-artifact-list]").textContent'),/乾坤袋 .*最早 0 回合/);
    const guard='document.querySelector("[data-pve-guard-choice]")',guardLevel='document.querySelector("[data-pve-guard-level]")';
    const breakthrough='document.querySelector("[data-pve-guard-breakthrough]")';
    await ui(guard+'.value="2001";'+guard+'.dispatchEvent(new Event("change"))');
    assert.equal(await ui(guard+'.selectedOptions[0].textContent'),'持国天');
    assert.equal(await ui(breakthrough+'.disabled'),true);
    await ui(guardLevel+'.value="30";'+guardLevel+'.dispatchEvent(new Event("change"));'+breakthrough+'.click()');
    assert.equal(await ui(breakthrough+'.checked'),true);
    await ui(guardLevel+'.value="29";'+guardLevel+'.dispatchEvent(new Event("change"))');
    assert.equal(await ui(breakthrough+'.checked'),false);
    await ui(guardLevel+'.value="30";'+guardLevel+'.dispatchEvent(new Event("change"));'+breakthrough+'.click()');
    assert.equal(await ui(start+'.disabled'),false);
    const state={lifeCaps:[98.75,0,100,100,100,100],marks:[0,0,0,0,0,670093],skills:[[650029,2]],
     artifacts:[[660012,1,[0]]],coins:1234,guard:{id:2001,level:30,breakthrough:true}};
    mockPve=(plan,request)=>{
     assert.deepEqual(request,{battleMode:208,stageId:700101,groupId:700101,seed:request.seed,damageFloor:true,trialSlot:6,
      sixRealmsEvent:{id:113,difficulty:3,moves:12},sixRealmsState:state});
     return {...sample,seed:request.seed,sixRealms:{dao:2,trialSlot:6,trialHero:217,difficulty:3,rounds:4,
      eventId:113,moveCount:12,battleType:0,enemyAttributeBonus:.12,
      runState:{opening:state.lifeCaps.map((lifeCap,i)=>({lifeCap,markId:state.marks[i]})),
       guard:{...state.guard,name:'持国天',stage:4,summonSkill:68078,attributes:{critical_pow:.1,debuff_acc:.2},
        baseSkills:[68079],extraSkills:[68070,68071,68073]},
       skills:[{itemId:650029,skillId:66822,level:2,name:'生命加成'}],coins:1234,coinCost:1000,
       artifacts:[{itemId:660012,skillId:67612,name:'乾坤袋',amount:1,level:1,remainingUses:0,
        requests:[{notBeforeRound:0,requestedRound:0,castRound:0,castMs:4600}]}]}}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("全随机分支待验证")',20000);
    assert.match(await ui(reports+'.textContent'),/档位 3 · 前行 12 步 · 敌方属性系数加成 12%/);
    assert.match(await ui(reports+'.textContent'),/开场生命上限 98\.75% \/ 0%.*印记 1 枚 .*途中技能 生命加成 2 级/);
    assert.match(await ui(reports+'.textContent'),/守护 持国天 30 级（已突破） · 暴击伤害 \+10%、效果命中 \+20%/);
    assert.match(await ui(reports+'.textContent'),/秘宝 乾坤袋 · 剩余 0 次 · 第 0 回合施放（4\.60 秒） · 万相铃消耗 1000/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='800017'&&entry.kind==='契灵之境')){
    await encounter('daily','契灵之境 平安京 770005');
    assert.match(await run('exp',{stageId:770005,groupId:770005,battleMode:1031},{hunling:{spiritId:null,regionSkill:77925}}),/已知阵容 exp/);
    await encounter('daily','契灵之境 小黑 800017');
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),
      ['qa-known-hunling','qa-known-hunling-3star']);
    await choose('hunling');
    const choice='document.querySelector("[data-pve-capture-item]")';
    await ui(choice+'.value="777800";'+choice+'.dispatchEvent(new Event("change"))');
    await ui('window.qaCaptureSlot=(i,value)=>{const field=document.querySelectorAll("[data-pve-capture-card]")[i];field.value=value;field.dispatchEvent(new Event("change"));};qaCaptureSlot(0,"2")');
    assert.equal(await ui(start+'.disabled'),true);
    await ui('qaCaptureSlot(0,"4")');
    const captureCalls=[];
    mockPve=(plan,request)=>{
     assert.deepEqual(request,{battleMode:1032,stageId:800017,groupId:800017,seed:request.seed,damageFloor:true,capture:{itemId:777800,cards:[4,2,3]}});
     assert.equal(plan.members.length,5);
     captureCalls.push(request.seed);
     return {...sample,seed:request.seed,hunling:{spiritId:103,weakened:true,weakenSeconds:14.44,
      capture:{itemId:777800,cards:[4,2,3],success:request.seed!==7,baseRate:.7,bonusRate:0}}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("全随机分支待验证")',20000);
    assert.deepEqual(captureCalls,[0,1,2,3,7,42]);
    assert.match(await ui(reports+'.textContent'),/首领已虚弱.*百物式盘.*收服成功.*70\.0%.*收服失败/s);
    assert.match(await ui(panel+'.textContent'),/孽缘/);
   }
   if(cases.some(entry=>entry.table==='hunling_boss'&&entry.key===1)){
    await encounter('daily','契灵集结 镇墓兽 1');
    assert.match(await ui(panel+'.textContent'),/共享生命上限 320,013,345.*最多集结10人.*30分钟/s);
    const qilingTime='document.querySelector("[data-qiling-window]")',qilingHp='document.querySelector("[data-qiling-hp]")';
    await ui(`${qilingTime}.value="1801";${qilingTime}.dispatchEvent(new Event("change"))`);
    assert.equal(await ui(start+'===null'),true);
    await ui(`${qilingTime}.value="37";${qilingTime}.dispatchEvent(new Event("change"));${qilingHp}.value="123456";${qilingHp}.dispatchEvent(new Event("change"))`);
    assert.match(await run('qiling-group',{stageId:1,groupId:810002,battleMode:1041,qilingWindow:{windowSeconds:37,startingHp:123456}},
      {outcome:'loss',wavesCleared:0,qilingCollective:{reason:'window-expired',damage:23456,remainingHp:100000,combatSeconds:37,windowSeconds:37}}),
      /单场最高 23,456.*达到计分时限.*共享生命剩余 100,000/s);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&Number(entry.key)===6140011)){
    await encounter('guild','6140011 狭间暗域');
    assert.match(await ui(panel+'.textContent'),/敌方共享生命按原版满血初始化/);
    const creviceTime='document.querySelector("[data-crevice-window]")';
    await ui(`${creviceTime}.value="181";${creviceTime}.dispatchEvent(new Event("change"))`);
    assert.equal(await ui(start+'===null'),true);
    await ui(`${creviceTime}.value="30";${creviceTime}.dispatchEvent(new Event("change"))`);
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-crevice']);
    assert.match(await run('crevice',{stageId:6140011,groupId:6140011,battleMode:1121,creviceWindow:30},
      {outcome:'loss',wavesCleared:0,guildCrevice:{reason:'window-expired',damage:318000,windowSeconds:30,
       combatSeconds:30,sharedHp:true,enemies:[{position:1,startingHp:205000000,remainingHp:204682000}]}}),
      /单场最高 318,000.*达到计分窗口.*共享生命余量.*204,682,000/s);
   }
   if(cases.some(entry=>entry.table==='SuperGhost_mission'&&Number(entry.key)===59)){
    await encounter('event','超鬼王 毗沙门天');
    assert.match(await ui(panel+'.textContent'),/原版时限 180 秒.*敌方开场 8 火/s);
    const ghostTime='document.querySelector("[data-ghost-window]")',ghostDay='document.querySelector("[data-ghost-day]")';
    const ghostAttack='document.querySelector("[data-ghost-attack]")';
    await ui(`${ghostTime}.value="181";${ghostTime}.dispatchEvent(new Event("change"))`);
    assert.equal(await ui(start+'===null'),true);
    await ui(`${ghostTime}.value="30";${ghostDay}.value="4";${ghostAttack}.value="1";${ghostTime}.dispatchEvent(new Event("change"))`);
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-superghost']);
    assert.match(await run('superghost',{stageId:59,groupId:59,battleMode:3008,ghostSettings:{attackType:1,day:4,windowSeconds:30}},
      {outcome:'loss',wavesCleared:0,superGhost:{reason:'window-expired',damage:826920,windowSeconds:30,
       combatSeconds:30,specialAttack:[{heroId:591,attackAdded:11549.579}],enemies:[{position:1,startingHp:12500000,remainingHp:12361902}]}}),
      /单场最高 826,920.*达到计分窗口.*共享生命余量.*12,361,902.*特攻加成/s);
   }
   if(cases.some(entry=>entry.table==='SuperGhost_bossmission'&&Number(entry.key)===4)){
    await encounter('event','超鬼王历史首领挑战 第四天');
    assert.match(await ui(panel+'.textContent'),/仅计 1 号位首领/);
    assert.equal(await ui('document.querySelector("[data-ghost-attack]")===null'),true);
    const time='document.querySelector("[data-ghost-window]")';
    await ui(`${time}.value="30";${time}.dispatchEvent(new Event("change"))`);
    assert.match(await run('superghost-five',{stageId:4,groupId:4,battleMode:341,historicalGhostWindow:30},
      {outcome:'loss',wavesCleared:0,historicalSuperGhost:{reason:'native-timeout',damage:287209,windowSeconds:30,
       deadlineSeconds:180,combatSeconds:33.34,bossDefeated:false,
       enemies:[{position:1,startingHp:4999999,remainingHp:4712790}]}}),
      /单场最高 287,209.*达到计分窗口.*首领伤害 287,209.*首领仍存活/s);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===73)){
    await encounter('daily','愤怒的石距 地图首领入口 25308');
    const rank='document.querySelector("[data-map-boss-stage]")',players='document.querySelector("[data-map-boss-players]")';
    await ui(`${rank}.value="25308";${rank}.dispatchEvent(new Event("change"));${players}.value="3";${players}.dispatchEvent(new Event("change"))`);
    assert.match(await ui(panel+'.textContent'),/敌方 40 级 · 队长 3 号位 · 队友 1 2、5 号位 · 队友 2 4、6 号位/);
    assert.match(await run('superghost-five',{stageId:25308,groupId:25308,battleMode:3000,mapBossPlayers:3},
      {mapBoss:{kind:'angryStone',players:3,level:50,rewardInputs:{phaseDamageRatio:0.4,paperManCount:3}}}),
      /3 人组队 · 50 级档 · 首领特殊阶段伤害比例 40% · 小纸人 3/);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===7&&entry.kind==='妖气封印')){
    await encounter('daily','妖气封印 鬼使黑 1608');
    await until(panel+'.textContent.includes("式神碎片副本玩法原文")');
    assert.match(await ui(panel+'.textContent'),/妖气封印.*敌方 3 波.*发现规则.*契约书碎片.*WorldBossEngine/s);
    const rank='document.querySelector("[data-map-boss-stage]")';
    assert.equal(await ui(rank+'.options.length'),9);
    await ui(`${rank}.value="1608";${rank}.dispatchEvent(new Event("change"))`);
    assert.match(await run('superghost-five',{stageId:1608,groupId:1608,battleMode:855,mapBossPlayers:2},
      {waveCount:3,wavesCleared:3,formationsVerified:3,mapBoss:{kind:'seal',players:2,level:50}}),
      /通过 3 波.*已核对 3 波原版编组.*2 人组队 · 50 级档/);
    await encounter('battle','1608');
    await until(rank+'?.value==="1608"');
    assert.equal(await ui(rank+'.options.length'),1);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===19&&entry.kind==='现世鬼王')){
    await encounter('daily','现世鬼王 座敷童子 10008');
    const rank='document.querySelector("[data-map-boss-stage]")',party='document.querySelector("[data-map-boss-players]")';
    assert.equal(await ui(rank+'.options.length'),9);
    assert.match(await ui(panel+'.textContent'),/敌方 3 波 · 式神 2、3、4 号位.*LBSBossEngine/s);
    await ui(`${rank}.value="10008";${rank}.dispatchEvent(new Event("change"))`);
    assert.match(await run('story',{stageId:10008,groupId:10008,battleMode:3001,mapBossPlayers:1},
      {waveCount:3,wavesCleared:3,formationsVerified:3,mapBoss:{kind:'lbs',players:1,level:50}},undefined,10,3),
      /通过 3 波.*单人演练 · 50 级档/);
    await ui(`${party}.value="2";${party}.dispatchEvent(new Event("change"))`);
    assert.match(await ui(panel+'.textContent'),/队长 5、6 号位 · 队友 1 2、3、4 号位/);
    assert.match(await run('superghost-five',{stageId:10008,groupId:10008,battleMode:3001,mapBossPlayers:2},
      {waveCount:3,wavesCleared:3,formationsVerified:3,mapBoss:{kind:'lbs',players:2,level:50}}),
      /通过 3 波.*2 人组队 · 50 级档/);
    await ui('qaEncounterInput("daily","地图首领入口 桃花妖 1001")');
    await until(panel+'.textContent.includes("此入口的原版复跑待接入")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===19042&&entry.kind==='现世妖约·策划鼠')){
    await encounter('event','现世妖约 广州塔策划鼠');
    assert.match(await ui(panel+'.textContent'),/原版时限 300 秒 · 阴阳师被动 LBS周年烟花.*2026-09-25.*40.*LBSActivityBossEngine.*101006/s);
    const rank='document.querySelector("[data-map-boss-stage]")';
    assert.equal(await ui(rank+'.options.length'),9);
    await ui(`${rank}.value="200188";${rank}.dispatchEvent(new Event("change"))`);
    const expected={stageId:200188,groupId:200188,battleMode:3022,mapBossPlayers:1};
    const report={kind:'lbsActivity',players:1,level:50,deadlineSeconds:300,passiveSkill:101013,timedOut:false,combatSeconds:113.1};
    assert.match(await run('lbs-rat',expected,{mapBoss:report}),/单人演练 · 50 级档 · 战斗与结算 113\.10 秒 · 原版时限 300 秒/);
    mockPve=(_plan,request)=>{
     assert.deepEqual(request,{...expected,seed:0,damageFloor:true});
     return {...sample,seed:request.seed,outcome:'loss',wavesCleared:0,mapBoss:{...report,timedOut:true,combatSeconds:302.86}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("未通过本次采样")');
    assert.match(await ui(reports+'.textContent'),/达到原版时限 · 战斗与结算 302\.86 秒/);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===19041&&entry.kind==='历史现世妖约')){
    await encounter('event','历史现世妖约 广州长隆');
    assert.equal(await ui('document.querySelector("[data-map-boss-stage]").options.length'),9);
    const rank='document.querySelector("[data-map-boss-stage]")',players='document.querySelector("[data-map-boss-players]")';
    await ui(`${rank}.value="200176";${rank}.dispatchEvent(new Event("change"));
     ${players}.value="3";${players}.dispatchEvent(new Event("change"))`);
    assert.match(await ui(panel+'.textContent'),/敌方 37 级.*原表无固定战斗时限/s);
    assert.match(await run('superghost-five',{stageId:200176,groupId:200176,battleMode:3022,mapBossPlayers:3},
     {waveCount:1,wavesCleared:1,formationsVerified:1,mapBoss:{kind:'lbsHistory',players:3,level:40}}),
     /3 人组队 · 40 级档/);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===19028&&entry.title.includes('肯德基'))){
    await encounter('event','历史现世妖约 肯德基');
    const rank='document.querySelector("[data-map-boss-stage]")';
    assert.match(await ui(panel+'.textContent'),/敌方 10–20 级.*原表无固定战斗时限/s);
    await ui(`${rank}.value="20085";${rank}.dispatchEvent(new Event("change"))`);
    assert.match(await ui(panel+'.textContent'),/敌方 20–40 级/);
    assert.match(await run('superghost-five',{stageId:20085,groupId:20085,battleMode:3022,mapBossPlayers:1},
     {waveCount:1,wavesCleared:1,formationsVerified:1,mapBoss:{kind:'lbsHistory',players:1,level:35}}),
     /单人演练 · 35 级档/);
    await encounter('event','历史现世妖约 融创雪世界');
    assert.match(await ui(panel+'.textContent'),/同活动的银道雪场规则.*融创LBS挑战券.*同活动的滑雪场景/s);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===19015&&entry.kind==='现世年兽')){
    await encounter('event','现世年兽 东北年兽');
    assert.equal(await ui('document.querySelector("[data-map-boss-players]").options.length'),1);
    assert.equal(await ui('document.querySelector("[data-map-boss-stage]").options.length'),9);
    const lineupSlots=[3,4,5,6,2],phases=['step_1','step_2','step_3'];
    assert.match(await run('superghost-five',{stageId:3340141,groupId:3340141,battleMode:534,mapBossPlayers:1},{
     mapBoss:{kind:'lbsNianNormal',players:1,level:10,lineupSlots,phases,personalDamage:382604,remainingHp:0,roomElapsedSeconds:64.6},
    }),/单人演练 · 10 级档 · 个人伤害 382,604 · 剩余生命 0 · 3 个阶段/);
    await encounter('event','专属年兽 3340155');
    assert.match(await ui(panel+'.textContent'),/从首领满血、剩余 600 秒开始/);
    const expected={stageId:3340155,groupId:3340155,battleMode:535,mapBossPlayers:1};
    const mapBoss={kind:'lbsNianSpecial',players:1,level:6,lineupSlots,phases,raidWindowSeconds:600,
     personalDamage:27096970,remainingHp:14841266,roomElapsedSeconds:600};
    await run('superghost-five',expected,{mapBoss});
    mockPve=(_plan,request)=>{
     assert.deepEqual(request,{...expected,seed:0,damageFloor:true});
     return {...sample,seed:request.seed,outcome:'loss',wavesCleared:0,mapBoss:{...mapBoss,timedOut:true}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("未通过本次采样")');
    assert.match(await ui(reports+'.textContent'),/原版判定超时 · 单人演练 · 第 6 档 · 房间时限 600 秒/);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===19033&&entry.kind==='宴席大赛')){
    await encounter('event','宴席大赛 来伊份鬼王');
    assert.match(await ui(panel+'.textContent'),/食灵满意度达到 100% 时获胜/);
    assert.match(await ui(panel+'.textContent'),/联动门店.*来伊份/s);
    assert.equal(await ui('document.querySelector("[data-map-boss-players]").options.length'),1);
    assert.equal(await ui('document.querySelector("[data-map-boss-stage]").options.length'),9);
    const mapBoss={kind:'meituan',players:1,level:10,targetHp:159426,completionHp:159426,
     personalSatisfaction:159425,combatSeconds:63.4};
    const expected={stageId:20140,groupId:20140,battleMode:880,mapBossPlayers:1};
    assert.match(await run('superghost-five',expected,{mapBoss}),/食灵满意度 100% · 本队贡献 159,425/);
    mockPve=(_plan,request)=>{
     assert.deepEqual(request,{...expected,seed:0,damageFloor:true});
     return {...sample,seed:request.seed,outcome:'loss',wavesCleared:0,mapBoss:{...mapBoss,completionHp:159425,personalSatisfaction:159424}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("未通过本次采样")');
    assert.match(await ui(reports+'.textContent'),/食灵满意度 99\.99% · 本队贡献 159,424/);
   }
   if(cases.some(entry=>entry.table==='activity'&&entry.key===13005&&entry.kind==='寝肥合战')){
    await encounter('guild','2026崽战-寝肥合战');
    assert.match(await ui(panel+'.textContent'),/一堆食材 · 无额外祝福/);
    assert.equal(await ui('document.querySelector("[data-map-boss-stage]").options.length'),24);
    assert.equal(await ui('document.querySelector("[data-map-boss-players]").options.length'),3);
    await ui(`(()=>{const participants=document.querySelector('[data-map-boss-players]');
      participants.value='3';participants.dispatchEvent(new Event('change'));
      const stage=document.querySelector('[data-map-boss-stage]');
      stage.value='26319';stage.dispatchEvent(new Event('change'));})()`);
    assert.match(await ui(panel+'.textContent'),/队长 3 号位 · 队友 1 2、5 号位 · 队友 2 4、6 号位/);
    const mapBoss={kind:'qinfeiFood',players:3,level:4,totalPiles:1,clearedPiles:1};
    const expected={stageId:26319,groupId:26319,battleMode:321,mapBossPlayers:3};
    assert.match(await run('superghost-five',expected,{mapBoss}),/3 人组队 · 普通第 4 层 · 食材堆 1\/1/);
    await ui(`(()=>{const count=document.querySelector('[data-qinfei-food-count]');
      count.value='3';count.dispatchEvent(new Event('change'));
      const next=[...document.querySelectorAll('[data-qinfei-food-next]')];
      next[0].value='26303';next[0].dispatchEvent(new Event('change',{bubbles:true}));
      next[1].value='26307';next[1].dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await ui('document.querySelector("[data-qinfei-food-next]").options.length'),6);
    assert.match(await run('superghost-five',{...expected,qinfeiFoodPiles:[26303,26307]},
      {waveCount:3,wavesCleared:3,mapBoss:{...mapBoss,totalPiles:3,clearedPiles:3}}),/食材堆 3\/3/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='6902022'&&entry.kind==='旧版寝肥食材战')){
    await encounter('guild','旧版寝肥 6902022');
    const mapBoss={kind:'qinfeiFood',players:1,level:0,archived:true,totalPiles:1,clearedPiles:1};
    const expected={stageId:6902022,groupId:6902022,battleMode:321,mapBossPlayers:1};
    assert.match(await run('superghost-five',expected,{mapBoss}),/旧版食材战 · 食材堆 1\/1/);
   }
   if(cases.some(entry=>entry.table==='raid_info'&&entry.kind==='寝肥本体')){
    await encounter('guild','寝肥本体 2026');
    const windowField='document.querySelector("[data-qinfei-boss-window]")';
    assert.equal(await ui(windowField+'.max'),'1200');
    await ui(windowField+'.value="60";'+windowField+'.dispatchEvent(new Event("change"))');
    const qinfeiBoss={raidId:5,difficulty:1,windowSeconds:60};
    const expected={stageId:25005,groupId:25005,battleMode:320,qinfeiBoss};
    const score={...qinfeiBoss,damage:1335888,combatSeconds:60,reason:'window-expired',remainingHp:107498584112};
    assert.match(await run('qinfei-boss',expected,{outcome:'loss',wavesCleared:0,qinfeiBoss:score},tactical),
      /达到计分窗口 · 本队伤害 1,335,888 · 作战 60\.00 \/ 60 秒/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='26325')){
    await encounter('guild','入场券战斗 26325');
    assert.match(await ui(panel+'.textContent'),/原表编组演练 · 原表 3 波/);
    assert.match(await run('superghost-five',{stageId:26325,groupId:26325,battleMode:3},
      {waveCount:3,wavesCleared:3,qinfeiSide:{timedOut:false,deadlineSeconds:null,combatSeconds:38.84}}),
      /原表编组演练 · 战斗与结算 38\.84 秒/);
    await encounter('guild','寝肥筹备副本 501200');
    assert.match(await ui(panel+'.textContent'),/原表编组演练 · 原表时限 180 秒/);
    assert.match(await run('superghost-five',{stageId:501200,groupId:501200,battleMode:3,pveDeadlineSeconds:180},
      {qinfeiSide:{timedOut:false,deadlineSeconds:180,combatSeconds:17}}),/原表时限 180 秒/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='5114001')){
    await encounter('event','5114001');
    assert.match(await ui(panel+'.textContent'),/普通战斗 · 60 秒 · 体力 6 · 自动战斗饱食度 3/);
    const dojoArea={year:2025,playId:10001,blockType:1,regionState:0};
    assert.match(await run('superghost-five',{stageId:5114001,groupId:5114001,battleMode:2182,dojoArea},
      {waveCount:1,wavesCleared:0,dojoArea:{...dojoArea,timedOut:true,damage:2721280,deadlineSeconds:60,combatSeconds:61}}),
      /达到计分时限 · 本队伤害 2,721,280/);
    await encounter('event','2026 八百八狸 地格 275');
    assert.match(await ui(panel+'.textContent'),/传送门 · 60 秒/);
    const region='document.querySelector("[data-dojo-area-region]")';
    await ui(region+'.value="3";'+region+'.dispatchEvent(new Event("change"))');
    const portal={year:2026,playId:60002,blockType:6,regionState:3};
    assert.match(await run('superghost-five',{stageId:5124039,groupId:5124039,battleMode:2182,dojoArea:portal},
      {waveCount:1,wavesCleared:0,dojoArea:{...portal,timedOut:true,damage:500,deadlineSeconds:60,combatSeconds:62}}),
      /本队伤害 500/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='468300')){
    await encounter('battle','468300');
    assert.match(await ui(panel+'.textContent'),/原表时限 120 秒/);
    assert.match(await run('superghost-five',{stageId:468300,groupId:468300,pveDeadlineSeconds:120},
      {waveCount:1,wavesCleared:1,pveDeadline:{timedOut:false,deadlineSeconds:120,combatSeconds:19}}),/原表时限 120 秒/);
   }
   if(cases.some(entry=>entry.table==='guild_fake_god_event'&&entry.key===1018&&entry.kind==='青森之秘事件')){
    await encounter('guild','青森之秘 普通怪 小怪18 1018');
    assert.match(await ui(panel+'.textContent'),/普通怪 · 崇山 1 级 · 体力 6 · 敌方满血 · 单队计分/);
    assert.match(await ui(panel+'.textContent'),/三种地形及特攻效果/);
    const forest={eventId:1018,encounterType:1,terrainSkill:61155,terrainLevel:1,sceneId:42135};
    assert.match(await run('superghost-five',{stageId:500327,groupId:500327,battleMode:813,forest},
      {outcome:'loss',waveCount:1,wavesCleared:0,guildForest:{timedOut:true,damage:8988588,combatSeconds:183.12}}),
      /达到原版时限 · 个人伤害 8,988,588/);
    await ui('qaEncounterInput("guild","青森之秘 地图 6 地格 48")');
    await until(panel+'.textContent.includes("地格事件")');
    await ui(`(()=>{const ref=[...document.querySelectorAll('#client-dungeons-encounter-detail .encounter-source')]
     .find(node=>node.querySelector('h4')?.textContent.includes('地格事件'));
     [...ref.querySelectorAll('button')].find(button=>button.textContent==='查看关联关卡').click();})()`);
    await until(start+'!==null');
    assert.match(await ui(panel+'.textContent'),/青森之秘 · 事件 2548/);
   }
   if(cases.some(entry=>entry.table==='devil_feast_event6'&&entry.key===1)){
    await encounter('event','鬼王之宴 大妖考验 450231');
    assert.match(await ui(panel+'.textContent'),/每次限时 120 秒/);
    await ui(`(()=>{const hp=document.querySelector('[data-devil-feast-hp]');hp.value='939904.4000000003';
     hp.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.match(await run('superghost-five',{stageId:450231,groupId:450231,battleMode:445,devilFeastHp:939904.4000000003},
      {devilFeast:{kind:'boss',timedOut:false,deadlineSeconds:120,combatSeconds:58.12,enemies:[{remainingHp:0}]}}),
      /已清场 · 战斗与结算 58.12 \/ 120 秒 · 首领剩余生命 0/);
    await ui('qaEncounterInput("event","鬼王之宴 涤荡妖气 事件 1")');
    await until(panel+'.textContent.includes("离线复跑待接入")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='462176'&&entry.kind==='鬼王来袭')){
    await encounter('event','百妖退治 鬼王来袭 462176');
    assert.match(await ui(panel+'.textContent'),/每次限时 120 秒.*神谕之时祝福规则.*鬼宴之宾阵营规则/s);
    await choose('superghost-five');
    assert.equal(await ui('document.querySelectorAll("[data-pve-tower-blessing-row]:not([hidden])").length'),1);
    await ui(`(()=>{
     document.querySelector('[data-pve-tower-conditions]').open=true;
     const choices=[...document.querySelectorAll('[data-pve-tower-choice]')];
     for(const select of choices.slice(0,2)){select.value='1';select.dispatchEvent(new Event('change'));}
    })()`);
    assert.equal(await ui('document.querySelectorAll("[data-pve-tower-blessing-row]:not([hidden])").length'),3);
    assert.equal(await ui(start+'.disabled'),true);
    assert.match(await ui(panel+'.textContent'),/每种祝福只能启用一次/);
    await ui(`(()=>{
     const choice=document.querySelectorAll('[data-pve-tower-choice]')[1];
     choice.value='';choice.dispatchEvent(new Event('change'));
     const level=document.querySelector('[data-pve-tower-level]');level.value='3';level.dispatchEvent(new Event('input'));
     document.querySelector('[data-pve-tower-faction][value="1101"]').click();
    })()`);
    const towerSettings={blessings:[[1,3]],factions:[1101]};
    const boss={stageId:462176,groupId:462176,battleMode:502};
    const report={kind:'boss',settings:towerSettings,deadlineSeconds:120,combatSeconds:123,timedOut:true,
     enemies:[{position:1,remainingHp:26999.35682999},{position:2,remainingHp:0}]};
    mockPve=(_plan,request)=>{
     assert.deepEqual(request,{...boss,towerSettings,seed:0,damageFloor:true});
     return {...sample,...request,outcome:'loss',wavesCleared:0,ghostKingTower:report};
    };
    await ui(start+'.click()');
    await until(reports+'.textContent.includes("达到原版时限")&&'+status+'.textContent.includes("未通过本次采样")');
    await ui(reports+'.closest("details").open=true;'+reports+'.querySelector("[data-tower-carry]").click()');
    assert.deepEqual(await ui('[...document.querySelectorAll("[data-pve-tower-hp]")].map(input=>input.valueAsNumber)'),
     [26999.35682999,0,0,0,0,0]);
    assert.equal(await ui('document.activeElement.matches("[data-pve-tower-hp]")'),true);
    win.setContentSize(720,960);
    assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);
    await capture('client-ghost-king-tower-carry');
    win.setContentSize(1440,1000);
    const carry={...towerSettings,enemyHp:[26999.35682999,0,0,0,0,0]};
    assert.match(await run('superghost-five',{...boss,towerSettings:carry},
     {ghostKingTower:{...report,settings:carry,timedOut:false,combatSeconds:12.6,enemies:[{position:1,remainingHp:0}]}}),
     /已清场 · 战斗与结算 12\.60 秒 · 时限 120 秒 · 祝福 1 种 · 解锁阵营 1 个/);
    await encounter('event','百妖退治 妖灵退治单体战 463001');
    assert.equal(await ui('document.querySelector("[data-pve-tower-continue]")'),null);
    assert.match(await ui(panel+'.textContent'),/敌方编组 · 463001/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='462021'&&entry.kind==='姥姥火挑战')){
    await encounter('event','鬼王之宴 姥姥火来袭 冥火姥姥 困难 462021');
    assert.match(await ui(panel+'.textContent'),/敌方 3 波 · 客户端默认时限 180 秒.*不同关卡回目数不同/s);
    await choose('superghost-five');
    const faith='document.querySelector("[data-pve-laolao-faith]")';
    await ui(faith+'.value="-1";'+faith+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(faith+'.getAttribute("aria-invalid")'),'true');
    await ui(`(()=>{
     const faith=${faith};faith.value='150';faith.dispatchEvent(new Event('input'));
     document.querySelector('[data-pve-laolao-faction][value="1101"]').click();
     document.querySelector('[data-pve-laolao-faction][value="1103"]').click();
    })()`);
    assert.match(await ui(panel+'.textContent'),/初始速度提高100/);
    const laolaoSettings={faith:150,factions:[1101,1103]};
    assert.match(await run('superghost-five',{stageId:462021,groupId:462021,battleMode:503,laolaoSettings},
     {waveCount:3,wavesCleared:3,laolaoChallenge:{settings:laolaoSettings,timedOut:false,deadlineSeconds:180,combatSeconds:43.24}}),
     /已清场 · 通过 3 \/ 3 波 · 战斗与结算 43\.24 秒 · 时限 180 秒 · 信仰之佑 150 层/);
    win.setContentSize(720,960);
    assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);
    await ui(faith+'.scrollIntoView({block:"center",behavior:"instant"})');
    await capture('client-laolao-challenge');
    win.setContentSize(1440,1000);
    await encounter('event','鬼王之宴 姥姥火·合魂 460000');
    await until(panel+'.textContent.includes("合魂集结规则")');
    const fusionWindow='document.querySelector("[data-pve-fusion-window]")';
    const fusionGroup='document.querySelector("[data-pve-fusion-group]")';
    assert.equal(await ui(fusionWindow+'.max'),'1200');
    assert.equal(await ui(fusionGroup+'.querySelector(\'option[value="2"]\').textContent'),'三姥姥');
    await choose('superghost-five');
    await ui(fusionWindow+'.value="1201";'+fusionWindow+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(`(()=>{
     const update=(input,value)=>{input.value=value;input.dispatchEvent(new Event('input'));};
     update(${fusionWindow},240);
     update(document.querySelector('[data-pve-laolao-faith]'),150);
     for(const input of document.querySelectorAll('[data-pve-fusion-hp]'))update(input,26);
    })()`);
    assert.match(await ui(panel+'.textContent'),/开场总余血 26% · 从单首领阶段开始/);
    const fusionSettings={group:1,windowSeconds:240,sharedHpPercent:[26,26,26,26],faith:150,factions:[]};
    const fusionResponse={settings:fusionSettings,reason:'bosses-defeated',damage:9144667,combatSeconds:146.78,sharedHp:[0,0,0,0],
     transition:{seconds:14},phases:[{phase:1,seconds:0,opening:[{}]},{phase:2,seconds:46.64,opening:[{},{},{}]}]};
    const fusionReport=await run('superghost-five',{stageId:460000,groupId:460000,battleMode:3016,fusionSettings},
     {laolaoFusion:fusionResponse,engineSeconds:157.88});
    assert.match(fusionReport,/本队伤害 9,144,667 · 战斗与结算 146\.78 秒 · 计分时长 240 秒/);
    assert.match(fusionReport,/合魂阶段 · 46\.64 秒进场 · 原版生成 3 位首领.*14\.00 秒达到 25% 转阶段阈值/s);
    win.setContentSize(720,960);
    assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);
    await ui(fusionWindow+'.scrollIntoView({block:"center",behavior:"instant"})');
    await capture('client-laolao-fusion');
    win.setContentSize(1440,1000);
   }
   if(catalog.entries.has('event4')){
    await encounter('daily','逢魔实战 稀有·夜荒魂');
    await ui(`(()=>{
     const set=(selector,value)=>{const input=document.querySelector(selector);input.value=value;input.dispatchEvent(new Event('input'));};
     set('[data-pve-dusk-window]',17);
     set('[data-pve-dusk-music]','6，5，4，3，2');
    })()`);
    const duskSettings={windowSeconds:17,musicOrder:[6,5,4,3,2]};
    const duskWraith={settings:duskSettings,reason:'window-expired',damage:289754,combatSeconds:17,maximumHp:9421012,
     bossHp:9131258,eliteDefeatOrder:[],phases:[{phase:1,seconds:0,bossHp:9421012}]};
    const details=await run('dusk-wraith',{stageId:25021,groupId:25021,battleMode:3017,duskSettings},
     {outcome:'loss',wavesCleared:0,duskWraith});
    assert.match(details,/达到计分时限 · 本队伤害 289,754 · 作战 17\.00 \/ 17 秒/);
    assert.match(details,/初始形态 · 0\.00 秒进场 · 首领余血 100%/);
    await encounter('daily','逢魔实战 稀有·鬼灵歌伎');
    const windowField='document.querySelector("[data-pve-song-window]")';
    await choose('songstress');
    await ui(windowField+'.value="1201";'+windowField+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(windowField+'.getAttribute("aria-invalid")'),'true');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(windowField+'.value="600";'+windowField+'.dispatchEvent(new Event("input"))');
    const songstress={windowSeconds:600,reason:'singer-rescued',damage:44497047,combatSeconds:503.32,singerMaximum:19721319,
     singerHp:6095047,umbrellaHp:0,whiteMaidsDefeated:21,punishments:2,remainingMaidsAtRescue:0,
     phases:[{phase:1,seconds:0,singerHp:19721319},{phase:2,seconds:282.52,singerHp:13523815},
      {phase:3,seconds:406.1,singerHp:6398134}]};
    const songReport=await run('songstress',{stageId:25016,groupId:25016,battleMode:3015,songWindowSeconds:600},
     {songstress},tactical,10,6);
    assert.match(songReport,/已救出歌伎 · 本队伤害 44,497,047.*黑衣侍女 · 282\.52 秒进场/s);
    assert.match(songReport,/余血惩罚 2 次 · 救援时尚存黑衣侍女 0 位.*持伞人剩余生命 0/s);
    await encounter('daily','逢魔实战 稀有·蜃气楼');
    await choose('mirage');
    const positions='[...document.querySelectorAll("[data-pve-mirage-position]")]';
    await ui(`(()=>{const second=${positions}[1];second.value='2';second.dispatchEvent(new Event('change'));})()`);
    assert.equal(await ui(start+'.disabled'),true);
    assert.deepEqual(await ui(positions+'.map(el=>el.getAttribute("aria-invalid"))'),['true','true']);
    await ui(`(()=>{
     for(const [input,value] of [...${positions},document.querySelector('[data-pve-mirage-general]')].map((input,i)=>[input,[5,6,0][i]])){
      input.value=value;input.dispatchEvent(new Event(input instanceof HTMLSelectElement?'change':'input'));
     }
    })()`);
    const mirageSettings={windowSeconds:600,generalSeconds:0,truePositions:[5,6]};
    const mirage={settings:mirageSettings,reason:'boss-defeated',damage:12938001,combatSeconds:223.86,maximumHp:7913650,bossHp:0,burstSeconds:80,
     phases:[{phase:'normal',seconds:0,bossHp:7913650},{phase:'mirror',seconds:58.24,bossHp:7077053,
      opening:[{id:ids[3],position:5,trueMirror:true},{id:ids[4],position:6,trueMirror:true}]},
      {phase:'burst',seconds:89.88,bossHp:7077053}]};
    const mirageReport=await run('mirage',{stageId:25015,groupId:25015,battleMode:3013,mirageSettings},{mirage},tactical);
    assert.match(mirageReport,/击败蜃气楼 · 本队伤害 12,938,001.*海市蜃楼 · 58\.24 秒进场.*5 号位 .*（真镜像）.*6 号位 .*（真镜像）.*原表虚弱时长 80 秒/s);
    await encounter('daily','逢魔实战 极·蜃气楼');
    await choose('mirage-x');
    const mirageWeekly='document.querySelector("[data-pve-mirage-weekly]")';
    await ui(mirageWeekly+'.value="0";'+mirageWeekly+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(mirageWeekly+'.getAttribute("aria-invalid")'),'true');
    await ui(`for(const [field,value,event] of [['weekly',1200,'input'],['trait',63601,'change'],['general',0,'input']]){
     const input=document.querySelector('[data-pve-mirage-'+field+']');input.value=value;input.dispatchEvent(new Event(event));
    }`);
    await ui(`for(const [i,input] of ${positions}.entries()){input.value=5+i;input.dispatchEvent(new Event('change'));}`);
    const mirageXSettings={windowSeconds:1200,generalSeconds:0,truePositions:[5,6],trait:63601,weeklySeconds:1200};
    const mirageExtreme={...mirage,settings:mirageXSettings,
     falseMirrorDeaths:[{position:3,seconds:70.25,buffedPositions:[5,6]}],
     mistChanges:[{seconds:23.14,active:true},{seconds:24.5,active:false}]};
    const mirageXReport=await run('mirage-x',{stageId:25019,groupId:25019,battleMode:1024,mirageSettings:mirageXSettings},
     {mirage:mirageExtreme},tactical);
    assert.match(mirageXReport,/击败极·蜃气楼.*异变·易碎.*误杀假镜像 1 次.*3 号位假镜像倒下.*获得攻击与暴击抵抗 5、6 号位.*蜃雾护盾 · 观测到开启 1 次/s);
    await encounter('daily','逢魔实战 稀有·地震鲶');
    await choose('catfish');
    const breaks='document.querySelector("[data-pve-catfish-breaks]")';
    await ui(breaks+'.value="1";'+breaks+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(breaks+'.getAttribute("aria-invalid")'),'true');
    await ui(`(()=>{
     const values={breaks:0,players:1,armor:4};
     for(const [name,value] of Object.entries(values)){
      const field=document.querySelector('[data-pve-catfish-'+name+']');field.value=value;field.dispatchEvent(new Event('input'));
     }
    })()`);
    const catfishSettings={windowSeconds:600,armorStacks:4,otherPlayers:1,otherBreaks:0};
    const catfish={settings:catfishSettings,reason:'boss-defeated',damage:7938661,combatSeconds:352.38,maximumHp:7122285,
     bossHp:0,blessing:512,activeBlessing:512,monkeyBonus:.25,papersDefeated:5,gate:{limitSeconds:120,startedAt:295.12,brokenAt:320.3,breakRate:.5,skill:506},
     phases:[{phase:'opening',seconds:0,bossHp:7122285},{phase:'boom',seconds:332.06,bossHp:909951}]};
    const catfishReport=await run('catfish',{stageId:25004,groupId:25004,battleMode:3014,catfishSettings},{catfish},tactical);
    assert.match(catfishReport,/击败地震鲶 · 本队伤害 7,938,661.*冲天成功 · 332\.06 秒进场/s);
    assert.match(catfishReport,/开场减伤 4 层 · 祝福 暴击增益 ·\s*小猴伤害增益 25%.*总击破率 50%/s);
    await encounter('daily','逢魔实战 极·地震鲶');
    await choose('catfish-x');
    const catfishArmor='document.querySelector("[data-pve-catfish-armor]")';
    await ui(catfishArmor+'.value="11";'+catfishArmor+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(catfishArmor+'.getAttribute("aria-invalid")'),'true');
    await ui(`for(const [field,value,event] of [['armor',1,'input'],['weekly',1200,'input'],['trait',63603,'change']]){
     const input=document.querySelector('[data-pve-catfish-'+field+']');input.value=value;input.dispatchEvent(new Event(event));
    }`);
    const catfishXSettings={windowSeconds:1200,armorStacks:1,otherPlayers:0,otherBreaks:0,trait:63603,weeklySeconds:1200};
    const catfishExtreme={...catfish,settings:catfishXSettings,armorChanges:[{seconds:0,layers:1},{seconds:290.56,layers:0}]};
    const catfishXReport=await run('catfish-x',{stageId:45004,groupId:45004,battleMode:4442,catfishSettings:catfishXSettings},
     {catfish:catfishExtreme},tactical);
    assert.match(catfishXReport,/击败极·地震鲶.*开场皮糙肉厚 1 层.*异变·斗魂.*皮糙肉厚剩余 0 层.*290\.56 秒 · 皮糙肉厚降至 0 层/s);
    await encounter('daily','逢魔实战 稀有·荒骷髅');
    await choose('skeleton');
    const retainers='[...document.querySelectorAll("[data-pve-skeleton-position]")]';
    const changeRetainer=value=>ui(`(()=>{const select=${retainers}[1];select.value='${value}';select.dispatchEvent(new Event('change'));})()`);
    await changeRetainer(2);
    assert.equal(await ui(start+'.disabled'),true);
    assert.deepEqual(await ui(retainers+'.map(el=>el.getAttribute("aria-invalid"))'),['true','true']);
    await changeRetainer(7);
    const skeletonSettings={windowSeconds:600,truePositions:[2,7]};
    const skeleton={settings:skeletonSettings,reason:'boss-defeated',damage:5566778,combatSeconds:182.72,maximumHp:4522085,
     bossHp:0,papersDefeated:4,votes:[{position:4,wrong:true},{position:2,wrong:false},{position:7,wrong:false}],punishments:[81.12],
     phases:[{phase:'normal',seconds:0,bossHp:4522085,opening:[]},{phase:'elite',seconds:69.5,bossHp:2240000,
      opening:[{position:4,clue:'测试线索'}]},{phase:'late',seconds:128.36,bossHp:1200000,opening:[]}]};
    const skeletonReport=await run('skeleton',{stageId:25003,groupId:25003,battleMode:3012,skeletonSettings},{skeleton},tactical);
    assert.match(skeletonReport,/击败荒骷髅 · 本队伤害 5,566,778.*真假部下 · 69\.50 秒进场.*4 号位线索 · 测试线索/s);
    assert.match(skeletonReport,/4 号位（假）、2 号位（真）、7 号位（真）.*实际触发惩罚 1 次/s);
    await encounter('daily','逢魔实战 极·荒骷髅');
    await choose('skeleton-x');
    const weekly='document.querySelector("[data-pve-skeleton-weekly]")';
    const setWeekly=value=>ui(`(()=>{const input=${weekly};input.value='${value}';input.dispatchEvent(new Event('input'));})()`);
    await setWeekly(0);
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(weekly+'.getAttribute("aria-invalid")'),'true');
    await setWeekly(1200);
    await changeRetainer(7);
    await ui(`for(const [field,value] of [['trait','63601'],['paper','3']]){
     const select=document.querySelector('[data-pve-skeleton-'+field+']');
     select.value=value;select.dispatchEvent(new Event('change'));
    }`);
    const skeletonXSettings={windowSeconds:1200,truePositions:[2,7],weeklySeconds:1200,trait:63601,paperTier:3};
    const skeletonX={...skeleton,settings:skeletonXSettings,poisonRetaliations:[81.12],papersDefeated:2};
    const skeletonXReport=await run('skeleton-x',{stageId:25018,groupId:25018,battleMode:4441,skeletonXSettings},{skeletonX},tactical);
    assert.match(skeletonXReport,/击败极·荒骷髅.*异变·易碎.*平均用时 1200 秒 · 纸人 3 档 ·\s*毒雾反击 1 次/s);
    await encounter('daily','逢魔实战 稀有·胧车');
    await choose('longche');
    const repair='document.querySelector("[data-pve-longche-repair]")';
    assert.equal(await ui(`${repair}.focus();document.activeElement===${repair}&&${repair}.tabIndex===0`),true);
    const setRepair=value=>ui(`(()=>{const input=${repair};input.value='${value}';input.dispatchEvent(new Event('input'));})()`);
    await setRepair(0);
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(repair+'.getAttribute("aria-invalid")'),'true');
    assert.match(await ui(`document.getElementById(${repair}.getAttribute('aria-describedby')).textContent`),/修理时限须为 1 至 150 秒/);
    await setRepair(45);
    await ui(`(()=>{const input=document.querySelector('[data-pve-longche-commander]');
      input.value='151';input.dispatchEvent(new Event('change'));})()`);
    const longcheSettings={windowSeconds:1200,repairSeconds:45,commanderId:151};
    const longche={settings:longcheSettings,reason:'boss-defeated',damage:7895200,combatSeconds:400.1,maximumHp:4200000,
     bossHp:0,papersDefeated:2,groundPapersDefeated:1,clues:[{}],commanderKills:[125,265],groundWaves:[{},{}],
     phases:[{phase:'slime',seconds:0,bossHp:4200000},{phase:'flee',seconds:71.42,bossHp:3359999},
      {phase:'repair',seconds:143.34,bossHp:2450000}],
     repairs:[{seconds:179.28,interrupted:true,timeout:false,remaining:[0,.09],healed:0},
      {seconds:345.5,interrupted:false,timeout:true,remaining:[.91,.97],healed:504000}]};
    const longcheReport=await run('longche',{stageId:25002,groupId:25002,battleMode:3006,longcheSettings},{longche},tactical);
    assert.match(longcheReport,/击败胧车 · 本队伤害 7,895,200.*胧车升空 · 71\.42 秒进场.*大天狗呱.*打断修理.*修理超时.*胧车恢复 504,000 生命/s);
    await encounter('daily','逢魔实战 极·胧车');
    await choose('longche-x');
    const repairOrder='[...document.querySelectorAll("[data-pve-longche-order]")]';
    const setOrder=(index,value)=>ui(`(()=>{const select=${repairOrder}[${index}];select.value=${value};select.dispatchEvent(new Event('change'));})()`);
    await setOrder(0,103);
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(repairOrder+'[0].getAttribute("aria-invalid")'),'true');
    await setOrder(1,101);
    await ui(`for(const [field,value,event] of [['weekly',1200,'input'],['trait',63603,'change']]){
     const input=document.querySelector('[data-pve-longche-'+field+']');input.value=value;input.dispatchEvent(new Event(event));
    }`);
    const longcheXSettings={windowSeconds:1200,repairSeconds:30,commanderId:99159,weeklySeconds:1200,trait:63603,repairOrder:[103,101,102,104]};
    const longcheExtreme={...longche,settings:longcheXSettings,retributions:[201.9],
     phases:[...longche.phases,{phase:'repair_success',seconds:203.3,bossHp:1200000}],
     repairs:[{seconds:200,interrupted:false,timeout:true,remaining:[0,.22,.05,.23],healed:504000,
      deaths:[{id:103,seconds:194,partnerHpRate:.36}],absorptionBuffs:[418]}]};
    const longcheXReport=await run('longche-x',{stageId:25027,groupId:25027,battleMode:4443,longcheSettings:longcheXSettings},
     {longche:longcheExtreme},tactical);
    assert.match(longcheXReport,/击败极·胧车.*金辉赐福.*异变·斗魂.*修理超时.*吸收后的强化 · 防御增加.*哐呱（红精英）倒下时同色余血 36%/s);
    await encounter('daily','逢魔实战 极·土蜘蛛');
    await choose('spider');
    const spiderWindow='document.querySelector("[data-pve-spider-live-window]")';
    const setSpiderWindow=value=>ui(`(()=>{const input=${spiderWindow};input.value='${value}';input.dispatchEvent(new Event('input'));})()`);
    await setSpiderWindow(0);
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(spiderWindow+'.getAttribute("aria-invalid")'),'true');
    assert.match(await ui(`document.getElementById(${spiderWindow}.getAttribute('aria-describedby')).textContent`),/计分时长须为 1 至 3600 秒/);
    await setSpiderWindow(1000);
    await ui(`(()=>{const input=document.querySelector('[data-pve-spider-live-trait]');
     input.value='63601';input.dispatchEvent(new Event('change'));})()`);
    const spiderLiveSettings={windowSeconds:1000,trait:63601};
    const spiderLive={settings:spiderLiveSettings,reason:'boss-defeated',damage:25000000,combatSeconds:721.34,
     parts:Array.from({length:4},()=>({hp:0,maximumHp:2000000})),cocoonSeconds:60,
     cocoons:{startedAt:145.02,announcedResult:'expired',defeated:1,recovery:[{position:3,amount:408110}]},
     papersDefeated:2,goldDefeated:1};
    const spiderLiveReport=await run('spider',{stageId:25017,groupId:25017,battleMode:4440,spiderLiveSettings},{spiderLive},tactical);
    assert.match(spiderLiveReport,/击败极·土蜘蛛 · 本队伤害 25,000,000.*异变·易碎.*本体 · 已击破.*白茧 145\.02 秒出现.*击破 1 \/ 3.*白茧超时.*背 \+408,110/s);
    assert.match(await ui('document.querySelector("[data-score-tactics]").textContent'),/普攻钳.*红标钳/);
    await encounter('daily','逢魔实战 稀有·土蜘蛛');
    await choose('spider-normal');
    const normalWeak='document.querySelector("[data-pve-spider-normal-weak]")';
    assert.equal(await ui(`${normalWeak}.focus();document.activeElement===${normalWeak}&&${normalWeak}.tabIndex===0`),true);
    await ui(`${normalWeak}.value='4';${normalWeak}.dispatchEvent(new Event('change'))`);
    const spiderNormalSettings={windowSeconds:3600,weakPart:4};
    const spiderNormal={settings:spiderNormalSettings,reason:'boss-defeated',damage:7411074,combatSeconds:193.72,
     damageRating:5,weakPart:4,weakPartVerified:true,parts:[182.58,67.14,83.33,56].map(brokenAt=>({brokenAt,hp:0,maximumHp:1700000})),
     summonLimit:5,summonWaves:[{seconds:58.02,units:[{id:85},{id:85},{id:86}]}],papersDefeated:1,goldDefeated:0};
    const spiderNormalReport=await run('spider-normal',{stageId:25001,groupId:25001,battleMode:3003,spiderNormalSettings},
     {spiderNormal},tactical);
    assert.match(spiderNormalReport,/击败稀有·土蜘蛛 · 本队伤害 7,411,074.*本场弱点 脚.*伤害评级 5 档.*脚 · 56\.00 秒击破.*58\.02 秒出现 · 小蜘蛛 × 2、秘宝小纸人 × 1/s);
   }
   if(cases.some(entry=>entry.table==='fengmo_band_together_battle'&&entry.key===1)){
    await encounter('event','逢魔乐队 胧车共斗首领');
    assert.match(await ui(panel+'.textContent'),/第一段音游窗口/);
    const scores='[...document.querySelectorAll("[data-band-score]")]';
    await ui(`(()=>{const [input]=${scores};input.value="-1";input.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    assert.equal(await ui(start+'===null'),true);
    await ui(`(()=>{const [first,second]=${scores};first.value="1000";second.value="3000";second.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    assert.match(await run('superghost-five',{stageId:510003,groupId:510003,battleMode:5001,bandScores:[1000,3000]},
      {waveCount:2,wavesCleared:0,outcome:'loss',fengmoBandTogether:{timedOut:true,damage:26706397,phases:[
       {damage:13845698,priorDamage:0,beforeRhythmSeconds:469.92,afterRhythmSeconds:0,rhythmScore:1000,buffLevel:2},
       {damage:26706397,priorDamage:13845698,beforeRhythmSeconds:228.94,afterRhythmSeconds:242.08,rhythmScore:3000,buffLevel:4}]}}),
      /个人伤害 26,706,397.*累计增益 4 级/);
   }
   if(cases.some(entry=>entry.table==='fengmo_band_personal_boss'&&entry.key===1)){
    await encounter('event','逢魔乐队 天邪鬼黄 501030');
    assert.match(await ui(panel+'.textContent'),/我方增益 鼓动 · 敌方首领增益 鼓动/);
    await ui(`(()=>{const entry=[...document.querySelectorAll('#client-dungeons-encounter-detail .encounter-source')]
     .find(node=>node.querySelector('h4')?.textContent.includes('单人挑战关卡'));
     [...entry.querySelectorAll('button')].find(button=>button.textContent==='查看关联关卡').click();})()`);
    await until(start+'!==null');
    assert.match(await run('superghost-five',{stageId:501030,groupId:501030,battleMode:5002},
      {fengmoBand:{timedOut:false,enemiesRemaining:0,damage:88813,combatSeconds:12.6,deadlineSeconds:180}}),
      /已清场 · 个人伤害 88,813 · 作战 12.60 \/ 180 秒/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='12130002'&&entry.kind==='拾光永恒战斗')){
    await encounter('event','虚无精锐 困难 12130002');
    const tenBuff=id=>`document.querySelector('[data-ten-bonus="${id}"]')`;
    await ui(`${tenBuff(810243)}.click();${tenBuff(810244)}.click();`);
    assert.equal(await ui(tenBuff(810245)+'.disabled'),true);
    await ui(tenBuff(810243)+'.click()');
    assert.equal(await ui(tenBuff(810245)+'.disabled'),false);
    await ui(tenBuff(810243)+'.click()');
    assert.match(await run('ten-tower',{stageId:12130002,groupId:12130002,battleMode:9591,tenBonuses:[810243,810244]},
      {tenAnniversary:{timedOut:false,bonuses:[810241,810243,810244],combatSeconds:120.14,deadlineSeconds:180}}),/助战石长姬 · 生效增益 3 项/);
    await encounter('event','黄金之河 虚无浪潮 12');
    assert.match(await ui(panel+'.textContent'),/原版时限 300 秒 · 助战石长姬/);
    assert.match(await run('ten-map',{stageId:12130069,groupId:12130069,battleMode:9593},
      {tenAnniversary:{timedOut:false,bonuses:[810241],combatSeconds:190,deadlineSeconds:300}}),/原版时限 300 秒/);
    await ui('qaEncounterInput("event","黄金之河 石长姬-探索1 12130016")');
    const exploreStart='document.querySelector("[data-explore-start]")';
    await until(exploreStart+'!==null');
    assert.equal(await ui(start+'===null'),true);
    assert.equal(await ui(exploreStart+'.disabled'),true);
    const activeAccount=await ui('STATE.activeAccount');
    await ui(`STATE.activeAccount="";(()=>{
      const choice=document.querySelector('[data-explore-known]');
      choice.value='qa-known-ten-explore';
      choice.dispatchEvent(new Event('change',{bubbles:true}));
      const actor=document.querySelector('[data-explore-actor]');
      actor.value='35';
      actor.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    const plan={actorLevel:35,members:[[591,30],[379,30]]},seen=[];
    mockPve=(party,request)=>{
     assert.deepEqual(party,plan);
     assert.deepEqual(request,{battleMode:9590,stageId:12130016,groupId:12130016,seed:request.seed,damageFloor:true});
     seen.push(request.seed);
     const opening=[[20608,35],[591,30],[379,30]].map(([id,level],index)=>({id,level,position:index+1,speed:128,attack:1200,hp:6000}));
     return {...sample,...request,tenAnniversaryExplore:{actorLevel:35,party:opening,combatSeconds:30.24,timedOut:false}};
    };
    await until(exploreStart+'.disabled===false');
    await ui(exploreStart+'.click()');
    await until('document.querySelector("[data-explore-status]").textContent.includes("6 / 6 个采样种子通关")');
    assert.deepEqual(seen,[0,1,2,3,7,42]);
    assert.match(await ui('document.querySelector("[data-explore-results]").textContent'),/石长姬活动 35 级 · 2 位招募式神/);
    await ui('STATE.activeAccount='+JSON.stringify(activeAccount));
   }
   if(cases.some(entry=>entry.table==='activity'&&entry.key===12135&&entry.refs.some(ref=>ref.table==='stake_boss'))){
    await encounter('event','炼石成金 12135');
    assert.match(await ui(panel+'.textContent'),/从第一层开始连续对战 · 石长姬替换阴阳师 · 180 秒内按个人伤害结算/);
    const tenAnniversaryBoss={timedOut:true,damage:1234567,
      phases:[0,22.22,82.44,162.7].map((seconds,i)=>({phase:i+1,seconds,enemies:Array(i<2?6:4)})),
      assists:[],combatSeconds:181.46,minionRespawns:0};
    assert.match(await run('ten-boss',{stageId:12135001,groupId:12135001,battleMode:9592},
      {waveCount:5,wavesCleared:3,tenAnniversaryBoss},undefined,null),/达到原版时限 · 个人伤害 1,234,567 · 到达第 4 \/ 5 层/);
    assert.match(await ui(reports+'.textContent'),/第 4 层 · 162\.70 秒进场 · 敌方 4 位/);
    assert.match(await ui(reports+'.textContent'),/限时计分/);
    await encounter('event','炼石成金 第 5 层 12135005');
    assert.match(await ui(panel+'.textContent'),/末层后，首领继续存活，小怪清空后会重新出现/);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='12140016'&&entry.kind==='围场赛事')){
    await ui('qaEncounterInput("event","围场赛事 九命猫 12140016")');
    const startExplore='document.querySelector("[data-explore-start]")';
    await until(startExplore+'!==null');
    assert.equal(await ui(start+'===null'),true);
    assert.match(await ui(panel+'.textContent'),/战斗时限 180 秒.*大天狗·高天铁羽.*天狗面具/s);
    await ui(`(()=>{
      for(const [attr,value] of [['known','qa-known-ten-explore'],['skill','2'],['masks','125']]){
       const field=document.querySelector('[data-explore-'+attr+']');
       field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));
      }
    })()`);
    const plan={actorLevel:40,skillLevel:2,masks:125,members:[[591,40],[379,40]]},seen=[];
    mockPve=async (party,request)=>{
     assert.deepEqual(party,plan);
     assert.deepEqual(request,{battleMode:6089,stageId:12140016,groupId:12140016,seed:request.seed,damageFloor:true});
     seen.push(request.seed);
     if(pve&&request.seed===0){
      const native=await pve.run(party,request);
      assert.equal(native.outcome,'win');
      assert.deepEqual(native.urdtgExplore.maskRecipients,[80611]);
      return native;
     }
     const opening=[[80611,40],...plan.members].map(([id,level],index)=>({id,level,position:index+1,speed:128,attack:1200,hp:6000}));
     return {...sample,...request,urdtgExplore:{...plan,party:opening,maskRecipients:[80611],combatSeconds:30.24,timedOut:false}};
    };
    await until(startExplore+'.disabled===false');
    await ui(startExplore+'.click()');
    await until('document.querySelector("[data-explore-status]").textContent.includes("6 / 6 个采样种子通关")',30000);
    assert.deepEqual(seen,[0,1,2,3,7,42]);
    assert.match(await ui('document.querySelector("[data-explore-results]").textContent'),/万风钧落 2 级 · 天狗面具 125 个 · 2 位招募式神.*天狗面具增伤生效/s);
   }
   if(cases.some(entry=>entry.table==='asura_map'&&entry.key===42&&entry.refs.some(ref=>ref.table==='pve_stage_data'))){
    await ui('qaEncounterInput("event","八火狱 地图与玩法 asura_guilty_tower")');
    await until(panel+'.textContent.includes("本层地图")');
    await ui(`[...${panel}.querySelectorAll('button')].find(button=>button.textContent==='所有地格').click()`);
    assert.match(await ui('$("client-dungeons-encounter-count").textContent'),/540 条/);
    await encounter('event','八火狱 深渊地格 42 凝罪塔');
    await choose('superghost-five');
    const slots='[...document.querySelectorAll("[data-pve-asura-depth-slot]")]';
    const damage='document.querySelector("[data-pve-asura-depth-damage]")';
    assert.equal(await ui(slots+'.length'),6);
    await ui(`${slots}.forEach(slot=>{slot.checked=false;});${damage}.dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await ui(start+'.disabled'),true);
    await ui(`${slots}[0].checked=true;${damage}.value='28300402781713';${damage}.dispatchEvent(new Event('input',{bubbles:true}))`);
    await until(start+'?.disabled===false');
    const asura={level:0,skills:[],specialKeys:[],cellId:42,enemies:[[1,'28300402781713']]};
    const asuraDepths={deadlineSeconds:240,timedOut:false,cleared:true,damage:15000,combatSeconds:12.60,
     omittedPositions:[2,3,4,5,6],enemies:[{position:1,startingHp:'15001',remainingHp:'0',damage:15000}]};
    assert.match(await run('superghost-five',{stageId:602007,groupId:602007,battleMode:3341,asura},
     {asuraDepths}),/已清场.*本场伤害 15,000.*1 号位 · 入场 15,001 · 余血 0.*本场已省略先前击败的敌位/s);
   }
   if(cases.some(entry=>entry.table==='asura_p2_config'&&entry.key===7)){
    await encounter('event','终末之战 asura_p2_config 7');
    await choose('superghost-five');
    const field='document.querySelector("[data-pve-asura-fields]")';
    const skill='document.querySelector("[data-pve-asura-skill][value=\'31401\']")';
    await ui(`${skill}.checked=true;${skill}.dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await ui(start+'.disabled'),true);
    await ui(`${field}.querySelector('[data-pve-asura-level]').value='85';${field}.querySelector('[data-pve-asura-hp]').value='46321995087944608';
     ${field}.querySelector('[data-pve-asura-enrage]').checked=true;${field}.querySelector('[data-pve-asura-tower][value="1"]').checked=true;
     ${field}.querySelector('[data-pve-asura-key][value="3"]').checked=true;${skill}.dispatchEvent(new Event('input',{bubbles:true}))`);
    await until(start+'?.disabled===false');
    const asura={level:85,skills:[31401],specialKeys:[3],enrage:true,activeTowers:[1],bossHp:'46321995087944608'};
    const asuraBattle={deadlineSeconds:240,timedOut:true,bossDefeated:false,remainingHp:'46321995078026464',damage:9918144,combatSeconds:242.86};
    assert.match(await run('superghost-five',{stageId:602000,groupId:602000,battleMode:3342,asura},
     {asuraBattle,wavesCleared:0}),/达到计分时限.*个人伤害 9,918,144.*剩余生命 46,321,995,078,026,464/s);
    await encounter('event','圣帝·恶 asura_p2_config 1');
    assert.equal(await ui('document.querySelector("[data-pve-asura-hp]")===null'),true);
    assert.match(await run('superghost-five',{stageId:602002,groupId:602002,battleMode:3344,asura:{level:0,skills:[],specialKeys:[]}}),/通过 .*个采样种子/);
   }
   if(cases.some(entry=>entry.table==='urdtg_ui'&&entry.key===3&&entry.refs.some(ref=>ref.table==='pve_stage_data'))){
    await encounter('event','飞羽凌云玩法 赛事训练');
    const skill='document.querySelector("[data-pve-training-skill]")',masks='document.querySelector("[data-pve-training-masks]")';
    assert.match(await ui(panel+'.textContent'),/大天狗·高天铁羽替换阴阳师.*赛事训练阵容码.*101014/s);
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-urdtg-training']);
    await choose('urdtg-training');
    await ui(masks+'.value="501";'+masks+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(skill+'.value="2";'+skill+'.dispatchEvent(new Event("change"));'+masks+'.value="125";'+masks+'.dispatchEvent(new Event("input"))');
    const urdtgTraining={skillLevel:2,masks:125,maskRecipients:[80611],timedOut:false,combatSeconds:73.4,
      party:[{id:80611,position:1,level:40,speed:128,attack:7800,hp:17343.2}]};
    assert.match(await run('urdtg-training',{stageId:510014,groupId:510014,battleMode:6092,urdtgTraining:{skillLevel:2,masks:125}},
      {urdtgTraining},undefined,null),/万风钧落 2 级 · 天狗面具 125 个 · 1 位生效.*指定出战角色/s);
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='11112'&&entry.refs.some(ref=>!ref.found))){
    await ui('qaEncounterInput("battle","结界入侵 11112")');
    await until(panel+'.textContent.includes("敌方编组 11112 未在原表中找到")');
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='map_boss'&&entry.key===71)){
    await encounter('daily','真蛇 地图首领入口');
    const reserveActor='document.querySelector("[data-pve-reserve-actor]")';
    await ui(`${options}.value="qa-known-orochi";${options}.dispatchEvent(new Event("change"))`);
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(`${reserveActor}.querySelector('option[value="qa-known-orochi"]')===null`),true);
    await ui(`${reserveActor}.value="qa-known-story-other";${reserveActor}.dispatchEvent(new Event("change"))`);
    await ui(`(()=>{const fields=[...document.querySelectorAll('[data-pve-reserve-member]')];
     ${JSON.stringify(reserves)}.forEach((id,i)=>{fields[i].value='pve-'+id;fields[i].dispatchEvent(new Event('change'));});})()`);
    await until(start+'.disabled===false');
    assert.equal(await ui('document.querySelectorAll("[data-pve-reserve-member]")[1].querySelector("option[value=pve-237]").disabled'),true);
    win.setContentSize(720,960);
    assert.equal(await ui('(()=>{const form=document.querySelector(".pve-reserve");return [...form.querySelectorAll("select")].every(select=>select.getBoundingClientRect().right<=form.getBoundingClientRect().right);})()'),true);
    win.setContentSize(1440,1000);
    const snakeSeeds=[];
    mockPve=(plan,request)=>{
     const {seed}=request;
     assert.deepEqual(request,{battleMode:3005,stageId:71,groupId:25100,seed,damageFloor:true});
     snakeSeeds.push(seed);
     assert.equal(plan.onmyoji.heroId,10);
     assert.equal(plan.reserveOnmyoji.heroId,13);
     assert.deepEqual(plan.members.map(row=>row.hero.heroId),ids);
     assert.deepEqual(plan.reserves.map(row=>row.hero.heroId),reserves);
     const worn=[...plan.members,...plan.reserves].flatMap(row=>row.souls.map(soul=>soul.id));
     assert.equal(worn.length,60);
     assert.equal(new Set(worn).size,60);
     return {...sample,seed,outcome:seed===0?'loss':'win',waveCount:10,wavesCleared:seed===0?9:10,trueOrochi:{settlement:'win',starts:[
      {floor:1,lineup:[{id:10,hp:2500,maxHp:2500}]},{floor:2,lineup:[{id:10,hp:2300,maxHp:2400}]},
     ]}};
    };
    await ui(start+'.click()');
    await until(status+'.textContent.includes("未通过本次采样")',20000);
    assert.deepEqual(snakeSeeds,[0,1,2,3,7,42]);
    const evidence=await ui(reports+'.textContent');
    assert.match(evidence,/5 \/ 6 场十层通关.*清 9 \/ 10 层.*已按进度结算.*各层出战与生命上限.*2500\/2500.*2300\/2400/s);
   }
   await ui('qaEncounterInput("battle","30101 剧情：晴明单挑犬神")');
   await until(panel+'.textContent.includes("剧情：晴明单挑犬神")');
   assert.equal(await ui(start+'===null'),true);
   await encounter('daily','天雷鼓 拾层');
   assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-awake']);
   assert.match(await run('awake',{stageId:40,groupId:4,battleMode:29}),/已知阵容 awake/);
   assert.match(await ui(panel+'.textContent'),/雷麒麟 · 40 级 · 1 号位 · 开场速度 160.*原版开场 · 生命 58,445\.17/s);
   await ui('window.qaSecretEncounter=(id,query)=>{qaEncounterInput("daily",query);[...$("client-dungeons-encounter-list").children].find(b=>b.querySelector("small").textContent.split(" · ")[1]===String(id)).click();};qaSecretEncounter(11,"红叶的羁绊 壹 邂逅")');
   await until(start+'!==null');
   assert.match(await run('secret',{stageId:11,groupId:11,battleMode:266},{waveCount:3,wavesCleared:3}),/已知阵容 secret/);
   await ui('qaSecretEncounter(18,"红叶的羁绊 捌 痴迷")');
   await until(start+'!==null');
   assert.match(await ui(panel+'.textContent'),/游戏内走单人组队挑战/);
   assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-secret-team']);
   assert.match(await run('secret-team',{stageId:18,groupId:18,battleMode:266},{waveCount:3,wavesCleared:3}),/已知阵容 secret-team/);
   await ui('qaSecretEncounter(118,"海怪的温柔 捌 惴惴")');
   await until(start+'!==null');
   assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-secret-mirror']);
   assert.match(await ui(panel+'.textContent'),/复制我方 2 号位.*复制我方 6 号位/s);
   assert.match(await run('secret-mirror',{stageId:118,groupId:118,battleMode:266},{waveCount:3,wavesCleared:3,
    secretMirror:{wave:3,units:ids.slice(0,5).map((hero,i)=>({position:i+2,level:40,sourceId:hero,monsterId:hero,
     copied:true,soulSkills:[[20019,1]]}))}}),/第 3 波 · 镜像阵容.*御魂技能 20019（1 级）/s);
   for(const [stage,query,lineup] of [[241,'骁武浪升 壹 入海','stage-actor-only'],[261,'逐路之争 壹 庆典','stage-actor-slot'],
    [181,'征服世界 壹 温柔','secret-jinyuji']]){
    await ui('qaSecretEncounter('+stage+','+JSON.stringify(query)+')');
    await until(start+'!==null');
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-'+lineup]);
    assert.match(await ui(panel+'.textContent'),/阴阳师位由关卡指定.*指定角色技能模板/s);
    assert.match(await run(lineup,{stageId:stage,groupId:stage,battleMode:266},{
     secretActor:{...secretOpenings.floors[stage].replacement,position:1}},undefined,null),
    /指定角色.* \d+ 级 · 6 星/);
   }
   await ui('qaSecretEncounter(191,"呱士无双 壹 立直")');
   await until(start+'!==null');
   assert.match(await run('secret-referee',{stageId:191,groupId:191,battleMode:266},{
    secretMechanic:{setup:secretOpenings.floors[191].mechanic,openingObserved:true,counters:{}}}),
   /裁判已上场，选技时限 45 秒/);
   await ui('qaSecretEncounter(1071,"山兔大暴走 开心的山兔")');
   await until(start+'!==null');
   assert.match(await ui(panel+'.textContent'),/竞速配置.*该层原版竞速编组.*本地复跑耗时/s);
   assert.match(await run('secret-race',{stageId:1071,groupId:1071,battleMode:266},{waveCount:3,wavesCleared:3}),
    /已知阵容 secret-race/);
   await ui('qaSecretEncounter(358,"溯问鲤踪 捌 鲤影")');
   await until(start+'!==null');
   assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-liyu']);
   assert.match(await ui(panel+'.textContent'),/单人组队挑战.*查看鲤鱼精配置.*查看河童配置/s);
   assert.match(await run('liyu',{stageId:358,groupId:358,battleMode:266},{
    secretProtection:{support:{id:31708001,position:101,level:40,star:6,hp:15723},targetId:31708209,
     settlement:{supportAlive:true,targetAlive:true,enemiesAlive:1}}}),
    /鲤鱼精存活 · 河童存活 · 敌方剩余 1 位/);
   if(cases.some(entry=>entry.kind==='经验妖怪')){
    await encounter('daily','经验妖怪 新服首次');
    assert.match(await run('exp',{stageId:2111,groupId:2111,battleMode:528},{wavesCleared:0,experience:{kills:30,requiredKills:30,timedOut:false}}),/原版胜利 · 击杀 30 \/ 30/);
    await encounter('daily','金币妖怪 编组 2009');
    assert.match(await run('exp',{stageId:2009,groupId:2009,battleMode:528},{wavesCleared:0,coins:{bossHpFraction:0,timedOut:false,previewCoins:31220,minimumPreviewCoins:29643}}),/金币预览 31,220.*基础金币取下限 29,643/);
   }
   await encounter('daily','暗·神龙 叁层');
   assert.match(await run('yuling',{stageId:3,groupId:3,battleMode:267}),/已知阵容 yuling/);
   if(catalog.entries.has('gve_battleinfo')){
    await ui('window.qaGuildEncounter=(id,query)=>{qaEncounterInput("guild",query);[...$("client-dungeons-encounter-list").children].find(b=>b.querySelector("small").textContent.split(" · ")[1]===String(id)).click();};qaGuildEncounter(61,"麒麟狩猎 火麒麟")');
    await until(start+'!==null');
    assert.match(await run('hunt',{stageId:61,groupId:61,battleMode:2000},{guildHunt:{damage:5000000,tactics:tactical}},tactical),/单场最高 5,000,000.*首动普攻首领.*红标首领/s);
    assert.match(await ui(panel+'.textContent'),/原版计分窗口 240 秒/);
   }
   if(cases.some(entry=>entry.table==='gve_battleinfo'&&entry.title==='阴界之门 · 入口 101')){
    await ui('qaGuildEncounter(101,"阴界之门")');
    await until(start+'!==null');
    assert.match(await run('underworld',{stageId:101,groupId:101,battleMode:2001},{waveCount:70,wavesCleared:54,
     underworld:{teams:[{team:1,startWave:1,onmyojiId:10}],leftAfterLastTeam:true}}),/最低 54 波.*第 1 队在第 1 波上场/s);
   }
   if(catalog.entries.has('raid_info')){
    await ui('qaGuildEncounter(1,"首领退治 难度")');
    await until(start+'!==null');
    await ui('(()=>{const [boss,round]='+panel+'.querySelectorAll("select");boss.value="103";boss.dispatchEvent(new Event("change"));round.value="3";round.dispatchEvent(new Event("change"));const [length,members]='+panel+'.querySelectorAll("input[type=number]");length.value="0";length.dispatchEvent(new Event("change"));})()');
    assert.match(await ui(panel+'.textContent'),/计分窗口请输入 1 至 1,800 秒/);
    assert.equal(await ui(start+'===null'),true);
    await ui('(()=>{const [length,members]='+panel+'.querySelectorAll("input[type=number]");length.value="97";length.dispatchEvent(new Event("change"));members.value="5";members.dispatchEvent(new Event("change"));})()');
    const retreat={raidRound:3,guildMembers:5,windowSeconds:97};
    assert.match(await run('retreat',{stageId:1,groupId:103,battleMode:306,retreat},{outcome:'loss',wavesCleared:0,
     guildRetreat:{damage:350000,reason:'window-expired',combatSeconds:97,windowSeconds:97,phases:['limao'],tactics:tactical}},tactical),/达到计分窗口.*97\.00 \/ 97 秒/);
   }
   if(cases.some(entry=>String(entry.key)==='325006')){
    await encounter('event','逢魔演武 鬼灵歌伎');
    assert.match(await run('yanwu',{stageId:325006,groupId:325006,battleMode:8238},{outcome:'loss',wavesCleared:0,
     fengmoYanwu:{damage:750000,timedOut:true,combatSeconds:300}},undefined,10,6),/达到计分时限.*750,000/);
   }
   if(cases.some(entry=>entry.table==='act_team_battle'&&String(entry.key)==='4')){
    await encounter('event','将魂试炼');
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-general-soul']);
    assert.match(await ui(panel+'.textContent'),/原版计分窗口 180 秒/);
    assert.match(await run('general-soul',{stageId:3504732,groupId:3504732,battleMode:2507},{outcome:'loss',wavesCleared:0,
     generalSoulTrial:{damage:11320870,timedOut:true,combatSeconds:180.96,tactics:tactical}},tactical),
     /单场最高 11,320,870.*达到计分时限.*个人伤害 11,320,870 · 战斗与结算 180\.96 秒/s);
    const stage=cases.find(entry=>entry.table==='pve_stage_data'&&Number(entry.key)===3504732);
    if(stage){
     await encounter(stage.family,'SSR3困难 3504732');
     assert.match(await ui(panel+'.textContent'),/将魂试炼 · 单人个人伤害/);
    }
   }
   for(const [activityRow,label,lineup,stageId,battleMode] of [
    [58,'雪山修行','snow',7287242,2069],[6082,'刹那试炼','instant',3334472,6086],
   ]){
    if(!cases.some(entry=>entry.table==='act_team_battle'&&Number(entry.key)===activityRow))continue;
    await encounter('event',label);
    assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-'+lineup]);
    assert.match(await ui(panel+'.textContent'),/原版计分窗口 300 秒/);
    assert.match(await run(lineup,{stageId,groupId:stageId,battleMode},{outcome:'loss',wavesCleared:0,
     activityScore:{damage:2154000,timedOut:true,combatSeconds:300.25}}),
     /单场最高 2,154,000.*达到计分时限.*个人伤害 2,154,000 · 战斗与结算 300\.25 秒/s);
   }
   if(cases.some(entry=>entry.table==='act_team_battle'&&Number(entry.key)===57)){
    await ui('qaEncounterInput("event","彼世逢魔")');
    await until(panel+'.textContent.includes("组队入口按所选难度开战")');
    assert.match(await ui(panel+'.textContent'),/实际难度入口.*普通.*实际难度入口.*困难.*实际难度入口.*梦魇/s);
    assert.equal(await ui(start+'===null'),true);
   }
   if(cases.some(entry=>entry.table==='xinghen_battle')){
    for(const [difficulty,label] of ['普通','困难','梦魇'].entries()){
     await encounter('daily',`彼世逢魔 ${label}`);
     assert.deepEqual(await ui('[...'+options+'.options].map(o=>o.value).filter(id=>id.startsWith("qa-known-"))'),['qa-known-tianfa']);
     assert.match(await ui(panel+'.textContent'),/「盘枝」.*原版缺省入场参数/s);
     const stageId=2716061+difficulty;
     assert.match(await run('tianfa',{stageId,groupId:stageId,battleMode:2600},
      {tianfa:{difficulty:difficulty+1,damage:7811706,combatSeconds:126.10}},undefined,10,6),
      /通关 · 个人伤害 7,811,706 · 战斗与结算 126\.10 秒/);
     const party='document.querySelector("[data-tianfa-party]")';
     await ui(`${party}.value="team";${party}.dispatchEvent(new Event("change"))`);
     assert.match(await ui(panel+'.textContent'),/同一阵容的六位式神按原版位置分给三名本地参战者/);
     assert.match(await run('tianfa',{stageId,groupId:stageId,battleMode:2600,tianfaTeam:true},
      {tianfa:{difficulty:difficulty+1,damage:7811706,combatSeconds:122.6,teamPositions:[[3,7],[2,5],[4,6]]}},undefined,10,6),
      /通关 · 三人组队 · 本队伤害 7,811,706 · 战斗与结算 122\.60 秒/);
    }
   }
   if(cases.some(entry=>entry.table==='pve_stage_data'&&entry.key==='731010'&&entry.kind==='秘境鬼王')){
    await encounter('event','阴阳之守 秘境鬼王 大岳丸');
    assert.match(await ui(panel+'.textContent'),/原版时限 180 秒.*敌方编组 · 731010/s);
    const drums='document.querySelector("[data-pve-yinyang-drums]")';
    const choice='document.querySelector("[data-pve-yinyang-buff]")';
    assert.equal(await ui(choice+'.options.length'),31);
    await choose('superghost-five');
    await ui(drums+'.value="10";'+drums+'.dispatchEvent(new Event("input"))');
    assert.equal(await ui(start+'.disabled'),true);
    assert.equal(await ui(drums+'.getAttribute("aria-invalid")'),'true');
    await ui(`(()=>{
     const drums=${drums},choice=${choice};
     drums.value='1';drums.dispatchEvent(new Event('input'));
     for(const value of ['2','5','23','29','29']){
      choice.value=value;choice.dispatchEvent(new Event('change'));
      document.querySelector('[data-pve-add-yinyang-buff]').click();
     }
    })()`);
    assert.match(await ui(panel+'.textContent'),/原版时限 300 秒/);
    await ui('document.querySelector(\'[data-remove-yinyang-buff="4"]\').click()');
    assert.equal(await ui('document.activeElement==='+choice),true);
    assert.match(await ui(panel+'.textContent'),/原版时限 270 秒/);
    const yinyangBoss={remainingDrums:1,buffIds:[2,5,23,29]};
    assert.match(await run('superghost-five',{stageId:731010,groupId:731010,battleMode:409,yinyangBoss},
      {outcome:'loss',waveCount:1,wavesCleared:0,yinyangBoss:{...yinyangBoss,timedOut:true,damage:17977802,deadlineSeconds:270,combatSeconds:272.84}}),
      /达到原版时限 · 本队伤害 17,977,802 · 余鼓 1 · 加成 4 项 · 战斗与结算 272\.84 秒 · 时限 270 秒/);
   }
   if(catalog.entries.has('journey_hardbattle')){
    await encounter('event','京畿净化首领挑战 七人岬·扇');
    const length='document.querySelector("[data-pve-journey-deadline]")';
    const blessings='document.querySelector("[data-pve-journey-blessings]")';
    await ui(options+'.value="qa-known-exp";'+options+'.dispatchEvent(new Event("change"))');
    assert.equal(await ui(start+'.disabled'),true);
    await ui(length+'.value="180";'+length+'.dispatchEvent(new Event("input"));'+
     blessings+'.value="70";'+blessings+'.dispatchEvent(new Event("input"))');
    const journeyHard={deadlineSeconds:180,blessingCount:70};
    assert.match(await run('exp',{stageId:731001,groupId:731001,battleMode:402,journeyHard},
     {journeyHard:{...journeyHard,combatSeconds:59,timedOut:false,blessingBonus:{attack:.7,speed:35,crit:.21,critDamage:.7}}}),
     /时限 180 秒 · 战斗与结算 59\.00 秒 · 祝福 70 层 · 开场 攻击 \+70%、速度 \+35、暴击 \+21%、暴击伤害 \+70%/s);
    await ui(length+'.value="5";'+length+'.dispatchEvent(new Event("input"))');
    mockPve=(plan,request)=>{
     assert.deepEqual(request.journeyHard,{deadlineSeconds:5,blessingCount:70});
     return {...sample,...request,outcome:'loss',wavesCleared:0,journeyHard:{...request.journeyHard,
      combatSeconds:7,timedOut:true,blessingBonus:{attack:.7,speed:35,crit:.21,critDamage:.7}}};
    };
    await ui(start+'.click()');
    await until(reports+'.textContent.includes("种子 0 超时")');
    assert.match(await ui(reports+'.textContent'),/原版判定超时 · 时限 5 秒/);
   }
   if(catalog.entries.has('MZB_fengmo')){
    await encounter('daily','逢魔木桩 巧劲');
    assert.match(await run('spider',{stageId:2,groupId:125017,battleMode:5551},
     {tuzhizhuPractice:{partsRemaining:[],combatSeconds:12.6,cocoonsSpawned:3,cocoonsDefeated:2}}),/击破 4 \/ 4 个关键部位.*击破白茧 2 \/ 3/);
   }
   await ui(status+'.scrollIntoView({block:"start",behavior:"instant"})');
   await capture('known-lineup-replay');
  }finally{
   mockPve=null;stopPve=null;
   await ui('stopMatch();STATE='+boot+';selectedLineups.clear();$("client-dungeons").open=false;renderSelection();');
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
    assert.equal(await ui('$("dungeon-search-stock")'),null);
    const status=await ui('$("dungeon-battle-results").textContent');
    assert.match(status,/种子 0.*本次复跑通关/s);
    if(all)assert.match(status,/已通过 9 个采样种子.*种子 8929.*种子 2016.*种子 7698/s);
    else if(verdict==='unknown')assert.match(status,/复跑结算待核对/);
    else assert.match(status,/种子 1 未通关/);
    if(all){
     mockSeeds=(plan,progress)=>{
      assert.deepEqual(plan,replayPlan);progress(seedEvidence({workerCount:4,damageFloor:false}));
      return new Promise(resolve=>{stopSeeds=()=>resolve(seedEvidence({wins:74,stopped:true}));});
     };
     await ui('document.querySelector("[data-battle-full]").click()');
     await until('document.querySelector(".dungeon-full-seeds progress")?.value===73');
     assert.match(await ui('document.querySelector(".dungeon-full-seeds").textContent'),/并行 4 场.*原版伤害浮动/s);
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
     assert.equal(await ui('$("dungeon-search-stock")'),null);
     nextOutcome='loss';await startExtra();
     await until('!dungeonBattle.activeSeedAudit&&dungeonBattle.rows[0].seedAudit?.verdict==="loss"');
     assert.match(await ui('$("dungeon-battle-results").textContent'),/补测种子 5 未通关.*种子 4.*种子 5.*本次复跑失败/s);
     assert.deepEqual(seeds.slice(commonSeeds.length),[4,5,5,5]);
     await ui('$("dungeon-match-selected").click()');
     await until('!dungeonBattle.running&&dungeonBattle.rows[0].state==="finished"');
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
  assert.equal(await ui('$("dungeon-search-stock")'),null);
  assert.ok(floorCalls.length);
  assert.deepEqual(floorCalls,commonSeeds.slice(0,Math.min(floorCalls.length,6)).map(seed=>({dungeonId:101,seed,fixedStep:true})));
  assert.deepEqual(replayPlan.spirit,spirit);
  assert.equal(replayPlan.members.at(-1).souls.length,0);
  await capture('dungeon-soul-11-replay');
  await ui('$("dungeon-rules-select").value="102";renderDungeonRules()');
  assert.equal(await ui('$("dungeon-battle-results").hidden'),true);
  const floors=[[1,'御魂壹层',3],[10,'御魂拾层',3],[13,'业原火痴之阵',3],[1004,'日轮之陨日蚀',1]].map(([dungeonId,name,waves])=>({
   dungeonId,waves,lineup:{...lineup,id:'qa-rune-'+dungeonId,gameSceneId:sceneForDungeon(dungeonId),
    code:'|TA|qa-rune-'+dungeonId,title:name+'已知阵容'},
  }));
  const ordinaryCalls=[];
  mockBattle=(plan,options)=>{
   assert.deepEqual(plan.spirit,spirit);
   assert.equal(plan.damageFloor,true);
   const waves=floors.find(floor=>floor.dungeonId===options.dungeonId).waves;
   ordinaryCalls.push(options);
   return {seed:options.seed,completed:true,outcome:'win',wavesCleared:waves,formationsVerified:waves,bouts:6,engineSeconds:13};
  };
  try{
   await ui(`stopMatch();STATE={...STATE,lineups:${JSON.stringify(floors.map(floor=>floor.lineup))}};`);
   for(const {dungeonId,waves,lineup:selected} of floors){
    await ui(`$("dungeon-rules-select").value="${dungeonId}";renderDungeonRules();$("dungeon-show-lineups").click();
     selectedLineups=new Set(${JSON.stringify(floors.map(floor=>floor.lineup.id))});renderSelection();$("dungeon-match-selected").click()`);
    await until(`dungeonBattle?.dungeonId===${dungeonId}&&!dungeonBattle.running&&dungeonBattle.rows.length===1&&dungeonBattle.rows[0].state==="finished"`);
    const content=await ui('$("dungeon-battle-results").textContent');
    assert.ok(content.includes(selected.title)&&floors.every(floor=>floor.dungeonId===dungeonId||!content.includes(floor.lineup.title)));
    assert.ok(content.includes('已通过 6 个采样种子')&&content.includes('已核对 '+waves+' 波原版编组'));
    assert.equal(await ui('document.querySelector("[data-battle-full]")'),null);
    if(dungeonId===13)assert.match(await ui('$("dungeon-rules-details").textContent'),/痴念之卷 ×1.*原版特殊机制.*三个嗔面/s);
    if(dungeonId===1004){
     assert.match(await ui('$("dungeon-rules-details").textContent'),/原版战斗 1 波.*减伤至60%.*免疫回合后伤害/s);
     assert.equal(await ui('$("dungeon-rules-details").querySelectorAll(".dungeon-wave").length'),1);
    }
   }
  }finally{mockBattle=null;}
  assert.deepEqual(ordinaryCalls,floors.flatMap(({dungeonId})=>[0,1,2,3,7,42].map(seed=>({dungeonId,seed,fixedStep:true}))));
  await ui('stopMatch();$("clear-filters").click();$("dungeon-workbench").open=false');
 });
 await check('全种子通过结果显示单人本地范围和最慢一场',async()=>{
  const complete=JSON.stringify(seedEvidence({status:'all-local-seeds-passed',wins:10000}));
  const markup=await ui(`fullSeedAuditMarkup({samples:AtlasRuneSearch.sampleSeeds.map(seed=>({seed,completed:true,outcome:'win',wavesCleared:3,engineSeconds:13})),fullSeedAudit:{progress:${complete}}},'data-full-seeds-fixture',false,null,{id:102})`);
  assert.match(markup,/常规单人本地入口的 10,000 个种子全部通过.*最慢种子 13.*引擎全程 25\.50 秒.*开战至结算 14\.40 秒/s);
  assert.doesNotMatch(markup,/data-full-seeds-fixture|<progress/);
 });
 await check('虚无与永生之海按指定顺序复跑两套已知阵容',async()=>{
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
  const available={...raw,heroes,hero_equips:items};
  async function setup(inventory,dungeonId=103){
   const known=dungeonId===103?lineups:lineups.map((row,index)=>({...row,id:'qa-sea-'+index,code:'|TA|qa-sea-'+index,
    title:'魂海已知阵容 '+(index+1),gameSceneId:sceneForDungeon(dungeonId)}));
   await ui(`stopMatch();STATE={...STATE,lineups:${JSON.stringify(known)},accounts:[C.parseAccount(${JSON.stringify(inventory)})]};STATE.activeAccount=STATE.accounts[0].id;matchResults={};runeStatus=null;selectView('library');$('dungeon-workbench').open=true;renderDungeonRules();$('dungeon-rules-select').value='${dungeonId}';renderDungeonRules();$('dungeon-show-lineups').click();selectedLineups=new Set(${JSON.stringify(known.map(row=>row.id))});renderSelection()`);
   await until('!$("dungeon-match-selected").disabled && $("dungeon-match-selected").textContent.includes("两波")');
  }
  let calls=0;
  runeEnabled=true;
  mockBattle=(plan,options)=>{
   calls++;
   const ids=[13,10];
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
   assert.equal(await ui('$("dungeon-search-stock")'),null);
   await ui('$("dungeon-hun13-first").value="qa-hun13-2";$("dungeon-hun13-second").value="qa-hun13-1";renderDungeonSelection();$("dungeon-match-selected").click()');
   await until('dungeonHun13&&!dungeonHun13.running',20000);
   assert.equal(calls,2);
   assert.match(await ui('$("dungeon-hun13-status").textContent'),/第 1 波 虚无第二队.*第 2 波 虚无第一队.*未通过全部采样/);
   assert.match(await ui('$("dungeon-hun13-samples").textContent'),/原版结算胜利，有波次未清场.*源博雅.*晴明.*时限 48 秒/s);
   assert.equal(await ui('$("dungeon-search-stock")'),null);
   await ui('$("dungeon-hun13-rounds").scrollIntoView({block:"center",behavior:"instant"})');
   await capture('dungeon-hun13-pair');
   win.setContentSize(720,960);
   try{assert.equal(await ui('$("dungeon-hun13-rounds").scrollWidth<=$("dungeon-hun13-rounds").clientWidth+2'),true);}
   finally{win.setContentSize(1440,1000);}
   assert.equal(await ui('$("dungeon-hun13-samples").children.length'),1);
   const firstPlan=await ui('JSON.stringify(dungeonHun13.current.plan)');
   mockBattle=(plan,options)=>{
    assert.equal(JSON.stringify(plan),firstPlan);
    return {seed:options.seed,completed:true,outcome:'win',wavesCleared:1,engineSeconds:90,rounds:[
     {wave:1,onmyojiId:13,cleared:false,availableSeconds:120,seconds:25,carriedSeconds:-30},
     {wave:2,onmyojiId:10,cleared:true,availableSeconds:90,seconds:45}],animationPlayback:{combatElapsedMs:80000}};
   };
   await ui('$("dungeon-match-selected").click()');
   await until('dungeonHun13?.phase==="pass"&&!dungeonHun13.running',20000);
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
   assert.equal(await ui('$("dungeon-match-selected").disabled'),true);
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
   assert.equal(await ui('$("dungeon-hun13-samples").children.length'),1);
   await setup(available,2005);
   assert.equal(await ui('$("dungeon-hun13-first-label").textContent'),'海甬道阵容');
   assert.equal(await ui('$("dungeon-hun13-second-label").textContent'),'安魂冢阵容');
   assert.match(await ui('$("dungeon-rules-details").textContent'),/原版特殊机制.*击杀鲛人国王/s);
   const seaSeeds=[];
   mockBattle=(plan,options)=>{
    assert.deepEqual(options,{dungeonId:2005,seed:options.seed,fixedStep:true});
    assert.equal(plan.damageFloor,true);
    assert.deepEqual(plan.rounds.map(r=>r.onmyoji.heroId),[13,10]);
    assert.equal(new Set(plan.rounds.flatMap(r=>r.members.map(m=>m.instanceId))).size,10);
    seaSeeds.push(options.seed);
    return {seed:options.seed,completed:true,outcome:'win',wavesCleared:2,engineSeconds:85,
     monsterHealth:[{wave:2,cleared:true,startMs:12000,endMs:42000,
      monsters:[{id:3310016,position:6,initialHp:30001,lowestHp:0,lastHp:0}]}],rounds:[
     {wave:1,onmyojiId:13,cleared:true,availableSeconds:120,seconds:31,carriedSeconds:89},
     {wave:2,onmyojiId:10,cleared:true,availableSeconds:209,seconds:34}]};
   };
   await ui('$("dungeon-hun13-first").value="qa-sea-1";$("dungeon-hun13-second").value="qa-sea-0";renderDungeonSelection();$("dungeon-match-selected").click()');
   await until('dungeonHun13?.dungeonId===2005&&dungeonHun13.phase==="pass"&&!dungeonHun13.running',20000);
   assert.deepEqual(seaSeeds,[0,1,2,3,7,42,9999]);
   assert.match(await ui('$("dungeon-hun13-samples").textContent'),/海甬道 魂海已知阵容 2.*安魂冢 魂海已知阵容 1.*对安魂冢 \+89\.00 秒.*时限 209 秒/s);
   await ui('document.querySelector("#dungeon-hun13-samples details summary").click()');
   assert.match(await ui('document.querySelector("#dungeon-hun13-samples details[open]").textContent'),/安魂冢.*怪物 3310016 · 6 号位.*开场 30,001/s);
   assert.equal(await ui('document.querySelector("[data-hun13-full]")'),null);
   await ui('$("dungeon-hun13-rounds").scrollIntoView({block:"center",behavior:"instant"})');
   await capture('dungeon-everlasting-sea');
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
 await check('旧版御魂预设区分同名方案并显示已找到御魂和缺口',async()=>{
  const soul={id:'preset-soul',slot:6,quality:6,level:15,setId:'火灵',mainAttrType:'crit_rate',mainAttrValue:.55,subAttributes:[]};
  const inventory={...raw,hero_equips:[soul],equipPresets:[['同名方案',['preset-soul','missing']],['同名方案',[]]]};
  await ui('importMode="accounts";$("merge-import").checked=false;handleFiles('+file(inventory)+')');
  await ui('selectView("accounts");$("account-equip-presets").open=true');
  assert.deepEqual(await ui('[...$("account-equip-preset-select").options].map(option=>option.textContent)'),['同名方案（1）','同名方案（2）']);
  assert.match(await ui('$("account-equip-preset-detail").textContent'),/引用 2 件 · 找到 1 件 · 库存未提供 1 件.*6 号位.*火灵.*6 星 · \+15/s);
  await ui('$("account-equip-preset-select").value="1";$("account-equip-preset-select").dispatchEvent(new Event("change"));'+
   'STATE={...STATE,accounts:STATE.accounts.map(row=>row===account()?{...row,server:"已核对的区服"}:row)};renderAccounts(false)');
  assert.deepEqual(await ui('[$("account-equip-presets").open,$("account-equip-preset-select").value]'),[true,'1']);
  assert.match(await ui('$("account-equip-preset-detail").textContent'),/此预设没有引用御魂/);
  win.setContentSize(720,960);
  try{
   const widths=await ui('[document.documentElement.scrollWidth,innerWidth]');
   assert.ok(widths[0]<=widths[1]+2,`窄窗口横向范围 ${widths[0]} / ${widths[1]}`);
  }finally{win.setContentSize(1440,960);}
 });
 const nativeExportDir=process.env.YUQI_PINGANZHI_EXPORT_DIR;
 if(nativeExportDir)await check('平安志实际导出通过账号文件入口和预设显示',async()=>{
  const files=(await fs.readdir(nativeExportDir,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.json'));
  assert.ok(files.length,'缺少平安志实际导出');
  const documents=await Promise.all(files.map(async entry=>{
   const text=await fs.readFile(path.join(nativeExportDir,entry.name),'utf8');
   return {text,raw:JSON.parse(text.replace(/^\uFEFF/,''))};
  }));
  const ids=new Set(documents.map(({raw})=>`${raw.player.serverId}:${raw.player.shortId}`));
  await ui('selectView("accounts");STATE={...STATE,accounts:[],activeAccount:""};importMode="accounts";$("merge-import").checked=false');
  const sources=documents.map(({text},index)=>`{name:"角色档案-${index+1}.json",size:${Buffer.byteLength(text)},text:async()=>${JSON.stringify(text)}}`);
  await win.webContents.executeJavaScript(`handleFiles([${sources.join(',\n')}])`);
  assert.equal(stored.accounts.length,ids.size);
  for(const {raw} of documents){
   const account=stored.accounts.find(entry=>entry.id===`${raw.player.serverId}:${raw.player.shortId}`);
   assert.ok(account,'未保存对应导出库存');
   assert.equal(Object.keys(account.heroes).length,Object.keys(raw.heroes).length);
   assert.equal(Object.keys(account.souls).length,(raw.souls??raw.hero_equips).length);
   assert.equal(account.snapshot.equipPresets?.length,raw.equipPresets?.length);
  }
  assert.equal(await ui('$("account-equip-preset-select")?.options.length'),stored.accounts.at(-1).snapshot.equipPresets.length);
  assert.equal(await ui('C.restoreAccount(STATE.accounts.at(-1)).snapshot.equipPresets.length'),stored.accounts.at(-1).snapshot.equipPresets.length);
 });
 const report={version:require('../package.json').version,results,errors,synthetic:true,nativeExports:!!nativeExportDir,method:'生产 Electron 页面、预加载脚本与本地 IPC 测试。'+
  (nativeExportDir?'另用平安志实际导出验收库存入口。':'使用合成库存与失败注入。')+'真实手机扫码与网易服务未在本轮实测。'};
 await background.close();
 await fs.writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));
  await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(process.env.YUQI_UI_REPORT||path.join(root,'verification','optimization-ui-v'+report.version.replaceAll('.','')+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),profile,errors},null,2));
 app.exit(results.every(r=>r.passed)&&errors.length===0?0:1);
}
main().catch(async e=>{console.error(e);await fs.writeFile(path.join(profile,'error.txt'),e.stack).catch(()=>{});app.exit(1);});
