// Local-only acceptance against the largest provided snapshot. Outputs counts,
// never player names, identifiers, raw exports or inventory IDs.
const fs=require('node:fs');
const C=require('../app/core.js');
const b=require('../data/bundle.json');
const raw=fs.readdirSync('平安志示例数据').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync('平安志示例数据/'+f,'utf8'))).sort((a,b)=>Object.keys(b.heroes).length-Object.keys(a.heroes).length)[0];
const a=C.parseAccount(raw),start=performance.now(),counts={},memberCounts={};let assignments=0;
for(let i=0;i<b.lineups.length;i++){
 const r=C.matchLineup(b.lineups[i],a,b.roster,b.effects);
 counts[r.status]=(counts[r.status]||0)+1;
 for(const m of r.members)memberCounts[m.status]=(memberCounts[m.status]||0)+1;
 if(r.assignment?.length){const souls=r.assignment.flatMap(x=>x.soulIds),heroes=r.assignment.map(x=>x.heroId);if(new Set(souls).size!==souls.length||new Set(heroes).size!==heroes.length)throw Error('global assignment collision');assignments++;}
 if((i+1)%10===0)console.log('checked',i+1,'/',b.lineups.length,'elapsed',Math.round(performance.now()-start),'ms');
}
const report={lineups:b.lineups.length,heroes:Object.keys(a.heroes).length,souls:Object.keys(a.souls).length,counts,memberCounts,partialAssignmentsWithoutOverlap:assignments,elapsedMs:Math.round(performance.now()-start),note:'Source requirements and onmyoji data remain incomplete; no gameplay verification. No personal identifiers included.'};
fs.writeFileSync('verification/real-matching-summary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
