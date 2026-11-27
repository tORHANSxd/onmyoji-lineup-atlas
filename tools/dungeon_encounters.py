"""Build a searchable encounter index from decoded, versioned client tables."""

from collections import Counter
from functools import cache
from devil_feast_stage import DEVIL_FEAST_ACTIVITY, DEVIL_FEAST_TEAM, LAOLAO_FUSION_MODE, LAOLAO_TEAM, TOWER_TEAM
from dojo_area_stage import DOJO_AREA_TEAM
from dream_trial_stage import DREAM_TRIAL_MODE
from asura_boss_stage import ASURA_ACTIVITY, ASURA_PHASE, ASURA_STAGES
from asura_depth_stage import ASURA_DEPTH_LAYERS, ASURA_DEPTH_TABLES, ASURA_DEPTH_TEAM
from breakthrough_stage import BREAKTHROUGH_MODE, BREAKTHROUGH_SCENE, BREAKTHROUGH_STAGE, GUILD_BREAKTHROUGH_MODE
from dojo_guardian_stage import DOJO_CODE_STAGE, DOJO_DEFENDER_MODE, DOJO_GUARDIAN_MODE, DOJO_GUARDIAN_STAGES
from fengmo_band_stage import FENGMO_BAND_ACTIVITY, FENGMO_BAND_STAGE_BASE, FENGMO_BAND_STAGES, FENGMO_BAND_TEAM
from fengmo_band_together import BAND_ONLINE_STAGES, BAND_TOGETHER_STAGES, BAND_TOGETHER_TEAM
from guild_crevice_stage import CREVICE_MODE, CREVICE_STAGES, crevice_route
from guild_forest_stage import FOREST_MODE, FOREST_STAGES, FOREST_TEAM
from hunling_stage import CAPTURE_ITEMS, challenge_stages, exploration_stages
from ji_boss_stage import JI_BOSS_MODE, JI_STORY_ACTOR_STAGE
from journey_hard_stage import YINYANG_BOSS_MODE, YINYANG_BOSS_STAGE
from map_boss_stage import (LBS_ACTIVITY_ASSIST, LBS_ACTIVITY_ENTRIES, LBS_ACTIVITY_MODE, LBS_ACTIVITY_SKILLS, LBS_HISTORY_ENTRIES,
                            LBS_MODE, MEITUAN_ENTRIES, MEITUAN_MODE, MEITUAN_SKILLS, MEITUAN_STAGES,
                            NIAN_ENTRIES, NIAN_MODE, NIAN_PASSIVE, NIAN_STAGES, QINFEI_ARCHIVED_FOOD,
                            QINFEI_FOOD_MODE, QINFEI_FOOD_STAGES, QINFEI_FOODS, QINFEI_SIDE_STAGES, QINFEI_STATIC_STAGES, SEAL_MODE,
                            SPECIAL_NIAN_MODE, SPECIAL_NIAN_STAGES, is_fragment_entry)
from qinfei_boss_stage import QINFEI_BOSS_MODE, QINFEI_BOSS_PROFILES, QINFEI_BOSS_STAGE
from shanfeng_stage import SHANFENG_MODE
from shilian_routes import MOON_SECOND_SCENE, SHILIAN_DAOS, shilian_event_dao
from tianfa_stage import TIANFA_LOBBY_STAGE, TIANFA_MODE, TIANFA_STAGES, TIANFA_TEAM_ENTRY, TIANFA_TEAM_TYPE
from ten_anniversary_stage import (TEN_BOSS_STAGES, TEN_ENCOUNTER_STAGES, TEN_EXPLORATION_STAGES,
                                   TEN_TOWER_STAGES, is_ten_anniversary_stage)
from ten_anniversary_boss import TEN_BOSS_ACT, TEN_BOSS_MODE, TEN_BOSS_STAGE, TEN_BOSS_TEAM
from urdtg_explore import (URDTG_ACTIVITY, URDTG_EXPLORE_MODE, URDTG_MASK_SKILL, URDTG_STAGES, URDTG_TRAIN_ACTIVITY,
                           URDTG_TRAIN_CODE, URDTG_TRAIN_MODE, URDTG_TRAIN_STAGE, URDTG_TRAIN_TEAM)


TOWER_EVENT_SOURCES = {
    "feast_for_devils_tower_event1": ("妖灵退治群体战", "feast_for_devils_tower_event1_tips"),
    "feast_for_devils_tower_event1_danti": ("妖灵退治单体战", "feast_for_devils_tower_event1_tips"),
    "feast_for_devils_tower_event1_boss": ("鬼王来袭", "feast_for_devils_tower_eventboss_tips"),
}
DEVIL_TOWER_RULES = {
    "feast_for_devils_tower_event2": ("神秘商店", "feast_for_devils_tower_event2_tips"),
    "feast_for_devils_tower_event4": ("奇遇事件", "feast_for_devils_tower_event4_tips"),
    "feast_for_devils_tower_event5": ("开卷取士", "feast_for_devils_tower_event5_tips"),
    "feast_for_devils_tower_event6": ("神谕之时祝福", "feast_for_devils_tower_buff_tips"),
    "feast_for_devils_tower_event6_b": ("姥姥火信仰加成", "feast_for_devils_tips"),
    "feast_for_devils_tower_event7": ("姥姥火挑战", "feast_for_devils_tips"),
    "feast_for_devils_tower_event7_b": ("姥姥火合魂伤害奖励", "feast_for_devils_tips"),
    "feast_for_devils_tower_event7_c": ("姥姥火合魂积分档", "feast_for_devils_tips"),
    "feast_for_devils_dawnexpedition": ("破晓之征阵营", "feast_for_devils_dawnexpedition_tips"),
}
DEVIL_TOWER_TABLES = {**TOWER_EVENT_SOURCES, **DEVIL_TOWER_RULES}
GUILD_DINNER_MODE = 312
GUILD_DINNER_RULES = (("guild_yanhuitip1", "举办、筹备与参加规则"), ("guild_yanhuitip2", "式神自动轮换规则"))
GUILD_DINNER_CONSTANTS = ((4085, "料理奖励间隔与次数"), (4086, "宴会时长"), (4087, "每周举办与参加次数"))
# Native replay examples with the exact food-target template in the formation.
GUILD_DINNER_EXAMPLES = {23: ("map_boss", 69, 14408), 208: ("story_room", 1003, 31012),
                         209: ("story_room", 2722, 32712), 214: ("story_room", 907, 30990)}
DREAM_ACTIVITY = 11721
DREAM_RULES = (("dream_self_tips", "幻游问梦开放与资源规则"),
               ("dream_act_self_guide_tips1", "睡眠事件与消耗"),
               ("dream_act_self_guide_tips2", "梦境互动与升星"),
               ("dream_act_self_guide_tips3", "解梦规则"))
ASURA_RULES = (("asura_final_boss", "决战开放与全服规则"), ("asura_huanying", "帝释天降临与幻影结界"),
               ("asura_boss", "终末之战伤害奖励与狂暴规则"), ("asura_tegong", "式神特攻解锁规则"))
ASURA_MAP_WORK = {1: "据点战斗", 2: "凝罪塔", 3: "派遣", 4: "捐赠"}
SHANFENG_FINAL_ACTIVITY = 1757
SHANFENG_PVE = "super_ghost6_pve"
SHANFENG_RULES = (("spshanfeng_ghost_pve", "历练与成王规则"),
                  ("spshanfeng_ghost_develop", "活动角色潜能规则"),
                  ("spshanfeng_ghost_rank", "成王排行规则"))
SHANFENG_DAY_RULES = {1: (), 2: ((6, "第二日首领生命判定门槛"),), 3: ((5, "第三日首领开场生命比例"),)}
JI_ACTIVITY = 8051
JI_BOSS_RULES = ("yimengsui", "shuangshenli", "sijisheng")


ROOTS = {
    "pve_stage_data": ("battle", "通用 PvE 关卡"),
    "normal_battle_config": ("battle", "战斗模式默认规则"),
    "dungeon_rune": ("daily", "御魂"),
    "map_boss": ("daily", "地图首领入口"),
    **{f"dojo{year}_bbbl_{suffix}": ("event", description) for year in (2025, 2026)
       for suffix, description in (("block_play", "八百八狸格子战斗"), ("map", "八百八狸地格"),
                                   ("map_count", "八百八狸场次"))},
    "dungeon_awake": ("daily", "觉醒"),
    "dungeon_challenge": ("daily", "秘闻"),
    "dungeon_challenge2": ("daily", "秘闻"),
    "dungeon_challenge_series": ("daily", "秘闻"),
    "dungeon_challenge_race": ("daily", "秘闻竞速"),
    "dungeon_yuling": ("daily", "御灵"),
    "MZB_fengmo": ("daily", "逢魔木桩练习"),
    "fengmo_band_personal_boss": ("event", "逢魔乐队单人首领"),
    "fengmo_band_together_battle": ("event", "逢魔乐队共斗首领"),
    "devil_battle": ("event", "京都万事屋历练"),
    "devil_feast_event5": ("event", "鬼王之宴灵气激发"),
    "devil_feast_event6": ("event", "鬼王之宴大妖考验"),
    "devil_feast_event7": ("event", "鬼王之宴涤荡妖气"),
    **{table: ("event", f"鬼王之宴{label}") for table, (label, _) in DEVIL_TOWER_TABLES.items()},
    "lbs_world_boss_area": ("daily", "地域鬼王"),
    "lbs_world_boss_type": ("daily", "地域鬼王规则"),
    "shilian_event_battles": ("daily", "六道之门"),
    "shilian_event_exam": ("daily", "六道之门试炼"),
    "shilian_stage_detail": ("daily", "六道之门关卡"),
    "shilian_liudao": ("daily", "六道之门路线"),
    "shilian_area": ("daily", "六道之门岛屿"),
    "shilian_level": ("daily", "六道之门结算评级"),
    "shilian_event_campsit": ("daily", "六道之门营地商品"),
    "shilian_event_chest": ("daily", "六道之门宝匣"),
    "shilian_event_question": ("daily", "六道之门奇遇"),
    "shilian_yanling_event": ("daily", "六道之门真言塔事件"),
    "hunling_boss": ("daily", "契灵之境"),
    "hunling_tansuo": ("daily", "契灵之境"),
    "rpg_chapter": ("daily", "剧情副本"),
    "storyChapter": ("daily", "探索章节"),
    "story_room": ("daily", "探索战斗点"),
    "DramaProcess": ("daily", "主线剧情进程"),
    "BossTower": ("daily", "探索式神挑战"),
    "guild_boss_show": ("guild", "首领退治"),
    "guild_boss_reward": ("guild", "首领退治难度"),
    "gve_battleinfo": ("guild", "麒麟狩猎"),
    "guild_crevice_area": ("guild", "狭间暗域"),
    "guild_crevice_battle": ("guild", "狭间暗域"),
    "guild_dinner": ("guild", "阴阳寮宴会料理"),
    "guild_dinner_monster": ("guild", "阴阳寮宴会食材目标"),
    "boss_food_battle": ("guild", "寝肥合战食材"),
    "league_qinfei": ("guild", "寝肥应援寮式神分组"),
    "qinfei_fight_buff": ("guild", "寝肥合战每日规则"),
    "dojo_2024_qinfei_battle_match": ("guild", "寝肥合战历史赛程"),
    "guild_monster": ("guild", "阴阳寮麒麟"),
    "guild_fake_god_event": ("guild", "青森之秘事件"),
    "guild_fake_god_map": ("guild", "青森之秘地格"),
    "guild_fake_god_route": ("guild", "青森之秘路线"),
    "act_team_battle": ("event", "活动组队战斗"),
    "activity_lbs_intro": ("event", "现世妖约活动详情"),
    "activity_offline_lbs_mass": ("event", "现世妖约活动地点"),
    "xinghen_battle": ("daily", "彼世逢魔"),
    "SuperGhost_mission": ("event", "超鬼王"),
    "SuperGhost_bossmission": ("event", "超鬼王首领挑战"),
    SHANFENG_PVE: ("event", "初翎山风超鬼王 · 历练成王"),
    "shiki_boss": ("event", "化四季 · 四时归焉"),
    "super_ghost_hjs_special_attack": ("event", "超鬼王特攻日期"),
    "super_ghost_hjs_special_attack_group": ("event", "超鬼王特攻式神"),
    "journey_hardbattle": ("event", "京畿净化首领挑战"),
    "defence_dungeon_multiple_buff": ("event", "秘境强力加成"),
    "ten_anni_2026_event": ("event", "巡于黄金之河事件"),
    "ten_anni_2026_dungeon_battle": ("event", "巡于黄金之河战斗配置"),
    "urdtg_ui": ("event", "飞羽凌云玩法"),
    "urdtg_event": ("event", "围场赛事事件"),
    "urdtg_dungeon_battle": ("event", "围场赛事战斗"),
    "dream_act_hero": ("event", "幻游问梦 · 梦境试炼"),
    "asura_p2_config": ("event", "天魔归来 · 帝释天决战"),
    "asura_phase_time": ("event", "天魔归来 · 活动阶段"),
    "asura_map": ("event", "天魔归来 · 深渊地格"),
    "asura_play_type1": ("event", "天魔归来 · 深渊据点战斗"),
    "asura_play_type2": ("event", "天魔归来 · 深渊凝罪塔"),
    "asura_play_type3": ("event", "天魔归来 · 深渊派遣"),
    "asura_play_type4": ("event", "天魔归来 · 深渊捐赠"),
    "asura_guilty_tower": ("event", "天魔归来 · 深渊层数"),
}

JOURNEY_BATTLE_VARIANTS = {
    "journey_normalbattle_jinbi": "金币",
    "journey_normalbattle_jingyan": "经验",
    "journey_normalbattle_yuhun": "御魂",
    "journey_normalbattle_juexing": "觉醒",
}

RESOURCE_STAGES = {"经验副本": ("经验妖怪", 656), "金币副本": ("金币妖怪", 657)}
RESOURCE_CONSTANTS = {
    "2111": ((9822, "引擎截止时间"), (9834, "补怪总量")),
    "2109": ((9820, "原版经验关卡 ID 列表"), (9822, "引擎截止时间"), (9823, "选角时间"),
             (9824, "原版补怪模板池"), (9834, "补怪总量")),
    "2009": ((9821, "原版金币关卡 ID 列表"), (9822, "引擎截止时间"), (9823, "选角时间"),
             (9828, "金币计算参数"), (9829, "首领生命百分比档位"), (9830, "金币档位倍率"),
             (9831, "基础金币下限"), (9841, "基础金币上限")),
}
GUILD_BOSS_TROOPS = {101, 102, 111, 112, 121, 122}
HUNT_CODE_TARGETS = (10020208, 10020207, 10020209, 10020210)
RETREAT_CODE_TARGETS = {1200501: 10020206, 1200500: 10020204, 1200600: 10020205}
REGION_DIFFICULTY_SKILLS = {10409: "极难默认词条", 10418: "极难奖励词条"}
TRUE_OROCHI_MAP_ID = 71
TRUE_OROCHI_MODE = 3005
TRUE_OROCHI_CODE = 10020228
MAP_BOSS_HELP = {
    69: ("SHIJU_TIPS", "石距玩法原文"),
    73: ("FENNUDESHIJU_TIPS", "愤怒的石距玩法原文"),
    70: ("NIANSHOU_TIPS", "年兽玩法原文"),
    74: ("NIANSHOU_TIPS", "年兽玩法原文"),
    75: ("NIANSHOU_TIPS", "年兽玩法原文"),
}
LBS_HISTORY_NAMES = {19028: "肯德基（KFC）鬼王", 19030: "融创雪世界 · 滑雪小王子垢尝"}
LBS_HISTORY_RULES = {
    19039: (("LBS_douyin2023", "抖音联动挑战规则"), ("LBS_douyin2023_shop", "现世商店规则"),
            ("LBS_douyin2023_present", "现世赠送规则")),
    19030: (("rongchuang_ski_tips", "同活动的银道雪场规则"),),
}
LBS_HISTORY_TICKETS = {19030: 1433006, 19039: 1460317}

