"""Read initial enemy panels and formation rules from the original Secret Zone engine."""

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import faulthandler
import json
from math import isfinite
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


def extract(runtime, work, part, workers):
    from rune_floor_host import prepare_runtime
    from secret_stage import (DynamicFormation, JINYUJI_TYPE, MIRROR_FLOOR, MIRROR_WAVE, mirror_fallback,
                              placements, secret_mechanic, secret_protection, secret_replacement, secret_solo, secret_stage)

    modules, host, source = prepare_runtime(runtime, work)
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.ChallengeFbEngine import const, DATA_DUNGEON_CHALLENGE_SERIES
    from com.data.cdata import team_assist_stage

    code_scenes = defaultdict(list)
    for code_id, row in team_assist_stage.data.items():
        if (row["yys_num"], row["ss_num"]) == (1, 5):
            code_scenes[row["name"]].append(code_id)
    types = "壹贰叁肆伍陆柒捌玖拾"
    floors, skipped = {}, []
    entries = sorted(DATA_DUNGEON_CHALLENGE_SERIES.data.items())
    for floor, original in entries[part::workers]:
        try:
            engine, config, configured = secret_stage(floor)
        except DynamicFormation:
            skipped.append(floor)
            continue
        engine.engineLocation = const.BattleLocation.LOCAL_SERVER
        engine.seed = 0
        actor = {"heroId": 10, "heroUid": "opening-qingming", "level": 60, "attr": [0] * 8, "suit": []}
        avatar = BattleAvatar()
        avatar.init_from_dict({"heroes_gamble": {actor["heroUid"]: actor}, "yysid": actor["heroId"]})
        controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
        controller.battleEngine = engine
        engine.controllers.append(controller)
        engine.addBattlePlayer(avatar)
        engine.init()
        if engine.getFbConfig() is not original or engine.monsterWaveCount != len(configured):
            raise RuntimeError(f"Unexpected original configuration for Secret Zone floor {floor}")

        create, created, waves = engine.createMonsterEntity, [], []

        def observe(camp, owner, placement):
            entity = create(camp, owner, placement)
            created.append((placement.Index, placement.level, entity))
            return entity

        engine.createMonsterEntity = observe
        fallback = mirror_fallback() if floor == MIRROR_FLOOR else None
        for index, formation in enumerate(configured):
            created.clear()
            engine._finishedWaveCount = index
            engine._createNextRoundMons()
            expected = placements(formation)
            if [(pos, level, entity.protoid) for pos, level, entity in created] != [
                    (pos, level, fallback if proto == -1 else proto) for pos, level, proto in expected]:
                raise RuntimeError(f"Unexpected original placements for Secret Zone floor {floor}, wave {index + 1}")
            panels = []
            for (position, level, proto), (_, _, entity) in zip(expected, created):
                if proto == -1:
                    panels.append({"id": proto, "position": position, "level": level})
                    continue
                attr = entity.AttrComp
                stats = (attr.hp, attr.speed, attr.attack, attr.defense, attr.critRate)
                if not all(type(value) in (int, float) and isfinite(value) for value in stats):
                    raise RuntimeError(f"Invalid initial stats for Secret Zone floor {floor}, wave {index + 1}")
                panels.append({"id": entity.protoid, "position": position, "level": level,
                               **dict(zip(("hp", "speed", "attack", "defense", "critRate"), stats))})
            waves.append(panels)
        # The Secret Zone entry supplies no Team Assist search ID. Use only an
        # unambiguous entry carrying the exact original dungeon title and floor.
        number = config["floor_num"]
        label = types[number-1] + "层" if 1 <= number <= 10 else "番外"
        codes = code_scenes[config["title"] + "·" + label] if config["advanced"] == 0 else []
        entrance = "race" if config["advanced"] else "team" if config["need_team"] else "solo"
        floors[floor] = {"sceneId": engine.combineSceneInfoId, "entrance": entrance, "solo": secret_solo(config),
                         "codeStageId": codes[0] if len(codes) == 1 else None,
                         "allyOrbs": engine.campData1.shareGuiHuo, "enemyOrbs": engine.campData2.initGuihuo,
                         "waves": waves}
        if fallback is not None:
            floors[floor]["mirror"] = {"wave": MIRROR_WAVE, "fallbackId": fallback}
        if config["yys_replacement_id"] or config["type"] == JINYUJI_TYPE:
            floors[floor]["replacement"] = secret_replacement(engine)
        if setup := secret_mechanic(config):
            floors[floor]["mechanic"] = setup
        if protection := secret_protection(config):
            support, target = protection
            if len(waves) != 1 or sum(unit["id"] == target for unit in waves[0]) != 1:
                raise RuntimeError(f"Unexpected original protection target for Secret Zone floor {floor}")
            floors[floor]["protection"] = {"supportId": support, "targetId": target}

    if not floors or host.oracle.unsupported:
        raise RuntimeError(f"Native Secret Zone opening verification incomplete: {host.oracle.unsupported}")
    tables = ("dungeon_challenge_series", "team_assist_stage", "yys_replacement", "hero", "Constant")
    return {**source, "engineSHA256": modules.rows["battleengine.engine.ChallengeFbEngine"]["marshalSHA256"],
            "tableSHA256": {name: modules.rows[f"com.data.cdata.{name}"]["marshalSHA256"] for name in tables},
            "totalFloors": len(entries), "skipped": skipped, "floors": floors}


