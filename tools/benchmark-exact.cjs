'use strict';
// Read only explicitly supplied exports. Report counts/timing, never player IDs.
const fs=require('node:fs'),{performance}=require('node:perf_hooks'),C=require('../app/core.js'),E=require('../app/exact-solver.js'),D=require('../data/bundle.json');
const reports=[];
if(process.argv.includes('--synthetic')){syntheticBenchmark();}else for(const file of process.argv.slice(2)){
 const account=C.parseAccount(JSON.parse(fs.readFileSync(file,'utf8'))),heroes=Object.values(account.heroes),hero=heroes.find(h=>h.level===40&&h.star===6&&C.baseFromRoster(h,D.roster));
 if(!hero)throw new Error('No verified maximum-level instance for benchmark');
 const member={index:0,kind:'shikigami',shikigamiId:hero.shikigamiId,name:'基准式神',awakening:hero.awake,skills:[],config:{metricId:7,suitSelectionComplete:true,suitRequirements:[],mainStats:{},ranges:[],scope:'all'}};
 const lineup={code:'benchmark',decodeState:'decoded-local',requirementsComplete:true,members:[member]},iterator=E.search(lineup,account,D.roster,D.effects),start=performance.now();let step,first=null;
 do{step=iterator.next();if(step.value?.assignment&&!first)first=performance.now()-start;}while(!step.done&&performance.now()-start<3000);
 reports.push({heroes:heroes.length,souls:Object.keys(account.souls).length,scenario:'单成员速度指标，无套装限制；最多观察3秒后暂停基准',elapsedMs:Math.round(performance.now()-start),firstFeasibleMs:first==null?null:Math.round(first),state:step.value?.proof.state,nodes:step.value?.proof.nodes,pruned:step.value?.proof.pruned,done:step.done});
}
if(!process.argv.includes('--synthetic'))fs.writeFileSync('verification/exact-benchmark-v070.json',JSON.stringify(reports,null,2)+'\n');if(!process.argv.includes('--synthetic'))console.log(JSON.stringify(reports));


// Public synthetic fixtures; both revisions run through the same VM loader.
function syntheticBenchmark(){
 const vm=require('node:vm'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const source=head=>{const cache=new Map();function load(name){name=path.posix.normalize(name);if(cache.has(name))return cache.get(name).exports;const m={exports:{}};cache.set(name,m);const code=head?execFileSync('git',['show','HEAD:'+name],{encoding:'utf8',maxBuffer:4*1024*1024}):fs.readFileSync(name,'utf8');vm.runInNewContext(code,{module:m,exports:m.exports,structuredClone,require:p=>load(path.posix.join(path.posix.dirname(name),p))},{filename:name});return m.exports;}return load('app/exact-solver.js');};
 const baseline=source(true),current=source(false);
 const roster=[{id:'1',assets:{baseAttrs40:{1:{attack:1000,defense:500,maxHp:10000,speed:100,critRate:.1,critPower:.5,debuffEnhance:0,debuffResist:0}}}}];
 const member=metricId=>({index:0,kind:'shikigami',shikigamiId:'1',name:'基准式神',awakening:1,skills:[],config:{metricId,suitSelectionComplete:true,suitRequirements:[],mainStats:{},ranges:[],scope:'all'}});
 const lineup=metricId=>({code:'synthetic',decodeState:'decoded-local',requirementsComplete:true,members:[member(metricId)]});
 const account=(count,constant=false)=>{const souls={};for(let i=0;i<count;i++){const id=String(i),slot=i%6+1,j=Math.floor(i/6);souls[id]={id,slot,set:'招财猫',level:15,star:6,mainStat:'attack',stats:{speed:constant?1:j%24+j*.0001,attack:constant?j*7**slot:j},unknown:[]};}return {heroes:{a:{instanceId:'a',shikigamiId:'1',level:40,star:6,awake:1,skills:[]}},souls,presets:[],completeness:'complete'};};
 const run=(api,a,l,{prepareOnly=false,shared={}}={})=>{const it=api.search(l,a,roster,D.effects,shared),start=performance.now();let step,firstYieldMs,maxStepMs=0,steps=0;do{const before=performance.now();step=it.next();const duration=performance.now()-before;maxStepMs=Math.max(maxStepMs,duration);if(firstYieldMs==null)firstYieldMs=duration;steps++;if(prepareOnly&&step.value?.proof?.phase!=='preparing')break;}while(!step.done&&performance.now()-start<10000);it.return();return {elapsedMs:performance.now()-start,firstYieldMs,maxStepMs,steps,done:step.done,state:step.value?.proof?.state,nodes:step.value?.proof?.nodes,vector:step.value?.proof?.vector};};
 const rounded=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='number'?Math.round(v*100)/100:v]));
 const rows=[];
 for(const metric of [null,7]){const a=account(36,true),l=lineup(metric);const old=run(baseline,a,l),now=run(current,a,l);if(!now.done||now.state!=='optimal'||JSON.stringify(now.vector)!==JSON.stringify(old.vector))throw Error('Synthetic optimum mismatch');rows.push({scenario:metric==null?'36件御魂，无评分目标':'36件御魂，恒定速度目标',baseline:rounded(old),current:rounded(now)});}
 for(const count of [6000,24000,96000]){const a=account(count),l=lineup(7);rows.push({scenario:count+'件御魂，初始化到开始搜索',baseline:rounded(run(baseline,a,l,{prepareOnly:true})),current:rounded(run(current,a,l,{prepareOnly:true}))});}
 const report={synthetic:true,recordedAt:new Date().toISOString(),baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,method:'相同 VM 加载器与合成库存，单次观测；firstYieldMs 为首次交还控制权，maxStepMs 为初始化阶段最长 next()。观察上限不用于产品求解结论。',rows};
 fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/optimization-performance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
