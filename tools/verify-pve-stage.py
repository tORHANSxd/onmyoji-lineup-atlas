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

ENGINE_START_SECONDS = 1000
SPECIAL_NIAN_WALL_SECONDS = 145


def replay(args, runtime, work):
    from devil_feast_stage import (DEVIL_FEAST_MODE, DEVIL_FEAST_STAGES, DEVIL_FEAST_WALL_SECONDS,
                                  LAOLAO_FUSION_STAGE, LAOLAO_MODE, LAOLAO_STAGES, LAOLAO_WALL_SECONDS,
                                  TOWER_MODE, TOWER_WALL_SECONDS,
                                  DevilFeastReplay, GhostKingTowerReplay, LaolaoChallengeReplay, tower_stage_kind)
    from dojo_area_stage import DOJO_AREA_MODE, DojoAreaReplay, dojo_area_stage, is_dojo_area_stage
    from game_resources import sha256
    from fengmo_band_stage import FENGMO_BAND_MODE, FENGMO_BAND_STAGES, FengmoBandReplay
    from fengmo_band_together import (BAND_ONLINE_STAGES, BAND_TOGETHER_MODE, BAND_TOGETHER_STAGES,
                                      BAND_TOGETHER_WALL_SECONDS, BandTogetherReplay)
    from fengmo_yanwu_stage import FENGMO_YANWU_MODE, FengmoYanwuReplay, fengmo_yanwu_stage
    from general_soul_stage import SCORE_STAGES, SOLO_SCORE_MODES, SoloScoreReplay, solo_score_stage
    from guild_crevice_stage import CREVICE_MODE, CREVICE_STAGES, CREVICE_WALL_SECONDS, CreviceReplay
    from guild_forest_stage import FOREST_MODE, FOREST_STAGES, ForestReplay, forest_stage
    from guild_hunt_stage import GUILD_HUNT_MODE, HuntOpening, hunt_tactics
    from guild_retreat_stage import RETREAT_MODE, GuildRetreatRaid, RaidDamageWindow
    from hunling_stage import HUNLING_MODES, HUNLING_REPLAY_SECONDS, HunlingReplay, hunling_stage, challenge_stages, exploration_stages
    from journey_hard_stage import (JOURNEY_HARD_MODE, YINYANG_BOSS_MODE, YINYANG_BOSS_STAGE, YINYANG_BOSS_WALL_SECONDS,
                                    JourneyHardReplay, YinYangBossReplay)
    from fengmo_dusk_stage import DUSK_MODE, DUSK_WALL_SECONDS, DuskWraithReplay
    from fengmo_songstress_stage import SONG_MODE, SONG_WALL_SECONDS, SongstressReplay
    from fengmo_mirage_stage import MIRAGE_MODE, MIRAGE_WALL_SECONDS, MirageReplay
    from fengmo_catfish_stage import CATFISH_MODE, CATFISH_WALL_SECONDS, CatfishReplay
    from fengmo_skeleton_stage import SKELETON_MODE, SKELETON_WALL_SECONDS, SkeletonReplay
    from fengmo_longche_stage import LONGCHE_MODE, LONGCHE_WALL_SECONDS, LongcheReplay
    from laolao_fusion_stage import LAOLAO_FUSION_MODE, FUSION_WALL_SECONDS, LaolaoFusionReplay
    from pve_clock import NativePveClock, pve_wall_seconds
    from map_boss_stage import (MODES as MAP_BOSS_MODES, ARCHIVED_NIAN_STAGES, MEITUAN_MODE, NIAN_MODES,
                                QINFEI_FOOD_CHAIN_SECONDS, QINFEI_FOOD_MODE, QINFEI_SIDE_STAGES, QINFEI_STATIC_STAGES,
                                SPECIAL_NIAN_MODE, MapBossReplay, MeituanReplay, NianReplay, QinfeiFoodReplay,
                                QinfeiSideReplay, entry_for_stage,
                                party_positions, qinfei_food_profile)
    from qiling_group_stage import QILING_GROUP_MODE, QILING_GROUP_REPLAY_SECONDS, QiLingGroupReplay
    from qinfei_boss_stage import QINFEI_BOSS_MODE, QINFEI_BOSS_STAGE, QINFEI_BOSS_REPLAY_SECONDS, QinfeiBossRaid
    from regional_boss_stage import REGION_HARD_MODE, REGION_MODE, REGION_MODES, RegionalBossReplay, regional_boss_stage
    from resource_stage import RESOURCE_MODE, RESOURCE_STAGE_NAMES, ROUTES
    from shilian_routes import SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE, SHILIAN_MODES
    from shilian_stage import ArtifactReplay, MoonTrial, REPLAY_SECONDS as SHILIAN_REPLAY_SECONDS, guard_battle_input, shilian_stage, verify_opening, verify_run_state
    from superghost_stage import HISTORICAL_GHOST_MODE, SUPERGHOST_MODE, SUPERGHOST_WALL_SECONDS, HistoricalGhostReplay, SuperGhostReplay
    from tianfa_stage import (TIANFA_LOBBY_STAGE, TIANFA_MEMBER_COUNT, TIANFA_MODE, TIANFA_REPLAY_SECONDS,
                              TIANFA_STAGES, TianfaReplay)
    from ten_anniversary_stage import (TEN_DEFAULT_BONUS, TEN_OWNED_MODES, TEN_REPLAY_SECONDS, TEN_TOWER,
                                       TenAnniversaryReplay, is_ten_anniversary_stage, ten_anniversary_stage)
    from ten_anniversary_boss import TEN_BOSS_MODE, TEN_BOSS_STAGE, TenBossReplay, ten_boss_stage
    from ten_anniversary_explore import TEN_EXPLORE_MODE, TenExploreReplay, exploration_uid, ten_explore_stage
    from true_orochi_stage import OROCHI_MODE, OROCHI_REPLAY_SECONDS, OROCHI_STAGE, OrochiReplay, orochi_stage, orochi_team
    from tuzhizhu_practice import PRACTICE_MODES, PRACTICE_REPLAY_SECONDS, TsuchigumoPractice, practice_stage
    from underworld_stage import UNDERWORLD_MODE, UnderworldReplay, underworld_stage, underworld_teams
    from yuling_stage import YULING_MODE
    from rune_floor_host import prepare_runtime
    from rune_replay import monster_waves, project_playback, read_models
    from rune_team import battle_spirit, preset_player, selected_team, stage_actor_placeholder
    from unicorn.x86_const import UC_X86_REG_XMM0

    team_bytes, suit_bytes = args.team.read_bytes(), args.suit_index.read_bytes()
    plan = json.loads(team_bytes)
    suits = json.loads(suit_bytes)
    relay = args.mode == UNDERWORLD_MODE
    orochi = args.mode == OROCHI_MODE
    hunling = args.mode in HUNLING_MODES
    qiling = args.mode == QILING_GROUP_MODE
    crevice = args.mode == CREVICE_MODE
    superghost = args.mode == SUPERGHOST_MODE
    historical_ghost = args.mode == HISTORICAL_GHOST_MODE
    retreat = args.mode == RETREAT_MODE
    qinfei_boss = args.mode == QINFEI_BOSS_MODE
    qinfei_food = args.mode == QINFEI_FOOD_MODE
    raid_battle = retreat or qinfei_boss
    regional = args.mode in REGION_MODES
    yanwu = args.mode == FENGMO_YANWU_MODE
    fengmo_band = args.mode == FENGMO_BAND_MODE
    band_together = args.mode == BAND_TOGETHER_MODE
    devil_feast = args.mode == DEVIL_FEAST_MODE
    ghost_king_tower = args.mode == TOWER_MODE
    laolao_challenge = args.mode == LAOLAO_MODE
    dusk_wraith = args.mode == DUSK_MODE
    songstress = args.mode == SONG_MODE
    mirage = args.mode == MIRAGE_MODE
    catfish = args.mode == CATFISH_MODE
    skeleton = args.mode == SKELETON_MODE
    longche = args.mode == LONGCHE_MODE
    laolao_fusion = args.mode == LAOLAO_FUSION_MODE
    activity_score = SOLO_SCORE_MODES.get(args.mode)
    dojo_area = args.mode == DOJO_AREA_MODE
    forest = args.mode == FOREST_MODE
    ten_anniversary = args.mode in TEN_OWNED_MODES
    ten_boss = args.mode == TEN_BOSS_MODE
    ten_explore = args.mode == TEN_EXPLORE_MODE
    tianfa = args.mode == TIANFA_MODE
    journey_hard = args.mode == JOURNEY_HARD_MODE
    yinyang_boss = args.mode == YINYANG_BOSS_MODE
    map_boss_replay = None
    qinfei_side_replay = None
    pve_clock = None
    spider = args.mode in PRACTICE_MODES
    shilian = args.mode in SHILIAN_MODES
    secret_actor_config = None
    secret_actor_report = None
    shilian_event = ({"id": args.shilian_event_id, "difficulty": args.shilian_difficulty, "moves": args.shilian_moves}
                     if args.mode == SHILIAN_EVENT_MODE else None)
    if ten_explore:
        heroes, fighters, inventory, choices = {}, {}, {}, {}
    elif relay:
        heroes, inventory, actors, rounds = underworld_teams(plan, suits)
    elif orochi:
        fighters, inventory, choices, actors = orochi_team(plan, suits)
        actor = actors["selected-onmyoji"][0]
        heroes = {**fighters, **{alias: profile for alias, (profile, _) in actors.items()}}
    else:
        actor, fighters, inventory, choices = selected_team(
            plan, suits, member_limit=6 if yanwu or shilian or tianfa or songstress else 5,
            select_actor=not ten_boss and (args.mode != 266 or "onmyoji" in plan))
        heroes = {**fighters, "selected-onmyoji": actor} if actor else dict(fighters)
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
    if qinfei_boss:
        from battleengine.engine.QinfeiBossEngine import const
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The Qinfei boss replay requires five owned shikigami")
        random.seed(args.seed)
        raid = QinfeiBossRaid(modules, tuple(args.qinfei_profile))
        engine, group_id, wave_count = raid.engine, QINFEI_BOSS_STAGE, 1
    elif retreat:
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
    elif crevice:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The Guild Crevice replay needs five owned shikigami")
        crevice_replay = CreviceReplay(args.stage, args.crevice_window)
        engine, const = crevice_replay.engine, crevice_replay.const
        group_id, wave_count = crevice_replay.route["groupId"], 1
    elif superghost or historical_ghost:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The Super Ghost replay needs five owned shikigami")
        ghost_replay = (HistoricalGhostReplay(args.stage, args.historical_ghost_window) if historical_ghost
                        else SuperGhostReplay(args.stage, args.ghost_settings))
        engine, const = ghost_replay.engine, ghost_replay.const
        group_id, wave_count = args.stage, 1
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
    elif devil_feast:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Devil Feast requires five owned shikigami")
        feast = DevilFeastReplay(modules, args.stage, args.devil_feast_hp)
        engine, group, const = feast.engine, feast.group, feast.const
        group_id, wave_count = group["ID"], 1
    elif fengmo_band:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Fengmo Band personal bosses require five owned shikigami")
        band = FengmoBandReplay(modules, args.stage)
        engine, group, const = band.engine, band.group, band.const
        group_id, wave_count = group["ID"], 1
    elif band_together:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Fengmo Band co-op practice requires five owned shikigami")
        together = BandTogetherReplay(modules, args.stage, args.band_score, *args.band_carry)
        engine, group, const = together.engine, together.group, together.const
        group_id, wave_count = group["ID"], 1
    elif ten_explore:
        from DynamicConfigData import DATA_HERO

        engine, group, const, ten_profiles = ten_explore_stage(modules, args.stage, plan)
        actor = heroes["selected-onmyoji"] = stage_actor_placeholder()
        group_id, wave_count = group["ID"], 1
    elif ten_boss:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Shichangji boss requires five owned shikigami")
        engine, const, ten_groups, ten_actor, ten_assists = ten_boss_stage(modules)
        actor = heroes["selected-onmyoji"] = stage_actor_placeholder()
        group_id, wave_count = TEN_BOSS_STAGE, 1
    elif ten_anniversary:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Shichangji activity requires five owned shikigami")
        ten_bonuses = [TEN_DEFAULT_BONUS, *args.ten_bonuses]
        engine, group, const, ten_deadline = ten_anniversary_stage(modules, args.mode, args.stage, ten_bonuses)
        group_id, wave_count = group["ID"], 1
    elif forest:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Forest of Secrets requires five owned shikigami")
        engine, group, const, forest_event = forest_stage(modules, args.stage, args.forest_event)
        group_id, wave_count = group["ID"], 1
    elif dojo_area:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Eight-Hundred Tanuki requires five owned shikigami")
        engine, group, const, dojo_play, dojo_deadline = dojo_area_stage(modules, args.stage, *args.dojo_area)
        group_id, wave_count = group["ID"], 1
    elif activity_score:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("The solo activity requires five owned shikigami")
        engine, group, score_activity_id, const = solo_score_stage(args.mode, args.stage)
        group_id, wave_count = group["ID"], 1
    elif tianfa:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != TIANFA_MEMBER_COUNT:
            raise ValueError("Tianfa requires six owned shikigami")
        tianfa_replay = TianfaReplay(args.stage, args.tianfa_team)
        engine, group, const = tianfa_replay.engine, tianfa_replay.group, tianfa_replay.const
        group_id, wave_count = group["ID"], 1
    elif ghost_king_tower:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Kyoto Investigation requires five own shikigami")
        tower = GhostKingTowerReplay(modules, args.stage, args.tower_settings)
        engine, group, const = tower.engine, tower.group, tower.const
        group_id, wave_count = group["ID"], 1
    elif laolao_challenge:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Laolao Challenge requires five owned shikigami")
        laolao = LaolaoChallengeReplay(modules, args.stage, args.laolao_settings)
        engine, group, const = laolao.engine, laolao.group, laolao.const
        group_id, wave_count = group["ID"], len(group["MonstersInfos"])
    elif catfish:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Catfish requires five owned shikigami")
        catfish_replay = CatfishReplay(modules, args.catfish_settings)
        engine, group, const = catfish_replay.engine, catfish_replay.group, catfish_replay.const
        group_id, wave_count = group["ID"], 1
    elif skeleton:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Huangkulou requires five owned shikigami")
        skeleton_replay = SkeletonReplay(modules, args.skeleton_settings)
        engine, group, const = skeleton_replay.engine, skeleton_replay.group, skeleton_replay.const
        group_id, wave_count = group["ID"], 1
    elif longche:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Longche requires five owned shikigami")
        longche_replay = LongcheReplay(modules, args.longche_settings)
        engine, group, const = longche_replay.engine, longche_replay.group, longche_replay.const
        group_id, wave_count = group["ID"], 1
    elif mirage:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Mirage requires five owned shikigami")
        mirage_replay = MirageReplay(modules, args.mirage_settings)
        engine, group, const = mirage_replay.engine, mirage_replay.group, mirage_replay.const
        group_id, wave_count = group["ID"], 1
    elif songstress:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 6:
            raise ValueError("Songstress requires six owned shikigami")
        song = SongstressReplay(modules, args.song_window)
        engine, group, const = song.engine, song.group, song.const
        group_id, wave_count = group["ID"], 1
    elif dusk_wraith:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Night Wraith requires five owned shikigami")
        dusk = DuskWraithReplay(modules, args.dusk_settings)
        engine, group, const = dusk.engine, dusk.group, dusk.const
        group_id, wave_count = group["ID"], 1
    elif laolao_fusion:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Laolao Fusion requires five owned shikigami")
        fusion = LaolaoFusionReplay(modules, args.fusion_settings)
        engine, group, const = fusion.engine, fusion.group, fusion.const
        group_id, wave_count = group["ID"], 1
    elif journey_hard:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Sea Journey requires five owned shikigami")
        journey = JourneyHardReplay(args.stage, args.journey_blessings, args.journey_deadline)
        engine, group, const = journey.engine, journey.group, journey.const
        group_id, wave_count = group["ID"], len(group["MonstersInfos"])
    elif yinyang_boss:
        from DynamicConfigData import DATA_HERO

        if len(fighters) != 5:
            raise ValueError("Yin Yang Defence requires five owned shikigami")
        yinyang = YinYangBossReplay(modules, args.stage, args.yinyang_drums, args.yinyang_buffs or [])
        engine, group, const = yinyang.engine, yinyang.group, yinyang.const
        group_id, wave_count = group["ID"], 1
    elif args.mode in MAP_BOSS_MODES:
        from DynamicConfigData import DATA_HERO

        positions = party_positions(args.mode, args.map_boss_players)
        if not positions or len(fighters) != sum(map(len, positions)):
            raise ValueError("Selected shikigami count does not match the original map boss positions")
        if args.mode in NIAN_MODES:
            map_boss_replay = NianReplay(modules, args.stage, args.map_boss_players, args.mode, ENGINE_START_SECONDS)
        elif args.mode == MEITUAN_MODE:
            map_boss_replay = MeituanReplay(modules, args.stage, args.map_boss_players)
        elif qinfei_food:
            map_boss_replay = QinfeiFoodReplay(modules, args.stage, args.map_boss_players, args.qinfei_food_next or ())
        else:
            map_boss_replay = MapBossReplay(modules, args.stage, args.map_boss_players, args.mode)
        engine, const = map_boss_replay.engine, map_boss_replay.const
        group_id, wave_count = map_boss_replay.group_id, 1 if qinfei_food else map_boss_replay.wave_count
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
        from secret_stage import (JINYUJI_TYPE, MIRROR_FLOOR, SecretMechanicReplay, SecretMirrorReplay,
                                  SecretProtectionReplay, check_secret_actor, placements, secret_mechanic,
                                  secret_protection, secret_replacement, secret_solo,
                                  secret_stage)

        engine, stage, waves = secret_stage(args.stage)
        if not secret_solo(stage) or len(fighters) != 5:
            raise ValueError("This Secret Zone floor does not use the verified five-shikigami solo route")
        if stage["yys_replacement_id"] or stage["type"] == JINYUJI_TYPE:
            secret_actor_config = secret_replacement(engine)
            actor = heroes["selected-onmyoji"] = stage_actor_placeholder()
            choices.pop("selected-onmyoji", None)
        elif actor is None:
            raise ValueError("This Secret Zone floor requires an onmyoji in the selected lineup")
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
        if is_dojo_area_stage(args.stage):
            raise ValueError("Eight-Hundred Tanuki requires its original scoring engine")
        if args.stage in FOREST_STAGES:
            raise ValueError("Forest of Secrets requires its original scoring engine and event")
        if is_ten_anniversary_stage(args.stage):
            raise ValueError("Shichangji activity stages require their original activity route")
        if args.stage in FENGMO_BAND_STAGES or args.stage in (*BAND_TOGETHER_STAGES, *BAND_ONLINE_STAGES):
            raise ValueError("Fengmo Band stages require their original activity route")
        if args.stage in DEVIL_FEAST_STAGES:
            raise ValueError("Devil Feast stages require their original activity route")
        if tower_stage_kind(args.stage):
            raise ValueError("Kyoto Investigation stages require their archived activity route")
        if args.stage in (*LAOLAO_STAGES, LAOLAO_FUSION_STAGE):
            raise ValueError("Laolao battles require their original activity route")
        if args.stage == YINYANG_BOSS_STAGE:
            raise ValueError("The Yin Yang Defence boss requires its original activity route")
        if args.stage in SCORE_STAGES:
            raise ValueError("This activity requires its dedicated original score battle engine")
        if args.stage in (*TIANFA_STAGES, TIANFA_LOBBY_STAGE):
            raise ValueError("Tianfa requires its dedicated original battle engine")
        if args.stage in CREVICE_STAGES:
            raise ValueError("The Guild Crevice requires its dedicated original battle engine")
        if stage.get("name") in RESOURCE_STAGE_NAMES:
            raise ValueError("Experience and coin encounters require their dedicated entry")
        if any(args.stage == floor[0] for floor in map_boss.data[OROCHI_STAGE]["gk_list"]):
            raise ValueError("True Orochi floors require the original continuous dungeon engine")
        if qinfei_food_profile(args.stage) or args.stage in QINFEI_STATIC_STAGES:
            raise ValueError("Qinfei stages require their original activity route")
        if args.stage in ARCHIVED_NIAN_STAGES or entry_for_stage(map_boss.data, args.stage):
            raise ValueError("Map boss stages require their original cooperative engine")
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
    spirit = None if relay or orochi or shilian or ten_boss or ten_explore or secret_actor_config else plan.get("spirit")
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
    party_replay = tianfa_replay if args.tianfa_team else map_boss_replay
    local_party = party_replay.assign_players(player, fighters) if party_replay else None
    avatar = BattleAvatar()
    avatar.init_from_dict(local_party[0] if local_party else player)
    avatar.inventory.update(inventory)
    avatar.defaultHeros = rounds[0]["members"][:] if relay else list(fighters)[:6] if orochi else list(fighters)
    if local_party:
        avatar.defaultHeros = [uid for uid in local_party[0]["heroes"] if uid in fighters]

    if ten_explore:
        avatar.defaultHeros = [exploration_uid(avatar, hero) for hero, _ in plan["members"]]
        route = "ten-anniversary-exploration"
    elif raid_battle:
        route = "qinfei-boss-personal-window" if qinfei_boss else "guild-retreat-personal-window"
        raid_window = RaidDamageWindow(raid, const, args.window_seconds)
    elif relay:
        route = "underworld-gate-local-solo"
    elif orochi:
        route = "true-orochi-local-solo"
    elif hunling:
        route = "hunling-personal-challenge" if hunling_route[2] is not None else "hunling-regional-exploration"
    elif qiling:
        route = "qiling-collective-local-window"
    elif crevice:
        route = "guild-crevice-local-window"
    elif superghost or historical_ghost:
        route = "superghost-historical-personal" if historical_ghost else "superghost-local-window"
    elif shilian:
        state_label = "configured" if args.shilian_state else "full-health"
        route = f"six-realms-{state_label}-{'encounter' if shilian_event else 'trial'}"
    elif regional:
        route = "regional-boss-ordinary-scenario" if args.mode == REGION_MODE else "regional-boss-hard-scenario"
    elif yanwu:
        route = "fengmo-yanwu-solo"
    elif fengmo_band:
        route = "fengmo-band-personal-boss"
    elif devil_feast:
        route = "devil-feast-activity"
    elif ghost_king_tower:
        route = "ghost-king-tower-archive"
    elif laolao_challenge:
        route = "laolao-challenge-solo"
    elif catfish:
        route = "catfish-local-team"
    elif skeleton:
        route = "skeleton-local-team"
    elif longche:
        route = "longche-local-team"
    elif mirage:
        route = "mirage-local-team"
    elif songstress:
        route = "songstress-local-team"
    elif dusk_wraith:
        route = "dusk-wraith-local-team"
    elif laolao_fusion:
        route = "laolao-fusion-local-team"
    elif band_together:
        route = "fengmo-band-together-practice"
    elif dojo_area:
        route = "dojo-area-solo-score"
    elif forest:
        route = "guild-forest-single-team"
    elif ten_anniversary:
        route = "ten-anniversary-tower" if args.mode == TEN_TOWER else "ten-anniversary-map-encounter"
    elif ten_boss:
        route = "ten-anniversary-boss-score"
    elif activity_score:
        route = activity_score.route
    elif tianfa:
        route = "tianfa-team" if args.tianfa_team else "tianfa-solo"
    elif journey_hard:
        route = "journey-hard-solo"
    elif yinyang_boss:
        route = "yinyang-monopoly-boss"
    elif map_boss_replay:
        route = "map-boss-local-team"
    elif spider:
        route = "tuzhizhu-practice-solo"
    elif args.mode == 29:
        engine, stage, enemy_ids = awake_stage(args.stage)
        group_id, wave_count = stage["monsterid"], 1
        route = "awake-ordinary-solo"
    elif args.mode == 266:
        if stage["advanced"]:
            route = "secret-race-solo"
        else:
            route = "secret-team-solo" if stage["need_team"] else "secret-ordinary-solo"
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
        configured_deadline = stage.get("battleTime") or None
        if args.pve_deadline is not None and configured_deadline != args.pve_deadline:
            raise ValueError("The requested PvE deadline differs from the original stage table")
        if args.stage in QINFEI_SIDE_STAGES:
            if len(fighters) != 5:
                raise ValueError("The Qinfei formation preview requires five owned shikigami")
            qinfei_side_replay = QinfeiSideReplay(modules, args.stage, stage, group, engine)
            route = "qinfei-side-static-formation"
        elif configured_deadline is not None:
            pve_clock = NativePveClock(engine, configured_deadline)
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
    controllers = [controller]
    for teammate in local_party[1:] if local_party else ():
        partner = BattleAvatar()
        partner.init_from_dict(teammate)
        partner.inventory.update(inventory)
        partner.defaultHeros = list(teammate["heroes"])
        partner_controller = LocalBattleController(const.CampFlag.CAMP1, partner)
        partner_controller.battleEngine = engine
        partner_controller.sceneLoaded = True
        engine.addBattlePlayer(partner)
        engine.controllers.append(partner_controller)
        controllers.append(partner_controller)
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
        if band_together:
            together.bind_clock()

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
    dojo_area_replay = (DojoAreaReplay(engine, group, const, dojo_play, args.dojo_area[0], args.dojo_area[2], dojo_deadline)
                        if dojo_area else None)
    forest_replay = ForestReplay(engine, group, const, forest_event) if forest else None
    ten_replay = TenAnniversaryReplay(engine, group, const, ten_deadline, ten_bonuses) if ten_anniversary else None
    ten_boss_replay = TenBossReplay(engine, ten_groups, const, ten_actor, ten_assists) if ten_boss else None
    ten_explore_replay = TenExploreReplay(engine, group, const, ten_profiles, plan, controller) if ten_explore else None
    spider_replay = TsuchigumoPractice(engine, stage, group, const) if spider else None
    verified_waves = set()
    secret_protection_replay = None
    secret_mirror_replay = None
    secret_mechanic_replay = None
    if args.mode == 266:
        protection = secret_protection(stage)
        if protection:
            secret_protection_replay = SecretProtectionReplay(engine, const, protection)
        if args.stage == MIRROR_FLOOR:
            secret_mirror_replay = SecretMirrorReplay(engine, const)
        if setup := secret_mechanic(stage):
            secret_mechanic_replay = SecretMechanicReplay(engine, controller, const, setup)
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity

        def verify_spawn():
            wave = engine.finishedWaveCount
            if not 0 <= wave < wave_count:
                raise RuntimeError("Unexpected original Secret Zone wave index")
            observed = []
            expected, mirror_units = (secret_mirror_replay.formation(waves[wave]) if secret_mirror_replay
                                      else (placements(waves[wave]), []))

            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                if secret_mechanic_replay:
                    secret_mechanic_replay.observe_enemy(entity)
                observed.append((placement.Index, placement.level, entity.protoid))
                return entity

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if observed != expected:
                raise RuntimeError(f"The original Secret Zone generated a different formation in wave {wave + 1}")
            if secret_mirror_replay:
                secret_mirror_replay.observe(expected, mirror_units)
            verified_waves.add(wave)
            return result

        engine._createNextRoundMons = verify_spawn
    engine._time, engine.delta_time = float(ENGINE_START_SECONDS), .020
    engine.init()
    if party_replay:
        party_replay.verify_players(controllers)
    if qinfei_boss:
        formation_matches = raid.matches()
    elif retreat:
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
    elif ten_boss:
        formation_matches = (engine.monstergroup == group_id and engine.combineSceneInfoId == ten_groups[0]["resindex"]
                             and engine.defeat_monster_wave == 0 and engine.monster_wave_count == len(ten_groups)
                             and tuple(engine.wave_pve_flag_list) == tuple(group["ID"] for group in ten_groups))
    elif yanwu or fengmo_band or band_together or devil_feast or ghost_king_tower or laolao_challenge or laolao_fusion or dusk_wraith or songstress or mirage or catfish or skeleton or longche or dojo_area or forest or ten_anniversary or ten_explore or activity_score or tianfa or journey_hard or yinyang_boss or spider or hunling or qiling or shilian:
        formation_matches = engine.monstergroup == group_id and engine.combineSceneInfoId == group["resindex"]
    elif args.mode == 29:
        formation_matches = engine.bossId == enemy_ids
    elif args.mode == 266:
        formation_matches = (engine.getFbConfig() is stage and engine.fbId == args.stage
                             and engine.combineSceneInfoId == stage["scene"] and len(engine.battlePlayers) == 1
                             and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6])
    elif args.mode == RESOURCE_MODE:
        formation_matches = resource.matches()
    elif args.mode == YULING_MODE:
        formation_matches = engine.fbId == args.stage and engine.combineSceneInfoId == stage["scene"]
    elif args.mode == GUILD_HUNT_MODE:
        formation_matches = (engine.fbId == args.stage and engine.combineSceneInfoId == stage["scene"]
                             and engine.halt_battle_time == 240)
    elif superghost:
        formation_matches = (engine.fbId == args.stage and engine.combineSceneInfoId == ghost_replay.route["sceneId"]
                             and engine.campData2.initGuihuo == 8)
    elif historical_ghost:
        formation_matches = (engine.pve_data_flag == args.stage and engine.combineSceneInfoId == ghost_replay.route["sceneId"]
                             and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6])
    else:
        formation_matches = engine.monstergroup == group_id
    if (engine.seed != args.seed or engine.random is not random_record or engine.battleMode != args.mode
            or engine.monsterWaveCount != wave_count or not formation_matches):
        raise RuntimeError("The original engine initialized a different battle")
    recorder = engine.battleRecorder or BattleRecorderRune(engine, controller)
    engine.battleRecorder = recorder
    moon_trial = MoonTrial(engine, controller, group, choices) if args.mode == SHILIAN_EXAM_MODE and dao == 1 else None
    if not relay:
        for player_index, current in enumerate(controllers):
            engine.op_init(current, actor_id if player_index == 0 else 0, current.ctrlPlayer.defaultHeros[:], [])
    engine.battleState = const.BattleState.BS_LOADING
    for current in controllers:
        engine.op_sceneLoaded(current)

    replay_seconds = (PRACTICE_REPLAY_SECONDS if spider else 220 if retreat else QINFEI_BOSS_REPLAY_SECONDS if qinfei_boss
                      else BAND_TOGETHER_WALL_SECONDS if band_together
                      else DEVIL_FEAST_WALL_SECONDS if devil_feast
                      else TOWER_WALL_SECONDS if ghost_king_tower
                      else LAOLAO_WALL_SECONDS if laolao_challenge
                      else CATFISH_WALL_SECONDS if catfish
                      else SKELETON_WALL_SECONDS if skeleton
                      else LONGCHE_WALL_SECONDS if longche
                      else MIRAGE_WALL_SECONDS if mirage
                      else SONG_WALL_SECONDS if songstress
                      else DUSK_WALL_SECONDS if dusk_wraith
                      else FUSION_WALL_SECONDS if laolao_fusion
                      else YINYANG_BOSS_WALL_SECONDS if yinyang_boss
                      else TEN_REPLAY_SECONDS if ten_anniversary or ten_boss or ten_explore
                      else OROCHI_REPLAY_SECONDS if orochi
                      else HUNLING_REPLAY_SECONDS if hunling else QILING_GROUP_REPLAY_SECONDS if qiling
                      else CREVICE_WALL_SECONDS if crevice
                      else SUPERGHOST_WALL_SECONDS if superghost or historical_ghost
                      else SHILIAN_REPLAY_SECONDS if shilian else TIANFA_REPLAY_SECONDS if tianfa
                      else QINFEI_FOOD_CHAIN_SECONDS if qinfei_food and args.qinfei_food_next
                      else SPECIAL_NIAN_WALL_SECONDS if args.mode == SPECIAL_NIAN_MODE else 130 if relay
                      else pve_wall_seconds(args.pve_deadline))
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
        if raid_battle:
            boss = raid.boss["protoId"]
        elif yanwu or qiling or activity_score or songstress or dusk_wraith or mirage or catfish or skeleton or longche:
            boss = group["MonstersInfos"][0][0][1]
        else:
            boss = stage["monsters"][0][0]
        instructions = HuntOpening(engine, controller, const, tactics, boss)

    def verify_selected_equipment():
        nonlocal equipped_spirit
        pending = dict(choices)
        for entity in engine.heroEntities.values():
            owner = entity.ownerController
            if owner not in controllers:
                continue
            hero = entity.HeroComp.heroData
            alias = hero.heroUid
            if alias not in pending:
                continue
            setting = pending.pop(alias)
            if spider_replay:
                spider_replay.check_selected(entity)
            if setting:
                engine.op_setAutoSkill(owner, entity.uid, setting)
                if owner.autoSkill.get(entity.uid) != setting:
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
        if party_replay:
            party_replay.verify_selection(controllers)

    band_handoff = False
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        if ghost_king_tower:
            tower.update()
        if laolao_challenge:
            laolao.update()
        if laolao_fusion:
            fusion.update(controller)
        if dusk_wraith:
            dusk.update()
        if songstress:
            song.update()
        if mirage:
            mirage_replay.update()
        if catfish:
            catfish_replay.update()
        if skeleton:
            skeleton_replay.update()
        if longche:
            longche_replay.update()
        if qinfei_food:
            map_boss_replay.advance_pile(controller)
        if secret_mechanic_replay:
            secret_mechanic_replay.check_opening()
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
        if fengmo_band:
            band.update()
        if devil_feast:
            feast.update()
        if band_together:
            band_handoff = together.update(controller)
            if not together.first and together.started is not None and not selection_checked:
                verify_selected_equipment()
                engine.op_setAuto(controller, True)
                selection_checked = True
            if band_handoff:
                break
        if score_replay:
            score_replay.update()
        if dojo_area_replay:
            dojo_area_replay.update()
        if forest_replay:
            forest_replay.update()
        if ten_replay:
            ten_replay.update()
        if ten_boss_replay:
            ten_boss_replay.update()
        if ten_explore_replay:
            ten_explore_replay.update()
        if tianfa:
            tianfa_replay.update()
        if spider_replay:
            spider_replay.update()
        if instructions:
            instructions.update()
        if raid_battle:
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
        if crevice:
            crevice_replay.update(winner)
            if crevice_replay.reason:
                break
        if superghost or historical_ghost:
            ghost_replay.update(winner)
            if ghost_replay.reason:
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
        if secret_actor_config:
            secret_actor_report = check_secret_actor(engine, controller, secret_actor_config)
        if ten_boss_replay:
            ten_boss_replay.verify_actor(controller)
        if ten_explore_replay:
            ten_explore_replay.verify_selection()
        verify_selected_equipment()
        for current in controllers:
            engine.op_setAuto(current, not tactics.get("manualOpening"))
            engine.op_selectHeroOk(current)
        selection_checked = all(current.selectHeroOk for current in controllers)
    if not selection_checked:
        raise RuntimeError("The original engine did not accept the selected roster")
    if instructions and instructions.applied != tactics:
        raise RuntimeError("The battle did not apply every requested opening instruction")

    record = "".join(recorder.data_list).encode("utf-8")
    outcome = {const.CampFlag.CAMP1: "win", const.CampFlag.CAMP2: "loss"}.get(winner, "unknown")
    completed = engine.battleState == const.BattleState.BS_OVER and outcome != "unknown"
    if dusk_wraith and dusk.room_win and engine.battleState == const.BattleState.BS_OVER:
        completed, outcome = True, "win"
    if raid_battle:
        completed = raid_window.reason is not None
        outcome = "win" if raid_window.reason == "boss-defeated" else "loss" if completed else "unknown"
    if qiling:
        completed = collective.reason is not None
        outcome = "win" if collective.reason == "boss-defeated" else "loss" if completed else "unknown"
    if crevice:
        completed, outcome = crevice_replay.reason is not None, crevice_replay.outcome
    if superghost or historical_ghost:
        completed, outcome = ghost_replay.reason is not None, ghost_replay.outcome
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
    if crevice:
        report["guildCrevice"] = crevice_replay.report()
        report["wavesCleared"] = int(outcome == "win")
    if superghost or historical_ghost:
        report["historicalSuperGhost" if historical_ghost else "superGhost"] = ghost_replay.report()
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
    if fengmo_band:
        report["fengmoBand"] = band.report()
        report["formationsVerified"] = 1
        report["wavesCleared"] = int(report["fengmoBand"]["enemiesRemaining"] == 0)
    if devil_feast:
        report["devilFeast"] = feast.report()
        report["formationsVerified"] = 1
    if band_together:
        phase = together.report(completed)
        report["fengmoBandPhase"] = phase
        report["completed"] = band_handoff or completed
        report["wavesCleared"] = int(phase["remainingHp"] == 0)
        report["formationsVerified"] = 1
        report["outcome"] = ("win" if report["wavesCleared"] else "loss") if report["completed"] else "unknown"
    if score_replay:
        report[activity_score.report_key] = score_replay.report(completed, [row["heroId"] for row in fighters.values()],
                                                               actor_id, score_activity_id)
        if instructions:
            report[activity_score.report_key].update(instructions.report())
    if dojo_area_replay:
        report["dojoArea"] = dojo_area_replay.report(completed)
        report["formationsVerified"] = 1
    if forest_replay:
        report["guildForest"] = forest_replay.report(completed)
        report["formationsVerified"] = 1
    if ten_replay:
        report["tenAnniversary"] = ten_replay.report()
        report["formationsVerified"] = 1
    if ten_boss_replay:
        report["tenAnniversaryBoss"] = ten_boss_replay.report(completed, outcome)
        report["sceneId"] = ten_groups[0]["resindex"]
        report["waveCount"] = len(ten_groups)
        report["formationsVerified"] = len(ten_boss_replay.phases)
        report["wavesCleared"] = len(ten_boss_replay.phases) - 1
    if ten_explore_replay:
        report["tenAnniversaryExplore"] = ten_explore_replay.report(completed)
        report["formationsVerified"] = 1
    if journey_hard:
        report["journeyHard"] = journey.report()
    if yinyang_boss:
        report["yinyangBoss"] = yinyang.report()
        report["formationsVerified"] = 1
    if ghost_king_tower:
        report["ghostKingTower"] = tower.report()
        report["formationsVerified"] = 1
    if laolao_challenge:
        report["laolaoChallenge"] = laolao.report()
        report["formationsVerified"] = len(laolao.waves)
    if catfish:
        report["catfish"] = catfish_replay.report(completed, outcome)
        if instructions:
            report["catfish"].update(instructions.report())
        report["waveCount"] = 1
        report["wavesCleared"] = int(outcome == "win")
        report["formationsVerified"] = len(report["catfish"]["phases"])
    if skeleton:
        report["skeleton"] = skeleton_replay.report(completed, outcome)
        if instructions:
            report["skeleton"].update(instructions.report())
        report["waveCount"] = 1
        report["wavesCleared"] = int(outcome == "win")
        report["formationsVerified"] = len(report["skeleton"]["phases"])
    if longche:
        report["longche"] = longche_replay.report(completed, outcome)
        if instructions:
            report["longche"].update(instructions.report())
        report["waveCount"] = 1
        report["wavesCleared"] = int(outcome == "win")
        report["formationsVerified"] = len(report["longche"]["phases"])
    if mirage:
        report["mirage"] = mirage_replay.report(completed, outcome)
        if instructions:
            report["mirage"].update(instructions.report())
        report["waveCount"] = 1
        report["wavesCleared"] = int(outcome == "win")
        report["formationsVerified"] = len(report["mirage"]["phases"])
    if songstress:
        report["songstress"] = song.report(completed, outcome)
        if instructions:
            report["songstress"].update(instructions.report())
        report["waveCount"] = 1
        report["wavesCleared"] = int(outcome == "win")
        report["formationsVerified"] = len(report["songstress"]["phases"])
    if dusk_wraith:
        report["duskWraith"] = dusk.report(completed, outcome)
        if instructions:
            report["duskWraith"].update(instructions.report())
        report["sceneId"] = group["resindex"]
        report["waveCount"] = 1
        report["wavesCleared"] = int(outcome == "win")
        report["formationsVerified"] = len(report["duskWraith"]["phases"])
    if laolao_fusion:
        report["laolaoFusion"] = fusion.report(completed, outcome)
        report["formationsVerified"] = len(fusion.phases)
    if map_boss_replay:
        report["mapBoss"] = map_boss_replay.report(report["outcome"])
        report["formationsVerified"] = len(map_boss_replay.waves)
        if qinfei_food:
            report["waveCount"] = map_boss_replay.wave_count
    if qinfei_side_replay:
        report["qinfeiSide"] = qinfei_side_replay.report(report["outcome"])
        report["formationsVerified"] = len(qinfei_side_replay.waves)
    if pve_clock:
        report["pveDeadline"] = pve_clock.report(report["outcome"])
    if tianfa:
        report["tianfa"] = tianfa_replay.report(completed)
    if spider_replay:
        report["tuzhizhuPractice"] = spider_replay.report(report["outcome"])
    if retreat:
        report["waveCount"], report["wavesCleared"] = 1, int(outcome == "win")
        report["guildRetreat"] = {**raid_window.report(), "guildMembers": args.guild_members,
                                  "raidSHA256": modules.rows["battleengine.raid.raid_controllers.RaidComp_1"]["marshalSHA256"]}
        if instructions:
            report["guildRetreat"].update(instructions.report())
    if qinfei_boss:
        report["waveCount"], report["wavesCleared"] = 1, int(outcome == "win")
        report["formationsVerified"] = int(raid_window.opening is not None)
        report["qinfeiBoss"] = raid.report(raid_window)
        if instructions:
            report["qinfeiBoss"].update(instructions.report())
    if args.mode == 266:
        report["formationsVerified"] = len(verified_waves)
        if secret_actor_config:
            report["secretActor"] = secret_actor_report
        if secret_protection_replay:
            report["secretProtection"] = secret_protection_replay.report(completed)
        if secret_mirror_replay:
            report["secretMirror"] = secret_mirror_replay.report()
        if secret_mechanic_replay:
            report["secretMechanic"] = secret_mechanic_replay.report()
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
    from devil_feast_stage import (DEVIL_FEAST_BOSSES, DEVIL_FEAST_MODE, DEVIL_FEAST_STAGES, DEVIL_FEAST_WALL_SECONDS,
                                  LAOLAO_MODE, LAOLAO_STAGES, LAOLAO_WALL_SECONDS, TOWER_MODE, TOWER_WALL_SECONDS,
                                  tower_stage_kind, valid_laolao_settings, valid_tower_settings)
    from fengmo_band_stage import FENGMO_BAND_MODE
    from fengmo_band_together import BAND_TOGETHER_MODE, BAND_TOGETHER_STAGES, BAND_TOGETHER_WALL_SECONDS
    from dojo_area_stage import DOJO_AREA_ACTIVITY, DOJO_AREA_MODE
    from map_boss_stage import (MODES as MAP_BOSS_MODES, QINFEI_FOOD_CHAIN_SECONDS, QINFEI_FOOD_MODE,
                                SPECIAL_NIAN_MODE, party_positions, qinfei_food_sequence)
    from fengmo_yanwu_stage import FENGMO_YANWU_MODE
    from general_soul_stage import SOLO_SCORE_MODES
    from guild_crevice_stage import CREVICE_MODE, CREVICE_TIME
    from guild_forest_stage import FOREST_MODE, FOREST_STAGES
    from superghost_stage import HISTORICAL_GHOST_MODE, SUPERGHOST_MODE, valid_ghost_settings
    from guild_hunt_stage import GUILD_HUNT_MODE
    from guild_retreat_stage import RETREAT_MODE, RETREAT_BOSSES
    from hunling_stage import CAPTURE_ITEMS, HUNLING_BOSS, HUNLING_MODES, HUNLING_REPLAY_SECONDS
    from journey_hard_stage import (JOURNEY_HARD_MODE, YINYANG_BOSS_BUFF_IDS, YINYANG_BOSS_MODE,
                                    YINYANG_BOSS_STAGE, YINYANG_BOSS_WALL_SECONDS)
    from fengmo_dusk_stage import DUSK_MODE, DUSK_STAGE, DUSK_WALL_SECONDS, valid_dusk_settings
    from fengmo_songstress_stage import SONG_MODE, SONG_STAGE, SONG_WALL_SECONDS, SONG_WINDOW
    from fengmo_mirage_stage import MIRAGE_MODE, MIRAGE_STAGE, MIRAGE_WALL_SECONDS, valid_mirage_settings
    from fengmo_catfish_stage import CATFISH_MODE, CATFISH_STAGE, CATFISH_WALL_SECONDS, valid_catfish_settings
    from fengmo_skeleton_stage import SKELETON_MODE, SKELETON_STAGE, SKELETON_WALL_SECONDS, valid_skeleton_settings
    from fengmo_longche_stage import LONGCHE_MODE, LONGCHE_STAGE, LONGCHE_WALL_SECONDS, valid_longche_settings
    from laolao_fusion_stage import LAOLAO_FUSION_MODE, LAOLAO_FUSION_STAGE, FUSION_WALL_SECONDS, valid_fusion_settings
    from pve_clock import pve_wall_seconds
    from qiling_group_stage import QILING_GROUP_MODE, QILING_GROUP_LIMIT, QILING_GROUP_REPLAY_SECONDS
    from qinfei_boss_stage import (QINFEI_BOSS_MAX_WINDOW, QINFEI_BOSS_MODE, QINFEI_BOSS_PROFILES,
                                   QINFEI_BOSS_REPLAY_SECONDS, QINFEI_BOSS_STAGE)
    from regional_boss_stage import REGION_MODES
    from resource_stage import RESOURCE_MODE
    from shilian_routes import SHILIAN_EVENT_MODE, SHILIAN_MODES
    from shilian_stage import REPLAY_SECONDS as SHILIAN_REPLAY_SECONDS, valid_run_state
    from tianfa_stage import TIANFA_MODE, TIANFA_REPLAY_SECONDS, TIANFA_STAGES
    from ten_anniversary_stage import (
        TEN_OPTIONAL_BONUSES, TEN_OWNED_MODES, TEN_REPLAY_SECONDS, valid_ten_optional_bonuses,
    )
    from ten_anniversary_boss import TEN_BOSS_MODE, TEN_BOSS_STAGE
    from ten_anniversary_explore import TEN_EXPLORE_MODE
    from true_orochi_stage import OROCHI_MODE, OROCHI_REPLAY_SECONDS
    from tuzhizhu_practice import PRACTICE_MODES, PRACTICE_REPLAY_SECONDS
    from underworld_stage import UNDERWORLD_MODE
    from yuling_stage import YULING_MODE

    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("runtime", "team", "suit-index", "output"):
        parser.add_argument("--" + flag, required=True, type=lambda value: Path(value).resolve())
    parser.add_argument("--mode", type=int, choices=(3, 29, 266, YULING_MODE, RESOURCE_MODE, GUILD_HUNT_MODE, UNDERWORLD_MODE, OROCHI_MODE, RETREAT_MODE, FENGMO_YANWU_MODE, FENGMO_BAND_MODE, BAND_TOGETHER_MODE, DEVIL_FEAST_MODE, TOWER_MODE, LAOLAO_MODE, LAOLAO_FUSION_MODE, DUSK_MODE, SONG_MODE, MIRAGE_MODE, CATFISH_MODE, SKELETON_MODE, LONGCHE_MODE, JOURNEY_HARD_MODE, YINYANG_BOSS_MODE, QILING_GROUP_MODE, CREVICE_MODE, SUPERGHOST_MODE, HISTORICAL_GHOST_MODE, TIANFA_MODE, QINFEI_BOSS_MODE, DOJO_AREA_MODE, FOREST_MODE, TEN_BOSS_MODE, TEN_EXPLORE_MODE, *TEN_OWNED_MODES, *MAP_BOSS_MODES, *SOLO_SCORE_MODES, *SHILIAN_MODES, *REGION_MODES, *PRACTICE_MODES, *HUNLING_MODES), default=3)
    parser.add_argument("--tower-settings", type=json.loads)
    parser.add_argument("--laolao-settings", type=json.loads)
    parser.add_argument("--fusion-settings", type=json.loads)
    parser.add_argument("--dusk-settings", type=json.loads)
    parser.add_argument("--song-window", type=int)
    parser.add_argument("--mirage-settings", type=json.loads)
    parser.add_argument("--catfish-settings", type=json.loads)
    parser.add_argument("--skeleton-settings", type=json.loads)
    parser.add_argument("--longche-settings", type=json.loads)
    parser.add_argument("--yinyang-drums", type=int, choices=range(10))
    parser.add_argument("--yinyang-buffs", type=int, nargs="+", choices=YINYANG_BOSS_BUFF_IDS)
    parser.add_argument("--devil-feast-hp", type=float)
    parser.add_argument("--band-score", type=int)
    parser.add_argument("--band-carry", type=int, nargs=2, metavar=("DAMAGE", "BUFF_LEVEL"))
    parser.add_argument("--dojo-area", type=int, nargs=3, metavar=("YEAR", "PLAY", "REGION_STATE"))
    parser.add_argument("--forest-event", type=int)
    parser.add_argument("--ten-bonuses", type=int, nargs="+", choices=TEN_OPTIONAL_BONUSES, default=[])
    parser.add_argument("--map-boss-players", type=int, choices=(1, 2, 3))
    parser.add_argument("--qinfei-food-next", type=int, nargs="+")
    parser.add_argument("--qinfei-profile", type=int, nargs=2, metavar=("RAID", "DIFFICULTY"))
    parser.add_argument("--stage", required=True, type=int)
    parser.add_argument("--pve-deadline", type=int)
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
    parser.add_argument("--crevice-window", type=int)
    parser.add_argument("--ghost-settings", type=json.loads)
    parser.add_argument("--historical-ghost-window", type=int)
    parser.add_argument("--journey-blessings", type=int)
    parser.add_argument("--journey-deadline", type=int)
    parser.add_argument("--tianfa-team", action="store_true")
    parser.add_argument("--shilian-trial-slot", type=int, choices=range(1, 7))
    parser.add_argument("--shilian-event-id", type=int)
    parser.add_argument("--shilian-difficulty", type=int, choices=(1, 2, 3))
    parser.add_argument("--shilian-moves", type=int)
    parser.add_argument("--shilian-state", type=json.loads)
    args = parser.parse_args()
    if args.stage <= 0 or not 0 <= args.seed < 10000:
        parser.error("--stage must be positive and --seed must be between 0 and 9999")
    if args.mode == DEVIL_FEAST_MODE and args.stage not in DEVIL_FEAST_STAGES:
        parser.error("Unknown Devil Feast fixed encounter")
    if args.mode == TOWER_MODE:
        kind = tower_stage_kind(args.stage)
        if not kind or not valid_tower_settings(args.tower_settings, kind):
            parser.error("Kyoto Investigation needs an original stage and valid archived conditions")
    elif args.tower_settings is not None:
        parser.error("Kyoto Investigation conditions only apply to its archived route")
    if args.mode == LAOLAO_MODE:
        if args.stage not in LAOLAO_STAGES or not valid_laolao_settings(args.laolao_settings):
            parser.error("Laolao Challenge requires one of its twelve stages and valid faith settings")
    elif args.laolao_settings is not None:
        parser.error("Laolao Challenge conditions apply only to its original mode")
    if args.mode == CATFISH_MODE:
        if args.stage != CATFISH_STAGE or not valid_catfish_settings(args.catfish_settings):
            parser.error("Catfish needs its original stage and valid shared-room settings")
    elif args.catfish_settings is not None:
        parser.error("Catfish shared-room settings apply only to its original mode")
    if args.mode == SKELETON_MODE:
        if args.stage != SKELETON_STAGE or not valid_skeleton_settings(args.skeleton_settings):
            parser.error("Huangkulou needs its original stage and valid phase settings")
    elif args.skeleton_settings is not None:
        parser.error("Huangkulou phase settings apply only to its original mode")
    if args.mode == LONGCHE_MODE:
        if args.stage != LONGCHE_STAGE or not valid_longche_settings(args.longche_settings):
            parser.error("Longche needs its original stage and valid phase settings")
    elif args.longche_settings is not None:
        parser.error("Longche phase settings apply only to its original mode")
    if args.mode == MIRAGE_MODE:
        if args.stage != MIRAGE_STAGE or not valid_mirage_settings(args.mirage_settings):
            parser.error("Mirage needs its original stage and valid phase settings")
    elif args.mirage_settings is not None:
        parser.error("Mirage phase settings apply only to its original mode")
    if args.mode == SONG_MODE:
        if args.stage != SONG_STAGE or args.song_window is None or not 1 <= args.song_window <= SONG_WINDOW:
            parser.error("Songstress needs its original stage and a valid scoring window")
    elif args.song_window is not None:
        parser.error("Songstress scoring window applies only to its original mode")
    if args.mode == DUSK_MODE:
        if args.stage != DUSK_STAGE or not valid_dusk_settings(args.dusk_settings):
            parser.error("Night Wraith needs its original stage, music order and battle window")
    elif args.dusk_settings is not None:
        parser.error("Night Wraith conditions apply only to its original mode")
    if args.mode == LAOLAO_FUSION_MODE:
        if args.stage != LAOLAO_FUSION_STAGE or not valid_fusion_settings(args.fusion_settings):
            parser.error("Laolao Fusion needs its original stage and shared-health conditions")
    elif args.fusion_settings is not None:
        parser.error("Laolao Fusion conditions apply only to its original mode")
    if args.mode == YINYANG_BOSS_MODE:
        if args.stage != YINYANG_BOSS_STAGE or args.yinyang_drums is None:
            parser.error("Yin Yang Defence boss needs its original stage and the remaining drum count")
    elif args.yinyang_drums is not None or args.yinyang_buffs is not None:
        parser.error("Remaining drums and blessings only apply to the Yin Yang Defence boss")
    if args.devil_feast_hp is not None and (args.mode != DEVIL_FEAST_MODE or args.stage not in DEVIL_FEAST_BOSSES
                                           or not 0 < args.devil_feast_hp < 2 ** 53):
        parser.error("Starting HP applies to Devil Feast bosses and must be positive")
    if args.mode == BAND_TOGETHER_MODE:
        if (args.stage not in BAND_TOGETHER_STAGES or args.band_score is None or not 0 <= args.band_score < 2 ** 53
                or (args.stage == BAND_TOGETHER_STAGES[1]) != (args.band_carry is not None)
                or args.band_carry and not (0 <= args.band_carry[0] < 2 ** 53 and 0 <= args.band_carry[1] <= 3)):
            parser.error("Fengmo Band practice needs the stage, rhythm score and original second-phase carryover")
        args.band_carry = args.band_carry or (0, 0)
    elif args.band_score is not None or args.band_carry is not None:
        parser.error("Rhythm scores and phase carryover apply only to Fengmo Band practice")
    if args.mode == FOREST_MODE:
        if args.stage not in FOREST_STAGES or args.forest_event is None or args.forest_event <= 0:
            parser.error("Forest of Secrets requires a stage and event")
    elif args.forest_event is not None:
        parser.error("--forest-event requires the original Forest of Secrets mode")
    if args.ten_bonuses and (args.mode not in TEN_OWNED_MODES or not valid_ten_optional_bonuses(args.ten_bonuses)):
        parser.error("Shichangji allows up to two unique, ordered optional bonuses in the original inventory battle")
    if args.mode == TEN_BOSS_MODE and args.stage != TEN_BOSS_STAGE:
        parser.error("Shichangji boss battle starts at the first phase")
    if args.mode == DOJO_AREA_MODE:
        year, play, region = args.dojo_area or (0, 0, 0)
        if year not in DOJO_AREA_ACTIVITY or play <= 0 or region not in ((0, 3) if year == 2026 else (0,)):
            parser.error("Eight-Hundred Tanuki requires a configured cell and supported region state")
    elif args.dojo_area is not None:
        parser.error("Eight-Hundred Tanuki settings only apply to its original battle mode")
    if args.pve_deadline is not None and (args.mode != 3 or not 1 <= args.pve_deadline <= 10800):
        parser.error("A PvE table deadline requires mode 3 and a value in the supported client range")
    if (args.mode in MAP_BOSS_MODES) != (args.map_boss_players is not None):
        parser.error("Map boss replay requires the number of players")
    if args.map_boss_players is not None and not party_positions(args.mode, args.map_boss_players):
        parser.error("Player count is unavailable for this map boss mode")
    if args.mode == QINFEI_FOOD_MODE:
        if not qinfei_food_sequence(args.stage, args.qinfei_food_next or ()):
            parser.error("Qinfei food replay requires up to five verified stages of the same food and era")
    elif args.qinfei_food_next:
        parser.error("Qinfei food continuation is available only in the original food mode")
    if args.mode == TIANFA_MODE and args.stage not in TIANFA_STAGES:
        parser.error("Tianfa replay needs one of the three configured difficulty stages")
    if args.tianfa_team and args.mode != TIANFA_MODE:
        parser.error("Tianfa team replay is only available in the original Tianfa mode")
    if args.mode == RETREAT_MODE and (args.boss is None or not 0 <= args.guild_members <= 50 or not 1 <= args.window_seconds <= 1800):
        parser.error("The retreat needs a boss, 0 to 50 guild members and a 1 to 1800-second window")
    if args.mode == QINFEI_BOSS_MODE:
        if (args.stage != QINFEI_BOSS_STAGE or tuple(args.qinfei_profile or ()) not in QINFEI_BOSS_PROFILES
                or not 1 <= args.window_seconds <= QINFEI_BOSS_MAX_WINDOW):
            parser.error("Qinfei boss replay needs a verified raid profile and a 1 to 1200-second window")
    elif args.qinfei_profile is not None:
        parser.error("The Qinfei raid profile is available only in Qinfei boss mode")
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
    if (args.mode == CREVICE_MODE) != (args.crevice_window is not None) or (
            args.crevice_window is not None and not 1 <= args.crevice_window <= CREVICE_TIME):
        parser.error("The Guild Crevice replay needs a 1 to 180 second window")
    if (args.mode == SUPERGHOST_MODE) != (args.ghost_settings is not None) or (
            args.ghost_settings is not None and not valid_ghost_settings(args.ghost_settings)):
        parser.error("Super Ghost requires a valid attack type, date and scoring window")
    if (args.mode == HISTORICAL_GHOST_MODE) != (args.historical_ghost_window is not None) or (
            args.historical_ghost_window is not None and not 1 <= args.historical_ghost_window <= 180):
        parser.error("A historical Super Ghost challenge requires a 1 to 180 second scoring window")
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
                        DEVIL_FEAST_WALL_SECONDS + 20 if args.mode == DEVIL_FEAST_MODE else
                        TOWER_WALL_SECONDS + 20 if args.mode == TOWER_MODE else
                        LAOLAO_WALL_SECONDS + 20 if args.mode == LAOLAO_MODE else
                        FUSION_WALL_SECONDS + 20 if args.mode == LAOLAO_FUSION_MODE else
                        DUSK_WALL_SECONDS + 20 if args.mode == DUSK_MODE else
                        SONG_WALL_SECONDS + 20 if args.mode == SONG_MODE else
                        MIRAGE_WALL_SECONDS + 20 if args.mode == MIRAGE_MODE else
                        CATFISH_WALL_SECONDS + 20 if args.mode == CATFISH_MODE else
                        SKELETON_WALL_SECONDS + 20 if args.mode == SKELETON_MODE else
                        LONGCHE_WALL_SECONDS + 20 if args.mode == LONGCHE_MODE else
                        YINYANG_BOSS_WALL_SECONDS + 20 if args.mode == YINYANG_BOSS_MODE else
                        BAND_TOGETHER_WALL_SECONDS + 20 if args.mode == BAND_TOGETHER_MODE else
                        TEN_REPLAY_SECONDS + 20 if args.mode in (*TEN_OWNED_MODES, TEN_BOSS_MODE, TEN_EXPLORE_MODE) else
                        OROCHI_REPLAY_SECONDS + 20 if args.mode == OROCHI_MODE else
                        HUNLING_REPLAY_SECONDS + 20 if args.mode in HUNLING_MODES else
                        QILING_GROUP_REPLAY_SECONDS + 20 if args.mode == QILING_GROUP_MODE else
                        SHILIAN_REPLAY_SECONDS + 20 if args.mode in SHILIAN_MODES else
                        TIANFA_REPLAY_SECONDS + 20 if args.mode == TIANFA_MODE else
                        QINFEI_BOSS_REPLAY_SECONDS + 20 if args.mode == QINFEI_BOSS_MODE else
                        QINFEI_FOOD_CHAIN_SECONDS + 20 if args.qinfei_food_next else
                        SPECIAL_NIAN_WALL_SECONDS + 20 if args.mode == SPECIAL_NIAN_MODE else
                        240 if args.mode == RETREAT_MODE else 150 if args.mode == UNDERWORLD_MODE else
                        pve_wall_seconds(args.pve_deadline) + 20)
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
