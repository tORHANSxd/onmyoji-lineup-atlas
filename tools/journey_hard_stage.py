"""Single-player replays of the original Sea Journey boss challenges."""

from types import SimpleNamespace


JOURNEY_HARD_MODE = 402
STAGES = {731001, 731002, 731003, 731004, 731005}
BLESSING_ATTRIBUTES = {"attack": "attackAdditionRate", "defense": "defenseAdditionRate", "hp": "maxHpAdditionRate",
                       "speed": "speedAdditionVal", "crit": "critRateAdditionVal", "critDamage": "critPowerAdditionVal"}


class JourneyHardReplay:
    def __init__(self, stage_id, blessings, deadline_seconds):
        from battleengine.engine import JSNormalEngine as original
        from DynamicConfigData import BattleMonstersInfo, DATA_JOURNEY_HARD_BATTLE, DATA_PVE_STAGE_DATA

        row = next((item for item in DATA_JOURNEY_HARD_BATTLE.data.values() if item["battle_id"] == stage_id), None)
        stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
        if stage_id not in STAGES or not row or not stage or stage["shishentotal"] != 5:
            raise ValueError("Unknown Sea Journey boss challenge")
        self.challenge = row["id"]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        self.engine = engine = original.JSNormalEngine({"pve_data_flag": str(stage_id), "buff_count": blessings})
        self.const = original.const
        engine.battleMode = self.const.BattleMode.MODE_JS_HARD
        self.blessings, self.deadline = blessings, deadline_seconds
        self.started, self.opening = None, []
        self.blessing_effects = {}
        self.blessing_skill, _ = original.helpers.global_get_const_tuple(8218, (0, 0))
        self.add_blessing = original.add_buff_effect
        original.add_buff_effect = self.observe_blessing
        # The client compares whole seconds to an absolute server timestamp. Keep the
        # comparison in the original update method and feed it a deterministic clock.
        self.clock_epoch = 1000
        original.time = SimpleNamespace(time=self.now)
        engine.onBattleStateChangedCb = self.on_battle_state_changed

    def observe_blessing(self, entity, count):
        attr = entity.AttrComp
        before = {name: getattr(attr, field) for name, field in BLESSING_ATTRIBUTES.items()}
        self.add_blessing(entity, count)
        skill = entity.SkillMgrComp.getSkillComp(self.blessing_skill)
        if count != self.blessings or skill is None or skill._buff_num != count:
            raise RuntimeError("The original Sea Journey engine did not install the configured blessing")
        self.blessing_effects[entity.uid] = {name: round(getattr(attr, field) - before[name], 10)
                                             for name, field in BLESSING_ATTRIBUTES.items()}

    def now(self):
        return self.clock_epoch if self.started is None else self.clock_epoch + self.engine.now_time() - self.started

    def on_battle_state_changed(self, engine):
        if self.started is not None or engine.battleState != self.const.BattleState.BS_STARTED:
            return
        self.started = engine.now_time()
        engine.timeout_stamp = self.clock_epoch + self.deadline
        expected = [(position, hero_id, level) for position, hero_id, level, *_ in self.group["MonstersInfos"][0] if hero_id]
        self.opening = sorted((entity.posIndex, entity.protoid, entity.AttrComp.level)
                              for entity in engine.monsterEntities.values())
        if self.opening != sorted(expected):
            raise RuntimeError("The original Sea Journey engine opened with a different formation")
        effects = [self.blessing_effects[entity.uid] for entity in engine.heroEntities.values()
                   if entity.camp == self.const.CampFlag.CAMP1]
        if len(effects) != 6 or any(effect != effects[0] for effect in effects):
            raise RuntimeError("The Sea Journey blessing did not apply consistently to the solo lineup")
        self.blessing_bonus = effects[0]

    def report(self):
        engine = self.engine
        if self.started is None or not self.opening or engine.group_members:
            raise RuntimeError("Sea Journey did not start the original solo boss challenge")
        return {"challengeId": self.challenge, "blessingCount": self.blessings, "deadlineSeconds": self.deadline,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": engine.is_timeout,
                "blessingBonus": self.blessing_bonus, "blessingSkill": int(self.blessing_skill),
                "opening": [{"position": pos, "id": hero_id, "level": level} for pos, hero_id, level in self.opening]}
