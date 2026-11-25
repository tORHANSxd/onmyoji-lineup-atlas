const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');
const gunzip = promisify(require('node:zlib').gunzip);

const MAX_TABLE_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 192 * 1024 * 1024;
const TABLE_NAME = /^[A-Za-z0-9_]+$/;
const FAMILIES = new Set(['daily', 'guild', 'event', 'battle', 'other']);

async function readIndex(root) {
  const file = path.join(root, 'index.json');
  if ((await fs.stat(file)).size > 16 * 1024 * 1024) throw new Error('副本资料索引过大');
  const index = JSON.parse(await fs.readFile(file, 'utf8'));
  if (index?.schema !== 1 || typeof index.resourceVersion !== 'string' || !Array.isArray(index.tables)) {
    throw new Error('无法识别副本资料索引');
  }
  const entries = new Map();
  for (const row of index.tables) {
    if (!row || typeof row.name !== 'string' || !TABLE_NAME.test(row.name) || entries.has(row.name)
        || !FAMILIES.has(row.family) || !['decoded', 'unresolved', 'error'].includes(row.status)
        || row.status === 'decoded' && (!Number.isSafeInteger(row.rowCount) || row.rowCount < 0
          || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)
          || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > MAX_TABLE_BYTES)) {
      throw new Error('副本资料索引包含无效表项');
    }
    entries.set(row.name, row);
  }
  return { root, index, entries };
}

async function readTable(catalog, name) {
  const row = catalog?.entries.get(name);
  if (row?.status !== 'decoded') throw new Error('这张表没有可读取的静态记录');
  const file = path.join(catalog.root, name + '.json.gz');
  if ((await fs.stat(file)).size !== row.bytes) throw new Error('资料表大小与索引不一致');
  const bytes = await fs.readFile(file);
  if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new Error('资料表 SHA-256 校验失败');
  }
  return (await gunzip(bytes, { maxOutputLength: MAX_EXPANDED_BYTES })).toString('utf8');
}

module.exports = { readIndex, readTable };
