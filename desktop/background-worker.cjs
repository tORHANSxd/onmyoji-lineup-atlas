'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path');
const codec=require('./ta-codec.cjs'),QRCode=require('qrcode');
let state,prepared=null;
async function load(){
 if(state!==undefined)return state;
 try{state=JSON.parse(await fs.readFile(workerData.statePath,'utf8'));}
 catch(error){if(error.code==='ENOENT')state=null;else throw Error('本地数据库读取失败，请保留数据文件并从备份恢复。');}
 return state;
}
async function qr({code,catalog}){
 if(typeof code!=='string'||code.length>12000)throw Error('二维码内容过长，请缩短说明或生成文字短码');
 if(code.startsWith('|TA|'))codec.extractShareKey(code);
 else {if(!code.startsWith('#TA#'))throw Error('不是有效的阵容码');codec.validateGameLineup(codec.decodeLineupData(code),catalog);}
 try{return await QRCode.toDataURL(code,{errorCorrectionLevel:'M',margin:4,scale:7});}
 catch{throw Error('完整内容超过单个二维码容量，请缩短说明；完整码仍可复制保存');}
}
async function run(action,p){
 switch(action){
 case 'decode':if(JSON.stringify(p.input??null).length>32*1024*1024)return {ok:false,state:'invalid-input',error:'阵容内容超过32 MiB'};return codec.decodeInput(p.input,p.options);
 case 'validate':return codec.validateGameLineup(codec.decodeLineupData(p.code),p.catalog),true;
 case 'build':{
  if(p.catalog?.gameConfig)require('../app/game-config.js').validate(p.catalog.gameConfig,p.input);
  codec.validateGameLineup(p.input,p.catalog);
  const code=codec.encodeLineupData(p.input),payload=codec.decodeInput(code);let image=null,qrError=null;
  try{image=await qr({code,catalog:p.catalog});}catch(e){qrError=e.message;}
  return {code,payload,image,qrError};
 }
 case 'qr':return qr(p);
 case 'verify-share':return codec.verifyShareResponse(p.code,p.response);
 case 'parse-json':return JSON.parse(p);
 case 'stringify':return JSON.stringify(p,null,2);
 case 'load-state':return load();
 case 'load-state-json':return JSON.stringify(await load());
 case 'prepare-state':{
  if(prepared)throw Error('上一次保存尚未完成');
  let next=p.json!=null?JSON.parse(p.json):p.state;
  if(p.delta){
   const old=await load();if(!old)return {needsSnapshot:true};
   if(!Array.isArray(p.delta.upserts)||!Array.isArray(p.delta.removeIds))throw Error('解析保存参数无效');
   const removed=new Set(p.delta.removeIds),upserts=new Map(p.delta.upserts.map(l=>[l.id,l]));
   next={...old,lineups:(old.lineups||[]).filter(l=>!removed.has(l.id)&&!upserts.has(l.id)).concat([...upserts.values()])};
  }
  const body=JSON.stringify(next);if(Buffer.byteLength(body)>100*1024*1024)throw Error('本地数据超过100 MiB限制');
  const file=workerData.statePath+'.tmp';await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,body,'utf8');prepared=next;return {file};
 }
 case 'commit-state':if(!prepared)throw Error('没有待提交的保存');state=prepared;prepared=null;return {saved:true};
 case 'discard-state':prepared=null;await fs.rm(workerData.statePath+'.tmp',{force:true});return true;
 default:throw Error('不支持的后台操作');
 }
}
// Serialize commands so an asynchronous file write cannot race a later request.
let tail=Promise.resolve();
parentPort.on('message',({id,action,payload})=>{
 tail=tail.then(()=>run(action,payload)).then(result=>parentPort.postMessage({id,result}),error=>parentPort.postMessage({id,error:{name:error.name,message:error.message,code:error.code}}));
});
