'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {parseArgs}=require('node:util');
const {createRuneRunner}=require('../desktop/rune-runner.cjs');
const {createRuneFloorRunner}=require('../desktop/rune-floor-runner.cjs');
const {buildScope,scanSeeds,seedOrder}=require('../desktop/rune-seed-evidence.cjs');
const seedCount=seedOrder.length;

function boundedInteger(value,name,max){
 if(!/^[1-9]\d*$/.test(value)||Number(value)>max)throw Error(`${name} 必须是 1 到 ${max} 的整数`);
 return Number(value);
}

async function main(){
 const {values}=parseArgs({options:{team:{type:'string'},runtime:{type:'string'},out:{type:'string'},
  dungeon:{type:'string',default:'102'},limit:{type:'string',default:String(seedCount)},workers:{type:'string',default:'1'},help:{type:'boolean'}}});
 if(values.help){
  console.log('node tools/verify-rune-seeds.cjs --team <复跑配装 JSON> --runtime <本地运行时 JSON> --out <验收目录> [--dungeon <101|102>] [--limit <本次种子数>] [--workers <1-8>]');return;
 }
 if(!values.team||!values.runtime||!values.out)throw Error('需要 --team、--runtime、--out。使用 --help 查看用法');
 const limit=boundedInteger(values.limit,'--limit',seedCount),workers=boundedInteger(values.workers,'--workers',8);
 const dir=path.resolve(values.out),configPath=path.resolve(values.runtime);
 const plan=JSON.parse((await fs.readFile(values.team,'utf8')).replace(/^\uFEFF/,''));
 if(!plan?.onmyoji||plan.members?.length!==5)throw Error('复跑配装需要一位阴阳师及五位式神');
 const {suits}=require('../data/bundle.json');
 const dungeonId=Number(values.dungeon);
 const runtime={configPath,scriptRoot:__dirname,suits};
 const scope=await buildScope({...runtime,dungeonId},plan);
 const runnerFactory=dungeonId===101?createRuneFloorRunner:createRuneRunner;
 const runners=Array.from({length:workers},()=>runnerFactory(runtime));
 const cancellation=new AbortController(),cancel=()=>cancellation.abort();
 process.on('SIGINT',cancel);
 try{
  let last=-1;
  const result=await scanSeeds({scope,dir,runners,plan,limit,signal:cancellation.signal,onProgress:state=>{
   if(last===-1||state.wins>=last+10||state.loss||state.uncertain){last=state.wins;console.log(JSON.stringify(state));}
  }});
  console.log(JSON.stringify(result));
  process.exitCode=result.stopped?130:result.loss?1:result.uncertain?2:0;
 }finally{process.removeListener('SIGINT',cancel);}
}

main().catch(error=>{console.error(error.message);process.exitCode=2;});
