"""Replay ordinary Longche through the original group engine and summons."""
from math import isfinite

LONGCHE_MODE, LONGCHE_STAGE, LONGCHE_SCENE = 3006, 25002, 40010
LONGCHE_WINDOW, LONGCHE_WALL_SECONDS = 1200, 300
BOSS = 90
ELITES = {2: 152, 4: 159, 5: 156, 6: 151}
REPAIR = {7: 91, 8: 92}
PAPERS = {2: 99, 4: 99}
STATES = {"slime": 1, "flee": 2, "repair": 3, "gift": 4}
FORMATIONS = {"flee": ELITES, "repair": REPAIR, "gift": PAPERS}
SUMMONS = {421: "slime", 422: "flee", 426: "repair", 423: "gift"}
SOURCES = {
    "battleengine.engine.LongCheBossEngine": "5fe8e20a505c79306ab8c90f10295b3f472d64b3b55d5e5e80c55a7a2ced8067",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.skill.SkillComp_420": "0bded3732c17e44f78a59ac395d1ada12f871cd0fedddbc428952e82bfa1effb",
    "battleengine.skill.SkillComp_421": "1086f9d47872068c44b195615f247c34d2f702d253dc662e935cac738ff8f10e",
    "battleengine.skill.SkillComp_422": "8a3560c11dac105c8ebe7b53795b58cfec62bebc01d8d329b4d01d78e9e9ec7f",
    "battleengine.skill.SkillComp_423": "d179837945003d6aa686c2fe906380cd4779d8df04bb9c68c27a39fe62f1a06a",
    "battleengine.skill.SkillComp_424": "1f31bebbf83215595cfc0a450f5789a0738730ff399a4cf53e10ca6007274be3",
    "battleengine.skill.SkillComp_426": "1be50d8b79605cabdd6bc6f7e71c6fe3b52e279cc8898566701e4b6bc1ebbf04",
    "battleengine.skill.SkillComp_433": "f9590a23006032dcc8555b60f4c0f30600ed7cc4768ef3b57aff54c9919100f2",
    "scenemembers.LongCheBossScene": "2034e3da3165c6a53c2f114908c89f03073e408f23cc6cc32728ae3dabe6b006",
}


def valid_longche_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "repairSeconds", "commanderId"}
            and type(settings["windowSeconds"]) is int and 1 <= settings["windowSeconds"] <= LONGCHE_WINDOW
            and type(settings["repairSeconds"]) is int and 1 <= settings["repairSeconds"] <= 150
            and type(settings["commanderId"]) is int and settings["commanderId"] in ELITES.values())


