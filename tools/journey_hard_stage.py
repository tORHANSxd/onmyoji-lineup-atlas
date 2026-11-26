"""Local replays of the original Sea Journey and Yin Yang Defence bosses."""

from collections import Counter
from types import SimpleNamespace


JOURNEY_HARD_MODE = 402
STAGES = {731001, 731002, 731003, 731004, 731005}
YINYANG_BOSS_MODE = 409
YINYANG_BOSS_STAGE = 731010
YINYANG_BOSS_BUFF_IDS = range(1, 31)
YINYANG_BOSS_WALL_SECONDS = 220
YINYANG_BOSS_SOURCES = {
    "battleengine.engine.YinYangEngine": "93155e18b620983af75bfd3d3abfca600a8412322a6534695dcd5dbf8fba96b4",
    "battleengine.engine.JSNormalEngine": "8187430f673787f702577fb3c292d6cafe2517bd46800e9befe44dd16dee90de",
    "module.team_types.team_type_mono": "f88d37704550e3153b47ae62d7487e5e8ec7b33a455b5c24b821fef178dc0273",
    "module.seajourney.YinyangBossFightPanel": "7ef788bb391f05ed741090c87f289709656bda6f22fa62a6356026857d9f5110",
    "com.data.cdata.defence_dungeon_multiple_buff": "77f390271d15a5dd3e791d4d5cf38638ee74d1d8241cf141cd85026f6944438f",
    "com.data.cdata.Constant": "41f1b29a54f6105bd47d75dcefaf9b5e4451fc6f54703c055d3c5a65c1e40b56",
    "com.data.cdata.pve_stage_data": "7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0",
    "com.data.cdata.BattleMonstersInfo": "8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111",
}
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


class YinYangBossReplay:
    def __init__(self, modules, stage_id, drums, buffs):
        from battleengine.engine import JSNormalEngine, YinYangEngine
        from com.data.cdata import Constant
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA, DATA_YY_DUNGEON_BUFF

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in YINYANG_BOSS_SOURCES.items()):
            raise ValueError("The Yin Yang Defence boss route changed")
        boss_stage, base_time, drum_time = (Constant.data[key]["value"][0] for key in (1174, 992, 993))
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        if stage_id != boss_stage or stage["groupid"] != stage_id or stage["shishentotal"] != 5:
            raise ValueError("Unknown Yin Yang Defence boss formation")
        self.group = BattleMonstersInfo.data[stage_id]
        wave, = self.group["MonstersInfos"]
        self.formation = sorted((pos, proto, level) for pos, proto, level, *_ in wave if proto)
        self.const, self.started, self.opening = YinYangEngine.const, None, []
        self.drums, self.buffs = drums, buffs
        self.buff_types = {buff: DATA_YY_DUNGEON_BUFF.data[buff]["buff_type"] for buff in buffs}
        duration = base_time + drum_time * drums
        self.deadline = duration + sum(int(DATA_YY_DUNGEON_BUFF.data[buff]["param"][0])
                                       for buff in buffs if self.buff_types[buff] == 4)
        self.engine = engine = YinYangEngine.YinYangEngine({
            "pve_data_flag": str(stage_id), "yinyang_boss_data": {"duration": duration}, "monopoly_buffs": buffs,
        })
        engine.battleMode = self.const.BattleMode.MODE_YY_MONOPOLY_BOSS
        # The original engine writes and compares an integer timeout timestamp.
        self.clock_epoch = 1000
        clock = SimpleNamespace(time=self.now)
        YinYangEngine.time = JSNormalEngine.time = clock
        engine.onBattleStateChangedCb = self.on_battle_state_changed
        self.native_add_buff = engine.add_one_buff
        self.applied = Counter()
        engine.add_one_buff = self.observe_buff

    def now(self):
        return self.clock_epoch if self.started is None else self.clock_epoch + self.engine.now_time() - self.started

    def observe_buff(self, buff, entity=None):
        self.native_add_buff(buff, entity)
        self.applied[buff] += 1

    def on_battle_state_changed(self, engine):
        if self.started is not None or engine.battleState != self.const.BattleState.BS_STARTED:
            return
        self.started = engine.now_time()
        self.opening = sorted((entity.posIndex, entity.protoid, entity.AttrComp.level)
                              for entity in engine.monsterEntities.values())
        if self.opening != self.formation:
            raise RuntimeError("The Yin Yang Defence boss opened with a different formation")

    def report(self):
        engine = self.engine
        if self.started is None or engine.timeout_stamp != self.clock_epoch + self.deadline or engine.team:
            raise RuntimeError("The original Yin Yang Defence local battle did not start with the selected time")
        if list(engine.monopoly_buffs) != self.buffs:
            raise RuntimeError("The original Yin Yang Defence engine changed the selected bonuses")
        applications = {buff: self.applied[buff] for buff in dict.fromkeys(self.buffs)}
        for buff, count in applications.items():
            if self.buff_types[buff] in (1, 3):
                if count < 6 * self.buffs.count(buff):
                    raise RuntimeError("The original Yin Yang Defence engine did not apply the roster bonus")
            elif self.buff_types[buff] == 2 and count != self.buffs.count(buff):
                raise RuntimeError("The original Yin Yang Defence engine did not apply the opening fire bonus")
        return {"remainingDrums": self.drums, "buffIds": self.buffs, "buffApplications": applications,
                "damage": engine.my_total_damage, "deadlineSeconds": self.deadline, "timedOut": engine.is_timeout,
                "combatSeconds": round(engine.now_time() - self.started, 6),
                "opening": [{"position": pos, "id": hero_id, "level": level} for pos, hero_id, level in self.opening]}
