const {test}=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {encode,ExtData}=require('@msgpack/msgpack');
const TA=require('../desktop/ta-codec.cjs');
const C=require('../app/core.js');
const vectors=require('./fixtures/ta-vectors.json');
const bundle=require('../data/bundle.json');
function pack(entries){return zlib.deflateSync(Buffer.concat([Buffer.from([0x80+entries.length]),...entries.flatMap(([k,v])=>[Buffer.from(encode(k)),Buffer.from(encode(v))])])).toString('base64');}
test('客户端 ObjectId 二进制与24位大小写文本等价，保持成员UID与配置',()=>{
 const hex='0123456789abcdefaabbccdd',phconf=vectors.find(v=>v.name==='apk_sample_v3').expected.phconf;
 const payload=bytes=>pack([[1,3],[2,phconf],[5,[new ExtData(42,bytes)]],[8,new ExtData(42,bytes)]]);
 const expected=TA.decodeLineupData(payload(Buffer.from(hex,'hex')));
 for(const text of [hex,hex.toUpperCase()]){const result=TA.decodeLineupData(payload(Buffer.from(text)));assert.deepEqual(result,expected);assert.equal(result.hconf[0].uid,hex);}
 for(const bytes of [Buffer.from('z'.repeat(24)),Buffer.from('a'.repeat(23)),Buffer.alloc(24,0xe1),Buffer.alloc(24,0xb1)])assert.throws(()=>TA.decodeLineupData(payload(bytes)),/ObjectId/);
});
test('服务器错误区分暂时失败、过期、未知，不解码错误响应中的伪造内容',()=>{
 for(const [err,kind] of [[90011,'retry-later'],[31279,'expired-code'],[17,'server-error']]){
  const result=TA.decodeInput({err,share_key:'key',code:'|TA|key',queryAttempts:3,lineup_data:'not a payload'});
  assert.equal(result.state,'lookup-failed');assert.equal(result.failure.kind,kind);assert.equal(result.failure.serverCode,err);assert.equal(result.failure.attempts,3);assert.equal(result.data,undefined);
 }
 assert.equal(TA.decodeInput({err:false,share_key:'key'}).state,'invalid-payload');
 assert.equal(TA.decodeInput({err:90011,share_key:'other',code:'|TA|key'}).state,'invalid-payload');
});
for(const v of vectors)test('APK 原函数参考结果：'+v.name,()=>assert.deepEqual(TA.decodeLineupData(v.payload,{yysIds:v.yys_ids}),v.expected));
test('自创二维码与裸 lineup_data 得到相同内容',()=>{assert.deepEqual(TA.decodeLineupData('#TA#'+vectors[0].payload),vectors[0].expected);assert.equal(TA.decodeInput(vectors[0].payload).code,'#TA#'+vectors[0].payload);});
test('文字码按不透明分享键分流，不尝试本地解密',()=>{const r=TA.decodeInput(' |TA|opaque_key-1 ');assert.equal(r.state,'lookup-required');assert.deepEqual(r.lookup,{method:'lineup_assisant_logic.get_share_lineup_data',parameters:{share_key:'opaque_key-1'},iscache:false});for(const s of ['|TA|','|TA|abc text','|TA|a|TA|b'])assert.equal(TA.decodeInput(s).ok,false);});
test('服务器响应关联原始短码且拒绝失败和错配',()=>{const r=TA.decodeInput({err:0,share_key:'key1',lineup_data:vectors[0].payload});assert.equal(r.ok,true);assert.equal(r.code,'|TA|key1');assert.deepEqual(r.data,vectors[0].expected);for(const x of [{err:7,lineup_data:vectors[0].payload},{err:0,share_key:'key1',code:'|TA|key2',lineup_data:vectors[0].payload},{err:0}])assert.equal(TA.decodeInput(x).ok,false);});
test('官方二维码编号明确返回需要配置，不伪造成员',()=>{const r=TA.decodeInput('#TA#12345');assert.equal(r.state,'official-id');assert.equal(r.officialId,'12345');assert.equal(r.data,undefined);});
test('未知版本、字符串字段键、错位槽位与过多UID拒绝',()=>{for(const entries of [[[1,4]],[[1,true]],[[99,[]]],[['ver',3]],[[1,3],[2,[[556]]]],[[1,3],[2,[]],[5,['excess']]]])assert.throws(()=>TA.decodeLineupData(pack(entries)));});
test('截断、尾随数据、无效Base64和解压炸弹均受限制',()=>{const compressed=Buffer.from(vectors[0].payload,'base64');for(const input of ['','***',Buffer.from('not zlib').toString('base64'),compressed.subarray(0,-2).toString('base64'),Buffer.concat([compressed,Buffer.from('tail')]).toString('base64')])assert.throws(()=>TA.decodeLineupData(input));assert.throws(()=>TA.decodeLineupData(pack([[1,3],[2,[]],[3,'a'.repeat(10000)]]),{maxUncompressed:256}),/限制/);});
test('V0 空配置需要明确角色分类，默认版本保持V0',()=>{const p=pack([[1,0],[2,[[10,null,null,null,null,null]]]]);assert.throws(()=>TA.decodeLineupData(p),/V0/);assert.deepEqual(TA.decodeLineupData(p,{yysIds:[10]}).hconf,[{hero_id:10}]);assert.deepEqual(TA.decodeLineupData(pack([[2,[]]])).hconf,[]);});
test('BSON扩展保持精度与内容，可安全保存JSON',()=>{const data=TA.decodeLineupData(pack([[1,3],[2,[]],[8,new ExtData(42,Uint8Array.from({length:12},(_,i)=>i))],[3,new ExtData(43,Buffer.from('2026-09-12-12-34-56-123456'))],[4,new ExtData(44,Buffer.from('example'))]]));assert.equal(data.player_id,'000102030405060708090a0b');assert.equal(data.desc,'2026-09-12T12:34:56.123456');assert.deepEqual(data.title,{$binary_base64:'ZXhhbXBsZQ=='});assert.throws(()=>TA.decodeLineupData(pack([[8,new ExtData(42,Buffer.from('bad'))]])));});
test('展开结果映射槽位、技能、觉醒及原始御魂要求，不丢重复项',()=>{const p=TA.decodeInput(vectors.find(v=>v.name==='apk_sample_v3').payload),l=C.validateLineup(C.adaptTA(p,{...bundle,actors:[{name:'晴明',gameId:10}]}));assert.equal(l.members.length,6);assert.equal(l.members[0].name,'晴明');assert.equal(l.members[0].kind,'onmyoji');assert.equal(l.members[1].awakening,1);assert.equal(l.members[1].skills[0].id,5561);assert.equal(l.members[1].config.suitRequirements.length,1);assert.equal(l.members[1].config.suitRequirements[0].count,6);assert.equal(l.members[1].config.raw.suit.length,3);assert.deepEqual(l.members[1].config.raw,p.data.hconf[1].equip_info);assert.deepEqual(l.members[1].config.protocolUncertainties,[]);assert.equal(l.members[1].config.ranges.length,8);assert.equal(l.members[1].config.extraAttributes.attackPercent,.225);assert.equal(l.requirementsComplete,true);});
test('补齐原码详情保留原有名称用途备注与来源，仅更新解码内容',()=>{const old={id:'saved-1',code:'|TA|qa',title:'我的名称',notes:'作者备注',category:'御魂',dungeon:'魂土',dungeons:['魂土','测试'],occurrences:[{row:5}],members:[]},incoming=C.adaptTA(TA.decodeInput({share_key:'qa',lineup_data:vectors[0].payload}),bundle),merged=C.mergeDecodedLineup(old,incoming);assert.equal(merged.id,old.id);assert.equal(merged.title,old.title);assert.equal(merged.notes,old.notes);assert.deepEqual(merged.dungeons,old.dungeons);assert.deepEqual(merged.occurrences,old.occurrences);assert.equal(merged.members.length,6);assert.equal(merged.raw.desc,incoming.raw.desc);assert.throws(()=>C.mergeDecodedLineup(old,{...incoming,code:'|TA|other'}));});
