const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(search){
 const messages=[],timers=[],context={importScripts(){},AtlasExact:{*search(l){yield {members:[],checks:[],reasons:[],proof:{state:'computing',nodes:1}};if(l.fail)throw new Error('synthetic failure');return {members:[],checks:[],reasons:[],proof:{state:'optimal',nodes:2}};}},postMessage:m=>messages.push(structuredClone(m)),setTimeout:fn=>timers.push(fn)};
 if(search)context.AtlasExact.search=search;
 vm.createContext(context);vm.runInContext(fs.readFileSync('app/match-worker.js','utf8'),context);
 return {messages,results:()=>Object.fromEntries(messages.filter(m=>m.result).map(m=>[m.id,m.result])),send:data=>context.onmessage({data}),ticks(n){while(timers.length&&n-->0)timers.shift()();},drain(){let n=100;while(timers.length&&n-->0)timers.shift()();assert.ok(n>0);}};
}

test('前两个长搜索不会饿死后续任务和单项重新计算',()=>{
 const h=harness(function*(l){while(l.slow)yield {members:[],checks:[],reasons:[],proof:{state:'computing',nodes:1}};return {members:[],checks:[],reasons:[],proof:{state:'infeasible',nodes:0}};});
 h.send({lineups:[{id:'a',slow:true},{id:'b',slow:true},{id:'c'}]});h.ticks(12);
 assert.equal(h.results().c?.completed,true);
 h.send({action:'replace',versions:{d:2},lineups:[{id:'d'}]});h.ticks(12);
 assert.equal(h.results().d?.completed,true);assert.equal(h.messages.findLast(m=>m.id==='d').version,2);
});
test('精算 Worker 暂停保留生成器，恢复后完成所有任务；替换一项不丢其余项',()=>{
 const h=harness();h.send({lineups:[{id:'a'},{id:'b'}]});h.send({action:'pause'});h.drain();assert.equal(h.messages.some(m=>m.done),false);h.send({action:'replace',lineups:[{id:'a'}]});h.drain();const done=h.messages.findLast(m=>m.done);assert.deepEqual(Object.keys(h.results()).sort(),['a','b']);assert.equal(h.results().b.proof.state,'optimal');assert.equal(done.total,2);assert.equal(done.completed,2);
});
test('一项精算异常仍处理后续项，失败项明确标为error，不能停在虚假的计算中',()=>{
 const h=harness();h.send({lineups:[{id:'a',fail:true},{id:'b'}]});h.drain();assert.equal(h.results().a.proof.state,'error');assert.equal(h.results().b.proof.state,'optimal');assert.equal(h.messages.filter(m=>m.error).length,1);
});
test('追加精算正确更新总数、去重替换，保留每项版本并标记最终完成',()=>{
 const h=harness();h.send({batch:1,versions:{a:1},lineups:[{id:'a'}]});h.send({action:'replace',batch:2,versions:{a:2,b:1},lineups:[{id:'a'},{id:'b'}]});h.drain();
 const done=h.messages.findLast(m=>m.done);assert.equal(done.batch,2);assert.equal(done.total,2);assert.equal(done.completed,2);
 assert.equal(h.messages.findLast(m=>m.id==='a').version,2);assert.ok(Object.values(h.results()).every(r=>r.completed));
});
