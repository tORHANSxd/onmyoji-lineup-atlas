"""Replay selected teams in the original two-round 虚无 and 永生之海 engine."""

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


def prepare_teams(plan, suits, selected_team):
    legacy = "rounds" not in plan
    source = [{"onmyoji": plan["onmyoji"], "spirit": plan.get("spirit"), "members": team}
              for team in plan.get("teams", [])] if legacy else plan["rounds"]
    if (not isinstance(source, list) or len(source) != 2 or any(not isinstance(row, dict)
            or not isinstance(row.get("members"), list) or len(row["members"]) != 5 for row in source)):
        raise ValueError("Select two complete five-shikigami teams")
    teams = [row["members"] for row in source]
    if len({member["instanceId"] for team in teams for member in team}) != 10:
        raise ValueError("The same shikigami instance cannot enter both rounds")
    items = [soul["id"] for team in teams for member in team for soul in member["souls"]]
    if len(set(items)) != len(items):
        raise ValueError("The two teams must have simultaneous equipment")

    inventory, heroes, rounds = {}, {}, []
    for index, row in enumerate(source, 1):
        actor, fighters, equips, choices = selected_team(row, suits)
        prefix = f"r{index}-"
        actor_alias = "selected-onmyoji" if legacy else prefix + "onmyoji"
        lineup = [prefix + alias for alias in fighters]
        for alias, hero in fighters.items():
            hero["equips"] = [prefix + equip for equip in hero["equips"]]
            heroes[prefix + alias] = hero
        inventory.update((prefix + alias, item) for alias, item in equips.items())
        rounds.append({"lineup": lineup, "actor": actor, "actorAlias": actor_alias, "spirit": row.get("spirit"),
                       "choices": {alias: choices[alias.removeprefix(prefix)] for alias in lineup}
                       | {actor_alias: choices["selected-onmyoji"]}})
    heroes.update((row["actorAlias"], row["actor"]) for row in rounds)
    return heroes, inventory, rounds


