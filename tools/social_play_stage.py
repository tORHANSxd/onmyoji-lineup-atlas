"""Original Four Seasons Challenge activity and battle IDs."""

SOCIAL_PLAY_ACTIVITY = 8772
SOCIAL_PLAY_MODE = 938
SOCIAL_PLAY_TICKET = 1401145
SOCIAL_PLAY_BUFFS = (120004, 120005)
SOCIAL_PLAY_STAGES = range(310001, 310029)
SOCIAL_PLAY_SCENE = 310001
SOCIAL_PLAY_SECONDS = 180
SOCIAL_PLAY_SLOTS = [1, 2, 3, 4, 5, 6]


def social_play_stage(stage_id):
    from battleengine.engine.SocialTeamBattleEngine import SocialTeamBattleEngine, const
    from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA,
                                   DATA_SOCIAL_PLAY_STAGE)

    if stage_id not in SOCIAL_PLAY_STAGES:
        raise ValueError("Unknown Four Seasons Challenge stage")
    level_id = stage_id - SOCIAL_PLAY_STAGES.start + 1
    day, level = divmod(level_id - 1, 4)
    config = DATA_SOCIAL_PLAY_STAGE.data[level_id]
    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    rules = DATA_NORMAL_BATTLE_CONFIG.data[SOCIAL_PLAY_MODE]
    waves = group["MonstersInfos"]
    if (config["stage_id"] != stage_id or config["day"] != day + 1 or config["level"] != level + 1
            or group["ID"] != stage_id or group["resindex"] != SOCIAL_PLAY_SCENE
            or len(waves) != 1 or len(waves[0]) != 6
            or rules["halt_time"] != SOCIAL_PLAY_SECONDS or rules["replace_yys_id"] or rules["group_battle"]):
        raise RuntimeError("The original Four Seasons stage or battle rules differ")
    engine = SocialTeamBattleEngine({"pve_data_flag": str(stage_id)})
    engine.battleMode = SOCIAL_PLAY_MODE
    return engine, group, const, {"activityId": SOCIAL_PLAY_ACTIVITY, "levelId": level_id,
                                  "day": config["day"], "level": config["level"]}


def verify_social_selection(engine, controller):
    expected = dict(zip(controller.ctrlPlayer.defaultHeros, SOCIAL_PLAY_SLOTS))
    selected = {hero.HeroComp.heroData.heroUid: hero.posIndex for hero in engine.heroEntities.values()
                if hero.ownerController is controller and hasattr(hero, "HeroComp")}
    if selected != expected:
        raise RuntimeError("The original Four Seasons engine selected a different roster")
