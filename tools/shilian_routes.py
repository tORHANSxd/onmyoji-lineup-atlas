"""Client route identifiers for the six permanent Six Realms routes."""

SHILIAN_EVENT_MODE = 208
SHILIAN_EXAM_MODE = 921
SHILIAN_MODES = (SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE)

# The two original team classes select these engines from their team type.
SHILIAN_DAOS = {
    1: (925, 926, "ShiLianYueDuEngine", 110150),
    2: (927, 928, "ShiLianXunXiangXingEngine", 110151),
    3: (929, 930, "ShiLianJiEngine", 110152),
    4: (931, 932, "ShiLianSPYunWaiJingEngine", 110153),
    5: (938, 939, "ShiLianYanLingEngine", 110154),
    6: (940, 941, "ShiLianKongQueMingWangEngine", 110155),
}