# The raw fields remain available. Each relation below names the ID namespace
# used by the corresponding client table.
EDGES = {
    "pve_stage_data": (("groupid", "BattleMonstersInfo", "敌方编组"),),
    "story_room": (("MonsterID", "pve_stage_data", "探索 PvE 关卡"),
                   ("MonsterID", "BattleMonstersInfo", "探索敌方编组")),
    "dungeon_rune": (("scene", "Combinesceneinfo", "关卡场景"),),
    "dungeon_awake": (("monsterid", "dungeon_awake_monster", "觉醒敌方配置"),
                      ("scene", "dungeon_awake_scene", "觉醒场景配置")),
    "dungeon_awake_scene": (("sceneid", "Combinesceneinfo", "关卡场景"),),
    "dungeon_challenge": (("scene", "Combinesceneinfo", "关卡场景"),),
    "dungeon_challenge2": (("scene", "Combinesceneinfo", "关卡场景"),),
    "dungeon_challenge_series": (("scene", "Combinesceneinfo", "关卡场景"),
                                 ("activity_time", "activity", "开放配置")),
    "dungeon_yuling": (("scene", "Combinesceneinfo", "关卡场景"),),
    "MZB_fengmo": (("boss_id", "monster", "首领"),),
    "fengmo_band_personal_boss": (("battleid", "pve_stage_data", "单人挑战关卡"),
                                   ("monster_id", "monster", "首领原型")),
    "devil_battle": (("battle_id", "pve_stage_data", "历练关卡"),),
    "devil_feast_event5": (("battle_id", "pve_stage_data", "灵气激发关卡"), ("boss_id", "hero", "首领式神")),
    "devil_feast_event6": (("battle_id", "pve_stage_data", "大妖考验关卡"), ("boss_id", "hero", "首领式神")),
    "lbs_world_boss_area": (("dist_id", "lbs_world_boss_init", "地图分区"),),
    "act_team_battle": (("act_id", "activity", "活动开放配置"),),
    "xinghen_battle": (("stage_id", "pve_stage_data", "彼世逢魔关卡"),),
    "journey_hardbattle": (("battle_id", "pve_stage_data", "首领挑战关卡"),),
    "shilian_liudao": (("pve_id", "pve_stage_data", "路线配置 PvE"),),
    "SuperGhost_mission": (("actid", "activity", "活动开放配置"), ("sceneid", "Combinesceneinfo", "关卡场景")),
    "SuperGhost_bossmission": (("sceneid", "Combinesceneinfo", "关卡场景"),),
    "guild_boss_show": (("bossID", "monster", "首领"),),
    "guild_dinner": (("reward_id", "reward", "料理奖励"),),
    "gve_battleinfo": (("scene", "Combinesceneinfo", "关卡场景"),),
    "boss_info": (("protoId", "monster", "首领模板"),),
    "guild_crevice_battle": (("easy_main_monster", "monster", "简单首领"),
                             ("normal_main_monster", "monster", "普通首领"),
                             ("hard_main_monster", "monster", "困难首领"),
                             ("ji_main_monster", "monster", "极难首领")),
    "hunling_boss": (("catch_battle_id", "pve_stage_data", "收服关卡"),
                     ("hunling_id", "hunling_base", "首领与共鸣规则"),
                     ("mark_group_id", "hunling_mark_group", "指定术印组")),
    "Combinesceneinfo": (("battlesceneinfo", "BattleScenesInfo", "战斗站位"),),
}
FOLLOWED_TABLES = {"pve_stage_data", "BattleMonstersInfo", "Combinesceneinfo", "dungeon_awake_scene",
                   "normal_battle_tips", "battle_team_routes", "raid_info", "boss_info", "friend_fb",
                   "dojo2025_bbbl_block_play", "dojo2026_bbbl_block_play"}
DOJO_AREA_TYPES = {1: "普通战斗", 2: "精英挑战", 3: "神社战斗", 4: "首领战", 5: "租借处", 6: "传送门"}
FOREST_EVENT_TYPES = {1: "普通怪", 2: "精英", 3: "首领", 4: "巢穴", 5: "宝箱", 6: "派遣", 7: "净化", 8: "起点"}
BATTLE_ID_FIELDS = ("battle_id", "battleId", "pve_stage_id", "pve_id")
TEN_ACTIVITY_LINKS = {
    12130: (("ten_anni_2026_ui", 1, "拾光永恒活动入口"), ("activity", 12132, "亘地回响开放期"),
            ("activity", 12134, "巡于黄金之河开放期"), ("activity", 12135, "炼石成金开放期")),
    12132: (("ten_anni_2026_ui", 16, "虚无精锐战斗入口"),
            ("pve_stage_data", 12130001, "虚无精锐简单档"), ("pve_stage_data", 12130002, "虚无精锐困难档")),
    12134: (("ten_anni_2026_ui", 3, "地图探索入口"),),
    TEN_BOSS_ACT: (("ten_anni_2026_ui", 5, "炼石成金挑战入口"),
            ("stake_boss", 22, "首领挑战次数与消耗"), ("battle_team_routes", TEN_BOSS_TEAM, "原版首领战入口"),
            ("ten_anni_2026_const", 100, "五层首领顺序"),
            *(("pve_stage_data", stage, f"首领第 {index} 层") for index, stage in enumerate(TEN_BOSS_STAGES, 1))),
}
TEN_ACTIVITY_RULES = {
    12130: ("10th_ssrshichangji_main_tip", "活动参与和玩法规则"),
    12132: ("10th_ssrshichangji_pata_tip", "虚无精锐及虚无合战规则"),
    12134: ("ssr10th_shichangji_ditu_tip", "探索和遭遇战队伍规则"),
    12135: ("ssr10th_shichangji_boss_tip", "首领战计分和奖励规则"),
}
RULE_TEXT_FIELDS = {"tip": "关卡提示", "fbtips": "副本规则", "attack_tip": "战斗提示",
                    "rule": "玩法规则", "boss_rule": "首领机制", "notice": "机制说明", "fb1_defs": "竞速规则"}
PANEL_RULE_FIELDS = {"normal_battle_tips": ("rule_key", "通用战斗规则原文"),
                     "dungeon_challenge_series": ("fbtips", "秘闻默认规则原文")}
NAME_FIELDS = ("title_name", "name", "boss_name", "battle_name", "chapter_name",
               "area_name", "floordesc", "title")


def numeric_key(value):
    if type(value) is int and value > 0:
        return str(value)
    if isinstance(value, str) and value.isascii() and value.isdecimal() and int(value) > 0:
        return str(int(value))
    return None


def reference_key(value):
    if isinstance(value, dict) and set(value) == {"$tuple"} and isinstance(value["$tuple"], list):
        parts = tuple(str(item) if type(item) is int else numeric_key(item) for item in value["$tuple"])
        if parts and None not in parts:
            return parts
    if type(value) is int and value == 0:
        return "0"
    return numeric_key(value) or (value if isinstance(value, str) and value else None)


def name(row):
    return next((row[key].strip() for key in NAME_FIELDS
                 if isinstance(row.get(key), str) and row[key].strip()), "")


