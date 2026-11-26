"""Replay an ordinary Night Wraith encounter for one known team."""

from math import isfinite

DUSK_MODE, DUSK_STAGE = 3017, 25021
DUSK_SCENE, ELITE_SCENE = 4002271, 4002272
DUSK_WINDOW, DUSK_WALL_SECONDS = 1200, 300
BOSS_ID, GIFT_ID = 992119, 993140
ELITES = (993121, 993122, 993123, 993124, 993120)
ELITE_POSITIONS = (2, 3, 4, 5, 6)
DUSK_SOURCES = {
    "battleengine.engine.YeHuangHunEngine": "74c392c2c01b5a79b45db5438a555c0f7d2d60c1aa2b50980c79889320a097ab",
    "battleengine.engine.ExGroupBattleEngine": "e6dde79f8b10eb6bcd31e3862550c0c796b1207b234df58520fd0108022fdca4",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "scenemembers.YeHuangHunScene": "cd4d5240899858d7c5c4cea99709a69a623df8efdc5538a440fe1263d86a5e6a",
}


def valid_dusk_settings(settings):
    if (type(settings) is not dict or set(settings) != {"windowSeconds", "musicOrder"}
            or type(settings["windowSeconds"]) is not int or not 1 <= settings["windowSeconds"] <= DUSK_WINDOW):
        return False
    order = settings["musicOrder"]
    return (type(order) is list and all(type(position) is int for position in order)
            and sorted(order) == list(ELITE_POSITIONS))


