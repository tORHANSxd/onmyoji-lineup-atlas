"""Extract opening panels for every Guild Boss difficulty, boss, and raid round."""

import argparse
import faulthandler
import json
from math import isfinite
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


def extract(runtime, work):
    from guild_retreat_stage import CODE_TARGETS, RETREAT_BOSSES, RETREAT_MODE, GuildRetreatRaid
    from rune_floor_host import prepare_runtime

    modules, host, source = prepare_runtime(runtime, work)
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.GuildBossEngine import const
    from com.data.cdata import team_assist_stage
    from DynamicConfigData import DATA_RAID_INFO, DATA_BOSS_INFO

    difficulties = {}
    boss_code = {}
    for boss, target in CODE_TARGETS.items():
        code = team_assist_stage.data[target]
        if (code["ss_num"], code["yys_num"]) != (5, 1):
            raise RuntimeError(f"Invalid Guild Boss Team Assist destination {target}")
        boss_code[boss] = {"codeStageId": target, "id": DATA_BOSS_INFO.data[boss]["protoId"]}

    for raid_id, difficulty in sorted(DATA_RAID_INFO.data):
        if raid_id != 1:
            continue
        waves = []
        for number in (1, 2, 3):
            panels = {}
            for boss_id in RETREAT_BOSSES:
                raid = GuildRetreatRaid(difficulty, boss_id, number, member_count=0)
                engine = raid.engine
                engine.engineLocation = const.BattleLocation.LOCAL_SERVER
                engine.seed = 0
                avatar = BattleAvatar()
                avatar.init_from_dict({"heroes": {}, "yysid": 10})
                controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
                controller.battleEngine = engine
                engine.controllers.append(controller)
                engine.addBattlePlayer(avatar)
                engine.init()
                if (engine.battleMode, engine.combineSceneInfoId, engine.monsterWaveCount, engine.finishedWaveCount) != (
                        RETREAT_MODE, 40010, 3, number - 1):
                    raise RuntimeError("Unexpected original retreat opening")
                engine._createNextRoundMons()
                units = list(engine.monsterEntities.values())
                if len(units) != 1:
                    raise RuntimeError("The original retreat spawned a different opening formation")
                panel = raid.opening_panel(units[0])
                if not all(isfinite(value) for value in panel.values()):
                    raise RuntimeError("The original retreat returned an invalid opening panel")
                panels[boss_id] = panel
                engine.destroy()
            waves.append(panels)
        difficulties[difficulty] = waves
    if len(difficulties) != 20 or host.oracle.unsupported:
        raise RuntimeError(f"Guild Boss opening extraction is incomplete: {host.oracle.unsupported}")
    return {**source, "engineSHA256": modules.rows["battleengine.engine.GuildBossEngine"]["marshalSHA256"],
            "raidSHA256": modules.rows["battleengine.raid.raid_controllers.RaidComp_1"]["marshalSHA256"],
            "tableSHA256": {name: modules.rows[f"com.data.cdata.{name}"]["marshalSHA256"] for name in
                            ("boss_info", "raid_info", "team_assist_stage")}, "bosses": boss_code,
            "difficulties": difficulties}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    output = args.output.resolve()
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(120, exit=True)
    with TemporaryDirectory(prefix="yuqi-guild-retreat-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work)
        finally:
            os.chdir(previous)
    js = "(function(root){\n const data = " + json.dumps(data, indent=2, allow_nan=False) + ";\n"
    js += " if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasGuildRetreatOpenings=data;\n})(globalThis);\n"
    output.write_text(js, encoding="utf-8", newline="\n")
    print(f"{sum(len(panels) for waves in data['difficulties'].values() for panels in waves)} original Guild Boss openings", flush=True)
    os._exit(0)


if __name__ == "__main__":
    main()
