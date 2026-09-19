'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const {validCredentials,accountId}=require('./ta-credentials.cjs');

const idle=()=>({stage:'idle',message:'点击加载服务器后扫码登录',error:'',busy:false,authenticated:false,servers:[],roles_loaded:false,selected_server:'',selected_avatar:'',qr_image:''});
function validateAction(action,params={}){
 if(!['init','qr','select','roles','query'].includes(action)||!params||typeof params!=='object'||Array.isArray(params))throw new Error('查询操作无效');
 const keys=Object.keys(params),allowed=action==='select'?['server_id','avatar_id']:action==='query'?['code']:[];
 if(keys.some(k=>!allowed.includes(k)))throw new Error('查询参数无效');
 if(action==='select'&&(!/^\d{1,10}$/.test(params.server_id)||typeof params.server_id!=='string'||typeof(params.avatar_id??'')!=='string'||(params.avatar_id?.length??0)>100))throw new Error('服务器或角色选择无效');
 if(action==='query'&&(typeof params.code!=='string'||!/^\|TA\|[^\s|\x00-\x1f\x7f\u200b-\u200d\u2060\ufeff]{1,4096}$/.test(params.code)))throw new Error('请输入一条完整的 |TA| 文字码');
 return params;
}

class TASession{
 constructor({helperPath,onStatus=()=>{},spawnProcess=spawn,credentials=null}){this.helperPath=helperPath;this.onStatus=onStatus;this.spawnProcess=spawnProcess;this.credentials=credentials;this.child=null;this.state=idle();this.pending=new Map();this.sequence=0;this.currentAccount='';}
 status(){return structuredClone({...this.state,...this.credentials?.status(),current_account:this.currentAccount});}
 emit(){this.onStatus(this.status());}
 start(){
  if(this.child)return;
  if(!fs.existsSync(this.helperPath))throw new Error('登录模块缺失，请重新安装完整安装包');
  const child=this.spawnProcess(this.helperPath,[],{windowsHide:true,stdio:['pipe','pipe','ignore'],env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'}});
  this.child=child;let buffer='';child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
   if(this.child!==child)return;
   buffer+=chunk;
   if(Buffer.byteLength(buffer)>40*1024*1024){this.fail('登录模块响应过大，已停止本次连接');return;}
   let newline;
   while((newline=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
    try{
     const message=JSON.parse(line);
     if(message.type==='status'&&message.state&&typeof message.state==='object'){
      this.state=Object.fromEntries(Object.keys(idle()).map(k=>[k,message.state[k]??idle()[k]]));this.emit();
     }else if(message.type==='credentials'){
      this.credentials?.accept(message.data);
      this.currentAccount=message.data?.full_uid?accountId(message.data.full_uid):'';
      this.emit();
     }else if(message.type==='response'){
      const request=this.pending.get(message.id);if(!request)continue;
      this.pending.delete(message.id);clearTimeout(request.timer);
      if(message.ok===true)request.resolve(message.data);else request.reject(new Error(typeof message.error==='string'?message.error:'查询未完成'));
     }else throw new Error('Unexpected message');
    }catch{this.fail('登录模块返回了无法识别的数据，已停止本次连接');return;}
   }
  });
  child.on('error',()=>{if(this.child===child)this.fail('登录模块启动失败，请重新安装后重试');});
  child.stdin.on('error',()=>{if(this.child===child)this.fail('登录连接已中断，请重新扫码');});
  child.on('exit',()=>{if(this.child===child)this.fail('登录模块已退出，请重新扫码');});
 }
 request(action,params={}){
  validateAction(action,params);return this.send(action,params);
 }
 resume(id){
  const saved=this.credentials?.get(id);
  if(!saved||!validCredentials(saved.credentials))throw new Error('已保存凭据不可用，请重新扫码');
  this.stop('正在切换已保存账号');this.currentAccount=id;
  return this.send('restore',{credentials:saved.credentials,server_id:saved.serverId,avatar_id:saved.avatarId});
 }
 forget(id){
  this.credentials.forget(id);
  if(id===this.currentAccount)this.stop('已忘记账号并退出当前会话');else this.emit();
  return this.status();
 }
 send(action,params){
  this.start();
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.fail('登录模块未在时限内响应；已断开失效连接，请重新扫码'),action==='query'?165000:90000);timer.unref?.();
   this.pending.set(id,{resolve,reject,timer});
   try{this.child.stdin.write(JSON.stringify({id,action,params})+'\n');}catch{this.fail('登录连接已中断，请重新扫码');}
  });
 }
 fail(message){this.stop(message);this.state.stage='error';this.state.error=message;this.emit();}
 stop(message='已退出当前会话；已记住账号仍保留在本机'){
  const child=this.child;this.child=null;
  if(child)child.kill();
  for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new Error(message));}this.pending.clear();
  this.currentAccount='';this.state={...idle(),message};this.emit();return this.status();
 }
}
module.exports={TASession,validateAction};
