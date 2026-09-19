'use strict';
let managePage=1,matchPaused=false,manageEditing=null,matchRenderAt=0,pendingRemoval=null;
let matchJobIds=new Set(),matchVersions={},matchBatch=0,statsSnapshot=null,statsRenderKey='';
function gameAsset(library,id){return DATA?.gameAssets?.items.find(a=>a.library===library&&String(a.id)===String(id));}
function gameImage(asset,cls='game-icon'){return asset?`<img class="${cls}" src="../${esc(asset.localPath)}" alt="${esc(asset.name)}" title="${esc(asset.name+' · '+asset.sourceLabel)}" loading="lazy">`:'<span class="image-unavailable" aria-label="资源尚未取得"></span>';}
function soulAsset(name){return DATA?.gameAssets?.items.find(a=>a.library==='yuhun'&&a.name===name);}
function qilingMarkup(q){
 if(!q)return '';
 const spirit=gameAsset('hunling',q.id),groups=new Map();
 for(const [index,id] of (Array.isArray(q.marks)?q.marks:[]).entries()){
  const key=String(id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index+1);
 }
 return `<section class="qiling-section"><h4>契灵与术印</h4><div class="qiling-requirement">${gameImage(spirit)}<span>${esc(spirit?.name||'契灵 ID '+q.id)} · ${esc(q.star)}星 · ${esc(q.lv)}级</span></div>${groups.size?`<p class="caption">点击术印查看各等级效果。原码未单独给出术印技能等级，以下不推定实际生效等级。</p><div class="mark-grid">${[...groups].map(([id,slots])=>{
  const mark=DATA.qilingMarks?.marks.find(m=>String(m.id)===id),asset=gameAsset('hunlingMark',id);
  return `<details class="mark-card" data-mark-id="${esc(id)}"><summary>${gameImage(asset)}<span><strong>${esc(mark?.name||'尚未收录的术印 '+id)}</strong><small>${slots.length} 枚 · 原码第 ${slots.join('、')} 项</small></span></summary>${mark?`<dl>${mark.levels.map(l=>`<dt>${l.level}级效果</dt><dd>${esc(l.description)}</dd>`).join('')}</dl>`:'<p class="caption">此术印效果尚未收录。</p>'}</details>`;
 }).join('')}</div>`:'<p class="caption">原码未指定术印。</p>'}</section>`;
}
function requireParserLogin(){if(window.TALogin?.status().authenticated)return true;toast('阵容解析需要先登录网易账号；本地资料可以继续查看。');window.TALogin?.ensure().catch(e=>toast(e.message));return false;}
function resolveServerNames(){if(!DATA)return;const servers=[...(window.TALogin?.status().servers||[]),...(DATA.serverNames||[])];let changed=false;for(const a of STATE.accounts){const server=servers.find(s=>String(s.id)===String(a.raw?.player?.serverId));if(server?.name&&a.server!==server.name){a.server=server.name;changed=true;}}if(changed){persist();updateAccountSelect();if(view==='accounts')renderAccounts();}}
function gapBadges(result){
 const kinds=gapKinds(result);
 return kinds.length?`<div class="gap-badges">${kinds.map(k=>`<span class="gap-tag gap-${k}">${esc(gapLabels[k])}</span>`).join('')}</div>`:'';
}
function renderParseFailures(){
 const rows=lineups().filter(l=>AtlasParseErrors.fromRecord(l)),el=$('parse-failures');if(!el)return;
 const open=new Set([...el.querySelectorAll('details[open]')].map(d=>d.dataset.failureGroup));
 const expired=rows.filter(AtlasParseErrors.isExpired),recoverable=rows.filter(l=>!AtlasParseErrors.isExpired(l));
 const table=items=>`<div class="scroll-table"><table><thead><tr><th>阵容</th><th>原码</th><th>失败类型 / 原因</th><th>操作</th></tr></thead><tbody>${items.map(l=>{const f=AtlasParseErrors.fromRecord(l);return `<tr><td>${esc(l.title)}</td><td><details><summary>查看原码</summary><code>${esc(l.code)}</code></details></td><td><strong>${esc(f.label)}</strong><p>${esc(f.message)}</p><small>${esc(l.lastParseAttemptAt||'')}</small></td><td><div class="actions failure-actions">${!AtlasParseErrors.isExpired(l)?`<button class="secondary" data-reparse="${esc(l.id)}">重试</button>`:''}<button class="secondary" data-edit-lineup="${esc(l.id)}">编辑</button><button class="danger" data-delete-lineup="${esc(l.id)}">删除</button></div></td></tr>`;}).join('')}</tbody></table></div>`;
 el.innerHTML=(expired.length?`<section class="failure-summary expired-summary"><div class="failure-heading"><h3>${expired.length} 条失效阵容码</h3><button class="danger" data-delete-expired ${libraryBusy?'disabled':''}>一键删除 ${expired.length} 条失效阵容</button></div><details data-failure-group="expired" ${open.has('expired')?'open':''}><summary>查看失效清单</summary>${table(expired)}</details></section>`:'')+(recoverable.length?`<section class="failure-summary"><div class="failure-heading"><h3>${recoverable.length} 条其他解析失败</h3><button id="retry-parse-failures" class="secondary" ${['running','pausing'].includes(parseReport.phase)||libraryBusy||bulkBusy?'disabled':''}>一键重试失败项</button></div><details data-failure-group="recoverable" ${open.has('recoverable')?'open':''}><summary>查看失败原因</summary>${table(recoverable)}</details></section>`:'')+(rows.length?'<div class="actions"><button id="export-parse-failures" class="secondary">导出失败清单</button></div>':'');
 renderReparseButtons();
}
function startMatch(ids=null,{reuse=false}={}){
 if(!account())return toast('先导入并选择一个账号');
 const selected=ids?new Set(ids):null,ls=lineups().filter(l=>(!selected||selected.has(l.id))&&(!reuse||!(matchResults[l.id]?.completed&&matchResults[l.id]?.proof?.state!=='error')&&!(worker&&matchJobIds.has(l.id)&&!matchResults[l.id]?.completed)));
 if(!ls.length){if(worker&&matchPaused)toggleMatchPause();renderGapStatistics();return;}
 const existing=!!worker,revision=sessionRevision,accountId=account().id;
 if(!existing){matchJobIds.clear();worker=new Worker('match-worker.js');}
 const job=worker;
 for(const l of ls){matchJobIds.add(l.id);matchVersions[l.id]=(matchVersions[l.id]||0)+1;const {assessment}=AtlasExact.inspectHeroes(l,account());matchResults[l.id]={status:'computing',gapCategory:'pending',gapAssessment:{...assessment,souls:'pending'},proof:{state:'computing',nodes:0},completed:false,ready:false,members:[],reasons:[],checks:[]};}
 matchPaused=false;$('match-progress').hidden=false;$('cancel-match').hidden=false;$('cancel-match').textContent='暂停精算';$('match-all').disabled=true;
 $('match-progress').textContent=`正在精算 ${matchJobIds.size} 个阵容…`;
 worker.onmessage=({data:d})=>{
  if(worker!==job||!sameSession(revision)||account()?.id!==accountId)return;
  if(d.result&&d.version!==matchVersions[d.id])return;
  if(d.done&&d.batch!==matchBatch)return;
  if(d.error)toast('精算异常：'+d.error+'；可重新计算');
  if(d.paused){renderGapStatistics();return;}
  if(d.result)matchResults[d.id]=d.result;
  const rows=[...matchJobIds].map(id=>matchResults[id]),done=rows.filter(r=>r?.completed).length,blocked=rows.filter(r=>r?.completed&&r.gapCategory==='unknown'&&r.proof?.state!=='error').length,errors=rows.filter(r=>r?.proof?.state==='error').length;
  const progress=`已精算 ${done} / ${matchJobIds.size}${blocked?' · '+blocked+' 个待补资料':''}${errors?' · '+errors+' 个异常待重试':''}`;
  if(Date.now()-matchRenderAt>350||d.done){matchRenderAt=Date.now();$('match-progress').textContent=progress;if(view==='library')renderLibrary();if(view==='accounts')renderRecommendations();if(view==='manage')renderManage();renderGapStatistics();}
  if(d.done){stopMatch();$('match-progress').textContent=progress;renderLibrary();renderRecommendations();renderGapStatistics();}
 };
 worker.onerror=e=>{for(const id of matchJobIds)if(!matchResults[id]?.completed)matchResults[id]={...matchResults[id],completed:true,status:'unknown',gapCategory:'unknown',proof:{...matchResults[id]?.proof,state:'error'}};toast('计算任务异常：'+e.message);stopMatch();renderLibrary();};
 worker.postMessage({action:existing?'replace':'start',batch:++matchBatch,versions:matchVersions,lineups:ls,account:account(),roster:DATA.roster,effects:DATA.effects});
 renderLibrary();renderGapStatistics();
}
function toggleMatchPause(){if(!worker)return;matchPaused=!matchPaused;worker.postMessage({action:matchPaused?'pause':'resume'});$('cancel-match').textContent=matchPaused?'继续精算':'暂停精算';$('match-progress').textContent=matchPaused?'精算已暂停，继续后接着搜索':'继续精算中…';renderGapStatistics();}
function resetMatchContext(){stopMatch();statsSnapshot=null;selectedLineups.clear();$('gap-dialog').close();$('match-progress').hidden=true;}
function openGapStatistics(){
 if(!account())return toast('先选择库存账号');
 statsSnapshot={accountId:account().id,accountName:account().name,ids:filteredLineups().map(l=>l.id)};
 statsRenderKey='';
 $('gap-dialog').showModal();startMatch(statsSnapshot.ids,{reuse:true});renderGapStatistics();
}
function renderGapStatistics(){
 if(!statsSnapshot||!$('gap-dialog')?.open)return;
 if(statsSnapshot.accountId!==account()?.id){$('gap-dialog').close();statsSnapshot=null;return;}
 const ids=new Set(statsSnapshot.ids),rows=lineups().filter(l=>ids.has(l.id)),summary=AtlasLineupTools.summarize(rows,matchResults),open=new Set([...$('gap-statistics-body').querySelectorAll('details[open]')].map(el=>el.dataset.gapKey));
 $('gap-statistics-scope').textContent=`${statsSnapshot.accountName} · 打开时筛选的 ${summary.total} 个阵容`;
 $('gap-statistics-progress').textContent=`已精算 ${summary.done} / ${summary.total}${matchPaused?' · 已暂停':summary.pending?worker?' · 精算中':' · 尚有未完成项':''}${summary.unknown?' · '+summary.unknown+' 个待补资料':''}${summary.errors?' · '+summary.errors+' 个异常':''}`;
 $('gap-statistics-progressbar').max=Math.max(1,summary.total);$('gap-statistics-progressbar').value=summary.done;
 $('gap-statistics-pause').hidden=!worker;$('gap-statistics-pause').textContent=matchPaused?'继续精算':'暂停精算';$('gap-statistics-retry').hidden=!!worker||!summary.pending&&!summary.errors;
 const nextKey=JSON.stringify(summary);if(nextKey===statsRenderKey)return;statsRenderKey=nextKey;
 const section=(key,title,items)=>`<section class="gap-ranking"><h3>${title}</h3>${items.length?items.map(item=>`<details data-gap-key="${esc(key+':'+item.key)}" ${open.has(key+':'+item.key)?'open':''}><summary><span>${key==='souls'&&soulAsset(item.name)?gameImage(soulAsset(item.name)):['heroes','training'].includes(key)?thumb({kind:'shikigami',shikigamiId:item.key,name:item.name}):''}<strong>${esc(item.name)}</strong></span><b>${item.count} 个阵容</b></summary><ul>${item.lineups.map(l=>`<li><button class="text-button" data-stat-detail="${esc(l.id)}">${esc(l.title)}</button><small>${esc(l.reasons.join('；'))}</small></li>`).join('')}</ul></details>`).join(''):'<p class="muted">暂无已确认缺口</p>'}</section>`;
 $('gap-statistics-body').innerHTML=section('heroes','缺少式神',summary.heroes)+section('souls','缺少符合要求的御魂套装',summary.souls)+(summary.training.length?section('training','式神培养不足',summary.training):'')+(summary.otherSouls.length?section('otherSouls','其他御魂差距',summary.otherSouls):'');
}
function skillMarkup(m,result){
 const gaps=result?.heroGaps?.filter(g=>g.kind==='skill')||[];
 return `<div class="skill-requirements">${m.skills?.length?m.skills.map(s=>{const a=gameAsset(m.kind==='onmyoji'?'onmyojiSkill':'shikigamiSkill',(m.onmyojiId||m.shikigamiId)+':'+s.id);return `<div class="skill-item">${gameImage(a)}<span>${esc(a?.name||'技能 '+s.id)} <b>${s.exact?'=':'≥'}${s.level}级</b></span>${gaps.filter(g=>g.skill===s.id).map(g=>`<small class="inline-gap">${esc(g.text)}</small>`).join('')}</div>`;}).join(''):'<span class="muted">原码未限制技能等级</span>'}</div>`;
}
function soulDetail(m,build,slot){
 const q=build?.soulIds?.map(id=>account()?.souls[id]).find(q=>q?.slot===slot),config=m.config||{},required=config.mainStats?.[slot]||[],gaps=q?C.equipmentGaps([q],config,DATA.effects).filter(g=>g.slot===slot):[];
 return `<h4>${slot}号位 · ${q?esc(q.set):'尚无配装候选'}</h4><p class="caption">主属性要求：${required.length?esc(required.map(s=>C.STAT_NAMES[s]||s).join(' / ')):'未限制'}；强化 ${esc((config.levelRange||[0,15]).join('～'))} 级${config.sixStarOnly?'；六星':''}</p>${q?`<div class="selected-soul">${gameImage(soulAsset(q.set),'selected-soul-icon')}<div><strong>${q.star}星 · +${q.level}</strong><p>${esc(C.STAT_NAMES[q.mainStat])} ${esc(attrValue(q.mainStat,q.raw.mainAttrValue))}</p><dl>${q.raw.subAttributes.map(s=>`<dt>${esc(C.STAT_NAMES[C.STAT_TYPES[s.type]]||s.type)}</dt><dd>${esc(attrValue(C.STAT_TYPES[s.type],s.value))}</dd>`).join('')}</dl><small>库存实例 ${esc(q.id)}</small></div></div>`:'<p>精算得到候选后，这里显示该位置的实际主、副属性与库存实例。</p>'}${gaps.map(g=>`<p class="inline-gap">${esc(g.text)}</p>`).join('')}`;
}
function buildMarkup(member,build){
 const c=member.config||{},souls=(build?.soulIds||[]).map(id=>account()?.souls[id]).filter(Boolean),gaps=build?C.panelGaps(build.panel,c,build.objective):[],slots=[1,6,2,5,3,4];
 return `<div class="soul-ring"><div class="soul-center">${thumb(member)}<small>点击任意御魂位</small></div>${slots.map(slot=>{const q=souls.find(s=>s.slot===slot);return `<button class="soul-slot slot-${slot}" data-soul-slot="${slot}" data-member-index="${member.index}" aria-label="查看${slot}号位御魂"><span class="slot-no">${slot}号位</span>${gameImage(q?soulAsset(q.set):gameAsset('yuhun','300000'))}<strong>${esc(q?.set||'待配装')}</strong><small>${q?q.star+'星 · +'+q.level:'查看位置要求'}</small></button>`;}).join('')}</div><div class="soul-inspector" id="soul-inspector-${member.index}">${soulDetail(member,build,1)}</div><div class="panel-values">${['attack','hp','defense','speed','crit','critDamage','effectHit','effectResist'].map(stat=>{const range=(c.ranges||[]).filter(r=>r.stat===stat),gap=gaps.filter(g=>g.stat===stat);return `<div class="${gap.length?'has-gap':''}"><span>${esc(C.STAT_NAMES[stat])}</span><strong>${build?esc(C.formatStat(stat,build.panel[stat])):'待计算'}</strong>${range.length?`<small>要求 ${esc(propertyText({ranges:range}))}</small>`:''}${gap.map(g=>`<small class="inline-gap">${g.side==='min'?'还差':'超出'} ${esc(C.formatStat(stat,g.delta))}</small>`).join('')}</div>`;}).join('')}</div>`;
}
function memberDetail(m){
 const result=currentDialog?matchResults[currentDialog.id]:null,row=result?.members.find(x=>x.index===m.index),build=result?.assignment?.find(x=>x.index===m.index)||result?.gapAssessment?.assignment?.find(x=>x.index===m.index)||row?.closest,config=m.config;
 const otherGaps=(row?.heroGaps||[]).filter(g=>g.kind!=='skill'),sets=config?.suitRequirements||[],equipmentGaps=(build?.gaps||[]).filter(g=>['set','pair'].includes(g.kind));
 if(m.kind==='shikigami'&&account()){const need=currentDialog.members.filter(x=>x.occupied!==false&&x.shikigamiId===m.shikigamiId&&!x.borrowed).length,have=Object.values(account().heroes).filter(h=>h.shikigamiId===m.shikigamiId).length;if(need>have)otherGaps.push({text:`本阵容共需 ${need} 个${m.name}实例，当前库存只有 ${have} 个；同队不可重复占用。`});}
 return `<article class="member-detail readable-member" data-member="${m.index}"><header>${thumb(m)}<div><h3>${esc(m.name)}</h3><p>${m.kind==='onmyoji'?'阴阳师 / 英杰 · '+(m.level||'未指定')+'级':(m.levelMode==='recommended'?'推荐 ':'')+(m.level||'未指定')+'级 · '+(m.star||'未指定')+'星 · '+(m.awakening===1?'觉醒':m.awakening===0?'未觉醒':'觉醒未限制')}</p></div></header>${otherGaps.map(g=>`<p class="inline-gap">${esc(g.text)}</p>`).join('')}<h4>技能要求</h4>${skillMarkup(m,row)}${m.kind==='onmyoji'?`${qilingMarkup(m.qiling)}`:`<h4>御魂要求</h4><div class="suit-requirements">${sets.map(r=>`<div>${gameImage(soulAsset(r.name))}<span>${esc(r.name)} <b>${r.count}件</b></span></div>`).join('')}${(config?.twoPieceStats||[]).map(s=>`<span>${esc(C.STAT_NAMES[s]||s)}两件套</span>`).join('')}${!sets.length&&!config?.twoPieceStats?.length?'<span>散件 / 未限制套装</span>':''}</div>${equipmentGaps.map(g=>`<p class="inline-gap">${esc(g.text)}</p>`).join('')}<p class="caption">目标：${esc(C.METRICS[config?.metricId]?.[0]||'满足约束')} · ${build?(result?.gapAssessment?.assignment?'补齐式神后的御魂方案':result?.proof?.state==='optimal'?'最优配装':'诊断 / 当前候选'):'等待精算'}</p>${buildMarkup(m,build)}${row?.suggestions?.length?`<details class="improvement-advice"><summary>建议优先补什么</summary><p class="caption">以下针对当前诊断候选，不代表唯一补法；原码要求保持不变。</p><ol>${row.suggestions.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details>`:''}${row?.reasons?.length?`<details class="member-reasons"><summary>配装核对项</summary>${row.reasons.map(r=>`<p>${esc(r)}</p>`).join('')}</details>`:''}`}${m.aiSkill!=null?`<p class="caption">自动技能设置：${esc(JSON.stringify(m.aiSkill))} · 按原码在游戏内设置</p>`:''}<details class="protocol-fields"><summary>高级要求与原码字段</summary><p>${esc(propertyText(config))}</p><p>计算目标：${esc(C.objectiveFormula(m.shikigamiId,config?.metricId))}</p><p>额外属性：${esc(JSON.stringify(config?.extraAttributes||{}))}</p>${protocolDetails(m)}</details></article>`;
}
function showLineup(l){
 currentDialog=l;const result=matchResults[l.id],proof=result?.proof,a=result?.gapAssessment;
 const evidence=result?`<details class="proof-summary"><summary>核对依据${a?.souls==='pending'?' · 御魂计算中':a?.souls==='unknown'?' · 有待核对项':''}</summary><p>${esc(result.label)}</p>${proof?`<p>${esc(proof.scope)} · 已搜索 ${proof.nodes.toLocaleString()} 个节点</p>`:''}${a?.assumptions?.length?`<p>御魂方案按补齐以下式神条件计算：${a.assumptions.map(m=>esc(m.name+' '+m.level+'级 '+m.star+'星 '+(m.awake?'觉醒':'未觉醒')+'，技能达到原码要求')).join('；')}。</p>`:''}${a?.reason?`<p>${esc(a.reason)}</p>`:''}${[...new Set([...(result.reasons||[]),...(result.checks||[])])].map(r=>`<p>${esc(r)}</p>`).join('')}</details>`:'';
 const body=`<div class="detail-status">${badge(l)}${gapBadges(result)}</div><div class="detail-actions"><code class="mono small">${esc(l.code)}</code><div class="actions"><button id="copy-lineup" class="primary">复制阵容码</button><button id="parse-lineup" class="secondary">重新解析</button><button data-edit-lineup="${esc(l.id)}" class="secondary">编辑</button><button data-delete-lineup="${esc(l.id)}" class="danger">删除</button><details class="more-actions"><summary>更多操作</summary><div class="actions"><button data-recalculate="${esc(l.id)}" class="secondary">重新计算</button><button id="refresh-detail" class="secondary">刷新结果</button><button id="export-lineup" class="secondary">导出资料</button></div></details></div></div>${evidence}${!C.hasParsedContent(l)?`<div class="notice">${esc(AtlasParseErrors.fromRecord(l)?.message||'尚未解析，登录后可查询成员要求。')}</div>`:''}<div class="member-detail-grid">${(l.members||[]).filter(m=>m.occupied!==false).map(memberDetail).join('')}</div>${l.notes||l.alternatives||l.sourceUrl?`<div class="detail-section"><h3>操作与备注</h3>${l.notes?`<p class="detail-notes">${esc(l.notes)}</p>`:''}${l.alternatives?`<p>${esc(l.alternatives)}</p>`:''}${l.sourceUrl?link(l.sourceUrl,l.author||'阵容来源'):''}</div>`:''}<details class="detail-section"><summary>来源与原始配置</summary><p class="caption">${esc(l.classificationSource||'')}${l.gameSceneId!=null?' · 副本 ID '+esc(l.gameSceneId):''}</p><pre class="json">${esc(JSON.stringify(l.raw||l,null,2))}</pre></details>`;
 openDialog(l.title,classificationCaption(l),body);renderReparseButtons();
}
function renderManage(){
 if(!DATA)return;const query=$('manage-search').value.trim().toLowerCase(),status=$('manage-status').value,rows=lineups().filter(l=>(!query||JSON.stringify(l).toLowerCase().includes(query))&&(!status||status==='failed'&&AtlasParseErrors.fromRecord(l)||status==='expired'&&AtlasParseErrors.isExpired(l)||status==='pending'&&!C.hasParsedContent(l)||status==='parsed'&&C.hasParsedContent(l))),pages=Math.max(1,Math.ceil(rows.length/20));managePage=Math.min(managePage,pages);
 const expired=lineups().filter(AtlasParseErrors.isExpired).length;
 $('manage-count').textContent=`${rows.length} 个阵容 · ${expired} 个已失效`;
 $('manage-clear-expired').disabled=!expired||libraryBusy;$('manage-clear-expired').textContent=`一键清理失效码（${expired}）`;
 $('manage-list').innerHTML=rows.length?`<table class="management-table"><thead><tr><th>阵容 / 副本</th><th>成员</th><th>状态 / 原码</th><th>操作</th></tr></thead><tbody>${rows.slice((managePage-1)*20,managePage*20).map(l=>`<tr><td><strong>${esc(l.title)}</strong><p>${esc(classificationCaption(l,'',''))}</p></td><td>${heroTeam(l)}</td><td><small>${esc(AtlasParseErrors.fromRecord(l)?.label||(C.hasParsedContent(l)?'已解析':'待解析'))}</small><details><summary>查看原码</summary><code>${esc(l.code)}</code></details></td><td><div class="actions"><button data-detail="${esc(l.id)}" class="secondary">查看</button><button data-edit-lineup="${esc(l.id)}" class="secondary">编辑</button><button data-reparse="${esc(l.id)}" class="ghost">解析</button><button data-delete-lineup="${esc(l.id)}" class="danger">删除</button></div></td></tr>`).join('')}</tbody></table>`:'<div class="empty">没有符合条件的阵容。</div>';
 $('manage-page').textContent=`${managePage} / ${pages}`;$('manage-prev').disabled=managePage===1;$('manage-next').disabled=managePage===pages;renderReparseButtons();
}
function editLineup(id){const l=lineups().find(l=>l.id===id);if(!l)return;manageEditing=l;openDialog('编辑阵容',l.title,`<div class="management-editor"><label>阵容原码<textarea id="edit-code" rows="3">${esc(l.code)}</textarea></label><label>名称<input id="edit-title" value="${esc(l.title)}"></label><div class="form-grid"><label>一级分类<input id="edit-category" value="${esc(l.category)}"></label><label>二级分类<input id="edit-subcategory" value="${esc(l.subcategory||'自定义')}"></label><label>分组（可留空）<input id="edit-section" value="${esc(l.section||'')}"></label><label>副本<input id="edit-dungeon" value="${esc(l.dungeon)}"></label></div><label>备注<textarea id="edit-notes" rows="5">${esc(l.notes||'')}</textarea></label><label class="check"><input id="edit-auto-category" type="checkbox" ${l.manualClassification?'':'checked'}>自动按解析关卡及来源用途分类</label><p class="caption">原码变更将清除旧解析配置，保留本次管理信息。成员、技能与御魂要求不可手动改写。</p><button id="save-lineup-management" class="primary">保存修改</button></div>`);}
async function saveLineupManagement(){
 const old=manageEditing;if(!old)return;let code=C.normalizeCode($('edit-code').value);if(C.classifyCode(code)==='lineup-data')code='#TA#'+code;if(!['pipe-ta','hash-ta'].includes(C.classifyCode(code)))return toast('请输入完整阵容码');if(lineups().some(l=>l.id!==old.id&&l.code===code))return toast('此原码已在阵容库中，请编辑已有记录');
 const changed=old.code!==code,base=changed?{id:old.id,sourceKind:'user',members:[],requirementsComplete:false,decodeState:'unattempted'}:old;
 const updated={...base,...C.codeProvenance($('edit-code').value),code,title:$('edit-title').value.trim()||'未命名阵容',category:$('edit-category').value.trim()||'其他',subcategory:$('edit-subcategory').value.trim()||'自定义',section:$('edit-section').value.trim()||undefined,dungeon:$('edit-dungeon').value.trim()||'待分类',notes:$('edit-notes').value,manualClassification:!$('edit-auto-category').checked,updatedAt:new Date().toISOString()};updated.dungeons=[updated.dungeon];
 libraryParser?.cancel();stopMatch();const previous=STATE.lineups;STATE.lineups=[...STATE.lineups.filter(l=>l.id!==old.id),updated];if(!await persist()){STATE.lineups=previous;return;}
 delete matchResults[old.id];createLibraryParser(sessionRevision);$('detail-dialog').close();fillFilters();renderManage();renderLibrary();refreshAvailability();toast('管理信息已保存'+(changed?'；原码已更换，等待重新解析':''));
}
function confirmLineupRemoval(ids,{expiredOnly=false}={}){
 if(libraryBusy||bulkBusy)return toast('正在保存阵容库，请稍候');
 const selected=new Set(ids),rows=lineups().filter(l=>selected.has(l.id)&&(!expiredOnly||AtlasParseErrors.isExpired(l)));
 if(!rows.length)return toast('没有需要删除的阵容');
 pendingRemoval={items:rows.map(l=>({id:l.id,code:l.code})),expiredOnly};
 openDialog(expiredOnly?'清理失效阵容码':'删除阵容',`即将从本机阵容库移除 ${rows.length} 条记录`,
  `<p>将删除下列阵容的原码和本地解析记录。删除的预设不会在重启或更新后自动出现；需要时可以重新添加原码或恢复备份。</p><ul class="removal-preview">${rows.map(l=>`<li><strong>${esc(l.title)}</strong><small>${DATA.lineups.some(p=>p.id===l.id)?'软件预设':'自行添加'} · ${esc(l.dungeon||'待分类')}</small><code>${esc(l.code)}</code></li>`).join('')}</ul><div class="actions"><button id="confirm-remove-lineups" class="danger">确认删除 ${rows.length} 条</button><button id="cancel-remove-lineups" class="secondary">取消</button></div>`);
}
async function removeConfirmedLineups(){
 if(!pendingRemoval||libraryBusy||bulkBusy)return;
 const request=pendingRemoval,rows=lineups().filter(l=>request.items.some(r=>r.id===l.id&&r.code===l.code)&&(!request.expiredOnly||AtlasParseErrors.isExpired(l)));
 if(!rows.length){pendingRemoval=null;$('detail-dialog').close();toast('记录已变化，没有需要删除的阵容');return;}
 libraryBusy=true;const previous=STATE,button=$('confirm-remove-lineups');button.disabled=true;$('close-dialog').disabled=true;
 // Cancel before persisting: an outstanding query must not recreate a row.
 libraryParser?.cancel();stopMatch();clearTimeout(codeTimer);codeRevision++;
 STATE=C.removeLibraryLineups(STATE,DATA.lineups,rows.map(l=>l.id));
 try{
  if(!await persist()){STATE={...STATE,lineups:previous.lineups,deletedPresetIds:previous.deletedPresetIds,targetLineups:previous.targetLineups};return;}
  for(const l of rows)delete matchResults[l.id];
  if(rows.some(l=>l.code===C.normalizeCode($('code-input').value))){
   for(const id of ['code-input','code-title','code-dungeon','code-notes'])$(id).value='';
   updateCode();
  }
  currentDialog=null;manageEditing=null;pendingRemoval=null;page=managePage=1;
  $('detail-dialog').close();toast(`已删除 ${rows.length} 条阵容，重启后仍生效`);
 }finally{
  libraryBusy=false;button.disabled=false;$('close-dialog').disabled=false;
  createLibraryParser(sessionRevision);fillFilters();renderManage();if(view==='library')renderLibrary();refreshAvailability();
 }
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-target-directory')){$('clear-filters').click();targetOnly=true;page=1;renderLibrary();}
 if(b.dataset.statDetail){const l=lineups().find(l=>l.id===b.dataset.statDetail);if(l)showLineup(l);}
 if(b.hasAttribute('data-browse-home')||b.dataset.browsePath){browseTo(b.dataset.browsePath||'');window.scrollTo(0,0);}
 if(b.dataset.editLineup)editLineup(b.dataset.editLineup);
  if(b.dataset.deleteLineup)confirmLineupRemoval([b.dataset.deleteLineup]);
  if(b.hasAttribute('data-delete-expired'))confirmLineupRemoval(lineups().filter(AtlasParseErrors.isExpired).map(l=>l.id),{expiredOnly:true});
  if(b.id==='confirm-remove-lineups')removeConfirmedLineups();
  if(b.id==='cancel-remove-lineups'&&!libraryBusy){pendingRemoval=null;$('detail-dialog').close();}
  if(b.hasAttribute('data-add-code'))$('add-code').click();
  if(b.hasAttribute('data-add-bulk'))$('add-bulk').click();
 if(b.id==='save-lineup-management')saveLineupManagement();
 if(b.dataset.recalculate){startMatch([b.dataset.recalculate]);toast('本阵容已重新开始全局精算，可点击刷新计算结果查看进度');}
 if(b.id==='refresh-detail'&&currentDialog)showLineup(lineups().find(l=>l.id===currentDialog.id)||currentDialog);
 if(b.dataset.soulSlot&&currentDialog){const m=currentDialog.members.find(m=>m.index===Number(b.dataset.memberIndex)),r=matchResults[currentDialog.id],row=r?.members.find(x=>x.index===m.index),build=r?.assignment?.find(x=>x.index===m.index)||r?.gapAssessment?.assignment?.find(x=>x.index===m.index)||row?.closest;$('soul-inspector-'+m.index).innerHTML=soulDetail(m,build,Number(b.dataset.soulSlot));b.closest('.soul-ring').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));}
 if(b.id==='retry-parse-failures')startLibraryParse({codes:lineups().filter(l=>AtlasParseErrors.fromRecord(l)&&!AtlasParseErrors.isExpired(l)).map(l=>l.code),force:true});
 if(b.id==='export-parse-failures')exportJSON('御契-解析失败清单.json',lineups().filter(l=>AtlasParseErrors.fromRecord(l)).map(l=>({title:l.title,code:l.code,reason:AtlasParseErrors.fromRecord(l).message,failure:AtlasParseErrors.fromRecord(l),at:l.lastParseAttemptAt})));
});
for(const id of ['manage-search','manage-status'])$(id).addEventListener(id==='manage-search'?'input':'change',()=>{managePage=1;renderManage();});
$('manage-prev').onclick=()=>{managePage--;renderManage();};$('manage-next').onclick=()=>{managePage++;renderManage();};
window.addEventListener('atlas-login-status',resolveServerNames);
$('detail-dialog').addEventListener('cancel',e=>{if(libraryBusy)e.preventDefault();});
