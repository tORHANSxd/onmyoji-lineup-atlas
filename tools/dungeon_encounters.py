"""Build a searchable encounter index from decoded, versioned client tables."""

from collections import Counter
from functools import cache
from guild_crevice_stage import CREVICE_MODE, CREVICE_STAGES, crevice_route
from hunling_stage import CAPTURE_ITEMS, challenge_stages, exploration_stages
from shilian_routes import MOON_SECOND_SCENE, SHILIAN_DAOS, shilian_event_dao


ROOTS = {
    "pve_stage_data": ("battle", "通用 PvE 关卡"),
    "normal_battle_config": ("battle", "战斗模式默认规则"),
    "dungeon_rune": ("daily", "御魂"),
    "map_boss": ("daily", "真·八岐大蛇"),
    "dungeon_awake": ("daily", "觉醒"),
    "dungeon_challenge": ("daily", "秘闻"),
    "dungeon_challenge2": ("daily", "秘闻"),
    "dungeon_challenge_series": ("daily", "秘闻"),
    "dungeon_challenge_race": ("daily", "秘闻竞速"),
    "dungeon_yuling": ("daily", "御灵"),
    "MZB_fengmo": ("daily", "逢魔木桩练习"),
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
    "guild_dinner_monster": ("guild", "阴阳寮宴会"),
    "guild_monster": ("guild", "阴阳寮麒麟"),
    "guild_fake_god_event": ("guild", "阴阳寮活动"),
    "act_team_battle": ("event", "活动组队战斗"),
    "xinghen_battle": ("daily", "彼世逢魔"),
    "SuperGhost_mission": ("event", "超鬼王"),
    "SuperGhost_bossmission": ("event", "超鬼王首领挑战"),
    "journey_hardbattle": ("event", "京畿净化首领挑战"),
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
    "lbs_world_boss_area": (("dist_id", "lbs_world_boss_init", "地图分区"),),
    "act_team_battle": (("act_id", "activity", "活动开放配置"),),
    "xinghen_battle": (("stage_id", "pve_stage_data", "彼世逢魔关卡"),),
    "journey_hardbattle": (("battle_id", "pve_stage_data", "首领挑战关卡"),),
    "shilian_liudao": (("pve_id", "pve_stage_data", "路线配置 PvE"),),
    "SuperGhost_mission": (("actid", "activity", "活动开放配置"), ("sceneid", "Combinesceneinfo", "关卡场景")),
    "SuperGhost_bossmission": (("sceneid", "Combinesceneinfo", "关卡场景"),),
    "guild_boss_show": (("bossID", "monster", "首领"),),
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
                   "normal_battle_tips", "battle_team_routes", "raid_info", "boss_info"}
BATTLE_ID_FIELDS = ("battle_id", "battleId", "pve_stage_id", "pve_id")
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

    tianfa_by_stage = {numeric_key(row.get("stage_id")): key for key, row in table("xinghen_battle").values()}

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
    rooms_by_map = {}
    for key, row in table("story_room").values():
        map_id = numeric_key(row.get("MapEntryID"))
        if map_id is not None:
            rooms_by_map.setdefault(map_id, []).append(key)
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
        if name == "act_team_battle" and "battle_team_routes" in manifests:
            route = relation("battle_team_routes", row.get("team_battle_type"), "原版组队战斗入口", True)
            if route:
                links.append(route)
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
        if name == "pve_stage_data":
            stage_id = numeric_key(row.get("id"))
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
        if name == "map_boss" and numeric_key(row.get("id")) == str(TRUE_OROCHI_MAP_ID):
            links.append(rule_reference("ZHENBAQIDASHE_TIPS", "真·八岐大蛇玩法原文"))
            links.extend((relation("battle_mode_routes", TRUE_OROCHI_MODE, "原版战斗入口", True),
                          relation("team_assist_stage", TRUE_OROCHI_CODE, "真·八岐大蛇阵容码目录", True)))
            links.extend(relation("pve_stage_data", stage_id, f"第 {floor} 层关卡", True)
                         for stage_id, floor in orochi_floors.items())
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
                ("normal_battle_config", 2600, "彼世逢魔默认战斗规则"),
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
        if name == "raid_info" and row.get("fbId") == 1:
            for boss in row.get("bossInfo", ()):
                ref = relation("boss_info", boss, "候选首领阶段参数", True)
                if ref:
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
        if name in ROOTS or name in JOURNEY_BATTLE_VARIANTS or name == "battle_mode_routes"
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
        generic_edges = [] if variant or table_name == "journey_hardbattle" else [
            field for field in BATTLE_ID_FIELDS if field in manifest["fields"]
        ]
        for key, row in load_rows(table_name):
            if not isinstance(row, dict):
                continue
            if table_name == "map_boss" and numeric_key(key) != str(TRUE_OROCHI_MAP_ID):
                continue
            entrance = table_name == "mapnpc" and numeric_key(key) in table("storyChapter") \
                and numeric_key(row.get("battle_id")) in rooms_by_map
            linked_battles = [
                linked for field in generic_edges
                if (linked := relation("pve_stage_data", row.get(field), "通用 PvE 关卡", False))
            ] if not entrance else []
            scene_route = table_name == "battle_mode_routes" and row.get("scene_engine") \
                and numeric_key(key) not in table("normal_battle_config")
            if not root and not entrance and not scene_route and not linked_battles and not row.get("monsterWaves"):
                continue
            references = related(table_name, key, row, linked_battles)
            entry_family, entry_kind = ("daily", "地图探索入口") if entrance else (family, kind)
            if scene_route:
                entry_kind = "初始场景引擎"
            title = name(row)
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
            if table_name == "xinghen_battle":
                title = f"彼世逢魔 · {title}"
            if table_name == "boss_troops" and row.get("groupId") in GUILD_BOSS_TROOPS:
                entry_family, entry_kind = "guild", "首领退治机关编组"
                title = f"首领退治 · 编组 {row['groupId']} · 方案 {row['id']}"
            if table_name == "pve_stage_data" and row.get("name") in RESOURCE_STAGES:
                entry_family, entry_kind = "daily", RESOURCE_STAGES[row["name"]][0]
                title = f"{entry_kind} · 新服首次" if numeric_key(key) == "2111" else f"{entry_kind} · 编组 {row['groupid']}"
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
