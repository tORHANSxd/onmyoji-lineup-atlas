"""Extract factual editor data and original icons from the supplied client, without executing it."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / '研究资料/d-download-onmyoji-netease-116-2/work'
SNAPSHOT = ROOT / '研究资料/mumu-onmyoji-extractor/exports/onmyoji/20260912_211558_280259'
BASE = SNAPSHOT / 'derived/apk_000/3ee843463afbf85e/assets/res'
PATCH = SNAPSHOT / 'raw/external/external_data/files/netease/onmyoji/Documents/cloudfilesys3/res'
sys.path[:0] = [str(WORK), str(WORK / 'vendor'), str(ROOT / 'user-data/client-v071/vendor')]
import dis_ta
from inspect_wpk import decode_pc
from xdis import unmarshal
import xxhash
import zstandard


class Bindict:
    """Read observed data tags. Unknown tags fail rather than running game modules."""
    def __init__(self, blob, fields=None):
        count = struct.unpack_from('<I', blob)[0]
        offsets = struct.unpack_from('<' + 'I' * (count + 1), blob, 4)
        start = 4 + 4 * (count + 1)
        self.strings = [blob[start + offsets[i]:start + offsets[i + 1]].decode('utf8') for i in range(count)]
        self.data = blob[start + offsets[-1]:]
        self.cache = {}
        self.fields = fields

    def var(self, p):
        value = shift = 0
        while True:
            c = self.data[p]
            p += 1
            value |= (c & 127) << shift
            if c < 128:
                return value, p
            shift += 7
            if shift > 63:
                raise ValueError(('oversized varint', p))

    def obj(self, p, tag=None):
        if tag is None:
            tag = self.data[p]
            p += 1
        if tag == 1:
            return self.var(p)
        if tag in (3, 0x11):
            value, p = self.var(p)
            return -value, p
        if tag == 0:
            return None, p
        if tag == 4:
            return bool(self.data[p]), p + 1
        if tag in (0x22, 0x12):
            size, fmt = (8, '<d') if tag == 0x22 else (4, '<f')
            return struct.unpack_from(fmt, self.data, p)[0], p + size
        if tag == 2:
            return 0.0, p
        if tag == 5:
            value, p = self.var(p)
            return self.strings[value], p
        if tag == 11:
            value, p = self.var(p)
            return self.at(value), p
        if tag in (0x96, 0xd6):
            ref, p = self.var(p)
            count, q = self.var(ref)
            optional, q = self.var(q)
            bitmap = None
            if tag == 0xd6:
                off, p = self.var(p)
                bitmap = self.data[off:off + (optional + 7) // 8]
            elif optional:
                size = (optional + 7) // 8
                bitmap = self.data[p:p + size]
                p += size
            fields = []
            for _ in range(count):
                key, q = self.var(q)
                kind = self.data[q]
                q += 1
                fields.append((self.strings[key], kind))
            result = {}
            for i, (key, kind) in enumerate(fields):
                if i < optional and bitmap is not None and not bitmap[i // 8] & (1 << (i % 8)):
                    continue
                if self.fields is not None and key not in self.fields and kind == 11:
                    _, p = self.var(p)
                    continue
                try:
                    value, p = self.obj(p, kind)
                    if self.fields is None or key in self.fields:
                        result[key] = value
                except Exception as error:
                    raise ValueError(('field', key, 'offset', p, str(error))) from error
            return result, p
        if tag & 15 == 7:
            kind = None
            if tag & 32:
                kind = self.data[p]
                p += 1
            count, p = self.var(p)
            result = []
            for _ in range(count):
                value, p = self.obj(p, kind)
                result.append(value)
            return result, p
        if tag == 0x76:
            kt, vt = self.data[p:p + 2]
            count, p = self.var(p + 2)
            p += count * 8
            result = {}
            for _ in range(count):
                key, p = self.obj(p, kt)
                value, p = self.obj(p, vt)
                result[tuple(key) if isinstance(key, list) else key] = value
            return result, p
        raise ValueError(('unknown bindict tag', hex(tag), p - 1))

    def at(self, p):
        if p not in self.cache:
            self.cache[p] = self.obj(p)[0]
        return self.cache[p]

    def decode(self):
        return self.at(struct.unpack_from('<I', self.data)[0])


class ResourceNames:
    def __init__(self, path):
        b = path.read_bytes()
        assert b[:4] == b'THFB'
        u = lambda p: struct.unpack_from('<I', b, p)[0]

        def field(p, i):
            vt = p - struct.unpack_from('<i', b, p)[0]
            assert 4 + 2 * i < struct.unpack_from('<H', b, vt)[0]
            off = struct.unpack_from('<H', b, vt + 4 + 2 * i)[0]
            assert off
            return p + off

        ref = lambda p: p + u(p)
        root = 8 + u(8)
        assert b[field(root, 0)] == 6
        data = ref(field(root, 1))
        values, ht = ref(field(data, 0)), ref(field(data, 1))
        keys, seeds = ref(field(ht, 0)), ref(field(ht, 2))
        count = u(keys)
        assert u(values) == count
        self.seeds = struct.unpack_from('<' + 'Q' * u(seeds), b, seeds + 4)
        self.rows = {struct.unpack_from('<Q', b, keys + 4 + i * 8)[0]: b[values + 4 + i * 24:values + 4 + (i + 1) * 24] for i in range(count)}

    def get(self, name):
        normalized = name.lstrip('/\\').replace('\\', '/')
        for candidate in dict.fromkeys((normalized, normalized.lower())):
            for seed in self.seeds:
                key = xxhash.xxh64(candidate.encode(), seed).intdigest()
                if key in self.rows:
                    row = self.rows[key]
                    return {'name': candidate, 'digest': row[8:24].hex(), 'size': struct.unpack_from('<I', row, 4)[0]}


def entries(folder, group):
    b = (folder / (group + '.idx')).read_bytes()
    assert b[:4] == b'SKPW'
    count = struct.unpack_from('<I', b, 12)[0]
    for i in range(count):
        digest, size, offset, vol, extra = struct.unpack_from('<16sIIHH', b, 32 + i * 28)
        yield {'digest': digest.hex(), 'size': size, 'offset': offset, 'vol': vol, 'folder': folder, 'group': group}


class Client:
    def __init__(self):
        self.indices = {}
        self.names = {}
        self.evidence = {}
        self.modules = {}

    def resource(self, group, name):
        if group not in self.indices:
            self.indices[group] = {e['digest']: e for folder in (BASE, PATCH) for e in entries(folder, group)}
            self.names[group] = ResourceNames(PATCH.parent / 'thd' / (group + '.thx'))
        resource = self.names[group].get(name)
        if not resource or resource['digest'] not in self.indices[group]:
            raise FileNotFoundError(group + '/' + name)
        entry = self.indices[group][resource['digest']]
        folder = entry['folder']
        if entry['vol'] in (255, 65535):
            raw = (folder / group / entry['digest']).read_bytes()
        else:
            with (folder / (group + str(entry['vol']) + '.wpk')).open('rb') as stream:
                stream.seek(entry['offset'])
                raw = stream.read(entry['size'])
        assert len(raw) == entry['size']
        decoded = decode_pc(raw) if raw[:2] in (b'PC', b'AC', b'XC') else raw
        if decoded.startswith(b'DTSZ'):
            decoded = zstandard.ZstdDecompressor().decompress(decoded[4:])
        if decoded.startswith(b'ENON'):
            decoded = decoded[4:]
        return decoded, {**resource, 'sha256': hashlib.sha256(decoded).hexdigest(), 'origin': 'patch' if folder == PATCH else 'apk'}

    def module(self, name):
        if name not in self.modules:
            raw, evidence = self.resource('script3', name.replace('\\', '/').removesuffix('.py') + '.nxs3')
            decoded = zlib.decompress(raw)
            co = unmarshal.load_code(io.BytesIO(decoded), 3495, code_objects={})
            self.evidence[name] = {**evidence, 'module': co.co_filename, 'marshalSHA256': hashlib.sha256(decoded).hexdigest()}
            self.modules[name] = co
        return self.modules[name]

    def table(self, name, fields=None):
        co = self.module('com/data/cdata/' + name)
        blob = max((v for v in co.co_consts if isinstance(v, bytes)), key=len)
        return Bindict(blob, fields).decode()


def inherited(rows):
    cache = {}

    def get(key, visiting=()):
        key = tuple(key) if isinstance(key, list) else key
        if key in cache:
            return cache[key]
        if key in visiting:
            raise ValueError(('cyclic prototype', key))
        row = rows[key]
        result = dict(get(row['_proto_key'], (*visiting, key))) if row.get('_proto_key') else {}
        result.update({k: v for k, v in row.items() if k not in ('_proto_key', '__nullkeys__')})
        for k in row.get('__nullkeys__', []):
            result.pop(k, None)
        cache[key] = result
        return result

    return {key: get(key) for key in rows}


def format_fields(co):
    # The small dict_skill table consists of literal TD dictionaries. Read only
    # LOAD_CONST / BUILD_CONST_KEY_MAP operands, never execute its bytecode.
    recent, rows, extended = [], {}, 0
    for off in range(0, len(co.co_code), 2):
        op, arg = co.co_code[off:off + 2]
        arg |= extended
        extended = arg << 8 if op == 0xb9 else 0
        if op == 0xab:
            recent.append(co.co_consts[arg])
        elif op == 0xdc and arg == 3 and recent[-1] == ('id', 'segmentId', 'valueType'):
            row = dict(zip(recent[-1], recent[-4:-1]))
            rows[row['id']] = row
    assert len(rows) > 50
    return rows


def export_catalog(client):
    bundle = json.loads((ROOT / 'data/bundle.json').read_text(encoding='utf8'))
    params = format_fields(client.module('com/data/cdata/dict_skill'))
    fields = {'skill_name', 'skillIcon', 'desc', 'combatDesc', 'levDes', 'skillKind',
              'consumeVal', 'maxCd', 'effectDesc', 'skillType', 'skillOwnerType', 'special_select_skill_list', '_proto_key', '__nullkeys__',
              'buffId', 'buffId2', 'buffLevel', 'buffLevel2', 'shunshi_xg_value'}
    fields.update(r['segmentId'] for r in params.values())
    fields.update('param' + str(i) for i in range(1, 24))
    raw_skills = inherited(client.table('skill', fields))
    raw_buffs = inherited(client.table('buff', fields | {'name', 'buffDesc', 'value1', 'value2'}))
    slaves = inherited(client.table('slave', {r['segmentId'] for k, r in params.items() if k.startswith('z_')} | {'_proto_key', '__nullkeys__'}))
    raw_heroes = inherited(client.table('hero', {'name', 'skill', 'awakeSkill', '_proto_key', '__nullkeys__'}))
    extras = inherited(client.table('hero_extra_skills', {'extra_skills', '_proto_key', '__nullkeys__'}))
    tips = client.table('skill_tips')
    tags = client.table('skill_tag')
    tree = client.table('skill_tree')
    spirits = client.table('hunling_base')
    attrs = client.table('hunling_attr')
    stars = client.table('hunling_star')
    exp = client.table('hunling_exp')
    marks = client.table('hunling_mark')
    groups = client.table('hunling_mark_group')
    stages = client.table('team_assist_stage')
    by_id = {}
    for key, row in raw_skills.items():
        if key[2] in (-1, 0, 1):
            by_id.setdefault(key[0], {})[key[1:]] = row

    def skill(sid, level=1, awake=1):
        variants = by_id.get(sid, {})
        awake = 1 if awake else 0
        return variants.get((level, awake), variants.get((level, -1), {}))

    def passive(sid, row):
        return row.get('skillOwnerType') == 2 or row.get('skillType') == 4 or sid == 1103

    heroes = {}
    actor_ids = {int(a['gameId']) for a in bundle['actors']}
    roster_ids = {int(r['id']) for r in bundle['roster']}
    chosen = set()
    for hid in sorted(roster_ids | actor_ids):
        row = raw_heroes[hid]
        skills = [sid for sid in row['skill'] if sid]
        if row.get('awakeSkill') and row['awakeSkill'] not in skills:
            skills.append(row['awakeSkill'])
        actor = hid in actor_ids
        # TAHelper.get_hero_ori_skill_list_by_tmp_hero_data sorts nonzero IDs.
        if not actor:
            skills.sort()
        choices = sorted(r['skillid'] for r in tree.values() if r['yysid'] == hid) if actor else skills
        heroes[hid] = {'id': hid, 'name': row['name'], 'kind': 'onmyoji' if actor else 'shikigami',
                       'skills': skills, 'awakeSkill': row.get('awakeSkill', 0),
                       'choices': choices, 'equipSkills': [sid for sid in choices if sid != skills[0] and not passive(sid, skill(sid))] if actor else [],
                       'groupId': {10: 1, 11: 2, 13: 3, 12: 4, 15: 5, 16: 6}.get(hid)}
        chosen.update(skills + choices)
    chosen.update(r['talentSkill'] for r in spirits.values())
    chosen.update(r['pvpSkill'] for r in spirits.values())
    chosen.update(r['skillId'] for r in marks.values())
    # TeamAssistWidget.AiSkillNode handles 月之奥义 before its passive-skill
    # check; TAConst.SUB_LYCJ_1 stores the eight selectable auto-cast forms.
    ai_branches = {3382: [33831, 33832, 33833, 33834, 33841, 33842, 33843, 33844]}
    client.module('module_new/team_assist/TAConst')
    client.module('module_new/team_assist/ta_ui/TeamAssistWidget')
    for values in ai_branches.values():
        chosen.update(values)
    pending = list(chosen)
    while pending:
        sid = pending.pop()
        for (lv, awake), row in by_id.get(sid, {}).items():
            related = set(row.get('special_select_skill_list', []))
            related.update(int(x) for text in [row.get('desc', ''), row.get('combatDesc', ''), row.get('levDes', '')]
                           for x in re.findall(r'\[skill_(\d+)_', text))
            related.update(x[0] for x in extras.get((sid, lv, awake), {}).get('extra_skills', []))
            for child in related - chosen:
                chosen.add(child)
                pending.append(child)

    unresolved, terms = set(), {}

    def render(text, row, awake=1, trail=()):
        def replace(match):
            token = match[1]
            if token.startswith('*|'):
                return ' × '.join(render('[' + v + ']', row, awake, trail) for v in token.split('|')[1:])
            if token.startswith('a_debuff-acc'):
                return '效果命中'
            if token.startswith('extra_'):
                return token[6:]
            if token.startswith('ur_'):
                return ''
            parts = token.split('_')
            kind = parts[0]
            if kind in ('skill', 'buff', 'tips') and len(parts) >= 2:
                ident = int(parts[1])
                lv = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 1
                target = skill(ident, lv, awake) if kind == 'skill' else raw_buffs.get((ident, lv), {}) if kind == 'buff' else tips.get(ident, {})
                name = target.get({'skill': 'skill_name', 'buff': 'name', 'tips': 'skill_tips_name'}[kind])
                if name:
                    key = f'{kind}_{ident}_{lv}_{awake}'
                    if key not in terms and key not in trail:
                        terms[key] = {'name': name, 'description': ''}
                        source = target.get({'skill': 'combatDesc', 'buff': 'buffDesc', 'tips': 'skill_tips_text'}[kind], '')
                        terms[key]['description'] = render(source, target, awake, (*trail, key))
                    return name
            info = params.get('_'.join(parts[:2]))
            if info:
                target = row
                if kind in ('b', 'b2'):
                    suffix = '2' if kind == 'b2' else ''
                    target = raw_buffs.get((int(row.get('buffId' + suffix, 0)), int(row.get('buffLevel' + suffix, 1))), {})
                elif kind == 'z':
                    target = slaves.get(int(row.get('shunshi_xg_value', 0)), {})
                value = target.get(info['segmentId'])
                mode = parts[2] if len(parts) > 2 else info['valueType']
                if isinstance(value, (int, float)):
                    value = abs(value)  # UiUtil._formatDesc applies math.fabs.
                    return f'{round(value * 100)}%' if mode == 'per' else str(round(value)) if mode == 'abs' else f'{value:.2f}'
                if isinstance(value, str):
                    return value
            if re.match(r'^(?:[sbaez]_\w|b2_|skill_|buff_|tips_|[+*/-]\|)', token):
                unresolved.add(token)
            return match[0]
        return re.sub(r'\[([^\[\]]+)\]', replace, str(text)).replace('#n', '\n')

    output_skills, icons = {}, {}
    icon_failures = []
    for sid in sorted(chosen):
        variants = {}
        for (lv, awake), row in sorted(by_id.get(sid, {}).items()):
            entry = {'level': lv, 'name': row.get('skill_name', ''), 'icon': row.get('skillIcon', ''),
                     'cost': row.get('consumeVal', 0), 'kind': row.get('skillKind'), 'passive': passive(sid, row), 'cooldown': row.get('maxCd', 0),
                     'tags': [int(t) for t in row.get('effectDesc', [])],
                     'description': render(row.get('combatDesc') or row.get('desc', ''), row, awake),
                     'upgrade': render(row.get('levDes', ''), row, awake),
                     'branches': row.get('special_select_skill_list', []),
                     'aiBranches': ai_branches.get(sid, []),
                     'related': [v[0] for v in extras.get((sid, lv, awake), {}).get('extra_skills', [])]}
            refs = re.findall(r'\[(skill|buff|tips)_(\d+)(?:_(\d+))?', (row.get('combatDesc') or row.get('desc', '')) + row.get('levDes', ''))
            entry['terms'] = list(dict.fromkeys(f'{kind}_{ident}_{level or 1}_{awake}' for kind, ident, level in refs))
            variants.setdefault(str(awake), []).append(entry)
            if entry['icon']:
                icons.setdefault(str(entry['icon']), None)
        if variants:
            output_skills[sid] = {'id': sid, 'variants': variants}

    from PIL import Image
    import texture2ddecoder
    blocks = [(4, 4), (5, 4), (5, 5), (6, 5), (6, 6), (8, 5), (8, 6), (8, 8), (10, 5), (10, 6), (10, 8), (10, 10), (12, 10), (12, 12)]
    for icon in icons:
        try:
            assert re.fullmatch(r'[a-zA-Z0-9_-]+', icon), icon
            raw, evidence = client.resource('icon', 'skill/' + icon + '.png')
            path = ROOT / 'data/images/game/skills' / (icon + '.png')
            if raw[:12] == b'\xabKTX 11\xbb\r\n\x1a\n':
                endian, typ, _, fmt, internal, _, width, height, depth, arrays, faces, mips, metadata = struct.unpack_from('<13I', raw, 12)
                assert endian == 0x04030201 and typ == 0 and fmt == 0 and faces == 1 and not depth and not arrays
                index = internal - (0x93d0 if internal >= 0x93d0 else 0x93b0)
                bw, bh = blocks[index]
                pos = 64 + metadata
                size = struct.unpack_from('<I', raw, pos)[0]
                pixels = texture2ddecoder.decode_astc(raw[pos + 4:pos + 4 + size], width, height, bw, bh)
                img = Image.frombytes('RGBA', (width, height), pixels, 'raw', 'BGRA')
            else:
                img = Image.open(io.BytesIO(raw)).convert('RGBA')
            path.parent.mkdir(parents=True, exist_ok=True)
            img.save(path, format='PNG')
            icons[icon] = {**evidence, 'localPath': path.relative_to(ROOT).as_posix(),
                           'fileSHA256': hashlib.sha256(path.read_bytes()).hexdigest(), 'width': img.width, 'height': img.height}
        except Exception as error:
            icon_failures.append({'icon': icon, 'error': str(error)})

    spirit_rows = {}
    for sid, row in spirits.items():
        spirit_rows[sid] = {'id': sid, 'name': row['name'], 'heroes': row['heroIdList'],
                            'skillId': row['talentSkill'], 'pvpSkillId': row['pvpSkill'], 'trigger': row['battle_tips'],
                            'attributes': {star: attrs[(sid, star)]['attr_list'] for star in range(1, 7)}}
    result = {'schemaVersion': 1, 'source': {'kind': 'user-supplied-client', 'snapshot': SNAPSHOT.name,
              'tables': client.evidence}, 'heroes': heroes, 'skills': output_skills, 'tags': tags,
              'terms': terms, 'icons': icons, 'spirits': spirit_rows, 'spiritStars': stars,
              'spiritMaxLevel': {star: max(k[1] for k in exp if k[0] == star) for star in stars},
              'marks': marks, 'markGroups': groups,
              'stages': {sid: {'name': r['name'], 'actors': r['yys_num'], 'shikigami': r['ss_num']} for sid, r in stages.items()}}
    audit = {'heroes': len(heroes), 'skills': len(output_skills), 'skillLevels': sum(len(v) for s in output_skills.values() for v in s['variants'].values()),
             'tags': len(tags), 'icons': len(icons), 'iconFailures': icon_failures, 'unresolvedText': sorted(unresolved),
             'missingSkills': sorted(chosen - output_skills.keys()),
             'emptyNames': [sid for sid, s in output_skills.items() if any(not l['name'] for levels in s['variants'].values() for l in levels)]}
    (ROOT / 'data/game-config.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    (ROOT / 'verification/game-catalog-v093.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(audit, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', nargs='+')
    args = parser.parse_args()
    client = Client()
    if args.inspect:
        for name in args.inspect:
            table = client.table(name)
            print(json.dumps({'table': name, 'count': len(table), 'samples': list(table.items())[:2]}, ensure_ascii=False, default=str))
        return
    export_catalog(client)


if __name__ == '__main__':
    main()
