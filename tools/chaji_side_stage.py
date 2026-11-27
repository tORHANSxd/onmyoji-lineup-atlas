"""Original Moonlight Eternal drills and ten-wave time fissure."""

from chaji_boss_stage import CHAJI_ASSIST_CONFIG, CHAJI_ASSIST_HERO
from chaji_map_stage import CHAJI_MAP_ACTIVITIES, CHAJI_MAP_SCENE
from pve_clock import NativePveClock


CHAJI_DRILL_ACTIVITY = 10169
CHAJI_DRILL_FLOOR = 531
CHAJI_DRILL_MODE = 9548
CHAJI_DRILL_STAGE = 1014000
CHAJI_RIFT_MODE = 9549
CHAJI_RIFT_STAGE = 1014001
CHAJI_RIFT_TEAM = 1229
CHAJI_RIFT_TICKET = 9099215
CHAJI_SIDE_MODES = {CHAJI_DRILL_MODE: CHAJI_DRILL_STAGE, CHAJI_RIFT_MODE: CHAJI_RIFT_STAGE}
CHAJI_SIDE_DEADLINES = {CHAJI_DRILL_MODE: 180, CHAJI_RIFT_MODE: 600}


class ChajiSideReplay:
    def __init__(self, mode, stage_id):
        from com import const
        from DynamicConfigData import (BattleMonstersInfo, DATA_ACTIVITY_TOWER_FLOOR, DATA_NORMAL_BATTLE_ASSIST_HERO,
                                       DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA, DATA_SP_CHAJI_CONST)

        if CHAJI_SIDE_MODES.get(mode) != stage_id:
            raise ValueError("Choose the matching Moonlight Eternal side encounter")
        self.rift = mode == CHAJI_RIFT_MODE
        self.wave_count = 10 if self.rift else 1
        self.deadline = CHAJI_SIDE_DEADLINES[mode]
        if self.rift:
            from battleengine.engine.SPChaJiFissureBattleEngine import SPChaJiFissureBattleEngine as Engine

            constants = DATA_SP_CHAJI_CONST.data
            if (constants[35]["value"] != [stage_id] or constants[76]["value"] != [CHAJI_RIFT_TICKET]
                    or constants[97]["value"] != [30]):
                raise RuntimeError("The original time fissure entry or decision time differs")
        else:
            from battleengine.engine.SPChaJiYanWuBattleEngine import SPChaJiYanWuBattleEngine as Engine

            floor = DATA_ACTIVITY_TOWER_FLOOR.data[CHAJI_DRILL_FLOOR]
            if (floor["act_id"], floor["battle_id"], floor["tower_layer"]) != (CHAJI_DRILL_ACTIVITY, stage_id, 1):
                raise RuntimeError("The original Moonlight Eternal drill entry differs")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        waves = self.group["MonstersInfos"]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[mode]
        assist = DATA_NORMAL_BATTLE_ASSIST_HERO.data[CHAJI_ASSIST_CONFIG]
        if (self.group["ID"] != stage_id or self.group["resindex"] != CHAJI_MAP_SCENE
                or len(waves) != self.wave_count or any(len(wave) != 6 for wave in waves)
                or stage["shishentotal"] != 5 or stage.get("battleTime") or rules["halt_time"] != self.deadline
                or rules["group_battle"] is not self.rift or rules["replace_yys_id"] or rules["save_round_hp"]
                or rules["assist_hero_list"] != [CHAJI_ASSIST_CONFIG] or assist["hero_id"] != CHAJI_ASSIST_HERO):
            raise RuntimeError("The original Moonlight Eternal formation or entry rules differ")
        self.const = const
        self.engine = Engine({"pve_data_flag": str(stage_id)})
        self.engine.battleMode = mode
        self.clock = NativePveClock(self.engine, self.deadline)
        self.verified = 0
        self.formations = [[(pos, proto, level) for pos, proto, level, *_ in wave] for wave in waves]
        create = self.engine._create_this_round_alive_monsters

        def verify(monsters):
            entities = create(monsters)
            wave = self.engine.finishedWaveCount
            if (wave != self.verified or not 0 <= wave < self.wave_count
                    or [(e.posIndex, e.protoid, e.AttrComp.level) for e in entities] != self.formations[wave]):
                raise RuntimeError("The original Moonlight Eternal engine created a different enemy wave")
            self.verified += 1
            return entities

        self.engine._create_this_round_alive_monsters = verify

    def matches(self, avatar):
        engine = self.engine
        return (engine.monstergroup == self.group["ID"] and engine.combineSceneInfoId == CHAJI_MAP_SCENE
                and not engine.replace_yys_flag and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6]
                and engine.campData1.shareGuiHuo == 6 and engine.campData2.initGuihuo == 8)

    def report(self, completed, outcome):
        engine = self.engine
        if self.verified < 1 or not engine.finishedWaveCount <= self.verified <= engine.finishedWaveCount + 1:
            raise RuntimeError("Missing verification for a Moonlight Eternal enemy wave")
        data = {"activityId": CHAJI_MAP_ACTIVITIES[0] if self.rift else CHAJI_DRILL_ACTIVITY,
                "rounds": engine.all_bout_counter, **self.clock.report("loss" if engine.isHaltBattle else outcome)}
        if self.rift:
            first_death = engine.round_index_first_hero_dead
            choice = engine.is_get_reward
            settled = engine.engineUserData
            if completed and ((settled.get("round_index_first_hero_dead"), settled.get("is_get_reward")) != (first_death, choice)
                              or choice not in (0, 1, 2)):
                raise RuntimeError("The original time fissure did not report its recorded settlement")
            data.update(firstDeathWave=first_death + 1 if first_death >= 0 else None, rewardChoice=choice)
        return data
