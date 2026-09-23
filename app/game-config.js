(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasGame=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function levels(data,id,awake=1){const v=data?.skills?.[id]?.variants;return v?.[String(awake?1:0)]||v?.['-1']||[];}
function skill(data,id,level=1,awake=1){return levels(data,id,awake).find(s=>s.level===level)||null;}
function slots(data,stage){const s=data?.stages?.[stage]||{actors:1,shikigami:5};return [...Array(s.actors).fill('onmyoji'),...Array(s.shikigami).fill('shikigami')];}
function defaultMember(data,id){
 const actor=data.heroes[id]?.kind==='onmyoji';
 return {hero_id:Number(id),star:actor?2:6,level:actor?1:40,awake:actor?0:1,skills:[],ai_skill:0,...(actor?{}:{not_calc_flag:0,highest_limit:[],use_score:0,equip_info:{yuhun_lv:[15,15],yuhun_star:[6],criteria:1,two_suit:[],suit:[],limit:{},main_attr:{'1':[],'3':[],'5':[]}}})};
}
function memberSkills(data,h){
 const hero=data?.heroes?.[h.hero_id];if(!hero)return [];
 return (hero.kind==='onmyoji'?(h.skills||[]).map(s=>s[0]):hero.skills.filter(id=>id!==hero.awakeSkill||h.awake===1)).map((id,i)=>({id,slot:i+1,level:h.skills?.find(s=>s[0]===id)?.[1]??null}));
}
function skillOrder(data,h){
 const hero=data?.heroes?.[h.hero_id];if(!hero)return [];
 if(hero.kind!=='onmyoji')return hero.skills;
 const equipped=(h.skills||[]).map(s=>s[0]).filter(id=>id!==hero.skills[0]);
 equipped.sort((a,b)=>(h.hero_id===12?(Number(![1205,1206,1207].includes(a))-Number(![1205,1206,1207].includes(b))):0)||a-b);
 return [hero.skills[0],...equipped];
}
function skillLabel(data,heroId,id,context){
 const hero=data?.heroes?.[heroId];if(!hero)return '技能';
 if(hero.kind==='onmyoji'){const order=context?skillOrder(data,context):[hero.skills[0]],slot=order.indexOf(Number(id));if(slot>=0)return '第 '+(slot+1)+' 技能'+(slot===0?' · 普攻':'');return skill(data,id,1,0)?.passive?'被动技能':'可携带技能';}
 const own=hero.skills.indexOf(Number(id));if(own>=0)return '第 '+(own+1)+' 技能';
 for(const [i,sid]of hero.skills.entries())for(const l of levels(data,sid))if(l.branches.includes(Number(id))||l.aiBranches?.includes(Number(id))||l.related.includes(Number(id)))return '第 '+(i+1)+' 技能 · 分支';
 return '衍生技能';
}
function aiChoices(data,h){
 const hero=data?.heroes?.[h.hero_id],result=[{value:0,name:'不指定'},{value:11,name:'智能施法'}];if(!hero)return result;
 const actor=hero.kind==='onmyoji';
 const ids=skillOrder(data,h);
 ids.forEach((id,i)=>{
  const lv=h.skills?.find(s=>s[0]===id)?.[1]||1,s=skill(data,id,lv,h.awake);if(!s||s.passive&&!s.aiBranches?.length||id===hero.awakeSkill&&!h.awake)return;
  const value=actor&&h.hero_id===12&&[1205,1206,1207].includes(id)?id-1200:i+1;
  const branches=s.aiBranches?.length?s.aiBranches:s.branches;
  if(!branches.length)result.push({value,id,name:s.name,slot:i+1});
  for(const [j,child]of branches.entries()){
   const c=skill(data,child,1,h.awake);if(c&&!c.passive)result.push({value:child>=33831&&child<=33844?child:j+5,id:child,name:s.name+' · '+c.name,slot:i+1});
  }
 });
 return result;
}
function aiName(data,h){return aiChoices(data,h).find(s=>s.value===(h.ai_skill||0))?.name||'原码自动施法设置未收录';}
function markLevels(q){const counts=new Map();for(const id of q?.marks||[])counts.set(id,(counts.get(id)||0)+1);return [...counts].map(([id,level])=>({id,level})).sort((a,b)=>b.level-a.level||a.id-b.id);}
function spiritAttributes(data,q){return (data?.spirits?.[q?.id]?.attributes?.[q.star]||[]).map(([key,[base,growth]])=>({key,value:base+growth*q.lv,base,growth}));}
function validate(data,input){
 if(!data?.heroes||!data.stages)throw Error('游戏编辑资料未加载，请重启后重试');
 const stage=data.stages[input.select_stage_id];if(!stage)throw Error('请选择游戏原码副本');
 if(typeof input.title!=='string'||!input.title.trim())throw Error('请填写阵容名称');
 if(input.desc!=null&&(typeof input.desc!=='string'||input.desc.length>100))throw Error('阵容介绍最多 100 字');
 const required=slots(data,input.select_stage_id);
 if(!Array.isArray(input.hconf)||input.hconf.length!==required.length)throw Error('此副本需要 '+required.length+' 个位置，请补全阵容成员');
 input.hconf.forEach((h,i)=>{
  const hero=data.heroes[h?.hero_id],prefix='第 '+(i+1)+' 位：';
  if(!hero||hero.kind!==required[i])throw Error(prefix+(required[i]==='onmyoji'?'请选择阴阳师 / 英杰':'请选择式神'));
  const actor=hero.kind==='onmyoji';
  if(h.skills!=null&&!Array.isArray(h.skills))throw Error(prefix+'技能配置格式错误');
  const configured=h.skills||[],ids=configured.map(s=>s?.[0]);
  if(actor&&configured.length>2)throw Error(prefix+'只能携带两个技能');
  if(new Set(ids).size!==ids.length)throw Error(prefix+'技能不能重复');
  for(const row of configured){
   const [id,lv]=row,allowed=actor?hero.equipSkills:hero.skills.filter(s=>s!==hero.awakeSkill||h.awake===1);
   if(!allowed.includes(id))throw Error(prefix+'不能携带此技能，请重新选择');
   if(!skill(data,id,lv,h.awake))throw Error(prefix+'技能等级超出游戏允许范围');
  }
  if(!aiChoices(data,h).some(s=>s.value===(h.ai_skill??0)))throw Error(prefix+'自动施法与当前技能不符，请重新选择');
  if(!actor){
   if(![0,1].includes(h.not_calc_flag??0))throw Error(prefix+'御魂配置开关无效');
   if(h.use_score!=null&&(!Number.isFinite(h.use_score)||h.use_score<0||h.use_score>400000||Math.abs(h.use_score*100-Math.round(h.use_score*100))>1e-6))throw Error(prefix+'评分须为 0～400000，最多两位小数');
   if(h.qiling_info)throw Error(prefix+'式神不能佩戴契灵');
  }else{
   if(h.equip_info)throw Error(prefix+'阴阳师 / 英杰不能配置御魂');
   const q=h.qiling_info;if(!q)return;
   const spirit=data.spirits[q.id];if(!spirit?.heroes.includes(h.hero_id))throw Error(prefix+'此契灵不适用于该角色');
   if(!integer(q.star,1,6)||!integer(q.lv,0,data.spiritMaxLevel[q.star]||0))throw Error(prefix+'契灵星级或等级无效');
   if(!data.markGroups[q.mark_gid]||!Array.isArray(q.marks))throw Error(prefix+'术印组未收录');
   const selected=markLevels(q),allowed=data.markGroups[q.mark_gid]?.mark_list||[];
   if(q.marks.length>6||selected.some(m=>!allowed.includes(m.id)||m.level>3))throw Error(prefix+'契灵最多六枚术印，同种最高 3 级');
  }
 });return input;
}
return {levels,skill,slots,defaultMember,memberSkills,skillLabel,aiChoices,aiName,markLevels,spiritAttributes,validate};
});
