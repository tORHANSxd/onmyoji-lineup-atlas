"""Replay Earthquake Catfish over one local team's shared health."""
from math import isfinite

CATFISH_MODE, CATFISH_STAGE, CATFISH_SCENE = 3014, 25004, 40020
CATFISH_X_MODE, CATFISH_X_STAGE = 4442, 45004
CATFISH_WINDOW, CATFISH_WALL_SECONDS, OTHER_PLAYERS_LIMIT = 1200, 300, 299
BOSS, MONKEY, GATE, ASSIST = 9991030, 9991032, 9991031, 9991041
TRAITS = (63402, 63601, 63404, 63602, 63405, 63603, 63406)
EXTREME_ARMOR, EXTREME_MONKEY_BUFF, EXTREME_ARMOR_MAX = 70001, 70002, 10
FISH = {2: 9991247, 3: 9992247, 5: 9993247, 6: 9994247}
PAPERS = {3: 9991039, 5: 9991040}
STATES = {"normal": 1, "elite": 2, "flee": 3, "boom": 4, "flip": 5, "peace": 6}
GATE_SKILLS = {"boom": 506, "flip": 507}
CATFISH_SOURCES = {
    "battleengine.engine.DiZhenNianEngine": "f5c9488d8944fe249e72a63e383eddf3ed03fc68c2fc780d458911fcec8f14e0",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.skill.SkillComp_500": "669c37559f7e0838da4ab1608ba8f1d04411304207c0c57bf16f4a172542610a",
    "battleengine.skill.SkillComp_506": "f12f4370f4ca138ffd5826a99fdec839ec5ed9c6eb281296b50055f38d6e6be4",
    "battleengine.skill.SkillComp_507": "1adefdfcb8bca9f06b19cd99a3dc472c0fe782723ae64153a52efd0070faca99",
    "battleengine.skill.SkillComp_508": "9d49014fb3c83c7cf35c1fd83b7bdd18b94684523b971be4ed4dc58189051ccc",
    "battleengine.buff.BuffComp_520": "3820f5a452c15dd298c04c673a8331691a20d0df25c021637001141947019e0a",
    "battleengine.buff.BuffComp_523": "76a29aa43e6f6e8a7b4eae4f2e59d7992ede250b0cff1edd405c2b2f763ad51d",
    "scenemembers.DiZhenNianScene": "a12bc72e48631d3ce91a908be42aabbbc37f11a122d0bcb26700170dc2845a76",
}
EXTREME_SOURCES = {
    "battleengine.engine.DiZhenNianXEngine": "a46ad3ff631d90ecfea5c8b3be592f6562d8f97f39401d693ddb4d07acff69bc",
    "battleengine.skill.SkillComp_44514": "4c8d33afc53331ffb668a4782ce1b36b13960c33c8e1b3a002b88e0387bf37d0",
    "scenemembers.DiZhenNianXScene": "44ffcaabde524293cff4c3641090d17866c2c9702d9ffc333e726e8732674e65",
}


def valid_catfish_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "armorStacks", "otherPlayers", "otherBreaks"}
            and type(settings["windowSeconds"]) is int and 1 <= settings["windowSeconds"] <= CATFISH_WINDOW
            and type(settings["armorStacks"]) is int and 0 <= settings["armorStacks"] <= 99
            and type(settings["otherPlayers"]) is int and type(settings["otherBreaks"]) is int
            and 0 <= settings["otherBreaks"] <= settings["otherPlayers"] <= OTHER_PLAYERS_LIMIT)


def valid_catfish_x_settings(settings):
    return (type(settings) is dict
            and set(settings) == {"windowSeconds", "armorStacks", "otherPlayers", "otherBreaks", "trait", "weeklySeconds"}
            and valid_catfish_settings({key: value for key, value in settings.items() if key not in {"trait", "weeklySeconds"}})
            and settings["armorStacks"] <= EXTREME_ARMOR_MAX
            and type(settings["trait"]) is int and settings["trait"] in TRAITS
            and type(settings["weeklySeconds"]) is int and 1 <= settings["weeklySeconds"] <= CATFISH_WINDOW)


