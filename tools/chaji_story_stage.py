"""Original Moonlight Eternal scripted battles and their fixed casts."""

from pve_clock import NativePveClock


CHAJI_STORY_ACTIVITY = 10225
CHAJI_STORY_MODE = 9552
CHAJI_SPECIAL_MODE = 9550
CHAJI_STORY_TEAM = 1214
CHAJI_SPECIAL_TEAM = 1277
CHAJI_STORY_STAGES = {9808001: 3, 9808002: 7, 9808003: 15}
CHAJI_SPECIAL_STAGES = (1014101, 1014102)
CHAJI_STORY_MODES = {CHAJI_STORY_MODE: CHAJI_STORY_STAGES, CHAJI_SPECIAL_MODE: CHAJI_SPECIAL_STAGES}
CHAJI_STORY_DEADLINES = {CHAJI_STORY_MODE: 180, CHAJI_SPECIAL_MODE: 300}
CHAJI_STORY_CAST = ((2471, 40, 6, 1), (2472, 40, 6, 1))


class ChajiStoryReplay:
    def __init__(self, mode, stage_id):
        from com import const
        from DynamicConfigData import (BattleMonstersInfo, DATA_DRAMAHEROINFO, DATA_NORMAL_BATTLE_CONFIG,
                                       DATA_PVE_STAGE_DATA, DATA_SP_CHAJI_CONST, DATA_SP_CHAJI_PLOT)

        if stage_id not in CHAJI_STORY_MODES.get(mode, ()):
            raise ValueError("Choose an original Moonlight Eternal story formation")
        self.fixed = mode == CHAJI_STORY_MODE
        self.deadline = CHAJI_STORY_DEADLINES[mode]
        self.scene = 9806200 if self.fixed else 4002433
        self.expected_roster = []
        if self.fixed:
            from battleengine.engine.SPChaJiNormalStoryBattleEngine import SPChaJiNormalStoryBattleEngine as Engine

            plot = DATA_SP_CHAJI_PLOT.data[CHAJI_STORY_STAGES[stage_id]]
            drama = DATA_DRAMAHEROINFO.data[str(stage_id)]
            roster = [(pos, *hero) for pos, hero in enumerate(drama["heroIds"], 1) if hero]
            if (plot["type"] != 2 or plot["params"] != str(stage_id) or drama["autoStartCombat"] != 1
                    or roster != [(pos, *hero) for pos, hero in enumerate(CHAJI_STORY_CAST, 1)]):
                raise RuntimeError("The original Moonlight Eternal plot or cast differs")
            self.expected_roster = roster
        else:
            from battleengine.engine.SPChaJiSpecialStoryBattleEngine import SPChaJiSpecialStoryBattleEngine as Engine

            if tuple(DATA_SP_CHAJI_CONST.data[34]["value"]) != CHAJI_SPECIAL_STAGES:
                raise RuntimeError("The original Moonlight Eternal special formations differ")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        waves = self.group["MonstersInfos"]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[mode]
        if (self.group["ID"] != stage_id or self.group["resindex"] != self.scene
                or len(waves) != 1 or len(waves[0]) != (6 if self.fixed else 1)
                or rules["halt_time"] != self.deadline or rules["group_battle"] or rules["replace_yys_id"]):
            raise RuntimeError("The original Moonlight Eternal story route differs")
        self.const = const
        self.engine = Engine({"pve_data_flag": str(stage_id)})
        self.engine.battleMode = mode
        self.clock = NativePveClock(self.engine, self.deadline)
        self.verified = False
        self.enemy_orbs = stage["gwinitguihuo"]
        self.roster = []
        formation = [(pos, proto, level) for pos, proto, level, *_ in waves[0]]
        create = self.engine._create_this_round_alive_monsters

        def verify(monsters):
            entities = create(monsters)
            if (self.verified or [(e.posIndex, e.protoid, e.AttrComp.level) for e in entities] != formation
                    or not self.fixed and entities[0].battleRemainHp != 1):
                raise RuntimeError("The original Moonlight Eternal story opening differs")
            self.verified = True
            return entities

        self.engine._create_this_round_alive_monsters = verify

    def matches(self, avatar):
        engine = self.engine
        positions = [1, 2, 3, 4, 5, 6] if self.fixed else [2, 3, 4, 5, 6]
        return (engine.monstergroup == self.group["ID"] and engine.combineSceneInfoId == self.scene
                and avatar.hasYYS is not self.fixed and avatar.ssPosIndexList == positions and not engine.replace_yys_flag
                and engine.campData1.shareGuiHuo == 6 and engine.campData2.initGuihuo == self.enemy_orbs)

    def verify_selection(self, controller):
        if not self.fixed:
            return
        observed = sorted((entity.posIndex, entity.protoid, entity.AttrComp.level, entity.AttrComp.star,
                           entity.HeroComp.heroData.awake) for entity in self.engine.heroEntities.values()
                          if entity.ownerController is controller)
        if observed != self.expected_roster:
            raise RuntimeError("The original Moonlight Eternal engine selected a different story cast")
        self.roster = [{"position": pos, "heroId": hero, "level": level, "star": star, "awake": awake}
                       for pos, hero, level, star, awake in observed]

    def report(self, completed, outcome):
        if not self.verified or self.fixed != bool(self.roster) or completed and not self.fixed and outcome != "loss":
            raise RuntimeError("The original Moonlight Eternal story did not settle as scripted")
        return {"fixed": self.fixed, "roster": self.roster, "bossRetainsHp": None if self.fixed else 1,
                "scriptDefeat": bool(getattr(self.engine, "sp_chaji_story_battle_force_to_fail", False)),
                **self.clock.report("loss" if self.engine.isHaltBattle else outcome)}
