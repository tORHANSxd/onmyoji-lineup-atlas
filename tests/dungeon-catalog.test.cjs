const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { readIndex, readTable, readEncounters, readRecords } = require('../desktop/dungeon-catalog.cjs');
const {ratingBands}=require('../app/fengmo-live.js');

test('普通土蜘蛛从伤害第一档计级，其余逢魔使用对应积分表',()=>{
  const event={reward:[[0,0],[30000,0],[300000,0]]};
  assert.deepEqual(ratingBands(event,null,{hard:false,soil:true}),
    [{grade:1,minimum:0},{grade:2,minimum:30000},{grade:3,minimum:300000}]);
  assert.deepEqual(ratingBands(event,[0,2000,2500],{hard:true,soil:true}),
    [{grade:1,minimum:0},{grade:2,minimum:2000},{grade:3,minimum:2500}]);
  const other={reward:[[30000,0],[2000,0],[2500,0]]};
  assert.deepEqual(ratingBands(other,null,{hard:true,soil:false}),[{grade:2,minimum:2000},{grade:3,minimum:2500}]);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-dungeon-'));
  t.after(async () => {
    await fs.unlink(path.join(root, 'pve_stage_data.json.gz'));
    await fs.unlink(path.join(root, 'index.json'));
    await fs.unlink(path.join(root, 'encounters.json.gz')).catch(error => {if(error.code!=='ENOENT')throw error;});
    await fs.rmdir(root);
  });
  const rows = [['471', { name: '测试关卡', groupid: 471, battleTime: 180 }]];
  const data = gzipSync(JSON.stringify(rows));
  const entry = { name: 'pve_stage_data', family: 'daily', status: 'decoded', rowCount: rows.length,
    bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  const index = { schema: 1, resourceVersion: '0.0.816', tables: [entry] };
  const write = () => fs.writeFile(path.join(root, 'index.json'), JSON.stringify(index));
  const file = path.join(root, 'pve_stage_data.json.gz');
  await fs.writeFile(file, data);
  await write();
  return { root, rows, file, index, entry, data, write };
}

test('按版本读取可核验的本地副本资料表', async t => {
  const { root, rows } = await fixture(t);
  const catalog = await readIndex(root);
  assert.equal(catalog.index.resourceVersion, '0.0.816');
  assert.deepEqual(JSON.parse(await readTable(catalog, 'pve_stage_data')), rows);
  assert.equal(await readEncounters(catalog), null);
  assert.deepEqual(await readRecords(catalog, 'pve_stage_data', ['471', 471, 'missing']), [rows[0][1], null, null]);
  await assert.rejects(readRecords(catalog, 'pve_stage_data', Array(65).fill('471')), /记录请求无效/);
  await assert.rejects(readTable(catalog, '../private'), /没有可读取/);
});

test('派生关卡索引独立校验并兼容旧资料表模式', async t => {
  const { root, index, write } = await fixture(t);
  const file = path.join(root, 'encounters.json.gz');
  const body = {schema:1, resourceVersion:index.resourceVersion, entries:[]};
  const bytes = gzipSync(JSON.stringify(body));
  index.encounters = {rowCount:0,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  await fs.writeFile(file, bytes);
  await write();
  const catalog = await readIndex(root);
  assert.deepEqual(JSON.parse(await readEncounters(catalog)), body);
  bytes[15] ^= 1;
  await fs.writeFile(file, bytes);
  await assert.rejects(readEncounters(catalog), /SHA-256/);
});

test('同样长度的损坏资料不通过 SHA-256 校验', async t => {
  const { root, file, data } = await fixture(t);
  data[15] ^= 1;
  await fs.writeFile(file, data);
  const catalog = await readIndex(root);
  await assert.rejects(readTable(catalog, 'pve_stage_data'), /SHA-256/);
});

test('含有不安全名称或重复表名的索引不予加载', async t => {
  const { root, index, entry, write } = await fixture(t);
  index.tables.push({ ...entry });
  await write();
  await assert.rejects(readIndex(root), /无效表项/);
  index.tables.pop();
  entry.name = '../outside';
  await write();
  await assert.rejects(readIndex(root), /无效表项/);
});
