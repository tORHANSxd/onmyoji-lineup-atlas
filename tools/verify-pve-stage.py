"""Replay selected inventory in a verified original solo PvE engine."""

import argparse
import faulthandler
import json
import math
import os
from pathlib import Path
import random
import struct
import sys
from tempfile import TemporaryDirectory
import time

def replay(args, runtime, work):
    from game_resources import sha256
    from fengmo_yanwu_stage import FENGMO_YANWU_MODE, FengmoYanwuReplay, fengmo_yanwu_stage
    from guild_hunt_stage import GUILD_HUNT_MODE, HuntOpening, hunt_tactics
    from guild_retreat_stage import RETREAT_MODE, GuildRetreatRaid, RetreatWindow
    from regional_boss_stage import REGION_HARD_MODE, REGION_MODE, REGION_MODES, RegionalBossReplay, regional_boss_stage
    from resource_stage import RESOURCE_MODE, RESOURCE_STAGE_NAMES, ROUTES
    from tuzhizhu_practice import PRACTICE_MODES, PRACTICE_REPLAY_SECONDS, TsuchigumoPractice, practice_stage
    from underworld_stage import UNDERWORLD_MODE, UnderworldReplay, underworld_player, underworld_stage, underworld_teams
    from yuling_stage import YULING_MODE
    from rune_floor_host import prepare_runtime
    from rune_replay import monster_waves, project_playback, read_models
    from rune_team import battle_spirit, selected_team
    from unicorn.x86_const import UC_X86_REG_XMM0

    team_bytes, suit_bytes = args.team.read_bytes(), args.suit_index.read_bytes()
    plan = json.loads(team_bytes)
    suits = json.loads(suit_bytes)
    relay = args.mode == UNDERWORLD_MODE
    retreat = args.mode == RETREAT_MODE
    regional = args.mode in REGION_MODES
    yanwu = args.mode == FENGMO_YANWU_MODE
    spider = args.mode in PRACTICE_MODES
    if relay:
        heroes, inventory, actors, rounds = underworld_teams(plan, suits)
    else:
        actor, fighters, inventory, choices = selected_team(plan, suits, member_limit=6 if yanwu else 5)
        heroes = {**fighters, "selected-onmyoji": actor}
    tactics = hunt_tactics(plan, args.mode)
    modules, host, evidence = prepare_runtime(runtime, work)
    if args.minimum_damage:
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
    from battleengine.battle_tools.RandomRecord import RandomRecord
    if retreat:
        from battleengine.engine.GuildBossEngine import const
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The personal retreat requires five shikigami")
        random.seed(args.seed)
        raid = GuildRetreatRaid(args.stage, args.boss, args.raid_round, args.guild_members)
        engine, group_id, wave_count = raid.engine, args.boss, 3
    elif relay:
        from battleengine.engine.GuildLieFengEngine import const
        from DynamicConfigData import DATA_HERO

        engine, stage, wave_count = underworld_stage(args.stage)
        group_id = args.stage
    elif regional:
        from battleengine.engine.LBSWorldBossEngine import const
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Regional Boss requires five shikigami")
        engine, formation, group_id, effective_level = regional_boss_stage(args.stage, args.region, actor["heroId"], args.mode)
        wave_count = len(formation["MonstersInfos"])
    elif yanwu:
        from battleengine.engine.FengMoEquipBattleEngine import const
        from DynamicConfigData import DATA_HERO

        engine, group, member_count = fengmo_yanwu_stage(args.stage)
        if len(fighters) != member_count:
            raise ValueError("The selected roster does not match the original solo Fengmo Yanwu route")
        group_id, wave_count = group["ID"], len(group["MonstersInfos"])
    elif spider:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Tsuchigumo practice uses five owned shikigami")
        engine, stage, group, const = practice_stage(args.stage, args.mode)
        group_id, wave_count = group["ID"], len(group["MonstersInfos"])
    elif args.mode == 29:
        from awake_stage import awake_stage
        from battleengine.engine.AwakeFbEngine import const
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Ordinary solo Awakening requires five shikigami")
    elif args.mode == 266:
        from battleengine.engine.ChallengeFbEngine import const
        from DynamicConfigData import DATA_HERO
        from secret_stage import placements, secret_solo, secret_stage

        engine, stage, waves = secret_stage(args.stage)
        if not secret_solo(stage) or len(fighters) != 5:
            raise ValueError("This Secret Zone floor does not use the verified five-shikigami solo route")
        group_id, wave_count = args.stage, len(waves)
    elif args.mode == RESOURCE_MODE:
        from battleengine.engine.NewExpEngine import const
        from DynamicConfigData import DATA_HERO
        from resource_stage import ResourceReplay

        if args.stage not in ROUTES:
            raise ValueError("Unknown experience or coin route")
        resource = ResourceReplay(modules, args.stage)
        engine, stage, formation = resource.engine, resource.stage, resource.formation
        if len(fighters) != stage["shishentotal"]:
            raise ValueError("The resource encounter requires the five combat slots")
        group_id, wave_count = stage["groupid"], len(formation["MonstersInfos"])
    elif args.mode == YULING_MODE:
        from battleengine.engine.GorenFbEngine import const
        from DynamicConfigData import DATA_HERO
        from yuling_stage import observe_yuling_opening, yuling_stage

        engine, stage = yuling_stage(args.stage)
        if len(fighters) != 5:
            raise ValueError("Solo Undying Guardian requires five shikigami")
        group_id, wave_count = args.stage, 1
    elif args.mode == GUILD_HUNT_MODE:
        from battleengine.engine.GuildHuntingBattleEngine import const
        from DynamicConfigData import DATA_HERO
        from guild_hunt_stage import guild_hunt_stage, observe_guild_hunt_opening, seed_hunt_phases

        engine, stage = guild_hunt_stage(args.stage)
        seed_hunt_phases(modules, args.seed)
        if len(fighters) != 5:
            raise ValueError("Personal Guild Hunting requires five own shikigami")
        group_id, wave_count = args.stage, 1
    else:
        from battleengine.engine.MonstarGuanKaEngine import MonstarGuanKaEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_HERO, DATA_PVE_STAGE_DATA

        stage_id = str(args.stage)
        stage = DATA_PVE_STAGE_DATA.data.get(stage_id)
        if stage is None:
            raise ValueError(f"Unknown native PvE stage {stage_id}")
        if stage.get("name") in RESOURCE_STAGE_NAMES:
            raise ValueError("Experience and coin encounters require their dedicated entry")
        group_id = stage.get("groupid")
        group = BattleMonstersInfo.data.get(group_id)
        if not group or not group.get("MonstersInfos"):
            raise ValueError(f"Stage {stage_id} has no usable original enemy formation ({group_id})")
        if any(stage.get(field) for field in ("no_yys", "replace_yysid", "isplot", "sl_file")):
            raise ValueError(f"Stage {stage_id} uses a scripted or restricted roster")
        if stage.get("shishentotal") != len(fighters):
            raise ValueError(f"Stage {stage_id} requires exactly {stage.get('shishentotal')} shikigami")
    if any(hero["heroId"] not in DATA_HERO.data for hero in heroes.values()):
        raise ValueError("Unknown inventory character")

    player = underworld_player(heroes, actors, rounds) if relay else {"heroes": heroes, "yysid": actor["heroId"]}
    spirit = None if relay else plan.get("spirit")
    if spirit is not None:
        from AttrCalc import HunlingAttrCalc
        from DynamicConfigData import DATA_HUNLING_ATTR, DATA_HUNLING_BASE, DATA_HUNLING_MARK

        spirit = battle_spirit(spirit, HunlingAttrCalc)
        template = DATA_HUNLING_BASE.data.get(spirit["id"], {})
        if (actor["heroId"] not in template.get("heroIdList", ())
                or (spirit["id"], spirit["star"]) not in DATA_HUNLING_ATTR.data
                or any(mark not in DATA_HUNLING_MARK.data for mark in spirit["marks"])):
            raise ValueError("The spirit configuration does not match the runtime")
        player["hunling_info"] = {spirit["uid"]: spirit}
        player["yys_hunling"] = {str(actor["heroId"]): spirit["uid"]}
    avatar = BattleAvatar()
    avatar.init_from_dict(player)
    avatar.inventory.update(inventory)
    avatar.defaultHeros = rounds[0]["members"][:] if relay else list(fighters)

    if retreat:
        route = "guild-retreat-personal-window"
        raid_window = RetreatWindow(raid, const, args.window_seconds)
    elif relay:
        route = "underworld-gate-local-solo"
    elif regional:
        route = "regional-boss-ordinary-scenario" if args.mode == REGION_MODE else "regional-boss-hard-scenario"
    elif yanwu:
        route = "fengmo-yanwu-solo"
    elif spider:
        route = "tuzhizhu-practice-solo"
    elif args.mode == 29:
        engine, stage, enemy_ids = awake_stage(args.stage)
        group_id, wave_count = stage["monsterid"], 1
        route = "awake-ordinary-solo"
    elif args.mode == 266:
        route = "secret-ordinary-solo"
    elif args.mode == RESOURCE_MODE:
        route = resource.route
    elif args.mode == YULING_MODE:
        route = "yuling-solo"
        yuling_opening = observe_yuling_opening(engine, stage)
    elif args.mode == GUILD_HUNT_MODE:
        route = "guild-hunting-local-owned"
        hunt_opening = observe_guild_hunt_opening(engine, stage)
    else:
        engine = MonstarGuanKaEngine({"pve_data_flag": stage_id})
        if engine.isDramaGuanKa or not engine.selectHeroEnabled:
            raise ValueError(f"Stage {stage_id} requires the original story roster")
        engine.battleMode = const.BattleMode.MODE_PVE
        wave_count = len(group["MonstersInfos"])
        route = "mode-pve-default-solo"
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
    underworld = UnderworldReplay(engine, controller, const, rounds, heroes, player["yys_hunling"]) if relay else None
    init_engine_state = engine.init_engine_state
    battle_ended, create_entity = engine.doBattleEnded, engine.onEntityCreated
    winner, entity_models = None, {}

    def init_record_clock():
        init_engine_state()
        engine.engine_state = const.EngineState.RECORD_MODE

    def observe_end(camp):
        nonlocal winner
        battle_ended(camp)
        winner = camp

    def observe_created(entity):
        create_entity(entity)
        if spider_replay:
            spider_replay.created(entity)
        if args.mode == RESOURCE_MODE:
            resource.created(entity)
        model = getattr(entity, "modelName", None)
        if isinstance(model, str):
            filename = model.replace("\\", "/").replace("/", "_").replace(".gim", ".json")
            uid = str(entity.uid)
            if entity_models.setdefault(uid, filename) != filename:
                entity_models[uid] = None

    engine.init_engine_state = init_record_clock
    engine.doBattleEnded = observe_end
    engine.onEntityCreated = observe_created
    regional_replay = RegionalBossReplay(engine, formation, args.region, effective_level, const) if regional else None
    yanwu_replay = FengmoYanwuReplay(engine, group, const) if yanwu else None
    spider_replay = TsuchigumoPractice(engine, stage, group, const) if spider else None
    verified_waves = set()
    if args.mode == 266:
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity

        def verify_spawn():
            wave = engine.finishedWaveCount
            if not 0 <= wave < wave_count:
                raise RuntimeError("Unexpected original Secret Zone wave index")
            observed = []

            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                observed.append((placement.Index, placement.level, entity.protoid))
                return entity

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if observed != placements(waves[wave]):
                raise RuntimeError(f"The original Secret Zone generated a different formation in wave {wave + 1}")
            verified_waves.add(wave)
            return result

        engine._createNextRoundMons = verify_spawn
    engine._time, engine.delta_time = 1000.0, .020
    engine.init()
    if retreat:
        formation_matches = (engine.combineSceneInfoId == 40010 and engine.currBossProtoId == raid.boss["protoId"]
                             and engine.finishedWaveCount == args.raid_round - 1 and engine.raid_id == 1
                             and engine.hard_level == args.stage and engine.buff_member_num == args.guild_members)
    elif relay:
        formation_matches = (engine.fbId == args.stage and engine.combineSceneInfoId == stage["scene"]
                             and engine.myRoundCount == 1 and engine.spectatorHeroCount == 0
                             and engine.campData1.shareGuiHuo == 2 and engine.campData2.initGuihuo == 4)
    elif regional:
        formation_matches = engine.monstergroup == group_id and engine.combineSceneInfoId == formation["resindex"]
        if args.mode == REGION_HARD_MODE:
            formation_matches = (formation_matches and engine.startLevel == args.region["star"]
                                 and engine.condition == args.region["modifierIds"])
    elif yanwu or spider:
        formation_matches = engine.monstergroup == group_id and engine.combineSceneInfoId == group["resindex"]
    elif args.mode == 29:
        formation_matches = engine.bossId == enemy_ids
    elif args.mode == 266:
        formation_matches = (engine.getFbConfig() is stage and engine.fbId == args.stage
                             and engine.combineSceneInfoId == stage["scene"])
    elif args.mode == RESOURCE_MODE:
        formation_matches = resource.matches()
    elif args.mode == YULING_MODE:
        formation_matches = engine.fbId == args.stage and engine.combineSceneInfoId == stage["scene"]
    elif args.mode == GUILD_HUNT_MODE:
        formation_matches = (engine.fbId == args.stage and engine.combineSceneInfoId == stage["scene"]
                             and engine.halt_battle_time == 240)
    else:
        formation_matches = engine.monstergroup == group_id
    if (engine.seed != args.seed or engine.random is not random_record or engine.battleMode != args.mode
            or engine.monsterWaveCount != wave_count or not formation_matches):
        raise RuntimeError("The original engine initialized a different battle")
    recorder = engine.battleRecorder or BattleRecorderRune(engine, controller)
    engine.battleRecorder = recorder
    if not relay:
        engine.op_init(controller, actor["heroId"], list(fighters), [])
    engine.battleState = const.BattleState.BS_LOADING
    engine.op_sceneLoaded(controller)

    replay_seconds = PRACTICE_REPLAY_SECONDS if spider else 220 if retreat else 130 if relay else 75
    deadline, start = time.monotonic() + replay_seconds, engine.now_time()
    selection_checked = False
    equipped_spirit = None
    instructions = None
    if tactics:
        boss = raid.boss["protoId"] if retreat else group["MonstersInfos"][0][0][1] if yanwu else stage["monsters"][0][0]
        instructions = HuntOpening(engine, controller, const, tactics, boss)
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        if host.oracle.unsupported:
            raise RuntimeError("Unsupported native calls: " + ", ".join(host.oracle.unsupported))
        if regional_replay and regional_replay.eligible is False:
            break
        if yanwu_replay:
            yanwu_replay.update()
        if spider_replay:
            spider_replay.update()
        if instructions:
            instructions.update()
        if retreat:
            raid_window.update()
            if raid_window.reason:
                break
        if underworld:
            underworld.leave_if_out_of_teams()
        if engine.battleState != const.BattleState.BS_SELETING_HERO or controller.selectHeroOk or controller.isExited:
            continue
        if underworld:
            underworld.select()
            selection_checked = bool(underworld.confirmed)
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
            if spider_replay:
                spider_replay.check_selected(entity)
            if setting:
                engine.op_setAutoSkill(controller, entity.uid, setting)
                if controller.autoSkill.get(entity.uid) != setting:
                    raise RuntimeError("The original engine did not apply the selected automatic skill")
            if instructions:
                instructions.select(alias, entity)
            if sorted(uid for uid in hero.equips if uid) != sorted(fighters.get(alias, actor)["equips"]):
                raise RuntimeError("The original engine changed the selected equipment")
            if alias == "selected-onmyoji" and spirit:
                attached = entity.get_hunlingData()
                if not attached or attached.uuid != spirit["uid"]:
                    raise RuntimeError("The original engine did not select the requested spirit")
                equipped_spirit = {"id": attached.id, "star": attached.star, "level": attached.lv}
        if pending:
            raise RuntimeError("The original engine did not create every selected character")
        engine.op_setAuto(controller, not tactics.get("manualOpening"))
        engine.op_selectHeroOk(controller)
        selection_checked = controller.selectHeroOk
    if not selection_checked:
        raise RuntimeError("The original engine did not accept the selected roster")
    if instructions and instructions.applied != tactics:
        raise RuntimeError("The battle did not apply every requested opening instruction")

    record = "".join(recorder.data_list).encode("utf-8")
    outcome = {const.CampFlag.CAMP1: "win", const.CampFlag.CAMP2: "loss"}.get(winner, "unknown")
    completed = engine.battleState == const.BattleState.BS_OVER and outcome != "unknown"
    if retreat:
        completed = raid_window.reason is not None
        outcome = "win" if raid_window.reason == "boss-defeated" else "loss" if completed else "unknown"
    module = "battleengine.engine." + type(engine).__name__
    report = {**evidence, "route": route, "stageId": args.stage, "groupId": group_id,
              "engineClass": type(engine).__name__, "engineSHA256": modules.rows[module]["marshalSHA256"],
              "battleMode": engine.battleMode, "sceneId": engine.combineSceneInfoId, "seed": engine.seed,
              "fixedStepMs": 20, "teamSHA256": sha256(team_bytes), "suitIndexSHA256": sha256(suit_bytes),
              "recordSHA256": sha256(record), "recordLines": len(record.splitlines()),
              "completed": completed, "outcome": outcome if completed else "unknown", "waveCount": engine.monsterWaveCount,
              "wavesCleared": engine.finishedWaveCount, "bouts": engine._bout_counter,
              "engineSeconds": round(engine.now_time() - start, 6), "spirit": equipped_spirit}
    if underworld:
        report["underworld"] = underworld.report()
    if regional_replay:
        report["regionalBoss"] = regional_replay.report(completed, winner)
    if yanwu_replay:
        report["fengmoYanwu"] = yanwu_replay.report(completed)
        if instructions:
            report["fengmoYanwu"].update(instructions.report())
    if spider_replay:
        report["tuzhizhuPractice"] = spider_replay.report(report["outcome"])
    if retreat:
        report["waveCount"], report["wavesCleared"] = 1, int(outcome == "win")
        report["guildRetreat"] = {**raid_window.report(), "guildMembers": args.guild_members,
                                  "raidSHA256": modules.rows["battleengine.raid.raid_controllers.RaidComp_1"]["marshalSHA256"]}
        if instructions:
            report["guildRetreat"].update(instructions.report())
    if args.mode == 266:
        report["formationsVerified"] = len(verified_waves)
    if args.mode == RESOURCE_MODE:
        key, result = resource.report(report["outcome"])
        report[key] = result
    if args.mode == YULING_MODE:
        if not yuling_opening:
            raise RuntimeError("The original Undying Guardian never created its opening formation")
        report["formationsVerified"] = 1
        report["opening"] = yuling_opening
    if args.mode == GUILD_HUNT_MODE:
        from battleengine.engine.GuildHuntingBattleEngine import helpers

        damage = engine.get_my_total_damage()
        settled = engine.engineUserData.get("myTotalDmg")
        if not hunt_opening or type(damage) is not int or damage < 0 or (
                completed and (type(settled) not in (int, float) or helpers.deal_float_to_int(settled) != damage)):
            raise RuntimeError("Guild Hunting did not return a matching original formation and score")
        report["guildHunt"] = {"opening": hunt_opening, "damage": damage, "deadlineSeconds": engine.halt_battle_time,
                               "phaseRandomSeed": args.seed}
        if instructions:
            report["guildHunt"].update(instructions.report())
    if args.minimum_damage:
        report["minimumDamage"] = minimum
    try:
        report["monsterHealth"] = monster_waves(record)["waves"]
    except (KeyError, IndexError, TypeError, ValueError):
        report["monsterHealth"] = None
    try:
        model_root = work / "src/model_info"
        manifest = {file.name: sha256(file.read_bytes()) for file in model_root.glob("*.json")}
        projection = project_playback(record, entity_models, read_models(model_root, manifest))
        report["animationPlayback"] = {key: projection[key] for key in (
            "combatElapsedMs", "combatOverlapMs", "overlapMs", "interruptedClips")}
        report["animationPlayback"]["unresolved"] = len(projection["unresolved"])
    except (OSError, KeyError, IndexError, TypeError, ValueError):
        report["animationPlayback"] = None
    return report


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from fengmo_yanwu_stage import FENGMO_YANWU_MODE
    from guild_hunt_stage import GUILD_HUNT_MODE
    from guild_retreat_stage import RETREAT_MODE, RETREAT_BOSSES
    from regional_boss_stage import REGION_MODES
    from resource_stage import RESOURCE_MODE
    from tuzhizhu_practice import PRACTICE_MODES, PRACTICE_REPLAY_SECONDS
    from underworld_stage import UNDERWORLD_MODE
    from yuling_stage import YULING_MODE

    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("runtime", "team", "suit-index", "output"):
        parser.add_argument("--" + flag, required=True, type=lambda value: Path(value).resolve())
    parser.add_argument("--mode", type=int, choices=(3, 29, 266, YULING_MODE, RESOURCE_MODE, GUILD_HUNT_MODE, UNDERWORLD_MODE, RETREAT_MODE, FENGMO_YANWU_MODE, *REGION_MODES, *PRACTICE_MODES), default=3)
    parser.add_argument("--stage", required=True, type=int)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--minimum-damage", action="store_true")
    parser.add_argument("--boss", type=int, choices=RETREAT_BOSSES)
    parser.add_argument("--raid-round", type=int, choices=(1, 2, 3), default=1)
    parser.add_argument("--guild-members", type=int, default=0)
    parser.add_argument("--window-seconds", type=int, default=1800)
    parser.add_argument("--region", type=json.loads)
    args = parser.parse_args()
    if args.stage <= 0 or not 0 <= args.seed < 10000:
        parser.error("--stage must be positive and --seed must be between 0 and 9999")
    if args.mode == RETREAT_MODE and (args.boss is None or not 0 <= args.guild_members <= 50 or not 30 <= args.window_seconds <= 1800):
        parser.error("The retreat needs a boss, 0 to 50 guild members and a 30 to 1800-second window")
    if (args.mode in REGION_MODES) != (args.region is not None):
        parser.error("--region is required only for a Regional Boss scenario")
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    sys.path.insert(1, runtime["gameTools"])
    watchdog_seconds = (PRACTICE_REPLAY_SECONDS + 20 if args.mode in PRACTICE_MODES else
                        240 if args.mode == RETREAT_MODE else 150 if args.mode == UNDERWORLD_MODE else 95)
    faulthandler.dump_traceback_later(watchdog_seconds, exit=True)
    with TemporaryDirectory(prefix="yuqi-pve-stage-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            report = replay(args, runtime, work)
        finally:
            os.chdir(previous)
    args.output.write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if report["completed"] else 2)


if __name__ == "__main__":
    main()
