"""Original Secret Zone formation and admission rules for the local verifier."""


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
    special_rules = {19, 20, 27, 31, 32, 34, 35, 36, 37, 39}
    return (config["advanced"] == 0 and config["need_team"] == 0 and not config["yys_replacement_id"]
            and config["type"] not in special_rules)


def placements(formation):
    return [(position, unit[1], unit[0]) for position, unit in enumerate(formation, 1) if unit]
