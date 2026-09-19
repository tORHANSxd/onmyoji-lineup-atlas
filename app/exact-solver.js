(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.AtlasCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasExact=api;})(globalThis,function(C){
'use strict';
const stats=Object.keys(C.STAT_NAMES),percent=new Set(['crit','critDamage','effectHit','effectResist']),version='exact-1';
const compare=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0;};
const tolerance=x=>1e-7+Math.abs(x)*1e-12;
// Every eligible instance remains in the search. Yields preserve the complete
// DFS stack; neither a time limit nor heuristic failure is an optimality proof.
function* solve(lineup,account,roster,effects){
 const diagnostic=C.matchLineup(lineup,account,roster,effects,{limit:64,width:6,perSet:1,assignmentLimit:1000});
 for(const row of diagnostic.members)row.builds=(row.builds||[]).slice(0,1);
 const roles=(lineup.members||[]).filter(m=>m.occupied!==false&&m.kind==='shikigami').sort((a,b)=>a.index-b.index);
 const inventory=Object.values(account.souls),unknown=[];let nodes=0,pruned=0,best=null,bestVector=null;
 if(!roles.length||!C.hasParsedContent(lineup))unknown.push('原码尚未解析出完整的式神要求');
 if(account.completeness!=='complete'||account.merged)unknown.push('需要完整替换导出的库存，才能证明全局最优或无解');
 if(inventory.some(q=>q.unknown?.length||!effects.some(e=>e.suitNames.includes(q.set))||Object.values(q.stats).some(v=>!Number.isFinite(v)||v<0)))unknown.push('库存含未识别御魂属性或套装，不能排除更优解');
 if(effects.some(e=>!Number.isFinite(e.value)||e.value<0))unknown.push('套装加成数据未完整核实');
 const prepared=roles.map(m=>{
  const owned=C.memberCandidates(m,account),config=m.config||{};
  unknown.push(...C.configUnknown(m.config,effects));
  if(m.borrowed||!m.shikigamiId)unknown.push('协战或成员身份需要补全');
  const heroes=owned.heroes.map(hero=>({hero,base:C.baseFromRoster(hero,roster)}));
  if(heroes.some(h=>!h.base))unknown.push(m.name+'缺少可核验的基础属性');
  if(heroes.some(({base})=>base&&(['attack','hp','defense','speed','crit','critDamage','effectHit','effectResist'].some(s=>!Number.isFinite(base[s])||base[s]<0)||Object.values(base.innate||{}).some(v=>!Number.isFinite(v)||v<0))))unknown.push(m.name+'基础属性异常，不能使用单调指标上界证明');
  const range=config.levelRange||[config.maxLevelOnly?15:0,15];
  const groups=[1,2,3,4,5,6].map(slot=>inventory.filter(q=>q.slot===slot&&!q.unknown?.length&&(!config.sixStarOnly||q.star===6)&&(!config.allowedStars?.length||config.allowedStars.includes(q.star))&&q.level>=range[0]&&q.level<=range[1]&&(!config.mainStats?.[slot]?.length||config.mainStats[slot].includes(q.mainStat))));
  return {m,owned,config,heroes,groups};
 });
 const snapshot=(state='computing')=>{
  const result=structuredClone(diagnostic);
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
 const soulKey=new Map(inventory.map(q=>[q.id,JSON.stringify([q.slot,q.set,q.star,q.level,q.mainStat,stats.map(s=>q.stats[s]||0)])]));
 const maxBonus=Object.fromEntries(stats.map(s=>[s,3*Math.max(0,...effects.filter(e=>e.stat===s).map(e=>e.value))]));
 const usedHeroes=new Set(),usedSouls=new Set(),chosen=[];
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
 function setsPossible(config,picked,groups,depth){
  const counts={};for(const q of picked)counts[q.set]=(counts[q.set]||0)+1;
  for(const r of config.suitRequirements||[]){const effect=effects.find(e=>e.name===r.name||(r.effectId!=null&&e.teamCodeId===r.effectId)),sets=effect?.suitNames||[r.name];if(!sets.some(set=>(counts[set]||0)+groups.slice(depth).filter(g=>g.some(q=>q.set===set)).length>=r.count))return false;}return true;
 }
 function* visitMember(n){
  if(n===prepared.length){const vector=chosen.map(b=>b.score??0);if(!bestVector||compare(vector,bestVector)>0){best=structuredClone(chosen);bestVector=vector;yield snapshot();}return;}
  const {m,config,heroes,groups:allGroups}=prepared[n];
  if(bestVector&&compare(chosen.map(b=>b.score??0),bestVector.slice(0,n))<0){pruned++;return;}
  const seenHeroes=new Set();
  for(const {hero,base} of heroes){
   if(usedHeroes.has(hero.instanceId))continue;
   const key=JSON.stringify([hero.shikigamiId,hero.level,hero.star,hero.awake,hero.skills,base]);if(seenHeroes.has(key)){pruned++;continue;}seenHeroes.add(key);
   const groups=allGroups.map(g=>g.filter(q=>!usedSouls.has(q.id))).sort((a,b)=>a.length-b.length);
   if(groups.some(g=>!g.length)){pruned++;continue;}
   // Sorting finds an incumbent sooner without discarding any candidate.
   for(const group of groups){const rank=new Map(group.map(q=>[q.id,C.score(C.panel(base,[q],effects,config.extraAttributes).values,config.metricId)||0]));group.sort((a,b)=>rank.get(b.id)-rank.get(a.id));}
   const zero=()=>Object.fromEntries(stats.map(s=>[s,0])),suffix=Array(7);suffix[6]={low:zero(),high:zero(),sets:{}};
   for(let i=5;i>=0;i--){const low=zero(),high=zero(),sets={...suffix[i+1].sets};for(const set of new Set(groups[i].map(q=>q.set)))sets[set]=(sets[set]||0)+1;for(const s of stats){let min=Infinity,max=-Infinity;for(const q of groups[i]){min=Math.min(min,q.stats[s]||0);max=Math.max(max,q.stats[s]||0);}low[s]=suffix[i+1].low[s]+min;high[s]=suffix[i+1].high[s]+max;}suffix[i]={low,high,sets};}
   const picked=[];
   function* visitSlot(depth){
    nodes++;if(nodes%256===0)yield snapshot();
    if(!setsPossible(config,picked,groups,depth)){pruned++;return;}
    const [lo,hi]=bounds(base,config,picked,suffix,depth);
    for(const prior of chosen)for(const stat of roles.find(r=>r.index===prior.index).config.highestStats||[])if(lo[stat]-tolerance(lo[stat])>prior.rawPanel[stat]-(percent.has(stat)?.001:.1)){pruned++;return;}
    for(const r of config.ranges||[]){const d=r.percentage?100:1;if(r.min!=null&&hi[r.stat]+tolerance(hi[r.stat])<r.min/d||r.max!=null&&lo[r.stat]-tolerance(lo[r.stat])>r.max/d){pruned++;return;}}
    const upper=C.score(hi,config.metricId)??0;
    if(config.targetScore!=null&&upper+tolerance(upper)<config.targetScore){pruned++;return;}
    if(bestVector&&compare(chosen.map(b=>b.score??0),bestVector.slice(0,n))===0&&upper+tolerance(upper)<bestVector[n]){pruned++;return;}
    if(depth===6){
     const p=C.panel(base,picked,effects,config.extraAttributes);
     if(p.unsupported.length||C.equipmentGaps(picked,config,effects).length||C.panelGaps(p.values,config).length)return;
     const build={index:m.index,name:m.name,heroId:hero.instanceId,soulIds:[...picked].sort((a,b)=>a.slot-b.slot).map(q=>q.id),panel:p.values,rawPanel:C.panel(base,picked,effects).values,sets:p.sets,score:C.score(p.values,config.metricId),distance:0,gaps:[]};
     if(!highestValid(build))return;
     usedHeroes.add(hero.instanceId);picked.forEach(q=>usedSouls.add(q.id));chosen.push(build);yield* visitMember(n+1);chosen.pop();picked.forEach(q=>usedSouls.delete(q.id));usedHeroes.delete(hero.instanceId);return;
    }
    const seenSouls=new Set();for(const q of groups[depth]){const key=soulKey.get(q.id);if(seenSouls.has(key)){pruned++;continue;}seenSouls.add(key);picked.push(q);yield* visitSlot(depth+1);picked.pop();}
   }
   yield* visitSlot(0);
  }
 }
 yield snapshot();yield* visitMember(0);return snapshot(best?'optimal':'infeasible');
}
// Match actual instances across the whole team, including repeated species and
// incompatible skill requirements. A count per species alone is insufficient.
function heroAvailability(roles,account){
 const owners=new Map(),choices=roles.map(m=>C.memberCandidates(m,account).heroes);
 function assign(i,seen){for(const h of choices[i]){if(seen.has(h.instanceId))continue;seen.add(h.instanceId);const previous=owners.get(h.instanceId);if(previous==null||assign(previous,seen)){owners.set(h.instanceId,i);return true;}}return false;}
 for(let i=0;i<roles.length;i++)assign(i,new Set());
 const matched=new Set(owners.values()),required=new Map(),owned=new Map();
 for(const m of roles)required.set(m.shikigamiId,(required.get(m.shikigamiId)||0)+1);
 for(const h of Object.values(account.heroes))owned.set(h.shikigamiId,(owned.get(h.shikigamiId)||0)+1);
 const coverage=[...required].reduce((n,[id,count])=>n+Math.min(count,owned.get(id)||0),0);
 const unknown=account.completeness!=='complete'||account.merged||!roles.length||roles.some(m=>m.borrowed||!m.shikigamiId);
 return {state:unknown?'unknown':matched.size===roles.length?'ready':'missing',shortage:unknown?null:roles.length-coverage,training:unknown?null:coverage-matched.size,missing:roles.filter((m,i)=>!matched.has(i))};
}
function gapCategory(heroes,souls){
 if(heroes==='unknown'||souls==='unknown')return 'unknown';
 if(souls==='pending')return 'pending';
 return heroes==='missing'?(souls==='missing'?'both':'hero-only'):(souls==='missing'?'soul-only':'ready');
}
function* search(lineup,account,roster,effects){
 const roles=(lineup.members||[]).filter(m=>m.occupied!==false&&m.kind==='shikigami');
 const availability=heroAvailability(roles,account),complete=C.hasParsedContent(lineup)&&C.shikigamiRequirementsComplete(lineup)&&roles.every(m=>Array.isArray(m.skills)&&[0,1].includes(m.awakening));
 const heroes=complete?availability.state:'unknown';
 let result,souls='pending';
 const withGaps=(value,extra={})=>({...value,gapCategory:gapCategory(heroes,souls),gapAssessment:{heroes,souls,heroShortage:heroes==='unknown'?null:availability.shortage,heroTraining:heroes==='unknown'?null:availability.training,...extra}});
 const actual=solve(lineup,account,roster,effects);
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
 const hypothetical=solve(lineup,projected,roster,effects);
 while(true){const step=hypothetical.next(),candidate=step.value;
  if(candidate.assignment){souls='ready';hypothetical.return();return withGaps(result,{...extra,assignment:candidate.assignment});}
  if(step.done){souls=candidate.proof.state==='infeasible'?'missing':'unknown';return withGaps(result,{...extra,reason:souls==='unknown'?candidate.reasons.join('；'):''});}
  yield withGaps(result,extra);
 }
}
return {search,version,heroAvailability,gapCategory};
});
