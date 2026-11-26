"""Verified client route for the first experience encounter on a new server."""

from importlib import import_module
from types import SimpleNamespace


FIRST_EXP_STAGE = 2111
RESOURCE_MODE = 528
RESOURCE_STAGE_NAMES = {"经验副本", "金币副本"}
SOURCE_HASHES = {
    "battleengine.BattleEngine": "5333880a15e43334b4c4f81597974a7bf9dd04bf001c8203e91656c8404b278b",
    "battleengine.engine.NewExpEngine": "b28f2dd8720d52fad468846119c8108e2c6bbd7821dde4d3206dec6be3d5833a",
    "battleengine.engine.NewExpCoinBaseEngine": "dabec75d0bb51d44d4cfcbcdeea5c67d9be6bd00f2521d54203cfd4d08701a70",
    "battleengine.engine.SharedHpPveEngine": "7c4d1b29d0558aa281b137cf6bdec48e8de47f73cf33434f0f93b83421652fd3",
    "module.exp_gold.ResourceFightPanel": "991c81c9eaa2ac4f7e0e78f4bf26aa52ffec63358102980022d616a61c3b1b00",
}


def first_experience_stage(modules):
    from battleengine.engine.NewExpEngine import NewExpEngine, const
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCE_HASHES.items()):
        raise ValueError("The new-server experience entry requires its verified client scripts")
    # ResourceFightPanel.on_create_team sends this payload for the first exp run.
    stage = DATA_PVE_STAGE_DATA.data[str(FIRST_EXP_STAGE)]
    formation = BattleMonstersInfo.data[stage["groupid"]]
    engine = NewExpEngine({"pve_data_flag": str(FIRST_EXP_STAGE), "atk_flags": {}, "__is_spec": False,
                           "member_num": 1, "allRewards": {}, "mode": "exp", "teamUid": None,
                           "battle_config": {"spectatorHeroCount": 4}, "mon_hp_rate": 1,
                           "local_battle_limit_time": 180, "is_local_newbie_battle": True})
    engine.battleMode = const.BattleMode.MODE_NEW_EXP_COIN_FIGHT
    if engine.battleMode != RESOURCE_MODE or engine.combineSceneInfoId != formation["resindex"]:
        raise RuntimeError("The client experience entry resolved to a different battle")

    # This route stores its reinforcements on the client engine. The host
    # otherwise uses server defaults to keep UI and transport out of the replay.
    engine.isClientSide = lambda: True
    # The original compares an absolute clock for the deadline. Advance that
    # clock with the fixed-step battle so machine speed cannot affect a win.
    for name in ("NewExpCoinBaseEngine", "SharedHpPveEngine"):
        import_module("battleengine.engine." + name).time = SimpleNamespace(time=engine.now_time)
    return engine, stage, formation


def observe_experience_opening(engine, const, formation):
    spawn = engine._createNextRoundMons
    expected = sorted((position, monster_id, level) for position, monster_id, level, *_ in formation["MonstersInfos"][0])
    opening = []

    def verify_spawn():
        result = spawn()
        enemies = sorted(engine.getEntities(const.CampFlag.CAMP2, [const.EntityTypeFlag.MONSTER]),
                         key=lambda unit: unit.posIndex)
        if opening or [(unit.posIndex, unit.protoid) for unit in enemies] != [(p, mid) for p, mid, _ in expected]:
            raise RuntimeError("The client created a different first experience formation")
        for (position, monster_id, level), unit in zip(expected, enemies):
            attr = unit.AttrComp
            opening.append({"id": monster_id, "position": position, "level": level, "hp": attr.hp,
                            "speed": attr.speed, "attack": attr.attack, "defense": attr.defense, "critRate": attr.critRate})
        return result

    engine._createNextRoundMons = verify_spawn
    return opening
