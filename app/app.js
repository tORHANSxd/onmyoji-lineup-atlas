'use strict';
const C=AtlasCore,$=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const link=(url,label)=>`<a href="${esc(safeURL(url))}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
let DATA,STATE={schemaVersion:1,lineups:[],deletedPresetIds:[],accounts:[],activeAccount:''},view='library',page=1,accountPage=1,selectedMembers=[],worker=null,matchResults={},currentCodeResult=null,currentDialog=null,detailState='unawakened',toastTimer,sessionRevision=0,libraryBusy=false,appBoot=Promise.resolve();
let terminalBrowsePath='',selectedLineups=new Set(),selectionFilter='',targetOnly=false,targetSaving=false;
const targetIds=()=>new Set(STATE.targetLineups?.[STATE.activeAccount]||[]);
const todayCN=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
const account=()=>STATE.accounts.find(a=>a.id===STATE.activeAccount);
let lineupCache=null;const searchTexts=new WeakMap();
function lineups(){
 if(!DATA)return [];
 const source=STATE.lineups,deleted=STATE.deletedPresetIds||[],replacements=STATE.lineupReplacements,cached=lineupCache;
 if(cached&&cached.data===DATA&&cached.base===DATA.lineups&&cached.replacements===replacements&&cached.source.length===source.length&&cached.source.every((l,i)=>l===source[i])&&cached.deleted.length===deleted.length&&cached.deleted.every((id,i)=>id===deleted[i]))return cached.rows;
 const rows=C.libraryLineups(DATA.lineups,STATE).map(l=>AtlasCategories.resolve(l,DATA));
 lineupCache={data:DATA,base:DATA.lineups,source:[...source],deleted:[...deleted],replacements,rows};return rows;
}
function searchText(lineup){let text=searchTexts.get(lineup);if(text==null){text=JSON.stringify(lineup).toLowerCase();searchTexts.set(lineup,text);}return text;}
const inputTimers=new Map();
function deferInput(key,fn){clearTimeout(inputTimers.get(key));inputTimers.set(key,setTimeout(()=>{inputTimers.delete(key);fn();},100));}
function toast(message){if($('detail-dialog').open){$('dialog-feedback').textContent=message;$('dialog-feedback').hidden=false;}$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),5000);}
async function browserDB(action,value){return new Promise((resolve,reject)=>{const r=indexedDB.open('onmyoji-atlas',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('state',action==='get'?'readonly':'readwrite'),s=t.objectStore('state'),q=action==='get'?s.get('main'):s.put(value,'main');q.onerror=()=>reject(q.error);t.oncomplete=()=>{db.close();resolve(q.result);};t.onerror=()=>reject(t.error);};});}
function jsonTask(action,value){
 return new Promise((resolve,reject)=>{const job=new Worker('json-worker.js');job.onmessage=({data})=>{job.terminate();data.error?reject(Error(data.error)):resolve(data.value);};job.onerror=e=>{job.terminate();reject(Error(e.message));};try{job.postMessage({action,value});}catch(error){job.terminate();reject(error);}});
}
const readDesktopData=async()=>atlas.loadDataText?jsonTask('parse',await atlas.loadDataText()):atlas.loadData();
const readDesktopState=async()=>atlas.loadStateText?jsonTask('load-state',await atlas.loadStateText()):jsonTask('restore-state',await atlas.loadState());
const sameSession=revision=>revision===sessionRevision;
let stateWrites=Promise.resolve(),dataRevision=0,parsedSnapshotReady=false;
function invalidatePendingImports(){dataRevision++;clearTimeout(codeTimer);codeRevision++;}
function commitState(change,revision=sessionRevision,parseGuard=null,expectedState=null,changeGuard=null){
 const pending=stateWrites.then(async()=>{
  if(!sameSession(revision)||parseGuard&&!parseGuard()||expectedState&&STATE!==expectedState||changeGuard&&!changeGuard())return false;
  try{
   const next=typeof change==='function'?change(STATE):change;
   if(window.atlas){
     const parsed=parseGuard&&window.TALogin?.status().authenticated;
     const onlyLineups=Object.keys({...STATE,...next}).every(k=>k==='lineups'||STATE[k]===next[k]);
     let saved;
     if(!parseGuard&&atlas.saveStateFieldsText&&STATE.accounts!==next.accounts&&STATE.lineups===next.lineups){
      const {lineups:unchanged,...fields}=next,text=await jsonTask('stringify',fields);
      if(!sameSession(revision)||changeGuard&&!changeGuard())return false;
      saved=await atlas.saveStateFieldsText(text);if(saved?.saved)parsedSnapshotReady=true;
     }
     if(parsed&&parsedSnapshotReady&&onlyLineups&&atlas.saveParsedDelta){
      const old=new Map(STATE.lineups.map(l=>[l.id,l])),ids=new Set(next.lineups.map(l=>l.id));
      saved=await atlas.saveParsedDelta({upserts:next.lineups.filter(l=>old.get(l.id)!==l),removeIds:STATE.lineups.filter(l=>!ids.has(l.id)).map(l=>l.id)});
     }
     if(!saved||saved.needsSnapshot){
      if(atlas.saveStateText){const text=await jsonTask('stringify',next);if(!sameSession(revision)||parseGuard&&!parseGuard()||changeGuard&&!changeGuard())return false;await (parsed?atlas.saveParsedStateText(text):atlas.saveStateText(text));}
      else await (parsed?atlas.saveParsedState(next):atlas.saveState(next));parsedSnapshotReady=true;
     }
    }else await browserDB('put',next);
   // Always acknowledge a committed snapshot, even if its caller was cancelled.
   STATE=next;if(!sameSession(revision))return false;
   if($('storage-error'))$('storage-error').hidden=true;return (!parseGuard||parseGuard())&&(!changeGuard||changeGuard());
  }catch(error){
   if(sameSession(revision)){const message='保存失败：'+error.message+'。原有数据保留，请检查存储空间后重试。';toast(message);if($('storage-error')){$('storage-error').hidden=false;$('storage-error-text').textContent=message;}}
   return false;
  }
 });stateWrites=pending.catch(()=>{});return pending;
}
function persist(revision=sessionRevision,parseGuard=null){return commitState(STATE,revision,parseGuard);}
async function copyCode(button,code){
 if(!C.hasLineupCode({code}))return toast('没有可复制的阵容码');
 const label=button.dataset.copyLabel||button.textContent;button.dataset.copyLabel=label;button.disabled=true;button.dataset.copyState='copying';button.textContent='复制中…';
 try{
  if(window.atlas?.copyCode){const result=await atlas.copyCode(code);if(!result?.copied)throw new Error('未完成剪贴板写入');}
  else{
   try{if(!navigator.clipboard?.writeText)throw new Error('剪贴板接口不可用');await navigator.clipboard.writeText(code);}
   catch{const input=document.createElement('textarea');input.className='clipboard-transfer';input.value=code;input.setAttribute('aria-label','待复制的阵容码');($('detail-dialog').open?$('detail-dialog'):document.body).append(input);const focused=document.activeElement;try{input.select();if(!document.execCommand('copy'))throw new Error('浏览器未允许复制');}finally{input.remove();focused?.focus();}}
  }
  button.dataset.copyState='success';button.textContent='已复制';toast('原始阵容码已复制');
 }catch(e){button.dataset.copyState='failed';button.textContent=label;toast('复制失败：'+e.message+'。可选中详情顶部的原码手动复制。');}
 finally{button.disabled=false;}
}
function selectView(name){
 const pages={builder:['阵容制作器','按游戏规则配置成员、技能和御魂，生成阵容码。'],library:['阵容库','按副本找阵容，用自己的库存核对差距。'],decode:['阵容码查看','解析原码，核对成员、技能与御魂要求。'],accounts:['我的账号','查看本地库存，为阵容匹配选择账号。'],manage:['阵容库管理','整理原码、分类与备注，处理失败和失效记录。'],audit:['来源与覆盖','核对资料来源、资源覆盖和计算范围。']};
 if(!pages[name]||!DATA)return;view=name;if(name==='builder')renderBuilder();
 document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+name);
 document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===name);if(el.matches('.nav')){if(el.dataset.view===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}});
 $('add-code').hidden=name!=='library';$('add-bulk').hidden=name!=='library';$('account-selector').hidden=!['library','accounts','manage'].includes(name);
 $('page-title').textContent=pages[name][0];$('page-description').textContent=pages[name][1];
 if(name==='library')renderLibrary();if(name==='manage')renderManage();if(name==='accounts')renderAccounts();if(name==='audit')renderAudit();window.scrollTo(0,0);
}
let indexedData=null,assetIndex=null;
function dataIndex(){if(indexedData!==DATA){indexedData=DATA;assetIndex={roster:new Map(DATA.roster.map(r=>[String(r.id),r])),game:new Map((DATA.gameAssets?.items||[]).map(a=>[a.library+':'+a.id,a])),souls:new Map((DATA.gameAssets?.items||[]).filter(a=>a.library==='yuhun').map(a=>[a.name,a]))};}return assetIndex;}
function rosterById(id){return DATA?dataIndex().roster.get(String(id)):null;}
function actorFor(m){return (DATA.actors||[]).find(a=>(m.onmyojiId&&a.gameId!=null&&String(a.gameId)===m.onmyojiId)||a.name===m.name||a.aliases?.includes(m.name));}
function resourceFor(m){return m.kind==='onmyoji'?actorFor(m):rosterById(m.shikigamiId);}
function variant(r,state,kind='art'){if(r?.sourceRegion)state='unawakened';if(state==='awakened'&&r?.assets?.awakeningAvailability==='not_applicable')return null;return r?.assets?.variants?.find(a=>a.family===`${kind==='art'?'art':'portrait'}-${state==='awakened'?'after':'before'}`&&a.status==='downloaded_valid_image');}
function imagePath(a){if(a&&/^[a-f0-9]{64}\.(png|jpg)$/.test(a.cacheFile))return window.atlas?'atlas-asset://cache/'+a.cacheFile:'/cache/'+a.cacheFile;return a&&/^data\/images\/(?:\d+|actors\/[a-z]+|game\/[a-zA-Z]+)\/[a-z0-9-]+\.(png|jpg)$/.test(a.localPath)?'../'+a.localPath:null;}
function thumb(m,state){const r=resourceFor(m),s=r?.assets?.awakeningAvailability==='not_applicable'?'unawakened':m.awakening===1?'awakened':m.awakening===0?'unawakened':state||'unawakened',local=gameAsset(m.kind==='onmyoji'?'onmyoji':'daruma',m.onmyojiId||m.shikigamiId),a=variant(r,s,'portrait')||variant(r,s),src=local?'../'+local.localPath:imagePath(a);return src?`<img class="avatar" src="${src}" alt="${esc(m.name||r?.name)}" loading="lazy">`:'<span class="image-unavailable" aria-label="成员身份或图片尚未取得"></span>';}

function heroTeam(l){let members=l.members?.filter(m=>m.occupied!==false)||[];if(!members.length)members=[...Array.from({length:5},(_,i)=>({name:'待解析',index:i,unknown:true})),{kind:'onmyoji',name:'未指定'}];return `<div class="team-thumbs">${members.map(m=>`<div class="team-member ${m.kind==='onmyoji'?'onyo':''}" title="${esc(m.name)}">${m.unknown?'<span class="image-unavailable" aria-label="待解析"></span>':thumb(m)}<span>${esc(m.name)}</span></div>`).join('')}</div>`;}
function badge(l){
 const result=matchResults[l.id];
 if(result)return `<span class="badge ${gapKinds(result).length?'bad':result.gapCategory==='ready'?'good':'warning'}">${esc(matchStatus(result))}</span>`;
 return `<span class="badge ${l.members?.length?'':'warning'}">${C.hasParsedContent(l)?'已解析':l.members?.length?'参考方案':'待解析'}</span>`;
}
const gapLabels={hero:'式神缺少',soul:'御魂不达标',training:'式神技能或等级或觉醒不达标'};
function gapKinds(result){
 const a=result?.gapAssessment;
 if(!a)return [];
 return [a.heroShortage>0?'hero':null,a.souls==='missing'?'soul':null,a.heroTraining>0?'training':null].filter(Boolean);
}
function matchStatus(result){
 if(!result)return '未核对';
 if(result.proof?.state==='error')return '计算异常';
 if(gapKinds(result).length)return '有差距';
 if(result.gapAssessment?.souls==='uncomputed')return '未精算';
 if(!result.completed&&result.proof?.state==='stopped')return '精算已停止';
 if(!result.completed&&result.proof?.state==='computing')return result.ready?'已达标 · 继续优化':'精算中';
 if(result.gapCategory==='ready')return '式神御魂达标';
 return result.gapCategory==='pending'?'精算中':'待核对';
}
function pathSelected(p,category=$('category').value,subcategory=$('subcategory').value,query=$('dungeon').value){return (!category||p.category===category)&&(!subcategory||p.subcategory===subcategory)&&AtlasCategories.searchMatches(p,query);}
function classificationCaption(l,category=$('category').value,subcategory=$('subcategory').value,query=$('dungeon').value){return AtlasCategories.caption(l.classificationPaths.find(p=>pathSelected(p,category,subcategory,query))||l.classificationPaths[0]);}
function filteredLineups(){const query=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean),category=$('category').value,dungeon=$('dungeon').value,source=$('source-filter').value,status=$('status-filter').value,targets=targetOnly?targetIds():null,users=source==='user'?new Set(STATE.lineups.map(l=>l.id)):null;return lineups().filter(l=>{
 if(targets&&!targets.has(l.id))return false;
 if(terminalBrowsePath&&dungeon===terminalBrowsePath&&!l.classificationPaths.some(p=>AtlasCategories.caption(p)===terminalBrowsePath))return false;
 if(!l.classificationPaths.some(p=>pathSelected(p,category,$('subcategory').value,dungeon)))return false;
 if(account()&&$('gap-filter').value&&!gapKinds(matchResults[l.id]).includes($('gap-filter').value))return false;
 if(source==='excel'&&!l.sourceFile&&!l.occurrences?.some(o=>o.sourceFile))return false;if(source==='web'&&!l.sourceKind?.startsWith('web'))return false;if(source==='user'&&!users.has(l.id))return false;
 if(status==='structured'&&!l.members?.length)return false;if(status==='pending'&&l.members?.length)return false;
 const result=matchResults[l.id];
 if(['available','ready'].includes(status)&&!(result?.ready&&result.gapCategory==='ready'))return false;
 if(status==='missing'&&!gapKinds(result).length)return false;
 if(status==='unknown'&&!(result?.completed&&result.gapCategory==='unknown'))return false;
 if(!selectedMembers.every(id=>l.members?.some(m=>m.shikigamiId===id)))return false;
  return !query.length||query.every(q=>searchText(l).includes(q));
});}
function renderLibrary(){
 if(view!=='library')return;
 const focused=document.activeElement,focusAttr=[...(focused?.attributes||[])].find(a=>/^data-(select-lineup|detail|copy|reparse|edit-lineup|delete-lineup)$/.test(a.name));
 refreshAvailability();
 const ls=AtlasLibrary.sort(filteredLineups(),$('lineup-sort').value,(a,b)=>C.compareMatches(matchResults[a.id],matchResults[b.id]));
 const signature=JSON.stringify([STATE.activeAccount,targetOnly,selectedMembers,...['search','category','subcategory','dungeon','source-filter','status-filter','gap-filter'].map(id=>$(id).value)]);
 if(signature!==selectionFilter){selectedLineups.clear();selectionFilter=signature;}
 const visible=new Set(ls.map(l=>l.id));selectedLineups=new Set([...selectedLineups].filter(id=>visible.has(id)));

 page=Math.max(1,Math.min(page,Math.ceil(ls.length/24)||1));
 const category=$('category').value,subcategory=$('subcategory').value,query=$('dungeon').value.trim(),paths=ls.flatMap(l=>l.classificationPaths).filter(p=>pathSelected(p));
 const exactPath=query&&paths.find(p=>AtlasCategories.caption(p)===query||AtlasCategories.caption(p).startsWith(query+' → '));
 const prefix=exactPath?query.split(' → '):category?[category,subcategory].filter(Boolean).filter((s,i,a)=>!i||s!==a[i-1]):[],groups=new Map();
 const browsing=!(terminalBrowsePath&&query===terminalBrowsePath)&&!targetOnly&&!$('search').value.trim()&&!selectedMembers.length&&(!subcategory||category)&&(!query||exactPath)&&paths.some(p=>AtlasCategories.segments(p).length>prefix.length);
 const browseAttrs=parts=>`data-browse-path="${esc(parts.join(' → '))}"${parts.length===1?' data-browse-category="'+esc(parts[0])+'"':parts.length===2?' data-browse-sub="'+esc(parts[1])+'"':''}`;
 $('category-browser').hidden=!browsing&&!prefix.length;$('lineup-grid').hidden=false;$('lineup-grid').classList.toggle('category-previews',browsing);$('previous-page').parentElement.hidden=browsing;
 if(browsing){
  for(const l of ls)for(const p of l.classificationPaths){
    if(!pathSelected(p))continue;
    const parts=AtlasCategories.segments(p),label=parts[prefix.length]||'本分类',next=parts.slice(0,prefix.length+1);
    if(!groups.has(label))groups.set(label,{parts:next,items:new Map(),terminal:parts.length===prefix.length});
    groups.get(label).items.set(l.id,l);
  }
   $('category-browser').innerHTML=`<div class="category-intro"><h3>${prefix.length?esc(prefix[prefix.length-1]):'按副本浏览阵容'}</h3></div><div class="category-grid">${[...groups].filter(([,g])=>!g.terminal).map(([label,g])=>`<button class="category-tile secondary" ${browseAttrs(g.parts)}><strong>${esc(label)}</strong><span>${g.items.size} 个阵容 <span aria-hidden="true">→</span></span></button>`).join('')}</div>`;
 }

 if(!browsing)$('category-browser').innerHTML='';
 if(!prefix.length||targetOnly){$('category-browser').hidden=false;$('category-browser').insertAdjacentHTML('afterbegin',targetOnly?'<nav class="category-breadcrumb"><button class="ghost" data-browse-home>全部分类</button><span aria-hidden="true">/</span><strong>目标阵容</strong></nav>':`<button class="target-directory" data-target-directory><span><strong>目标阵容</strong><small>${account()?esc(account().name):'选择库存账号后设置目标'}</small></span><b>${account()?targetIds().size:0} <span aria-hidden="true">→</span></b></button>`);}
 if(prefix.length&&!targetOnly)$('category-browser').insertAdjacentHTML('afterbegin',`<nav class="category-breadcrumb" aria-label="当前副本路径"><button class="ghost" data-browse-home>全部分类</button>${prefix.map((label,i)=>`<span aria-hidden="true">/</span>${i===prefix.length-1?'<strong>'+esc(label)+'</strong>':'<button class="ghost" '+browseAttrs(prefix.slice(0,i+1))+'>'+esc(label)+'</button>'}`).join('')}</nav>`);
 const applied=[...new Set(['source-filter','status-filter'].map(id=>$(id).value?$(id).selectedOptions[0]?.textContent:'').filter(Boolean)),...selectedMembers.map(id=>rosterById(id)?.name||id)];
 document.querySelector('.extra-filters summary').textContent=applied.length?'筛选：'+applied.join(' · '):'更多筛选';
 $('gap-filter').disabled=!account();
 $('results-count').textContent=`找到 ${ls.length} 个阵容${browsing?' · 分类预览':''}${selectedMembers.length?' · 不含成员未知的记录':''}`;
 const targets=targetIds();
 const card=(l,caption=classificationCaption(l))=>`<article class="lineup-card${selectedLineups.has(l.id)?' is-selected':''}"><div class="card-selection"><label><input type="checkbox" data-select-lineup="${esc(l.id)}" aria-label="选择阵容 ${esc(l.title)}" ${selectedLineups.has(l.id)?'checked':''}>选择</label>${targets.has(l.id)?'<span class="target-badge">目标阵容</span>':''}</div><div class="card-head"><div><h3>${esc(l.title)}</h3><p class="card-subtitle">${esc(caption)}${l.date?' · '+esc(l.date.slice(0,10)):''}</p></div>${badge(l)}</div>${heroTeam(l)}${gapBadges(matchResults[l.id])}${l.classificationPaths?.some(p=>p.extended)?'<span class="chip">含扩展副本</span>':''}<div class="card-footer"><code class="code" title="${esc(l.shortCode||l.code||'来源未提供阵容码')}">${esc(l.shortCode||l.code||'来源未提供阵容码')}</code>${l.code?`<button class="copy-code" data-copy="${esc(l.id)}">复制</button>`:''}</div><div class="actions card-actions"><button class="secondary" data-detail="${esc(l.id)}">详情</button><button class="ghost" data-reparse="${esc(l.id)}">${C.hasParsedContent(l)?"重新解析":"解析"}</button><button class="secondary" data-edit-lineup="${esc(l.id)}">编辑</button><button class="danger" data-delete-lineup="${esc(l.id)}">删除</button></div></article>`;
 $('lineup-grid').innerHTML=(browsing?[...groups].map(([label,g])=>`<section class="category-preview"><div class="section-heading"><h3>${esc(label)} <small>${g.items.size} 个阵容</small></h3>${`<button class="secondary" ${browseAttrs(g.parts)} ${g.terminal?'data-browse-terminal':''}>查看全部 →</button>`}</div><div class="lineup-grid">${[...g.items.values()].slice(0,3).map(l=>card(l,classificationCaption(l,category,subcategory,g.parts.join(' → ')))).join('')}</div></section>`).join(''):ls.slice((page-1)*24,page*24).map(l=>card(l)).join(''))||'<div class="empty"><strong>没有符合条件的阵容</strong><p>试试减少关键词，或取消部分筛选。</p><button id="reset-empty-filters" class="secondary">清空筛选，查看全部</button></div>';
 renderReparseButtons();
 renderSelection(ls);
 if(focusAttr&&!focused.isConnected)[...$('lineup-grid').querySelectorAll('['+focusAttr.name+']')].find(el=>el.getAttribute(focusAttr.name)===focusAttr.value)?.focus({preventScroll:true});
 $('page-indicator').textContent=`${page} / ${Math.ceil(ls.length/24)||1}`;$('previous-page').disabled=page===1;$('next-page').disabled=page*24>=ls.length;$('match-all').disabled=!account()||!!worker;
 $('nav-count').textContent=lineups().length;$('stat-lineups').textContent=lineups().length;$('stat-dungeons').textContent=new Set(lineups().flatMap(l=>l.dungeons||[l.dungeon])).size;$('stat-reference').textContent=lineups().filter(l=>l.members?.length).length;

}
let filterRoster=null;
function fillFilters(){
 if(!DATA)return;const all=lineups();$('nav-count').textContent=all.length;const paths=all.flatMap(l=>l.classificationPaths);
 const update=(id,values,label)=>{const el=$(id),old=el.value,rows=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh')),html='<option value="">'+label+'</option>'+rows.map(v=>'<option>'+esc(v)+'</option>').join('');if(el._optionsHTML!==html){el.innerHTML=html;el._optionsHTML=html;el.value=rows.includes(old)?old:'';}};
 update('category',paths.map(p=>p.category),'全部分类');const parent=paths.filter(p=>!$('category').value||p.category===$('category').value);update('subcategory',parent.map(p=>p.subcategory),'全部子类');
 if(filterRoster!==DATA.roster){filterRoster=DATA.roster;$('hero-options').innerHTML=DATA.roster.map(r=>'<option value="'+esc(r.name)+'">'+esc(r.rarity)+' · '+r.id+'</option>').join('');}
 if(document.activeElement===$('dungeon'))renderDungeonOptions();
}
function hideDungeonOptions(){$('dungeon-options').hidden=true;$('dungeon').setAttribute('aria-expanded','false');$('dungeon').removeAttribute('aria-activedescendant');}
function renderDungeonOptions(){
 const rows=new Map();for(const l of lineups())for(const p of l.classificationPaths)if(pathSelected(p)){const label=AtlasCategories.caption(p);if(!rows.has(label))rows.set(label,new Set());rows.get(label).add(l.id);}
 $('dungeon-options').innerHTML=[...rows].sort(([a],[b])=>a.localeCompare(b,'zh')).map(([label,ids],i)=>`<button type="button" role="option" aria-selected="false" tabindex="-1" id="dungeon-option-${i}" data-stage-option="${esc(label)}"><span>${esc(label)}</span><small>${ids.size} 个</small></button>`).join('')||'<p role="status">没有匹配副本，试试首领名或减少关键词。</p>';
 $('dungeon-options').hidden=false;$('dungeon').setAttribute('aria-expanded','true');$('dungeon').removeAttribute('aria-activedescendant');
}
function browseTo(value){
 targetOnly=false;
 const parts=value?value.split(' → '):[],path=lineups().flatMap(l=>l.classificationPaths).find(p=>AtlasCategories.caption(p)===value||AtlasCategories.caption(p).startsWith(value+' → '));
 $('category').value=parts[0]||'';$('subcategory').value='';$('dungeon').value='';fillFilters();
 if(parts.length>1&&path){$('subcategory').value=path.subcategory;$('dungeon').value=value;}
 page=1;hideDungeonOptions();renderLibrary();
}
$('dungeon').addEventListener('focus',renderDungeonOptions);
$('dungeon').addEventListener('keydown',e=>{
 if(e.key==='Escape'){hideDungeonOptions();return;}
 if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;
 if($('dungeon-options').hidden){if(e.key==='Enter')return;renderDungeonOptions();}
 const options=[...$('dungeon-options').querySelectorAll('[role=option]')];if(!options.length)return;
 e.preventDefault();const old=options.findIndex(o=>o.id===$('dungeon').getAttribute('aria-activedescendant'));
 if(e.key==='Enter'){if(old>=0){browseTo(options[old].dataset.stageOption);$('dungeon').focus();hideDungeonOptions();}return;}
 const index=(old+(e.key==='ArrowDown'?1:old<0?0:-1)+options.length)%options.length;
 options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===index)));$('dungeon').setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});
});
$('dungeon-options').addEventListener('mousedown',e=>e.preventDefault());
$('dungeon-options').addEventListener('click',e=>{const option=e.target.closest('[data-stage-option]');if(option){browseTo(option.dataset.stageOption);$('dungeon').focus();hideDungeonOptions();}});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.stage-search'))hideDungeonOptions();});
$('dungeon').addEventListener('blur',hideDungeonOptions);

function renderSelected(){$('selected-members').innerHTML=selectedMembers.map(id=>`<span class="chip">${esc(rosterById(id)?.name||id)}<button data-remove-member="${id}" aria-label="移除式神筛选">×</button></span>`).join('');}
function updateAccountSelect(){const selected=STATE.activeAccount;$('active-account').innerHTML='<option value="">选择账号检查配置</option>'+STATE.accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.server)}</option>`).join('');$('active-account').value=selected;}
function openDialog(title,subtitle,body){$('dialog-feedback').hidden=true;$('dialog-heading').innerHTML=`<h2 id="detail-heading">${esc(title)}</h2><p>${esc(subtitle)}</p>`;$('dialog-body').innerHTML=body;if(!$('detail-dialog').open)$('detail-dialog').showModal();else ($('dialog-body').querySelector('input,textarea,button,summary')||$('close-dialog')).focus({preventScroll:true});}
function attrValue(stat,value){return stat?.endsWith('Percent')?(Number(value)*100).toFixed(2).replace(/\.00$/,'')+'%':C.formatStat(stat,value);}

