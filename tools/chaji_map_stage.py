"""Original Sunwheel Shadow map encounters."""

from chaji_boss_stage import CHAJI_ASSIST_CONFIG, CHAJI_ASSIST_HERO, CHAJI_ASSIST_POSITION
from pve_clock import NativePveClock


CHAJI_MAP_MODE = 9547
CHAJI_MAP_TEAM = 1218
CHAJI_MAP_ACTIVITIES = (10250, 10141, 10142)
CHAJI_MAP_SCENE = 4002434
CHAJI_MAP_SECONDS = 180
CHAJI_MAP_HARD_SKILL = 83211
CHAJI_MAP_TAILS = (200, 203, 205, 207, 210, 216, 217, 220, 222, 223, 224, 227, 228, 229, 234,
                   235, 237, 240, 241, 252, 255, 257, 262, 265, 271, 277, 278, 279, 280, 296,
                   304, 305, 307, 312, 314, 319, 320, 332, 333, 334, 335, 337, 338, 341, 342)
CHAJI_MAP_STAGES = frozenset(base + tail for base in (6771000, 6772000) for tail in CHAJI_MAP_TAILS)


class ChajiMapReplay:
    def __init__(self, stage_id):
        from battleengine.engine.SPChaJiMapPointBattleEngine import SPChaJiMapPointBattleEngine, const
        from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_ASSIST_HERO, DATA_NORMAL_BATTLE_CONFIG,
                                       DATA_PVE_STAGE_DATA, DATA_SP_CHAJI_SUB_EVENT_BATTLE)

        if stage_id not in CHAJI_MAP_STAGES:
            raise ValueError("Choose an original Sunwheel Shadow map formation")
        self.hard = stage_id >= 6772000
        if not any(row["pve_stage_data_id"][self.hard] == str(stage_id)
                   for row in DATA_SP_CHAJI_SUB_EVENT_BATTLE.data.values()):
            raise RuntimeError("The stage is not registered on the original battle map")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        waves = self.group["MonstersInfos"]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[CHAJI_MAP_MODE]
        assist = DATA_NORMAL_BATTLE_ASSIST_HERO.data[CHAJI_ASSIST_CONFIG]
        if (self.group["ID"] != stage_id or self.group["resindex"] != CHAJI_MAP_SCENE
                or len(waves) != 1 or len(waves[0]) != 6 or stage["shishentotal"] != 5 or stage.get("battleTime")
                or rules["halt_time"] != CHAJI_MAP_SECONDS or rules["group_battle"] or rules["replace_yys_id"]
                or rules["save_round_hp"] or rules["assist_hero_list"] != [CHAJI_ASSIST_CONFIG]
                or (assist["hero_id"], assist["pos_index"]) != (CHAJI_ASSIST_HERO, CHAJI_ASSIST_POSITION)):
            raise RuntimeError("The original Sunwheel Shadow battle or roster differs")
        self.const = const
        self.engine = SPChaJiMapPointBattleEngine({"pve_data_flag": str(stage_id), "is_hard": self.hard})
        self.engine.battleMode = CHAJI_MAP_MODE
        self.clock = NativePveClock(self.engine, CHAJI_MAP_SECONDS)
        self.verified = False
        self.formation = [(pos, proto, level) for pos, proto, level, *_ in waves[0]]
        self.skill_positions = []
        create = self.engine._create_this_round_alive_monsters

        def verify(monsters):
            entities = create(monsters)
            if self.verified or [(e.posIndex, e.protoid, e.AttrComp.level) for e in entities] != self.formation:
                raise RuntimeError("The original Sunwheel Shadow engine created a different formation")
            self.skill_positions = [e.posIndex for e in entities if e.SkillMgrComp.getSkillById(CHAJI_MAP_HARD_SKILL)]
            if self.skill_positions != ([pos for pos, _, _ in self.formation] if self.hard else []):
                raise RuntimeError("The original Sunwheel Shadow enemy difficulty skill differs")
            self.verified = True
            return entities

        self.engine._create_this_round_alive_monsters = verify

    def matches(self, avatar):
        engine = self.engine
        return (engine.is_hard is self.hard and engine.monstergroup == self.group["ID"]
                and engine.combineSceneInfoId == self.group["resindex"] and not engine.replace_yys_flag
                and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6]
                and engine.campData1.shareGuiHuo == 6 and engine.campData2.initGuihuo == 3)

    def report(self, completed, outcome):
        settlement = self.engine.engineUserData
        selected = settlement.get("SelectedHeroes", {})
        bouts = self.engine.all_bout_counter
        if (not self.verified or completed and (settlement.get("my_camp_bout_count") != bouts
                or not any(hero["heroId"] == CHAJI_ASSIST_HERO for team in selected.values() for hero in team))):
            raise RuntimeError("The original Sunwheel Shadow formation, assist or round settlement differs")
        return {"activityId": CHAJI_MAP_ACTIVITIES[0], "hard": self.hard, "rounds": bouts,
                "hardSkill": CHAJI_MAP_HARD_SKILL if self.hard else None, "skillPositions": self.skill_positions,
                **self.clock.report("loss" if self.engine.isHaltBattle else outcome)}
