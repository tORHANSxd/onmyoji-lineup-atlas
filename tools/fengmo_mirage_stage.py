"""Run Mirage encounters through the original phase and skill handlers."""
from math import isfinite

MIRAGE_MODE, MIRAGE_STAGE, MIRAGE_SCENE = 3013, 25015, 40021
MIRAGE_X_MODE, MIRAGE_X_STAGE = 1024, 25019
MIRAGE_WINDOW, MIRAGE_WALL_SECONDS = 1200, 300
BOSS, GENERAL, PAPER, MIRROR_HP = 9991106, 9991107, 9991112, 9991117
SIDE_POSITIONS = (2, 3, 4, 5, 6)
STATES = {"normal": 1, "crab": 2, "elite": 3, "house": 4, "mirror": 5, "burst": 6}
TRAITS = (63402, 63601, 63404, 63602, 63405, 63603, 63406)
FALSE_MIRROR_BUFFS, MIST_SHIELD = (7591, 7592), 7611
MIRAGE_SOURCES = {
    "battleengine.engine.ShenQiLouEngine": "518b9c64884f989659ed828c66a397989958fc4e067e3c540799c5b87074f3dc",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.skill.SkillComp_750": "606f300740868eb8416b4bd011b48e411f194510c7db6d076e98d09cf214ff15",
    "battleengine.skill.SkillComp_759": "898e32f20cc597266676d93522310c2600efe28ad0bb35bc30401d929f916ef4",
    "scenemembers.ShenQiLouScene": "9b9cf48dcb9ead2c407c028a3e65d03e60a8caeae8f2dd1682b8627b4155ffa5",
}
EXTREME_SOURCES = {
    "battleengine.engine.ShenQiLouXBattleEngine": "2823f01d5a8df937af882e1bcbab9fe58ebf12c3512193445fc88730e3bc5bf9",
    "scenemembers.ShenQiLouXBattleScene": "add3c34bff3b6c543677eaaa51788fd700396e4b91e1ab1c74e8db09fe3288b1",
}


def valid_mirage_settings(settings):
    if type(settings) is not dict or set(settings) != {"windowSeconds", "generalSeconds", "truePositions"}:
        return False
    window, delay, positions = settings["windowSeconds"], settings["generalSeconds"], settings["truePositions"]
    return (type(window) is int and 1 <= window <= MIRAGE_WINDOW and type(delay) is int and 0 <= delay <= 120
            and type(positions) is list and len(positions) == 2
            and all(type(position) is int and position in SIDE_POSITIONS for position in positions)
            and positions[0] != positions[1])


def valid_mirage_x_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "generalSeconds", "truePositions", "trait", "weeklySeconds"}
            and valid_mirage_settings({key: settings[key] for key in ("windowSeconds", "generalSeconds", "truePositions")})
            and type(settings["trait"]) is int and settings["trait"] in TRAITS
            and type(settings["weeklySeconds"]) is int and 1 <= settings["weeklySeconds"] <= MIRAGE_WINDOW)


