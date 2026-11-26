(() => {
 'use strict';
 const api=window.dungeonCatalog;
 const seeds=AtlasRuneSearch.baseSampleSeeds;
 const isDamageMode=AtlasRuneCandidate.damageMode;
 const isWaveMode=mode=>mode===2001;
 let pane=null,job=null,stopping=null,runtime=null,runtimePending=null;

 function replayableLineup(lineup,config){
  if((config.codeStageId!=null&&Number(lineup.gameSceneId)!==config.codeStageId)||
     !C.hasParsedContent(lineup)||!C.shikigamiRequirementsComplete(lineup))return false;
  const members=lineup.members.filter(member=>member.occupied!==false);
  return members.length===config.memberCount+1&&members.filter(member=>member.kind==='onmyoji').length===1&&
   members.filter(member=>member.kind==='shikigami').length===config.memberCount;
 }

 function knownLineups(){
  return lineups().filter(lineup=>replayableLineup(lineup,pane));
 }

 function selectedForReplay(available){
  const byId=new Map(available.map(lineup=>[lineup.id,lineup]));
  return (pane.lineup.value?[pane.lineup.value]:[...selectedLineups]).map(id=>byId.get(id)).filter(Boolean);
 }

 const busy=()=>!!(job?.running||stopping);
 const active=run=>job===run&&pane===run.pane&&!run.cancelled&&DATA===run.data&&usesDungeonInventory(run);
 const ready=()=>runtime?.available&&runtime.resourceVersion===pane.version&&
  (runtime.battleModes??[3]).includes(pane.battleMode??3);
 function update(){
  if(!pane)return;
  const available=knownLineups(),hasAccount=!!account(),blocked=runeBusy();
  const supported=ready();
  const running=job?.running===true;
  const options=JSON.stringify(available.map(({id,title})=>[id,title]));
  if(pane.options!==options){
   const previous=pane.lineup.value;
   const placeholder=new Option('使用阵容库已勾选项','');
   pane.lineup.replaceChildren(placeholder,...available.map(({title,id})=>new Option(title,id)));
   if(available.some(({id})=>id===previous))pane.lineup.value=previous;
   pane.options=options;
  }
  const selected=selectedForReplay(available);
  pane.lineup.disabled=blocked||!available.length;
  pane.start.disabled=!supported||!hasAccount||blocked||!selected.length;
  pane.stop.hidden=!running;
  pane.stop.disabled=job?.cancelled===true;
  pane.results.setAttribute('aria-busy',String(running&&!job?.cancelled));
  pane.hint.textContent=running?(job.cancelled?'正在停止复跑…':job.message):
   !supported?(runtime?.reason||(runtime?.available?'本机运行时不支持此版本或战斗模式。':'正在核对本机复跑资料…')):
   !hasAccount?'先导入并选择库存账号。':
   blocked?'已有原版复跑或正在停止，请等待其结束。':
   job?.notice?job.notice:
   selected.length?`已选 ${selected.length} 套已知阵容，将使用当前账号库存${isWaveMode(pane.battleMode)?'按勾选顺序接力':'复跑'}。`:
   available.length?'从下拉列表选择，或先在阵容库勾选对应阵容。':'阵容库暂无可用于此副本的完整阵容。请先解析或手动制作阵容码。';
 }

 function refreshRuntime(){
  if(runtime?.available||runtimePending)return;
  runtimePending=api.pveStatus().then(status=>{runtime=status;},
   ()=>{runtime={available:false,reason:'本机 PvE 复跑组件不可用'};}).finally(()=>{runtimePending=null;update();});
 }

 function cancel(clear=false){
  if(job?.running&&!job.cancelled){
   job.restoreFocus ||= document.activeElement===job.pane.stop;
   job.cancelled=true;
   job.stopWorker?.();
   if(job.native&&!stopping)stopping=api.stopPve().catch(()=>{}).finally(()=>{
    stopping=null;update();if(DATA)renderDungeonSelection();
   });
  }
  if(clear){
   job=null;
   pane?.results.replaceChildren();
  }
  update();
 }

 function mount(target,config){
  if(!api?.pveStatus)return;
  cancel(true);
  const section=document.createElement('section');
  section.className='encounter-source';
  section.innerHTML=`<h4>模拟已知阵容</h4>
   <p class="caption">${esc(config.label||'通用 PvE 模式 3')} · ${config.memberCount} 位式神 · ${seeds.length} 个采样种子${config.scoreWindowSeconds?
    ` · ${config.retreat?'自定':'原版'}计分窗口 ${Number(config.scoreWindowSeconds).toLocaleString('zh-CN')} 秒`:''}</p>
   <p class="caption" data-pve-status role="status"></p>
   <div class="actions">
    <label class="pve-lineup-field">已知阵容 <select data-pve-lineup></select></label>
    <button class="secondary" type="button" data-pve-start>开始离线模拟</button>
    <button class="secondary" type="button" data-pve-stop hidden>停止复跑</button>
   </div>
   <ol class="dungeon-battle-list" data-pve-results></ol>`;
  const part=name=>section.querySelector(`[data-pve-${name}]`);
  pane={...config,start:part('start'),lineup:part('lineup'),stop:part('stop'),
   hint:part('status'),results:part('results')};
  pane.start.onclick=()=>void run();
  pane.lineup.onchange=()=>{
   if(job&&!busy())job.notice=null;
   update();
  };
  pane.stop.onclick=()=>cancel();
  target.append(section);
  refreshRuntime();
  update();
 }

 function unmount(){
  cancel(true);
  pane=null;
 }

 function addRow(run,title){
  const el=document.createElement('li');
  el.innerHTML=`<strong>${esc(title)}</strong><span data-state></span>
   <details hidden><summary>查看采样战报</summary><ul class="dungeon-stock-samples"></ul></details>`;
  const row={el,state:el.querySelector('[data-state]'),details:el.querySelector('details'),
   report:el.querySelector('ul'),samples:[],verdict:'unknown',index:run.rows.length+1};
  run.rows.push(row);
  run.pane.results.append(el);
  return row;
 }

 async function replay(run,row,plan){
  const {stageId,groupId,battleMode,retreat,region}=run.pane,scoring=isDamageMode(battleMode),relay=isWaveMode(battleMode);
  for(const seed of seeds){
   if(!active(run))return;
   run.message=`正在复跑第 ${row.index} 套 · 种子 ${seed}`;
   update();
   let report;
   run.native=true;
   try{report=await api.runPve(plan,{stageId,groupId,seed,damageFloor:true,...(battleMode?{battleMode}:{}),
    ...(retreat?{retreat}:{}),...(region?{region}:{})});}
   finally{run.native=false;}
   if(!active(run))return;
   row.samples.push(report);
   row.details.hidden=false;
   if(scoring&&row.samples.length===1&&AtlasRuneCandidate.damageResult([report]))showScoreInstructions(row,plan,run.data.gameConfig);
   row.report.innerHTML=sampleBattleMarkup(row.samples);
   row.state.textContent=`已复跑 ${row.samples.length} / ${seeds.length} 个种子`;
   if(scoring){
    if(AtlasRuneCandidate.damageResult([report]))continue;
    row.state.textContent=`种子 ${seed} 未取得完整伤害战报，可重试`;
    return;
   }
   if(relay){
    if(AtlasRuneCandidate.waveResult([report]))continue;
    row.state.textContent=`种子 ${seed} 未取得完整波次结算，可重试`;
    return;
   }
   const experience=report.experience;
   if(report.regionalBoss?.eligible===false){
    row.verdict='infeasible';
    row.state.textContent='原版引擎判定阵容未满足此特殊条件';
    return;
   }
   const ranOut=(experience??report.coins)?.timedOut===true;
   if(report.completed&&(report.outcome==='loss'||ranOut)){
    row.verdict='loss';
    row.state.textContent=ranOut?`种子 ${seed} 超时`+(experience?`，击杀 ${experience.kills} / ${experience.requiredKills}`:''):`种子 ${seed} 未通关`;
    return;
   }
   const objectiveMet=AtlasRuneCandidate.pveGoalMet(report,battleMode);
   if(!report.completed||report.outcome!=='win'||!objectiveMet){
    row.state.textContent=`种子 ${seed} 未取得完整通关记录，可重试`;
    return;
   }
  }
  row.verdict=(scoring&&AtlasRuneCandidate.damageResult(row.samples)?.credited!==seeds.length||
   relay&&AtlasRuneCandidate.waveResult(row.samples)?.min!==70)?'scored':'pass';
 }

 async function original(run,lineup){
  const row=addRow(run,lineup.title);
  try{
   row.state.textContent='正在精算库存…';
   run.message=`正在精算第 ${run.rows.length} / ${run.selected.length} 套原码`;
   update();
   const result=await solveInventoryLineup(lineup,run);
   if(!active(run))return;
   if(!result.ready){
    row.verdict=result.proof?.state==='infeasible'?'infeasible':'unknown';
    row.state.textContent=row.verdict==='infeasible'?'库存精算已证明原码约束无解':'库存精算仍有条件待核对';
    return;
   }
   row.details.insertAdjacentHTML('beforeend','<p class="caption">阴阳师按原码培养和技能复跑。普攻等级缺失时使用客户端最低等级。</p>');
   const plan=AtlasRuneLineup.selectedTeam(lineup,result,run.account,run.data.gameConfig,run.pveMemberCount);
   if(run.pane.actorId&&plan.onmyoji.heroId!==run.pane.actorId){
    row.verdict='infeasible';
    row.state.textContent='阵容码的阴阳师与本场指定阴阳师不同';
    return;
   }
   const scoring=isDamageMode(run.pane.battleMode);
   const tactics=scoring&&Number(lineup.gameSceneId)===run.pane.codeStageId&&AtlasRuneCandidate.readScoreInstructions(lineup.notes);
   await replay(run,row,tactics?{...plan,tactics}:plan);
  }catch(error){
   if(active(run))row.state.textContent=runeError(error);
  }
 }

 async function originalRelay(run,lineups){
  const row=addRow(run,lineups.map(lineup=>lineup.title).join(' → '));
  try{
   const pair=AtlasRuneLineup.underworldLineups(lineups);
   row.state.textContent='正在精算各队共享库存…';
   const result=await solveInventoryLineup(pair.combined,run);
   if(!active(run))return;
   if(!result.ready){
    if(result.proof?.state==='infeasible')row.verdict='infeasible';
    row.state.textContent=row.verdict==='infeasible'?'库存精算已证明接力配装无解':'接力配装仍有条件待核对';
    return;
   }
   const plan=AtlasRuneLineup.underworldPlan(pair,result,run.account,run.data.gameConfig);
   row.details.insertAdjacentHTML('beforeend','<p class="caption">阴阳师按原码配置复跑。原版禁用规则按本次提供的阴阳师计算。</p>');
   await replay(run,row,plan);
  }catch(error){
   if(active(run))row.state.textContent=runeError(error);
  }
 }

 const damageText=value=>Math.round(value).toLocaleString('zh-CN');

 function scoreChoices(game,hero){
  return AtlasGame.aiChoices(game,{hero_id:hero.heroId,awake:hero.awake,skills:hero.skinfo});
 }

 function showScoreInstructions(row,plan,game){
  const names=plan.members.map(({hero})=>game.heroes[hero.heroId]?.name||`式神 ${hero.heroId}`);
  const {tactics}=plan;
  const opening=AtlasRuneCandidate.scoreInstructions(tactics,plan,game).replace(/第([1-6])位式神/g,(_,slot)=>`${names[slot-1]}（式神第 ${slot} 位）`);
  const skillModes=[{hero:plan.onmyoji,aiSkill:plan.onmyoji.aiSkill},...plan.members].flatMap(({hero,aiSkill},index)=>{
   if(!aiSkill)return [];
   const choice=scoreChoices(game,hero).find(option=>option.value===aiSkill);
   if(!choice)return [];
   const name=index?names[index-1]:game.heroes[hero.heroId]?.name||'阴阳师';
   return [choice.slot?`${name}锁定第 ${choice.slot} 技能（${choice.name}）`:`${name}使用${choice.name}`];
  });
  row.details.insertAdjacentHTML('beforebegin',`<p class="caption" data-score-tactics>${esc(opening||'开场直接自动。')}${esc(skillModes.length?skillModes.join('，')+'。':'')}</p>`);
 }

 async function run(){
  if(!pane||runeBusy()||!account()||!ready())return;
  const selected=selectedForReplay(knownLineups());
  if(!selected.length)return;
  const focus=document.activeElement===pane.start;
  const next=job={pane,data:DATA,account:account(),selected,rows:[],running:true,cancelled:false,
   pveMemberCount:pane.memberCount,message:'正在准备库存…'};
  pane.results.replaceChildren();
  update();
  if(focus)pane.stop.focus();
  renderDungeonSelection();
  try{
   if(isWaveMode(next.pane.battleMode)){
    for(let i=0;i<selected.length&&active(next);i+=4)await originalRelay(next,selected.slice(i,i+4));
   }else for(const lineup of selected){
    if(!active(next))return;
    await original(next,lineup);
   }
   if(!active(next))return;
   const hunting=isDamageMode(next.pane.battleMode),relay=isWaveMode(next.pane.battleMode);
   const passed=next.rows.filter(row=>row.verdict==='pass'||(hunting||relay)&&row.verdict==='scored');
   const timing=hunting?null:AtlasRuneCandidate.commonSampleTiming(passed);
   const huntScores=new Map(hunting?passed.map(row=>[row,AtlasRuneCandidate.damageResult(row.samples)]):[]);
   const waveScores=new Map(relay?passed.map(row=>[row,AtlasRuneCandidate.waveResult(row.samples)]):[]);
   const regionScores=new Map(next.pane.region?passed.map(row=>[row,AtlasRuneCandidate.regionalResult(row.samples)]):[]);
   const dominated=new Set([...regionScores].filter(([row,score])=>[...regionScores].some(([other,otherScore])=>
    other!==row&&AtlasRuneCandidate.regionalDominates(otherScore,score))).map(([row])=>row));
   passed.sort(relay?(a,b)=>{
    const first=waveScores.get(a),second=waveScores.get(b);
    return second.min-first.min||second.average-first.average||second.max-first.max||timing.get(a).seconds-timing.get(b).seconds;
   }:hunting?(a,b)=>AtlasRuneCandidate.compareDamage(huntScores.get(a),huntScores.get(b)):
    (a,b)=>Number(dominated.has(a))-Number(dominated.has(b))||timing.get(a).seconds-timing.get(b).seconds);
   for(const row of passed){
    const waves=waveScores.get(row);
    if(waves){
     const time=timing.get(row);
     row.state.textContent=`最低 ${waves.min} 波 · 平均 ${waves.average.toFixed(1)} 波 · 最高 ${waves.max} 波 · ${seeds.length} 场`+
      (waves.min===70?` · 最慢 ${time.combat?'开战至结算':'引擎全程'} ${time.seconds.toFixed(2)} 秒`:'');
     continue;
    }
    const score=huntScores.get(row);
    if(score){
     const cleared=row.samples.every(report=>report.wavesCleared===report.waveCount);
     row.state.textContent=`${score.credited} / ${seeds.length} 场有效结算 · ${cleared?'均清场':'含未清场样本'} · 平均伤害 ${damageText(score.average)} · `+
      `单场最高 ${damageText(score.max)} · 最低 ${damageText(score.min)}`;
     continue;
    }
    const time=timing.get(row);
    const timeLabel=`最慢种子 ${time.seed} · ${time.combat?'开战至结算':'引擎全程'} ${time.seconds.toFixed(2)} 秒`;
    const region=regionScores.get(row);
    if(region){
     const range=(min,max)=>min===max?damageText(min):`${damageText(min)}–${damageText(max)}`;
     row.state.textContent=`${seeds.length} 场全胜 · ${range(...region.rounds)} 回合 · 承伤 ${range(...region.damage.map(Math.round))} · ${timeLabel}`+
      (dominated.has(row)?' · 有备选在回合数与承伤两项上占优':'');
     continue;
    }
    row.state.textContent=`通过 ${seeds.length} 个采样种子 · ${timeLabel}`;
   }
   next.pane.results.prepend(...passed.map(row=>row.el));
   next.notice=passed.length?(relay?`${passed.length} 套接力已完成共同采样，按最低清波数排序。全随机分支待验证。`:
    hunting?`${passed.length} 套完成共同采样，按窗口内的单场最高伤害排序。全随机分支待验证。`:
    next.pane.region?`${passed.length} 套通过采样，优先显示回合数与承伤未被其他阵容同时超越的阵容。全随机分支待验证。`:
    `${passed.length} 套通过采样，已按最慢样本用时排序。全随机分支待验证。`):
    next.rows.some(row=>row.verdict==='unknown')?'部分阵容的库存或结算有待核对，请查看战报。':'所选阵容未通过本次采样。';
  }catch(error){if(active(next))next.notice=runeError(error);}
  finally{
   next.running=false;
   if(job===next){
    if(next.cancelled)next.notice='复跑已停止，已取得的战报保留。';
    const restore=document.activeElement===next.pane.stop||next.restoreFocus&&document.activeElement===document.body;
    update();
    if(restore){
     await stopping;
     const button=next.pane.start;
     if(job===next&&!button.hidden&&!button.disabled)button.focus();
    }

   }
   renderDungeonSelection();
  }
 }

 window.AtlasPveWorkbench={busy,mount,unmount,refresh:update,cancel,reset:()=>cancel(true)};
})();