class DuskWraithReplay:
    def __init__(self, modules, settings):
        from battleengine.engine.YeHuangHunEngine import YeHuangHunEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in DUSK_SOURCES.items()):
            raise RuntimeError("The original Night Wraith engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(DUSK_STAGE)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        elites = BattleMonstersInfo.data[YeHuangHunEngine.ELITE_MONSTER_GROUP]
        gifts = BattleMonstersInfo.data[YeHuangHunEngine.GIFT_PAPER_MAN_GROUP]
        expected = [(self.group, DUSK_SCENE, [(1, BOSS_ID)]),
                    (elites, ELITE_SCENE, list(zip(ELITE_POSITIONS, ELITES))),
                    (gifts, DUSK_SCENE, [(position, GIFT_ID) for position in ELITE_POSITIONS])]
        if (self.group["ID"] != DUSK_STAGE or stage["shishentotal"] != 5
                or any(group["resindex"] != scene or group["MonstersInfos"] !=
                       [[[position, unit_id, 40, 1, 0] for position, unit_id in formation]]
                       for group, scene, formation in expected)
                or tuple(YeHuangHunEngine.BOSS_ID) != (BOSS_ID,) or tuple(YeHuangHunEngine.ELITE_ID) != ELITES):
            raise RuntimeError("Unexpected original Night Wraith configuration")

        self.settings, self.const = settings, const
        self.started, self.expiry, self.pending_win, self.room_win = None, None, False, False
        self.phases, self.hp, self.maximum = [], {}, {}
        self.defeat_order, self.sent_order = [], []
        self.depleted = set()
        self.queued = 1
        # The original server logger is absent in the headless client host.
        self.engine = engine = YeHuangHunEngine.__new__(YeHuangHunEngine)
        engine.print_log = lambda key, message: None
        engine.__init__({
            "pve_data_flag": str(DUSK_STAGE), "fbUid": "local-dusk-wraith", "teamUid": 1, "team": self,
            "atk_set": 2500, "cal_num": 5,
            "status_info": {"status": 1, "real_kill_order": [], "random_kill_order": settings["musicOrder"]},
        })
        engine.battleMode = const.BattleMode.MODE_YEHUANGHUN
        if engine.battleMode != DUSK_MODE:
            raise RuntimeError("The original Night Wraith battle mode changed")
        self.create = engine.do_after_create_mon
        self.change = engine.change_state
        self.change_hp = engine._onHpChanged
        engine.do_after_create_mon = self.observe_unit
        engine.change_state = self.observe_phase
        engine._onHpChanged = self.observe_hp

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def observe_unit(self, unit):
        self.create(unit)
        if unit.protoid in self.engine.special_max_hp_mons_ids:
            key = str(unit.posIndex)
            hp, maximum = unit.AttrComp.hp, unit.AttrComp.maxHp
            if key in self.hp or not isfinite(maximum) or maximum < 1 or hp != maximum:
                raise RuntimeError("The original Night Wraith did not spawn at full health")
            self.hp[key], self.maximum[key] = hp, maximum

    def observe_phase(self, next_state, params):
        self.change(next_state, params)
        engine = self.engine
        if engine.state != next_state or next_state != len(self.phases) + 1:
            raise RuntimeError("The original Night Wraith changed to an unexpected phase")
        initial = {1: [(1, BOSS_ID)], 2: list(zip(ELITE_POSITIONS, ELITES)),
                   3: [(1, BOSS_ID)], 4: [(1, BOSS_ID), *[(pos, GIFT_ID) for pos in ELITE_POSITIONS]]}
        expected = initial[next_state]
        enemies = {(unit.posIndex, unit.protoid): unit for unit in engine.getEntities(self.const.CampFlag.CAMP2)
                   if unit.lifeState == self.const.CombatState.ALIVE}
        opening = [{"id": unit_id, "position": pos, "level": enemies[pos, unit_id].AttrComp.level}
                   for pos, unit_id in expected if (pos, unit_id) in enemies]
        scene = ELITE_SCENE if next_state == 2 else DUSK_SCENE
        if len(opening) != len(expected) or engine.combineSceneInfoId != scene:
            raise RuntimeError("The original Night Wraith opened with an unexpected encounter")
        self.phases.append({"phase": next_state, "sceneId": scene, "seconds": self.seconds(),
                            "damage": engine.myTotalDmg, "bossHp": self.hp["1"], "opening": opening})

    def observe_hp(self, new_hp, old_hp, unit):
        self.change_hp(new_hp, old_hp, unit)
        engine = self.engine
        if engine._hpChangedLocked or new_hp >= old_hp:
            return
        pos = unit.posIndex
        key = str(pos)
        # The original shared soldiers stay at a local life floor until the
        # room broadcasts their defeat. A hit down to that floor empties the
        # corresponding room pool even if fixed-point HP and damage differ.
        if key in self.hp and (new_hp <= unit.battleRemainHp or
                               self.hp[key] + engine.hpChangedCache.get(key, 0) <= 0):
            self.depleted.add(key)
        if engine.state == 2 and unit.protoid in ELITES and key in self.depleted and pos not in self.defeat_order:
            self.defeat_order.append(pos)

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another Night Wraith room")
        if message["op"] == "battle_win":
            self.pending_win = True
        elif message["op"] == "hp_change":
            for key, delta in message["data"].items():
                self.hp[key] = 0 if key in self.depleted else max(0, min(self.maximum[key], self.hp[key] + delta))
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def update(self):
        engine = self.engine
        if engine.battleState != self.const.BattleState.BS_STARTED:
            return
        if self.started is None:
            self.started = engine.now_time()
        reached_window = self.seconds() >= self.settings["windowSeconds"]
        if reached_window and self.expiry is None and engine.hpChangedCache:
            # Account for hits before the cutoff even when the next periodic
            # room message has not been sent yet.
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
            engine.hpChangedCache.clear()
        hp = self.hp["1"]
        if engine.state == 2:
            order = [pos for pos in self.defeat_order if self.hp[str(pos)] == 0]
            if order != self.sent_order:
                self.sent_order = order
                engine.onRecvOtherTeamMsg({"op": "new_ds_skill", "real_kill_order": order})
        if self.expiry is None and engine.state == 4 and hp == 0:
            # Complete the original room settlement once the local attack has
            # emptied the authoritative pool. There are no other teams or ranks.
            self.room_win = True
            engine.onRecvOtherTeamMsg({"op": "battle_win", "tc": self.seconds(), "uc": 1})
            return
        if self.pending_win:
            raise RuntimeError("The original Night Wraith ended before verifying the final shared pool")
        if self.expiry is not None:
            return
        if reached_window:
            self.expiry = self.seconds(), engine.myTotalDmg, self.hp["1"], self.sent_order.copy(), self.phases.copy()
            engine.forceBattleEnd("time_out", {})
            return
        next_state = engine.state + 1
        threshold = {1: .90, 3: .35}.get(engine.state)
        if engine.state != self.queued:
            return
        if ((threshold is not None and hp <= self.maximum["1"] * threshold)
                or engine.state == 2 and len(self.sent_order) == len(ELITE_POSITIONS)):
            self.queued = next_state
            engine.onRecvOtherTeamMsg({"op": "ch_st", "status": next_state,
                                       "param": {"random_kill_order": self.settings["musicOrder"],
                                                 "real_kill_order": self.sent_order}})

    def report(self, completed, outcome):
        if self.started is None or not self.phases or outcome == "win" and (
                not self.room_win or self.phases[-1]["phase"] != 4 or self.hp["1"] != 0):
            raise RuntimeError("The original Night Wraith did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        seconds, damage, hp, order, phases = self.expiry or (
            self.seconds(), self.engine.myTotalDmg, self.hp["1"], self.sent_order, self.phases)
        return {"settings": self.settings, "reason": reason, "damage": damage, "combatSeconds": seconds,
                "phases": phases, "maximumHp": self.maximum["1"], "bossHp": hp, "eliteDefeatOrder": order}
