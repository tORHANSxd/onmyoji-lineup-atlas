import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from dungeon_encounters import encounter_index
from dungeon_battle_routes import bind_scene_engines, registered_team_symbols
from gtw_boss_stage import GTW_SHARED_MAX_HP, valid_gtw_settings
from map_boss_stage import (LBS_ACTIVITY_MODE, LBS_MODE, MEITUAN_ENTRIES, MEITUAN_MODE, MODE, NIAN_ENTRIES,
                            NIAN_MODE, SEAL_MODE, SPECIAL_NIAN_MODE, entry_for_stage, party_positions)


class EncounterIndexTests(unittest.TestCase):
    def test_four_seasons_links_stage_roster_rules_rewards_and_color_result(self):
        tables = {
            "activity": [[8772, {"id": 8772, "name": "四时序战"}]],
            "social_play_stage": [[28, {"id": 28, "day": 7, "level": 4, "stage_id": 310028, "first_reward": 150174}]],
            "social_play_color": [[1, {"id": 1, "c_id": 1401135}], [4, {"id": 4, "c_id": 0}]],
            "social_play_color_recipe": [[4, {"id": 4, "config_id": 1, "recipe": [1, 1, 1], "reward_id": 150104}]],
            "pve_stage_data": [["310028", {"id": "310028", "groupid": 310028}]],
            "BattleMonstersInfo": [[310028, {"ID": 310028, "resindex": 310001}]],
            "Combinesceneinfo": [[310001, {"id": 310001, "battlesceneinfo": 406}]],
            "BattleScenesInfo": [[406, {"id": 406}]],
            "battle_mode_routes": [[938, {"battleMode": 938, "scene_engine": "SocialTeamBattleEngine"}]],
            "normal_battle_config": [[938, {"battleMode": 938, "halt_time": 180}]],
            "system_rule_dsc": [["sishixuzhan_tips", {"rule_dsc": "四时序战活动规则"}]],
            "currency": [[1401145, {"id": 1401145}], [1401135, {"id": 1401135}]],
            "reward": [[150174, {"id": 150174}], [150104, {"id": 150104}]],
            "buff": [[{"$tuple": [120004, 1]}, {"name": "双人组队增益"}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "event",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        result = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        indexed = {(row["table"], row["key"]): row for row in result["entries"]}

        def refs(table, key):
            return [(ref["table"], ref["key"], ref["label"]) for ref in indexed[table, key]["refs"] if ref["found"]]

        stage = refs("social_play_stage", 28)
        self.assertIn(("activity", 8772, "四时序战活动时间"), stage)
        self.assertIn(("BattleMonstersInfo", 310028, "敌方编组"), stage)
        self.assertIn(("normal_battle_config", 938, "原版战斗时限与选角规则"), stage)
        self.assertIn(("BattleScenesInfo", 406, "双方战斗站位"), stage)
        self.assertIn(("reward", 150174, "首通奖励"), stage)
        self.assertIn(("buff", {"$tuple": [120004, 1]}, "2 人组队增益"), stage)
        self.assertIn(("system_rule_dsc", "sishixuzhan_tips", "解锁、组队、调色与成就规则"), stage)
        self.assertIn(("social_play_stage", 28, "第 7 日第 4 关"), refs("activity", 8772))
        self.assertIn(("social_play_stage", 28, "活动战役入口"), refs("pve_stage_data", "310028"))
        recipe = refs("social_play_color_recipe", 4)
        self.assertIn(("social_play_color", 4, "混合所得颜色"), recipe)
        self.assertIn(("social_play_color", 1, "所需颜色"), recipe)

    def test_juelie_hunt_floor_and_story_battle_keep_their_own_entry_points(self):
        tables = {
            "activity": [[8884, {"id": 8884}], [8778, {"id": 8778}]],
            "activity_tower_act": [[8884, {"act_id": 8884, "act_ticket_cid": 1464013}]],
            "activity_tower_floor": [[50, {"act_id": 8884, "battle_id": 814000, "act_ticket_reward": 20232002}]],
            "run_group_module": [[1, {"id": 1, "module_name": "乱鬼城", "start_event_id": 2}]],
            "run_group_event": [[2, {"id": 2, "group_id": 1, "event_title": "迎战妖鬼", "event_type": 2, "battle_id": 812101,
                                      "next_event_id": [11]}],
                                [11, {"id": 11, "group_id": 1, "event_title": "压制妖鬼", "event_type": 4, "battle_id": 812000}]],
            "battle_mode_routes": [[mode, {"battleMode": mode, "scene_engine": "SpGtwNormalEngine",
                                            "mode_symbol": f"MODE_SPGTW_{symbol}"}]
                                   for mode, symbol in ((933, "NORMAL"), (935, "BARRIER_END"), (936, "EASY"))],
            "normal_battle_config": [[mode, {"battleMode": mode, "halt_time": 3600}] for mode in (933, 935, 936)],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}]
                               for stage in (812000, 812100, 812101, 814000)],
            "BattleMonstersInfo": [[stage, {"ID": stage, "resindex": 44136}] for stage in (812000, 812100, 812101, 814000)],
            "Combinesceneinfo": [[44136, {"id": 44136}]],
            "currency": [[1464013, {"name": "狩猎封符"}]],
            "reward": [[20232002, {"id": 20232002}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "event",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        result = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        indexed = {(row["table"], row["key"]): row for row in result["entries"]}

        def refs(table, key):
            return {(ref["table"], ref["key"]) for ref in indexed[table, key]["refs"] if ref["found"]}

        self.assertIn(("battle_mode_routes", 936), refs("activity_tower_floor", 50))
        self.assertIn(("reward", 20232002), refs("activity_tower_floor", 50))
        self.assertIn(("currency", 1464013), refs("activity_tower_act", 8884))
        self.assertIn(("run_group_event", 11), refs("run_group_event", 2))
        self.assertIn(("battle_mode_routes", 933), refs("run_group_event", 2))
        self.assertIn(("battle_mode_routes", 935), refs("run_group_event", 11))
        self.assertIn(("run_group_event", 2), refs("pve_stage_data", "812101"))
        self.assertIn("未关联事件", indexed["pve_stage_data", "812100"]["title"])
        self.assertNotIn(("run_group_event", 2), refs("pve_stage_data", "812100"))

    def test_juelie_boss_links_each_phase_to_shared_progress_and_matching_rules(self):
        tables = {
            "stake_boss": [[2, {"boss_id": 2, "battle_id": 813000, "progress_id": 7}]],
            "global_progress": [[7, {"unlock_num": GTW_SHARED_MAX_HP}]],
            "activity": [[8881, {"id": 8881}]],
            "battle_mode_routes": [[934, {"battleMode": 934, "mode_symbol": "MODE_SPGTW_BOSS", "scene_engine": "SpGtwBossEngine"}]],
            "normal_battle_config": [[934, {"battleMode": 934, "halt_time": 180}]],
            "normal_battle_constant": [[40, {"value": [50]}], [41, {"value": [813001]}]],
            "run_group_const": [[13, {"value": [46101]}], [14, {"value": [46201]}]],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}] for stage in (813000, 813001)],
            "BattleMonstersInfo": [[stage, {"ID": stage, "resindex": 44135}] for stage in (813000, 813001)],
            "Combinesceneinfo": [[44135, {"id": 44135}]],
            "system_rule_dsc": [["spgtw_boss_tips", {"rule_dsc": "两段限时伤害"}]],
            "sp_dashe_accumulate": [[{"$tuple": [61, 1]}, {"uid": 9, "accumulate": 40000000}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "event",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        result = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        indexed = {(row["table"], row["key"]): row for row in result["entries"]}

        def refs(table, key):
            return [(ref["table"], ref["key"]) for ref in indexed[table, key]["refs"] if ref["found"]]

        both_phases = [("pve_stage_data", "813000"), ("pve_stage_data", "813001")]
        for key in both_phases:
            self.assertEqual(indexed[key]["family"], "event")
            self.assertIn(("global_progress", 7), refs(*key))
            self.assertIn(("system_rule_dsc", "spgtw_boss_tips"), refs(*key))
        self.assertTrue(all(phase in refs("stake_boss", 2) for phase in both_phases))
        self.assertIn(("run_group_const", 13), refs(*both_phases[0]))
        self.assertNotIn(("run_group_const", 13), refs(*both_phases[1]))
        self.assertIn(("run_group_const", 14), refs(*both_phases[1]))
        self.assertIn(("sp_dashe_accumulate", {"$tuple": [61, 1]}), refs("stake_boss", 2))

    def test_juelie_replay_bounds_use_shared_health_and_original_clock(self):
        half = GTW_SHARED_MAX_HP // 2
        self.assertTrue(valid_gtw_settings(813000, {"hp": half, "windowSeconds": 180}))
        self.assertFalse(valid_gtw_settings(813001, {"hp": half, "windowSeconds": 180}))
        self.assertTrue(valid_gtw_settings(813001, {"hp": half - 1, "windowSeconds": 1}))
        self.assertFalse(valid_gtw_settings(813000, {"hp": half - 1, "windowSeconds": 180}))
        self.assertFalse(valid_gtw_settings(813000, {"hp": None, "windowSeconds": 181}))

    def test_shiki_boss_plot_and_score_rows_keep_separate_rules(self):
        tables = {
            "shiki_boss": [[2, {"level_id": 2, "level_name": "双神立", "boss_type": 1, "battle_id": 505103}],
                           [5, {"level_id": 5, "level_name": "双神立", "boss_type": 2, "battle_id": 505104}],
                           [3, {"level_id": 3, "level_name": "四季生", "boss_type": 1, "battle_id": 505105}]],
            "activity": [[8051, {"id": 8051, "name": "化四季"}]],
            "battle_mode_routes": [[926, {"battleMode": 926, "mode_symbol": "MODE_JI_BOSS_BATTLE",
                                         "scene_engine": "JiBossEngine"}]],
            "normal_battle_config": [[926, {"battleMode": 926, "halt_time": 300}]],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}] for stage in range(505103, 505106)],
            "BattleMonstersInfo": [[stage, {"ID": stage, "resindex": 128}] for stage in range(505103, 505106)],
            "Combinesceneinfo": [[128, {"id": 128}]],
            "normal_battle_constant": [[key, {"value": [value]}] for key, value in ((35, 101), (36, 4852019), (37, 19), (38, 300))],
            "normal_battle_yys_replace": [[19, {"yys_id": 1805}]],
            "ji_constant": [[39, {"value": [81101]}]],
            "reward": [[81101, {"id": 81101}]],
            "system_rule_dsc": [[key, {"rule_dsc": "章节玩法"}] for key in
                                ("shuangshenlijuqing_tips", "shuangshenlituizhi_tips", "sijishengjuqing_tips")],
        }
        manifests = [{"name": name, "status": "decoded", "family": "event",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        data = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(row["table"], row["key"]): row for row in data["entries"]}

        def refs(table, key):
            return {(ref["table"], ref["key"]) for ref in entries[table, key]["refs"] if ref["found"]}

        story, score = refs("shiki_boss", 2), refs("pve_stage_data", "505104")
        self.assertIn(("system_rule_dsc", "shuangshenlijuqing_tips"), story)
        self.assertIn(("normal_battle_yys_replace", 19), story)
        self.assertIn(("BattleMonstersInfo", 505103), story)
        self.assertIn(("system_rule_dsc", "shuangshenlituizhi_tips"), score)
        self.assertNotIn(("normal_battle_yys_replace", 19), score)
        self.assertIn(("normal_battle_config", 926), score)
        self.assertIn(("reward", 81101), score)
        self.assertIn(("normal_battle_constant", 38), refs("shiki_boss", 3))
        self.assertIn(("shiki_boss", 5), refs("activity", 8051))
        self.assertIn("双神立 · 退治", entries["pve_stage_data", "505104"]["title"])

    def test_shanfeng_trials_and_scoring_variants_use_the_original_activity_route(self):
        trials = {1: {"title": "软弱之缚", "type": 1, "battle_id": "3340001", "skill_id": 62000},
                  2: {"title": "软弱之缚", "type": 1, "battle_id": "3340002", "skill_id": 62000, "pre_id": 1},
                  17: {"title": "成王day1-3", "type": 5, "final_battle_id_day1": ["3340017", "3340018"],
                       "final_battle_id_day2": ["3340019", "3340020"], "final_battle_id_day3": ["3340021", "3340022"]}}
        stages = (3340001, 3340002, *range(3340017, 3340023))
        tables = {
            "super_ghost6_pve": [[key, {"id": key, **row}] for key, row in trials.items()],
            "battle_mode_routes": [[660, {"battleMode": 660, "mode_symbol": "MODE_SUPER_GHOST_SHAN_FENG_HARD",
                                         "scene_engine": "SpShanFengHardEngine"}]],
            "battle_team_routes": [[660, {"battleMode": 660, "can_single_fight": True}]],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}] for stage in stages],
            "BattleMonstersInfo": [[stage, {"ID": stage}] for stage in stages],
            "Combinesceneinfo": [[11032, {"id": 11032}]],
            "activity": [[1757, {"id": 1757}]],
            "super_ghost6_constant": [[key, {"value": [1]}] for key in (5, 6, 7, 10, 11, 16, 17, 18)],
            "super_ghost6_pve_reward": [[1, {"damage": [200000]}], [2, {"damage": [10, 100]}]],
            "system_rule_dsc": [["spshanfeng_ghost_pve", {"rule_dsc": "历练清场，成王计分"}]],
            "skill": [[{"$tuple": [62000, level, -1]}, {"desc": "历练机制"}] for level in (1, 2)],
        }
        manifests = [{"name": name, "status": "decoded", "family": "event",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(row["table"], row["key"]): row for row in index["entries"]}

        def refs(table, key):
            return [(ref["table"], ref["key"]) for ref in entries[table, key]["refs"] if ref["found"]]

        self.assertIn(("super_ghost6_pve", 1), refs("super_ghost6_pve", 2))
        self.assertIn(("skill", {"$tuple": [62000, 2, -1]}), refs("super_ghost6_pve", 2))
        self.assertIn(("super_ghost6_constant", 16), refs("pve_stage_data", "3340002"))
        self.assertIn(("BattleMonstersInfo", 3340002), refs("super_ghost6_pve", 2))
        self.assertIn(("battle_team_routes", 660), refs("pve_stage_data", "3340021"))
        self.assertIn(("system_rule_dsc", "spshanfeng_ghost_pve"), refs("pve_stage_data", "3340021"))
        self.assertEqual([int(key) for table, key in refs("super_ghost6_pve", 17) if table == "pve_stage_data"],
                         list(range(3340017, 3340023)))
        self.assertIn(("super_ghost6_constant", 6), refs("pve_stage_data", "3340019"))
        self.assertNotIn(("super_ghost6_constant", 5), refs("pve_stage_data", "3340019"))
        self.assertIn(("super_ghost6_constant", 5), refs("pve_stage_data", "3340021"))
        self.assertIn(("super_ghost6_pve_reward", 1), refs("pve_stage_data", "3340021"))
        self.assertIn(("super_ghost6_pve", 17), refs("activity", 1757))
        self.assertIn("成王 · 第 3 日", entries["pve_stage_data", "3340021"]["title"])
        unresolved = [(row["table"], row["key"], ref["table"], ref["key"]) for row in index["entries"]
                      for ref in row["refs"] if not ref["found"]]
        self.assertFalse(unresolved)

    def test_dojo_guardian_and_defender_modes_keep_their_own_rules(self):
        tables = {
            "battle_mode_routes": [[4003, {"battleMode": 4003, "mode_symbol": "MODE_JIEJIE_TUPO_GYM2",
                                           "scene_engine": "JiejieTuPoGym2Scene"}],
                                   [4004, {"battleMode": 4004, "mode_symbol": "MODE_JIEJIE_TUPO_GYM2_BOSS",
                                           "scene_engine": "JiejieTuPoGym2BossScene"}]],
            "pve_stage_data": [["40051", {"id": "40051", "name": "道馆守护·神龙", "groupid": 40051}]],
            "BattleMonstersInfo": [[40051, {"ID": 40051, "resindex": 40051}]],
            "Combinesceneinfo": [[100, {"id": 100, "battlesceneinfo": 402}]],
            "BattleScenesInfo": [[402, {"ID": 402}]],
            "Constant": [[3750, {"value": [40]}], [3762, {"value": [30]}], [3793, {"value": [4]}]],
            "team_assist_stage": [[10020203, {"name": "道馆"}]],
            "dg_guardian": [[1, {"monster_hp_delta": [3600, 4200, 3600, 500]}]],
            "dg_timer_buff": [[12, {"atk_buffs": [[60, 2]]}]],
            "dg_flaglevel_new": [[1, {"referee_speed": 90}]],
            "languageDataEx": [["dg_tips_58", {"cn": "已击败式神不再出现"}]],
            "system_rule_dsc": [["daoguanzhenrongyushe_tips", {"rule_dsc": "道馆备选阵容"}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, lambda name: tables[name])
        entries = {(row["table"], str(row["key"])): row for row in index["entries"]}
        defense = entries["battle_mode_routes", "4003"]
        guardians = entries["battle_mode_routes", "4004"]
        stage = entries["pve_stage_data", "40051"]
        for row in (defense, guardians, stage):
            self.assertEqual(row["family"], "guild")
        self.assertIn(("dg_timer_buff", 12), {(ref["table"], ref["key"]) for ref in defense["refs"]})
        self.assertIn(("dg_flaglevel_new", 1), {(ref["table"], ref["key"]) for ref in defense["refs"]})
        self.assertIn(("Combinesceneinfo", 100), {(ref["table"], ref["key"]) for ref in defense["refs"]})
        self.assertIn(("BattleScenesInfo", 402), {(ref["table"], ref["key"]) for ref in defense["refs"]})
        self.assertIn(("pve_stage_data", "40051"), {(ref["table"], str(ref["key"])) for ref in guardians["refs"]})
        refs = {(ref["table"], ref["key"]) for ref in stage["refs"]}
        self.assertIn(("battle_mode_routes", 4004), refs)
        self.assertIn(("Constant", 3750), refs)
        self.assertNotIn(("Constant", 3762), refs)

    def test_breakthrough_modes_link_their_own_rules_without_a_fixed_pve_formation(self):
        tables = {
            "battle_mode_routes": [[4000, {"battleMode": 4000, "mode_symbol": "MODE_JIEJIE_TUPO_SINGLE",
                                           "scene_engine": "JiejieTuPoSingleEngine"}],
                                   [4001, {"battleMode": 4001, "mode_symbol": "MODE_JIEJIE_TUPO_GUILD",
                                           "scene_engine": "JiejieTuPoGuildEngine"}]],
            "system_rule_dsc": [["jiejietupo_tips", {"rule_dsc": "个人结界突破"}]],
            "team_assist_stage": [[10020201, {"id": 10020201, "ss_num": 5, "yys_num": 1}]],
            "Combinesceneinfo": [[100, {"id": 100, "battlesceneinfo": 402}]],
            "BattleScenesInfo": [[402, {"id": 402}]],
            "Constant": [[2065, {"id": 2065, "value": [1]}]],
            "dg_flaglevel": [[8, {"level": 60, "referee_speed": 130}]],
            "dg_flagmodify": [[30, {"dmg_add": 10}]],
            "currency": [[900024, {"name": "结界挑战券"}], [900016, {"name": "勋章"}], [900017, {"name": "阴阳寮勋章"}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, lambda name: tables[name])
        entries = {row["key"]: row for row in index["entries"] if row["table"] == "battle_mode_routes"}
        self.assertEqual((entries[4000]["family"], entries[4000]["title"]), ("daily", "个人结界突破"))
        self.assertEqual((entries[4001]["family"], entries[4001]["title"]), ("guild", "阴阳寮结界突破"))
        shared = {("system_rule_dsc", "jiejietupo_tips"), ("team_assist_stage", 10020201),
                  ("Combinesceneinfo", 100), ("BattleScenesInfo", 402)}
        personal = {("Constant", 2065), ("dg_flaglevel", 8), ("dg_flagmodify", 30),
                    ("currency", 900016), ("currency", 900024)}
        self.assertEqual({(ref["table"], ref["key"]) for ref in entries[4000]["refs"]}, shared | personal)
        self.assertEqual({(ref["table"], ref["key"]) for ref in entries[4001]["refs"]}, shared | {("currency", 900017)})

    def test_asura_depth_links_each_tile_by_play_type_and_keeps_donation_out_of_battle(self):
        tables = {
            "asura_map": [[42, {"id": 42, "activity_id": 7080, "work": 20001, "event": 40001, "rely": [43]}],
                         [43, {"id": 43, "activity_id": 7080, "work": 40001, "event": 30100}]],
            "asura_play_type2": [[20001, {"id": 20001, "battle_id": 602007}]],
            "asura_play_type4": [[40001, {"id": 40001, "need": 12000000}]],
            "asura_event_type4": [[40001, {"id": 40001, "name": "凝罪塔"}]],
            "asura_guilty_tower": [[7080, {"activity_id": 7080, "title": "八火狱"}]],
            "asura_const": [[13, {"value": [240]}]],
            "battle_team_routes": [[186, {"battleMode": 3341}]],
            "pve_stage_data": [["602007", {"id": "602007", "groupid": 602007}]],
            "BattleMonstersInfo": [[602007, {"resindex": 42117}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        rows = {(row["table"], row["key"]): row for row in catalog["entries"]}

        def refs(table, key):
            return {(ref["table"], ref["key"]) for ref in rows[table, key]["refs"]}

        self.assertEqual(rows["asura_map", 42]["title"], "天魔归来 · 八火狱 · 深渊地格 42 · 凝罪塔")
        self.assertTrue({("asura_event_type4", 40001), ("asura_map", 43), ("asura_play_type2", 20001),
                         ("pve_stage_data", "602007"), ("battle_team_routes", 186)}.issubset(refs("asura_map", 42)))
        self.assertIn(("asura_play_type4", 40001), refs("asura_map", 43))
        self.assertNotIn(("pve_stage_data", "602007"), refs("asura_map", 43))
        self.assertIn(("asura_map", 42), refs("asura_play_type2", 20001))
        self.assertIn(("asura_play_type2", 20001), refs("pve_stage_data", "602007"))

    def test_asura_phase_two_uses_different_original_entrances_for_score_and_towers(self):
        tables = {
            "activity": [[7041, {"id": 7041, "name": "第二阶段"}]],
            "asura_p2_config": [[1, {"id": 1, "title": "圣帝·恶", "battle_id": 602002}],
                               [7, {"id": 7, "title": "终末之战", "battle_id": 602000}]],
            "pve_stage_data": [["602002", {"id": "602002", "groupid": 602002}],
                               ["602000", {"id": "602000", "groupid": 602000}]],
            "BattleMonstersInfo": [[602002, {"resindex": 42118}], [602000, {"resindex": 42134}]],
            "battle_team_routes": [[188, {"battleMode": 3342}], [189, {"battleMode": 3344}]],
            "asura_const": [[14, {"value": [240]}], [21, {"value": [500]}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(row["table"], row["key"]): row for row in catalog["entries"]}

        def references(table, key):
            return {(ref["table"], ref["key"]) for ref in entries[table, key]["refs"]}

        self.assertIn(("battle_team_routes", 189), references("asura_p2_config", 1))
        self.assertNotIn(("asura_const", 14), references("asura_p2_config", 1))
        self.assertIn(("battle_team_routes", 188), references("asura_p2_config", 7))
        self.assertIn(("asura_const", 14), references("asura_p2_config", 7))
        self.assertIn(("asura_p2_config", 7), references("pve_stage_data", "602000"))
        self.assertIn(("asura_p2_config", 1), references("activity", 7041))

    def test_dream_trials_link_fixed_roster_and_activity_without_matching_by_display_name(self):
        tables = {
            "activity": [[11721, {"id": 11721, "name": "QQ人睡眠活动-活动时间"}]],
            "battle_mode_routes": [[9606, {"mode_symbol": "MODE_DREAM_ACT_SELF_BATTLE", "scene_engine": "DreamSelfBattleEngine"}]],
            "dream_act_hero": [[592, {"id": 592, "name": "平将门", "nightmare_name": "无趣梦", "battle_id": 34266}]],
            "dream_act_stage": [[{"$tuple": [592, 1]}, {"hero_id": 592, "stage": 1}]],
            "dream_act_battle_cond": [[34266, {"cond_type": 2, "param1": 7}]],
            "pve_stage_data": [["34266", {"id": "34266", "groupid": 34266, "isplot": 1}],
                               ["34276", {"id": "34276", "name": "QQ人睡眠活动"}]],
            "DramaHeroInfo": [["34266", {"heroIds": [[60592, 40, 6, 1, 0]]}]],
            "BattleMonstersInfo": [[34266, {"resindex": 49017}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(row["table"], row["key"]): row for row in catalog["entries"]}

        def references(table, key):
            return [(ref["table"], ref["key"]) for ref in entries[table, key]["refs"]]

        self.assertEqual(entries["dream_act_hero", 592]["title"], "幻游问梦 · 平将门 · 无趣梦")
        self.assertIn(("dream_act_hero", 592), references("activity", 11721))
        self.assertIn(("dream_act_hero", 592), references("pve_stage_data", "34266"))
        self.assertNotIn(("dream_act_hero", 592), references("pve_stage_data", "34276"))
        self.assertIn(("DramaHeroInfo", "34266"), references("dream_act_hero", 592))
        self.assertIn(("dream_act_stage", {"$tuple": [592, 1]}), references("dream_act_hero", 592))

    def test_guild_dinner_indexes_preparation_and_links_only_matching_battle_examples(self):
        tables = {
            "battle_mode_routes": [[312, {"mode_symbol": "MODE_GUILD_DINNER", "scene_class": "GuildDinnerScene"}]],
            "system_rule_dsc": [["guild_yanhuitip1", {"rule_dsc": "宴会料理"}]],
            "guild_dinner": [[1001, {"food_name": "饭团", "food_lv": 1, "reward_id": 1,
                                      "food_material": {"$mapping": [[214, [6]]]}}],
                             [1002, {"food_name": "饭团", "food_lv": 2, "reward_id": 1,
                                      "dinner_unlock_pre_cond": [1001], "food_material": {"$mapping": [[214, [10]]]}}],
                             [10001, {"food_name": "四周年蛋糕", "food_lv": 4, "reward_id": 1,
                                       "food_material": {"$mapping": [[0, [0]]]}}]],
            "guild_dinner_monster": [[214, {"id": 214, "name": "饿鬼"}]],
            "reward": [[1, {"ssexp": 2560}]],
            "story_room": [[907, {"MonsterID": 30990}]],
            "pve_stage_data": [["30990", {"groupid": 30990}]],
            "BattleMonstersInfo": [[30990, {"MonstersInfos": [[[1, 13214, 40, 1, 0]]]}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]

        def load_entries():
            catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
            return {(entry["table"], entry["key"]): entry for entry in catalog["entries"]}

        def refs(entry):
            return {(ref["table"], ref["key"]) for ref in entry["refs"]}

        entries = load_entries()
        route = entries["battle_mode_routes", 312]
        self.assertEqual(route["family"], "guild")
        self.assertEqual(refs(route), {("guild_dinner_monster", 214), ("system_rule_dsc", "guild_yanhuitip1")})
        self.assertEqual(refs(entries["guild_dinner", 1002]), {("guild_dinner", 1001), ("reward", 1),
                                                                  ("guild_dinner_monster", 214), ("battle_mode_routes", 312)})
        self.assertEqual(refs(entries["guild_dinner", 10001]), {("reward", 1), ("battle_mode_routes", 312)})
        self.assertNotIn(("story_room", 907), refs(entries["guild_dinner_monster", 214]))
        tables["BattleMonstersInfo"][0][1]["MonstersInfos"][0].append([2, 214, 40, 1, 0])
        self.assertIn(("story_room", 907), refs(load_entries()["guild_dinner_monster", 214]))

    def test_tianfa_difficulty_links_original_stage_formation_and_lineup_code(self):
        tables = {
            "xinghen_battle": [[2, {"difficulty": 2, "name": "困难", "stage_id": 2716062}]],
            "xinghen_ui": [[2, {"title": "彼世逢魔"}]],
            "pve_stage_data": [["2716062", {"id": "2716062", "groupid": 2716062}]],
            "BattleMonstersInfo": [[2716062, {"resindex": 2735048}]],
            "Combinesceneinfo": [[2735048, {}]],
            "team_assist_stage": [[100969, {"ss_num": 6}]],
            "normal_battle_config": [[2600, {"battleMode": 2600}]],
            "battle_team_routes": [[3600, {"battleMode": 2600}]],
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
            ("battle_team_routes", 3600),
        })
        self.assertIn(("xinghen_battle", 2), {(ref["table"], ref["key"]) for ref in entries["pve_stage_data"]["refs"]})

    def test_tianfa_team_menu_links_actual_difficulties_and_preserves_preview_stage(self):
        stages = (2716061, 2716062, 2716063, 594011)
        tables = {
            "act_team_battle": [[57, {"id": 57, "title_name": "彼世逢魔", "battle_id": 594011,
                                      "team_battle_type": 3600, "act_id": 11696, "team_player_num": 3}]],
            "activity": [[11696, {}]],
            "battle_team_routes": [[3600, {"battleMode": 2600}]],
            "xinghen_battle": [[difficulty, {"id": difficulty, "difficulty": difficulty, "stage_id": stage}]
                               for difficulty, stage in enumerate(stages[:3], 1)],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}] for stage in stages],
            "BattleMonstersInfo": [[stage, {"resindex": 40061 if stage == 594011 else 2735048}] for stage in stages],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle",
                      "fields": sorted({field for _, row in rows for field in row})} for name, rows in tables.items()]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], str(entry["key"])): entry for entry in catalog["entries"]}
        for table, key in (("act_team_battle", "57"), ("pve_stage_data", "594011")):
            refs = entries[table, key]["refs"]
            self.assertEqual([ref["key"] for ref in refs if ref["table"] == "xinghen_battle"], [1, 2, 3])
        self.assertIn(("pve_stage_data", "594011"),
                      {(ref["table"], ref["key"]) for ref in entries["act_team_battle", "57"]["refs"]})

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

    def test_ordinary_lbs_boss_keeps_activity_entry_and_solo_positions_distinct(self):
        bosses = {
            25: {"id": 25, "name": "桃花妖", "type": 2, "gk_list": [[10600, 10]]},
            1001: {"id": 1001, "name": "桃花妖", "type": 4, "gk_list": [[10600, 10], [10601, 15]]},
        }
        tables = {
            "map_boss": list(bosses.items()),
            "battle_mode_routes": [[LBS_MODE, {"mode_symbol": "MODE_LBS_BOSS", "scene_engine": "LBSBossEngine"}]],
            "pve_stage_data": [["10600", {"id": "10600", "groupid": 10600}]],
            "BattleMonstersInfo": [[10600, {"resindex": 39}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily", "fields": []} for name in tables]
        catalog = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {entry["key"]: entry for entry in catalog["entries"] if entry["table"] == "map_boss"}
        self.assertEqual(entries[25]["title"], "现世鬼王 · 桃花妖")
        self.assertIn(LBS_MODE, [ref["key"] for ref in entries[25]["refs"] if ref["table"] == "battle_mode_routes"])
        self.assertEqual(entries[1001]["kind"], "地图首领入口")
        self.assertFalse(any(ref["table"] == "battle_mode_routes" for ref in entries[1001]["refs"]))
        self.assertEqual(entry_for_stage(bosses, 10600, LBS_MODE), ("lbs", None, 39, None, 10))
        self.assertIsNone(entry_for_stage(bosses, 10601, LBS_MODE))
        self.assertEqual(party_positions(LBS_MODE, 1), ((2, 3, 4),))
        self.assertIsNone(party_positions(MODE, 1))

    def test_lbs_activity_connects_the_matching_site_rules_passive_and_lineup_code(self):
        boss = {"id": 19042, "type": 58, "name": "LBS策划鼠鬼王", "gk_list": [[200180, 10]]}
        site = {"act_id": 15037, "mapbossid": 19042}
        rules = ["鼠鼠活动", "鼠鼠商店", "鼠鼠赠送"]
        tables = {
            "map_boss": [[19042, boss]],
            "activity_lbs_intro": [[52, {"act_type": 58, "activity_id": 15037, "ui": ["window", "csd", *rules]}]],
            "activity_offline_lbs_mass": [[408, site]],
            "activity": [[15037, {}]],
            "system_rule_dsc": [[key, {"rule_dsc": key}] for key in rules],
            "battle_mode_routes": [[LBS_ACTIVITY_MODE, {"mode_symbol": "MODE_LBS_ACTIVITY_BOSS_NEW",
                                                       "scene_engine": "LBSActivityBossEngine"}]],
            "team_assist_stage": [[101006, {}]],
            "pve_stage_data": [["200180", {"id": "200180", "groupid": 200180}]],
            "BattleMonstersInfo": [[200180, {"resindex": 233}]],
            "skill": [[{"$tuple": [skill, 1, -1]}, {}] for skill in range(101010, 101014)],
        }
        manifests = [{"name": name, "status": "decoded", "family": "daily", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entry = next(entry for entry in index["entries"] if entry["table"] == "map_boss")
        self.assertEqual((entry["family"], entry["title"]), ("event", "现世妖约 · 广州塔策划鼠"))
        self.assertEqual([ref["key"] for ref in entry["refs"][:8]], [52, 408, 15037, *rules, LBS_ACTIVITY_MODE, 101006])
        self.assertIn({"$tuple": [101013, 1, -1]}, [ref["key"] for ref in entry["refs"]])
        self.assertEqual(entry_for_stage({19042: boss}, 200180, LBS_ACTIVITY_MODE), ("lbsActivity", None, 233, None, 10))
        self.assertIsNone(entry_for_stage({19042: boss}, 200180, LBS_MODE))
        self.assertEqual(party_positions(LBS_ACTIVITY_MODE, 1), ((2, 3, 4, 5, 6),))

    def test_lbs_nian_keeps_separate_regional_and_special_routes(self):
        ordinary, special = 3340141, 3340150
        bosses = {key: {"id": key, "name": "区域年兽", "type": 36, "gk_list": [[ordinary, 10]]}
                  for key in NIAN_ENTRIES}
        tables = {
            "map_boss": list(bosses.items()),
            "activity": [[774, {}]],
            "activity_offline_lbs_mass": [[site, {"mapbossid": key}] for key, site in NIAN_ENTRIES.items()],
            "system_rule_dsc": [["xianshi_nianshou_activity_tips", {"rule_dsc": "召唤规则"}]],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}] for stage in (ordinary, special)],
            "BattleMonstersInfo": [[stage, {"resindex": 40061}] for stage in (ordinary, special)],
            "battle_mode_routes": [[534, {}], [535, {}]],
            "battle_team_routes": [[664, {"battleMode": 534}], [665, {"battleMode": 535}]],
            "monster": [[100032, {}]],
            "skill": [[{"$tuple": [62050, 1, -1]}, {}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], str(entry["key"])): entry for entry in index["entries"]}
        regional_entry = entries["map_boss", "19015"]
        special_entry = entries["pve_stage_data", str(special)]
        self.assertEqual((regional_entry["family"], regional_entry["kind"]), ("event", "现世年兽"))
        self.assertEqual(special_entry["title"], "专属年兽 · 第 1 档")
        self.assertIn(("activity_offline_lbs_mass", 238), {(ref["table"], ref["key"]) for ref in regional_entry["refs"]
                                                          if ref["table"] != "skill"})
        self.assertIn(665, [ref["key"] for ref in special_entry["refs"]])
        self.assertNotIn(664, [ref["key"] for ref in special_entry["refs"]])
        self.assertEqual(entry_for_stage(bosses, ordinary, NIAN_MODE), ("lbsNianNormal", None, 40061, 100031, 10))
        self.assertEqual(entry_for_stage(bosses, special, SPECIAL_NIAN_MODE), ("lbsNianSpecial", None, 40061, 100031, 1))
        self.assertIsNone(entry_for_stage(bosses, special, NIAN_MODE))
        self.assertIsNone(party_positions(SPECIAL_NIAN_MODE, 2))

    def test_lbs_history_uses_explicit_activity_and_location_relations(self):
        boss = {"id": 19040, "type": 56, "name": "现世之约LBS鬼王", "gk_list": [[200160, 10]]}
        tables = {
            "map_boss": [[19040, boss]],
            "activity_lbs_intro": [[50, {"act_type": 56, "activity_id": 9463, "act_title": "九周年现世之约",
                                        "ui": ["MapCommonLBSBossWindow", "活动规则"]}],
                                   [80, {"act_type": 50, "activity_id": 8008, "act_title": "另一场"}]],
            "activity_offline_lbs_mass": [[406, {"act_id": 9463, "mapbossid": 19040, "shop_name": "活动地点样本"}],
                                          [407, {"act_id": 9463, "mapbossid": 19040, "shop_name": "活动地点样本二"}]],
            "activity": [[9463, {"name": "九周年现世之约"}], [8008, {"name": "另一场"}]],
            "system_rule_dsc": [["活动规则", {"rule_dsc": "原版活动文字"}]],
            "battle_mode_routes": [[LBS_ACTIVITY_MODE, {}]],
            "pve_stage_data": [[200160, {"id": "200160", "groupid": 200160}]],
            "BattleMonstersInfo": [[200160, {"resindex": 39}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in index["entries"]}
        root = entries["map_boss", 19040]
        self.assertEqual(root["kind"], "历史现世妖约")
        self.assertEqual([r["key"] for r in root["refs"] if r["table"] == "activity"], [9463])
        self.assertEqual([r["key"] for r in root["refs"] if r["table"] == "activity_offline_lbs_mass"], [406])
        site = entries["activity_offline_lbs_mass", 407]
        self.assertIn("九周年现世之约", site["title"])
        self.assertIn(19040, [r["key"] for r in site["refs"]])
        self.assertEqual(entry_for_stage({19040: boss}, 200160, LBS_ACTIVITY_MODE), ("lbsHistory", None, 39, None, 10))
        self.assertIsNone(entry_for_stage({19040: boss}, 200160, LBS_MODE))

    def test_lbs_variants_keep_original_scenes_and_link_separate_event_rules(self):
        rows = {entry: {"id": entry, "type": kind, "name": "联动鬼王", "gk_list": [[stage, 10]]}
                for entry, kind, stage in ((19007, 48, 19300), (19028, 47, 20080),
                                           (19030, 50, 20090), (19039, 55, 200150))}
        tables = {
            "map_boss": list(rows.items()),
            "battle_mode_routes": [[LBS_ACTIVITY_MODE, {}], [595, {}]],
            "currency": [[1433006, {"name": "融创挑战券"}], [1460317, {"name": "抖音挑战物品"}]],
            "system_rule_dsc": [[key, {"rule_dsc": key}] for key in ("rongchuang_ski_tips", "LBS_douyin2023")],
        }
        manifest = [{"name": name, "status": "decoded", "family": "battle", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifest}, tables.__getitem__)
        cases = {entry["key"]: entry for entry in index["entries"] if entry["table"] == "map_boss"}
        self.assertIn("肯德基", cases[19028]["title"])
        snow = {ref["key"]: ref["label"] for ref in cases[19030]["refs"]}
        self.assertEqual(snow[595], "同活动的滑雪场景")
        self.assertIn(1433006, snow)
        self.assertIn("rongchuang_ski_tips", snow)
        douyin = {ref["key"] for ref in cases[19039]["refs"]}
        self.assertTrue({1460317, "LBS_douyin2023"}.issubset(douyin))
        for stage, scene in ((19300, 40089), (20080, 40056), (20090, 62), (200150, 39)):
            self.assertEqual(entry_for_stage(rows, stage, LBS_ACTIVITY_MODE), ("lbsHistory", None, scene, None, 10))

    def test_meituan_links_shop_locations_to_the_banquet_and_its_special_rules(self):
        stage = 20140
        maps = {key: {"id": key, "name": "联动鬼王", "type": 53, "gk_list": [[stage, 10]]}
                for key in MEITUAN_ENTRIES}
        tables = {
            "map_boss": list(maps.items()),
            "activity_lbs_intro": [[46, {}]],
            "activity": [[7236, {}]],
            "activity_offline_lbs_mass": [[300, {"act_id": 7236, "mapbossid": 19033}],
                                          [301, {"act_id": 7236, "mapbossid": 19034}],
                                          [302, {"act_id": 7016, "mapbossid": 19033}]],
            "system_rule_dsc": [["LBS_meituan2021_zhandou", {"rule_dsc": "食灵满意度"}]],
            "battle_team_routes": [[721, {"battleMode": MEITUAN_MODE}]],
            "Constant": [[10090, {"value": [2.0, 2.8, 3.6, 4.3, 5.0]}]],
            "pve_stage_data": [[str(stage), {"id": str(stage), "groupid": stage}]],
            "BattleMonstersInfo": [[stage, {"resindex": 41146}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "battle", "fields": []} for name in tables]
        index = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], str(entry["key"])): entry for entry in index["entries"]}
        root = entries["map_boss", "19033"]
        self.assertEqual((root["family"], root["title"]), ("event", "宴席大赛 · 联动鬼王"))
        self.assertEqual([ref["key"] for ref in root["refs"] if ref["table"] == "activity_offline_lbs_mass"], [300])
        detail = entries["pve_stage_data", str(stage)]
        self.assertEqual([ref["key"] for ref in detail["refs"] if ref["table"] == "battle_team_routes"], [721])
        self.assertIn("LBS_meituan2021_zhandou", [ref["key"] for ref in detail["refs"]])
        self.assertEqual(entry_for_stage(maps, stage, MEITUAN_MODE), ("meituan", None, 41146, 4262369, 10))
        self.assertIsNone(entry_for_stage(maps, stage, LBS_ACTIVITY_MODE))
        self.assertIsNone(party_positions(MEITUAN_MODE, 2))

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

    def test_flying_tournament_events_join_battle_ids_and_keep_training_distinct(self):
        tables = {
            "urdtg_event": [[3, {"id": 3, "name": "赛车对决", "type": 1, "params": [101]}],
                            [5, {"id": 5, "name": "备赛训练", "type": 7, "params": [101]}]],
            "urdtg_ui": [[3, {"id": 3, "title": "赛事训练", "tip": "ur_datiangou_battle_tips"}]],
            "urdtg_dungeon_battle": [[101, {"monster_id": 101, "battle_id": "12140016", "name": "九命猫"}]],
            "pve_stage_data": [["12140016", {"id": "12140016", "groupid": 12140016}],
                               ["510014", {"id": "510014", "groupid": 510014}]],
            "BattleMonstersInfo": [[12140016, {}], [510014, {}]],
            "battle_team_routes": [[6089, {"team_type": 6089, "battleMode": 6089}],
                                   [6087, {"team_type": 6087, "battleMode": 6092}]],
            "team_assist_stage": [[101014, {"id": 101014, "name": "赛事训练"}]],
            "system_rule_dsc": [["ur_datiangou_tansuo_tips", {"rule_dsc": "围场赛事"}],
                                ["ur_datiangou_battle_tips", {"rule_dsc": "天狗面具"}]],
        }
        manifests = [{"name": name, "status": "decoded", "family": "other",
                      "fields": list({field for _, row in rows for field in row})} for name, rows in tables.items()]
        data = encounter_index({"resourceVersion": "0.0.816", "tables": manifests}, tables.__getitem__)
        entries = {(entry["table"], entry["key"]): entry for entry in data["entries"]}

        def refs(table, key):
            return {(ref["table"], ref["key"]) for ref in entries[table, key]["refs"] if ref["found"]}

        self.assertIn(("urdtg_dungeon_battle", 101), refs("urdtg_event", 3))
        self.assertIn(("pve_stage_data", "12140016"), refs("urdtg_event", 3))
        self.assertNotIn(("urdtg_dungeon_battle", 101), refs("urdtg_event", 5))
        self.assertIn(("urdtg_event", 3), refs("urdtg_dungeon_battle", 101))
        self.assertIn(("battle_team_routes", 6089), refs("pve_stage_data", "12140016"))
        self.assertIn(("system_rule_dsc", "ur_datiangou_battle_tips"), refs("pve_stage_data", "12140016"))
        self.assertIn(("pve_stage_data", "510014"), refs("urdtg_ui", 3))
        self.assertIn(("battle_team_routes", 6087), refs("urdtg_ui", 3))
        self.assertIn(("team_assist_stage", 101014), refs("urdtg_ui", 3))
        self.assertNotIn(("battle_team_routes", 6089), refs("urdtg_ui", 3))

    def test_exploration_room_and_story_process_use_distinct_id_namespaces(self):
        tables = {
            "storyChapter": [[18, {"id": 18, "name": "阴阳之理", "BossList": [39], "guanKaProcess": [[1, 2]]}]],
            "mapnpc": [[18, {"id": 18, "name": "阴阳之理", "battle_id": 18}]],
            "story_room": [[1801, {"MapEntryID": 18, "MonsterID": 31811, "desc": "大天狗挑战难度1"}]],
            "BossTower": [[39, {"HeroID": 230, "LevelID": 21230, "team_boss": [[22230, 1]]}]],
            "friend_fb": [[21230, {"sceneId": 230}], [22230, {"sceneId": 230}]],
            "hero": [[230, {"name": "独眼小僧"}]],
            "DramaProcess": [[1, {"type": 3, "RelatedStory": 1}], [2, {"type": 1, "RelatedStory": 2}]],
            "DramaLevel": [[1, {"StoryName": "犬神战斗", "ElementList": [[30101]]}],
                           [2, {"StoryName": "剧情探索", "ElementList": [[30101]]}]],
            "pve_stage_data": [["18", {"id": "18", "groupid": 18}],
                               ["31811", {"id": "31811", "groupid": 31811}],
                               ["30101", {"id": "30101", "groupid": 30101}],
                               ["21230", {"id": "21230", "groupid": 30101}]],
            "BattleMonstersInfo": [[31811, {"resindex": 11032}], [30101, {"resindex": 11032}]],
            "Combinesceneinfo": [[11032, {}], [230, {}]],
            "battle_mode_routes": [[1000, {"mode_symbol": "MODE_TEAM_FB", "scene_engine": "TeamFbEngine"}],
                                   [26, {"mode_symbol": "MODE_FRIEND_FB", "scene_engine": "FriendFbEngine"}]],
            "Constant": [[86, {"value": [41]}]],
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
                                                   ("mapnpc", 18), ("battle_mode_routes", 1000), ("Combinesceneinfo", 11032)])
        self.assertIn(("story_room", 1801), refs("pve_stage_data", "31811"))
        self.assertEqual(refs("pve_stage_data", "18"), [("BattleMonstersInfo", 18), ("mapnpc", 18)])
        self.assertEqual(refs("DramaProcess", 1), [("DramaLevel", 1), ("pve_stage_data", "30101"),
                                                 ("BattleMonstersInfo", 30101), ("Combinesceneinfo", 11032)])
        self.assertEqual(refs("DramaProcess", 2), [("DramaLevel", 2)])
        self.assertEqual(refs("BossTower", 39), [("hero", 230), ("friend_fb", 21230), ("battle_mode_routes", 26),
                                               ("Constant", 86), ("friend_fb", 22230), ("Combinesceneinfo", 230)])
        self.assertEqual(data["unresolvedReferences"], 1)
