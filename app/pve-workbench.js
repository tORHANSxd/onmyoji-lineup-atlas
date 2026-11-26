(() => {
 'use strict';
 const api=window.dungeonCatalog;
 const seeds=AtlasRuneSearch.baseSampleSeeds;
 const isDamageMode=AtlasRuneCandidate.damageMode;
 const isWaveMode=mode=>mode===2001;
 let pane=null,job=null,stopping=null,runtime=null,runtimePending=null;

 function checkedLineups(){
  const available=new Map(lineups().map(lineup=>[lineup.id,lineup]));
  return [...selectedLineups].map(id=>available.get(id)).filter(Boolean);
 }

 function matchesCurrentSelection(selected){
  return usesDungeonInventory(job)&&job.selected.length===selected.length&&
   job.selected.every((lineup,index)=>lineup===selected[index]);
 }

 const exhausted=selected=>job?.originalsComplete&&matchesCurrentSelection(selected);
 const busy=()=>!!(job?.running||stopping);
 const active=run=>job===run&&pane===run.pane&&!run.cancelled&&DATA===run.data&&usesDungeonInventory(run);
 const ready=()=>runtime?.available&&runtime.resourceVersion===pane.version&&
  (runtime.battleModes??[3]).includes(pane.battleMode??3);
 const batchCodes=()=>job?.pane===pane&&usesDungeonInventory(job)?(job.codeRows??[...job.previous,...job.rows])
  .flatMap(row=>row.codes).filter(entry=>entry.valid()):[];

 function update(){
  if(!pane)return;
  const selected=checkedLineups(),hasAccount=!!account(),blocked=runeBusy();
  const supported=ready();
  const running=job?.running===true;
  pane.start.hidden=!selected.length;
  pane.start.disabled=!supported||!hasAccount||blocked;
  pane.stock.hidden=selected.length>0&&!exhausted(selected);
  pane.stock.disabled=!supported||!hasAccount||blocked;
  window.AtlasCandidateBatch.configure(pane.autoShare,{available:!pane.stock.hidden,disabled:pane.stock.disabled});
  pane.stop.hidden=!running;
  pane.stop.disabled=job?.cancelled===true;
  const codes=batchCodes();
  pane.batch.hidden=new Set(codes.map(entry=>entry.output.code)).size<2;
  pane.batch.disabled=blocked;
  pane.results.setAttribute('aria-busy',String(running&&!job?.cancelled));
  pane.hint.textContent=running?(job.cancelled?'正在停止复跑…':job.message):
   !supported?(runtime?.reason||(runtime?.available?'本机运行时不支持此版本或战斗模式。':'正在核对本机复跑资料…')):
   !hasAccount?'先导入并选择库存账号。':
   blocked?'已有原版复跑或正在停止，请等待其结束。':
   job?.notice?job.notice+(job.shareNotice?' '+job.shareNotice:''):
   selected.length?`已勾选 ${selected.length} 套阵容，将按勾选顺序${isWaveMode(pane.battleMode)?'每 4 套组成一次接力':'核对'}。`:
   '可直接从库存寻找备选，也可先在阵容库勾选原码。';
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
   job.stopSearch?.();
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
  section.innerHTML=`<h4>用库存离线复跑</h4>
   <p class="caption">${esc(config.label||'通用 PvE 模式 3')} · ${config.memberCount} 位式神 · ${seeds.length} 个采样种子</p>
   <p class="caption" data-pve-status role="status"></p>
   <div class="actions">
    <button class="secondary" type="button" data-pve-start>复跑勾选原码</button>
    <button class="secondary" type="button" data-pve-stock>从库存寻找备选</button>
    <button class="secondary" type="button" data-pve-stop hidden>停止复跑</button>
    <button class="secondary" type="button" data-pve-batch hidden>管理本批阵容码</button>
    <label class="candidate-auto-share" hidden><input type="checkbox" data-pve-auto-share> 本次自找完成后，用当前登录角色上传短码</label>
   </div>
   <ol class="dungeon-battle-list" data-pve-results></ol>`;
  const part=name=>section.querySelector(`[data-pve-${name}]`);
  pane={...config,start:part('start'),stock:part('stock'),stop:part('stop'),batch:part('batch'),autoShare:part('auto-share'),
   hint:part('status'),results:part('results')};
  pane.start.onclick=()=>void run(false);
  pane.stock.onclick=()=>void run(true);
  pane.stop.onclick=()=>cancel();
  pane.batch.onclick=()=>window.AtlasCandidateBatch.open(batchCodes());
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
   report:el.querySelector('ul'),samples:[],codes:[],verdict:'unknown',index:run.rows.length+1};
  run.rows.push(row);
  run.pane.results.append(el);
  return row;
 }

 async function replay(run,row,plan,damageFloor=false,sampleCount=seeds.length){
  const {stageId,groupId,battleMode,retreat,region}=run.pane,scoring=isDamageMode(battleMode),relay=isWaveMode(battleMode);
  const teamKey=relay?AtlasRuneSearch.relayKey(plan):AtlasRuneSearch.teamKey(plan);
  for(const seed of seeds.slice(row.samples.length,sampleCount)){
   if(!active(run))return;
   run.message=scoring?`正在${sampleCount===seeds.length?'复评':'初筛'}第 ${row.index} 套 · 已完成 ${row.samples.length} / ${sampleCount} 场 · 种子 ${seed}`:
    `正在复跑第 ${row.index} 套 · 种子 ${seed}`;
   update();
   let report;
   run.native=true;
   try{report=await api.runPve(plan,{stageId,groupId,seed,...(battleMode?{battleMode}:{}),...(damageFloor?{damageFloor:true}:{}),
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
    run.alternatives.push(teamKey);
    row.state.textContent='原版引擎判定阵容未满足此特殊条件';
    return;
   }
   const ranOut=experience?.timedOut===true;
   if(report.completed&&(report.outcome==='loss'||ranOut)){
    row.verdict='loss';
    run.alternatives.push(teamKey);
    row.state.textContent=ranOut?`种子 ${seed} 超时，击杀 ${experience.kills} / ${experience.requiredKills}`:`种子 ${seed} 未通关`;
    return;
   }
   const objectiveMet=AtlasRuneCandidate.pveGoalMet(report,battleMode);
   if(!report.completed||report.outcome!=='win'||!objectiveMet){
    row.state.textContent=`种子 ${seed} 未取得完整通关记录，可重试`;
    return;
   }
  }
  if(sampleCount<seeds.length){
   row.verdict='screened';
   return;
  }
  row.verdict=(scoring&&AtlasRuneCandidate.damageResult(row.samples)?.credited!==seeds.length||
   relay&&AtlasRuneCandidate.waveResult(row.samples)?.min!==70)?'scored':'pass';
  run.alternatives.push(teamKey);
 }

 async function original(run,lineup){
  const row=addRow(run,lineup.title);
  if(!C.hasParsedContent(lineup)||!C.shikigamiRequirementsComplete(lineup)){
   row.state.textContent='先解析并补齐原码要求';
   return;
  }
  if(run.pane.retreat&&Number(lineup.gameSceneId)!==run.pane.codeStageId){
   row.verdict='infeasible';
   row.state.textContent='阵容码对应的首领与当前演练不同';
   return;
  }
  const members=lineup.members.filter(member=>member.occupied!==false);
  if(members.length!==run.pveMemberCount+1||members.filter(member=>member.kind==='onmyoji').length!==1||
     members.filter(member=>member.kind==='shikigami').length!==run.pveMemberCount){
   row.verdict='infeasible';
   row.state.textContent=`此关需要 1 位阴阳师和 ${run.pveMemberCount} 位式神`;
   return;
  }
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
   await replay(run,row,tactics?{...plan,tactics}:plan,scoring||!!run.pane.region);
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
   await replay(run,row,plan,true);
  }catch(error){
   if(active(run))row.state.textContent=runeError(error);
  }
 }

 function offerCode(run,row,output,team){
  const action=document.createElement('button');
  action.type='button';
  action.className='secondary';
  action.dataset.pveCode='';
  action.textContent=team?`查看第 ${team} 队阵容码`:'查看阵容码';
  const valid=()=>pane===run.pane&&usesDungeonInventory(run)&&
   !!(job?.rows.includes(row)||job?.previous.includes(row));
  row.codes.push({output,valid});
  const save=({create})=>saveCandidateCodes([output],{create,valid:()=>!create||valid()});
  action.onclick=()=>{
   const evidence=team?'该队已在离线接力中上阵 · 全随机分支待验证':
    isDamageMode(run.pane.battleMode)?'个人伤害结算通过采样 · 全随机分支待验证':'离线采样通过 · 全随机分支待验证';
   if(valid())openCandidateCode(output.lineup.title,evidence,output,{
    valid,save,savedMessage:'阵容码已保存到阵容库。',savedDetail:row.el.querySelector('[data-score-tactics]')?.textContent,
   });
  };
  row.el.append(action);
 }

 function addCandidate(run,item){
  const names=item.heroIds.map(id=>run.data.gameConfig.heroes[id]?.name||`式神 ${id}`);
  const row=addRow(run,`${item.title} · ${names.join('、')}`);
  if(item.rounds){
   const names=item.rounds.map(round=>run.data.gameConfig.heroes[round.plan.onmyoji.heroId]?.name).join(' → ');
   row.details.insertAdjacentHTML('beforeend',`<p class="caption">阴阳师按 60 级及满技能计算，出场顺序为 ${esc(names)}。我方伤害浮动取下限。</p>`);
  }else if(run.pane.actorId){
   const name=run.data.gameConfig.heroes[run.pane.actorId]?.name||'指定阴阳师';
   row.details.insertAdjacentHTML('beforeend',`<p class="caption">备选使用 60 级${esc(name)}和满级技能。我方伤害浮动取下限。</p>`);
  }else row.details.insertAdjacentHTML('beforeend','<p class="caption">备选使用 60 级晴明、满级言灵·星和言灵·守。我方伤害浮动取下限。</p>');
  return {item,row};
 }

 async function replayCandidate(run,{item,row},count){
  try{await replay(run,row,item.plan,true,count);}
  catch(error){if(active(run))row.state.textContent=runeError(error);}
 }

 async function makeCandidateCode(run,{item,row}){
  const relay=isWaveMode(run.pane.battleMode),candidate={...item,samples:row.samples};
  if(!active(run)||!(row.verdict==='pass'||relay&&row.verdict==='scored')||!run.pane.codeStageId)return;
  try{
   const drafts=relay?await AtlasRuneCandidate.underworldTemplates(candidate,run.data,run.pane):
    [{request:await AtlasRuneCandidate.pveTemplate(candidate,run.data,run.pane)}];
   for(const {request,team} of drafts){
    if(!active(run))return;
    const output=await window.atlas.buildLineup(request);
    if(!active(run))return;
    if(output.payload?.code!==output.code)throw Error('阵容码与本地解析结果不一致');
    const lineup=C.adaptTA(output.payload,run.data);
    if(Number(lineup.gameSceneId)!==run.pane.codeStageId)throw Error('生成的阵容码未对应本层');
    offerCode(run,row,{...output,lineup},team);
   }
  }catch(error){
   if(active(run))row.details.insertAdjacentHTML('beforeend',`<p class="caption">${esc(runeError(error))}</p>`);
  }
 }

 const damageText=value=>Math.round(value).toLocaleString('zh-CN');

 function scoreChoices(game,hero){
  return AtlasGame.aiChoices(game,{hero_id:hero.heroId,awake:hero.awake,skills:hero.skinfo});
 }

 function showScoreInstructions(row,plan,game){
  const names=plan.members.map(({hero})=>game.heroes[hero.heroId]?.name||`式神 ${hero.heroId}`);
  const {tactics}=plan;
  const opening=AtlasRuneCandidate.scoreInstructions(tactics,plan,game).replace(/第([1-5])位式神/g,(_,slot)=>`${names[slot-1]}（式神第 ${slot} 位）`);
  const skillModes=[{hero:plan.onmyoji,aiSkill:plan.onmyoji.aiSkill},...plan.members].flatMap(({hero,aiSkill},index)=>{
   if(!aiSkill)return [];
   const choice=scoreChoices(game,hero).find(option=>option.value===aiSkill);
   if(!choice)return [];
   const name=index?names[index-1]:game.heroes[hero.heroId]?.name||'阴阳师';
   return [choice.slot?`${name}锁定第 ${choice.slot} 技能（${choice.name}）`:`${name}使用${choice.name}`];
  });
  row.details.insertAdjacentHTML('beforebegin',`<p class="caption" data-score-tactics>${esc(opening||'开场直接自动。')}${esc(skillModes.length?skillModes.join('，')+'。':'')}</p>`);
 }

 async function scoreStock(run,candidates){
  const cards=new Map();
  const {trials,finalists}=await AtlasRuneCandidate.rankedDamageSearch(candidates,run.data.gameConfig,{
   active:()=>active(run),alternatives:run.alternatives,
   async measure(trial,count){
    if(!cards.has(trial))cards.set(trial,addCandidate(run,trial.item));
    const candidate=cards.get(trial);
    candidate.row.verdict='unknown';
    await replayCandidate(run,candidate,count);
    return candidate.row.samples;
   },
  });
  if(!active(run))return;
  for(const trial of trials.filter(trial=>trial.score&&!finalists.includes(trial))){
   const {row}=cards.get(trial);
   row.state.textContent=`初筛 ${trial.samples.length} 场 · 平均伤害 ${damageText(trial.score.average)} · 未进入六场复评`;
   run.alternatives.push(trial.key);
  }
  for(const trial of finalists)await makeCandidateCode(run,cards.get(trial));
 }

 async function stockCandidates(run){
  run.message='正在从已导出的库存生成配装…';
  update();
  const candidates=await generateDungeonStock(run);
  if(!active(run))return;
  if(isDamageMode(run.pane.battleMode))return scoreStock(run,candidates);
  for(const item of candidates){
   if(!active(run))return;
   const candidate=addCandidate(run,item);
   await replayCandidate(run,candidate);
   await makeCandidateCode(run,candidate);
  }
 }

 async function run(useStock){
  if(!pane||runeBusy()||!account()||!ready())return;
  const selected=checkedLineups();
  if(useStock&&selected.length&&!exhausted(selected))return;
  if(!useStock&&!selected.length)return;
  const shareEpoch=useStock?window.AtlasCandidateBatch.takeIntent(pane.autoShare):null;
  const focus=document.activeElement===pane.start||document.activeElement===pane.stock;
  const reuse=useStock&&matchesCurrentSelection(selected);
  const previous=reuse?[...job.previous,...job.rows].filter(row=>row.verdict!=='unknown'):[];
  const alternatives=reuse?[...new Set(job.alternatives)]:[];
  const next=job={pane,data:DATA,account:account(),selected,alternatives,previous,rows:[],running:true,cancelled:false,
   originalsComplete:useStock&&exhausted(selected),pveMemberCount:pane.memberCount,
   pveOpeningSpeed:pane.openingSpeed,pveBattleMode:pane.battleMode,pveActorId:pane.actorId,message:'正在准备库存…'};
  pane.results.replaceChildren(...previous.map(row=>row.el));
  update();
  if(focus)pane.stop.focus();
  renderDungeonSelection();
  try{
   if(useStock)await stockCandidates(next);
   else if(isWaveMode(next.pane.battleMode)){
    for(let i=0;i<selected.length&&active(next);i+=4)await originalRelay(next,selected.slice(i,i+4));
   }else for(const lineup of selected){
    if(!active(next))return;
    await original(next,lineup);
   }
   if(!active(next))return;
   const hunting=isDamageMode(next.pane.battleMode),relay=isWaveMode(next.pane.battleMode);
   const passed=[...next.previous,...next.rows].filter(row=>row.verdict==='pass'||(hunting||relay)&&row.verdict==='scored');
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
   next.codeRows=passed;
   if(!useStock)next.originalsComplete=next.rows.every(row=>['loss','infeasible','scored'].includes(row.verdict));
   next.notice=passed.length?(relay?`${passed.length} 套接力已完成共同采样，按最低清波数排序。全随机分支待验证。`:
    hunting?`${passed.length} 套完成共同采样，按平均伤害排序。全随机分支待验证。`:
    next.pane.region?`${passed.length} 套通过采样，优先显示回合数与承伤未被其他阵容同时超越的备选。全随机分支待验证。`:
    `${passed.length} 套通过采样，已按最慢样本用时排序。全随机分支待验证。`):
    useStock?(next.rows.length?'这一批库存备选未通过全部采样。':'当前库存不足以生成可复跑的新备选。'):
    next.originalsComplete?'勾选原码均未通过，可从库存寻找备选。':
    '勾选原码中有待核对的条件，请处理后重试。';
  }catch(error){if(active(next))next.notice=runeError(error);}
  finally{
   next.running=false;
   if(job===next){
    if(next.cancelled)next.notice='复跑已停止，已取得的战报保留。';
    const restore=document.activeElement===next.pane.stop||next.restoreFocus&&document.activeElement===document.body;
    update();
    if(restore){
     await stopping;
     const button=useStock?next.pane.stock:next.pane.start;
     if(job===next&&!button.hidden&&!button.disabled)button.focus();
    }
    if(active(next))void window.AtlasCandidateBatch.automatic(batchCodes(),shareEpoch,()=>active(next),text=>{
     next.shareNotice=text;update();
    });
   }
   renderDungeonSelection();
  }
 }

 window.AtlasPveWorkbench={busy,mount,unmount,refresh:update,cancel,reset:()=>cancel(true)};
})();
