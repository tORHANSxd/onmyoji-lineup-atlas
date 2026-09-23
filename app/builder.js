'use strict';
let builderDraft=null,builderMember='',builderVersion=0,builderSavedVersion=0,builderOutput=null,builderSaving=false,builderDrag=null,builderPickIndex=0;
const builderLimits=[['spd','速度','speed'],['final_atk','攻击','attack'],['final_max_hp','生命','hp'],['final_def','防御','defense'],['critical_rate','暴击 %','crit'],['critical_pow','暴伤 %','critDamage'],['debuff_acc','命中 %','effectHit'],['debuff_res','抵抗 %','effectResist']];
const builderAttrs=[['atk_per','攻击加成'],['critical_rate','暴击'],['critical_pow','暴伤'],['spd','速度'],['debuff_acc','命中'],['debuff_res','抵抗'],['max_hp_per','生命加成'],['def_per','防御加成']];
function blankBuilderSlot(kind){return {key:crypto.randomUUID(),kind,h:null};}
function emptyBuilder(){return {title:'我的阵容',desc:'',members:AtlasGame.slots(DATA.gameConfig,null).map(blankBuilderSlot),stageId:null};}
function resetBuilder(){builderDraft=null;builderMember='';builderOutput=null;builderVersion++;builderSavedVersion=builderVersion;if(view==='builder')renderBuilder();}
function builderChanged(){builderVersion++;builderOutput=null;$('builder-state').textContent='有未保存的修改';$('builder-preview').hidden=true;}
function builderName(m){if(!m.h)return m.kind==='onmyoji'?'选择阴阳师 / 英杰':'选择式神';return DATA.gameConfig?.heroes[m.h.hero_id]?.name||'资料尚未收录的角色';}
function builderAvatar(m){return {kind:m.kind,name:builderName(m),shikigamiId:String(m.h.hero_id),onmyojiId:String(m.h.hero_id),awakening:m.h.awake};}
function ensureBuilder(){if(!builderDraft){builderDraft=structuredClone(STATE.builderDraft||emptyBuilder());if(!Array.isArray(builderDraft.members)||builderDraft.members.length>30||builderDraft.members.some(m=>!m||(m.h&&!Number.isSafeInteger(m.h.hero_id))||!['shikigami','onmyoji'].includes(m.kind)||!/^[-a-f0-9]{8,40}$/i.test(m.key))){builderDraft=emptyBuilder();toast('已保存的制作草稿格式无效，请从阵容库重新载入');}delete builderDraft.relations;builderMember=builderDraft.members[0]?.key||'';}padBuilderSlots();}
function padBuilderSlots(){const kinds=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId);while(builderDraft.members.length<kinds.length)builderDraft.members.push(blankBuilderSlot(kinds[builderDraft.members.length]));}
function renderBuilder(){
 ensureBuilder();$('builder-title').value=builderDraft.title;$('builder-desc').value=builderDraft.desc;
 const choices=AtlasCategories.choices(DATA).filter(p=>p.gameSceneId);
 $('builder-stage').innerHTML='<option value="">请选择游戏原码副本（导出必填）</option>'+choices.map(p=>'<option value="'+p.gameSceneId+'">'+esc(AtlasCategories.caption(p))+'</option>').join('');
 $('builder-stage').value=String(builderDraft.stageId||'');
 $('builder-state').textContent=builderVersion===builderSavedVersion?'草稿已保存 / 尚无修改':'有未保存的修改';
 renderBuilderMembers();renderBuilderEditor();
}
function renderBuilderMembers(){
 const kinds=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId);
 $('builder-member-count').textContent=builderDraft.members.filter(m=>m.h).length+' / '+kinds.length+' 位';
 $('builder-members').innerHTML=builderDraft.members.map((m,i)=>`<article draggable="${m.kind==='shikigami'}" class="builder-member ${m.key===builderMember?'selected':''}" data-builder-card="${m.key}"><button class="builder-member-open" data-builder-member="${m.key}">${m.h?thumb(builderAvatar(m)):`<span class="empty-slot-number">${i+1}</span>`}<span><strong>${esc(builderName(m))}</strong><small>${i>=kinds.length?'超出此副本人数，请移除':kinds[i]!==m.kind?'位置类型不符，请更换':m.kind==='onmyoji'?'阴阳师 / 英杰 · 固定位置':(i+1)+' 号位 · 配装优先级 '+i}</small></span></button><div class="builder-order">${m.kind==='shikigami'?`<button class="ghost" data-builder-up="${m.key}" aria-label="上移 ${esc(builderName(m))}" ${i<2?'disabled':''}>上移</button><button class="ghost" data-builder-down="${m.key}" aria-label="下移 ${esc(builderName(m))}" ${i>=kinds.length-1?'disabled':''}>下移</button>`:''}<button class="secondary" data-builder-replace="${i}">${m.h?'更换':'选择'}</button>${m.h||i>=kinds.length?`<button class="danger" data-builder-remove="${m.key}" aria-label="移除 ${esc(builderName(m))}">移除</button>`:''}</div></article>`).join('');
}
function builderField(name,label,value,min,max){return '<label>'+label+'<input type="number" data-builder-field="'+name+'" value="'+esc(value??'')+'" min="'+min+'" max="'+max+'" step="1" placeholder="不限"></label>';}
function renderBuilderEditor(){
 const m=builderDraft.members.find(m=>m.key===builderMember);if(!m?.h){$('builder-editor').innerHTML='<div class="builder-empty"><h3>'+esc(m?builderName(m):'选择成员')+'</h3><p>从左侧选择角色，再设置技能、自动施法和装备要求。</p><button class="primary" data-builder-replace="'+Math.max(0,builderDraft.members.indexOf(m))+'">选择角色</button></div>';return;}
 const h=m.h,e=h.equip_info||{},yys=m.kind==='onmyoji';
 const skills=builderSkills(h);
 const soulSelect=(n,index=0)=>'<label>'+n+' 件套<select data-builder-suit="'+n+'"><option value="">不限套装</option>'+Object.entries(DATA.suits).map(([id,name])=>'<option value="'+id+'" '+(e.suit?.filter(s=>s[1]===n||s[1]===6)[index]?.[0]===Number(id)?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
 const limits=builderLimits.map(([key,label])=>'<tr><th>'+label+'</th><td><input aria-label="'+label+'下限" type="number" step="any" data-builder-min="'+key+'" value="'+esc(e.limit?.[key]?.[0]>=0?e.limit[key][0]:'')+'" placeholder="不限制"></td><td><input aria-label="'+label+'上限" type="number" step="any" data-builder-max="'+key+'" value="'+esc(e.limit?.[key]?.[1]>=0?e.limit[key][1]:'')+'" placeholder="不限制"></td><td><input type="checkbox" aria-label="'+label+'高于后续成员" data-builder-highest="'+key+'" '+(h.highest_limit?.includes(key)?'checked':'')+'></td></tr>').join('');
 $('builder-editor').innerHTML='<div class="builder-editor-heading">'+thumb(builderAvatar(m))+'<div><h2>'+esc(builderName(m))+'</h2><p class="caption">空白表示不指定，可仅填写下限或上限。</p></div></div><div class="form-grid builder-training">'+builderField('level','等级',h.level,1,yys?60:40)+(!yys?builderField('star','星级',h.star,2,6):'')+(!yys?'<label>觉醒<select data-builder-field="awake"><option value="">不限制</option><option value="0" '+(h.awake===0?'selected':'')+'>未觉醒</option><option value="1" '+(h.awake===1?'selected':'')+'>觉醒</option></select></label>':'')+'</div>'+skills+(yys?builderSpirit(h):'<h3>御魂配置</h3><label>配置方式<select data-builder-field="not_calc_flag"><option value="0" '+(!h.not_calc_flag?'selected':'')+'>重新配置御魂</option><option value="1" '+(h.not_calc_flag?'selected':'')+'>保留当前御魂</option></select></label><div class="builder-equipment" '+(h.not_calc_flag?'hidden':'')+'><h3>御魂要求</h3><div class="form-grid">'+soulSelect(4)+soulSelect(2)+'<label>评分<input type="number" min="0" max="400000" step="0.01" data-builder-field="use_score" value="'+esc(h.use_score??0)+'"></label>'+'<label>计算目标<select data-builder-field="criteria"><option value="">只找满足条件的方案</option>'+Object.entries(C.METRICS).map(([id,[name]])=>'<option value="'+id+'" '+(e.criteria===Number(id)?'selected':'')+'>'+name+'</option>').join('')+'</select></label><label>强化<select data-builder-field="yuhun_lv"><option value="1" '+(e.yuhun_lv?.[0]===15?'selected':'')+'>仅 +15</option><option value="0" '+(e.yuhun_lv?.[0]!==15?'selected':'')+'>不限强化</option></select></label><label>星级<select data-builder-field="yuhun_star"><option value="1" '+(e.yuhun_star?.length===1?'selected':'')+'>仅六星</option><option value="0" '+(e.yuhun_star?.length!==1?'selected':'')+'>不限星级</option></select></label></div><h3>二、四、六号位主属性</h3><div class="builder-main-stats">'+['1','3','5'].map((slot,i)=>'<fieldset><legend>'+[2,4,6][i]+'号位（可多选）</legend>'+builderAttrs.filter(([key])=>slot==='1'?!['critical_rate','critical_pow','debuff_acc','debuff_res'].includes(key):slot==='3'?!['spd','critical_rate','critical_pow'].includes(key):!['spd','debuff_acc','debuff_res'].includes(key)).map(([key,name])=>'<label><input type="checkbox" data-builder-main="'+slot+'" value="'+key+'" '+(e.main_attr?.[slot]?.includes(key)?'checked':'')+'>'+name+'</label>').join('')+'</fieldset>').join('')+'</div><details><summary>额外两件套属性与战斗加成</summary><div class="form-grid">'+soulSelect(2,1)+soulSelect(2,2)+[0,1,2].map(i=>'<label>额外两件属性 '+(i+1)+'<select data-builder-two="'+i+'"><option value="">不指定</option>'+builderAttrs.filter(([key])=>key!=='spd').map(([key,name])=>'<option value="'+key+'" '+(e.two_suit?.[i]===key?'selected':'')+'>'+name+'</option>').join('')+'</select></label>').join('')+[['attackRate','攻击加成（小数）'],['attack','固定攻击'],['critRate','暴击加成（小数）'],['critPower','暴伤加成（小数）']].map(([key,label])=>'<label>'+label+'<input type="number" step="any" data-builder-extra="'+key+'" value="'+esc(e.limit?.ExtraAttr?.[key]??'')+'" placeholder="0"></label>').join('')+'</div></details><h3>面板范围与最高属性</h3><p class="caption">“高于后续”采用游戏原生规则，作用于该成员之后的所有式神。</p><table class="builder-limits"><thead><tr><th>属性</th><th>下限</th><th>上限</th><th>高于后续</th></tr></thead><tbody>'+limits+'</tbody></table></div>');
}
function builderSkillLevels(id,level,awake,attr,allowAny=true){return '<select '+attr+'>'+(allowAny?'<option value="">不限等级</option>':'')+AtlasGame.levels(DATA.gameConfig,id,awake).map(s=>'<option value="'+s.level+'" '+(s.level===level?'selected':'')+'>'+s.level+'级</option>').join('')+'</select>';}
function builderSkills(h){
 const d=DATA.gameConfig,hero=d.heroes[h.hero_id],actor=hero.kind==='onmyoji';
 const fields=actor?[0,1].map(i=>{const [id,level]=h.skills?.[i]||[];return `<div class="builder-skill"><label>携带技能 ${i+1}<select data-builder-equipped="${i}"><option value="">不指定</option>${hero.equipSkills.map(sid=>`<option value="${sid}" ${id===sid?'selected':''} ${(h.skills||[]).some((s,j)=>j!==i&&s[0]===sid)?'disabled':''}>${esc(AtlasGame.skill(d,sid,1,0)?.name||'资料未收录')}</option>`).join('')}</select></label>${id?skillButton(h.hero_id,id,level,0,false,h):'<p class="caption">选择后可查看逐级效果。</p>'}${id?'<label>技能等级'+builderSkillLevels(id,level,0,'data-builder-equipped-level="'+i+'"',false)+'</label>':''}</div>`;}).join(''):AtlasGame.memberSkills(d,h).map(({id,level})=>`<div class="builder-skill">${skillButton(h.hero_id,id,level,h.awake)}<label>要求等级${builderSkillLevels(id,level,h.awake,'data-builder-skill="'+id+'"')}</label></div>`).join('');
 return `<section class="builder-skills"><h3>${actor?'携带技能':'技能配置'}</h3><p class="caption">${actor?'默认拥有全部阴阳师 / 英杰；等级与携带配置按本阵容设置。':'点击技能查看官方名称、类型与逐级效果；空白不限制等级。'}</p><div class="builder-skill-grid">${fields}</div>${actor?`<details><summary>查看该角色全部技能（含普攻与被动）</summary><div class="related-skills">${hero.choices.map(id=>skillButton(h.hero_id,id,1,0)).join('')}</div></details>`:''}<label class="builder-ai">自动施法<select data-builder-field="ai_skill">${AtlasGame.aiChoices(d,h).map(s=>`<option value="${s.value}" ${(h.ai_skill||0)===s.value?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label></section>`;
}
function builderSpirit(h){
 const d=DATA.gameConfig,q=h.qiling_info,hero=d.heroes[h.hero_id],selected=AtlasGame.markLevels(q);
 const options=Object.values(d.spirits).filter(s=>s.heroes.includes(h.hero_id));
 return `<section class="builder-spirit"><h3>契灵配置</h3><p class="caption">默认拥有全部契灵；仅按所选等级与术印展示增益。</p><label>佩戴契灵<select data-builder-spirit><option value="">不指定</option>${options.map(s=>`<option value="${s.id}" ${q?.id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>${q?`<div class="spirit-heading">${gameImage(gameAsset('hunling',q.id))}<div class="form-grid"><label>星级<select data-builder-spirit-star>${[1,2,3,4,5,6].map(n=>`<option ${q.star===n?'selected':''}>${n}</option>`).join('')}</select></label><label>等级（0 为不限）<input type="number" data-builder-spirit-level min="0" max="${d.spiritMaxLevel[q.star]}" value="${q.lv}"></label></div></div>${spiritEffects(q)}${selected.length>2?'<p class="caption">原码含多种术印，已完整保留。修改下方术印时将按游戏编辑器的两个配置位重新设置。</p>'+selected.map(m=>skillButton(h.hero_id,d.marks[m.id]?.skillId,m.level,1)).join(''):''}<h4>术印配置 · 两个位置</h4><div class="builder-skill-grid">${[0,1].map(i=>{const mark=selected[i],ids=d.markGroups[q.mark_gid]?.mark_list||[];return `<div class="builder-skill"><label>术印 ${i+1}<select data-builder-mark="${i}"><option value="">不指定</option>${ids.map(id=>`<option value="${id}" ${mark?.id===id?'selected':''} ${selected.some((s,j)=>j!==i&&s.id===id)?'disabled':''}>${esc(AtlasGame.skill(d,d.marks[id].skillId)?.name||'资料未收录')}</option>`).join('')}</select></label>${mark?skillButton(h.hero_id,d.marks[mark.id].skillId,mark.level,1)+`<label>术印等级<select data-builder-mark-level="${i}">${[1,2,3].map(n=>`<option ${mark.level===n?'selected':''}>${n}</option>`).join('')}</select></label>`:''}</div>`;}).join('')}</div>`:''}</section>`;
}
function collectBuilderSpirit(h,changed){
 const panel=$('builder-editor'),id=Number(panel.querySelector('[data-builder-spirit]')?.value);if(!id){delete h.qiling_info;return;}
 const old=h.qiling_info,same=old?.id===id,read=(selector,fallback)=>{const el=panel.querySelector(selector);return el?.value!==''&&el?.value!=null?Number(el.value):fallback;};
 h.qiling_info={id,star:same?read('[data-builder-spirit-star]',old.star):1,lv:same?read('[data-builder-spirit-level]',old.lv):1,mark_gid:same?old.mark_gid:DATA.gameConfig.heroes[h.hero_id].groupId,marks:same?[...old.marks]:[]};
 if(!same||!changed?.matches('[data-builder-mark],[data-builder-mark-level]'))return;
 h.qiling_info.marks=[];
 for(const el of panel.querySelectorAll('[data-builder-mark]'))if(el.value){const level=Number(panel.querySelector('[data-builder-mark-level="'+el.dataset.builderMark+'"]')?.value)||1;for(let i=0;i<level;i++)h.qiling_info.marks.push(Number(el.value));}
}
function collectBuilderEditor(changed){
 ensureBuilder();builderDraft.title=$('builder-title').value;builderDraft.desc=$('builder-desc').value;builderDraft.stageId=$('builder-stage').value?Number($('builder-stage').value):null;
 const m=builderDraft.members.find(m=>m.key===builderMember);if(!m?.h)return;
 const h=m.h,yys=m.kind==='onmyoji',e=h.equip_info||={};
 const number=el=>el.value===''?null:Number(el.value);
 for(const el of $('builder-editor').querySelectorAll('[data-builder-field]')){
  const k=el.dataset.builderField,n=number(el);
  if(k.startsWith('skill-')){h.skills=(h.skills||[]).filter(s=>s[0]!==Number(k.slice(6)));if(n!=null)h.skills.push([Number(k.slice(6)),n]);}
  else if(k==='criteria')e.criteria=n;
  else if(k==='yuhun_lv')e.yuhun_lv=n===1?[15,15]:[0,15];
  else if(k==='yuhun_star')e.yuhun_star=n===1?[6]:[1,2,3,4,5,6];
  else h[k]=n;
 }
 if(yys){h.skills=[...$('builder-editor').querySelectorAll('[data-builder-equipped]')].filter(el=>el.value).map(el=>[Number(el.value),Number($('builder-editor').querySelector('[data-builder-equipped-level="'+el.dataset.builderEquipped+'"]')?.value)||1]);collectBuilderSpirit(h,changed);delete h.equip_info;return;}
 h.skills=[...$('builder-editor').querySelectorAll('[data-builder-skill]')].filter(el=>el.value).map(el=>[Number(el.dataset.builderSkill),Number(el.value)]);
 e.suit=[...$('builder-editor').querySelectorAll('[data-builder-suit]')].filter(el=>el.value).map(el=>[Number(el.value),Number(el.dataset.builderSuit)]);
 e.two_suit=[...$('builder-editor').querySelectorAll('[data-builder-two]')].filter(el=>el.value).map(el=>el.value);
 e.main_attr=Object.fromEntries(['1','3','5'].map(slot=>[slot,[...$('builder-editor').querySelectorAll('[data-builder-main="'+slot+'"]:checked')].map(el=>el.value)]));
 const extras={};for(const el of $('builder-editor').querySelectorAll('[data-builder-extra]'))if(el.value!=='')extras[el.dataset.builderExtra]=Number(el.value);
 e.limit=Object.keys(extras).length?{ExtraAttr:extras}:{};h.highest_limit=[];
 for(const [key]of builderLimits){const min=$('builder-editor').querySelector('[data-builder-min="'+key+'"]'),max=$('builder-editor').querySelector('[data-builder-max="'+key+'"]');if(min.value!==''||max.value!=='')e.limit[key]=[number(min),number(max)];if($('builder-editor').querySelector('[data-builder-highest="'+key+'"]').checked)h.highest_limit.push(key);}
}
function builderNative(draft){return {title:draft.title.trim()||'未命名阵容',desc:draft.desc,select_stage_id:draft.stageId,hconf:draft.members.map(m=>m.h)};}
async function buildBuilderPreview(){
 collectBuilderEditor();const version=builderVersion,snapshot=structuredClone(builderDraft);AtlasGame.validate(DATA.gameConfig,builderNative(snapshot));
 if(!window.atlas?.buildLineup)throw Error('请在桌面软件中使用制作器导出');
 const result=await atlas.buildLineup(builderNative(snapshot));if(builderVersion!==version)return null;
 builderOutput={...result,version,snapshot};$('builder-short-code').textContent='';$('builder-copy-short').hidden=true;$('builder-preview').hidden=false;
 $('builder-code').value=result.code;$('builder-qr').hidden=!result.image;if(result.image)$('builder-qr').src=result.image;
 $('builder-export-note').textContent='请在游戏阵容助手扫描此二维码；文字导入请使用官方短码，不能粘贴 #TA# 完整数据。'+(result.qrError?' '+result.qrError:'');
 return builderOutput;
}
async function saveBuilder(asDraft=false){
 if(builderSaving||libraryBusy||bulkBusy)return;collectBuilderEditor();const draft=builderDraft,snapshot=structuredClone(draft),version=builderVersion;
 builderSaving=true;libraryBusy=true;libraryParser?.cancel();stopMatch();$('builder-state').textContent='正在保存…';
 try{
  let saved;
  if(asDraft){if(!await commitState(s=>({...s,builderDraft:snapshot})))throw Error('草稿未保存，请重试');}
  else{
   const result=await atlas.buildLineup(builderNative(snapshot)),parsed=C.adaptTA(result.payload,DATA);
   const id=snapshot.savedId||'user-'+crypto.randomUUID();saved={...parsed,id,sourceKind:'user',builder:true,shortCode:builderOutput?.code===result.code?builderOutput.shortCode:undefined,createdAt:snapshot.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),category:'其他',subcategory:'自建阵容',dungeon:'自建阵容'};
   snapshot.savedId=id;snapshot.createdAt=saved.createdAt;
   libraryBusy=true;libraryParser?.cancel();stopMatch();
   if(!await commitState(s=>({...s,lineups:[...s.lineups.filter(l=>l.id!==id),preserveBuilderClassification(s.lineups.find(l=>l.id===id),saved)],builderDraft:snapshot})))throw Error('阵容未保存，请重试');
   delete matchResults[id];fillFilters();renderManage();
  }
  if(saved&&builderDraft===draft){builderDraft.savedId=saved.id;builderDraft.createdAt=saved.createdAt;}
  if(builderVersion===version){builderDraft=snapshot;builderSavedVersion=version;$('builder-state').textContent=asDraft?'草稿已保存，下次打开可继续':'阵容已保存到阵容库';}
  else $('builder-state').textContent='已保存先前内容；当前编辑仍有未保存修改';
  toast(asDraft?'制作草稿已保存':'自建阵容已保存');
 }catch(e){$('builder-state').textContent=e.message;toast(e.message);}finally{builderSaving=false;if(libraryBusy){libraryBusy=false;createLibraryParser(sessionRevision);}}
}
function openBuilderPicker(index){collectBuilderEditor();const slots=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId);builderPickIndex=index??builderDraft.members.findIndex((m,i)=>!m.h&&i<slots.length);if(builderPickIndex<0||builderPickIndex>=slots.length)return toast('此副本的位置已填满，可点击“更换”调整成员');manageEditing=null;const actor=slots[builderPickIndex]==='onmyoji';openDialog(actor?'选择阴阳师 / 英杰':'选择式神','第 '+(builderPickIndex+1)+' 个位置 · '+(actor?'全部默认拥有':'允许同名式神，每个位置独立设置要求'),'<div class="builder-picker-tools"><input id="builder-hero-search" type="search" aria-label="搜索成员" placeholder="搜索名称"><select id="builder-hero-kind" aria-label="成员种类" '+(actor?'hidden':'')+'><option value="">全部</option><option>SP</option><option>SSR</option><option>SR</option><option>R</option><option>N</option><option>UR</option></select></div><div id="builder-hero-list" class="builder-hero-list"></div>');renderBuilderPicker();}
function renderBuilderPicker(){
 const q=$('builder-hero-search').value.toLowerCase(),kind=$('builder-hero-kind').value;
 const slotKind=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId)[builderPickIndex];
 const heroes=[...DATA.roster.map(r=>({id:Number(r.id),name:r.name,rarity:r.rarity,kind:'shikigami'})),...DATA.actors.map(a=>({id:a.gameId,name:a.name,rarity:'onmyoji',kind:'onmyoji'}))].filter(r=>r.kind===slotKind&&DATA.gameConfig.heroes[r.id]&&(!kind||r.rarity===kind)&&(!q||(r.name+r.id).toLowerCase().includes(q)));
 $('builder-hero-list').innerHTML=heroes.map(r=>'<button class="builder-hero" data-builder-hero="'+r.id+'" data-kind="'+r.kind+'">'+thumb({kind:r.kind,name:r.name,shikigamiId:String(r.id),onmyojiId:String(r.id)})+'<span>'+esc(r.name)+'</span><small>'+(r.kind==='onmyoji'?'阴阳师':r.rarity)+'</small></button>').join('')||'<p>没有匹配的成员。</p>';
}
function moveBuilderMember(key,to){
 collectBuilderEditor();const from=builderDraft.members.findIndex(m=>m.key===key);if(from<1||to<1||to>=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId).length||from===to||builderDraft.members[from].kind!=='shikigami'||builderDraft.members[to].kind!=='shikigami')return;
 const positions=new Map([...$('builder-members').children].map(el=>[el.dataset.builderCard,el.getBoundingClientRect()]));
 builderDraft.members.splice(to,0,...builderDraft.members.splice(from,1));builderChanged();renderBuilderMembers();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const el of $('builder-members').children){const before=positions.get(el.dataset.builderCard);if(before)el.animate([{transform:'translateY('+(before.top-el.getBoundingClientRect().top)+'px)'},{transform:'translateY(0)'}],{duration:220,easing:'ease-out'});}
}
function builderFromLineup(id){
 const l=lineups().find(l=>l.id===id);if(!l?.raw?.hconf)return toast('请先解析完整阵容，再进入制作器');
 const load=()=>{builderDraft={title:l.title+' · 副本',desc:l.notes||l.raw.desc||'',stageId:l.gameSceneId,members:l.raw.hconf.map((h,i)=>({key:crypto.randomUUID(),kind:l.members[i]?.kind||'shikigami',h:structuredClone(h)}))};builderMember=builderDraft.members[0]?.key;builderVersion++;builderOutput=null;$('detail-dialog').close();selectView('builder');};
 if(builderDraft&&builderVersion!==builderSavedVersion){manageEditing=null;openDialog('替换制作草稿','当前草稿有未保存修改','<p>请先保存当前草稿，或确认丢弃后载入这套阵容。</p><button id="builder-confirm-load" class="danger">丢弃当前草稿并载入</button>');$('builder-confirm-load').onclick=load;}else load();
}
document.addEventListener('input',e=>{
 if(e.target.id==='builder-hero-search')deferInput('builder-picker',()=>{if($('builder-hero-search'))renderBuilderPicker();});
 if(e.target.closest('#view-builder')&&e.target.id!=='builder-code'){
  collectBuilderEditor(e.target);builderChanged();
 }
});
document.addEventListener('change',e=>{
 if(e.target.id==='builder-hero-kind')renderBuilderPicker();
 if(e.target.id==='builder-stage'){padBuilderSlots();renderBuilderMembers();}
 const m=builderDraft?.members.find(m=>m.key===builderMember),h=m?.h;if(!h||!e.target.closest('#builder-editor'))return;
 if(e.target.matches('[data-builder-equipped]')){const sid=Number(e.target.value);h.skills=(h.skills||[]).map(s=>s[0]===sid?[sid,1]:s);h.ai_skill=0;}
 if(e.target.dataset.builderField==='awake'){h.skills=(h.skills||[]).filter(([id])=>AtlasGame.levels(DATA.gameConfig,id,h.awake).length).map(([id,lv])=>[id,Math.min(lv,AtlasGame.levels(DATA.gameConfig,id,h.awake).at(-1).level)]);h.ai_skill=0;}
 if(e.target.matches('[data-builder-equipped],[data-builder-equipped-level],[data-builder-skill],[data-builder-spirit],[data-builder-spirit-star],[data-builder-spirit-level],[data-builder-mark],[data-builder-mark-level],[data-builder-field="awake"],[data-builder-field="not_calc_flag"]')){
  if(!AtlasGame.aiChoices(DATA.gameConfig,h).some(s=>s.value===(h.ai_skill||0)))h.ai_skill=0;
  renderBuilderEditor();
 }
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
  if(b.id==='builder-new'){const fresh=()=>{builderDraft=emptyBuilder();builderMember='';builderChanged();$('detail-dialog').close();renderBuilder();};if(builderDraft?.members.length&&builderVersion!==builderSavedVersion){openDialog('新建阵容','当前制作内容尚未保存','<p>新建会清空当前编辑内容，请先保存，或确认丢弃。</p><button id="builder-confirm-new" class="danger">丢弃修改并新建</button>');$('builder-confirm-new').onclick=fresh;}else fresh();}
  if(b.id==='builder-copy-short'&&builderOutput?.shortCode)await copyCode(b,builderOutput.shortCode);
  if(b.hasAttribute('data-builder-add'))openBuilderPicker();
  if(b.hasAttribute('data-builder-replace'))openBuilderPicker(Number(b.dataset.builderReplace));
  if(b.dataset.builderHero){const kind=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId)[builderPickIndex];if(kind!==b.dataset.kind)return;const m={key:builderDraft.members[builderPickIndex].key,kind,h:AtlasGame.defaultMember(DATA.gameConfig,Number(b.dataset.builderHero))};builderDraft.members[builderPickIndex]=m;builderMember=m.key;builderChanged();$('detail-dialog').close();renderBuilderMembers();renderBuilderEditor();}
  if(b.dataset.builderMember){collectBuilderEditor();builderMember=b.dataset.builderMember;renderBuilderMembers();renderBuilderEditor();}
  if(b.dataset.builderUp||b.dataset.builderDown){const key=b.dataset.builderUp||b.dataset.builderDown;moveBuilderMember(key,builderDraft.members.findIndex(m=>m.key===key)+(b.dataset.builderUp?-1:1));}
  if(b.dataset.builderRemove){collectBuilderEditor();const index=builderDraft.members.findIndex(m=>m.key===b.dataset.builderRemove),kinds=AtlasGame.slots(DATA.gameConfig,builderDraft.stageId);if(index<kinds.length)builderDraft.members[index]={...builderDraft.members[index],kind:kinds[index],h:null};else builderDraft.members.splice(index,1);builderChanged();renderBuilderMembers();renderBuilderEditor();}
  if(b.id==='builder-speed-chain'){collectBuilderEditor();const members=builderDraft.members.filter(m=>m.h&&m.kind==='shikigami');for(const m of members.slice(0,-1))m.h.highest_limit=[...new Set([...(m.h.highest_limit||[]),'spd'])];builderChanged();renderBuilderEditor();toast('已按当前位置顺序设置原生配速要求');}
  if(b.id==='builder-save')await saveBuilder();if(b.id==='builder-draft')await saveBuilder(true);
  if(b.id==='builder-generate')await buildBuilderPreview();
  if(b.id==='builder-copy'||b.id==='builder-export-qr'||b.id==='builder-share'){
   if(!builderOutput||builderOutput.version!==builderVersion)return toast('请先生成预览，核对当前内容');
   if(b.id==='builder-copy')await copyCode(b,builderOutput.code);
   if(b.id==='builder-export-qr')toast(await atlas.exportQR({code:builderOutput.code,name:builderOutput.snapshot.title+'.png'})?'二维码已导出':'已取消导出');
   if(b.id==='builder-share')await shareBuilder(b);
  }
  if(b.dataset.builderFrom)builderFromLineup(b.dataset.builderFrom);
 }catch(error){toast(error.message);if($('builder-state'))$('builder-state').textContent=error.message;}
});
document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-builder-card]');if(card){builderDrag=card.dataset.builderCard;e.dataTransfer.setData('text/plain',builderDrag);e.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',e=>{if(builderDrag&&e.target.closest('#builder-members'))e.preventDefault();});
document.addEventListener('drop',e=>{const card=e.target.closest('[data-builder-card]');if(builderDrag&&card){e.preventDefault();moveBuilderMember(builderDrag,builderDraft.members.findIndex(m=>m.key===card.dataset.builderCard));}builderDrag=null;});
document.addEventListener('dragend',()=>builderDrag=null);

