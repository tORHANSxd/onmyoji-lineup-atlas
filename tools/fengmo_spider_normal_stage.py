"""Replay ordinary Tsuchigumo through its original shared-health engine."""
from math import isfinite
from random import Random

from fengmo_spider_stage import SPIDER_LIVE_WINDOW

SPIDER_NORMAL_MODE, SPIDER_NORMAL_STAGE, SPIDER_NORMAL_SCENE = 3003, 25001, 40005
PARTS = {1: 81, 2: 82, 3: 83, 4: 84}
SUMMONS = (85, 86, 87)
SOURCES = {
    "battleengine.engine.HHZSGveEngine": "9d7119492ea6524c37a1f63fcc51a5d160d35d3579650ec7e3fec59428044cd5",
    "battleengine.skill.SkillComp_353": "d44ee66483386b8b408efc0055640f7f54f6bf809ea48d43fee79a791527fa17",
    "battleengine.skill.SkillComp_355": "4f459cdef63b50a6bd9ce82ba86ca4426affc253fdff3d13a50b0f7f0c9de93c",
    "battleengine.skill.SkillComp_356": "eccf9686ea9c5fc27e9ac0bf6f49d54a16c50f6b44452a279473d59c0b69b0a5",
    "scenemembers.HHZSGveScene": "7b1bc6a6230e250211d6a67d1f5e74d26dc4c859bf167c559835da5f83e1f15f",
}


def valid_spider_normal_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "weakPart"}
            and type(settings["windowSeconds"]) is int and 1 <= settings["windowSeconds"] <= SPIDER_LIVE_WINDOW
            and type(settings["weakPart"]) is int and settings["weakPart"] in (0, 2, 3, 4))


