'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {extractShareKey}=require('./ta-codec.cjs');
class TAResponseCache {
 constructor(root,{parse=JSON.parse,stringify=JSON.stringify}={}){this.root=root;this.writes=Promise.resolve();this.parse=parse;this.stringify=stringify;this.payloadIndex=null;this.indexPromise=null;}
  payloadHash(value){return createHash('sha256').update(value.replace(/^#TA#/,'').trim()).digest('hex');}
 file(code){extractShareKey(code);return path.join(this.root,createHash('sha256').update(code).digest('hex')+'.json');}
 valid(code,value){return value?.err===0&&value.code===code&&value.share_key===code.slice(4)&&typeof value.lineup_data==='string'&&Buffer.byteLength(value.lineup_data)<=32*1024*1024;}
 async read(code){
  await this.writes;
  try{const file=this.file(code);if((await fs.stat(file)).size>40*1024*1024)return null;const value=await this.parse(await fs.readFile(file,'utf8'));return this.valid(code,value)?value:null;}
  catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw new Error('阵容原始返回读取失败，请检查本机存储');}
 }
 write(code,value,check=()=>{}){
  const job=this.writes.then(()=>this.commit(code,value,check));this.writes=job.catch(()=>{});return job;
 }
 async findByPayload(input){
  if(typeof input!=='string'||input.length>32*1024*1024)return null;
  await this.writes;
  if(!this.indexPromise)this.indexPromise=(async()=>{
   this.payloadIndex=new Map();
   let files;try{files=await fs.readdir(this.root);}catch(e){if(e.code==='ENOENT')return;throw Error('本地短码索引读取失败');}
   for(const name of files){
    if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
    try{const file=path.join(this.root,name);if((await fs.stat(file)).size>40*1024*1024)continue;const value=await this.parse(await fs.readFile(file,'utf8'));if(typeof value.code==='string'&&this.valid(value.code,value))this.payloadIndex.set(this.payloadHash(value.lineup_data),value.code);}catch{}
   }
  })().catch(error=>{this.indexPromise=null;this.payloadIndex=null;throw error;});
  await this.indexPromise;await this.writes;
  const hash=this.payloadHash(input),code=this.payloadIndex.get(hash);if(!code)return null;
  const value=await this.read(code);return value&&this.payloadHash(value.lineup_data)===hash?code:null;
 }
 async commit(code,value,check){
  if(!this.valid(code,value))throw new Error('不能保存与文字码不匹配的阵容返回');
  const file=this.file(code),tmp=file+'.'+randomUUID()+'.tmp';
  // Only public lineup data belongs here, never arbitrary response fields.
  const body=await this.stringify({err:0,code,share_key:value.share_key,lineup_data:value.lineup_data,fetchedAt:new Date().toISOString()});
  try{await fs.mkdir(this.root,{recursive:true});await fs.writeFile(tmp,body,'utf8');check();await fs.rename(tmp,file);this.payloadIndex?.set(this.payloadHash(value.lineup_data),code);}
  catch(error){await fs.rm(tmp,{force:true}).catch(()=>{});throw error;}
 }
}
module.exports={TAResponseCache};
