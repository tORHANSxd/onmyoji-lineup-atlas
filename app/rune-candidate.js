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

function passed(samples,dungeonId=R.dungeonId){
 const seeds=S.samplesForDungeon(dungeonId);
 return !!seeds&&samples.length===seeds.length&&samples.every((r,i)=>sampleVerdict(r,seeds[i])==='pass');
}

function commonSampleTiming(rows){
 const combat=rows.every(row=>row.samples.every(sample=>{
  const ms=sample.animationPlayback?.combatElapsedMs;
  return Number.isSafeInteger(ms)&&ms>=0;
 }));
 const seconds=sample=>combat?sample.animationPlayback.combatElapsedMs/1000:sample.engineSeconds;
 return new Map(rows.map(row=>{
  const longest=row.samples.reduce((worst,trial)=>seconds(trial)>seconds(worst)?trial:worst);
  return [row,{combat,seed:longest.seed,seconds:seconds(longest)}];
 }));
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

async function template(row,data){
 const dungeonId=row.dungeonId??R.dungeonId,sceneId=R.sceneForDungeon(dungeonId);
 if(sceneId===null||!passed(row.samples,dungeonId))throw Error('完成当前副本的全部采样复跑后才可生成此阵容码');
 return draft(row,data,sceneId,dungeonId===R.dungeonId?'魂王':'魂土',row.samples.length);
}

function hun13Verdict(report,seed){
 if(report?.seed!==seed||report.completed!==true||!Number.isFinite(report.engineSeconds)||report.engineSeconds<0||
    !Number.isSafeInteger(report.wavesCleared)||report.wavesCleared<0||report.wavesCleared>2)return 'unknown';
 return report.outcome==='win'?'pass':report.outcome==='loss'?'loss':'unknown';
}
const passedHun13=samples=>samples.length===S.hun13SampleSeeds.length&&samples.every((report,index)=>
 hun13Verdict(report,S.hun13SampleSeeds[index])==='pass');

async function hun13Templates(row,data){
 if(row.rounds.length!==2||!passedHun13(row.samples))throw Error('完成虚无的全部采样复跑后才可生成双队阵容码');
 return Promise.all(row.rounds.map((round,index)=>draft(round,data,R.hun13SceneId,`虚无第 ${index+1} 波`,row.samples.length)));
}

function pveGoalMet(report,battleMode){
 if(battleMode===2000)return Number.isSafeInteger(report.guildHunt?.damage)&&report.guildHunt.damage>0;
 if(battleMode===306)return Number.isSafeInteger(report.guildRetreat?.damage)&&report.guildRetreat.damage>0;
 if(battleMode===528)return report.experience?.timedOut===false&&report.experience.requiredKills===30&&report.experience.kills===30;
 return report.wavesCleared===report.waveCount;
}

const personalScore=report=>report.guildHunt??report.guildRetreat;
const damageMode=mode=>mode===2000||mode===306;

function damageResult(samples){
 const damage=samples.map(report=>personalScore(report)?.damage);
 if(!damage.length||samples.some((report,i)=>!report.completed||!Number.isSafeInteger(damage[i])||damage[i]<0))return null;
 return {average:damage.reduce((total,value)=>total+value,0)/damage.length,
  min:Math.min(...damage),max:Math.max(...damage),credited:samples.filter((report,i)=>
   (report.guildRetreat||report.outcome==='win')&&damage[i]>0).length};
}

function compareDamage(a,b){
 return b.average-a.average||b.min-a.min||b.max-a.max;
}

function waveResult(samples){
 if(!samples.length||samples.some(report=>!report.completed||report.waveCount!==70||
    !Number.isInteger(report.wavesCleared)||report.wavesCleared<0||report.wavesCleared>70))return null;
 const waves=samples.map(report=>report.wavesCleared);
 return {min:Math.min(...waves),max:Math.max(...waves),average:waves.reduce((total,value)=>total+value,0)/waves.length};
}

async function underworldTemplates(row,data,{stageId,groupId,codeStageId,codeLabel}){
 const seeds=S.baseSampleSeeds;
 if(row.samples.length!==seeds.length||!waveResult(row.samples)||!row.samples.every((report,i)=>
    report.battleMode===2001&&report.stageId===stageId&&report.groupId===groupId&&report.seed===seeds[i]))
  throw Error('完成阴界之门共同种子复跑后才可制作接力阵容码');
 return Promise.all(row.rounds.flatMap((round,index)=>{
  const samples=row.samples.filter(report=>report.wavesCleared>0&&report.underworld?.teams?.some(team=>team.team===index+1));
  if(!samples.length||!round.panels?.every(Boolean)||round.plan.members.some(member=>member.souls.length!==6))return [];
  const team=index+1;
  return [draft(round,data,codeStageId,`${codeLabel} · 第 ${team} 队`,samples.length,'取得接力波次成绩').then(request=>({team,request}))];
 }));
}

function scoreInstructions(tactics){
 if(!tactics)return '';
 const {manualOpening,redBoss,greenSlot,autoMode}=tactics;
 return (autoMode?`入场前把第${autoMode.slot}位式神设为自动${autoMode.mode==='basic'?'普攻':'妖术'}。`:'')+
  (manualOpening?'手动开场，首动普攻首领后切自动。':'')+(redBoss?'红标首领。':'')+(greenSlot?`绿标第${greenSlot}位式神。`:'');
}

function readScoreInstructions(notes){
 if(typeof notes!=='string')return null;
 const match=/^资源 0\.[\d.]+，\d+ 场离线结算。(?:我方伤害取下限。)?阴阳师普攻 \d+ 级。开场操作。(?:入场前把第([1-5])位式神设为自动(普攻|妖术)。)?(手动开场，首动普攻首领后切自动。)?(红标首领。)?(?:绿标第([1-5])位式神。)?全分支待验证。$/.exec(notes);
 if(!match)return null;
 const [,slot,mode,opening,red,green]=match;
 const tactics={...(opening?{manualOpening:true}:{}),...(red?{redBoss:true}:{}),...(green?{greenSlot:Number(green)}:{}),
  ...(slot?{autoMode:{slot:Number(slot),mode:mode==='普攻'?'basic':'spell'}}:{})};
 return Object.keys(tactics).length?tactics:null;
}

async function pveTemplate(row,data,{stageId,groupId,battleMode,waveCount,codeStageId,codeLabel}){
 const seeds=S.baseSampleSeeds;
 const instructions=scoreInstructions(row.plan.tactics);
 if(!Number.isSafeInteger(waveCount)||waveCount<1||row.samples.length!==seeds.length||!row.samples.every((report,index)=>
  report.battleMode===battleMode&&report.stageId===stageId&&report.groupId===groupId&&report.seed===seeds[index]&&
  report.completed&&(battleMode===306||report.outcome==='win')&&report.waveCount===waveCount&&pveGoalMet(report,battleMode)&&
  (!instructions||damageMode(battleMode)&&scoreInstructions(personalScore(report)?.tactics)===instructions)))
  throw Error('完成本关的全部采样复跑后才可生成此阵容码');
 if(!row.panels?.every(Boolean)||row.plan.members.some(member=>member.souls.length!==6))
  throw Error('御魂条件需要每位式神穿齐六个位置并能够计算面板');
 return draft(row,data,codeStageId,codeLabel,row.samples.length,damageMode(battleMode)?'取得有效个人伤害结算':'通关');
}

async function draft(row,{gameConfig:game,suits:suitIndex},sceneId,label,samples,outcome='通关'){
 const {onmyoji,spirit,members,tactics}=row.plan;
 const basic=game.heroes[onmyoji.heroId]?.skills[0];
 const actor={hero_id:onmyoji.heroId,level:onmyoji.level,star:onmyoji.star,awake:onmyoji.awake,
  skills:onmyoji.skinfo.filter(([id])=>id!==basic),ai_skill:onmyoji.aiSkill,qiling_info:spiritConfig(game,spirit)};
 const suits=new Map(Object.entries(suitIndex).map(([id,name])=>[name,Number(id)]));
 const hconf=[actor,...members.map(({hero,souls,aiSkill},index)=>({
  hero_id:Number(hero.heroId),level:hero.level,star:hero.star,awake:hero.awake,skills:hero.skinfo,ai_skill:aiSkill,
  not_calc_flag:0,equip_info:equipment(souls,row.panels[index],suits)
 }))];
 const names=members.map(({hero})=>game.heroes[hero.heroId]?.name);
 const title=label+' · '+names.join('、')+' · '+(await sha256(tactics?[hconf,tactics]:hconf)).slice(0,10);
 const basicLevel=onmyoji.skinfo.find(([id])=>id===basic)?.[1];
 const damage=row.plan.damageFloor?'我方伤害取下限。':'';
 const desc=tactics?`资源 ${R.resourceVersion}，${samples} 场离线结算。${damage}阴阳师普攻 ${basicLevel} 级。开场操作。${scoreInstructions(tactics)}全分支待验证。`:
  `资源 ${R.resourceVersion}，${samples} 个离线种子${outcome}。${damage}阴阳师普攻 ${basicLevel} 级，需核对实际配装。全随机分支待验证。`;
 return G.validate(game,{title,desc,select_stage_id:sceneId,hconf});
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
async function fingerprint(code,accountId,plan,sceneId){
 const payload=[R.resourceVersion,sceneId,code,accountId,heroKeys(plan.onmyoji),plan.onmyoji.aiSkill,spiritKeys(plan.spirit),
  plan.members.map(m=>[m.instanceId,heroKeys(m.hero),m.aiSkill,m.souls.map(soulKeys)])];
 if(plan.damageFloor)payload.push('minimum-player-damage');
 return sha256(payload);
}

async function receipt(row,account,code){
 const dungeonId=row.dungeonId??R.dungeonId,sceneId=R.sceneForDungeon(dungeonId);
 if(sceneId===null||!passed(row.samples,dungeonId))throw Error('当前配装尚未通过该副本的全部采样');
 const {onmyoji,spirit,members,damageFloor}=row.plan;
 return {version:1,resourceVersion:R.resourceVersion,dungeonId,accountId:account.id,onmyoji,spirit,
  ...(damageFloor?{damageFloor:true}:{}),
  members:members.map(m=>({id:m.instanceId,souls:m.souls.map(s=>s.id),aiSkill:m.aiSkill})),
  samples:row.samples.map(({seed,engineSeconds})=>({seed,engineSeconds})),
  digest:await fingerprint(code,account.id,row.plan,sceneId)};
}

function receiptFor(lineup,account){
 return Array.isArray(lineup.runeReceipts)?lineup.runeReceipts.find(r=>r?.accountId===account.id):undefined;
}

async function restore(lineup,account){
 const saved=receiptFor(lineup,account);
 if(!saved)return null;
 const changed=()=>{throw Error('已保存的原版复跑配装或版本有变化，改用阵容码重新精算');};
 const sceneId=R.sceneForDungeon(saved.dungeonId??R.dungeonId);
 if(saved.version!==1||saved.resourceVersion!==R.resourceVersion||sceneId===null||Number(lineup.gameSceneId)!==sceneId||
    !Array.isArray(saved.members)||saved.members.length!==5||!saved.onmyoji)return changed();
 const members=saved.members.map(m=>{
  const hero=account.heroes[m?.id]?.raw;
  const souls=Array.isArray(m?.souls)&&m.souls.length===6?m.souls.map(id=>account.souls[id]?.raw):null;
  if(!hero||!souls||souls.some(s=>!s))return changed();
  return {instanceId:m.id,hero,souls,aiSkill:m.aiSkill};
 });
 const {onmyoji,spirit}=saved;
 if(spirit&&(!Array.isArray(account.raw.hunlings)||!account.raw.hunlings.some(q=>JSON.stringify(spiritKeys(q))===JSON.stringify(spiritKeys(spirit)))))return changed();
 const plan={onmyoji,...(spirit?{spirit}:{}),members,...(saved.damageFloor?{damageFloor:true}:{})};
 if(await fingerprint(lineup.code,account.id,plan,sceneId)!==saved.digest)return changed();
 return plan;
}

return {sampleVerdict,hun13Verdict,passed,passedHun13,commonSampleTiming,pveGoalMet,damageMode,damageResult,compareDamage,waveResult,underworldTemplates,scoreInstructions,readScoreInstructions,template,hun13Templates,pveTemplate,receipt,receiptFor,restore};
});
