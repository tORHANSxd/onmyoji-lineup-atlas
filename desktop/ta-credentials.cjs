'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

const accountId=uid=>createHash('sha256').update(uid).digest('hex');
function remembered(info){
 const user=info?.mpay_user,flag=user?.pc_ext_info?.is_remember;
 return ['netease','external_netease'].includes(user?.login_channel||'netease')&&(flag===true||typeof flag==='string'&&flag.toLowerCase()==='true');
}
function validCredentials(info){
 const user=info?.mpay_user;
 return info&&typeof info==='object'&&typeof info.full_uid==='string'&&info.full_uid.length>0&&info.full_uid.length<300&&
  typeof info.mpay_device_id==='string'&&info.mpay_device_id.length>0&&typeof user?.id==='string'&&user.id.length>0&&
  typeof user.token==='string'&&user.token.length>0&&user.pc_ext_info&&typeof user.pc_ext_info==='object'&&!Array.isArray(user.pc_ext_info)&&
  Buffer.byteLength(JSON.stringify(info))<48000&&remembered(info);
}
// Only the Electron main process owns this file. safeStorage uses the current
// Windows user's DPAPI protection; library exports never include this store.
class TACredentials {
 constructor({file,safeStorage}){
  this.file=file;this.safeStorage=safeStorage;this.data={version:1,activeId:'',accounts:[]};this.error='';this.readable=true;
  try{
   if(!fs.existsSync(file))return;
   if(!safeStorage.isEncryptionAvailable())throw new Error();
   if(fs.statSync(file).size>8*1024*1024)throw new Error();
   const data=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
   if(data.version!==1||!Array.isArray(data.accounts)||data.accounts.length>100||typeof data.activeId!=='string'||data.accounts.some(a=>
    !/^[a-f0-9]{64}$/.test(a.id)||typeof a.label!=='string'||typeof a.serverId!=='string'||typeof a.avatarId!=='string'||
    (a.credentials&&(!validCredentials(a.credentials)||accountId(a.credentials.full_uid)!==a.id))))throw new Error();
   if(data.activeId&&!data.accounts.some(a=>a.id===data.activeId&&a.credentials))throw new Error();
   this.data=data;
  }catch{this.readable=false;this.error='已保存账号无法解密或文件损坏；原文件已保留，可继续扫码临时登录。';}
 }
 save(next){
  if(!this.readable||!this.safeStorage.isEncryptionAvailable())throw new Error('本机账号加密不可用；本次仅临时登录，未保存凭据。');
  const bytes=this.safeStorage.encryptString(JSON.stringify(next)),tmp=this.file+'.tmp';
  try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(tmp,bytes,{mode:0o600});fs.renameSync(tmp,this.file);}
  catch{try{fs.rmSync(tmp,{force:true});}catch{}throw new Error('账号加密文件写入失败；请保留当前会话并检查本机存储。');}
  this.data=next;this.error='';
 }
 status(){return {remembered_accounts:this.data.accounts.map(a=>({id:a.id,label:a.label,needs_login:!a.credentials,updated_at:a.updatedAt})),active_account:this.data.activeId,storage_error:this.error};}
 get(id){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw new Error('已保存账号选择无效');const item=this.data.accounts.find(a=>a.id===id);if(!item?.credentials)throw new Error('账号凭据已失效，请重新扫码');return structuredClone(item);}
 accept(event){
  try{
   if(typeof event?.full_uid!=='string'||!event.full_uid)throw new Error('账号保存信息无效');
   const id=accountId(event.full_uid),accounts=this.data.accounts.filter(a=>a.id!==id);
   if(event.invalidate===true){
    const previous=this.data.accounts.find(a=>a.id===id);
    if(previous)accounts.push({...previous,credentials:null});else return;
   }else if(remembered(event.credentials)){
    if(!validCredentials(event.credentials)||event.credentials.full_uid!==event.full_uid)throw new Error('账号保存信息无效');
    if(accounts.length>=100)throw new Error('最多保存 100 个账号，请先忘记不再使用的账号。');
    accounts.push({id,label:String(event.label||this.data.accounts.find(a=>a.id===id)?.label||'已授权账号').slice(0,100),serverId:String(event.server_id||''),avatarId:String(event.avatar_id||''),updatedAt:new Date().toISOString(),credentials:structuredClone(event.credentials)});
   }else if(!this.data.accounts.some(a=>a.id===id))return;
   this.save({...this.data,accounts,activeId:accounts.some(a=>a.id===id&&a.credentials)?id:this.data.activeId===id?'':this.data.activeId});
  }catch(error){this.error=error.message;}
 }
 forget(id){
  if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw new Error('已保存账号选择无效');
  this.save({...this.data,accounts:this.data.accounts.filter(a=>a.id!==id),activeId:this.data.activeId===id?'':this.data.activeId});
 }
}
module.exports={TACredentials,accountId,remembered,validCredentials};
