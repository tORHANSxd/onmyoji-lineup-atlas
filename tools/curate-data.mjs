// Explicit transcription of factual requirements from linked public sources.
// No member is inferred from a short code. Null means the source did not say.
import fs from 'node:fs/promises';
const sources=JSON.parse(await fs.readFile('data/web-sources.json','utf8'));
const roster=JSON.parse(await fs.readFile('data/roster.json','utf8'));
const out=[];
const gt=value=>({value,exclusive:true}),lt=gt;
const config=(suits=[],ranges=[],metricId=null,mainStats={})=>({suitRequirements:suits.map(([name,count])=>({name,count})),suitSelectionComplete:true,ranges:ranges.map(([stat,min,max=null,percentage=false])=>({stat,min:typeof min==='object'&&min?min.value:min,max:typeof max==='object'&&max?max.value:max,minExclusive:min?.exclusive||false,maxExclusive:max?.exclusive||false,percentage})),metricId,targetScore:null,mainStats,scope:'all',excludeOccupied:false});
const m=(name,notes='',c=null,extra={})=>({kind:'shikigami',name,awakening:null,skills:null,notes,config:c,...extra});
const y=(name='阴阳师（未指定）',notes='来源没有给出身份或技能等级')=>({kind:'onmyoji',name,notes,awakening:null,skills:null});
const dmg=(set,second)=>config([[set,4],...(second?[[second,2]]:[])],[['crit',100,null,true]],1);
function add(bv,key,title,dungeon,members,notes='',extra={}){
 const s=sources.find(x=>x.bvid===bv);if(!s)throw Error('Missing source '+bv);
 for(const a of members)if(a.kind==='shikigami'&&!a.name.startsWith('未指定')&&!roster.some(r=>r.name===a.name))throw Error('Unverified name '+a.name);
 out.push({id:'reference-'+key,title,dungeon,sourceKind:'web-reference',sourceUrl:s.url,author:s.author,date:s.publishedAt,memberSource:'source-description',members,notes,requirementsComplete:false,decodeState:'reference',warnings:['成员和条件整理自攻略文字，并非阵容码解码结果；速度为原作者报告，未作游戏实测。','未列出的技能、觉醒与数值条件保持未知。'],...extra});
}
const yin=()=>m('因幡辉夜姬','散件，计算暴击伤害',config([],[],9));
const yue=()=>m('不见岳','散件，计算防御',config([],[],6));
add('BV18k4y1p7D9','explore-14','契灵探查 · 14秒高配','契灵探查',[
 m('久次良','速攻攻；锁三技能',config([['遗念火',4]],[['speed',gt(240)]],5,{2:['speed'],4:['attackPercent'],6:['attackPercent']})),
 m('山兔','速攻攻；锁二技能；速度位于240与SP蛇之间',config([['遗念火',4]],[],5)),
 m('因幡辉夜姬','攻攻爆伤，无暴击要求；锁二技能',config([['火灵',4]],[],9)),
 m('神堕八岐大蛇','满暴伤害指标；需压面板，不应直接打死小怪。参考输出26200，非下限。',dmg('破势','荒骷髅')),
 m('炼狱茨木童子','攻攻爆伤，满暴伤害指标',dmg('海月火玉','荒骷髅')),y()],
 '顺序：久次良 > 240 > 山兔 > 神堕八岐大蛇 > 因幡辉夜姬 > 炼狱茨木童子 > 128。其余妖术；取得火灵契灵后可调整因幡到尾速，原文称可缩短到12秒。');
add('BV18k4y1p7D9','explore-44','契灵探查 · 四山兔与季','契灵探查',[
 m('山兔','一号兔，速XX，锁二',config([['遗念火',4]],[['speed',gt(240)]])),
 m('山兔','二号兔，速XX，锁二',config([['遗念火',4]])),
 m('季','攻攻爆伤，不需要暴击，伤害指标',config([['狂骨',4],['鬼灵歌伎',2]],[],1)),
 m('山兔','三号兔，锁二',config([['火灵',4]])),m('山兔','四号兔，锁二',config([['遗念火',4]])),y('晴明','携带盾，锁盾')],
 '顺序：兔1 > 240 > 兔2 > 季 > 兔3 > 128 > 兔4。需要四个不同山兔实例。原文报告44秒。');
