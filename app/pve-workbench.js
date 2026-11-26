(() => {
 'use strict';
 const api=window.dungeonCatalog;
 const seeds=AtlasRuneSearch.baseSampleSeeds;
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

 function update(){
  if(!pane)return;
  const selected=checkedLineups(),hasAccount=!!account(),blocked=runeBusy();
  const supported=ready();
  const running=job?.running===true;
  pane.start.hidden=!selected.length;
  pane.start.disabled=!supported||!hasAccount||blocked;
  pane.stock.hidden=selected.length>0&&!exhausted(selected);
  pane.stock.disabled=!supported||!hasAccount||blocked;
  pane.stop.hidden=!running;
  pane.stop.disabled=job?.cancelled===true;
  pane.results.setAttribute('aria-busy',String(running&&!job?.cancelled));
  pane.hint.textContent=running?(job.cancelled?'正在停止复跑…':job.message):
   !supported?(runtime?.reason||(runtime?.available?'本机运行时不支持此版本或战斗模式。':'正在核对本机复跑资料…')):
   !hasAccount?'先导入并选择库存账号。':
   blocked?'已有原版复跑或正在停止，请等待其结束。':
   job?.notice?job.notice:
   selected.length?`已勾选 ${selected.length} 套阵容，将按勾选顺序核对。`:
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
   </div>
   <ol class="dungeon-battle-list" data-pve-results></ol>`;
  const part=name=>section.querySelector(`[data-pve-${name}]`);
  pane={...config,start:part('start'),stock:part('stock'),stop:part('stop'),hint:part('status'),results:part('results')};
  pane.start.onclick=()=>void run(false);
  pane.stock.onclick=()=>void run(true);
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
   report:el.querySelector('ul'),samples:[],verdict:'unknown'};
  run.rows.push(row);
  run.pane.results.append(el);
  return row;
 }

 async function replay(run,row,plan){
  const teamKey=AtlasRuneSearch.teamKey(plan);
  for(const seed of seeds){
   if(!active(run))return;
   run.message=`正在复跑第 ${run.rows.length} 套 · 种子 ${seed}`;
   update();
   let report;
   run.native=true;
   const {stageId,groupId,battleMode}=run.pane;
   try{report=await api.runPve(plan,{stageId,groupId,seed,...(battleMode?{battleMode}:{})});}
   finally{run.native=false;}
   if(!active(run))return;
   row.samples.push(report);
   row.details.hidden=false;
   row.report.innerHTML=sampleBattleMarkup(row.samples);
   row.state.textContent=`已复跑 ${row.samples.length} / ${seeds.length} 个种子`;
   if(report.completed&&report.outcome==='loss'){
    row.verdict='loss';
    run.alternatives.push(teamKey);
    row.state.textContent=`种子 ${seed} 未通关`;
    return;
   }
   if(!report.completed||report.outcome!=='win'||report.wavesCleared!==report.waveCount){
    row.state.textContent=`种子 ${seed} 未取得完整通关记录，可重试`;
    return;
   }
  }
  row.verdict='pass';
  run.alternatives.push(teamKey);
 }

 async function original(run,lineup){
  const row=addRow(run,lineup.title);
  if(!C.hasParsedContent(lineup)||!C.shikigamiRequirementsComplete(lineup)){
   row.state.textContent='先解析并补齐原码要求';
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
   await replay(run,row,plan);
  }catch(error){
   if(active(run))row.state.textContent=runeError(error);
  }
 }

 function offerCode(run,row,output){
  const action=document.createElement('button');
  action.type='button';
  action.className='secondary';
  action.dataset.pveCode='';
  action.textContent='查看阵容码';
  const valid=()=>pane===run.pane&&usesDungeonInventory(run)&&
   !!(job?.rows.includes(row)||job?.previous.includes(row));
  async function save({create}){
   if(libraryBusy||bulkBusy)return false;
   const current=()=>create?valid():STATE.lineups.some(lineup=>lineup.code===output.code);
   if(!current())return false;
   const saved=await commitState(state=>{
    const old=state.lineups.find(lineup=>lineup.code===output.code);
    if(!create)return {...state,lineups:state.lineups.map(lineup=>
     lineup===old?{...old,shortCode:output.shortCode}:lineup)};
    const now=new Date().toISOString();
    const lineup={...output.lineup,...old,id:old?.id||'user-'+crypto.randomUUID(),sourceKind:'user',
     shortCode:output.shortCode||old?.shortCode,createdAt:old?.createdAt||now,updatedAt:now};
    return {...state,lineups:old?state.lineups.map(item=>item===old?lineup:item):[...state.lineups,lineup]};
   },sessionRevision,null,null,current);
   if(saved){fillFilters();renderManage();}
   return saved;
  }
  action.onclick=()=>{
   if(valid())openCandidateCode(output.lineup.title,'离线采样通过 · 全随机分支待验证',output,{
    valid,save,savedMessage:'阵容码已保存到阵容库。',
   });
  };
  row.el.append(action);
 }

 async function stockCandidates(run){
  run.message='正在从已导出的库存生成配装…';
  update();
  const candidates=await generateDungeonStock(run);
  if(!active(run))return;
  for(const item of candidates){
   if(!active(run))return;
   const names=item.heroIds.map(id=>run.data.gameConfig.heroes[id]?.name||`式神 ${id}`);
   const row=addRow(run,`${item.title} · ${names.join('、')}`);
   row.details.insertAdjacentHTML('beforeend','<p class="caption">备选使用 60 级晴明、满级言灵·星和言灵·守。</p>');
   try{await replay(run,row,item.plan);}
   catch(error){if(active(run))row.state.textContent=runeError(error);}
   if(!active(run)||row.verdict!=='pass'||!run.pane.codeStageId)continue;
   try{
    const request=await AtlasRuneCandidate.pveTemplate({...item,samples:row.samples},run.data,run.pane);
    if(!active(run))return;
    const output=await window.atlas.buildLineup(request);
    if(!active(run))return;
    if(output.payload?.code!==output.code)throw Error('阵容码与本地解析结果不一致');
    const lineup=C.adaptTA(output.payload,run.data);
    if(Number(lineup.gameSceneId)!==run.pane.codeStageId)throw Error('生成的阵容码未对应本层');
    offerCode(run,row,{...output,lineup});
   }catch(error){
    if(active(run))row.details.insertAdjacentHTML('beforeend',`<p class="caption">${esc(runeError(error))}</p>`);
   }
  }
 }

 async function run(useStock){
  if(!pane||runeBusy()||!account()||!ready())return;
  const selected=checkedLineups();
  if(useStock&&selected.length&&!exhausted(selected))return;
  if(!useStock&&!selected.length)return;
  const focus=document.activeElement===pane.start||document.activeElement===pane.stock;
  const reuse=useStock&&matchesCurrentSelection(selected);
  const previous=reuse?[...job.previous,...job.rows].filter(row=>row.verdict!=='unknown'):[];
  const alternatives=reuse?[...new Set(job.alternatives)]:[];
  const next=job={pane,data:DATA,account:account(),selected,alternatives,previous,rows:[],running:true,cancelled:false,
   originalsComplete:useStock&&exhausted(selected),pveMemberCount:pane.memberCount,
   pveOpeningSpeed:pane.openingSpeed,message:'正在准备库存…'};
  pane.results.replaceChildren(...previous.map(row=>row.el));
  update();
  if(focus)pane.stop.focus();
  renderDungeonSelection();
  try{
   if(useStock)await stockCandidates(next);
   else for(const lineup of selected){
    if(!active(next))return;
    await original(next,lineup);
   }
   if(!active(next))return;
   const passed=[...next.previous,...next.rows].filter(row=>row.verdict==='pass');
   const timing=AtlasRuneCandidate.commonSampleTiming(passed);
   passed.sort((a,b)=>timing.get(a).seconds-timing.get(b).seconds);
   for(const row of passed){
    const time=timing.get(row);
    row.state.textContent=`通过 ${seeds.length} 个采样种子 · 最慢种子 ${time.seed} · ${time.combat?'开战至结算':'引擎全程'} ${time.seconds.toFixed(2)} 秒`;
   }
   next.pane.results.prepend(...passed.map(row=>row.el));
   if(!useStock)next.originalsComplete=next.rows.every(row=>['loss','infeasible'].includes(row.verdict));
   next.notice=passed.length?`${passed.length} 套通过采样，已按最慢样本用时排序。全随机分支待验证。`:
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
   }
   renderDungeonSelection();
  }
 }

 window.AtlasPveWorkbench={busy,mount,unmount,refresh:update,cancel,reset:()=>cancel(true)};
})();
