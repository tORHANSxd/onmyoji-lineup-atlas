// Production Electron UI with synthetic state, credentials and disk failures.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {readIndex,readTable,readEncounters,readRecords}=require('../desktop/dungeon-catalog.cjs');
const {createRuneRunner}=require('../desktop/rune-runner.cjs');
const {createRuneFloorRunner}=require('../desktop/rune-floor-runner.cjs');
const {runeFloorIds,hun13FloorIds,sceneForDungeon}=require('../app/rune-lineup.js');
const {createPveStageRunner}=require('../desktop/pve-stage-runner.cjs');
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
 local('dungeon-catalog-index',()=>catalog?.index||null);
 local('dungeon-catalog-table',name=>readTable(catalog,name));
 local('dungeon-catalog-encounters',()=>readEncounters(catalog));
 local('dungeon-catalog-records',(table,keys)=>readRecords(catalog,table,keys));
 const runtime={configPath:process.env.ATLAS_RUNE_RUNTIME,scriptRoot:path.join(root,'tools'),suits:data.suits};
 const rune=runtime.configPath?createRuneRunner(runtime):null;
 const runeFloor=runtime.configPath?createRuneFloorRunner(runtime):null,floorCalls=[];
 const pve=runtime.configPath?createPveStageRunner(runtime):null;
 let mockPve=null,stopPve=null;
 local('pve-stage-status',()=>({available:true,resourceVersion:'0.0.816',battleModes:[3,29,266,267,306,528,2000,2001,3004,3023,5550,5551,8238]}));
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
 if(catalog?.index.encounters&&catalog.entries.has('event4'))await check('逢魔实战按十二个入口展示原版编组、评级和奖励',async()=>{
  const panel='$("client-dungeons-encounter-detail")';
  const {encounters}=require('../app/fengmo-live.js'),entries=encounters(new Set(catalog.entries.keys()));
  assert.equal(entries.length,12);
  for(const entry of entries){
   const query=entry.title.replace(' · ',' ');
   await ui(`$('client-dungeons').open=true;$('client-dungeons-mode-encounters').click();qaEncounterInput('daily',${JSON.stringify(query)})`);
   await until(`${panel}.textContent.includes("实战入场与计分")`);
   const info=await ui(panel+'.textContent');
   assert.ok(info.includes(entry.title)&&info.includes(`集结模式 ${entry.fengmoLive.rally}`));
   assert.ok(info.includes(`事件 ${entry.fengmoLive.eventId}`));
   assert.ok(info.includes('客户端玩法说明')&&info.includes(String(entry.fengmoLive.stage)));
   assert.equal(await ui(panel+'.querySelector("[data-pve-stock]")'),null);
  }
  await ui('qaEncounterInput("daily","逢魔实战 稀有·土蜘蛛")');
  await until(panel+'.textContent.includes("按个人伤害比较评级门槛")');
  assert.match(await ui(panel+'.textContent'),/星期三.*个人伤害下限.*2,000,000/s);
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
  const fighters=ids.map((id,index)=>({index:index+1,kind:'shikigami',name:data.gameConfig.heroes[id].name,
   shikigamiId:String(id),level:40,star:6,awakening:1,skills:heroes['pve-'+id].skinfo.map(([id,level])=>({id,level})),
   aiSkill:0,config:{keepCurrent:true}}));
  function known(id,gameSceneId,count,onmyoji=10,notes=''){
   return {id:'qa-known-'+id,title:'已知阵容 '+id,code:'|TA|qa-known-'+id,notes,
    gameSceneId,requirementsComplete:true,decodeState:'decoded-local',members:[
     {index:0,kind:'onmyoji',name:data.gameConfig.heroes[onmyoji].name,onmyojiId:String(onmyoji),level:60,star:2,awakening:0,aiSkill:0,
      skills:(onmyoji===13?[1304,1302]:[1008,1011]).map(id=>({id,level:5}))},...fighters.slice(0,count)]};
  }
  const notes='资源 0.0.816，6 场离线结算。我方伤害取下限。阴阳师普攻 1 级。开场操作。入场前把第1位式神设为自动普攻。手动开场，首动普攻首领后切自动。红标首领。绿标第3位式神。全分支待验证。';
  const tactical={manualOpening:true,redBoss:true,greenSlot:3,autoMode:{slot:1,mode:'basic'}};
  const squads=[known('story',1001001,3),known('story-other',1001002,3,13),known('awake',10023001,5),known('secret',10701011,5),
   known('exp',1001001,5),known('yuling',10030001,5),known('hunt',10020208,5,10,notes),known('underworld',19005,5),
   known('retreat',10020205,5,10,notes),known('yanwu',100978,6),known('spider',10020221,5),
   known('region',10020215,5,13),known('region-hard',10020216,5)];
  const boot=await ui('JSON.stringify(STATE)');
  const cases=JSON.parse(await readEncounters(catalog)).entries;
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
    assert.equal(plan.onmyoji.heroId,actor);
    assert.deepEqual(plan.members.map(member=>member.hero.heroId),ids.slice(0,count));
    assert.deepEqual(plan.tactics,tactics);
    const souls=plan.members.flatMap(row=>row.souls.map(q=>q.id));
    assert.equal(new Set(souls).size,6*count);
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
    console.log('31811 selected lineup native results',JSON.stringify(verified));
   }
   return ui(reports+'.textContent');
  }
  try{
   await ui('stopMatch();STATE={...STATE,lineups:'+JSON.stringify(squads)+',accounts:[C.parseAccount('+
    JSON.stringify({...raw,heroes,hero_equips:items})+')]};STATE.activeAccount=STATE.accounts[0].id;selectView("library");'+
    '$("client-dungeons").open=true;$("client-dungeons-mode-encounters").click();selectedLineups.clear();renderSelection()');
   await encounter('battle','31811');
   assert.equal(await ui(start+'.disabled'),true);
   assert.match(await run('story',{stageId:31811,groupId:31811},{},undefined,10,3,!!pve),/已知阵容 story.*(通过 6 个采样种子|种子 \d+ 未通关)/s);
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
   await until(panel+'.textContent.includes("游戏内走组队入口")');
   assert.equal(await ui(start+'===null'),true);
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
 const report={version:require('../package.json').version,results,errors,synthetic:true,method:'生产 Electron 页面、预加载脚本与合成 IPC；失败注入、慢保存竞态、1440/900/720 像素及 200% 缩放。真实手机扫码与网易服务未在本轮实测。'};
 await background.close();
 await fs.writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));
  await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(process.env.YUQI_UI_REPORT||path.join(root,'verification','optimization-ui-v'+report.version.replaceAll('.','')+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),profile,errors},null,2));
 app.exit(results.every(r=>r.passed)&&errors.length===0?0:1);
}
main().catch(async e=>{console.error(e);await fs.writeFile(path.join(profile,'error.txt'),e.stack).catch(()=>{});app.exit(1);});
