(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./game-config.js'):root.AtlasGame,
  common?require('./rune-lineup.js'):root.AtlasRuneLineup,
  common?require('./rune-search.js'):root.AtlasRuneSearch);
 if(common)module.exports=api;else root.AtlasRuneCandidate=api;
})(globalThis,function(G,R,S){
'use strict';

const mainAttrs={attack_rate:'atk_per',crit_rate:'critical_rate',crit_damage:'critical_pow',speed:'spd',
 effect_hit:'debuff_acc',effect_resist:'debuff_res',hp_rate:'max_hp_per',defense_rate:'def_per'};
const limits=[
 ['attack','final_atk',1],['hp','final_max_hp',1],['defense','final_def',1],['speed','spd',1],
 ['crit','critical_rate',100],['critDamage','critical_pow',100],['effectHit','debuff_acc',100],['effectResist','debuff_res',100],
];

function sampleVerdict(report,seed){
 if(report?.seed!==seed||report.completed!==true||!Number.isFinite(report.engineSeconds)||report.engineSeconds<0||
  !Number.isSafeInteger(report.wavesCleared)||report.wavesCleared<0||report.wavesCleared>3)return 'unknown';
 if(report.outcome==='loss')return 'loss';
 return report.outcome==='win'&&report.wavesCleared===3?'pass':'unknown';
}

function passed(samples){
 return samples.length===S.sampleSeeds.length&&samples.every((r,i)=>sampleVerdict(r,S.sampleSeeds[i])==='pass');
}

function spiritConfig(game,spirit){
 if(!spirit)return undefined;
 const {id,star,lv,marks}=spirit;
 const group=Object.entries(game.markGroups).find(([key,{mark_list}])=>
  marks.every(mark=>mark_list.includes(mark)&&mark>(Number(key)-1)*8&&mark<=Number(key)*8));
 if(!group)throw Error('当前契灵术印无法写入游戏阵容码');
 return {id,star,lv,marks,mark_gid:Number(group[0])};
}

function equipment(souls,panel,suits){
 const counts=new Map(),main_attr={};
 for(const soul of souls){
  const name=soul.setId==='涅槃之火'?'涅槃火':soul.setId,id=suits.get(name);
  if(!id)throw Error('战报中有尚未核对编号的御魂套装');
  counts.set(id,(counts.get(id)||0)+1);
  if(soul.slot%2===0){
   const stat=mainAttrs[soul.mainAttrType];
   if(!stat)throw Error('此御魂主属性无法写入游戏阵容码');
   main_attr[soul.slot-1]=[stat];
  }
 }
 const suit=[...counts].sort(([a],[b])=>a-b).flatMap(([id,count])=>count>=2?[[id,count-count%2]]:[]);
 const limit=Object.fromEntries(limits.map(([stat,key,scale])=>{
  const value=panel[stat]*scale;
  if(!Number.isFinite(value)||value<0)throw Error('缺少可写入阵容码的配装面板');
  return [key,[Math.floor(value*100)/100,Math.ceil(value*100)/100]];
 }));
 return {yuhun_lv:souls.every(row=>row.level===15)?[15,15]:[0,15],
  yuhun_star:souls.every(row=>row.quality===6)?[6]:[1,2,3,4,5,6],criteria:1,suit,limit,main_attr};
}

async function template(row,{gameConfig:game,suits:suitIndex}){
 if(!passed(row.samples))throw Error('完成全部采样复跑后才可生成此阵容码');
 const {onmyoji,spirit,members}=row.plan;
 const basic=game.heroes[onmyoji.heroId]?.skills[0];
 const actor={hero_id:onmyoji.heroId,level:onmyoji.level,star:onmyoji.star,awake:onmyoji.awake,
  skills:onmyoji.skinfo.filter(([id])=>id!==basic),ai_skill:onmyoji.aiSkill,qiling_info:spiritConfig(game,spirit)};
 const suits=new Map(Object.entries(suitIndex).map(([id,name])=>[name,Number(id)]));
 const hconf=[actor,...members.map(({hero,souls,aiSkill},index)=>({
  hero_id:Number(hero.heroId),level:hero.level,star:hero.star,awake:hero.awake,skills:hero.skinfo,ai_skill:aiSkill,
  not_calc_flag:0,equip_info:equipment(souls,row.panels[index],suits)
 }))];
 const names=members.map(({hero})=>game.heroes[hero.heroId]?.name);
 const title='魂王 · '+names.join('、')+' · '+(await sha256(hconf)).slice(0,10);
 const basicLevel=onmyoji.skinfo.find(([id])=>id===basic)?.[1];
 return G.validate(game,{title,desc:`资源 ${R.resourceVersion}，${S.sampleSeeds.length} 个离线种子通关。阴阳师普攻 ${basicLevel} 级，需核对实际配装。全随机分支待验证。`,
  select_stage_id:R.sceneId,hconf});
}

// Match the actual fields consumed by rune_team.py. Worn gear and display metadata
// can change independently of the selected equipment.
const heroKeys=hero=>[Number(hero.heroId),hero.level,hero.star,hero.awake,hero.skinfo,hero.selectSkills??hero.skinfo.map(([id])=>id)];
const soulKeys=soul=>[soul.id,soul.slot,soul.quality,soul.level,soul.setId,soul.mainAttrType,soul.mainAttrValue,
 soul.subAttributes.map(({type,value})=>[type,value])];
const spiritKeys=spirit=>spirit?[spirit.id,spirit.star,spirit.lv,spirit.shiny,spirit.marks]:null;
async function sha256(value){
 const sum=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(sum),v=>v.toString(16).padStart(2,'0')).join('');
}
async function fingerprint(code,accountId,plan){
 const payload=[R.resourceVersion,R.sceneId,code,accountId,heroKeys(plan.onmyoji),plan.onmyoji.aiSkill,spiritKeys(plan.spirit),
  plan.members.map(m=>[m.instanceId,heroKeys(m.hero),m.aiSkill,m.souls.map(soulKeys)])];
 return sha256(payload);
}

async function receipt(row,account,code){
 if(!passed(row.samples))throw Error('当前配装尚未通过全部采样');
 const {onmyoji,spirit,members}=row.plan;
 return {version:1,resourceVersion:R.resourceVersion,accountId:account.id,onmyoji,spirit,
  members:members.map(m=>({id:m.instanceId,souls:m.souls.map(s=>s.id),aiSkill:m.aiSkill})),
  samples:row.samples.map(({seed,engineSeconds})=>({seed,engineSeconds})),
  digest:await fingerprint(code,account.id,row.plan)};
}

function receiptFor(lineup,account){
 return Array.isArray(lineup.runeReceipts)?lineup.runeReceipts.find(r=>r?.accountId===account.id):undefined;
}

async function restore(lineup,account){
 const saved=receiptFor(lineup,account);
 if(!saved)return null;
 const changed=()=>{throw Error('已保存的原版复跑配装或版本有变化，改用阵容码重新精算');};
 if(saved.version!==1||saved.resourceVersion!==R.resourceVersion||Number(lineup.gameSceneId)!==R.sceneId||
    !Array.isArray(saved.members)||saved.members.length!==5||!saved.onmyoji)return changed();
 const members=saved.members.map(m=>{
  const hero=account.heroes[m?.id]?.raw;
  const souls=Array.isArray(m?.souls)&&m.souls.length===6?m.souls.map(id=>account.souls[id]?.raw):null;
  if(!hero||!souls||souls.some(s=>!s))return changed();
  return {instanceId:m.id,hero,souls,aiSkill:m.aiSkill};
 });
 const {onmyoji,spirit}=saved;
 if(spirit&&(!Array.isArray(account.raw.hunlings)||!account.raw.hunlings.some(q=>JSON.stringify(spiritKeys(q))===JSON.stringify(spiritKeys(spirit)))))return changed();
 const plan={onmyoji,...(spirit?{spirit}:{}),members};
 if(await fingerprint(lineup.code,account.id,plan)!==saved.digest)return changed();
 return plan;
}

return {sampleVerdict,passed,template,receipt,receiptFor,restore};
});
