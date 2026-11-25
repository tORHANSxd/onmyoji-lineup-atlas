"""Project the versioned client tables used by the lineup editor and dungeon view."""
import argparse
from functools import lru_cache
import json
from pathlib import Path


RUNE_CATEGORIES = {1: (10010, "八岐大蛇"), 2: (10011, "业原火"),
                   3: (10012, "日轮之陨"), 4: (10013, "永生之海")}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def read_table(directory, name):
    table = read(directory / f"{name}.json")
    rows = table["rows"]
    if "$mapping" in rows:
        rows = {tuple(key["$tuple"]) if isinstance(key, dict) else key: value
                for key, value in rows["$mapping"]}
    assert table["rowCount"] == len(rows), f"row count mismatch: {name}"
    return rows, table["evidence"]


def import_dungeons(directory, version, apk_version, data):
    names = ("team_assist_stage", "team_assist_stage_tag", "dungeon_rune", "monster", "skill", "hero")
    tables = {name: read_table(directory, name) for name in names}
    stage_rows, stage_tags, rune_rows, monsters, skills, heroes = (tables[name][0] for name in names)
    source = {
        "apkVersion": apk_version, "resourceVersion": version,
        "tables": {name: {k: table[1][k] for k in ("digest", "decodedSHA256", "marshalSHA256")}
                   for name, table in tables.items()},
    }

    editor = read(data / "game-config.json")
    native_stages = {str(key): {"name": row["name"], "actors": row["yys_num"], "shikigami": row["ss_num"]}
                     for key, row in stage_rows.items() if key == row["id"]}
    assert len(native_stages) == len(stage_rows), "invalid stage identities"
    editor["stages"] = {**editor["stages"], **native_stages}
    editor["stageSource"] = {**source, "stageCount": len(native_stages)}
    editor["heroNames"] = {key: row["name"] for key, row in heroes.items()
                           if row.get("type") == 2 and row.get("name")}

    catalog = read(data / "stages.json")
    existing = {str(row["gameSceneId"]) for row in catalog["scenes"]}
    for stage_id, stage in sorted(stage_rows.items()):
        if str(stage_id) in existing:
            continue
        leaf_ids = set(stage["tag"])
        parents = [tag for tag in stage_tags.values()
                   if tag["type"] == 1 and (leaf_ids.intersection(tag["sub_tag"]) or tag["id"] in leaf_ids)]
        leaves = [stage_tags[tag]["name"] for tag in sorted(leaf_ids) if tag in stage_tags]
        catalog["scenes"].append({
            "id": str(stage_id), "gameSceneId": stage_id,
            "level1": parents[0]["name"] if len(parents) == 1 else "游戏原码副本",
            "level2": leaves[0] if len(leaves) == 1 else "",
            "level3": stage["name"], "tagIds": sorted(leaf_ids), "verification": "apk",
        })
    catalog["stageSource"] = source

    @lru_cache
    def skill_name(key):
        row = skills.get(key)
        if row is None:
            return None
        if "skill_name" in row:
            return row["skill_name"]
        parent = row.get("_proto_key")
        return skill_name(tuple(parent)) if parent and "skill_name" not in row.get("__nullkeys__", ()) else None

    def unit(position, ref):
        monster_id, level = ref
        row = monsters.get(monster_id)
        result = {"id": monster_id, "position": position, "level": level}
        if row is None:
            return result
        known = ("baseSpeed", "baseCritRate", "baseCritPower", "attackDelta", "defenseDelta", "hpDelta",
                 "ext_attr_list", "immuDebuff", "immuHitBack", "immunity")
        result.update(name=row.get("name"), attributes={k: row[k] for k in known if k in row})
        result["skills"] = [
            {"id": sid, "level": skill_level, "name": skill_name((sid, skill_level, 2))
             or skill_name((sid, skill_level, -1))}
            for sid, skill_level in zip(row.get("skill", ()), row.get("skillLv", ())) if sid
        ]
        return result

    dungeons = []
    for key, row in sorted(rune_rows.items(), key=lambda pair: (pair[1]["type"], pair[1]["floor_num"], pair[0])):
        category = RUNE_CATEGORIES.get(row["type"])
        stage_name = f'{category[1]}·{row["floordesc"]}' if category else row["floordesc"]
        matching = [sid for sid, stage in stage_rows.items()
                    if category and category[0] in stage["tag"] and stage["name"] == stage_name]
        assert len(matching) <= 1, f"ambiguous TA stage: {stage_name}"
        mods = {k: row[k] for k in ("atk_alter", "hp_alter", "def_alter", "crt_alter", "sp_alter")}
        dungeons.append({
            "id": key, "name": stage_name, "gameSceneId": matching[0] if matching else None,
            "floor": row["floor_num"], "scene": row["scene"], "stamina": row["strength"],
            "lootIds": [int(value) for value in row["loot_id"].split("|") if value.isdecimal()],
            "waveModifiers": mods, "waves": [
                [unit(pos, monster) for pos, monster in enumerate(wave, 1) if monster]
                for wave in row["monsterWaves"]
            ],
        })
    write(data / "game-config.json", editor)
    (data / "stages.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write(data / "dungeon-rules.json", {"source": source, "dungeons": dungeons})
    print(f"{len(native_stages)} TA stages, {len(dungeons)} rune dungeon records")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tables", type=Path)
    parser.add_argument("--resource-version", required=True)
    parser.add_argument("--apk-version", required=True)
    args = parser.parse_args()
    import_dungeons(args.tables, args.resource_version, args.apk_version, Path(__file__).resolve().parent.parent / "data")
