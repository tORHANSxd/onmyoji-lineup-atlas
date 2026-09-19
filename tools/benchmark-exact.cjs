'use strict';
// Read only explicitly supplied exports. Report counts/timing, never player IDs.
const fs=require('node:fs'),{performance}=require('node:perf_hooks'),C=require('../app/core.js'),E=require('../app/exact-solver.js'),D=require('../data/bundle.json');
const reports=[];
for(const file of process.argv.slice(2)){
 const account=C.parseAccount(JSON.parse(fs.readFileSync(file,'utf8'))),heroes=Object.values(account.heroes),hero=heroes.find(h=>h.level===40&&h.star===6&&C.baseFromRoster(h,D.roster));
 if(!hero)throw new Error('No verified maximum-level instance for benchmark');
 const member={index:0,kind:'shikigami',shikigamiId:hero.shikigamiId,name:'基准式神',awakening:hero.awake,skills:[],config:{metricId:7,suitSelectionComplete:true,suitRequirements:[],mainStats:{},ranges:[],scope:'all'}};
 const lineup={code:'benchmark',decodeState:'decoded-local',requirementsComplete:true,members:[member]},iterator=E.search(lineup,account,D.roster,D.effects),start=performance.now();let step,first=null;
 do{step=iterator.next();if(step.value?.assignment&&!first)first=performance.now()-start;}while(!step.done&&performance.now()-start<3000);
 reports.push({heroes:heroes.length,souls:Object.keys(account.souls).length,scenario:'单成员速度指标，无套装限制；最多观察3秒后暂停基准',elapsedMs:Math.round(performance.now()-start),firstFeasibleMs:first==null?null:Math.round(first),state:step.value?.proof.state,nodes:step.value?.proof.nodes,pruned:step.value?.proof.pruned,done:step.done});
}
fs.writeFileSync('verification/exact-benchmark-v070.json',JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
