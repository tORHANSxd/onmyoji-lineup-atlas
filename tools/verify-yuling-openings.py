"""Extract the original enemy opening panels and Team Assist IDs for Undying Guardian."""

import argparse
import faulthandler
import json
from math import isfinite
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


def extract(runtime, work):
    from rune_floor_host import prepare_runtime
    from yuling_stage import observe_yuling_opening, yuling_stage

    modules, host, source = prepare_runtime(runtime, work)
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.GorenFbEngine import const
    from com.data.cdata import Constant, team_assist_stage
    from DynamicConfigData import DATA_GOREN_FB

    floors = {}
    for floor in sorted(DATA_GOREN_FB.data):
        engine, config = yuling_stage(floor)
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
        if engine.monsterWaveCount != 1:
            raise RuntimeError(f"Unexpected Undying Guardian wave count for floor {floor}")

        enemies = observe_yuling_opening(engine, config)
        engine._createNextRoundMons()
        if any(not isfinite(unit[key]) for unit in enemies for key in ("hp", "speed", "attack", "defense", "critRate")):
            raise RuntimeError(f"Invalid original opening stats for floor {floor}")

        # The panel supplies BattleType.YULING (40000) to TAHelper.get_target_id.
        search_id = 40000 + floor
        code_id = team_assist_stage.search_map[search_id]
        code = team_assist_stage.data[code_id]
        if (code["search_id"], code["ss_num"], code["yys_num"]) != (search_id, 5, 1):
            raise RuntimeError(f"Unexpected original Team Assist entry for floor {floor}")
        floors[floor] = {"sceneId": engine.combineSceneInfoId, "codeStageId": code_id,
                         "allyOrbs": engine.campData1.shareGuiHuo, "enemyOrbs": engine.campData2.initGuihuo,
                         "enemies": enemies}

    if not floors or host.oracle.unsupported:
        raise RuntimeError(f"Native Undying Guardian opening verification incomplete: {host.oracle.unsupported}")
    player_level, guardian_level = map(int, Constant.data[184]["value"])
    return {**source, "engineSHA256": modules.rows["battleengine.engine.GorenFbEngine"]["marshalSHA256"],
            "tableSHA256": {name: modules.rows[f"com.data.cdata.{name}"]["marshalSHA256"] for name in
                            ("dungeon_yuling", "team_assist_stage", "Constant")},
            "minPlayerLevel": player_level, "minGuardianLevel": guardian_level, "floors": floors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    output = args.output.resolve()
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(110, exit=True)
    with TemporaryDirectory(prefix="yuqi-yuling-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work)
        finally:
            os.chdir(previous)
    head = {key: value for key, value in data.items() if key != "floors"}
    js = "(function(root){\n const data = " + json.dumps(head, indent=2, allow_nan=False)[:-2] + ",\n  \"floors\": {\n"
    js += ",\n".join(f'    "{floor}": {json.dumps(row, separators=(",", ":"), allow_nan=False)}'
                     for floor, row in data["floors"].items())
    js += "\n  }\n};\n if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasYulingOpenings=data;\n})(globalThis);\n"
    output.write_text(js, encoding="utf-8", newline="\n")
    print(f"{len(data['floors'])} floors and {sum(len(row['enemies']) for row in data['floors'].values())} enemy placements",
          flush=True)
    os._exit(0)


if __name__ == "__main__":
    main()
