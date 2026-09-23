'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const asar=require('@electron/asar'),archive=path.resolve(process.argv[2]||'release/win-unpacked/resources/app.asar');
const D=require('../data/bundle.json');
function api(old){const cache=new Map();function load(name){name=path.posix.normalize(name);if(cache.has(name))return cache.get(name).exports;const module={exports:{}};cache.set(name,module);vm.runInNewContext(old?asar.extractFile(archive,path.normalize(name)).toString():fs.readFileSync(name,'utf8'),{module,exports:module.exports,structuredClone,require:p=>load(path.posix.join(path.posix.dirname(name),p))},{filename:name});return module.exports;}return {C:load('app/core.js'),K:load('app/categories.js'),E:load('app/exact-solver.js')};}
const old=api(true),current=api(false),median=fn=>{const values=[];for(let i=0;i<5;i++){const at=performance.now();fn(i);values.push(performance.now()-at);}return Math.round(values.sort((a,b)=>a-b)[2]*100)/100;};
const rows=[];
for(const count of [373,3000]){
 const input=Array.from({length:count},(_,i)=>({...structuredClone(D.lineups[i%D.lineups.length]),id:'bench-'+i})),data={...D,lineups:input};
 const timings=version=>{const {C,K}=version;let state={lineups:input.map(l=>({...l,notes:'saved'})),deletedPresetIds:[]};
  const hydrate=()=>C.libraryLineups(input,state).map(l=>K.resolve(l,data));hydrate();
  return {changedOneRowMs:median(i=>{state={...state,lineups:state.lineups.map((l,n)=>n===i?{...l,notes:'changed-'+i}:l)};hydrate();}),coldClassifyMs:median(()=>input.map(l=>K.resolve({...l},data)))};};
 const snapshot={schemaVersion:1,lineups:input,accounts:[]},text=JSON.stringify(snapshot);
 rows.push({count,baseline:timings(old),current:timings(current),snapshotMiB:Math.round(Buffer.byteLength(text)/1024/1024*100)/100,fullStringifyMs:median(()=>JSON.stringify(snapshot)),singleDeltaBytes:Buffer.byteLength(JSON.stringify({upserts:[input[0]],removeIds:[]}))});
}
const account={heroes:Object.fromEntries(Array.from({length:5000},(_,i)=>['h'+i,{instanceId:'h'+i,shikigamiId:String(D.roster[i%D.roster.length].id),level:40,star:6,awake:1,skills:[]}])),completeness:'complete'};
const report={recordedAt:new Date().toISOString(),baselineVersion:JSON.parse(asar.extractFile(archive,'package.json')).version,node:process.version,method:'相同 VM 加载器、相同合成输入，五次中位数；不含网络等待。缓存场景每次只替换一条阵容。',rows,inventory5000:{baselineMs:median(()=>D.lineups.forEach(l=>old.E.inspectHeroes(l,account))),currentMs:median(()=>D.lineups.forEach(l=>current.E.inspectHeroes(l,account,{reuseIndex:true})))}};
fs.writeFileSync('verification/performance-hotspots-v092.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
