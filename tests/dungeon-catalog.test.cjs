const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { readIndex, readTable } = require('../desktop/dungeon-catalog.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-dungeon-'));
  t.after(async () => {
    await fs.unlink(path.join(root, 'pve_stage_data.json.gz'));
    await fs.unlink(path.join(root, 'index.json'));
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
  await assert.rejects(readTable(catalog, '../private'), /没有可读取/);
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
