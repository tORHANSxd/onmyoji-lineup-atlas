import random
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from rune_random import HIGH, RandomAudit, alternative


def compare(audit, threshold):
    def call_with_original_recorder_shape():
        return audit.random()

    return call_with_original_recorder_shape() < threshold


class RandomAuditTest(unittest.TestCase):
    def test_replays_the_same_prefix_and_flips_the_selected_comparison(self):
        original = RandomAudit(random.Random(0), "test")
        self.assertTrue(compare(original, 1))
        self.assertFalse(compare(original, 0.4))
        reference = original.report()
        self.assertEqual(reference["reversibleDraws"], [2])
        self.assertEqual(reference["draws"][1]["comparisons"], [["lt", 0.4, False]])

        flipped = RandomAudit(random.Random(0), "test", reference, 2)
        self.assertTrue(compare(flipped, 1))
        self.assertTrue(compare(flipped, 0.4))
        report = flipped.report()
        self.assertEqual(report["flipped"], {"index": 2, "originalValue": 0.7579544029403025, "value": 0})
        self.assertEqual(original.original.getstate(), flipped.original.getstate())

    def test_rejects_a_reference_for_another_replay_or_a_changed_prefix(self):
        original = RandomAudit(random.Random(0), "test")
        compare(original, 1)
        compare(original, 0.9)
        reference = original.report()
        with self.assertRaisesRegex(ValueError, "does not match"):
            RandomAudit(random.Random(0), "other", reference, 2)
        changed = RandomAudit(random.Random(0), "test", reference, 2)
        compare(changed, 0.1)
        with self.assertRaisesRegex(ValueError, "diverged before"):
            compare(changed, 0.9)

    def test_extends_the_reached_path_and_checks_prior_native_values(self):
        def replay(reference=None, index=None):
            audit = RandomAudit(random.Random(0), "test", reference, index)
            first = compare(audit, 0.5)
            second = compare(audit, 0.4) if first else None
            return first, second, audit.report()

        _, _, baseline = replay()
        self.assertEqual(baseline["reversibleDraws"], [1])
        first, second, alternate = replay(baseline, 1)
        self.assertEqual((first, second), (True, False))
        first, second, combined = replay(alternate, 2)
        self.assertEqual((first, second), (True, True))
        self.assertEqual([row["index"] for row in combined["interventions"]], [1, 2])
        with self.assertRaisesRegex(ValueError, "after the last intervention"):
            replay(alternate, 1)
        alternate["interventions"][0]["originalValue"] = 0.8
        with self.assertRaisesRegex(ValueError, "native random draw diverged"):
            replay(alternate, 2)

    def test_known_grid_edges_and_multiple_observed_comparisons(self):
        self.assertIsNone(alternative({"method": "uniform", "comparisons": []}))
        self.assertIsNone(alternative({"method": "random", "comparisons": [["lt", 1, True]]}))
        self.assertIsNone(alternative({"method": "random", "comparisons": [["gt", HIGH, False]]}))
        self.assertEqual(alternative({"method": "random", "comparisons": [["lt", HIGH, True]]}), HIGH)
        self.assertIsNone(alternative({"method": "random", "comparisons": [["lt", .4, False], ["lt", .8, True]]}))
