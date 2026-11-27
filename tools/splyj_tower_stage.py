"""Original Fire Across the Land tower floors."""

from pve_clock import NativePveClock


SPLYJ_ACTIVITY = 11431
SPLYJ_TOWER_ACTIVITY = 11442
SPLYJ_TOWER_MODE = 6058
SPLYJ_TOWER_STAGES = range(9637271, 9637274)
SPLYJ_TOWER_FLOORS = range(664, 667)
SPLYJ_TOWER_SCENE = 3064601
SPLYJ_TOWER_SECONDS = 180
SPLYJ_ASSIST = 98
SPLYJ_ASSIST_HERO = 61320


class SplyjTowerReplay:
    def __init__(self, stage_id):
        from battleengine.engine.SPlyjTowerBattleEngine import SPlyjTowerBattleEngine
        from com import const
        from DynamicConfigData import (BattleMonstersInfo, DATA_ACTIVITY_TOWER_FLOOR, DATA_NORMAL_BATTLE_ASSIST_HERO,
                                       DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA)

        if stage_id not in SPLYJ_TOWER_STAGES:
            raise ValueError("Choose an original Fire Across the Land tower stage")
        self.layer = stage_id - SPLYJ_TOWER_STAGES.start + 1
        self.floor_id = SPLYJ_TOWER_FLOORS[self.layer - 1]
        floor = DATA_ACTIVITY_TOWER_FLOOR.data[self.floor_id]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        waves = self.group["MonstersInfos"]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[SPLYJ_TOWER_MODE]
        assist = DATA_NORMAL_BATTLE_ASSIST_HERO.data[SPLYJ_ASSIST]
        if ((floor["act_id"], floor["battle_id"], floor["tower_layer"]) != (SPLYJ_TOWER_ACTIVITY, stage_id, self.layer)
                or self.group["ID"] != stage_id or self.group["resindex"] != SPLYJ_TOWER_SCENE
                or len(waves) != 1 or len(waves[0]) != 6 or stage["shishentotal"] != 5 or stage.get("battleTime")
                or rules["halt_time"] != SPLYJ_TOWER_SECONDS or rules["group_battle"] or rules["replace_yys_id"]
                or rules["assist_hero_list"] != [SPLYJ_ASSIST] or rules["save_round_hp"]
                or (assist["hero_id"], assist["pos_index"], assist["is_god_mode"], assist["can_control"])
                != (SPLYJ_ASSIST_HERO, 101, 1, 0)):
            raise RuntimeError("The original Fire Across the Land floor or assist differs")
        self.const = const
        self.engine = SPlyjTowerBattleEngine({"pve_data_flag": str(stage_id)})
        self.engine.battleMode = SPLYJ_TOWER_MODE
        self.clock = NativePveClock(self.engine, SPLYJ_TOWER_SECONDS)
        self.verified = False
        formation = [(pos, proto, level) for pos, proto, level, *_ in waves[0]]
        create = self.engine._create_this_round_alive_monsters

        def verify(monsters):
            entities = create(monsters)
            if self.verified or [(e.posIndex, e.protoid, e.AttrComp.level) for e in entities] != formation:
                raise RuntimeError("The Fire Across the Land engine created a different enemy wave")
            self.verified = True
            return entities

        self.engine._create_this_round_alive_monsters = verify

    def matches(self, avatar):
        engine = self.engine
        return (engine.monstergroup == self.group["ID"] and engine.combineSceneInfoId == SPLYJ_TOWER_SCENE
                and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6] and not engine.replace_yys_flag
                and engine.campData1.shareGuiHuo == 4 and engine.campData2.initGuihuo == 2)

    def report(self, completed, outcome):
        selected = self.engine.engineUserData.get("SelectedHeroes", {})
        if not self.verified or completed and not any(hero["heroId"] == SPLYJ_ASSIST_HERO
                                                      for team in selected.values() for hero in team):
            raise RuntimeError("The original Fire Across the Land wave or assist was not verified")
        return {"activityId": SPLYJ_TOWER_ACTIVITY, "floorId": self.floor_id, "layer": self.layer,
                "assistId": SPLYJ_ASSIST_HERO, "rounds": self.engine.all_bout_counter, **self.clock.report(outcome)}
