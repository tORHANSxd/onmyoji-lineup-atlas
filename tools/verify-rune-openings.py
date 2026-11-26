"""Extract opening panels for supported original soul encounters."""

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

    modules, host, source = prepare_runtime(runtime, work)
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.Hun13Engine import Hun13Engine
    from battleengine.engine.RuneFbEngine import DATA_RUNE_FB, RuneFbEngine, const
    from com.data.cdata import currency, system_rule_dsc
    from DynamicConfigData import DATA_SKILL

    def read_floor(floor, config):
        two_rounds = floor == 103 or config["type"] == 4
        if two_rounds:
            engine = Hun13Engine({"dungeon_id": floor, "mode": "normal", "is_solo": True})
            engine.battleMode = const.BattleMode.MODE_HUN_13
        else:
            engine = RuneFbEngine({"fbId": floor})
            engine.battleMode = const.BattleMode.MODE_RUNE_FB
        engine.engineLocation = const.BattleLocation.LOCAL_SERVER
        engine.seed = 0
        avatar = BattleAvatar()
        actor = {"heroId": 10, "heroUid": "opening-qingming", "level": 60, "attr": [0] * 8, "suit": []}
        avatar.init_from_dict({"heroes_gamble": {actor["heroUid"]: actor}, "yysid": actor["heroId"]})
        controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
        controller.battleEngine = engine
        engine.controllers.append(controller)
        engine.addBattlePlayer(avatar)
        engine.init()
        configured = config["monsterWaves"]
        expected_waves = 2 if two_rounds else 1 if config["type"] == 3 else len(configured)
        if engine.monsterWaveCount != expected_waves:
            raise ValueError(f"Unexpected wave count for dungeon {floor}")
        if config["type"] in (3, 4) and any(any(wave) for wave in configured[expected_waves:]):
            raise ValueError(f"Non-empty unused wave for dungeon {floor}")

        create = engine.createMonsterEntity
        created, waves = [], []

        def observe(camp, owner, placement):
            entity = create(camp, owner, placement)
            created.append((placement.Index, placement.level, entity))
            return entity

        engine.createMonsterEntity = observe
        for index_in_floor, wave in enumerate(configured[:engine.monsterWaveCount]):
            created.clear()
            engine._finishedWaveCount = index_in_floor
            engine._createNextRoundMons()
            expected = [(pos, monster[1], monster[0]) for pos, monster in enumerate(wave, 1) if monster]
            if [(pos, level, entity.protoid) for pos, level, entity in created] != expected:
                raise ValueError(f"Unexpected native placements for dungeon {floor}, wave {index_in_floor + 1}")
            panels = []
            for pos, level, entity in created:
                stats = entity.AttrComp
                values = (stats.hp, stats.speed, stats.attack, stats.defense)
                if not all(type(value) in (int, float) and isfinite(value) and value >= 0 for value in values):
                    raise ValueError(f"Invalid panel for dungeon {floor}, wave {index_in_floor + 1}")
                panels.append({"id": entity.protoid, "position": pos, "level": level,
                               **dict(zip(("hp", "speed", "attack", "defense"), values))})
            waves.append(panels)
        result = {"scene": engine.combineSceneInfoId, "engine": type(engine).__name__, "battleMode": engine.battleMode,
                  "allyOrbs": engine.campData1.shareGuiHuo, "enemyOrbs": engine.campData2.initGuihuo, "waves": waves}
        if isinstance(engine, Hun13Engine):
            result["baseRoundSeconds"] = engine.get_totaltime()
        if config["type"] == 2:
            ticket_id, ticket_count = config["menpiao"]
            result["ticket"] = {"id": ticket_id, "count": ticket_count, "name": currency.data[ticket_id]["name"]}
            result["rules"] = [DATA_SKILL.data[(skill, 1, -1)]["desc"] for skill in (254, 255, 256)]
        if config["type"] in (3, 4):
            text = system_rule_dsc.data[config["fbtips"]]["rule_dsc"]
            result["rules"] = [line.removeprefix("※") for line in text.splitlines() if line.startswith("※")]
        return result

    configs = DATA_RUNE_FB.data
    floors = {floor: read_floor(floor, configs[floor]) for floor in sorted(configs) if configs[floor]["type"] in (1, 2, 3, 4)}
    if not floors or host.oracle.unsupported:
        raise RuntimeError(f"Native opening verification incomplete: {host.oracle.unsupported}")
    engines = {name: modules.rows[f"battleengine.engine.{name}"]["marshalSHA256"] for name in ("RuneFbEngine", "Hun13Engine")}
    return {**source, "engineSHA256": engines,
            "dungeonTableSHA256": modules.rows["com.data.cdata.dungeon_rune"]["marshalSHA256"], "floors": floors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    output = args.output.resolve()
    sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(runtime["gameTools"]).resolve())]
    faulthandler.dump_traceback_later(100, exit=True)
    with TemporaryDirectory(prefix="yuqi-rune-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work)
        finally:
            os.chdir(previous)
    js = '(function(root){\n const data = ' + json.dumps(data, indent=2, allow_nan=False) + ';\n'
    js += ' if(typeof module===\'object\'&&module.exports)module.exports=data;else root.AtlasRuneOpenings=data;\n})(globalThis);\n'
    output.write_text(js, encoding="utf-8", newline="\n")
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