for(const seconds of [51,48])add('BV1Qh4y1G7ji','ciqiu-'+seconds,'契灵茨球 · '+seconds+'秒参考','契灵 · 茨球',[
 m('铃鹿御前','51秒：贝吹坊蜃气楼，速攻爆/速抗爆；48秒改为速抗生/速抗爆。锁二技能',config([['贝吹坊',4],['蜃气楼',2]],[['speed',gt(180)]])),
 m('因幡辉夜姬','XX爆伤，锁二技能',config([['火灵',4]])),
 seconds===51?m('缘结神','招财蜃气楼，生生爆',config([['招财猫',4],['蜃气楼',2]])):m('不见岳','尾速散件，防防防',config([],[],6)),
 m('丑时之女','隐念荒骷髅，X命X',config([['隐念',4],['荒骷髅',2]])),
 m('须佐之男','隐念荒骷髅或海月荒骷髅，攻攻爆；数值下限未提供',dmg('隐念','荒骷髅')),y('晴明','星、盾，妖术')],
 '51秒顺序：铃鹿 > 180 > 因幡 > 缘结神 > 丑女 > 晴明 > 须佐。48秒不见岳放尾速。作者提醒需要命中与输出面板，并建议茨球三星三灭等技能。',
 {alternatives:'51秒方案将缘结神替换为不见岳可转48秒方案；铃鹿要同时改为抵抗配置。不见岳防防防散件、尾速。须佐可改海月荒骷髅。'});
add('BV1U841167VH','snake-amaterasu','真·八岐大蛇 · 天照与阿修罗','真·八岐大蛇',[
 m('鬼王酒吞童子','速度超过210；未提供御魂细节',config([],[['speed',gt(210)]])),
 m('天照','隐念/海月/镇墓兽 + 歌伎；速或攻、攻、爆',null),
 m('阿修罗','荒骷髅、歌伎、蜃气楼三套两件，攻攻爆满暴',config([['荒骷髅',2],['鬼灵歌伎',2],['蜃气楼',2]],[['crit',100,null,true]],1)),
 m('因幡辉夜姬','火灵爆伤套',config([['火灵',4]],[],9)),yue(),
 m('不知火','蚌精生生爆满暴；治疗指标',config([['蚌精',4]],[['crit',100,null,true]],10)),y('晴明','需要火灵契灵，否则阿修罗可能断火')],
 '本玩法来源列出六个式神，保留六式神加晴明，未强行截成五个。配速：吞 > 210 > 天照 > 175 > 阿修罗 > 140 > 晴明 > 因岳离。天照和修的额外爆伤填因幡爆伤×0.3，额外攻击填不见岳防御÷2.8。依赖队友面板的加成没有擅自填成固定值。');
for(const boss of [false,true])add('BV1Cs4y1c7S7','liudao-'+(boss?'boss':'clear'),'六道真言塔 · '+(boss?'首领阶段':'清怪阶段'),'六道之门',[
 m('八岐大蛇','一速，二技能妖术；强身印记',config([],[['speed',272]])),
 m('神堕八岐大蛇','伤魂鸟土蜘蛛；攻攻爆伤满暴；破军印记',dmg('伤魂鸟','土蜘蛛')),
 m('因幡辉夜姬','火灵攻攻爆伤；爆伤印记；锁二',config([['火灵',4]],[],9)),
 ...(boss?[m('千姬','散件或涂佛攻攻攻，秘法印记必须',config([],[],5)),m('蝎女','散件攻攻攻，格挡印记',config([],[],5))]:[m('季','荒骷髅、土蜘蛛、歌伎；攻攻爆伤，神宴印记',config([['荒骷髅',2],['土蜘蛛',2],['鬼灵歌伎',2]],[],9)),m('不见岳','防防防，格挡印记',config([],[],6))]),
 m('未指定系统式神','使用本关提供的系统式神，锁普攻')],
 '真言塔专用。炽焚天火需5级，六道奔袭与突击至少3级；秘宝包含真言咒，变呱旗帜可勉强替代。清怪标记SP蛇；首领按千姬→蝎女→SP蛇调整标记并连续使用秘宝。源文配速与全部操作请打开来源核对。系统技能与印记不当作式神技能ID。');
