"""Original Secret Zone formation and admission rules for the local verifier."""


LIYUJING_TYPE = 35
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
            enemy and (len(enemy) != 2 or type(enemy[0]) is not int or enemy[0] <= 0)
            for enemy in wave) for wave in waves):
        raise DynamicFormation(f"Secret Zone floor {floor} has a dynamic formation")
    engine = ChallengeFbEngine({"fbId": floor, "fbType": config["type"],
                                "floor_num": config["floor_num"], "allRewards": {}})
    engine.battleMode = const.BattleMode.MODE_CHALLENGE
    return engine, config, waves


def secret_solo(config):
    # Separate entries and engine branches that need mechanics outside the basic solo roster.
    special_rules = {19, 20, 27, 31, 32, 34, 36, 37, 39}
    return (config["advanced"] == 0 and not config["yys_replacement_id"] and config["type"] not in special_rules
            and (config["need_team"] == 0 or secret_protection(config) is not None))


def secret_protection(config):
    return PROTECTION_FLOORS.get(config["id"]) if config["type"] == LIYUJING_TYPE else None


def placements(formation):
    return [(position, unit[1], unit[0]) for position, unit in enumerate(formation, 1) if unit]


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
