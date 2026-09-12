// Authorized local sample acceptance. Reports contain counts only, never account names or inventory IDs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/core.js'),data=require('../data/bundle.json'),rules=require('../data/apk-mechanics.json');
const dir=path.resolve('平安志示例数据'),files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
const reports=[];
function independentlyCompute(h,souls){
 const r=rules.heroes[h.shikigamiId],a=h.attrs,base={hp:a[0][0],speed:a[1][0],critDamage:1+a[2][0],crit:a[3][0],defense:a[4][0],attack:a[5][0],effectHit:r.baseHit,effectResist:r.baseResist};
 const map={attack_flat:'attack',attack_rate:'attackPercent',hp_flat:'hp',hp_rate:'hpPercent',defense_flat:'defense',defense_rate:'defensePercent',speed:'speed',crit_rate:'crit',crit_damage:'critDamage',effect_hit:'effectHit',effect_resist:'effectResist'},added={...(h.awake?r.awakeBonus:{})},counts={};
 for(const s of souls){for(const attr of [{type:s.raw.mainAttrType,value:s.raw.mainAttrValue},...s.raw.subAttributes])added[map[attr.type]]=(added[map[attr.type]]||0)+attr.value;counts[s.set]=(counts[s.set]||0)+1;}
 for(const [name,count] of Object.entries(counts)){const rule=Object.values(rules.suits).find(s=>s.name===name);assert.ok(rule);for(let remaining=count;remaining>0;remaining-=Math.min(4,rule.cycle))if(remaining>=2)for(const [stat,value] of Object.entries(rule.twoPiece))added[stat]=(added[stat]||0)+value;}
 return Object.fromEntries(Object.entries(base).map(([stat,value])=>[stat,['hp','attack','defense'].includes(stat)?value*(1+(added[stat+'Percent']||0))+(added[stat]||0):value+(added[stat]||0)]));
}
for(const [index,file] of files.entries()){
 const raw=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')),a=C.parseAccount(raw),heroes=Object.values(a.heroes),souls=Object.values(a.souls),start=performance.now();
 const seen=[];for(let page=1;page<=Math.ceil(heroes.length/60);page++)seen.push(...C.paginate(heroes,page,60).items.map(h=>h.instanceId));
 assert.equal(seen.length,heroes.length);assert.equal(new Set(seen).size,heroes.length);assert.equal(heroes.length,Object.keys(raw.heroes).length);
 assert.equal(heroes.filter(h=>!data.roster.some(r=>r.id===h.shikigamiId)).length,0);
 const h=heroes.find(h=>h.star===6&&h.level===40&&h.awake===1&&rules.heroes[h.shikigamiId]&&Array.isArray(h.attrs));assert.ok(h);
 const usable=souls.filter(s=>s.star===6&&s.level===15&&!s.unknown.length),sets=[...new Set(usable.map(s=>s.set))];let selected;
 for(const set of sets){const bySlot=[1,2,3,4,5,6].map(slot=>usable.find(s=>s.slot===slot&&s.set===set));const filled=bySlot.filter(Boolean).slice(0,4);if(filled.length!==4)continue;const empty=[1,2,3,4,5,6].filter(slot=>!filled.some(s=>s.slot===slot));for(const two of sets){const tail=empty.map(slot=>usable.find(s=>s.slot===slot&&s.set===two));if(tail.every(Boolean)){selected=[...filled,...tail];break;}}if(selected)break;}
 assert.ok(selected);
 const expected=independentlyCompute(h,selected),counts={};for(const s of selected)counts[s.set]=(counts[s.set]||0)+1;
 const config={suitRequirements:Object.entries(counts).map(([name,count])=>({name,count})),suitSelectionComplete:true,mainStats:Object.fromEntries(selected.map(s=>[s.slot,[s.mainStat]])),metricId:7,sixStarOnly:true,maxLevelOnly:true,ranges:Object.entries(expected).map(([stat,v])=>({stat,min:Math.max(0,v-1e-7),max:v+1e-7}))};
 const lineup={title:'现有库存六件边界验收',requirementsComplete:true,members:[{index:0,kind:'shikigami',name:'验收式神',shikigamiId:h.shikigamiId,awakening:h.awake,level:h.level,star:h.star,skills:h.skills,config}]};
 const result=C.matchLineup(lineup,{...a,presets:[...a.presets,['验收组合',selected.map(s=>s.id)]]},data.roster,data.effects,{limit:1000,width:24,perSet:3});
 assert.equal(result.status,'available');assert.ok(result.assignment?.length===1);
 const build=result.assignment[0],chosen=build.soulIds.map(id=>a.souls[id]);assert.equal(new Set(chosen.map(s=>s.slot)).size,6);assert.equal(new Set(build.soulIds).size,6);
 const verified=independentlyCompute(a.heroes[build.heroId],chosen);for(const [stat,value]of Object.entries(verified)){assert.ok(Math.abs(value-build.panel[stat])<1e-7);assert.ok(Math.abs(value-expected[stat])<2e-7);}
 reports.push({sample:index+1,heroes:heroes.length,souls:souls.length,pages:Math.ceil(heroes.length/60),material412:heroes.filter(h=>h.shikigamiId==='412').length,unmappedHeroIds:0,allInstancesVisitedExactlyOnce:true,sixPositionSolverPassed:true,allEightStatsIndependentlyRecomputed:true,elapsedMs:Math.round(performance.now()-start)});
 console.log(JSON.stringify(reports.at(-1)));
}
assert.equal(reports.length,3);assert.deepEqual(reports.map(r=>r.heroes).sort((a,b)=>a-b),[713,2770,4114]);
fs.writeFileSync('verification/inventory-v050.json',JSON.stringify({method:'Three authorized local snapshots; derived six-soul boundary targets with independent panel recomputation. Not gameplay or live TA-service verification.',personalIdentifiersIncluded:false,samples:reports},null,2)+'\n');
