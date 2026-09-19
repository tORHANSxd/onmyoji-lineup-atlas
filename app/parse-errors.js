(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasParseErrors=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
// Error numbers and text verified against the supplied client's error_tips.
function fromServer(serverCode,attempts=1){
 attempts=Number.isSafeInteger(attempts)&&attempts>0?attempts:1;
 const base={serverCode,attempts,retryable:false,kind:'server-error',label:'服务器返回错误'};
 if(serverCode===90011)return {...base,kind:'retry-later',label:'暂时无法查询',retryable:true,message:`服务器提示「请稍后再试」（90011）。${attempts>1?`已尝试 ${attempts} 次，本轮已跳过；`:''}可稍后重试，不能据此判定原码过期。`};
 if(serverCode===31279)return {...base,kind:'expired-code',label:'文字码已过期',message:'该阵容的「文字码」已过期（31279），请在游戏中重新复制，并在阵容库中更换原码。'};
 return {...base,message:`服务器未返回该阵容（代码 ${serverCode}）；该代码的含义尚未核实，不能判定原码过期。`};
}
function fromMessage(value){
 const message=String(value||'解析未完成').replace(/^Error invoking remote method 'ta-query': Error: /,'').slice(0,500);
 const match=/^服务器未返回该阵容（代码 (\d+)）；分享可能已失效$/.exec(message);
 if(match)return fromServer(Number(match[1]));
 if(/ObjectId/.test(message))return {kind:'decode-error',label:'本地解码失败',retryable:true,message:'旧版本未能解码服务器返回的 ObjectId；此兼容问题已修复，请重新解析。原始错误：'+message};
 return {kind:'query-error',label:'查询或解析失败',retryable:true,message};
}
function fromRecord(item){
 const failure=item?.lastParseFailure;
 if(Number.isSafeInteger(failure?.serverCode))return fromServer(failure.serverCode,failure.attempts);
 if(failure&&typeof failure.message==='string')return {...failure,message:failure.message.slice(0,500)};
 return item?.lastParseError?fromMessage(item.lastParseError):null;
}
const isExpired=item=>fromRecord(item)?.serverCode===31279;
return {fromServer,fromMessage,fromRecord,isExpired};
});
