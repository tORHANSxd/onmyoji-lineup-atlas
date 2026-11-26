const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');
const gunzip = promisify(require('node:zlib').gunzip);

const MAX_TABLE_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 192 * 1024 * 1024;
const TABLE_NAME = /^[A-Za-z0-9_]+$/;
const FAMILIES = new Set(['daily', 'guild', 'event', 'battle', 'other']);
const RECORD_CACHE_SIZE = 5;

function validPayload(row) {
  return Number.isSafeInteger(row?.rowCount) && row.rowCount >= 0
    && typeof row.sha256 === 'string' && /^[a-f0-9]{64}$/.test(row.sha256)
    && Number.isSafeInteger(row.bytes) && row.bytes >= 1 && row.bytes <= MAX_TABLE_BYTES;
}

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
        || !FAMILIES.has(row.family) || !['decoded', 'unresolved', 'error', 'support'].includes(row.status)
        || row.status === 'decoded' && !validPayload(row)) {
      throw new Error('副本资料索引包含无效表项');
    }
    entries.set(row.name, row);
  }
  if (index.encounters != null && !validPayload(index.encounters)) throw new Error('关卡索引包含无效校验值');
  return { root, index, entries, recordCache: new Map() };
}

async function readPayload(root, name, row) {
  const file = path.join(root, name + '.json.gz');
  if ((await fs.stat(file)).size !== row.bytes) throw new Error('资料表大小与索引不一致');
  const bytes = await fs.readFile(file);
  if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new Error('资料表 SHA-256 校验失败');
  }
  return (await gunzip(bytes, { maxOutputLength: MAX_EXPANDED_BYTES })).toString('utf8');
}

async function readTable(catalog, name) {
  const row = catalog?.entries.get(name);
  if (row?.status !== 'decoded') throw new Error('这张表没有可读取的静态记录');
  return readPayload(catalog.root, name, row);
}

async function readEncounters(catalog) {
  const entry = catalog?.index.encounters;
  if (!entry) return null;
  return readPayload(catalog.root, 'encounters', entry);
}

async function readRecords(catalog, name, keys) {
  const row = catalog?.entries.get(name);
  if (row?.status !== 'decoded') throw new Error('这张表没有可读取的静态记录');
  if (!Array.isArray(keys) || keys.length > 64 || JSON.stringify(keys).length > 16384) throw new Error('关卡记录请求无效');
  const cache = catalog.recordCache;
  let reading = cache.get(name);
  if (reading) cache.delete(name);
  else {
    reading = readTable(catalog, name).then(text => {
      const rows = JSON.parse(text);
      if (!Array.isArray(rows) || rows.length !== row.rowCount) throw new Error('记录数量与索引不一致');
      return new Map(rows.map(([key, value]) => [JSON.stringify(key), value]));
    });
  }
  cache.set(name, reading);
  if (cache.size > RECORD_CACHE_SIZE) cache.delete(cache.keys().next().value);
  let records;
  try { records = await reading; }
  catch (error) {
    if (cache.get(name) === reading) cache.delete(name);
    throw error;
  }
  return keys.map(key => records.get(JSON.stringify(key)) ?? null);
}

module.exports = { readIndex, readTable, readEncounters, readRecords };
