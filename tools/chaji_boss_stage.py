"""Run the versioned Moonlight Eternal boss challenges with an owned lineup."""

from importlib import import_module
import sys
from types import ModuleType

from pve_clock import NativePveClock


CHAJI_ACTIVITY = 10140
CHAJI_BOSS_ACTIVITY = 10180
CHAJI_BOSS_MODE = 9551
CHAJI_BOSS_TEAM = 1298
CHAJI_BOSS_STAGES = range(1014201, 1014216)
CHAJI_BOSS_SECONDS = 180
CHAJI_ASSIST_CONFIG = 71
CHAJI_ASSIST_HERO = 11584
CHAJI_ASSIST_POSITION = 101
CHAJI_BOSS_SCENES = (400631, 10681, 4002211, 2735022, 4002433)
CHAJI_HELPER = "module_new.sp_chaji.SpChajiHelper"
CHAJI_HELPER_SHA256 = "4ce7f719202bfa7b57543c97efe31ddcf3dc03fbba78cc36f406e368d89b561e"


def load_chaji_helper(modules):
    if modules.rows[CHAJI_HELPER]["marshalSHA256"] != CHAJI_HELPER_SHA256:
        raise RuntimeError("The original Moonlight Eternal task helper differs")
    # The APK contains the client's implementation of the task conditions.
    # Bind it at the server import path used by the offline battle engine.
    helper = import_module(CHAJI_HELPER)
    parent = import_module("module")
    package = ModuleType("module.act_helpers")
    package.__path__ = []
    package.sp_chaji_helper = helper
    parent.act_helpers = package
    sys.modules[package.__name__] = package
    sys.modules["module.act_helpers.sp_chaji_helper"] = helper
    return helper


class ChajiBossReplay:
    def __init__(self, modules, stage_id):
        if stage_id not in CHAJI_BOSS_STAGES:
            raise ValueError("Choose an original Moonlight Eternal boss challenge")
        helper = load_chaji_helper(modules)
        from battleengine.engine.SPChaJiBossBattleEngine import SPChaJiBossBattleEngine, const
        from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_ASSIST_HERO, DATA_NORMAL_BATTLE_CONFIG,
                                       DATA_PVE_STAGE_DATA, DATA_SP_CHAJI_BOSS_CONFIG, DATA_SP_CHAJI_BOSS_LV_CONFIG,
                                       DATA_SP_CHAJI_BOSS_TASK_CONFIG)

        entry = stage_id - CHAJI_BOSS_STAGES.start + 1
        boss_index, difficulty_index = divmod(entry - 1, 3)
        self.boss, self.difficulty = boss_index + 1, difficulty_index + 1
        self.hard = self.difficulty == helper.get_boss_max_lv(self.boss)
        level = DATA_SP_CHAJI_BOSS_LV_CONFIG.data[entry]
        self.profile = DATA_SP_CHAJI_BOSS_CONFIG.data[self.boss]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[CHAJI_BOSS_MODE]
        assist = DATA_NORMAL_BATTLE_ASSIST_HERO.data[CHAJI_ASSIST_CONFIG]
        waves = self.group["MonstersInfos"]
        if ((level["battle_id"], level["boss_id"], level["level"]) != (stage_id, self.boss, self.difficulty)
                or self.hard != (self.difficulty == 3) or self.group["ID"] != stage_id
                or self.group["resindex"] != CHAJI_BOSS_SCENES[boss_index]
                or len(waves) != 1 or len(waves[0]) != (1 if self.boss == 5 else 2)
                or stage["shishentotal"] != 5 or stage.get("battleTime") or rules["halt_time"] != CHAJI_BOSS_SECONDS
                or rules["group_battle"] or rules["replace_yys_id"] or rules["assist_hero_list"] != [CHAJI_ASSIST_CONFIG]
                or (assist["hero_id"], assist["pos_index"]) != (CHAJI_ASSIST_HERO, CHAJI_ASSIST_POSITION)):
            raise RuntimeError("The original Moonlight Eternal boss route differs")
        self.entry, self.const = entry, const
        self.tasks = {row["id"]: row["task_desc"] for row in DATA_SP_CHAJI_BOSS_TASK_CONFIG.data.values()
                      if row["boss_id"] == self.boss} if self.hard else {}
        self.formation = [(pos, proto, level) for pos, proto, level, *_ in waves[0]]
        params = {"boss_id": self.boss, "lv": self.difficulty}
        self.engine = SPChaJiBossBattleEngine({"pve_data_flag": str(stage_id), "act_params": params})
        self.engine.battleMode = CHAJI_BOSS_MODE
        self.clock = NativePveClock(self.engine, CHAJI_BOSS_SECONDS)
        self.verified = False
        create = self.engine._create_this_round_alive_monsters

        def verify(monsters):
            entities = create(monsters)
            if self.verified or [(entity.posIndex, entity.protoid, entity.AttrComp.level) for entity in entities] != self.formation:
                raise RuntimeError("The Moonlight Eternal boss created a different enemy formation")
            self.verified = True
            return entities

        self.engine._create_this_round_alive_monsters = verify

    def matches(self, avatar):
        engine = self.engine
        return (engine.boss_flag == self.boss and engine.difficulty_level == self.difficulty
                and engine.monstergroup == self.group["ID"] and engine.combineSceneInfoId == self.group["resindex"]
                and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6] and not engine.replace_yys_flag
                and engine.defend_hero_list == [int(hero) for hero in self.profile["hero_list"]]
                and engine.defend_hero_add_attr == self.profile["spe_add_attr"]
                and engine.spe_add_skill == self.profile["spe_add_skill"])

    def report(self, completed, outcome):
        engine = self.engine
        settlement = engine.engineUserData
        selected = settlement.get("SelectedHeroes", {})
        if (not self.verified or completed and not any(hero["heroId"] == CHAJI_ASSIST_HERO
                                                     for team in selected.values() for hero in team)
                or completed and set(engine.record_boss_task_result) != set(self.tasks)):
            raise RuntimeError("The original boss formation, assist or task settlement differs")
        return {"activityId": CHAJI_BOSS_ACTIVITY, "entryId": self.entry, "bossId": self.boss,
                "difficulty": self.difficulty, "scored": self.hard, "damage": engine.get_my_total_damage(),
                "originalWinCamp": engine.record_original_win_camp, "helperSHA256": CHAJI_HELPER_SHA256,
                "tasks": [{"id": task, "label": label, "result": engine.record_boss_task_result.get(task, 1)}
                          for task, label in sorted(self.tasks.items())],
                **self.clock.report("loss" if engine.isHaltBattle else outcome)}
