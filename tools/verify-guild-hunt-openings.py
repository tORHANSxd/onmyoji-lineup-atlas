"""Extract the current elemental Guild Hunting panels and Team Assist destinations."""

import argparse
import faulthandler
import json
from math import isfinite
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


def extract(runtime, work):
    from guild_hunt_stage import guild_hunt_stage, observe_guild_hunt_opening
    from rune_floor_host import prepare_runtime

    modules, host, source = prepare_runtime(runtime, work)
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.GuildHuntingBattleEngine import const, GVE_BATTLE_INFO
    from com.data.cdata import team_assist_stage

    floors = {}
    # The two Guild Hunting panels use these search IDs for the four weekdays.
    search_ids = (130008, 130007, 130009, 130010)
    for stage_id, row in sorted(GVE_BATTLE_INFO.data.items()):
        if row["week_day"] not in range(4):
            continue
        engine, config = guild_hunt_stage(stage_id)
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
        if engine.monsterWaveCount != 1 or engine.halt_battle_time != 240:
            raise RuntimeError(f"Unexpected elemental hunt limit for {stage_id}")
        enemy = observe_guild_hunt_opening(engine, config)
        engine._createNextRoundMons()
        if not all(isfinite(enemy[k]) for k in ("hp", "speed", "attack", "defense", "critRate")):
            raise RuntimeError(f"Invalid original enemy panel for {stage_id}")
        search_id = search_ids[config["week_day"]]
        code_id = team_assist_stage.search_map[search_id]
        code = team_assist_stage.data[code_id]
        if (code["search_id"], code["ss_num"], code["yys_num"]) != (search_id, 5, 1):
            raise RuntimeError(f"Unexpected Team Assist destination for {stage_id}")
        floors[stage_id] = {"sceneId": engine.combineSceneInfoId, "codeStageId": code_id, "enemy": enemy,
                            "allyOrbs": engine.campData1.shareGuiHuo, "enemyOrbs": engine.campData2.initGuihuo}

    if not floors or host.oracle.unsupported:
        raise RuntimeError(f"Elemental Guild Hunting extraction incomplete: {host.oracle.unsupported}")
    return {**source, "engineSHA256": modules.rows["battleengine.engine.GuildHuntingBattleEngine"]["marshalSHA256"],
            "tableSHA256": {name: modules.rows[f"com.data.cdata.{name}"]["marshalSHA256"] for name in
                            ("gve_battleinfo", "team_assist_stage")}, "floors": floors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    output = args.output.resolve()
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(120, exit=True)
    with TemporaryDirectory(prefix="yuqi-guild-hunt-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work)
        finally:
            os.chdir(previous)
    js = "(function(root){\n const data = " + json.dumps(data, indent=2, allow_nan=False) + ";\n"
    js += " if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasGuildHuntOpenings=data;\n})(globalThis);\n"
    output.write_text(js, encoding="utf-8", newline="\n")
    print(f"{len(data['floors'])} original elemental hunt configurations", flush=True)
    os._exit(0)


if __name__ == "__main__":
    main()
