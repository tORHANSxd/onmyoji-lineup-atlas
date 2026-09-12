(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasCore=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const STAT_NAMES={attack:'攻击',attackPercent:'攻击加成',hp:'生命',hpPercent:'生命加成',defense:'防御',defensePercent:'防御加成',speed:'速度',crit:'暴击',critDamage:'暴击伤害',effectHit:'效果命中',effectResist:'效果抵抗'};
const STAT_TYPES={attack_flat:'attack',attack_rate:'attackPercent',hp_flat:'hp',hp_rate:'hpPercent',defense_flat:'defense',defense_rate:'defensePercent',speed:'speed',crit_rate:'crit',crit_damage:'critDamage',effect_hit:'effectHit',effect_resist:'effectResist'};
const METRICS={1:['伤害输出','attack × critDamage'],2:['效果命中','effectHit'],3:['效果抵抗','effectResist'],4:['生命','hp'],5:['攻击','attack'],6:['防御','defense'],7:['速度','speed'],8:['暴击','crit'],9:['暴击伤害','critDamage'],10:['治疗量','hp × critDamage'],11:['命抗双修','effectHit + effectResist'],12:['防御输出','defense × critDamage']};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>/^\d+$/.test(String(x))?String(Number(x)):null;
const normalizeCode=s=>String(s??'').replace(/^\uFEFF/,'').trim();
const hasLineupCode=l=>typeof l?.code==='string'&&!!l.code.trim();
function classifyCode(s){s=normalizeCode(s);if(new TextEncoder().encode(s).length>32*1024*1024)return 'too-large';if(/^\|TA\|[^\s|\x00-\x1f\x7f]{1,4096}$/.test(s))return 'pipe-ta';if(/^#TA#\S+$/.test(s)&&s.length>4)return 'hash-ta';if(s.length>=8&&s.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(s))return 'lineup-data';return 'unknown';}
function adaptTA(payload,data={}){
  if(payload?.ok!==true||payload.format!=='ta-payload'||!object(payload.data)||!Array.isArray(payload.data.hconf)||!Array.isArray(payload.kinds))throw new Error(payload?.error||'TA 解析结果结构无效');
  const d=payload.data;if(d.hconf.length!==payload.kinds.length||!d.hconf.length||d.hconf.length>30)throw new Error('TA 成员数量不合法');
  const attrs={atk_per:'attackPercent',critical_rate:'crit',critical_pow:'critDamage',spd:'speed',debuff_acc:'effectHit',debuff_res:'effectResist',max_hp_per:'hpPercent',def_per:'defensePercent'};
  const members=d.hconf.map((row,index)=>{
    const kind=payload.kinds[index];if(!['onmyoji','shikigami'].includes(kind)||!id(row.hero_id))throw new Error('TA 成员类型或ID无效');
    const actor=(data.actors||[]).find(a=>a.gameId!=null&&String(a.gameId)===String(row.hero_id)),roster=(data.roster||[]).find(r=>r.id===String(row.hero_id)),equip=row.equip_info;
    let config=null;
    if(equip){
      config={sixStarOnly:Array.isArray(equip.yuhun_star)&&equip.yuhun_star.length===1&&equip.yuhun_star[0]===6,maxLevelOnly:Array.isArray(equip.yuhun_lv)&&equip.yuhun_lv[0]===15&&equip.yuhun_lv[1]===15,scope:'all',suitRequirements:(equip.suit||[]).map(([sid,count])=>({name:data.suits?.[String(sid)]||`未知御魂 ${sid}`,count,gameId:sid})),mainStats:Object.fromEntries(Object.entries(equip.main_attr||{}).map(([slot,values])=>[String(Number(slot)+1),values.map(v=>attrs[v]||v)])),ranges:[],protocolUncertainties:['已解析原始配置；御魂指标枚举、组合语义与数值单位尚未完成游戏计算逻辑核对'],protocol:{criteria:equip.criteria,twoSuit:equip.two_suit||[],limits:equip.limit||{},highest:row.highest_limit||[],notCalcFlag:row.not_calc_flag,useScore:row.use_score,yuhunLevel:equip.yuhun_lv,yuhunStars:equip.yuhun_star},raw:equip};
    }
    return {index,kind,shikigamiId:kind==='shikigami'?String(row.hero_id):null,onmyojiId:kind==='onmyoji'?String(row.hero_id):null,name:kind==='onmyoji'?(actor?.name||`阴阳师 / 英杰 ${row.hero_id}`):(roster?.name||`未知式神 ${row.hero_id}`),occupied:true,awakening:[0,1].includes(row.awake)?row.awake:null,skills:Array.isArray(row.skills)?row.skills.map(([skillId,level])=>({id:skillId,level})):null,level:row.level,star:row.star,config,qiling:row.qiling_info||null,aiSkill:row.ai_skill,raw:row};
  });
  return {title:typeof d.title==='string'?d.title:'已解析的自创阵容',notes:typeof d.desc==='string'?d.desc:'',gameSceneId:d.select_stage_id,code:payload.code,members,sourceKind:'ta-local',decodeState:'decoded-local',requirementsComplete:false,warnings:['成员、技能、觉醒与配置来自本地协议解码；御魂业务枚举和战斗配置保留原始值。','文字分享码的查询需要游戏会话；本结果未进行游戏内实战验证。'],protocolVersion:d.ver??0,raw:d};
}
function mergeDecodedLineup(old,incoming){
  if(!old)return incoming;
  if(old.code!==incoming.code)throw new Error('不能合并不同阵容码');
  return {...old,...incoming,id:old.id,title:old.title&&old.title!=='未命名阵容'?old.title:incoming.title,notes:old.notes||incoming.notes,category:old.category,dungeon:old.dungeon,dungeons:old.dungeons};
}
function adaptInspection(payload,roster=[]){
  if(payload?.ok!==true)throw new Error(typeof payload?.error==='string'?payload.error:'服务没有返回成功结果');const d=payload.data;
  if(!object(d)||!Array.isArray(d.entities)||!Array.isArray(d.editableTargets)||!Number.isInteger(d.slotCount)||d.slotCount<1||d.slotCount>30||!d.entities.length)throw new Error('服务响应结构无法识别，未生成阵容');
  const seen=new Set(), targets=new Map(), warnings=[];
  for(const t of d.editableTargets){if(!object(t)||!Number.isInteger(t.entityIndex)||targets.has(t.entityIndex))throw new Error('御魂目标槽位无效或重复');targets.set(t.entityIndex,t);}
  const members=d.entities.map(e=>{
    if(!object(e)||!Number.isInteger(e.index)||e.index<0||e.index>=d.slotCount||seen.has(e.index)||!['onmyoji','shikigami'].includes(e.kind)||typeof e.occupied!=='boolean')throw new Error('阵容成员槽位不合法');seen.add(e.index);
    const target=targets.get(e.index),sid=e.kind==='shikigami'?id(e.shikigamiId):null;
    if(target&&sid&&id(target.shikigamiId)!==sid)throw new Error('同槽位式神ID与御魂目标不一致');
    return {index:e.index,kind:e.kind,shikigamiId:sid,name:e.kind==='onmyoji'?'阴阳师（未提供身份）':(roster.find(r=>r.id===sid)?.name||target?.shikigamiName||`未知式神 ${e.shikigamiId??''}`),occupied:e.occupied,awakening:null,skills:null,config:target||null,raw:e};
  });
  if(members.filter(e=>e.occupied).length!==d.occupiedSlots)warnings.push('已占槽位数量与服务声明不一致');
  for(const index of targets.keys())if(!seen.has(index))throw new Error('御魂目标引用不存在的槽位');
  warnings.push('服务类型未提供技能与觉醒要求；身份不明的阴阳师保持未指定。');
  return {title:d.teamName||'未命名阵容',gameSceneId:d.gameSceneId,members,warnings,raw:d,requirementsComplete:false,decodeState:'decoded'};
}
function parseAccount(raw,fileName='账号'){
  if(!object(raw)||raw.format!=='mumu-snapshot-v1'||!object(raw.heroes)||!Array.isArray(raw.hero_equips)||!object(raw.player))throw new Error('仅支持已核验的平安志 mumu-snapshot-v1 JSON；未导入任何数据');
  if(Object.keys(raw.heroes).length>100000||raw.hero_equips.length>100000)throw new Error('账号数据规模超出100000条限制');
  const heroes=Object.create(null); let warnings=[];
  for(const [key,h] of Object.entries(raw.heroes)){
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(key)||!object(h)||!id(h.heroId)||!finite(h.level)||!finite(h.star)||![0,1].includes(h.awake))throw new Error('式神实例数据格式不正确');
    if(['__proto__','constructor','prototype'].includes(key))throw new Error('不合法的实例ID');
    if(!Array.isArray(h.skinfo)||h.skinfo.some(s=>!Array.isArray(s)||s.length!==2||!Number.isInteger(s[0])||!Number.isInteger(s[1])))throw new Error('技能记录损坏，未导入账号');
    const skills=h.skinfo.map(s=>({id:s[0],level:s[1]}));
    heroes[key]={instanceId:key,shikigamiId:id(h.heroId),level:h.level,star:h.star,awake:h.awake,skills,attrs:h.attrs,raw:h};
  }
  const souls=Object.create(null);
  for(const q of raw.hero_equips){
    if(!object(q)||typeof q.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(q.id)||!Number.isInteger(q.slot)||q.slot<1||q.slot>6||!finite(q.level)||!finite(q.quality)||!finite(q.mainAttrValue)||!Array.isArray(q.subAttributes)||typeof q.setId!=='string')throw new Error('御魂字段损坏，账号未保存');
    if(Object.hasOwn(souls,q.id)||['__proto__','constructor','prototype'].includes(q.id))throw new Error('御魂实例ID重复或无效');
    let stats={};const unknown=[];
    for(const a of [{type:q.mainAttrType,value:q.mainAttrValue},...q.subAttributes]){const k=STAT_TYPES[a.type];if(!k||!finite(a.value))unknown.push(a.type);else stats[k]=(stats[k]||0)+a.value;}
    souls[q.id]={id:q.id,slot:q.slot,set:q.setId==='涅槃之火'?'涅槃火':q.setId,level:q.level,star:q.quality,mainStat:STAT_TYPES[q.mainAttrType]||q.mainAttrType,stats,unknown,equippedState:q.equippedState,raw:q};
  }
  if(raw.heroCount!==undefined&&raw.heroCount!==Object.keys(heroes).length)warnings.push('声明的式神数量与实际记录数不一致');
  if(raw.completeness!=='complete')warnings.push('导出文件标记为不完整');
  if(Object.values(souls).some(s=>s.unknown.length))warnings.push('存在未知御魂属性，相关御魂不参与计算');
  const p=raw.player;
  const accountKey=p.serverId!=null&&p.shortId!=null?`${p.serverId}:${p.shortId}`:null;
  if(!accountKey)throw new Error('缺少区服ID或账号短ID，无法安全归并');
  return {id:accountKey,name:p.name||fileName,server:p.serverName||String(p.serverId),capturedAt:raw.capturedAt,heroes,souls,presets:Array.isArray(raw.equipPresets)?raw.equipPresets:[],warnings,completeness:raw.completeness,onmyoji:[],onmyojiStatus:'export-missing',raw};
}
function mergeAccount(old,incoming){if(!old)return incoming;if(old.id!==incoming.id)throw new Error('不能合并不同账号');const heroes={...old.heroes,...incoming.heroes},souls={...old.souls,...incoming.souls};return {...incoming,heroes,souls,raw:{...incoming.raw,heroes:Object.fromEntries(Object.entries(heroes).map(([k,h])=>[k,h.raw])),hero_equips:Object.values(souls).map(q=>q.raw),heroCount:Object.keys(heroes).length},presets:incoming.presets,merged:true,previousCapturedAt:old.capturedAt,warnings:[...incoming.warnings,'按实例ID覆盖并保留未再次导入的旧记录；已删除资产可能仍存在，请用完整快照替换清理。']};}
function restoreAccount(saved){const a=parseAccount(saved.raw,saved.name);if(saved.merged){a.merged=true;a.previousCapturedAt=saved.previousCapturedAt;a.warnings.push('此备份包含增量合并的旧记录，请确认资产仍在仓库。');}return a;}
function validateLineup(l){
  if(!object(l)||typeof l.title!=='string'||!Array.isArray(l.members)||l.members.length>30)throw new Error('阵容JSON缺少 title / members 或成员过多');
  const members=l.members.map((m,i)=>{
    if(!object(m)||!['shikigami','onmyoji'].includes(m.kind)||typeof m.name!=='string')throw new Error('成员必须包含 kind 与 name');
    if(m.kind==='shikigami'&&m.shikigamiId!=null&&!id(m.shikigamiId))throw new Error('式神ID必须为数值');
    if(m.awakening!=null&&![0,1].includes(m.awakening))throw new Error('觉醒状态只能为0/1/null');
    for(const k of ['level','star'])if(m[k]!=null&&(!Number.isInteger(m[k])||m[k]<1||m[k]>(k==='level'?60:6)))throw new Error('等级或星级不合法');
    if(m.skills!=null&&(!Array.isArray(m.skills)||m.skills.some(s=>!object(s)||!Number.isInteger(s.id)||!Number.isInteger(s.level)||s.level<1||s.level>10)))throw new Error('技能必须为数值ID与等级');
    const c=m.config;
    if(c!=null){if(!object(c))throw new Error('御魂条件不是对象');for(const k of ['ranges','suitRequirements','suits'])if(c[k]!=null&&!Array.isArray(c[k]))throw new Error('御魂条件列表损坏');
      if(c.ranges?.some(r=>!object(r)||typeof r.stat!=='string'||(r.min!=null&&!finite(r.min))||(r.max!=null&&!finite(r.max))||(r.min!=null&&r.max!=null&&r.min>r.max)))throw new Error('数值范围不合法');
      if(c.suitRequirements?.some(r=>!object(r)||typeof r.name!=='string'||![2,4].includes(r.count)))throw new Error('套装名称或件数不合法');
      if(c.mainStats!=null&&(!object(c.mainStats)||Object.entries(c.mainStats).some(([slot,stats])=>!['1','2','3','4','5','6'].includes(slot)||!Array.isArray(stats)||stats.some(x=>!Object.hasOwn(STAT_NAMES,x)))))throw new Error('主属性条件不合法');
      if(c.extraAttributes!=null&&(!object(c.extraAttributes)||Object.values(c.extraAttributes).some(x=>!finite(x))))throw new Error('额外属性必须为有限数值');
      if(c.targetScore!=null&&!finite(c.targetScore))throw new Error('指标阈值必须为有限数值');}
    return {...m,index:Number.isInteger(m.index)?m.index:i,shikigamiId:m.kind==='shikigami'?id(m.shikigamiId):null};
  });
  if(new Set(members.map(m=>m.index)).size!==members.length)throw new Error('成员槽位重复');
  return {...l,members,requirementsComplete:l.requirementsComplete===true};
}
function baseFromRoster(hero,roster){
  if(hero.level!==40||hero.star!==6)return null;
  const a=roster.find(r=>r.id===hero.shikigamiId)?.assets?.baseAttrs40?.[String(hero.awake)];
  if(!object(a)||!['attack','defense','maxHp','speed','critRate','critPower','debuffEnhance','debuffResist'].every(k=>finite(a[k])))return null;
  return {attack:a.attack,defense:a.defense,hp:a.maxHp,speed:a.speed,crit:a.critRate,critDamage:1+a.critPower,effectHit:a.debuffEnhance,effectResist:a.debuffResist};
}
function panel(base,souls,effects,extra={}){
  const stats={},sets={};for(const q of souls){sets[q.set]=(sets[q.set]||0)+1;for(const [k,v] of Object.entries(q.stats))stats[k]=(stats[k]||0)+v;}
  const unsupported=[];
  for(const e of effects){const count=Object.entries(sets).filter(([s,n])=>n>=2&&e.suitNames.includes(s)).length;if(count){if(!finite(e.value))unsupported.push(`未核实的两件套加成：${e.name}`);else stats[e.stat]=(stats[e.stat]||0)+count*e.value;}}
  const p={};for(const k of ['attack','hp','defense'])p[k]=base[k]*(1+(stats[k+'Percent']||0))+(stats[k]||0);
  for(const k of ['speed','crit','critDamage','effectHit','effectResist'])p[k]=base[k]+(stats[k]||0);
  p.attack=p.attack*(1+(extra.attackPercent||0))+(extra.attack||0);p.crit+=extra.crit||0;p.critDamage+=extra.critDamage||0;
  return {values:p,sets,unsupported};
}
function score(p,metric){const fields={2:'effectHit',3:'effectResist',4:'hp',5:'attack',6:'defense',7:'speed',8:'crit',9:'critDamage'};if(fields[metric])return p[fields[metric]];if(metric===1)return p.attack*p.critDamage;if(metric===10)return p.hp*p.critDamage;if(metric===11)return p.effectHit+p.effectResist;if(metric===12)return p.defense*p.critDamage;return null;}
function suitMatches(souls,config,effects){
  const counts={};for(const q of souls)counts[q.set]=(counts[q.set]||0)+1;
  return (config.suitRequirements||[]).every(r=>{const effect=effects.find(e=>e.name===r.name||(r.effectId!=null&&e.teamCodeId===r.effectId));return effect?Object.entries(counts).some(([s,n])=>n>=r.count&&effect.suitNames.includes(s)):(counts[r.name]||0)>=r.count;});
}
function checkPanel(p,c){
  const missing=[];
  for(const r of c.ranges||[]){const v=p[r.stat],div=r.percentage?100:1;if(!finite(v))missing.push(`未知属性 ${r.stat}`);else {if(finite(r.min)&&(r.minExclusive?v<=r.min/div:v<r.min/div-1e-8))missing.push(`${STAT_NAMES[r.stat]||r.stat}未满足${r.minExclusive?'>':'≥'}${r.min}${r.percentage?'%':''}`);if(finite(r.max)&&(r.maxExclusive?v>=r.max/div:v>r.max/div+1e-8))missing.push(`${STAT_NAMES[r.stat]||r.stat}未满足${r.maxExclusive?'<':'≤'}${r.max}${r.percentage?'%':''}`);}}
  const value=score(p,c.metricId);if(c.targetScore!=null&&(!finite(value)||value<c.targetScore))missing.push(`指标未达${c.targetScore}`);
  return missing;
}
function configUnknown(c,effects){
  const list=[];if(!c)return ['缺少御魂要求'];
  if(Array.isArray(c.protocolUncertainties))list.push(...c.protocolUncertainties);
  if(c.yuhunConfigEnabled===false)list.push('成员没有启用御魂计算');
  if(c.scope!=null&&!['all','unequipped'].includes(c.scope))list.push('未支持的库存范围');
  if(c.scope==='unequipped'||c.excludeOccupied)list.push('导出缺少穿戴归属，不能确认未占用');
  if(c.highestStat)list.push('最高属性约束尚未实现');
  if((c.ranges||[]).some(r=>!Object.hasOwn(STAT_NAMES,r.stat)||['attackPercent','hpPercent','defensePercent'].includes(r.stat)))list.push('包含未支持的面板范围');
  if(c.metricId!=null&&!METRICS[c.metricId])list.push('未知计算指标');
  if(c.suits?.length&&!c.suitRequirements?.length&&!c.suitSelectionComplete)list.push('旧版套装没有明确件数');
  for(const r of c.suitRequirements||[]){if(![2,4].includes(r.count))list.push('套装件数未核实');if(r.effectId!=null&&!effects.some(e=>e.teamCodeId===r.effectId))list.push('未知两件套效果');}
  for(const [k,v] of Object.entries(c.extraAttributes||{})){if(!['attackPercent','attack','crit','critDamage'].includes(k))list.push(`未实现额外属性 ${k}`);if(!finite(v)||v<0)list.push(`额外属性 ${k} 数值无法核实`);}
  return list;
}
function findBuilds(hero,config,account,roster,effects,options={}){
  const base=baseFromRoster(hero,roster);if(!base)return {status:'unknown',reasons:['缺少该等级/星级/觉醒形态的已核验基础面板'],builds:[]};
  const unknown=configUnknown(config,effects);if(unknown.length)return {status:'unknown',reasons:unknown,builds:[]};
  const inventory=Object.values(account.souls).filter(q=>!q.unknown.length&&(!config.sixStarOnly||q.star===6)&&(!config.maxLevelOnly||q.level===15));
  const absenceStatus=account.completeness==='complete'&&!Object.values(account.souls).some(q=>q.unknown.length)?'missing':'unknown';
  const groups=[1,2,3,4,5,6].map(slot=>inventory.filter(q=>q.slot===slot&&(!config.mainStats?.[slot]?.length||config.mainStats[slot].includes(q.mainStat))));
  const empty=groups.findIndex(g=>!g.length);if(empty>=0)return {status:absenceStatus,reasons:[`${empty+1}号位没有已识别且符合星级、等级及主属性的御魂`],builds:[]};
  for(const r of config.suitRequirements||[]){const effect=effects.find(e=>e.name===r.name||e.teamCodeId===r.effectId);const candidates=effect?.suitNames||[r.name];if(!candidates.some(s=>groups.filter(g=>g.some(q=>q.set===s)).length>=r.count))return {status:absenceStatus,reasons:[`${r.name}不足${r.count}个已识别的不同位置`],builds:[]};}
  const builds=[],seen=new Set();let checked=0,unsupported=false;
  function accept(q){if(q.length!==6||new Set(q.map(x=>x.id)).size!==6||new Set(q.map(x=>x.slot)).size!==6||!suitMatches(q,config,effects))return;const p=panel(base,q,effects,config.extraAttributes);if(p.unsupported.length){unsupported=true;return;}if(checkPanel(p.values,config).length)return;const key=q.map(x=>x.id).sort().join(',');if(seen.has(key))return;seen.add(key);builds.push({heroId:hero.instanceId,soulIds:q.map(x=>x.id),panel:p.values,score:score(p.values,config.metricId)});}
  for(const preset of account.presets||[]){const ids=Array.isArray(preset)?preset[1]:null;if(!Array.isArray(ids))continue;const q=ids.map(i=>account.souls[i]).filter(Boolean);if(q.every(x=>groups[x.slot-1].some(y=>y.id===x.id)))accept(q);}
  const product=groups.reduce((n,g)=>n*g.length,1),limit=options.limit??90000;
  // Small inventories are exhaustively checked. Large inventories use a bounded
  // beam; failing a bounded search is always UNKNOWN, never proof of absence.
  const heuristic=q=>{const p=panel(base,q,effects,config.extraAttributes).values;let v=score(p,config.metricId)||p.attack*p.critDamage;v=Math.log(Math.max(v,1));for(const r of config.ranges||[]){const d=r.percentage?100:1,t=p[r.stat]||0;if(finite(r.min))v-=Math.max(0,r.min/d-t)/Math.max(Math.abs(r.min/d),1)*5;if(finite(r.max))v-=Math.max(0,t-r.max/d)/Math.max(Math.abs(r.max/d),1)*10;}for(const r of config.suitRequirements||[]){const e=effects.find(e=>e.name===r.name||e.teamCodeId===r.effectId);const n=q.filter(x=>(e?.suitNames||[r.name]).includes(x.set)).length;v+=Math.min(n,r.count)*1.2;}return v;};
  let exhaustive=product<=limit;
  if(exhaustive){function dfs(n,q){if(n===6){checked++;accept(q);return;}for(const x of groups[n])dfs(n+1,[...q,x]);}dfs(0,[]);}
  else {let beam=[{q:[],v:0}];const width=options.width??160;const reduced=groups.map(g=>g.length<=50?g:g.map(q=>({q,v:heuristic([q])})).sort((a,b)=>b.v-a.v).slice(0,50).map(x=>x.q));for(const g of reduced){let next=[];for(const b of beam)for(const q of g){const arr=[...b.q,q];next.push({q:arr,v:heuristic(arr)});checked++;}next.sort((a,b)=>b.v-a.v);beam=next.slice(0,width);}for(const b of beam)accept(b.q);}
  builds.sort((a,b)=>(b.score||0)-(a.score||0));
  // Equal-score builds can use different inventory. Preserve small solution
  // sets, and include disjoint alternatives before truncating larger sets.
  let candidates=builds;
  if(builds.length>128){const chosen=builds.slice(0,64),selected=new Set(chosen);for(const anchor of builds.slice(0,8)){const used=new Set(anchor.soulIds);for(const b of builds)if(!selected.has(b)&&b.soulIds.every(x=>!used.has(x))){chosen.push(b);selected.add(b);break;}}for(const b of builds)if(chosen.length<128&&!selected.has(b)){chosen.push(b);selected.add(b);}candidates=chosen;}
  return {status:builds.length?'found':exhaustive&&!unsupported?absenceStatus:'unknown',reasons:builds.length?[]:[unsupported?'包含尚未核实的套装加成':exhaustive?'已穷举已识别的库存，未满足套装或数值要求':'限定搜索未找到方案；不能证明御魂做不出'],builds:candidates,checked,exhaustive};
}
function memberCandidates(member,account){
  const all=Object.values(account.heroes).filter(h=>h.shikigamiId===member.shikigamiId);
  if(!all.length)return {status:'missing',reason:'缺少式神',heroes:[]};
  const passed=all.filter(h=>(member.awakening==null||h.awake===member.awakening)&&(!member.level||h.level>=member.level)&&(!member.star||h.star>=member.star)&&(member.skills||[]).every(s=>h.skills.some(a=>a.id===s.id&&(s.exact?a.level===s.level:a.level>=s.level))));
  if(!passed.length)return {status:'missing',reason:`已有${all.length}个实例，但${[member.awakening!=null?'觉醒状态':'',member.level?'等级':'',member.star?'星级':'',member.skills?.length?'技能':''].filter(Boolean).join('、')}不符合`,heroes:[]};
  return {status:'found',heroes:passed.sort((a,b)=>b.star-a.star||b.level-a.level)};
}
function matchLineup(lineup,account,roster,effects,options={}){
  if(!lineup.members?.some(m=>m.occupied!==false))return {status:'unknown',label:'待解析',reasons:['阵容码尚未获得成员数据'],members:[]};
  const results=[],unknown=[],usedRequired={};
  const roles=lineup.members.filter(m=>m.occupied!==false&&m.kind!=='onmyoji'&&!m.borrowed);
  for(const m of roles)if(m.shikigamiId)usedRequired[m.shikigamiId]=(usedRequired[m.shikigamiId]||0)+1;
  for(const [sid,count]of Object.entries(usedRequired)){const available=Object.values(account.heroes).filter(h=>h.shikigamiId===sid).length;if(count>available)return {status:account.completeness==='complete'?'missing':'unknown',label:account.completeness==='complete'?'缺式神':'导出不完整',reasons:[`${roster.find(r=>r.id===sid)?.name||sid}需要${count}个不同实例，本次导出有${available}个`],members:[]};}
  for(const m of lineup.members.filter(m=>m.occupied!==false)){
    if(m.kind==='onmyoji'){unknown.push('导出文件未提供阴阳师/英杰信息');continue;}
    if(m.borrowed){unknown.push(`${m.name}需要借用协战，导出未提供可借状态`);results.push({name:m.name,status:'unknown',reasons:['需确认协战式神及其配置']});continue;}
    if(!m.shikigamiId){unknown.push(`${m.name}身份尚未核实`);results.push({name:m.name,status:'unknown',reasons:['成员ID未核实']});continue;}
    const owned=memberCandidates(m,account);
    if(owned.status==='missing'){results.push({name:m.name,status:account.completeness==='complete'?'missing':'unknown',reasons:[owned.reason]});if(account.completeness!=='complete')unknown.push(`${m.name}：导出不完整，无法确认缺少实例`);continue;}
    if(!m.config){unknown.push(`${m.name}未提供御魂条件`);results.push({name:m.name,status:'unknown',reasons:['已拥有式神；御魂条件未提供'],instanceCount:owned.heroes.length});continue;}
    if(m.awakening==null)unknown.push(`${m.name}觉醒要求未指定`);
    if(m.skills==null)unknown.push(`${m.name}技能要求未指定`);
    const tested=owned.heroes.slice(0,options.heroLimit??3).map(h=>findBuilds(h,m.config,account,roster,effects,options));
    const builds=tested.flatMap(r=>r.builds);
    const status=builds.length?'found':tested.every(r=>r.status==='missing')&&tested.length===owned.heroes.length?'missing':'unknown';
    if(status==='unknown')unknown.push(`${m.name}御魂尚未证实`);
    results.push({name:m.name,index:m.index,status,reasons:[...new Set(tested.flatMap(r=>r.reasons))],builds,instanceCount:owned.heroes.length,checked:tested.reduce((s,r)=>s+(r.checked||0),0)});
  }
  if(results.some(r=>r.status==='missing'))return {status:'missing',label:'存在缺口',reasons:results.filter(r=>r.status==='missing').map(r=>`${r.name}：${r.reasons.join('；')}`),members:results};
  const buildRoles=results.filter(r=>r.builds?.length);let assignment=null,steps=0;
  function assign(n,heroes,souls,chosen){if(++steps>100000)return false;if(n===buildRoles.length){assignment=chosen;return true;}for(const b of buildRoles[n].builds){if(heroes.has(b.heroId)||b.soulIds.some(x=>souls.has(x)))continue;if(assign(n+1,new Set([...heroes,b.heroId]),new Set([...souls,...b.soulIds]),[...chosen,{name:buildRoles[n].name,...b}]))return true;}return false;}
  assign(0,new Set(),new Set(),[]);
  if(!assignment&&buildRoles.length)unknown.push('候选方案存在御魂或式神实例冲突；尚未找到全队不重复分配');
  if(!lineup.requirementsComplete)unknown.push('来源要求不完整，配速、战斗机制和替代方案需核对');
  if(account.merged)unknown.push('增量合并保留旧记录，需确认资产仍在仓库');
  if(account.completeness!=='complete')unknown.push('账号导出不完整');
  if(!roles.length)unknown.push('没有可核验的式神槽位');
  return {status:unknown.length?'unknown':'available',label:unknown.length?'需核对':'配置可组成',reasons:[...new Set(unknown)],members:results,assignment};
}
return {STAT_NAMES,STAT_TYPES,METRICS,normalizeCode,hasLineupCode,classifyCode,adaptTA,mergeDecodedLineup,adaptInspection,parseAccount,mergeAccount,restoreAccount,validateLineup,baseFromRoster,panel,score,suitMatches,checkPanel,findBuilds,memberCandidates,matchLineup};
});
