import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from dungeon_encounters import encounter_index
from dungeon_battle_routes import bind_scene_engines, registered_team_symbols


class EncounterIndexTests(unittest.TestCase):
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