function preserveBuilderClassification(old,saved){if(!old)return saved;return {...saved,shortCode:saved.shortCode||(old.code===saved.code?old.shortCode:undefined),manualPaths:old.manualPaths,manualClassification:old.manualClassification,category:old.category,subcategory:old.subcategory,section:old.section,dungeon:old.dungeon,classificationPaths:old.classificationPaths,dungeons:old.dungeons};}

async function shareBuilder(button){
 if(!requireParserLogin()||!builderOutput)return;
 const output=builderOutput,code=output.code,id=builderDraft.savedId,revision=sessionRevision,generation=dataRevision;
 const active=()=>sameSession(revision)&&generation===dataRevision;
 button.disabled=true;
 try{
  const result=await window.taLogin.share(code);output.shortCode=result.code;
  if(builderOutput===output){$('builder-short-code').textContent=result.code;$('builder-copy-short').hidden=false;}
  else{openDialog('先前阵容的官方短码','对应本次提交的内容；当前编辑保留','<p>'+esc(output.snapshot.title)+'</p><code>'+esc(result.code)+'</code><div class="actions"><button id="copy-generated-short" class="primary">复制短码</button></div>');$('copy-generated-short').onclick=()=>copyCode($('copy-generated-short'),result.code);}
  let warning=result.warning||'';
  if(id&&active()&&STATE.lineups.some(l=>l.id===id&&l.code===code)){
   const saved=!libraryBusy&&!bulkBusy&&await commitState(s=>({...s,lineups:s.lineups.map(l=>l.id===id&&l.code===code?{...l,shortCode:result.code}:l)}),revision,null,null,active);
   if(!saved)warning+=(warning?' ':'')+'短码尚未保存到阵容记录，请复制留存或重新保存阵容。';
  }
  toast(warning||'官方短码已生成并可复制');
 }finally{button.disabled=false;}
}
