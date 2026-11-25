import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from dungeon_encounters import encounter_index


class EncounterIndexTests(unittest.TestCase):
    def test_links_activity_to_stage_and_battle_using_original_key_types(self):
        tables = {
            "act_team_battle": [[4, {"title_name": "将魂试炼", "act_id": 10771, "battle_id": 3504732, "tip": "native_rule"}]],
            "activity": [[10771, {"name": "狩日之决"}]],
            "languageData_cn": [["native_rule", {"cn": "原版规则"}]],
            "pve_stage_data": [["3504732", {"name": "试炼", "groupid": 80}], ["88", {"groupid": 404}]],
            "BattleMonstersInfo": [[80, {"ID": 80}]],
            "other_event": [[1, {"battle_id": 3504732}], [2, {"battle_id": 0}]],
            "guild_boss_show": [[1, {"name": "贪婪的铁鼠", "bossID": 70}]],
        }
        manifests = [
            {"name": name, "status": "decoded", "family": "event",
             "fields": list({field for _, row in rows for field in row})}
            for name, rows in tables.items()
        ]
        result = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        by_key = {(e["table"], e["key"]): e for e in result["entries"]}
        entry = by_key["act_team_battle", 4]
        self.assertEqual(entry["title"], "将魂试炼")
        self.assertEqual(entry["family"], "event")
        self.assertEqual(
            [(ref["table"], ref["key"], ref["found"]) for ref in entry["refs"]],
            [("activity", 10771, True), ("languageData_cn", "native_rule", True),
             ("pve_stage_data", "3504732", True), ("BattleMonstersInfo", 80, True)],
        )
        self.assertEqual(by_key["other_event", 1]["title"], "试炼")
        self.assertNotIn(("other_event", 2), by_key)
        self.assertFalse(by_key["pve_stage_data", "88"]["refs"][0]["found"])
        self.assertFalse(by_key["guild_boss_show", 1]["refs"][0]["found"])
        self.assertEqual(result["unresolvedReferences"], 2)
