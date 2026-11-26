"""Replay Longche through the original group engines and summons."""
from math import isfinite

LONGCHE_MODE, LONGCHE_STAGE, LONGCHE_SCENE = 3006, 25002, 40010
LONGCHE_X_MODE, LONGCHE_X_STAGE, BOSS_X = 4443, 25027, 100290
LONGCHE_WINDOW, LONGCHE_WALL_SECONDS = 1200, 300
BOSS = 90
ELITES = {2: 152, 4: 159, 5: 156, 6: 151}
REPAIR = {7: 91, 8: 92}
PAPERS = {2: 99, 4: 99}
STATES = {"slime": 1, "flee": 2, "repair": 3, "gift": 4}
FORMATIONS = {"flee": ELITES, "repair": REPAIR, "gift": PAPERS}
SUMMONS = {421: "slime", 422: "flee", 426: "repair", 423: "gift"}
EXTREME_FLEE = {pos: unit + 99000 for pos, unit in ELITES.items()}
EXTREME_REPAIR = {5: 101, 6: 103, 7: 102, 8: 104}
REPAIR_GROUPS = ((101, 103), (102, 104))
ABSORPTION_BUFFS = {101: None, 102: None, 103: 417, 104: 418}
TRAITS = (63402, 63601, 63404, 63602, 63405, 63603, 63406)
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
EXTREME_SOURCES = {
    "battleengine.engine.LongCheXEngine": "a645028ed5310f722403dc76c148b9968f1fab4fc595ae5c72ef3045d12c2f83",
    "battleengine.skill.SkillComp_4201": "625738e65691a6e5817d39881f7db68b82c0ecfdc3af0d17ced0dde816015af3",
    "battleengine.skill.SkillComp_4202": "3027fa76bb4bd88626fba23aa757adc3207ff0147def7fbfdd1729f0ec1280e7",
    "battleengine.skill.SkillComp_428": "9617885dd4ab6adc63440d2242f6e32b60b45c1b6dbbe26c14cd432b9881caae",
    "battleengine.skill.SkillComp_429": "0318bcd601727763fa38faadd9040b206039448e617ec2a8f105d0fc9d4e7081",
    "battleengine.skill.SkillComp_430": "ab100bd6b4020ade2f5f2d1e89e3a0cb58edcef696015a48f6cfe5cf3a878feb",
    "scenemembers.LongCheXScene": "37dd5c49175afa11655f30fc257e8f739b92a99fb4c798cec2937cd96ff922f9",
}


def valid_longche_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "repairSeconds", "commanderId"}
            and type(settings["windowSeconds"]) is int and 1 <= settings["windowSeconds"] <= LONGCHE_WINDOW
            and type(settings["repairSeconds"]) is int and 1 <= settings["repairSeconds"] <= 150
            and type(settings["commanderId"]) is int and settings["commanderId"] in ELITES.values())


def valid_longche_x_settings(settings):
    if type(settings) is not dict or set(settings) != {
        "windowSeconds", "repairSeconds", "commanderId", "trait", "weeklySeconds", "repairOrder"
    }:
        return False
    order = settings["repairOrder"]
    return (type(settings["commanderId"]) is int and settings["commanderId"] in EXTREME_FLEE.values()
            and valid_longche_settings({"windowSeconds": settings["windowSeconds"], "repairSeconds": settings["repairSeconds"],
                                        "commanderId": settings["commanderId"] - 99000})
            and type(settings["trait"]) is int and settings["trait"] in TRAITS
            and type(settings["weeklySeconds"]) is int and 1 <= settings["weeklySeconds"] <= LONGCHE_WINDOW
            and type(order) is list and len(order) == 4 and all(type(unit) is int for unit in order)
            and set(order) == set(EXTREME_REPAIR.values()))


