(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.AtlasSolver=factory;})(globalThis,function(C){
'use strict';
const finite=Number.isFinite,percent=new Set(['crit','critDamage','effectHit','effectResist']);
const unique=a=>[...new Set(a)],names=C.STAT_NAMES;
function fmt(stat,value){return finite(value)?(value*(percent.has(stat)?100:1)).toFixed(2).replace(/\.00$/,'')+(percent.has(stat)?'%':''):'未知';}
function panelGaps(panel,config,objective){
  const gaps=[];
  for(const r of config.ranges||[]){
    const actual=panel[r.stat],div=r.percentage?100:1;
    if(!finite(actual)){gaps.push({kind:'unknown',stat:r.stat,text:`缺少${names[r.stat]||r.stat}面板`,weight:0});continue;}
    for(const side of ['min','max']){
      if(!finite(r[side]))continue;
      const target=r[side]/div,delta=side==='min'?target-actual:actual-target,exclusive=r[side+'Exclusive'];
      if(delta>1e-8||(exclusive&&delta>=0))gaps.push({kind:'stat',stat:r.stat,side,actual,target,delta:Math.max(delta,exclusive?1e-6:0),weight:10*Math.max(delta,0)/Math.max(Math.abs(target),percent.has(r.stat)?.01:1),text:`${names[r.stat]} ${fmt(r.stat,actual)}，要求${side==='min'?(exclusive?'>':'≥'):(exclusive?'<':'≤')}${fmt(r.stat,target)}，${side==='min'?'还差':'超出'} ${fmt(r.stat,Math.max(delta,0))}`});
    }
  }
  if(config.targetScore!=null){const actual=C.score(panel,config.metricId,objective),delta=config.targetScore-actual;if(!finite(actual)||delta>1e-8)gaps.push({kind:'score',actual,target:config.targetScore,delta,weight:10*Math.max(0,delta)/Math.max(Math.abs(config.targetScore),1),text:`计算指标 ${finite(actual)?actual.toFixed(2):'未知'}，目标 ≥${config.targetScore}`});}
  return gaps;
}
function suitGaps(souls,config,effects){
  const counts={};for(const q of souls)counts[q.set]=(counts[q.set]||0)+1;
  const requests=config.suitRequirements||[];let best=null;
  const activations=(n,cycle=4)=>Math.floor(n/cycle)+(n%cycle>=2?1:0);
  function visit(index,remaining,gaps){
    if(index===requests.length){
      const available={};for(const e of effects)available[e.stat]=e.suitNames.reduce((n,s)=>n+Math.max(0,activations(counts[s]||0,e.cycle||4)-activations((counts[s]||0)-(remaining[s]||0),e.cycle||4)),0);
      const all=[...gaps];for(const stat of config.twoPieceStats||[]){if(available[stat]>0)available[stat]--;else all.push({kind:'pair',stat,count:2,delta:2,weight:12,text:`还需一组${names[stat]||stat}两件套；指定套装已提供的加成不重复充数`});}
      if(!best||all.reduce((n,g)=>n+g.weight,0)<best.reduce((n,g)=>n+g.weight,0))best=all;return;
    }
    const r=requests[index],e=effects.find(e=>e.name===r.name||(r.effectId!=null&&e.teamCodeId===r.effectId)),pool=e?.suitNames||[r.name],candidates=pool.filter(s=>(remaining[s]||0)>0);
    for(const set of candidates.length?candidates:[pool[0]]){const have=Math.min(remaining[set]||0,r.count),missing=have<r.count?[{kind:'set',name:r.name,count:r.count,actual:have,delta:r.count-have,weight:(r.count-have)*6,text:`${r.name}需要${r.count}件，当前方案${have}件`}]:[];visit(index+1,{...remaining,[set]:(remaining[set]||0)-have},[...gaps,...missing]);if(best?.length===0)return;}
  }
  visit(0,counts,[]);return best||[];
}
function equipmentGaps(souls,config,effects){
  const gaps=suitGaps(souls,config,effects);
  for(let slot=1;slot<=6;slot++){
    const q=souls.find(s=>s.slot===slot),main=config.mainStats?.[slot];
    if(!q){gaps.push({kind:'slot',slot,weight:12,text:`缺少${slot}号位御魂`});continue;}
    if(main?.length&&!main.includes(q.mainStat))gaps.push({kind:'main',slot,weight:8,text:`${slot}号位主属性${names[q.mainStat]||q.mainStat}，需要${main.map(s=>names[s]||s).join(' / ')}`});
    if(config.sixStarOnly&&q.star!==6||config.allowedStars?.length&&!config.allowedStars.includes(q.star))gaps.push({kind:'star',slot,weight:5,text:`${slot}号位${q.star}星不满足星级要求`});
    const range=config.levelRange||[config.maxLevelOnly?15:0,15];
    if(q.level<range[0]||q.level>range[1])gaps.push({kind:'level',slot,delta:Math.abs(q.level-range[0]),weight:Math.abs(q.level-range[0])/3,text:`${slot}号位 +${q.level}，要求 +${range[0]}～${range[1]}`});
  }
  return gaps;
}
function configUnknown(config,effects){
  if(!config)return ['缺少御魂配置'];
  const reasons=[...(config.protocolUncertainties||[])];
  if(config.keepCurrent||config.yuhunConfigEnabled===false)reasons.push('原码要求保留当前御魂；导出未提供穿戴归属');
  if(config.scope!=null&&!['all','unequipped'].includes(config.scope))reasons.push('未支持的库存范围');
  if(config.scope==='unequipped'||config.excludeOccupied)reasons.push('导出缺少穿戴归属，不能筛选未占用御魂');
  if(config.highestStat)reasons.push('旧版最高属性字段需重新解析');
  if((config.highestStats||[]).some(s=>!Object.hasOwn(names,s)||s.endsWith('Percent')))reasons.push('未知最高属性');
  if((config.ranges||[]).some(r=>!Object.hasOwn(names,r.stat)||r.stat.endsWith('Percent')))reasons.push('包含未支持的面板范围');
  if(config.metricId!=null&&!C.METRICS[config.metricId])reasons.push('未知计算指标');
  if(config.suits?.length&&!config.suitRequirements?.length&&!config.suitSelectionComplete)reasons.push('旧版套装没有明确件数');
  for(const r of config.suitRequirements||[]){if(![2,4,6].includes(r.count))reasons.push('套装件数未核实');if(r.effectId!=null&&!effects.some(e=>e.teamCodeId===r.effectId))reasons.push('未知两件套效果');}
  for(const stat of config.twoPieceStats||[])if(!effects.some(e=>e.stat===stat&&e.value))reasons.push(`未支持的两件套属性 ${names[stat]||stat}`);
  for(const [k,v] of Object.entries(config.extraAttributes||{}))if(!['attackPercent','attack','crit','critDamage'].includes(k)||!finite(v)||v<0)reasons.push(`额外属性 ${names[k]||k} 未核实`);
  return unique(reasons);
}
// Unknown attributes only matter if this instance could pass the hard filters.
// An unrecognized main-stat name remains a possible match, not an exclusion.
function soulEligible(q,config={}){
  config=config||{};
  const range=config.levelRange||[config.maxLevelOnly?15:0,15],main=config.mainStats?.[q.slot];
  return (!config.sixStarOnly||q.star===6)&&(!config.allowedStars?.length||config.allowedStars.includes(q.star))&&q.level>=range[0]&&q.level<=range[1]&&(!main?.length||!Object.hasOwn(names,q.mainStat)||main.includes(q.mainStat));
}
function suggestions(config,closest,account,effects){
  if(!config)return [];
  const inventory=Object.values(account.souls),q=(closest?.soulIds||[]).map(id=>account.souls[id]).filter(Boolean),out=[];
  const gaps=closest?.gaps||equipmentGaps(q,config,effects);
  const add=(priority,text)=>{if(!out.some(x=>x.text===text))out.push({priority,text});};
  for(const g of gaps){
    if(['slot','main','star','level'].includes(g.kind)){
      const soul=q.find(s=>s.slot===g.slot),main=config.mainStats?.[g.slot]?.map(s=>names[s]).join(' / ')||({1:'攻击',3:'防御',5:'生命'}[g.slot]||'按数值缺口选择');
      if(g.kind==='level'&&soul&&soul.level<(config.levelRange?.[0]??15)&&!gaps.some(x=>x.slot===g.slot&&['main','star'].includes(x.kind)||['set','pair'].includes(x.kind)||x.kind==='stat'&&x.side==='max'))add(0,`先利用已有${g.slot}号位「${soul.set}」（+${soul.level}）：主属性随强化确定提升；消耗御魂经验与金币，以强化预览为准。分段强化到下一次 +3 / +6 / +9 / +12 / +15 检查副属性，随机落点不能保证达标；达到原码下限即重新核对，不盲目追满。`);
      else add(1,`先检查已有${g.slot}号位，主属性${main}${config.sixStarOnly?'、六星':''}。主属性种类与星级不能靠普通强化改变；不合适时更换御魂，已强化等级也不能下调。`);
    }
    if(g.kind==='set'||g.kind==='pair'){
      const sets=g.kind==='set'?[g.name]:(effects.find(e=>e.stat===g.stat)?.suitNames||[]),requiredSlots=[1,2,3,4,5,6].filter(slot=>!q.some(x=>x.slot===slot&&sets.includes(x.set)));
      const slots=requiredSlots.sort((a,b)=>inventory.filter(x=>x.slot===a&&sets.includes(x.set)).length-inventory.filter(x=>x.slot===b&&sets.includes(x.set)).length).slice(0,Math.min(g.delta,2));
      const voidSets=['尘冢','夜送犬','片叶之苇','雨降','油赤子','夜啼石'],bossSets=['土蜘蛛','胧车','荒骷髅','地震鲶','蜃气楼','鬼灵歌伎'];
      const route=sets.every(s=>voidSets.includes(s))?'终焉大蛇·虚无对应掉落':sets.every(s=>bossSets.includes(s))?'对应逢魔首领奖励 / 逢魔御魂兑换':'御魂副本对应掉落池 / 游戏内御魂兑换';
      for(const slot of slots){const mains=config.mainStats?.[slot]?.map(s=>names[s]).join(' / ')||({1:'攻击',3:'防御',5:'生命'}[slot]||'依数值缺口选择');add(2,`缺${sets.slice(0,4).join(' / ')}${sets.length>4?'等同加成套装':''}的${slot}号位（${mains}）。途径：${route}。优先使用已有兑换资源；只有界面明确可选时才视为能指定套装 / 位置 / 主属性，否则仍是随机获取。刷取耗体力、兑换耗对应材料，次数与价格按当前游戏界面；246号位指定主属性通常比135号位更难补。`);}
    }
  }
  const statGaps=gaps.filter(g=>g.kind==='stat').sort((a,b)=>b.weight-a.weight);
  for(const g of statGaps.slice(0,2)){
    const direct={speed:[2,'speed'],crit:[6,'crit'],critDamage:[6,'critDamage'],effectHit:[4,'effectHit'],effectResist:[4,'effectResist'],attack:[2,'attackPercent'],hp:[2,'hpPercent'],defense:[2,'defensePercent']}[g.stat];
    const allowed=direct&&(!config.mainStats?.[direct[0]]?.length||config.mainStats[direct[0]].includes(direct[1]));
    const statKeys={attack:['attack','attackPercent'],hp:['hp','hpPercent'],defense:['defense','defensePercent']}[g.stat]||[g.stat];
    const ranked=[...q].sort((a,b)=>statKeys.reduce((n,k)=>n+(a.stats[k]||0)-(b.stats[k]||0),0)*(g.side==='max'?-1:1));
    const slot=allowed?direct[0]:ranked[0]?.slot;
    if(slot)add(3,`${names[g.stat]}${g.side==='min'?'不足':'超过上限'}：${g.text}。先换用库存内${slot}号位${allowed&&g.side==='min'?'的'+names[direct[1]]+'主属性':'保留指定主属性、'+(g.side==='min'?'更高':'降低')+names[g.stat]+'副属性'}。如果只能赌强化，该方向投入与随机风险更高，排在利用现成御魂之后；强化不能选择副属性落点，也不能保证同时满足其他面板上限。`);
  }
  return out.sort((a,b)=>a.priority-b.priority).slice(0,6).map(x=>x.text);
}
function findBuilds(hero,config,account,roster,effects,options={}){
  const base=C.baseFromRoster(hero,roster),unknown=configUnknown(config,effects);
  if(!base)return {status:'unknown',reasons:['缺少此实例可核验的基础面板；需要完整 attrs 或对应官方属性'],builds:[],suggestions:[]};
  if(unknown.length)return {status:'unknown',reasons:unknown,builds:[],suggestions:[]};
  const objective={heroId:hero.shikigamiId,baseAttack:base.attack};
  let cache=null;if(options.cache&&options.inventory==null){cache=options.cache.get(account.souls);if(!cache){cache=new Map();options.cache.set(account.souls,cache);}}
  const cacheKey=cache&&JSON.stringify([base,objective,config,effects,C.inventoryComplete(account,'souls'),account.presets,options.limit,options.width,options.perSet,options.approximateInventory]);
  if(cacheKey&&cache.has(cacheKey)){const saved=cache.get(cacheKey);return {...saved,builds:saved.builds.map(b=>({...b,heroId:hero.instanceId})),closest:saved.closest?{...saved.closest,heroId:hero.instanceId}:null};}
  const inventory=options.inventory||Object.values(account.souls),known=inventory.filter(q=>!q.unknown.length);
  const absence=!options.approximateInventory&&C.inventoryComplete(account,'souls')&&!inventory.some(q=>q.unknown.length)?'missing':'unknown';
  const level=config.levelRange||[config.maxLevelOnly?15:0,15];
  const legal=q=>(!config.sixStarOnly||q.star===6)&&(!config.allowedStars?.length||config.allowedStars.includes(q.star))&&q.level>=level[0]&&q.level<=level[1]&&(!config.mainStats?.[q.slot]?.length||config.mainStats[q.slot].includes(q.mainStat));
  const slots=[1,2,3,4,5,6],groups=slots.map(s=>known.filter(q=>q.slot===s&&legal(q))),relaxed=groups.map((g,i)=>g.length?g:known.filter(q=>q.slot===i+1));
  const reasons=[];
  for(let i=0;i<6;i++)if(!groups[i].length)reasons.push(`${i+1}号位没有符合星级、等级与主属性的御魂`);
  for(const r of config.suitRequirements||[]){const e=effects.find(e=>e.name===r.name||(r.effectId!=null&&e.teamCodeId===r.effectId));if(!(e?.suitNames||[r.name]).some(s=>groups.filter(g=>g.some(q=>q.set===s)).length>=r.count))reasons.push(`${r.name}不足${r.count}个符合主属性的不同位置`);}
  const allBuilds=[],seen=new Set();let closest=null,checked=0,unsupported=false;
  const assess=(q,keep=true)=>{
    const p=C.panel(base,q,effects,config.extraAttributes),gaps=[...equipmentGaps(q,config,effects),...panelGaps(p.values,config,objective)],distance=gaps.reduce((sum,g)=>sum+(g.weight||0),0);
    const result={heroId:hero.instanceId,objective,soulIds:[...q].sort((a,b)=>a.slot-b.slot).map(x=>x.id),panel:p.values,rawPanel:C.panel(base,q,effects).values,sets:p.sets,score:C.score(p.values,config.metricId,objective),distance,gaps};
    if(p.unsupported.length){unsupported=true;return result;}
    if(keep){if(!closest||distance<closest.distance||distance===closest.distance&&(result.score||0)>(closest.score||0))closest=result;
      if(q.length===6&&!gaps.length){const key=result.soulIds.join(',');if(!seen.has(key)){seen.add(key);allBuilds.push(result);}}}
    return result;
  };
  const inventoryIds=options.inventory?new Set(inventory.map(q=>q.id)):null;
  for(const preset of account.presets||[]){const ids=Array.isArray(preset)?preset[1]:null;if(!Array.isArray(ids)||ids.length!==6||inventoryIds&&ids.some(id=>!inventoryIds.has(id)))continue;const q=ids.map(id=>account.souls[id]);if(q.every(s=>s&&!s.unknown.length)&&new Set(q.map(x=>x.slot)).size===6){assess(q);checked++;}}
  const product=relaxed.reduce((p,g)=>p*g.length,1),limit=options.limit??16000;let exhaustive=product<=limit;
  if(product===0){assess(relaxed.filter(g=>g.length).map(g=>g[0]));}
  else if(exhaustive){const q=[];function visit(n){if(n===6){assess(q);checked++;return;}for(const soul of relaxed[n]){q.push(soul);visit(n+1);q.pop();}}visit(0);}
  else {
    const width=options.width??64,perSet=options.perSet??5;
    const rank=q=>{const p=C.panel(base,q,effects,config.extraAttributes).values;const gap=panelGaps(p,config,objective).reduce((n,g)=>n+g.weight,0)+suitGaps(q,config,effects).reduce((n,g)=>n+g.weight,0);return -gap+Math.log1p(Math.max(0,C.score(p,config.metricId,objective)||0))*.015;};
    const reduced=relaxed.map(g=>{const ordered=g.map(q=>({q,v:rank([q])})).sort((a,b)=>b.v-a.v);const counts={},selected=[];for(const {q} of ordered){const important=(config.suitRequirements||[]).some(r=>r.name===q.set)||(config.twoPieceStats||[]).some(s=>effects.find(e=>e.stat===s)?.suitNames.includes(q.set));if((counts[q.set]||0)<perSet||selected.length<12){selected.push(q);counts[q.set]=(counts[q.set]||0)+1;}if(selected.length>=(important?64:48))break;}return selected;});
    let beam=[{q:[],v:0}];
    for(const group of reduced){const next=[];for(const b of beam)for(const q of group){const arr=[...b.q,q];next.push({q:arr,v:rank(arr)});checked++;}next.sort((a,b)=>b.v-a.v);beam=next.slice(0,width);}
    for(const b of beam)assess(b.q);
  }
  allBuilds.sort((a,b)=>(b.score||0)-(a.score||0));
  // Retain alternatives using different inventory for the joint team assignment.
  const builds=allBuilds.slice(0,64),selected=new Set(builds);
  for(const anchor of allBuilds.slice(0,8)){const used=new Set(anchor.soulIds);for(const b of allBuilds)if(!selected.has(b)&&b.soulIds.every(s=>!used.has(s))){builds.push(b);selected.add(b);break;}}
  for(const b of allBuilds)if(builds.length<128&&!selected.has(b)){builds.push(b);selected.add(b);}
  const status=builds.length?'found':reasons.length?absence:exhaustive&&!unsupported?absence:'unknown';
  if(!builds.length&&!reasons.length)reasons.push(unsupported?'候选包含尚未核实的套装属性':exhaustive?'已穷举已识别库存，没有全部满足的六件方案':'限定搜索尚未找到达标方案；下方仅为当前最接近的候选');
  const result={status,reasons,builds,closest,checked,exhaustive,suggestions:suggestions(config,closest,account,effects)};
  if(cacheKey)cache.set(cacheKey,result);
  return result;
}
function heroGaps(member,hero){
  const gaps=[];
  if(member.awakening!=null&&hero.awake!==member.awakening)gaps.push({kind:'awake',weight:15,text:member.awakening?'此实例尚未觉醒':'需要另备未觉醒实例'});
  if(member.levelMode!=='recommended')for(const [k,label] of [['level','等级'],['star','星级']])if(member[k]&&hero[k]<member[k])gaps.push({kind:k,weight:(member[k]-hero[k])*(k==='star'?5:1),text:`${label} ${hero[k]}，要求 ≥${member[k]}`});
  for(const s of member.skills||[]){const actual=hero.skills.find(h=>h.id===s.id)?.level||0;if(s.exact?actual!==s.level:actual<s.level)gaps.push({kind:'skill',skill:s.id,actual,target:s.level,weight:Math.max(1,Math.abs(s.level-actual))*8,text:`${s.name||s.slotLabel||'所需技能'} 当前${actual?actual+'级':'未拥有'}，要求${s.exact?'=':'≥'}${s.level}级${s.exact&&actual>s.level?'；需要另一符合等级的实例':''}`});}
  return gaps;
}
const heroIndexes=new WeakMap();
function heroIndex(account,refresh=false){
 let index=heroIndexes.get(account.heroes);if(index&&!refresh)return index;
 index=new Map();for(const h of Object.values(account.heroes)){if(!index.has(h.shikigamiId))index.set(h.shikigamiId,[]);index.get(h.shikigamiId).push(h);}
 heroIndexes.set(account.heroes,index);return index;
}
function memberCandidates(member,account){
  const all=(heroIndex(account).get(member.shikigamiId)||[]);
  if(!all.length)return {status:'missing',reason:'缺少式神',heroes:[],nearest:null,gaps:[{kind:'hero',weight:100,text:'缺少此式神实例'}]};
  const ranked=all.map(h=>({hero:h,gaps:heroGaps(member,h)})).sort((a,b)=>a.gaps.reduce((n,g)=>n+g.weight,0)-b.gaps.reduce((n,g)=>n+g.weight,0)||b.hero.level-a.hero.level||b.hero.star-a.hero.star);
  const heroes=ranked.filter(r=>!r.gaps.length).map(r=>r.hero),near=ranked[0];
  return {status:heroes.length?'found':'missing',reason:heroes.length?'':near.gaps.map(g=>g.text).join('；'),heroes,nearest:near.hero,gaps:near.gaps};
}
function shikigamiRequirementsComplete(lineup){
  if(lineup.requirementsComplete===true)return true;
  // Mapper v3 also counted actor-only protocol fields as missing requirements.
  // Reinterpret only that known legacy case; incomplete shikigami data stays unknown.
  return lineup.mapperVersion===3&&['decoded-local','decoded-server'].includes(lineup.decodeState)&&
    !!lineup.members?.some(m=>m.kind==='onmyoji'&&m.config?.protocolUncertainties?.length)&&
    lineup.members.filter(m=>m.kind==='shikigami'&&m.occupied!==false).every(m=>!m.config?.protocolUncertainties?.length);
}
function matchLineup(lineup,account,roster,effects,options={}){
  heroIndex(account,true);
  if(!lineup.members?.some(m=>m.occupied!==false))return {status:'unknown',label:'待解析',distance:null,reasons:['阵容码尚未获得成员数据'],members:[],checks:[]};
  const members=[],unknown=[],checks=[],required={},roles=lineup.members.filter(m=>m.occupied!==false),search={...options,cache:options.cache||new Map(),inventory:options.inventory||Object.values(account.souls)};
  let forcedMissing=false;
  for(const m of roles.filter(m=>m.kind==='shikigami'&&!m.borrowed))required[m.shikigamiId]=(required[m.shikigamiId]||0)+1;
  for(const [sid,n] of Object.entries(required)){const have=(heroIndex(account).get(sid)?.length||0);if(n>have){forcedMissing=C.inventoryComplete(account,'heroes');checks.push(`${roster.find(r=>r.id===sid)?.name||sid}需要${n}个不同实例，导出有${have}个`);}}
  for(const m of roles){
    if(m.kind==='onmyoji'){
      members.push({index:m.index,name:m.name,status:'display-only',reasons:[],builds:[],distance:0});continue;
    }
    if(m.borrowed||!m.shikigamiId){const reason=m.borrowed?'需要借用协战，需确认可借式神及配置':'成员身份未核实';unknown.push(reason);members.push({index:m.index,name:m.name,status:'unknown',reasons:[reason],builds:[],distance:0});continue;}
    const owned=memberCandidates(m,account),heroes=owned.heroes.length?owned.heroes:owned.nearest?[owned.nearest]:[],tested=[];
    for(const hero of heroes.slice(0,options.diagnosticHeroLimit??heroes.length))tested.push(findBuilds(hero,m.config,account,roster,effects,search));
    const builds=owned.status==='found'?tested.flatMap(t=>t.builds):[],closest=tested.map(t=>t.closest).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0]||null;
    const absence=C.inventoryComplete(account,'heroes')?'missing':'unknown';
    const status=owned.status==='missing'?absence:builds.length?'found':tested.length&&tested.every(t=>t.status==='missing')?'missing':'unknown';
    const reasons=unique([...(owned.reason?[owned.reason]:[]),...tested.flatMap(t=>t.reasons)]);
    if(status==='unknown')unknown.push(`${m.name}御魂尚未证实`);
    if(m.awakening==null)unknown.push(`${m.name}未提供觉醒要求`);
    if(m.skills==null)unknown.push(`${m.name}未提供技能要求`);
    if(m.aiSkill!=null)checks.push(`${m.name}自动技能设置：${JSON.stringify(m.aiSkill)}`);
    if(m.levelMode==='recommended'&&owned.nearest&&(owned.nearest.level!==m.level||owned.nearest.star!==m.star))reasons.push(`原码推荐 ${m.level}级${m.star}星；按实际 ${owned.nearest.level}级${owned.nearest.star}星计算`);
    members.push({index:m.index,name:m.name,status,reasons,builds,closest,heroGaps:owned.gaps,instanceCount:owned.heroes.length,checked:tested.reduce((n,t)=>n+(t.checked||0),0),distance:owned.gaps.reduce((n,g)=>n+g.weight,0)+(closest?.distance||0),suggestions:unique([...owned.gaps.map(g=>g.text),...tested.flatMap(t=>t.suggestions||[])])});
  }
  const buildRoles=members.filter(m=>m.builds.length).sort((a,b)=>a.builds.length-b.builds.length);let assignment=null,steps=0;
  function highestValid(chosen){
    for(const owner of chosen){const original=roles.find(m=>m.index===owner.index);for(const stat of original?.config?.highestStats||[])for(const other of chosen){if(other.index<=owner.index)continue;const delta=percent.has(stat)?.001:.1;if(!finite(other.panel[stat])||other.panel[stat]>owner.rawPanel[stat]-delta+1e-8)return false;}}
    return true;
  }
  function assign(n,heroes,souls,chosen){
    if(++steps>(options.assignmentLimit??100000))return false;
    if(n===buildRoles.length){assignment=[...chosen].sort((a,b)=>a.index-b.index);return true;}
    const role=buildRoles[n];for(const b of role.builds){if(heroes.has(b.heroId)||b.soulIds.some(s=>souls.has(s)))continue;const next=[...chosen,{index:role.index,name:role.name,...b}];if(!highestValid(next))continue;if(assign(n+1,new Set([...heroes,b.heroId]),new Set([...souls,...b.soulIds]),next))return true;}return false;
  }
  assign(0,new Set(),new Set(),[]);
  if(!assignment&&buildRoles.length)unknown.push('候选存在式神 / 御魂冲突或最高属性次序不符；尚未找到全队分配');
  if(!shikigamiRequirementsComplete(lineup))unknown.push('来源要求尚不完整，需核对原文与补充说明');
  if(!roles.some(m=>m.kind==='shikigami'))unknown.push('原码尚未解析出完整的式神要求');
  if(account.merged)unknown.push('增量合并可能保留旧资产，需确认仍在仓库');
  if(!C.inventoryComplete(account))unknown.push('账号导出范围不完整或含有合并旧库存');
  if(checks.length)unknown.push('还有原码中的式神自动技能或实例数量待核对');
  const missing=forcedMissing||members.some(m=>m.status==='missing'),ready=!!assignment?.length&&members.filter(m=>roles.find(r=>r.index===m.index)?.kind==='shikigami').every(m=>m.status==='found');
  const status=missing?'missing':unknown.length?'unknown':'available';
  const distance=members.reduce((n,m)=>n+m.distance,0)+(!assignment&&buildRoles.length?15:0)+(forcedMissing?100:0);
  return {status,label:status==='available'?'配置可组成':missing?'存在缺口':ready?'式神御魂就绪 · 仍需核对':'需核对',ready,distance:Math.round(distance*100)/100,checks,reasons:unique([...(forcedMissing?checks.filter(c=>c.includes('个不同实例')):[]),...members.filter(m=>m.status==='missing').map(m=>`${m.name}：${m.reasons.join('；')}`),...unknown]),members,assignment};
}
function compareMatches(a,b){if(a?.status==='available'&&b?.status!=='available')return -1;if(b?.status==='available'&&a?.status!=='available')return 1;return (a?.distance??Infinity)-(b?.distance??Infinity)||(a?.checks?.length||0)-(b?.checks?.length||0);}
return {heroIndex,findBuilds,memberCandidates,matchLineup,compareMatches,shikigamiRequirementsComplete,panelGaps,equipmentGaps,suggestions,configUnknown,soulEligible,formatStat:fmt,suitMatches:(q,c,e)=>!suitGaps(q,c,e).length};
});
