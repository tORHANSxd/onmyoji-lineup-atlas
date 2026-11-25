"""Build a searchable encounter index from decoded, versioned client tables."""

from collections import Counter


ROOTS = {
    "pve_stage_data": ("battle", "通用 PvE 关卡"),
    "normal_battle_config": ("battle", "战斗模式默认规则"),
    "dungeon_rune": ("daily", "御魂"),
    "dungeon_awake": ("daily", "觉醒"),
    "dungeon_challenge": ("daily", "秘闻"),
    "dungeon_challenge2": ("daily", "秘闻"),
    "dungeon_challenge_series": ("daily", "秘闻"),
    "dungeon_challenge_race": ("daily", "秘闻竞速"),
    "dungeon_yuling": ("daily", "御灵"),
    "MZB_fengmo": ("daily", "逢魔演武"),
    "lbs_world_boss_area": ("daily", "地域鬼王"),
    "lbs_world_boss_type": ("daily", "地域鬼王规则"),
    "shilian_event_battles": ("daily", "六道之门"),
    "shilian_event_exam": ("daily", "六道之门试炼"),
    "shilian_stage_detail": ("daily", "六道之门关卡"),
    "hunling_boss": ("daily", "契灵之境"),
    "rpg_chapter": ("daily", "剧情副本"),
    "storyChapter": ("daily", "探索章节"),
    "guild_boss_show": ("guild", "首领退治"),
    "guild_crevice_area": ("guild", "狭间暗域"),
    "guild_crevice_battle": ("guild", "狭间暗域"),
    "guild_dinner_monster": ("guild", "阴阳寮宴会"),
    "guild_monster": ("guild", "阴阳寮麒麟"),
    "guild_fake_god_event": ("guild", "阴阳寮活动"),
    "act_team_battle": ("event", "活动组队战斗"),
    "SuperGhost_mission": ("event", "超鬼王"),
    "SuperGhost_bossmission": ("event", "超鬼王首领挑战"),
}

# The raw fields remain available. Each relation below names the ID namespace
# used by the corresponding client table.
EDGES = {
    "pve_stage_data": (("groupid", "BattleMonstersInfo", "敌方编组"),),
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
    "act_team_battle": (("act_id", "activity", "活动开放配置"),),
    "SuperGhost_mission": (("actid", "activity", "活动开放配置"), ("sceneid", "Combinesceneinfo", "关卡场景")),
    "SuperGhost_bossmission": (("sceneid", "Combinesceneinfo", "关卡场景"),),
    "guild_boss_show": (("bossID", "monster", "首领"),),
    "guild_crevice_battle": (("easy_main_monster", "monster", "简单首领"),
                             ("normal_main_monster", "monster", "普通首领"),
                             ("hard_main_monster", "monster", "困难首领"),
                             ("ji_main_monster", "monster", "极难首领")),
    "hunling_boss": (("catch_battle_id", "pve_stage_data", "收服关卡"),),
    "Combinesceneinfo": (("battlesceneinfo", "BattleScenesInfo", "战斗站位"),),
}
FOLLOWED_TABLES = {"pve_stage_data", "BattleMonstersInfo", "Combinesceneinfo", "dungeon_awake_scene",
                   "normal_battle_tips", "battle_team_routes"}
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
                            if (key_id := numeric_key(key)) is not None}
        return lookup[name]

    def relation(destination, value, label, unresolved):
        key_id = numeric_key(value)
        if key_id is None:
            return None
        match = table(destination).get(key_id)
        if match is None:
            return None if not unresolved else {"table": destination, "key": value, "label": label, "found": False}
        return {"table": destination, "key": match[0], "label": label, "found": True}

    teams_by_mode = {}
    for key, row in table("battle_team_routes").values():
        teams_by_mode.setdefault(row["battleMode"], []).append(key)

    def explicit(name, row):
        links = []
        for field, destination, label in EDGES.get(name, ()):
            resolved = relation(destination, row.get(field), label, True)
            if resolved:
                links.append(resolved)
        if name == "act_team_battle" and "battle_team_routes" in manifests:
            route = relation("battle_team_routes", row.get("team_battle_type"), "原版组队战斗入口", True)
            if route:
                links.append(route)
        if name == "pve_stage_data":
            tip = relation("normal_battle_tips", row.get("id"), "通用战斗规则", False)
            if tip:
                links.append(tip)
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
        if name == "BattleMonstersInfo":
            scene = relation("Combinesceneinfo", row.get("resindex", 11032), "通用 PvE 默认场景", True)
            if scene:
                links.append(scene)
        panel_field = PANEL_RULE_FIELDS.get(name)
        if panel_field:
            field, label = panel_field
            key = row.get(field)
            if isinstance(key, str) and key:
                dest = legacy_tips if key not in rules and key in tips else rule_table
                links.append({"table": dest, "key": key, "label": label, "found": key in rules or key in tips})
        if name == "lbs_world_boss_area":
            for choice in row.get("weighted_battles", ()):
                if isinstance(choice, list) and choice:
                    resolved = relation("pve_stage_data", choice[0], "地域战斗", True)
                    if resolved:
                        links.append(resolved)
        if name == "guild_crevice_area":
            for key in str(row.get("monster_id", "")).replace("|", ",").split(","):
                resolved = relation("guild_crevice_battle", key, "暗域敌人", True)
                if resolved:
                    links.append(resolved)
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
        seen = {(table_name, key)} if type(key) in (int, str) else set()
        for link in pending:
            dest, key = link["table"], link["key"]
            identity = (dest, key)
            if identity in seen:
                continue
            seen.add(identity)
            references.append(link)
            if link["found"] and dest in FOLLOWED_TABLES:
                _, data = table(dest)[numeric_key(key)]
                pending.extend(explicit(dest, data))
        return references

    candidates = [
        name for name, row in manifests.items()
        if name in ROOTS or set(row["fields"]).intersection((*BATTLE_ID_FIELDS, "monsterWaves"))
    ]
    entries, unresolved = [], 0
    categories = Counter()
    for table_name in sorted(candidates):
        manifest = manifests[table_name]
        root = table_name in ROOTS
        family, kind = ROOTS.get(table_name, (manifest["family"], table_name))
        generic_edges = [field for field in BATTLE_ID_FIELDS if field in manifest["fields"]]
        for key, row in load_rows(table_name):
            if not isinstance(row, dict):
                continue
            linked_battles = [
                linked for field in generic_edges
                if (linked := relation("pve_stage_data", row.get(field), "通用 PvE 关卡", False))
            ]
            if not root and not linked_battles and not row.get("monsterWaves"):
                continue
            references = related(table_name, key, row, linked_battles)
            title = name(row)
            if table_name == "normal_battle_config":
                symbol = next((table(ref["table"])[numeric_key(ref["key"])][1].get("mode_symbol")
                               for ref in references if ref["table"] in {"battle_mode_routes", "battle_team_routes"}), None)
                title = "战斗模式 " + str(key) + (" · " + symbol if symbol else "")
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
            categories[family] += 1
            unresolved += sum(not ref["found"] for ref in references)
            entries.append({"table": table_name, "key": key, "title": title, "family": family,
                            "kind": kind, "refs": references})

    return {"schema": 1, "resourceVersion": source["resourceVersion"], "entries": entries,
            "counts": dict(categories), "unresolvedReferences": unresolved}
