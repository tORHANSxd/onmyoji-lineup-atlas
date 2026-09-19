(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasCategories=api;})(globalThis,function(){
'use strict';
const daily=new Set(['日常','探索','御灵','地域鬼王','结界突破']);
const permanent=new Set(['常驻挑战','首次通关','英杰试炼','六道之门','秘闻副本','新手阵容']);
const aliases=[[/悲鸣/,'魂土 魂11 十一层'],[/神罚/,'魂王 魂12 十二层'],[/虚无/,'魂主 魂十三 魂13 十三层'],[/八岐大蛇·拾层/,'魂十 魂10 十层'],[/真·八岐大蛇/,'真蛇'],[/鬼灵歌伎/,'鬼灵歌姬'],[/首领退治/,'首领退职'],[/地域鬼王/,'地鬼'],[/斗技/,'对战']];
// Published sources identify these seven codes as 拾光永恒. Their payloads use
// 探索第一章 as a placeholder; unrelated 第一章 codes must remain 探索.
const eventCodes={e43922d92d24988ffe4e54d9ce618326:'短线','90e6d5254b6dc1f97663c8e782769854':'短线','7f99899671a874f30803adb10dfa5b54':'短线',b962bca949901e66a83903b4b4eade44:'困难','057b4c1be7e8567461f67b522108775e':'困难','2efe94845a86c3c1befdf767fa794333':'探索遭遇战',ce0fd79bcc60e2dc672ad4ac6bd5f177:'探索遭遇战'};
const clean=s=>String(s||'').replace(/鬼灵歌姬/g,'鬼灵歌伎').replace(/首领退职/g,'首领退治');
function segments(p){return [p.category,p.subcategory,p.section,p.dungeon].filter(Boolean).filter((s,i,a)=>!i||s!==a[i-1]);}
function caption(p){return segments(p).join(' → ');}
function normalize(p){
 const family=clean(p.category),sub=clean(p.subcategory),leaf=clean(p.dungeon||sub||'待分类'),name=sub+' '+leaf;
 const make=(category,subcategory,dungeon=leaf,section=p.section)=>({category,subcategory,...(section?{section}:{}),dungeon});
 if(/真蛇|真[·・]?八岐大蛇/.test(name))return make('御魂','真·八岐大蛇',leaf.replace(/^真蛇$/,'真·八岐大蛇'));
 if(/彼世逢魔/.test(name))return make('日常','逢魔','彼世逢魔','彼世逢魔');
 if(/逢魔/.test(family+' '+name)||/鬼灵歌伎|蜃气楼|土蜘蛛|荒骷髅|地震鲶|胧车|夜荒魂/.test(name)){
  const section=p.section||(/极逢魔|·极/.test(family+' '+name)?'极逢魔':/演武/.test(family+' '+name)?'逢魔演武':'普通逢魔');
  return make('日常','逢魔',/^(逢魔|逢魔之时|普通逢魔|极逢魔)$/.test(leaf)?'通用':leaf.replace(/^演武·|·极$/g,''),section);
 }
 if(/觉醒/.test(family+' '+name)||/[火风雷水]麒麟[·・].*层/.test(name))return make('日常','觉醒',leaf,/([火风雷水]麒麟)/.exec(name)?.[1]);
 if(/道馆/.test(family+' '+name))return make('寮活动','道馆');
 for(const n of ['狭间暗域','首领退治'])if(name.includes(n))return make('寮活动',n);
 if(/契灵/.test(family+' '+name)){
  const type=/首领/.test(name)?'契灵首领':/探查|小怪/.test(name)?'探查':/镇墓兽|月魔兔|薙魂|针女|狐火|火灵|茨球|小黑/.exec(name)?.[0]||'契灵';
  return make('契灵',type,leaf.replace(/^契灵\s*·\s*/,'')===type?type:leaf);
 }
 if(['斗技','对战'].includes(family)||/斗技/.test(name))return make('斗技',/协同/.test(name)?'协同斗技':'斗技');
 if(/狩猎|麒麟/.test(name))return make('寮活动','狩猎战',leaf==='狩猎战 / 麒麟'?'麒麟':leaf);
 if(/阴界之门/.test(name))return make('周常','阴界之门');
 if(/御灵/.test(name))return make('日常','御灵');
 if(/八岐大蛇|魂十|魂土|魂王|魂主|悲鸣|神罚/.test(name)){
  const known=/魂土|悲鸣/.test(leaf)?'悲鸣':/魂王|神罚/.test(leaf)?'神罚':/魂十三|魂13|魂主|虚无/.test(leaf)?'虚无':/魂十|魂10|御魂十层/.test(leaf)?'拾层':null;
  return make('御魂','八岐大蛇',known?'八岐大蛇·'+known:leaf);
 }
 if(/魂海|永生之海/.test(name))return make('御魂','永生之海');
 for(const n of ['业原火','日轮之陨'])if(name.includes(n)||n==='日轮之陨'&&/日蚀/.test(name))return make('御魂',n);
 if(/地鬼|地域鬼王/.test(name))return make('日常','地域鬼王',leaf.replace(/^地鬼$/,'地域鬼王'));
 if(/结界突破/.test(name))return make('日常','结界突破');
 if(['寮活动','阴阳寮'].includes(family))return make('寮活动',sub||leaf);
 if(family==='周常')return make('周常',sub||leaf);
 if(family==='御魂')return make('御魂',sub||leaf);
 if(daily.has(family))return make('日常',family==='日常'?sub||leaf:family,leaf);
 if(permanent.has(family))return make('常驻挑战',family==='常驻挑战'||family==='首次通关'?sub||leaf:family);
 if(['其他','待分类',''].includes(family))return make('其他',sub||'自定义');
 return make('限时活动',family==='限时活动'?sub||'活动副本':family);
}
function sourceWithStage(source,stage){
 if(!stage||source.category!==stage.category||source.subcategory!==stage.subcategory)return source;
 if(source.section&&source.section!==stage.section||source.dungeon==='通用')return source;
 if(source.dungeon===source.subcategory||source.dungeon===stage.dungeon||source.dungeon===stage.section||source.subcategory==='狩猎战'&&source.dungeon==='麒麟')return stage;
 // Keep battle roles such as 道馆进攻 and 永生之海 P1 without losing the stage.
 if(source.subcategory==='道馆'||source.category==='斗技')return source;
 if(source.subcategory==='永生之海'&&/P[12]/i.test(source.dungeon))return {...stage,section:stage.dungeon,dungeon:source.dungeon};
 return source;
}
function crossList(p){
 if(p.category==='御魂'&&p.subcategory==='真·八岐大蛇')return [p,{...p,category:'周常'}];
 if(p.category==='日常'&&p.subcategory==='逢魔'&&p.section==='彼世逢魔')return [p,{category:'周常',subcategory:'彼世逢魔',dungeon:p.dungeon}];
 return [p];
}
function resolve(lineup,data){
 const candidates=(data.stageCatalog?.scenes||[]).filter(s=>s.gameSceneId!=null&&String(s.gameSceneId)===String(lineup.gameSceneId));
 const stages=new Map(candidates.map(s=>[[s.level1,s.level2,s.level3].join('\u0000'),s])),rawStage=stages.size===1?[...stages.values()][0]:null;
 const decodedStage=rawStage?{category:rawStage.level1,subcategory:rawStage.level2,dungeon:rawStage.level3}:null,stage=decodedStage?normalize(decodedStage):null;
 let paths=stage?[stage]:[],classificationSource=stage?'阵容码副本 ID · '+(rawStage.verification==='apk'?'APK 表核验':'社区映射待核验'):lineup.gameSceneId!=null?'副本 ID 尚未收录 · 按管理信息分类':'原码未提供副本 ID · 按管理信息分类';
 const sources=(lineup.occurrences?.length?lineup.occurrences.flatMap(o=>o.classificationPaths||[]):lineup.sourceFile?lineup.classificationPaths||[]:[]).filter(p=>p.category&&p.subcategory&&p.dungeon);
 if(sources.length){paths=sources.map(p=>sourceWithStage(normalize(p),stage));if(paths.some(p=>caption(p)!==caption(stage||{})))classificationSource=stage?'原码关卡 + 来源用途纠正':'Excel 副本用途';}
 const event=eventCodes[String(lineup.code||'').replace(/^\|TA\|/,'')];
 if(event){paths=[{category:'限时活动',subcategory:'拾光永恒',dungeon:event}];classificationSource='拾光永恒 · 已核实原码来源用途';}
 if(!paths.length){
  const sourceText=[lineup.originalCategory,lineup.title].filter(Boolean).join(' '),taxonomy=[...(data.taxonomy||[])].sort((a,b)=>b.dungeon.length-a.dungeon.length),matched=taxonomy.find(t=>sourceText.includes(t.dungeon))||taxonomy.find(t=>String(lineup.dungeon||'').includes(t.dungeon));
  paths=[normalize(matched?{...matched,subcategory:matched.dungeon}:lineup)];
 }
 paths=paths.flatMap(crossList);
 if(lineup.manualClassification){paths=[{category:lineup.category,subcategory:lineup.subcategory||'自定义',...(lineup.section?{section:lineup.section}:{}),dungeon:lineup.dungeon}];classificationSource='手动管理分类';}
 const classificationPaths=[...new Map(paths.map(p=>[JSON.stringify(p),p])).values()],primary=classificationPaths[0];
 return {...lineup,section:undefined,...primary,classificationPaths,dungeons:[...new Set(classificationPaths.map(p=>p.dungeon))],classificationSource,decodedStage};
}
function matches(lineup,category='',subcategory='',dungeon=''){return (lineup.classificationPaths||[lineup]).some(p=>(!category||p.category===category)&&(!subcategory||p.subcategory===subcategory)&&(!dungeon||p.dungeon===dungeon));}
function searchText(p){
 const text=caption(p),numbers={'壹':'一 1','贰':'二 2','叁':'三 3','肆':'四 4','伍':'五 5','陆':'六 6','柒':'七 7','捌':'八 8','玖':'九 9','拾':'十 10'};
 return [text,...[0,1].map(i=>text.replace(/([壹贰叁肆伍陆柒捌玖拾])层/g,(_,n)=>numbers[n].split(' ')[i]+'层')),...aliases.filter(([pattern])=>pattern.test(text)).map(([,s])=>s)].join(' ').toLowerCase();
}
function searchMatches(p,query=''){
 const value=query.trim(),full=caption(p);
 if(value.includes(' → '))return full===value||full.startsWith(value+' → ');
 const text=searchText(p).replace(/[·・]/g,'');return value.toLowerCase().split(/\s+/).filter(Boolean).every(q=>text.includes(q.replace(/[·・]/g,'')));
}
return {resolve,matches,segments,caption,searchText,searchMatches};
});
