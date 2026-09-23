(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasCore=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const STAT_NAMES={attack:'攻击',attackPercent:'攻击加成',hp:'生命',hpPercent:'生命加成',defense:'防御',defensePercent:'防御加成',speed:'速度',crit:'暴击',critDamage:'暴击伤害',effectHit:'效果命中',effectResist:'效果抵抗'};
const STAT_TYPES={attack_flat:'attack',attack_rate:'attackPercent',hp_flat:'hp',hp_rate:'hpPercent',defense_flat:'defense',defense_rate:'defensePercent',speed:'speed',crit_rate:'crit',crit_damage:'critDamage',effect_hit:'effectHit',effect_resist:'effectResist'};
const METRICS={1:['伤害输出','attack × critDamage'],2:['效果命中','effectHit'],3:['效果抵抗','effectResist'],4:['生命','hp'],5:['攻击','attack'],6:['防御','defense'],7:['速度','speed'],8:['暴击','crit'],9:['暴击伤害','critDamage'],10:['治疗量','hp × critDamage'],11:['命抗双修','effectHit + effectResist'],12:['防御输出','defense × critDamage']};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>/^\d+$/.test(String(x))?String(Number(x)):null;
function inspectCode(value){
 const originalCode=String(value??''),repairs=[];let code=originalCode.replace(/^\uFEFF/,'').trim();
 if(code!==originalCode)repairs.push('去除首尾空白或 BOM');
 const prefix=code.match(/^[|｜][TtＴｔ][AaＡａ][|｜]/);
 if(prefix&&prefix[0]!=='|TA|'){code='|TA|'+code.slice(4);repairs.push('统一文字码前缀');}
 if(code.startsWith('|TA|')){
  const key=code.slice(4),joined=key.replace(/[\s\u200b-\u200d\u2060\ufeff]/g,'');
  // A wrapped 32-digit hexadecimal key has an unambiguous repair. Other
  // share keys stay opaque; never guess missing characters or change case.
  if(key!==joined&&/^[a-fA-F0-9]{32}$/.test(joined)){code='|TA|'+joined;repairs.push('去除分享键中的排版空白');}
 }else if(code.startsWith('#TA#')){
  const payload=code.slice(4),joined=payload.replace(/\s/g,'');
  if(payload!==joined&&joined.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(joined)){code='#TA#'+joined;repairs.push('合并完整阵容内容的换行');}
 }
 return {code,originalCode,repairs};
}
const normalizeCode=s=>inspectCode(s).code;
const codeProvenance=value=>{const r=inspectCode(value);return r.repairs.length?{originalCode:r.originalCode,codeRepairs:r.repairs}:{};};
const hasLineupCode=l=>typeof l?.code==='string'&&!!l.code.trim();
const hasParsedContent=l=>Array.isArray(l?.members)&&l.members.some(m=>m.occupied!==false)&&!['reference','failed','unattempted','lookup-required'].includes(l.decodeState);
function paginate(items,page=1,size=60){size=[24,60,120].includes(Number(size))?Number(size):60;const pages=Math.max(1,Math.ceil(items.length/size));page=Math.max(1,Math.min(pages,Math.floor(Number(page)||1)));return {items:items.slice((page-1)*size,page*size),page,pages,total:items.length,start:items.length?(page-1)*size+1:0,end:Math.min(page*size,items.length),size};}
function classifyCode(s){s=normalizeCode(s);if(new TextEncoder().encode(s).length>32*1024*1024)return 'too-large';if(/^\|TA\|[^\s|\x00-\x1f\x7f\u200b-\u200d\u2060\ufeff]{1,4096}$/.test(s))return 'pipe-ta';if(/^#TA#\S+$/.test(s)&&s.length>4)return 'hash-ta';if(s.length>=8&&s.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(s))return 'lineup-data';return 'unknown';}
function adaptTA(payload,data={}){
  if(payload?.ok!==true||payload.format!=='ta-payload'||!object(payload.data)||!Array.isArray(payload.data.hconf)||!Array.isArray(payload.kinds))throw new Error(payload?.error||'TA 解析结果结构无效');
  const d=payload.data;if(d.hconf.length!==payload.kinds.length||!d.hconf.length||d.hconf.length>30)throw new Error('TA 成员数量不合法');
  const attrs={atk_per:'attackPercent',critical_rate:'crit',critical_pow:'critDamage',spd:'speed',debuff_acc:'effectHit',debuff_res:'effectResist',max_hp_per:'hpPercent',def_per:'defensePercent'};
  const limits={final_atk:'attack',final_max_hp:'hp',final_def:'defense',spd:'speed',critical_rate:'crit',critical_pow:'critDamage',debuff_acc:'effectHit',debuff_res:'effectResist'};
  const members=d.hconf.map((row,index)=>{
    const kind=payload.kinds[index];if(!['onmyoji','shikigami'].includes(kind)||!id(row.hero_id))throw new Error('TA 成员类型或ID无效');
    const actor=(data.actors||[]).find(a=>a.gameId!=null&&String(a.gameId)===String(row.hero_id)),roster=(data.roster||[]).find(r=>r.id===String(row.hero_id)),equip=row.equip_info;
    let config=null;
    if(equip){
      const uncertainties=[],ranges=[];
      for(const [key,bounds] of Object.entries(equip.limit||{})){
        if(key==='ExtraAttr')continue;
        if(!limits[key]||!Array.isArray(bounds)||bounds.length!==2||bounds.some(v=>!finite(v))){uncertainties.push(`未识别属性范围 ${key}`);continue;}
        const [min,max]=bounds;if(min<0&&max<0)continue;
        ranges.push({stat:limits[key],min:min<0?null:min,max:max<0?null:max,percentage:['crit','critDamage','effectHit','effectResist'].includes(limits[key])});
      }
      const extra=Object.fromEntries(Object.entries(equip.limit?.ExtraAttr||{}).map(([k,v])=>[{attackRate:'attackPercent',attack:'attack',critRate:'crit',critPower:'critDamage'}[k]||k,v]));
      const suits=new Map();for(const [sid,count] of equip.suit||[])suits.set(sid,(suits.get(sid)||0)+count);
      if([...suits.values()].reduce((s,n)=>s+n,0)+(equip.two_suit?.length||0)*2>6)uncertainties.push('套装要求超过六个位置，需核对原码');
      if([...suits.keys()].some(sid=>!data.suits?.[sid]))uncertainties.push('包含未收录套装编号');
      config={sixStarOnly:equip.yuhun_star?.length===1&&equip.yuhun_star[0]===6,maxLevelOnly:equip.yuhun_lv?.[0]===15,allowedStars:equip.yuhun_star,levelRange:equip.yuhun_lv,scope:'all',suitRequirements:[...suits].map(([sid,count])=>({name:data.suits?.[sid]||`未知御魂 ${sid}`,count,gameId:sid})),twoPieceStats:(equip.two_suit||[]).map(a=>attrs[a]||a),suitSelectionComplete:true,mainStats:Object.fromEntries(Object.entries(equip.main_attr||{}).map(([slot,values])=>[String(Number(slot)+1),values.map(v=>attrs[v]||v)])),ranges,extraAttributes:extra,metricId:equip.criteria,highestStats:(row.highest_limit||[]).map(a=>limits[a]||a),keepCurrent:!!row.not_calc_flag,protocolUncertainties:uncertainties,protocol:{criteria:equip.criteria,twoSuit:equip.two_suit||[],limits:equip.limit||{},highest:row.highest_limit||[],notCalcFlag:row.not_calc_flag,useScore:row.use_score,yuhunLevel:equip.yuhun_lv,yuhunStars:equip.yuhun_star},raw:equip};
    }
    return {index,kind,shikigamiId:kind==='shikigami'?String(row.hero_id):null,onmyojiId:kind==='onmyoji'?String(row.hero_id):null,name:kind==='onmyoji'?(actor?.name||`阴阳师 / 英杰 ${row.hero_id}`):(roster?.name||`未知式神 ${row.hero_id}`),occupied:true,awakening:[0,1].includes(row.awake)?row.awake:null,skills:Array.isArray(row.skills)?row.skills.map(([skillId,level])=>{const game=typeof module==='object'&&module.exports?require('./game-config.js'):globalThis.AtlasGame;return {id:skillId,level,name:game?.skill(data.gameConfig,skillId,level,row.awake)?.name,slotLabel:game?.skillLabel(data.gameConfig,row.hero_id,skillId)};}):null,level:row.level,star:row.star,levelMode:'recommended',config,qiling:row.qiling_info||null,aiSkill:row.ai_skill,raw:row};
  });
  const queried=payload.origin==='official-query';
  return {title:typeof d.title==='string'?d.title:'已解析的自创阵容',notes:typeof d.desc==='string'?d.desc:'',gameSceneId:d.select_stage_id,code:payload.code,shortCode:payload.shortCode||undefined,members,sourceKind:queried?'ta-query':'ta-local',decodeState:queried?'decoded-server':'decoded-local',requirementsComplete:members.filter(m=>m.kind==='shikigami').every(m=>!m.config?.protocolUncertainties.length),mapperVersion:5,warnings:[queried?'内容来自文字码的官方查询响应，已在本机保存。':'成员与要求来自本地协议解码。','使用实际式神实例的基础属性计算；推荐等级、星级差异会单独列出。阴阳师、英杰与契灵默认拥有，等级及配置按阵容设置；其增益单独展示，不追加到式神御魂面板。'],protocolVersion:d.ver??0,raw:d};
}
function mergeDecodedLineup(old,incoming){
  if(!old)return incoming;
  if(old.code!==incoming.code)throw new Error('不能合并不同阵容码');
  return {...old,...incoming,id:old.id,sourceKind:old.sourceKind||incoming.sourceKind,title:old.title&&old.title!=='未命名阵容'?old.title:incoming.title,notes:old.notes||incoming.notes,category:old.category,subcategory:old.subcategory,section:old.section,dungeon:old.dungeon,dungeons:old.dungeons,manualPaths:old.manualPaths,manualClassification:old.manualClassification,relations:old.relations,shortCode:incoming.shortCode||old.shortCode,classificationPaths:old.classificationPaths||incoming.classificationPaths,occurrences:old.occurrences||incoming.occurrences};
}
function deletedPresetIds(value){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!v||v.length>512||/[\x00-\x1f]/.test(v)))throw new Error('预设删除记录格式无效');
  return [...new Set(value)];
}
function lineupReplacements(value){
 if(value===undefined)return {};
 if(!object(value)||Object.entries(value).some(([from,to])=>[from,to].some(v=>typeof v!=='string'||!v||v.length>512||/[\x00-\x1f]/.test(v))))throw Error('阵容合并记录格式无效');
 return Object.fromEntries(Object.entries(value));
}
function lineupTimestamp(lineup){
 // Failed attempts and backup/import times do not describe a content update.
 const times=['updatedAt','parsedAt','createdAt','date'].map(k=>typeof lineup[k]==='string'?Date.parse(lineup[k]):NaN).filter(Number.isFinite);
 return times.length?Math.max(...times):-Infinity;
}
function reconcileLibrary(presets,current,backup=null){
 const deleted=new Set([...deletedPresetIds(current.deletedPresetIds),...deletedPresetIds(backup?.deletedPresetIds)]);
 const aliases=[...Object.entries(lineupReplacements(current.lineupReplacements)),...Object.entries(lineupReplacements(backup?.lineupReplacements))];
 const candidates=[];
 for(const [rows,source,priority] of [[presets.filter(l=>!deleted.has(l.id)),'preset',0],[current.lineups,'local',2],[backup?.lineups||[],'backup',1]]){
  for(const lineup of rows)if(hasLineupCode(lineup))candidates.push({lineup,source,priority,time:lineupTimestamp(lineup)});
 }
 const parents=candidates.map((_,i)=>i),sizes=parents.map(()=>1),keys=new Map();
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const join=(a,b)=>{a=find(a);b=find(b);if(a===b)return;if(sizes[a]<sizes[b])[a,b]=[b,a];parents[b]=a;sizes[a]+=sizes[b];};
 const codeKey=value=>{const normalized=normalizeCode(value);return classifyCode(normalized)==='lineup-data'?'#TA#'+normalized:normalized;};
 candidates.forEach(({lineup},i)=>{
  const values=[['id',lineup.id],['title',lineup.title?.trim()],['code',codeKey(lineup.code)]];
  if(classifyCode(lineup.shortCode)==='pipe-ta')values.push(['code',codeKey(lineup.shortCode)]);
  for(const [kind,value] of values)if(value){const key=kind+':'+value;if(keys.has(key))join(i,keys.get(key));else keys.set(key,i);}
 });
 // Merged records keep their identity even if a later edition changes both
 // title and code. Remembered IDs also keep old target/draft links usable.
 const aliasNode=id=>{const key='id:'+id;if(!keys.has(key)){const i=parents.length;parents.push(i);sizes.push(1);keys.set(key,i);}return keys.get(key);};
 for(const [from,to] of aliases)join(aliasNode(from),aliasNode(to));
 const groups=new Map();
 candidates.forEach((candidate,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(candidate);});
 const lineups=[],idMap=new Map(),replacements=new Map(),conflicts=[],winners=new Map();
 for(const [root,group] of groups){
  const winner=group.reduce((best,item)=>item.time>best.time||item.time===best.time&&item.priority>=best.priority?item:best);
  lineups.push(winner.lineup);winners.set(root,winner.lineup.id);
  for(const item of group){
   idMap.set(item.lineup.id,winner.lineup.id);
   if(item.lineup.id!==winner.lineup.id)replacements.set(item.lineup.id,winner.lineup.id);
  }
  if(group.length>1)conflicts.push({id:winner.lineup.id,title:winner.lineup.title,source:winner.source,time:Number.isFinite(winner.time)?new Date(winner.time).toISOString():null,count:group.length});
 }
 for(const [key,node] of keys)if(key.startsWith('id:')){const from=key.slice(3),to=winners.get(find(node));if(to){idMap.set(from,to);if(from!==to&&!deleted.has(from))replacements.set(from,to);}}
 const keptIds=new Set(lineups.map(l=>l.id));
 const result={...(backup||current),lineups,deletedPresetIds:[...deleted].filter(id=>!keptIds.has(id)),lineupReplacements:Object.fromEntries(replacements)};
 const targetLists=(state,id)=>Array.isArray(state?.targetLineups?.[id])?state.targetLineups[id]:[];
 result.targetLineups=Object.fromEntries((result.accounts||[]).map(a=>[a.id,[...new Set([...targetLists(current,a.id),...targetLists(backup,a.id)].map(id=>idMap.get(id)).filter(Boolean))]]));
 if(result.builderDraft?.savedId)result.builderDraft={...result.builderDraft,savedId:idMap.get(result.builderDraft.savedId)||null};
 return {state:result,summary:{candidates:candidates.length,kept:lineups.length,removed:candidates.length-lineups.length,groups:conflicts.length},conflicts};
}
const hydratedLineups=new WeakMap();
function libraryLineups(presets,state){
  const deleted=new Set([...deletedPresetIds(state.deletedPresetIds),...Object.keys(lineupReplacements(state.lineupReplacements))]),map=new Map(presets.filter(l=>!deleted.has(l.id)).map(l=>[l.id,l]));
  for(const saved of state.lineups){
    const base=map.get(saved.id),cached=hydratedLineups.get(saved);
    if(cached&&cached.base===base){map.set(saved.id,cached.value);continue;}
    const l=base?.code===saved.code?{...base,...saved,occurrences:base.occurrences?.length?base.occurrences:saved.occurrences,sourceFile:base.sourceFile||saved.sourceFile}:saved;
    // Bundled content may fill an old empty record, but cannot undo a newer
    // server failure (a share key can expire while its local content survives).
    map.set(l.id,base?.code===l.code&&hasParsedContent(base)&&!hasParsedContent(l)?{...mergeDecodedLineup(l,base),lastParseError:l.lastParseError||null,lastParseFailure:l.lastParseFailure||null}:l);
    hydratedLineups.set(saved,{base,value:map.get(l.id)});
  }
  return [...map.values()].filter(hasLineupCode);
}
function removeLibraryLineups(state,presets,ids){
  const removed=new Set(ids);
  const replacements=Object.entries(lineupReplacements(state.lineupReplacements));
  const next={...state,lineups:state.lineups.filter(l=>!removed.has(l.id)),deletedPresetIds:[...new Set([...deletedPresetIds(state.deletedPresetIds),...presets.filter(l=>removed.has(l.id)).map(l=>l.id),...replacements.filter(([from,to])=>removed.has(to)&&presets.some(l=>l.id===from)).map(([from])=>from)])],lineupReplacements:Object.fromEntries(replacements.filter(([from,to])=>!removed.has(from)&&!removed.has(to)))};
  if(state.targetLineups)next.targetLineups=normalizeTargets(next,presets);
  return next;
}
function normalizeTargets(state,presets){
  const valid=new Set(libraryLineups(presets,state).map(l=>l.id)),saved=state.targetLineups||{};
  return Object.fromEntries((state.accounts||[]).map(a=>[a.id,[...new Set((Array.isArray(saved[a.id])?saved[a.id]:[]).filter(id=>valid.has(id)))]]));
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
      if(c.suitRequirements?.some(r=>!object(r)||typeof r.name!=='string'||![2,4,6].includes(r.count)))throw new Error('套装名称或件数不合法');
      if(c.mainStats!=null&&(!object(c.mainStats)||Object.entries(c.mainStats).some(([slot,stats])=>!['1','2','3','4','5','6'].includes(slot)||!Array.isArray(stats)||stats.some(x=>!Object.hasOwn(STAT_NAMES,x)))))throw new Error('主属性条件不合法');
      if(c.extraAttributes!=null&&(!object(c.extraAttributes)||Object.values(c.extraAttributes).some(x=>!finite(x))))throw new Error('额外属性必须为有限数值');
      if(c.targetScore!=null&&!finite(c.targetScore))throw new Error('指标阈值必须为有限数值');}
    return {...m,index:Number.isInteger(m.index)?m.index:i,shikigamiId:m.kind==='shikigami'?id(m.shikigamiId):null};
  });
  if(new Set(members.map(m=>m.index)).size!==members.length)throw new Error('成员槽位重复');
  if(l.manualPaths!=null){const lib=typeof module==='object'&&module.exports?require('./library-model.js'):globalThis.AtlasLibrary;l={...l,manualPaths:lib.paths(l.manualPaths)};}
  return {...l,members,requirementsComplete:l.requirementsComplete===true};
}
function baseFromRoster(hero,roster){
  const entry=roster.find(r=>r.id===hero.shikigamiId),rules=entry?.gameRules,rows=hero.attrs;
  if(rules&&Array.isArray(rows)&&rows.length===8&&rows.slice(0,6).every(row=>Array.isArray(row)&&row.length===4&&row.every(finite))){
    // MuMu attrs: HP, speed, critical power, critical rate, defense, attack.
    // Tuple[0] is the growth base; tuple[1..3] includes the old equipment.
    return {hp:rows[0][0],speed:rows[1][0],critDamage:1+rows[2][0],crit:rows[3][0],defense:rows[4][0],attack:rows[5][0],effectHit:rules.baseHit,effectResist:rules.baseResist,innate:hero.awake?{...rules.awakeBonus}:{},source:'export-base'};
  }
  if(hero.level!==40||hero.star!==6)return null;
  const a=entry?.assets?.baseAttrs40?.[String(hero.awake)];
  if(!object(a)||!['attack','defense','maxHp','speed','critRate','critPower','debuffEnhance','debuffResist'].every(k=>finite(a[k])))return null;
  const innate=hero.awake?{...rules?.awakeBonus}:{};
  return {attack:a.attack/(1+(innate.attackPercent||0)),defense:a.defense/(1+(innate.defensePercent||0)),hp:a.maxHp/(1+(innate.hpPercent||0)),speed:a.speed-(innate.speed||0),crit:a.critRate-(innate.crit||0),critDamage:1+a.critPower-(innate.critDamage||0),effectHit:a.debuffEnhance-(innate.effectHit||0),effectResist:a.debuffResist-(innate.effectResist||0),innate};
}
function panel(base,souls,effects,extra={}){
  const stats={...base.innate},sets={};for(const q of souls){sets[q.set]=(sets[q.set]||0)+1;for(const [k,v] of Object.entries(q.stats))stats[k]=(stats[k]||0)+v;}
  const unsupported=[];
  if(effects.length)for(const set of Object.keys(sets))if(!effects.some(e=>e.suitNames.includes(set)))unsupported.push(`套装 ${set} 的加成未收录`);
  for(const e of effects){const cycle=e.cycle||4,count=Object.entries(sets).filter(([s])=>e.suitNames.includes(s)).reduce((sum,[,n])=>sum+Math.floor(n/cycle)+(n%cycle>=2?1:0),0);if(count){if(!finite(e.value))unsupported.push(`未核实的两件套加成：${e.name}`);else stats[e.stat]=(stats[e.stat]||0)+count*e.value;}}
  const p={};for(const k of ['attack','hp','defense'])p[k]=base[k]*(1+(stats[k+'Percent']||0))+(stats[k]||0);
  for(const k of ['speed','crit','critDamage','effectHit','effectResist'])p[k]=base[k]+(stats[k]||0);
  p.attack=p.attack*(1+(extra.attackPercent||0))+(extra.attack||0);p.crit+=extra.crit||0;p.critDamage+=extra.critDamage||0;
  return {values:p,sets,unsupported};
}
// APK 2.8.84: auto_yuhun_criteria_expression (33249), with the dynamic
// Peacock override in YuhunAlgo.AlgoMgr.init_algo (7126:606).
function objectiveFormula(heroId,metric){
 const formulas={344:{1:'(攻击 + 防御 × 2) × 暴伤',12:'(防御 + 攻击 × 0.1) × 暴伤'},332:{1:'攻击 × 暴伤²'},392:{1:'攻击 × (暴伤 − 0.5)'},550:{1:'(攻击 + 基础攻击 × (0.75 + 效果命中)) × 暴伤'},590:{1:'攻击 × (暴伤 + 效果抵抗)'}};
 return formulas[heroId]?.[metric]||METRICS[metric]?.[1]||'满足全部条件';
}
function score(p,metric,objective={}){
 const id=String(objective.heroId||'');
 if(metric===1){
  if(id==='344')return (p.attack+p.defense*2)*p.critDamage;
  if(id==='332')return p.attack*p.critDamage*p.critDamage;
  if(id==='392')return p.attack*(p.critDamage-.5);
  if(id==='550')return finite(objective.baseAttack)?(p.attack+objective.baseAttack*(.75+p.effectHit))*p.critDamage:null;
  if(id==='590')return p.attack*(p.critDamage+p.effectResist);
  return p.attack*p.critDamage;
 }
 if(metric===12&&id==='344')return (p.defense+p.attack*.1)*p.critDamage;
 const fields={2:'effectHit',3:'effectResist',4:'hp',5:'attack',6:'defense',7:'speed',8:'crit',9:'critDamage'};if(fields[metric])return p[fields[metric]];if(metric===10)return p.hp*p.critDamage;if(metric===11)return p.effectHit+p.effectResist;if(metric===12)return p.defense*p.critDamage;return null;
}
function checkPanel(p,c,objective){
  const missing=[];
  for(const r of c.ranges||[]){const v=p[r.stat],div=r.percentage?100:1;if(!finite(v))missing.push(`未知属性 ${r.stat}`);else {if(finite(r.min)&&(r.minExclusive?v<=r.min/div:v<r.min/div-1e-8))missing.push(`${STAT_NAMES[r.stat]||r.stat}未满足${r.minExclusive?'>':'≥'}${r.min}${r.percentage?'%':''}`);if(finite(r.max)&&(r.maxExclusive?v>=r.max/div:v>r.max/div+1e-8))missing.push(`${STAT_NAMES[r.stat]||r.stat}未满足${r.maxExclusive?'<':'≤'}${r.max}${r.percentage?'%':''}`);}}
  const value=score(p,c.metricId,objective);if(c.targetScore!=null&&(!finite(value)||value<c.targetScore))missing.push(`指标未达${c.targetScore}`);
  return missing;
}

const api={STAT_NAMES,STAT_TYPES,METRICS,inspectCode,codeProvenance,normalizeCode,hasLineupCode,hasParsedContent,paginate,classifyCode,adaptTA,mergeDecodedLineup,deletedPresetIds,lineupReplacements,lineupTimestamp,reconcileLibrary,libraryLineups,removeLibraryLineups,normalizeTargets,adaptInspection,parseAccount,mergeAccount,restoreAccount,validateLineup,baseFromRoster,panel,score,objectiveFormula,checkPanel};
const solver=typeof module==='object'&&module.exports?require('./solver.js'):globalThis.AtlasSolver;
return Object.assign(api,solver(api));
});
