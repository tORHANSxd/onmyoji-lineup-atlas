import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from rune_replay import (APPEND, BATTLE_ENDED, BATTLE_STARTED, BATTLE_STATE, CREATE_MONSTER, ENTITY_ATTR,
                         FREEZE, PLAY, REMAP, REMOVE, SCENE_ATTR, STOP, UNREMAP, monster_waves,
                         project_playback, sync_windows)


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

    def test_projects_rate_queue_alias_at_clip_start_and_interruption(self):
        result = project_playback(replay(
            (0, PLAY, [1, ['attack', 'tail'], 2]),
            (1, APPEND, [1, 'queued']),
            (2, REMAP, [1, 'tail', 'alternative']),
            (3, PLAY, [2, 'attack']),
            (4, BATTLE_STATE, [BATTLE_STARTED]),
            (8, STOP, [1]),
            (10, REMOVE, [2]),
            (11, BATTLE_ENDED, [1]),
            (12, PLAY, [1, 'missing']),
        ), {'1': 'model', '2': 'model'},
            {'model': {'attack': {'len': 8}, 'alternative': {'len': 6}, 'queued': {'len': 4}}})
        self.assertEqual([(w['entity'], w['clip'], w['startMs'], w['endMs']) for w in result['windows']],
                         [('1', 'attack', 0, 4), ('2', 'attack', 3, 10),
                          ('1', 'alternative', 4, 7), ('1', 'queued', 7, 8)])
        self.assertEqual(result['queuedClipsPlayed'], 2)
        self.assertEqual(result['interruptedClips'], 2)
        self.assertEqual(result['overlapMs'], 5)
        self.assertEqual(result['combatOverlapMs'], 4)
        self.assertEqual(result['combatElapsedMs'], 7)
        self.assertEqual(result['unresolved'], [])

    def test_replacement_loop_and_unobserved_callbacks(self):
        result = project_playback(replay(
            (0, APPEND, [1, 'unknown']),
            (1, PLAY, [1, 'loop', 1, True]),
            (2, APPEND, [1, 'unknown']),
            (4, PLAY, [1, 'attack']),
            (5, FREEZE, [1, 1]),
            (6, PLAY, [1, 'attack']),
            (7, FREEZE, [1, 0]),
            (8, PLAY, [1, 'missing']),
            (9, BATTLE_ENDED, [1]),
        ), {'1': 'model'}, {'model': {'loop': {'len': 1}, 'attack': {'len': 3}}})
        self.assertEqual([(w['clip'], w['startMs'], w['endMs'], w['endReason']) for w in result['windows']],
                         [('loop', 1, 4, 'replaced'), ('attack', 4, 5, 'frozen')])
        self.assertEqual(result['appendWithoutAction'], 1)
        self.assertEqual([r['reason'] for r in result['unresolved']],
                         ['unobserved-append', 'frozen', 'frozen-action', 'missing-clip'])
        self.assertIsNone(result['combatElapsedMs'])


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
