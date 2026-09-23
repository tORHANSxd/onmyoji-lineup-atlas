'use strict';
self.onmessage=({data:{action,value}})=>{
 try{
  if(['parse-account','restore-accounts','load-state','restore-state'].includes(action)&&!self.AtlasCore)importScripts('solver.js','core.js');
  let result;
  if(action==='parse-account')result=self.AtlasCore.parseAccount(JSON.parse(value.text.replace(/^\uFEFF/,'')),value.name);
  else if(action==='restore-accounts')result=value.map(account=>self.AtlasCore.restoreAccount(account));
  else if(action==='load-state'||action==='restore-state'){
   result=action==='load-state'?JSON.parse(value):value;
   if(Array.isArray(result?.accounts))result.accounts=result.accounts.map(account=>account.raw?{...self.AtlasCore.restoreAccount(account),server:account.server}:account);
  }else result=action==='parse'?JSON.parse(value):JSON.stringify(value,null,action==='pretty'?2:0);
  self.postMessage({value:result});
 }
 catch(error){self.postMessage({error:error.message});}
};
