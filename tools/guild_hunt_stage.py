"""Ordinary personal Guild Hunting battle without borrowed shikigami."""

from importlib import import_module
from random import Random

GUILD_HUNT_MODE = 2000
PHASE_SKILL = "battleengine.SkillComp_GuildHuntingBoss"


def guild_hunt_stage(stage_id):
    from battleengine.engine.GuildHuntingBattleEngine import GVE_BATTLE_INFO, GuildHuntingBattleEngine, const

    config = GVE_BATTLE_INFO.data.get(stage_id)
    if not config or config["week_day"] not in range(4) or not 1 <= config["difficulty"] <= 6:
        raise ValueError(f"Guild Hunting stage {stage_id} is not a verified elemental hunt")
    if len(config["monsters"]) != 1 or len(config["monsters"][0]) != 2:
        raise ValueError(f"Guild Hunting stage {stage_id} has an unexpected opening formation")
    engine = GuildHuntingBattleEngine({"fbId": stage_id, "allRewards": {}})
    engine.battleMode = const.BattleMode.MODE_GUILD_GVE
    if engine.battleMode != GUILD_HUNT_MODE or engine.combineSceneInfoId != config["scene"]:
        raise RuntimeError("The elemental hunt resolved to a different battle")
    return engine, config


def seed_hunt_phases(modules, seed):
    if modules.rows[PHASE_SKILL]["marshalSHA256"] != "f684b6e59c8c6f24a0b9da9c744381b4b8cc3979ab0f7b4fc19a4ee61b97bd10":
        raise RuntimeError("The elemental hunt uses a different phase skill implementation")
    # This skill uses the module's RNG for its random mini-boss effects,
    # separate from the original engine's seeded combat RNG.
    import_module(PHASE_SKILL).random = Random(seed)


def observe_guild_hunt_opening(engine, config):
    original_spawn, create = engine._createNextRoundMons, engine.createMonsterEntity
    expected_id, expected_level = config["monsters"][0]
    opening = {}

    def verify_spawn():
        created = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            created.append((placement.Index, placement.level, unit))
            return unit

        engine.createMonsterEntity = observe
        try:
            result = original_spawn()
        finally:
            engine.createMonsterEntity = create
        if opening or [(pos, level, unit.protoid) for pos, level, unit in created] != [(1, expected_level, expected_id)]:
            raise RuntimeError("The original elemental hunt created a different opening formation")
        attr = created[0][2].AttrComp
        opening.update(id=expected_id, position=1, level=expected_level, hp=attr.hp, speed=attr.speed,
                       attack=attr.attack, defense=attr.defense, critRate=attr.critRate)
        return result

    engine._createNextRoundMons = verify_spawn
    return opening
