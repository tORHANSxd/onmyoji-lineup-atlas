(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.AtlasCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasExact=api;})(globalThis,function(C){
'use strict';
const stats=Object.keys(C.STAT_NAMES),percent=new Set(['crit','critDamage','effectHit','effectResist']),version='exact-3';
const compare=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0;};
const tolerance=x=>1e-7+Math.abs(x)*1e-12;
// Scoped to one immutable worker inventory. Direct callers get a fresh index.
function* inventoryContext(souls,shared){
 shared.inventories??=new WeakMap();let entry=shared.inventories.get(souls);
 if(!entry){entry={};shared.inventories.set(souls,entry);entry.preparation=(function*(){
  const inventory=Object.values(souls),slots=Array.from({length:6},()=>[]),soulKey=new Map(),sampleSlots=Array.from({length:6},()=>[]),counts=Array.from({length:6},()=>new Map());let checkpoint=Date.now();
  for(let i=0;i<inventory.length;i++){
   const q=inventory[i],slot=q.slot-1;slots[slot]?.push(q);
   soulKey.set(q.id,JSON.stringify([q.slot,q.set,q.star,q.level,q.mainStat,stats.map(s=>q.stats[s]||0)]));
   if(sampleSlots[slot]?.length<32&&(counts[slot].get(q.set)||0)<2){sampleSlots[slot].push(q);counts[slot].set(q.set,(counts[slot].get(q.set)||0)+1);}
   if(i%256===0&&Date.now()-checkpoint>=8){yield;checkpoint=Date.now();}
  }
  entry.value={inventory,slots,soulKey,sample:inventory.length<=192?inventory:sampleSlots.flat()};
 })();}
 while(!entry.value){entry.preparation.next();if(!entry.value)yield;}
 return entry.value;
}
// Every eligible instance remains in the search. Yields preserve the complete
// DFS stack; neither a time limit nor heuristic failure is an optimality proof.
function* solve(lineup,account,roster,effects,context){
 const diagnostic=C.matchLineup(lineup,account,roster,effects,{limit:64,width:6,perSet:1,assignmentLimit:1000,inventory:context.sample,approximateInventory:context.sample!==context.inventory,diagnosticHeroLimit:3});
 for(const row of diagnostic.members)row.builds=(row.builds||[]).slice(0,1);
 const roles=(lineup.members||[]).filter(m=>m.occupied!==false&&m.kind==='shikigami').sort((a,b)=>a.index-b.index);
 const inventory=context.inventory,unknown=[];let nodes=0,pruned=0,best=null,bestVector=null,checkpoint=Date.now();
 if(!roles.length||!C.hasParsedContent(lineup))unknown.push('原码尚未解析出完整的式神要求');
 if(!C.inventoryComplete(account))unknown.push('需要完整采集式神和御魂并替换导入，才能证明全局最优或无解');
 const relevant=inventory.filter(q=>roles.some(m=>C.soulEligible(q,m.config)));
 if(relevant.some(q=>q.unknown?.length||!effects.some(e=>e.suitNames.includes(q.set))||Object.values(q.stats).some(v=>!Number.isFinite(v)||v<0)))unknown.push('符合配装筛选的御魂含未识别属性或套装，无法确定结果');
 if(effects.some(e=>!Number.isFinite(e.value)||e.value<0))unknown.push('套装加成数据未完整核实');
 const prepared=[];
 for(const m of roles){
  const owned=C.memberCandidates(m,account),config=m.config||{};
  unknown.push(...C.configUnknown(m.config,effects));
  if(m.borrowed||!m.shikigamiId)unknown.push('协战或成员身份需要补全');
  const heroes=owned.heroes.map(hero=>({hero,base:C.baseFromRoster(hero,roster)}));
  if(heroes.some(h=>!h.base))unknown.push(m.name+'缺少可核验的基础属性');
  if(heroes.some(({base})=>base&&(base.critDamage<1||['attack','hp','defense','speed','crit','critDamage','effectHit','effectResist'].some(s=>!Number.isFinite(base[s])||base[s]<0)||Object.values(base.innate||{}).some(v=>!Number.isFinite(v)||v<0))))unknown.push(m.name+'基础属性异常，不能使用单调指标上界证明');
   const groups=[];
   for(const slot of context.slots){groups.push(slot.filter(q=>!q.unknown?.length&&C.soulEligible(q,config)));if(Date.now()-checkpoint>=8){yield {...diagnostic,assignment:null,ready:false,status:'unknown',label:'正在准备库存',proof:{state:'computing',phase:'preparing',version,nodes,pruned}};checkpoint=Date.now();}}
   prepared.push({m,owned,config,heroes,groups});
  }
 const snapshot=(state='computing')=>{
  const result={...diagnostic,members:diagnostic.members.map(m=>({...m}))};
  result.proof={state,version,nodes,pruned,objective:roles.map(m=>({index:m.index,metricId:m.config?.metricId??null})),vector:bestVector,scope:'完整导出库存中的式神与御魂；阴阳师、契灵与术印仅展示'};
  result.assignment=best;result.ready=!!best;
  const externalReasons=diagnostic.reasons.filter(r=>/导出未包含|来源要求|未提供觉醒|未提供技能|原码中的式神|协战/.test(r));
  result.status=state==='infeasible'?'missing':state==='optimal'&&!externalReasons.length?'available':'unknown';
  result.label=state==='optimal'?'式神御魂最优已证'+(externalReasons.length?' · 其他条件待核对':''):state==='infeasible'?'原码约束无解':state==='blocked'?'缺少证明所需资料':best?'计算中 · 已有可行候选':'计算中 · 尚无可行候选';
  result.reasons=[...new Set([...(state==='optimal'?externalReasons:diagnostic.reasons),...unknown])];
  if(state==='optimal')result.distance=0;
  for(const member of result.members){const build=best?.find(b=>b.index===member.index);if(build){member.status='found';member.builds=[build];member.closest=build;member.reasons=[];member.heroGaps=[];member.suggestions=[];}else if(state==='infeasible'&&roles.some(r=>r.index===member.index)){member.reasons=[...new Set([...member.reasons,'已证明全部要求无法同时满足；下列诊断候选不是达标配装'])];}}
  return result;
 };
 if(unknown.length)return snapshot('blocked');
 // Exchangeable instances have identical effects on every supported constraint.
 // Keep their multiplicity in inventory, but skip permutations of their IDs.
 const soulKey=context.soulKey;
 const maxBonus=Object.fromEntries(stats.map(s=>[s,3*Math.max(0,...effects.filter(e=>e.stat===s).map(e=>e.value))]));
 const usedHeroes=new Set(),usedSouls=new Set(),chosen=[];
 const rankedGroups=new Map();
 // This conservative case has exactly one objective vector. It does not
 // discard candidates before finding a complete, constraint-valid assignment.
 const constantObjective=prepared.every(({config,heroes,groups})=>{
  if(config.metricId==null)return true;
  const keys={2:['effectHit'],3:['effectResist'],7:['speed'],8:['crit'],9:['critDamage'],11:['effectHit','effectResist']}[config.metricId];
  return !!keys&&heroes.length>0&&groups.every(g=>g.length)&&keys.every(k=>
   !effects.some(e=>e.stat===k&&e.value)&&heroes.every(h=>h.base[k]===heroes[0].base[k]&&(h.base.innate?.[k]||0)===(heroes[0].base.innate?.[k]||0))&&
   groups.every(g=>g.every(q=>(q.stats[k]||0)===(groups[0][0].stats[k]||0))));
 });
 // A necessary matching check for every remaining slot. It only rejects a
 // branch when even independent per-slot assignments cannot avoid reuse.
 function remainingPossible(n){
  for(const choices of [prepared.slice(n).map(p=>p.heroes.map(h=>h.hero.instanceId).filter(id=>!usedHeroes.has(id))),...[0,1,2,3,4,5].map(slot=>prepared.slice(n).map(p=>p.groups[slot].filter(q=>!usedSouls.has(q.id)).map(q=>q.id)))]){
   const owners=new Map();
   function assign(i,seen){for(const id of choices[i]){if(seen.has(id))continue;seen.add(id);const old=owners.get(id);if(old==null||assign(old,seen)){owners.set(id,i);return true;}}return false;}
   if(choices.some((_,i)=>!assign(i,new Set())))return false;
  }
  return true;
 }
 function highestValid(build){for(const prior of chosen){const original=roles.find(r=>r.index===prior.index);for(const stat of original.config.highestStats||[])if(build.panel[stat]>prior.rawPanel[stat]-(percent.has(stat)?.001:.1)+1e-8)return false;}return true;}
 function bounds(base,config,picked,suffix,depth){
  const low={...base.innate},high={...base.innate};
  const counts={};for(const q of picked)counts[q.set]=(counts[q.set]||0)+1;
  const lowerBonus={},upperBonus={};
  for(const e of effects){const act=n=>Math.floor(n/(e.cycle||4))+(n%(e.cycle||4)>=2?1:0);for(const set of e.suitNames){lowerBonus[e.stat]=(lowerBonus[e.stat]||0)+act(counts[set]||0)*e.value;upperBonus[e.stat]=(upperBonus[e.stat]||0)+act((counts[set]||0)+(suffix[depth].sets[set]||0))*e.value;}}
  for(const s of stats){low[s]??=0;high[s]??=0;for(const q of picked){low[s]+=q.stats[s]||0;high[s]+=q.stats[s]||0;}low[s]+=suffix[depth].low[s]+(lowerBonus[s]||0);high[s]+=suffix[depth].high[s]+Math.min(maxBonus[s],upperBonus[s]||0);}
  function panel(v){const p={};for(const k of ['attack','hp','defense'])p[k]=base[k]*(1+v[k+'Percent'])+v[k];for(const k of ['speed','crit','critDamage','effectHit','effectResist'])p[k]=base[k]+v[k];const e=config.extraAttributes||{};p.attack=p.attack*(1+(e.attackPercent||0))+(e.attack||0);p.crit+=e.crit||0;p.critDamage+=e.critDamage||0;return p;}
  return [panel(low),panel(high)];
 }
 function setsPossible(config,picked,groups,depth,suffix){
  const counts={};for(const q of picked)counts[q.set]=(counts[q.set]||0)+1;
  for(const r of config.suitRequirements||[]){const effect=effects.find(e=>e.name===r.name||(r.effectId!=null&&e.teamCodeId===r.effectId)),sets=effect?.suitNames||[r.name];if(!sets.some(set=>(counts[set]||0)+(suffix[depth].sets[set]||0)>=r.count))return false;}
  if(config.twoPieceStats?.length&&(depth===0||depth>=4)){
   // Each set is allowed its independent maximum, even when those maxima
   // compete for slots. Failure of this optimistic superset proves failure.
   const optimistic=[];for(const set of new Set([...Object.keys(counts),...Object.keys(suffix[depth].sets)]))for(let i=0;i<(counts[set]||0)+(suffix[depth].sets[set]||0);i++)optimistic.push({set});
   if(!C.suitMatches(optimistic,config,effects))return false;
  }
  return true;
 }
 function* visitMember(n){
  if(n===prepared.length){const vector=chosen.map(b=>b.score??0);if(!bestVector||compare(vector,bestVector)>0){best=structuredClone(chosen);bestVector=vector;yield snapshot();}return;}
  const {m,config,heroes,groups:allGroups}=prepared[n];
  if(bestVector&&compare(chosen.map(b=>b.score??0),bestVector.slice(0,n))<0){pruned++;return;}
  if(!remainingPossible(n)){pruned++;return;}
  const seenHeroes=new Set();
  for(const {hero,base} of heroes){
   if(usedHeroes.has(hero.instanceId))continue;
   const key=JSON.stringify([hero.shikigamiId,hero.level,hero.star,hero.awake,hero.skills,base]);if(seenHeroes.has(key)){pruned++;continue;}seenHeroes.add(key);
   const objective={heroId:hero.shikigamiId,baseAttack:base.attack};
   const rankKey=JSON.stringify([n,base]);let ordered=rankedGroups.get(rankKey);
    if(!ordered){ordered=[];for(const group of allGroups){const ranked=[];for(let i=0;i<group.length;i++){const q=group[i];ranked.push({q,score:C.score(C.panel(base,[q],effects,config.extraAttributes).values,config.metricId,objective)||0});if(i%128===0&&Date.now()-checkpoint>=8){yield snapshot();checkpoint=Date.now();}}ordered.push(ranked.sort((a,b)=>b.score-a.score).map(x=>x.q));}rankedGroups.set(rankKey,ordered);}
   const groups=ordered.map(g=>g.filter(q=>!usedSouls.has(q.id))).sort((a,b)=>a.length-b.length);
   if(groups.some(g=>!g.length)){pruned++;continue;}
   // Sorting finds an incumbent sooner without discarding any candidate.
   const zero=()=>Object.fromEntries(stats.map(s=>[s,0])),suffix=Array(7);suffix[6]={low:zero(),high:zero(),sets:{}};
   for(let i=5;i>=0;i--){const low=zero(),high=zero(),sets={...suffix[i+1].sets};for(const set of new Set(groups[i].map(q=>q.set)))sets[set]=(sets[set]||0)+1;for(const s of stats){let min=Infinity,max=-Infinity;for(const q of groups[i]){min=Math.min(min,q.stats[s]||0);max=Math.max(max,q.stats[s]||0);}low[s]=suffix[i+1].low[s]+min;high[s]=suffix[i+1].high[s]+max;}suffix[i]={low,high,sets};}
   const picked=[],seenStates=new Set();
   function* visitSlot(depth){
     nodes++;if(nodes%64===0&&Date.now()-checkpoint>=8){yield snapshot();checkpoint=Date.now();}
    if(n===prepared.length-1&&depth>=2){
     // On the last member, interchangeable prefixes affect no later soul
     // ownership. Cache exact sums and set counts, never rounded attributes.
     const sums={...base.innate},counts={};for(const q of picked){counts[q.set]=(counts[q.set]||0)+1;for(const [s,v] of Object.entries(q.stats))sums[s]=(sums[s]||0)+v;}
     const key=JSON.stringify([depth,stats.map(s=>sums[s]||0),Object.entries(counts).sort(([a],[b])=>a.localeCompare(b))]);
     if(seenStates.has(key)){pruned++;return;}
     // This bounds memo storage only. Uncached states are still searched.
     if(seenStates.size<2048)seenStates.add(key);
    }
    if(!setsPossible(config,picked,groups,depth,suffix)){pruned++;return;}
    const [lo,hi]=bounds(base,config,picked,suffix,depth);
    for(const prior of chosen)for(const stat of roles.find(r=>r.index===prior.index).config.highestStats||[])if(lo[stat]-tolerance(lo[stat])>prior.rawPanel[stat]-(percent.has(stat)?.001:.1)){pruned++;return;}
    for(const r of config.ranges||[]){const d=r.percentage?100:1;if(r.min!=null&&hi[r.stat]+tolerance(hi[r.stat])<r.min/d||r.max!=null&&lo[r.stat]-tolerance(lo[r.stat])>r.max/d){pruned++;return;}}
    const upper=C.score(hi,config.metricId,objective)??0;
    if(config.targetScore!=null&&upper+tolerance(upper)<config.targetScore){pruned++;return;}
    if(bestVector&&compare(chosen.map(b=>b.score??0),bestVector.slice(0,n))===0&&upper+tolerance(upper)<bestVector[n]){pruned++;return;}
    if(depth===6){
     const p=C.panel(base,picked,effects,config.extraAttributes);
     if(p.unsupported.length||C.equipmentGaps(picked,config,effects).length||C.panelGaps(p.values,config,objective).length)return;
     const build={index:m.index,name:m.name,heroId:hero.instanceId,objective,soulIds:[...picked].sort((a,b)=>a.slot-b.slot).map(q=>q.id),panel:p.values,rawPanel:C.panel(base,picked,effects).values,sets:p.sets,score:C.score(p.values,config.metricId,objective),distance:0,gaps:[]};
     if(!highestValid(build))return;
     usedHeroes.add(hero.instanceId);picked.forEach(q=>usedSouls.add(q.id));chosen.push(build);yield* visitMember(n+1);chosen.pop();picked.forEach(q=>usedSouls.delete(q.id));usedHeroes.delete(hero.instanceId);return;
    }
    const seenSouls=new Set();for(const q of groups[depth]){const key=soulKey.get(q.id);if(seenSouls.has(key)){pruned++;continue;}seenSouls.add(key);picked.push(q);yield* visitSlot(depth+1);picked.pop();}
   }
   yield* visitSlot(0);
  }
 }
  yield snapshot();const traversal=visitMember(0);
  while(true){const step=traversal.next();if(step.done)break;if(constantObjective&&best){traversal.return();return snapshot('optimal');}yield step.value;}
  return snapshot(best?'optimal':'infeasible');
}
// Match actual instances across the whole team, including repeated species and
// incompatible skill requirements. A count per species alone is insufficient.
function heroAvailability(roles,account,{reuseIndex=false}={}){
 C.heroIndex(account,!reuseIndex);
 const owners=new Map(),choices=roles.map(m=>C.memberCandidates(m,account).heroes);
 function assign(i,seen){for(const h of choices[i]){if(seen.has(h.instanceId))continue;seen.add(h.instanceId);const previous=owners.get(h.instanceId);if(previous==null||assign(previous,seen)){owners.set(h.instanceId,i);return true;}}return false;}
 for(let i=0;i<roles.length;i++)assign(i,new Set());
 const matched=new Set(owners.values()),required=new Map(),owned=new Map();
 for(const m of roles)required.set(m.shikigamiId,(required.get(m.shikigamiId)||0)+1);
 for(const [id,rows] of C.heroIndex(account))owned.set(id,rows.length);
 const coverage=[...required].reduce((n,[id,count])=>n+Math.min(count,owned.get(id)||0),0);
 const unknown=!C.inventoryComplete(account,'heroes')||!roles.length||roles.some(m=>m.borrowed||!m.shikigamiId);
 const deficits=unknown?[]:[...required].map(([id,count])=>{const rows=roles.filter(m=>m.shikigamiId===id),have=owned.get(id)||0,ready=roles.filter((m,i)=>m.shikigamiId===id&&matched.has(i)).length;return {id,name:rows[0].name,shortage:Math.max(0,count-have),training:Math.min(count,have)-ready,required:count,owned:have};}).filter(d=>d.shortage||d.training);
 return {state:unknown?'unknown':matched.size===roles.length?'ready':'missing',shortage:unknown?null:roles.length-coverage,training:unknown?null:coverage-matched.size,missing:roles.filter((m,i)=>!matched.has(i)),deficits};
}
function gapCategory(heroes,souls){
 if(heroes==='unknown'||souls==='unknown')return 'unknown';
 if(souls==='pending'||souls==='uncomputed')return 'pending';
 return heroes==='missing'?(souls==='missing'?'both':'hero-only'):(souls==='missing'?'soul-only':'ready');
}
function inspectHeroes(lineup,account,options){
 const roles=(lineup.members||[]).filter(m=>m.occupied!==false&&m.kind==='shikigami'),availability=heroAvailability(roles,account,options);
 const complete=C.hasParsedContent(lineup)&&C.shikigamiRequirementsComplete(lineup)&&roles.every(m=>Array.isArray(m.skills)&&[0,1].includes(m.awakening));
 const heroes=complete?availability.state:'unknown';
 return {availability,assessment:{heroes,souls:'uncomputed',heroShortage:heroes==='unknown'?null:availability.shortage,heroTraining:heroes==='unknown'?null:availability.training,heroDeficits:heroes==='unknown'?[]:availability.deficits}};
}
function soulShortages(roles,account,effects,inventory=Object.values(account.souls)){
 if(!C.inventoryComplete(account,'souls'))return [];
 const knownSets=new Set(effects.flatMap(e=>e.suitNames)),requests=new Map(),deficits=new Map();
 const add=(name,text)=>{if(!deficits.has(name))deficits.set(name,{name,reasons:[]});deficits.get(name).reasons.push(text);};
 for(const m of roles){
  if(m.borrowed||!m.config||C.configUnknown(m.config,effects).length)continue;
  const eligible=inventory.filter(q=>C.soulEligible(q,m.config));
  for(const r of m.config.suitRequirements||[]){
   const effect=effects.find(e=>e.name===r.name||(r.effectId!=null&&e.teamCodeId===r.effectId)),sets=effect?.suitNames||[r.name];
   const available=eligible.filter(q=>sets.includes(q.set)||!knownSets.has(q.set));
   const positions=Math.max(0,...sets.map(set=>new Set(available.filter(q=>q.set===set||!knownSets.has(q.set)).map(q=>q.slot)).size));
   if(positions<r.count)add(r.name,`${m.name}需${r.count}件，符合条件的不同位置最多${positions}个`);
   const key=JSON.stringify([...sets].sort());if(!requests.has(key))requests.set(key,{name:r.name,count:0,ids:new Set()});
   const request=requests.get(key);request.count+=r.count;available.forEach(q=>request.ids.add(q.id));
  }
 }
 for(const r of requests.values())if(r.ids.size<r.count)add(r.name,`同队共需${r.count}件，符合条件的库存最多${r.ids.size}件`);
 return [...deficits.values()].map(d=>({...d,reasons:[...new Set(d.reasons)]}));
}
function* search(lineup,account,roster,effects,shared={}){
 const roles=(lineup.members||[]).filter(m=>m.occupied!==false&&m.kind==='shikigami');
 shared.heroIndex??=C.heroIndex(account,true);
 const {availability,assessment}=inspectHeroes(lineup,account,{reuseIndex:true}),heroes=assessment.heroes;let shortages=[];
 let result,souls='pending';
 const withGaps=(value,extra={})=>({...value,gapCategory:gapCategory(heroes,souls),gapAssessment:{...assessment,souls,soulShortages:shortages,...extra}});
 const preparing={status:'unknown',ready:false,members:[],checks:[],reasons:[],label:'正在准备库存',proof:{state:'computing',phase:'preparing',version,nodes:0,pruned:0}};
 yield withGaps(preparing);
 const preparation=inventoryContext(account.souls,shared);let context;
 while(true){const step=preparation.next();if(step.done){context=step.value;break;}yield withGaps(preparing);}
 shortages=soulShortages(roles,account,effects,context.inventory);
 yield withGaps(preparing);
 const actual=solve(lineup,account,roster,effects,context);
 while(true){const step=actual.next();result=step.value;
  if(result.assignment)souls='ready';else if(result.proof.state==='blocked')souls='unknown';else if(result.proof.state==='infeasible'&&heroes==='ready')souls='missing';
  if(step.done)break;yield withGaps(result);
 }
 if(heroes!=='missing')return withGaps(result);
 // Counterfactual inventory stays local to this calculation. It never changes
 // the user's roster or the actual feasible/optimal assignment.
 const projected={...account,heroes:{...account.heroes}},assumptions=[];
 for(const m of availability.missing){
  const nearest=C.memberCandidates(m,account).nearest;
  const level=m.level??nearest?.level,star=m.star??nearest?.star,awake=m.awakening??nearest?.awake;
  const same=nearest&&nearest.level===level&&nearest.star===star&&nearest.awake===awake;
  const hero={instanceId:'assumed-'+m.index,shikigamiId:m.shikigamiId,level,star,awake,skills:structuredClone(m.skills||[]),...(same?{attrs:nearest.attrs}:{})};
  if(!C.baseFromRoster(hero,roster)){souls='unknown';return withGaps(result,{reason:m.name+'缺少原码培养条件对应的可核验基础属性'});}
  projected.heroes[hero.instanceId]=hero;assumptions.push({index:m.index,name:m.name,level,star,awake});
 }
 souls='pending';const extra={assumptions,scope:'按原码补齐式神条件后，使用当前御魂库存；同队不重复占用'};
 yield withGaps(result,extra);
 const hypothetical=solve(lineup,projected,roster,effects,context);
 while(true){const step=hypothetical.next(),candidate=step.value;
  if(candidate.assignment){souls='ready';hypothetical.return();return withGaps(result,{...extra,assignment:candidate.assignment});}
  if(step.done){souls=candidate.proof.state==='infeasible'?'missing':'unknown';return withGaps(result,{...extra,reason:souls==='unknown'?candidate.reasons.join('；'):''});}
  yield withGaps(result,extra);
 }
}
return {search,version,heroAvailability,gapCategory,inspectHeroes,soulShortages};
});
