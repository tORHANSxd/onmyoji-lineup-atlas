const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const D=require('../data/bundle.json'),C=require('../app/categories.js');
test('默认使用686条APK关卡映射，不让旧标题覆盖已解析关卡',()=>{
 assert.equal(D.stageCatalog.scenes.length,686);const l=C.resolve({gameSceneId:1001000,title:'周常逢魔旧标题',category:'周常',dungeon:'彼世逢魔'},D);assert.equal(l.category,'御魂');assert.equal(l.subcategory,'八岐大蛇');assert.equal(l.dungeon,'八岐大蛇·虚无');assert.match(l.classificationSource,/APK/);assert.deepEqual(l.dungeons,[l.dungeon]);
 for(const row of D.lineups)assert.ok(C.resolve(row,D).classificationPaths.length>=1);
});
test('Excel用途覆盖原码场景默认值，同码跨副本可找且路径不能交叉拼接',()=>{
 const breakthrough=D.lineups.find(l=>l.code==='|TA|c1222c56e1c5a009e53741bcb1d63fa1');assert.equal(breakthrough.dungeon,'结界突破');assert.ok(breakthrough.decodedStage);
 const shared=D.lineups.find(l=>l.code==='|TA|cf7b889739f9167a4db2597df0ca743c');assert.ok(C.matches(shared,'契灵','薙魂'));assert.ok(C.matches(shared,'契灵','针女'));assert.equal(C.matches(shared,'契灵','薙魂','针女'),false);
 const manual=C.resolve({...shared,manualClassification:true,category:'收藏',subcategory:'练习',dungeon:'自定义'},D);assert.equal(manual.classificationPaths.length,1);assert.ok(C.matches(manual,'收藏','练习','自定义'));
});
test('合并标题和说明保留、错标题有修正依据，更新引用不生成伪分类',()=>{
 const excel=require('../data/excel.json'),luo=excel.entries.filter(e=>e.sourceFile.startsWith('01 '));assert.equal(luo.length,218);
 assert.ok(excel.entries.filter(e=>e.sheet==='更新内容').every(e=>e.classificationPaths.length===0));
 assert.ok(luo.filter(e=>e.sheet==='斗技').every(e=>e.title&&e.title!=='未命名阵容'&&!e.title.includes('DISPIMG')));
 assert.equal(luo.find(e=>e.sheet==='契灵'&&e.row===45).classificationPaths[0].subcategory,'薙魂');assert.ok(luo.find(e=>e.sheet==='普逢').classificationCorrection);
 assert.equal(luo.find(e=>e.sheet==='道馆'&&e.row===4).recordKind,'配置码');assert.equal(luo.find(e=>e.sheet==='道馆'&&e.row===10).recordKind,'队伍码');
 assert.ok(excel.entries.find(e=>e.sheet==='全图玩家'&&e.row===14).notes);
});
test('未知ID保持未知来源，明确手动管理分类优先；同级过滤无交集',()=>{
 assert.match(C.resolve({gameSceneId:999999999,title:'未知',dungeon:'待分类'},D).classificationSource,/尚未收录/);
 const a=C.resolve({gameSceneId:1001000,manualClassification:true,category:'自定义',subcategory:'子类',dungeon:'副本'},D);assert.equal(a.category,'自定义');assert.equal(a.decodedStage.dungeon,'八岐大蛇·虚无');
});
test('道馆狭间和退治在寮活动，契灵含首领独立分类，阴界仍是周常',()=>{
 for(const [gameSceneId,category] of [[19005,'周常'],[10020204,'寮活动'],[10020211,'寮活动'],[10020203,'寮活动'],[10055001,'契灵']])assert.equal(C.resolve({gameSceneId},D).category,category);
 for(const [dungeon,category] of [['阴界之门','周常'],['首领退职','寮活动'],['狭间暗域','寮活动'],['契灵首领','契灵'],['道馆防守','寮活动']])assert.equal(C.resolve({dungeon,category:'寮活动'},D).category,category);
 const daily=D.stageCatalog.scenes.find(s=>s.level1==='御灵');assert.equal(C.resolve({gameSceneId:daily.gameSceneId},D).category,'日常');
});
test('普通极彼世逢魔同属日常逢魔，彼世与真蛇保留双入口',()=>{
 for(const [gameSceneId,type] of [[10020217,'普通逢魔'],[10020219,'极逢魔'],[100978,'逢魔演武'],[100969,'彼世逢魔']]){const l=C.resolve({gameSceneId},D);assert.equal(l.category,'日常');assert.equal(l.subcategory,'逢魔');assert.equal(l.section,type);}
 assert.deepEqual(C.resolve({gameSceneId:10020217},D).classificationPaths,[{category:'日常',subcategory:'逢魔',section:'普通逢魔',dungeon:'鬼灵歌伎'}]);
 const other=C.resolve({gameSceneId:100969},D),snake=C.resolve({gameSceneId:10020228},D);
 assert.ok(C.matches(other,'日常','逢魔'));assert.ok(C.matches(other,'周常','彼世逢魔'));assert.equal(other.classificationPaths.length,2);
 assert.ok(C.matches(snake,'御魂','真·八岐大蛇'));assert.ok(C.matches(snake,'周常','真·八岐大蛇'));assert.equal(snake.classificationPaths.length,2);
});
test('觉醒麒麟保留类型和层数，不能与寮狩猎混为一类',()=>{
 for(const gameSceneId of [10020001,10021001,10022001,10023001]){const l=C.resolve({gameSceneId},D);assert.equal(l.category,'日常');assert.equal(l.subcategory,'觉醒');assert.match(l.section,/[火风雷水]麒麟/);assert.match(l.dungeon,/拾层/);assert.ok(C.searchMatches(l,'麒麟 10层'));}
 for(const gameSceneId of [10020207,10020208,10020209,10020210]){const l=C.resolve({gameSceneId},D);assert.equal(l.category,'寮活动');assert.equal(l.subcategory,'狩猎战');}
});
test('当前活动七个占位码按来源修正，其他第一章不被误归活动',()=>{
 const codes=['e43922d92d24988ffe4e54d9ce618326','90e6d5254b6dc1f97663c8e782769854','7f99899671a874f30803adb10dfa5b54','b962bca949901e66a83903b4b4eade44','057b4c1be7e8567461f67b522108775e','2efe94845a86c3c1befdf767fa794333','ce0fd79bcc60e2dc672ad4ac6bd5f177'];
 for(const code of codes){assert.ok(D.lineups.some(l=>l.code==='|TA|'+code));const l=C.resolve({code:'|TA|'+code,gameSceneId:110400},D);assert.equal(l.category,'限时活动');assert.equal(l.subcategory,'拾光永恒');assert.equal(l.decodedStage.dungeon,'第一章');}
 assert.equal(C.resolve({code:'|TA|unrelated',gameSceneId:110400},D).category,'日常');
});
test('全库分类可重复解析，合并对战，已知来源多用途不丢失',()=>{
 const rows=D.lineups.map(l=>C.resolve(l,D));
 for(const l of rows){assert.deepEqual(C.resolve(l,D).classificationPaths,l.classificationPaths);assert.equal(new Set(l.classificationPaths.map(C.caption)).size,l.classificationPaths.length);assert.ok(!l.classificationPaths.some(p=>['对战','道馆','普通逢魔','极逢魔'].includes(p.category)));}
 assert.equal(C.resolve({category:'对战',dungeon:'斗技'},D).category,'斗技');
 const source={category:'寮活动',subcategory:'狭间暗域',dungeon:'狭间暗域'},l=C.resolve({gameSceneId:10020211,occurrences:[{classificationPaths:[source]}]},D);assert.equal(l.dungeon,'狭间暗域·神龙暗域');
 const wrong=C.resolve({gameSceneId:1001001,occurrences:[{classificationPaths:[{category:'道馆',subcategory:'道馆进攻',dungeon:'道馆进攻'}]}]},D);assert.equal(wrong.category,'寮活动');assert.equal(wrong.dungeon,'道馆进攻');assert.equal(wrong.decodedStage.dungeon,'八岐大蛇·神罚');
});
test('搜索支持完整路径、层数和常用别名，极普通路径不会串线',()=>{
 for(const [gameSceneId,query] of [[1001002,'魂土'],[1001001,'魂王'],[10020228,'真蛇'],[10020217,'鬼灵歌姬'],[10020001,'火麒麟 十层'],[10020001,'火麒麟10层'],[10020001,'火麒麟十层']])assert.ok(C.searchMatches(C.resolve({gameSceneId},D),query));
 const normal=C.resolve({gameSceneId:10020218},D),extreme=C.resolve({gameSceneId:10020219},D);
 assert.ok(C.searchMatches(normal,'日常 → 逢魔 → 普通逢魔'));assert.equal(C.searchMatches(extreme,'日常 → 逢魔 → 普通逢魔'),false);
 assert.equal(C.searchMatches(normal,'不存在的关卡'),false);
});
test('所有套装、五种达摩、六主角技能契灵及术印的186张图片已本地化且哈希匹配',()=>{
 assert.equal(D.gameAssets.items.filter(a=>a.library!=='shikigamiSkill').length,186);
 for(const a of D.gameAssets.items){const bytes=fs.readFileSync(a.localPath);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(bytes.readUInt32BE(0),0x89504e47);}
 for(const name of Object.values(D.suits))assert.ok(D.gameAssets.items.some(a=>a.library==='yuhun'&&a.name===name));
 for(const name of Object.values(D.suits))assert.ok(D.effects.some(e=>e.suitNames.includes(name)),'Missing normalized suit effect: '+name);
 assert.equal(D.gameAssets.items.filter(a=>a.library==='daruma').length,5);assert.deepEqual(D.actors.map(a=>a.gameId).sort((a,b)=>a-b),[10,11,12,13,15,16]);
});
test('48个客户端术印都具备原图与三个等级的独立效果，不能使用同名图标混配',()=>{
 assert.equal(D.qilingMarks.marks.length,48);assert.equal(new Set(D.qilingMarks.marks.map(m=>m.id)).size,48);
 for(const m of D.qilingMarks.marks){const a=D.gameAssets.items.find(a=>a.library==='hunlingMark'&&a.id===String(m.id));assert.ok(a);assert.equal(a.name,m.name);assert.equal(a.clientResource,`icon/skill/${m.skillId}.png`);assert.deepEqual(m.levels.map(l=>l.level),[1,2,3]);assert.ok(m.levels.every(l=>l.description.length>0));}
 const divination=D.qilingMarks.marks.filter(m=>m.name==='术印·占卜');assert.equal(divination.length,3);assert.equal(new Set(divination.map(m=>D.gameAssets.items.find(a=>a.library==='hunlingMark'&&a.id===String(m.id)).sha256)).size,3);
});