class LongcheReplay:
    def __init__(self, modules, settings, *, extreme=False):
        from battleengine.engine.LongCheBossEngine import LongCheBossEngine, const
        from DynamicConfigData import (BattleMonstersInfo, DATA_CONSTANT, DATA_CONTRAST, DATA_PVE_STAGE_DATA,
                                       DATA_TROOPS)

        self.extreme, self.settings = extreme, settings
        engine_type, stage_id, mode = LongCheBossEngine, LONGCHE_STAGE, const.BattleMode.MODE_LONGCHE
        sources, room = SOURCES, {}
        self.boss_id, self.formations, self.states, self.summons = BOSS, FORMATIONS, STATES, SUMMONS
        self.troops = {"flee": 200, "repair": 300, "gift": 400}
        self.weekly = ()
        self.trait_recipients, self.repair_deaths, self.retributions = [], [], []
        if extreme:
            from battleengine.engine.LongCheXEngine import LongCheXEngine

            engine_type, stage_id, mode = LongCheXEngine, LONGCHE_X_STAGE, const.BattleMode.MODE_LONGCHE_X
            sources = {**SOURCES, **EXTREME_SOURCES}
            self.boss_id = BOSS_X
            self.formations = {"flee": EXTREME_FLEE, "repair": EXTREME_REPAIR, "gift": PAPERS}
            self.troops.update(flee=600, repair=500)
            self.summons = {**SUMMONS, 428: "repair"}
            self.states = {**STATES, "repair_success": 5}
            self.repair_threshold = DATA_CONSTANT.data[3611]["value"][0]
            self.weekly = (settings["weeklySeconds"],)
            hp = self.shared_hp(engine_type, self.boss_id)
            room = {"event4_avg_time": self.weekly[0], "event4_skill_buff": [0, settings["trait"]], "hp": {"1": hp}}
            if (LongCheXEngine.REPAIR_MONSTER_GROUPS != REPAIR_GROUPS
                    or LongCheXEngine.REPAIR_MONSTER_BUFF != ABSORPTION_BUFFS
                    or tuple(DATA_CONSTANT.data[10631]["value"]) != TRAITS or DATA_CONSTANT.data[10900]["value"] != [480]
                    or self.repair_threshold != .3):
                raise RuntimeError("The original extreme Longche room constants changed")
        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in sources.items()):
            raise RuntimeError("The original Longche engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if (self.group["ID"] != stage_id or self.group["resindex"] != LONGCHE_SCENE
                or stage["shishentotal"] != 5 or self.group["MonstersInfos"] != [[[1, self.boss_id, 40, 1, 0]]]):
            raise RuntimeError("The original Longche opening changed")
        for state, wave in self.troops.items():
            opening = {pos: row for pos, row in enumerate(DATA_TROOPS.data[wave, 1]["monsterWaves"], 2) if row}
            if opening != {pos: [unit, 40] for pos, unit in self.formations[state].items()}:
                raise RuntimeError("The original Longche formation changed")
        if extreme:
            self.formations["repair"] = dict(zip(EXTREME_REPAIR, settings["repairOrder"]))
        self.constants = {key: DATA_CONSTANT.data[key]["value"][0] for key in (3606, 3619, 3622, 3625)}
        if self.constants != {3606: 1200, 3619: .6, 3622: .1, 3625: .12}:
            raise RuntimeError("The original Longche constants changed")
        self.const = const
        self.commander = settings["commanderId"]
        clue_id = self.commander - 99000 if extreme else self.commander
        self.clue = DATA_CONTRAST.data[clue_id]["contrastid"]
        self.ground_ids = {unit[0] for (wave, _), row in DATA_TROOPS.data.items() if wave == 100
                           for unit in row["monsterWaves"] if unit} | {95, 98}
        self.son = {"1": self.commander}
        self.started = self.expiry = self.victory = None
        self.hp, self.maximum, self.units = {}, {}, {}
        self.phases, self.repairs, self.clues, self.commander_kills, self.ground_waves = [], [], [], [], []
        self.observed, self.queued = None, "slime"
        self.flights = iter((.8, .6, .4, .2))
        self.next_flight = next(self.flights)
        self.engine = engine = engine_type({
            "pve_data_flag": str(stage_id), "fbUid": "local-longche", "teamUid": 1, "team": self,
            "status_info": {"status": 1, "son": self.son}, "atk_set": 2500, "cal_num": 5, **room,
        })
        engine.battleMode = mode
        if mode != (LONGCHE_X_MODE if extreme else LONGCHE_MODE) or engine.state_dict != {number: state for state, number in self.states.items()}:
            raise RuntimeError("The original Longche battle mode changed")
        self.change = engine.change_to_state
        self.on_clue = engine.send_son_msg
        engine.change_to_state = self.observe_switch
        engine.send_son_msg = self.observe_clue
        if extreme:
            self.hp_changed = engine._onHpChanged
            engine._onHpChanged = self.observe_repair_hit

    def shared_hp(self, engine, unit):
        hp = engine.calcSingleSharedMonMaxHp(unit, 2500, 5, *self.weekly)
        if not isfinite(hp) or hp <= 1:
            raise RuntimeError("Longche calculated invalid shared health")
        return hp

    def check_selected(self, entity):
        trait = self.settings["trait"]
        if self.engine.playerSkill != trait or not entity.SkillMgrComp.getSkillById(trait):
            raise RuntimeError("The original extreme Longche trait was absent on a selected character")
        self.trait_recipients.append(entity.protoid)

    def observe_repair_hit(self, new_hp, old_hp, entity):
        self.hp_changed(new_hp, old_hp, entity)
        if self.engine.state != "repair" or self.queued != "repair" or not new_hp <= 0 < old_hp:
            return
        if entity.protoid in ABSORPTION_BUFFS and not any(row["id"] == entity.protoid for row in self.repair_deaths):
            pair = next(group for group in REPAIR_GROUPS if entity.protoid in group)
            peer = next(unit for unit in self.units.values() if unit.protoid in pair and unit is not entity)
            self.repair_deaths.append({"id": entity.protoid, "seconds": self.seconds(),
                                       "partnerHpRate": max(0, peer.AttrComp.hp / peer.AttrComp.maxHp)})

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
        result = self.change(state, message)
        if self.extreme and state in ("gift", "repair_success") and self.repairs and self.engine.state == state:
            buffs = self.engine.boss_long_che.BuffMgrComp
            self.repairs[-1]["absorptionBuffs"] = [buff for buff in (417, 418) if buffs.hasBuff(buff)]
        return result

    def observe_summon(self, monsters, from_skill, *args, **kwargs):
        phase = self.summons[from_skill]
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
            params["monster_id"] = [self.troops[state], 1]
            params["resethp"] = {str(pos): self.shared_hp(engine, unit)
                                 for pos, unit in self.formations[state].items()}
        if self.extreme and state == "repair":
            self.repair_deaths.clear()
            params["repair_monster_order"] = self.settings["repairOrder"]
        elif self.extreme and state in ("gift", "repair_success"):
            params["death_order"] = [row["id"] for row in self.repair_deaths]
        self.queued = state
        engine.onRecvOtherTeamMsg({"op": "ch_st", "status": self.states[state], "param": params})

    def record_phase(self, state):
        engine = self.engine
        if {pos: unit.protoid for pos, unit in self.units.items()} != self.formations.get(state, {}):
            raise RuntimeError("The original Longche spawned a different formation")
        if state == "repair_success":
            skill = engine.boss_long_che.SkillMgrComp.getSkillById(430)
            if skill.boss_state != state or not engine.boss_long_che.BuffMgrComp.hasBuff(skill.buffId2):
                raise RuntimeError("The original Longche did not apply its golden blessing")
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
        if self.extreme:
            deaths = {row["id"] for row in self.repair_deaths}
            interrupted = (not timeout and all(len(deaths.intersection(group)) == 1 for group in REPAIR_GROUPS)
                           and all(row["partnerHpRate"] > self.repair_threshold for row in self.repair_deaths))
        else:
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
        result = {"seconds": self.seconds(), "interrupted": interrupted, "timeout": timeout,
                  "remaining": rates, "healed": healed}
        if self.extreme:
            result.update(deaths=self.repair_deaths.copy(), absorptionBuffs=None)
        self.repairs.append(result)
        self.send_state("gift" if interrupted else "repair_success" if self.extreme else "slime")

    def watch_retribution(self, skill):
        cast = skill.OnCastHit

        def observe(*args, **kwargs):
            result = cast(*args, **kwargs)
            self.retributions.append(self.seconds())
            return result

        skill.OnCastHit = observe

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        boss = engine.boss_long_che
        if self.started is None:
            if boss.protoid != self.boss_id or boss.posIndex != 1:
                raise RuntimeError("The original Longche generated a different opening")
            self.started = engine.now_time()
            self.hp["1"] = self.maximum["1"] = boss.AttrComp.maxHp
            summon = boss.SkillMgrComp.getSkillById(420)
            self.summon = summon.summon_mon
            summon.summon_mon = self.observe_summon
            if self.extreme:
                self.watch_retribution(boss.SkillMgrComp.getSkillById(429))
            self.record_phase("slime")
            engine.delayExec(self.settings["windowSeconds"] * 1000, self.finish_window)
        state = engine.state
        if state != self.queued or engine.switch_state != const.LC_SWITCH_STATE.SWITCHED:
            return
        if state != self.observed:
            if len(self.units) != len(self.formations.get(state, {})):
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
            if self.extreme:
                killed = {row["id"] for row in self.repair_deaths}
                if all(killed.intersection(pair) for pair in REPAIR_GROUPS):
                    self.resolve_repair(rates, False)
                elif self.seconds() - self.phases[-1]["seconds"] >= self.settings["repairSeconds"]:
                    self.resolve_repair(rates, True)
            elif min(rates) <= 0:
                self.resolve_repair(rates, False)
            elif self.seconds() - self.phases[-1]["seconds"] >= self.settings["repairSeconds"]:
                self.resolve_repair(rates, True)
        elif state == "gift" and all(unit.lifeState == const.CombatState.DEAD for unit in self.units.values()):
            self.send_state("slime")

    def snapshot(self):
        engine = self.engine
        data = {"settings": self.settings, "combatSeconds": self.seconds(), "damage": engine.myTotalDmg,
                "phases": self.phases.copy(), "bossHp": self.hp["1"], "maximumHp": self.maximum["1"],
                "clues": self.clues.copy(), "commanderKills": self.commander_kills.copy(), "repairs": self.repairs.copy(),
                "groundWaves": self.ground_waves.copy(),
                "papersDefeated": engine.kill_gift_paper_man, "groundPapersDefeated": engine.kill_slime_paper_man}
        if self.extreme:
            data.update(traitRecipients=self.trait_recipients.copy(), retributions=self.retributions.copy())
        return data

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        if (not data["phases"] or self.extreme and len(self.trait_recipients) != 6
                or outcome == "win" and (not self.victory or data["bossHp"] != 0)):
            raise RuntimeError("The original Longche did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
