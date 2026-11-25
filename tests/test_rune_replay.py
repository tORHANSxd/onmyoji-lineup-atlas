import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from rune_replay import APPEND, PLAY, REMAP, UNREMAP, sync_windows


def replay(*frames):
    lines = ['["head",{}]']
    lines.extend(json.dumps(frame)[1:-1] for frame in frames)
    return '\n'.join(lines).encode('utf-8')


class ReplayAnimationTests(unittest.TestCase):
    def test_aliases_and_overlap_count_distinct_entities(self):
        result = sync_windows(
            replay(
                (0, REMAP, [1, 'attack', 'charged']),
                (0, PLAY, [1, ['attack', 'recover']]),
                (1, UNREMAP, [1, 'attack']),
                (1, PLAY, [1, 'attack']),
                (2, PLAY, [2, 'attack']),
                (3, APPEND, [2, 'attack']),
                (4, PLAY, [3, 'attack']),
            ),
            {'1': 'model', '2': 'model'},
            {'model': {'charged': {'len': 4}, 'recover': {'len': 2}, 'attack': {'len': 5}}},
        )
        self.assertEqual(result['actionRequests'], 4)
        self.assertEqual(result['queuedActions'], 1)
        self.assertEqual(result['maxOverlappingEntities'], 2)
        self.assertEqual(result['overlapMs'], 4)
        self.assertEqual(result['windows'][0]['clips'], ['charged', 'recover'])
        self.assertEqual(result['windows'][0]['endMs'], 6)
        self.assertEqual(result['windows'][1]['clips'], ['attack'])
        self.assertEqual(result['unresolved'], [
            {'atMs': 4, 'entity': '3', 'model': None, 'clips': ['attack']},
        ])

    def test_rejects_out_of_order_frames(self):
        with self.assertRaisesRegex(ValueError, 'timestamps'):
            sync_windows(replay((1, 0, []), (0, 0, [])), {}, {})
