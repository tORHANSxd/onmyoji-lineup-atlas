"""Original Undying Guardian configuration and verified combat placements."""


YULING_MODE = 267


def yuling_stage(floor):
    from battleengine.engine.GorenFbEngine import DATA_RUNE_FB, GorenFbEngine, XIAOZHIREN_ID, const
    from DynamicConfigData import DATA_GOREN_FB

    config = DATA_GOREN_FB.data.get(floor)
    if not config or config != DATA_RUNE_FB.data.get(floor):
        raise ValueError(f"The original Undying Guardian floor {floor} does not match the engine table")
    waves = config["monsterWaves"]
    if len(waves) != 1 or len(waves[0]) != 4 or any(len(unit) != 2 for unit in waves[0]) or (
            waves[0][0][0] == XIAOZHIREN_ID or any(mid != XIAOZHIREN_ID for mid, _ in waves[0][1:])):
        raise ValueError(f"Undying Guardian floor {floor} does not use the verified boss and three paper figures")
    engine = GorenFbEngine({"fbId": floor, "allRewards": {}})
    engine.battleMode = const.BattleMode.MODE_GOREN_FB
    if engine.combineSceneInfoId != config["scene"] or engine.battleMode != YULING_MODE:
        raise RuntimeError("The client Undying Guardian entry resolved to a different battle")
    return engine, config


def observe_yuling_opening(engine, config):
    original_spawn, original_create = engine._createNextRoundMons, engine.createMonsterEntity
    wave = config["monsterWaves"][0]
    expected = [(position, mid, level) for position, (mid, level) in enumerate(wave, 1)]
    opening = []

    def verify_spawn():
        created = []

        def observe(camp, owner, placement):
            unit = original_create(camp, owner, placement)
            created.append((placement.Index, unit.protoid, placement.level, unit))
            return unit

        engine.createMonsterEntity = observe
        try:
            result = original_spawn()
        finally:
            engine.createMonsterEntity = original_create
        if opening or [(p, mid, level) for p, mid, level, _ in created] != expected:
            raise RuntimeError("The original Undying Guardian engine created different placements")
        for position, mid, level, unit in created:
            attr = unit.AttrComp
            opening.append({"id": mid, "position": position, "level": level, "hp": attr.hp, "speed": attr.speed,
                            "attack": attr.attack, "defense": attr.defense, "critRate": attr.critRate,
                            "turnAvailable": unit.TurnComp.initAvailable, "hpVisible": attr.hpBarVisible})
        if any(row["hpVisible"] for row in opening[1:]) or [row["turnAvailable"] for row in opening[1:]] != [True, False, False]:
            raise RuntimeError("The paper figures do not match the original turn and health-bar rules")
        return result

    engine._createNextRoundMons = verify_spawn
    return opening