function renderRecommendations(){
 const el=$('account-recommendations');if(!el)return;
 el.hidden=!account();if(!account()){el.innerHTML='';return;}
 const ranked=lineups().filter(l=>matchResults[l.id]?.distance!=null).sort((a,b)=>C.compareMatches(matchResults[a.id],matchResults[b.id]));
 el.innerHTML=`<h2>为此账号挑阵容</h2>${ranked.length?`<div class="recommendation-list">${ranked.slice(0,6).map(l=>{const r=matchResults[l.id];return `<button class="recommendation" data-detail="${esc(l.id)}"><span><strong>${esc(l.title)}</strong><small>${esc(matchStatus(r))}</small></span><b>查看 →</b></button>`;}).join('')}</div>`:`<p>${worker?'正在计算，请稍候…':'解析到阵容成员后，会在这里列出最接近当前库存的阵容。'}</p>`}`;
}

function propertyText(c){if(!c)return '未提供';return (c.ranges||[]).map(r=>[(C.STAT_NAMES[r.stat]||r.stat),r.min!=null?(r.minExclusive?'>':'≥')+r.min+(r.percentage?'%':''):'',r.max!=null?(r.maxExclusive?'<':'≤')+r.max+(r.percentage?'%':''):''].filter(Boolean).join(' ')).join('；')||'未指定';}
function configText(c){if(!c)return '未提供';return [...(c.suitRequirements||[]).map(r=>`${r.name} ${r.count}件`),...(c.twoPieceStats||[]).map(s=>`${C.STAT_NAMES[s]||s}两件套`)].join(' + ')||c.suits?.join(' + ')||(c.suitSelectionComplete?'散件':'未指定');}
function mainText(c){return c?Object.entries(c.mainStats||{}).filter(([,stats])=>stats.length).map(([slot,stats])=>`${slot}号位：${stats.map(s=>C.STAT_NAMES[s]||s).join(' / ')}`).join('；')||'未指定':'未提供';}
function protocolDetails(m){
 const p=m.config?.protocol,labels={debuff_res:'效果抵抗',critical_rate:'暴击',final_atk:'攻击',debuff_acc:'效果命中',final_max_hp:'生命',critical_pow:'暴击伤害',spd:'速度',final_def:'防御',ExtraAttr:'额外属性'};
 const range=v=>Array.isArray(v)?v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ～ '):typeof v==='object'?JSON.stringify(v):String(v);
 if(!p&&!m.qiling&&m.aiSkill==null)return '';
 return `<details class="protocol-fields"><summary>阵容码原始配置</summary><dl>${p?`<dt>御魂等级 / 星级</dt><dd>${esc(range(p.yuhunLevel||[]))}级 / ${esc((p.yuhunStars||[]).join('、'))}星</dd><dt>计算指标 criteria</dt><dd>${esc(p.criteria??'未提供')}（${esc(C.METRICS[p.criteria]?.[0]||'未知指标')}）</dd><dt>两件套属性</dt><dd>${esc(p.twoSuit.join('、')||'未指定')}</dd>${Object.entries(p.limits).map(([k,v])=>`<dt>${esc(labels[k]||k)}（原值）</dt><dd>${esc(range(v))}</dd>`).join('')}<dt>最高属性</dt><dd>${esc(p.highest.join('、')||'未指定')}</dd><dt>计算开关 / 评分</dt><dd>not_calc_flag: ${esc(p.notCalcFlag??'未提供')} / use_score: ${esc(p.useScore??'未提供')}</dd>`:''}${m.qiling?`<dt>契灵</dt><dd>ID ${esc(m.qiling.id)} · ${esc(m.qiling.star)}星 · ${esc(m.qiling.lv)}级</dd><dt>契灵印记</dt><dd>${esc((m.qiling.marks||[]).join('、'))}</dd>`:''}${m.aiSkill!=null?`<dt>自动技能 ai_skill</dt><dd>${esc(range(m.aiSkill))}</dd>`:''}</dl>${p?'<p class="caption">保留游戏编码的原始数值与精度。已核对的单位、套装件数与额外属性参与计算；阴阳师、契灵与术印仅展示；式神自动技能按原码设置。</p>':''}</details>`;
}