add('BV1dy421b7A7','gap-sp-sen','狭间精英 · SP千姬全自动','狭间暗域',[
 m('天照','隐念土蜘蛛，满暴输出',config([['隐念',4],['土蜘蛛',2]],[['speed',135],['crit',100,null,true]],1)),
 m('帝释天','贝吹坊荒骷髅，满暴攻击；速度高于天照',config([['贝吹坊',4],['荒骷髅',2]],[['crit',100,null,true]],5)),
 m('伊邪那美','元兴寺荒骷髅，满暴输出；速度大于帝释天，攻击不超过帝释天',dmg('元兴寺','荒骷髅')),
 m('鲸汐千姬','散件满暴输出；攻击不超过帝释天，额外120爆伤',config([],[['speed',114.1,119],['crit',100,null,true]],1)),
 m('因幡辉夜姬','火灵爆伤，速度不超过128',config([['火灵',4]],[['speed',null,128]],9)),y()],
 '来源报告易难度精英约1分2秒，四区域可用。帝释天与天照的速度关系、伊邪那美和鲸汐千姬的攻击上限取决于队友面板，需另核对。');
// Remaining broad coverage uses explicit names and textual conditions when the
// original numerical convention or alias could not be fully verified.
add('BV1t5V46REYw','gold-snow','金币妖怪 · 雪童子17秒','金币妖怪',[
 m('不见岳','涂佛土蜘蛛'),m('丑时之女','片叶之苇荒骷髅'),m('铁鼠','雪幽魂；锁三技能'),
 m('雪童子','片叶之苇或鸣屋；可补命中减少铁鼠漏控损失'),m('因幡辉夜姬','火灵，尾速'),y('神乐','锁疾风')],
 '顺序：岳 > 丑女 > 铁鼠 > 雪童子 > 神乐 > 因幡。来源报告17秒与1600万伤害，不是库存计算的通过阈值。',
 {code:'|TA|de36ed4dd790f6b7e9356c5f88b3e768',alternatives:'雪童子可以在片叶之苇与鸣屋之间选；原文建议面板接近时优先片叶之苇。鸣屋方案原码另行保留。'});
add('BV1hyq1B6E7T','experience-himiko','经验妖怪 · 卑弥呼和平将门','经验妖怪',[
 m('卑弥呼','散件算速度，需套圈神乐或神乐后首个式神',config([],[['speed',gt(256)]],7)),
 m('平将门','海月/片叶/隐念荒骷髅，超星满暴输出；全队攻击最高、生命最低'),yin(),m('云间不见岳','火灵算防御，速度低于128',config([['火灵',4]],[['speed',null,lt(128)]],6)),
 m('食灵','满足平将门条件下穿御魂，速度低于128',config([],[['speed',null,lt(128)]])),y('神乐','疾风')],
 '卑弥呼 > 256（或神乐后首个式神速度的两倍）> 平将门 > 神乐 > 因幡/SP岳/食灵。五波共30只怪；配速与全队最高/最低条件需要另外核对。',
 {code:'|TA|d39176b5ee487d0cbc356417b87e6460'});
add('BV1x6TF6hEEc','moon-ibaraki','契灵月魔兔 · 思铃茨9至10秒','契灵 · 月魔兔',[
 m('铃彦姬','钓瓶火土蜘蛛；速度超过195'),m('炼狱茨木童子','片叶之苇荒骷髅，速度高于176.6；生命最低、攻击最高'),yue(),
 m('云间不见岳','片叶之苇荒骷髅，防御输出指标'),m('思金神','歌伎土蜘蛛；不带荒骷髅，压攻击避免击杀小怪，生命需能被SP岳一次奶满'),y('阴阳师（未指定）','针女契灵')],
 '茨林所需速度随铃彦姬变化：144×铃彦姬速度÷（铃彦姬速度−36）。全队血量和攻击关系不能仅靠单体分数判断。');
add('BV1WWjw6pE3u','moon-low','契灵月魔兔 · 思铃茨12秒','契灵 · 月魔兔',[
 m('铃彦姬','钓瓶火荒骷髅，速度高于180'),m('炼狱茨木童子','海月荒骷髅，速度在128之上'),m('思金神','尾速，生命指标'),yue(),m('云间不见岳','片叶之苇荒骷髅'),y('源博雅','薙魂契灵')],
 '铃彦姬 > 180 > 茨林 > 128 > 源博雅，思金神尾速。作者另提到茨林面板足够时可调整到142以上并换源赖光；属于另一个配置条件。');