class LongcheReplay:
    def __init__(self, modules, settings):
        from battleengine.engine.LongCheBossEngine import LongCheBossEngine, const
        from DynamicConfigData import (BattleMonstersInfo, DATA_CONSTANT, DATA_CONTRAST, DATA_PVE_STAGE_DATA,
                                       DATA_TROOPS)

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCES.items()):
            raise RuntimeError("The original Longche engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(LONGCHE_STAGE)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if (self.group["ID"] != LONGCHE_STAGE or self.group["resindex"] != LONGCHE_SCENE
                or stage["shishentotal"] != 5 or self.group["MonstersInfos"] != [[[1, BOSS, 40, 1, 0]]]):
            raise RuntimeError("The original Longche opening changed")
        for state, wave in (("flee", 200), ("repair", 300), ("gift", 400)):
            opening = {pos: row for pos, row in enumerate(DATA_TROOPS.data[wave, 1]["monsterWaves"], 2) if row}
            if opening != {pos: [unit, 40] for pos, unit in FORMATIONS[state].items()}:
                raise RuntimeError("The original Longche formation changed")
        self.constants = {key: DATA_CONSTANT.data[key]["value"][0] for key in (3606, 3619, 3622, 3625)}
        if self.constants != {3606: 1200, 3619: .6, 3622: .1, 3625: .12}:
            raise RuntimeError("The original Longche constants changed")
        self.settings, self.const = settings, const
        self.commander = settings["commanderId"]
        self.clue = DATA_CONTRAST.data[self.commander]["contrastid"]
        self.ground_ids = {unit[0] for (wave, _), row in DATA_TROOPS.data.items() if wave == 100
                           for unit in row["monsterWaves"] if unit} | {95, 98}
        self.son = {"1": self.commander}
        self.started = self.expiry = self.victory = None
        self.hp, self.maximum, self.units = {}, {}, {}
        self.phases, self.repairs, self.clues, self.commander_kills, self.ground_waves = [], [], [], [], []
        self.observed, self.queued = None, "slime"
        self.flights = iter((.8, .6, .4, .2))
        self.next_flight = next(self.flights)
        self.engine = engine = LongCheBossEngine({
            "pve_data_flag": str(LONGCHE_STAGE), "fbUid": "local-longche", "teamUid": 1, "team": self,
            "status_info": {"status": 1, "son": self.son}, "atk_set": 2500, "cal_num": 5,
        })
        engine.battleMode = const.BattleMode.MODE_LONGCHE
        if engine.battleMode != LONGCHE_MODE or engine.state_dict != {number: state for state, number in STATES.items()}:
            raise RuntimeError("The original Longche battle mode changed")
        self.change = engine.change_to_state
        self.on_clue = engine.send_son_msg
        engine.change_to_state = self.observe_switch
        engine.send_son_msg = self.observe_clue

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def flush(self):
        engine = self.engine
        if engine.hpChangedCache:
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
            engine.hpChangedCache.clear()

    def sync_hp(self):
        self.engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def observe_switch(self, state, message):
        if self.started is not None and state != self.observed:
            self.flush()
            self.units.clear()
            pending = message["param"].get("resethp", {})
            self.hp = {"1": self.hp["1"], **pending}
            self.maximum = {"1": self.maximum["1"], **pending}
            self.sync_hp()
        self.change(state, message)

    def observe_summon(self, monsters, from_skill, *args, **kwargs):
        phase = SUMMONS[from_skill]
        units = {} if phase == "slime" else self.units
        engine = self.engine
        create = engine.createMonsterEntity

        def observe(camp, owner, placement, *extra, **options):
            unit = create(camp, owner, placement, *extra, **options)
            if unit.posIndex in units:
                raise RuntimeError("The original Longche spawned an overlapping position")
            units[unit.posIndex] = unit
            return unit

        engine.createMonsterEntity = observe
        try:
            result = self.summon(monsters, from_skill, *args, **kwargs)
        finally:
            engine.createMonsterEntity = create
        if phase == "slime" and units:
            if any(unit.protoid not in self.ground_ids for unit in units.values()):
                raise RuntimeError("The original Longche spawned an unknown ground troop")
            self.ground_waves.append({"seconds": self.seconds(), "units": [
                {"id": unit.protoid, "position": pos} for pos, unit in sorted(units.items())]})
        if phase in ("flee", "repair") and any(unit.uid not in engine.sharedEntityUids for unit in units.values()):
            raise RuntimeError("The original Longche omitted shared health on summon")
        return result

    def observe_clue(self, unit_id):
        if unit_id != self.clue:
            raise RuntimeError("The original Longche reported a different commander clue")
        self.clues.append({"seconds": self.seconds(), "commanderId": self.commander, "unitId": unit_id})
        return self.on_clue(unit_id)

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another Longche room")
        op = message["op"]
        if op == "hp_change":
            for key, delta in message["data"].items():
                if key not in self.hp:
                    raise RuntimeError("Longche room received a hit for a different phase")
                hp = min(self.maximum[key], self.hp[key] + delta)
                self.hp[key] = 0 if hp <= 1 else hp
            self.sync_hp()
        elif op == "add_buff":
            engine.onRecvOtherTeamMsg(message)
        elif op == "battle_win":
            boss = engine.boss_long_che
            if boss.AttrComp.hp > 0 or boss.lifeState != self.const.CombatState.DEAD:
                raise RuntimeError("Longche settled before the original boss died")
            self.hp["1"] = 0
            self.victory = self.snapshot()

    def send_state(self, state):
        engine = self.engine
        params = {"stime": engine.now_time(), "son": self.son}
        if state in ("flee", "repair"):
            params["monster_id"] = [200 if state == "flee" else 300, 1]
            params["resethp"] = {str(pos): engine.calcSingleSharedMonMaxHp(unit, 2500, 5)
                                 for pos, unit in FORMATIONS[state].items()}
            if any(not isfinite(hp) or hp <= 1 for hp in params["resethp"].values()):
                raise RuntimeError("Longche calculated invalid shared health")
        self.queued = state
        engine.onRecvOtherTeamMsg({"op": "ch_st", "status": STATES[state], "param": params})

    def record_phase(self, state):
        engine = self.engine
        if {pos: unit.protoid for pos, unit in self.units.items()} != FORMATIONS.get(state, {}):
            raise RuntimeError("The original Longche spawned a different formation")
        opening = []
        for pos, unit in sorted(self.units.items()):
            row = {"id": unit.protoid, "position": pos, "level": unit.AttrComp.level}
            if state == "flee":
                row["commander"] = getattr(unit, "is_son_boss", False)
                if row["commander"] != (unit.protoid == self.commander):
                    raise RuntimeError("The original Longche selected a different commander")
            opening.append(row)
        self.observed = state
        self.phases.append({"phase": state, "seconds": self.seconds(), "damage": engine.myTotalDmg,
                            "bossHp": engine.boss_long_che.AttrComp.hp, "opening": opening})

    def finish_window(self):
        if self.expiry is None and self.victory is None and not self.engine.waiting_battle_end:
            self.flush()
            self.expiry = self.snapshot()
            self.engine.forceBattleEnd("time_out", {})

    def resolve_repair(self, rates, timeout):
        engine, boss = self.engine, self.engine.boss_long_che
        self.flush()
        interrupted = not timeout and max(rates) <= self.constants[3622]
        healed = 0
        if not interrupted:
            before = boss.AttrComp.hp
            amount = min(boss.AttrComp.maxHp - before, boss.AttrComp.maxHp * self.constants[3625])
            engine.onRecvOtherTeamMsg({"op": "recoverhp", "data": {"1": amount}})
            healed = boss.AttrComp.hp - before
            if abs(healed - amount) > 1e-6:
                raise RuntimeError("The original Longche did not apply repair healing")
            self.hp["1"] = boss.AttrComp.hp
            self.sync_hp()
        self.repairs.append({"seconds": self.seconds(), "interrupted": interrupted, "timeout": timeout,
                             "remaining": rates, "healed": healed})
        self.send_state("gift" if interrupted else "slime")

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        boss = engine.boss_long_che
        if self.started is None:
            if boss.protoid != BOSS or boss.posIndex != 1:
                raise RuntimeError("The original Longche generated a different opening")
            self.started = engine.now_time()
            self.hp["1"] = self.maximum["1"] = boss.AttrComp.maxHp
            summon = boss.SkillMgrComp.getSkillById(420)
            self.summon = summon.summon_mon
            summon.summon_mon = self.observe_summon
            self.record_phase("slime")
            engine.delayExec(self.settings["windowSeconds"] * 1000, self.finish_window)
        state = engine.state
        if state != self.queued or engine.switch_state != const.LC_SWITCH_STATE.SWITCHED:
            return
        if state != self.observed:
            if len(self.units) != len(FORMATIONS.get(state, {})):
                return
            self.record_phase(state)
        hp_rate = boss.AttrComp.hp / boss.AttrComp.maxHp
        if state == "slime" and hp_rate <= self.next_flight:
            self.next_flight = next(self.flights, 0)
            self.send_state("flee")
        elif state == "flee" and any(unit.protoid == self.commander and unit.lifeState == const.CombatState.DEAD
                                    for unit in self.units.values()):
            self.commander_kills.append(self.seconds())
            self.send_state("repair" if hp_rate < self.constants[3619] else "slime")
        elif state == "repair":
            rates = [max(0, unit.AttrComp.hp / unit.AttrComp.maxHp) for _, unit in sorted(self.units.items())]
            if min(rates) <= 0:
                self.resolve_repair(rates, False)
            elif self.seconds() - self.phases[-1]["seconds"] >= self.settings["repairSeconds"]:
                self.resolve_repair(rates, True)
        elif state == "gift" and all(unit.lifeState == const.CombatState.DEAD for unit in self.units.values()):
            self.send_state("slime")

    def snapshot(self):
        engine = self.engine
        return {"settings": self.settings, "combatSeconds": self.seconds(), "damage": engine.myTotalDmg,
                "phases": self.phases.copy(), "bossHp": self.hp["1"], "maximumHp": self.maximum["1"],
                "clues": self.clues.copy(), "commanderKills": self.commander_kills.copy(), "repairs": self.repairs.copy(),
                "groundWaves": self.ground_waves.copy(),
                "papersDefeated": engine.kill_gift_paper_man, "groundPapersDefeated": engine.kill_slime_paper_man}

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        if not data["phases"] or outcome == "win" and (not self.victory or data["bossHp"] != 0):
            raise RuntimeError("The original Longche did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
