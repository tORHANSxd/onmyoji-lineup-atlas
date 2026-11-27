"""Original single battles from the Juelie event's hunt and story encounters."""


GTW_HUNT_ACTIVITY = 8884
GTW_HUNT_FLOOR = 50
GTW_HUNT_MODE = 936
GTW_STORY_ACTIVITY = 8778
GTW_STORY_MODE = 933
GTW_BARRIER_MODE = 935
GTW_HUNT_SCENE = 44136
GTW_HUNT_SECONDS = 3600
GTW_HUNT_WALL_SECONDS = 170
GTW_HUNT_STAGES = {
    814000: GTW_HUNT_MODE,
    812000: GTW_BARRIER_MODE,
    812001: GTW_BARRIER_MODE,
    812002: GTW_BARRIER_MODE,
    812101: GTW_STORY_MODE,
    812102: GTW_STORY_MODE,
    812103: GTW_STORY_MODE,
}
GTW_UNLINKED_STAGE = 812100
GTW_HUNT_MODES = {GTW_HUNT_MODE, GTW_STORY_MODE, GTW_BARRIER_MODE}
EVENT_MODE = {2: GTW_STORY_MODE, 4: GTW_BARRIER_MODE}


def gtw_hunt_stage(mode, stage_id, event_id):
    from battleengine.engine.SpGtwNormalEngine import SpGtwNormalEngine, const
    from DynamicConfigData import (BattleMonstersInfo, DATA_ACTIVITY_TOWER_FLOOR, DATA_ACTIVITY_TOWER_INFO,
                                   DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA, DATA_RUN_GROUP_EVENT)

    if GTW_HUNT_STAGES.get(stage_id) != mode:
        raise ValueError("The encounter requires its matching original activity battle mode")
    if mode == GTW_HUNT_MODE:
        floor = DATA_ACTIVITY_TOWER_FLOOR.data[GTW_HUNT_FLOOR]
        tower = DATA_ACTIVITY_TOWER_INFO.data[GTW_HUNT_ACTIVITY]
        if (event_id is not None or floor["act_id"] != GTW_HUNT_ACTIVITY or floor["battle_id"] != stage_id
                or tower["act_ticket_cid"] != 1464013 or tower["act_ticket_cost"] != 1):
            raise ValueError("The hunt uses the original floor 50 and its ticket rules")
        route = {"activityId": GTW_HUNT_ACTIVITY, "floorId": GTW_HUNT_FLOOR}
    else:
        event = DATA_RUN_GROUP_EVENT.data.get(event_id)
        if not event or event["battle_id"] != stage_id or EVENT_MODE.get(event["event_type"]) != mode:
            raise ValueError("Choose the original story event or barrier that owns this formation")
        route = {"activityId": GTW_STORY_ACTIVITY, "eventId": event_id,
                 "chapterId": event["group_id"], "eventType": event["event_type"]}

    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    rules = DATA_NORMAL_BATTLE_CONFIG.data[mode]
    expected_size = 4 if mode == GTW_STORY_MODE else 6
    waves = group["MonstersInfos"]
    if (stage["groupid"] != stage_id or stage["shishentotal"] != 5 or stage.get("battleTime")
            or rules["halt_time"] != GTW_HUNT_SECONDS or rules["replace_yys_id"] or rules["group_battle"]
            or group["ID"] != stage_id or group["resindex"] != GTW_HUNT_SCENE
            or len(waves) != 1 or len(waves[0]) != expected_size):
        raise RuntimeError("The original hunt formation or solo battle rules differ")
    engine = SpGtwNormalEngine({"pve_data_flag": str(stage_id)})
    engine.battleMode = mode
    return engine, group, const, route
