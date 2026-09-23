'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');

// CPU work and JSON serialization never run on Electron's window/IPC thread.
class Background {
 constructor(options={}){
  this.pending=new Map();this.sequence=0;this.failure=null;
  this.worker=new Worker(path.join(__dirname,'background-worker.cjs'),{workerData:options});
  this.worker.on('message',({id,result,error})=>{const p=this.pending.get(id);if(!p)return;this.pending.delete(id);if(!this.pending.size)this.worker.unref();if(error){const reason=error.name==='SyntaxError'?new SyntaxError(error.message):new Error(error.message);if(error.code)reason.code=error.code;p.reject(reason);}else p.resolve(result);});
  const fail=error=>{this.failure=error;for(const p of this.pending.values())p.reject(error);this.pending.clear();};
  this.worker.on('error',fail);
  this.worker.on('exit',()=>fail(new Error('后台处理已停止，请重新打开软件后重试')));
  this.worker.unref();
 }
 run(action,payload){
  if(this.failure)return Promise.reject(this.failure);
  return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.ref();try{this.worker.postMessage({id,action,payload});}catch(error){this.pending.delete(id);if(!this.pending.size)this.worker.unref();reject(error);}});
 }
 close(){return this.worker.terminate();}
}
module.exports={Background};
