import fs from 'node:fs/promises';
const read=async(p,fallback)=>JSON.parse(await fs.readFile(p,'utf8').catch(()=>JSON.stringify(fallback)));
const previous=await read('data/bundle.json',{});
const excel=await read('data/excel.json',{}),roster=await read('data/roster.json',[]),assets=await read('data/asset-manifest.json',{}),decoded=await read('data/decoded.json',{}),rawSources=await read('data/web-sources.json',await read('data/references.json',[])),curated=(await read('data/curated-lineups.json',[])).filter(c=>typeof c.code==='string'&&c.code.trim()),events=await read('data/events.json',[]);
const sources=rawSources.map(s=>({bvid:s.bvid,title:s.title,author:s.author,url:s.url,publishedAt:s.publishedAt,error:s.error,evidence:s.evidence,codes:s.codes||[],description:'已保留来源、发布时间、原码及采集校验值。成员与条件的整理见对应参考阵容；完整攻略请打开原文。',codeContexts:s.codeContexts||Object.fromEntries((s.codes||[]).map(code=>{const pos=s.description.indexOf(code);return [code,s.description.slice(Math.max(0,pos-85),pos).split('\n').filter(t=>t.trim()).slice(-2).join(' ').replace(/\|TA\|[a-zA-Z0-9]+/g,'').trim()];}))}));
await fs.writeFile('data/references.json',JSON.stringify(sources,null,2));
const pageRules=await read('data/source-snapshots/official-page-js.json',{});
for(const r of roster){const a=assets[r.id];if(a&&(['N','SP','UR'].includes(r.rarity)||r.id==='401')){a.awakeningAvailability='not_applicable';a.officialPageRule={url:pageRules.url,sha256:pageRules.sha256,rule:'N / SP / UR / ID401没有独立觉醒形态'};a.attributeConflict=!!a.baseAttrs40?.['1'];for(const v of a.variants)if(v.family.endsWith('-after'))v.applicability='not_applicable';}}
for(const a of Object.values(assets)){const valid=a.variants.filter(v=>v.status==='downloaded_valid_image'&&v.applicability!=='not_applicable');a.duplicates=new Set(valid.map(v=>v.sha256)).size!==valid.length;if(!a.duplicates)for(const v of valid){v.duplicateReviewRequired=false;v.stateVerified=a.awakeningAvailability!=='unknown';v.verifiedState=v.stateVerified?v.requestedState:null;}}
await fs.writeFile('data/asset-manifest.json',JSON.stringify(assets,null,2));
const taxonomy=[
 ['御魂','御魂十层','魂十|魂10'],['御魂','悲鸣 / 魂土','魂土|悲鸣'],['御魂','神罚 / 魂王','魂王|神罚'],['御魂','魂十三','魂十三|魂13'],['御魂','永生之海','魂海|永生之海'],['御魂','业原火','业原火'],['御魂','日轮之陨 / 日蚀','日轮|日蚀'],
 ['日常','御灵','御灵'],['日常','探索 / 悬赏','探索|悬赏'],['日常','觉醒材料','觉醒本|觉醒材料'],['日常','地域鬼王','地域鬼王'],['日常','师徒协战','师徒'],['日常','金币妖怪','金币妖怪'],['日常','经验妖怪','经验妖怪'],['日常','逢魔之时','逢魔'],['日常','结界突破','突破|低保突破|结突'],
 ['寮活动','道馆','馆主|提赏金|清杂|双拉|有雀'],['寮活动','狭间暗域','狭间'],['寮活动','狩猎战 / 麒麟','麒麟'],['寮活动','首领退治','退治'],['寮活动','寮活动通用','福利寮'],
 ['周常','阴界之门','阴界'],['周常','真·八岐大蛇','真蛇|真·八岐'],['周常','秘闻竞速 / 百战','百战|每周秘闻|秘闻竞速'],['周常','梦墟秘境','梦墟'],['周常','彼世逢魔','彼世逢魔'],
 ['契灵','契灵 · 镇墓兽','镇墓兽'],['契灵','契灵 · 月魔兔','月魔兔'],['契灵','契灵 · 薙魂','薙魂'],['契灵','契灵 · 针女','针女契灵|契灵.?针女'],['契灵','契灵 · 狐火','狐火'],['契灵','契灵 · 火灵','契灵.?火灵'],['契灵','契灵 · 茨球','茨球'],['契灵','契灵探查','契灵小怪|契灵探查'],['常驻挑战','六道之门','六道|真言塔'],
 ['契灵','契灵首领','契灵.?首领'],['御魂','魂十三','^御魂副本 虚无'],
 ['常驻挑战','英杰 · 藤原道长','藤原道长'],['常驻挑战','英杰 · 源赖光','源赖光'],['常驻挑战','鬼兵演武 / 兵藏秘境','鬼兵演武|兵藏|英杰试炼'],['首次通关','秘闻副本','秘闻'],['限时活动','拾光永恒','拾光永恒|亘地回响|回响亘地|虚无精锐|周年庆'],['斗技','斗技 / 协同斗技','斗技']
];
function classify(x){const text=[x.originalCategory,x.title,x.dungeon].join(' ');const matches=taxonomy.filter(t=>new RegExp(t[2]).test(text));return {category:x.category||matches[0]?.[0]||'其他',dungeons:[...new Set([...(x.dungeons||[]),...matches.map(t=>t[1])])],dungeon:x.dungeon||matches[0]?.[1]||x.originalCategory||'待分类'};}
const merged=new Map();
for(const a of excel.entries||[]){
  const existing=merged.get(a.code);if(existing){existing.occurrences.push(a);existing.aliases.push(a.title);existing.notes=[...new Set([existing.notes,a.notes].filter(Boolean))].join('\n');existing.dungeons=[...new Set([...existing.dungeons,...classify(a).dungeons])];continue;}
  merged.set(a.code,{...a,...classify(a),id:'code-'+a.code.slice(4),aliases:[a.title],occurrences:[a],members:[],requirementsComplete:false,decodeState:decoded[a.code]?.state||'unattempted',decodeError:decoded[a.code]?.payload?.error||null});
}
for(const s of sources){for(const code of s.codes||[]){if(merged.has(code)){const r=merged.get(code);r.webSources=[...(r.webSources||[]),{title:s.title,url:s.url,date:s.publishedAt}];continue;}const context=s.codeContexts?.[code];const record={id:'code-'+code.slice(4),code,title:context||s.title,notes:'原码来源：'+s.title+'。目前没有该码的成功解析响应。',originalCategory:s.title,sourceKind:'web-code',sourceUrl:s.url,author:s.author,date:s.publishedAt,occurrences:[],aliases:[],members:[],requirementsComplete:false,decodeState:'unattempted',applicability:/测试服/.test(s.title)?'test-server-unverified':'source-claimed'};merged.set(code,{...record,...classify(record)});}}
const byName=new Map(roster.map(r=>[r.name,r.id]));
for(const c of curated){c.members=(c.members||[]).map((m,i)=>({...m,index:i,shikigamiId:m.kind==='onmyoji'?null:byName.get(m.name)||null,occupied:true}));Object.assign(c,classify(c));if(c.code&&merged.has(c.code)){const original=merged.get(c.code);Object.assign(original,{...c,id:original.id,occurrences:original.occurrences,aliases:[...original.aliases,original.title],sourceKind:original.sourceKind,originalDecodeState:original.decodeState,webSources:[...(original.webSources||[]),{title:c.title,url:c.sourceUrl,date:c.date}]});}}
const mappings=await fs.readFile('data/source-snapshots/mappings-source.bin','utf8').catch(()=>'');
const cachedMechanics=await read('data/mechanics.json',{});
const apkRules=await read('data/apk-mechanics.json',{});
let effects=mappings?[...mappings.matchAll(/id: "two-piece-effect:([^"]+)",\s*name: "([^"]+)",\s*teamCodeId: (\d+),\s*stat: "([^"]+)",\s*suitNames: \[([^\]]+)\]/g)].map(m=>({id:m[1],name:m[2],teamCodeId:+m[3],stat:m[4],suitNames:JSON.parse('['+m[5]+']'),value:m[4]==='critDamage'?null:.15})):cachedMechanics.effects;
const suitBlock=mappings?mappings.split('export const YUHUN_SUIT_IDS_BY_NAME = {')[1].split('} as const')[0]:'';const suits=mappings?Object.fromEntries([...suitBlock.matchAll(/([^\s:,]+): (\d+)/g)].map(m=>[m[2],m[1]])):cachedMechanics.suits;
if(apkRules.suits){const canonical=s=>s.name==='涅槃之火'?'涅槃火':s.name;effects=effects.map(e=>{const rows=Object.values(apkRules.suits).filter(s=>e.stat in s.twoPiece);const values=[...new Set(rows.map(s=>s.twoPiece[e.stat]))];if(values.length>1)throw new Error('套装属性存在不同数值，不能合并');return {...e,suitNames:rows.map(canonical),value:values[0]??0,cycle:4};});effects.push({id:'fixedBoss',name:'首领固定属性（已计入副属性）',stat:'none',value:0,cycle:2,suitNames:Object.values(apkRules.suits).filter(s=>!Object.keys(s.twoPiece).length).map(canonical)});}
await fs.writeFile('data/mechanics.json',JSON.stringify({effects,suits,source:apkRules.source||'https://github.com/FiresChain/onmyoji-yuhun'},null,2));
const report=await read('data/roster-report.json',{});const updatedRoster=roster.map(r=>({...r,assets:assets[r.id]||null,officialUrl:`https://yys.163.com/shishen/${r.id}.html`,releasedBeforeCutoffVerified:['607','608'].includes(r.id),releasedAt:['607','608'].includes(r.id)?'2026-09-09':null,releaseEvidenceUrls:['607','608'].includes(r.id)?['https://yys.163.com/news/update/20260908/23024_1313394.html']:[],rarityConflict:r.static?.level!==r.rarity}));
const allAssets=Object.values(assets).flatMap(x=>x.variants).filter(v=>v.applicability!=='not_applicable');
const output={schemaVersion:1,builtAt:new Date().toISOString(),cutoffDate:'2026-09-12',roster:updatedRoster,lineups:[...curated,...merged.values()],effects,suits,taxonomy:taxonomy.map(([category,dungeon])=>({category,dungeon})),events,sources,excelAudit:{source:excel.source,sha256:excel.sha256,sheets:excel.sheets,occurrences:excel.occurrences,uniqueCodes:excel.uniqueCodes,decoded:Object.values(decoded).filter(r=>r.state==='decoded').length,rejected:Object.values(decoded).filter(r=>r.state==='failed').length},assetAudit:{...report,latestSentinel:report.latestSentinel?.map(x=>({id:x.id,name:x.name,rarity:x.rarity})),downloaded:allAssets.filter(x=>x.status==='downloaded_valid_image').length,nativeCardsVerified:0,charactersAudited:Object.keys(assets).length,notApplicable:Object.values(assets).filter(x=>x.awakeningAvailability==='not_applicable').length,supported:Object.values(assets).filter(x=>x.awakeningAvailability==='supported').length,unknown:roster.length-Object.values(assets).filter(x=>x.awakeningAvailability!=='unknown').length,failures:allAssets.filter(x=>x.status!=='downloaded_valid_image'),duplicateCharacters:Object.entries(assets).filter(([,x])=>x.duplicates).map(([id])=>id)}};
output.lineups=[...curated.filter(c=>!merged.has(c.code)),...merged.values()].filter(c=>typeof c.code==='string'&&c.code.trim());
output.assetAudit.attributeStateConflicts=updatedRoster.filter(r=>r.assets?.attributeConflict).map(r=>({id:r.id,name:r.name,rarity:r.rarity}));
if(!Object.keys(decoded).length&&previous.excelAudit){output.excelAudit.decoded=previous.excelAudit.decoded;output.excelAudit.rejected=previous.excelAudit.rejected;}
output.actors=[...await read('data/actors.json',[]),...await read('data/supplemental-actors.json',[])];output.officialNews=await read('data/official-news.json',[]);
for(const r of output.roster)if(apkRules.heroes?.[r.id])r.gameRules=apkRules.heroes[r.id];
for(const [id,r] of Object.entries(apkRules.heroes||{}))if(r.material&&!output.roster.some(h=>h.id===id))output.roster.push({id,name:r.name,rarity:'素材',isMaterial:true,gameRules:r,assets:{awakeningAvailability:'not_applicable',variants:[]}});
output.mechanicsSource=apkRules.source;
output.serverNames=(await read('desktop/ta-python/server_catalog.json',[])).map(s=>({id:String(s.ServerID),name:s.showName||s.ServerName}));
output.gameAssets=await read('data/game-assets.json',{items:[]});
output.qilingMarks=await read('data/qiling-marks.json',{marks:[]});
output.stageCatalog=await read('data/stages.json',{scenes:[]});
for(const actor of output.actors){const image=output.gameAssets.items.find(a=>a.library==='onmyoji'&&a.name===actor.name);if(image)actor.gameId=Number(image.id);}
for(const hero of output.roster){const image=output.gameAssets.items.find(a=>a.library==='daruma'&&a.id===hero.id);if(image)hero.assets={...hero.assets,awakeningAvailability:'not_applicable',variants:[{...image,family:'art-before',status:'downloaded_valid_image',verifiedState:'default'}]};}
const {default:categories}=await import('../app/categories.js');
const officialResults=await read('data/ta-workbook-results.json',{});
const verifiedSource=officialResults.sourceSha256===excel.sha256?excel:(excel.sources||[]).find(s=>s.sha256===officialResults.sourceSha256);
if(verifiedSource){
  const {default:core}=await import('../app/core.js');
  const permittedCodes=new Set(excel.entries.filter(e=>verifiedSource===excel||e.sourceFile===verifiedSource.source).map(e=>e.code));
  const results=new Map((officialResults.results||[]).filter(r=>permittedCodes.has(r.code)).map(r=>[r.code,r]));
 output.lineups=output.lineups.map(old=>{const result=results.get(old.code);if(!result)return old;const parsed=core.validateLineup(result.lineup);if(parsed.code!==old.code||parsed.decodeState!=='decoded-server')throw new Error('工作簿查询结果与原码不符');return {...core.mergeDecodedLineup(old,parsed),sourceKind:old.sourceKind,parsedAt:result.fetchedAt,decodeError:null,lastParseError:null,lastParseFailure:null};});
 output.excelAudit.decoded=new Set(excel.entries.filter(e=>results.has(e.code)).map(e=>e.code)).size;
 output.excelAudit.rejected=output.lineups.filter(l=>l.sourceKind==='excel'&&l.decodeState==='failed').length;
 output.excelAudit.method='official-game-session';
}
output.excelAudit.sources=excel.sources;
output.lineups=output.lineups.map(l=>categories.resolve(l,output));
await fs.writeFile('data/bundle.json',JSON.stringify(output));
await fs.mkdir('verification',{recursive:true});await fs.writeFile('verification/coverage.json',JSON.stringify({...output.assetAudit,excel:output.excelAudit,totalLineups:output.lineups.length,webSourceCount:sources.filter(x=>!x.error).length,structuredReferenceLineups:curated.length},null,2));
console.log(JSON.stringify({lineups:output.lineups.length,roster:roster.length,assets:allAssets.length,sources:sources.length}));
