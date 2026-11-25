"""Load the verified ordinary formation for an Awakening dungeon floor."""


def awake_stage(floor):
    from battleengine.engine.AwakeFbEngine import AwakeFbEngine, const, DATA_AWAKE_FB, DATA_AWAKE_FB_SCENE
    from DynamicConfigData import DATA_DUNGEON_AWAKE_MONSTER

    config = DATA_AWAKE_FB.data.get(floor)
    if not config or config.get("fdungeon_rate") != 0:
        raise ValueError(f"Awakening floor {floor} has no verified ordinary route")
    form_id = config["monsterid"]
    group = DATA_DUNGEON_AWAKE_MONSTER.data.get(form_id)
    scenes = [row["sceneid"] for row in DATA_AWAKE_FB_SCENE.data.values()
              if row.get("type") == config["scene"] and row.get("rate", 0) > 0]
    if (not group or group.get("type") != form_id or group.get("rate", 0) <= 0
            or not group.get("monsterids") or len(scenes) != 1
            or any(row.get("type") == form_id and row.get("rate", 0) > 0 and key != form_id
                   for key, row in DATA_DUNGEON_AWAKE_MONSTER.data.items())):
        raise ValueError(f"Awakening floor {floor} has unverified formation or scene choices")
    engine = AwakeFbEngine({"fbId": floor, "monsterGroup": form_id})
    engine.battleMode = const.BattleMode.MODE_AWAKE_FB
    if engine.combineSceneInfoId != scenes[0]:
        raise RuntimeError("The original Awakening engine selected a different scene")
    return engine, config, group["monsterids"]
