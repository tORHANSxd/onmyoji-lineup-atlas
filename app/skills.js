'use strict';
function skillImage(skill){const a=DATA.gameConfig?.icons?.[skill?.icon];return a?`<img src="../${esc(a.localPath)}" alt="${esc(skill.name)}" loading="lazy" width="48" height="48">`:'<span class="image-unavailable" aria-label="技能原图尚未收录"></span>';}
function skillTags(skill){return [...new Set((skill?.tags||[]).map(id=>DATA.gameConfig.tags[id]?.tag_name).filter(Boolean))].map(name=>`<span class="skill-tag">${esc(name)}</span>`).join('');}
function skillCost(skill){return skill?.passive?'被动技能':skill?.cost<0?'消耗按技能效果':`${skill?.cost??0} 鬼火${skill?.cooldown?' · 冷却 '+skill.cooldown+' 回合':''}`;}
function skillButton(heroId,id,level=1,awake=1,compact=false,context){
 const s=AtlasGame.skill(DATA.gameConfig,id,level||1,awake)||AtlasGame.levels(DATA.gameConfig,id,awake)[0],label=AtlasGame.skillLabel(DATA.gameConfig,heroId,id,context);
 return `<button class="skill-reference ${compact?'compact':''}" data-open-skill="${Number(id)}" data-skill-hero="${Number(heroId)||0}" data-skill-level="${Number(level)||1}" data-skill-awake="${awake?1:0}" data-skill-label="${esc(label)}">${skillImage(s)}<span><small>${esc(label)}${level?' · '+level+'级':''}</small><strong>${esc(s?.name||'技能资料尚未收录')}</strong>${compact?'':`<span class="skill-tags">${skillTags(s)}</span><small>${esc(skillCost(s))}</small>`}</span></button>`;
}
function openSkill(heroId,id,level=1,awake=1,label){
 let dialog=$('skill-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='skill-dialog';dialog.setAttribute('aria-label','技能资料');document.body.append(dialog);}
 const G=AtlasGame,d=DATA.gameConfig,levels=G.levels(d,id,awake),current=G.skill(d,id,level,awake)||levels[0];
 if(!current)return toast('此技能资料尚未收录，保留原码设置供核对');
 const variant=d.skills[id].variants,related=[...new Set(levels.flatMap(s=>[...s.branches,...s.aiBranches||[],...s.related]))];
 const terms=[...new Set(levels.flatMap(s=>s.terms))].map(key=>d.terms[key]).filter(Boolean),uniqueTerms=[...new Map(terms.map(t=>[t.name+'|'+t.description,t])).values()];
 dialog.innerHTML=`<div class="dialog-toolbar"><div class="skill-title">${skillImage(current)}<div><p class="caption">${esc(d.heroes[heroId]?.name||'技能资料')} · ${esc(label||G.skillLabel(d,heroId,id))}</p><h2>${esc(current.name)}</h2><p>${esc(skillCost(current))} · 最高 ${levels.at(-1).level} 级</p><div class="skill-tags">${skillTags(current)}</div></div></div><button class="icon-button" data-close-skill aria-label="关闭技能详情">×</button></div><div class="skill-dialog-body">${variant[0]&&variant[1]?`<label>技能形态<select id="skill-awake-view"><option value="0" ${!awake?'selected':''}>未觉醒</option><option value="1" ${awake?'selected':''}>觉醒后</option></select></label>`:''}<div class="skill-levels">${levels.map(s=>`<details ${s.level===current.level?'open':''}><summary><strong>${s.level}级</strong><span>${esc(s.level===1?'基础效果':s.upgrade||'效果说明')}</span></summary><div class="skill-tags">${skillTags(s)}</div><p>${esc(s.description)}</p><small>${esc(skillCost(s))}</small></details>`).join('')}</div>${related.length?`<h3>变化与衍生技能</h3><div class="related-skills">${related.map(sid=>skillButton(heroId,sid,1,awake)).join('')}</div>`:''}${uniqueTerms.length?`<h3>技能词条</h3><dl class="skill-terms">${uniqueTerms.map(t=>`<dt>${esc(t.name)}</dt><dd>${esc(t.description)}</dd>`).join('')}</dl>`:''}<p class="caption">资料来自本机游戏客户端快照 ${esc(d.source.snapshot)}；实战效果受场景与游戏更新影响。</p></div>`;
 dialog.querySelector('[data-close-skill]').onclick=()=>dialog.close();
 const select=dialog.querySelector('#skill-awake-view');if(select)select.onchange=()=>openSkill(heroId,id,level,Number(select.value),label);
 if(!dialog.open)dialog.showModal();
}
function memberSkillCards(m,compact=false){
 const id=Number(m.onmyojiId||m.shikigamiId||m.hero_id),hero=DATA.gameConfig?.heroes[id];
 const configured=m.skills||[],rows=configured.length?configured:(hero?.kind==='shikigami'?hero.skills.filter(s=>s!==hero.awakeSkill||m.awakening).map(id=>({id,level:null})):[]);
 return rows.map(s=>skillButton(id,s.id,s.level,m.awakening??m.awake??1,compact,{hero_id:id,skills:configured.map(s=>[s.id,s.level])})).join('')||'<p class="caption">未指定携带技能。</p>';
}
function spiritEffects(q){
 const s=DATA.gameConfig?.spirits[q?.id];if(!s)return '';
 const labels={attackAdditionRate:'攻击加成',maxHpAdditionRate:'生命加成',defenseAdditionRate:'防御加成',speedAdditionVal:'速度',critRateAdditionVal:'暴击',critPowerAdditionVal:'暴击伤害',debuffEnhance:'效果命中',debuffResist:'效果抵抗'};
 return `<p class="caption">${esc(s.trigger)} · 可佩戴：${s.heroes.map(id=>esc(DATA.gameConfig.heroes[id]?.name)).join('、')}</p>${q.lv===0?'<p class="caption">阵容未限制契灵等级；以下属性为 0 级基准，不作为库存达标值。</p>':''}<div class="spirit-attributes">${AtlasGame.spiritAttributes(DATA.gameConfig,q).map(a=>`<span>${esc(labels[a.key]||a.key)} <b>${a.key==='speedAdditionVal'?a.value.toFixed(1):(a.value*100).toFixed(1)+'%'}</b></span>`).join('')}</div><div class="related-skills">${skillButton(0,s.skillId,1,1)}${skillButton(0,s.pvpSkillId,1,1)}</div>`;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-open-skill]');if(b)openSkill(Number(b.dataset.skillHero),Number(b.dataset.openSkill),Number(b.dataset.skillLevel),Number(b.dataset.skillAwake),b.dataset.skillLabel);});
