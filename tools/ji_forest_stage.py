"""Original routes for the Shiki activity's Forest of Seasons."""

JI_FOREST_ACTIVITY = 8051
JI_FOREST_NORMAL = 923
JI_FOREST_ELITE = 924
JI_FOREST_LAST_PREVIEW = 81
JI_FOREST_MODES = (JI_FOREST_NORMAL, JI_FOREST_ELITE)
JI_FOREST_SCENE = 127
JI_FOREST_SECONDS = 180


def ji_forest_mode(stage_id):
    if 505001 <= stage_id <= 505094 and 1 <= stage_id % 10 <= 4:
        return JI_FOREST_NORMAL
    if 505201 <= stage_id <= 505300:
        return JI_FOREST_ELITE
    return None


def ji_forest_stage(mode, stage_id):
    from battleengine.engine.JiNormalBattleEngine import JiNormalBattleEngine, const
    from DynamicConfigData import (BattleMonstersInfo, DATA_JI_TOWER_ELITE, DATA_JI_TOWER_MONSTER,
                                   DATA_NORMAL_BATTLE_CONFIG, DATA_NORMAL_BATTLE_DEVELOP_SKILL, DATA_PVE_STAGE_DATA)

    if ji_forest_mode(stage_id) != mode:
        raise ValueError("The forest stage must use its original battle mode")
    elite = mode == JI_FOREST_ELITE
    if elite:
        level = stage_id - 505200
        if level > JI_FOREST_LAST_PREVIEW:
            raise ValueError("This forest formation is outside the client preview")
        config = DATA_JI_TOWER_ELITE.data[level]
        effects = list(config["skill_list"])
        if config["level"] != level or config["fightId"] != stage_id:
            raise RuntimeError("The original forest probe entry differs")
    else:
        config = next(row for row in DATA_JI_TOWER_MONSTER.data.values() if row["fight_id"] == stage_id)
        effects = [config["effect"]] if config["effect"] else []
    for effect in effects:
        if DATA_NORMAL_BATTLE_DEVELOP_SKILL.data[effect]["battle_skill_id"] != effect:
            raise RuntimeError("The original forest field effect differs")
    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    rules = DATA_NORMAL_BATTLE_CONFIG.data[mode]
    waves = group["MonstersInfos"]
    if (group["ID"] != stage_id or group["resindex"] != JI_FOREST_SCENE or len(waves) != 1
            or len(waves[0]) not in ((1, 6) if elite else (6,))
            or stage["shishentotal"] != 5 or stage["battleTime"] != JI_FOREST_SECONDS
            or rules["halt_time"] != JI_FOREST_SECONDS or rules["replace_yys_id"] or rules["group_battle"]):
        raise RuntimeError("The original forest stage or battle rules differ")
    engine = JiNormalBattleEngine({"pve_data_flag": str(stage_id), "field_effect": effects})
    engine.battleMode = mode
    route = {"activityId": JI_FOREST_ACTIVITY, "entryId": config["id"], "level": config["level"],
             "elite": elite, "fieldEffects": effects}
    return engine, group, const, route
