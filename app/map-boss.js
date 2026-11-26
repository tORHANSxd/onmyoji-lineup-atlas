/* Versioned map boss routes shared by the catalog and offline runner. */
((root)=>{
 'use strict';
 const tableSHA256={
  map_boss:'d88b6c83b76e7daa399684185869702a2e4e94f179dc58f0c9cb8b718f8e2a2f',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
 };
 const bossMode=3000,sealMode=855,lbsMode=3001,lbsActivityMode=3022,nianMode=534,specialNianMode=535,meituanMode=880;
 const qinfeiFoodMode=321,qinfeiFoodTableHash='0c5b3887f7c88341a910bbd8fc6c6c74af95ac83fb79fa0123504a1ded52cf0d';
 const bossRoutes=[
  {base:14400,entries:[69],label:'石距',kind:'stone',sceneId:44,ids:[[23]]},
  {base:25300,entries:[73],label:'愤怒的石距',kind:'angryStone',sceneId:40055,ids:[[9991101,9997247,9998247]]},
  {base:14600,entries:[70,75],label:'年兽',kind:'yearBeast',sceneId:51,ids:[[30]]},
  {base:16100,entries:[74],label:'年兽·历史春节档',kind:'yearBeast',sceneId:51,ids:[[30,...Array(5).fill(9991111)]]},
 ];
 const sealRoutes=[
  [1000,[1],'跳跳哥哥',[[14404,11404,12404,13404],[14405,14408,11407,12408],[13233,14406,14407,14407,233,233]]],
  [1100,[2],'椒图',[[14406,11404,12404,13404],[14405,14404,11404,12404],[13234,11404,12406,13404,234,234]]],
  [1200,[3],'骨女',[[14408,11408,12408,13408],[14405,14404,11404,12404],[13223,14404,11404,12404,223,223]]],
  [1300,[4],'饿鬼',[[14409,11404,12404,13404],[14403,11404,12404,13404],[13214,14245,11245,12245,214,214]]],
  [1400,[5],'二口女',[[14408,14407,11407,12407],[14245,11408,12408,13408],[13263,14245,11245,12245,263,263]]],
  [1500,[6],'海坊主',[[14245,11406,12406,13406],[11407,10405,10404,12405],[13247,14245,11245,12245,247,247]]],
  [1600,[7],'鬼使黑',[[14405,11409,12409,13409],[14409,11408,12408,13408],[13211,14245,11245,12245,211,211]]],
  [1900,[63,64,65,66,67,68],'姑获鸟·历史活动',[[14405,14409,11409,12409],[14409,11408,12408,13408],[99262,14245,11245,12245,262,262]]],
  [2200,[101,102,103,104,105,106,107,108,109,110,111,112,113,114,115],'小松丸',
   [[14405,14409,11409,12409],[14409,11408,12408,13408],[99290,14245,11245,12245,290,290]]],
  [16000,[117],'日和坊',[[10297,12244,12285,12244],[10297,12261,17205,17201],[11297,18265,17219,12277,12278,12266]]],
 ].map(([base,entries,name,ids])=>({base,entries,label:'妖气封印 · '+name,kind:'seal',sceneId:39,ids}));
 const lbsFirstWaves=[[14405,11409,12409,13409],[14409,11408,12408,13408]];
 const lbsRoutes=[
  [10000,19,'座敷童子',[16205,16205,16205,12245,13409,11409]],
  [10100,20,'三尾狐',[16202,15202,15202,15202,15202,15202]],
  [10200,21,'管狐',[14236,13236,13236,13236,13236,13236]],
  [10300,22,'蝴蝶精',[14241,216,216,216,15241,15241]],
  [10400,23,'鲤鱼精',[15206,209,209,209,14206,14206]],
  [10500,24,'河童',[16209,14206,14206,14206,13409,16209]],
  [10600,25,'桃花妖',[16200,13408,13408,13408,15200,15200]],
  [10700,26,'丑时之女',[16228,236,236,236,15228,15228]],
  [10900,28,'童女',[16213,404,100995,404,16212,16212]],
  [11000,29,'童男',[16212,404,100995,404,15213,15213]],
  [11100,30,'兵俑',[16227,400,400,400,15227,15227]],
  [11300,32,'跳跳妹妹',[16226,225,99233,225,15226,15226]],
  [11400,33,'萤草',[16238,249,249,249,15238,15238]],
  [11500,34,'鸦天狗',[17218,404,404,404,16218,16218]],
  [11600,35,'镰鼬',[16261,404,404,404,15261,15261]],
  [11700,36,'大天狗',[16217,1201,1201,1201,15217,15217]],
  [11800,37,'酒吞童子',[16219,231,265,231,15219,15219]],
  [11900,38,'荒川之主',[16248,404,404,404,404,15248]],
  [12000,39,'阎魔',[16255,251,251,251,15255,15255]],
  [12200,41,'小鹿男',[16259,15259,15259,15259,15259,15259]],
  [12300,42,'茨木童子',[16265,231,219,231,16265,16265]],
  [12400,43,'青行灯',[16266,211,16266,15259,210,16266]],
  [12700,46,'孟婆',[16215,251,251,251,251,15215]],
  [12800,47,'犬神',[16220,207,1207,207,15220,15220]],
  [13000,49,'鬼女红叶',[16231,15231,15231,15231,1219,1219]],
  [13100,50,'傀儡师',[16242,15242,15242,15242,15242,15242]],
  [13200,51,'判官',[16251,15251,15251,15251,17255,17255]],
  [13300,52,'凤凰火',[16252,227,227,227,15252,15252]],
  [13400,53,'吸血姬',[16253,15253,15253,15253,15253,15253]],
  [13500,54,'妖狐',[16254,15254,15254,15254,15254,15254]],
  [13600,55,'妖琴师',[16256,15256,15256,15256,15256,15256]],
  [13700,56,'食梦貘',[16257,15257,15257,15257,15257,15257]],
  [13800,57,'清姬',[16260,15260,15260,15260,15260,15260]],
  [14000,59,'姑获鸟',[16262,205,205,205,15262,15262]],
  [14200,61,'白狼',[16264,15264,15264,15264,15264,15264]],
  [14300,62,'惠比寿',[16268,404,404,404,232,232]],
 ].map(([base,entry,name,lastWave])=>({base,entries:[entry],label:'现世鬼王 · '+name,kind:'lbs',sceneId:39,ids:[...lbsFirstWaves,lastWave]}));
 const buildStages=(routes,battleMode)=>routes.flatMap(({ids, ...route})=>Array.from({length:9},(_,i)=>{
  const level=10+5*i,stageId=route.base+i;
  const waves=route.waves??ids.map((wave,waveIndex)=>wave.map((id,slot)=>{
   // 椒图最低档第二波第三位保留原表的 1 级。
   const enemyLevel=stageId===1100&&waveIndex===1&&slot===2?1:
    Math.min(40,level-(battleMode===sealMode&&slot>0?3:0));
   return [slot+1,id,enemyLevel];
  }));
  return [stageId,{...route,battleMode,level,waves}];
 }));
 const activityRoutes=[
  {base:200180,entries:[19042],label:'现世妖约 · 广州塔策划鼠'},
  {base:200190,entries:[19043],label:'现世妖约 · 上海五角场策划鼠'},
 ].map(route=>({...route,kind:'lbsActivity',sceneId:233,waves:[[[2,14451,40],[3,14452,40],[4,14453,40]]],
  deadlineSeconds:300,passiveSkill:101013,codeStageId:101006}));
 const historyFirstWaves=[[7116262,7116218,7116218,7116218],[7116220,7116247,7116208,7116257]];
 const recentHistoryWaves=[[8956262,8956218,8956218,8956218],[8956220,8956247,8956208,8956257]];
 const recentHistoryAdds=[8956289,8956253,8956304,8956260];
 const historyRoutes=[
  [19300,[19007],'侍神令',3390265,[[3390415,3390004,3390004,3390004],[3390420,3390005,3390005,3390005]],
   [3390219,3390322,3390341,3391342],40089],
  [20020,[19021,19032],'京东／名创优品',7116330],
  [20030,[19022],'大触觉醒',7116311],
  [20040,[19023],'大江山之章',7116312],
  [20050,[19024],'屈臣氏',7116266],
  [20060,[19025,19029],'平安银行／罗森',339362],
  [20070,[19027],'上海主题店',7116343],
  [20130,[19031],'周生生',7116410,[[7116347,7116411,7116411,7116411],historyFirstWaves[1]]],
  [20150,[19038],'携程',7116379],
  [200150,[19039],'抖音夏日百味大赏',8956392,recentHistoryWaves,recentHistoryAdds],
  [200160,[19040],'九周年现世之约',8956330,recentHistoryWaves,recentHistoryAdds],
 ].map(([base,entries,name,boss,initial=historyFirstWaves,adds=[7116289,7116253,7116304,7116260],sceneId=39])=>
  ({base,entries,label:'历史现世妖约 · '+name,sceneId,ids:[...initial,[boss,...adds]]}));
 const changLongEnemies=[1081287,1081251,1081252,1081253,1081254,1081256];
 const changLongLevels=[[10,7],[15,12],[20,20],[25,25],[30,30],[35,35],[37,37],[40,40],[40,40]];
 const historySingleRoutes=[
  {base:20080,entries:[19028],sceneId:40056,label:'历史现世妖约 · 肯德基',
   opening:(rank,level)=>[[1,9991052+Math.min(rank,4),rank<5?level:40],[5,9992237,20],[6,9992215,20]]},
  {base:20090,entries:[19030],sceneId:62,label:'历史现世妖约 · 融创雪世界',
   opening:(rank,level)=>[[1,339361,rank<5?level:40],...[2,4,5,6].map(slot=>[slot,339408,rank<5?15:35])]},
  {base:200170,entries:[19041],sceneId:39,label:'历史现世妖约 · 广州长隆',
   opening:rank=>changLongEnemies.map((id,i)=>[i+1,id,changLongLevels[rank][i?1:0]])},
 ];
 const historyStages=[...historyRoutes,...historySingleRoutes].flatMap(({base,ids,opening,...route})=>Array.from({length:9},(_,rank)=>{
  const level=10+5*rank;
  const waves=ids?ids.map((wave,index)=>wave.map((id,i)=>[
   (index===2?[1,2,4,5,6]:[1,2,3,4])[i],id,Math.min(40,level-(i?3:0)),
  ])):[opening(rank,level)];
  return [base+rank,{...route,battleMode:lbsActivityMode,kind:'lbsHistory',level,waves}];
 }));
 const sharedHpLineupSlots=[3,4,5,6,2];
 const nianRoutes=[
  ...Array.from({length:9},(_,i)=>[3340141+i,{
   entries:[19015,19016,19017,19018,19019,19020,19026],label:'现世年兽',
   kind:'lbsNianNormal',battleMode:nianMode,level:10+5*i,enemyLevel:Math.min(40,10+5*i),
  }]),
  ...[30,35,40,40,40,40].map((enemyLevel,i)=>[3340150+i,{
   entries:[],label:'专属年兽',kind:'lbsNianSpecial',battleMode:specialNianMode,level:i+1,enemyLevel,raidWindowSeconds:600,
  }]),
 ].map(([id,{enemyLevel,...route}])=>[id,{
  ...route,sceneId:40061,waves:[[[1,100031,enemyLevel]]],lineupSlots:sharedHpLineupSlots,passiveSkill:62050,
  tierLabel:route.battleMode===specialNianMode?`第 ${route.level} 档`:`${route.level} 级档`,
 }]);
 const meituanRoutes=[{base:20140,entries:[19033,19034,19035,19036,19037],label:'宴席大赛',
  kind:'meituan',sceneId:41146,lineupSlots:sharedHpLineupSlots,skills:[61270,61271],
  ids:[[4262369,4262208,4262312,4262281,4262301,4262342]],
 }];
 const qinfeiFoods=['酒','苹果','鱼','肉'];
 const qinfeiEnemySlots=[[1,2,4],[1,2,3,4],[1,2,3,4],[1,2,4,5,6],[1,2,3,4,5,6],[1,2,4]];
 const qinfeiFoodRoutes=[
  [9901050,9900276,9901276],
  [9902050,9900317,9901317],
  [9903050,9900247,9901247],
  [9904050,9900257,9901257],
  [9900406,9901406,9902406,9903406],
  [9900404,9901404,9902404,9903404],
  [9900407,9901407,9902407,9903407],
  [9900405,9901405,9902405,9903405],
  [9902208,9904406,9905406,9906406],
  [9902289,9904404,9905404,9906404],
  [9902206,9904407,9905407,9906407],
  [9902237,9904405,9905405,9906405],
  [9902276,9903208,9904208,9905208,9906208],
  [9902317,9903289,9904289,9905289,9906289],
  [9902247,9903206,9904206,9905206,9906206],
  [9902257,9903237,9904237,9905237,9906237],
  [9901219,9903276,9904276,9905276,9906276,9907276],
  [9901259,9903317,9904317,9905317,9906317,9907317],
  [9901248,9903247,9904247,9905247,9906247,9907247],
  [9901296,9903257,9904257,9905257,9906257,9907257],
  [9907208,9902219,9902219],
  [9910208,9902259,9902259],
  [9911208,9902248,9902248],
  [9916208,9902296,9902296],
 ].map((enemies,index)=>{
  const kind=index%qinfeiFoods.length,level=Math.floor(index/qinfeiFoods.length);
  return [26300+index,{entries:[],label:'寝肥合战 · '+qinfeiFoods[kind],
   tierLabel:level?`普通第 ${level} 层`:'惊喜战斗',
   kind:'qinfeiFood',battleMode:qinfeiFoodMode,sceneId:40056+kind,foodId:900260+kind,level,archived:false,
   waves:[enemies.map((id,i)=>[qinfeiEnemySlots[level][i],id,40])]}];
 });
 const qinfeiArchivedFoods=[
  ['鱼',[9991219,9991208,9991208,9991208]],
  ['苹果',[9991237,9991232,9991232,9991232]],
  ['酒',[9991282,9991206,9991206,9991206]],
  ['肉',[9991290,9992290,9991207,9992290]],
 ];
 const qinfeiArchivedRoutes=[[25006,0],[25010,5],[6902011,0],[6902021,5]].flatMap(([first,rewardOffset])=>
  qinfeiArchivedFoods.map(([food,enemies],index)=>[first+index,{
   entries:[],label:'旧版寝肥 · '+food,tierLabel:'历史食材战',kind:'qinfeiFood',battleMode:qinfeiFoodMode,
   sceneId:40056+index,foodId:900260+index,rewardId:900260+index+rewardOffset,level:0,archived:true,
   waves:[enemies.map((id,slot)=>[slot+1,id,40])],
  }]));
 const qinfeiStaticStages=[25005,6902001,26325,501200];
 const qinfeiFoodMaxPiles=5;
 const qinfeiBoss={
  resourceVersion:'0.0.816',battleMode:320,stageId:25005,sceneId:40023,maxWindowSeconds:1200,codeStageId:101002,
  engine:{name:'QinfeiBossEngine',route:'qinfei-boss-personal-window',
   sha256:'de0dcf19c9b9a919c93a7a0d7e04b95cdec6057f51045751dd66e19880f09db0'},
  raidSHA256:'30dc30b76bb5948a2bf5cf4bee2a24a3b809d442bf1b33b5cccab51d0161e973',
  tableSHA256:{
   raid_info:'5d41d3fd6a4698df2ed3ff73a822334113074e1ecc6054f2825d251f1bc65837',
   boss_info:'c7f426bcd56624de40897fd02d856c14ecb9f0d798f6f6000c264905608e8cc5',
   pve_stage_data:tableSHA256.pve_stage_data,
   BattleMonstersInfo:tableSHA256.BattleMonstersInfo,
  },
  profiles:Object.fromEntries([[2,201,9991050,4],[3,202,9991051,4],[4,203,9991120,1],[5,204,9991120,1]]
   .flatMap(([raidId,bossId,enemyId,levels])=>Array.from({length:levels},(_,i)=>[
    [raidId,i+1],{raidId,difficulty:i+1,bossId,enemyId},
   ]))),
 };
 const stages=Object.fromEntries([...buildStages(bossRoutes,bossMode),...buildStages(sealRoutes,sealMode),
  ...buildStages(lbsRoutes,lbsMode),...buildStages(activityRoutes,lbsActivityMode),...historyStages,...nianRoutes,
  ...buildStages(meituanRoutes,meituanMode),...qinfeiFoodRoutes,...qinfeiArchivedRoutes]);
 const positions={2:[[5,6],[2,3,4]],3:[[3],[2,5],[4,6]]};
 const fiveSlots=[[2,3,4,5,6]],singleTeamModes=[nianMode,specialNianMode,meituanMode];
 const singlePositions={[lbsMode]:[[2,3,4]],[lbsActivityMode]:fiveSlots,[nianMode]:fiveSlots,[qinfeiFoodMode]:fiveSlots,
  [specialNianMode]:fiveSlots,[meituanMode]:fiveSlots};
 const worldBossEngine={name:'WorldBossEngine',sha256:'d11c14d3eb97e361bee50a58ac8666a56f3332b484e851a8dde36a80c7fe53b4'};
 const engines={
  [qinfeiFoodMode]:{name:'QinfeiBossFoodEngine',sha256:'ce5a64f1e5daf5ee6ba826066df856b70d14d45d4cf854d45659a7ba5bab768d'},
  [nianMode]:{name:'NormalLBSNianEngine',sha256:'294a00b948adb8855bf45e686b470ec987cd289b865a4c9dcdf9f1b5af8f4256'},
  [specialNianMode]:{name:'SpecialLBSNianEngine',sha256:'48a2b5ffb7dcc0feb1172c13023cf503ba131b1acb70c5a42d5a9acda5a4f9f5'},
  [meituanMode]:{name:'MTLBSBossEngine',sha256:'438bf4444da738e084f33dfe72a46c706945a840ffad2231d2e391e5124fe699'},
  [bossMode]:worldBossEngine,[sealMode]:worldBossEngine,
  [lbsMode]:{name:'LBSBossEngine',sha256:'045487760b52efb8c5f3157471c4cc8d21a3a3cb020fc1e11310cd4f17386a7d'},
  [lbsActivityMode]:{name:'LBSActivityBossEngine',sha256:'e5fceb3cace7a72b6b323b83db6cfafe6a5bfb4a1dce013a84388992b32b9062'},
 };
 const rules={resourceVersion:'0.0.816',battleModes:[bossMode,sealMode,lbsMode,lbsActivityMode,qinfeiFoodMode,...singleTeamModes],
  lbsMode,lbsActivityMode,qinfeiBoss,qinfeiFoodMode,qinfeiFoodMaxPiles,qinfeiFoodTableHash,qinfeiStaticStages,tableSHA256,stages,engines,
  qinfeiFoodChoices:route=>Object.entries(stages).filter(([,candidate])=>candidate.kind==='qinfeiFood'&&
   candidate.foodId===route.foodId&&candidate.archived===route.archived),
  archivedNianStages:[3340033,3340034],
  partyPositions:(mode,players)=>{
   if(players===1)return singlePositions[mode];
   if(Number.isSafeInteger(players)&&!singleTeamModes.includes(mode))return positions[players];
  },
 };
 if(typeof module==='object'&&module.exports)module.exports=rules;
 else root.AtlasMapBoss=rules;
})(typeof globalThis==='object'?globalThis:this);