class CatfishReplay:
    def __init__(self, modules, settings, *, extreme=False):
        from battleengine.engine.DiZhenNianEngine import DiZhenNianEngine, const
        from com.data.cdata import dizhennian_stage, event4
        from DynamicConfigData import BattleMonstersInfo, DATA_CONSTANT, DATA_PVE_STAGE_DATA

        self.extreme = extreme
        engine_type, stage_id, mode = DiZhenNianEngine, CATFISH_STAGE, const.BattleMode.MODE_DIZHENNIAN
        sources, troops, room = CATFISH_SOURCES, dizhennian_stage.data, {}
        offset = -5000000 if extreme else 0
        self.boss_id, self.monkey_id, self.gate_id = BOSS + offset, MONKEY + offset, GATE + offset
        self.fish = {pos: unit + offset for pos, unit in FISH.items()}
        self.papers = {pos: unit + offset for pos, unit in PAPERS.items()}
        self.trait_recipients, self.armor_changes = [], []
        self.weekly = ()
        if extreme:
            from battleengine.engine.DiZhenNianXEngine import DiZhenNianXEngine
            from com.data.cdata import dizhennianx_stage
            from DynamicConfigData import DATA_BUFF, DATA_SKILL

            engine_type, stage_id, mode = DiZhenNianXEngine, CATFISH_X_STAGE, const.BattleMode.MODE_DIZHENNIAN_X
            sources, troops = {**CATFISH_SOURCES, **EXTREME_SOURCES}, dizhennianx_stage.data
            if tuple(DATA_CONSTANT.data[10631]["value"]) != TRAITS or DATA_CONSTANT.data[10900]["value"] != [480]:
                raise RuntimeError("The original extreme Catfish room constants changed")
            armor = DATA_BUFF.data[EXTREME_ARMOR, 1]
            if (armor["maxOverlapCount"] != EXTREME_ARMOR_MAX or armor["param1"] != .3 or armor["param2"] != -250000
                    or DATA_BUFF.data[EXTREME_ARMOR, 2]["param2"] != -120000
                    or DATA_BUFF.data[EXTREME_MONKEY_BUFF, 1]["param3"] != .4
                    or DATA_SKILL.data[44514, 1, -1]["param2"] != 5000000):
                raise RuntimeError("The original extreme Catfish armor or monkey effects changed")
            self.weekly = (settings["weeklySeconds"],)
            hp = self.shared_hp(engine_type, self.boss_id)
            room = {"event4_avg_time": self.weekly[0], "event4_skill_buff": [0, settings["trait"]], "hp": {"1": hp}}
        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in sources.items()):
            raise RuntimeError("The original Catfish engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        encounters = {100: self.fish, 300: {4: self.monkey_id}, 400: {8: self.gate_id}, 500: self.papers}
        if (self.group["ID"] != stage_id or self.group["resindex"] != CATFISH_SCENE or stage["shishentotal"] != 5
                or self.group["MonstersInfos"] != [[[1, self.boss_id, 40, 1, 0]]]
                or any({i: v for i, v in enumerate(troops[key, 1]["monsterWaves"], 2) if v}
                       != {pos: [unit, 40] for pos, unit in expected.items()} for key, expected in encounters.items())):
            raise RuntimeError("Unexpected original Catfish configuration")

        self.settings, self.const = settings, const
        self.thresholds = DATA_CONSTANT.data[4151]["value"]
        self.blessings = DATA_CONSTANT.data[4152]["value"]
        self.success_rate, = DATA_CONSTANT.data[4155]["value"]
        self.gate_seconds, = DATA_CONSTANT.data[4156]["value"]
        assist = DATA_CONSTANT.data[4161]["value"]
        if (self.thresholds != [.5, .2] or self.blessings != [512, 513, 514, 515] or self.success_rate != .8
                or self.gate_seconds != 120 or assist != [ASSIST, 101]
                or event4.data[31]["limit_user"] != OTHER_PLAYERS_LIMIT + 1):
            raise RuntimeError("The original Catfish constants changed")
        self.started, self.expiry, self.victory, self.gate_start, self.gate_break = None, None, None, None, None
        self.phases, self.units, self.hp, self.maximum = [], {}, {}, {}
        self.observed, self.queued = None, "normal"
        self.monkey_started, self.monkey_reward, self.gate_rate = False, None, None
        self.gate_skill = None
        self.summons_blessings = True
        self.status = {"status": STATES["normal"], "buff_list": self.blessings.copy(), "dzn_info": {},
                       "dmg_minus_count": settings["armorStacks"]}
        if extreme:
            self.status["dzn_info"]["buff_count"] = settings["armorStacks"]
        self.engine = engine = engine_type({
            "pve_data_flag": str(stage_id), "fbUid": "local-catfish", "teamUid": 1, "team": self,
            "status_info": self.status, "atk_set": 2500, "cal_num": 5, **room,
        })
        engine.battleMode = mode
        if mode != (CATFISH_X_MODE if extreme else CATFISH_MODE) or engine.state_dict != {n: state for state, n in STATES.items()}:
            raise RuntimeError("The original Catfish battle mode changed")
        self.change = engine.change_to_state
        self.notice = engine.send_notice
        engine.change_to_state = self.observe_switch
        engine.send_notice = self.observe_notice

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def shared_hp(self, engine, unit_id):
        hp = engine.calcSingleSharedMonMaxHp(unit_id, 2500, 5, *self.weekly)
        if not isfinite(hp) or hp <= 1:
            raise RuntimeError("The original Catfish calculated invalid shared health")
        return hp

    def check_selected(self, entity):
        trait = self.settings["trait"]
        if self.engine.playerSkill != trait or not entity.SkillMgrComp.getSkillById(trait):
            raise RuntimeError("The original extreme Catfish trait was absent on a selected character")
        self.trait_recipients.append(entity.protoid)

    def watch_armor(self):
        armor = self.engine.boss_entity.BuffMgrComp.getFirstBuff(EXTREME_ARMOR)
        layers = armor.buffPowerLv if armor else 0
        if layers != self.settings["armorStacks"]:
            raise RuntimeError("The original extreme Catfish supplied different armor")
        self.armor_changes.append({"seconds": self.seconds(), "layers": layers})
        if armor is not None:
            change_power = armor.onBuffPowerLvChange

            def observe(previous, remaining):
                # Death removes the buff without changing its stack count.
                if previous != self.armor_changes[-1]["layers"] or not 0 <= remaining < previous:
                    raise RuntimeError("The original extreme Catfish produced inconsistent armor")
                self.armor_changes.append({"seconds": self.seconds(), "layers": remaining})
                return change_power(previous, remaining)

            if armor.isRemoved:
                raise RuntimeError("The original extreme Catfish produced inconsistent armor")
            armor.onBuffPowerLvChange = observe

    def flush(self):
        engine = self.engine
        if engine.hpChangedCache:
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
            engine.hpChangedCache.clear()

    def observe_switch(self, state, message):
        engine = self.engine
        if self.started is not None and state != engine.state:
            self.flush()
            self.units.clear()
            self.hp = {"1": self.hp["1"], **message["param"].get("hp", {})}
            self.maximum = {"1": self.maximum["1"], **message["param"].get("hp", {})}
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})
        self.change(state, message)

    def observe_summon(self, unit_id, position, *args, **kwargs):
        previous = self.units.get(position)
        # The extreme engine can replace a paper at zero health before its death animation finishes.
        if previous is not None and (self.papers.get(position) != unit_id or
                                     previous.lifeState != self.const.CombatState.DEAD
                                     and (not self.extreme or previous.AttrComp.hp > 0)):
            raise RuntimeError("The original Catfish spawned an overlapping position")
        unit = self.summon(unit_id, position, *args, **kwargs)
        self.units[position] = unit
        return unit

    def observe_notice(self, notice, params=None):
        if notice == "kill_elite":
            self.monkey_reward = params["extra_hurt_add"]
        return self.notice(notice, params)

    def watch_gate_skill(self, skill, skill_id):
        cast = skill.OnCastHit

        def observe(*args, **kwargs):
            result = cast(*args, **kwargs)
            self.gate_skill = skill_id
            return result

        skill.OnCastHit = observe

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another Catfish room")
        op = message["op"]
        if op == "kill_bird_house":
            if engine.state != "flee" or self.gate_start is None:
                raise RuntimeError("The original Catfish broke a gate out of phase")
            self.gate_break = self.seconds()
        elif op == "battle_win":
            if engine.boss_entity.AttrComp.hp > 0 or engine.boss_entity.lifeState != self.const.CombatState.DEAD:
                raise RuntimeError("The original Catfish ended before the boss was defeated")
            self.hp["1"] = 0
            self.victory = self.snapshot()
        elif op == "hp_change":
            for key, delta in message["data"].items():
                hp = min(self.maximum[key], self.hp[key] + delta)
                self.hp[key] = 0 if hp <= 1 else hp
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def send_state(self, state):
        engine = self.engine
        params = {"stime": engine.now_time()}
        if state == "normal":
            # The skill records the local choice at the top level. The
            # original phase entry expects the saved choice in room status.
            self.status["dzn_info"].update(engine.engineUserData.get("dzn_info", {}))
            self.summons_blessings = not self.status["dzn_info"].get("extra_buff_id")
        elif state == "elite":
            params["hp"] = {"4": self.shared_hp(engine, self.monkey_id)}
            self.monkey_started = True
        elif state == "flee":
            self.gate_start = self.seconds()
        self.queued = state
        engine.onRecvOtherTeamMsg({"op": "ch_st", "status": STATES[state], "param": params})

    def record_phase(self, state):
        opening = [{"id": unit.protoid, "position": pos, "level": unit.AttrComp.level}
                   for pos, unit in sorted(self.units.items())]
        expected = {"normal": self.fish if self.summons_blessings else {}, "elite": {4: self.monkey_id},
                    "flee": {8: self.gate_id}}.get(state, {})
        if {row["position"]: row["id"] for row in opening} != expected:
            raise RuntimeError("The original Catfish spawned a different formation")
        if state == "normal" and expected:
            if [self.units[pos].add_buff_id for pos in self.fish] != self.blessings:
                raise RuntimeError("The original Catfish supplied different blessings")
            if not self.extreme:
                armor, = self.engine.boss_entity.BuffMgrComp.getBuffs(520)
                if armor.cur_count != self.settings["armorStacks"]:
                    raise RuntimeError("The original Catfish supplied different armor stacks")
        elif state == "elite":
            monkey = self.units[4]
            if monkey.uid not in self.engine.sharedEntityUids or not self.extreme and abs(monkey.damage_limit) != 4000:
                raise RuntimeError("The original Catfish did not apply the monkey damage limit")
            self.maximum["4"] = monkey.AttrComp.maxHp
            self.hp["4"] = min(self.maximum["4"], self.hp["4"])
        self.observed = state
        self.phases.append({"phase": state, "seconds": self.seconds(), "bossHp": self.hp["1"],
                            "damage": self.engine.myTotalDmg, "opening": opening})

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        if self.started is None:
            self.started = engine.now_time()
            boss = engine.boss_entity
            assists = engine.getEntities(const.CampFlag.CAMP1)
            assist = next((entity for entity in assists if entity.protoid == ASSIST and entity.posIndex == 101), None)
            if boss.protoid != self.boss_id or boss.posIndex != 1 or assist is None:
                raise RuntimeError("The original Catfish opened without the expected boss or assist")
            self.hp["1"] = self.maximum["1"] = boss.AttrComp.maxHp
            opening = [{"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level} for unit in (boss, assist)]
            self.phases.append({"phase": "opening", "seconds": 0, "bossHp": self.hp["1"],
                                "damage": engine.myTotalDmg, "opening": opening})
            skill = boss.SkillMgrComp.getSkillById(508)
            self.summon = skill.summon_mon
            skill.summon_mon = self.observe_summon
            for skill_id in GATE_SKILLS.values():
                self.watch_gate_skill(boss.SkillMgrComp.getSkillById(skill_id), skill_id)
            if self.extreme:
                self.watch_armor()
        state = engine.state
        switched = engine.switch_state == const.LC_SWITCH_STATE.SWITCHED
        expected = {"normal": 4 if self.summons_blessings else 0, "elite": 1, "flee": 1}.get(state, 0)
        if (self.observed != state and switched and len(self.units) >= expected
                and (state not in GATE_SKILLS or self.gate_skill == GATE_SKILLS[state])):
            self.record_phase(state)
        if self.expiry is not None:
            return
        if self.seconds() >= self.settings["windowSeconds"]:
            self.flush()
            self.expiry = self.snapshot()
            engine.forceBattleEnd("time_out", {})
            return
        if state != self.queued or state != self.observed:
            return
        percent = self.hp["1"] / self.maximum["1"]
        if state == "normal" and not self.monkey_started and percent <= self.thresholds[0]:
            self.send_state("elite")
        elif state == "elite" and self.monkey_reward is not None:
            self.send_state("flee" if percent <= self.thresholds[1] else "normal")
        elif state == "normal" and self.monkey_reward is not None and percent <= self.thresholds[1]:
            self.send_state("flee")
        elif state == "flee":
            elapsed = self.seconds() - self.gate_start
            broken = self.gate_break is not None and self.gate_break - self.gate_start <= self.gate_seconds
            if elapsed >= self.gate_seconds or broken and engine.kill_gift_paper_man >= 5:
                self.gate_rate = (self.settings["otherBreaks"] + int(broken)) / (self.settings["otherPlayers"] + 1)
                engine.onRecvOtherTeamMsg({"op": "defeat_rate", "defeat_rate": self.gate_rate})
                self.send_state("flip" if self.gate_rate >= self.success_rate else "boom")
        elif state in ("flip", "boom"):
            self.send_state("peace")

    def snapshot(self):
        engine = self.engine
        data = {"settings": self.settings, "combatSeconds": self.seconds(), "damage": self.engine.myTotalDmg,
                "phases": self.phases.copy(), "bossHp": self.hp["1"], "maximumHp": self.maximum["1"],
                "blessing": engine.engineUserData.get("dzn_info", {}).get("extra_buff_id"),
                "activeBlessing": engine.boss_entity.SkillMgrComp.getSkillById(500).get_add_buff_id or None,
                "monkeyBonus": self.monkey_reward, "gate": {"limitSeconds": self.gate_seconds,
                    "startedAt": self.gate_start, "brokenAt": self.gate_break, "breakRate": self.gate_rate,
                    "skill": self.gate_skill},
                "papersDefeated": self.engine.kill_gift_paper_man}
        if self.extreme:
            data.update(traitRecipients=self.trait_recipients.copy(), armorChanges=self.armor_changes.copy())
        return data

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        if (not data["phases"] or self.extreme and len(self.trait_recipients) != 6
                or outcome == "win" and (not self.victory or data["bossHp"] != 0)):
            raise RuntimeError("The original Catfish did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
