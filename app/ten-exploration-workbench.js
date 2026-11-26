(() => {
 'use strict';
 const api=window.dungeonCatalog,source=window.AtlasTenAnniversary;
 const tenRoute={...source.exploreRoute,resourceVersion:source.resourceVersion,actorName:'石长姬'};
 const seeds=AtlasRuneSearch.baseSampleSeeds;
 let pane=null,job=null,runtime=null,checkingRuntime=null;
 const drafts=new Map();

 function readPlan(form){
  return {actorLevel:form.route.actorLevel??form.actor.valueAsNumber,
   members:form.slots.filter(slot=>slot.hero.value).map(slot=>[Number(slot.hero.value),slot.level.valueAsNumber]),
   ...(form.skill?{skillLevel:Number(form.skill.value),masks:form.masks.valueAsNumber}:{})};
 }

 function refresh(){
  if(!pane?.root.isConnected)return;
  const running=job?.form===pane;
  const plan=readPlan(pane),{route}=pane;
  const ready=runtime?.available&&runtime.resourceVersion===route.resourceVersion&&runtime.battleModes?.includes(route.battleMode);
  pane.start.disabled=!ready||runeBusy()||!route.validPlan(plan);
  pane.stop.hidden=!running;
  pane.stop.disabled=!!job?.cancelled;
  if(pane.actor)pane.actor.disabled=running;
  if(pane.skill)pane.skill.disabled=pane.masks.disabled=running;
  if(pane.known)pane.known.disabled=running;
  for(const {hero,level} of pane.slots){
   hero.disabled=running;
   level.disabled=running||!hero.value;
  }
  pane.status.textContent=running?job.message:!runtime?'正在核对本机战斗资源…':
   !ready?'需要与此关卡匹配的本机原版战斗资源。':pane.message||
   (!route.validPlan(plan)&&plan.members.length?'请选择不同的式神并填写活动等级。':'');
 }

 function cancel(){
  if(!job||job.cancelled)return;
  job.cancelled=true;
  job.message='正在停止复跑…';
  refresh();
  void api.stopPve().catch(()=>{});
 }

 async function run(form){
  if(runeBusy())return;
  const plan=readPlan(form),{route}=form;
  if(!route.validPlan(plan))return;
  const next={form,cancelled:false,message:''};
  job=next;
  form.samples=[];
  form.results.replaceChildren();
  try{
   for(const seed of seeds){
    if(next.cancelled)break;
    next.message=`正在复跑种子 ${seed} · ${form.samples.length} / ${seeds.length}`;
    renderDungeonSelection();
    refresh();
    const report=await api.runPve(plan,{battleMode:route.battleMode,stageId:form.stageId,groupId:form.stageId,seed,damageFloor:true});
    if(next.cancelled)break;
    form.samples.push(report);
    form.results.innerHTML=sampleBattleMarkup(form.samples);
   }
   const won=form.samples.filter(report=>report.completed&&report.outcome==='win'&&report.wavesCleared===1).length;
   form.message=next.cancelled?'复跑已停止，已取得的战报保留。':
    `${won} / ${form.samples.length} 个采样种子通关。全随机分支待验证。`;
  }catch(error){
   form.message=next.cancelled?'复跑已停止，已取得的战报保留。':runeError(error);
  }finally{
   job=null;
   renderDungeonSelection();
   refresh();
  }
 }

 function mount(host,stageId,profiles,route=tenRoute){
  if(!api?.pveStatus)return;
  const recruits=new Map(profiles.map(row=>[row.hero_id,row]));
  const draft=drafts.get(route.battleMode)??{actorLevel:route.actorLevel??1,members:[],skillLevel:1,masks:0};
  const root=document.createElement('section');
  root.className='encounter-source';
  root.innerHTML=`<h4>模拟已知活动队伍</h4>
   <p class="caption">按出战顺序选择一至五位已招募式神。${esc(route.actorName)}与式神使用活动等级和固定御魂。</p>
   <div class="actions" data-explore-fields></div>
   <div class="actions"><button type="button" class="secondary" data-explore-start>开始离线模拟</button>
   <button type="button" class="secondary" data-explore-stop hidden>停止复跑</button></div>
   <p class="caption" role="status" data-explore-status></p>
   <ol class="dungeon-stock-samples" data-explore-results></ol>`;
  const fields=root.querySelector('[data-explore-fields]');
  function label(name,element,parent=fields){
   const field=document.createElement('label');
   field.className='pve-lineup-field';
   field.append(name,element);
   parent.append(field);
   return element;
  }
  function levelField(name,min,parent){
   const input=document.createElement('input');
   input.type='number';input.min=String(min);input.max='40';input.step='1';input.value=String(min);
   return label(name,input,parent);
  }
  const compatible=lineups().flatMap(lineup=>{
   if((route.codeStageId!=null&&Number(lineup.gameSceneId)!==route.codeStageId)||!Array.isArray(lineup.members))return [];
   const members=lineup.members.filter(member=>member.kind==='shikigami'&&member.occupied!==false)
    .sort((a,b)=>a.index-b.index).map(member=>Number(member.shikigamiId));
   if(!members.length||members.length>5||new Set(members).size!==members.length||members.some(id=>!recruits.has(id)))return [];
   return [lineup];
  });
  let known;
  if(compatible.length){
   known=label('从已有阵容码读取式神',document.createElement('select'));
   known.dataset.exploreKnown='';
   known.replaceChildren(new Option('手动填写',''),...compatible.map(lineup=>new Option(lineup.title,lineup.id)));
  }
  const actor=route.actorLevel?null:levelField(route.actorName+'活动等级',1);
  if(actor){
   actor.value=String(draft.actorLevel);
   actor.dataset.exploreActor='';
  }
  let skill,masks;
  if(route.maxMasks){
   skill=label('万风钧落等级',document.createElement('select'));
   skill.dataset.exploreSkill='';
   skill.replaceChildren(...[1,2,3].map(value=>new Option(value+' 级',String(value))));
   skill.value=String(draft.skillLevel);
   masks=label('天狗面具数量',document.createElement('input'));
   masks.dataset.exploreMasks='';
   masks.type='number';masks.min='0';masks.max=String(route.maxMasks);masks.step='1';masks.value=String(draft.masks);
  }
  const byName=[...profiles].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  const slots=Array.from({length:5},(_,i)=>{
   const row=document.createElement('div');
   row.className='actions';
   fields.append(row);
   const hero=label(`式神 ${i+1}`,document.createElement('select'),row);
   hero.dataset.exploreRecruit=String(i);
   hero.replaceChildren(new Option('不上阵',''),...byName.map(row=>new Option(row.name,String(row.hero_id))));
   const level=levelField(`式神 ${i+1} 活动等级`,1,row);
   level.dataset.exploreLevel=String(i);
   const set=(id=0,value)=>{
    const recruit=recruits.get(id);
    hero.value=recruit?String(id):'';
    level.min=String(recruit?.init_lv??1);
    level.value=String(value??level.min);
    level.readOnly=recruit?.init_lv===40;
   };
   set(...(draft.members[i]??[]));
   hero.addEventListener('change',()=>set(Number(hero.value)));
   return {hero,level,set};
  });
  const form={root,stageId,route,actor,skill,masks,slots,known,message:'',samples:[],start:root.querySelector('[data-explore-start]'),
   stop:root.querySelector('[data-explore-stop]'),status:root.querySelector('[data-explore-status]'),
   results:root.querySelector('[data-explore-results]')};
  known?.addEventListener('change',()=>{
   const lineup=compatible.find(item=>item.id===known.value);
   if(!lineup)return;
   const members=lineup.members.filter(member=>member.kind==='shikigami'&&member.occupied!==false).sort((a,b)=>a.index-b.index);
   slots.forEach((slot,i)=>slot.set(Number(members[i]?.shikigamiId)));
   form.message='已读取阵容码的式神顺序，请核对活动等级。';
  });
  fields.addEventListener('change',()=>{
   const plan=readPlan(form);
   if(route.validPlan(plan))drafts.set(route.battleMode,plan);
   refresh();
  });
  form.start.addEventListener('click',()=>void run(form));
  form.stop.addEventListener('click',cancel);
  pane=form;
  host.append(root);
  if(!runtime&&!checkingRuntime)checkingRuntime=api.pveStatus().then(status=>{runtime=status;},()=>{runtime={available:false};})
   .finally(()=>{checkingRuntime=null;refresh();});
  refresh();
 }

 window.AtlasTenExploreWorkbench={mount,cancel,refresh,busy:()=>job!==null};
})();
