'use strict';
const {normalizeCode}=require('../app/core.js');
// Port of the user's independently verified TAPacker V0–V3 decoder.
// Text share keys are RPC indexes; this module performs no network access.
const zlib = require('node:zlib');
const { decode, ExtensionCodec, ExtData } = require('@msgpack/msgpack');
const ParseErrors = require('../app/parse-errors.js');
const FIELDS = {1:'ver',2:'phconf',3:'desc',4:'title',5:'huids',6:'select_stage_id',7:'data_ver',8:'player_id',9:'hostnum'};
const ATTRS = ['atk_per','critical_rate','critical_pow','spd','debuff_acc','debuff_res','max_hp_per','def_per'];
const LIMITS = ['debuff_res','critical_rate','final_atk','debuff_acc','final_max_hp','critical_pow','spd','final_def','ExtraAttr'];
const EXTRAS = ['attackRate','attack','critRate','critPower'];
const MAX_BYTES = 16 * 1024 * 1024;
const array = (v, name, length) => { if(!Array.isArray(v)||(length!=null&&v.length!==length))throw new Error(`${name} 数组长度或类型不正确`);return v; };
const integer = (v,name) => {if(!Number.isSafeInteger(v))throw new Error(`${name} 必须为安全整数`);return v;};
const indexed = (names,i,name) => {integer(i,name);if(i<0||i>=names.length)throw new Error(`${name} 出现未知索引 ${i}`);return names[i];};
const names = (values, list, name) => array(values,name).map(i=>indexed(list,i,name));
const truthy = v => v!=null&&v!==false&&v!==0&&v!==''&&(!Array.isArray(v)||v.length>0);
const fields = (keys,row) => Object.fromEntries(keys.flatMap((k,i)=>row[i]==null?[]:[[k,row[i]]]));
function extractShareKey(value){
  if(typeof value!=='string')throw new Error('阵容码必须是文本');
  const code=normalizeCode(value),key=code.slice(4);
  if(!code.startsWith('|TA|')||!key||key.length>4096||/[\s|\x00-\x1f\x7f\u200b-\u200d\u2060\ufeff]/.test(key))throw new Error('请单独输入一条完整的 |TA| 文字码');
  return key;
}
function lookupRequest(code){return {method:'lineup_assisant_logic.get_share_lineup_data',parameters:{share_key:extractShareKey(code)},iscache:false};}
function unpackLimits(value){
  const out={};array(value,'属性范围').forEach((v,i)=>{if(!truthy(v))return;const key=indexed(LIMITS,i,'属性范围');out[key]=key==='ExtraAttr'?Object.fromEntries(array(v,'额外属性').flatMap((x,j)=>truthy(x)?[[indexed(EXTRAS,j,'额外属性'),x]]:[])):v;});return out;
}
function unpackEquipment(value){
  const out=fields(['yuhun_lv','yuhun_star','criteria','two_suit','suit','limit','main_attr'],array(value,'御魂配置',7));
  if('yuhun_lv' in out)out.yuhun_lv=out.yuhun_lv===1?[15,15]:[0,15];
  if('yuhun_star' in out)out.yuhun_star=out.yuhun_star===1?[6]:[1,2,3,4,5,6];
  if('two_suit' in out)out.two_suit=names(out.two_suit,ATTRS,'两件套属性');
  if('suit' in out){const [four,two]=array(out.suit,'御魂套装',2);out.suit=[[four,4],[two,2]].flatMap(([group,count])=>array(group||[],'套装编号').map(x=>[300000+integer(x,'套装编号'),count]));}
  if('limit' in out)out.limit=unpackLimits(out.limit);
  if('main_attr' in out)out.main_attr=Object.fromEntries(array(out.main_attr,'主属性槽位',3).map((v,i)=>[['1','3','5'][i],truthy(v)?names(v,ATTRS,'主属性'):[]]));
  return out;
}
function unpackQiling(value){
  const row=array(value,'契灵配置',5),out=fields(['id','star','lv','mark_gid','marks'],row);
  if('marks' in out){const delta=(integer(row[3],'mark_gid')-1)*8;out.marks=array(row[4],'契灵印记').map(v=>integer(v,'契灵印记')+delta);}return out;
}
function isOnmyoji(row,version,yysIds){
  if(yysIds!=null)return yysIds.includes(row[0]);
  if(version>=1)return row.length===(version===1?6:7);
  if(Array.isArray(row[5])&&[5,7].includes(row[5].length))return row[5].length===5;
  throw new Error('V0 空配置无法区分阴阳师与式神，需要已核验的阴阳师 ID 表');
}
function unpackHconf(phconf,version,{yysIds}={}){
  if(!Number.isInteger(version)||![0,1,2,3].includes(version))throw new Error(`不支持的阵容版本 ${version}`);
  return array(phconf,'phconf').map((value,position)=>{
    const row=array(value,`phconf[${position}]`);integer(row[0],'hero_id');
    const yys=isOnmyoji(row,version,yysIds),keys=['hero_id','star','level','awake','skills',yys?'qiling_info':'equip_info'];
    if(!yys&&version>=1)keys.push('not_calc_flag','highest_limit');
    if(version>=2)keys.push('ai_skill');if(!yys&&version>=3)keys.push('use_score');
    array(row,`phconf[${position}]`,keys.length);const out=fields(keys,row),hero=row[0];
    if('skills' in out){const skills=array(out.skills,'技能');
      if(yys)out.skills=skills.map(s=>{const [sid,level]=array(s,'阴阳师技能',2);return [integer(sid,'技能偏移')+hero*100,integer(level,'技能等级')];});
      else out.skills=[...skills.slice(0,3).flatMap((lv,i)=>integer(lv,'技能等级')>0?[[hero*10+i+1,lv]]:[]),...skills.slice(3).map(s=>{const [sid,level]=array(s,'额外技能',2);return [integer(sid,'技能偏移')+hero*10,integer(level,'技能等级')];})];
    }
    if('qiling_info' in out)out.qiling_info=unpackQiling(out.qiling_info);
    if('equip_info' in out)out.equip_info=unpackEquipment(out.equip_info);
    if('highest_limit' in out)out.highest_limit=names(out.highest_limit,LIMITS.slice(0,8),'最高属性');
    return out;
  });
}
const extensions=new ExtensionCodec();
extensions.register({type:42,decode:b=>{
  const bytes=Buffer.from(b);
  if(bytes.length===12)return bytes.toString('hex');
  // BSON accepts the 24-character hex form too. latin1 preserves high bits
  // so non-ASCII bytes cannot masquerade as valid hex (Node ascii masks them).
  const hex=bytes.toString('latin1');
  if(bytes.length===24&&/^[0-9a-fA-F]{24}$/.test(hex))return hex.toLowerCase();
  throw new Error('ObjectId 必须为12字节或24位十六进制文本');
}});
extensions.register({type:43,decode:b=>{
  const s=Buffer.from(b).toString('ascii'),m=/^(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d{1,6})$/.exec(s);
  if(!m)throw new Error('日期扩展格式无效');const head=`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`,micro=m[7].padEnd(6,'0');
  const date=new Date(head+'Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==head)throw new Error('日期扩展值无效');return head+(Number(micro)?'.'+micro:'');
}});
extensions.register({type:44,decode:b=>({$binary_base64:Buffer.from(b).toString('base64')})});
function jsonSafe(value,depth=0){
  if(depth>100)throw new Error('阵容数据嵌套过深');
  if(typeof value==='bigint')return value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=BigInt(Number.MIN_SAFE_INTEGER)?Number(value):{$int64:value.toString()};
  if(value instanceof ExtData)return {$msgpackExtension:{type:value.type,dataBase64:Buffer.from(value.data).toString('base64')}};
  if(value instanceof Uint8Array)return {$binary_base64:Buffer.from(value).toString('base64')};
  if(Array.isArray(value))return value.map(v=>jsonSafe(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,jsonSafe(v,depth+1)]));
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('阵容包含非有限数值');return value;
}
function decodeLineupData(input,{yysIds,maxUncompressed=MAX_BYTES}={}){
  if(typeof input!=='string')throw new Error('lineup_data 必须是 Base64 文本');
  let payload=input.replace(/^\uFEFF/,'').trim();
  if(payload.startsWith('|TA|'))throw new Error('文字码需要游戏会话查询，不能作为压缩阵容内容解码');
  if(payload.startsWith('#TA#')){payload=payload.slice(4);if(/^\d+$/.test(payload))throw new Error('该二维码是官方阵容 ID，需要对应的官方阵容配置');}
  if(!Number.isSafeInteger(maxUncompressed)||maxUncompressed<1||maxUncompressed>MAX_BYTES)throw new Error('解压大小限制不合法');
  if(!payload||payload.length>maxUncompressed*2||payload.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload))throw new Error('Base64 阵容内容不完整或格式错误');
  const compressed=Buffer.from(payload,'base64');if(compressed.toString('base64')!==payload)throw new Error('Base64 阵容内容不是规范编码');
  let inflated;try{inflated=zlib.inflateSync(compressed,{maxOutputLength:maxUncompressed,info:true});}catch(error){throw new Error('阵容解压失败或超过16 MiB限制：'+error.message);}
  if(inflated.engine.bytesWritten!==compressed.length)throw new Error('压缩数据带有多余内容');
  const packed=decode(inflated.buffer,{extensionCodec:extensions,useBigInt64:true,maxStrLength:163840,maxBinLength:MAX_BYTES,maxArrayLength:1048576,maxMapLength:1024,maxExtLength:10485760,mapKeyConverter:k=>{if(typeof k!=='number'||!Number.isInteger(k))throw new Error('阵容字段键必须是整数');return 'n:'+k;}});
  if(!packed||Array.isArray(packed)||typeof packed!=='object')throw new Error('MessagePack 顶层应为字典');
  const out={};for(const [key,value] of Object.entries(packed)){const id=key.slice(2);if(!/^n:[1-9]$/.test(key)||!FIELDS[id])throw new Error('出现未知顶层字段');out[FIELDS[id]]=jsonSafe(value);}
  out.hconf=unpackHconf(out.phconf||[],out.ver??0,{yysIds});
  if('huids' in out){const ids=array(out.huids,'huids');if(ids.length>out.hconf.length)throw new Error('huids 数量大于角色数量');ids.forEach((uid,i)=>out.hconf[i].uid=uid);}
  return out;
}
function decodeInput(input,options={}){
  try{
    let content=input,code=null;
    if(input&&typeof input==='object'){
      if(input.share_key!=null){code='|TA|'+input.share_key;extractShareKey(code);}
      if(input.code!=null&&input.code!==code)throw new Error('查询响应 share_key 与指定原码不一致');
      if(input.err!==undefined&&!Number.isSafeInteger(input.err))throw new Error('查询响应错误码类型无效');
      if(input.err!==undefined&&input.err!==0){const failure=ParseErrors.fromServer(input.err,input.queryAttempts);return {ok:false,state:'lookup-failed',code,error:failure.message,failure};}
      if(typeof input.lineup_data!=='string')throw new Error('查询响应缺少 lineup_data');
      content=input.lineup_data;
    }
    if(typeof content!=='string')throw new Error('请输入完整阵容内容');
    const text=normalizeCode(content);
    if(text.startsWith('|TA|'))return {ok:false,state:'lookup-required',error:'文字码只包含服务器分享键。请导入该阵容的自创二维码，或游戏会话查询返回的 lineup_data。',lookup:lookupRequest(text)};
    if(/^#TA#\d+$/.test(text))return {ok:false,state:'official-id',officialId:text.slice(4),error:'该二维码是官方阵容编号，需要对应的官方配置数据。'};
    const data=decodeLineupData(text,options),kinds=(data.phconf||[]).map(row=>isOnmyoji(row,data.ver??0,options.yysIds)?'onmyoji':'shikigami');
    return {ok:true,format:'ta-payload',code:code||(text.startsWith('#TA#')?text:'#TA#'+text),data,kinds};
  }catch(error){const message=String(error.message).slice(0,500);return {ok:false,state:'invalid-payload',error:message,failure:{kind:'decode-error',label:'本地解码失败',retryable:true,message}};}
}
module.exports={decodeInput,decodeLineupData,unpackHconf,extractShareKey,lookupRequest,isOnmyoji};