def replay(runtime, work, args):
    from game_resources import sha256
    from rune_floor_host import prepare_runtime
    from rune_replay import monster_waves, project_playback, read_models
    from rune_team import battle_spirit, selected_team
    from unicorn.x86_const import UC_X86_REG_XMM0

    plan_bytes, suit_bytes = args.team.read_bytes(), args.suit_index.read_bytes()
    plan = json.loads(plan_bytes)
    heroes, inventory, rounds = prepare_teams(plan, json.loads(suit_bytes), selected_team)
    modules, host, evidence = prepare_runtime(runtime, work)
    minimum = None
    if plan.get("damageFloor") is True:
        from minimum_damage import install_minimum_damage
        minimum = install_minimum_damage(modules)
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
    from battleengine.engine.Hun13Engine import DATA_RUNE_FB, Hun13Engine, const
    from DynamicConfigData import DATA_HERO

    if any(hero["heroId"] not in DATA_HERO.data for hero in heroes.values()):
        raise ValueError("Unknown inventory character")
    source = {"heroes": heroes, "yysid": rounds[0]["actor"]["heroId"], "hunling_info": {}}
    if any(row["spirit"] is not None for row in rounds):
        from AttrCalc import HunlingAttrCalc
        from DynamicConfigData import DATA_HUNLING_ATTR, DATA_HUNLING_BASE, DATA_HUNLING_MARK

    for index, row in enumerate(rounds, 1):
        if row["spirit"] is None:
            continue
        actor, spirit = row["actor"], row["spirit"]
        spirit = battle_spirit(spirit, HunlingAttrCalc)
        if "rounds" in plan:
            spirit["uid"] = f"r{index}-spirit"
        template = DATA_HUNLING_BASE.data.get(spirit["id"], {})
        if (actor["heroId"] not in template.get("heroIdList", ())
                or (spirit["id"], spirit["star"]) not in DATA_HUNLING_ATTR.data
                or any(mark not in DATA_HUNLING_MARK.data for mark in spirit["marks"])):
            raise ValueError("Invalid inventory spirit for the selected onmyoji")
        source["hunling_info"][spirit["uid"]] = spirit
        row["spirit"] = spirit
    avatar = BattleAvatar()
    avatar.init_from_dict(source)
    avatar.inventory.update(inventory)
    actors = {alias: avatar.heroes[alias] for alias in {row["actorAlias"] for row in rounds}}
    stage = DATA_RUNE_FB.data[args.dungeon]
    if stage["type"] != (1 if args.dungeon == 103 else 4):
        raise ValueError("The selected floor is not an ordinary two-round dungeon")
    formations = []
    engine = Hun13Engine({"dungeon_id": args.dungeon, "mode": "normal", "is_solo": True})
    engine.battleMode = const.BattleMode.MODE_HUN_13
    engine.engineLocation = const.BattleLocation.LOCAL_SERVER
    engine.seed = args.seed
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
    create_actor = engine.createYYSEntity
    start_round = engine.startBattle
    settle_round = engine.onMaybeBattleEnded
    finish_battle = engine.doBattleEnded
    create_entity = engine.onEntityCreated
    spawn_monsters, create_monster = engine._createNextRoundMons, engine.createMonsterEntity
    history, selected = {}, set()
    entity_models = {}
    winner = None

    def select_inventory_at_summon(owner, *extra):
        wave = engine.finishedWaveCount
        if owner is not controller or wave not in (0, 1):
            raise RuntimeError("Unexpected original round selection")
        selected_round = rounds[wave]
        for actor_alias in actors:
            if actor_alias != selected_round["actorAlias"]:
                avatar.heroes.pop(actor_alias, None)
        alias = selected_round["actorAlias"]
        avatar.heroes[alias] = actors[alias]
        avatar.defaultYYSId = selected_round["actor"]["heroId"]
        avatar.defaultHeros = selected_round["lineup"][:]
        spirit = selected_round["spirit"]
        avatar.yysEquipHunLingInfo = {str(avatar.defaultYYSId): spirit["uid"]} if spirit else {}
        return create_actor(owner, *extra)

    def observe_round_start():
        wave = engine.finishedWaveCount
        if wave not in selected or wave in history:
            raise RuntimeError("The battle started without confirmed inventory")
        start_round()
        if set(controller.bannedHeroes) != set(rounds[0]["lineup"]):
            raise RuntimeError("The original first-round restriction did not match the selected inventory")
        history[wave] = {"wave": wave + 1, "start": engine.waveBeginTime,
                         "availableSeconds": engine.get_totaltime() + int(engine.bonus_time)}
        if "rounds" in plan:
            row = rounds[wave]
            history[wave]["onmyojiId"] = row["actor"]["heroId"]
            history[wave]["spiritId"] = row["spirit"]["id"] if row["spirit"] else None

    def observe_round_end(camp):
        wave = engine.finishedWaveCount
        report = history[wave]
        report.update({"cleared": camp == const.CampFlag.CAMP1,
                       "seconds": round(engine.now_time() - report.pop("start"), 6)})
        settle_round(camp)
        if wave == 0:
            report["carriedSeconds"] = round(engine.bonus_time, 6)
            report["carriedBudgetSeconds"] = int(engine.bonus_time)

    def observe_battle_end(camp):
        nonlocal winner
        finish_battle(camp)
        winner = camp

    def observe_entity(entity):
        create_entity(entity)
        model = getattr(entity, "modelName", None)
        if isinstance(model, str):
            filename = model.replace("\\", "/").replace("/", "_").replace(".gim", ".json")
            uid = str(entity.uid)
            if entity_models.setdefault(uid, filename) != filename:
                entity_models[uid] = None

    def verify_enemy_round():
        wave = engine.finishedWaveCount
        if wave != len(formations) or wave not in (0, 1):
            raise RuntimeError("Unexpected enemy formation order")
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
        expected = [[pos, unit[0], unit[1]] for pos, unit in enumerate(stage["monsterWaves"][wave], 1) if unit]
        if actual != expected:
            raise RuntimeError(f"The original engine created a different formation for round {wave + 1}")
        formations.append(actual)
        return result

    engine.createYYSEntity = select_inventory_at_summon
    engine.startBattle = observe_round_start
    engine.onMaybeBattleEnded = observe_round_end
    engine.doBattleEnded = observe_battle_end
    engine.onEntityCreated = observe_entity
    engine._createNextRoundMons = verify_enemy_round
    engine.init()
    if (engine.dungeon_id != args.dungeon or not engine.is_solo or engine.mode != "normal"
            or engine.combineSceneInfoId != stage["scene"] or engine.seed != args.seed
            or engine.monsterWaveCount != 2 or engine.get_totaltime() != 120):
        raise RuntimeError("Unexpected native normal solo configuration")
    recorder = engine.battleRecorder or BattleRecorderRune(engine, controller)
    engine.battleRecorder = recorder
    engine.battleState = const.BattleState.BS_LOADING
    engine.op_sceneLoaded(controller)

    deadline, start = time.monotonic() + 150, engine.now_time()
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        if host.oracle.unsupported:
            raise RuntimeError("Unsupported native calls: " + ", ".join(host.oracle.unsupported))
        if engine.battleState != const.BattleState.BS_SELETING_HERO or controller.selectHeroOk:
            continue
        wave = engine.finishedWaveCount
        pending = dict(rounds[wave]["choices"])
        for entity in engine.heroEntities.values():
            if entity.ownerController is not controller:
                continue
            hero = entity.HeroComp.heroData
            alias = hero.heroUid
            if alias not in pending or sorted(uid for uid in hero.equips if uid) != sorted(heroes[alias]["equips"]):
                raise RuntimeError("The engine summoned an unexpected character or changed equipment")
            setting = pending.pop(alias)
            if setting:
                engine.op_setAutoSkill(controller, entity.uid, setting)
                if controller.autoSkill.get(entity.uid) != setting:
                    raise RuntimeError("The engine rejected the selected automatic skill")
            if alias == rounds[wave]["actorAlias"]:
                spirit = rounds[wave]["spirit"]
                attached = entity.get_hunlingData()
                if getattr(attached, "uuid", None) != (spirit["uid"] if spirit else None):
                    raise RuntimeError("The engine did not apply the selected spirit")
        if pending:
            raise RuntimeError("The engine did not summon all selected inventory characters")
        selected.add(wave)
        engine.op_setAuto(controller, True)
        engine.op_selectHeroOk(controller)

    record = "".join(recorder.data_list).encode("utf-8")
    completed = engine.battleState == const.BattleState.BS_OVER and winner in (const.CampFlag.CAMP1, const.CampFlag.CAMP2)
    for report in history.values():
        if "start" in report:
            report.update(cleared=None, seconds=round(engine.now_time() - report.pop("start"), 6))
    result = {**evidence, "dungeonId": engine.dungeon_id, "route": "normal-solo-hun13", "seed": engine.seed, "fixedStepMs": 20,
              "battleMode": engine.battleMode, "sceneId": engine.combineSceneInfoId, "formations": formations,
              "dungeonTableSHA256": modules.rows["com.data.cdata.dungeon_rune"]["marshalSHA256"],
              "engineSHA256": modules.rows["battleengine.engine.Hun13Engine"]["marshalSHA256"],
              "teamSHA256": sha256(plan_bytes), "suitIndexSHA256": sha256(suit_bytes), "recordSHA256": sha256(record),
              "completed": completed, "outcome": "win" if winner == const.CampFlag.CAMP1 else "loss" if completed else "unknown",
              "wavesCleared": sum(row["cleared"] is True for row in history.values()),
              "engineSeconds": round(engine.now_time() - start, 6), "rounds": list(history.values())}
    if minimum is not None:
        result["minimumDamage"] = minimum
    if record:
        try:
            waves = monster_waves(record)["waves"]
            for wave in waves:
                report = history.get(wave["wave"] - 1, {})
                # The round counter also advances when round one loses.
                wave["cleared"] = report.get("cleared") is True
            result["monsterHealth"] = waves
        except (KeyError, IndexError, TypeError, ValueError):
            pass
        try:
            model_root = work / "src/model_info"
            manifest = {file.name: sha256(file.read_bytes()) for file in model_root.glob("*.json")}
            projection = project_playback(record, entity_models, read_models(model_root, manifest))
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
    parser.add_argument("--dungeon", type=int, default=103, choices=(103, 2001, 2002, 2003, 2005))
    parser.add_argument("--seed", required=True, type=int)
    args = parser.parse_args()
    if not 0 <= args.seed < 10000:
        parser.error("--seed must be between 0 and 9999")
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    sys.path[:0] = [str(Path(__file__).resolve().parent), runtime["gameTools"]]
    faulthandler.dump_traceback_later(165, exit=True)
    with TemporaryDirectory(prefix="yuqi-hun13-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            result = replay(runtime, work, args)
        finally:
            os.chdir(previous)
    args.output.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