class SpiderNormalReplay:
    def __init__(self, modules, settings, seed):
        from battleengine.engine.HHZSGveEngine import HHZSGveEngine, const
        from com.data.cdata import event4
        from DynamicConfigData import BattleMonstersInfo, DATA_CONSTANT, DATA_PVE_STAGE_DATA

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCES.items()):
            raise RuntimeError("The original ordinary Tsuchigumo engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(SPIDER_NORMAL_STAGE)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if (self.group["ID"] != SPIDER_NORMAL_STAGE or self.group["resindex"] != SPIDER_NORMAL_SCENE
                or stage["shishentotal"] != 5 or self.group["MonstersInfos"] != [
                    [[pos, unit, 40, 1, 0] for pos, unit in PARTS.items()]]):
            raise RuntimeError("The ordinary Tsuchigumo formation changed")
        self.summon_limit = const.TUZHIZHU_MAX_SUMMON
        self.gold_rate, gold_id = DATA_CONSTANT.data[231]["value"]
        event = event4.data[1]
        self.rating_thresholds = tuple(row[0] for row in event["reward"])
        if (self.summon_limit != 5 or self.gold_rate != .001 or gold_id != 87
                or event["boss_id"] != str(SPIDER_NORMAL_STAGE)
                or self.rating_thresholds != (0, 30000, 300000, 800000, 2000000)):
            raise RuntimeError("The ordinary Tsuchigumo summon rules changed")
        self.settings, self.const = settings, const
        random = Random(seed)
        rolled_part = random.randint(2, 4)
        self.weak_part = settings["weakPart"] or rolled_part
        self.room_rolls = [self.weak_part - 2, *(random.random() for _ in range(4))]
        self.parts, self.waves, self.breaks = {}, [], {}
        self.started = self.expiry = self.victory = None
        self.maximum = {str(pos): HHZSGveEngine.calcSingleSharedMonMaxHp(unit, 2500, 5, 0)
                        for pos, unit in PARTS.items()}
        if any(not isfinite(hp) or hp <= 1 for hp in self.maximum.values()):
            raise RuntimeError("The ordinary Tsuchigumo shared health changed")
        self.hp = self.maximum.copy()
        self.engine = engine = HHZSGveEngine({
            "pve_data_flag": str(SPIDER_NORMAL_STAGE), "fbUid": "local-spider-normal", "teamUid": 1, "team": self,
            "boss_type": const.Event4BossType.TU_ZHIZHU, "atk_set": 2500, "cal_num": 5,
            "m_foot": self.room_rolls, "hp": self.hp.copy(), "status_info": {},
        })
        engine.battleMode = const.BattleMode.MODE_HHZS_GVE_BOSS
        if engine.battleMode != SPIDER_NORMAL_MODE or engine.getHHZSGveBattleMode() != "3003_tzz":
            raise RuntimeError("The ordinary Tsuchigumo battle registration changed")
        self.spawn = engine._createNextRoundMons
        engine._createNextRoundMons = self.observe_spawn

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def observe_spawn(self):
        result = self.spawn()
        engine = self.engine
        for uid in engine.sharedEntityUids:
            unit = engine.getEntity(uid)
            pos, key = unit.posIndex, str(unit.posIndex)
            if (PARTS.get(pos) != unit.protoid or pos in self.parts or unit.AttrComp.level != 40
                    or abs(unit.AttrComp.maxHp - self.maximum[key]) > 1e-6):
                raise RuntimeError("The original ordinary Tsuchigumo spawned a different part")
            self.parts[pos] = unit
        if len(self.parts) != len(PARTS):
            raise RuntimeError("The original ordinary Tsuchigumo omitted a shared part")
        self.sync_hp()
        return result

    def sync_hp(self):
        self.engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def flush(self):
        cache = self.engine.hpChangedCache
        if cache:
            self.sync_team_info_to_other(self.engine.fbUid, self.engine.teamUid, {"op": "hp_change", "data": cache.copy()})
            cache.clear()

    def record_breaks(self):
        for pos, unit in self.parts.items():
            if unit.lifeState == self.const.CombatState.DEAD and pos not in self.breaks:
                self.breaks[pos] = self.seconds()

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another ordinary Tsuchigumo room")
        if message["op"] == "hp_change":
            for key, delta in message["data"].items():
                if key not in self.hp:
                    raise RuntimeError("Ordinary Tsuchigumo room received damage for an unknown slot")
                hp = min(self.maximum[key], self.hp[key] + delta)
                self.hp[key] = 0 if hp <= 1 else hp
            self.sync_hp()
        elif message["op"] == "battle_win":
            self.record_breaks()
            if len(self.breaks) != len(PARTS):
                raise RuntimeError("Ordinary Tsuchigumo settled before all original parts were defeated")
            self.victory = self.snapshot()

    def observe_summon(self, *args, **kwargs):
        engine = self.engine
        create = engine.createMonsterEntity
        units = []

        def observe(camp, owner, placement, *extra, **options):
            unit = create(camp, owner, placement, *extra, **options)
            if unit.protoid not in SUMMONS or unit.AttrComp.level != 40:
                raise RuntimeError("The original ordinary Tsuchigumo spawned a different summon")
            units.append({"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level})
            return unit

        engine.createMonsterEntity = observe
        try:
            result = self.summon(*args, **kwargs)
        finally:
            engine.createMonsterEntity = create
        if units:
            self.waves.append({"seconds": self.seconds(), "units": units})
        return result

    def finish_window(self):
        if self.expiry is None and self.victory is None and self.engine.battleState == self.const.BattleState.BS_STARTED:
            self.flush()
            self.record_breaks()
            self.expiry = self.snapshot()
            self.engine.forceBattleEnd("time_out", {})

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or self.victory:
            return
        if self.started is None:
            self.started = engine.now_time()
            manager = self.parts[1].SkillMgrComp
            summon = manager.getSkillById(355)
            self.summon = summon.do_summon
            summon.do_summon = self.observe_summon
            self.control = manager.getSkillById(353)
            engine.delayExec(self.settings["windowSeconds"] * 1000, self.finish_window)
        self.record_breaks()

    def snapshot(self):
        engine = self.engine
        parts = [{"id": unit.protoid, "position": pos, "level": unit.AttrComp.level,
                  "hp": max(0, unit.AttrComp.hp), "maximumHp": self.maximum[str(pos)], "brokenAt": self.breaks.get(pos)}
                 for pos, unit in sorted(self.parts.items())]
        target = self.control.bingo_entity
        return {"settings": self.settings, "combatSeconds": self.seconds(), "damage": engine.myTotalDmg,
                "damageRating": sum(threshold <= engine.myTotalDmg for threshold in self.rating_thresholds),
                "parts": parts, "weakPart": target.posIndex if target else self.weak_part,
                "weakPartVerified": target is self.parts[self.weak_part], "summonWaves": self.waves.copy(),
                "summonLimit": self.summon_limit, "summonRequests": self.control.summon_counter,
                "papersDefeated": engine.killZhiRenCount, "goldDefeated": engine.killGoldSpiderCount}

    def report(self, completed, outcome):
        if self.started is None:
            raise RuntimeError("The original ordinary Tsuchigumo never started")
        self.record_breaks()
        data = self.expiry or self.victory or self.snapshot()
        if (data["weakPart"] != self.weak_part or len(data["summonWaves"]) > data["summonRequests"]
                or data["summonRequests"] > self.summon_limit or outcome == "win" and not self.victory):
            raise RuntimeError("The original ordinary Tsuchigumo did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
