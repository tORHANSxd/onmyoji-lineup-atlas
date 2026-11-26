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
    from general_soul_stage import SCORE_STAGES, SOLO_SCORE_MODES, SoloScoreReplay, solo_score_stage
    from guild_hunt_stage import GUILD_HUNT_MODE, HuntOpening, hunt_tactics
    from guild_retreat_stage import RETREAT_MODE, GuildRetreatRaid, RetreatWindow
    from hunling_stage import HUNLING_MODES, HUNLING_REPLAY_SECONDS, HunlingReplay, hunling_stage, challenge_stages, exploration_stages
    from journey_hard_stage import JOURNEY_HARD_MODE, JourneyHardReplay
    from qiling_group_stage import QILING_GROUP_MODE, QILING_GROUP_REPLAY_SECONDS, QiLingGroupReplay
    from regional_boss_stage import REGION_HARD_MODE, REGION_MODE, REGION_MODES, RegionalBossReplay, regional_boss_stage
    from resource_stage import RESOURCE_MODE, RESOURCE_STAGE_NAMES, ROUTES
    from shilian_routes import SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE, SHILIAN_MODES
    from shilian_stage import ArtifactReplay, MoonTrial, REPLAY_SECONDS as SHILIAN_REPLAY_SECONDS, guard_battle_input, shilian_stage, verify_opening, verify_run_state
    from true_orochi_stage import OROCHI_MODE, OROCHI_REPLAY_SECONDS, OROCHI_STAGE, OrochiReplay, orochi_stage, orochi_team
    from tuzhizhu_practice import PRACTICE_MODES, PRACTICE_REPLAY_SECONDS, TsuchigumoPractice, practice_stage
    from underworld_stage import UNDERWORLD_MODE, UnderworldReplay, underworld_stage, underworld_teams
    from yuling_stage import YULING_MODE
    from rune_floor_host import prepare_runtime
    from rune_replay import monster_waves, project_playback, read_models
    from rune_team import battle_spirit, preset_player, selected_team
    from unicorn.x86_const import UC_X86_REG_XMM0

    team_bytes, suit_bytes = args.team.read_bytes(), args.suit_index.read_bytes()
    plan = json.loads(team_bytes)
    suits = json.loads(suit_bytes)
    relay = args.mode == UNDERWORLD_MODE
    orochi = args.mode == OROCHI_MODE
    hunling = args.mode in HUNLING_MODES
    qiling = args.mode == QILING_GROUP_MODE
    retreat = args.mode == RETREAT_MODE
    regional = args.mode in REGION_MODES
    yanwu = args.mode == FENGMO_YANWU_MODE
    activity_score = SOLO_SCORE_MODES.get(args.mode)
    journey_hard = args.mode == JOURNEY_HARD_MODE
    spider = args.mode in PRACTICE_MODES
    shilian = args.mode in SHILIAN_MODES
    shilian_event = ({"id": args.shilian_event_id, "difficulty": args.shilian_difficulty, "moves": args.shilian_moves}
                     if args.mode == SHILIAN_EVENT_MODE else None)
    if relay:
        heroes, inventory, actors, rounds = underworld_teams(plan, suits)
    elif orochi:
        fighters, inventory, choices, actors = orochi_team(plan, suits)
        actor = actors["selected-onmyoji"][0]
        heroes = {**fighters, **{alias: profile for alias, (profile, _) in actors.items()}}
    else:
        actor, fighters, inventory, choices = selected_team(plan, suits, member_limit=6 if yanwu or shilian else 5)
        heroes = {**fighters, "selected-onmyoji": actor}
        if shilian:
            choices.pop("selected-onmyoji")
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
    elif orochi:
        from DynamicConfigData import DATA_HERO

        engine, orochi_floors, const = orochi_stage(args.stage)
        group_id, wave_count = orochi_floors[0][0], len(orochi_floors)
    elif hunling:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The original Hunling solo fight needs five owned shikigami")
        engine, group, hunling_route, const = hunling_stage(args.stage, args.mode, args.capture_item)
        group_id, wave_count = group["ID"], 1
    elif shilian:
        from DynamicConfigData import DATA_HERO

        engine, group, dao, const = shilian_stage(args.stage, fighters, args.shilian_trial_slot, shilian_event, args.shilian_state)
        group_id, wave_count = group["ID"], 1
    elif qiling:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The collective Hunling replay needs five owned shikigami")
        collective = QiLingGroupReplay(args.stage, args.qiling_window, args.qiling_hp)
        engine, group, const = collective.engine, collective.group, collective.const
        group_id, wave_count = group["ID"], 1
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
    elif activity_score:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The solo activity requires five owned shikigami")
        engine, group, score_activity_id, const = solo_score_stage(args.mode, args.stage)
        group_id, wave_count = group["ID"], 1
    elif journey_hard:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Sea Journey requires five owned shikigami")
        journey = JourneyHardReplay(args.stage, args.journey_blessings, args.journey_deadline)
        engine, group, const = journey.engine, journey.group, journey.const
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
        from com.data.cdata import map_boss
        from com.data.cdata import shilian_event_battles, shilian_event_exam, shilian_liudao
        from DynamicConfigData import BattleMonstersInfo, DATA_HERO, DATA_PVE_STAGE_DATA

        stage_id = str(args.stage)
        stage = DATA_PVE_STAGE_DATA.data.get(stage_id)
        if stage is None:
            raise ValueError(f"Unknown native PvE stage {stage_id}")
        if args.stage in SCORE_STAGES:
            raise ValueError("This activity requires its dedicated original score battle engine")
        if stage.get("name") in RESOURCE_STAGE_NAMES:
            raise ValueError("Experience and coin encounters require their dedicated entry")
        if any(args.stage == floor[0] for floor in map_boss.data[OROCHI_STAGE]["gk_list"]):
            raise ValueError("True Orochi floors require the original continuous dungeon engine")
        if (args.stage in dict(challenge_stages()) or args.stage in dict(exploration_stages())
                or args.stage == 800021 or 810001 <= args.stage <= 810009):
            raise ValueError("Hunling stages require their dedicated original engine and scenario")
        if any(args.stage == row[field] for table, field in (
                (shilian_event_battles, "battle_id"), (shilian_event_exam, "battle_id"), (shilian_liudao, "pve_id"))
               for row in table.data.values()):
            raise ValueError("Six Realms stages require their dedicated original engine and scenario")
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

    actor_id = rounds[0]["id"] if relay else actor["heroId"]
    player = preset_player(heroes, actors, actor_id) if relay or orochi else {"heroes": heroes, "yysid": actor_id}
    if shilian and args.shilian_state and args.shilian_state.get("guard"):
        player["behind_spirit_info"] = guard_battle_input(args.shilian_state["guard"])
    spirit = None if relay or orochi or shilian else plan.get("spirit")
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
    avatar.defaultHeros = rounds[0]["members"][:] if relay else list(fighters)[:6] if orochi else list(fighters)

    if retreat:
        route = "guild-retreat-personal-window"
        raid_window = RetreatWindow(raid, const, args.window_seconds)
    elif relay:
        route = "underworld-gate-local-solo"
    elif orochi:
        route = "true-orochi-local-solo"
    elif hunling:
        route = "hunling-personal-challenge" if hunling_route[2] is not None else "hunling-regional-exploration"
    elif qiling:
        route = "qiling-collective-local-window"
    elif shilian:
        state_label = "configured" if args.shilian_state else "full-health"
        route = f"six-realms-{state_label}-{'encounter' if shilian_event else 'trial'}"
    elif regional:
        route = "regional-boss-ordinary-scenario" if args.mode == REGION_MODE else "regional-boss-hard-scenario"
    elif yanwu:
        route = "fengmo-yanwu-solo"
    elif activity_score:
        route = activity_score.route
    elif journey_hard:
        route = "journey-hard-solo"
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
    orochi_replay = OrochiReplay(engine, controller, const, orochi_floors, fighters, actors, choices, player["yys_hunling"]) if orochi else None
    hunling_replay = HunlingReplay(engine, controller, group, hunling_route, const, args.capture_item, args.capture_cards) if hunling else None
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
    score_replay = SoloScoreReplay(engine, group, const) if activity_score else None
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
    elif orochi:
        formation_matches = (engine.monstergroup == group_id and engine.combineSceneInfoId == 40007
                             and engine.maxPresetSSCount == 13 and engine.maxPresetYYSCount == 2)
    elif regional:
        formation_matches = engine.monstergroup == group_id and engine.combineSceneInfoId == formation["resindex"]
        if args.mode == REGION_HARD_MODE:
            formation_matches = (formation_matches and engine.startLevel == args.region["star"]
                                 and engine.condition == args.region["modifierIds"])
    elif yanwu or activity_score or journey_hard or spider or hunling or qiling or shilian:
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
    moon_trial = MoonTrial(engine, controller, group, choices) if args.mode == SHILIAN_EXAM_MODE and dao == 1 else None
    if not relay:
        engine.op_init(controller, actor_id, avatar.defaultHeros[:], [])
    engine.battleState = const.BattleState.BS_LOADING
    engine.op_sceneLoaded(controller)

    replay_seconds = (PRACTICE_REPLAY_SECONDS if spider else 220 if retreat else OROCHI_REPLAY_SECONDS if orochi
                      else HUNLING_REPLAY_SECONDS if hunling else QILING_GROUP_REPLAY_SECONDS if qiling
                      else SHILIAN_REPLAY_SECONDS if shilian else 130 if relay else 75)
    deadline, start = time.monotonic() + replay_seconds, engine.now_time()
    selection_checked = False
    equipped_spirit = None
    instructions = None
    trial_hero = None
    event_bonus = None
    shilian_opening = None
    artifact_replay = (ArtifactReplay(engine, controller, const, args.shilian_state, dao, start)
                       if shilian and args.shilian_state and args.shilian_state.get("artifacts") else None)
    if tactics:
        boss = raid.boss["protoId"] if retreat else group["MonstersInfos"][0][0][1] if yanwu or qiling or activity_score else stage["monsters"][0][0]
        instructions = HuntOpening(engine, controller, const, tactics, boss)
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        if shilian and args.shilian_state and shilian_opening is None and engine.battleState == const.BattleState.BS_STARTED:
            shilian_opening = verify_run_state(engine, controller, args.shilian_state)
            if artifact_replay:
                artifact_replay.verify_opening()
        if moon_trial:
            moon_trial.update()
        if artifact_replay:
            fighting = engine.battleState == const.BattleState.BS_STARTED
            if moon_trial:
                fighting = fighting and moon_trial.phase in (moon_trial.phase_enum.HIT_MAN, moon_trial.phase_enum.HIT_WOMEN)
            artifact_replay.update(fighting)
        if host.oracle.unsupported:
            raise RuntimeError("Unsupported native calls: " + ", ".join(host.oracle.unsupported))
        if regional_replay and regional_replay.eligible is False:
            break
        if yanwu_replay:
            yanwu_replay.update()
        if score_replay:
            score_replay.update()
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
        if orochi_replay:
            orochi_replay.prepare()
        if hunling_replay:
            hunling_replay.update()
        if qiling:
            collective.update(winner)
            if collective.reason:
                break
        if engine.battleState != const.BattleState.BS_SELETING_HERO or controller.selectHeroOk or controller.isExited:
            continue
        if underworld:
            underworld.select()
            selection_checked = bool(underworld.confirmed)
            continue
        if orochi_replay:
            selection_checked = orochi_replay.select()
            continue
        if shilian:
            trial_hero = verify_opening(engine, group, args.shilian_trial_slot)
            if shilian_event:
                event_bonus = engine.get_monster_add_all_attr_rate()
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
    if qiling:
        completed = collective.reason is not None
        outcome = "win" if collective.reason == "boss-defeated" else "loss" if completed else "unknown"
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
    if orochi_replay:
        report["trueOrochi"] = {**orochi_replay.report(), "settlement": outcome}
        if completed and engine.finishedWaveCount < engine.monsterWaveCount:
            report["outcome"] = "loss"
    if hunling_replay:
        report["hunling"] = hunling_replay.report(completed)
        if hunling_route[2] is not None:
            report["wavesCleared"] = int(report["hunling"]["weakened"])
    if qiling:
        report["qilingCollective"] = collective.report()
        if instructions:
            report["qilingCollective"].update(instructions.report())
        report["wavesCleared"] = int(outcome == "win")
    if shilian:
        report["sixRealms"] = {"dao": dao, "trialSlot": args.shilian_trial_slot, "trialHero": trial_hero,
                               "difficulty": engine.difficulty, "rounds": engine.lbs_bout_counter}
        report["wavesCleared"] = int(outcome == "win")
        if shilian_event:
            report["sixRealms"].update(eventId=shilian_event["id"], moveCount=engine.move_count,
                                       battleType=engine.battle_type, enemyAttributeBonus=event_bonus)
        if args.shilian_state:
            if shilian_opening is None:
                raise RuntimeError("The original Six Realms engine did not start the requested run state")
            report["sixRealms"]["runState"] = shilian_opening
            if artifact_replay:
                shilian_opening.update(artifact_replay.report())
        if moon_trial:
            phases = moon_trial.report(report["outcome"])
            report["sixRealms"].update(phases)
            report["waveCount"], report["wavesCleared"] = len(group["MonstersInfos"]), phases["phasesCleared"]
    if regional_replay:
        report["regionalBoss"] = regional_replay.report(completed, winner)
    if yanwu_replay:
        report["fengmoYanwu"] = yanwu_replay.report(completed)
        if instructions:
            report["fengmoYanwu"].update(instructions.report())
    if score_replay:
        report[activity_score.report_key] = score_replay.report(completed, [row["heroId"] for row in fighters.values()],
                                                               actor_id, score_activity_id)
        if instructions:
            report[activity_score.report_key].update(instructions.report())
    if journey_hard:
        report["journeyHard"] = journey.report()
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
    from general_soul_stage import SOLO_SCORE_MODES
    from guild_hunt_stage import GUILD_HUNT_MODE
    from guild_retreat_stage import RETREAT_MODE, RETREAT_BOSSES
    from hunling_stage import CAPTURE_ITEMS, HUNLING_BOSS, HUNLING_MODES, HUNLING_REPLAY_SECONDS
    from journey_hard_stage import JOURNEY_HARD_MODE
    from qiling_group_stage import QILING_GROUP_MODE, QILING_GROUP_LIMIT, QILING_GROUP_REPLAY_SECONDS
    from regional_boss_stage import REGION_MODES
    from resource_stage import RESOURCE_MODE
    from shilian_routes import SHILIAN_EVENT_MODE, SHILIAN_MODES
    from shilian_stage import REPLAY_SECONDS as SHILIAN_REPLAY_SECONDS, valid_run_state
    from true_orochi_stage import OROCHI_MODE, OROCHI_REPLAY_SECONDS
    from tuzhizhu_practice import PRACTICE_MODES, PRACTICE_REPLAY_SECONDS
    from underworld_stage import UNDERWORLD_MODE
    from yuling_stage import YULING_MODE

    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("runtime", "team", "suit-index", "output"):
        parser.add_argument("--" + flag, required=True, type=lambda value: Path(value).resolve())
    parser.add_argument("--mode", type=int, choices=(3, 29, 266, YULING_MODE, RESOURCE_MODE, GUILD_HUNT_MODE, UNDERWORLD_MODE, OROCHI_MODE, RETREAT_MODE, FENGMO_YANWU_MODE, JOURNEY_HARD_MODE, QILING_GROUP_MODE, *SOLO_SCORE_MODES, *SHILIAN_MODES, *REGION_MODES, *PRACTICE_MODES, *HUNLING_MODES), default=3)
    parser.add_argument("--stage", required=True, type=int)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--minimum-damage", action="store_true")
    parser.add_argument("--boss", type=int, choices=RETREAT_BOSSES)
    parser.add_argument("--raid-round", type=int, choices=(1, 2, 3), default=1)
    parser.add_argument("--guild-members", type=int, default=0)
    parser.add_argument("--window-seconds", type=int, default=1800)
    parser.add_argument("--region", type=json.loads)
    parser.add_argument("--capture-item", type=int, choices=CAPTURE_ITEMS)
    parser.add_argument("--capture-cards", type=int, nargs=3, choices=range(1, 6))
    parser.add_argument("--qiling-window", type=int)
    parser.add_argument("--qiling-hp", type=int)
    parser.add_argument("--journey-blessings", type=int)
    parser.add_argument("--journey-deadline", type=int)
    parser.add_argument("--shilian-trial-slot", type=int, choices=range(1, 7))
    parser.add_argument("--shilian-event-id", type=int)
    parser.add_argument("--shilian-difficulty", type=int, choices=(1, 2, 3))
    parser.add_argument("--shilian-moves", type=int)
    parser.add_argument("--shilian-state", type=json.loads)
    args = parser.parse_args()
    if args.stage <= 0 or not 0 <= args.seed < 10000:
        parser.error("--stage must be positive and --seed must be between 0 and 9999")
    if args.mode == RETREAT_MODE and (args.boss is None or not 0 <= args.guild_members <= 50 or not 1 <= args.window_seconds <= 1800):
        parser.error("The retreat needs a boss, 0 to 50 guild members and a 1 to 1800-second window")
    if (args.mode in REGION_MODES) != (args.region is not None):
        parser.error("--region is required only for a Regional Boss scenario")
    if (args.capture_item is None) != (args.capture_cards is None) or args.capture_item is not None and (
            args.mode != HUNLING_BOSS or len(set(args.capture_cards)) != 3):
        parser.error("A Hunling capture attempt requires an item and three distinct lineup positions")
    if (args.mode == QILING_GROUP_MODE) != (args.qiling_window is not None) or args.qiling_window is not None and (
            not 1 <= args.qiling_window <= QILING_GROUP_LIMIT or args.qiling_hp is not None and args.qiling_hp < 1):
        parser.error("A collective Hunling replay needs a valid scoring window and starting HP")
    if args.mode != QILING_GROUP_MODE and args.qiling_hp is not None:
        parser.error("Starting shared HP is only available for a collective Hunling replay")
    if args.mode == JOURNEY_HARD_MODE:
        if (args.journey_blessings is None or not 0 <= args.journey_blessings < 2 ** 53
                or args.journey_deadline is None or not 1 <= args.journey_deadline < 2 ** 53):
            parser.error("A Sea Journey boss challenge needs blessing stacks and a positive battle deadline")
    elif args.journey_blessings is not None or args.journey_deadline is not None:
        parser.error("Sea Journey settings only apply to its boss challenges")
    if (args.mode in SHILIAN_MODES) != (args.shilian_trial_slot is not None):
        parser.error("A Six Realms trial needs an explicit eligible roster position")
    if args.shilian_state is not None and (args.mode not in SHILIAN_MODES or not valid_run_state(args.shilian_state)):
        parser.error("A Six Realms run state needs six life caps, six marks, and valid optional skills, artifacts and guard")
    event_options = (args.shilian_event_id, args.shilian_difficulty, args.shilian_moves)
    if args.mode == SHILIAN_EVENT_MODE:
        if any(value is None for value in event_options) or args.shilian_event_id <= 0 or not 0 <= args.shilian_moves < 2 ** 53:
            parser.error("A Six Realms encounter needs the original event ID, difficulty and a nonnegative move count")
    elif any(value is not None for value in event_options):
        parser.error("Six Realms encounter options are only valid for an encounter")
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    sys.path.insert(1, runtime["gameTools"])
    watchdog_seconds = (PRACTICE_REPLAY_SECONDS + 20 if args.mode in PRACTICE_MODES else
                        OROCHI_REPLAY_SECONDS + 20 if args.mode == OROCHI_MODE else
                        HUNLING_REPLAY_SECONDS + 20 if args.mode in HUNLING_MODES else
                        QILING_GROUP_REPLAY_SECONDS + 20 if args.mode == QILING_GROUP_MODE else
                        SHILIAN_REPLAY_SECONDS + 20 if args.mode in SHILIAN_MODES else
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
