(function(root,factory){
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasFengmoLive=data;
})(globalThis,function(){
 'use strict';
 const resourceVersion='0.0.816';
 const tableSHA256={
  events:'256fa7c3c037ccca2f3e92472bc47752d08b26ea9872e82d4e7ee68b90ee6f79',
  event4:'bf89ef0a5ebf187735ce882feca38f18dad2f1c2fd34e20439e422d5b532de9f',
  event4_honor_limit:'323da7bc9e9faed77c41368c9922addc550c0f706bc3049890976d7f7d2ddf70',
  battle_mode_routes:'861d63b9444ad4f787b3984964b2d280f358bbed312fc5a04ea524e9e6c62d52',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  event4_timescore:'f09b2c35f6a73cf5cbe2b394b0769a4d08f11f6abbe9488e961dbab1eb2b0cd3',
  event4_rankscore:'752333370cb2fb639ff67bec486dad593a059c08dc13867dc023cd07960ee2d3',
 };

 // Event and code identities come from DuskConst.BossID and DuskLogic.add_ta_btn.
 const bosses=[
  {name:'土蜘蛛',eventId:40001,eventParam:1,sceneId:40005,
   normal:{stage:25001,rally:303,mode:3003,code:10020220,rule:'TUZHIZHU_TIPS'},
   extreme:{stage:25017,rally:316,mode:4440,code:10020221,rule:'TUZHIZHUJI_TIPS'}},
  {name:'胧车',eventId:40011,eventParam:11,sceneId:40010,
   normal:{stage:25002,rally:301,mode:3006,code:10020226,rule:'LONGCHE_TIPS'},
   extreme:{stage:25027,rally:342,mode:4443,code:10020229,rule:'LONGCHEJI_TIPS',ruleTable:'system_rule_dsc'}},
  {name:'荒骷髅',eventId:40021,eventParam:21,sceneId:40012,
   normal:{stage:25003,rally:302,mode:3012,code:10020222,rule:'HUANGKULOU_TIPS'},
   extreme:{stage:25018,rally:317,mode:4441,code:10020223,rule:'HUANGKULOUJI_TIPS'}},
  {name:'地震鲶',eventId:40031,eventParam:31,sceneId:40020,
   normal:{stage:25004,rally:311,mode:3014,code:10020224,rule:'DIZHENNIAN_TIPS'},
   extreme:{stage:45004,rally:318,mode:4442,code:10020225,rule:'DIZHENNIANJI_TIPS'}},
  {name:'蜃气楼',eventId:40041,eventParam:41,sceneId:40021,
   normal:{stage:25015,rally:322,mode:3013,code:10020218,rule:'SHENQILOU_TIPS'},
   extreme:{stage:25019,rally:319,mode:1024,team:1001,code:10020219,rule:'SHENQILOUJI_TIPS'}},
  {name:'鬼灵歌伎',eventId:40051,eventParam:51,sceneId:40065,
   normal:{stage:25016,rally:323,mode:3015,code:10020217,rule:'HUAKUI_TIPS'}},
  {name:'夜荒魂',eventId:40061,eventParam:61,sceneId:4002271,
   normal:{stage:25021,rally:324,mode:3017,code:10020227,rule:'YEHUANGHUN_TIPS'}},
 ];
 const coinConstants=[[228,'伤害金币系数'],[209,'金币奖励配置'],[3643,'同寮参战金币加成']];
 const rotationConstant=10631;
 const rotationSkills=[63402,63601,63404,63602,63405,63603,63406];
 const rotationTraits=['巧劲','异变·易碎','咒术','异变·猛火','狂风','异变·斗魂','疾行']
  .map((label,i)=>({id:rotationSkills[i],label}));
 const ref=(table,key,label)=>({table,key,label,found:true});
 const spiderNormal={
  stageId:25001,battleMode:3003,codeStageId:10020220,sceneId:40005,openingTarget:82,
  memberCount:5,windowLimit:3600,summonLimit:5,ratingThresholds:[0,30000,300000,800000,2000000],
  parts:[[1,81,'本体'],[2,82,'钳'],[3,83,'背'],[4,84,'脚']],
  spawns:{85:'小蜘蛛',86:'秘宝小纸人',87:'金色小蜘蛛'},
  engine:{name:'HHZSGveEngine',route:'spider-normal-local-team',
   sha256:'9d7119492ea6524c37a1f63fcc51a5d160d35d3579650ec7e3fec59428044cd5'},
  validSettings(settings){
   const {windowSeconds,weakPart}=settings??{};
   return Object.keys(settings??{}).length===2&&Number.isSafeInteger(windowSeconds)&&windowSeconds>=1&&windowSeconds<=this.windowLimit&&
    [0,2,3,4].includes(weakPart);
  },
 };
 const spiderLive={
  stageId:25017,battleMode:4440,codeStageId:10020221,sceneId:40005,openingTarget:250172,
  memberCount:5,windowLimit:3600,cocoonSeconds:60,defaultTrait:63402,
  traits:rotationTraits,
  parts:[[1,250171,'本体'],[2,250172,'钳'],[3,250173,'背'],[4,250174,'脚']],
  cocoons:[[6,250180],[7,250179],[8,250180]],
  engine:{name:'TuzhizhuXEngine',route:'spider-live-local-team',
   sha256:'af0d2b39ff63f6b8e5a36e9e1fe396435069f50c318b3b4a74d0060f924442ee'},
  validSettings(settings){
   const {windowSeconds,trait}=settings??{};
   return Object.keys(settings??{}).length===2&&Number.isSafeInteger(windowSeconds)&&windowSeconds>=1&&windowSeconds<=this.windowLimit&&
    this.traits.some(row=>row.id===trait);
  },
 };
 const longche={
  stageId:25002,battleMode:3006,codeStageId:10020226,sceneId:40010,boss:90,
  memberCount:5,windowLimit:1200,defaultWindow:1200,repairLimit:150,defaultRepairSeconds:30,defaultCommander:159,
  commanders:{151:'大天狗呱',152:'荒川呱',156:'酒吞呱',159:'青行呱'},
  clues:{151:121,152:122,156:126,159:129},
  phases:{slime:'地面交战',flee:'胧车升空',repair:'紧急修理',gift:'秘宝小纸人'},
  formations:{slime:[],flee:[[2,152],[4,159],[5,156],[6,151]],repair:[[7,91],[8,92]],gift:[[2,99],[4,99]]},
  engine:{name:'LongCheBossEngine',route:'longche-local-team',
   sha256:'5fe8e20a505c79306ab8c90f10295b3f472d64b3b55d5e5e80c55a7a2ced8067'},
  validSettings(settings){
   const {windowSeconds,repairSeconds,commanderId}=settings??{};
   const allowed=(value,limit)=>Number.isSafeInteger(value)&&value>=1&&value<=limit;
   return Object.keys(settings??{}).length===3&&allowed(windowSeconds,this.windowLimit)&&allowed(repairSeconds,this.repairLimit)&&
    Number.isSafeInteger(commanderId)&&Object.hasOwn(this.commanders,commanderId);
  },
 };
 const longcheRepairUnits=[[5,101],[6,103],[7,102],[8,104]];
 const longcheX={
  ...longche,stageId:25027,battleMode:4443,codeStageId:10020229,boss:100290,defaultCommander:99159,
  commanders:Object.fromEntries(Object.entries(longche.commanders).map(([id,name])=>[Number(id)+99000,name])),
  clues:Object.fromEntries(Object.entries(longche.clues).map(([id,clue])=>[Number(id)+99000,clue])),
  phases:{...longche.phases,repair_success:'金辉赐福'},
  formations:{...longche.formations,flee:longche.formations.flee.map(([pos,id])=>[pos,id+99000]),
   repair:longcheRepairUnits,repair_success:[]},
  repairNames:{101:'叮呱（红）',102:'咚呱（蓝）',103:'哐呱（红精英）',104:'锵呱（蓝精英）'},
  repairGroups:[[101,103],[102,104]],repairSlots:longcheRepairUnits.map(([pos])=>pos),
  defaultRepairOrder:longcheRepairUnits.map(([,id])=>id),repairThreshold:.3,
  absorptionNames:{417:'攻击增加',418:'防御增加'},
  traits:rotationTraits,defaultTrait:63402,weeklyDefault:480,weeklyLimit:1200,
  engine:{name:'LongCheXEngine',route:'longche-x-local-team',
   sha256:'a645028ed5310f722403dc76c148b9968f1fab4fc595ae5c72ef3045d12c2f83'},
  validSettings(settings){
   const {commanderId,trait,weeklySeconds,repairOrder,...room}=settings??{};
   return Number.isSafeInteger(commanderId)&&Object.hasOwn(this.commanders,commanderId)&&
    longche.validSettings({...room,commanderId:commanderId-99000})&&this.traits.some(row=>row.id===trait)&&
    Number.isSafeInteger(weeklySeconds)&&weeklySeconds>=1&&weeklySeconds<=this.weeklyLimit&&
    Array.isArray(repairOrder)&&repairOrder.length===this.repairSlots.length&&new Set(repairOrder).size===this.repairSlots.length&&
    Array.from(repairOrder).every(id=>Number.isSafeInteger(id)&&Object.hasOwn(this.repairNames,id));
  },
 };
 const skeleton={
  stageId:25003,battleMode:3012,codeStageId:10020222,sceneId:40012,boss:9991001,
  memberCount:5,windowLimit:1200,defaultWindow:600,positions:[2,3,4,5,6,7],defaultTruePositions:[2,3],
  phases:{normal:'开战',slimes:'首轮小怪',elite:'真假部下',papers:'秘宝小纸人',late:'末轮小怪'},
  formations:{normal:[],slimes:[[2,9991006],[3,9991003],[6,9991004],[7,9991005],[8,9991002]],
   elite:[[2,9991008],[3,9991009],[4,9991010],[5,9991011],[6,9991012],[7,9991013]],
   papers:[[3,9991017],[4,9991014],[5,9991015],[6,9991016]],
   late:[[3,9991018],[4,9991019],[5,9991020],[6,9991021],[8,9991022]]},
  engine:{name:'HuangKuLouEngine',route:'skeleton-local-team',
   sha256:'d680ad3efffd1cc59198eaa8e8d0e4868c7c7b897ad353e260430794bd992d92'},
  validSettings(settings){
   const {windowSeconds,truePositions}=settings??{};
   return Object.keys(settings??{}).length===2&&Number.isSafeInteger(windowSeconds)&&windowSeconds>=1&&windowSeconds<=this.windowLimit&&
    Array.isArray(truePositions)&&truePositions.length===2&&truePositions[0]!==truePositions[1]&&
    Array.from(truePositions).every(position=>this.positions.includes(position));
  },
 };
 const skeletonX={
  ...skeleton,stageId:25018,battleMode:4441,codeStageId:10020223,boss:9992001,defaultWindow:1200,
  traits:rotationTraits,defaultTrait:63402,weeklyDefault:480,weeklyLimit:1200,
  formations:Object.fromEntries(Object.entries(skeleton.formations).map(([phase,units])=>
   [phase,units.map(([pos,id])=>[pos,id+1000])])),
  paperFormations:[[[3,9992017],[4,9992014],[5,9992015],[6,9992016]],
   [[4,9992014],[5,9992015],[8,9992016]],[[4,9992014],[5,9992015]],[[9,9992015]],[[9,9992015]]],
  engine:{name:'HuangKuLouXEngine',route:'skeleton-x-local-team',
   sha256:'0b0e2d4b5c73eb1c76199213befa3ca7b61f694160d1d0c8627de56df1185b20'},
  validSettings(settings){
   const {windowSeconds,truePositions,trait,paperTier,weeklySeconds}=settings??{};
   const allowed=(value,limit)=>Number.isSafeInteger(value)&&value>=1&&value<=limit;
   return Object.keys(settings??{}).length===5&&skeleton.validSettings({windowSeconds,truePositions})&&
    this.traits.some(row=>row.id===trait)&&allowed(paperTier,this.paperFormations.length)&&allowed(weeklySeconds,this.weeklyLimit);
  },
 };
 const catfish={
  stageId:25004,battleMode:3014,codeStageId:10020224,sceneId:40020,boss:9991030,assist:9991041,
  fish:[[2,9991247],[3,9992247],[5,9993247],[6,9994247]],monkey:9991032,gate:9991031,
  memberCount:5,windowLimit:1200,defaultWindow:600,maxArmorStacks:99,maxOtherPlayers:299,gateSeconds:120,gateRate:.8,
  blessings:{512:'暴击增益',513:'速度增益',514:'攻击增益',515:'暴伤增益'},
  phases:{opening:'开战',normal:'海坊主与凝视',elite:'淘气的小猴子',flee:'鸟居',flip:'阻止冲天',boom:'冲天成功',peace:'首领回归'},
  engine:{name:'DiZhenNianEngine',route:'catfish-local-team',
   sha256:'f5c9488d8944fe249e72a63e383eddf3ed03fc68c2fc780d458911fcec8f14e0'},
  validSettings(settings){
   const {windowSeconds,armorStacks,otherPlayers,otherBreaks}=settings??{};
   const between=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
   return Object.keys(settings??{}).length===4&&between(windowSeconds,1,this.windowLimit)&&
    between(armorStacks,0,this.maxArmorStacks)&&between(otherPlayers,0,this.maxOtherPlayers)&&between(otherBreaks,0,otherPlayers);
  },
 };
 const catfishX={
  ...catfish,stageId:45004,battleMode:4442,codeStageId:10020225,boss:4991030,monkey:4991032,gate:4991031,
  fish:catfish.fish.map(([position,id])=>[position,id-5000000]),
  defaultWindow:1200,maxArmorStacks:10,traits:rotationTraits,defaultTrait:63402,weeklyDefault:480,weeklyLimit:1200,
  engine:{name:'DiZhenNianXEngine',route:'catfish-x-local-team',
   sha256:'a46ad3ff631d90ecfea5c8b3be592f6562d8f97f39401d693ddb4d07acff69bc'},
  validSettings(settings){
   const {trait,weeklySeconds,...room}=settings??{};
   return catfish.validSettings(room)&&room.armorStacks<=this.maxArmorStacks&&
    this.traits.some(row=>row.id===trait)&&Number.isSafeInteger(weeklySeconds)&&weeklySeconds>=1&&weeklySeconds<=this.weeklyLimit;
  },
 };
 const mirage={
  stageId:25015,battleMode:3013,codeStageId:10020218,sceneId:40021,boss:9991106,general:9991107,paper:9991112,
  memberCount:5,windowLimit:1200,defaultWindow:600,defaultGeneralSeconds:10,maxGeneralSeconds:120,
  positions:[2,3,4,5,6],defaultTruePositions:[2,3],burstSeconds:80,mirrorFallback:9991107,
  phases:{normal:'初始形态',elite:'蜃气楼大将',house:'秘宝小纸人',mirror:'海市蜃楼',burst:'蜃气勘破',crab:'蜃气楼上浮'},
  engine:{name:'ShenQiLouEngine',route:'mirage-local-team',
   sha256:'518b9c64884f989659ed828c66a397989958fc4e067e3c540799c5b87074f3dc'},
  validSettings(settings){
   const {windowSeconds,generalSeconds,truePositions}=settings??{};
   return Object.keys(settings??{}).length===3&&Number.isSafeInteger(windowSeconds)&&windowSeconds>=1&&windowSeconds<=this.windowLimit&&
    Number.isSafeInteger(generalSeconds)&&generalSeconds>=0&&generalSeconds<=this.maxGeneralSeconds&&
    Array.isArray(truePositions)&&truePositions.length===2&&truePositions[0]!==truePositions[1]&&
    Array.from(truePositions).every(position=>this.positions.includes(position));
  },
 };
 const mirageX={
  ...mirage,stageId:25019,battleMode:1024,codeStageId:10020219,boss:4991106,general:4991107,paper:4991112,
  defaultWindow:1200,traits:rotationTraits,defaultTrait:63402,weeklyDefault:480,weeklyLimit:1200,
  engine:{name:'ShenQiLouXBattleEngine',route:'mirage-x-local-team',
   sha256:'2823f01d5a8df937af882e1bcbab9fe58ebf12c3512193445fc88730e3bc5bf9'},
  validSettings(settings){
   const {trait,weeklySeconds,...phase}=settings??{};
   return mirage.validSettings(phase)&&this.traits.some(row=>row.id===trait)&&
    Number.isSafeInteger(weeklySeconds)&&weeklySeconds>=1&&weeklySeconds<=this.weeklyLimit;
  },
 };
 const songstress={
  stageId:25016,battleMode:3015,codeStageId:10020217,sceneId:40065,
  memberCount:6,windowLimit:1200,defaultWindow:600,
  singer:9991300,umbrella:9991301,paper:9991311,whiteMaids:[9991303,9991304,9991305],blackMaids:[9991308,9991309,9991310],
  phaseNames:['白衣侍女','黑衣侍女','救援歌伎'],
  engine:{name:'HuaKuiEngine',route:'songstress-local-team',
   sha256:'075c83107e6ad447a3901baf7710fa7292e2dea5431d1f15f50e6fdaa4007d00'},
 };
 const duskWraith={
  stageId:25021,battleMode:3017,codeStageId:10020227,sceneId:4002271,eliteSceneId:4002272,
  memberCount:5,windowLimit:1200,defaultWindow:600,
  elitePositions:[2,3,4,5,6],eliteIds:[993121,993122,993123,993124,993120],bossId:992119,giftId:993140,
  phaseNames:['初始形态','五位侍从','首领再现','真身'],
  engine:{name:'YeHuangHunEngine',route:'dusk-wraith-local-team',
   sha256:'74c392c2c01b5a79b45db5438a555c0f7d2d60c1aa2b50980c79889320a097ab'},
  validSettings(settings){
   const order=settings?.musicOrder,seconds=settings?.windowSeconds;
   return Object.keys(settings??{}).length===2&&Number.isSafeInteger(seconds)&&seconds>=1&&seconds<=this.windowLimit&&
    Array.isArray(order)&&order.length===this.elitePositions.length&&new Set(order).size===order.length&&
    order.every(position=>this.elitePositions.includes(position));
  },
 };

 function encounters(available){
  return bosses.flatMap(({name,eventId,eventParam,sceneId,normal,extreme})=>[normal,extreme].filter(Boolean).map(route=>{
   const hard=route===extreme, soil=eventId===40001;
   const table=hard?'event4_honor_limit':'event4',key=hard?{$tuple:[eventId,1]}:eventParam;
   const title=hard?`极·${name}`:`稀有·${name}`;
   if(!available.has(table))return null;
   const refs=[
    ref('events',eventId,'逢魔发现和轮换配置'),
    ref('battle_mode_routes',route.rally,'集结入口'),
    ...(route.mode?[ref('battle_mode_routes',route.mode,'战斗入口')]:[]),
    ref('pve_stage_data',String(route.stage),'客户端基础关卡'),
    ref('BattleMonstersInfo',route.stage,'客户端敌方编组'),
    ref('Combinesceneinfo',route.sceneId??sceneId,'基础战斗场景'),
    ref('team_assist_stage',route.code,'客户端阵容码目标'),
    ref(route.ruleTable??'tipsInfoData_cn',route.rule,'客户端玩法说明'),
    ...coinConstants.map(([id,label])=>ref('Constant',id,label)),
   ];
   if(route.stage===longche.stageId){
    refs.push(...[[100,'地面小呱太示例'],[200,'本地采用的升空精英编组'],[300,'红、蓝修理呱阵位'],[400,'修理中断的纸人编组']]
     .map(([id,label])=>ref('troops',{$tuple:[id,1]},label)),
     ...[3606,3619,3622,3625].map(id=>ref('Constant',id,'计时及修理规则')),
     ...[420,421,422,423,424,426,433,444].map(id=>ref('skill',{$tuple:[id,1,-1]},'原版阶段技能')),
     ...Object.keys(longche.commanders).map(id=>ref('Contrast',Number(id),'统帅与地面线索的对应关系')));
   }
   if(route.stage===longcheX.stageId){
    refs.push(...[[100,'地面小呱太示例'],[600,'本地采用的极版升空编组'],[500,'四只修理呱太'],[400,'打断维修后的纸人编组']]
     .map(([id,label])=>ref('troops',{$tuple:[id,1]},label)),
     ...[3592,3606,3611,3619,3621,3625,3633,3634,3635,3636,10900].map(id=>ref('Constant',id,'原版阶段和共血参数')),
     ref('skill',{$tuple:[420,2,-1]},'极版无限鬼爪'),
     ...[[428,'四只修理呱太及打断条件'],[429,'吸收修理呱太'],[430,'金辉赐福']].map(([id,label])=>ref('skill',{$tuple:[id,1,-1]},label)),
     ...[[417,'吸收哐呱后的攻击强化'],[418,'吸收锵呱后的防御强化']].map(([id,label])=>ref('buff',{$tuple:[id,1]},label)),
     ...Object.keys(longche.commanders).map(id=>ref('Contrast',Number(id),'统帅与地面线索的对应关系')));
   }
   if(route.stage===skeleton.stageId){
    refs.push(...[[100,'首轮小怪'],[200,'真假部下'],[300,'秘宝小纸人'],[400,'末轮小怪']].map(([id,label])=>ref('huangkulou_stage',{$tuple:[id,1]},label)),
     ...[3801,3802,3803].map(id=>ref('Constant',id,'阶段血线')),
     ...[480,483,484,486,487].map(id=>ref('skill',{$tuple:[id,1,-1]},'部下及阶段技能')),
     ...[1,2,3,4,5,6,7].map(id=>ref('monstertalk',id,'真假部下线索')));
   }
   if(route.stage===skeletonX.stageId){
    refs.push(...[[100,1,'首轮部下'],[200,1,'真假部下'],[400,1,'末轮部下'],
     ...skeletonX.paperFormations.map((_,i)=>[300,i+1,`秘宝纸人第 ${i+1} 档`])]
     .map(([state,id,label])=>ref('huangkuloux_stage',{$tuple:[state,id]},label)),
     ...[3801,3802,3803].map(id=>ref('Constant',id,'阶段血线')),ref('Constant',10900,'共享生命参考均时'),
     ...[479,480,483,484,486,487].map(id=>ref('skill',{$tuple:[id,[479,486].includes(id)?1:2,-1]},'极·荒骷髅阶段技能')),
     ...[1,2,3,4,5,6,7].map(id=>ref('monstertalk',id,'真假部下线索')));
   }
   if(route.stage===catfish.stageId){
    refs.push(...[[100,'海坊主祝福编组'],[300,'小猴编组'],[400,'鸟居编组'],[500,'击破鸟居后的纸人']].map(([id,label])=>ref('dizhennian_stage',{$tuple:[id,1]},label)),
     ...[[4151,'小猴和鸟居的首领血线'],[4152,'海坊主祝福效果'],[4155,'鸟居击破比例门槛'],[4156,'鸟居时限'],[4161,'妖琴师助战']].map(([id,label])=>ref('Constant',id,label)),
     ...[[520,'首领减伤层数'],[523,'小猴击退增益']].map(([id,label])=>ref('buff',{$tuple:[id,1]},label)));
   }
   if(route.stage===catfishX.stageId){
    refs.push(...[[100,'海坊主祝福编组'],[300,'极版小猴编组'],[400,'极版鸟居编组'],[500,'击破鸟居后的纸人']]
     .map(([id,label])=>ref('dizhennianx_stage',{$tuple:[id,1]},label)),
     ...[[4151,'小猴和鸟居的首领血线'],[4152,'海坊主祝福效果'],[4155,'鸟居击破比例门槛'],[4156,'鸟居时限'],
      [4161,'妖琴师助战'],[10900,'共享生命参考均时']].map(([id,label])=>ref('Constant',id,label)),
     ...[[70001,1,'皮糙肉厚'],[70001,2,'异变·斗魂的皮糙肉厚'],[70002,1,'小猴增伤']]
      .map(([id,level,label])=>ref('buff',{$tuple:[id,level]},label)),
     ref('skill',{$tuple:[44514,1,-1]},'皮糙肉厚移除后触发的首领技能'));
   }
   if(route.stage===mirage.stageId){
    refs.push(...[[1100,'大将召唤编组'],[1200,'秘宝小纸人编组'],[1300,'镜像共享生命模板']].map(([id,label])=>ref('dizhennian_stage',{$tuple:[id,1]},label)),
     ...[[4011,'镜像属性倍率'],[4012,'镜像属性修正'],[4013,'蜃气勘破时长'],[4021,'缺少镜像模板时的大将']].map(([id,label])=>ref('Constant',id,label)),
     ...[[750,'蜃气勘破效果'],[758,'海市蜃楼'],[759,'召唤及镜像流程']].map(([id,label])=>ref('skill',{$tuple:[id,1,-1]},label)));
   }
   if(route.stage===mirageX.stageId){
    refs.push(...[[1100,'极版大将召唤编组'],[1200,'极版秘宝小纸人编组'],[1300,'极版镜像共享生命模板']]
     .map(([id,label])=>ref('dizhennianx_stage',{$tuple:[id,1]},label)),
     ...[[4011,'镜像属性倍率'],[4012,'镜像属性修正'],[4013,'蜃气勘破时长'],[4021,'缺少镜像模板时的大将'],
      [10900,'共享生命参考均时']].map(([id,label])=>ref('Constant',id,label)),
     ...[[748,1,'极版钳击'],[750,1,'蜃气勘破'],[754,2,'极版蜃气爆弹'],[759,2,'极版召唤及镜像流程'],
      [760,1,'护盾存在时的钳鳌重击'],[761,1,'蜃雾笼罩'],[762,1,'蜃气升腾'],[770,2,'极版大将挥砍']]
      .map(([id,level,label])=>ref('skill',{$tuple:[id,level,-1]},label)),
     ...[[7591,'误杀镜像后的攻击强化'],[7592,'误杀镜像后的暴击抵抗'],[7611,'蜃雾护盾']]
      .map(([id,label])=>ref('buff',{$tuple:[id,1]},label)));
   }
   if(route.stage===songstress.stageId){
    refs.push(...songstress.blackMaids.map(id=>ref('monster',id,'第二阶段黑衣侍女')),
     ...[[774,'黑衣侍女余血惩罚'],[779,'原版阶段控制'],[783,'白衣侍女击败增益']].map(([id,label])=>ref('skill',{$tuple:[id,1,-1]},label)),
     ...[3628,3630,3631].map(id=>ref('Constant',id,'共享生命计算参数')));
   }
   if(route.stage===duskWraith.stageId){
    refs.push(ref('BattleMonstersInfo',25022,'五位侍从编组'),ref('Combinesceneinfo',duskWraith.eliteSceneId,'侍从战斗场景'),
     ref('monster',993125,'首领再现的小鬼'),ref('BattleMonstersInfo',25026,'真身纸人编组'),
     ...[3628,3630,3631].map(id=>ref('Constant',id,'共享生命计算参数')));
   }
   if(hard){
    refs.unshift(ref('event4',eventParam,'对应普通首领奖励配置'));
    refs.push(ref('battle_team_routes',route.team??route.mode,'客户端组队注册'),
     ref('Constant',rotationConstant,'极词条轮换池'),...rotationSkills.map(id=>ref('skill',{$tuple:[id,1,-1]},'极词条技能')));
   }
   if(soil&&!hard)refs.push(ref('Constant',231,'金色小蜘蛛概率'),
    ...[353,355,356].map(id=>ref('skill',{$tuple:[id,1,-1]},'原版部位、召唤与激怒技能')),
    ...Object.keys(spiderNormal.spawns).map(id=>ref('monster',Number(id),'原版召唤物')));
   if(hard&&soil)refs.push(ref('Constant',10639,'白茧剩余时限'),ref('Constant',10641,'白茧部位配置'),
    ...[63408,63409,63410,63411].map(id=>ref('skill',{$tuple:[id,1,-1]},'原版部位与召唤技能')),
    ...[250175,250176,250177,250178,250179,250180].map(id=>ref('monster',id,'原版召唤物')),
    ref('Constant',10760,'显示积分的最低伤害'),ref('Constant',10761,'极土蜘蛛评级门槛'));
   return {table,key,title:`逢魔实战 · ${title}`,family:'daily',kind:hard?'逢魔实战·极':'逢魔实战·普通',
    refs:refs.filter(({table:source})=>available.has(source)),
    fengmoLive:{eventId,eventParam,hard,soil,stage:route.stage,rally:route.rally,mode:route.mode}};
  })).filter(Boolean);
 }

 function ratingBands(event,extremeSoilBands,{hard,soil}){
  if(hard&&soil)return Array.isArray(extremeSoilBands)?extremeSoilBands.map((minimum,i)=>({grade:i+1,minimum})):[];
  if(!Array.isArray(event?.reward))return [];
  const first=soil?0:1;
  return event.reward.slice(first).map(([minimum],i)=>({grade:soil?i+1:i+2,minimum}));
 }

 const isLiveStage=stageId=>bosses.some(({normal,extreme})=>normal.stage===stageId||extreme?.stage===stageId);
 return {resourceVersion,tableSHA256,encounters,ratingBands,isLiveStage,duskWraith,songstress,mirage,mirageX,catfish,catfishX,skeleton,skeletonX,longche,longcheX,spiderLive,spiderNormal};
});
