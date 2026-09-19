'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const URLS={catalog:'https://g37simulator.webapp.163.com/get_heroid_list',attrs:'https://g37simulator.webapp.163.com/get_hero_attr',static:'https://yys.res.netease.com/pc/zt/20161108171335/js/app/all_shishen.json',cdn:'https://yys.res.netease.com/pc/zt/20161108171335/data',news:'https://yys.163.com/news/update/index.html'};
const HOSTS=new Set(['g37simulator.webapp.163.com','yys.res.netease.com','yys.163.com','www.onmyojigame.com']);
const ACTORS=[
  {id:'seimei',name:'晴明',aliases:['晴明','安倍晴明'],gameId:10,page:'index.html'},
  {id:'kagura',name:'神乐',aliases:['神乐','神樂'],gameId:null,page:'kagura.html'},
  {id:'hiromasa',name:'源博雅',aliases:['源博雅'],gameId:null,page:'hiromasa.html'},
  {id:'yaobikuni',name:'八百比丘尼',aliases:['八百比丘尼'],gameId:null,page:'yaobikuni.html'}
];
const FAMILIES={'art-before':['shishen_big_beforeAwake','png','unawakened'],'portrait-before':['before_awake','jpg','unawakened'],'art-after':['shishen_big_afterAwake','png','awakened'],'portrait-after':['after_awake','jpg','awakened']};
// These are the actual filter attributes on the official shishen index.
const CATALOG_GROUPS=[[0,1,0],[6,0,0],[5,0,0],[4,0,0],[3,0,0],[2,0,0],[1,0,0],[0,0,101]];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const validFile=s=>typeof s==='string'&&/^[a-f0-9]{64}\.(png|jpg)$/.test(s);
const validLocal=s=>typeof s==='string'&&/^data\/images\/(?:\d+|actors\/[a-z]+)\/[a-z-]+\.(png|jpg)$/.test(s);
const textOnly=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const attribute=(tag,name)=>new RegExp(`\\b${name}=["']([^"']+)["']`,'i').exec(tag)?.[1];
function allowedURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!HOSTS.has(u.hostname))throw new Error('更新地址不在官方来源白名单');return u.href;}
function jsonp(raw){const text=raw.toString('utf8').replace(/^\uFEFF/,'').trim();return JSON.parse(text.startsWith('cb(')?text.replace(/^cb\(/,'').replace(/\);?\s*$/,''):text);}
async function readJSON(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomicJSON(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data),'utf8');await fs.rename(tmp,file);}
function imageHeader(bytes){
  let width,height,format;
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);format='png';}
  else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    let offset=2;for(let i=0;i<10000&&offset+3<bytes.length;i++){
      if(bytes[offset++]!==255)throw new Error('JPEG 标记损坏');while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
      const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)throw new Error('JPEG 长度损坏');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<7)throw new Error('JPEG 帧损坏');height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);format='jpg';break;}offset+=length;
    }
  }
  if(!width||!height||width*height>24000000||width>16000||height>16000)throw new Error('图片格式或像素数量不符合限制');return {width,height,format};
}
function actorSource(html,css,definition,sourceURL,cssURL){
  const title=textOnly(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'');
  if(!definition.aliases.some(name=>title.includes(name)))throw new Error('主角页面标题未能确认身份');
  const section=[...html.matchAll(/<section\b[^>]*class=["']([^"']+)["']/gi)].map(m=>m[1].split(/\s+/)).find(classes=>classes.includes('p0'));
  if(!section?.includes('p0'))throw new Error('主角页面结构已变化');
  const roleClass=section.find(x=>x!=='p0'&&/^[a-z]+$/.test(x));if(!roleClass)throw new Error('主角页面缺少身份选择器');
  const selector=`.p0.${roleClass} .rolesWrap .role_front`;
  const block=css.split('}').find(s=>s.split('{')[0].split(',').map(x=>x.trim()).includes(selector));
  const art=block&&/url\(\s*["']?([^\s)"']+)/.exec(block)?.[1];
  const portrait=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]).find(tag=>definition.aliases.includes(attribute(tag,'alt')));
  if(!art||!portrait||!attribute(portrait,'src'))throw new Error('未找到与角色名对应的原始立绘或头像');
  return {title,selector,artURL:allowedURL(new URL(art,cssURL).href),portraitURL:allowedURL(new URL(attribute(portrait,'src'),sourceURL).href)};
}
function awakening(row,attrs){if(['N','SP','UR'].includes(row.rarity)||row.id==='401')return 'not_applicable';if(attrs['1']&&typeof attrs['1']==='object')return 'supported';if(Object.hasOwn(attrs,'1')&&(attrs['1']==null||attrs['1']===''))return 'not_applicable';return 'unknown';}
function parseNews(html){
  const rows=new Map();for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const url=new URL(m[1],URLS.news),date=/\/news\/update\/(\d{4})(\d\d)(\d\d)\//.exec(url.pathname);if(url.hostname!=='yys.163.com'||!date)continue;
    const summary=textOnly(m[2]);if(!summary.includes('维护更新公告'))continue;
    const title=/《阴阳师》[^。※]{0,60}?维护更新公告/.exec(summary)?.[0]||summary.slice(0,80);
    rows.set(url.href,{url:allowedURL(url.href),title,date:`${date[1]}-${date[2]}-${date[3]}`,summary:summary.slice(0,220)});
  }return [...rows.values()].slice(0,12);
}
class OfficialData {
  constructor({baseData,appRoot,cacheRoot,inspectImage,fetcher=fetch,intervalMs=1000,now=()=>new Date(),onProgress=()=>{}}){
    this.base=baseData;this.appRoot=path.resolve(appRoot);this.root=path.resolve(cacheRoot);this.inspect=inspectImage;this.fetcher=fetcher;this.interval=intervalMs;this.now=now;this.progress=onProgress;this.lastRequest=0;this.snapshot={};this.settings={autoUpdate:true};this.status={running:false,phase:'idle',message:'尚未检查官方更新'};this.controller=null;
  }
  async init(){
    try{const saved=await readJSON(path.join(this.root,'manifest.json'),{});if(saved.schemaVersion===1&&Array.isArray(saved.roster)){this.snapshot=saved;this.status.message='已载入本机缓存的官方资料';}}catch{this.status.message='更新缓存损坏，正在使用内置资料';}
    try{const settings=await readJSON(path.join(this.root,'settings.json'),{});if(typeof settings.autoUpdate==='boolean')this.settings.autoUpdate=settings.autoUpdate;}catch{}
    return this;
  }
  getStatus(){return {...this.status,...this.settings,lastCheckedAt:this.snapshot.checkedAt||null,lastSuccessAt:this.snapshot.completedAt||null};}
  async setAutoUpdate(value){if(typeof value!=='boolean')throw new Error('自动更新设置无效');this.settings.autoUpdate=value;await atomicJSON(path.join(this.root,'settings.json'),this.settings);return this.getStatus();}
  due(){return this.settings.autoUpdate&&!this.status.running&&(!this.snapshot.checkedAt||this.now()-new Date(this.snapshot.checkedAt)>=86400000);}
  cancel(){this.controller?.abort();}
  emit(patch){this.status={...this.status,...patch};this.progress(this.getStatus());}
  getData(){
    const data=structuredClone(this.base),saved=this.snapshot;
    if(saved.roster?.length){const builtIn=new Map(data.roster.map(r=>[r.id,r]));data.roster=saved.roster.map(r=>({...r,gameRules:builtIn.get(r.id)?.gameRules||r.gameRules}));data.roster.push(...[...builtIn.values()].filter(r=>!saved.roster.some(s=>s.id===r.id)));}
    if(saved.actors?.length){const builtIn=new Map((data.actors||[]).map(a=>[a.id,a]));data.actors=[...new Map([...(data.actors||[]),...saved.actors.map(a=>({...a,gameId:builtIn.get(a.id)?.gameId??a.gameId}))].map(a=>[a.id,a])).values()];}
    data.officialNews=saved.news||data.officialNews||[];
    if(saved.report)data.assetAudit={...data.assetAudit,...saved.report};
    data.officialUpdate={...this.getStatus(),resourceCoverage:saved.coverage||null,scope:['官方名单','40级6星基础属性','官方形象','维护公告'],lineupSnapshot:data.cutoffDate};
    return data;
  }
  assetPath(asset){
    if(validFile(asset?.cacheFile))return path.join(this.root,'images',asset.cacheFile);
    if(validLocal(asset?.localPath))return path.join(this.appRoot,...asset.localPath.split('/'));
    return null;
  }
  async exists(asset){const p=this.assetPath(asset);if(!p)return false;try{const s=await fs.stat(p);return s.isFile()&&s.size>0;}catch{return false;}}
  async request(url,{limit=3*1024*1024,headers={}}={}){
    allowedURL(url);const signal=this.controller?.signal;
    signal?.throwIfAborted();const wait=Math.max(0,this.interval-(Date.now()-this.lastRequest));
    if(wait)await new Promise((resolve,reject)=>{const onAbort=()=>{clearTimeout(timer);reject(new Error('更新已取消'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},wait);signal?.addEventListener('abort',onAbort,{once:true});});
    signal?.throwIfAborted();this.lastRequest=Date.now();
    const response=await this.fetcher(url,{method:'GET',headers:{Accept:'application/json,text/html,image/png,image/jpeg,text/css','User-Agent':'Onmyoji-Lineup-Atlas/0.2.0',...headers},redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    if(response.status===304)return {status:304,headers:response.headers,body:Buffer.alloc(0)};
    if([401,403,429].includes(response.status)){const error=new Error(`官方来源返回 HTTP ${response.status}，本次更新停止`);error.stop=true;throw error;}
    if(!response.ok)throw new Error(`官方来源返回 HTTP ${response.status}`);
    if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('官方响应超过大小限制');}
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit)throw new Error('官方响应超过大小限制');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
    return {status:response.status,headers:response.headers,body:Buffer.concat(chunks)};
  }
  async download(url,old,metadata,{force=false}={}){
    const existing=await this.exists(old),checked=old?.checkedAt||old?.retrievedAt;
    if(existing&&old.url===url&&!force&&checked&&this.now()-new Date(checked)<30*86400000)return old;
    const headers={};if(existing&&old.url===url){if(old.etag)headers['If-None-Match']=old.etag;if(old.lastModified)headers['If-Modified-Since']=old.lastModified;}
    const result=await this.request(url,{limit:12*1024*1024,headers});const checkedAt=this.now().toISOString();
    if(result.status===304){if(!existing)throw new Error('服务器未返回图片且本地文件缺失');return {...old,checkedAt};}
    const info=imageHeader(result.body);await this.inspect(result.body,info);
    const hash=sha(result.body),file=hash+'.'+info.format;
    await fs.mkdir(path.join(this.root,'images'),{recursive:true});
    if(!existing||old.sha256!==hash){await fs.writeFile(path.join(this.root,'images',file),result.body);this.status.updatedImages++;}
    else if(old.localPath)return {...old,...metadata,checkedAt,etag:result.headers.get('etag'),lastModified:result.headers.get('last-modified')};
    return {...metadata,url,status:'downloaded_valid_image',width:info.width,height:info.height,format:info.format,bytes:result.body.length,sha256:hash,cacheFile:file,checkedAt,retrievedAt:checkedAt,etag:result.headers.get('etag'),lastModified:result.headers.get('last-modified'),nativeCardVerified:false,identityVerified:true,stateVerified:true,visualReview:'source-mapped-not-individually-reviewed'};
  }
  async catalogGroup(query='rarity=0'){
    const rows=new Map();let total=null,pages=null;
    for(let page=1;page<=30;page++){
      this.emit({phase:'catalog',message:`读取官方名单，第 ${page} 页`});
      const response=await this.request(`${URLS.catalog}?${query}&page=${page}&per_page=100&callback=cb`),data=jsonp(response.body);
      if(data.success!==true||!data.data||Array.isArray(data.data))throw new Error('官方名单响应结构发生变化');
      if(!Number.isInteger(data.total_num)||!Number.isInteger(data.total_page)||data.total_num<0||data.total_num>3000||data.total_page<0||data.total_page>30)throw new Error('官方分页总数无效');
      if(total!=null&&(total!==data.total_num||pages!==data.total_page))throw new Error('官方名单在分页期间变化，请稍后重试');
      total=data.total_num;pages=data.total_page;const entries=Object.entries(data.data);if(total===0&&page===1&&!entries.length)return {rows,pages:1};if(!entries.length||pages<1)throw new Error('官方返回空页');
      for(const [id,row] of entries){if(!/^\d+$/.test(id)||!row||typeof row.name!=='string'||![1,2,3,4,5,6].includes(row.rarity)||rows.has(id))throw new Error('官方名单出现无效或重复条目');rows.set(id,row);}
      if(page===pages)break;
    }
    if(rows.size!==total)throw new Error('官方分页条目数与总数不一致，保留原有资料');
    return {rows,pages};
  }
  async catalog(){
    let {rows,pages}=await this.catalogGroup();const defaultQueryCount=rows.size;let queryMode='all';
    const staticResponse=await this.request(URLS.static),staticRows=jsonp(staticResponse.body);
    if(!Array.isArray(staticRows)||!staticRows.length)throw new Error('官方静态名单结构发生变化');
    const staticMap=new Map();for(const row of staticRows){if(!/^\d+$/.test(String(row.id))||typeof row.name!=='string'||staticMap.has(String(row.id)))throw new Error('官方静态名单条目无效');staticMap.set(String(row.id),row);}
    if(rows.size!==staticMap.size||[...staticMap.keys()].some(id=>!rows.has(id))){
      const combined=new Map();let groupPages=0;
      for(const [rarity,interactive,material] of CATALOG_GROUPS){const group=await this.catalogGroup(`rarity=${rarity}&interactive=${interactive}&material_type=${material}`);groupPages+=group.pages;for(const [id,row] of group.rows){if(combined.has(id)&&(combined.get(id).name!==row.name||combined.get(id).rarity!==row.rarity))throw new Error('官方分类查询身份不一致');combined.set(id,row);}}
      if(!combined.size)throw new Error('官方分类查询没有返回可用名单');rows=combined;pages=groupPages;queryMode='official-filter-union';
    }
    const onlyStatic=[...staticMap.keys()].filter(id=>!rows.has(id));
    if(onlyStatic.length)throw new Error(`官方动态与静态目录仍有 ${onlyStatic.length} 个缺项，保留原名单`);
    return {rows,staticMap,report:{dynamicCount:rows.size,staticCount:staticMap.size,pages,defaultQueryCount,queryMode,onlyDynamic:[...rows.keys()].filter(id=>!staticMap.has(id)),onlyStatic,paginationErrors:[],collectedAt:this.now().toISOString()}};
  }
  async updateActor(definition,old,{force=false}={}){
    const sourceURL='https://www.onmyojigame.com/zh/m/onmyoji/'+definition.page,response=await this.request(sourceURL),html=response.body.toString('utf8');
    const cssURL=[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>attribute(m[0],'href')).find(u=>u&&/\/css\/index_[^/]+\.css$/.test(u));
    if(!cssURL)throw new Error('主角页面缺少角色样式来源');
    this.cssCache??=new Map();if(!this.cssCache.has(cssURL))this.cssCache.set(cssURL,(await this.request(allowedURL(cssURL))).body.toString('utf8'));
    const css=this.cssCache.get(cssURL),mapping=actorSource(html,css,definition,sourceURL,cssURL),variants=[];
    for(const [family,url,kind] of [['art-before',mapping.artURL,'official_art'],['portrait-before',mapping.portraitURL,'official_portrait']]){
      const previous=old?.assets?.variants?.find(a=>a.family===family);
      variants.push(await this.download(url,previous,{family,requestedState:'default',verifiedState:'default',contentKind:kind,sourcePage:sourceURL,sourceRegion:'TW_OFFICIAL',sourceLabel:'网易繁中官网',mappingEvidence:family==='art-before'?mapping.selector:`img alt 与 ${definition.aliases.join('/')} 对应`},{force}));
    }
    return {...definition,officialUrl:sourceURL,sourceRegion:'TW_OFFICIAL',sourceLabel:'网易繁中官网',sourceEvidence:{pageSHA256:sha(response.body),cssURL,cssSHA256:sha(Buffer.from(css)),title:mapping.title,selector:mapping.selector,checkedAt:this.now().toISOString()},assets:{awakeningAvailability:'not_applicable',nativeCardStatus:'missing_unverified',variants}};
  }
  async refresh({force=false}={}){
    if(this.status.running)return this.getStatus();this.controller=new AbortController();this.cssCache=new Map();
    this.emit({running:true,phase:'starting',message:'开始检查官方资料',done:0,total:0,updatedImages:0,newCharacters:0,errors:[]});
    const current=this.getData(),next={schemaVersion:1,roster:current.roster,actors:current.actors||[],news:current.officialNews||[],report:current.assetAudit,checkedAt:this.now().toISOString(),completedAt:this.snapshot.completedAt||null},errors=[];let catalogValidated=false,discard=false;
    try{
      const {rows,staticMap,report}=await this.catalog();catalogValidated=true;next.report={...next.report,...report};
      const previous=new Map(current.roster.map(r=>[r.id,r])),rarity={1:'N',2:'R',3:'SR',4:'SSR',5:'SP',6:'UR'};
      next.roster=[...rows].map(([id,row])=>({...previous.get(id),id,name:row.name,rarity:rarity[row.rarity],rarityRaw:row.rarity,official:row,static:staticMap.get(id)||null,officialPresent:true,isCollaboration:row.interactive===1,isGua:row.material_type===101,isMaterial:!!row.material_type&&row.material_type!==101,officialUrl:`https://yys.163.com/shishen/${id}.html`,sourceCheckedAt:next.checkedAt}));
      next.roster.push(...current.roster.filter(r=>!rows.has(r.id)).map(r=>({...r,officialPresent:false})));
      this.status.newCharacters=next.roster.filter(r=>!previous.has(r.id)).length;this.emit({total:rows.size,phase:'resources'});
      for(const row of next.roster.filter(r=>r.officialPresent)){
        this.controller.signal.throwIfAborted();const old=previous.get(row.id),assets=structuredClone(old?.assets||{awakeningAvailability:'unknown',variants:[],baseAttrs40:{}});
        try{
          const attrDate=assets.baseAttrsCheckedAt||assets.awakeningEvidence?.[0]?.retrievedAt;
          if(force||!attrDate||this.now()-new Date(attrDate)>7*86400000){
            const attrs={},evidence=[];for(const awake of [0,1]){
              const url=`${URLS.attrs}?heroid=${row.id}&awake=${awake}&level=40&star=6&callback=cb`,result=await this.request(url),d=jsonp(result.body);
              if(d.success!==true||!Object.hasOwn(d,'data'))throw new Error('官方属性响应结构发生变化');attrs[String(awake)]=d.data;evidence.push({url,retrievedAt:this.now().toISOString(),sha256:sha(result.body)});
            }
            if(!attrs['0']||typeof attrs['0']!=='object'||!['attack','defense','maxHp','speed','critRate','critPower','debuffEnhance','debuffResist'].every(k=>Number.isFinite(attrs['0'][k])))throw new Error('官方基础属性缺失');
            assets.baseAttrs40=attrs;assets.baseAttrsCheckedAt=this.now().toISOString();assets.awakeningEvidence=evidence;
          }
          assets.awakeningAvailability=awakening(row,assets.baseAttrs40||{});
          const families=['art-before','portrait-before',...(assets.awakeningAvailability==='supported'?['art-after','portrait-after']:[])];
          const variants=[];for(const family of families){
            const [folder,ext,state]=FAMILIES[family],url=`${URLS.cdn}/${folder}/${row.id}.${ext}`,oldImage=assets.variants.find(v=>v.family===family);
            try{variants.push(await this.download(url,oldImage,{family,requestedState:state,verifiedState:state,contentKind:family.startsWith('art')?'official_art':'official_portrait',sourcePage:row.officialUrl,sourceRegion:'CN_MAINLAND_LIVE',sourceLabel:'网易国服官网'},{force}));}
            catch(error){if(error.stop||this.controller.signal.aborted)throw error;errors.push(`${row.name} ${family}：${error.message}`);variants.push(oldImage?{...oldImage,refreshError:error.message}:{family,url,status:'missing_resource',error:error.message});}
          }
          assets.variants=variants;const valid=variants.filter(a=>a.status==='downloaded_valid_image');assets.duplicates=new Set(valid.map(a=>a.sha256)).size!==valid.length;if(assets.duplicates)for(const image of valid){image.duplicateReviewRequired=true;image.stateVerified=false;}row.assets=assets;
        }catch(error){if(error.stop||this.controller.signal.aborted)throw error;errors.push(`${row.name}：${error.message}`);row.assets=old?.assets||assets;}
        this.emit({done:this.status.done+1,message:`已检查 ${row.name} 的目录、属性与形象`});
      }
      this.emit({phase:'actors',message:'检查主角官方图片'});
      for(const def of ACTORS){try{const old=next.actors.find(a=>a.id===def.id),actor=await this.updateActor(def,old,{force});next.actors=next.actors.filter(a=>a.id!==def.id);next.actors.push(actor);}catch(error){if(error.stop||this.controller.signal.aborted)throw error;errors.push(`${def.name}：${error.message}`);}}
      this.emit({phase:'news',message:'读取最新维护公告'});
      try{const response=await this.request(URLS.news),news=parseNews(response.body.toString('utf8'));if(!news.length)throw new Error('没有识别到维护公告，保留已缓存内容');next.news=news;}catch(error){if(error.stop||this.controller.signal.aborted)throw error;errors.push('维护公告：'+error.message);}
      next.report={...next.report,...report};if(!errors.length)next.completedAt=this.now().toISOString();else if(this.snapshot.completedAt)next.completedAt=this.snapshot.completedAt;
    }catch(error){discard=!!error.stop||this.controller.signal.aborted;errors.push(this.controller.signal.aborted?'更新已取消，保留已有资料':error.message);}
    if(catalogValidated&&!discard){
      const rosterAssets=next.roster.flatMap(r=>r.assets?.variants||[]).filter(a=>a.applicability!=='not_applicable'),actors=next.actors.flatMap(r=>r.assets?.variants||[]);
      next.coverage={roster:next.roster.length,actors:next.actors.length,validImages:[...rosterAssets,...actors].filter(a=>a.status==='downloaded_valid_image').length,updatedImages:this.status.updatedImages,newCharacters:this.status.newCharacters,errors};
      next.report={...next.report,charactersAudited:next.roster.length,downloaded:rosterAssets.filter(a=>a.status==='downloaded_valid_image').length,supported:next.roster.filter(r=>r.assets?.awakeningAvailability==='supported').length,notApplicable:next.roster.filter(r=>r.assets?.awakeningAvailability==='not_applicable').length,unknown:next.roster.filter(r=>!r.assets||r.assets.awakeningAvailability==='unknown').length,failures:rosterAssets.filter(a=>a.status!=='downloaded_valid_image'),duplicateCharacters:next.roster.filter(r=>r.assets?.duplicates).map(r=>r.id)};
      try{await atomicJSON(path.join(this.root,'manifest.json'),next);this.snapshot=next;}catch(error){errors.push('更新缓存保存失败：'+error.message);}
    }
    this.controller=null;this.emit({running:false,phase:errors.length?'partial':'complete',errors,message:errors.length?`官方更新有 ${errors.length} 项未完成，已保留可用资料`:`官方资料已更新，新增 ${this.status.newCharacters} 位式神，下载 ${this.status.updatedImages} 张图片`});return this.getStatus();
  }
}
module.exports={OfficialData,URLS,ACTORS,FAMILIES,allowedURL,validFile,validLocal,jsonp,actorSource,parseNews,imageHeader};
