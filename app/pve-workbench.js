(() => {
 'use strict';
 const api=window.dungeonCatalog;
 const seeds=AtlasRuneSearch.baseSampleSeeds;
 const isDamageMode=AtlasRuneCandidate.damageMode;
 const yinYang=AtlasJourneyHard.boss;
 const ghostKingTower=AtlasDevilFeast.tower;
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
  const journeyHard=pane.journeyDeadline?{
   deadlineSeconds:pane.journeyDeadline.valueAsNumber,blessingCount:pane.journeyBlessings.valueAsNumber,
  }:null;
  const journeyReady=!journeyHard||Number.isSafeInteger(journeyHard.deadlineSeconds)&&journeyHard.deadlineSeconds>0&&
   Number.isSafeInteger(journeyHard.blessingCount)&&journeyHard.blessingCount>=0;
  pane.journeySettings=journeyReady?journeyHard:null;
  if(pane.journeyDeadline)for(const field of [pane.journeyDeadline,pane.journeyBlessings])field.disabled=blocked;
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
  pane.start.disabled=!supported||!hasAccount||blocked||!selected.length||!!reserve&&!reserve.ready||!captureReady||!eventReady||!stateReady||!coinsReady||!journeyReady||!yinYangReady||!towerReady;
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
   !journeyReady?'请填写正整数战斗时限和非负整数祝福层数。':
   !towerReady?'请核对百妖退治的挑战条件。':
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
  if(!api?.pveStatus)return;
  cancel(true);
  const section=document.createElement('section');
  section.className='encounter-source';
  section.innerHTML=`<h4>模拟已知阵容</h4>
   <p class="caption">${esc(config.label||'通用 PvE 模式 3')} · ${config.memberCount} 位式神 · ${seeds.length} 个采样种子${config.scoreWindowSeconds?
    ` · ${config.retreat||config.qilingWindow||config.creviceWindow||config.ghostSettings||config.historicalGhostWindow?'自定':'原版'}计分窗口 ${Number(config.scoreWindowSeconds).toLocaleString('zh-CN')} 秒`:''}</p>
   <p class="caption" data-pve-status role="status"></p>
   <div class="actions">
    <label class="pve-lineup-field">已知阵容 <select data-pve-lineup></select></label>
    ${config.trialEligible?`<label class="pve-lineup-field">试炼式神位置 <select data-pve-trial>
    <option value="">自动识别唯一可选式神</option>
    ${Array.from({length:config.memberCount},(_,i)=>`<option value="${i+1}">阵容中第 ${i+1} 位式神</option>`).join('')}
    </select></label>`:''}
    <button class="secondary" type="button" data-pve-start>开始离线模拟</button>
    <button class="secondary" type="button" data-pve-stop hidden>停止复跑</button>
   </div>
   ${config.journeyHard?`<div class="actions">
    <label class="pve-lineup-field">祝福层数 <input data-pve-journey-blessings type="number" value="0" min="0" step="1" required></label>
    <label class="pve-lineup-field">战斗时限（秒） <input data-pve-journey-deadline type="number" min="1" step="1" required></label>
   </div>`:''}
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
   journeyDeadline:part('journey-deadline'),journeyBlessings:part('journey-blessings'),
   yinYangDrums:part('yinyang-drums'),yinYangDeadline:part('yinyang-deadline'),yinYangBuffChoice:part('yinyang-buff'),
   addYinYangBuff:part('add-yinyang-buff'),yinYangBuffList:part('yinyang-buff-list'),yinYangBuffIds:[],
   towerConditions:part('tower-conditions'),towerBlessingRows:all('tower-blessing-row'),
   towerChoices:all('tower-choice'),towerLevels:all('tower-level'),towerFactions:all('tower-faction'),
   towerContinue:part('tower-continue'),towerHpPanel:part('tower-hp-panel'),towerHp:all('tower-hp'),towerHint:part('tower-hint'),
   trial:part('trial'),eventDifficulty:part('event-difficulty'),eventMoves:part('event-moves'),
   lifeCaps:[...section.querySelectorAll('[data-pve-life-cap]')],marks:[...section.querySelectorAll('[data-pve-yinji]')],
   skillChoice:part('skill-choice'),skillLevel:part('skill-level'),addSkill:part('add-skill'),skillList:part('skill-list'),skills:[],
   guardChoice:part('guard-choice'),guardLevel:part('guard-level'),guardBreakthrough:part('guard-breakthrough'),
   artifactChoice:part('artifact-choice'),artifactAmount:part('artifact-amount'),artifactRounds:part('artifact-rounds'),
   artifactCoins:part('artifact-coins'),artifactHint:part('artifact-hint'),addArtifact:part('add-artifact'),artifactList:part('artifact-list'),artifacts:[],
   hint:part('status'),results:part('results'),reserveActor:part('reserve-actor'),reserveMembers:[...section.querySelectorAll('[data-pve-reserve-member]')],
   captureItem:part('capture-item'),captureFields:part('capture-fields'),captureCards:[...section.querySelectorAll('[data-pve-capture-card]')]};
  pane.start.onclick=()=>void run();
  for(const field of [pane.lineup,pane.reserveActor,...pane.reserveMembers,pane.captureItem,...pane.captureCards,pane.trial,
   pane.eventDifficulty,pane.skillChoice,pane.artifactChoice,pane.guardChoice,pane.guardLevel,pane.guardBreakthrough,pane.yinYangBuffChoice,
   ...pane.towerChoices,...pane.towerFactions,pane.towerContinue].filter(Boolean))field.onchange=()=>{
   if(job&&!busy())job.notice=null;
   update();
  };
  for(const field of [pane.eventMoves,pane.journeyDeadline,pane.journeyBlessings,pane.yinYangDrums,...pane.lifeCaps,...pane.marks,
   ...pane.towerLevels,...pane.towerHp,
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
   mapBossPlayers,tianfaTeam,qinfeiBoss,qinfeiFoodPiles,pveDeadlineSeconds,dojoArea,forest,tenBonuses,bandScores,devilFeastHp}=run.pane;
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
    ...(historicalGhostWindow?{historicalGhostWindow}:{}),
    ...(mapBossPlayers?{mapBossPlayers}:{}),...(tianfaTeam?{tianfaTeam}:{}),
    ...(qinfeiBoss?{qinfeiBoss}:{}),
    ...(qinfeiFoodPiles?{qinfeiFoodPiles}:{}),
    ...(pveDeadlineSeconds?{pveDeadlineSeconds}:{}),
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
   if(scoring&&row.samples.length===1&&AtlasRuneCandidate.damageResult([report]))showScoreInstructions(row,plan,run.data.gameConfig);
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
   const ranOut=(experience??report.coins??report.journeyHard??report.ghostKingTower)?.timedOut===true;
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

 function showScoreInstructions(row,plan,game){
  const names=plan.members.map(({hero})=>game.heroes[hero.heroId]?.name||`式神 ${hero.heroId}`);
  const {tactics}=plan;
  const opening=AtlasRuneCandidate.scoreInstructions(tactics,plan,game).replace(/第([1-6])位式神/g,(_,slot)=>`${names[slot-1]}（式神第 ${slot} 位）`);
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
     pane.journeyHard&&!pane.journeySettings||pane.yinYangDrums&&!pane.yinYangSettings||pane.tower&&!pane.towerSettings)return;
  const focus=document.activeElement===pane.start;
  const lifeCaps=pane.lifeCaps.map(field=>field.valueAsNumber),marks=pane.marks.map(field=>Number(field.value)),skills=pane.skills.slice();
  const artifacts=pane.artifacts.slice(),coins=pane.artifactCoins?.valueAsNumber??0;
  const guard=pane.guardChoice?.value?{
   id:Number(pane.guardChoice.value),level:Number(pane.guardLevel.value),breakthrough:pane.guardBreakthrough.checked,
  }:null;
  const next=job={pane,data:DATA,account:inventory,selected,rows:[],running:true,cancelled:false,reserve,capture:pane.capture,
   journeyHard:pane.journeySettings,
   yinyangBoss:pane.yinYangSettings?{...pane.yinYangSettings,buffIds:pane.yinYangSettings.buffIds.slice()}:null,
   towerSettings:pane.towerSettings,
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
     const result=row.samples[0].tenAnniversaryBoss||row.samples[0].fengmoBandTogether?'限时计分':cleared?'均清场':'含未清场样本';
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

 window.AtlasPveWorkbench={busy,mount,unmount,refresh:update,cancel,reset:()=>cancel(true)};
})();
