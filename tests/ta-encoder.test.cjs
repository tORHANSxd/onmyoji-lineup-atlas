const {test}=require('node:test'),assert=require('node:assert/strict');
const codec=require('../desktop/ta-codec.cjs');
for(const vector of require('./fixtures/ta-vectors.json'))test('native requirements round-trip: '+vector.name,()=>{
 const original=codec.decodeLineupData(vector.payload,{yysIds:vector.yys_ids});
 const exported=codec.decodeLineupData(codec.encodeLineupData(original));
 assert.deepEqual(exported.hconf,original.hconf.map(({uid,...h})=>h));
});
test('V3 creation preserves skills, suit offsets, percentages and highest attributes',()=>{
 const hconf=[{hero_id:201,star:6,level:40,awake:1,skills:[[2011,5],[2012,3],[2013,1]],equip_info:{yuhun_lv:[15,15],yuhun_star:[6],criteria:7,two_suit:[],suit:[[300048,4],[300074,2]],limit:{spd:[180,190],critical_rate:[100,100]},main_attr:{'1':['spd'],'3':['atk_per'],'5':['critical_pow']}},highest_limit:['spd'],not_calc_flag:0,use_score:0}];
 const text=codec.encodeLineupData({title:'速度队',hconf});
 const decoded=codec.decodeLineupData(text);
 assert.equal(decoded.ver,3);assert.equal(decoded.title,'速度队');
 assert.deepEqual(decoded.phconf[0],[201,6,40,1,[5,3,1],[1,1,7,[],[[48],[74]],[0,[100,100],0,0,0,0,[180,190],0,0],[[3],[0],[2]]],0,[6],null,0]);
 assert.deepEqual(decoded.hconf[0].equip_info.limit,{critical_rate:[100,100],spd:[180,190]});
 assert.ok(!('player_id' in decoded));assert.ok(!('huids' in decoded));
});
test('invalid export cannot silently lose unsupported or contradictory constraints',()=>{
 for(const equip_info of [{yuhun_lv:[10,15]},{suit:[[300048,4],[300074,4]]},{limit:{spd:[200,100]}},{criteria:77}])assert.throws(()=>codec.encodeLineupData({hconf:[{hero_id:201,equip_info}]}));
});
test('one-sided native bounds and multiple two-piece suits survive creation',()=>{
 const equip_info={suit:[[300001,2],[300002,2],[300003,2]],limit:{spd:[180,-1],critical_rate:[null,100]}};
 const result=codec.decodeLineupData(codec.encodeLineupData({hconf:[{hero_id:201,equip_info}]}));
 assert.deepEqual(result.hconf[0].equip_info.suit,equip_info.suit);
 assert.deepEqual(result.hconf[0].equip_info.limit,{critical_rate:[-1,100],spd:[180,-1]});
 for(const value of [[-2,100],[200,100],[Infinity,100]])assert.throws(()=>codec.encodeLineupData({hconf:[{hero_id:201,equip_info:{limit:{spd:value}}}]}));
});
test('only a matching official share response can associate a short key',()=>{
 const code=codec.encodeLineupData({title:'新阵容',hconf:[{hero_id:201}]});
 const response={err:0,share_key:'official-test-key',lineup_data:code.slice(4)};
 assert.equal(codec.verifyShareResponse(code,response),'|TA|official-test-key');
 assert.throws(()=>codec.verifyShareResponse(code,{...response,lineup_data:codec.encodeLineupData({title:'别的阵容',hconf:[{hero_id:201}]})}),/不一致/);
 assert.throws(()=>codec.verifyShareResponse(code,{...response,share_key:'bad key'}));
 assert.throws(()=>codec.verifyShareResponse(code,{...response,err:12}));
});

test('game export rejects the user QR with a missing native stage',()=>{
 const png=require('pngjs').PNG.sync.read(require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/ta-missing-stage.png')));
 const text=require('jsqr')(new Uint8ClampedArray(png.data),png.width,png.height).data;
 const input=codec.decodeLineupData(text),catalog=require('../data/bundle.json');
 assert.equal(input.title,'我的阵容');assert.equal(input.select_stage_id,undefined);
 assert.throws(()=>codec.validateGameLineup(input,catalog),/副本/);
 const G=require('../app/game-config.js');
 const incomplete={...input,select_stage_id:catalog.stageCatalog.scenes[0].gameSceneId};assert.throws(()=>G.validate(catalog.gameConfig,incomplete),/位置/);
 const valid={...incomplete,hconf:G.slots(catalog.gameConfig,incomplete.select_stage_id).map(kind=>G.defaultMember(catalog.gameConfig,kind==='onmyoji'?10:222))};
 assert.doesNotThrow(()=>codec.validateGameLineup(valid,catalog));
 const decoded=codec.decodeLineupData(codec.encodeLineupData(valid));
 assert.equal(decoded.select_stage_id,valid.select_stage_id);
 assert.doesNotThrow(()=>codec.validateGameLineup(decoded,catalog));
 assert.throws(()=>codec.validateGameLineup({...valid,select_stage_id:2147483647},catalog),/副本/);
 assert.throws(()=>codec.validateGameLineup({...valid,hconf:valid.hconf.map((h,i)=>i===1?{...h,hero_id:999999}:h)},catalog),/成员/);
 assert.throws(()=>codec.validateGameLineup({...valid,hconf:valid.hconf.map((h,i)=>i===1?{...h,equip_info:{suit:[[399999,4]]}}:h)},catalog),/御魂/);
});