class MirageReplay:
    def __init__(self, modules, settings, *, extreme=False):
        from battleengine.engine.ShenQiLouEngine import ShenQiLouEngine, const
        from com.data.cdata import dizhennian_stage
        from DynamicConfigData import BattleMonstersInfo, DATA_CONSTANT, DATA_MONSTER, DATA_PVE_STAGE_DATA

        self.extreme, self.settings = extreme, settings
        engine_type, stage_id, mode = ShenQiLouEngine, MIRAGE_STAGE, const.BattleMode.MODE_SHENQILOU
        sources, troops, room = MIRAGE_SOURCES, dizhennian_stage.data, {}
        offset = -5000000 if extreme else 0
        self.boss_id, self.general, self.paper, self.mirror_hp = (unit + offset for unit in (BOSS, GENERAL, PAPER, MIRROR_HP))
        self.weekly = ()
        self.trait_recipients, self.false_mirror_deaths, self.mist_changes = [], [], []
        self.mist_active = False
        if extreme:
            from battleengine.engine.ShenQiLouXBattleEngine import ShenQiLouXBattleEngine
            from com.data.cdata import dizhennianx_stage

            engine_type, stage_id, mode = ShenQiLouXBattleEngine, MIRAGE_X_STAGE, const.BattleMode.MODE_SHEN_QI_LOU_X_BATTLE
            sources, troops = {**MIRAGE_SOURCES, **EXTREME_SOURCES}, dizhennianx_stage.data
            if tuple(DATA_CONSTANT.data[10631]["value"]) != TRAITS or DATA_CONSTANT.data[10900]["value"] != [480]:
                raise RuntimeError("The original extreme Mirage room constants changed")
            self.weekly = (settings["weeklySeconds"],)
            hp = self.shared_hp(engine_type, self.boss_id)
            room = {"event4_avg_time": self.weekly[0], "event4_skill_buff": [0, settings["trait"]], "hp": {"1": hp}}
        if any(modules.rows[name]["marshalSHA256"] != value for name, value in sources.items()):
            raise RuntimeError("The original Mirage engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if (self.group["ID"] != stage_id or self.group["resindex"] != MIRAGE_SCENE or stage["shishentotal"] != 5
                or self.group["MonstersInfos"] != [[[1, self.boss_id, 40, 1, 0]]]
                or any(troops[key, 1]["monsterWaves"] != [[unit, 40]] * 5
                       for key, unit in ((1100, self.general), (1200, self.paper), (1300, self.mirror_hp)))):
            raise RuntimeError("Unexpected original Mirage configuration")

        self.const, self.monsters = const, DATA_MONSTER.data
        self.burst_seconds, = DATA_CONSTANT.data[4013]["value"]
        self.fallback, = DATA_CONSTANT.data[4021]["value"]
        if self.burst_seconds != 80 or self.fallback != GENERAL:
            raise RuntimeError("The original Mirage constants changed")
        self.started, self.expiry, self.victory = None, None, None
        self.phases, self.hp, self.maximum, self.slots, self.roster = [], {}, {}, {}, []
        self.queued, self.observed = "normal", None
        self.engine = engine = engine_type({
            "pve_data_flag": str(stage_id), "fbUid": "local-mirage", "teamUid": 1, "team": self,
            "status_info": {"status": STATES["normal"]}, "atk_set": 2500, "cal_num": 5, **room,
        })
        engine.battleMode = mode
        if mode != (MIRAGE_X_MODE if extreme else MIRAGE_MODE) or engine.state_dict != {number: name for name, number in STATES.items()}:
            raise RuntimeError("The original Mirage battle mode changed")
        self.change = engine.change_to_state
        engine.change_to_state = self.observe_switch
        if extreme:
            self.on_death = engine.onMonsterDie
            engine.onMonsterDie = self.observe_death

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def shared_hp(self, engine, unit):
        hp = engine.calcSingleSharedMonMaxHp(unit, 2500, 5, *self.weekly)
        if not isfinite(hp) or hp <= 1:
            raise RuntimeError("The original Mirage shared health formula changed")
        return hp

    def check_selected(self, entity):
        trait = self.settings["trait"]
        if self.engine.playerSkill != trait or not entity.SkillMgrComp.getSkillById(trait):
            raise RuntimeError("The original extreme Mirage trait was absent on a selected character")
        self.trait_recipients.append(entity.protoid)

    def observe_death(self, unit):
        self.on_death(unit)
        if (self.engine.state == "mirror" and self.slots.get(unit.posIndex) is unit
                and not getattr(unit, "mirror_real", False) and not getattr(unit, "boss_kill", False)):
            affected = [position for position, survivor in sorted(self.slots.items())
                        if getattr(survivor, "is_elite", False) and survivor.lifeState == self.const.CombatState.ALIVE]
            if any(not all(self.slots[pos].BuffMgrComp.getBuffCount(buff) for buff in FALSE_MIRROR_BUFFS)
                   for pos in affected):
                raise RuntimeError("The original extreme Mirage omitted the false mirror penalty")
            self.false_mirror_deaths.append({"position": unit.posIndex, "seconds": self.seconds(), "buffedPositions": affected})

    def observe_mist(self, boss):
        if boss.lifeState == self.const.CombatState.ALIVE:
            active = bool(boss.BuffMgrComp.getBuffCount(MIST_SHIELD))
            if active != self.mist_active:
                self.mist_changes.append({"seconds": self.seconds(), "active": active})
                self.mist_active = active

    def flush(self):
        engine = self.engine
        if engine.hpChangedCache:
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
            engine.hpChangedCache.clear()

    def observe_switch(self, state, commands):
        engine = self.engine
        if state != engine.state:
            self.flush()
            self.slots.clear()
            self.hp = {"1": self.hp["1"]}
            self.maximum = {"1": self.maximum["1"]}
            pending_hp = commands["param"].get("hp", {})
            self.hp.update(pending_hp)
            self.maximum.update(pending_hp)
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})
        self.change(state, commands)

    def observe_summon(self, unit_id, position, *args, **kwargs):
        unit = self.summon(unit_id, position, *args, **kwargs)
        if position not in SIDE_POSITIONS or position in self.slots:
            raise RuntimeError("The original Mirage spawned an unexpected position")
        self.slots[position] = unit
        return unit

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another Mirage room")
        op = message["op"]
        if op == "select_hero":
            self.roster = list(message["data"])
        elif op == "battle_win":
            boss = engine.boss_entity
            if boss.AttrComp.hp > 0 or boss.lifeState != self.const.CombatState.DEAD:
                raise RuntimeError("The original Mirage settled before the boss was defeated")
            # This engine rounds each signed HP delta toward zero.
            self.hp["1"] = 0
            self.victory = self.snapshot()
        elif op == "hp_change":
            for key, delta in message["data"].items():
                if key not in self.hp:
                    raise RuntimeError("The Mirage room received a hit for a different phase")
                hp = min(self.maximum[key], self.hp[key] + delta)
                self.hp[key] = 0 if hp <= 1 else hp
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def send_state(self, state):
        engine = self.engine
        params = {"stime": engine.now_time()}
        if state in ("elite", "mirror"):
            source = self.general if state == "elite" else self.mirror_hp
            maximum = self.shared_hp(engine, source)
            params["hp"] = dict.fromkeys(map(str, SIDE_POSITIONS), maximum)
        if state == "mirror":
            params["mirror_data"] = self.roster.copy()
            params["mirror_real"] = list(map(str, self.settings["truePositions"]))
        self.queued = state
        engine.onRecvOtherTeamMsg({"op": "ch_st", "status": STATES[state], "param": params})

    def record_phase(self, state):
        engine = self.engine
        expected = {"elite": [self.general] * 5, "house": [self.paper] * 5,
                    "mirror": [unit_id if unit_id in self.monsters else self.fallback for unit_id in self.roster]}.get(state, [])
        opening = [{"id": unit.protoid, "position": pos, "level": unit.AttrComp.level}
                   for pos, unit in sorted(self.slots.items())]
        if [row["id"] for row in opening] != expected:
            raise RuntimeError("The original Mirage spawned an unexpected formation")
        if state == "mirror":
            true_positions = sorted(pos for pos, unit in self.slots.items() if getattr(unit, "mirror_real", False))
            if true_positions != sorted(self.settings["truePositions"]):
                raise RuntimeError("The original Mirage generated different true mirrors")
            for row in opening:
                row["trueMirror"] = row["position"] in true_positions
        if state in ("elite", "mirror"):
            for pos, unit in self.slots.items():
                key = str(pos)
                if unit.uid not in engine.sharedEntityUids:
                    raise RuntimeError("The original Mirage did not register shared health")
                maximum = unit.AttrComp.maxHp
                self.maximum[key] = maximum
                self.hp[key] = min(maximum, self.hp[key])
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})
        if state in ("burst", "crab"):
            active = state == "burst"
            const = self.const
            allies = engine.getEntities(const.CampFlag.CAMP1, entityTypes=[const.EntityTypeFlag.HERO])
            if (bool(engine.boss_entity.BuffMgrComp.getBuffCount(752)) != active
                    or any(bool(ally.BuffMgrComp.getBuffCount(760)) != active for ally in allies)):
                raise RuntimeError("The original Mirage did not apply or remove the burst effects")
        self.observed = state
        self.phases.append({"phase": state, "seconds": self.seconds(), "damage": engine.myTotalDmg,
                            "bossHp": self.hp["1"], "opening": opening})

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        if self.started is None:
            self.started = engine.now_time()
            boss = engine.boss_entity
            if boss.protoid != self.boss_id or boss.posIndex != 1 or len(self.roster) != 5:
                raise RuntimeError("The original Mirage generated a different opening")
            self.hp["1"] = self.maximum["1"] = boss.AttrComp.maxHp
            skill = boss.SkillMgrComp.getSkillById(759)
            self.summon = skill.summon_mon
            skill.summon_mon = self.observe_summon
        if self.extreme:
            self.observe_mist(engine.boss_entity)
        state, elapsed = engine.state, self.seconds()
        switched = engine.switch_state == const.LC_SWITCH_STATE.SWITCHED
        if state != self.observed and switched and (state not in ("elite", "house", "mirror") or len(self.slots) == 5):
            self.record_phase(state)
        if self.expiry is not None:
            return
        if elapsed >= self.settings["windowSeconds"]:
            self.flush()
            self.expiry = self.snapshot()
            engine.forceBattleEnd("time_out", {})
            return
        if state != self.observed or state != self.queued:
            return
        duration = elapsed - self.phases[-1]["seconds"]

        def defeated(pos):
            return self.slots[pos].lifeState == const.CombatState.DEAD or self.hp.get(str(pos)) == 0

        if state == "normal" and duration >= self.settings["generalSeconds"]:
            self.send_state("elite")
        elif state == "elite" and all(defeated(pos) for pos in SIDE_POSITIONS):
            self.send_state("house")
        elif state == "house" and all(defeated(pos) for pos in SIDE_POSITIONS):
            self.send_state("mirror")
        elif state == "mirror" and all(defeated(pos) for pos in self.settings["truePositions"]):
            self.send_state("burst")
        elif state == "burst" and duration >= self.burst_seconds:
            self.send_state("crab")
        elif state == "crab":
            self.send_state("normal")

    def snapshot(self):
        data = {"settings": self.settings, "combatSeconds": self.seconds(), "damage": self.engine.myTotalDmg,
                "phases": self.phases.copy(), "bossHp": self.hp["1"], "maximumHp": self.maximum["1"],
                "mirrorRoster": self.roster, "burstSeconds": self.burst_seconds}
        if self.extreme:
            data.update(traitRecipients=self.trait_recipients.copy(), falseMirrorDeaths=self.false_mirror_deaths.copy(),
                        mistChanges=self.mist_changes.copy())
        return data

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        if (not data["phases"] or self.extreme and len(self.trait_recipients) != 6
                or outcome == "win" and (not self.victory or data["bossHp"] != 0)):
            raise RuntimeError("The original Mirage did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
