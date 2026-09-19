'use strict';
const C=AtlasCore,$=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const link=(url,label)=>`<a href="${esc(safeURL(url))}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
let DATA,STATE={schemaVersion:1,lineups:[],deletedPresetIds:[],accounts:[],activeAccount:''},view='library',page=1,accountPage=1,selectedMembers=[],worker=null,matchResults={},currentCodeResult=null,currentDialog=null,detailState='unawakened',toastTimer,sessionRevision=0,libraryBusy=false,appBoot=Promise.resolve();
const todayCN=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
const account=()=>STATE.accounts.find(a=>a.id===STATE.activeAccount);
const lineups=()=>C.libraryLineups(DATA.lineups,STATE).map(l=>AtlasCategories.resolve(l,DATA));
function toast(message){if($('detail-dialog').open){$('dialog-feedback').textContent=message;$('dialog-feedback').hidden=false;}$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),5000);}
async function browserDB(action,value){return new Promise((resolve,reject)=>{const r=indexedDB.open('onmyoji-atlas',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('state',action==='get'?'readonly':'readwrite'),s=t.objectStore('state'),q=action==='get'?s.get('main'):s.put(value,'main');q.onerror=()=>reject(q.error);t.oncomplete=()=>{db.close();resolve(q.result);};t.onerror=()=>reject(t.error);};});}
const sameSession=revision=>revision===sessionRevision;
async function persist(revision=sessionRevision,parseGuard=null){try{if(!sameSession(revision))return false;if(parseGuard&&!parseGuard())return false;if(window.atlas)await (parseGuard?atlas.saveParsedState(STATE):atlas.saveState(STATE));else await browserDB('put',STATE);return sameSession(revision);}catch(e){if(sameSession(revision))toast('保存失败：'+e.message+'。请立即导出备份。');return false;}}
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
function selectView(name){view=name;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+name);document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));$('add-code').hidden=name!=='library';$('add-bulk').hidden=name!=='library';$('account-selector').hidden=!['library','accounts','manage'].includes(name);$('page-title').textContent={library:'阵容库',decode:'阵容码查看',accounts:'我的账号',manage:'阵容库管理',audit:'来源与覆盖'}[name];if(name==='library')renderLibrary();if(name==='manage')renderManage();if(name==='accounts')renderAccounts();if(name==='audit')renderAudit();window.scrollTo(0,0);}
function rosterById(id){return DATA.roster.find(r=>r.id===String(id));}
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
 if(result.gapCategory==='ready')return '式神御魂达标';
 return result.gapCategory==='pending'?'计算中':'待核对';
}
function pathSelected(p,category=$('category').value,subcategory=$('subcategory').value,query=$('dungeon').value){return (!category||p.category===category)&&(!subcategory||p.subcategory===subcategory)&&AtlasCategories.searchMatches(p,query);}
function classificationCaption(l,category=$('category').value,subcategory=$('subcategory').value,query=$('dungeon').value){return AtlasCategories.caption(l.classificationPaths.find(p=>pathSelected(p,category,subcategory,query))||l.classificationPaths[0]);}
function filteredLineups(){const query=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean),category=$('category').value,dungeon=$('dungeon').value,source=$('source-filter').value,status=$('status-filter').value;return lineups().filter(l=>{
 if(!l.classificationPaths.some(p=>pathSelected(p,category,$('subcategory').value,dungeon)))return false;
 if(account()&&$('gap-filter').value&&!gapKinds(matchResults[l.id]).includes($('gap-filter').value))return false;
 if(source==='excel'&&!l.sourceFile&&!l.occurrences?.some(o=>o.sourceFile))return false;if(source==='web'&&!l.sourceKind?.startsWith('web'))return false;if(source==='user'&&!STATE.lineups.some(x=>x.id===l.id))return false;
 if(status==='structured'&&!l.members?.length)return false;if(status==='pending'&&l.members?.length)return false;if(status==='ready'&&!matchResults[l.id]?.ready)return false;if(['available','missing','unknown'].includes(status)&&matchResults[l.id]?.status!==status)return false;
 if(!selectedMembers.every(id=>l.members?.some(m=>m.shikigamiId===id)))return false;
 const text=JSON.stringify(l).toLowerCase();return query.every(q=>text.includes(q));
});}
function renderLibrary(){
 const ls=filteredLineups();
 if($('lineup-sort').value==='closest')ls.sort((a,b)=>C.compareMatches(matchResults[a.id],matchResults[b.id]));
 if($('lineup-sort').value==='recent')ls.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 page=Math.max(1,Math.min(page,Math.ceil(ls.length/24)||1));
 const category=$('category').value,subcategory=$('subcategory').value,query=$('dungeon').value.trim(),paths=ls.flatMap(l=>l.classificationPaths).filter(p=>pathSelected(p));
 const exactPath=query&&paths.find(p=>AtlasCategories.caption(p)===query||AtlasCategories.caption(p).startsWith(query+' → '));
 const prefix=exactPath?query.split(' → '):category?[category,subcategory].filter(Boolean).filter((s,i,a)=>!i||s!==a[i-1]):[],groups=new Map();
 const browsing=!$('search').value.trim()&&!selectedMembers.length&&(!subcategory||category)&&(!query||exactPath)&&paths.some(p=>AtlasCategories.segments(p).length>prefix.length);
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
 if(prefix.length)$('category-browser').insertAdjacentHTML('afterbegin',`<nav class="category-breadcrumb" aria-label="当前副本路径"><button class="ghost" data-browse-home>全部分类</button>${prefix.map((label,i)=>`<span aria-hidden="true">/</span>${i===prefix.length-1?'<strong>'+esc(label)+'</strong>':'<button class="ghost" '+browseAttrs(prefix.slice(0,i+1))+'>'+esc(label)+'</button>'}`).join('')}</nav>`);
 const applied=[...new Set(['source-filter','status-filter'].map(id=>$(id).value?$(id).selectedOptions[0]?.textContent:'').filter(Boolean)),...selectedMembers.map(id=>rosterById(id)?.name||id)];
 document.querySelector('.extra-filters summary').textContent=applied.length?'筛选：'+applied.join(' · '):'更多筛选';
 $('gap-filter').disabled=!account();
 $('results-count').textContent=`找到 ${ls.length} 个阵容${browsing?' · 分类预览':''}${selectedMembers.length?' · 不含成员未知的记录':''}`;
 const card=(l,caption=classificationCaption(l))=>`<article class="lineup-card"><div class="card-head"><div><h3>${esc(l.title)}</h3><p class="card-subtitle">${esc(caption)}${l.date?' · '+esc(l.date.slice(0,10)):''}</p></div>${badge(l)}</div>${heroTeam(l)}${gapBadges(matchResults[l.id])}<div class="card-footer"><code class="code" title="${esc(l.code||'来源未提供阵容码')}">${esc(l.code||'来源未提供阵容码')}</code>${l.code?`<button class="copy-code" data-copy="${esc(l.id)}">复制</button>`:''}</div><div class="actions card-actions"><button class="secondary" data-detail="${esc(l.id)}">详情</button><button class="ghost" data-reparse="${esc(l.id)}">${C.hasParsedContent(l)?"重新解析":"解析"}</button><button class="secondary" data-edit-lineup="${esc(l.id)}">编辑</button><button class="danger" data-delete-lineup="${esc(l.id)}">删除</button></div></article>`;
 $('lineup-grid').innerHTML=(browsing?[...groups].map(([label,g])=>`<section class="category-preview"><div class="section-heading"><h3>${esc(label)} <small>${g.items.size} 个阵容</small></h3>${g.terminal?'':`<button class="secondary" ${browseAttrs(g.parts)}>查看全部 →</button>`}</div><div class="lineup-grid">${[...g.items.values()].slice(0,g.terminal?g.items.size:3).map(l=>card(l,classificationCaption(l,category,subcategory,g.parts.join(' → ')))).join('')}</div></section>`).join(''):ls.slice((page-1)*24,page*24).map(l=>card(l)).join(''))||'<div class="empty">没有符合条件的阵容。<br>试试减少关键词或取消部分筛选。</div>';
 renderReparseButtons();
 $('page-indicator').textContent=`${page} / ${Math.ceil(ls.length/24)||1}`;$('previous-page').disabled=page===1;$('next-page').disabled=page*24>=ls.length;$('match-all').disabled=!account()||!!worker;
 $('nav-count').textContent=lineups().length;$('stat-lineups').textContent=lineups().length;$('stat-dungeons').textContent=new Set(lineups().flatMap(l=>l.dungeons||[l.dungeon])).size;$('stat-reference').textContent=lineups().filter(l=>l.members?.length).length;
 const active=DATA.events.filter(e=>e.start<=todayCN()&&e.end>=todayCN()&&e.battle);$('event-strip').innerHTML=active.length?`<div class="event-banner"><div><strong>${esc(active[0].title)} · 进行中</strong><span>截至 ${esc(active[0].end)}</span></div><button class="ghost" id="event-filter">查看活动阵容 →</button></div>`:'';
}
function fillFilters(){if(!DATA)return;const all=lineups();$('nav-count').textContent=all.length;const paths=all.flatMap(l=>l.classificationPaths),update=(id,values,label)=>{const el=$(id),old=el.value,rows=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh'));el.innerHTML=`<option value="">${label}</option>`+rows.map(v=>`<option>${esc(v)}</option>`).join('');el.value=rows.includes(old)?old:'';};update('category',paths.map(p=>p.category),'全部分类');const parent=paths.filter(p=>!$('category').value||p.category===$('category').value);update('subcategory',parent.map(p=>p.subcategory),'全部子类');$('hero-options').innerHTML=DATA.roster.map(r=>`<option value="${esc(r.name)}">${esc(r.rarity)} · ${r.id}</option>`).join('');if(document.activeElement===$('dungeon'))renderDungeonOptions();}
function hideDungeonOptions(){$('dungeon-options').hidden=true;$('dungeon').setAttribute('aria-expanded','false');$('dungeon').removeAttribute('aria-activedescendant');}
function renderDungeonOptions(){
 const rows=new Map();for(const l of lineups())for(const p of l.classificationPaths)if(pathSelected(p)){const label=AtlasCategories.caption(p);if(!rows.has(label))rows.set(label,new Set());rows.get(label).add(l.id);}
 $('dungeon-options').innerHTML=[...rows].sort(([a],[b])=>a.localeCompare(b,'zh')).map(([label,ids],i)=>`<button type="button" role="option" aria-selected="false" tabindex="-1" id="dungeon-option-${i}" data-stage-option="${esc(label)}"><span>${esc(label)}</span><small>${ids.size} 个</small></button>`).join('')||'<p role="status">没有匹配副本，试试首领名或减少关键词。</p>';
 $('dungeon-options').hidden=false;$('dungeon').setAttribute('aria-expanded','true');$('dungeon').removeAttribute('aria-activedescendant');
}
function browseTo(value){
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
function openDialog(title,subtitle,body){$('dialog-feedback').hidden=true;$('dialog-heading').innerHTML=`<h2>${esc(title)}</h2><p>${esc(subtitle)}</p>`;$('dialog-body').innerHTML=body;if(!$('detail-dialog').open)$('detail-dialog').showModal();}
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

function renderAccounts(){renderRecommendations();
 const a=account();$('account-pagination').hidden=!a;
 if(!a){$('account-summary').innerHTML='';$('account-heroes').innerHTML='<p class="muted">导入平安志 JSON 后选择账号。</p>';$('account-souls').innerHTML='';return;}
 const heroes=Object.values(a.heroes),souls=Object.values(a.souls);
 $('account-summary').innerHTML=`<div class="overview"><div><strong>${heroes.length}</strong><span>角色实例（含素材）</span></div><div><strong>${new Set(heroes.map(h=>h.shikigamiId)).size}</strong><span>角色类型</span></div><div><strong>${souls.length}</strong><span>御魂</span></div><div><strong>${a.presets.length}</strong><span>御魂预设</span></div></div><details class="inventory-notes"><summary>库存信息${a.warnings.length?' · '+a.warnings.length+' 项提醒':''}</summary><p>采集时间：${esc(a.capturedAt)}。当前穿戴归属未提供，配装使用全仓库库存。</p>${a.warnings.map(w=>'<p>'+esc(w)+'</p>').join('')}</details>`;
 const q=$('account-search').value.trim(),kind=$('account-kind').value;
 const filtered=heroes.filter(h=>{const r=rosterById(h.shikigamiId);return `${r?.name||''} ${h.shikigamiId}`.includes(q)&&(!kind||(kind==='material'?r?.isMaterial:!r?.isMaterial));}).sort((a,b)=>b.level-a.level||Number(b.shikigamiId)-Number(a.shikigamiId)||a.instanceId.localeCompare(b.instanceId));
 const slice=C.paginate(filtered,accountPage,$('account-page-size').value);accountPage=slice.page;
 $('account-heroes').innerHTML=slice.items.map(h=>{const r=rosterById(h.shikigamiId);return `<div class="owned-hero"><div class="portrait">${thumb({name:r?.name,shikigamiId:h.shikigamiId,awakening:h.awake})}</div><div><strong>${esc(r?.name||'未收录角色 '+h.shikigamiId)}</strong><p>${h.level}级 · ${h.star}星 · ${r?.isMaterial?'培养素材':h.awake?'已觉醒':'未觉醒'}</p><p class="small">技能等级 ${h.skills.map(s=>s.level).join(' / ')||'未提供'}</p></div></div>`;}).join('')||'<p class="muted">没有符合筛选的角色。</p>';
 $('account-page-indicator').textContent=`第 ${slice.page} / ${slice.pages} 页 · 显示 ${slice.start}–${slice.end} / ${slice.total} 个实例`;
 $('account-previous-page').disabled=slice.page===1;$('account-next-page').disabled=slice.page===slice.pages;
 $('account-souls').innerHTML=`<details><summary>御魂仓库摘要</summary><p>六星满级 ${souls.filter(s=>s.star===6&&s.level===15).length} 件；未识别属性 ${souls.filter(s=>s.unknown.length).length} 件。</p><div class="scroll-table"><table><thead><tr><th>套装</th><th>库存</th><th>六星满级</th></tr></thead><tbody>${[...new Set(souls.map(s=>s.set))].sort().map(set=>`<tr><td class="inventory-suit">${gameImage(soulAsset(set))}<span>${esc(set)}</span></td><td>${souls.filter(s=>s.set===set).length}</td><td>${souls.filter(s=>s.set===set&&s.level===15&&s.star===6).length}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function renderAudit(){
 const a=DATA.assetAudit,e=DATA.excelAudit,ls=lineups(),coveragePaths=[...new Map(ls.flatMap(l=>l.classificationPaths).map(p=>[AtlasCategories.caption(p),p])).values()];
 $('audit-content').innerHTML=`<div class="audit-grid"><div class="audit-stat"><p>表格原码 / 已解析</p><strong>${e.uniqueCodes} / ${e.decoded}</strong></div><div class="audit-stat"><p>已保存式神图片</p><strong>${a.downloaded}</strong></div><div class="audit-stat"><p>形态待核对</p><strong>${a.unknown}</strong></div></div>
 <details class="panel audit-details"><summary>副本覆盖</summary><div class="scroll-table"><table><thead><tr><th>分类 / 副本</th><th>记录</th><th>已有成员</th><th>待核对</th></tr></thead><tbody>${coveragePaths.map(t=>{const rows=ls.filter(l=>l.classificationPaths.some(p=>AtlasCategories.caption(p)===AtlasCategories.caption(t))),n=rows.filter(r=>r.members?.length).length;return `<tr><td>${esc(AtlasCategories.caption(t))}</td><td>${rows.length}</td><td>${n}</td><td>${rows.length?(n===rows.length?'实战要求':'部分成员待解析'):'尚未收录'}</td></tr>`;}).join('')}</tbody></table></div></details>
 <details class="panel audit-details"><summary>活动与日期</summary>${DATA.events.map(e=>`<div class="source-item"><strong>${esc(e.title)}</strong><p>${esc(e.start)} 至 ${esc(e.end)} · ${e.start>todayCN()?'未开启':e.end<todayCN()?'已结束':'进行中'}</p><p>${esc(e.notes)}</p>${link(e.sourceUrl,'官方公告')}</div>`).join('')}</details>
 <details class="panel audit-details"><summary>御魂计算依据</summary><p>按原码要求，使用全仓库库存计算，同队不重复占用式神和御魂实例。缺少式神或培养不足时，御魂标签按补齐原码培养条件后的结果判断，实际缺口仍保留。</p><p>基础属性优先使用平安志实例数据；缺失时只使用已核验的 40 级六星官方属性。资料不足时标为待核对。阴阳师、契灵与术印仅展示，不参与达标判断。</p><p>攻击、生命、防御按“基础 ×（1 + 加成比例）+ 固定加成”合成；其余属性加和。防御两件套为 30%，无刀取为 20% 暴伤。首领固定属性仅按导出副属性计入一次；六件同一普通套装计两次二件加成。额外攻击比例作用于合成后攻击。</p><div class="scroll-table"><table><thead><tr><th>指标</th><th>公式（暴伤为倍率）</th></tr></thead><tbody>${Object.entries(C.METRICS).map(([id,m])=>`<tr><td>${id} · ${esc(m[0])}</td><td>${esc(m[1])}</td></tr>`).join('')}</tbody></table></div><p>指标用于选装，不等同实战伤害。精算采用分支定界搜索，不截断候选；完成搜索才给出最优或无解结论。计算逻辑与 2.8.84 APK 静态数据交叉核对。</p>${link('https://github.com/FiresChain/onmyoji-yuhun/blob/main/src/calculation.ts','计算公式源码')} · ${link('https://github.com/FiresChain/onmyoji-yuhun/blob/main/src/team-calculation.ts','指标与单位映射')}</details>
 <details class="panel audit-details"><summary>阵容来源</summary><div class="source-list">${DATA.sources.map(s=>`<div class="source-item">${link(s.url,s.title||s.bvid)}<p>${esc(s.author||'')} ${esc(s.publishedAt?.slice(0,10)||'')} · ${s.error?'读取失败：'+esc(s.error):(s.codes?.length||0)+' 条原码'}</p><details><summary>原文与核验信息</summary><p class="wrap">${esc(s.description||'没有取得正文')}</p><p>采集时间 ${esc(s.evidence?.retrievedAt)}<br>SHA-256 ${esc(s.evidence?.sha256)}</p></details></div>`).join('')}</div></details>
 <details class="panel audit-details"><summary>图片来源、权利与缺口</summary><p>官方素材版权归网易及相关权利人所有，仅用于个人学习、交流和本地查看，不代表取得商业授权。来源说明保留在本地资料中。</p><p>${a.failures.length} 个资源请求未取得有效图片，${a.duplicateCharacters.length} 个角色存在重复文件待复核；${a.supported} 个角色已确认双形态，${a.notApplicable} 个无独立觉醒形态。原生卡面尚未核验，未声称资源已全部收齐。</p><p>官方目录动态 / 静态记录 ${a.dynamicCount} / ${a.staticCount}，ID 差异 ${(a.onlyDynamic?.length||0)+(a.onlyStatic?.length||0)}。表格共 ${e.occurrences} 条记录、${e.uniqueCodes} 个唯一原码；${e.decoded} 个已解析，${e.rejected} 个被服务器拒绝。</p><button id="export-audit" class="secondary">导出覆盖报告</button></details>`;
}
let codeTimer,codeRevision=0;
function showCodeResult(result){currentCodeResult=result;$('code-title').value=result.title;$('code-dungeon').value=result.dungeon||'';$('code-notes').value=result.notes||'';$('decode-result').innerHTML=`<h2>${esc(result.title)}</h2>${heroTeam(result)}${badge(result)}<p class="detail-notes">${esc(result.notes||'无备注')}</p>${!result.members?.length?'<div class="notice">尚未解析，登录后可查询成员要求。</div>':''}<button class="secondary" id="show-current-code">查看完整详情</button>`;}
function updateCode(){
 clearTimeout(codeTimer);codeRevision++;currentCodeResult=null;const code=C.normalizeCode($('code-input').value),kind=C.classifyCode(code);
 if(!code){$('code-status').textContent='等待输入';$('decode-result').innerHTML='<h2>阵容预览</h2><p class="muted">输入阵容码后查看。</p>';return;}
 const existing=lineups().find(l=>l.code===code);if(existing){showCodeResult(existing);$('code-status').textContent=existing.members?.length?'读取已保存的解析结果（可离线查看）':'已有文字码记录 · 等待自动解析或点击单条解析';return;}
 $('code-status').textContent={unknown:'未识别完整格式', 'too-large':'内容超过32 MiB', 'pipe-ta':'文字分享码 · 点击解析后自动保存结果', 'hash-ta':'二维码文本 · 正在识别','lineup-data':'完整阵容内容 · 正在识别'}[kind];
 $('decode-result').innerHTML=kind==='pipe-ta'?'<h2>文字分享码待查询</h2><p>点击“解析”查询成员和配置。</p>':'<h2>阵容详情预览</h2><p class="muted">输入完整内容后自动在本机解析。</p>';
 if(['hash-ta','lineup-data'].includes(kind)){if(window.TALogin?.status().authenticated)codeTimer=setTimeout(localDecode,350);else $('code-status').textContent='完整原码可先保存，登录后再解析';}
}
async function decodeLocalInput(input){if(window.atlas)return atlas.decode(input);const r=await fetch('/api/decode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw new Error('本地解析服务不可用，请使用 Windows 桌面版');return r.json();}
async function decodeContent(input,options={}){return typeof input==='string'&&C.classifyCode(input)==='pipe-ta'?window.TALogin.query(C.normalizeCode(input),options):decodeLocalInput(input);}
let libraryParser=null,autoParseStarted=false,parsePriority=[],parseReport={phase:'idle'},matchTimer,queryProgress=null;
function queryProgressText(){return !queryProgress?'':queryProgress.phase==='waiting'?`等待 ${Math.max(0,Math.ceil((queryProgress.retryAt-Date.now())/1000))} 秒后查询（第 ${queryProgress.attempt} / ${queryProgress.maxAttempts} 次）`:`正在查询（第 ${queryProgress.attempt} / ${queryProgress.maxAttempts} 次）`;}
window.taLogin?.onQueryProgress?.(progress=>{queryProgress=progress;renderParseProgress();if(progress&&C.normalizeCode($('code-input').value)===progress.code)$('code-status').textContent=queryProgressText();});
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
 if(bulkBusy||bulkReading||!DATA)return;let preview=renderBulkPreview();if(preview.error||!preview.entries.length)return;
 const revision=sessionRevision,parser=libraryParser,resume=parseReport.phase==='running',remaining=lineups().filter(AtlasLibraryParser.canAttempt).map(l=>l.code),auto=$('bulk-auto-parse').checked;
 bulkBusy=true;bulkFileRevision++;clearTimeout(codeTimer);clearTimeout(matchTimer);stopMatch();parser?.pause();renderBulkPreview();
 $('bulk-status').textContent=parser?.inflight.size?'正在等待当前解析保存，然后添加新阵容…':'正在保存到本机…';
 let added=[];
 try{
  await Promise.allSettled([parser?.running,...(parser?.inflight.values()||[])]);
  if(!sameSession(revision))return;
  preview=renderBulkPreview();if(preview.error||!preview.entries.length){$('bulk-status').textContent='没有新的有效原码可添加。';return;}
  const createdAt=new Date().toISOString();added=preview.entries.map(row=>({...row,id:'user-'+crypto.randomUUID(),category:'其他',dungeons:[row.dungeon],sourceKind:'user',decodeState:'unattempted',requirementsComplete:false,members:[],createdAt}));
  STATE.lineups.push(...added);
  if(!await persist(revision)){
   if(sameSession(revision)){STATE.lineups=STATE.lineups.filter(l=>!added.includes(l));$('bulk-status').textContent='保存失败，本批未添加。输入文本已保留，可以重试或复制备份。';}added=[];return;
  }
  if(!sameSession(revision))return;
  fillFilters();if(view==='library')renderLibrary();if(view==='manage')renderManage();renderParseProgress();
  $('bulk-view').hidden=false;$('bulk-status').textContent=`已添加 ${added.length} 条；跳过 ${preview.stats.duplicate} 条重复、${preview.stats.invalid} 条格式错误。`+(auto?' 解析结果会逐条保存，可关闭此窗口查看进度。':' 原码已保存，可在阵容库随时解析。');
 }catch(error){if(sameSession(revision)){$('bulk-status').textContent='添加未完成：'+error.message;}}
 finally{
  if(sameSession(revision)){
   bulkBusy=false;renderBulkPreview();
   if(added.length&&auto){parsePriority=[...new Set([...added.map(l=>l.code),...parsePriority])];autoParseStarted=false;maybeAutoParse();}
   else if(resume)startLibraryParse({codes:remaining});
   scheduleMatch();
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
 if(!libraryParser||!requireParserLogin()||libraryParser.inflight.has(l.code))return;
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
   renderParseProgress();scheduleMatch();
  }
 }
}
function renderParseProgress(){
 if(!DATA)return;
 const pending=lineups().filter(AtlasLibraryParser.canAttempt).length,expired=lineups().filter(AtlasParseErrors.isExpired).length,role=window.TALogin?.status().authenticated&&!!window.TALogin?.status().selected_avatar,running=['running','pausing'].includes(parseReport.phase);
 let message=pending?`还有 ${pending} 个原码待解析；成功内容自动保存在本机。`:expired?'可解析的原码已处理。':'库内所有原码已有本地内容，后续直接读取。';
 if(running)message=`${parseReport.phase==='pausing'?'当前条目完成后暂停':'正在逐条解析'}：${parseReport.completed} / ${parseReport.total}，成功 ${parseReport.succeeded}，失败 ${parseReport.failed}。${parseReport.current||''} · 当前已等待 ${Math.max(0,Math.floor((Date.now()-(parseReport.currentStartedAt||Date.now()))/1000))} 秒`;
 else if(['complete','partial','paused'].includes(parseReport.phase)&&Number.isFinite(parseReport.total))message=`${parseReport.phase==='paused'?'解析已暂停':'本轮解析结束'}：成功 ${parseReport.succeeded}，失败 ${parseReport.failed}；仍待解析 ${pending} 个。${parseReport.error||''}`;
 if(running&&queryProgress)message+=' · '+queryProgressText();
 if(expired)message+=` ${expired} 个失效码已单独汇总，可更换原码或一键清理。`;
 if(pending&&!role&&!running)message+=' 文字码查询需要在「登录账号 / 切换角色」选择已有角色。';
 for(const el of document.querySelectorAll('[data-parse-progress]'))el.textContent=message;
 for(const el of document.querySelectorAll('[data-parse-summary]'))el.textContent=running?`解析中 ${parseReport.completed} / ${parseReport.total}`:pending?`待解析 ${pending} 条`:'解析已完成';
 for(const el of document.querySelectorAll('[data-parse-action="start"]')){el.disabled=running||!pending;el.textContent=!role?'登录后解析':parseReport.phase==='paused'?'继续解析剩余内容':'解析剩余内容';}
 for(const el of document.querySelectorAll('[data-parse-action="pause"]')){el.hidden=!running;el.disabled=parseReport.phase==='pausing';}renderParseFailures();
}
async function saveParsedLineup(item,payload,valid){
 if(!valid())return false;
 if(payload.code!==item.code)throw new Error('解析结果原码不一致，未覆盖本地内容');
 stopMatch();
 const incoming=C.validateLineup(C.adaptTA(payload,DATA)),existing=lineups().filter(l=>l.code===item.code),oldRows=existing.length?existing:[item],previous=new Map(STATE.lineups.map(l=>[l.id,l])),updates=[];let saved;
 for(const old of oldRows){saved={...C.mergeDecodedLineup(old,incoming),id:old.id||'user-'+crypto.randomUUID(),parsedAt:new Date().toISOString(),lastParseError:null,lastParseFailure:null};STATE.lineups=STATE.lineups.filter(l=>l.id!==saved.id);STATE.lineups.push(saved);updates.push(saved);delete matchResults[saved.id];}
 if(!await persist(sessionRevision,valid)){if(valid())for(const row of updates){if(!STATE.lineups.includes(row))continue;STATE.lineups=STATE.lineups.filter(l=>l!==row);if(previous.has(row.id))STATE.lineups.push(previous.get(row.id));}return false;}
 if(!valid())return false;
 fillFilters();if(view==='library')renderLibrary();if(view==='manage')renderManage();renderParseProgress();
 if(C.normalizeCode($('code-input').value)===saved.code){showCodeResult(saved);$('code-status').textContent='解析完成，已保存在本机';}
 return saved;
}
function createLibraryParser(revision){
 libraryParser?.cancel();autoParseStarted=false;parsePriority=[];parseReport={phase:'idle'};
 libraryParser=new AtlasLibraryParser.LibraryParser({items:lineups,decode:decodeContent,active:()=>sameSession(revision)&&!!DATA&&window.TALogin?.status().authenticated===true,save:saveParsedLineup,
  saveFailure:async(item,message,valid,failure)=>{
   if(!valid())return;let old=lineups().find(l=>l.id===item.id||l.code===item.code);
    if(!old){if(!AtlasParseErrors.isExpired({lastParseFailure:failure}))return;old={...item,id:'user-'+crypto.randomUUID(),sourceKind:'user',category:'其他',dungeon:item.dungeon||'待分类',members:[],decodeState:'unattempted',requirementsComplete:false};}
   const previous=STATE.lineups.find(l=>l.id===old.id),failed={...old,lastParseError:message,lastParseFailure:failure,lastParseAttemptAt:new Date().toISOString()};
   STATE.lineups=STATE.lineups.filter(l=>l.id!==failed.id);STATE.lineups.push(failed);
   if(!await persist(sessionRevision,valid)){if(valid()&&STATE.lineups.includes(failed)){STATE.lineups=STATE.lineups.filter(l=>l!==failed);if(previous)STATE.lineups.push(previous);}throw new Error('失败记录未能保存到本地，已暂停解析');}
   if(valid()){fillFilters();renderParseProgress();if(view==='manage')renderManage();}
  },
  onProgress:report=>{parseReport=report;renderParseProgress();if(['complete','partial','paused'].includes(report.phase))scheduleMatch();}
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
function scheduleMatch(){clearTimeout(matchTimer);if(bulkBusy||libraryBusy||!account()||!DATA||['running','pausing'].includes(parseReport.phase))return;const revision=sessionRevision;matchTimer=setTimeout(()=>{if(sameSession(revision)&&account()&&!bulkBusy&&!['running','pausing'].includes(parseReport.phase))startMatch();},400);}
window.addEventListener('atlas-login-status',()=>{renderParseProgress();maybeAutoParse();});
async function localDecode(force=false){
 if(!requireParserLogin())return;
 clearTimeout(codeTimer);const code=C.normalizeCode($('code-input').value),revision=codeRevision;if(!['pipe-ta','hash-ta','lineup-data'].includes(C.classifyCode(code)))return toast('请粘贴一条完整阵容码或 lineup_data');
 currentCodeResult=null;$('remote-decode').disabled=true;$('code-status').textContent=C.classifyCode(code)==='pipe-ta'?'正在查询文字阵容码…':'正在本机解析…';
  try{const canonical=C.classifyCode(code)==='lineup-data'?'#TA#'+code:code,existing=lineups().find(l=>l.code===canonical),item=existing||{code:canonical,...C.codeProvenance($('code-input').value),title:$('code-title').value.trim()||'未命名阵容',dungeon:$('code-dungeon').value.trim()||'待分类',notes:$('code-notes').value};
    const result=await libraryParser.parseOne(item,{force});if(revision!==codeRevision||C.normalizeCode($('code-input').value)!==code)return;
    $('code-input').value=result.code;showCodeResult(result);$('code-status').textContent=`V${result.protocolVersion} ${result.decodeState==='decoded-server'?'查询并解析成功':'本地解析成功'} · ${result.members.length} 位成员 · 已自动保存在本机`;scheduleMatch();
  }catch(e){if(revision!==codeRevision)return;const saved=lineups().find(l=>l.code===code);if(saved&&C.hasParsedContent(saved))showCodeResult(saved);else{currentCodeResult=null;$('decode-result').innerHTML=`<div class="notice">${esc(e.message)}</div>`;}$('code-status').textContent='解析未完成：'+e.message;}finally{$('remote-decode').disabled=false;}
}
async function saveCode(){
 if(libraryBusy)return toast('正在保存阵容库，请稍候');
 let code=C.normalizeCode($('code-input').value);if(C.classifyCode(code)==='lineup-data')code='#TA#'+code;
 if(!['pipe-ta','hash-ta'].includes(C.classifyCode(code)))return toast('请填写一条完整阵容码');
 const existing=lineups().find(x=>x.code===code),previous=STATE.lineups;
 const l={...existing,...currentCodeResult,...C.codeProvenance($('code-input').value),id:existing?.id||currentCodeResult?.id||'user-'+crypto.randomUUID(),code,title:$('code-title').value.trim()||existing?.title||'未命名阵容',dungeon:$('code-dungeon').value.trim()||'待分类',dungeons:[$('code-dungeon').value.trim()||'待分类'],category:existing?.category||'其他',notes:$('code-notes').value,members:currentCodeResult?.members||existing?.members||[],sourceKind:currentCodeResult?.sourceKind||'user',requirementsComplete:currentCodeResult?.requirementsComplete||false};
 STATE.lineups=[...STATE.lineups.filter(x=>x.id!==l.id),l];
 if(!await persist()){STATE.lineups=previous;return;}
 matchResults={};$('code-input').value=code;fillFilters();renderParseProgress();toast('阵容已保存，重新打开仍可使用');updateCode();
}
async function importTAFiles(files){
 const revision=sessionRevision,mode=importMode;if(!sameSession(revision))return;
 try{
   if(mode==='qr'){
     const file=files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('二维码图片不能超过20 MiB');const bitmap=await createImageBitmap(file);
     try{if(!sameSession(revision))return;if(bitmap.width*bitmap.height>24000000)throw new Error('二维码图片像素过大');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),result=jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});if(!result)throw new Error('图片中没有识别到二维码');if(!['pipe-ta','hash-ta','lineup-data'].includes(C.classifyCode(result.data)))throw new Error('二维码内容不是支持的 TA 阵容格式');$('code-input').value=result.data;codeRevision++;await localDecode();}finally{bitmap.close();}return;
   }
   const imported=[];
   for(const file of files){if(file.size>32*1024*1024)throw new Error('单个阵容文件不能超过32 MiB');const text=(await file.text()).replace(/^\uFEFF/,'').trim();if(!sameSession(revision))return;let input=text;if(text.startsWith('{')||text.startsWith('['))input=JSON.parse(text);for(const item of Array.isArray(input)?input:[input]){const payload=await decodeContent(item);if(!sameSession(revision))return;if(!payload.ok)throw new Error(`${file.name}：${payload.error}`);const l=C.validateLineup(C.adaptTA(payload,DATA));imported.push(l);}}
   stopMatch();
   for(const l of imported){const old=lineups().find(x=>x.code===l.code);const saved={...C.mergeDecodedLineup(old,l),id:old?.id||'user-'+crypto.randomUUID(),category:old?.category||'其他',dungeon:old?.dungeon||'待分类',dungeons:old?.dungeons||['待分类']};STATE.lineups=STATE.lineups.filter(x=>x.id!==saved.id);STATE.lineups.push(saved);}
   if(await persist()){matchResults={};fillFilters();toast(`已解析并保存 ${imported.length} 条阵容`);if(imported.length){$('code-input').value=imported[0].code;updateCode();}}
 }catch(e){if(sameSession(revision))toast('导入失败：'+e.message);}
}
async function exportJSON(name,data){if(window.atlas){if(await atlas.exportJSON({name,data}))toast('文件已导出');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let importMode='accounts';function pickFiles(mode){importMode=mode;$('file-input').value='';$('file-input').multiple=['accounts','payload'].includes(mode);$('file-input').accept=mode==='qr'?'.png,.jpg,.jpeg,.webp':mode==='payload'?'.json,.txt':'.json,application/json';$('file-input').click();}
function validateLineup(l){if(!C.hasLineupCode(l))throw new Error('阵容必须包含非空 code（原始阵容码）');const valid=C.validateLineup(l);return {...valid,id:valid.id||'manual-'+crypto.randomUUID(),sourceKind:valid.sourceKind||'manual'};}
async function handleFiles(files){const revision=sessionRevision,mode=importMode;if(!sameSession(revision))return;try{const parsed=[];for(const f of files){if(f.size>50*1024*1024)throw new Error('单个文件不能超过50 MiB');const text=await f.text();if(!sameSession(revision))return;parsed.push({name:f.name,json:JSON.parse(text.replace(/^\uFEFF/,''))});}if(mode==='accounts'){const accounts=parsed.map(p=>C.parseAccount(p.json,p.name));stopMatch();for(const a of accounts){const old=STATE.accounts.find(x=>x.id===a.id),updated=$('merge-import').checked?C.mergeAccount(old,a):a;STATE.accounts=STATE.accounts.filter(x=>x.id!==a.id);STATE.accounts.push(updated);STATE.activeAccount=a.id;}matchResults={};if(await persist()){accountPage=1;resolveServerNames();updateAccountSelect();renderAccounts();scheduleMatch();toast(`已保存 ${accounts.length} 份账号；重启后自动载入`);}}
else if(mode==='backup'){const b=parsed[0]?.json;if(b?.format!=='onmyoji-atlas-backup'||b.schemaVersion!==1||!Array.isArray(b.accounts)||!Array.isArray(b.lineups))throw new Error('不支持的备份格式');const accounts=b.accounts.map(C.restoreAccount),ls=b.lineups.filter(C.hasLineupCode).map(validateLineup),removed=b.lineups.length-ls.length;const next={schemaVersion:1,accounts,lineups:ls,deletedPresetIds:C.deletedPresetIds(b.deletedPresetIds),activeAccount:accounts[0]?.id||''},previous=STATE;libraryParser?.cancel();stopMatch();STATE=next;matchResults={};if(!await persist()){STATE=previous;createLibraryParser(sessionRevision);return;}createLibraryParser(sessionRevision);if(sameSession(revision)){setLoading(false);$('loading').hidden=true;updateAccountSelect();fillFilters();selectView('library');toast('备份已恢复'+(removed?'，已跳过 '+removed+' 条无阵容码的记录':''));}}
else{let l=parsed[0]?.json;if(l?.ok===true)l=validateLineup({...C.adaptInspection(l,DATA.roster),code:l.code,sourceKind:'local-json',id:'local-'+crypto.randomUUID()});else l=validateLineup(l);STATE.lineups=STATE.lineups.filter(x=>x.id!==l.id);STATE.lineups.push(l);if(await persist()){fillFilters();toast('结构化资料已保存');showLineup(l);}}}catch(e){if(sameSession(revision))toast('导入失败：'+e.message);}}

function stopMatch(){if(worker)worker.terminate();worker=null;$('cancel-match').hidden=true;$('match-all').disabled=!account();}
function showSamples(){openDialog('官方图片小样','采集后已核对资源类型；没有把立绘、头像或书签当作原生卡面',`<div class="sample-grid">${[['608','art-before','png','石长姬 · 未觉醒官方立绘','830 × 696'],['608','art-after','png','石长姬 · 觉醒官方立绘','830 × 696'],['217','portrait-before','jpg','大天狗 · 官方头像','90 × 90'],['217','bookmark','png','大天狗 · 官方书签','73 × 240']].map(([id,f,ext,name,size])=>`<div><img src="../data/images/${id}/${f}.${ext}" alt="${name}"><h3>${name}</h3><p>${size}</p></div>`).join('')}</div><div class="notice">透明立绘在矩形容器中完整展示，原图未裁切、未拉伸。原生卡面覆盖为 0；双形态图片没有互相复制填补。</div>`);}
document.addEventListener('click',async e=>{const b=e.target.closest('button,[data-hero],[data-actor],[data-view]');if(!b)return;if(b.dataset.view){e.preventDefault();selectView(b.dataset.view);}if(b.dataset.detail){const l=lineups().find(x=>x.id===b.dataset.detail);if(l)showLineup(l);}if(b.dataset.copy||b.id==='copy-lineup'){const l=b.id==='copy-lineup'?currentDialog:lineups().find(x=>x.id===b.dataset.copy);await copyCode(b,l?.code);}if(b.id==='scroll-members-left'||b.id==='scroll-members-right'){const row=$('dialog-body').querySelector('.member-detail-grid');row.scrollBy({left:row.clientWidth*.75*(b.id.endsWith('left')?-1:1),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}if(b.dataset.removeMember){selectedMembers=selectedMembers.filter(x=>x!==b.dataset.removeMember);renderSelected();page=1;renderLibrary();}if(b.id==='event-filter'){$('clear-filters').click();browseTo('限时活动 → 拾光永恒');}if((b.id==='parse-lineup'&&currentDialog)||b.dataset.reparse){const l=b.dataset.reparse?lineups().find(x=>x.id===b.dataset.reparse):currentDialog;if(l)await retryLineup(l);}if(b.dataset.parseAction==='start')startLibraryParse();if(b.dataset.parseAction==='pause')libraryParser?.pause();if(b.id==='export-lineup'&&currentDialog)exportJSON(currentDialog.title+'.json',currentDialog);if(b.id==='show-current-code'&&currentCodeResult)showLineup(currentCodeResult);if(b.id==='export-audit')exportJSON('覆盖报告-2026-09-12.json',{assets:DATA.assetAudit,excel:DATA.excelAudit});});
document.addEventListener('change',e=>{if(e.target.id==='detail-state'){detailState=e.target.value;showLineup(currentDialog);}});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const text=document.createElement('span');text.className='missing-art';text.textContent='图片读取失败 · '+e.target.alt;e.target.replaceWith(text);}},true);
$('close-dialog').onclick=()=>$('detail-dialog').close();$('detail-dialog').onclick=e=>{if(e.target===$('detail-dialog')&&!libraryBusy)$('detail-dialog').close();};
for(const id of ['search','category','subcategory','dungeon','source-filter','status-filter','gap-filter'])$(id).addEventListener(['search','dungeon'].includes(id)?'input':'change',()=>{if(id==='category')$('subcategory').value='';if(['category','subcategory'].includes(id))$('dungeon').value='';page=1;fillFilters();renderLibrary();});
function addMemberFilter(){const r=DATA.roster.find(r=>r.name===$('member-filter').value.trim());if(!r)return;if(!selectedMembers.includes(r.id))selectedMembers.push(r.id);$('member-filter').value='';renderSelected();page=1;renderLibrary();}
$('member-filter').onchange=addMemberFilter;$('add-member-filter').onclick=addMemberFilter;$('member-filter').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addMemberFilter();}};
$('clear-filters').onclick=()=>{for(const id of ['search','category','subcategory','dungeon','source-filter','status-filter','gap-filter'])$(id).value='';selectedMembers=[];renderSelected();page=1;fillFilters();hideDungeonOptions();renderLibrary();};
$('previous-page').onclick=()=>{page--;renderLibrary();};$('next-page').onclick=()=>{page++;renderLibrary();};
$('add-code').onclick=()=>{selectView('decode');$('code-input').focus();};$('code-input').oninput=updateCode;$('save-code').onclick=saveCode;$('remote-decode').onclick=()=>localDecode(true);$('clear-code').onclick=()=>{for(const id of ['code-input','code-title','code-dungeon','code-notes'])$(id).value='';updateCode();};
$('lineup-sort').add(new Option('最近添加','recent'));
$('add-bulk').onclick=()=>{renderBulkPreview();$('bulk-dialog').showModal();$('bulk-input').focus();};
$('close-bulk').onclick=()=>{if(!bulkBusy)$('bulk-dialog').close();};$('bulk-dialog').oncancel=e=>{if(bulkBusy)e.preventDefault();};
$('bulk-input').oninput=()=>{bulkFileRevision++;bulkReading=false;bulkPreviewLimit=50;$('bulk-status').textContent='';renderBulkPreview();};
$('bulk-filter').onchange=()=>{bulkPreviewLimit=50;renderBulkPreview();};$('bulk-more').onclick=()=>{bulkPreviewLimit+=50;renderBulkPreview();};
$('bulk-read-file').onclick=()=>{$('bulk-file').value='';$('bulk-file').click();};$('bulk-file').onchange=()=>readBulkFile($('bulk-file').files[0]);$('bulk-apply').onclick=applyBulkImport;
$('bulk-template').onclick=async()=>{const revision=sessionRevision;try{if(window.atlas){const result=await atlas.copyCode(AtlasBulkImport.TEMPLATE);if(!result?.copied)throw new Error('剪贴板写入未完成');}else await navigator.clipboard.writeText(AtlasBulkImport.TEMPLATE);if(sameSession(revision))$('bulk-status').textContent='格式模板已复制。将占位文字替换为完整阵容码后粘贴到输入框。';}catch(error){if(sameSession(revision))$('bulk-status').textContent='复制失败：'+error.message;}};
$('bulk-view').onclick=()=>{for(const id of ['search','category','subcategory','dungeon','status-filter','gap-filter'])$(id).value='';selectedMembers=[];renderSelected();$('source-filter').value='user';$('lineup-sort').value='recent';page=1;$('bulk-dialog').close();selectView('library');};
$('import-accounts').onclick=()=>pickFiles('accounts');$('import-lineup').onclick=()=>pickFiles('lineup');$('import-ta').onclick=()=>pickFiles('payload');$('import-qr').onclick=()=>pickFiles('qr');$('restore-backup').onclick=()=>pickFiles('backup');$('file-input').onchange=()=>['payload','qr'].includes(importMode)?importTAFiles([...$('file-input').files]):handleFiles([...$('file-input').files]);
$('export-backup').onclick=()=>exportJSON('阴阳师阵容图鉴-本地备份.json',{...STATE,format:'onmyoji-atlas-backup',exportedAt:new Date().toISOString()});
$('account-search').oninput=()=>{accountPage=1;renderAccounts();};
for(const id of ['account-kind','account-page-size'])$(id).onchange=()=>{accountPage=1;renderAccounts();};
$('account-previous-page').onclick=()=>{accountPage--;renderAccounts();};$('account-next-page').onclick=()=>{accountPage++;renderAccounts();};
$('active-account').onchange=async()=>{stopMatch();STATE.activeAccount=$('active-account').value;accountPage=1;matchResults={};await persist();if(view==='accounts')renderAccounts();if(view==='library')renderLibrary();scheduleMatch();};
$('lineup-sort').onchange=()=>{page=1;renderLibrary();};$('match-all').onclick=()=>startMatch();$('cancel-match').onclick=()=>toggleMatchPause();
$('new-manual').onclick=()=>{$('manual-json').value=JSON.stringify({title:'我的配置（请修改）',code:'',category:'其他',dungeon:'待分类',notes:'手工填写，不是阵容码解码结果',requirementsComplete:false,members:[{kind:'shikigami',name:'石长姬',shikigamiId:'608',awakening:null,skills:null,level:40,star:6,config:{suitRequirements:[],suitSelectionComplete:true,mainStats:{},ranges:[],metricId:1,targetScore:null,sixStarOnly:true,maxLevelOnly:true,scope:'all',excludeOccupied:false}}]},null,2);};
$('save-manual').onclick=async()=>{try{const l=validateLineup(JSON.parse($('manual-json').value));l.members=l.members.map((m,i)=>({...m,index:i}));STATE.lineups=STATE.lineups.filter(x=>x.id!==l.id);STATE.lineups.push(l);matchResults={};if(await persist()){fillFilters();toast('手工配置已保存');showLineup(l);}}catch(e){toast('配置未保存：'+e.message);}};
window.runLoginSmoke=async()=>{
 await appBoot;await TALogin.ready();const initial=await taLogin.status(),blocked=[];
 const result={title:document.title,mode:'offline-startup-explicit-login',offline:!$('app-shell').hidden&&!$('app-shell').inert&&$('login-screen').hidden,dataLoaded:!!DATA,noAutomaticQR:!initial.qr_image&&!initial.authenticated,accounts:STATE.accounts.length,lineups:lineups().length};
 // Auth-only operations must fail before invoking a decoder, network query or write.
 for(const [name,call] of Object.entries({decode:()=>atlas.decode('#TA#invalid'),query:()=>taLogin.query('|TA|'+'a'.repeat(32)),parsedSave:()=>atlas.saveParsedState({})})){try{await call();}catch(error){if(/请先扫码登录/.test(error.message))blocked.push(name);}}
 result.blockedOperations=blocked;result.localReads=!!(await atlas.loadData())&&Array.isArray((await atlas.loadState())?.accounts||[]);
 await TALogin.ensure();result.separateLogin=!$('login-screen').hidden&&$('app-shell').hidden;
 result.riskNoticeVisible=!!$('login-risk-title')&&!$('ta-risk-accept').checked&&$('ta-qr').disabled;
 try{await taLogin.action('qr');result.riskBlocksQR=false;}catch(error){result.riskBlocksQR=/免责声明/.test(error.message);}
 await taLogin.action('risk',{accepted:true});await taLogin.action('init');
 await taLogin.action('qr');const status=await taLogin.status(),image=$('ta-qr-image');if(image.getAttribute('src'))try{await image.decode();}catch{}
 result.loginModule={servers:status.servers.length,authenticated:status.authenticated,qrReady:!image.hidden&&image.naturalWidth>0};
 $('ta-enter').click();result.returnOffline=!$('app-shell').hidden&&$('login-screen').hidden;
 if(!result.offline||!result.dataLoaded||!result.noAutomaticQR||blocked.length!==3||!result.localReads||!result.separateLogin||!result.riskNoticeVisible||!result.riskBlocksQR||!result.returnOffline||!result.loginModule.qrReady||status.authenticated)result.error='离线启动、风险确认或二维码检查失败';
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
async function reloadOfficial(){if(reloadingOfficial||!window.atlas)return;const revision=sessionRevision;reloadingOfficial=true;try{const data=await atlas.loadData();if(!sameSession(revision))return;DATA=data;stopMatch();matchResults={};fillFilters();selectView(view);scheduleMatch();renderOfficialStatus(DATA.officialUpdate);$('resource-date').textContent=DATA.officialUpdate.lastSuccessAt?'官方资源更新于 '+DATA.officialUpdate.lastSuccessAt.slice(0,10):'内置资源截至 '+DATA.cutoffDate;}finally{reloadingOfficial=false;}}
$('official-refresh').onclick=async()=>{try{await atlas.refreshOfficial({force:$('official-force').checked});}catch(e){toast('更新失败：'+e.message);}};
$('official-cancel').onclick=()=>atlas.cancelOfficial();$('official-auto').onchange=async()=>{try{renderOfficialStatus(await atlas.setAutoUpdate($('official-auto').checked));}catch(e){toast(e.message);}};
if(window.atlas?.onOfficialProgress)atlas.onOfficialProgress(status=>{if(!DATA)return;renderOfficialStatus(status);if(!status.running&&['complete','partial'].includes(status.phase))reloadOfficial().catch(e=>toast('读取更新失败：'+e.message));});
function setLoading(value){$('app-shell').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=value);}
async function boot(revision){
 setLoading(true);$('loading').hidden=false;$('loading').textContent='正在读取本地资料…';
 try{
  const data=await atlas.loadData(),saved=await atlas.loadState();if(revision!==sessionRevision)return;
  DATA=data;STATE=saved?.schemaVersion===1&&Array.isArray(saved.accounts)&&Array.isArray(saved.lineups)?saved:{schemaVersion:1,lineups:[],accounts:[],activeAccount:''};
  STATE.deletedPresetIds=C.deletedPresetIds(STATE.deletedPresetIds);
  let upgraded=false;
  STATE.lineups=STATE.lineups.map(l=>{if(!['ta-query','ta-local'].includes(l.sourceKind)||l.mapperVersion>=4||!l.raw?.hconf)return l;try{const mapped=C.adaptTA({ok:true,format:'ta-payload',origin:l.sourceKind==='ta-query'?'official-query':'local',code:l.code,data:l.raw,kinds:l.members.map(m=>m.kind)},DATA);upgraded=true;return C.mergeDecodedLineup(l,mapped);}catch{return l;}});
  if(upgraded)await persist(revision);
  if(!sameSession(revision))return;
  const removed=STATE.lineups.length-STATE.lineups.filter(C.hasLineupCode).length;
  if(removed){STATE.lineups=STATE.lineups.filter(C.hasLineupCode);if(await persist(revision))toast('已清理 '+removed+' 条无阵容码的旧阵容');}
  if(revision!==sessionRevision)return;
  setLoading(false);fillFilters();resolveServerNames();updateAccountSelect();$('loading').hidden=true;selectView('library');createLibraryParser(revision);maybeAutoParse();scheduleMatch();renderOfficialStatus(DATA.officialUpdate);$('resource-date').textContent=DATA.officialUpdate?.lastSuccessAt?'官方资源更新于 '+DATA.officialUpdate.lastSuccessAt.slice(0,10):'内置资源截至 '+DATA.cutoffDate;
 }catch(e){if(revision!==sessionRevision)return;$('loading').textContent='资料加载失败：'+e.message;if(DATA){$('restore-backup').disabled=false;$('file-input').disabled=false;}}
}
window.addEventListener('atlas-session',event=>{
 libraryParser?.cancel();autoParseStarted=false;
 if(DATA){createLibraryParser(sessionRevision);if(event.detail?.authenticated){resolveServerNames();maybeAutoParse();scheduleMatch();}else{parseReport={...parseReport,phase:'paused',error:'登录会话已结束；本地资料仍可查看。'};renderParseProgress();}}
});
appBoot=boot(sessionRevision).then(()=>window.dispatchEvent(new Event('atlas-ready')));
