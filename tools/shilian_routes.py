"""Client route identifiers for the six permanent Six Realms routes."""

SHILIAN_EVENT_MODE = 208
SHILIAN_EXAM_MODE = 921
SHILIAN_MODES = (SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE)
MOON_SECOND_SCENE = 469104

# The two original team classes select these engines from their team type.
SHILIAN_DAOS = {
    1: (925, 926, "ShiLianYueDuEngine", 110150),
    2: (927, 928, "ShiLianXunXiangXingEngine", 110151),
    3: (929, 930, "ShiLianJiEngine", 110152),
    4: (931, 932, "ShiLianSPYunWaiJingEngine", 110153),
    5: (938, 939, "ShiLianYanLingEngine", 110154),
    6: (940, 941, "ShiLianKongQueMingWangEngine", 110155),
}


def shilian_event_dao(row):
    """Identify the permanent route from the matching client stage and pool ranges."""
    battle_id, group = row.get("battle_id"), row.get("group_id")
    if type(battle_id) is not int or type(group) is not int:
        return None
    dao = battle_id // 100 - 6999
    if dao in SHILIAN_DAOS and group // 10 == dao:
        return dao
    return None
