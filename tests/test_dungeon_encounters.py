import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from dungeon_encounters import encounter_index


class EncounterIndexTests(unittest.TestCase):
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