def extract_part(runtime_path, output, part, workers):
    runtime = json.loads(runtime_path.read_text(encoding="utf-8-sig"))
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(600, exit=True)
    with TemporaryDirectory(prefix="yuqi-secret-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work, part, workers)
        finally:
            os.chdir(previous)
    output.write_text(json.dumps(data, allow_nan=False), encoding="utf-8")
    os._exit(0)


def extract_all(runtime, workers):
    with TemporaryDirectory(prefix="yuqi-secret-parts-") as directory:
        def run_part(part):
            output = Path(directory, f"part-{part}.json")
            cmd = [sys.executable, "-X", "utf8", str(Path(__file__).resolve()), "--runtime", str(runtime),
                   "--output", str(output), "--workers", str(workers), "--part", str(part)]
            result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, encoding="utf-8")
            if result.returncode:
                raise RuntimeError(f"Original Secret Zone opening extraction part {part} failed:\n{result.stderr}")
            return json.loads(output.read_text(encoding="utf-8"))

        with ThreadPoolExecutor(workers) as pool:
            parts = list(pool.map(run_part, range(workers)))
    floors, skipped = {}, []
    base = {key: value for key, value in parts[0].items() if key not in {"floors", "skipped"}}
    for part in parts:
        rows, absent = part.pop("floors"), part.pop("skipped")
        if part != base or floors.keys() & rows.keys():
            raise RuntimeError("Secret Zone opening extraction parts disagree")
        floors.update(rows)
        skipped.extend(absent)
    if len(floors.keys() | {str(floor) for floor in skipped}) != base["totalFloors"]:
        raise RuntimeError("Secret Zone opening extraction omitted floors")
    base["skipped"] = sorted(skipped)
    base["floors"] = dict(sorted(floors.items(), key=lambda row: int(row[0])))
    return base


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    parser.add_argument("--part", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    runtime, output = args.runtime.resolve(), args.output.resolve()
    if args.part is not None:
        if not 0 <= args.part < args.workers:
            parser.error("Invalid extraction part")
        extract_part(runtime, output, args.part, args.workers)
    data = extract_all(runtime, args.workers)
    write_openings(output, data)


def write_openings(output, data):
    floors = data["floors"]
    encoder = json.JSONEncoder(ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    fields = {key: value for key, value in data.items() if key != "floors"}
    metadata = json.dumps(fields, ensure_ascii=False, indent=2, allow_nan=False).removesuffix("\n}")
    rows = ",\n".join(f'    "{floor}":{encoder.encode(row)}' for floor, row in floors.items())
    js = "(function(root){\n const data = " + metadata + ',\n  "floors":{\n' + rows + "\n  }\n };\n"
    js += " if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasSecretOpenings=data;\n})(globalThis);\n"
    output.write_text(js, encoding="utf-8", newline="\n")
    placements = sum(unit["id"] > 0 for row in floors.values() for wave in row["waves"] for unit in wave)
    print(f"{len(floors)} floors, {sum(row['solo'] for row in floors.values())} solo entries, "
          f"{placements} fixed enemy placements, {len(data['skipped'])} skipped formations", flush=True)


if __name__ == "__main__":
    main()
