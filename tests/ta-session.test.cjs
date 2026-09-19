const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const path=require('node:path');
const {TASession,validateAction}=require('../desktop/ta-session.cjs');

function harness(credentials=null){
 const children=[],statuses=[];
 const session=new TASession({credentials,helperPath:__filename,onStatus:s=>statuses.push(s),spawnProcess:(file,args,options)=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.requests=[];child.stdin.on('data',b=>child.requests.push(JSON.parse(b)));child.kill=()=>child.killed=true;child.options=options;children.push(child);return child;
 }});
 return {session,children,statuses,reply:(c,value)=>c.stdout.write(JSON.stringify(value)+'\n')};
}
test('登录桥接拒绝任意操作、角色路径及损坏文字码',()=>{
 for(const [action,params] of [['shell',{}],['query',{code:'|TA|bad key'}],['query',{code:'|TA|'+'a'.repeat(32),token:'secret'}],['select',{server_id:'../private'}],['qr',{url:'https://other.invalid'}]])assert.throws(()=>validateAction(action,params));
 assert.doesNotThrow(()=>validateAction('query',{code:'|TA|'+'a'.repeat(32)}));
});
test('通过隐藏子进程传递请求，分片结果保持完整，默认会话不落盘',async()=>{
 const h=harness();try{const pending=h.session.request('init'),child=h.children[0];assert.equal(child.options.windowsHide,true);assert.deepEqual(child.options.stdio,['pipe','pipe','ignore']);
 const line=JSON.stringify({type:'response',id:child.requests[0].id,ok:true,data:{title:'中文测试'}})+'\n';child.stdout.write(line.slice(0,10));child.stdout.write(line.slice(10));assert.deepEqual(await pending,{title:'中文测试'});
 h.reply(child,{type:'status',state:{authenticated:true,roles_loaded:true,servers:[]}});assert.equal(h.session.status().authenticated,true);
 }finally{h.session.stop();}
});
test('退出登录中止查询，迟到回包不能恢复旧账号，允许新会话',async()=>{
 const h=harness();const pending=h.session.request('query',{code:'|TA|'+'a'.repeat(32)}),old=h.children[0];h.session.stop();await assert.rejects(pending,/退出当前会话/);assert.equal(old.killed,true);assert.equal(h.session.status().authenticated,false);
 const fresh=h.session.request('init'),child=h.children[1];h.reply(old,{type:'status',state:{authenticated:true,servers:[]}});assert.equal(h.session.status().authenticated,false);h.reply(child,{type:'response',id:child.requests[0].id,ok:true,data:null});await fresh;h.session.stop();
});
test('子进程崩溃或无效响应结束所有等待且清除状态',async()=>{
 for(const failure of ['exit','invalid']){const h=harness(),pending=h.session.request('init'),child=h.children[0];if(failure==='exit')child.emit('exit',1);else child.stdout.write('invalid\n');await assert.rejects(pending);assert.equal(h.session.status().authenticated,false);assert.equal(h.session.state.stage,'error');assert.equal(h.session.pending.size,0);}
});
test('缺失安装模块不能误报为已登录',()=>{const session=new TASession({helperPath:path.join(__dirname,'missing-helper.exe')});assert.throws(()=>session.request('init'),/登录模块缺失/);assert.equal(session.status().authenticated,false);});
test('已保存账号只通过私有管道恢复，状态不含凭据，旧进程不能再次保存',async()=>{
 const id='a'.repeat(64),info={full_uid:'synthetic',mpay_device_id:'device',mpay_user:{id:'user',token:'secret-private',pc_ext_info:{is_remember:true}}},events=[];
 const store={get:()=>({credentials:info,serverId:'10014',avatarId:'role'}),status:()=>({remembered_accounts:[{id,label:'角色'}]}),accept:e=>events.push(e),forget:()=>events.push('forgotten')};
 const h=harness(store),pending=h.session.resume(id),old=h.children[0];
 assert.equal(h.session.status().authenticated,false);assert.equal(old.requests[0].action,'restore');assert.equal(old.requests[0].params.credentials.mpay_user.token,'secret-private');assert.equal(JSON.stringify(h.session.status()).includes('secret-private'),false);
 assert.throws(()=>h.session.request('restore',{credentials:info}),/无效/);
 h.session.forget(id);await assert.rejects(pending,/忘记账号/);h.reply(old,{type:'credentials',data:{full_uid:'synthetic',credentials:info}});h.reply(old,{type:'status',state:{authenticated:true,token:'secret-private'}});assert.deepEqual(events,['forgotten']);assert.equal(h.session.status().authenticated,false);
});
