import importlib.util
from pathlib import Path
import sys
import unittest


tools = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(tools))
from rune_team import selected_team

spec = importlib.util.spec_from_file_location("verify_hun13", tools / "verify-hun13.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


def input_plan():
    actor = {"heroId": 10, "level": 60, "star": 1, "awake": 0, "skinfo": [[1003, 1]]}
    fighter = {"heroId": 101, "level": 40, "star": 6, "awake": 1, "skinfo": [[1011, 1]]}
    soul = {"id": "s1", "slot": 1, "level": 15, "quality": 6, "setId": "招财猫",
            "mainAttrType": "attack_flat", "mainAttrValue": 10, "subAttributes": []}
    teams = [[{"instanceId": f"h{i}", "hero": fighter, "souls": [{**soul, "id": f"s{i}"}], "aiSkill": 3}
              for i in range(start, start + 5)] for start in (1, 6)]
    return {"onmyoji": actor, "teams": teams}


class Hun13InventoryTest(unittest.TestCase):
    def test_rounds_keep_distinct_instances_even_for_same_shikigami_type(self):
        plan = input_plan()
        heroes, items, rounds = verify.prepare_teams(plan, {"300014": "招财猫"}, selected_team)
        self.assertEqual(heroes["selected-onmyoji"]["heroId"], 10)
        self.assertEqual(len(heroes), 11)
        self.assertEqual(len(items), 10)
        self.assertFalse(set(rounds[0]["lineup"]).intersection(rounds[1]["lineup"]))
        self.assertEqual(heroes["r2-member-1"]["equips"], ["r2-member-1-soul-1"])
        self.assertEqual(rounds[1]["choices"]["r2-member-1"], 3)
        self.assertEqual(plan["teams"][1][0]["souls"][0]["id"], "s6")

    def test_each_round_keeps_its_onmyoji_and_settings(self):
        plan = input_plan()
        first = plan["onmyoji"]
        second = {**first, "skinfo": [[1003, 1], [1008, 5]], "aiSkill": 2}
        allocation = {"rounds": [{"members": members, "onmyoji": actor}
                                 for members, actor in zip(plan["teams"], (first, second))]}
        heroes, _, rounds = verify.prepare_teams(allocation, {"300014": "招财猫"}, selected_team)
        self.assertEqual(rounds[0]["actorAlias"], "r1-onmyoji")
        self.assertEqual(heroes["r2-onmyoji"]["skinfo"], [[1003, 1], [1008, 5]])
        self.assertEqual(rounds[1]["choices"]["r2-onmyoji"], 2)

    def test_rejects_duplicate_instance_and_shared_equipment_across_rounds(self):
        plan = input_plan()
        plan["teams"][1][0]["instanceId"] = "h1"
        with self.assertRaisesRegex(ValueError, "same shikigami instance"):
            verify.prepare_teams(plan, {}, selected_team)
        plan = input_plan()
        plan["teams"][1][0]["souls"][0]["id"] = "s1"
        with self.assertRaisesRegex(ValueError, "simultaneous equipment"):
            verify.prepare_teams(plan, {}, selected_team)


if __name__ == "__main__":
    unittest.main()
