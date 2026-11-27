"""Replay the three November Genji Invention Challenge stages."""

from pve_clock import NativePveClock


GENJI_MODE = 1290
GENJI_ACTIVITY = 20100
GENJI_STAGES = range(116004, 116007)
GENJI_SECONDS = 300
GENJI_SCENE = 2018208
GENJI_THRESHOLDS = (300000, 500000, 800000)
GENJI_BUFFS = tuple(range(98551, 98556))
GENJI_SYSTEM_TRIAL = 61316


class GenjiReplay:
    def __init__(self, stage_id, lead_slot, final_at, buff):
        from battleengine.engine.YiquanchaorenBattleEngine import MAIN_POS_INDEX, YiquanchaorenBattleEngine, const
        from DynamicConfigData import (BattleMonstersInfo, DATA_ASURA_DEVELOP, DATA_ASURA_LOAD, DATA_NORMAL_BATTLE_CONFIG,
                                       DATA_NORMAL_BATTLE_DEVELOP_SKILL_NEW, DATA_PVE_STAGE_DATA,
                                       DATA_TEAM_INVENT_CONST, DATA_TEAM_INVENT_STAGE)

        if stage_id not in GENJI_STAGES or lead_slot not in range(7) or buff not in (None, *GENJI_BUFFS):
            raise ValueError("Choose an original Genji challenge and its trial shikigami")
        self.entry = stage_id - GENJI_STAGES.start + 1
        profile = DATA_TEAM_INVENT_STAGE.data[self.entry]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[GENJI_MODE]
        waves = self.group["MonstersInfos"]
        if (profile["id"] != self.entry or profile["battle_id"] != stage_id or stage["battleTime"] != GENJI_SECONDS
                or tuple(row[0] for row in profile["score_reward"]) != GENJI_THRESHOLDS
                or tuple(row[0] for row in profile["pass_reward"]) != GENJI_THRESHOLDS
                or self.group["ID"] != stage_id or self.group["resindex"] != GENJI_SCENE or len(waves) != 1
                or len(waves[0]) != (1, 3, 6)[self.entry - 1] or waves[0][0][0] != 1
                or rules["group_battle"] or rules["assist_hero_list"] or rules["replace_yys_id"]):
            raise RuntimeError("The original Genji battle formation or reward thresholds differ")
        self.const = const
        self.lead_slot = lead_slot
        self.lead_alias = f"member-{lead_slot}" if lead_slot else f"act_temp_hero_{GENJI_SYSTEM_TRIAL}"
        if (DATA_ASURA_LOAD.data[GENJI_ACTIVITY]["load_max"] != 1
                or tuple(DATA_TEAM_INVENT_CONST.data[32]["value"]) != GENJI_BUFFS
                or DATA_TEAM_INVENT_CONST.data[102]["value"][0] != GENJI_SYSTEM_TRIAL):
            raise RuntimeError("The original Genji trial or enhancement configuration differs")
        if buff:
            row = DATA_ASURA_DEVELOP.data[buff]
            mapping = DATA_NORMAL_BATTLE_DEVELOP_SKILL_NEW.battle_mode_skill_data[(GENJI_MODE, buff)]
            if row["activity_id"] != GENJI_ACTIVITY or row["max_lv"] != 1 or mapping["battle_skill_id"] != buff:
                raise RuntimeError("The original Genji enhancement mapping differs")
        self.buff = buff
        self.position = MAIN_POS_INDEX
        self.final_at = final_at
        self.requested = False
        self.final_started = None
        self.trial_id = None
        self.engine = YiquanchaorenBattleEngine({"pve_data_flag": str(stage_id), "main_hero_uid": self.lead_alias,
                                                 "skill_info": {buff: 1} if buff else {}})
        self.engine.battleMode = GENJI_MODE
        self.clock = NativePveClock(self.engine, GENJI_SECONDS)
        self.verified = False
        create = self.engine._create_this_round_alive_monsters
        formation = [(pos, proto, level) for pos, proto, level, *_ in waves[0]]

        def verify(monsters):
            entities = create(monsters)
            if self.verified or [(e.posIndex, e.protoid, e.AttrComp.level) for e in entities] != formation:
                raise RuntimeError("The original Genji engine created a different enemy formation")
            self.verified = True
            return entities

        self.engine._create_this_round_alive_monsters = verify

    def matches(self, avatar):
        engine = self.engine
        return (engine.monstergroup == self.group["ID"] and engine.combineSceneInfoId == GENJI_SCENE
                and engine.select_main_hero_uid == self.lead_alias
                and avatar.hasYYS and list(avatar.ssPosIndexList) == [2, 3, 4, 5, 6, self.position]
                and engine.campData1.shareGuiHuo == 8 and engine.campData2.initGuihuo == 1)

    def update(self, controller):
        engine = self.engine
        if engine.battleState != self.const.BattleState.BS_STARTED or self.clock.started is None:
            return
        if self.trial_id is None:
            trial = engine.getEntity(engine.main_entity_uid)
            if (trial is None or trial.posIndex != self.position
                    or trial.HeroComp.heroData.heroUid != self.lead_alias
                    or not self.lead_slot and trial.protoid != GENJI_SYSTEM_TRIAL):
                raise RuntimeError("The original Genji engine did not select the trial shikigami")
            if self.buff and not any(skill[0] == self.buff and skill[1] == 1 for skill in engine.battle_skill_info):
                raise RuntimeError("The original Genji engine did not set the selected enhancement")
            self.trial_id = trial.protoid
        elapsed = engine.now_time() - self.clock.started
        if self.final_at is not None and not self.requested and elapsed >= self.final_at:
            self.requested = True
            engine.op_enter_final_turn(controller)
        if engine.is_final_turn and self.final_started is None:
            self.final_started = round(elapsed, 6)
            engine.op_setAuto(controller, True)

    def report(self, completed, outcome):
        engine = self.engine
        if not self.verified or self.trial_id is None:
            raise RuntimeError("The original Genji formation or trial shikigami was not verified")
        damage = engine.engineUserData.get("my_total_damage") if completed else None
        if completed and (type(damage) is not int or damage < 0):
            raise RuntimeError("The original Genji engine returned invalid final-turn damage")
        return {"activityId": GENJI_ACTIVITY, "entryId": self.entry, "trialId": self.trial_id, "buff": self.buff,
                "trialSlot": self.lead_slot, "damage": damage, "rewardTier": sum(damage >= limit for limit in GENJI_THRESHOLDS)
                if damage is not None else None, "finalAt": self.final_at, "triggerSeconds": self.final_started,
                "autoTriggered": engine.is_time_out and not self.requested, **self.clock.report(outcome)}
