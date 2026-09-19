const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {TAResponseCache}=require('../desktop/ta-response-cache.cjs');
test('原始返回缓存只保存严格关联的成功内容；损坏可重新请求',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-response-')),cache=new TAResponseCache(root),code='|TA|opaque/key',good={err:0,code,share_key:code.slice(4),lineup_data:'original',token:'never-save'};
 try{assert.equal(await cache.read(code),null);await cache.write(code,good);const saved=await cache.read(code);assert.equal(saved.lineup_data,'original');assert.equal(saved.token,undefined);for(const bad of [{...good,err:90011},{...good,share_key:'other'},{...good,lineup_data:null}])await assert.rejects(cache.write(code,bad));await fs.writeFile(cache.file(code),'bad JSON');assert.equal(await cache.read(code),null);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('会话变化时阻止新缓存提交，保留上次成功内容',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-response-')),cache=new TAResponseCache(root),code='|TA|a',value={err:0,code,share_key:'a',lineup_data:'old'};
 try{await cache.write(code,value);await assert.rejects(cache.write(code,{...value,lineup_data:'new'},()=>{throw Error('ended');}));assert.equal((await cache.read(code)).lineup_data,'old');assert.equal((await fs.readdir(root)).length,1);}finally{await fs.rm(root,{recursive:true,force:true});}
});

test('同一队列返回的并发保存不会争用临时文件',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-response-')),cache=new TAResponseCache(root),code='|TA|shared',value={err:0,code,share_key:'shared',lineup_data:'same-response'};
 try{await Promise.all(Array.from({length:5},()=>cache.write(code,value)));assert.equal((await cache.read(code)).lineup_data,'same-response');assert.equal((await fs.readdir(root)).length,1);}finally{await fs.rm(root,{recursive:true,force:true});}
});
