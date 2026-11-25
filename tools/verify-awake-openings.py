"""Extract original opening stats for the ordinary formation of every Awakening floor."""

import argparse
import faulthandler
import json
from math import isfinite
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


def extract(runtime, work):
    from awake_stage import awake_stage
    from rune_floor_host import prepare_runtime

    modules, host, source = prepare_runtime(runtime, work)
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.AwakeFbEngine import const, DATA_AWAKE_FB, helpers
    from com.data.cdata import team_assist_stage

    level_limits = helpers.global_get_const_value(131)
    floors = {}
    for floor in sorted(DATA_AWAKE_FB.data):
        engine, config, enemy_ids = awake_stage(floor)
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
        if engine.bossId != enemy_ids or engine.monsterWaveCount != 1:
            raise RuntimeError(f"Unexpected original wave configuration for floor {floor}")

        created, create = [], engine.createMonsterEntity

        def observe(camp, owner, placement):
            entity = create(camp, owner, placement)
            created.append((placement.Index, placement.level, entity))
            return entity

        engine.createMonsterEntity = observe
        engine._createNextRoundMons()
        expected = [(slot, config["level"], hero_id) for slot, hero_id in enumerate(enemy_ids, 1)]
        if [(slot, level, entity.protoid) for slot, level, entity in created] != expected:
            raise RuntimeError(f"Unexpected original placement for floor {floor}")
        enemies = []
        for position, level, entity in created:
            stats = entity.AttrComp
            values = (stats.hp, stats.speed, stats.attack, stats.defense, stats.critRate)
            if not all(type(value) in (int, float) and isfinite(value) and value >= 0 for value in values):
                raise RuntimeError(f"Invalid original opening stats for floor {floor}")
            enemies.append({"id": entity.protoid, "position": position, "level": level,
                            **dict(zip(("hp", "speed", "attack", "defense", "critRate"), values))})
        # TAHelper.get_target_id adds TAConst.BattleType.AWAKE to the dungeon ID.
        code_id = team_assist_stage.search_map[20000 + floor]
        code_config = team_assist_stage.data[code_id]
        if (code_config["search_id"], code_config["ss_num"], code_config["yys_num"]) != (20000 + floor, 5, 1):
            raise RuntimeError(f"Unexpected original Team Assist entry for floor {floor}")
        floors[floor] = {"groupId": config["monsterid"], "sceneId": engine.combineSceneInfoId, "codeStageId": code_id,
                         "minPlayerLevel": int(level_limits[config["floor_num"] - 1]),
                         "allyOrbs": engine.campData1.shareGuiHuo, "enemyOrbs": engine.campData2.initGuihuo,
                         "enemies": enemies}

    if not floors or host.oracle.unsupported:
        raise RuntimeError(f"Native Awakening opening verification incomplete: {host.oracle.unsupported}")
    hashes = {name: modules.rows[f"com.data.cdata.{name}"]["marshalSHA256"] for name in
              ("dungeon_awake", "dungeon_awake_monster", "dungeon_awake_scene", "Constant", "team_assist_stage")}
    return {**source, "engineSHA256": modules.rows["battleengine.engine.AwakeFbEngine"]["marshalSHA256"],
            "tableSHA256": hashes, "floors": floors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    output = args.output.resolve()
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(110, exit=True)
    with TemporaryDirectory(prefix="yuqi-awake-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work)
        finally:
            os.chdir(previous)
    js = "(function(root){\n const data = " + json.dumps(data, indent=2, allow_nan=False) + ";\n"
    js += " if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasAwakeOpenings=data;\n})(globalThis);\n"
    output.write_text(js, encoding="utf-8", newline="\n")
    print(f"{len(data['floors'])} floors and {sum(len(row['enemies']) for row in data['floors'].values())} enemy placements",
          flush=True)
    os._exit(0)


if __name__ == "__main__":
    main()
