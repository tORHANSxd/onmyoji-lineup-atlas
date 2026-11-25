import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from rune_replay import APPEND, CREATE_MONSTER, ENTITY_ATTR, PLAY, REMAP, SCENE_ATTR, UNREMAP, monster_waves, sync_windows


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

    def test_ignores_unrelated_notes_written_with_an_earlier_timestamp(self):
        result = sync_windows(replay((10, PLAY, [1, 'attack']), (9, 1128, [])),
                              {'1': 'model'}, {'model': {'attack': {'len': 5}}})
        self.assertEqual(result['windows'][0]['endMs'], 15)

    def test_rejects_out_of_order_animation_frames(self):
        with self.assertRaisesRegex(ValueError, 'timestamps'):
            sync_windows(replay((1, PLAY, [1, 'attack']), (0, PLAY, [1, 'attack'])), {}, {})


class ReplayMonsterHealthTests(unittest.TestCase):
    def test_tracks_wave_transitions_and_hp_by_spawned_identity(self):
        result = monster_waves(replay(
            (0, SCENE_ATTR, ['monsterWaveCount', 3]),
            (12, CREATE_MONSTER, [1, 2, None, {'id': 4742287, 'Index': 4, 'IndexCamp': 2}]),
            (12, ENTITY_ATTR, [1, 'hp', 120000]),
            (13, ENTITY_ATTR, [1, 'hp', 1000]),
            (14, ENTITY_ATTR, [1, 'hp', 10000]),
            (15, ENTITY_ATTR, [1, 'hp', 0]),
            (16, ENTITY_ATTR, [1, 'hp', 10000]),
            (17, ENTITY_ATTR, [1, 'hp', 0]),
            (18, SCENE_ATTR, ['finishedWaveCount', 1]),
            (19, CREATE_MONSTER, [2, 2, None, {'id': 4741297, 'Index': 4, 'IndexCamp': 2}]),
            (19, ENTITY_ATTR, [2, 'hp', 198501]),
            (20, ENTITY_ATTR, [2, 'hp', 150500]),
            (21, ENTITY_ATTR, [2, 'hp', 170000]),
        ))
        self.assertEqual(result['total'], 3)
        first, second = result['waves']
        self.assertTrue(first['cleared'])
        self.assertEqual((first['startMs'], first['endMs']), (12, 18))
        self.assertEqual(first['monsters'], [{
            'id': 4742287, 'position': 4, 'initialHp': 120000, 'lowestHp': 0, 'lastHp': 0,
            'regainedHp': 19000, 'zeroToAlive': 1,
        }])
        self.assertFalse(second['cleared'])
        self.assertEqual(second['endMs'], 21)
        self.assertEqual(second['monsters'][0]['regainedHp'], 19500)

    def test_does_not_infer_clear_from_zero_hp_without_original_counter(self):
        result = monster_waves(replay(
            (0, SCENE_ATTR, ['monsterWaveCount', 3]),
            (10, CREATE_MONSTER, [1, 2, None, {'id': 1, 'Index': 1, 'IndexCamp': 2}]),
            (11, ENTITY_ATTR, [1, 'hp', 0]),
        ))
        self.assertFalse(result['waves'][0]['cleared'])
