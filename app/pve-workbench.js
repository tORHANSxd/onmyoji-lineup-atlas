(() => {
 'use strict';
 const api=window.dungeonCatalog;
 const seeds=AtlasRuneSearch.baseSampleSeeds;
 const isDamageMode=AtlasRuneCandidate.damageMode;
 const yinYang=AtlasJourneyHard.boss;
 const ghostKingTower=AtlasDevilFeast.tower;
 const laolao=AtlasDevilFeast.laolao;
 const fusion=AtlasDevilFeast.fusion;
 const asuraBoss=AtlasAsuraBoss;
 const {duskWraith:dusk,songstress:song,mirage,mirageX,catfish,catfishX,skeleton,skeletonX,longche,longcheX,spiderLive,spiderNormal}=AtlasFengmoLive;
 const isWaveMode=mode=>mode===2001;
 let pane=null,job=null,stopping=null,runtime=null,runtimePending=null;

 function replayableLineup(lineup,config){
  if((config.codeStageId!=null&&Number(lineup.gameSceneId)!==config.codeStageId)||
     (config.codeStageIds?.length&&!config.codeStageIds.includes(Number(lineup.gameSceneId)))||
     !C.hasParsedContent(lineup)||!C.shikigamiRequirementsComplete(lineup))return false;
  const members=lineup.members.filter(member=>member.occupied!==false);
  const actors=members.filter(member=>member.kind==='onmyoji').length;
  return members.length===config.memberCount+actors&&(config.replacementActor?actors<=1:actors===1)&&
   members.filter(member=>member.kind==='shikigami').length===config.memberCount&&
   (!config.trialEligible||members.some(member=>config.trialEligible.includes(Number(member.shikigamiId))));
 }

 function knownLineups(){
  return lineups().filter(lineup=>replayableLineup(lineup,pane));
 }

 function selectedForReplay(available){
  const byId=new Map(available.map(lineup=>[lineup.id,lineup]));
  return (pane.lineup.value?[pane.lineup.value]:[...selectedLineups]).map(id=>byId.get(id)).filter(Boolean);
 }

 function updateSelect(select,rows,placeholder){
  const signature=JSON.stringify(rows);
  if(select.dataset.options===signature)return;
  const value=select.value;
  select.replaceChildren(new Option(placeholder,''),...rows.map(([id,title])=>new Option(title,id)));
  if(rows.some(([id])=>id===value))select.value=value;
  select.dataset.options=signature;
 }

 function orochiReserve(selected,inventory){
  if(!pane.reserveActor)return null;
  const actorOptions=new Map();
  const usedActors=new Set(selected.flatMap(lineup=>lineup.members.filter(m=>m.kind==='onmyoji'&&m.occupied!==false).map(m=>m.onmyojiId?.toString())));
  for(const lineup of lineups()){
   const actor=lineup.members?.find(m=>m.kind==='onmyoji'&&m.occupied!==false);
   if(!actor?.onmyojiId||!Array.isArray(actor.skills)||!Number.isInteger(actor.level)||!Number.isInteger(actor.star)||usedActors.has(String(actor.onmyojiId)))continue;
   actorOptions.set(lineup.id,{actor,title:`${actor.name} · ${lineup.title}`});
  }
  updateSelect(pane.reserveActor,[...actorOptions].map(([id,{title}])=>[id,title]),'选择已知阵容的阴阳师配置');
  if(!pane.reserveChoices||pane.reserveAccount!==inventory){
   const ownership=inventory&&accountInventorySolver.equipmentOwnership(inventory),members=new Map();
   if(ownership)for(const [id,souls] of ownership.byHero){
    const hero=inventory.heroes[id],meta=rosterById(hero.shikigamiId);
    if(!hero.raw?.skinfo?.length||meta?.isMaterial||DATA.gameConfig.heroes[hero.shikigamiId]?.kind!=='shikigami'||souls.some(soul=>soul.unknown.length))continue;
    members.set(id,{title:`${accountHeroName(hero,meta)} · ${hero.level}级 · ${souls.length}件御魂 · ${id.slice(-5)}`,
     data:{instanceId:id,hero:hero.raw,souls:souls.map(soul=>soul.raw)}});
   }
   const options=[...members].sort(([,a],[,b])=>a.title.localeCompare(b.title,'zh-CN')).map(([id,{title}])=>[id,title]);
   for(const select of pane.reserveMembers){
    if(pane.reserveAccount?.id!==inventory?.id)select.value='';
    updateSelect(select,options,'选择已拥有式神');
   }
   pane.reserveSelection=null;
   pane.reserveAccount=inventory;
   pane.reserveChoices=members;
  }
  const ids=pane.reserveMembers.map(select=>select.value);
  const selection=ids.join(',');
  if(pane.reserveSelection!==selection){
   for(const select of pane.reserveMembers)for(const option of select.options){
    option.disabled=!!option.value&&option.value!==select.value&&ids.includes(option.value);
   }
   pane.reserveSelection=selection;
  }
  const actor=actorOptions.get(pane.reserveActor.value)?.actor;
  const reserves=ids.map(id=>pane.reserveChoices.get(id)?.data);
  return {actor,reserves,ready:!!actor&&reserves.every(Boolean)&&new Set(ids).size===4,
   hint:actorOptions.size?'指定备选阴阳师和四位备选式神。':'需要一份包含不同阴阳师的已知配置，可在阵容制作器中保存。'};
 }

 function reserveInventory(plan,inventory){
  const heroes=new Set(plan.reserves.map(row=>row.instanceId));
  const souls=new Set(plan.reserves.flatMap(row=>row.souls.map(soul=>soul.id)));
  const available=(rows,locked)=>Object.fromEntries(Object.entries(rows).filter(([id])=>!locked.has(id)));
  return {...inventory,heroes:available(inventory.heroes,heroes),souls:available(inventory.souls,souls)};
 }

 const busy=()=>!!(job?.running||stopping);
 const active=run=>job===run&&pane===run.pane&&!run.cancelled&&DATA===run.data&&usesDungeonInventory(run);
 const ready=()=>runtime?.available&&runtime.resourceVersion===pane.version&&
  (runtime.battleModes??[3]).includes(pane.battleMode??3);
 function readArtifact(pane){
  const id=Number(pane.artifactChoice.value),amount=pane.artifactAmount.valueAsNumber;
  const rule=pane.artifactOptions.find(row=>row.id===id);
  const entries=pane.artifactRounds.value.trim().split(/[,，\s]+/).filter(Boolean);
  const rounds=entries.map(Number);
  if(!rule||!Number.isSafeInteger(amount)||amount<1||!entries.every(value=>/^\d+$/.test(value))||
     !rounds.every(Number.isSafeInteger)||(pane.artifactRefinement?amount>rule.maxRefinement:rounds.length>amount))return null;
  return [id,amount,rounds];
 }

 function update(){
  if(!pane)return;
  if(pane.fixedTrial){
   const running=job?.running===true;
   pane.start.disabled=!ready()||runeBusy()||!pane.seed.checkValidity();
   pane.seed.disabled=running;
   pane.control.disabled=running;
   pane.stop.hidden=!running;
   pane.stop.disabled=!!job?.cancelled;
   pane.status.textContent=job?.notice??(ready()?'等待复跑。':runtime?.reason??
    (runtimePending?'正在检查原版复跑组件…':'当前运行时缺少对应版本的原版梦境试炼组件。'));
   return;
  }
  const available=knownLineups(),hasAccount=!!account(),blocked=runeBusy();
  const supported=ready();
  const running=job?.running===true;
  const options=JSON.stringify(available.map(({id,title})=>[id,title]));
  if(pane.options!==options){
   const previous=pane.lineup.value;
   const placeholder=new Option('使用阵容库已勾选项','');
   pane.lineup.replaceChildren(placeholder,...available.map(({title,id})=>new Option(title,id)));
   if(available.some(({id})=>id===previous))pane.lineup.value=previous;
   pane.options=options;
  }
  const selected=selectedForReplay(available);
  const reserve=orochiReserve(selected,account());
  pane.reserve=reserve;
  const capture=pane.captureItem?.value?{itemId:Number(pane.captureItem.value),cards:pane.captureCards.map(field=>Number(field.value))}:null;
  const captureReady=!capture||new Set(capture.cards).size===3;
  const moves=pane.eventMoves?.valueAsNumber;
  const eventReady=!pane.eventMoves||Number.isSafeInteger(moves)&&moves>=0;
  const training=pane.urdtgTraining?{skillLevel:Number(pane.trainingSkill.value),masks:pane.trainingMasks.valueAsNumber}:null;
  const trainingReady=!training||AtlasUrDtgExplore.validConditions(training);
  pane.trainingSettings=trainingReady?training:null;
  if(training){
   pane.trainingSkill.disabled=pane.trainingMasks.disabled=blocked;
   pane.trainingMasks.setAttribute('aria-invalid',String(!trainingReady));
  }
  const journeyHard=pane.journeyDeadline?{
   deadlineSeconds:pane.journeyDeadline.valueAsNumber,blessingCount:pane.journeyBlessings.valueAsNumber,
  }:null;
  const journeyReady=!journeyHard||Number.isSafeInteger(journeyHard.deadlineSeconds)&&journeyHard.deadlineSeconds>0&&
   Number.isSafeInteger(journeyHard.blessingCount)&&journeyHard.blessingCount>=0;
  pane.journeySettings=journeyReady?journeyHard:null;
  if(pane.journeyDeadline)for(const field of [pane.journeyDeadline,pane.journeyBlessings])field.disabled=blocked;
  const checked=fields=>fields.filter(field=>field.checked).map(field=>Number(field.value));
  const asura=pane.asura?{level:pane.asuraLevel.valueAsNumber,skills:checked(pane.asuraSkills),specialKeys:checked(pane.asuraKeys),
   ...(pane.asura.final?{enrage:pane.asuraEnrage.checked,activeTowers:checked(pane.asuraTowers),bossHp:pane.asuraHp.value.trim()||null}:{})}:null;
  const asuraReady=!asura||asuraBoss.validSettings(asura,pane.asura);
  pane.asuraSettings=asuraReady?asura:null;
  if(asura){
   pane.asuraFields.disabled=blocked;
   pane.asuraHint.textContent=`灵神体槽位 ${asuraBoss.usedSlots(asura.skills)} / ${asuraBoss.slotCount(asura.level)}`;
  }
  const yinYangSettings=pane.yinYangDrums?{remainingDrums:pane.yinYangDrums.valueAsNumber,buffIds:pane.yinYangBuffIds}:null;
  const yinYangReady=!yinYangSettings||yinYang.validSettings(yinYangSettings);
  pane.yinYangSettings=yinYangReady?yinYangSettings:null;
  if(pane.yinYangDrums){
   for(const field of [pane.yinYangDrums,pane.yinYangBuffChoice,...pane.yinYangBuffList.querySelectorAll('button')])field.disabled=blocked;
   pane.addYinYangBuff.disabled=blocked||!pane.yinYangBuffChoice.value;
   pane.yinYangDrums.setAttribute('aria-invalid',String(!yinYangReady));
   pane.yinYangDeadline.textContent=yinYangReady?`原版时限 ${yinYang.deadlineSeconds(yinYangSettings)} 秒`:
    `剩余烽鼓应为 0 至 ${yinYang.maxDrums} 的整数。`;
  }
  const towerSettings=pane.tower?{
   blessings:pane.towerChoices.flatMap((choice,i)=>choice.value?[[Number(choice.value),pane.towerLevels[i].valueAsNumber]]:[]),
   factions:pane.towerFactions.filter(input=>input.checked).map(input=>Number(input.value)),
   ...(pane.towerContinue?.checked?{enemyHp:pane.towerHp.map(input=>input.valueAsNumber)}:{}),
  }:null;
  const towerReady=!towerSettings||ghostKingTower.validSettings(towerSettings,pane.tower.kind);
  pane.towerSettings=towerReady?towerSettings:null;
  if(pane.tower){
   const nextChoice=pane.towerChoices.find(choice=>!choice.value);
   for(const [i,choice] of pane.towerChoices.entries()){
    pane.towerBlessingRows[i].hidden=!choice.value&&choice!==nextChoice;
    choice.disabled=blocked;
    choice.setAttribute('aria-invalid',String(!!choice.value&&pane.towerChoices.some(other=>other!==choice&&other.value===choice.value)));
    pane.towerLevels[i].disabled=blocked||!choice.value;
    pane.towerLevels[i].setAttribute('aria-invalid',String(!!choice.value&&!pane.towerLevels[i].validity.valid));
   }
   for(const field of pane.towerFactions)field.disabled=blocked;
   if(pane.towerContinue){
    pane.towerContinue.disabled=blocked;
    pane.towerHpPanel.hidden=!pane.towerContinue.checked;
    for(const field of pane.towerHp){
     field.disabled=blocked||!pane.towerContinue.checked;
     field.setAttribute('aria-invalid',String(pane.towerContinue.checked&&!field.validity.valid));
    }
   }
   pane.towerHint.textContent=towerReady?'':towerSettings.blessings.some(([id],i,rows)=>rows.findIndex(([other])=>id===other)!==i)?
    '每种祝福只能启用一次。':pane.towerLevels.some(input=>!input.disabled&&!input.validity.valid)?
     '祝福等级应为 1 至 11 的整数。':'续战需填写六个敌位的有效生命值，至少一位仍存活。';
   for(const button of pane.results.querySelectorAll('[data-tower-carry]'))button.disabled=blocked;
  }
  const laolaoSettings=pane.laolaoFaith?{faith:pane.laolaoFaith.valueAsNumber,
   factions:pane.laolaoFactions.filter(input=>input.checked).map(input=>Number(input.value))}:null;
  const laolaoReady=!laolaoSettings||laolao.validSettings(laolaoSettings);
  pane.laolaoSettings=laolaoReady?laolaoSettings:null;
  if(pane.laolaoFaith){
   for(const field of [pane.laolaoFaith,...pane.laolaoFactions])field.disabled=blocked;
   pane.laolaoFaith.setAttribute('aria-invalid',String(!laolaoReady));
   const effects=laolaoReady&&pane.laolao.faith.filter(row=>row.level>0&&row.level<=laolaoSettings.faith);
   pane.laolaoHint.textContent=!laolaoReady?'请输入大于或等于 0 的整数。':
    effects.length?effects.map(row=>row.dsc).join(' · '):'达到 10 层会解锁首个额外加成。';
  }
  const fusionSettings=pane.fusionWindow?{...laolaoSettings,group:Number(pane.fusionGroup.value),
   windowSeconds:pane.fusionWindow.valueAsNumber,sharedHpPercent:pane.fusionHp.map(input=>input.valueAsNumber)}:null;
  const fusionReady=!fusionSettings||fusion.validSettings(fusionSettings);
  pane.fusionSettings=fusionReady?fusionSettings:null;
  if(pane.fusionWindow){
   for(const field of [pane.fusionGroup,pane.fusionWindow,...pane.fusionHp]){
    field.disabled=blocked;
    field.setAttribute('aria-invalid',String(!field.validity.valid));
   }
   const total=fusionSettings.sharedHpPercent.reduce((sum,value)=>sum+value,0)/4;
   pane.fusionHint.textContent=!laolaoReady?'请核对信仰之佑层数。':!fusionReady?
    '请核对计分时长和共享生命。总余血高于 25% 时，集结目标必须仍存活。':
    `开场总余血 ${total.toLocaleString('zh-CN',{maximumFractionDigits:3})}% · 从${total<=25?'合魂':'单首领'}阶段开始`;
  }
  const duskSettings=pane.duskWindow?{windowSeconds:pane.duskWindow.valueAsNumber,
   musicOrder:pane.duskMusic.value.trim().split(/[\s,，、]+/u).map(Number)}:null;
  const duskReady=!duskSettings||dusk.validSettings(duskSettings);
  pane.duskSettings=duskReady?duskSettings:null;
  if(pane.duskWindow){
   pane.duskWindow.disabled=pane.duskMusic.disabled=blocked;
   pane.duskWindow.setAttribute('aria-invalid',String(!pane.duskWindow.validity.valid));
   pane.duskMusic.setAttribute('aria-invalid',String(!dusk.validSettings({...duskSettings,windowSeconds:1})));
  }
  const songWindow=pane.songWindow?.valueAsNumber;
  const songReady=!pane.songWindow||pane.songWindow.validity.valid;
  pane.songWindowSeconds=songReady?songWindow:undefined;
  if(pane.songWindow){
   pane.songWindow.disabled=blocked;
   pane.songWindow.setAttribute('aria-invalid',String(!songReady));
  }
  const mirageSettings=pane.mirageWindow?{windowSeconds:pane.mirageWindow.valueAsNumber,
   generalSeconds:pane.mirageGeneral.valueAsNumber,truePositions:pane.miragePositions.map(input=>Number(input.value)),
   ...(pane.mirageWeekly?{weeklySeconds:pane.mirageWeekly.valueAsNumber,trait:Number(pane.mirageTrait.value)}:{})}:null;
  const mirageSource=pane.mirageWeekly?mirageX:mirage;
  const mirageReady=!mirageSettings||mirageSource.validSettings(mirageSettings);
  pane.mirageSettings=mirageReady?mirageSettings:null;
  if(mirageSettings){
   const repeated=new Set(mirageSettings.truePositions).size!==2;
   for(const input of [pane.mirageWindow,pane.mirageGeneral,...pane.miragePositions,pane.mirageWeekly,pane.mirageTrait].filter(Boolean)){
    input.disabled=blocked;
    input.setAttribute('aria-invalid',String(!input.validity.valid||repeated&&pane.miragePositions.includes(input)));
   }
  }
  const catfishSettings=pane.catfishWindow?{windowSeconds:pane.catfishWindow.valueAsNumber,armorStacks:pane.catfishArmor.valueAsNumber,
   otherPlayers:pane.catfishPlayers.valueAsNumber,otherBreaks:pane.catfishBreaks.valueAsNumber,
   ...(pane.catfishWeekly?{weeklySeconds:pane.catfishWeekly.valueAsNumber,trait:Number(pane.catfishTrait.value)}:{})}:null;
  const catfishSource=pane.catfishWeekly?catfishX:catfish;
  const catfishReady=!catfishSettings||catfishSource.validSettings(catfishSettings);
  pane.catfishSettings=catfishReady?catfishSettings:null;
  if(catfishSettings){
   for(const input of [pane.catfishWindow,pane.catfishArmor,pane.catfishPlayers,pane.catfishBreaks,pane.catfishWeekly,pane.catfishTrait].filter(Boolean)){
    input.disabled=blocked;
    input.setAttribute('aria-invalid',String(!input.validity.valid||input===pane.catfishBreaks&&
      catfishSettings.otherBreaks>catfishSettings.otherPlayers));
   }
  }
  const skeletonSettings=pane.skeletonWindow?{windowSeconds:pane.skeletonWindow.valueAsNumber,
   truePositions:pane.skeletonPositions.map(input=>Number(input.value))}:null;
  const skeletonXSettings=pane.skeletonWeekly?{...skeletonSettings,weeklySeconds:pane.skeletonWeekly.valueAsNumber,
   trait:Number(pane.skeletonTrait.value),paperTier:Number(pane.skeletonPaper.value)}:null;
  const skeletonReady=skeletonXSettings?skeletonX.validSettings(skeletonXSettings):
   !skeletonSettings||skeleton.validSettings(skeletonSettings);
  pane.skeletonSettings=skeletonReady&&!skeletonXSettings?skeletonSettings:null;
  pane.skeletonXSettings=skeletonReady?skeletonXSettings:null;
  if(skeletonSettings){
   const repeated=new Set(skeletonSettings.truePositions).size!==2;
   for(const input of [pane.skeletonWindow,...pane.skeletonPositions,pane.skeletonWeekly,pane.skeletonTrait,pane.skeletonPaper].filter(Boolean)){
    input.disabled=blocked;
    input.setAttribute('aria-invalid',String(!input.validity.valid||repeated&&pane.skeletonPositions.includes(input)));
   }
  }
  const longcheSettings=pane.longcheWindow?{windowSeconds:pane.longcheWindow.valueAsNumber,
   repairSeconds:pane.longcheRepair.valueAsNumber,commanderId:Number(pane.longcheCommander.value),
   ...(pane.longcheWeekly?{weeklySeconds:pane.longcheWeekly.valueAsNumber,trait:Number(pane.longcheTrait.value),
    repairOrder:pane.longcheOrder.map(input=>Number(input.value))}:{})}:null;
  const longcheSource=pane.longcheWeekly?longcheX:longche;
  const longcheReady=!longcheSettings||longcheSource.validSettings(longcheSettings);
  pane.longcheSettings=longcheReady?longcheSettings:null;
  if(longcheSettings){
   const repeated=pane.longcheWeekly&&new Set(longcheSettings.repairOrder).size!==longcheX.repairSlots.length;
   for(const input of [pane.longcheWindow,pane.longcheRepair,pane.longcheCommander,pane.longcheWeekly,pane.longcheTrait,...pane.longcheOrder].filter(Boolean)){
    input.disabled=blocked;
    const invalid=!input.validity.valid||Boolean(repeated&&pane.longcheOrder.includes(input));
    input.setAttribute('aria-invalid',String(invalid));
    if(invalid)input.setAttribute('aria-describedby','pve-longche-status');
    else input.removeAttribute('aria-describedby');
   }
  }
  const spiderLiveSettings=pane.spiderLiveTrait?{windowSeconds:pane.spiderLiveWindow.valueAsNumber,
   trait:Number(pane.spiderLiveTrait.value)}:null;
  const spiderNormalSettings=pane.spiderNormalWeakPart?{windowSeconds:pane.spiderLiveWindow.valueAsNumber,
   weakPart:Number(pane.spiderNormalWeakPart.value)}:null;
  const spiderLiveReady=(!spiderLiveSettings||spiderLive.validSettings(spiderLiveSettings))&&
   (!spiderNormalSettings||spiderNormal.validSettings(spiderNormalSettings));
  pane.spiderLiveSettings=spiderLiveReady?spiderLiveSettings:null;
  pane.spiderNormalSettings=spiderLiveReady?spiderNormalSettings:null;
  if(pane.spiderLiveWindow)for(const input of [pane.spiderLiveWindow,pane.spiderLiveTrait??pane.spiderNormalWeakPart]){
   input.disabled=blocked;
   const invalid=!input.validity.valid;
   input.setAttribute('aria-invalid',String(invalid));
   if(invalid)input.setAttribute('aria-describedby','pve-spider-live-status');
   else input.removeAttribute('aria-describedby');
  }
  const lifeCaps=pane.lifeCaps.map(field=>field.valueAsNumber);
  const stateReady=lifeCaps.every(cap=>Number.isFinite(cap)&&cap>=0&&cap<=100);
  const coins=pane.artifactCoins?.valueAsNumber;
  const coinsReady=!pane.artifactCoins||Number.isSafeInteger(coins)&&coins>=0;
  if(pane.guardChoice){
   const selectedGuard=Boolean(pane.guardChoice.value);
   pane.guardChoice.disabled=blocked;
   pane.guardLevel.disabled=blocked||!selectedGuard;
   pane.guardBreakthrough.disabled=blocked||!selectedGuard||Number(pane.guardLevel.value)!==pane.guardMaxLevel;
   if(!selectedGuard||Number(pane.guardLevel.value)!==pane.guardMaxLevel)pane.guardBreakthrough.checked=false;
  }
  for(const field of [...pane.lifeCaps,...pane.marks])field.disabled=blocked;
  if(pane.skillChoice){
   pane.skillChoice.disabled=blocked;
   pane.skillLevel.disabled=blocked;
   pane.addSkill.disabled=blocked||!pane.skillChoice.value||pane.skills.length>=pane.maxRunSkills||
    pane.skills.some(([id])=>id===Number(pane.skillChoice.value));
   for(const button of pane.skillList.querySelectorAll('button'))button.disabled=blocked;
  }
  if(pane.artifactChoice){
   const candidate=readArtifact(pane);
   for(const field of [pane.artifactChoice,pane.artifactAmount,pane.artifactRounds,pane.artifactCoins])field.disabled=blocked;
   pane.addArtifact.disabled=blocked||!candidate||pane.artifacts.length>=pane.maxRunArtifacts||
    pane.artifacts.some(([id])=>id===candidate[0]);
   pane.artifactHint.textContent=pane.artifactChoice.value&&!candidate?
    (pane.artifactRefinement?'核对该秘宝的淬炼等级和施放回合。':'次数须覆盖计划施放次数，回合须为大于或等于 0 的整数。'):'';
   for(const button of pane.artifactList.querySelectorAll('button'))button.disabled=blocked;
  }
  if(pane.trial)pane.trial.disabled=blocked;
  if(pane.eventMoves){
   pane.eventMoves.disabled=blocked;
   pane.eventDifficulty.disabled=blocked;
  }
  pane.capture=capture;
  if(pane.captureItem){
   pane.captureItem.disabled=blocked;
   pane.captureFields.hidden=!capture;
   for(const field of pane.captureCards)field.disabled=blocked||!capture;
  }
  if(pane.reserveActor){
   pane.reserveActor.disabled=blocked||!hasAccount;
   for(const select of pane.reserveMembers)select.disabled=blocked||!hasAccount;
  }
  pane.lineup.disabled=blocked||!available.length;
  pane.start.disabled=!supported||!hasAccount||blocked||!selected.length||!!reserve&&!reserve.ready||!captureReady||!eventReady||!trainingReady||!stateReady||!coinsReady||!journeyReady||!asuraReady||!yinYangReady||!towerReady||!laolaoReady||!fusionReady||!duskReady||!songReady||!mirageReady||!catfishReady||!skeletonReady||!longcheReady||!spiderLiveReady;
  pane.stop.hidden=!running;
  pane.stop.disabled=job?.cancelled===true;
  pane.results.setAttribute('aria-busy',String(running&&!job?.cancelled));
  pane.hint.textContent=running?(job.cancelled?'正在停止复跑…':job.message):
   !supported?(runtime?.reason||(runtime?.available?'本机运行时不支持此版本或战斗模式。':'正在核对本机复跑资料…')):
   !hasAccount?'先导入并选择库存账号。':
   blocked?'已有原版复跑或正在停止，请等待其结束。':
   selected.length&&reserve&&!reserve.ready?reserve.hint:
   !captureReady?'请选择三个不同的出战式神位置。':
   !eventReady?'前行步数应为大于或等于 0 的整数。':
   !trainingReady?`天狗面具须为 0 至 ${AtlasUrDtgExplore.maxMasks} 的整数。`:
   !journeyReady?'请填写正整数战斗时限和非负整数祝福层数。':
   !asuraReady?'请核对灵神体等级、技能占用槽位和首领入场生命。':
   !towerReady?'请核对百妖退治的挑战条件。':
   !laolaoReady?'请核对信仰之佑层数。':
   !fusionReady?'请核对合魂共享生命和计分时长。':
   !duskReady?'时长须为 1 至 1200 秒，乐律顺序须包含 2 至 6 号位且各出现一次。':
   !songReady?`计分时长须为 1 至 ${song.windowLimit} 秒的整数。`:
   !mirageReady?(pane.mirageWeekly?'请检查计分时长、入场秒数、区服均时和突变，并选两个不同的真镜像位置。':
    '请填写有效的计分时长和入场秒数，并选两个不同的真镜像位置。'):
   !catfishReady?(pane.catfishWeekly?'请核对时长、皮糙肉厚层数、均时、突变效果和鸟居人数。':
    '请核对时长、减伤层数和人数，其他队伍的击破人数不可超过参战人数。'):
   !skeletonReady?(pane.skeletonWeekly?'请选择两个不同的真部下位置，并检查时长、均时、突变效果和纸人档位。':
    '请选择两个不同的真部下位置，并填写有效的模拟时长。'):
   !longcheReady?(pane.longcheWeekly?'请检查计分时长、修理时限、区服均时和四只修理呱的站位，每只呱只能选一次。':
    `计分时长须为 1 至 ${longche.windowLimit} 秒，修理时限须为 1 至 ${longche.repairLimit} 秒，均填写整数。`):
   !spiderLiveReady?`计分时长须为 1 至 ${spiderLive.windowLimit} 秒的整数${pane.spiderLiveTrait?'，并选择一项突变词条':''}。`:
   !stateReady?'生命上限应在 0% 至 100% 之间。':
   !coinsReady?'万相铃应为大于或等于 0 的整数。':
   job?.notice?job.notice:
   selected.length?`已选 ${selected.length} 套已知阵容，将使用当前账号库存${isWaveMode(pane.battleMode)?'按勾选顺序接力':'复跑'}。`:
   available.length?'从下拉列表选择，或先在阵容库勾选对应阵容。':'阵容库暂无可用于此副本的完整阵容。请先解析或手动制作阵容码。';
 }

 function refreshRuntime(){
  if(runtime?.available||runtimePending)return;
  runtimePending=api.pveStatus().then(status=>{runtime=status;},
   ()=>{runtime={available:false,reason:'本机 PvE 复跑组件不可用'};}).finally(()=>{runtimePending=null;update();});
 }

 function cancel(clear=false){
  if(job?.running&&!job.cancelled){
   job.restoreFocus ||= document.activeElement===job.pane.stop;
   job.cancelled=true;
   job.stopWorker?.();
   if(job.native&&!stopping)stopping=api.stopPve().catch(()=>{}).finally(()=>{
    stopping=null;update();if(DATA)renderDungeonSelection();
   });
  }
  if(clear){
   job=null;
   pane?.results.replaceChildren();
  }
  update();
 }

 function mount(target,config){
  const mirageSource=config.mirageX?mirageX:mirage;
  const catfishSource=config.catfishX?catfishX:catfish;
  const skeletonSource=config.skeletonX?skeletonX:skeleton;
  const longcheSource=config.longcheX?longcheX:longche;
  if(!api?.pveStatus)return;
  cancel(true);
  const section=document.createElement('section');
  section.className='encounter-source';
  section.innerHTML=`<h4>模拟已知阵容</h4>
   <p class="caption">${esc(config.label||'通用 PvE 模式 3')} · ${config.memberCount} 位式神 · ${seeds.length} 个采样种子${config.scoreWindowSeconds?
    ` · ${config.retreat||config.qilingWindow||config.creviceWindow||config.ghostSettings||config.historicalGhostWindow?'自定':'原版'}计分窗口 ${Number(config.scoreWindowSeconds).toLocaleString('zh-CN')} 秒`:''}</p>
   <p class="caption"${config.longche?' id="pve-longche-status"':config.spiderLive||config.spiderNormal?' id="pve-spider-live-status"':
    config.skeleton?' id="pve-skeleton-status"':config.catfish?' id="pve-catfish-status"':config.mirage?' id="pve-mirage-status"':''} data-pve-status role="status"></p>
   <div class="actions">
    <label class="pve-lineup-field">已知阵容 <select data-pve-lineup></select></label>
    ${config.trialEligible?`<label class="pve-lineup-field">试炼式神位置 <select data-pve-trial>
    <option value="">自动识别唯一可选式神</option>
    ${Array.from({length:config.memberCount},(_,i)=>`<option value="${i+1}">阵容中第 ${i+1} 位式神</option>`).join('')}
    </select></label>`:''}
    <button class="secondary" type="button"${config.longche?' aria-describedby="pve-longche-status"':
    config.spiderLive||config.spiderNormal?' aria-describedby="pve-spider-live-status"':
    config.skeleton?' aria-describedby="pve-skeleton-status"':config.catfish?' aria-describedby="pve-catfish-status"':
    config.mirage?' aria-describedby="pve-mirage-status"':''} data-pve-start>开始离线模拟</button>
    <button class="secondary" type="button" data-pve-stop hidden>停止复跑</button>
   </div>
   ${config.journeyHard?`<div class="actions">
    <label class="pve-lineup-field">祝福层数 <input data-pve-journey-blessings type="number" value="0" min="0" step="1" required></label>
    <label class="pve-lineup-field">战斗时限（秒） <input data-pve-journey-deadline type="number" min="1" step="1" required></label>
   </div>`:''}
   ${config.urdtgTraining?`<fieldset class="pve-reserve"><legend>赛事训练条件</legend><div class="actions">
    <label class="pve-lineup-field">万风钧落等级 <select data-pve-training-skill>
     <option value="1">1 级</option><option value="2">2 级</option><option value="3">3 级</option>
    </select></label>
    <label class="pve-lineup-field">天狗面具数量 <input data-pve-training-masks type="number"
     min="0" max="${AtlasUrDtgExplore.maxMasks}" value="0" step="1" required></label>
   </div></fieldset>`:''}
   ${config.asura?`<fieldset class="pve-reserve" data-pve-asura-fields><legend>天魔归来战斗条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">灵神体等级 <input data-pve-asura-level type="number" min="0" step="1" value="0" required></label>
     ${config.asura.final?`<label class="pve-lineup-field">首领入场生命 <input data-pve-asura-hp type="text" inputmode="numeric"
      aria-describedby="pve-asura-hp-hint" placeholder="原版满生命"></label>
     <label class="pve-tower-toggle"><input type="checkbox" data-pve-asura-enrage> 狂暴阶段</label>`:''}
    </div>
    ${config.asura.final?`<p id="pve-asura-hp-hint" class="caption">留空使用原版满生命。按要复跑的对局选择仍存活的圣帝幻影。</p>
     <div class="actions">${asuraBoss.entries.filter(row=>!row.final).map(row=>`<label class="pve-tower-toggle">
      <input type="checkbox" data-pve-asura-tower value="${row.index}"> ${esc(row.name)}</label>`).join('')}</div>`:''}
    <details><summary>灵神体技能</summary><div class="actions">
     ${asuraBoss.skills.map(([id,name,cost])=>`<label class="pve-tower-toggle"><input type="checkbox" data-pve-asura-skill value="${id}">
     ${esc(name)} · ${cost} 槽</label>`).join('')}</div></details>
    <p class="caption" data-pve-asura-hint role="status"></p>
    <details><summary>区域式神特攻</summary><div class="actions">
     ${Array.from({length:18},(_,i)=>`<label class="pve-tower-toggle"><input type="checkbox" data-pve-asura-key value="${i+1}">
      ${asuraBoss.sourceGroups[i%6]}之妖 ${Math.floor(i/6)+1}</label>`).join('')}</div></details>
   </fieldset>`:''}
   ${config.yinyangBuffOptions?`<fieldset class="pve-reserve">
    <legend>秘境挑战条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">剩余烽鼓 <input data-pve-yinyang-drums type="number" value="0" min="0"
      max="${yinYang.maxDrums}" step="1" aria-describedby="pve-yinyang-deadline" required></label>
     <label class="pve-lineup-field">强力加成 <select data-pve-yinyang-buff><option value="">选择加成</option>
      ${config.yinyangBuffOptions.map(({id,name,desc})=>`<option value="${id}">${esc(name===desc?name:`${name} · ${desc}`)}</option>`).join('')}
     </select></label>
     <button class="secondary" type="button" data-pve-add-yinyang-buff>添加加成</button>
    </div>
    <p class="caption" id="pve-yinyang-deadline" data-pve-yinyang-deadline role="status"></p>
    <ul data-pve-yinyang-buff-list aria-label="已选强力加成"></ul>
   </fieldset>`:''}
   ${config.tower?`<details class="pve-reserve" data-pve-tower-conditions>
    <summary>设置百妖退治挑战条件</summary>
    <fieldset class="pve-reserve">
     <legend>神谕之时</legend>
     <p class="caption">最多启用 6 种祝福。礼帖额外加 1 级，含礼帖最高 11 级。</p>
     ${Array.from({length:6},(_,i)=>`<div class="actions pve-tower-blessing" data-pve-tower-blessing-row${i?' hidden':''}>
      <label class="pve-lineup-field">第 ${i+1} 种祝福 <select data-pve-tower-choice aria-describedby="pve-tower-hint">
       <option value="">未启用</option>${config.tower.blessings.map(row=>`<option value="${row.id}">${esc(row.name)}</option>`).join('')}
      </select></label>
      <label class="pve-lineup-field">等级
       <input data-pve-tower-level type="number" min="1" max="11" step="1" value="1" aria-label="第 ${i+1} 种祝福等级"
        aria-describedby="pve-tower-hint" required></label>
     </div>`).join('')}
    </fieldset>
    <fieldset class="pve-reserve">
     <legend>鬼宴之宾</legend>
     <div class="actions">${config.tower.factions.map(row=>`<label class="pve-tower-toggle"><input type="checkbox" data-pve-tower-faction value="${row.id}"> ${esc(row.title)}</label>`).join('')}</div>
    </fieldset>
    ${config.tower.kind==='boss'?`<fieldset class="pve-reserve">
     <legend>鬼王来袭余血</legend>
     <label class="pve-tower-toggle"><input data-pve-tower-continue type="checkbox" aria-describedby="pve-tower-hint"> 按上次战斗余血继续</label>
     <div data-pve-tower-hp-panel hidden><p class="caption">已击败的敌位填 0。</p>
      <div class="pve-tower-hp-fields">${Array.from({length:6},(_,i)=>`<label class="pve-lineup-field">敌方 ${i+1} 号位剩余生命
       <input data-pve-tower-hp type="number" min="0" max="${Number.MAX_SAFE_INTEGER}" step="any" aria-describedby="pve-tower-hint" required>
      </label>`).join('')}</div>
     </div>
    </fieldset>`:''}
    <p class="caption" id="pve-tower-hint" data-pve-tower-hint role="status"></p>
   </details>`:''}
   ${config.spiderLive||config.spiderNormal?`<fieldset class="pve-reserve"><legend>土蜘蛛模拟条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">本地计分时长（秒）
      <input data-pve-spider-live-window type="number" min="1" max="${spiderLive.windowLimit}" step="1" value="${spiderLive.windowLimit}" required>
     </label>
     ${config.spiderLive?`<label class="pve-lineup-field">当局突变词条
      <select data-pve-spider-live-trait required>${spiderLive.traits.map(({id,label})=>
       `<option value="${id}" ${id===spiderLive.defaultTrait?'selected':''}>${label}</option>`).join('')}</select>
     </label>`:`<label class="pve-lineup-field">触发召唤的弱点
      <select data-pve-spider-normal-weak required><option value="0">按模拟种子选取</option>
       ${spiderNormal.parts.slice(1).map(([pos,,label])=>`<option value="${pos}">${label}</option>`).join('')}
      </select>
     </label>`}
    </div>
   </fieldset>`:''}
   ${config.longche?`<fieldset class="pve-reserve"><legend>${config.longcheX?'极·':''}胧车模拟条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">本地计分时长（秒）
      <input data-pve-longche-window type="number" min="1" max="${longche.windowLimit}" step="1" value="${longche.defaultWindow}" required>
     </label>
     <label class="pve-lineup-field">本地修理时限（秒）
      <input data-pve-longche-repair type="number" min="1" max="${longche.repairLimit}" step="1" value="${longche.defaultRepairSeconds}" required>
     </label>
     <label class="pve-lineup-field">升空阶段的统帅
      <select data-pve-longche-commander required>${Object.entries(longcheSource.commanders).map(([id,name])=>
       `<option value="${id}" ${Number(id)===longcheSource.defaultCommander?'selected':''}>${name}</option>`).join('')}</select>
     </label>
     ${config.longcheX?`<label class="pve-lineup-field">本场突变效果
      <select data-pve-longche-trait required>${longcheX.traits.map(({id,label})=>
       `<option value="${id}" ${id===longcheX.defaultTrait?'selected':''}>${label}</option>`).join('')}</select>
     </label>
     <label class="pve-lineup-field">区服上周平均用时（秒）
      <input data-pve-longche-weekly type="number" min="1" max="${longcheX.weeklyLimit}" step="1" value="${longcheX.weeklyDefault}" required>
     </label>`:''}
    </div>
    ${config.longcheX?`<details><summary>设置四只修理呱的站位</summary><div class="actions">
     ${longcheX.repairSlots.map((pos,index)=>`<label class="pve-lineup-field">${pos} 号位
      <select data-pve-longche-order required>${Object.entries(longcheX.repairNames).map(([id,name])=>
       `<option value="${id}" ${Number(id)===longcheX.defaultRepairOrder[index]?'selected':''}>${name}</option>`).join('')}</select>
     </label>`).join('')}
     </div><p class="caption">击败红蓝各一只时，各自同色的另一只须保持超过 30% 生命。</p></details>`:''}
   </fieldset>`:''}
   ${config.skeleton?`<fieldset class="pve-reserve"><legend>${config.skeletonX?'极·':''}荒骷髅模拟条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">本地计分时长（秒）
      <input data-pve-skeleton-window type="number" min="1" max="${skeletonSource.windowLimit}" step="1" value="${skeletonSource.defaultWindow}" required>
     </label>
     ${skeleton.defaultTruePositions.map((selected,i)=>`<label class="pve-lineup-field">真部下 ${i+1} 的位置
      <select data-pve-skeleton-position>${skeleton.positions.map(position=>`<option value="${position}" ${position===selected?'selected':''}>${position} 号位</option>`).join('')}</select>
     </label>`).join('')}
     ${config.skeletonX?`<label class="pve-lineup-field">本场突变效果
      <select data-pve-skeleton-trait required>${skeletonX.traits.map(({id,label})=>
       `<option value="${id}" ${id===skeletonX.defaultTrait?'selected':''}>${label}</option>`).join('')}</select>
     </label>
     <label class="pve-lineup-field">区服上周平均用时（秒）
      <input data-pve-skeleton-weekly type="number" min="1" max="${skeletonX.weeklyLimit}" step="1" value="${skeletonX.weeklyDefault}" required>
     </label>
     <label class="pve-lineup-field">纸人档位
      <select data-pve-skeleton-paper required>${skeletonX.paperFormations.map((units,index)=>
       `<option value="${index+1}">${index+1} 档（${units.length} 位）</option>`).join('')}</select>
     </label>`:''}
    </div>
   </fieldset>`:''}
   ${config.catfish?`<fieldset class="pve-reserve"><legend>${config.catfishX?'极·':''}地震鲶模拟条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">本地计分时长（秒）
      <input data-pve-catfish-window type="number" min="1" max="${catfishSource.windowLimit}" step="1" value="${catfishSource.defaultWindow}" required>
     </label>
     <label class="pve-lineup-field">${config.catfishX?'开场皮糙肉厚层数':'开场减伤层数'}
      <input data-pve-catfish-armor type="number" min="0" max="${catfishSource.maxArmorStacks}" step="1" value="${config.catfishX?catfishSource.maxArmorStacks:0}" required>
     </label>
     ${config.catfishX?`<label class="pve-lineup-field">本场突变效果
      <select data-pve-catfish-trait required>${catfishX.traits.map(({id,label})=>
       `<option value="${id}" ${id===catfishX.defaultTrait?'selected':''}>${label}</option>`).join('')}</select>
     </label>
     <label class="pve-lineup-field">区服上周平均用时（秒）
      <input data-pve-catfish-weekly type="number" min="1" max="${catfishX.weeklyLimit}" step="1" value="${catfishX.weeklyDefault}" required>
     </label>`:''}
    </div>
    <details><summary>设置其他参战者的鸟居结果</summary>
     <div class="actions">
      <label class="pve-lineup-field">其他参战人数
       <input data-pve-catfish-players type="number" min="0" max="${catfish.maxOtherPlayers}" step="1" value="0" required>
      </label>
      <label class="pve-lineup-field">其中击破鸟居的人数
       <input data-pve-catfish-breaks type="number" min="0" max="${catfish.maxOtherPlayers}" step="1" value="0" required>
      </label>
     </div>
     <p class="caption">本队按一位参战者计入。总击破比例达到 80% 时，地震鲶冲天失败。</p>
    </details>
   </fieldset>`:''}
   ${config.mirage?`<fieldset class="pve-reserve"><legend>${config.mirageX?'极·':''}蜃气楼模拟条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">本地计分时长（秒）
      <input data-pve-mirage-window type="number" min="1" max="${mirageSource.windowLimit}" step="1" value="${mirageSource.defaultWindow}" required>
     </label>
     <label class="pve-lineup-field">大将入场（每轮第几秒）
      <input data-pve-mirage-general type="number" min="0" max="${mirage.maxGeneralSeconds}" step="1" value="${mirage.defaultGeneralSeconds}" required>
     </label>
     ${mirage.defaultTruePositions.map((initial,index)=>`<label class="pve-lineup-field">第 ${index+1} 个真镜像
      <select data-pve-mirage-position>${mirage.positions.map(position=>
       `<option value="${position}" ${position===initial?'selected':''}>${position} 号位</option>`).join('')}</select>
     </label>`).join('')}
     ${config.mirageX?`<label class="pve-lineup-field">本场突变效果
      <select data-pve-mirage-trait required>${mirageX.traits.map(({id,label})=>
       `<option value="${id}" ${id===mirageX.defaultTrait?'selected':''}>${label}</option>`).join('')}</select>
     </label>
     <label class="pve-lineup-field">区服上周平均用时（秒）
      <input data-pve-mirage-weekly type="number" min="1" max="${mirageX.weeklyLimit}" step="1" value="${mirageX.weeklyDefault}" required>
     </label>`:''}
    </div>
   </fieldset>`:''}
   ${config.songstress?`<label class="pve-lineup-field">本地计分时长（秒）
    <input data-pve-song-window type="number" min="1" max="${song.windowLimit}" step="1" value="${song.defaultWindow}" required>
   </label>`:''}
   ${config.duskWraith?`<fieldset class="pve-reserve"><legend>夜荒魂模拟条件</legend>
    <div class="actions">
     <label class="pve-lineup-field">计分时长（秒）
      <input data-pve-dusk-window type="number" min="1" max="${dusk.windowLimit}" step="1" value="${dusk.defaultWindow}" required>
     </label>
     <label class="pve-lineup-field">侍从乐律顺序
      <input data-pve-dusk-music type="text" value="${dusk.elitePositions.join(' ')}" aria-describedby="pve-dusk-music-hint" required>
     </label>
    </div>
    <p class="caption" id="pve-dusk-music-hint">填写 2 至 6 号位的顺序，用空格分隔。默认顺序用于离线复现。</p>
   </fieldset>`:''}
   ${config.laolao?`<fieldset class="pve-reserve">
    <legend>${config.laolaoFusion?'姥姥火·合魂挑战条件':'姥姥火挑战条件'}</legend>
    ${config.laolaoFusion?`<div class="actions">
     <label class="pve-lineup-field">集结目标 <select data-pve-fusion-group aria-describedby="pve-fusion-hint">
      ${fusion.bosses.map((id,i)=>`<option value="${fusion.groupBosses.indexOf(id)+1}">${fusion.bossNames[i]}</option>`).join('')}
     </select></label>
     <label class="pve-lineup-field">计分时长（秒）
      <input data-pve-fusion-window type="number" min="1" max="${fusion.deadlineSeconds}" step="1" value="${fusion.deadlineSeconds}"
       aria-describedby="pve-fusion-hint" required></label>
    </div>
    <fieldset class="pve-reserve"><legend>开场共享生命</legend>
     <div class="pve-tower-hp-fields">${fusion.bossNames.map(name=>`<label class="pve-lineup-field">${name}（%）
      <input data-pve-fusion-hp type="number" value="100" min="0" max="100" step="any" aria-describedby="pve-fusion-hint" required>
     </label>`).join('')}</div>
     <p class="caption" id="pve-fusion-hint" data-pve-fusion-hint role="status"></p>
    </fieldset>`:''}
    <label class="pve-lineup-field">信仰之佑层数
     <input data-pve-laolao-faith type="number" value="0" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1"
      aria-describedby="pve-laolao-hint" required>
    </label>
    <p id="pve-laolao-hint" class="caption" data-pve-laolao-hint role="status"></p>
    <fieldset class="pve-reserve">
     <legend>已解锁的鬼宴之宾阵营</legend>
     <div class="actions">${config.laolao.factions.map(row=>`<label class="pve-tower-toggle">
      <input data-pve-laolao-faction type="checkbox" value="${row.id}"> ${esc(row.title)}</label>`).join('')}</div>
    </fieldset>
   </fieldset>`:''}
   ${config.shilianEventId?`<div class="actions">
    <label class="pve-lineup-field">难度档位 <select data-pve-event-difficulty>
    ${[1,2,3].map(value=>`<option value="${value}">${value}</option>`).join('')}
    </select></label>
    <label class="pve-lineup-field">前行步数 <input data-pve-event-moves type="number" min="0" step="1" value="0" required></label>
   </div>`:''}
   ${config.trialEligible?`<details class="pve-reserve">
    <summary>设置途中状态</summary>
    <p class="caption">按阵容中的式神顺序填写生命上限。0% 表示已阵亡。专属印记须由对应式神装备。</p>
    ${Array.from({length:config.memberCount},(_,index)=>`<div class="actions">
     <label class="pve-lineup-field">第 ${index+1} 位生命上限（%）
      <input data-pve-life-cap type="number" min="0" max="100" step="any" value="100" required></label>
     <label class="pve-lineup-field">第 ${index+1} 位印记 <select data-pve-yinji><option value="0">未装备</option>
      ${config.markOptions.map(({id,name,level,source,owner})=>`<option value="${esc(id)}" title="${esc(source)}">${esc(name)} · ${esc(level)} 级${owner?' · '+esc(owner)+'专属':''}</option>`).join('')}
     </select></label>
    </div>`).join('')}
    ${config.guardOptions?.length?`<fieldset class="pve-reserve pve-run-skills">
     <legend>助战守护</legend>
     <div class="actions">
      <label class="pve-lineup-field">守护 <select data-pve-guard-choice><option value="">未出战</option>
       ${config.guardOptions.map(({id,name})=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}
      </select></label>
      <label class="pve-lineup-field">等级 <select data-pve-guard-level>
       ${Array.from({length:config.guardMaxLevel},(_,index)=>`<option value="${index+1}">${index+1} 级</option>`).join('')}
      </select></label>
      <label><input data-pve-guard-breakthrough type="checkbox"> 已突破（满级）</label>
     </div>
    </fieldset>`:''}
    ${config.skillOptions?.length?`<fieldset class="pve-reserve pve-run-skills">
     <legend>途中技能</legend>
     <p class="caption">按游戏当局填写，最多 ${config.maxRunSkills} 个。</p>
     <div class="actions">
      <label class="pve-lineup-field">技能 <select data-pve-skill-choice><option value="">选择技能</option>
       ${config.skillOptions.map(({id,name,description})=>`<option value="${esc(id)}" title="${esc(description)}">${esc(name)}</option>`).join('')}
      </select></label>
      <label class="pve-lineup-field">等级 <select data-pve-skill-level>
       ${[1,2,3,4,5].map(level=>`<option value="${level}">${level} 级</option>`).join('')}
      </select></label>
      <button class="secondary" type="button" data-pve-add-skill>添加技能</button>
     </div>
     <ul data-pve-skill-list></ul>
    </fieldset>`:''}
    ${config.artifactOptions?.length?`<fieldset class="pve-reserve pve-run-skills">
     <legend>秘宝</legend>
     <p class="caption">最多 ${config.maxRunArtifacts} 种。回合 0 为开场，多个回合用逗号隔开，留空时只携带秘宝。</p>
     <div class="actions">
      <label class="pve-lineup-field">秘宝 <select data-pve-artifact-choice><option value="">选择秘宝</option>
       ${config.artifactOptions.map(({id,name,description})=>`<option value="${esc(id)}" title="${esc(description)}">${esc(name)}</option>`).join('')}
      </select></label>
      <label class="pve-lineup-field">${config.artifactRefinement?'淬炼等级':'可用次数'}
       <input data-pve-artifact-amount type="number" value="1" min="1" step="1" required></label>
      <label class="pve-lineup-field">最早施放回合 <input data-pve-artifact-rounds type="text" placeholder="0，6"></label>
      <button class="secondary" type="button" data-pve-add-artifact>添加秘宝</button>
      <label class="pve-lineup-field">万相铃 <input data-pve-artifact-coins type="number" value="0" min="0" step="1" required></label>
     </div>
     <p class="caption" data-pve-artifact-hint role="status"></p>
     <ul data-pve-artifact-list></ul>
    </fieldset>`:''}
   </details>`:''}
   ${config.battleMode===AtlasTrueOrochi.battleMode?`<fieldset class="pve-reserve">
    <legend>备选阵容</legend>
    <p class="caption">备选式神沿用当前御魂。原版引擎按可用阵容继续挑战下一层。</p>
    <label class="pve-lineup-field">备选阴阳师 <select data-pve-reserve-actor></select></label>
    ${Array.from({length:4},(_,i)=>`<label class="pve-lineup-field">备选式神 ${i+1} <select data-pve-reserve-member></select></label>`).join('')}
   </fieldset>`:''}
   ${config.captureItems?`<fieldset class="pve-reserve">
    <legend>收服模拟</legend>
    <label class="pve-lineup-field">式盘 <select data-pve-capture-item><option value="">只挑战至虚弱</option>
    ${Object.entries(config.captureItems).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select></label>
    <div class="pve-capture-fields" data-pve-capture-fields hidden>
    ${[1,2,3].map(slot=>`<label class="pve-lineup-field">结契式神 ${slot}<select data-pve-capture-card>
     ${[1,2,3,4,5].map(index=>`<option value="${index}" ${index===slot?'selected':''}>阵容中第 ${index} 位式神</option>`).join('')}</select></label>`).join('')}
    </div>
   </fieldset>`:''}
   <ol class="dungeon-battle-list" data-pve-results></ol>`;
  const part=name=>section.querySelector(`[data-pve-${name}]`);
  const all=name=>[...section.querySelectorAll(`[data-pve-${name}]`)];
  pane={...config,start:part('start'),lineup:part('lineup'),stop:part('stop'),
   asuraFields:part('asura-fields'),asuraLevel:part('asura-level'),asuraHp:part('asura-hp'),asuraEnrage:part('asura-enrage'),
   asuraSkills:all('asura-skill'),asuraKeys:all('asura-key'),asuraTowers:all('asura-tower'),asuraHint:part('asura-hint'),
   trainingSkill:part('training-skill'),trainingMasks:part('training-masks'),
   journeyDeadline:part('journey-deadline'),journeyBlessings:part('journey-blessings'),
   yinYangDrums:part('yinyang-drums'),yinYangDeadline:part('yinyang-deadline'),yinYangBuffChoice:part('yinyang-buff'),
   addYinYangBuff:part('add-yinyang-buff'),yinYangBuffList:part('yinyang-buff-list'),yinYangBuffIds:[],
   towerConditions:part('tower-conditions'),towerBlessingRows:all('tower-blessing-row'),
   towerChoices:all('tower-choice'),towerLevels:all('tower-level'),towerFactions:all('tower-faction'),
   towerContinue:part('tower-continue'),towerHpPanel:part('tower-hp-panel'),towerHp:all('tower-hp'),towerHint:part('tower-hint'),
   laolaoFaith:part('laolao-faith'),laolaoFactions:all('laolao-faction'),laolaoHint:part('laolao-hint'),
   fusionGroup:part('fusion-group'),fusionWindow:part('fusion-window'),fusionHp:all('fusion-hp'),fusionHint:part('fusion-hint'),
   duskWindow:part('dusk-window'),duskMusic:part('dusk-music'),
   songWindow:part('song-window'),
   mirageWindow:part('mirage-window'),mirageGeneral:part('mirage-general'),miragePositions:all('mirage-position'),
   mirageWeekly:part('mirage-weekly'),mirageTrait:part('mirage-trait'),
   catfishWindow:part('catfish-window'),catfishArmor:part('catfish-armor'),
   catfishPlayers:part('catfish-players'),catfishBreaks:part('catfish-breaks'),
   catfishWeekly:part('catfish-weekly'),catfishTrait:part('catfish-trait'),
   skeletonWindow:part('skeleton-window'),skeletonPositions:all('skeleton-position'),
   skeletonWeekly:part('skeleton-weekly'),skeletonTrait:part('skeleton-trait'),skeletonPaper:part('skeleton-paper'),
   longcheWindow:part('longche-window'),longcheRepair:part('longche-repair'),longcheCommander:part('longche-commander'),
   longcheWeekly:part('longche-weekly'),longcheTrait:part('longche-trait'),longcheOrder:all('longche-order'),
   spiderLiveWindow:part('spider-live-window'),spiderLiveTrait:part('spider-live-trait'),
   spiderNormalWeakPart:part('spider-normal-weak'),
   trial:part('trial'),eventDifficulty:part('event-difficulty'),eventMoves:part('event-moves'),
   lifeCaps:[...section.querySelectorAll('[data-pve-life-cap]')],marks:[...section.querySelectorAll('[data-pve-yinji]')],
   skillChoice:part('skill-choice'),skillLevel:part('skill-level'),addSkill:part('add-skill'),skillList:part('skill-list'),skills:[],
   guardChoice:part('guard-choice'),guardLevel:part('guard-level'),guardBreakthrough:part('guard-breakthrough'),
   artifactChoice:part('artifact-choice'),artifactAmount:part('artifact-amount'),artifactRounds:part('artifact-rounds'),
   artifactCoins:part('artifact-coins'),artifactHint:part('artifact-hint'),addArtifact:part('add-artifact'),artifactList:part('artifact-list'),artifacts:[],
   hint:part('status'),results:part('results'),reserveActor:part('reserve-actor'),reserveMembers:[...section.querySelectorAll('[data-pve-reserve-member]')],
   captureItem:part('capture-item'),captureFields:part('capture-fields'),captureCards:[...section.querySelectorAll('[data-pve-capture-card]')]};
  pane.start.onclick=()=>void run();
  for(const field of [pane.lineup,pane.reserveActor,...pane.reserveMembers,pane.captureItem,...pane.captureCards,pane.trial,pane.trainingSkill,
   pane.eventDifficulty,pane.skillChoice,pane.artifactChoice,pane.guardChoice,pane.guardLevel,pane.guardBreakthrough,pane.yinYangBuffChoice,
   ...pane.towerChoices,...pane.towerFactions,pane.towerContinue,...pane.laolaoFactions,pane.fusionGroup,...pane.miragePositions,pane.mirageTrait,
   pane.catfishTrait,...pane.skeletonPositions,pane.skeletonTrait,pane.skeletonPaper,pane.longcheCommander,pane.longcheTrait,
   ...pane.longcheOrder,pane.spiderLiveTrait,pane.spiderNormalWeakPart].filter(Boolean))field.onchange=()=>{
   if(job&&!busy())job.notice=null;
   update();
  };
  if(pane.asuraFields)pane.asuraFields.oninput=()=>{
   if(job&&!busy())job.notice=null;
   update();
  };
  for(const field of [pane.eventMoves,pane.trainingMasks,pane.journeyDeadline,pane.journeyBlessings,pane.yinYangDrums,...pane.lifeCaps,...pane.marks,
   ...pane.towerLevels,...pane.towerHp,pane.laolaoFaith,pane.fusionWindow,...pane.fusionHp,pane.duskWindow,pane.duskMusic,pane.songWindow,
   pane.mirageWindow,pane.mirageGeneral,pane.mirageWeekly,
   pane.catfishWindow,pane.catfishArmor,pane.catfishPlayers,pane.catfishBreaks,pane.catfishWeekly,
   pane.skeletonWindow,pane.skeletonWeekly,pane.longcheWindow,pane.longcheRepair,pane.longcheWeekly,pane.spiderLiveWindow,
   pane.artifactAmount,pane.artifactRounds,pane.artifactCoins].filter(Boolean))field.oninput=()=>{
   if(job&&!busy())job.notice=null;
   update();
  };
  if(pane.yinYangBuffChoice){
   const renderBuffs=()=>{
    pane.yinYangBuffList.innerHTML=pane.yinYangBuffIds.map((id,index)=>{
     const {name,desc}=pane.yinyangBuffOptions.find(option=>option.id===id);
     return `<li>${esc(name===desc?name:desc)} <button class="secondary" type="button" data-remove-yinyang-buff="${index}"
      aria-label="移除${esc(name)}">移除</button></li>`;
    }).join('');
    if(job&&!busy())job.notice=null;
    update();
   };
   pane.addYinYangBuff.onclick=()=>{
    const id=Number(pane.yinYangBuffChoice.value);
    if(!yinYang.buffIds.includes(id))return;
    pane.yinYangBuffIds.push(id);
    renderBuffs();
   };
   pane.yinYangBuffList.onclick=event=>{
    const button=event.target.closest('[data-remove-yinyang-buff]');
    if(!button||button.disabled)return;
    const index=Number(button.dataset.removeYinyangBuff);
    pane.yinYangBuffIds.splice(index,1);
    renderBuffs();
    (pane.yinYangBuffList.querySelectorAll('button')[index]??pane.yinYangBuffChoice).focus();
   };
  }
  if(pane.skillChoice){
   const renderSkills=()=>{
    pane.skillList.innerHTML=pane.skills.map(([id,level])=>{
     const name=pane.skillOptions.find(option=>option.id===id).name;
     return `<li>${esc(name)} · ${level} 级 <button class="secondary" type="button" data-remove-skill="${id}"
      aria-label="移除${esc(name)}">移除</button></li>`;
    }).join('');
    if(job&&!busy())job.notice=null;
    update();
   };
   pane.addSkill.onclick=()=>{
    pane.skills.push([Number(pane.skillChoice.value),Number(pane.skillLevel.value)]);
    pane.skillChoice.value='';
    renderSkills();
   };
   pane.skillList.onclick=event=>{
    const button=event.target.closest('[data-remove-skill]');
    if(!button)return;
    pane.skills=pane.skills.filter(([id])=>id!==Number(button.dataset.removeSkill));
    renderSkills();
    pane.skillChoice.focus();
   };
  }
  if(pane.artifactChoice){
   const renderArtifacts=()=>{
    pane.artifactList.innerHTML=pane.artifacts.map(([id,amount,rounds])=>{
     const name=pane.artifactOptions.find(option=>option.id===id).name;
     const amountLabel=pane.artifactRefinement?`淬炼 ${amount} 级`:`${amount} 次`;
     return `<li>${esc(name)} · ${amountLabel} · ${rounds.length?'最早 '+rounds.join('、')+' 回合':'仅携带'}
      <button class="secondary" type="button" data-remove-artifact="${id}" aria-label="移除${esc(name)}">移除</button></li>`;
    }).join('');
    if(job&&!busy())job.notice=null;
    update();
   };
   pane.addArtifact.onclick=()=>{
    const selection=readArtifact(pane);
    if(!selection)return;
    pane.artifacts.push(selection);
    pane.artifactChoice.value='';
    pane.artifactRounds.value='';
    renderArtifacts();
   };
   pane.artifactList.onclick=event=>{
    const button=event.target.closest('[data-remove-artifact]');
    if(!button)return;
    pane.artifacts=pane.artifacts.filter(([id])=>id!==Number(button.dataset.removeArtifact));
    renderArtifacts();
    pane.artifactChoice.focus();
   };
  }
  pane.stop.onclick=()=>cancel();
  target.append(section);
  refreshRuntime();
  update();
 }

 function unmount(){
  cancel(true);
  pane=null;
 }

 function mountFixedTrial(target,config){
  if(!api?.pveStatus)return;
  cancel(true);
  const section=document.createElement('section');
  section.className='encounter-source';
  section.innerHTML=`<h4>模拟原版固定阵容</h4>
   <p class="caption">${esc(config.label)}由原版指定出战，限 ${config.turnLimit} 回合清场。</p>
   <p class="caption" data-dream-status role="status"></p>
   <div class="actions">
    <label class="pve-lineup-field">随机种子 <input data-dream-seed type="number" required min="0" max="9999" step="1" value="0"></label>
    <label class="pve-lineup-field">操作方式 <select data-dream-control>
     <option value="auto">自动选择技能</option><option value="basic">模拟手动普攻</option>
    </select></label>
    <button class="secondary" type="button" data-dream-start disabled>开始离线模拟</button>
    <button class="secondary" type="button" data-dream-stop hidden>停止复跑</button>
   </div><ol class="dungeon-battle-list" data-dream-results></ol>`;
  const part=name=>section.querySelector(`[data-dream-${name}]`);
  pane={...config,fixedTrial:true,start:part('start'),stop:part('stop'),status:part('status'),
   seed:part('seed'),control:part('control'),results:part('results')};
  pane.seed.oninput=update;
  pane.stop.onclick=()=>cancel();
  pane.start.onclick=async()=>{
   if(!ready()||runeBusy()||!pane.seed.checkValidity())return;
   const seed=pane.seed.valueAsNumber;
   const plan=pane.control.value==='basic'?{manualBasic:true}:{};
   const run={pane,running:true,native:true,notice:`正在复跑种子 ${seed}…`,rows:[]};
   job=run;
   pane.results.replaceChildren();
   update();
   renderDungeonSelection();
   try{
    const {battleMode,stageId,groupId}=run.pane;
    const report=await api.runPve(plan,{battleMode,stageId,groupId,seed,damageFloor:true});
    if(job!==run||run.cancelled)return;
    const title=report.completed?(report.outcome==='win'?'原版胜利':'原版失败'):'未取得原版结算';
    const row=addRow(run,title);
    row.state.textContent=`种子 ${seed} · ${report.bouts} / ${report.dreamTrial.turnLimit} 回合 · `+
     `引擎全程 ${report.engineSeconds.toFixed(2)} 秒 · 已核对原版敌方编组`;
    if(plan.manualBasic)row.state.textContent+=` · 手动普攻 ${report.dreamTrial.manualAttacks} 次`;
    run.notice='本次复跑结束。';
   }catch(error){if(job===run&&!run.cancelled)run.notice=runeError(error);}
   finally{
    run.running=false;
    if(job===run){
     if(run.cancelled)run.notice='复跑已停止。';
     const restore=run.restoreFocus||document.activeElement===run.pane.stop;
     update();
     if(restore){
      await stopping;
      if(job===run&&!run.pane.start.disabled)run.pane.start.focus();
     }
    }
    renderDungeonSelection();
   }
  };
  target.append(section);
  refreshRuntime();
  update();
 }

 function addRow(run,title){
  const el=document.createElement('li');
  el.innerHTML=`<strong>${esc(title)}</strong><span data-state></span>
   <details hidden><summary>查看采样战报</summary><ul class="dungeon-stock-samples"></ul></details>`;
  const row={el,state:el.querySelector('[data-state]'),details:el.querySelector('details'),
   report:el.querySelector('ul'),samples:[],verdict:'unknown',index:run.rows.length+1};
  if(run.pane.towerContinue)row.report.onclick=event=>{
   const button=event.target.closest('[data-tower-carry]');
   if(!button||runeBusy()||pane!==run.pane)return;
   const battle=row.samples.find(sample=>sample.seed===Number(button.dataset.towerCarry))?.ghostKingTower;
   if(!battle?.enemies.some(unit=>unit.remainingHp>0))return;
   const health=Array(6).fill(0);
   for(const unit of battle.enemies)health[unit.position-1]=unit.remainingHp;
   pane.towerContinue.checked=true;
   pane.towerConditions.open=true;
   pane.towerHp.forEach((field,i)=>{field.value=health[i];});
   run.notice='已填入该场战报的各敌位余血。';
   update();
   pane.towerHpPanel.scrollIntoView({block:'nearest'});
   pane.towerHp[0].focus({preventScroll:true});
  };
  run.rows.push(row);
  run.pane.results.append(el);
  return row;
 }

 async function replay(run,row,plan,trialSlot){
  const {stageId,groupId,battleMode,retreat,region,qilingWindow,creviceWindow,ghostSettings,historicalGhostWindow,
   mapBossPlayers,tianfaTeam,qinfeiBoss,qinfeiFoodPiles,pveDeadlineSeconds,storyRoomId,friendChallenge,dojoArea,forest,tenBonuses,bandScores,devilFeastHp}=run.pane;
  const scoring=isDamageMode(battleMode),relay=isWaveMode(battleMode);
  const orochi=battleMode===AtlasTrueOrochi.battleMode;
  for(const seed of seeds){
   if(!active(run))return;
   run.message=`正在复跑第 ${row.index} 套 · 种子 ${seed}`;
   update();
   let report;
   run.native=true;
   try{report=await api.runPve(plan,{stageId,groupId,seed,damageFloor:true,...(battleMode?{battleMode}:{}),
    ...(retreat?{retreat}:{}),...(region?{region}:{}),...(run.capture?{capture:run.capture}:{}),...(qilingWindow?{qilingWindow}:{}),
    ...(run.journeyHard?{journeyHard:run.journeyHard}:{}),...(creviceWindow?{creviceWindow}:{}),...(ghostSettings?{ghostSettings}:{}),
    ...(run.yinyangBoss?{yinyangBoss:run.yinyangBoss}:{}),
    ...(run.towerSettings?{towerSettings:run.towerSettings}:{}),
    ...(run.laolaoSettings?{laolaoSettings:run.laolaoSettings}:{}),
    ...(run.fusionSettings?{fusionSettings:run.fusionSettings}:{}),
    ...(run.duskSettings?{duskSettings:run.duskSettings}:{}),
    ...(run.songWindowSeconds?{songWindowSeconds:run.songWindowSeconds}:{}),
    ...(run.mirageSettings?{mirageSettings:run.mirageSettings}:{}),
    ...(run.catfishSettings?{catfishSettings:run.catfishSettings}:{}),
    ...(run.skeletonSettings?{skeletonSettings:run.skeletonSettings}:{}),
    ...(run.skeletonXSettings?{skeletonXSettings:run.skeletonXSettings}:{}),
    ...(run.longcheSettings?{longcheSettings:run.longcheSettings}:{}),
    ...(run.spiderLiveSettings?{spiderLiveSettings:run.spiderLiveSettings}:{}),
    ...(run.spiderNormalSettings?{spiderNormalSettings:run.spiderNormalSettings}:{}),
    ...(historicalGhostWindow?{historicalGhostWindow}:{}),
    ...(mapBossPlayers?{mapBossPlayers}:{}),...(tianfaTeam?{tianfaTeam}:{}),
    ...(qinfeiBoss?{qinfeiBoss}:{}),
    ...(qinfeiFoodPiles?{qinfeiFoodPiles}:{}),
    ...(pveDeadlineSeconds?{pveDeadlineSeconds}:{}),
    ...(storyRoomId?{storyRoomId}:{}),
    ...(friendChallenge?{friendChallenge}:{}),
    ...(run.trainingSettings?{urdtgTraining:run.trainingSettings}:{}),
    ...(run.asuraSettings?{asura:run.asuraSettings}:{}),
    ...(dojoArea?{dojoArea}:{}),
    ...(forest?{forest}:{}),
    ...(tenBonuses?.length?{tenBonuses}:{}),
    ...(bandScores?{bandScores}:{}),
    ...(devilFeastHp!==undefined?{devilFeastHp}:{}),
    ...(trialSlot?{trialSlot}:{}),...(run.sixRealmsEvent?{sixRealmsEvent:run.sixRealmsEvent}:{}),
    ...(run.sixRealmsState?{sixRealmsState:run.sixRealmsState}:{})});}
   finally{run.native=false;}
   if(!active(run))return;
   row.samples.push(report);
   row.details.hidden=false;
   if(scoring&&row.samples.length===1&&AtlasRuneCandidate.damageResult([report]))
    showScoreInstructions(row,plan,run.data.gameConfig,run.pane.battleMode);
   row.report.innerHTML=sampleBattleMarkup(row.samples);
   row.state.textContent=`已复跑 ${row.samples.length} / ${seeds.length} 个种子`;
   if(scoring){
    if(AtlasRuneCandidate.damageResult([report]))continue;
    row.state.textContent=`种子 ${seed} 未取得完整伤害战报，可重试`;
    return;
   }
   if(relay){
    if(AtlasRuneCandidate.waveResult([report]))continue;
    row.state.textContent=`种子 ${seed} 未取得完整波次结算，可重试`;
    return;
   }
   if(orochi&&report.completed&&report.trueOrochi&&['win','loss'].includes(report.outcome))continue;
   const experience=report.experience;
   if(report.regionalBoss?.eligible===false){
    row.verdict='infeasible';
    row.state.textContent='原版引擎判定阵容未满足此特殊条件';
    return;
   }
   const ranOut=(experience??report.coins??report.journeyHard??report.ghostKingTower??report.laolaoChallenge)?.timedOut===true;
   if(report.completed&&(report.outcome==='loss'||ranOut)){
    row.verdict='loss';
    row.state.textContent=ranOut?`种子 ${seed} 超时`+(experience?`，击杀 ${experience.kills} / ${experience.requiredKills}`:''):`种子 ${seed} 未通关`;
    return;
   }
   const objectiveMet=AtlasRuneCandidate.pveGoalMet(report,battleMode);
   if(!report.completed||report.outcome!=='win'||!objectiveMet){
    row.state.textContent=`种子 ${seed} 未取得完整通关记录，可重试`;
    return;
   }
  }
  if(orochi){
   const won=row.samples.filter(sample=>sample.outcome==='win'&&AtlasRuneCandidate.pveGoalMet(sample,battleMode)).length;
   if(won<seeds.length){
    row.verdict='loss';
    row.state.textContent=`${won} / ${seeds.length} 场十层通关 · 最少清 ${Math.min(...row.samples.map(sample=>sample.wavesCleared))} 层`;
    return;
   }
  }
  row.verdict=(scoring&&AtlasRuneCandidate.damageResult(row.samples)?.credited!==seeds.length||
   relay&&AtlasRuneCandidate.waveResult(row.samples)?.min!==70)?'scored':'pass';
 }

 async function original(run,lineup){
  const row=addRow(run,lineup.title);
  try{
   row.state.textContent='正在精算库存…';
   run.message=`正在精算第 ${run.rows.length} / ${run.selected.length} 套原码`;
   update();
   const result=await solveInventoryLineup(lineup,run,undefined,run.startingInventory);
   if(!active(run))return;
   if(!result.ready){
    row.verdict=result.proof?.state==='infeasible'?'infeasible':'unknown';
    row.state.textContent=row.verdict==='infeasible'?'库存精算已证明原码约束无解':'库存精算仍有条件待核对';
    return;
   }
   if(run.pane.replacementActor)
    row.details.insertAdjacentHTML('beforeend','<p class="caption">原版在阴阳师位使用关卡指定角色。式神培养、御魂和自动技能按所选阵容复跑。</p>');
   else if(!run.pane.trialEligible)
    row.details.insertAdjacentHTML('beforeend','<p class="caption">阴阳师按原码培养和技能复跑。普攻等级缺失时使用客户端最低等级。</p>');
   const plan=AtlasRuneLineup.selectedTeam(lineup,result,run.account,run.data.gameConfig,run.pveMemberCount,
    {useStageActor:!!run.pane.replacementActor});
   let trialSlot;
   if(run.pane.trialEligible){
    const eligible=plan.members.map(({hero},i)=>run.pane.trialEligible.includes(Number(hero.heroId))?i+1:0).filter(Boolean);
    trialSlot=run.trialSlot||(eligible.length===1?eligible[0]:0);
    if(!eligible.includes(trialSlot)){
     row.verdict='infeasible';
     row.state.textContent=trialSlot?'该位置的式神不属于本路线的试炼名单':'这套阵容有多个试炼式神，请指定位置';
     return;
    }
    if(run.sixRealmsState?.marks.some((id,i)=>id!==0&&!run.pane.markOptions.some(
     mark=>mark.id===id&&(mark.heroId===0||mark.heroId===Number(plan.members[i].hero.heroId))))){
     row.verdict='infeasible';
     row.state.textContent='专属印记与装备位置的式神不匹配';
     return;
    }
    const trialHero=Number(plan.members[trialSlot-1].hero.heroId);
    if(run.sixRealmsState?.skills?.some(([id])=>!run.pane.skillOptions.some(
     skill=>skill.id===id&&(skill.heroId===0||skill.heroId===trialHero)))){
     row.verdict='infeasible';
     row.state.textContent='途中技能与所选试炼式神不匹配';
     return;
    }
   }
   if(run.reserve){
    const profile=AtlasRuneLineup.selectedOnmyoji(run.reserve.actor,run.account,run.data.gameConfig);
    plan.reserveOnmyoji=profile.onmyoji;
    if(profile.spirit)plan.reserveSpirit=profile.spirit;
    plan.reserves=run.reserve.reserves;
   }
   if(run.pane.actorId&&plan.onmyoji.heroId!==run.pane.actorId){
    row.verdict='infeasible';
    row.state.textContent='阵容码的阴阳师与本场指定阴阳师不同';
    return;
   }
   const scoring=isDamageMode(run.pane.battleMode);
   const tactics=scoring&&Number(lineup.gameSceneId)===run.pane.codeStageId&&AtlasRuneCandidate.readScoreInstructions(lineup.notes);
   await replay(run,row,tactics?{...plan,tactics}:plan,trialSlot);
  }catch(error){
   if(active(run))row.state.textContent=runeError(error);
  }
 }

 async function originalRelay(run,lineups){
  const row=addRow(run,lineups.map(lineup=>lineup.title).join(' → '));
  try{
   const pair=AtlasRuneLineup.underworldLineups(lineups);
   row.state.textContent='正在精算各队共享库存…';
   const result=await solveInventoryLineup(pair.combined,run);
   if(!active(run))return;
   if(!result.ready){
    if(result.proof?.state==='infeasible')row.verdict='infeasible';
    row.state.textContent=row.verdict==='infeasible'?'库存精算已证明接力配装无解':'接力配装仍有条件待核对';
    return;
   }
   const plan=AtlasRuneLineup.underworldPlan(pair,result,run.account,run.data.gameConfig);
   row.details.insertAdjacentHTML('beforeend','<p class="caption">阴阳师按原码配置复跑。原版禁用规则按本次提供的阴阳师计算。</p>');
   await replay(run,row,plan);
  }catch(error){
   if(active(run))row.state.textContent=runeError(error);
  }
 }

 const damageText=value=>Math.round(value).toLocaleString('zh-CN');

 function scoreChoices(game,hero){
  return AtlasGame.aiChoices(game,{hero_id:hero.heroId,awake:hero.awake,skills:hero.skinfo});
 }

 function showScoreInstructions(row,plan,game,battleMode){
  const names=plan.members.map(({hero})=>game.heroes[hero.heroId]?.name||`式神 ${hero.heroId}`);
  const {tactics}=plan;
  const instructions=AtlasRuneCandidate.scoreInstructions(tactics,plan,game)
   .replace(/第([1-6])位式神/g,(_,slot)=>`${names[slot-1]}（式神第 ${slot} 位）`);
  const opening=[spiderLive.battleMode,spiderNormal.battleMode].includes(battleMode)?instructions.replace(/首领/g,'钳'):instructions;
  const roster=plan.members.map(({hero,aiSkill},index)=>({hero,aiSkill,name:names[index]}));
  if(plan.onmyoji)roster.unshift({hero:plan.onmyoji,aiSkill:plan.onmyoji.aiSkill,
   name:game.heroes[plan.onmyoji.heroId]?.name||'阴阳师'});
  const skillModes=roster.flatMap(({hero,aiSkill,name})=>{
   if(!aiSkill)return [];
   const choice=scoreChoices(game,hero).find(option=>option.value===aiSkill);
   if(!choice)return [];
   return [choice.slot?`${name}锁定第 ${choice.slot} 技能（${choice.name}）`:`${name}使用${choice.name}`];
  });
  row.details.insertAdjacentHTML('beforebegin',`<p class="caption" data-score-tactics>${esc(opening||'开场直接自动。')}${esc(skillModes.length?skillModes.join('，')+'。':'')}</p>`);
 }

 async function run(){
  if(!pane||runeBusy()||!account()||!ready())return;
  const selected=selectedForReplay(knownLineups());
  const inventory=account(),reserve=orochiReserve(selected,inventory);
  if(!selected.length||reserve&&!reserve.ready||pane.capture&&new Set(pane.capture.cards).size!==3||
     pane.urdtgTraining&&!pane.trainingSettings||pane.journeyHard&&!pane.journeySettings||pane.yinYangDrums&&!pane.yinYangSettings||
     pane.asura&&!pane.asuraSettings||
     pane.tower&&!pane.towerSettings||pane.laolaoFaith&&!pane.laolaoSettings||pane.fusionWindow&&!pane.fusionSettings||
     pane.duskWindow&&!pane.duskSettings||pane.songWindow&&!pane.songWindowSeconds||pane.mirageWindow&&!pane.mirageSettings||
     pane.catfishWindow&&!pane.catfishSettings||pane.skeletonWindow&&!pane.skeletonSettings&&!pane.skeletonXSettings||pane.longcheWindow&&!pane.longcheSettings||
     pane.spiderLiveWindow&&!pane.spiderLiveSettings&&!pane.spiderNormalSettings)return;
  const focus=document.activeElement===pane.start;
  const lifeCaps=pane.lifeCaps.map(field=>field.valueAsNumber),marks=pane.marks.map(field=>Number(field.value)),skills=pane.skills.slice();
  const artifacts=pane.artifacts.slice(),coins=pane.artifactCoins?.valueAsNumber??0;
  const guard=pane.guardChoice?.value?{
   id:Number(pane.guardChoice.value),level:Number(pane.guardLevel.value),breakthrough:pane.guardBreakthrough.checked,
  }:null;
  const next=job={pane,data:DATA,account:inventory,selected,rows:[],running:true,cancelled:false,reserve,capture:pane.capture,
   journeyHard:pane.journeySettings,
   trainingSettings:pane.trainingSettings,
   asuraSettings:pane.asuraSettings,
   yinyangBoss:pane.yinYangSettings?{...pane.yinYangSettings,buffIds:pane.yinYangSettings.buffIds.slice()}:null,
   towerSettings:pane.towerSettings,
   laolaoSettings:pane.fusionWindow?null:pane.laolaoSettings,fusionSettings:pane.fusionSettings,
   duskSettings:pane.duskSettings,
   songWindowSeconds:pane.songWindowSeconds,
   mirageSettings:pane.mirageSettings,
   catfishSettings:pane.catfishSettings,
   skeletonSettings:pane.skeletonSettings,
   skeletonXSettings:pane.skeletonXSettings,
   longcheSettings:pane.longcheSettings,
   spiderLiveSettings:pane.spiderLiveSettings,
   spiderNormalSettings:pane.spiderNormalSettings,
   trialSlot:Number(pane.trial?.value)||0,
   sixRealmsEvent:pane.eventMoves?{id:pane.shilianEventId,difficulty:Number(pane.eventDifficulty.value),moves:pane.eventMoves.valueAsNumber}:null,
   sixRealmsState:lifeCaps.some(value=>value!==100)||marks.some(Boolean)||skills.length||artifacts.length||coins||guard?
    {lifeCaps,marks,...(skills.length?{skills}:{}),...(artifacts.length?{artifacts}:{}),...(coins?{coins}:{}),...(guard?{guard}:{})}:null,
   startingInventory:reserve?reserveInventory(reserve,inventory):inventory,
   pveMemberCount:pane.memberCount,message:'正在准备库存…'};
  pane.results.replaceChildren();
  update();
  if(focus)pane.stop.focus();
  renderDungeonSelection();
  try{
   if(isWaveMode(next.pane.battleMode)){
    for(let i=0;i<selected.length&&active(next);i+=4)await originalRelay(next,selected.slice(i,i+4));
   }else for(const lineup of selected){
    if(!active(next))return;
    await original(next,lineup);
   }
   if(!active(next))return;
   const hunting=isDamageMode(next.pane.battleMode),relay=isWaveMode(next.pane.battleMode);
   const passed=next.rows.filter(row=>row.verdict==='pass'||(hunting||relay)&&row.verdict==='scored');
   const timing=hunting?null:AtlasRuneCandidate.commonSampleTiming(passed);
   const huntScores=new Map(hunting?passed.map(row=>[row,AtlasRuneCandidate.damageResult(row.samples)]):[]);
   const waveScores=new Map(relay?passed.map(row=>[row,AtlasRuneCandidate.waveResult(row.samples)]):[]);
   const regionScores=new Map(next.pane.region?passed.map(row=>[row,AtlasRuneCandidate.regionalResult(row.samples)]):[]);
   const dominated=new Set([...regionScores].filter(([row,score])=>[...regionScores].some(([other,otherScore])=>
    other!==row&&AtlasRuneCandidate.regionalDominates(otherScore,score))).map(([row])=>row));
   passed.sort(relay?(a,b)=>{
    const first=waveScores.get(a),second=waveScores.get(b);
    return second.min-first.min||second.average-first.average||second.max-first.max||timing.get(a).seconds-timing.get(b).seconds;
   }:hunting?(a,b)=>AtlasRuneCandidate.compareDamage(huntScores.get(a),huntScores.get(b)):
    (a,b)=>Number(dominated.has(a))-Number(dominated.has(b))||timing.get(a).seconds-timing.get(b).seconds);
   for(const row of passed){
    const waves=waveScores.get(row);
    if(waves){
     const time=timing.get(row);
     row.state.textContent=`最低 ${waves.min} 波 · 平均 ${waves.average.toFixed(1)} 波 · 最高 ${waves.max} 波 · ${seeds.length} 场`+
      (waves.min===70?` · 最慢 ${time.combat?'开战至结算':'引擎全程'} ${time.seconds.toFixed(2)} 秒`:'');
     continue;
    }
    const score=huntScores.get(row);
    if(score){
     const cleared=row.samples.every(report=>report.wavesCleared===report.waveCount);
     const result=row.samples[0].tenAnniversaryBoss||row.samples[0].fengmoBandTogether||row.samples[0].asuraBattle?'限时计分':cleared?'均清场':'含未清场样本';
     row.state.textContent=`${score.credited} / ${seeds.length} 场有效结算 · ${result} · 平均伤害 ${damageText(score.average)} · `+
      `单场最高 ${damageText(score.max)} · 最低 ${damageText(score.min)}`;
     continue;
    }
    const time=timing.get(row);
    const timeLabel=`最慢种子 ${time.seed} · ${time.combat?'开战至结算':'引擎全程'} ${time.seconds.toFixed(2)} 秒`;
    const region=regionScores.get(row);
    if(region){
     const range=(min,max)=>min===max?damageText(min):`${damageText(min)}–${damageText(max)}`;
     row.state.textContent=`${seeds.length} 场全胜 · ${range(...region.rounds)} 回合 · 承伤 ${range(...region.damage.map(Math.round))} · ${timeLabel}`+
      (dominated.has(row)?' · 有备选在回合数与承伤两项上占优':'');
     continue;
    }
    row.state.textContent=`通过 ${seeds.length} 个采样种子 · ${timeLabel}`;
   }
   next.pane.results.prepend(...passed.map(row=>row.el));
   next.notice=passed.length?(relay?`${passed.length} 套接力已完成共同采样，按最低清波数排序。全随机分支待验证。`:
    hunting?`${passed.length} 套完成共同采样，按窗口内的单场最高伤害排序。全随机分支待验证。`:
    next.pane.region?`${passed.length} 套通过采样，优先显示回合数与承伤未被其他阵容同时超越的阵容。全随机分支待验证。`:
    `${passed.length} 套通过采样，已按最慢样本用时排序。全随机分支待验证。`):
    next.rows.some(row=>row.verdict==='unknown')?'部分阵容的库存或结算有待核对，请查看战报。':'所选阵容未通过本次采样。';
  }catch(error){if(active(next))next.notice=runeError(error);}
  finally{
   next.running=false;
   if(job===next){
    if(next.cancelled)next.notice='复跑已停止，已取得的战报保留。';
    const restore=document.activeElement===next.pane.stop||next.restoreFocus&&document.activeElement===document.body;
    update();
    if(restore){
     await stopping;
     const button=next.pane.start;
     if(job===next&&!button.hidden&&!button.disabled)button.focus();
    }

   }
   renderDungeonSelection();
  }
 }

 window.AtlasPveWorkbench={busy,mount,mountFixedTrial,unmount,refresh:update,cancel,reset:()=>cancel(true)};
})();
