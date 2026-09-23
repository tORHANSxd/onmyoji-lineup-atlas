'use strict';
// Reads only explicitly supplied snapshots. Reports contain counts, never identities or raw records.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/core.js'),data=require('../data/bundle.json');
const files=process.argv.slice(2),reports=[];
if(!files.length)throw Error('Usage: node tools/verify-snapshot.cjs <snapshot.json> [...]');
const stats={attack_flat:'attack',attack_rate:'attackPercent',hp_flat:'hp',hp_rate:'hpPercent',defense_flat:'defense',defense_rate:'defensePercent',speed:'speed',crit_rate:'crit',crit_damage:'critDamage',effect_hit:'effectHit',effect_resist:'effectResist'};
for(const [i,file] of files.entries()){
 const text=fs.readFileSync(file,'utf8'),raw=JSON.parse(text.replace(/^\uFEFF/,'')),start=performance.now(),a=C.parseAccount(raw);
 const heroes=Object.values(a.heroes),souls=Object.values(a.souls);let bases=0;
 assert.equal(heroes.length,Object.keys(raw.heroes).length,'式神数量');assert.equal(souls.length,raw.hero_equips.length,'御魂数量');
 for(const [key,h] of Object.entries(raw.heroes)){
  const actual=a.heroes[key];assert.ok(!!actual,'实例未丢失');
  assert.ok(actual.shikigamiId===String(Number(h.heroId))&&actual.level===h.level&&actual.star===h.star&&actual.awake===h.awake,'式神培养信息');
  assert.ok(JSON.stringify(actual.skills)===JSON.stringify(h.skinfo.map(([id,level])=>({id,level}))),'技能 ID 与等级');
  assert.ok(JSON.stringify(actual.attrs)===JSON.stringify(h.attrs),'属性记录');
  const entry=data.roster.find(r=>r.id===actual.shikigamiId),base=C.baseFromRoster(actual,data.roster);
  if(entry?.gameRules&&h.attrs?.length===8){
   assert.ok(!!base,'可识别基础属性');
   const values=[['hp',0],['speed',1],['critDamage',2],['crit',3],['defense',4],['attack',5]];
   for(const [stat,row] of values)assert.ok(base[stat]===h.attrs[row][0]+(stat==='critDamage'?1:0),'实例基础值与暴伤单位');
   bases++;
  }
 }
 for(const q of raw.hero_equips){
  const actual=a.souls[q.id],expected={};assert.ok(!!actual,'御魂实例未丢失');
  for(const attr of [{type:q.mainAttrType,value:q.mainAttrValue},...q.subAttributes]){
   assert.ok(stats[attr.type]&&Number.isFinite(attr.value),'样本属性可识别');
   expected[stats[attr.type]]=(expected[stats[attr.type]]||0)+attr.value;
  }
  assert.ok(JSON.stringify(actual.stats)===JSON.stringify(expected),'全部御魂数值与小数比例');
  assert.ok(actual.slot===q.slot&&actual.level===q.level&&actual.star===q.quality,'御魂位置、强化和星级');
 }
 assert.ok(JSON.stringify(a.presets)===JSON.stringify(raw.equipPresets||[]),'预设和御魂引用');
 const restored=C.restoreAccount(JSON.parse(JSON.stringify(a)));
 assert.ok(JSON.stringify(restored.raw)===JSON.stringify(raw),'备份重载完整保留原始集合及重复项');
 assert.equal(Object.keys(restored.heroes).length,heroes.length);assert.equal(Object.keys(restored.souls).length,souls.length);
 const visited=[];for(let page=1;page<=Math.ceil(heroes.length/60);page++)visited.push(...C.paginate(heroes,page,60).items.map(h=>h.instanceId));
 assert.equal(new Set(visited).size,heroes.length,'分页不漏实例');
 const report={sample:i+1,bytes:Buffer.byteLength(text),heroes:heroes.length,souls:souls.length,presets:a.presets.length,baseAttrsChecked:bases,sections:a.snapshot.sections,stackedHeroes:a.snapshot.stackedHeroes,coverage:a.coverage,sourceWarnings:raw.warnings?.length||0,elapsedMs:Math.round(performance.now()-start),allValuesChecked:true,rawRoundTrip:true};
 reports.push(report);console.log(JSON.stringify(report));
}
const version=require('../package.json').version;
fs.writeFileSync(path.join(__dirname,'../verification/snapshot-v'+version.replaceAll('.','')+'.json'),JSON.stringify({version,method:'Explicitly supplied local snapshots; every hero, skill, soul stat, base attribute and raw backup round-trip checked. No live game operations.',personalIdentifiersIncluded:false,samples:reports},null,2)+'\n');
