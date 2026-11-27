"""Original 天魔归来 phase-two local battles."""

from math import ceil

ASURA_FINAL_MODE = 3342
ASURA_TOWER_MODE = 3344
ASURA_MODES = (ASURA_FINAL_MODE, ASURA_TOWER_MODE)
ASURA_STAGES = {602002: 1, 602001: 2, 602006: 3, 602004: 4, 602005: 5, 602003: 6, 602000: 7}
ASURA_PHASE = 7041
ASURA_ACTIVITY = 7022


def asura_battle(mode, stage_id, settings):
    from battleengine.engine.AsuraBossEngine import AsuraBossEngine, const
    from DynamicConfigData import BattleMonstersInfo, DATA_ASURA_CONST, DATA_ASURA_P2_CONFIG, DATA_PVE_STAGE_DATA

    index = ASURA_STAGES.get(stage_id)
    final = index == 7
    phase = DATA_ASURA_P2_CONFIG.data.get(index, {})
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id), {})
    formation = BattleMonstersInfo.data.get(stage.get("groupid"), {})
    if (not index or mode != (ASURA_FINAL_MODE if final else ASURA_TOWER_MODE)
            or phase.get("battle_id") != stage_id or stage.get("shishentotal") != 5
            or len(formation.get("MonstersInfos", ())) != 1):
        raise ValueError("Unknown Asura phase-two battle")

    fields = {"level", "skills", "specialKeys"}
    if final:
        fields |= {"enrage", "activeTowers", "bossHp"}
    spirit, slots, used_slots = asura_spirit_settings(settings, fields)
    data = {"pve_data_flag": str(stage_id), "tower_index": index - 1, "is_boss": final, **spirit}
    deadline = None
    monster_skills = [phase["tower_buff"]]
    if final:
        boss_max_hp = AsuraBossEngine._calcSharedMonMaxHp(stage_id)
        hp, active, enrage = settings["bossHp"], settings["activeTowers"], settings["enrage"]
        if (type(enrage) is not bool or not valid_selection(active, range(1, 7)) or
                hp is not None and (not isinstance(hp, str) or not hp.isascii() or not hp.isdecimal()
                                    or not 1 <= len(hp) <= 18 or not 1 <= int(hp) <= boss_max_hp)):
            raise ValueError("Invalid Asura shared boss HP, tower state or enrage phase")
        data.update(boss_hp=boss_max_hp if hp is None else int(hp), enrage=enrage,
                    boss_buff=[number in active for number in range(1, 7)])
        deadline = DATA_ASURA_CONST.data[14]["value"][0]
        monster_skills = ([DATA_ASURA_P2_CONFIG.data[number]["crazy_boss_buff"] for number in sorted(active)]
                          if enrage else [phase["tower_buff"]] if active else [])
    engine = AsuraBossEngine(data)
    engine.battleMode = mode
    return engine, formation, const, AsuraSettlement(engine, formation, const, index, slots, used_slots, settings,
                                                      deadline, monster_skills)


def valid_selection(values, allowed):
    return (type(values) is list and len(values) <= len(allowed)
            and all(type(value) is int and value in allowed for value in values) and len(set(values)) == len(values))


def asura_spirit_settings(settings, fields):
    from DynamicConfigData import DATA_ASURA_BUFF, DATA_ASURA_EVENT_2, DATA_ASURA_SA_HERO_CONFIG

    if type(settings) is not dict or settings.keys() != fields:
        raise ValueError("Invalid Asura replay settings")
    level, skills, keys = settings["level"], settings["skills"], settings["specialKeys"]
    skill_costs = {row["skill_id"]: row["use"] for row in DATA_ASURA_EVENT_2.data.values()}
    valid_keys = {row["key"] for row in DATA_ASURA_SA_HERO_CONFIG.data.values()}
    if (type(level) is not int or not 0 <= level <= 2**53 - 1
            or not valid_selection(skills, skill_costs) or not valid_selection(keys, valid_keys)):
        raise ValueError("Invalid Asura spirit or special-attack settings")
    slots = sum(row["sprit"] for row in DATA_ASURA_BUFF.data.values() if row["level"] <= level)
    used_slots = sum(skill_costs[skill] for skill in skills)
    if used_slots > slots:
        raise ValueError("The Asura spirit skills exceed the available slots")
    return {"help_heroes": keys, "player_buffs": skills, "level": level}, slots, used_slots


class AsuraSettlement:
    def __init__(self, engine, formation, const, index, slots, used_slots, settings, deadline, monster_skills):
        self.engine, self.const = engine, const
        self.index, self.slots, self.used_slots = index, slots, used_slots
        self.settings, self.deadline = settings, deadline
        self.monster_skills = monster_skills
        self.expected = [(pos, proto, level) for pos, proto, level, *_ in formation["MonstersInfos"][0]]
        self.opening = []
        self.started = None
        self.final_hp = self.native_damage = None
        self.boss = None
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity

        def observe_spawn():
            observed = []

            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                observed.append([entity.posIndex, entity.protoid, placement.level])
                if any(entity.SkillMgrComp.getSkillById(skill) is None for skill in monster_skills):
                    raise RuntimeError("The Asura engine did not apply the selected phase skills")
                if deadline is not None and entity.posIndex == 1:
                    self.boss = entity
                return entity

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            self.opening = sorted(observed)
            if [tuple(row) for row in self.opening] != sorted(self.expected):
                raise RuntimeError("The Asura engine spawned a different enemy formation")
            if deadline is not None:
                if int(engine.cur_hp[1]) != int(float(engine.boss_hp)):
                    raise RuntimeError("The Asura engine ignored the starting boss HP")
            return result

        engine._createNextRoundMons = observe_spawn

    def update(self):
        if self.started is None and self.engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = self.engine.now_time()
            if self.deadline is not None and abs(self.engine.timeout_stamp - self.started - self.deadline) > 1:
                raise RuntimeError("The Asura boss initialized a different scoring duration")

    def on_end(self):
        if self.boss is not None:
            self.final_hp = max(0, ceil(self.boss.AttrComp.hp))
            self.native_damage = self.engine.get_damage().get(self.engine.boss_index)

    def report(self, completed, roster):
        engine = self.engine
        if self.started is None or not self.opening:
            raise RuntimeError("The Asura battle did not start")
        if sorted(engine._heroids) != sorted(roster):
            raise RuntimeError("The Asura engine used a different lineup")
        result = {"index": self.index, "opening": self.opening, "usedHeroIds": engine._heroids,
                  "level": self.settings["level"], "skills": self.settings["skills"], "specialKeys": self.settings["specialKeys"],
                  "slots": self.slots, "usedSlots": self.used_slots,
                  "monsterSkills": self.monster_skills,
                  "combatSeconds": round(engine.now_time() - self.started, 6)}
        if self.deadline is not None:
            if completed and (type(self.native_damage) is not int or engine.engineUserData.get("damage") != self.native_damage):
                raise RuntimeError("The original Asura score did not match the damage written at settlement")
            remaining = self.final_hp if self.final_hp is not None else max(0, ceil(self.boss.AttrComp.hp))
            damage = self.native_damage if completed else engine.get_damage().get(engine.boss_index, 0)
            result.update(deadlineSeconds=self.deadline, damage=damage, timedOut=bool(engine.is_timeout),
                          enrage=self.settings["enrage"], activeTowers=self.settings["activeTowers"],
                          startingHp=str(int(engine.cur_hp[1])), remainingHp=str(remaining), bossDefeated=remaining == 0)
        return result
