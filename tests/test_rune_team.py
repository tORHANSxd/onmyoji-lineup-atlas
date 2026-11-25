import copy
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from rune_team import battle_spirit, selected_team


def plan():
    hero = {'heroId': '408', 'level': 40, 'star': 6, 'awake': 0, 'skinfo': [[40801, 1]]}
    soul = {'id': 'private-soul', 'slot': 2, 'level': 15, 'quality': 6, 'setId': '涅槃之火',
            'mainAttrType': 'speed', 'mainAttrValue': 57,
            'subAttributes': [{'type': 'attack_rate', 'value': 0.08}, {'type': 'speed', 'value': 3}]}
    return {'onmyoji': {'heroId': 11, 'level': 60, 'star': 6, 'awake': 0, 'skinfo': [[1101, 1]]},
            'members': [{'instanceId': 'private-hero', 'hero': hero, 'souls': [soul]}]}


class SelectedTeamTests(unittest.TestCase):
    def test_battle_spirit_uses_native_spell_ids_and_an_alias(self):
        owned = {'id': 104, 'star': 6, 'lv': 0, 'shiny': True, 'marks': [36, 38, 36], 'uid': 'account-uid'}

        def calculate(row):
            self.assertEqual(row, owned)
            return SimpleNamespace(markSkills=[77835, 77837, 77835], talentSkill=77004, talentSkillLv=1)

        self.assertEqual(battle_spirit(owned, calculate), {
            'uid': 'selected-spirit', 'id': 104, 'star': 6, 'lv': 1, 'shiny': True,
            'marks': [36, 38, 36], 'skill_list': [[77835, 2], [77837, 1], [77004, 1]],
        })

    def test_preserves_reported_stats_and_uses_local_aliases(self):
        raw = plan()
        raw['members'][0]['aiSkill'] = 11
        before = copy.deepcopy(raw)
        actor, fighters, equips, auto_skills = selected_team(raw, {'300006': '涅槃火'})
        self.assertEqual(actor['heroId'], 11)
        self.assertEqual(fighters['member-1']['heroId'], 408)
        self.assertEqual(fighters['member-1']['selectSkills'], [40801])
        self.assertEqual(auto_skills, {'selected-onmyoji': 0, 'member-1': 11})
        self.assertEqual(fighters['member-1']['equips'], ['member-1-soul-2'])
        soul = equips['member-1-soul-2']
        self.assertEqual(soul.suitId, 300006)
        self.assertEqual(soul.getPos(), 1)
        self.assertEqual(soul.single_attr, 0)
        self.assertEqual(soul.baseAttrDict, {'speedAdditionVal': 57})
        self.assertEqual(soul.attrDict, {'speedAdditionVal': 60, 'attackAdditionRate': 0.08})
        self.assertEqual(raw, before)

    def test_rejects_repeated_heroes_and_souls(self):
        raw = plan()
        raw['members'].append(copy.deepcopy(raw['members'][0]))
        with self.assertRaisesRegex(ValueError, 'Shikigami instances'):
            selected_team(raw, {'300006': '涅槃火'})
        raw['members'][1]['instanceId'] = 'different-hero'
        with self.assertRaisesRegex(ValueError, 'Soul slots and instances'):
            selected_team(raw, {'300006': '涅槃火'})

    def test_rejects_unknown_attribute(self):
        raw = plan()
        raw['members'][0]['souls'][0]['subAttributes'][0]['type'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'Unknown soul attribute'):
            selected_team(raw, {'300006': '涅槃火'})