def encounter_index(source, load_rows):
    manifests = {row["name"]: row for row in source["tables"] if row["status"] == "decoded"}
    lookup = {}
    language = "languageData_cn"
    localized = {key for key, row in load_rows(language)
                 if isinstance(key, str) and isinstance(row, dict) and row.get("cn")} if language in manifests else set()
    rule_table = "system_rule_dsc"
    legacy_tips = "tipsInfoData_cn"
    rules = {key for key, row in load_rows(rule_table)
             if isinstance(key, str) and isinstance(row, dict) and row.get("rule_dsc")} if rule_table in manifests else set()
    tips = {key for key, row in load_rows(legacy_tips)
            if isinstance(key, str) and isinstance(row, str) and row.strip()} if legacy_tips in manifests else set()

    def table(name):
        if name not in lookup:
            rows = load_rows(name) if name in manifests else []
            lookup[name] = {key_id: (key, row) for key, row in rows
                            if (key_id := reference_key(key)) is not None}
        return lookup[name]

    def relation(destination, value, label, unresolved):
        key_id = reference_key(value)
        if key_id is None:
            return None
        match = table(destination).get(key_id)
        if match is None:
            return None if not unresolved else {"table": destination, "key": value, "label": label, "found": False}
        return {"table": destination, "key": match[0], "label": label, "found": True}

    def fengmo_band_buffs(row):
        return [ref for field, label in (("camp1_buff", "我方增益"), ("camp2_buff", "敌方首领增益"))
                for buff in row.get(field, ()) if (ref := relation("buff", {"$tuple": [buff, 1]}, label, False))]

    tianfa_by_stage = {numeric_key(row.get("stage_id")): key for key, row in table("xinghen_battle").values()}
    devil_feast_by_stage = {numeric_key(row["battle_id"]): (source, key)
                           for source in ("devil_battle", "devil_feast_event5", "devil_feast_event6")
                           for key, row in table(source).values()}
    tower_by_stage = {}
    for event_source in TOWER_EVENT_SOURCES:
        for key, row in sorted(table(event_source).values()):
            tower_by_stage.setdefault(numeric_key(row["battleId"]), (event_source, key))
    laolao_by_stage = {numeric_key(row[field]): key for key, row in table("feast_for_devils_tower_event7").values()
                       for field in ("fightId1", "fightId2", "fightId3") if row[field]}
    dojo_area_by_stage, dojo_area_activities = {}, {}
    for year in (2025, 2026):
        plays = f"dojo{year}_bbbl_block_play"
        for play_key, play in table(plays).values():
            dojo_area_by_stage.setdefault(numeric_key(play.get("battle_ids")), []).append((plays, play_key))
        for round_key, period in table(f"dojo{year}_bbbl_map_count").values():
            dojo_area_activities[period.get("activity_id")] = (year, round_key)
    forest_by_stage = {}
    for key, row in sorted(table("guild_fake_god_event").values()):
        stage = numeric_key(row.get("battle_id"))
        if stage and int(stage) in FOREST_STAGES:
            signature = (row["type"], tuple(row["buff_info"]))
            forest_by_stage.setdefault(stage, {}).setdefault(signature, key)
    forest_map_cells = {}
    for key, row in sorted(table("guild_fake_god_map").values()):
        forest_map_cells.setdefault(row["map_id"], []).append(key)
    ten_dungeon_by_stage = {numeric_key(row["battle_id"]): key
                            for key, row in table("ten_anni_2026_dungeon_battle").values()}
    ten_map_events = {}
    for key, row in table("ten_anni_2026_event").values():
        if row.get("type") in (1, 2, 5) and row.get("params"):
            ten_map_events.setdefault(row["params"][0], []).append(key)

    def rule_reference(key, label):
        dest = legacy_tips if key not in rules and key in tips else rule_table
        return {"table": dest, "key": key, "label": label, "found": key in rules or key in tips}

    @cache
    def level_one_skills():
        result = {}
        for key in table("skill"):
            if isinstance(key, tuple) and len(key) == 3 and key[1] == "1":
                result.setdefault(key[0], []).append(key)
        return result

    def level_one_skill(skill_id):
        options = level_one_skills().get(numeric_key(skill_id), ())
        return {"$tuple": [int(part) for part in options[0]]} if len(options) == 1 else skill_id

    qinfei_activities = {10425: (2025, 4), 13005: (2026, 5)}

    def qinfei_schedule(activity_id):
        year, raid = qinfei_activities[activity_id]
        refs = [
            ("battle_mode_routes", 320, "寝肥首领战原版引擎"),
            ("battle_mode_routes", QINFEI_FOOD_MODE, "寝肥食材战原版引擎"),
            ("raid_info", {"$tuple": [raid, 1]}, f"{year} 年寝肥首领档"),
        ]
        refs.extend(("qinfei_fight_buff", key, "每日首领机制") for key, buff in sorted(table("qinfei_fight_buff").values())
                    if (buff.get("date") or [None])[0] == year)
        if year == 2026:
            refs.extend([("active_time", "the_sleeping_beauty", "每日开放时段"),
                         ("dojo_const", 112, "集结时间"),
                         ("dojo_const", 309, "阵容码场景编号"),
                         ("team_assist_stage", 101002, "寝肥合战阵容码场景"),
                         ("pve_stage_data", 26325, "寝肥入场券战斗"),
                         ("Constant", 3222, "入场券战斗配置"),
                         ("currency", 900264, "入场券")])
            refs.extend(("boss_food_battle", key, "食材与惊喜战斗") for key in QINFEI_FOODS)
            refs.extend(("pve_stage_data", key, "食材战斗") for key in QINFEI_FOOD_STAGES)
            refs.extend(("league_qinfei", key, "应援寮式神分组") for key, _ in sorted(table("league_qinfei").values()))
        links = [ref for dest, key, label in refs if (ref := relation(dest, key, label, False))]
        if year == 2026 and "liansai_qinfei_notice_trunk" in rules:
            links.append(rule_reference("liansai_qinfei_notice_trunk", "比赛、食材与投喂规则"))
        return links

    def nian_references(mode):
        links = [rule_reference("xianshi_nianshou_activity_tips", "年兽挑战及召唤规则")]
        refs = (("activity", 774, "现世年兽活动配置"),
                ("battle_mode_routes", mode, "原版战斗场景"),
                ("battle_team_routes", 664 if mode == NIAN_MODE else 665, "原版组队入口"),
                ("monster", 100032, "兽型年兽"),
                ("skill", level_one_skill(NIAN_PASSIVE), "年兽阶段被动"))
        links.extend(ref for dest, key, label in refs if (ref := relation(dest, key, label, False)))
        return links

    def meituan_references():
        refs = (("activity_lbs_intro", 46, "美团联动入口配置"), ("activity", 7236, "活动开放时间"),
                ("battle_team_routes", 721, "美团组队入口"), ("battle_mode_routes", MEITUAN_MODE, "宴席大赛战斗场景"),
                ("Constant", 10090, "按参战人数修正生命"), ("skill", level_one_skill(MEITUAN_SKILLS[0]), "珍馐"),
                ("skill", level_one_skill(MEITUAN_SKILLS[1]), "美馔"))
        return [rule_reference(key, label) for key, label in (
            ("LBS_meituan2021_zhandou", "宴席大赛机制"), ("LBS_meituan2021", "联动挑战规则"),
            ("LBS_meituan2021_shop", "现世商店规则"), ("LBS_meituan2021_present", "现世赠送规则"),
            ("LBS_meituan2021_seal", "美食印章规则"), ("LBS_meituan2021_takeaway", "美食速递规则"),
            ("LBS_meituan2021_redenvelope", "美食福袋规则"),
        ) if key in rules or key in tips] + [
            ref for dest, key, label in refs if (ref := relation(dest, key, label, False))
        ]

    def region_modifiers():
        constants = table("Constant")
        if not any(str(key) in constants for key in REGION_DIFFICULTY_SKILLS):
            return []
        # AreaKingBossInfoPanel reads level-one skill data. Each included ID
        # currently has one such row, including rows with a non-default variant.
        links = []
        for constant_id, label in REGION_DIFFICULTY_SKILLS.items():
            ref = relation("Constant", constant_id, f"{label}编号表", True)
            links.append(ref)
            if not ref["found"]:
                continue
            ids = constants[str(constant_id)][1].get("value", ())
            for skill_id in ids if isinstance(ids, list) else ():
                if type(skill_id) is float and skill_id.is_integer():
                    skill_id = int(skill_id)
                skill = relation("skill", level_one_skill(skill_id), label, True)
                if skill:
                    links.append(skill)
        return links

    teams_by_mode = {}
    for key, row in table("battle_team_routes").values():
        teams_by_mode.setdefault(row["battleMode"], []).append(key)
    rooms_by_map, rooms_by_stage = {}, {}
    urdtg_by_stage = {numeric_key(row["battle_id"]): key for key, row in table("urdtg_dungeon_battle").values()}
    urdtg_events_by_battle = {}
    dream_heroes_by_stage = {numeric_key(row["battle_id"]): key for key, row in table("dream_act_hero").values()}
    ji_boss_by_stage = {numeric_key(row["battle_id"]): (key, row) for key, row in table("shiki_boss").values()}
    shanfeng_by_config, shanfeng_by_stage, shanfeng_tiers = {}, {}, {}
    shanfeng_chapters = Counter()
    for key, row in sorted(table(SHANFENG_PVE).values(), key=lambda pair: pair[1]["id"]):
        title = row["title"]
        if "battle_id" in row:
            shanfeng_chapters[row["type"]] += 1
            tier = shanfeng_tiers[numeric_key(key)] = shanfeng_chapters[row["type"]]
            battles = [(row["battle_id"], f"历练 · {title} · 第 {tier} 关")]
        else:
            battles = [(stage, f"成王 · 第 {day} 日 · {difficulty}")
                       for day in SHANFENG_DAY_RULES
                       for difficulty, stage in zip(("简单", "困难"), row.get(f"final_battle_id_day{day}", ()))]
        shanfeng_by_config[numeric_key(key)] = battles
        for stage, label in battles:
            shanfeng_by_stage[numeric_key(stage)] = (row, label)
    asura_depth_by_stage = {numeric_key(row.get("battle_id")): (dest, key)
                            for dest in ASURA_DEPTH_TABLES for key, row in table(dest).values()}
    asura_cells_by_work = {}
    for key, row in table("asura_map").values():
        if row.get("work"):
            asura_cells_by_work.setdefault(row["work"], []).append(key)
    asura_scene_by_layer = {row.get("activity_id"): key for key, row in table("asura_scene").values()}
    for key, row in table("urdtg_event").values():
        params = row.get("params")
        if row.get("type") in (1, 2) and params:
            urdtg_events_by_battle.setdefault(numeric_key(params[0]), []).append(key)
    for key, row in table("story_room").values():
        map_id = numeric_key(row.get("MapEntryID"))
        if map_id is not None:
            rooms_by_map.setdefault(map_id, []).append(key)
        stage_id = numeric_key(row.get("MonsterID"))
        if stage_id is not None:
            rooms_by_stage.setdefault(stage_id, []).append(key)
    for keys in rooms_by_map.values():
        keys.sort(key=int)
    chapter_entrances = {
        map_id: (key, table("storyChapter")[numeric_key(key)][1])
        for key, row in table("mapnpc").values()
        if (map_id := numeric_key(row.get("battle_id"))) in rooms_by_map and numeric_key(key) in table("storyChapter")
    }
    regions_by_stage = {}
    for key, area in table("lbs_world_boss_area").values():
        for choice in area.get("weighted_battles", ()):
            if isinstance(choice, list) and len(choice) == 2 and (stage_id := numeric_key(choice[0])):
                regions_by_stage.setdefault(stage_id, []).append(key)
    orochi_key, orochi = table("map_boss").get(str(TRUE_OROCHI_MAP_ID), (None, {}))
    # ZhenDaSheEngine reads gk_list in order, then reads each PvE row's groupid.
    orochi_floors = {numeric_key(config[0]): floor for floor, config in enumerate(orochi.get("gk_list", ()), 1)
                     if isinstance(config, list) and config and numeric_key(config[0])}
    map_boss_stages, map_boss_by_stage = {}, {}
    for key, boss in sorted(table("map_boss").values(), key=lambda item: int(item[0])):
        if key == TRUE_OROCHI_MAP_ID:
            continue
        stages = {stage[0]: f"配置等级 {stage[1]}" for stage in boss.get("gk_list", ())
                  if isinstance(stage, list) and len(stage) >= 2 and numeric_key(stage[0])}
        if base_id := numeric_key(boss.get("gk_base_id")):
            stages.setdefault(int(base_id), "基础关卡配置")
        map_boss_stages[key] = stages
        for stage_id in stages:
            map_boss_by_stage.setdefault(numeric_key(stage_id), []).append(key)
    lbs_intros_by_type, lbs_intros_by_activity = {}, {}
    for key, intro in sorted(table("activity_lbs_intro").values()):
        lbs_intros_by_type.setdefault(intro.get("act_type"), []).append(key)
        lbs_intros_by_activity.setdefault(intro.get("activity_id"), []).append(key)
    lbs_bosses_by_type, lbs_sites = {}, {}
    for key, boss in table("map_boss").values():
        lbs_bosses_by_type.setdefault(boss.get("type"), []).append(key)
    for key, site in sorted(table("activity_offline_lbs_mass").values()):
        if site.get("mapbossid") and site.get("act_id"):
            lbs_sites.setdefault(site["mapbossid"], {}).setdefault(site["act_id"], []).append(key)

    def lbs_intro_rules(intro):
        return [rule_reference(rule, "活动规则原文") for rule in intro.get("ui", ())
                if isinstance(rule, str) and (rule in rules or rule in tips)]

    def lbs_map_history(row):
        sites = lbs_sites.get(row.get("id"), {})
        intro_ids = set(lbs_intros_by_type.get(row.get("type"), ()))
        for activity in sites:
            intro_ids.update(lbs_intros_by_activity.get(activity, ()))
        links = []
        for intro_id in sorted(intro_ids):
            _, intro = table("activity_lbs_intro")[str(intro_id)]
            links.append(relation("activity_lbs_intro", intro_id, "活动入口配置", False))
            if opening := relation("activity", intro.get("activity_id"), "活动开放配置", False):
                links.append(opening)
            links.extend(lbs_intro_rules(intro))
        for activity, keys in sorted(sites.items()):
            if opening := relation("activity", activity, "地点所属活动配置", False):
                links.append(opening)
            links.append(relation("activity_offline_lbs_mass", keys[0], f"活动地点（同活动共 {len(keys)} 处）", False))
        return links
    hunling_routes = {str(stage_id): row for stage_id, row in (*exploration_stages(), *challenge_stages())}
    hunling_codes = {row["search_id"]: key for key, row in table("team_assist_stage").values()
                     if isinstance(row.get("name"), str) and row["name"].startswith("契灵")}
    shilian_exams = {row.get("dao"): key for key, row in table("shilian_event_exam").values()}
    shilian_details = {}
    for key, row in table("shilian_stage_detail").values():
        shilian_details.setdefault(row.get("dao"), []).append(key)
    shilian_grades = {}
    for key, row in table("shilian_level").values():
        shilian_grades.setdefault(row.get("dao"), []).append(key)
    shilian_battles, shilian_battles_by_stage = {}, {}
    for key, row in table("shilian_event_battles").values():
        shilian_battles.setdefault(row.get("group_id"), []).append(key)
        shilian_battles_by_stage.setdefault(numeric_key(row.get("battle_id")), []).append(key)
    shilian_exam_stages = {numeric_key(row.get("battle_id")): key for key, row in table("shilian_event_exam").values()}
    shilian_route_stages = {}
    for key, row in table("shilian_liudao").values():
        shilian_route_stages.setdefault(numeric_key(row.get("pve_id")), []).append(key)

    crevice_stages = {}
    crevice_by_boss = {}
    crevice_targets = dict(table("guild_crevice_battle").values())
    for stage_id in sorted(CREVICE_STAGES):
        _, stage = table("pve_stage_data").get(str(stage_id), (None, None))
        if not stage:
            continue
        _, group = table("BattleMonstersInfo").get(numeric_key(stage.get("groupid")), (None, None))
        if not group:
            continue
        route = crevice_route(stage_id, stage, group, crevice_targets)
        crevice_stages[str(stage_id)] = route
        if stage_id == route["groupId"] and route["bossId"]:
            crevice_by_boss[route["bossId"]] = stage_id

    def hunling_references(route):
        region, level, spirit, _ = route
        team = 1030 if spirit is None else 1031
        refs = [("hunling_tansuo", region, "探查地区与增益"), ("hunling_tansuo_lv", level, "探查等级与星级池"),
                ("battle_team_routes", team, "原版战斗入口")]
        if spirit is not None:
            refs.extend((("hunling_base", spirit, "首领与共鸣规则"), ("hunling_weak_soul", spirit, "缘分式神概率加成"),
                         ("hunling_noraml_boss_battle", {"$tuple": [spirit, level]}, "该等级首领奖励")))
            refs.extend(("hunling_prop", item, "式盘及分级基础概率") for item in CAPTURE_ITEMS)
            _, level_row = table("hunling_tansuo_lv").get(str(level), (None, {}))
            stars = sorted({level_row[key][0] for key in ("hunling_begin_star", "hunling_end_star") if level_row.get(key)})
            refs.extend(("team_assist_stage", hunling_codes.get(30000 + (spirit - 100) * 10 + star), f"{star} 星阵容码目录")
                        for star in stars)
        else:
            _, region_row = table("hunling_tansuo").get(str(region), (None, {}))
            refs.append(("skill", level_one_skill(region_row.get("skill_id")), "探查实际增益"))
        return [ref for dest, target, label in refs if (ref := relation(dest, target, label, False))]

    def explicit(name, row):
        links = []
        for field, destination, label in EDGES.get(name, ()):
            resolved = relation(destination, row.get(field), label, True)
            if resolved:
                links.append(resolved)
        if name in {"guild_dinner", "guild_dinner_monster"}:
            if ref := relation("battle_mode_routes", GUILD_DINNER_MODE, "阴阳寮宴会规则", False):
                links.append(ref)
        if name == "guild_dinner":
            links.extend(ref for material, counts in (row.get("food_material") or {}).get("$mapping", ())
                         if counts and counts[0] > 0
                         and (ref := relation("guild_dinner_monster", material, "全寮累计击败目标", True)))
            links.extend(ref for recipe in row.get("dinner_unlock_pre_cond", ())
                         if (ref := relation("guild_dinner", recipe, "前置料理", True)))
        if name == "guild_dinner_monster" and (example := GUILD_DINNER_EXAMPLES.get(row.get("id"))):
            destination, key, stage_id = example
            _, entry = table(destination).get(str(key), (None, {}))
            _, battle = table("pve_stage_data").get(str(stage_id), (None, {}))
            _, formation = table("BattleMonstersInfo").get(numeric_key(battle.get("groupid")), (None, {}))
            matches_entry = (entry.get("MonsterID") == stage_id if destination == "story_room"
                             else any(stage[0] == stage_id for stage in entry.get("gk_list", ())))
            if matches_entry and any(len(slot) > 1 and slot[1] == row["id"]
                                     for wave in formation.get("MonstersInfos", ()) for slot in wave):
                links.append(relation(destination, key, "含同模板怪物的原版战斗", False))
        if name == "battle_mode_routes" and row.get("mode_symbol") == "MODE_GUILD_DINNER":
            links.extend(rule_reference(key, label) for key, label in GUILD_DINNER_RULES if key in rules)
            links.extend(ref for key, label in GUILD_DINNER_CONSTANTS
                         if (ref := relation("Constant", key, label, False)))
            links.extend(relation("guild_dinner_monster", key, "料理筹备目标", False)
                         for key, _ in sorted(table("guild_dinner_monster").values()))
        if name == "battle_mode_routes" and row.get("battleMode") in (BREAKTHROUGH_MODE, GUILD_BREAKTHROUGH_MODE):
            personal = row["battleMode"] == BREAKTHROUGH_MODE
            if "jiejietupo_tips" in rules or "jiejietupo_tips" in tips:
                links.append(rule_reference("jiejietupo_tips", "个人与阴阳寮结界突破规则"))
            rows = [
                ("team_assist_stage", BREAKTHROUGH_STAGE, "阵容码目标"),
                ("Combinesceneinfo", BREAKTHROUGH_SCENE, "默认结界战斗场景"),
                ("BattleScenesInfo", 402, "默认站位"),
            ]
            if personal:
                rows.extend((
                    ("Constant", 2065, "鲤鱼旗裁判开关"),
                    ("currency", 900024, "结界挑战券"),
                    ("currency", 900016, "挑战奖励勋章"),
                ))
                for dest, label in (("dg_flaglevel", "裁判档位"), ("dg_flagmodify", "裁判回合效果")):
                    rows.extend((dest, ref_key, label) for ref_key, _ in sorted(table(dest).values()))
            else:
                rows.append(("currency", 900017, "阴阳寮勋章"))
            links.extend(ref for dest, ref_key, label in rows if (ref := relation(dest, ref_key, label, False)))
        if name == "battle_mode_routes" and row.get("battleMode") in (DOJO_DEFENDER_MODE, DOJO_GUARDIAN_MODE):
            guardian = row["battleMode"] == DOJO_GUARDIAN_MODE
            other_mode = DOJO_DEFENDER_MODE if guardian else DOJO_GUARDIAN_MODE
            rows = [("team_assist_stage", DOJO_CODE_STAGE, "道馆阵容码目标"),
                    ("battle_mode_routes", other_mode, "关联的道馆阶段")]
            if guardian:
                rows.append(("Constant", 3750, "守护兽战进攻加成"))
                rows.extend(("pve_stage_data", stage, "守护兽关卡") for stage in DOJO_GUARDIAN_STAGES)
                tables = (("dg_guardian", "守护兽生命修正"),)
            else:
                if "daoguanzhenrongyushe_tips" in rules or "daoguanzhenrongyushe_tips" in tips:
                    links.append(rule_reference("daoguanzhenrongyushe_tips", "道馆备选阵容规则"))
                rows.extend((("Constant", 3762, "单段时间配置"), ("Constant", 3793, "换波鬼火配置"),
                             ("Constant", 4312, "进攻加成配置"), ("languageDataEx", "dg_tips_58", "馆主后续防守规则"),
                             ("languageDataEx", "dg_tips_60", "助威规则"), ("languageDataEx", "dg_tips_62", "上阵阶段退出规则"),
                             ("Combinesceneinfo", BREAKTHROUGH_SCENE, "默认攻防场景"),
                             ("BattleScenesInfo", 402, "默认攻防站位")))
                tables = (("dg_guardian", "道馆等级修正"), ("dg_buff", "道馆购买加成"),
                          ("dg_enchance", "防守词条"), ("dg_rank", "道馆档位与奖励"),
                          ("dg_stage_buff", "阶段加成"), ("dg_timer_buff", "计时加成"),
                          ("dg_flaglevel_new", "裁判档位"), ("dg_flagmodify_new", "裁判回合效果"))
            for dest, label in tables:
                rows.extend((dest, key, label) for key, _ in table(dest).values())
            links.extend(ref for dest, ref_key, label in rows if (ref := relation(dest, ref_key, label, False)))
        if name == "pve_stage_data" and int(numeric_key(row.get("id")) or 0) in DOJO_GUARDIAN_STAGES:
            rows = [
                ("battle_mode_routes", DOJO_GUARDIAN_MODE, "原版道馆守护入口"),
                ("team_assist_stage", DOJO_CODE_STAGE, "道馆阵容码目标"),
                ("Constant", 3750, "守护兽战进攻加成"),
            ]
            rows.extend(("dg_guardian", key, "守护兽生命修正") for key, _ in table("dg_guardian").values())
            links.extend(ref for dest, ref_key, label in rows if (ref := relation(dest, ref_key, label, False)))
        shanfeng_stage = shanfeng_by_stage.get(numeric_key(row.get("id"))) if name == "pve_stage_data" else None
        shanfeng_route = name == "battle_mode_routes" and row.get("battleMode") == SHANFENG_MODE
        if name == SHANFENG_PVE or shanfeng_stage or shanfeng_route:
            if not shanfeng_route:
                links.append(relation("battle_mode_routes", SHANFENG_MODE, "原版历练成王入口", True))
            links.extend(ref for dest, key, label in (
                ("battle_team_routes", SHANFENG_MODE, "原版单人战斗入口"),
                ("hero", 1454, "活动固定出战角色"),
                ("super_ghost6_constant", 7, "活动角色编号与等级"),
                ("super_ghost6_constant", 18, "引擎敌方编组区间"),
            ) if (ref := relation(dest, key, label, False)))
            links.extend(rule_reference(key, label) for key, label in SHANFENG_RULES if key in rules or key in tips)
            if shanfeng_route:
                links.extend(relation(SHANFENG_PVE, config, "历练成王关卡配置", False)
                             for config, _ in table(SHANFENG_PVE).values())
            else:
                config = shanfeng_stage[0] if shanfeng_stage else row
                config_key = numeric_key(config["id"])
                if name == SHANFENG_PVE:
                    links.extend(relation("pve_stage_data", stage, label, True) for stage, label in shanfeng_by_config[config_key])
                else:
                    links.append(relation(SHANFENG_PVE, config["id"], "关卡开放与首通规则", True))
                rows = [("reward", config.get("first_reward_id"), "原表首通奖励")]
                if "battle_id" in config:
                    rows.extend(((SHANFENG_PVE, config.get("pre_id"), "前置历练"),
                                 ("super_ghost6_constant", 16, "历练清场时限")))
                    skill = config.get("skill_id")
                    if skill:
                        rows.append(("skill", {"$tuple": [skill, shanfeng_tiers[config_key], -1]}, "对应等级的历练机制"))
                else:
                    rows.extend((("activity", SHANFENG_FINAL_ACTIVITY, "成王开放日期"),
                                 ("super_ghost6_constant", 10, "每日开放时刻"),
                                 ("super_ghost6_constant", 11, "每日关闭时刻"),
                                 ("super_ghost6_constant", 17, "各日单场计分时限"),
                                 ("super_ghost6_pve_reward", 1, "累计最高伤害奖励"),
                                 ("super_ghost6_pve_reward", 2, "排行奖励档位")))
                    for day, conditions in SHANFENG_DAY_RULES.items():
                        if not shanfeng_stage or any(numeric_key(stage) == numeric_key(row.get("id"))
                                                      for stage in config.get(f"final_battle_id_day{day}", ())):
                            rows.extend(("super_ghost6_constant", key, label) for key, label in conditions)
                links.extend(ref for dest, key, label in rows if (ref := relation(dest, key, label, False)))
        if name == "activity" and row.get("id") == SHANFENG_FINAL_ACTIVITY and shanfeng_by_config:
            links.extend(ref for dest, key, label in (
                ("battle_mode_routes", SHANFENG_MODE, "原版历练成王入口"),
                (SHANFENG_PVE, 17, "成王三日关卡配置"),
            ) if (ref := relation(dest, key, label, False)))
        ji_boss_stage = ji_boss_by_stage.get(numeric_key(row.get("id"))) if name == "pve_stage_data" else None
        ji_boss_activity = name == "activity" and row.get("id") == JI_ACTIVITY and ji_boss_by_stage
        if ji_boss_activity:
            links.extend(relation("shiki_boss", level, "四时归焉关卡", False)
                         for level, _ in ji_boss_by_stage.values())
        if name == "shiki_boss" or ji_boss_stage:
            key, config = ji_boss_stage if ji_boss_stage else (row["level_id"], row)
            story = config["boss_type"] == 1
            rule = JI_BOSS_RULES[(config["level_id"] - 1) % 3] + ("juqing_tips" if story else "tuizhi_tips")
            if rule in rules or rule in tips:
                links.append(rule_reference(rule, "原版章节独立机制"))
            rows = [
                ("pve_stage_data", config["battle_id"], "原版战斗关卡") if name == "shiki_boss"
                else ("shiki_boss", key, "原版剧情或退治配置"),
                ("battle_mode_routes", JI_BOSS_MODE, "原版四时归焉战斗入口"),
                ("normal_battle_config", JI_BOSS_MODE, "默认时限与战斗设置"),
                ("activity", JI_ACTIVITY, "化四季开放配置"),
                ("common_guide", 179, "原版四时归焉指引"),
                (language, "sishiguiyan_qitashuoming", "三章开放与奖励时间"),
                ("shiki_boss", config.get("pre_level") or None, "前置章节"),
            ]
            for skill in config.get("skill_list", ()):
                rows.append(("skill", level_one_skill(skill), f"退治首领技能 {skill}"))
            if not story:
                rows.append(("ji_constant", 39, "退治排行奖励配置"))
                _, rank_rewards = table("ji_constant").get("39", (None, {}))
                rows.extend(("reward", reward, "退治排行奖励") for reward in rank_rewards.get("value", ()))
            if config["battle_id"] == JI_STORY_ACTOR_STAGE:
                rows.extend((("normal_battle_constant", 37, "双神立替换角色配置编号"),
                             ("normal_battle_yys_replace", 19, "双神立固定角色等级与技能"),
                             ("hero", 1805, "双神立固定角色")))
            if config["battle_id"] == 505105:
                rows.extend((("normal_battle_constant", 35, "四季生中立助战站位"),
                             ("normal_battle_constant", 36, "四季生中立助战怪物编号"),
                             ("normal_battle_constant", 38, "当前资源的替换角色参数"),
                             ("monster", 4852019, "四季生剧情助战季")))
            links.extend(ref for dest, target, label in rows if (ref := relation(dest, target, label, False)))
        if name == "dream_act_hero":
            battle = row.get("battle_id")
            links.extend(ref for dest, key, label in (
                ("pve_stage_data", battle, "原版试炼关卡"), ("dream_act_battle_cond", battle, "试炼胜负条件"),
                ("DramaHeroInfo", battle, "原版固定出战配置"), ("battle_mode_routes", DREAM_TRIAL_MODE, "原版梦境试炼入口"),
                ("activity", DREAM_ACTIVITY, "活动开放配置"),
            ) if (ref := relation(dest, key, label, False)))
            links.extend(ref for stage, label in enumerate(("浅睡", "酣睡", "熟睡"), 1)
                         if (ref := relation("dream_act_stage", {"$tuple": [row["id"], stage]}, f"{label}梦境图鉴", False)))
        dream_battle = name == "pve_stage_data" and numeric_key(row.get("id")) in dream_heroes_by_stage
        if dream_battle:
            links.extend(ref for dest, key, label in (
                ("dream_act_hero", dream_heroes_by_stage[numeric_key(row["id"])], "对应梦境试炼"),
                ("dream_act_battle_cond", row["id"], "试炼胜负条件"), ("DramaHeroInfo", row["id"], "原版固定出战配置"),
                ("battle_mode_routes", DREAM_TRIAL_MODE, "原版梦境试炼入口"),
            ) if (ref := relation(dest, key, label, False)))
        if (name == "activity" and row.get("id") == DREAM_ACTIVITY or
                name == "battle_mode_routes" and row.get("mode_symbol") == "MODE_DREAM_ACT_SELF_BATTLE"):
            links.extend(rule_reference(key, label) for key, label in DREAM_RULES if key in rules)
            links.extend(relation("dream_act_hero", key, "梦境试炼", False) for key in sorted(dream_heroes_by_stage.values()))
            if name == "activity":
                if ref := relation("battle_mode_routes", DREAM_TRIAL_MODE, "原版梦境试炼入口", False):
                    links.append(ref)
                if ref := relation("currency", 9907030, "梦境互动道具", False):
                    links.append(ref)
            elif ref := relation("activity", DREAM_ACTIVITY, "活动开放配置", False):
                links.append(ref)
        if name == "asura_p2_config":
            index = row.get("id")
            final = index == 7
            links.extend(ref for dest, key, label in (
                ("pve_stage_data", row.get("battle_id"), "原版敌方编组入口"),
                ("battle_team_routes", 188 if final else 189, "原版单人战斗入口"),
                ("activity", ASURA_PHASE, "决战活动开放期"),
                ("reward", row.get("reward"), "原表奖励"),
                ("asura_const", 14 if final else 21, "单场计分时限" if final else "幻影挑战次数上限"),
            ) if (ref := relation(dest, key, label, False)))
            for field, label in (("tower_buff", "原版敌方机制"), ("crazy_boss_buff", "被吸收后首领获得的能力")):
                if row.get(field) and (ref := relation("skill", level_one_skill(row[field]), label, False)):
                    links.append(ref)
            if final:
                links.extend(ref for dest, key, label in (("asura_phase_time", 4, "结界阶段"), ("asura_phase_time", 5, "狂暴阶段"),
                    ("asura_const", 25, "单场伤害奖励门槛"), ("asura_const", 26, "各档奖励编号"),
                    *(("asura_p2_config", tower, "可吸收的圣帝幻影") for tower in range(1, 7)))
                    if (ref := relation(dest, key, label, False)))
        if name == "pve_stage_data" and (index := ASURA_STAGES.get(int(numeric_key(row.get("id")) or 0))):
            links.extend(ref for dest, key, label in (("asura_p2_config", index, "对应天魔归来玩法"),
                ("battle_team_routes", 188 if index == 7 else 189, "原版单人战斗入口"))
                if (ref := relation(dest, key, label, False)))
        if name == "asura_phase_time" and row.get("phase_activity_id"):
            if ref := relation("activity", row["phase_activity_id"], "阶段对应的活动开放期", False):
                links.append(ref)
        if name == "asura_map":
            play, event = row.get("work", 0), row.get("event", 0)
            layer = row.get("activity_id")
            work_table = f"asura_play_type{play // 10000}"
            links.extend(ref for dest, key, label in (
                (work_table, play, "地格玩法配置"), (f"asura_event_type{event // 10000}", event, "地格事件与规则"),
                ("asura_guilty_tower", layer, "所属深渊层规则"),
                ("asura_map", row.get("real_id") or None, "原表关联地格"),
            ) if key and (ref := relation(dest, key, label, False)))
            if work_table in ASURA_DEPTH_TABLES:
                _, room = table(work_table).get(numeric_key(play), (None, {}))
                links.extend(ref for dest, key, label in (
                    ("pve_stage_data", room.get("battle_id"), "本地格的原版战斗"),
                    ("battle_team_routes", ASURA_DEPTH_TEAM, "原版深渊战斗入口"),
                ) if (ref := relation(dest, key, label, False)))
            links.extend(ref for cell in row.get("rely", ()) if (ref := relation("asura_map", cell, "凝罪塔前置地格", False)))
        if name.startswith("asura_play_type"):
            links.extend(relation("asura_map", cell, "使用该配置的地格", False)
                         for cell in sorted(asura_cells_by_work.get(row.get("id"), ())))
            if name in ASURA_DEPTH_TABLES:
                links.extend(ref for dest, key, label in (
                    ("pve_stage_data", row.get("battle_id"), "原版战斗关卡"),
                    ("battle_team_routes", ASURA_DEPTH_TEAM, "原版深渊战斗入口"),
                    ("asura_const", 13, "单场计分时限"),
                ) if (ref := relation(dest, key, label, False)))
        if name == "pve_stage_data" and (depths := asura_depth_by_stage.get(numeric_key(row.get("id")))):
            links.extend(ref for dest, key, label in ((*depths, "原版深渊玩法配置"),
                ("battle_team_routes", ASURA_DEPTH_TEAM, "原版深渊战斗入口"))
                if (ref := relation(dest, key, label, False)))
        if name == "asura_guilty_tower" or name == "activity" and row.get("id") in ASURA_DEPTH_LAYERS:
            layer = row.get("activity_id", row.get("id"))
            links.extend(ref for dest, key, label in (
                ("asura_guilty_tower", layer, "凝罪塔与收益进度"), ("activity", layer, "深渊层开放期"),
                ("asura_scene", asura_scene_by_layer.get(layer), "深渊地图与场景"),
            ) if (ref := relation(dest, key, label, False)))
        if name == "activity" and row.get("id") == ASURA_ACTIVITY:
            links.extend(ref for layer in ASURA_DEPTH_LAYERS
                         if (ref := relation("asura_guilty_tower", layer, "深渊探索层数", False)))
        if name == "activity" and row.get("id") in {ASURA_ACTIVITY, ASURA_PHASE}:
            links.extend(rule_reference(key, label) for key, label in ASURA_RULES if key in rules)
            links.extend(ref for phase in range(1, 8) if (ref := relation("asura_phase_time", phase, "原版活动阶段", False)))
            links.extend(ref for index in range(1, 8) if (ref := relation("asura_p2_config", index, "决战关卡", False)))
            if ref := relation("activity", ASURA_PHASE if row["id"] == ASURA_ACTIVITY else ASURA_ACTIVITY, "关联活动开放期", False):
                links.append(ref)
        if name.startswith(("dojo2025_bbbl_", "dojo2026_bbbl_")):
            prefix, suffix = name.split("_bbbl_", 1)
            if suffix == "map":
                if row.get("work") and (ref := relation(f"{prefix}_bbbl_block_play", row["work"], "地格玩法", False)):
                    links.append(ref)
                for target, label in [(row.get("portal_exit_cell"), "传送出口"),
                                      *((cell, "额外解锁地格") for cell in row.get("extra_unlock_cells", ()))]:
                    if target and (ref := relation(name, target, label, False)):
                        links.append(ref)
            elif suffix == "block_play":
                links.extend(ref for dest, key, label in (
                    ("pve_stage_data", row.get("battle_ids"), "客户端战斗关卡"),
                    ("battle_team_routes", DOJO_AREA_TEAM, "专用战斗入口"),
                    ("currency", 900272, "自动小纸人的饱食度"),
                ) if (ref := relation(dest, key, label, False)))
                if prefix == "dojo2026":
                    for target, label in ((315, "区域状态 3 的敌方生命系数"), (316, "租借式神类别")):
                        if ref := relation("dojo2026_bbbl_const", target, label, False):
                            links.append(ref)
                    if row.get("block_type") == 5 and "zijiechu_tips" in rules:
                        links.append(rule_reference("zijiechu_tips", "租借处条件及规则"))
            elif suffix == "map_count":
                if ref := relation("activity", row.get("activity_id"), "原版开放活动", False):
                    links.append(ref)
                year = prefix.removeprefix("dojo")
                rule_keys = [(f"weizaierzhan{year}_tips", "当年为崽而战规则")]
                if year == "2026":
                    rule_keys.extend([("weizai_babaibalishengyan", "阵营争夺和战斗规则"),
                                      ("weizai_babaibalishengyan_paiming", "阵营排行结算规则")])
                links.extend(rule_reference(key, label) for key, label in rule_keys if key in rules)
        if name == "activity" and row.get("id") in dojo_area_activities:
            year, round_key = dojo_area_activities[row["id"]]
            if ref := relation(f"dojo{year}_bbbl_map_count", round_key, "分组、开放及结算时间", False):
                links.append(ref)
        if name == "guild_fake_god_map":
            if ref := relation("guild_fake_god_event", row.get("event_id"), "地格事件", True):
                links.append(ref)
        if name == "guild_fake_god_route":
            links.extend(ref for key in forest_map_cells.get(row["use_map"], ())
                         if (ref := relation("guild_fake_god_map", key, "路线地格", True)))
        if name == "guild_fake_god_event":
            if row.get("battle_id"):
                links.extend(ref for dest, target, label in (
                    ("pve_stage_data", row["battle_id"], "事件专用关卡"),
                    ("battle_team_routes", FOREST_TEAM, "单队战斗入口"),
                    ("battle_mode_routes", FOREST_MODE, "原版青森引擎"),
                ) if (ref := relation(dest, target, label, False)))
                if "qingsen_changdi" in rules:
                    links.append(rule_reference("qingsen_changdi", "三种地形及特攻效果"))
            for index, event in enumerate(row.get("battles", ()), 1):
                if ref := relation(name, event, f"第 {index} 支可选敌阵", True):
                    links.append(ref)
            for skill, level in row.get("skill", ()):
                if ref := relation("skill", level_one_skill(skill), f"敌方技能 {skill} · {level} 级", False):
                    links.append(ref)
            if ref := relation("activity", 7076, "原版开放期", False):
                links.append(ref)
            if row.get("plot") in rules:
                links.append(rule_reference(row["plot"], "事件原文"))
        if name == "activity" and row.get("id") == 7076:
            for key, _ in sorted(table("guild_fake_god_route").values()):
                if ref := relation("guild_fake_god_route", key, "活动路线", False):
                    links.append(ref)
            for rule, label in (("qingsen_dituxuanze", "地图、事件与协作规则"),
                                ("qingsen_changdi", "三种地形及特攻效果"),
                                ("qingsen_shangdian", "青森之叶与兑换规则")):
                if rule in rules:
                    links.append(rule_reference(rule, label))
        if name == "activity" and row.get("id") in TEN_ACTIVITY_LINKS:
            links.extend(ref for dest, target, label in TEN_ACTIVITY_LINKS[row["id"]]
                         if (ref := relation(dest, target, label, False)))
            rule, label = TEN_ACTIVITY_RULES[row["id"]]
            if rule in rules:
                links.append(rule_reference(rule, label))
        if name == "ten_anni_2026_event":
            data_id = row["params"][0] if row.get("type") in (1, 2, 5) and row.get("params") else None
            if ref := relation("ten_anni_2026_dungeon_battle", data_id, "地图战斗配置", False):
                links.append(ref)
                _, data = table("ten_anni_2026_dungeon_battle")[numeric_key(data_id)]
                if ref := relation("pve_stage_data", data["battle_id"], "事件战斗关卡", True):
                    links.append(ref)
            if ref := relation(name, row.get("pre_id"), "前置事件", False):
                links.append(ref)
            if ref := relation("ten_anni_2026_event_type", row.get("type"), "事件类型", True):
                links.append(ref)
            if row.get("type") == 11:
                links.extend(ref for dest, target, label in (
                    ("activity", TEN_BOSS_ACT, "炼石成金"),
                    ("pve_stage_data", TEN_BOSS_STAGE, "首领实际开战关卡"),
                ) if (ref := relation(dest, target, label, False)))
            if "ssr10th_shichangji_ditu_tip" in rules:
                links.append(rule_reference("ssr10th_shichangji_ditu_tip", "地图探索原文"))
        if name == "ten_anni_2026_dungeon_battle":
            if ref := relation("pve_stage_data", row["battle_id"], "专用战斗关卡", True):
                links.append(ref)
            data_id = ten_dungeon_by_stage.get(numeric_key(row["battle_id"]))
            links.extend(ref for key in ten_map_events.get(data_id, ())
                         if (ref := relation("ten_anni_2026_event", key, "对应地图事件", False)))
        if name == "urdtg_ui":
            if tip := row.get("tip"):
                links.append(rule_reference(tip, "飞羽凌云原版规则"))
            if row.get("id") == 2:
                links.extend(ref for dest, key, label in (("activity", URDTG_ACTIVITY, "围场赛事开放期"),
                    ("battle_team_routes", URDTG_EXPLORE_MODE, "活动探索入口"))
                    if (ref := relation(dest, key, label, False)))
            if row.get("id") == 3:
                if ref := relation("pve_stage_data", URDTG_TRAIN_STAGE, "赛事训练战斗关卡", False):
                    links.append(ref)
        if name == "urdtg_event":
            links.extend(ref for dest, key, label in (("urdtg_event", row.get("pre_id"), "前置活动事件"),
                ("urdtg_event_type", row.get("type"), "事件类型"), ("reward", row.get("reward_id"), "活动事件奖励"))
                if (ref := relation(dest, key, label, False)))
            params = row.get("params")
            if row.get("type") in (1, 2) and params:
                battle = table("urdtg_dungeon_battle").get(numeric_key(params[0]))
                if battle:
                    links.extend(ref for dest, key, label in (("urdtg_dungeon_battle", battle[0], "围场赛事战斗配置"),
                        ("pve_stage_data", battle[1].get("battle_id"), "原版活动战斗关卡"))
                        if (ref := relation(dest, key, label, False)))
        if name == "urdtg_dungeon_battle":
            links.extend(ref for key in urdtg_events_by_battle.get(numeric_key(row.get("monster_id")), ())
                         if (ref := relation("urdtg_event", key, "对应地图事件", False)))
        if name == "storyChapter":
            entrance = relation("mapnpc", row.get("id"), "地图探索入口", False)
            if entrance:
                links.append(entrance)
            for boss in row.get("BossList") or ():
                ref = relation("BossTower", boss, "探索式神挑战", False)
                if ref:
                    links.append(ref)
            for index, group in enumerate(row.get("guanKaProcess") or (), 1):
                for process in (group if isinstance(group, list) else ()):
                    ref = relation("DramaProcess", process, f"第 {index} 节剧情", False)
                    if ref:
                        links.append(ref)
        if name == "mapnpc":
            for key in rooms_by_map.get(numeric_key(row.get("battle_id")), ()):
                links.append({"table": "story_room", "key": key, "label": "探索战斗点", "found": True})
        if name == "story_room":
            entrance = chapter_entrances.get(numeric_key(row.get("MapEntryID")))
            if entrance:
                links.append({"table": "mapnpc", "key": entrance[0], "label": "地图探索入口", "found": True})
            if ref := relation("battle_mode_routes", 1000, "探索原版战斗入口", False):
                links.append(ref)
        if name == "DramaProcess":
            level = relation("DramaLevel", row.get("RelatedStory"), "剧情关卡", True)
            if level:
                links.append(level)
                if row.get("type") == 3 and level["found"]:
                    _, data = table("DramaLevel")[numeric_key(level["key"])]
                    elements = data.get("ElementList")
                    if isinstance(elements, list) and elements and isinstance(elements[0], list) and elements[0]:
                        battle = relation("pve_stage_data", elements[0][0], "主线单场战斗", True)
                        if battle:
                            links.append(battle)
        if name == "BossTower":
            hero = relation("hero", row.get("HeroID"), "探索挑战式神", False)
            if hero:
                links.append(hero)
            for dest, key, label in (("friend_fb", row.get("LevelID"), "式神挑战单人编组"),
                                     ("battle_mode_routes", 26, "式神挑战原版战斗入口"),
                                     ("Constant", 86, "式神挑战难度上限配置"),
                                     ("currency", row.get("currencyID"), "式神挑战消耗道具")):
                if ref := relation(dest, key, label, False):
                    links.append(ref)
            links.extend(ref for choice in row.get("team_boss", ()) if isinstance(choice, list) and choice
                         if (ref := relation("friend_fb", choice[0], "原表组队编组", False)))
        if name == "friend_fb":
            if ref := relation("Combinesceneinfo", row.get("sceneId"), "式神挑战战斗场景", False):
                links.append(ref)
        if name == "act_team_battle" and "battle_team_routes" in manifests:
            route = relation("battle_team_routes", row.get("team_battle_type"), "原版组队战斗入口", True)
            if route:
                links.append(route)
        if ((name == "act_team_battle" and row.get("id") == TIANFA_TEAM_ENTRY)
                or (name == "pve_stage_data" and numeric_key(row.get("id")) == str(TIANFA_LOBBY_STAGE))):
            for difficulty in range(1, len(TIANFA_STAGES) + 1):
                if ref := relation("xinghen_battle", difficulty, "实际难度入口", False):
                    links.append(ref)
        if name == "MZB_fengmo":
            trait = row.get("skill_id")
            mode = 5551 if trait else 5550
            refs = [
                ("battle_team_routes", mode, "单人木桩入口"),
                ("normal_battle_config", mode, "单人木桩默认规则"),
                ("team_assist_stage", 10020221 if trait else 10020220, "对应阵容码分类"),
                ("fengmo_muzhuang_constant", 9 if trait else 8, "通关所需击破部位"),
            ]
            if trait:
                refs.extend([
                    ("skill", level_one_skill(trait), "木桩增益词条"),
                    ("fengmo_muzhuang_constant", 5, "白茧等待时限"),
                    ("monster", 1250179, "白茧（高生命）"),
                    ("monster", 1250180, "白茧"),
                ])
            links.extend(ref for dest, target, label in refs if (ref := relation(dest, target, label, False)))
        if name == "fengmo_band_personal_boss":
            refs = [
                ("BattleMonstersInfo", row.get("battleid"), "敌方编组"),
                ("battle_team_routes", FENGMO_BAND_TEAM, "原版单人入口"),
                ("activity", FENGMO_BAND_ACTIVITY, "活动开放期"),
                *(("fengmo_band_bandskill", role, "乐队技能") for role in range(1, 4)),
            ]
            links.extend(ref for dest, target, label in refs if (ref := relation(dest, target, label, False)))
            links.extend(fengmo_band_buffs(row))
        if name == "fengmo_band_together_battle":
            refs = [("battle_team_routes", BAND_TOGETHER_TEAM, "原版共斗入口"),
                    ("activity", FENGMO_BAND_ACTIVITY, "活动开放期")]
            for index, stage_id in enumerate(BAND_TOGETHER_STAGES, 1):
                refs.extend([
                    ("pve_stage_data", row.get(f"battle_id_{index}"), f"联机编组第 {index} 段"),
                    ("pve_stage_data", stage_id, f"客户端练习第 {index} 段"),
                    ("BattleMonstersInfo", row.get(f"battle_id_{index}"), f"联机敌方第 {index} 段"),
                    ("BattleMonstersInfo", stage_id, f"练习敌方第 {index} 段"),
                ])
            refs.extend(("fengmo_band_constant", id_, label) for id_, label in (
                (25, "首段时限"), (26, "第二首领音游前时限"), (27, "最终阶段时限"), (36, "提前进入第二次音游的生命比例"),
                (37, "第一段音游窗口"), (38, "第二段音游窗口"), (47, "首段音游评分阈值"), (48, "第二段音游评分阈值"),
            ))
            refs.extend(("fengmo_band_bandskill", role, "乐队技能") for role in range(1, 4))
            links.extend(ref for dest, target, label in refs if (ref := relation(dest, target, label, False)))
        if name in ("devil_battle", "devil_feast_event5", "devil_feast_event6", "devil_feast_event7"):
            refs = [("battle_team_routes", DEVIL_FEAST_TEAM, "鬼王之宴的原版战斗入口"),
                    ("activity", 1366, "京都万事屋开放期"),
                    ("activity", DEVIL_FEAST_ACTIVITY, "鬼王之宴开放期")]
            if name == "devil_battle":
                refs.append(("devil_feast_lv", row.get("unlock_level"), "解锁等级和历练次数"))
            else:
                refs.append(("devil_feast_task_events", int(name[-1]), "事件类型和原文"))
            if name != "devil_feast_event7":
                refs.append(("BattleMonstersInfo", row.get("battle_id"), "敌方编组"))
            links.extend(ref for dest, target, label in refs if (ref := relation(dest, target, label, False)))
        if name in DEVIL_TOWER_TABLES:
            _, rule = DEVIL_TOWER_TABLES[name]
            links.append(rule_reference(rule, "活动玩法原文"))
            if name in TOWER_EVENT_SOURCES:
                links.extend(ref for dest, target, label in (
                    ("pve_stage_data", row.get("battleId"), "百妖退治原版关卡"),
                    ("hero", row.get("heroId"), "战斗事件展示式神"),
                ) if (ref := relation(dest, target, label, False)))
            if name == "feast_for_devils_tower_event7":
                links.extend(ref for suffix, label in (("1", "简单或合魂"), ("2", "普通"), ("3", "困难"))
                             if row.get(f"fightId{suffix}") and
                             (ref := relation("pve_stage_data", row[f"fightId{suffix}"], label, True)))
                links.append(rule_reference("king2_tips_12" if row["id"] <= 4 else "king2_tips_11", "挑战规则原文"))
                if row["id"] == 5:
                    links.append(rule_reference("king2_tips_01", "合魂集结规则"))
            if name == "feast_for_devils_tower_event7_b":
                links.append(relation("pve_stage_data", row.get("fightId"), "姥姥火·合魂敌方关卡", True))
        if name == "pve_stage_data":
            stage_id = numeric_key(row.get("id"))
            if stage_id == str(URDTG_TRAIN_STAGE):
                links.extend(ref for dest, key, label in (
                    ("battle_team_routes", URDTG_TRAIN_TEAM, "赛事训练原版组队入口"),
                    ("normal_battle_config", URDTG_TRAIN_MODE, "赛事训练战斗时限"),
                    ("activity", URDTG_TRAIN_ACTIVITY, "赛事训练开放期"),
                    ("team_assist_stage", URDTG_TRAIN_CODE, "赛事训练阵容码"),
                    ("normal_battle_develop_skill", URDTG_MASK_SKILL, "天狗面具战斗技能"),
                    ("urdtg_const", 301, "每日增益掉落场数"),
                    ("urdtg_const", 303, "赛事训练关卡编号"),
                    ("urdtg_const", 304, "每日挑战上限"),
                    ("urdtg_const", 305, "体力消耗"),
                    ("urdtg_const", 308, "天狗面具数量上限"),
                    ("urdtg_const", 312, "天狗面具适用式神"),
                    ("reward", 12230001, "每日前五场奖励"),
                    ("reward", 12230010, "常规场次奖励"),
                ) if (ref := relation(dest, key, label, False)))
                links.append(rule_reference("ur_datiangou_battle_tips", "赛事训练与天狗面具规则"))
            if stage_id in urdtg_by_stage:
                links.extend(ref for dest, key, label in (
                    ("urdtg_dungeon_battle", urdtg_by_stage[stage_id], "围场赛事战斗配置"),
                    ("battle_team_routes", URDTG_EXPLORE_MODE, "活动探索原版入口"),
                    ("activity", URDTG_ACTIVITY, "围场赛事开放期"),
                    ("normal_battle_develop_skill", URDTG_MASK_SKILL, "天狗面具战斗技能"),
                    ("urdtg_const", 308, "天狗面具数量上限"),
                    ("urdtg_const", 312, "天狗面具适用式神"),
                ) if (ref := relation(dest, key, label, False)))
                links.append(rule_reference("ur_datiangou_tansuo_tips", "围场赛事规则"))
                links.append(rule_reference("ur_datiangou_battle_tips", "天狗面具规则"))
            links.extend(ref for key in sorted(rooms_by_stage.get(stage_id, ()), key=int)
                         if (ref := relation("story_room", key, "使用此编组的探索战斗点", False)))
            if stage_id in chapter_entrances and numeric_key(row.get("groupid")) not in table("BattleMonstersInfo"):
                entrance, _ = chapter_entrances[stage_id]
                links.append({"table": "mapnpc", "key": entrance, "label": "同编号的地图探索入口", "found": True})
            links.extend(ref for dest, key in dojo_area_by_stage.get(stage_id, ())
                         if (ref := relation(dest, key, "八百八狸地格玩法", False)))
            if stage_id in forest_by_stage:
                links.extend(ref for key in forest_by_stage[stage_id].values()
                             if (ref := relation("guild_fake_god_event", key, "青森战斗配置", False)))
                if ref := relation("battle_team_routes", FOREST_TEAM, "单队战斗入口", False):
                    links.append(ref)
            stage_number = int(stage_id or 0)
            if stage_id in tower_by_stage:
                source, key = tower_by_stage[stage_id]
                links.extend(ref for dest, target, label in (
                    (source, key, "百妖退治事件配置"),
                    ("battle_team_routes", TOWER_TEAM, "百妖退治客户端入口"),
                    ("activity", DEVIL_FEAST_ACTIVITY, "鬼王之宴活动日期"),
                    ("feast_for_devils_const", 25, "鬼宴之宾属性参数"),
                ) if (ref := relation(dest, target, label, False)))
                links.append(rule_reference(TOWER_EVENT_SOURCES[source][1], "妖灵退治战斗规则"))
                links.append(rule_reference("feast_for_devils_tower_buff_tips", "神谕之时祝福规则"))
                links.append(rule_reference("feast_for_devils_dawnexpedition_tips", "鬼宴之宾阵营规则"))
            if stage_id in laolao_by_stage:
                ghost = laolao_by_stage[stage_id]
                links.extend(ref for dest, key, label in (
                    ("feast_for_devils_tower_event7", ghost, "姥姥火活动挑战"),
                    ("battle_team_routes", LAOLAO_TEAM, "姥姥火来袭原版战斗入口"),
                    ("feast_for_devils_const", 25, "鬼宴之宾属性参数"),
                ) if (ghost <= 4 or dest == "feast_for_devils_tower_event7") and
                             (ref := relation(dest, key, label, False)))
                links.append(rule_reference("king2_tips_12" if ghost <= 4 else "king2_tips_11", "挑战规则原文"))
                if ghost == 5:
                    if ref := relation("battle_mode_routes", LAOLAO_FUSION_MODE, "姥姥火·合魂原版引擎", False):
                        links.append(ref)
                    links.append(rule_reference("king2_tips_01", "合魂集结规则"))
            if stage_number == YINYANG_BOSS_STAGE:
                links.extend(ref for dest, key, label in (
                    ("battle_mode_routes", YINYANG_BOSS_MODE, "秘境鬼王原版战斗场景"),
                    ("activity", 1136, "阴阳之守活动日期"),
                    ("activity", 1137, "活动入口开放日期"),
                    ("Constant", 1174, "秘境鬼王关卡编号"),
                    ("Constant", 992, "基础挑战时限"),
                    ("Constant", 993, "每个剩余烽鼓增加的秒数"),
                    ("defence_dungeon_multiple_buff", 29, "延长挑战时间的加成"),
                ) if (ref := relation(dest, key, label, False)))
                links.extend((rule_reference("defence_normal_battle_roguelike_tips1", "秘境鬼王战斗规则"),
                              rule_reference("defence_normal_battle_roguelike", "秘境入口与强力加成规则")))
            if stage_id in devil_feast_by_stage:
                source, key = devil_feast_by_stage[stage_id]
                links.extend(ref for dest, target, label in (
                    (source, key, "鬼王之宴活动配置"),
                    ("battle_team_routes", DEVIL_FEAST_TEAM, "鬼王之宴的原版战斗入口"),
                ) if (ref := relation(dest, target, label, False)))
            if stage_number in (*BAND_TOGETHER_STAGES, *BAND_ONLINE_STAGES):
                if ref := relation("fengmo_band_together_battle", 1, "逢魔乐队共斗入口", False):
                    links.append(ref)
            if stage_number in FENGMO_BAND_STAGES:
                boss_id = stage_number - FENGMO_BAND_STAGE_BASE
                if ref := relation("fengmo_band_personal_boss", boss_id, "逢魔乐队单人首领", False):
                    links.append(ref)
                    _, boss = table("fengmo_band_personal_boss")[str(boss_id)]
                    links.extend(fengmo_band_buffs(boss))
                    if route := relation("battle_team_routes", FENGMO_BAND_TEAM, "原版单人入口", False):
                        links.append(route)
            if is_ten_anniversary_stage(stage_number):
                if stage_number in TEN_TOWER_STAGES:
                    team, mode, code, activity = 2320, 9591, 100998, 12132
                    for key, label in ((TEN_TOWER_STAGES[stage_number], "难度与关卡"), (72, "金花灵符消耗"),
                                       (74, "普通体力消耗"), (76, "自动战斗饱食度")):
                        if ref := relation("ten_anni_2026_const", key, label, False):
                            links.append(ref)
                elif stage_number in TEN_BOSS_STAGES:
                    team, mode, code, activity = TEN_BOSS_TEAM, TEN_BOSS_MODE, 100999, TEN_BOSS_ACT
                    for dest, target, label in (
                        ("normal_battle_yys_replace", 217, "原版阴阳师替换配置"),
                        ("stake_boss", 22, "首领挑战次数与消耗"),
                        ("pve_stage_data", TEN_BOSS_STAGE, "从第一层开始挑战"),
                    ):
                        if ref := relation(dest, target, label, False):
                            links.append(ref)
                elif stage_number in TEN_ENCOUNTER_STAGES:
                    team, mode, code, activity = 2321, 9593, 101000, 12134
                else:
                    team, mode, code, activity = 2319, 9590, 101000, 12134
                    for dest, target, label in (
                        ("normal_battle_yys_replace", 216, "原版石长姬替换配置"),
                        ("ten_anni_2026_hero", 20608, "石长姬活动养成与御魂"),
                    ):
                        if ref := relation(dest, target, label, False):
                            links.append(ref)
                links.extend(ref for dest, target, label in (
                    ("ten_anni_2026_dungeon_battle", ten_dungeon_by_stage.get(stage_id), "地图战斗配置"),
                    ("battle_team_routes", team, "专用组队入口"),
                    ("normal_battle_config", mode, "原版战斗与时限参数"),
                    ("team_assist_stage", code, "阵容码分类"),
                    ("activity", activity, "原版开放期"),
                ) if (ref := relation(dest, target, label, False)))
                rule, label = TEN_ACTIVITY_RULES[activity]
                if rule in rules:
                    links.append(rule_reference(rule, label))
                if mode in (9591, 9593):
                    if ref := relation("normal_battle_assist_hero", 105, "原版石长姬助战", False):
                        links.append(ref)
                    if "10th_shichangji_yangcheng_tip" in rules:
                        links.append(rule_reference("10th_shichangji_yangcheng_tip", "助战和养成规则"))
            qinfei_stage = int(stage_id or 0)
            if qinfei_stage in QINFEI_FOOD_STAGES:
                food = QINFEI_FOODS[(qinfei_stage - QINFEI_FOOD_STAGES.start) % len(QINFEI_FOODS)]
                links.extend(ref for dest, target, label in (
                    ("boss_food_battle", food, "食材战斗配置"),
                    ("currency", food, "对应食材"),
                    ("battle_mode_routes", QINFEI_FOOD_MODE, "食材战斗原版引擎"),
                ) if (ref := relation(dest, target, label, False)))
            elif qinfei_stage in QINFEI_ARCHIVED_FOOD:
                if ref := relation("battle_mode_routes", QINFEI_FOOD_MODE, "旧版食材战原版引擎", False):
                    links.append(ref)
            elif qinfei_stage in QINFEI_STATIC_STAGES or qinfei_stage in QINFEI_SIDE_STAGES:
                refs = []
                if qinfei_stage in (QINFEI_BOSS_STAGE, 6902001):
                    refs.append(("battle_mode_routes", QINFEI_BOSS_MODE, "首领战原版引擎"))
                    if qinfei_stage == 6902001:
                        refs.append(("boss_info", 202, "经典寝肥首领参数"))
                elif qinfei_stage == 26325:
                    refs.extend([("Constant", 3222, "入场券战斗配置"), ("currency", 900264, "入场券")])
                else:
                    refs.extend([("dojo_2024_const", 28, "筹备副本关卡编号"),
                                 ("dojo_2024_const", 30, "筹备挑战体力消耗"),
                                 ("dojo_2024_const", 31, "筹备每日挑战次数")])
                    if "Qinfei_choubei_tips" in rules:
                        links.append(rule_reference("Qinfei_choubei_tips", "筹备副本消耗、次数与奖励"))
                links.extend(ref for dest, target, label in refs if (ref := relation(dest, target, label, False)))
            trial = relation("shilian_event_exam", shilian_exam_stages.get(stage_id), "六道试炼入口", False)
            if trial:
                links.append(trial)
            links.extend(ref for key in shilian_route_stages.get(stage_id, ())
                         if (ref := relation("shilian_liudao", key, "六道路线配置", False)))
            links.extend(ref for key in shilian_battles_by_stage.get(stage_id, ())
                         if (ref := relation("shilian_event_battles", key, "六道途中战斗配置", False)))
            if route := hunling_routes.get(stage_id):
                links.extend(hunling_references(route))
            if stage_id in orochi_floors:
                links.append(relation("map_boss", orochi_key, "真·八岐大蛇挑战入口", True))
            links.extend(relation("map_boss", key, "地图首领入口", True)
                         for key in map_boss_by_stage.get(stage_id, ()))
            nian_stage = int(stage_id or 0)
            if nian_stage in NIAN_STAGES:
                links.extend(nian_references(NIAN_MODE))
            elif nian_stage in SPECIAL_NIAN_STAGES:
                links.extend(nian_references(SPECIAL_NIAN_MODE))
            if nian_stage in MEITUAN_STAGES:
                links.extend(meituan_references())
            for key in regions_by_stage.get(stage_id, ()):
                links.append({"table": "lbs_world_boss_area", "key": key, "label": "地域鬼王玩法入口", "found": True})
            tip = relation("normal_battle_tips", row.get("id"), "通用战斗规则", False)
            if tip:
                links.append(tip)
            resource = RESOURCE_STAGES.get(row.get("name"))
            if resource:
                team = relation("battle_team_routes", resource[1], "当前玩法组队入口资料", False) if stage_id != "2111" else None
                if team:
                    links.append(team)
                for key, label in RESOURCE_CONSTANTS.get(stage_id, ()):
                    rule = relation("Constant", key, label, False)
                    if rule:
                        links.append(rule)
        if name == "normal_battle_config":
            mode = row.get("battleMode")
            scene = relation("battle_mode_routes", mode, "客户端初始场景注册", False)
            if scene:
                links.append(scene)
            for key in teams_by_mode.get(mode, ()):
                links.append({"table": "battle_team_routes", "key": key, "label": "原版组队战斗入口", "found": True})
        if name == "battle_team_routes":
            config = relation("normal_battle_config", row.get("battleMode"), "战斗模式默认规则", False)
            if config:
                links.append(config)
        if name == "activity_lbs_intro":
            if opening := relation("activity", row.get("activity_id"), "活动开放配置", False):
                links.append(opening)
            links.extend(lbs_intro_rules(row))
            links.extend(relation("map_boss", boss_id, "同类型地图首领", False)
                         for boss_id in sorted(lbs_bosses_by_type.get(row.get("act_type"), ())))
        if name == "activity_offline_lbs_mass":
            if opening := relation("activity", row.get("act_id"), "地点所属活动配置", False):
                links.append(opening)
            if boss := relation("map_boss", row.get("mapbossid"), "对应地图首领", False):
                links.append(boss)
            links.extend(relation("activity_lbs_intro", intro_id, "活动入口配置", False)
                         for intro_id in lbs_intros_by_activity.get(row.get("act_id"), ()))
        if name == "map_boss" and numeric_key(row.get("id")) == str(TRUE_OROCHI_MAP_ID):
            links.append(rule_reference("ZHENBAQIDASHE_TIPS", "真·八岐大蛇玩法原文"))
            links.extend((relation("battle_mode_routes", TRUE_OROCHI_MODE, "原版战斗入口", True),
                          relation("team_assist_stage", TRUE_OROCHI_CODE, "真·八岐大蛇阵容码目录", True)))
            links.extend(relation("pve_stage_data", stage_id, f"第 {floor} 层关卡", True)
                         for stage_id, floor in orochi_floors.items())
        elif name == "map_boss":
            if help_link := MAP_BOSS_HELP.get(row.get("id")):
                links.append(rule_reference(*help_link))
                if route := relation("battle_mode_routes", 3000, "首领战斗引擎", False):
                    links.append(route)
            elif is_fragment_entry(row.get("id"), row):
                if preview := relation("contract_fragment", 1, "式神碎片副本奖励预览", False):
                    links.append(preview)
                    _, fragment = table("contract_fragment")["1"]
                    if tip := fragment.get("tips_key"):
                        links.append(rule_reference(tip, "式神碎片副本玩法原文"))
                if route := relation("battle_mode_routes", SEAL_MODE, "妖气封印战斗引擎", False):
                    links.append(route)
            elif row.get("type") == 2:
                if route := relation("battle_mode_routes", LBS_MODE, "现世鬼王战斗引擎", False):
                    links.append(route)
            elif site_id := NIAN_ENTRIES.get(row.get("id")):
                links.extend(nian_references(NIAN_MODE))
                if site := relation("activity_offline_lbs_mass", site_id, "地区地点及信物", False):
                    links.append(site)
            elif row.get("id") in MEITUAN_ENTRIES:
                links.extend(meituan_references())
                links.extend(relation("activity_offline_lbs_mass", key, "联动门店", False)
                             for key in lbs_sites.get(row["id"], {}).get(7236, ()))
            elif activity_route := LBS_ACTIVITY_ENTRIES.get(row.get("id")):
                intro_id, site_id, _ = activity_route
                _, intro = table("activity_lbs_intro").get(str(intro_id), (None, {}))
                _, site = table("activity_offline_lbs_mass").get(str(site_id), (None, {}))
                if intro.get("act_type") == row.get("type") and site.get("mapbossid") == row.get("id") \
                        and site.get("act_id") == intro.get("activity_id"):
                    refs = (("activity_lbs_intro", intro_id, "活动入口配置"),
                            ("activity_offline_lbs_mass", site_id, "活动地点"),
                            ("activity", intro["activity_id"], "活动开放时间"))
                    links.extend(ref for dest, value, label in refs
                                 if (ref := relation(dest, value, label, False)))
                    for rule, label in zip(intro.get("ui", ())[2:5], ("挑战规则", "现世商店规则", "现世赠送规则")):
                        links.append(rule_reference(rule, label))
                refs = (("battle_mode_routes", LBS_ACTIVITY_MODE, "策划鼠战斗引擎"),
                        ("team_assist_stage", LBS_ACTIVITY_ASSIST, "暴打策划鼠阵容码分类"))
                links.extend(ref for dest, value, label in refs if (ref := relation(dest, value, label, False)))
                for skill in LBS_ACTIVITY_SKILLS:
                    label = "阴阳师被动" if skill == LBS_ACTIVITY_SKILLS[-1] else "策划鼠机制"
                    if ref := relation("skill", level_one_skill(skill), label, False):
                        links.append(ref)
            else:
                links.extend(lbs_map_history(row))
                entry_id = row.get("id")
                links.extend(rule_reference(rule, label) for rule, label in LBS_HISTORY_RULES.get(entry_id, ())
                             if rule in rules or rule in tips)
                if ticket := relation("currency", LBS_HISTORY_TICKETS.get(entry_id), "挑战次数道具", False):
                    links.append(ticket)
                if entry_id == 19030:
                    if ski := relation("battle_mode_routes", 595, "同活动的滑雪场景", False):
                        links.append(ski)
                if entry_id in LBS_HISTORY_ENTRIES:
                    if route := relation("battle_mode_routes", LBS_ACTIVITY_MODE, "现世妖约战斗引擎", False):
                        links.append(route)
            links.extend(relation("pve_stage_data", stage_id, label, True)
                         for stage_id, label in map_boss_stages.get(row.get("id"), {}).items())
        if name == "BattleMonstersInfo":
            scene = relation("Combinesceneinfo", row.get("resindex", 11032), "通用 PvE 默认场景", True)
            if scene:
                links.append(scene)
        if name == "dungeon_challenge_series" and (replacement := row.get("yys_replacement_id")):
            links.extend(ref for dest, label in (("yys_replacement", "关卡指定出战角色"), ("hero", "指定角色技能模板"))
                         if (ref := relation(dest, replacement, label, False)))
        if name == "dungeon_challenge_series" and row.get("type") == 19:
            for key, label in ((560, "各层金鱼姬模板"), (561, "各层金鱼姬等级"), (579, "各层金鱼姬皮肤")):
                if ref := relation("Constant", key, label, False):
                    links.append(ref)
            _, templates = table("Constant").get("560", (None, {}))
            variants = templates.get("value")
            floor = row.get("floor_num")
            if isinstance(variants, list) and type(floor) is int and 1 <= floor <= len(variants):
                template = variants[floor - 1]
                if type(template) in (int, float) and template > 0:
                    if ref := relation("hero", int(template), "指定角色技能模板", False):
                        links.append(ref)
        if name == "journey_hardbattle":
            links.append(rule_reference("defence_hard_battle", "京畿净化首领挑战规则"))
        if name == "xinghen_battle":
            links.extend(ref for dest, key, label in (
                ("xinghen_ui", 2, "彼世逢魔战斗入口"),
                ("normal_battle_config", TIANFA_MODE, "彼世逢魔默认战斗规则"),
                ("battle_team_routes", TIANFA_TEAM_TYPE, "彼世逢魔原版组队入口"),
                ("team_assist_stage", 100969, "彼世逢魔阵容码"),
            ) if (ref := relation(dest, key, label, False)))
        if name == "pve_stage_data" and (tianfa_difficulty := tianfa_by_stage.get(numeric_key(row.get("id")))):
            links.append(relation("xinghen_battle", tianfa_difficulty, "彼世逢魔难度与规则", True))
        if name in {"shilian_liudao", "shilian_event_exam", "shilian_stage_detail"}:
            dao = row.get("id") if name == "shilian_liudao" else row.get("dao")
            targets = []
            if original := SHILIAN_DAOS.get(dao):
                event_team, exam_team, engine, code = original
                targets.extend((("battle_team_routes", exam_team, f"试炼引擎 {engine}"),
                                ("team_assist_stage", code, "路线阵容码")))
                if name == "shilian_liudao":
                    targets.append(("battle_team_routes", event_team, f"途中战斗引擎 {engine}"))
            if name == "shilian_liudao":
                targets.append(("shilian_event_exam", shilian_exams.get(dao), "路线试炼"))
                targets.extend(("shilian_stage_detail", key, "关卡规则") for key in shilian_details.get(dao, ()))
                targets.extend(("shilian_level", key, "结算评级") for key in shilian_grades.get(dao, ()))
            else:
                targets.append(("shilian_liudao", dao, "所属路线"))
            if name == "shilian_event_exam" and dao == 1:
                targets.append(("Combinesceneinfo", MOON_SECOND_SCENE, "月之海第二阶段场景"))
            links.extend(ref for dest, key, label in targets if (ref := relation(dest, key, label, False)))
        if name == "shilian_area":
            tip = row.get("tips_key")
            if tip in rules or tip in tips:
                links.append(rule_reference(tip, "岛屿玩法说明"))
            if row.get("type") == 40:
                links.extend(ref for key in shilian_battles.get(row.get("event_group"), ())
                             if (ref := relation("shilian_event_battles", key, "原版战斗候选", False)))
        if name == "shilian_event_battles" and (dao := shilian_event_dao(row)):
            team, _, engine, code = SHILIAN_DAOS[dao]
            targets = (("shilian_liudao", dao, "所属路线"), ("battle_team_routes", team, f"途中战斗引擎 {engine}"),
                       ("team_assist_stage", code, "路线阵容码"))
            links.extend(ref for dest, key, label in targets if (ref := relation(dest, key, label, False)))
        if name == "hunling_tansuo":
            region_id = row.get("id")
            links.append(rule_reference("qilingzhijing_map_tips", "地域开放与探索规则"))
            links.extend(ref for stage_id, (region, _, spirit, _) in hunling_routes.items() if region == region_id and spirit is None
                         if (ref := relation("pve_stage_data", stage_id, "原表探查战斗编组", False)))
            links.extend(ref for spirit in row.get("hunling_ids", ())
                         if (ref := relation("hunling_base", spirit, "契灵与首领规则", False)))
        if name == "hunling_boss":
            links.append(rule_reference("qilingzhijing_rule3_tips", "发现、集结和结契规则"))
            links.extend(ref for key, label in ((2595, "集结首领战斗入口"), (1042, "集结后收服入口"))
                         if (ref := relation("battle_team_routes", key, label, False)))
            links.extend(ref for key in row.get("mark_list", ())
                         if (ref := relation("hunling_mark", key, "可获得术印", False)))
            spirit = row.get("hunling_id")
            if type(spirit) is int and (code := relation("team_assist_stage", hunling_codes.get(38000 + spirit - 100), "集结首领阵容码目录", False)):
                links.append(code)
            passive = row.get("skills")
            if isinstance(passive, list) and len(passive) == 3:
                skill = relation("skill", level_one_skill(passive[0]), "集结战斗队伍专属技能", False)
                if skill:
                    links.append(skill)
        panel_field = PANEL_RULE_FIELDS.get(name)
        if panel_field:
            field, label = panel_field
            key = row.get(field)
            if isinstance(key, str) and key:
                links.append(rule_reference(key, label))
        if name == "lbs_world_boss_area":
            if "diyuguiwang_TIPS" in rules or "diyuguiwang_TIPS" in tips:
                links.append(rule_reference("diyuguiwang_TIPS", "地域鬼王玩法与评分规则"))
            for choice in row.get("weighted_battles", ()):
                if isinstance(choice, list) and len(choice) == 2:
                    label = "静态战斗候选"
                    if type(choice[1]) in (float, int):
                        label += f"（权重 {choice[1]:g}）"
                    resolved = relation("pve_stage_data", choice[0], label, True)
                    if resolved:
                        links.append(resolved)
            for monster in row.get("monsters", ()):
                ref = relation("monster", monster, "地域首领模板", True)
                if ref:
                    links.append(ref)
            for pool_index, pool in enumerate(row.get("special_attacks", ()), 1):
                weights = {}
                for rule in pool if isinstance(pool, list) else ():
                    if not isinstance(rule, list) or len(rule) != 2:
                        continue
                    if numeric_key(rule[0]) and type(rule[1]) in (float, int):
                        weights.setdefault(rule[0], []).append(rule[1])
                for key, values in weights.items():
                    label = "普通特殊条件候选"
                    qualifier = f"权重 {values[0]:g}" if len(values) == 1 else "权重 " + " + ".join(f"{value:g}" for value in values)
                    ref = relation("lbs_world_boss_type", key, f"{label}（{qualifier}）", True)
                    if ref:
                        ref["pool"] = pool_index
                        links.append(ref)
            for destination, target, label in (
                ("battle_mode_routes", 3004, "地域鬼王普通引擎"),
                ("battle_mode_routes", 3023, "地域鬼王极难引擎及词条"),
                ("team_assist_stage", 10020215, "地域鬼王普通阵容码目录"),
                ("team_assist_stage", 10020216, "地域鬼王极难阵容码目录"),
            ):
                ref = relation(destination, target, label, False)
                if ref:
                    links.append(ref)
        if name == "battle_mode_routes" and row.get("mode_symbol") == "MODE_LBS_WORLD_BOSSX":
            ref = relation("Constant", 10414, "每星增加等级", False)
            if ref:
                links.append(ref)
            links.extend(region_modifiers())
        if name == "guild_crevice_area":
            for key in str(row.get("monster_id", "")).replace("|", ",").split(","):
                resolved = relation("guild_crevice_battle", key, "暗域敌人", True)
                if resolved:
                    links.append(resolved)
            links.extend(ref for dest, target, label in (
                ("pve_stage_data", 6140051, "通用小怪关卡"),
                ("battle_team_routes", 1161, "狭间暗域战斗入口"),
                ("normal_battle_config", CREVICE_MODE, "战斗配置与时限"),
                ("guild_crevice_const", 11, "小队战斗时限"),
                ("guild_crevice_const", 12, "暗域活动时长"),
                ("normal_battle_constant", 23, "击破小怪后的援助增益"),
            ) if (ref := relation(dest, target, label, False)))
        if name == "guild_crevice_battle" and (stage_id := crevice_by_boss.get(row["monster_id"])):
            if ref := relation("pve_stage_data", stage_id, "查看敌方编组和模拟", False):
                links.append(ref)
        if name == "pve_stage_data" and (route := crevice_stages.get(numeric_key(row.get("id")))):
            links.extend(ref for dest, target, label in (
                ("guild_crevice_battle", route["bossId"], "暗域敌人规则"),
                ("guild_crevice_area", route["area"], "所属暗域"),
                ("battle_team_routes", 1161, "原版战斗入口"),
            ) if (ref := relation(dest, target, label, False)))
        if name == "SuperGhost_mission":
            stage_code = {5: 100943, 6: 100942}.get(row.get("star"))
            links.extend(ref for dest, target, label in (
                ("battle_mode_routes", 3008, "召唤首领原版战斗入口"),
                ("team_assist_stage", stage_code, "超鬼王阵容码分类"),
                ("Constant", 7096, "普通追击伤害修正"),
                ("Constant", 7097, "强力追击伤害修正"),
            ) if (ref := relation(dest, target, label, False)))
            for skill_id, level in row.get("spec_skill", ()):
                ref = (relation("skill", {"$tuple": [skill_id, level, 2]}, "任务表词条", False)
                       or relation("skill", {"$tuple": [skill_id, level, -1]}, "任务表词条", False))
                if ref:
                    links.append(ref)
        if name == "SuperGhost_bossmission":
            if ref := relation("battle_mode_routes", 341, "历史每日挑战入口", False):
                links.append(ref)
        if name == "super_ghost_hjs_special_attack":
            links.extend(ref for group in row.get("hero_group", ())
                         if (ref := relation("super_ghost_hjs_special_attack_group", group, "本日特攻分组", False)))
        if name == "super_ghost_hjs_special_attack_group":
            links.extend(ref for hero in row.get("hero_list", ()) if (ref := relation("hero", hero, "特攻式神", False)))
        if name == "gve_battleinfo":
            week = row.get("week_day")
            if type(week) is int and 0 <= week < len(HUNT_CODE_TARGETS):
                links.extend(ref for destination, target, label in (
                    ("battle_mode_routes", 2000, "原版麒麟战斗入口"),
                    ("team_assist_stage", HUNT_CODE_TARGETS[week], "原版阵容码目标"),
                ) if (ref := relation(destination, target, label, False)))
        if name == "guild_boss_show":
            for key, boss in table("boss_info").values():
                if boss.get("protoId") == row.get("bossID"):
                    links.append({"table": "boss_info", "key": key, "label": "首领阶段参数", "found": True})
            links.extend(ref for destination, target, label in (
                ("battle_mode_routes", 306, "原版首领退治入口"),
                ("team_assist_stage", RETREAT_CODE_TARGETS.get(row.get("bossID")), "原版阵容码目标"),
                ("active_time", "guild_boss", "首领退治开放时间"),
            ) if (ref := relation(destination, target, label, False)))
            for key, label in ((358, "阴阳师等级门槛"), (359, "集结时长（分钟）"), (360, "战斗开放时长（分钟）"),
                               (3907, "集结人数档位"), (3908, "对应增伤率")):
                ref = relation("Constant", key, label, False)
                if ref:
                    links.append(ref)
        if name == "guild_boss_reward":
            ref = relation("raid_info", {"$tuple": [1, row.get("raid_id")]}, "退治首领池和阶段属性", True)
            if ref:
                links.append(ref)
            difficulty = row.get("difficulty")
            if type(difficulty) is int:
                clan = min((int(key) for key, level in table("Clanlevel").values()
                            if level.get("guild_boss_hard_limit", 0) >= difficulty), default=None)
                restriction = relation("Clanlevel", clan, "开启所需最低寮等级", False)
                if restriction:
                    links.append(restriction)
        if name == "activity" and row.get("id") in qinfei_activities:
            links.extend(qinfei_schedule(row["id"]))
        if name == "boss_food_battle":
            links.extend(ref for dest, target, label in (
                ("currency", row.get("id"), "食材道具"),
            ) if (ref := relation(dest, target, label, False)))
            start = row.get("up_battle_id")
            if start in QINFEI_FOOD_STAGES and start < QINFEI_FOOD_STAGES.start + len(QINFEI_FOODS):
                links.extend(ref for layer, stage in enumerate(range(start, QINFEI_FOOD_STAGES.stop, len(QINFEI_FOODS)))
                             if (ref := relation("pve_stage_data", stage, "惊喜战斗" if not layer else f"普通第 {layer} 层", False)))
        if name == "league_qinfei":
            links.extend(ref for hero in row.get("heroCombination", ())
                         if (ref := relation("hero", hero, "可应援式神", False)))
        if name == "dojo_2024_qinfei_battle_match":
            links.extend(ref for dest, target, label in (
                ("active_time", "the_sleeping_beauty_2024", "2024 赛程时段"),
                ("pve_stage_data", 501200, "寝肥筹备战"),
            ) if (ref := relation(dest, target, label, False)))
        if name == "raid_info" and row.get("fbId") in (1, 2, 3, 4, 5):
            for boss in row.get("bossInfo", ()):
                ref = relation("boss_info", boss, "候选首领阶段参数", True)
                if ref:
                    links.append(ref)
            if (row.get("fbId"), row.get("id")) in QINFEI_BOSS_PROFILES:
                links.extend(ref for dest, target, label in (
                    ("pve_stage_data", QINFEI_BOSS_STAGE, "寝肥本体战斗场景"),
                    ("battle_mode_routes", QINFEI_BOSS_MODE, "寝肥本体原版引擎"),
                ) if (ref := relation(dest, target, label, False)))
        if name == "boss_info" and row.get("id") in (201, 202, 203, 204):
            for skill in dict.fromkeys((row.get("ctrlSkill"), *row.get("extraSkill", ()), *row.get("hideSkill", ()))):
                if ref := relation("skill", level_one_skill(skill), "寝肥首领技能", False):
                    links.append(ref)
        for field, label in RULE_TEXT_FIELDS.items():
            if panel_field and field == panel_field[0]:
                continue
            key = row.get(field)
            if isinstance(key, str) and key in localized:
                links.append({"table": language, "key": key, "label": label, "found": True})
        return links

    def related(table_name, key, row, direct):
        pending = [*explicit(table_name, row), *direct]
        references = []
        seen = {(table_name, reference_key(key) or key)} if reference_key(key) or type(key) in (int, str) else set()
        for link in pending:
            dest, key = link["table"], link["key"]
            identity = (dest, reference_key(key) or key)
            if "pool" in link:
                identity += (link["pool"],)
            if identity in seen:
                continue
            seen.add(identity)
            references.append(link)
            if link["found"] and dest in FOLLOWED_TABLES:
                _, data = table(dest)[reference_key(key)]
                pending.extend(explicit(dest, data))
        return references

    candidates = [
        name for name, row in manifests.items()
        if name in ROOTS or name in JOURNEY_BATTLE_VARIANTS or name in {"activity", "battle_mode_routes"}
        or set(row["fields"]).intersection((*BATTLE_ID_FIELDS, "monsterWaves"))
    ]
    entries, unresolved = [], 0
    categories = Counter()
    for table_name in sorted(candidates):
        manifest = manifests[table_name]
        variant = JOURNEY_BATTLE_VARIANTS.get(table_name)
        root = table_name in ROOTS or variant is not None
        family, kind = ROOTS.get(table_name, (manifest["family"], table_name))
        if variant:
            family, kind = "event", "京畿净化战斗参数"
        # The four resource tables are registered separately from the normal
        # fight panel's journey_normalbattle lookup. A numeric match is insufficient.
        generic_edges = [] if variant or table_name in {*TOWER_EVENT_SOURCES, "journey_hardbattle", "ten_anni_2026_dungeon_battle", SHANFENG_PVE, "shiki_boss"} else [
            field for field in BATTLE_ID_FIELDS if field in manifest["fields"]
        ]
        for key, row in load_rows(table_name):
            if not isinstance(row, dict):
                continue
            entrance = table_name == "mapnpc" and numeric_key(key) in table("storyChapter") \
                and numeric_key(row.get("battle_id")) in rooms_by_map
            linked_battles = [
                linked for field in generic_edges
                if (linked := relation("pve_stage_data", row.get(field), "通用 PvE 关卡", False))
            ] if not entrance else []
            scene_route = table_name == "battle_mode_routes" and row.get("scene_engine") \
                and numeric_key(key) not in table("normal_battle_config")
            dinner_route = table_name == "battle_mode_routes" and numeric_key(key) == str(GUILD_DINNER_MODE) \
                and row.get("mode_symbol") == "MODE_GUILD_DINNER"
            qinfei_activity = table_name == "activity" and key in qinfei_activities
            dojo_area_activity = table_name == "activity" and key in dojo_area_activities
            forest_activity = table_name == "activity" and key == 7076
            ten_activity = table_name == "activity" and key in TEN_ACTIVITY_LINKS
            dream_activity = table_name == "activity" and key == DREAM_ACTIVITY
            asura_activity = table_name == "activity" and key in {ASURA_ACTIVITY, ASURA_PHASE}
            shanfeng_activity = table_name == "activity" and key == SHANFENG_FINAL_ACTIVITY and bool(shanfeng_by_config)
            ji_activity = table_name == "activity" and key == JI_ACTIVITY and bool(ji_boss_by_stage)
            asura_layer = table_name == "activity" and key in ASURA_DEPTH_LAYERS
            qinfei_boss = table_name == "raid_info" and (row.get("fbId"), row.get("id")) in QINFEI_BOSS_PROFILES
            if (not root and not entrance and not scene_route and not dinner_route and not linked_battles and not row.get("monsterWaves")
                    and not qinfei_activity and not qinfei_boss and not dojo_area_activity and not forest_activity
                    and not ten_activity and not dream_activity and not asura_activity and not asura_layer
                    and not shanfeng_activity and not ji_activity):
                continue
            references = related(table_name, key, row, linked_battles)
            entry_family, entry_kind = ("daily", "地图探索入口") if entrance else (family, kind)
            if scene_route:
                entry_kind = "初始场景引擎"
            title = name(row)
            if dinner_route:
                entry_family, entry_kind, title = "guild", "阴阳寮宴会", "阴阳寮宴会 · 举办与参加规则"
            if table_name == "guild_dinner":
                level = "历史活动" if key == 10001 else f"{row['food_lv']} 级"
                title = f"阴阳寮宴会料理 · {row['food_name']} · {level}"
            if table_name == "guild_dinner_monster":
                title = f"阴阳寮宴会食材目标 · {title}"
            if table_name in DEVIL_TOWER_TABLES:
                label, _ = DEVIL_TOWER_TABLES[table_name]
                if table_name in TOWER_EVENT_SOURCES:
                    _, battle = table("pve_stage_data").get(numeric_key(row["battleId"]), (None, {}))
                    _, hero = table("hero").get(numeric_key(row["heroId"]), (None, {}))
                    title = " · ".join(filter(None, ("百妖退治", label, name(battle), name(hero), f"事件 {key}")))
                else:
                    detail = row.get("title") or row.get("q") or row.get("name") or row.get("dsc")
                    title = " · ".join(filter(None, ("鬼王之宴", label, detail, f"配置 {key}")))
            if qinfei_activity:
                entry_family, entry_kind = "guild", "寝肥合战"
            if dojo_area_activity:
                entry_family, entry_kind = "event", "八百八狸场次"
            if forest_activity:
                entry_family, entry_kind = "guild", "青森之秘活动"
            if ten_activity:
                entry_family, entry_kind = "event", "拾光永恒"
                title = {12130: "拾光永恒 · 石长姬十周年活动", 12132: "拾光永恒 · 亘地回响",
                         12134: "拾光永恒 · 巡于黄金之河", 12135: "拾光永恒 · 炼石成金"}[key]
            if table_name in ("ten_anni_2026_event", "ten_anni_2026_dungeon_battle"):
                title = f"巡于黄金之河 · {title} · {key}"
            if table_name == "urdtg_ui":
                title = f"飞羽凌云 · {title}"
            if table_name in ("urdtg_event", "urdtg_dungeon_battle"):
                title = f"围场赛事 · {title} · {key}"
            if table_name == "fengmo_band_personal_boss":
                title = f"逢魔乐队 · {title} · {row['battleid']}"
            if table_name == "fengmo_band_together_battle":
                title = "逢魔乐队 · 胧车共斗首领"
            if table_name == "devil_battle":
                difficulty = "普通" if row.get("battle_type") == 1 else "精英"
                title = f"京都万事屋 · {difficulty}历练 {key} · {row['battle_id']}"
            if table_name in ("devil_feast_event5", "devil_feast_event6"):
                _, boss = table("hero").get(numeric_key(row.get("boss_id")), (None, {}))
                label = "灵气激发" if table_name.endswith("5") else "大妖考验"
                title = f"鬼王之宴 · {label} · {name(boss)} · {row['battle_id']}"
            if table_name == "devil_feast_event7":
                title = f"鬼王之宴 · 涤荡妖气 · 事件 {key}"
            if table_name == "guild_fake_god_event":
                label = FOREST_EVENT_TYPES.get(row.get("type"), "事件")
                title = f"青森之秘 · {label} · {title.strip()} · {key}"
            if table_name == "guild_fake_god_map":
                _, event = table("guild_fake_god_event").get(numeric_key(row.get("event_id")), (None, {}))
                title = f"青森之秘 · 地图 {row['map_id']} · 地格 {row['key']} · {name(event)}"
            if table_name == "guild_fake_god_route":
                title = f"青森之秘 · 路线 {key} · 地图 {row['use_map']}"
            if table_name.startswith(("dojo2025_bbbl_", "dojo2026_bbbl_")):
                prefix, suffix = table_name.split("_bbbl_", 1)
                year = prefix.removeprefix("dojo")
                if suffix == "block_play":
                    title = f"{year} 八百八狸 · {DOJO_AREA_TYPES.get(row.get('block_type'), '地格玩法')} · {key}"
                elif suffix == "map":
                    _, play = table(f"{prefix}_bbbl_block_play").get(numeric_key(row.get("work")), (None, {}))
                    label = DOJO_AREA_TYPES.get(play.get("block_type")) or {1: "障碍", 2: "阵营起点"}.get(row.get("block_type"), "地格")
                    title = f"{year} 八百八狸 · {label} · 地格 {key}"
                elif suffix == "map_count":
                    title = f"{year} 八百八狸 · 第 {key} 番"
            if qinfei_boss:
                entry_family, entry_kind = "guild", "寝肥本体"
                title = {4: "寝肥本体 · 2025 崽战", 5: "寝肥本体 · 2026 崽战"}.get(row["fbId"])
                if title is None:
                    title = f"寝肥本体 · 历史组别 {row['fbId']} · 第 {row['id']} 档"
            if table_name == "qinfei_fight_buff" and row.get("date"):
                title = f"寝肥合战 · {'-'.join(map(str, row['date'][:3]))} · {row.get('buff_desc', '')}"
            if table_name == "dojo_2024_qinfei_battle_match" and row.get("day_time"):
                title = f"寝肥历史赛程 · {'-'.join(map(str, row['day_time']))} · 第 {row['count']} 场"
            if table_name == "boss_food_battle":
                _, food = table("currency").get(numeric_key(key), (None, {}))
                title = f"寝肥合战食材 · {name(food) or key}"
            if table_name == "map_boss" and key == TRUE_OROCHI_MAP_ID:
                entry_kind = "真·八岐大蛇"
            elif table_name == "map_boss" and is_fragment_entry(key, row):
                entry_kind = "妖气封印"
                period = " · 历史活动" if row.get("begin_time") and row.get("end_time") else ""
                title = f"{entry_kind} · {title}{period}"
            elif table_name == "map_boss" and row.get("type") == 2:
                entry_kind = "现世鬼王"
                title = f"{entry_kind} · {title}"
            elif table_name == "map_boss" and key in NIAN_ENTRIES:
                entry_family, entry_kind = "event", "现世年兽"
                title = f"{entry_kind} · {title}"
            elif table_name == "map_boss" and key in MEITUAN_ENTRIES:
                entry_family, entry_kind = "event", "宴席大赛"
                title = f"{entry_kind} · {title}"
            elif table_name == "map_boss" and key in LBS_ACTIVITY_ENTRIES:
                entry_family, entry_kind = "event", "现世妖约·策划鼠"
                title = f"现世妖约 · {LBS_ACTIVITY_ENTRIES[key][2]}策划鼠"
            elif table_name == "map_boss" and (key in LBS_HISTORY_ENTRIES or key in lbs_sites
                                               or row.get("type") in lbs_intros_by_type):
                entry_family, entry_kind = "event", "历史现世妖约"
                title = f"{entry_kind} · {LBS_HISTORY_NAMES.get(key, title)}"
            if table_name == "activity_lbs_intro":
                title = row.get("act_title") or title
            if table_name == "activity_offline_lbs_mass":
                _, boss = table("map_boss").get(reference_key(row.get("mapbossid")), (None, {}))
                _, activity = table("activity").get(reference_key(row.get("act_id")), (None, {}))
                site = row.get("shop_name") or f"地点 {key}"
                title = " · ".join(dict.fromkeys(filter(None, (site, name(activity), name(boss)))))
            if table_name == "MZB_fengmo":
                trait_id = row.get("skill_id")
                _, trait = table("skill").get(reference_key(level_one_skill(trait_id)), (None, {}))
                title = " · ".join(filter(None, (entry_kind, title, trait.get("skill_name"))))
            if table_name == "gve_battleinfo":
                monsters = row.get("monsters", ())
                boss = monsters[0][0] if monsters and isinstance(monsters[0], list) and monsters[0] else None
                _, info = table("monster").get(numeric_key(boss), (None, {}))
                if row.get("difficulty") == 100:
                    entry_kind, title = "阴界之门入口", f"阴界之门 · 入口 {key}"
                else:
                    title = f"麒麟狩猎 · {name(info)} · 难度 {row['difficulty']}"
            if table_name == "guild_boss_reward":
                title = f"首领退治 · 难度 {row['difficulty']}"
            if table_name == "SuperGhost_mission":
                title = f"超鬼王 · {row['remarks']}"
            if table_name == "SuperGhost_bossmission":
                boss_id = next((unit[0] for unit in row.get("gk_list", ()) if unit and unit[0] is not None), None)
                _, boss = table("monster").get(numeric_key(boss_id), (None, {}))
                title = " · ".join(filter(None, ("超鬼王历史首领挑战", row.get("desc"), name(boss))))
            if table_name == "super_ghost_hjs_special_attack":
                title = "超鬼王特攻 · " + "-".join(map(str, row["begin_time"][:3]))
            if table_name == "super_ghost_hjs_special_attack_group":
                title = f"超鬼王特攻分组 {key} · {row['desc']}"
            if table_name == "xinghen_battle":
                title = f"彼世逢魔 · {title}"
            if table_name == "boss_troops" and row.get("groupId") in GUILD_BOSS_TROOPS:
                entry_family, entry_kind = "guild", "首领退治机关编组"
                title = f"首领退治 · 编组 {row['groupId']} · 方案 {row['id']}"
            if table_name == "pve_stage_data" and row.get("name") in RESOURCE_STAGES:
                entry_family, entry_kind = "daily", RESOURCE_STAGES[row["name"]][0]
                title = f"{entry_kind} · 新服首次" if numeric_key(key) == "2111" else f"{entry_kind} · 编组 {row['groupid']}"
            if table_name == "pve_stage_data":
                stage_id = int(numeric_key(key) or 0)
                if stage_id == URDTG_TRAIN_STAGE:
                    entry_family, entry_kind = "event", "赛事训练"
                    title = "飞羽凌云 · 赛事训练 · 达摩"
                elif stage_id in URDTG_STAGES:
                    entry_family, entry_kind = "event", "围场赛事"
                    _, battle = table("urdtg_dungeon_battle").get(numeric_key(urdtg_by_stage.get(str(stage_id))), (None, {}))
                    title = " · ".join(filter(None, (entry_kind, name(battle), str(stage_id))))
                elif stage_id == YINYANG_BOSS_STAGE:
                    entry_family, entry_kind = "event", "秘境鬼王"
                    title = "阴阳之守 · 秘境鬼王 · 大岳丸"
                elif numeric_key(key) in tower_by_stage:
                    event_source, _ = tower_by_stage[numeric_key(key)]
                    entry_family, entry_kind = "event", TOWER_EVENT_SOURCES[event_source][0]
                    title = f"百妖退治 · {entry_kind} · {title}"
                elif numeric_key(key) in laolao_by_stage:
                    entry_family, entry_kind = "event", "姥姥火挑战"
                    ghost_key = laolao_by_stage[numeric_key(key)]
                    _, laolao_event = table("feast_for_devils_tower_event7")[numeric_key(ghost_key)]
                    ghost_name = laolao_event["name"]
                    difficulty = title.split("-")[-1] if ghost_key <= 4 else ""
                    title = " · ".join(filter(None, ("鬼王之宴", "姥姥火来袭" if difficulty else "", ghost_name, difficulty)))
                elif numeric_key(key) in dojo_area_by_stage:
                    entry_family, entry_kind = "event", "八百八狸战斗"
                elif stage_id in FOREST_STAGES:
                    entry_family, entry_kind = "guild", "青森之秘战斗"
                    title = f"青森之秘 · {title}"
                elif is_ten_anniversary_stage(stage_id):
                    entry_family, entry_kind = "event", "拾光永恒战斗"
                    if stage_id in TEN_TOWER_STAGES:
                        title = f"拾光永恒 · 虚无精锐 · {'简单' if stage_id == 12130001 else '困难'}"
                    elif stage_id in TEN_ENCOUNTER_STAGES:
                        event_key = ten_dungeon_by_stage.get(numeric_key(key))
                        _, event = table("ten_anni_2026_dungeon_battle").get(numeric_key(event_key), (None, {}))
                        title = f"巡于黄金之河 · 遭遇战 · {name(event)}"
                    elif stage_id in TEN_BOSS_STAGES:
                        title = f"炼石成金 · 第 {stage_id - TEN_BOSS_STAGES.start + 1} 层"
                    else:
                        title = f"巡于黄金之河 · {title}"
                elif stage_id in NIAN_STAGES:
                    entry_family, entry_kind = "event", "现世年兽"
                    title = f"{entry_kind} · {NIAN_STAGES[stage_id]} 级档"
                elif stage_id in SPECIAL_NIAN_STAGES:
                    entry_family, entry_kind = "event", "专属年兽"
                    title = f"{entry_kind} · 第 {SPECIAL_NIAN_STAGES[stage_id]} 档"
                elif stage_id in MEITUAN_STAGES:
                    entry_family, entry_kind = "event", "宴席大赛"
                    title = f"{entry_kind} · {MEITUAN_STAGES[stage_id]} 级档"
                elif stage_id in QINFEI_ARCHIVED_FOOD:
                    entry_family, entry_kind = "guild", "旧版寝肥食材战"
                    title = f"旧版{title}"
                elif stage_id in QINFEI_FOOD_STAGES or stage_id in QINFEI_STATIC_STAGES or stage_id in QINFEI_SIDE_STAGES:
                    entry_family, entry_kind = "guild", "寝肥合战"
            if table_name == "pve_stage_data" and numeric_key(key) in crevice_stages:
                entry_family, entry_kind = "guild", "狭间暗域战斗"
                title = f"狭间暗域 · {row['name'].removeprefix('阴界裂缝')}"
            if table_name == "pve_stage_data" and (floor := orochi_floors.get(numeric_key(key))):
                entry_family, entry_kind = "daily", "真·八岐大蛇"
                title = f"{entry_kind} · 第 {floor} 层"
            if table_name == "pve_stage_data" and (route := hunling_routes.get(numeric_key(key))):
                region, level, spirit, _ = route
                _, region_row = table("hunling_tansuo").get(str(region), (None, {}))
                _, spirit_row = table("hunling_base").get(str(spirit), (None, {}))
                entry_family, entry_kind = "daily", "契灵之境"
                title = " · ".join(filter(None, (entry_kind, name(region_row), name(spirit_row), f"探查 {level} 级")))
            if table_name in {"shilian_liudao", "shilian_stage_detail", "shilian_event_exam", "shilian_level"}:
                dao = row.get("id") if table_name == "shilian_liudao" else row.get("dao")
                _, realm = table("shilian_liudao").get(reference_key(dao), (None, {}))
                label = "活动旧版月之海" if dao == 0 else name(realm)
                detail = {"shilian_event_exam": row.get("battle_name") or "首领试炼",
                          "shilian_level": row.get("grade_str")}.get(table_name, title)
                parts = ("六道之门", label) if table_name == "shilian_liudao" else ("六道之门", label, detail)
                title = " · ".join(filter(None, parts))
            if table_name == "shilian_event_battles" and (dao := shilian_event_dao(row)):
                _, realm = table("shilian_liudao").get(reference_key(dao), (None, {}))
                _, battle = table("pve_stage_data").get(reference_key(row["battle_id"]), (None, {}))
                title = " · ".join(filter(None, ("六道之门", name(realm), name(battle))))
            if table_name == "hunling_tansuo":
                title = f"契灵之境 · {title}"
            if table_name == "hunling_boss":
                _, spirit_row = table("hunling_base").get(numeric_key(row.get("hunling_id")), (None, {}))
                title = f"契灵之境集结 · {name(spirit_row)} · 术印配置 {key}"
            if variant:
                board = numeric_key(row.get("board_index"))
                battle = numeric_key(row.get("battle_id"))
                parts = (variant, f"棋盘 {board}" if board else "", f"战斗参数 {battle}" if battle else "")
                title = " · ".join(filter(None, parts))
            if table_name == "story_room":
                chapter = chapter_entrances.get(numeric_key(row.get("MapEntryID")))
                description = row.get("desc") if isinstance(row.get("desc"), str) else ""
                title = " · ".join(part for part in ((name(chapter[1]) if chapter else ""), description) if part)
            if table_name in {"DramaProcess", "BossTower"}:
                detail_table, detail_key, label = ("DramaLevel", row.get("RelatedStory"), "StoryName") \
                    if table_name == "DramaProcess" else ("hero", row.get("HeroID"), "name")
                _, detail = table(detail_table).get(numeric_key(detail_key), (None, {}))
                title = detail.get(label) or title
            if table_name == "normal_battle_config":
                symbol = next((table(ref["table"])[numeric_key(ref["key"])][1].get("mode_symbol")
                               for ref in references if ref["table"] in {"battle_mode_routes", "battle_team_routes"}), None)
                scene = table("battle_mode_routes").get(numeric_key(row.get("battleMode")), (None, {}))[1]
                title = " · ".join(filter(None, (f"战斗模式 {key}", symbol, scene.get("scene_engine"))))
            if scene_route:
                title = " · ".join((f"战斗模式 {key}", row["mode_symbol"], row["scene_engine"]))
                if row["mode_symbol"] == "MODE_LBS_WORLD_BOSSX":
                    title = f"地域鬼王极难 · {title}"
                if key == DREAM_TRIAL_MODE:
                    entry_family, entry_kind, title = "event", "幻游问梦", "幻游问梦 · 梦境试炼原版入口"
                if key == BREAKTHROUGH_MODE:
                    entry_family, entry_kind, title = "daily", "结界突破", "个人结界突破"
                if key == GUILD_BREAKTHROUGH_MODE:
                    entry_family, entry_kind, title = "guild", "结界突破", "阴阳寮结界突破"
                if key == DOJO_DEFENDER_MODE:
                    entry_family, entry_kind, title = "guild", "道馆", "道馆 · 结界师与馆主"
                if key == DOJO_GUARDIAN_MODE:
                    entry_family, entry_kind, title = "guild", "道馆", "道馆 · 守护兽"
                if key == SHANFENG_MODE:
                    entry_family, entry_kind = ROOTS[SHANFENG_PVE]
                    title = f"{entry_kind} · 原版战斗入口"
            if shanfeng_activity or table_name == SHANFENG_PVE or table_name == "pve_stage_data" and numeric_key(key) in shanfeng_by_stage:
                entry_family, entry_kind = ROOTS[SHANFENG_PVE]
                if shanfeng_activity:
                    title = "初翎山风超鬼王 · 成王开放时间"
                elif table_name == SHANFENG_PVE:
                    battles = shanfeng_by_config[numeric_key(key)]
                    title = f"初翎山风超鬼王 · {battles[0][1] if 'battle_id' in row else '成王 · 三日挑战配置'}"
                else:
                    title = f"初翎山风超鬼王 · {shanfeng_by_stage[numeric_key(key)][1]} · {key}"
            if table_name == "pve_stage_data" and int(numeric_key(key) or 0) in DOJO_GUARDIAN_STAGES:
                entry_family, entry_kind = "guild", "道馆守护"
            if ji_activity:
                entry_family, entry_kind = ROOTS["shiki_boss"]
                title = f"{entry_kind} · 活动开放时间"
            if table_name == "shiki_boss" or table_name == "pve_stage_data" and numeric_key(key) in ji_boss_by_stage:
                entry_family, entry_kind = ROOTS["shiki_boss"]
                config = row if table_name == "shiki_boss" else ji_boss_by_stage[numeric_key(key)][1]
                difficulty = "剧情" if config["boss_type"] == 1 else "退治"
                title = f"{entry_kind} · {config['level_name']} · {difficulty} · {key}"
            if dream_activity:
                entry_family, entry_kind, title = "event", "幻游问梦", "幻游问梦 · 活动开放与玩法规则"
            if asura_activity:
                entry_family, entry_kind = "event", "天魔归来"
                title = "天魔归来 · " + ("帝释天决战开放与规则" if key == ASURA_PHASE else "主活动与决战规则")
            if asura_layer or table_name == "asura_guilty_tower":
                entry_family, entry_kind = "event", "天魔归来 · 深渊层数"
                title = f"天魔归来 · {ASURA_DEPTH_LAYERS.get(key, title)}" + (" · 开放配置" if asura_layer else " · 地图与玩法")
            if table_name == "asura_map":
                layer = ASURA_DEPTH_LAYERS.get(row.get("activity_id"), "深渊探索")
                play = ASURA_MAP_WORK.get(row.get("work", 0) // 10000, "地形")
                title = f"天魔归来 · {layer} · 深渊地格 {key} · {play}"
            if table_name.startswith("asura_play_type"):
                play = ASURA_MAP_WORK[int(table_name[-1])]
                detail = f" · {row['battle_id']}" if table_name in ASURA_DEPTH_TABLES else ""
                title = f"天魔归来 · 深渊{play} · 配置 {key}{detail}"
            if table_name in {"asura_p2_config", "asura_phase_time"}:
                title = f"天魔归来 · {title}"
            if table_name == "pve_stage_data" and (index := ASURA_STAGES.get(int(numeric_key(key) or 0))):
                _, phase = table("asura_p2_config").get(str(index), (None, {}))
                if phase:
                    title = f"天魔归来 · {name(phase)} · {key}"
            if table_name == "pve_stage_data" and (depths := asura_depth_by_stage.get(numeric_key(key))):
                play = ASURA_MAP_WORK[int(depths[0][-1])]
                title = f"天魔归来 · 深渊{play} · {title} · {key}"
            if table_name == "dream_act_hero":
                title = f"幻游问梦 · {row['name']} · {row['nightmare_name']}"
            if table_name == "pve_stage_data" and (dream_hero := dream_heroes_by_stage.get(numeric_key(key))):
                _, hero = table("dream_act_hero")[numeric_key(dream_hero)]
                title = f"幻游问梦 · {hero['name']} · {hero['nightmare_name']} · {key}"
            if not title and linked_battles:
                _, battle = table("pve_stage_data")[numeric_key(linked_battles[0]["key"])]
                title = name(battle)
            series_title = row.get("title")
            if table_name == "dungeon_challenge_series" and isinstance(series_title, str) and series_title.strip():
                title = " · ".join(dict.fromkeys(part for part in (series_title.strip(), title) if part))
            description = row.get("typedesc")
            if title and isinstance(description, str) and description and description not in title:
                title = description if title in description else description + " · " + title
            if table_name == "dungeon_rune":
                alias = {101: "魂土", 102: "魂王", 103: "虚无"}.get(key)
                if alias and alias not in title:
                    title += " · " + alias
            categories[entry_family] += 1
            unresolved += sum(not ref["found"] for ref in references)
            entries.append({"table": table_name, "key": key, "title": title, "family": entry_family,
                            "kind": entry_kind, "refs": references})

    return {"schema": 1, "resourceVersion": source["resourceVersion"], "entries": entries,
            "counts": dict(categories), "unresolvedReferences": unresolved}