add('BV1ykytBYEyz','nagi-vampire','契灵薙魂 · 吸血姬12至16秒','契灵 · 薙魂',[
 m('丑时之女','破势荒骷髅；46号位及技能无要求',config([['破势',4],['荒骷髅',2]],[['speed',gt(180)]])),
 m('伊邪那美','散件，技能最低151'),m('吸血姬','镇墓兽输出，515；全队攻击最高，血防需让首领打到半血以下。额外220爆伤、50%攻击'),
 m('因幡辉夜姬','散件350爆伤，技能最低151',config([],[['critDamage',350,null,true]],9)),m('鬼王酒吞童子','散件，技能111即可'),y('源赖光','三鬼神契灵')],
 '丑女 > 180 > 伊邪那美 > 吸血姬 > 因幡 > 酒吞。技能简称保留文字，因为未取得可靠技能ID顺序映射。',
 {alternatives:'吸血姬伤害不足时，可将鬼吞提前并携带涂佛；配速随之调整，未做成自动替换。'});
add('BV1gzgLzMEmT','fire-20','契灵火灵 · 20秒参考','契灵 · 火灵',[
 m('流光追月神','钓瓶火土蜘蛛'),m('初音未来','钓瓶火，速度超过239'),m('丑时之女','心眼荒骷髅，攻击指标，生命超过15500',config([['心眼',4],['荒骷髅',2]],[['hp',gt(15500)]],5)),
 m('晨晖惠比寿','隐念；须慢于源赖光、高于115'),m('须佐之男','纯镇墓兽满暴输出；额外属性100%攻击',dmg('镇墓兽')),y('源赖光','茨球或镇墓兽，三鬼神之策')],
 'SP追月 > 初音 > 239 > 丑女 > 源赖光 > SP惠比寿 > 115 > 须佐。丑女攻击+2894.4 > 须佐攻击+4154。来源没有给出须佐下限。');
const groups=[['explore-9','契灵探查 · 9秒镰鼬天照','契灵探查',['镰鼬','天照','炼狱茨木童子','因幡辉夜姬','不见岳']],['explore-10','契灵探查 · 10秒山兔天照','契灵探查',['山兔','天照','炼狱茨木童子','因幡辉夜姬','不见岳']],['explore-13','契灵探查 · 13秒天照伊邪那美','契灵探查',['山兔','天照','伊邪那美','因幡辉夜姬','不见岳']],['tomb-14','契灵镇墓兽 · 吃星双须佐14秒','契灵 · 镇墓兽',['须佐之男','须佐之男','因幡辉夜姬','不见岳','鬼王酒吞童子']],['fire-46','契灵火灵 · 季追月三兔46秒','契灵 · 火灵',['追月神','季','山兔','山兔','山兔']],['ciqiu-sacrifice','契灵茨球 · 献祭流39至43秒','契灵 · 茨球',['帝释天','蝎女','夜溟彼岸花','骁浪荒川之主','入内雀']]];
for(const [key,title,dungeon,names]of groups)add('BV1La4y1f7CY',key,title,dungeon,[...names.map(n=>m(n)),key==='tomb-14'?y('晴明','来源标注吃星'):y()], '源文明确列出成员，但详细御魂与技能在视频中，当前没有逐帧核验。历史参考，未称为当前最优。');
add('BV1Tw411z7KG','snake-ibaraki','真蛇 · 伊邪那美与茨林','真·八岐大蛇',[
 m('山兔','火灵拉条，165至210速之间'),m('炼狱茨木童子','镇墓兽荒骷髅，满暴输出，速度高于140；攻击需全队最高',dmg('镇墓兽','荒骷髅')),yin(),yue(),m('伊邪那美','蚌精，生生爆/暴满暴，治疗指标'),m('鬼王酒吞童子','可以不带御魂'),y('阴阳师（未指定）','不要带火灵契灵')],
 '茨林原文参考36900镇荒，为包含因岳与毁灭后的指标。额外爆伤=因幡爆伤×0.3+56（因幡达到380时可用170），额外攻击=岳防御÷2.8。保留六式神队列。',
 {alternatives:'拉条位可换食发鬼、空相面灵气、久次良或未觉醒镰鼬；原文要求仍在165到210速之间。换天照能降低输出需求，但未提供独立完整配置。'});
