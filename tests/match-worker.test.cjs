const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(){
 const messages=[],timers=[],context={importScripts(){},AtlasExact:{*search(l){yield {members:[],checks:[],reasons:[],proof:{state:'computing',nodes:1}};if(l.fail)throw new Error('synthetic failure');return {members:[],checks:[],reasons:[],proof:{state:'optimal',nodes:2}};}},postMessage:m=>messages.push(structuredClone(m)),setTimeout:fn=>timers.push(fn)};
 vm.createContext(context);vm.runInContext(fs.readFileSync('app/match-worker.js','utf8'),context);
 return {messages,send:data=>context.onmessage({data}),drain(){let n=100;while(timers.length&&n-->0)timers.shift()();assert.ok(n>0);}};
}
test('精算 Worker 暂停保留生成器，恢复后完成所有任务；替换一项不丢其余项',()=>{
 const h=harness();h.send({lineups:[{id:'a'},{id:'b'}]});h.send({action:'pause'});h.drain();assert.equal(h.messages.some(m=>m.done),false);h.send({action:'replace',lineups:[{id:'a'}]});h.drain();const done=h.messages.findLast(m=>m.done);assert.deepEqual(Object.keys(done.results).sort(),['a','b']);assert.equal(done.results.b.proof.state,'optimal');
});
test('一项精算异常仍处理后续项，失败项明确标为error，不能停在虚假的计算中',()=>{
 const h=harness();h.send({lineups:[{id:'a',fail:true},{id:'b'}]});h.drain();const done=h.messages.findLast(m=>m.done);assert.equal(done.results.a.proof.state,'error');assert.equal(done.results.b.proof.state,'optimal');assert.equal(h.messages.filter(m=>m.error).length,1);
});
