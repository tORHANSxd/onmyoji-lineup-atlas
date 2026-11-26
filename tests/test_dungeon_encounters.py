import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from dungeon_encounters import encounter_index
from dungeon_battle_routes import bind_scene_engines, registered_team_symbols
from map_boss_stage import MODE, SEAL_MODE, entry_for_stage


class EncounterIndexTests(unittest.TestCase):
    def test_tianfa_difficulty_links_original_stage_formation_and_lineup_code(self):
        tables = {
            "xinghen_battle": [[2, {"difficulty": 2, "name": "困难", "stage_id": 2716062}]],
            "xinghen_ui": [[2, {"title": "彼世逢魔"}]],
            "pve_stage_data": [["2716062", {"id": "2716062", "groupid": 2716062}]],
            "BattleMonstersInfo": [[2716062, {"resindex": 2735048}]],
            "Combinesceneinfo": [[2735048, {}]],
            "team_assist_stage": [[100969, {"ss_num": 6}]],
            "normal_battle_config": [[2600, {"battleMode": 2600}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": [field for _, row in rows for field in row]} for name, rows in tables.items()]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {entry["table"]: entry for entry in catalog["entries"]}
        route = entries["xinghen_battle"]
        self.assertEqual((route["family"], route["title"]), ("daily", "彼世逢魔 · 困难"))
        self.assertEqual({(ref["table"], ref["key"]) for ref in route["refs"]}, {
            ("pve_stage_data", "2716062"), ("xinghen_ui", 2), ("BattleMonstersInfo", 2716062),
            ("Combinesceneinfo", 2735048), ("normal_battle_config", 2600), ("team_assist_stage", 100969),
        })
        self.assertIn(("xinghen_battle", 2), {(ref["table"], ref["key"]) for ref in entries["pve_stage_data"]["refs"]})

    def test_six_realms_keeps_trial_routing_and_battle_island_pools_distinct(self):
        tables = {
            "shilian_liudao": [[2, {"id": 2, "name": "香行域", "pve_id": 700101}],
                              [0, {"id": 0, "name": "月之海", "pve_id": 760000}],
                              [1, {"id": 1, "name": "月之海", "pve_id": 760000}]],
            "shilian_stage_detail": [[20, {"dao": 2, "name": "香炉规则"}]],
            "shilian_level": [[{"$tuple": [2, 1]}, {"dao": 2, "grade_str": "壹"}]],
            "shilian_event_exam": [[1, {"dao": 0, "battle_id": 690036}], [2, {"dao": 1, "battle_id": 700036}],
                                   [3, {"dao": 2, "battle_id": 700133}]],
            "shilian_area": [[14, {"type": 40, "event_group": 7, "tips_key": "island"}],
                             [15, {"type": 20, "event_group": 7}]],
            "shilian_event_battles": [[201, {"group_id": 7, "battle_id": 700120}],
                                      [202, {"group_id": 21, "battle_id": 700121}]],
            "pve_stage_data": [[str(key), {"id": key, "groupid": key}]
                               for key in (690036, 700036, 700101, 700120, 700121, 700133, 760000)],
            "BattleMonstersInfo": [[key, {"resindex": 100}]
                                   for key in (690036, 700036, 700101, 700120, 700121, 700133, 760000)],
            "Combinesceneinfo": [[100, {"battlesceneinfo": 10}], [469104, {"battlesceneinfo": 811}]],
            "BattleScenesInfo": [[10, {}], [811, {}]],
            "battle_team_routes": [[927, {"battleMode": 208}], [928, {"battleMode": 921}]],
            "team_assist_stage": [[110151, {"ss_num": 6}]],
            "tipsInfoData_cn": [["island", "岛屿说明"]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily",
                      "fields": [field for _, row in rows if isinstance(row, dict) for field in row]}
                     for name, rows in tables.items()]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], str(entry["key"])): entry for entry in catalog["entries"]}

        def references(table, key):
            return [(ref["table"], ref["key"]) for ref in entries[table, str(key)]["refs"]]

        route = entries["shilian_liudao", "2"]
        self.assertEqual(route["title"], "六道之门 · 香行域")
        self.assertIn(("shilian_level", {"$tuple": [2, 1]}), references("shilian_liudao", 2))
        self.assertIn(("shilian_event_exam", 3), references("shilian_liudao", 2))
        self.assertIn(("battle_team_routes", 927), references("shilian_liudao", 2))
        self.assertIn(("battle_team_routes", 928), references("shilian_event_exam", 3))
        self.assertIn(("team_assist_stage", 110151), references("shilian_event_exam", 3))
        self.assertIn(("shilian_liudao", 0), references("shilian_event_exam", 1))
        self.assertNotIn(("Combinesceneinfo", 469104), references("shilian_event_exam", 1))
        self.assertIn(("Combinesceneinfo", 469104), references("shilian_event_exam", 2))
        self.assertIn(("BattleScenesInfo", 811), references("shilian_event_exam", 2))
        self.assertIn(("shilian_event_exam", 3), references("pve_stage_data", 700133))
        self.assertIn(("shilian_event_battles", 201), references("pve_stage_data", 700120))
        self.assertNotIn(("shilian_liudao", 2), references("shilian_event_battles", 201))
        self.assertIn(("shilian_liudao", 2), references("shilian_event_battles", 202))
        self.assertIn(("battle_team_routes", 927), references("shilian_event_battles", 202))
        self.assertIn(("team_assist_stage", 110151), references("shilian_event_battles", 202))
        self.assertEqual([key for table, key in references("pve_stage_data", 760000) if table == "shilian_liudao"], [0, 1])
        self.assertEqual(references("shilian_area", 14), [("tipsInfoData_cn", "island"), ("shilian_event_battles", 201)])
        self.assertEqual(references("shilian_area", 15), [])
        self.assertEqual(catalog["unresolvedReferences"], 0)

    def test_true_orochi_follows_pve_stage_groups_and_links_back_to_the_full_dungeon(self):
        tables = {
            "map_boss": [[71, {"id": 71, "name": "真·八岐大蛇", "gk_list": [[25100, 40040], [25101, 40050]]}],
                         [72, {"id": 72, "name": "其他首领"}]],
            "pve_stage_data": [["25100", {"id": 25100, "groupid": 25100}],
                               ["25101", {"id": 25101, "groupid": 25101}]],
            "BattleMonstersInfo": [[25100, {"resindex": 40007}], [25101, {"resindex": 40007}]],
            "Combinesceneinfo": [[40007, {"battlesceneinfo": 507}]],
            "BattleScenesInfo": [[507, {}]],
            "battle_mode_routes": [[3005, {"mode_symbol": "MODE_ZHEN_DASHE", "scene_engine": "ZhenDaSheEngine"}]],
            "team_assist_stage": [[10020228, {"ss_num": 6}]],
            "tipsInfoData_cn": [["ZHENBAQIDASHE_TIPS", "玩法说明"]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in index["entries"]}
        root = entries["map_boss", 71]
        self.assertEqual(entries["map_boss", 72]["kind"], "地图首领入口")
        self.assertEqual(entries["map_boss", 72]["refs"], [])
        self.assertEqual([(ref["table"], ref["key"]) for ref in root["refs"]], [
            ("tipsInfoData_cn", "ZHENBAQIDASHE_TIPS"), ("battle_mode_routes", 3005),
            ("team_assist_stage", 10020228), ("pve_stage_data", "25100"), ("pve_stage_data", "25101"),
            ("BattleMonstersInfo", 25100), ("BattleMonstersInfo", 25101), ("Combinesceneinfo", 40007),
            ("BattleScenesInfo", 507),
        ])
        second = entries["pve_stage_data", "25101"]
        self.assertEqual(second["title"], "真·八岐大蛇 · 第 2 层")
        self.assertEqual([(ref["table"], ref["key"]) for ref in second["refs"]], [
            ("BattleMonstersInfo", 25101), ("map_boss", 71), ("Combinesceneinfo", 40007), ("BattleScenesInfo", 507),
        ])
        self.assertEqual(index["unresolvedReferences"], 0)

    def test_map_boss_links_ranked_and_base_stages_with_help_and_reverse_links(self):
        tables = {
            "map_boss": [[73, {"id": 73, "name": "愤怒的石距", "gk_base_id": 25300,
                               "gk_list": [[25301, 15]]}]],
            "pve_stage_data": [[str(stage), {"id": stage, "groupid": 10}] for stage in (25300, 25301)],
            "BattleMonstersInfo": [[10, {"resindex": 11032}]],
            "Combinesceneinfo": [[11032, {"battlesceneinfo": 2}]],
            "BattleScenesInfo": [[2, {}]],
            "battle_mode_routes": [[3000, {"mode_symbol": "MODE_WORLD_BOSS", "scene_engine": "WorldBossEngine"}]],
            "tipsInfoData_cn": [["FENNUDESHIJU_TIPS", "原版帮助"]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily", "fields": []} for name in tables]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in catalog["entries"]}
        refs = entries["map_boss", 73]["refs"]
        self.assertEqual([(ref["table"], ref["key"], ref["label"]) for ref in refs[:4]], [
            ("tipsInfoData_cn", "FENNUDESHIJU_TIPS", "愤怒的石距玩法原文"),
            ("battle_mode_routes", 3000, "首领战斗引擎"),
            ("pve_stage_data", "25301", "配置等级 15"),
            ("pve_stage_data", "25300", "基础关卡配置"),
        ])
        self.assertIn(("BattleScenesInfo", 2), [(ref["table"], ref["key"]) for ref in refs])
        for stage in ("25300", "25301"):
            self.assertIn(("map_boss", 73), [(ref["table"], ref["key"])
                                             for ref in entries["pve_stage_data", stage]["refs"]])
        self.assertEqual(catalog["unresolvedReferences"], 0)

    def test_demon_seal_uses_fragment_rules_and_leaves_legacy_resource_rows_separate(self):
        entries = {
            7: {"id": 7, "name": "鬼使黑", "type": 1, "gk_list": [[1600, 10]]},
            10: {"id": 10, "name": "金币妖怪", "type": 1, "gk_list": [[2000, 10]]},
            63: {"id": 63, "name": "姑获鸟", "type": 1, "begin_time": [2016], "end_time": [2017]},
        }
        tables = {
            "map_boss": list(entries.items()),
            "contract_fragment": [[1, {"tips_key": "fragment_rule", "preview_reward": 440048}]],
            "system_rule_dsc": [["fragment_rule", {"rule_dsc": "发现与契约书碎片"}]],
            "battle_mode_routes": [[855, {"mode_symbol": "MODE_YAOQI_FB_BATTLE", "scene_engine": "WorldBossEngine"}]],
            "pve_stage_data": [["1600", {"id": "1600", "groupid": 1600}], ["2000", {"id": "2000", "groupid": 2000}]],
            "BattleMonstersInfo": [[1600, {"resindex": 39}], [2000, {"resindex": 42}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily", "fields": []} for name in tables]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        bosses = {entry["key"]: entry for entry in catalog["entries"] if entry["table"] == "map_boss"}
        self.assertEqual(bosses[7]["title"], "妖气封印 · 鬼使黑")
        self.assertEqual(bosses[63]["title"], "妖气封印 · 姑获鸟 · 历史活动")
        self.assertEqual(bosses[10]["kind"], "地图首领入口")
        self.assertEqual({(ref["table"], ref["key"]) for ref in bosses[7]["refs"][:3]}, {
            ("contract_fragment", 1), ("system_rule_dsc", "fragment_rule"), ("battle_mode_routes", SEAL_MODE),
        })
        self.assertEqual(entry_for_stage(entries, 1600, SEAL_MODE), ("seal", None, 39, None, 10))
        self.assertIsNone(entry_for_stage(entries, 2000))
        self.assertIsNone(entry_for_stage(entries, 1600, MODE))

    def test_regional_boss_preserves_weighted_rules_and_level_one_modifier_variants(self):
        base_skill = {"$tuple": [61701, 1, -1]}
        reward_skill = {"$tuple": [61711, 1, 2]}
        tables = {
            "lbs_world_boss_area": [[10092, {"area_name": "国王湖", "dist_id": 7, "monsters": [3092276],
                                            "weighted_battles": [["300092", 1]],
                                            "special_attacks": [[[10003, 0.2], [30004, 0.4], [30004, 0.4]]]}]],
            "lbs_world_boss_init": [[7, {"dist_name": "欧洲"}]],
            "lbs_world_boss_type": [[10003, {"desc": "限定%s回合"}], [30004, {"desc": "稀有度限制"}]],
            "tipsInfoData_cn": [["diyuguiwang_TIPS", "地域鬼王评分说明"]],
            "pve_stage_data": [["300092", {"id": "300092", "groupid": 300092}]],
            "BattleMonstersInfo": [[300092, {"resindex": 11032}]],
            "Combinesceneinfo": [[11032, {}]],
            "monster": [[3092276, {"name": "首领"}]],
            "battle_mode_routes": [[3004, {"mode_symbol": "MODE_LBS_WORLD_BOSS", "scene_engine": "LBSWorldBossEngine"}],
                                   [3023, {"mode_symbol": "MODE_LBS_WORLD_BOSSX", "scene_engine": "LBSWorldBossXEngine"}]],
            "Constant": [[10409, {"value": [61701.0]}], [10418, {"value": [61711.0]}], [10414, {"value": [4]}]],
            "skill": [[base_skill, {}], [reward_skill, {}], [{"$tuple": [61711, 2, 2]}, {}]],
            "team_assist_stage": [[10020215, {}], [10020216, {}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in index["entries"]}
        area = entries["lbs_world_boss_area", 10092]
        self.assertEqual([ref["key"] for ref in area["refs"]],
                         [7, "diyuguiwang_TIPS", "300092", 3092276, 10003, 30004, 3004, 3023,
                          10020215, 10020216, 300092, 11032])
        self.assertEqual(area["refs"][4]["label"], "普通特殊条件候选（权重 0.2）")
        self.assertEqual(area["refs"][5]["label"], "普通特殊条件候选（权重 0.4 + 0.4）")
        stage_refs = entries["pve_stage_data", "300092"]["refs"]
        self.assertTrue(any(ref["table"] == "lbs_world_boss_area" and ref["key"] == 10092 for ref in stage_refs))
        modifiers = entries["battle_mode_routes", 3023]["refs"]
        self.assertEqual([ref["key"] for ref in modifiers], [10414, 10409, base_skill, 10418, reward_skill])
        self.assertEqual(index["unresolvedReferences"], 0)

    def test_guild_retreat_difficulty_follows_the_composite_raid_key(self):
        tables = {
            "guild_boss_reward": [[1, {"difficulty": 1, "raid_id": 1}]],
            "raid_info": [[{"$tuple": [2, 1]}, {"fbId": 2, "bossInfo": [202]}],
                          [{"$tuple": [1, 1]}, {"fbId": 1, "bossInfo": [101]}]],
            "boss_info": [[101, {"protoId": 1200501}], [202, {"protoId": 1300000}]],
            "monster": [[1200501, {"name": "冥界小鬼"}], [1300000, {"name": "其他首领"}]],
        }
        manifest = [{"name": table, "status": "decoded", "family": "guild",
                     "fields": list({field for _, row in rows for field in row})} for table, rows in tables.items()]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifest}, tables.__getitem__)
        refs = index["entries"][0]["refs"]
        self.assertEqual([(ref["table"], ref["key"]) for ref in refs],
                         [("raid_info", {"$tuple": [1, 1]}), ("boss_info", 101), ("monster", 1200501)])

    def test_team_decorator_preserves_shared_literal_registrations(self):
        code = compile("""
@team_type_base.team_type(const.team_battle_type.TEAM_BATTLE_TYPE_NEW_EXP,
                          const.team_battle_type.TEAM_BATTLE_TYPE_NEW_COIN)
class TeamBattleType: pass
""", "team_type_new_exp_gold.py", "exec")
        self.assertEqual(list(registered_team_symbols(code)),
                         ["TEAM_BATTLE_TYPE_NEW_EXP", "TEAM_BATTLE_TYPE_NEW_COIN"])

    def test_scene_engine_keeps_direct_source_and_omits_conditional_declarations(self):
        scenes = {"SimpleScene": 'EngineClassName = "ExampleEngine"',
                  "GuardedScene": 'if some_condition:\n        EngineClassName = "OtherEngine"'}
        rows = {i: {"scene_class": scene} for i, scene in enumerate(scenes, 1)}
        modules = {
            f"scenemembers/{scene}.py": (compile(f"class {scene}:\n    {body}\n", f"{scene}.py", "exec"),
                                         {"marshalSHA256": "c" * 64})
            for scene, body in scenes.items()
        }
        bind_scene_engines(rows, modules, SimpleNamespace(code=lambda original: original))
        self.assertEqual(rows[1], {"scene_class": "SimpleScene", "scene_engine": "ExampleEngine",
                                   "scene_module": "scenemembers/SimpleScene.py", "scene_marshal_sha256": "c" * 64})
        self.assertEqual(rows[2], {"scene_class": "GuardedScene"})

    def test_scene_engines_are_searchable_with_or_without_mode_defaults(self):
        tables = {
            "battle_mode_routes": [[3, {"battleMode": 3, "mode_symbol": "MODE_PVE", "scene_engine": "MonstarGuanKaEngine"}],
                                   [6, {"battleMode": 6, "mode_symbol": "MODE_OTHER", "scene_engine": "OtherEngine"}],
                                   [7, {"battleMode": 7, "mode_symbol": "NON_BATTLE_SCENE"}]],
            "normal_battle_config": [[6, {"battleMode": 6, "halt_time": 180}]],
        }
        manifests = [
            {"name": name, "status": "decoded", "family": "battle",
             "fields": list({field for _, row in rows for field in row})}
            for name, rows in tables.items()
        ]
        data = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        rows = data["entries"]
        self.assertEqual([(row["table"], row["key"], row["title"]) for row in rows],
                         [("battle_mode_routes", 3, "战斗模式 3 · MODE_PVE · MonstarGuanKaEngine"),
                          ("normal_battle_config", 6, "战斗模式 6 · MODE_OTHER · OtherEngine")])
        self.assertEqual(rows[1]["refs"], [{"table": "battle_mode_routes", "key": 6,
                                            "label": "客户端初始场景注册", "found": True}])

    def test_journey_variants_keep_resource_namespaces_and_bosses_keep_the_original_links(self):
        tables = {
            "journey_normalbattle_jinbi": [[2, {"battle_id": 18, "board_index": 4}]],
            "journey_normalbattle_jingyan": [[3, {"battle_id": 51, "board_index": 4}]],
            "journey_normalbattle_yuhun": [[4, {"battle_id": 101, "board_index": 4}]],
            "journey_normalbattle_juexing": [[5, {"battle_id": 151, "board_index": 4}]],
            "journey_hardbattle": [[1, {"battle_id": 731001, "title": "七人岬·扇"}]],
            "pve_stage_data": [["18", {"groupid": 18}], ["731001", {"groupid": 900}]],
            "BattleMonstersInfo": [[900, {"resindex": 11032}]],
            "Combinesceneinfo": [[11032, {}]],
            "system_rule_dsc": [["defence_hard_battle", {"rule_dsc": "首领挑战规则"}]],
        }
        manifests = [
            {"name": name, "status": "decoded", "family": "other",
             "fields": list({field for _, row in rows for field in row})}
            for name, rows in tables.items()
        ]
        data = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in data["entries"]}
        variants = [entry for entry in entries.values() if entry["kind"] == "京畿净化战斗参数"]
        self.assertEqual(len(variants), 4)
        self.assertTrue(all(entry["family"] == "event" and not entry["refs"] for entry in variants))
        self.assertEqual(entries["journey_normalbattle_jinbi", 2]["title"], "金币 · 棋盘 4 · 战斗参数 18")
        hard = entries["journey_hardbattle", 1]
        self.assertEqual([(row["table"], row["key"], row["found"]) for row in hard["refs"]],
                         [("pve_stage_data", "731001", True), ("system_rule_dsc", "defence_hard_battle", True),
                          ("BattleMonstersInfo", 900, True), ("Combinesceneinfo", 11032, True)])
        self.assertEqual(data["unresolvedReferences"], 1)

    def test_links_activity_to_stage_and_battle_using_original_key_types(self):
        tables = {
            "act_team_battle": [[4, {"title_name": "将魂试炼", "act_id": 10771, "battle_id": 3504732,
                                      "team_battle_type": 3507, "tip": "native_rule"}]],
            "activity": [[10771, {"name": "狩日之决"}]],
            "battle_team_routes": [[3507, {"battleMode": 2507, "engine_class": "FakeGod7GeneralSoulBattleEngine",
                                            "mode_symbol": "MODE_FAKE_GOD7_GENERAL_SOUL_BATTLE"}]],
            "battle_mode_routes": [[2507, {"battleMode": 2507, "mode_symbol": "MODE_FAKE_GOD7_GENERAL_SOUL_BATTLE",
                                            "scene_class": "InitialBattleScene"}]],
            "normal_battle_config": [[2507, {"battleMode": 2507, "halt_time": 180}]],
            "languageData_cn": [["native_rule", {"cn": "原版规则"}]],
            "pve_stage_data": [["3504732", {"id": "3504732", "name": "试炼", "groupid": 80}], ["88", {"groupid": 404}]],
            "BattleMonstersInfo": [[80, {"ID": 80}]],
            "Combinesceneinfo": [[11032, {"battlesceneinfo": 301}], [17, {"battlesceneinfo": 302}]],
            "BattleScenesInfo": [[301, {"MonPos1": "1,0,0,1,90"}], [302, {"MyPos1": "0,0,0,1,90"}]],
            "normal_battle_tips": [["3504732", {"rule_key": "shared_tip"}]],
            "system_rule_dsc": [["shared_tip", {"rule_dsc": "现行规则"}]],
            "tipsInfoData_cn": [["shared_tip", "旧版规则"], ["legacy_tip", "旧版专属规则"]],
            "dungeon_challenge_series": [[66, {"scene": 17, "fbtips": "legacy_tip", "title": "流萤之夏",
                                                "floordesc": "拾·归处", "typedesc": "虫师"}]],
            "other_event": [[1, {"battle_id": 3504732}], [2, {"battle_id": 0}]],
            "guild_boss_show": [[1, {"name": "贪婪的铁鼠", "bossID": 70}]],
        }
        manifests = [
            {"name": name, "status": "decoded", "family": "event",
             "fields": list({field for _, row in rows if isinstance(row, dict) for field in row})}
            for name, rows in tables.items()
        ]
        result = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        by_key = {(e["table"], e["key"]): e for e in result["entries"]}
        entry = by_key["act_team_battle", 4]
        self.assertEqual(entry["title"], "将魂试炼")
        self.assertEqual(entry["family"], "event")
        self.assertEqual(
            [(ref["table"], ref["key"], ref["found"]) for ref in entry["refs"]],
            [("activity", 10771, True), ("battle_team_routes", 3507, True), ("languageData_cn", "native_rule", True),
             ("pve_stage_data", "3504732", True), ("normal_battle_config", 2507, True), ("BattleMonstersInfo", 80, True),
             ("normal_battle_tips", "3504732", True), ("Combinesceneinfo", 11032, True),
             ("system_rule_dsc", "shared_tip", True), ("BattleScenesInfo", 301, True)],
        )
        mode = by_key["normal_battle_config", 2507]
        self.assertEqual(mode["title"], "战斗模式 2507 · MODE_FAKE_GOD7_GENERAL_SOUL_BATTLE")
        self.assertEqual([(ref["table"], ref["key"]) for ref in mode["refs"]],
                         [("battle_mode_routes", 2507), ("battle_team_routes", 3507)])
        self.assertEqual([(ref["table"], ref["key"]) for ref in by_key["dungeon_challenge_series", 66]["refs"]],
                         [("Combinesceneinfo", 17), ("tipsInfoData_cn", "legacy_tip"), ("BattleScenesInfo", 302)])
        self.assertEqual(by_key["dungeon_challenge_series", 66]["title"], "虫师 · 流萤之夏 · 拾·归处")
        self.assertEqual(by_key["other_event", 1]["title"], "试炼")
        self.assertNotIn(("other_event", 2), by_key)
        self.assertFalse(by_key["pve_stage_data", "88"]["refs"][0]["found"])
        self.assertFalse(by_key["guild_boss_show", 1]["refs"][0]["found"])
        self.assertEqual(result["unresolvedReferences"], 2)

    def test_exploration_room_and_story_process_use_distinct_id_namespaces(self):
        tables = {
            "storyChapter": [[18, {"id": 18, "name": "阴阳之理", "BossList": [39], "guanKaProcess": [[1, 2]]}]],
            "mapnpc": [[18, {"id": 18, "name": "阴阳之理", "battle_id": 18}]],
            "story_room": [[1801, {"MapEntryID": 18, "MonsterID": 31811, "desc": "大天狗挑战难度1"}]],
            "BossTower": [[39, {"HeroID": 230, "LevelID": 21230}]],
            "hero": [[230, {"name": "独眼小僧"}]],
            "DramaProcess": [[1, {"type": 3, "RelatedStory": 1}], [2, {"type": 1, "RelatedStory": 2}]],
            "DramaLevel": [[1, {"StoryName": "犬神战斗", "ElementList": [[30101]]}],
                           [2, {"StoryName": "剧情探索", "ElementList": [[30101]]}]],
            "pve_stage_data": [["18", {"id": "18", "groupid": 18}],
                               ["31811", {"id": "31811", "groupid": 31811}],
                               ["30101", {"id": "30101", "groupid": 30101}]],
            "BattleMonstersInfo": [[31811, {"resindex": 11032}], [30101, {"resindex": 11032}]],
            "Combinesceneinfo": [[11032, {}]],
        }
        manifests = [
            {"name": name, "status": "decoded", "family": "other",
             "fields": list({field for _, row in rows for field in row})}
            for name, rows in tables.items()
        ]
        data = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in data["entries"]}

        def refs(table_name, key):
            return [(ref["table"], ref["key"]) for ref in entries[table_name, key]["refs"]]

        self.assertEqual(refs("storyChapter", 18), [("mapnpc", 18), ("BossTower", 39), ("DramaProcess", 1), ("DramaProcess", 2)])
        self.assertEqual(refs("mapnpc", 18), [("story_room", 1801)])
        self.assertEqual(entries["mapnpc", 18]["family"], "daily")
        self.assertEqual(entries["story_room", 1801]["title"], "阴阳之理 · 大天狗挑战难度1")
        self.assertEqual(refs("story_room", 1801), [("pve_stage_data", "31811"), ("BattleMonstersInfo", 31811),
                                                   ("mapnpc", 18), ("Combinesceneinfo", 11032)])
        self.assertEqual(refs("DramaProcess", 1), [("DramaLevel", 1), ("pve_stage_data", "30101"),
                                                 ("BattleMonstersInfo", 30101), ("Combinesceneinfo", 11032)])
        self.assertEqual(refs("DramaProcess", 2), [("DramaLevel", 2)])
        self.assertEqual(refs("BossTower", 39), [("hero", 230)])
        self.assertEqual(data["unresolvedReferences"], 1)
