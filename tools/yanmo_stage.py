"""Original Imperishable Eye practice stages and exploration formations."""

YANMO_ACTIVITY = 7456
YANMO_PRACTICE_MODE = 912
YANMO_TRIAL_MODE = 914
YANMO_PRACTICE_TEAM = 992
YANMO_TRIAL_TEAM = 993
YANMO_PRACTICE_STAGES = range(602801, 602841)
YANMO_TRIAL_STAGES = range(602851, 602901)
YANMO_SCENE = 469051
YANMO_REPLACEMENT = 12
YANMO_ACTOR = (1670, 40, 6)
YANMO_LAMP = 1475001
YANMO_BONUS_ROUNDS = 10


def yanmo_practice_stage(stage_id):
    from battleengine.engine.SpYanMoPracticeEngine import SpYanMoPracticeEngine, const
    from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_CONFIG, DATA_NORMAL_BATTLE_YYS_REPLACE,
                                   DATA_PVE_STAGE_DATA, DATA_SP_YANMO_CONSTANT, DATA_SP_YANMO_XX_FUBEN)

    if stage_id not in YANMO_PRACTICE_STAGES:
        raise ValueError("Select an original Yanmo practice formation")
    entry_id = stage_id - YANMO_PRACTICE_STAGES.start + 1
    resource_type, layer = divmod(entry_id - 1, 10)
    config = DATA_SP_YANMO_XX_FUBEN.data[entry_id]
    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    rules = DATA_NORMAL_BATTLE_CONFIG.data[YANMO_PRACTICE_MODE]
    actor = DATA_NORMAL_BATTLE_YYS_REPLACE.data[YANMO_REPLACEMENT]
    waves = group["MonstersInfos"]
    if (config["id"] != entry_id or config["battle_id"] != stage_id
            or config["battle_type"] != resource_type + 1 or config["item_cost_id"] != YANMO_LAMP
            or config["item_cost_num"] != 1 or group["ID"] != stage_id or group["resindex"] != YANMO_SCENE
            or len(waves) != 1 or len(waves[0]) != 6 or stage["shishentotal"] != 5 or stage.get("battleTime")
            or rules["halt_time"] or rules["group_battle"] or rules["replace_yys_id"] != YANMO_REPLACEMENT
            or tuple(actor[key] for key in ("yys_id", "yys_level", "yys_star")) != YANMO_ACTOR
            or DATA_SP_YANMO_CONSTANT.data[36]["value"][0] != YANMO_BONUS_ROUNDS):
        raise RuntimeError("The original Yanmo practice entry, roster or rules differ")
    engine = SpYanMoPracticeEngine({"pve_data_flag": str(stage_id), "act_params": {"boss_id": entry_id}})
    engine.battleMode = YANMO_PRACTICE_MODE
    return engine, group, const, {"activityId": YANMO_ACTIVITY, "entryId": entry_id,
                                  "resourceType": resource_type + 1, "layer": layer + 1}


def verify_yanmo_actor(engine, controller, const):
    actor = engine.getCampYYSHeroEntity(const.CampFlag.CAMP1)
    if actor is None or actor.ownerController is not controller or actor.posIndex != 1:
        raise RuntimeError("The original Yanmo practice did not create its activity actor")
    if (actor.protoid, actor.AttrComp.level, actor.AttrComp.star) != YANMO_ACTOR or not engine.replace_yys_flag:
        raise RuntimeError("The original Yanmo practice used a different activity actor")
    return {"id": actor.protoid, "level": actor.AttrComp.level, "star": actor.AttrComp.star}
