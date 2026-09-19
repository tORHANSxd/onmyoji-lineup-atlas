const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../app/parse-errors.js');
test('旧失败记录升级时按确切服务器代码纠正显示，不改原记录',()=>{
 for(const [code,kind] of [[90011,'retry-later'],[31279,'expired-code'],[17,'server-error']]){
  for(const prefix of ['',"Error invoking remote method 'ta-query': Error: "]){
   const item={lastParseError:`${prefix}服务器未返回该阵容（代码 ${code}）；分享可能已失效`},before=JSON.stringify(item),r=E.fromRecord(item);
   assert.equal(r.kind,kind);assert.equal(JSON.stringify(item),before);assert.equal(E.isExpired(item),code===31279);
  }
 }
 assert.equal(E.fromRecord({lastParseError:'ObjectId 必须为12字节'}).kind,'decode-error');
 assert.equal(E.fromRecord({}),null);
 assert.match(E.fromServer(17).message,/不能判定/);
});
test('结构化错误保留重试次数，任意提示中的数字不当作过期证据',()=>{
 assert.equal(E.fromRecord({lastParseFailure:E.fromServer(90011,3)}).attempts,3);
  assert.equal(E.isExpired({lastParseError:'网络错误 31279'}),false);
  assert.equal(E.isExpired({lastParseFailure:{kind:'expired-code',message:'可能失效'}}),false);
  assert.equal(E.isExpired({lastParseFailure:{kind:'expired-code',serverCode:90011}}),false);
});
