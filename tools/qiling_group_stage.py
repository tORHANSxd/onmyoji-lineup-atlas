"""Replay the original collective Hunling engine with one local participant."""

from math import isclose, isfinite


QILING_GROUP_MODE = 1041
QILING_GROUP_LIMIT = 1800
QILING_GROUP_REPLAY_SECONDS = 220


def group_encounter(config_id):
    from battleengine.engine.QiLingGroupBossBattleEngine import QiLingGroupBossBattleEngine, DATA_HUNLING_BOSS, const
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    config = DATA_HUNLING_BOSS.data.get(config_id)
    if not config or config["fuben_id"] != 1 or config["hunling_id"] not in range(100, 104):
        raise ValueError("Unknown collective Hunling encounter")
    stage = DATA_PVE_STAGE_DATA.data[str(config["battle_id"])]
    group = BattleMonstersInfo.data[stage["groupid"]]
    if (config["id"] != config_id or config["battle_id"] != group["ID"] or group["resindex"] != 800006
            or stage["shishentotal"] != 5 or len(group["MonstersInfos"]) != 1
            or len(group["MonstersInfos"][0]) != 1 or group["MonstersInfos"][0][0][0] != 1):
        raise ValueError("Unexpected collective Hunling encounter data")
    return QiLingGroupBossBattleEngine, config, group, const


class QiLingGroupReplay:
    def __init__(self, config_id, window, start_hp):
        engine_class, self.config, self.group, self.const = group_encounter(config_id)
        self.window = window
        stage = str(self.config["battle_id"])
        max_hp = engine_class.calcSharedMonMaxHp(stage, True)
        maximum = max_hp.get("1")
        if not 1 <= window <= QILING_GROUP_LIMIT or not isfinite(maximum) or maximum < 1:
            raise ValueError("Invalid collective Hunling window or original life pool")
        if start_hp is not None and not 1 <= start_hp <= maximum:
            raise ValueError("Starting shared HP is outside the original boss life pool")
        self.maximum = maximum
        self.start_hp = maximum if start_hp is None else start_hp
        self.shared_hp = self.start_hp
        self.hp_messages, self.forwarded_damage = 0, 0
        self.boss, self.start_ms, self.end_ms, self.confirmed_ms, self.reason = None, None, None, None, None
        self.recipients = []
        self.engine = engine_class({"pve_data_flag": stage, "cfg_id": config_id, "fbUid": "offline-qiling",
                                    "teamUid": "local-qiling", "hp": {"1": self.start_hp}, "team": self})
        self.engine.battleMode = self.const.BattleMode.MODE_QI_LING_GROUP_BOSS_BATTLE
        self.create = self.engine.create_one_monster_entity
        self.engine.create_one_monster_entity = self.observe_boss
        self.engine.onBattleStateChangedCb = self.observe_state

    def observe_boss(self, placement):
        boss = self.create(placement)
        _, monster_id, level, *_ = self.group["MonstersInfos"][0][0]
        if self.boss is not None or (boss.posIndex, boss.protoid, boss.AttrComp.level) != (1, monster_id, level):
            raise RuntimeError("The original collective Hunling engine spawned a different boss")
        self.boss = boss
        return boss

    def observe_state(self, engine):
        if engine.battleState != self.const.BattleState.BS_STARTED or self.start_ms is not None:
            return
        if self.boss is None or not isclose(self.boss.AttrComp.hp, self.start_hp, rel_tol=0, abs_tol=0.001):
            raise RuntimeError("The original collective Hunling engine changed the starting shared HP")
        self.start_ms = round(engine.now_time() * 1000)

    def qiling_sync_team_info_to_other(self, _, __, message):
        if message["op"] == "hp_change":
            for pos, damage in message["data"].items():
                if pos != "1" or not isfinite(damage) or damage < 0:
                    raise RuntimeError("Unexpected original shared HP message")
                self.forwarded_damage += damage
                self.shared_hp = max(0, self.shared_hp - damage)
            self.hp_messages += 1
            self.engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": {"1": self.shared_hp}})
        elif message["op"] == "battle_win":
            self.end_ms = round(self.engine.now_time() * 1000)

    def update(self, winner):
        engine = self.engine
        if self.start_ms is None:
            return
        now = round(engine.now_time() * 1000)
        if not self.recipients:
            skill_id, _, target = self.config["skills"]
            from com.utils import helpers

            expected = [unit for unit in engine.heroEntities.values() if unit.ownerController is not None
                        and (target == 0 or helpers.isYYSEntity(unit))]
            if len(expected) != (6 if target == 0 else 1) or any(not unit.SkillMgrComp.getSkillById(skill_id) for unit in expected):
                raise RuntimeError("The original group passive was not applied to the correct characters")
            self.recipients = sorted((unit.posIndex, unit.protoid) for unit in expected)
        if engine.battleState == self.const.BattleState.BS_OVER:
            self.end_ms = self.end_ms if self.end_ms is not None else now
            self.confirmed_ms = now
            self.reason = "boss-defeated" if winner == self.const.CampFlag.CAMP1 else "team-defeated"
        elif self.end_ms is None and now - self.start_ms >= self.window * 1000:
            self.end_ms = now
            self.reason = "window-expired"

    def report(self):
        engine = self.engine
        if self.start_ms is None or self.boss is None or not self.recipients:
            raise RuntimeError("The original collective Hunling battle did not start correctly")
        if engine.hpChangedCache:
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": dict(engine.hpChangedCache)})
            engine.hpChangedCache.clear()
        if not isclose(engine.myTotalDmg, self.forwarded_damage, rel_tol=0, abs_tol=0.01):
            raise RuntimeError("The original personal damage does not match the shared HP messages")
        now = round(engine.now_time() * 1000)
        elapsed_ms = (self.end_ms if self.end_ms is not None else now) - self.start_ms
        return {"configId": self.config["id"], "spiritId": self.config["hunling_id"],
                "enemyId": self.boss.protoid, "maxHp": self.maximum, "startingHp": self.start_hp,
                "remainingHp": self.shared_hp, "damage": int(engine.myTotalDmg), "hpMessages": self.hp_messages,
                "windowSeconds": self.window, "combatSeconds": elapsed_ms / 1000, "reason": self.reason,
                "settlementSeconds": None if self.confirmed_ms is None else (self.confirmed_ms - self.start_ms) / 1000,
                "skillId": self.config["skills"][0], "skillRecipients": self.recipients}
