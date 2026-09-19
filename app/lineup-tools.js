(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasLineupTools=api;})(globalThis,function(){
'use strict';
function summarize(lineups,results){
 const groups={heroes:new Map(),training:new Map(),souls:new Map(),otherSouls:new Map()},report={total:lineups.length,done:0,pending:0,unknown:0,errors:0};
 function add(group,key,name,l,text){
  if(!group.has(key))group.set(key,{key,name,lineups:new Map()});
  const row=group.get(key);if(!row.lineups.has(l.id))row.lineups.set(l.id,{id:l.id,title:l.title,reasons:[]});
  const reasons=row.lineups.get(l.id).reasons;if(text&&!reasons.includes(text))reasons.push(text);
 }
 for(const l of lineups){
  const r=results[l.id],a=r?.gapAssessment;
  if(r?.completed){report.done++;if(r.proof?.state==='error')report.errors++;else if(a?.heroes==='unknown'||a?.souls==='unknown')report.unknown++;}else report.pending++;
  for(const d of a?.heroDeficits||[]){if(d.shortage)add(groups.heroes,d.id,d.name,l,`共需${d.required}个实例，拥有${d.owned}个，缺${d.shortage}个`);if(d.training)add(groups.training,d.id,d.name,l,`${d.training}个实例的技能、等级、星级或觉醒不符合要求`);}
  for(const d of a?.soulShortages||[])for(const reason of d.reasons)add(groups.souls,d.name,d.name,l,reason);
  if(a?.souls==='missing'&&!a.soulShortages?.length)add(groups.otherSouls,'constraints','数值或组合不达标',l,'完整搜索未找到满足全部数值、位置及同队占用要求的方案');
 }
 for(const [key,group] of Object.entries(groups))report[key]=[...group.values()].map(row=>({...row,lineups:[...row.lineups.values()],count:row.lineups.size})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh'));
 return report;
}
return {summarize};
});
