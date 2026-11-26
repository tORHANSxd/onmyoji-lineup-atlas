"""Original Secret Zone formation and admission rules for the local verifier."""


LIYUJING_TYPE = 35
REPLACEMENT_TYPES = {25, 27}
MIRROR_FLOOR = 118
MIRROR_WAVE = 3
PROTECTION_FLOORS = {
    358: (31708001, 31708209),
    359: (31709001, 31709209),
    360: (31710001, 31710209),
    10351: (31711001, 31711209),
}


class DynamicFormation(ValueError):
    pass


def secret_stage(floor):
    from battleengine.engine.ChallengeFbEngine import ChallengeFbEngine, const, DATA_DUNGEON_CHALLENGE_SERIES

    config = DATA_DUNGEON_CHALLENGE_SERIES.data.get(floor)
    if not config:
        raise ValueError(f"Unknown Secret Zone floor {floor}")
    waves = config["monsterWaves"]
    while waves and not any(waves[-1]):
        waves = waves[:-1]
    if not waves or any(not any(wave) or any(
            enemy and (len(enemy) != 2 or type(enemy[0]) is not int or (enemy[0] <= 0 and enemy[0] != -1))
            for enemy in wave) for wave in waves):
        raise DynamicFormation(f"Secret Zone floor {floor} has a dynamic formation")
    mirror_slots = [(number, position) for number, wave in enumerate(waves, 1)
                    for position, _, proto in placements(wave) if proto == -1]
    if mirror_slots and (floor != MIRROR_FLOOR or len(waves) != MIRROR_WAVE
                         or mirror_slots != [(MIRROR_WAVE, position) for position in range(2, 7)]):
        raise DynamicFormation(f"Secret Zone floor {floor} has unverified mirror positions")
    engine = ChallengeFbEngine({"fbId": floor, "fbType": config["type"],
                                "floor_num": config["floor_num"], "allRewards": {}})
    engine.battleMode = const.BattleMode.MODE_CHALLENGE
    return engine, config, waves


def secret_solo(config):
    # The ordinary panel dispatches need_team=1 through attack_team_copy,
    # the client's single-player team challenge. Special mechanics are separate.
    special_rules = {19, 20, 31, 32, 34, 36, 37, 39}
    replacement = bool(config["yys_replacement_id"])
    return (config["advanced"] == 0 and config["need_team"] in (0, 1) and config["type"] not in special_rules
            and replacement == (config["type"] in REPLACEMENT_TYPES))


def secret_protection(config):
    return PROTECTION_FLOORS.get(config["id"]) if config["type"] == LIYUJING_TYPE else None


def placements(formation):
    return [(position, unit[1], unit[0]) for position, unit in enumerate(formation, 1) if unit]


def secret_replacement(engine):
    from DynamicConfigData import DATA_HERO

    row = engine.getYYSReplacementData()
    if not row:
        raise ValueError("The original Secret Zone is missing its configured replacement")
    hero = DATA_HERO.data[row["id"]]
    skills = sorted([[skill, level] for skill, level in zip(hero["skill"], hero["skillLv"]) if skill and level])
    if not skills:
        raise ValueError("The original Secret Zone replacement has no skill configuration")
    return {"templateId": row["id"], "heroId": row["heroId"], "name": hero["name"],
            "level": row["level"], "star": row["star"], "awakening": row["awake"],
            "autoActor": bool(row["isAI"]), "skills": skills}


def secret_selection_placeholder():
    from DynamicConfigData import DATA_HERO

    # The original selector fills position one before replacing it with the stage actor.
    hero = DATA_HERO.data[10]
    skills = [[skill, level] for skill, level in zip(hero["skill"], hero["skillLv"]) if skill and level]
    return {"heroId": 10, "level": 1, "star": 2, "awake": 0, "equips": [], "skinfo": skills,
            "selectSkills": [skill for skill, _ in skills]}


def check_secret_actor(engine, controller, config):
    unit = engine.getEntity(engine.yysReplacementUid) if engine.yysReplacementUid else None
    if (not unit or unit.ownerController is not controller or unit.posIndex != 1
            or unit.HeroComp.heroData.heroUid == "selected-onmyoji" or any(unit.HeroComp.heroData.equips)):
        raise RuntimeError("The original Secret Zone did not use its configured actor")
    attr = unit.AttrComp
    skills = sorted([[item.skillId, item.skillLevel] for item in unit.SkillMgrComp.skillCompList])
    report = {**config, "position": unit.posIndex, "heroId": unit.protoid, "level": attr.level, "star": attr.star,
              "awakening": unit.HeroComp.heroData.awake, "autoActor": bool(unit.isAutoUseSkill), "skills": skills}
    if any(report[key] != config[key] for key in ("heroId", "level", "star", "awakening", "autoActor", "skills")):
        raise RuntimeError("The original Secret Zone used a different configured actor")
    return report


