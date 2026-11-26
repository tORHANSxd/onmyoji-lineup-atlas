"""Replay a single Six Realms trial with full-health owned shikigami."""

from importlib import import_module

from shilian_routes import SHILIAN_DAOS, SHILIAN_EXAM_MODE


REPLAY_SECONDS = 145
TRIAL_DIFFICULTY = 1


def shilian_stage(stage_id, fighters, slot):
    from com import const
    from com.data.cdata import shilian_event_exam, shilian_liudao
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    trial = next((row for row in shilian_event_exam.data.values() if row["battle_id"] == stage_id), None)
    if trial is None or trial["dao"] not in range(2, 7) or trial["battle_type"] != 2:
        raise ValueError("This Six Realms trial is not available as a single offline replay")
    dao = trial["dao"]
    realm = shilian_liudao.data[dao]
    alias = f"member-{slot}"
    if len(fighters) != 6 or alias not in fighters or fighters[alias]["heroId"] not in realm["hero"]:
        raise ValueError("Six Realms trials need six owned shikigami and one eligible trial position")

    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    if len(group["MonstersInfos"]) != 1:
        raise ValueError("The Six Realms trial does not match the verified single formation")
    engine_name = SHILIAN_DAOS[dao][2]
    engine_class = getattr(import_module("battleengine.engine." + engine_name), engine_name)
    engine = engine_class({
        "pve_data_flag": str(stage_id),
        "dao_id": dao,
        "is_exam": True,
        "trial_hero_uid": alias,
        "trial_hero_id": fighters[alias]["heroId"],
        "battle_heroes_uid": list(fighters),
        "hero_attr_info": {uid: {"cur_hp_per": 1.0} for uid in fighters},
        "difficulty": TRIAL_DIFFICULTY,
        "battle_type": trial["battle_type"],
    })
    engine.battleMode = SHILIAN_EXAM_MODE
    return engine, group, dao, const


def verify_opening(engine, group, slot):
    trial = engine.get_trial_hero()
    if trial is None or trial.HeroComp.heroData.heroUid != f"member-{slot}":
        raise RuntimeError("The original engine selected a different trial shikigami")
    expected = sorted((row[0], row[1]) for row in group["MonstersInfos"][0])
    actual = sorted((unit.posIndex, unit.protoid) for unit in engine.monsterEntities.values())
    if actual != expected:
        raise RuntimeError("The original engine created a different Six Realms formation")
    return trial.protoid