add('event-qimian','event-hard-budget','拾光永恒 · 困难23至27秒参考','拾光永恒',[
 m('食灵'),m('丑时之女'),m('铁鼠'),m('封阳君'),m('孔雀明王'),y()],
 '来源列为困难中低配，完整御魂参数尚未取得。活动增益与配速需要按原攻略核对。',
 {code:'|TA|057b4c1be7e8567461f67b522108775e',category:'限时活动'});
const unknown=(n)=>Array.from({length:n},(_,i)=>m('未指定成员'+(i+1),'攻略未给出身份，不能据简称补全'));
add('event-qimian','event-short-top','拾光永恒 · 短线3至4秒石卑食','拾光永恒',[m('石长姬'),m('卑弥呼'),m('食灵'),...unknown(2),y()],
 '原文只给出石卑食三个简称。其余成员、游戏槽位、技能、御魂与增益条件尚未核实。',
 {code:'|TA|e43922d92d24988ffe4e54d9ce618326',category:'限时活动'});
add('event-qimian','event-hard-top','拾光永恒 · 困难16秒卑丑石','拾光永恒',[m('卑弥呼'),m('丑时之女'),m('石长姬'),...unknown(2),y()],
 '原文标注困难高配，并只给出三个成员简称。其余成员、御魂要求和活动增益未取得。',
 {code:'|TA|b962bca949901e66a83903b4b4eade44',category:'限时活动'});
add('event-jiuyou','event-borrow','拾光永恒 · 铁鼠三狗粮借须佐','拾光永恒',[m('铁鼠'),m('未指定狗粮1'),m('未指定狗粮2'),m('未指定狗粮3'),m('须佐之男','来源要求借用协战，借用可用性需自行确认',null,{borrowed:true}),y()],
 '攻略报告短线5至6秒。三个狗粮没有指定式神类型，不能自动当作三个奉为达摩。协战的技能、御魂与可借状态未提供。',
 {code:'|TA|d624aa1cf0e13f7a2fca448bd2315cf0',category:'限时活动'});
add('BV1Rv41137hX','souls-15','魂土 · 双修食灵饭笥15秒','悲鸣 / 魂土',[
 m('阿修罗','一速狂骨荒骷髅或狂骨歌伎；速度大于158；无座敷时狂荒参考19779.29、狂歌21757.22',config([['狂骨',4],['荒骷髅',2]],[['speed',gt(158)]],1)),
 m('阿修罗','二速补刀，速度大于155；心眼歌伎/狂骨歌伎/散件歌伎。作者使用心歌17000。'),
 m('饭笥','狂骨歌伎，作者参考17000、199爆伤；爆伤升高时不能直接沿用同一面板阈值。'),m('食灵','111技能可用；全队需一个火灵。'),m('未指定狗粮1'),y('晴明')],
 '一修 > 158 > 二修 > 155 > 晴明 > 饭笥、食灵、狗粮。以上为2021年历史方案；单体面板分数不能替代回合外伤害与歌伎收益判断。',
 {alternatives:'二号阿修罗可改烬天玉藻前、弈等多段补刀；主输出足够时可心眼荒骷髅山风普攻补刀。替换者没有统一下限。狗粮换座敷会降低一修要求，但需另配火量和速度。'});
await fs.writeFile('data/curated-lineups.json',JSON.stringify(out,null,2));
const sourceUrl='https://yys.163.com/news/update/20260908/23024_1313394.html';
await fs.writeFile('data/events.json',JSON.stringify([
 {title:'拾光永恒 · 巡于黄金之河 / 虚无精锐',start:'2026-09-09',end:'2026-09-29',battle:true,sourceUrl,notes:'国服正式服9月9日维护后至9月29日23:59，15级开放。包括探索、亘地回响派遣以及虚无精锐简单/困难循环挑战。'},
 {title:'拾光永恒 · 炼石成金',start:'2026-09-16',end:'2026-09-19',battle:true,sourceUrl,notes:'9月16日10:00至9月19日23:59。截止9月12日尚未开放；不能当作当日可打的首领。'}
],null,2));
console.log(JSON.stringify({structuredReferences:out.length}));