def mirror_fallback():
    from DynamicConfigData import DATA_CONSTANT

    return DATA_CONSTANT.data.get(4065, {}).get("value", (200,))[0]


class SecretMirrorReplay:
    def __init__(self, engine, const):
        self.engine, self.const = engine, const
        self.fallback = mirror_fallback()
        self.units, self.copied = [], {}
        self.copy_skills = engine.copy_soulcard_skill
        engine.copy_soulcard_skill = self.copy

    def copy(self, entity, target):
        skills = [(skill.skillId, skill.skillLevel) for skill in target.SkillMgrComp.skillCompList if skill.fromCardId]
        result = self.copy_skills(entity, target)
        if any(entity.SkillMgrComp.getSkillById(skill_id) is None for skill_id, _ in skills):
            raise RuntimeError("The original Secret Zone mirror is missing a copied soul skill")
        self.copied[entity.posIndex] = (target.protoid, skills)
        return result

    def formation(self, configured):
        from DynamicConfigData import DATA_MONSTER

        expected, mirror_units = [], []
        for position, level, proto in placements(configured):
            if proto == -1:
                target = self.engine.get_camp_index_entity(self.const.CampFlag.CAMP1, position)
                source = target.protoid if target else None
                can_copy = source is not None and bool(DATA_MONSTER.data.get(source))
                proto = source if can_copy else self.fallback
                mirror_units.append((position, level, source, can_copy))
            expected.append((position, level, proto))
        return expected, mirror_units

    def observe(self, expected, mirror_units):
        prototypes = {position: proto for position, _, proto in expected}
        for position, level, source, can_copy in mirror_units:
            copied = self.copied.pop(position, None)
            if (copied is not None) != can_copy or (copied is not None and copied[0] != source):
                raise RuntimeError("The original Secret Zone used a different mirror source")
            self.units.append({"position": position, "level": level, "sourceId": source,
                               "monsterId": prototypes[position], "copied": can_copy, "soulSkills": copied[1] if copied else []})
        if self.copied:
            raise RuntimeError("The original Secret Zone copied an unexpected mirror position")

    def report(self):
        return {"wave": MIRROR_WAVE, "units": self.units}


class SecretProtectionReplay:
    def __init__(self, engine, const, protection):
        self.engine, self.const = engine, const
        self.support_id, self.target_id = protection
        self.opening, self.settlement = None, None
        self.start_battle, self.check_battle_end = engine.startBattle, engine.doCheckBattleEnd
        engine.startBattle = self.start
        engine.doCheckBattleEnd = self.check

    def enemies(self, *state):
        return self.engine.getEntities(self.const.CampFlag.CAMP2, [self.const.EntityTypeFlag.MONSTER], *state)

    def start(self):
        result = self.start_battle()
        self.support = self.engine.assist_monster_miwen
        targets = [unit for unit in self.enemies() if unit.protoid == self.target_id]
        if (self.support is None or len(targets) != 1 or len(self.engine.battlePlayers) != 1
                or self.support.camp != self.const.CampFlag.CAMP1):
            raise RuntimeError("The original Secret Zone did not create the expected protection objective")
        attr = self.support.AttrComp
        if (self.support.protoid, self.support.posIndex, attr.level, attr.star) != (self.support_id, 101, 40, 6):
            raise RuntimeError("The original Secret Zone created a different support unit")
        self.target = targets[0]
        self.opening = {"id": self.support.protoid, "position": self.support.posIndex, "level": attr.level,
                        "star": attr.star, "hp": attr.hp}
        return result

    def alive(self, unit):
        return unit.lifeState == self.const.CombatState.ALIVE and unit.AttrComp.hp > 0

    def check(self):
        camp = self.check_battle_end()
        if self.opening and camp in (self.const.CampFlag.CAMP1, self.const.CampFlag.CAMP2):
            self.settlement = {"supportAlive": self.alive(self.support), "targetAlive": self.alive(self.target),
                               "enemiesAlive": len(self.enemies(self.const.CombatState.ALIVE))}
        return camp

    def report(self, completed):
        if not self.opening or completed and self.settlement is None:
            raise RuntimeError("The original Secret Zone did not report the protection objective")
        return {"support": self.opening, "targetId": self.target_id,
                "settlement": self.settlement if completed else None}
