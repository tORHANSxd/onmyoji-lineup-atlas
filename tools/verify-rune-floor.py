"""Replay the client's regular 八岐大蛇 floors using selected inventory."""

import argparse
import faulthandler
import json
import math
import os
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory
import time

def run(args, runtime, work):
    from game_resources import sha256
    from rune_floor_host import prepare_runtime
    from rune_replay import monster_waves, project_playback, read_models
    from rune_team import battle_spirit, selected_team
    from unicorn.x86_const import UC_X86_REG_XMM0

    modules, host, evidence = prepare_runtime(runtime, work)
    native_api = host.oracle.api

    def host_api(name, arguments):
        if name != "acosf":
            return native_api(name, arguments)
        register = host.oracle.uc.reg_read(UC_X86_REG_XMM0) & 0xffffffff
        value, = struct.unpack("<f", struct.pack("<I", register))
        angle = math.acos(value) if -1 <= value <= 1 else math.nan
        bits, = struct.unpack("<I", struct.pack("<f", angle))
        host.oracle.uc.reg_write(UC_X86_REG_XMM0, bits)
        return 0

    host.oracle.api = host_api
    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.BattleRecorder import BattleRecorderRune
    from battleengine.battle_tools.RandomRecord import RandomRecord
    from battleengine.engine.RuneFbEngine import DATA_RUNE_FB, RuneFbEngine, const
    from DynamicConfigData import DATA_HERO

    team_bytes, suit_bytes = args.team.read_bytes(), args.suit_index.read_bytes()
    plan = json.loads(team_bytes)
    minimum = None
    if plan.get("damageFloor") is True:
        from minimum_damage import install_minimum_damage
        minimum = install_minimum_damage(modules)
    actor, fighters, inventory, choices = selected_team(plan, json.loads(suit_bytes))
    if len(fighters) != 5 or any(hero["heroId"] not in DATA_HERO.data for hero in (actor, *fighters.values())):
        raise ValueError("Invalid selected inventory team")
    player = {"heroes": {**fighters, "selected-onmyoji": actor}, "yysid": actor["heroId"]}
    spirit = plan.get("spirit")
    if spirit is not None:
        from AttrCalc import HunlingAttrCalc
        from DynamicConfigData import DATA_HUNLING_ATTR, DATA_HUNLING_BASE, DATA_HUNLING_MARK

        spirit = battle_spirit(spirit, HunlingAttrCalc)
        template = DATA_HUNLING_BASE.data.get(spirit["id"], {})
        if (actor["heroId"] not in template.get("heroIdList", ())
                or (spirit["id"], spirit["star"]) not in DATA_HUNLING_ATTR.data
                or any(mark not in DATA_HUNLING_MARK.data for mark in spirit["marks"])):
            raise ValueError("The spirit configuration does not match the battle resources")
        player["hunling_info"] = {spirit["uid"]: spirit}
        player["yys_hunling"] = {str(actor["heroId"]): spirit["uid"]}
    avatar = BattleAvatar()
    avatar.init_from_dict(player)
    avatar.inventory.update(inventory)
    avatar.defaultHeros = list(fighters)

    stage = DATA_RUNE_FB.data[args.dungeon]
    configured = stage["monsterWaves"]
    if stage["type"] != 1 or len(configured) != 3:
        raise ValueError("This floor does not use the three-wave 八岐大蛇 engine")
    engine = RuneFbEngine({"fbId": args.dungeon})
    engine.battleMode = const.BattleMode.MODE_RUNE_FB
    engine.engineLocation = const.BattleLocation.LOCAL_SERVER
    engine.seed = args.seed
    generator = engine.random
    random_record = RandomRecord(generator)
    for method in ("seed", "getstate", "setstate"):
        setattr(random_record, method, getattr(generator, method))
    engine._random = random_record
    controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
    controller.battleEngine = engine
    controller.sceneLoaded = True
    engine.addBattlePlayer(avatar)
    engine.controllers.append(controller)
    engine.op_init_flag = True
    init_engine_state = engine.init_engine_state

    def init_record_clock():
        init_engine_state()
        engine.engine_state = const.EngineState.RECORD_MODE

    engine.init_engine_state = init_record_clock
    engine._time = 1000.0
    engine.delta_time = .020
    battle_ended = engine.doBattleEnded
    create_entity = engine.onEntityCreated
    spawn_monsters = engine._createNextRoundMons
    create_monster = engine.createMonsterEntity
    formations = []
    winner, entity_models = None, {}

    def observe_end(camp):
        nonlocal winner
        battle_ended(camp)
        winner = camp

    def observe_created(entity):
        create_entity(entity)
        model = getattr(entity, "modelName", None)
        if isinstance(model, str):
            filename = model.replace("\\", "/").replace("/", "_").replace(".gim", ".json")
            uid = str(entity.uid)
            if entity_models.setdefault(uid, filename) != filename:
                entity_models[uid] = None

    def verify_wave():
        wave = engine.finishedWaveCount
        if wave != len(formations) or wave >= len(configured):
            raise RuntimeError("Unexpected original enemy wave order")
        actual = []

        def record_monster(camp, owner, placement):
            entity = create_monster(camp, owner, placement)
            actual.append([placement.Index, entity.protoid, placement.level])
            return entity

        engine.createMonsterEntity = record_monster
        try:
            result = spawn_monsters()
        finally:
            engine.createMonsterEntity = create_monster
        expected = [[pos, monster[0], monster[1]] for pos, monster in enumerate(configured[wave], 1) if monster]
        if actual != expected:
            raise RuntimeError(f"The original engine created a different enemy formation on wave {wave + 1}")
        formations.append(actual)
        return result

    engine.doBattleEnded = observe_end
    engine.onEntityCreated = observe_created
    engine._createNextRoundMons = verify_wave
    engine.init()
    if engine.seed != args.seed or engine.monsterWaveCount != 3 or engine.random is not random_record:
        raise RuntimeError("Unexpected native battle initialization")
    recorder = engine.battleRecorder or BattleRecorderRune(engine, controller)
    engine.battleRecorder = recorder
    engine.op_init(controller, actor["heroId"], list(fighters), [])
    engine.battleState = const.BattleState.BS_LOADING
    engine.op_sceneLoaded(controller)

    deadline, start = time.monotonic() + 75, engine.now_time()
    equipped_spirit = None
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        if host.oracle.unsupported:
            raise RuntimeError("Unsupported native calls: " + ", ".join(host.oracle.unsupported))
        if engine.battleState != const.BattleState.BS_SELETING_HERO or controller.selectHeroOk:
            continue
        pending = dict(choices)
        for entity in engine.heroEntities.values():
            if entity.ownerController is not controller:
                continue
            hero = entity.HeroComp.heroData
            alias = hero.heroUid
            if alias not in pending:
                continue
            setting = pending.pop(alias)
            if setting:
                engine.op_setAutoSkill(controller, entity.uid, setting)
                if controller.autoSkill.get(entity.uid) != setting:
                    raise RuntimeError("The original engine did not apply the selected automatic skill")
            if sorted(uid for uid in hero.equips if uid) != sorted(fighters.get(alias, actor)["equips"]):
                raise RuntimeError("The original engine changed the selected soul equipment")
            if alias == "selected-onmyoji" and spirit:
                attached = entity.get_hunlingData()
                if not attached or attached.uuid != spirit["uid"]:
                    raise RuntimeError("The original engine did not equip the selected spirit")
                equipped_spirit = {"id": attached.id, "star": attached.star, "level": attached.lv}
        if pending:
            raise RuntimeError("The original engine did not create every selected team member")
        engine.op_setAuto(controller, True)
        engine.op_selectHeroOk(controller)

    replay = "".join(recorder.data_list).encode("utf-8")
    result = {**evidence, "dungeonId": args.dungeon, "fixture": "selected-inventory", "seed": engine.seed,
              "battleMode": engine.battleMode, "sceneId": engine.combineSceneInfoId, "formations": formations,
              "engineSHA256": modules.rows["battleengine.engine.RuneFbEngine"]["marshalSHA256"],
              "dungeonTableSHA256": modules.rows["com.data.cdata.dungeon_rune"]["marshalSHA256"],
              "fixedStepMs": 20, "teamSHA256": sha256(team_bytes), "suitIndexSHA256": sha256(suit_bytes),
              "recordSHA256": sha256(replay),
              "completed": engine.battleState == const.BattleState.BS_OVER,
              "outcome": "win" if winner == const.CampFlag.CAMP1 else "loss" if winner == const.CampFlag.CAMP2 else "unknown",
              "wavesCleared": engine.finishedWaveCount, "bouts": engine._bout_counter,
              "engineSeconds": round(engine.now_time() - start, 6), "spirit": equipped_spirit}
    if minimum is not None:
        result["minimumDamage"] = minimum
    if replay:
        try:
            result["monsterHealth"] = monster_waves(replay)["waves"]
        except (KeyError, IndexError, TypeError, ValueError):
            pass
        try:
            model_root = work / "src/model_info"
            manifest = {file.name: sha256(file.read_bytes()) for file in model_root.glob("*.json")}
            projection = project_playback(replay, entity_models, read_models(model_root, manifest))
            result["animationPlayback"] = {key: projection[key] for key in (
                "combatElapsedMs", "combatOverlapMs", "overlapMs", "interruptedClips")}
            result["animationPlayback"]["unresolved"] = len(projection["unresolved"])
        except (OSError, KeyError, IndexError, TypeError, ValueError):
            pass
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("runtime", "team", "suit-index", "output"):
        parser.add_argument("--" + flag, required=True, type=lambda value: Path(value).resolve())
    parser.add_argument("--dungeon", required=True, type=int, choices=[*range(1, 11), 101])
    parser.add_argument("--seed", required=True, type=int)
    args = parser.parse_args()
    if not 0 <= args.seed < 10000:
        parser.error("--seed must be between 0 and 9999")
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(95, exit=True)
    with TemporaryDirectory(prefix="yuqi-rune-floor-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            result = run(args, runtime, work)
        finally:
            os.chdir(previous)
    args.output.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
