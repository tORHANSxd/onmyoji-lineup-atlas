// Review rules use source titles, worksheet uses and explicit exclusions.
// They never rewrite a game's original stage ID or member requirements.
const fs=require('node:fs'),crypto=require('node:crypto'),Cat=require('../app/categories.js');
const data=JSON.parse(fs.readFileSync('data/bundle.json','utf8'));
const previous=fs.existsSync('data/lineup-classification.json')?JSON.parse(fs.readFileSync('data/lineup-classification.json','utf8')):{entries:{}};
const officialPaths=new Set(data.stageCatalog.scenes.map(s=>Cat.caption(Cat.normalize({category:s.level1,subcategory:s.level2,dungeon:s.level3}))));
const stageById=new Map(data.stageCatalog.scenes.map(s=>[s.gameSceneId,s]));
const p=(category,subcategory,dungeon,section)=>({category,subcategory,...(section?{section}:{}),dungeon});
const retired=p('寮活动','首领退治','通用');
const entries={};
for(const l of data.lineups){
 const originalPaths=previous.entries[l.code]?.originalPaths||l.classificationPaths;
 let paths=structuredClone(originalPaths),reasons=[];
 const titles=[l.title,l.raw?.title,...(l.occurrences||[]).map(o=>o.title)].filter(Boolean).join(' '),note=l.notes||'',stage=stageById.get(l.gameSceneId);
 const replace=(sub,replacement,reason)=>{paths=paths.filter(x=>x.subcategory!==sub).concat(replacement);reasons.push(reason);};
 if(paths.some(x=>x.subcategory==='首领退治'||x.subcategory==='年兽小鬼')||/退治/.test(titles)){
  const bosses=/退治通用/.test(titles)?[]:[...(/铁鼠/.test(titles)?['贪婪的铁鼠']:[]),...(/年兽/.test(titles)?['饥饿的年兽']:[]),...(/小鬼|包子/.test(titles)?['冥界小鬼']:[])];
  paths=paths.filter(x=>!['首领退治','年兽小鬼'].includes(x.subcategory));paths.push(...(bosses.length?bosses.map(b=>p('寮活动','首领退治','首领退治·'+b)):[retired]));reasons.push('首领退治按来源所列首领；通用用途不被原码占位关卡收窄');
 }
 if(paths.some(x=>x.subcategory==='狭间暗域')){
  const excluded=/不打神龙|除了?神龙/.test(titles+' '+note),broad=/通用|狭间\/|\/狭间/.test(titles),role=/精英/.test(titles)&&!/副将|首领/.test(titles)?'精英':/副将/.test(titles)&&!/精英|首领/.test(titles)?'副将':/首领/.test(titles)&&!/精英|副将/.test(titles)?'首领':/群体/.test(titles)?'群体通用':/单体/.test(titles)?'单体通用':'通用';
  if(excluded||broad)replace('狭间暗域',[p('寮活动','狭间暗域',excluded?role+'（除神龙）':role,/极难度/.test(titles)?'极难度':/困难/.test(titles)?'困难':/普难度/.test(titles)?'普通':undefined)],'保留来源的狭间用途范围与排除条件');
 }
 if(paths.some(x=>x.subcategory==='僵尸寮通用')){
  paths=[];if(/狭间/.test(titles))paths.push(p('寮活动','狭间暗域',/除神龙|不打神龙/.test(titles)?'通用（除神龙）':'通用'));
  if(/麒麟/.test(titles))paths.push(p('寮活动','狩猎战','麒麟通用'));
  if(/退治/.test(titles))paths.push(retired);
  if(!paths.length)paths=originalPaths;reasons.push('按僵尸寮原始阵容标题拆分用途');
 }
 if(paths.some(x=>x.subcategory==='狩猎战')){
  const elements=/水风火|水火风/.test(titles)?['水','风','火']:/四麒麟|麒麟通用/.test(titles)?['水','风','火','雷']:[...titles.matchAll(/([水风火雷])麒麟/g)].map(m=>m[1]);
  if(elements.length)replace('狩猎战',[...new Set(elements)].map(e=>p('寮活动','狩猎战','狩猎战·'+e+'麒麟')),'按来源列出的麒麟属性展开');
 }
 if(paths.some(x=>/六道/.test(x.subcategory))&&stage?.level1==='六道之门'){
  paths=[p('常驻挑战','六道之门',stage.level3)];reasons.push('来源六道用途与原码领域一致，补全领域名称');
 }
 if(paths.some(x=>/英杰/.test(x.subcategory))&&stage?.level1==='英杰试炼'){
  paths=[p('常驻挑战','英杰试炼',stage.level3,stage.level2)];reasons.push('统一英杰试炼名称，角色与关卡分层；PVE/PVP操作保留于备注');
 }
 if(paths.some(x=>x.subcategory==='秘闻')){
  paths=[p('周常','秘闻副本',/荒川/.test(titles)?'荒川百战':/镰鼬/.test(titles)?'镰鼬百战':'每周秘闻通用')];reasons.push('秘闻来源用途优先，通用阵容不采用占位关卡');
 }
 if(/除了周四/.test(titles)&&paths.some(x=>x.section==='极逢魔')){
  paths=[p('日常','逢魔','通用（除周四）','极逢魔')];reasons.push('保留作者明确排除的周四用途');
 }
 if(l.code==='|TA|038ebb507b986e018bd5dd84937cb8d7'){paths=[p('日常','地域鬼王','镜姬本通用','普通'),p('日常','地域鬼王','镜姬本通用','极')];reasons.push('原码标题同时注明地鬼与极地鬼、镜姬本');}
 if(l.code==='|TA|b836d1972fceaec15aac510c72b8d5c3'){paths=[p('日常','地域鬼王','群体本','极')];reasons.push('来源标题明确极地域鬼王群体本');}
 if(paths.some(x=>x.subcategory==='拾光永恒')&&/短线|爬塔|3-4s/.test(titles)){paths=[p('限时活动','拾光永恒','短线')];reasons.push('来源明确周年短线爬塔用途');}
 const sea={'|TA|44f7aca8cae6ecae4b33a467404b5ee7':'P1','|TA|e0c8c7975fa05dba2a6eaff504f91d12':'P2'};
 if(sea[l.code]){paths=[p('御魂','永生之海',sea[l.code])];reasons.push('来源 BV1sguE6DEGf 的 P1/P2 分段对应原码');}
 if(l.code==='|TA|711fc4a408fd904230c699a8b6bb397d'){paths=[p('寮活动','狭间暗域','蛇魔')];reasons.push('网页来源明确狭间蛇魔');}
 const restricted={
  '552839fe8296b35bfd006f6556ed9a8d':['普通',['精英（除神龙）']],
  'dc8c3697af991101bc6e6171f84ed52c':['普通',['副将（除神龙）','首领（除神龙）']],
  'fc2a7c56a22792e400ac73215b887484':[null,['首领','副将']],
  '89628da620949d5b02c839b84448e3c9':[null,['副将','精英']],
  '5665373c41d9a578231bf3408bc3b918':['极难度（仅2倍血量）',['精英']],
  '483f5d75df71c09d74f21eb4f530fe72':['极难度（仅2倍血量）',['副将']],
  'fcb2f7c59ed87b7c3e1cdbfe376a4354':['普通',['首领（狐狸 / 豹子区）','副将（狐狸 / 豹子区）']],
  '62629ec43bc41efda4cd79ab27761e7d':['普通',['精英（狐狸 / 豹子区）']]
 }[l.code.slice(4)];
 if(restricted)replace('狭间暗域',restricted[1].map(role=>p('寮活动','狭间暗域',role,restricted[0])),'逐条核对来源与原码备注，保留难度、血量、区域和敌人角色限制');
 if(['9575844fcf34f007999c5c657c1af4c6','333245d8d792adb87823f7949a2fcbc5','00e02dc3b515b9f552db3fb2edbe03bd'].includes(l.code.slice(4)))paths=paths.map(x=>x.subcategory==='狭间暗域'?{...x,section:'易难度'}:x);
 if(l.code==='|TA|620a1feebd6885e96ab1b8b628629334'){paths=[p('周常','秘闻副本','拾层','镰鼬百战')];reasons.push('原码注明只适合反复打10层，不能通用');}
 if(l.code==='|TA|d624aa1cf0e13f7a2fca448bd2315cf0'){paths=[p('限时活动','拾光永恒','短线')];reasons.push('来源备注报告短线5至6秒');}
 paths=paths.map(x=>({...x,...(!officialPaths.has(Cat.caption(x))?{extended:true}:{})}));
 paths=[...new Map(paths.map(x=>[Cat.caption(x),x])).values()];
 const uncertain=l.code==='|TA|f3b9ace97465bdce393fbdbc41057b18';
 entries[l.code]={paths,originalPaths,reason:uncertain?'福利寮用途证据不足，保留来源分组，待核对':reasons.join('；')||'核对现有来源用途与原码，保留已知分类',verification:uncertain?'needs-review':l.raw?'source-and-payload':'source-only',requirementsVerified:!!l.raw,evidence:{title:l.title,payloadTitle:l.raw?.title||null,gameSceneId:l.gameSceneId??null,sources:(l.occurrences||[]).map(o=>({file:o.sourceFile,sheet:o.sheet,row:o.row})),url:/^https:\/\//.test(l.sourceUrl||'')?l.sourceUrl:null}};
}
const extendedStages=[...new Map(Object.values(entries).flatMap(e=>e.paths).filter(p=>p.extended).map(p=>[Cat.caption(p),p])).values()];
const report={schemaVersion:1,reviewedAt:'2026-09-22',sourceExcelSHA256:crypto.createHash('sha256').update(fs.readFileSync('data/excel.json')).digest('hex'),entries,extendedStages};
fs.writeFileSync('data/lineup-classification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({reviewed:Object.keys(entries).length,corrected:Object.values(entries).filter(e=>JSON.stringify(e.paths.map(Cat.caption))!==JSON.stringify(e.originalPaths.map(Cat.caption))).length,extended:extendedStages.length,pending:Object.values(entries).filter(e=>e.verification==='needs-review').length}));