let accountInventoryCache=null;
function snapshotDetails(a){
 const snapshot=a.snapshot;if(!snapshot)return '';
 const scopeNames={heroes:'式神',souls:'御魂',items:'物品',realmCards:'结界卡',guild:'阴阳寮',taskRecords:'任务记录'};
 const ranges=Object.entries(snapshot.scope).filter(([key])=>scopeNames[key]).map(([key,value])=>`${scopeNames[key]}：${value===true?'已采集':value===false?'未采集':'范围不明确'}`).join('；');
 const sectionScopes={currency:'items',heroesBagEntries:'heroes',realmCards:'realmCards',guild:'guild',taskRecords:'taskRecords'};
 const rows=Object.entries(C.SNAPSHOT_SECTIONS).map(([key,label])=>{
  const count=snapshot.sections[key],notCollected=snapshot.scope[sectionScopes[key]]===false;
  const content=count==null?'未提供或格式待核对':`${count} 条${key==='heroesBagEntries'&&snapshot.stackedHeroes!=null?' · 合计 '+snapshot.stackedHeroes+' 个':''}`;
  const retained=Object.hasOwn(a.retainedSections||{},key)?` · 沿用 ${a.retainedSections[key]||'时间未知'} 的旧记录`:'';
  return `<tr><th>${esc(label)}</th><td>${esc(content)}</td><td>${notCollected?'本次未采集':count==null?'—':'已保留原始记录'}${esc(retained)}</td></tr>`;
 }).join('');
 return `<details class="inventory-notes" id="account-snapshot-extra"><summary>其他采集数据与范围</summary>${ranges?`<p>${esc(ranges)}</p>`:''}<p>资源、素材、碎片、结界卡、传记、任务及阴阳寮数据随库存和备份完整保留。堆叠素材单独计数，不扩充为可上阵实例；未采集与数量为零分别显示。</p><div class="scroll-table"><table><thead><tr><th>内容</th><th>记录数量</th><th>采集状态</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
function renderAccounts(recommendations=true){if(view!=='accounts')return;if(recommendations)renderRecommendations();
 const a=account();$('account-pagination').hidden=!a;
 if(!a){$('account-summary').innerHTML='';$('account-heroes').innerHTML='<p class="muted">导入平安志 JSON 后选择账号。</p>';$('account-souls').innerHTML='';return;}
 const expanded=accountInventoryCache?.account.id===a.id?[...$('account-summary').querySelectorAll('details[open]')].map(el=>el.id):[];
 if(accountInventoryCache?.account!==a){const heroes=Object.values(a.heroes).sort((a,b)=>b.level-a.level||Number(b.shikigamiId)-Number(a.shikigamiId)||a.instanceId.localeCompare(b.instanceId)),souls=Object.values(a.souls),suitCounts=new Map();for(const s of souls){const count=suitCounts.get(s.set)||{total:0,maxed:0};count.total++;if(s.star===6&&s.level===15)count.maxed++;suitCounts.set(s.set,count);}accountInventoryCache={account:a,heroes,souls,suitCounts};}
 const {heroes,souls,suitCounts}=accountInventoryCache;
 $('account-summary').innerHTML=`<div class="overview"><div><strong>${heroes.length}</strong><span>角色实例（含素材）</span></div><div><strong>${new Set(heroes.map(h=>h.shikigamiId)).size}</strong><span>角色类型</span></div><div><strong>${souls.length}</strong><span>御魂</span></div><div><strong>${a.presets.length}</strong><span>御魂预设</span></div></div><details class="inventory-notes" id="account-inventory-notes"><summary>库存信息${a.warnings.length?' · '+a.warnings.length+' 项提醒':''}</summary><p>采集时间：${esc(a.capturedAt)}。${Number.isFinite(a.raw?.player?.level)?'账号等级：'+esc(a.raw.player.level)+'。':''}式神：${C.inventoryComplete(a,'heroes')?'完整':'待核对'}；御魂：${C.inventoryComplete(a,'souls')?'完整':'待核对'}。当前穿戴归属未提供，配装使用全仓库库存。</p>${a.warnings.slice(0,30).map(w=>'<p>'+esc(w)+'</p>').join('')}${a.warnings.length>30?'<p>其余提醒保留在原始导出与备份中。</p>':''}</details>${snapshotDetails(a)}`;
 for(const id of expanded)if(id&&$(id))$(id).open=true;
 const q=$('account-search').value.trim(),kind=$('account-kind').value;
 const filtered=heroes.filter(h=>{const r=rosterById(h.shikigamiId);return `${r?.name||''} ${h.shikigamiId}`.includes(q)&&(!kind||(kind==='material'?r?.isMaterial:!r?.isMaterial));});
 const slice=C.paginate(filtered,accountPage,$('account-page-size').value);accountPage=slice.page;
 $('account-heroes').innerHTML=slice.items.map(h=>{const r=rosterById(h.shikigamiId);return `<div class="owned-hero"><div class="portrait">${thumb({name:r?.name,shikigamiId:h.shikigamiId,awakening:h.awake})}</div><div><strong>${esc(r?.name||'未收录角色 '+h.shikigamiId)}</strong><p>${h.level}级 · ${h.star}星 · ${r?.isMaterial?'培养素材':h.awake?'已觉醒':'未觉醒'}${h.locked?' · 已锁定':''}</p><div class="owned-skills">${memberSkillCards({shikigamiId:h.shikigamiId,awakening:h.awake,skills:h.skills},true)}</div></div></div>`;}).join('')||'<p class="muted">没有符合筛选的角色。</p>';
 $('account-page-indicator').textContent=`第 ${slice.page} / ${slice.pages} 页 · 显示 ${slice.start}–${slice.end} / ${slice.total} 个实例`;
 $('account-previous-page').disabled=slice.page===1;$('account-next-page').disabled=slice.page===slice.pages;
 $('account-souls').innerHTML=`<details><summary>御魂仓库摘要</summary><p>六星满级 ${souls.filter(s=>s.star===6&&s.level===15).length} 件；未识别属性 ${souls.filter(s=>s.unknown.length).length} 件。</p><div class="scroll-table"><table><thead><tr><th>套装</th><th>库存</th><th>六星满级</th></tr></thead><tbody>${[...suitCounts.keys()].sort().map(set=>`<tr><td class="inventory-suit">${gameImage(soulAsset(set))}<span>${esc(set)}</span></td><td>${suitCounts.get(set).total}</td><td>${suitCounts.get(set).maxed}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function renderAudit(){
 const counts=new Map();for(const l of lineups())for(const label of new Set(l.classificationPaths.map(AtlasCategories.caption))){const c=counts.get(label)||{total:0,parsed:0};c.total++;if(l.members?.length)c.parsed++;counts.set(label,c);}
 const a=DATA.assetAudit,e=DATA.excelAudit,ls=lineups(),coveragePaths=[...new Map(ls.flatMap(l=>l.classificationPaths).map(p=>[AtlasCategories.caption(p),p])).values()];
 $('audit-content').innerHTML=`<div class="audit-grid"><div class="audit-stat"><p>表格原码 / 已解析</p><strong>${e.uniqueCodes} / ${e.decoded}</strong></div><div class="audit-stat"><p>已保存式神图片</p><strong>${a.downloaded}</strong></div><div class="audit-stat"><p>形态待核对</p><strong>${a.unknown}</strong></div></div>
 <details class="panel audit-details"><summary>副本覆盖</summary><div class="scroll-table"><table><thead><tr><th>分类 / 副本</th><th>记录</th><th>已有成员</th><th>待核对</th></tr></thead><tbody>${coveragePaths.map(t=>{const count=counts.get(AtlasCategories.caption(t)),rows={length:count?.total||0},n=count?.parsed||0;return `<tr><td>${esc(AtlasCategories.caption(t))}</td><td>${rows.length}</td><td>${n}</td><td>${rows.length?(n===rows.length?'实战要求':'部分成员待解析'):'尚未收录'}</td></tr>`;}).join('')}</tbody></table></div></details>
 <details class="panel audit-details"><summary>活动与日期</summary>${DATA.events.map(e=>`<div class="source-item"><strong>${esc(e.title)}</strong><p>${esc(e.start)} 至 ${esc(e.end)} · ${e.start>todayCN()?'未开启':e.end<todayCN()?'已结束':'进行中'}</p><p>${esc(e.notes)}</p>${link(e.sourceUrl,'官方公告')}</div>`).join('')}</details>
 <details class="panel audit-details"><summary>御魂计算依据</summary><p>按原码要求，使用全仓库库存计算，同队不重复占用式神和御魂实例。缺少式神或培养不足时，御魂标签按补齐原码培养条件后的结果判断，实际缺口仍保留。</p><p>基础属性优先使用平安志实例数据；缺失时只使用已核验的 40 级六星官方属性。资料不足时标为待核对。阴阳师、契灵与术印仅展示，不参与达标判断。</p><p>攻击、生命、防御按“基础 ×（1 + 加成比例）+ 固定加成”合成；其余属性加和。防御两件套为 30%，无刀取为 20% 暴伤。首领固定属性仅按导出副属性计入一次；六件同一普通套装计两次二件加成。额外攻击比例作用于合成后攻击。</p><div class="scroll-table"><table><thead><tr><th>指标</th><th>公式（暴伤为倍率）</th></tr></thead><tbody>${Object.entries(C.METRICS).map(([id,m])=>`<tr><td>${id} · ${esc(m[0])}</td><td>${esc(m[1])}</td></tr>`).join('')}</tbody></table></div><p>指标用于选装，不等同实战伤害。精算采用分支定界搜索，不截断候选；完成搜索才给出最优或无解结论。计算逻辑与 2.8.84 APK 静态数据交叉核对。</p>${link('https://github.com/FiresChain/onmyoji-yuhun/blob/main/src/calculation.ts','计算公式源码')} · ${link('https://github.com/FiresChain/onmyoji-yuhun/blob/main/src/team-calculation.ts','指标与单位映射')}</details>
 <details class="panel audit-details"><summary>阵容来源</summary><div class="source-list">${DATA.sources.map(s=>`<div class="source-item">${link(s.url,s.title||s.bvid)}<p>${esc(s.author||'')} ${esc(s.publishedAt?.slice(0,10)||'')} · ${s.error?'读取失败：'+esc(s.error):(s.codes?.length||0)+' 条原码'}</p><details><summary>原文与核验信息</summary><p class="wrap">${esc(s.description||'没有取得正文')}</p><p>采集时间 ${esc(s.evidence?.retrievedAt)}<br>SHA-256 ${esc(s.evidence?.sha256)}</p></details></div>`).join('')}</div></details>
 <details class="panel audit-details"><summary>图片来源、权利与缺口</summary><p>官方素材版权归网易及相关权利人所有，仅用于个人学习、交流和本地查看，不代表取得商业授权。来源说明保留在本地资料中。</p><p>${a.failures.length} 个资源请求未取得有效图片，${a.duplicateCharacters.length} 个角色存在重复文件待复核；${a.supported} 个角色已确认双形态，${a.notApplicable} 个无独立觉醒形态。原生卡面尚未核验，未声称资源已全部收齐。</p><p>官方目录动态 / 静态记录 ${a.dynamicCount} / ${a.staticCount}，ID 差异 ${(a.onlyDynamic?.length||0)+(a.onlyStatic?.length||0)}。表格共 ${e.occurrences} 条记录、${e.uniqueCodes} 个唯一原码；${e.decoded} 个已解析，${e.rejected} 个被服务器拒绝。</p><button id="export-audit" class="secondary">导出覆盖报告</button></details>`;
}
let codeTimer,codeRevision=0,codeDraftKey='',codeDirty=new Set(),codeSaving=false;const codeDrafts=new Map(),codeFields=['code-title','code-dungeon','code-notes'];
function showCodeResult(result){currentCodeResult=result;for(const [id,value] of [['code-title',result.title],['code-dungeon',result.dungeon],['code-notes',result.notes]])if(!codeDirty.has(id))$(id).value=value||'';$('decode-result').innerHTML=`<h2>${esc($('code-title').value||result.title)}</h2>${heroTeam(result)}${badge(result)}<p class="detail-notes">${esc($('code-notes').value||'无备注')}</p>${!result.members?.length?'<div class="notice">尚未解析，登录后可查询成员要求。</div>':''}<button class="secondary" id="show-current-code">查看完整详情</button>`;}
function updateCode(){
 clearTimeout(codeTimer);codeRevision++;currentCodeResult=null;const code=C.normalizeCode($('code-input').value),kind=C.classifyCode(code);
 if(code!==codeDraftKey){
  if(codeDraftKey&&codeDraftKey.length<=4096){codeDrafts.set(codeDraftKey,{values:codeFields.map(id=>$(id).value),dirty:new Set(codeDirty)});if(codeDrafts.size>10)codeDrafts.delete(codeDrafts.keys().next().value);}
  const draft=codeDrafts.get(code);codeFields.forEach((id,i)=>$(id).value=draft?.values[i]||'');codeDirty=new Set(draft?.dirty);codeDraftKey=code;
 }
 if(!code){$('code-status').textContent='等待输入';$('decode-result').innerHTML='<p class="section-kicker">02 / 解析结果</p><h2>在这里核对阵容</h2><p class="muted">粘贴阵容码后，查看成员、技能和御魂要求。需要联网查询的原码会提示登录。</p>';return;}
 const existing=lineups().find(l=>l.code===code);if(existing){showCodeResult(existing);$('code-status').textContent=existing.members?.length?'读取已保存的解析结果（可离线查看）':'已有文字码记录 · 等待自动解析或点击单条解析';return;}
 $('code-status').textContent={unknown:'未识别完整格式', 'too-large':'内容超过32 MiB', 'pipe-ta':'文字分享码 · 点击解析后自动保存结果', 'hash-ta':'二维码文本 · 正在识别','lineup-data':'完整阵容内容 · 正在识别'}[kind];
 $('decode-result').innerHTML=kind==='pipe-ta'?'<h2>文字分享码待查询</h2><p>点击“解析”查询成员和配置。</p>':'<h2>阵容详情预览</h2><p class="muted">输入完整内容后自动在本机解析。</p>';
 if(['hash-ta','lineup-data'].includes(kind)){codeTimer=setTimeout(localDecode,350);}
}
async function decodeLocalInput(input){if(window.atlas){const result=await atlas.decode(input);if(result.ok&&atlas.findShortCode){try{result.shortCode=await atlas.findShortCode(result.code);}catch{result.shortCode=null;}}return result;}const r=await fetch('/api/decode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw new Error('本地解析服务不可用，请使用 Windows 桌面版');return r.json();}
async function decodeContent(input,options={}){return typeof input==='string'&&C.classifyCode(input)==='pipe-ta'?window.TALogin.query(C.normalizeCode(input),options):decodeLocalInput(input);}
let libraryParser=null,autoParseStarted=false,parsePriority=[],parseReport={phase:'idle'},queryProgress=null;
function queryProgressText(){return !queryProgress?'':queryProgress.phase==='waiting'?`等待 ${Math.max(0,Math.ceil((queryProgress.retryAt-Date.now())/1000))} 秒后查询（第 ${queryProgress.attempt} / ${queryProgress.maxAttempts} 次）`:`正在查询（第 ${queryProgress.attempt} / ${queryProgress.maxAttempts} 次）`;}
window.taLogin?.onQueryProgress?.(progress=>{queryProgress=progress;scheduleLibraryRefresh();if(progress&&C.normalizeCode($('code-input').value)===progress.code)$('code-status').textContent=queryProgressText();});
let bulkBusy=false,bulkReading=false,bulkFileRevision=0,bulkPreviewLimit=50;
function renderBulkPreview(){
 const preview=AtlasBulkImport.parse($('bulk-input').value,DATA?lineups():[]),s=preview.stats;
 $('bulk-summary').textContent=preview.error?'超出导入限制，本批不能添加':s.total?`共 ${s.total} 条 · 可添加 ${s.valid} · 重复 ${s.duplicate} · 格式错误 ${s.invalid}`:'粘贴后显示导入预览';
 $('bulk-error').hidden=!preview.error;$('bulk-error').textContent=preview.error;
 const filter=$('bulk-filter').value,rows=preview.rows.filter(row=>!filter||row.status===filter),shown=rows.slice(0,bulkPreviewLimit);
 $('bulk-preview').hidden=!shown.length;
 $('bulk-preview').innerHTML=shown.length?`<table><thead><tr><th>行</th><th>状态 / 说明</th><th>阵容</th><th>副本 / 用途与备注</th></tr></thead><tbody>${shown.map(row=>`<tr class="bulk-${row.status}"><td>${row.line}</td><td>${esc(row.reason)}</td><td><strong>${esc(row.title)}</strong><code class="bulk-code" title="${esc(row.code)}">${esc(row.code.length>120?row.code.slice(0,117)+'…':row.code)}</code></td><td>${esc(row.dungeon)}${row.notes?`<p class="caption">${esc(row.notes.length>160?row.notes.slice(0,157)+'…':row.notes)}</p>`:''}</td></tr>`).join('')}</tbody></table>`:'';
 $('bulk-more').hidden=rows.length<=shown.length;$('bulk-more').textContent=`再显示 50 行（已显示 ${shown.length} / ${rows.length}）`;
 $('bulk-apply').textContent=bulkBusy?'正在保存…':`添加 ${preview.entries.length} 条有效阵容`;
 $('bulk-apply').disabled=bulkBusy||bulkReading||!!preview.error||!preview.entries.length||!DATA;
 for(const id of ['bulk-input','bulk-read-file','bulk-template','bulk-auto-parse','close-bulk','bulk-view'])$(id).disabled=bulkBusy;
 return preview;
}
async function readBulkFile(file){
 if(!file||bulkBusy)return;const revision=sessionRevision,readRevision=++bulkFileRevision;
 bulkReading=true;$('bulk-status').textContent='正在读取文件…';renderBulkPreview();
 try{
  if(file.size>AtlasBulkImport.MAX_BYTES)throw new Error('文件超过 5 MiB，请拆分后导入。');
  const text=await file.text();if(!sameSession(revision)||readRevision!==bulkFileRevision)return;
  if(text.includes('\ufffd'))throw new Error('文件含有无法读取的字符，请另存为 UTF-8 文本。');
  $('bulk-input').value=text;bulkPreviewLimit=50;$('bulk-status').textContent='已读取 '+file.name+'，请检查预览后添加。';
 }catch(error){if(sameSession(revision)&&readRevision===bulkFileRevision)$('bulk-status').textContent='读取失败：'+error.message;}
 finally{if(sameSession(revision)&&readRevision===bulkFileRevision){bulkReading=false;renderBulkPreview();}}
}
async function applyBulkImport(){
 if(bulkBusy||bulkReading||libraryBusy||!DATA)return;let preview=renderBulkPreview();if(preview.error||!preview.entries.length)return;
 const revision=sessionRevision,parser=libraryParser,resume=parseReport.phase==='running',remaining=lineups().filter(AtlasLibraryParser.canAttempt).map(l=>l.code),auto=$('bulk-auto-parse').checked;
 bulkBusy=true;bulkFileRevision++;clearTimeout(codeTimer);stopMatch();parser?.pause();renderBulkPreview();
 $('bulk-status').textContent=parser?.inflight.size?'正在等待当前解析保存，然后添加新阵容…':'正在保存到本机…';
 let added=[];
 try{
  await Promise.allSettled([parser?.running,...(parser?.inflight.values()||[])]);
  if(!sameSession(revision))return;
  preview=renderBulkPreview();if(preview.error||!preview.entries.length){$('bulk-status').textContent='没有新的有效原码可添加。';return;}
  const createdAt=new Date().toISOString();added=preview.entries.map(row=>({...row,id:'user-'+crypto.randomUUID(),category:'其他',dungeons:[row.dungeon],sourceKind:'user',decodeState:'unattempted',requirementsComplete:false,members:[],createdAt}));
   if(!await commitState(state=>({...state,lineups:[...state.lineups,...added]}),revision)){
    if(sameSession(revision))$('bulk-status').textContent='保存失败，本批未添加。输入文本已保留，可以重试或复制备份。';added=[];return;
  }
  if(!sameSession(revision))return;
  scheduleLibraryRefresh(true,true);
  $('bulk-view').hidden=false;$('bulk-status').textContent=`已添加 ${added.length} 条；跳过 ${preview.stats.duplicate} 条重复、${preview.stats.invalid} 条格式错误。`+(auto?' 解析结果会逐条保存，可关闭此窗口查看进度。':' 原码已保存，可在阵容库随时解析。');
 }catch(error){if(sameSession(revision)){$('bulk-status').textContent='添加未完成：'+error.message;}}
 finally{
  if(sameSession(revision)){
   bulkBusy=false;renderBulkPreview();
   if(added.length&&auto){parsePriority=[...new Set([...added.map(l=>l.code),...parsePriority])];autoParseStarted=false;maybeAutoParse();}
   else if(resume)startLibraryParse({codes:remaining});
   refreshAvailability();
  }
 }
}
function renderReparseButtons(){
 const items=new Map(lineups().map(l=>[l.id,l]));
 for(const b of document.querySelectorAll('[data-reparse],#parse-lineup')){
  const l=b.id==='parse-lineup'?currentDialog:items.get(b.dataset.reparse);
  const pending=l&&libraryParser?.inflight.has(l.code);
  b.dataset.reparseLabel||=b.textContent;
  b.disabled=!!pending||libraryBusy||bulkBusy;
  b.textContent=pending?'解析中…':b.dataset.reparseLabel;
 }
}
async function retryLineup(l){
 if(libraryBusy||bulkBusy)return toast('正在保存阵容库，请稍候');
 if(!libraryParser||(C.classifyCode(l.code)==='pipe-ta'&&!requireParserLogin())||libraryParser.inflight.has(l.code))return;
 const parser=libraryParser;
 stopMatch();
 const pending=parser.parseOne(l,{force:true});
 renderParseProgress();
 try{
  await pending;if(libraryParser!==parser)return;
  if($('detail-dialog').open&&$('parse-lineup')&&currentDialog?.id===l.id)showLineup(lineups().find(row=>row.id===l.id));
  toast('「'+l.title+'」解析成功，已保存');
 }catch(error){if(libraryParser===parser)toast('「'+l.title+'」解析未完成：'+error.message);}
 finally{
  if(libraryParser===parser){
   if(view==='library')renderLibrary();if(view==='manage')renderManage();
   renderParseProgress();refreshAvailability();
  }
 }
}
let refreshTimer=null,refreshDirty=false,parseCounts=null;
function scheduleLibraryRefresh(dirty=false,flush=false){
 refreshDirty ||= dirty;
 if(flush){clearTimeout(refreshTimer);refreshTimer=null;refreshLibraryUI();}
 else if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=null;refreshLibraryUI();},120);
}
function refreshLibraryUI(){
 if(!DATA)return;
 if(refreshDirty){refreshDirty=false;fillFilters();if(view==='library')renderLibrary();if(view==='manage')renderManage();}
 renderParseProgress();
}
function renderParseProgress(){
 if(!DATA)return;
 const rows=lineups();if(parseCounts?.rows!==rows)parseCounts={rows,pending:rows.filter(AtlasLibraryParser.canAttempt).length,expired:rows.filter(AtlasParseErrors.isExpired).length};
 const {pending,expired}=parseCounts,status=window.TALogin?.status(),role=status?.authenticated&&!!status?.selected_avatar,running=['running','pausing'].includes(parseReport.phase);
 let message=pending?`还有 ${pending} 个原码待解析；成功内容自动保存在本机。`:expired?'可解析的原码已处理。':'库内所有原码已有本地内容，后续直接读取。';
 if(running)message=`${parseReport.phase==='pausing'?'当前条目完成后暂停':'正在逐条解析'}：${parseReport.completed} / ${parseReport.total}，成功 ${parseReport.succeeded}，失败 ${parseReport.failed}。${parseReport.current||''} · 当前已等待 ${Math.max(0,Math.floor((Date.now()-(parseReport.currentStartedAt||Date.now()))/1000))} 秒`;
 else if(['complete','partial','paused'].includes(parseReport.phase)&&Number.isFinite(parseReport.total))message=`${parseReport.phase==='paused'?'解析已暂停':'本轮解析结束'}：成功 ${parseReport.succeeded}，失败 ${parseReport.failed}；仍待解析 ${pending} 个。${parseReport.error||''}`;
 if(running&&queryProgress)message+=' · '+queryProgressText();
 if(expired)message+=` ${expired} 个失效码已单独汇总，可更换原码或一键清理。`;
 if(pending&&!role&&!running)message+=' 文字码查询需要在「登录账号 / 切换角色」选择已有角色。';
 for(const el of document.querySelectorAll('[data-parse-progress]'))el.textContent=message;
 for(const el of document.querySelectorAll('[data-parse-summary]'))el.textContent=running?`解析中 ${parseReport.completed} / ${parseReport.total}`:pending?`待解析 ${pending} 条`:'解析已完成';
 for(const el of document.querySelectorAll('[data-parse-action="start"]')){el.disabled=running||!pending;el.textContent=!role?'登录后解析':parseReport.phase==='paused'?'继续解析剩余内容':'解析剩余内容';}
 for(const el of document.querySelectorAll('[data-parse-action="pause"]')){el.hidden=!running;el.disabled=parseReport.phase==='pausing';}if(view==='library')renderParseFailures();
}
async function saveParsedLineup(item,payload,valid){
 if(!valid())return false;
 if(payload.code!==item.code)throw new Error('解析结果原码不一致，未覆盖本地内容');
 stopMatch();
  const incoming=C.validateLineup(C.adaptTA(payload,DATA));let saved;
  if(!await commitState(state=>{
   const existing=lineups().filter(l=>l.code===item.code),updates=(existing.length?existing:[item]).map(old=>({...C.mergeDecodedLineup(old,incoming),id:old.id||'user-'+crypto.randomUUID(),parsedAt:new Date().toISOString(),lastParseError:null,lastParseFailure:null}));
   saved=updates.at(-1);const ids=new Set(updates.map(l=>l.id));for(const id of ids)delete matchResults[id];
   return {...state,lineups:[...state.lineups.filter(l=>!ids.has(l.id)),...updates]};
  },sessionRevision,valid))return false;
 if(!valid())return false;
 scheduleLibraryRefresh(true,!libraryParser?.running);
 if(C.normalizeCode($('code-input').value)===saved.code){showCodeResult(saved);$('code-status').textContent='解析完成，已保存在本机';}
 return saved;
}
function createLibraryParser(revision){
 libraryParser?.cancel();autoParseStarted=false;parsePriority=[];parseReport={phase:'idle'};
 libraryParser=new AtlasLibraryParser.LibraryParser({items:lineups,decode:decodeContent,active:()=>sameSession(revision)&&!!DATA,save:saveParsedLineup,
  saveFailure:async(item,message,valid,failure)=>{
   if(!valid())return;let old=lineups().find(l=>l.id===item.id||l.code===item.code);
    if(!old){if(!AtlasParseErrors.isExpired({lastParseFailure:failure}))return;old={...item,id:'user-'+crypto.randomUUID(),sourceKind:'user',category:'其他',dungeon:item.dungeon||'待分类',members:[],decodeState:'unattempted',requirementsComplete:false};}
    const failed={...old,lastParseError:message,lastParseFailure:failure,lastParseAttemptAt:new Date().toISOString()};
    if(!await commitState(state=>({...state,lineups:[...state.lineups.filter(l=>l.id!==failed.id),failed]}),sessionRevision,valid))throw new Error('失败记录未能保存到本地，已暂停解析');
   if(valid())scheduleLibraryRefresh(true,!libraryParser?.running);
  },
  onProgress:report=>{parseReport=report;const done=['complete','partial','paused'].includes(report.phase);scheduleLibraryRefresh(false,done);if(done)refreshAvailability();}
 });renderParseProgress();
}
function startLibraryParse(options={}){
 if(!requireParserLogin()||!libraryParser||!DATA||bulkBusy||libraryBusy)return;
 stopMatch();
 autoParseStarted=true;
 return libraryParser.run({prioritize:parsePriority,...options}).catch(error=>{parseReport={...parseReport,phase:'paused',error:error.message};renderParseProgress();toast('批量解析已停止：'+error.message);});
}
function maybeAutoParse(){
 if(!window.TALogin?.status().authenticated||!libraryParser||!DATA||bulkBusy||libraryBusy||autoParseStarted||window.TALogin?.status().busy)return;
 const needRole=lineups().some(l=>AtlasLibraryParser.canAttempt(l)&&C.classifyCode(l.code)==='pipe-ta');
 if(needRole&&!window.TALogin.status().selected_avatar){renderParseProgress();return;}
 startLibraryParse();
}
let availabilityJob=null;
function refreshAvailability(){
 const active=account();if(!active||!DATA)return;
 const rows=lineups(),results=matchResults;
 if(availabilityJob?.account===active&&availabilityJob.rows===rows&&availabilityJob.results===results)return;
 const job=availabilityJob={account:active,rows,results,position:0};
 const step=()=>{
  if(availabilityJob!==job||account()!==active||matchResults!==results)return;
  const until=performance.now()+8;
  while(job.position<rows.length){
   const l=rows[job.position++];if(!results[l.id]){const {assessment}=AtlasExact.inspectHeroes(l,active,{reuseIndex:true});results[l.id]={status:assessment.heroShortage>0||assessment.heroTraining>0?'missing':'uncomputed',gapCategory:AtlasExact.gapCategory(assessment.heroes,'uncomputed'),gapAssessment:assessment,proof:{state:'idle',nodes:0},ready:false,completed:false,members:[],reasons:[],checks:[]};}
   if(performance.now()>until)break;
  }
  if(job.position<rows.length)setTimeout(step,0);else scheduleLibraryRefresh(true);
 };step();
}
function renderSelection(ls=filteredLineups()){
 const count=selectedLineups.size,all=$('select-filtered');all.checked=!!ls.length&&count===ls.length;all.indeterminate=count>0&&count<ls.length;all.disabled=!ls.length;
 $('selection-count').textContent=`已选 ${count} / ${ls.length}`;
 $('select-invert').disabled=!ls.length;$('select-clear').disabled=!count;
 for(const id of ['target-add','target-remove','match-selected'])$(id).disabled=!account()||!count||targetSaving;
 if(account()&&count&&!targetSaving){const targets=targetIds();$('target-add').disabled=[...selectedLineups].every(id=>targets.has(id));$('target-remove').disabled=![...selectedLineups].some(id=>targets.has(id));}
 $('gap-statistics').disabled=!account()||!ls.length;
 document.querySelectorAll('[data-select-lineup]').forEach(input=>{input.checked=selectedLineups.has(input.dataset.selectLineup);input.closest('.lineup-card').classList.toggle('is-selected',input.checked);});
}
async function saveTargets(remove=false){
 const active=account();if(!active||targetSaving||!selectedLineups.size)return;
 const ids=targetIds();for(const id of selectedLineups)remove?ids.delete(id):ids.add(id);
  targetSaving=true;renderSelection();
  try{if(!await commitState(state=>({...state,targetLineups:{...state.targetLineups,[active.id]:[...ids]}})))return;toast(remove?'已从此账号的目标阵容移除':'已保存为此账号的目标阵容');}
 finally{targetSaving=false;renderLibrary();}
}
window.addEventListener('atlas-login-status',()=>{scheduleLibraryRefresh();maybeAutoParse();});
async function localDecode(force=false){
 if(libraryBusy||bulkBusy)return toast('正在保存阵容库，请稍候');
 if(C.classifyCode(C.normalizeCode($('code-input').value))==='pipe-ta'&&!requireParserLogin())return;
 clearTimeout(codeTimer);const code=C.normalizeCode($('code-input').value),revision=codeRevision;if(!['pipe-ta','hash-ta','lineup-data'].includes(C.classifyCode(code)))return toast('请粘贴一条完整阵容码或 lineup_data');
 currentCodeResult=null;$('remote-decode').disabled=true;$('code-status').textContent=C.classifyCode(code)==='pipe-ta'?'正在查询文字阵容码…':'正在本机解析…';
  try{const canonical=C.classifyCode(code)==='lineup-data'?'#TA#'+code:code,existing=lineups().find(l=>l.code===canonical),item=existing||{code:canonical,...C.codeProvenance($('code-input').value),title:$('code-title').value.trim()||'未命名阵容',dungeon:$('code-dungeon').value.trim()||'待分类',notes:$('code-notes').value};
    const result=await libraryParser.parseOne(item,{force});if(revision!==codeRevision||C.normalizeCode($('code-input').value)!==code)return;
    $('code-input').value=result.code;showCodeResult(result);$('code-status').textContent=`V${result.protocolVersion} ${result.decodeState==='decoded-server'?'查询并解析成功':'本地解析成功'} · ${result.members.length} 位成员 · 已自动保存在本机`;refreshAvailability();
  }catch(e){if(revision!==codeRevision)return;const saved=lineups().find(l=>l.code===code);if(saved&&C.hasParsedContent(saved))showCodeResult(saved);else{currentCodeResult=null;$('decode-result').innerHTML=`<div class="notice">${esc(e.message)}</div>`;}$('code-status').textContent='解析未完成：'+e.message;}finally{$('remote-decode').disabled=false;}
}
async function saveCode(){
 if(codeSaving)return;
 if(libraryBusy)return toast('正在保存阵容库，请稍候');
 let code=C.normalizeCode($('code-input').value);if(C.classifyCode(code)==='lineup-data')code='#TA#'+code;
 if(!['pipe-ta','hash-ta'].includes(C.classifyCode(code)))return toast('请填写一条完整阵容码');
 const existing=lineups().find(x=>x.code===code),inputCode=C.normalizeCode($('code-input').value),draftKey=codeDraftKey,draftValues=codeFields.map(id=>$(id).value);
 const l={...existing,...currentCodeResult,...C.codeProvenance($('code-input').value),id:existing?.id||currentCodeResult?.id||'user-'+crypto.randomUUID(),code,title:$('code-title').value.trim()||existing?.title||'未命名阵容',dungeon:$('code-dungeon').value.trim()||'待分类',dungeons:[$('code-dungeon').value.trim()||'待分类'],category:existing?.category||'其他',notes:$('code-notes').value,members:currentCodeResult?.members||existing?.members||[],sourceKind:currentCodeResult?.sourceKind||'user',requirementsComplete:currentCodeResult?.requirementsComplete||false};
 const now=new Date().toISOString();l.updatedAt=now;l.createdAt=l.createdAt||existing?.date||now;
 codeSaving=true;$('save-code').disabled=true;
 try{
  if(!await commitState(state=>({...state,lineups:[...state.lineups.filter(x=>x.id!==l.id),l]})))return;
  const cached=codeDrafts.get(draftKey);if(cached&&cached.values.every((value,i)=>value===draftValues[i]))codeDrafts.delete(draftKey);
  if(C.normalizeCode($('code-input').value)===inputCode&&codeFields.every((id,i)=>$(id).value===draftValues[i])){codeDirty.clear();$('code-input').value=code;updateCode();}
  stopMatch();matchResults={};fillFilters();renderParseProgress();toast('阵容已保存，重新打开仍可使用');
 }finally{codeSaving=false;$('save-code').disabled=false;refreshAvailability();}
}
function scanQRImage(bitmap,active){
 return new Promise((resolve,reject)=>{
  const task=new Worker('qr-worker.js');let settled=false;
  const finish=(error,result)=>{if(settled)return;if(!active()){error=null;result={cancelled:true,codes:[]};}settled=true;clearInterval(cancel);clearTimeout(deadline);task.terminate();error?reject(error):resolve(result);};
  const cancel=setInterval(()=>{if(!active())finish(null,{cancelled:true,codes:[]});},80);
  const deadline=setTimeout(()=>finish(Error('图片识别超时，请裁剪为较小图片后重试')),45000);
  task.onmessage=({data})=>finish(data.error?Error(data.error):null,data.result);
  task.onerror=e=>finish(Error('图片识别失败：'+e.message));
  try{task.postMessage({bitmap},[bitmap]);}catch(error){finish(error);}
 });
}
async function importTAFiles(files){
 const revision=sessionRevision,generation=dataRevision,mode=importMode,active=()=>sameSession(revision)&&generation===dataRevision;if(libraryBusy||bulkBusy)return toast('正在保存资料，请稍候再导入');
 try{
   if(mode==='qr'){
     const file=files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('二维码图片不能超过20 MiB');const bitmap=await createImageBitmap(file);if(!active()){bitmap.close();return;}const scanVersion=++codeRevision;
     $('code-status').textContent='正在识别图片中的阵容二维码…';
     try{
       if(!active())return;if(bitmap.width*bitmap.height>24000000)throw new Error('二维码图片像素过大');
       const result=await scanQRImage(bitmap,()=>active()&&codeRevision===scanVersion);
       if(result.cancelled)return;
       const codes=result.codes.filter(code=>['pipe-ta','hash-ta','lineup-data'].includes(C.classifyCode(code)));
       if(!codes.length)throw Error(result.codes.length?'图片中的二维码不是 TA 阵容格式':'没有识别到阵容二维码，请使用清晰原图');
       const choose=async code=>{if(!active()||codeRevision!==scanVersion)return;$('detail-dialog').close();$('code-input').value=code;codeRevision++;updateCode();await localDecode();};
       if(codes.length===1)await choose(codes[0]);
       else{
         const labels=await Promise.all(codes.map(async(code,i)=>{try{const p=await decodeLocalInput(code);return p.ok?p.data.title||'阵容 '+(i+1):'文字阵容码 '+(i+1);}catch{return '阵容 '+(i+1);}}));if(!active()||codeRevision!==scanVersion)return;
         openDialog('选择图片中的阵容','识别到 '+codes.length+' 个阵容二维码'+(result.truncated?'；图片过长，可分段继续导入':''),'<div class="qr-choices">'+codes.map((code,i)=>'<button class="secondary" data-qr-choice="'+i+'"><strong>'+esc(labels[i])+'</strong><code>'+esc(code.slice(0,60))+'…</code></button>').join('')+'</div><p class="caption">先选择一套查看与保存；再次导入原图可选择其他阵容。</p>');
         for(const button of $('dialog-body').querySelectorAll('[data-qr-choice]'))button.onclick=()=>choose(codes[Number(button.dataset.qrChoice)]);
       }
     }finally{bitmap.close();}return;
   }
   const imported=[];
   for(const file of files){if(file.size>32*1024*1024)throw new Error('单个阵容文件不能超过32 MiB');const text=(await file.text()).replace(/^\uFEFF/,'').trim();if(!active())return;let input=text;if(text.startsWith('{')||text.startsWith('['))input=await jsonTask('parse',text);for(const item of Array.isArray(input)?input:[input]){const payload=await decodeContent(item);if(!active())return;if(!payload.ok)throw new Error(`${file.name}：${payload.error}`);const l=C.validateLineup(C.adaptTA(payload,DATA));l.parsedAt=new Date().toISOString();imported.push(l);}}
   stopMatch();
    if(await commitState(state=>{let rows=[...state.lineups];for(const l of imported){const old=rows.find(x=>x.code===l.code)||lineups().find(x=>x.code===l.code),saved={...C.mergeDecodedLineup(old,l),id:old?.id||'user-'+crypto.randomUUID(),category:old?.category||'其他',dungeon:old?.dungeon||'待分类',dungeons:old?.dungeons||['待分类']};rows=[...rows.filter(x=>x.id!==saved.id),saved];}return {...state,lineups:rows};},revision,null,null,active)){matchResults={};fillFilters();toast(`已解析并保存 ${imported.length} 条阵容`);if(imported.length){$('code-input').value=imported[0].code;updateCode();}}
 }catch(e){if(active())toast('导入失败：'+e.message);}
}
async function exportJSON(name,data){try{if(window.atlas){const saved=atlas.exportJSONText?await atlas.exportJSONText({name,text:await jsonTask('pretty',data)}):await atlas.exportJSON({name,data});toast(saved?'文件已导出':'已取消导出');return !!saved;}const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已开始下载备份文件');return true;}catch(error){toast('导出失败：'+error.message+'。请重新导出，选择其他可写目录。');return false;}}
let importMode='accounts';function pickFiles(mode){importMode=mode;$('file-input').value='';$('file-input').multiple=['accounts','payload'].includes(mode);$('file-input').accept=mode==='qr'?'.png,.jpg,.jpeg,.webp':mode==='payload'?'.json,.txt':'.json,application/json';$('file-input').click();}
function validateLineup(l){if(!C.hasLineupCode(l))throw new Error('阵容必须包含非空 code（原始阵容码）');const valid=C.validateLineup(l);return {...valid,id:valid.id||'manual-'+crypto.randomUUID(),sourceKind:valid.sourceKind||'manual'};}
async function handleFiles(files){
 const revision=sessionRevision,generation=dataRevision,active=()=>sameSession(revision)&&generation===dataRevision,mode=importMode,merge=$('merge-import').checked;if(!files.length)return;if(libraryBusy||bulkBusy)return toast('正在保存资料，请稍候再导入');
 try{
  const parsed=[];for(const f of files){if(f.size>50*1024*1024)throw new Error('单个文件不能超过50 MiB');const text=await f.text();if(!active())return;parsed.push({name:f.name,json:await jsonTask(mode==='accounts'?'parse-account':'parse',mode==='accounts'?{text,name:f.name}:text.replace(/^\uFEFF/,''))});if(!active())return;}
  if(mode==='accounts'){
   const accounts=parsed.map(p=>p.json);
   if(await commitState(state=>{let rows=[...state.accounts];for(const a of accounts){const old=rows.find(x=>x.id===a.id),updated=merge?C.mergeAccount(old,a):a;rows=[...rows.filter(x=>x.id!==a.id),updated];}return {...state,accounts:rows,activeAccount:accounts.at(-1).id};},revision,null,null,active)){
    resetMatchContext();matchResults={};accountPage=1;resolveServerNames();updateAccountSelect();renderAccounts();refreshAvailability();toast(`已保存 ${accounts.length} 份账号；重启后自动载入`);
   }
  }else if(mode==='backup'){
   const b=parsed[0].json;if(b?.format!=='onmyoji-atlas-backup'||b.schemaVersion!==1||!Array.isArray(b.accounts)||!Array.isArray(b.lineups))throw new Error('不支持的备份格式');
   const accounts=await jsonTask('restore-accounts',b.accounts),ls=b.lineups.filter(C.hasLineupCode).map(validateLineup);if(!active())return;
   const backup={schemaVersion:1,accounts,lineups:ls,deletedPresetIds:C.deletedPresetIds(b.deletedPresetIds),lineupReplacements:C.lineupReplacements(b.lineupReplacements),targetLineups:b.targetLineups,builderDraft:b.builderDraft||null,activeAccount:accounts.some(a=>a.id===b.activeAccount)?b.activeAccount:accounts[0]?.id||''};
   pendingBackup={backup,removed:b.lineups.length-ls.length,exportedAt:b.exportedAt,revision};previewBackupRestore();
  }else{
   let l=parsed[0].json;if(l?.ok===true)l=validateLineup({...C.adaptInspection(l,DATA.roster),code:l.code,sourceKind:'local-json',id:'local-'+crypto.randomUUID()});else l=validateLineup(l);
   if(await commitState(state=>({...state,lineups:[...state.lineups.filter(x=>x.id!==l.id),l]}),revision,null,null,active)){stopMatch();matchResults={};fillFilters();toast('结构化资料已保存');showLineup(l);}
  }
 }catch(error){if(active())toast('导入失败：'+error.message);}
}
let pendingBackup=null,backupUndo=null;
function previewBackupRestore(){
 const request=pendingBackup;if(!request)return;request.base=STATE;request.data=DATA;
 const merged=C.reconcileLibrary(DATA.lineups,STATE,request.backup);request.next=merged.state;
 const count=state=>C.libraryLineups(DATA.lineups,state).length;
 const sources={local:'本机',backup:'备份',preset:'内置预设'},details=merged.conflicts.slice(0,50).map(row=>`<tr><td>${esc(row.title||'未命名阵容')}</td><td>${row.count} → 1</td><td>${sources[row.source]}</td><td>${row.time?esc(new Date(row.time).toLocaleString('zh-CN')):'未记录'}</td></tr>`).join('');
 openDialog('恢复备份','合并阵容，重复项保留最新版本',`<p>本机独有阵容会保留。本机、备份和内置预设中，名称、阵容码或 ID 任一相同的记录合并为一条，保留时间最新的版本。库存账号、当前账号和制作器草稿使用备份内容；保留下来的账号会合并双方的目标阵容选择。</p><table class="restore-preview"><thead><tr><th>内容</th><th>当前资料</th><th>恢复后</th></tr></thead><tbody><tr><th>库存账号</th><td>${STATE.accounts.length}</td><td>${request.next.accounts.length}</td></tr><tr><th>可见阵容</th><td>${count(STATE)}</td><td>${count(request.next)}</td></tr></tbody></table><p>共比较 ${merged.summary.candidates} 条记录，合并 ${merged.summary.groups} 组重复项，减少 ${merged.summary.removed} 条重复记录。</p>${details?`<details><summary>查看重复项保留结果${merged.conflicts.length>50?'（前 50 组）':''}</summary><table class="restore-preview"><thead><tr><th>保留阵容</th><th>记录数</th><th>来源</th><th>记录时间</th></tr></thead><tbody>${details}</tbody></table></details>`:''}<p class="caption">比较修改、解析、创建与原始日期中的最新有效时间；未记录时间的排在最后，同一时间优先本机，其次备份，再次预设。备份导出时间不参与比较。</p><p class="caption">备份时间：${esc(request.exportedAt||'未记录')}${request.removed?'；将跳过 '+request.removed+' 条无原码记录':''}。恢复成功后，本次软件运行期间可撤销一次；继续修改资料后不能直接撤销。</p><div class="actions"><button id="confirm-restore-backup" class="primary">确认合并并恢复</button><button id="cancel-restore-backup" class="secondary">取消</button></div>`);
}
async function exportBackup(){
 try{const {state}=C.reconcileLibrary(DATA.lineups,STATE);return await exportJSON('阴阳师阵容图鉴-本地备份.json',{...state,format:'onmyoji-atlas-backup',exportedAt:new Date().toISOString()});}
 catch(error){toast('备份整理失败：'+error.message);return false;}
}
async function applyBackupRestore(){
 const request=pendingBackup;if(!request||libraryBusy)return;
 if(request.base!==STATE||request.data!==DATA){previewBackupRestore();toast('当前资料已变化，请核对更新后的数量再确认。');return;}
 libraryBusy=true;invalidatePendingImports();$('confirm-restore-backup').disabled=true;libraryParser?.cancel();stopMatch();let previous;
 try{
  const saved=await commitState(state=>{previous=state;return request.next;},request.revision,null,request.base,()=>request.data===DATA);
  // A guard may expire while the write is in flight. Once persisted, keep
  // the successful transaction's undo state even if the catalog refreshed.
  if(!saved&&STATE!==request.next){
   if(request.base!==STATE||request.data!==DATA){previewBackupRestore();toast('当前资料已变化，请核对更新后的数量再确认。');}return;
  }
  backupUndo={previous,restored:STATE};pendingBackup=null;window.resetBuilder?.();matchResults={};resetMatchContext();setLoading(false);$('loading').hidden=true;$('load-retry').hidden=true;
  updateAccountSelect();fillFilters();$('detail-dialog').close();selectView('library');$('undo-restore').hidden=false;toast('备份已恢复，可在页面顶部撤销本次恢复。');
 }finally{libraryBusy=false;if($('confirm-restore-backup'))$('confirm-restore-backup').disabled=false;createLibraryParser(sessionRevision);}
}
async function undoBackupRestore(){
 if(!backupUndo||libraryBusy)return;
 if(STATE!==backupUndo.restored)return toast('恢复后已修改资料，无法直接撤销。请导出当前备份后再恢复其他版本。');
 libraryBusy=true;invalidatePendingImports();libraryParser?.cancel();
 const request=backupUndo;
 try{if(await commitState(request.previous,sessionRevision,null,request.restored)){backupUndo=null;window.resetBuilder?.();$('undo-restore').hidden=true;resetMatchContext();matchResults={};updateAccountSelect();fillFilters();selectView('library');toast('已撤销本次恢复。');}
  else if(STATE!==request.restored)toast('恢复后已修改资料，无法直接撤销。请导出当前备份后再恢复其他版本。');}
 finally{libraryBusy=false;createLibraryParser(sessionRevision);}
}

function stopMatch(){
 if(worker)worker.terminate();worker=null;matchPaused=false;
 for(const id of matchJobIds){const r=matchResults[id];if(r&&!r.completed)r.proof={...r.proof,state:'stopped'};}
 matchJobIds.clear();$('cancel-match').hidden=true;$('match-all').disabled=!account();
 if(!$('match-progress').hidden)$('match-progress').textContent='精算已停止，已有结果保留';
 renderGapStatistics();
}
function showSamples(){openDialog('官方图片小样','采集后已核对资源类型；没有把立绘、头像或书签当作原生卡面',`<div class="sample-grid">${[['608','art-before','png','石长姬 · 未觉醒官方立绘','830 × 696'],['608','art-after','png','石长姬 · 觉醒官方立绘','830 × 696'],['217','portrait-before','jpg','大天狗 · 官方头像','90 × 90'],['217','bookmark','png','大天狗 · 官方书签','73 × 240']].map(([id,f,ext,name,size])=>`<div><img src="../data/images/${id}/${f}.${ext}" alt="${name}"><h3>${name}</h3><p>${size}</p></div>`).join('')}</div><div class="notice">透明立绘在矩形容器中完整展示，原图未裁切、未拉伸。原生卡面覆盖为 0；双形态图片没有互相复制填补。</div>`);}
document.addEventListener('click',async e=>{const b=e.target.closest('button,[data-hero],[data-actor],[data-view]');if(!b)return;if(b.dataset.view){e.preventDefault();selectView(b.dataset.view);}if(b.dataset.detail){const l=lineups().find(x=>x.id===b.dataset.detail);if(l)showLineup(l);}if(b.dataset.copy||b.id==='copy-lineup'){const l=b.id==='copy-lineup'?currentDialog:lineups().find(x=>x.id===b.dataset.copy);await copyCode(b,l?.shortCode||l?.code);}if(b.id==='scroll-members-left'||b.id==='scroll-members-right'){const row=$('dialog-body').querySelector('.member-detail-grid');row.scrollBy({left:row.clientWidth*.75*(b.id.endsWith('left')?-1:1),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}if(b.dataset.removeMember){selectedMembers=selectedMembers.filter(x=>x!==b.dataset.removeMember);renderSelected();page=1;renderLibrary();}if(b.id==='event-filter'){$('clear-filters').click();browseTo('限时活动 → 拾光永恒');}if((b.id==='parse-lineup'&&currentDialog)||b.dataset.reparse){const l=b.dataset.reparse?lineups().find(x=>x.id===b.dataset.reparse):currentDialog;if(l)await retryLineup(l);}if(b.dataset.parseAction==='start')startLibraryParse();if(b.dataset.parseAction==='pause')libraryParser?.pause();if(b.id==='export-lineup'&&currentDialog)exportJSON(currentDialog.title+'.json',currentDialog);if(b.id==='show-current-code'&&currentCodeResult)showLineup(currentCodeResult);if(b.id==='export-audit')exportJSON('覆盖报告-2026-09-12.json',{assets:DATA.assetAudit,excel:DATA.excelAudit});});
document.addEventListener('change',e=>{if(e.target.id==='detail-state'){detailState=e.target.value;showLineup(currentDialog);}});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const text=document.createElement('span');text.className='missing-art';text.textContent='图片读取失败 · '+e.target.alt;e.target.replaceWith(text);}},true);
function editorValues(){return JSON.stringify([...$('dialog-body').querySelectorAll('input,textarea,select')].map(el=>el.type==='checkbox'?el.checked:el.value));}
function closeDetail(){if(libraryBusy)return;if(manageEditing&&$('edit-code')&&editorValues()!==manageEditBaseline){$('dialog-feedback').hidden=false;$('dialog-feedback').innerHTML='<span>修改尚未保存，关闭会丢弃这些编辑。</span><button id="discard-edit" class="danger">放弃修改</button><button id="keep-edit" class="secondary">继续编辑</button>';$('keep-edit').focus();return;}$('detail-dialog').close();}
$('close-dialog').onclick=closeDetail;$('detail-dialog').onclick=e=>{if(e.target===$('detail-dialog'))closeDetail();};
$('detail-dialog').addEventListener('cancel',e=>{e.preventDefault();closeDetail();});
$('detail-dialog').addEventListener('close',()=>{manageEditing=null;manageEditBaseline='';pendingBackup=null;});
document.addEventListener('click',e=>{if(e.target.id==='discard-edit')$('detail-dialog').close();if(e.target.id==='keep-edit'){$('dialog-feedback').hidden=true;$('edit-title')?.focus();}if(e.target.id==='confirm-restore-backup')applyBackupRestore();if(e.target.id==='cancel-restore-backup')$('detail-dialog').close();if(e.target.id==='undo-restore')undoBackupRestore();if(e.target.id==='load-retry')appBoot=boot(sessionRevision);if(e.target.id==='export-recovery')$('export-backup').click();if(e.target.id==='reset-empty-filters')$('clear-filters').click();});
for(const id of ['search','category','subcategory','dungeon','source-filter','status-filter','gap-filter'])$(id).addEventListener(['search','dungeon'].includes(id)?'input':'change',()=>{if(id==='category')$('subcategory').value='';if(['category','subcategory'].includes(id))$('dungeon').value='';page=1;if(['search','dungeon'].includes(id))deferInput('library',()=>{if(view==='library'){if(id==='dungeon')renderDungeonOptions();renderLibrary();}});else{fillFilters();renderLibrary();}});
function addMemberFilter(){const r=DATA.roster.find(r=>r.name===$('member-filter').value.trim());if(!r)return;if(!selectedMembers.includes(r.id))selectedMembers.push(r.id);$('member-filter').value='';renderSelected();page=1;renderLibrary();}
$('member-filter').onchange=addMemberFilter;$('add-member-filter').onclick=addMemberFilter;$('member-filter').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addMemberFilter();}};
$('clear-filters').onclick=()=>{terminalBrowsePath='';targetOnly=false;for(const id of ['search','category','subcategory','dungeon','source-filter','status-filter','gap-filter'])$(id).value='';selectedMembers=[];renderSelected();page=1;fillFilters();hideDungeonOptions();renderLibrary();};
$('previous-page').onclick=()=>{page--;renderLibrary();};$('next-page').onclick=()=>{page++;renderLibrary();};
$('add-code').onclick=()=>{selectView('decode');$('code-input').focus();};$('code-input').oninput=updateCode;$('save-code').onclick=saveCode;$('remote-decode').onclick=()=>localDecode(true);$('clear-code').onclick=()=>{for(const id of ['code-input','code-title','code-dungeon','code-notes'])$(id).value='';updateCode();};
for(const id of codeFields)$(id).addEventListener('input',()=>codeDirty.add(id));
for(const [value,label] of AtlasLibrary.sorts)if(![...$('lineup-sort').options].some(o=>o.value===value))$('lineup-sort').add(new Option(label,value));
$('add-bulk').onclick=()=>{renderBulkPreview();$('bulk-dialog').showModal();$('bulk-input').focus();};
$('close-bulk').onclick=()=>{if(!bulkBusy)$('bulk-dialog').close();};$('bulk-dialog').oncancel=e=>{if(bulkBusy)e.preventDefault();};
$('bulk-input').oninput=()=>{bulkFileRevision++;bulkReading=false;bulkPreviewLimit=50;$('bulk-status').textContent='';renderBulkPreview();};
$('bulk-filter').onchange=()=>{bulkPreviewLimit=50;renderBulkPreview();};$('bulk-more').onclick=()=>{bulkPreviewLimit+=50;renderBulkPreview();};
$('bulk-read-file').onclick=()=>{$('bulk-file').value='';$('bulk-file').click();};$('bulk-file').onchange=()=>readBulkFile($('bulk-file').files[0]);$('bulk-apply').onclick=applyBulkImport;
$('bulk-template').onclick=async()=>{const revision=sessionRevision;try{if(window.atlas){const result=await atlas.copyCode(AtlasBulkImport.TEMPLATE);if(!result?.copied)throw new Error('剪贴板写入未完成');}else await navigator.clipboard.writeText(AtlasBulkImport.TEMPLATE);if(sameSession(revision))$('bulk-status').textContent='格式模板已复制。将占位文字替换为完整阵容码后粘贴到输入框。';}catch(error){if(sameSession(revision))$('bulk-status').textContent='复制失败：'+error.message;}};
$('bulk-view').onclick=()=>{for(const id of ['search','category','subcategory','dungeon','status-filter','gap-filter'])$(id).value='';selectedMembers=[];renderSelected();$('source-filter').value='user';$('lineup-sort').value='recent';page=1;$('bulk-dialog').close();selectView('library');};
$('import-accounts').onclick=()=>pickFiles('accounts');$('import-lineup').onclick=()=>pickFiles('lineup');$('import-ta').onclick=()=>pickFiles('payload');$('import-qr').onclick=()=>pickFiles('qr');$('restore-backup').onclick=()=>pickFiles('backup');$('file-input').onchange=()=>['payload','qr'].includes(importMode)?importTAFiles([...$('file-input').files]):handleFiles([...$('file-input').files]);
$('export-backup').onclick=exportBackup;
$('account-search').oninput=()=>{accountPage=1;deferInput('accounts',()=>{if(view==='accounts')renderAccounts(false);});};
for(const id of ['account-kind','account-page-size'])$(id).onchange=()=>{accountPage=1;renderAccounts();};
$('account-previous-page').onclick=()=>{accountPage--;renderAccounts();};$('account-next-page').onclick=()=>{accountPage++;renderAccounts();};
$('active-account').onchange=async()=>{const selected=$('active-account').value;if(!await commitState(state=>({...state,activeAccount:selected}))){updateAccountSelect();return;}resetMatchContext();accountPage=1;matchResults={};if(view==='accounts')renderAccounts();if(view==='library')renderLibrary();refreshAvailability();};
$('lineup-sort').onchange=()=>{page=1;renderLibrary();};$('match-all').onclick=()=>startMatch();$('cancel-match').onclick=()=>toggleMatchPause();
$('select-filtered').onchange=e=>{selectedLineups=e.target.checked?new Set(filteredLineups().map(l=>l.id)):new Set();renderSelection();};
$('select-invert').onclick=()=>{selectedLineups=new Set(filteredLineups().filter(l=>!selectedLineups.has(l.id)).map(l=>l.id));renderSelection();};
$('select-clear').onclick=()=>{selectedLineups.clear();renderSelection();};
$('target-add').onclick=()=>saveTargets();$('target-remove').onclick=()=>saveTargets(true);$('match-selected').onclick=()=>startMatch([...selectedLineups]);
$('gap-statistics').onclick=()=>openGapStatistics();$('close-gap-statistics').onclick=()=>$('gap-dialog').close();$('gap-statistics-pause').onclick=()=>toggleMatchPause();
$('gap-statistics-retry').onclick=()=>statsSnapshot&&startMatch(statsSnapshot.ids,{reuse:true});
document.addEventListener('change',e=>{const id=e.target.dataset.selectLineup;if(!id)return;e.target.checked?selectedLineups.add(id):selectedLineups.delete(id);renderSelection();});
$('new-manual').onclick=()=>{$('manual-json').value=JSON.stringify({title:'我的配置（请修改）',code:'',category:'其他',dungeon:'待分类',notes:'手工填写，不是阵容码解码结果',requirementsComplete:false,members:[{kind:'shikigami',name:'石长姬',shikigamiId:'608',awakening:null,skills:null,level:40,star:6,config:{suitRequirements:[],suitSelectionComplete:true,mainStats:{},ranges:[],metricId:1,targetScore:null,sixStarOnly:true,maxLevelOnly:true,scope:'all',excludeOccupied:false}}]},null,2);};
$('save-manual').onclick=async()=>{try{const l=validateLineup(JSON.parse($('manual-json').value));l.members=l.members.map((m,i)=>({...m,index:i}));if(await commitState(state=>({...state,lineups:[...state.lineups.filter(x=>x.id!==l.id),l]}))){stopMatch();matchResults={};fillFilters();toast('手工配置已保存');showLineup(l);}}catch(e){toast('配置未保存：'+e.message);}};
window.runLoginSmoke=async()=>{
 await appBoot;await TALogin.ready();const initial=await taLogin.status(),blocked=[];
 const result={title:document.title,mode:'offline-startup-explicit-login',offline:!$('app-shell').hidden&&!$('app-shell').inert&&$('login-screen').hidden,dataLoaded:!!DATA,noAutomaticQR:!initial.qr_image&&!initial.authenticated,accounts:STATE.accounts.length,lineups:lineups().length};
 // Auth-only operations must fail before invoking a decoder, network query or write.
 for(const [name,call] of Object.entries({query:()=>taLogin.query('|TA|'+'a'.repeat(32)),parsedSave:()=>atlas.saveParsedState({})})){try{await call();}catch(error){if(/请先扫码登录/.test(error.message))blocked.push(name);}}
 result.blockedOperations=blocked;result.localReads=!!(await atlas.loadData())&&Array.isArray((await atlas.loadState())?.accounts||[]);
 await TALogin.ensure();result.separateLogin=!$('login-screen').hidden&&$('app-shell').hidden;
 result.riskNoticeVisible=!!$('login-risk-title')&&!$('ta-risk-accept').checked&&$('ta-qr').disabled;
 try{await taLogin.action('qr');result.riskBlocksQR=false;}catch(error){result.riskBlocksQR=/免责声明/.test(error.message);}
 await taLogin.action('risk',{accepted:true});await taLogin.action('init');
 await taLogin.action('qr');const status=await taLogin.status(),image=$('ta-qr-image');if(image.getAttribute('src'))try{await image.decode();}catch{}
 result.loginModule={servers:status.servers.length,authenticated:status.authenticated,qrReady:!image.hidden&&image.naturalWidth>0};
 $('ta-enter').click();result.returnOffline=!$('app-shell').hidden&&$('login-screen').hidden;
 if(!result.offline||!result.dataLoaded||!result.noAutomaticQR||blocked.length!==2||!result.localReads||!result.separateLogin||!result.riskNoticeVisible||!result.riskBlocksQR||!result.returnOffline||!result.loginModule.qrReady||status.authenticated)result.error='离线启动、风险确认或二维码检查失败';
 return result;
};
window.runSmoke=async()=>{
 await appBoot;for(const img of document.querySelectorAll('#lineup-grid img')){img.loading='eager';try{await img.decode();}catch{}}
 return {title:document.title,hasData:!!DATA,lineups:lineups().length,roster:DATA.roster.length,actors:DATA.actors.length,accounts:STATE.accounts.length,visibleCards:document.querySelectorAll('.lineup-card').length,brokenImages:[...document.images].filter(i=>i.getAttribute('src')&&i.complete&&i.naturalWidth===0).length,galleryRemoved:!$('view-gallery'),accountCalculatorRemoved:!$('soul-calculator')};
};

function renderOfficialStatus(status){
 if(!$('official-status'))return;$('official-status').textContent=status?.message||'内置资料可以离线使用';$('official-auto').checked=status?.autoUpdate!==false;$('official-auto').disabled=!window.atlas;$('official-refresh').disabled=!window.atlas||!!status?.running;$('official-force').disabled=!window.atlas||!!status?.running;$('official-cancel').hidden=!status?.running;
 $('official-date').textContent=status?.lastCheckedAt?'最近检查：'+new Date(status.lastCheckedAt).toLocaleString('zh-CN'):'尚未在线检查';
 $('official-errors').textContent=(status?.errors||[]).join('\n');$('official-news').innerHTML=(DATA?.officialNews||[]).map(n=>`<div class="source-item">${link(n.url,n.title)}<p class="caption">${esc(n.date)}</p></div>`).join('')||'<p class="caption">更新官方资料后，这里显示最新维护公告。</p>';
}
let reloadingOfficial=false;
async function reloadOfficial(){if(reloadingOfficial||!window.atlas)return;const revision=sessionRevision;reloadingOfficial=true;try{const data=await readDesktopData();if(!sameSession(revision))return;DATA=data;resetMatchContext();matchResults={};fillFilters();selectView(view);refreshAvailability();renderOfficialStatus(DATA.officialUpdate);$('resource-date').textContent=DATA.officialUpdate.lastSuccessAt?'官方资源更新于 '+DATA.officialUpdate.lastSuccessAt.slice(0,10):'内置资源截至 '+DATA.cutoffDate;}finally{reloadingOfficial=false;}}
$('official-refresh').onclick=async()=>{try{await atlas.refreshOfficial({force:$('official-force').checked});}catch(e){toast('更新失败：'+e.message);}};
$('official-cancel').onclick=async()=>{try{await atlas.cancelOfficial();}catch(e){toast('停止更新失败：'+e.message+'，请重试');}};$('official-auto').onchange=async()=>{const next=$('official-auto').checked;try{renderOfficialStatus(await atlas.setAutoUpdate(next));}catch(e){$('official-auto').checked=!next;toast('更新设置未保存：'+e.message);}};
if(window.atlas?.onOfficialProgress)atlas.onOfficialProgress(status=>{if(!DATA)return;renderOfficialStatus(status);if(!status.running&&['complete','partial'].includes(status.phase))reloadOfficial().catch(e=>toast('读取更新失败：'+e.message));});
function setLoading(value){$('app-shell').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=value);}
async function boot(revision){
 parsedSnapshotReady=false;
 setLoading(true);$('loading').hidden=false;$('loading').textContent='正在读取本地资料…';
 try{
  const data=await readDesktopData();if(revision!==sessionRevision)return;DATA=data;
  const saved=await readDesktopState();if(revision!==sessionRevision)return;
  STATE=saved?.schemaVersion===1&&Array.isArray(saved.accounts)&&Array.isArray(saved.lineups)?saved:{schemaVersion:1,lineups:[],accounts:[],activeAccount:''};
  STATE={...STATE,deletedPresetIds:C.deletedPresetIds(STATE.deletedPresetIds),lineupReplacements:C.lineupReplacements(STATE.lineupReplacements),targetLineups:C.normalizeTargets(STATE,DATA.lineups)};
  let upgraded=false;
  const upgradedLineups=STATE.lineups.map(l=>{if(!['ta-query','ta-local'].includes(l.sourceKind)||l.mapperVersion>=5||!l.raw?.hconf)return l;try{const mapped=C.adaptTA({ok:true,format:'ta-payload',origin:l.sourceKind==='ta-query'?'official-query':'local',code:l.code,data:l.raw,kinds:l.members.map(m=>m.kind)},DATA);upgraded=true;return C.mergeDecodedLineup(l,mapped);}catch{return l;}});
  const validLineups=upgradedLineups.filter(C.hasLineupCode),removed=upgradedLineups.length-validLineups.length;
  if(upgraded||removed){if(await commitState(state=>({...state,lineups:validLineups}),revision)&&removed)toast('已清理 '+removed+' 条无阵容码的旧阵容');}
  if(revision!==sessionRevision)return;
  setLoading(false);fillFilters();resolveServerNames();updateAccountSelect();$('loading').hidden=true;selectView('library');createLibraryParser(revision);maybeAutoParse();refreshAvailability();renderOfficialStatus(DATA.officialUpdate);$('resource-date').textContent=DATA.officialUpdate?.lastSuccessAt?'官方资源更新于 '+DATA.officialUpdate.lastSuccessAt.slice(0,10):'内置资源截至 '+DATA.cutoffDate;
  $('load-retry').hidden=true;
 }catch(e){if(revision!==sessionRevision)return;$('loading').textContent='资料加载失败：'+e.message+'。可重新读取或恢复已有备份。';$('load-retry').hidden=false;$('load-retry').disabled=false;if(DATA){$('restore-backup').disabled=false;$('file-input').disabled=false;}}
}
window.addEventListener('atlas-session',event=>{
 libraryParser?.cancel();autoParseStarted=false;
 if(DATA){createLibraryParser(sessionRevision);if(event.detail?.authenticated){resolveServerNames();maybeAutoParse();refreshAvailability();}else{parseReport={...parseReport,phase:'paused',error:'登录会话已结束；本地资料仍可查看。'};renderParseProgress();}}
});
appBoot=boot(sessionRevision).then(()=>window.dispatchEvent(new Event('atlas-ready')));
