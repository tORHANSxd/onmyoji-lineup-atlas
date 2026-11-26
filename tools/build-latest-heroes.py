"""Build the late-2026 roster supplement from verified client and official data."""

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import struct

from PIL import Image
import texture2ddecoder


RELEASES = {
    609: ("SSR", "2026-10-10", "https://a.4399.cn/gg/54377559_99319.html"),
    611: ("UR", "2026-10-28", "https://www.taptap.cn/moment/862742080806456733"),
    612: ("SP", "2026-11-11", "https://www.taptap.cn/moment/868857953371817978"),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_tables(directory):
    index = json.loads((directory / "index.json").read_bytes())
    names = ("hero", "skill", "buff", "skill_tips", "dict_skill", "hero_extra_skills", "slave")
    entries = {row["name"]: row for row in index["tables"]}
    result, hashes = {}, {}
    for name in names:
        origin = entries[name]
        data = (directory / (name + ".json.gz")).read_bytes()
        if sha(data) != origin["sha256"]:
            raise ValueError(f"Catalog table checksum mismatch: {name}")
        result[name] = {(tuple(key["$tuple"]) if isinstance(key, dict) and "$tuple" in key else key): row
                        for key, row in json.loads(gzip.decompress(data))}
        hashes[name] = origin["source"]["marshalSHA256"]
    return index["resourceVersion"], hashes, result


def inherited(table, key):
    row = table.get(key, {})
    parent = row.get("_proto_key")
    value = {**inherited(table, tuple(parent) if isinstance(parent, list) else parent), **row} if parent is not None else dict(row)
    for omitted in row.get("__nullkeys__", ()):
        value.pop(omitted, None)
    return value


def skill_data(tables, ids, previous):
    full, terms, icons = {}, {}, set()
    variants = {}
    for key in tables["skill"]:
        if isinstance(key, tuple) and len(key) == 3 and key[2] in (-1, 0, 1):
            variants.setdefault(key[0], []).append(key)

    def skill(id, level, awake):
        key = next((k for k in ((id, level, awake), (id, level, -1), (id, level, 0)) if k in tables["skill"]), None)
        return inherited(tables["skill"], key)

    def render(text, row, awake, trail=()):
        def replace(match):
            token = match[1]
            parts = token.split("_")
            kind = parts[0]
            if token.startswith("ur_"):
                return ""
            if kind in ("skill", "buff", "tips"):
                try:
                    id = int(parts[1])
                    level = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 1
                except (IndexError, ValueError):
                    return match[0]
                if kind == "skill":
                    target, label, description = skill(id, level, awake), "skill_name", "combatDesc"
                elif kind == "buff":
                    target, label, description = inherited(tables["buff"], (id, level)), "name", "buffDesc"
                else:
                    target, label, description = tables["skill_tips"].get(id, {}), "skill_tips_name", "skill_tips_text"
                if target.get(label):
                    term = f"{kind}_{id}_{level}_{awake}"
                    if term not in terms and term not in trail:
                        terms[term] = {"name": target[label],
                                       "description": render(target.get(description) or target.get("desc") or "",
                                                             target, awake, (*trail, term))}
                    return target[label]
            if token.startswith("extra_"):
                return token[6:]
            if token.startswith("a_debuff-acc"):
                return "效果命中"
            if token.startswith("*|"):
                return " × ".join(render(f"[{value}]", row, awake, trail) for value in token.split("|")[1:])
            definition = tables["dict_skill"].get("_".join(parts[:2]))
            if definition:
                target = row
                if kind in ("b", "b2"):
                    suffix = "2" if kind == "b2" else ""
                    target = inherited(tables["buff"], (row.get("buffId" + suffix), row.get("buffLevel" + suffix, 1)))
                elif kind == "z":
                    target = inherited(tables["slave"], row.get("shunshi_xg_value"))
                value = target.get(definition["segmentId"])
                mode = parts[2] if len(parts) > 2 else definition["valueType"]
                if type(value) in (int, float):
                    value = abs(value)
                    return f"{round(value*100)}%" if mode == "per" else str(round(value)) if mode == "abs" else f"{value:.2f}"
                if isinstance(value, str):
                    return value
            return match[0]
        return re.sub(r"\[([^\[\]]+)\]", replace, text).replace("#n", "\n")

    pending, seen = list(ids), set()
    while pending:
        id = pending.pop()
        if id in seen or str(id) in previous:
            continue
        seen.add(id)
        values = {}
        for key in sorted(variants.get(id, ())):
            _, level, awake = key
            row = inherited(tables["skill"], key)
            related = [x[0] for x in inherited(tables["hero_extra_skills"], key).get("extra_skills", [])]
            branches = row.get("special_select_skill_list", [])
            description = row.get("combatDesc") or row.get("desc") or ""
            upgrade = row.get("levDes", "")
            links = re.findall(r"\[(skill|buff|tips)_(\d+)(?:_(\d+))?", description + upgrade)
            pending.extend([*related, *branches, *(int(ref) for kind, ref, _ in links if kind == "skill")])
            icon = row.get("skillIcon", "") or ""
            if icon:
                icons.add(str(icon))
            values.setdefault(str(awake), []).append({
                "level": level, "name": row.get("skill_name", ""), "icon": icon,
                "cost": row.get("consumeVal", 0), "kind": row.get("skillKind"),
                "passive": row.get("skillOwnerType") == 2 or row.get("skillType") == 4,
                "cooldown": row.get("maxCd", 0), "tags": [int(t) for t in row.get("effectDesc", [])],
                "description": render(description, row, awake), "upgrade": render(upgrade, row, awake),
                "branches": branches, "aiBranches": [], "related": related,
                "terms": list(dict.fromkeys(f"{kind}_{ref}_{level or 1}_{awake}" for kind, ref, level in links)),
            })
        if values:
            full[str(id)] = {"id": id, "variants": values}
    return full, terms, icons


def local_image(root, relative, data, source):
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        width, height = image.size
    dest = root / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return {**source, "localPath": relative, "sha256": sha(data), "fileSHA256": sha(data),
            "width": width, "height": height}


def icon_data(root, inputs, ids):
    sources = json.loads((inputs / "skill-provenance.json").read_bytes())
    blocks = [(4, 4), (5, 4), (5, 5), (6, 5), (6, 6), (8, 5), (8, 6),
              (8, 8), (10, 5), (10, 6), (10, 8), (10, 10), (12, 10), (12, 12)]
    output = {}
    for id in sorted(ids):
        if id not in sources:
            continue
        raw = (inputs / ("skill-" + id + ".raw")).read_bytes()
        if sha(raw) != sources[id]["decodedSHA256"]:
            raise ValueError(f"Source icon checksum mismatch: {id}")
        if raw.startswith(b"\xabKTX 11\xbb\r\n\x1a\n"):
            _, _, _, _, fmt, _, width, height, _, _, _, _, meta = struct.unpack_from("<13I", raw, 12)
            pos = 64 + meta
            size = struct.unpack_from("<I", raw, pos)[0]
            block = blocks[fmt - (0x93d0 if fmt >= 0x93d0 else 0x93b0)]
            pixels = texture2ddecoder.decode_astc(raw[pos+4:pos+4+size], width, height, *block)
            converted = Image.frombytes("RGBA", (width, height), pixels, "raw", "BGRA")
            buffer = io.BytesIO()
            converted.save(buffer, format="PNG")
            raw = buffer.getvalue()
        output[id] = local_image(root, f"data/images/game/skills/{id}.png", raw, sources[id])
    return output


def build(root, catalog, inputs, output):
    version, hashes, tables = load_tables(catalog)
    base = json.loads((root / "data/bundle.json").read_bytes())["gameConfig"]
    public = json.loads((inputs / "evidence.json").read_bytes())
    heroes, roster = {}, []
    for id, (rarity, released, citation) in RELEASES.items():
        record = inherited(tables["hero"], id)
        ids = sorted(x for x in record["skill"] if x)
        heroes[str(id)] = {"id": id, "name": record["name"], "kind": "shikigami", "skills": ids,
                           "awakeSkill": record.get("awakeSkill", 0), "choices": ids, "equipSkills": [], "groupId": None}
        awaken = "supported" if rarity == "SSR" else "not_applicable"
        variants, attrs, evidence = [], {}, []
        for source in public:
            if source["id"] != id:
                continue
            name = source["kind"]
            raw = (inputs / f"{id}-{name}").read_bytes()
            if sha(raw) != source["sha256"]:
                raise ValueError(f"Public resource checksum mismatch: {id} {name}")
            fields = {key: source[key] for key in ("url", "sha256")}
            if name.startswith("attrs-"):
                match = re.fullmatch(r"\s*cb\((.*)\);?\s*", raw.decode("utf-8"), re.S)
                response = json.loads(match[1]) if match else {}
                if response.get("success") is not True:
                    raise ValueError(f"Invalid official attributes for hero {id}")
                attrs[Path(name).stem.removeprefix("attrs-")] = response["data"]
                evidence.append(fields)
                continue
            family = Path(name).stem
            state = "awakened" if family.endswith("-after") else "unawakened"
            variants.append(local_image(root, f"data/images/{id}/{name}", raw, {**fields, "id": str(id),
                "family": family, "requestedState": state, "verifiedState": state, "identityVerified": True,
                "stateVerified": True, "status": "downloaded_valid_image"}))
        if len(variants) != (4 if awaken == "supported" else 2) or len(attrs) != (2 if awaken == "supported" else 1):
            raise ValueError(f"Missing official attributes or images for hero {id}")
        if record.get("awakeAttr"):
            raise ValueError(f"Unverified additional awakening attributes for hero {id}")
        # The exported growth tuple already includes the client's awakeInc* values.
        rules = {"baseHit": attrs["0"]["debuffEnhance"], "baseResist": attrs["0"]["debuffResist"], "awakeBonus": {}}
        roster.append({"id": str(id), "name": record["name"], "rarity": rarity, "rarityRaw": record["rarity"],
                       "releasedAt": released, "releaseEvidenceUrls": [citation], "awakeningAvailability": awaken,
                       "gameRules": rules,
                       "officialUrl": f"https://yys.163.com/shishen/{id}.html", "assets": {
                           "awakeningAvailability": awaken, "baseAttrs40": attrs, "awakeningEvidence": evidence,
                           "variants": variants}})
    skills, terms, icons = skill_data(tables, [skill for h in heroes.values() for skill in h["skills"]], base["skills"])
    if any(str(id) not in skills for hero in heroes.values() for id in hero["skills"]):
        raise ValueError("Missing original skill levels for new characters")
    images = icon_data(root, inputs, icons)
    output.write_text(json.dumps({"resourceVersion": version, "tableSHA256": hashes, "roster": roster,
                                 "heroes": heroes, "skills": skills, "terms": terms, "icons": images,
                                 "missingIcons": sorted(icons - images.keys() - base["icons"].keys())},
                                ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    build(root, root / "data/dungeon-catalog", args.inputs, root / "data/latest-heroes.json")
