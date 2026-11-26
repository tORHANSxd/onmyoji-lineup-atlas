"""Offline single-player replays for activity score battles."""

from importlib import import_module
from typing import NamedTuple

from fengmo_yanwu_stage import SoloActivityReplay


class ScoreRoute(NamedTuple):
    event_row: int
    team_type: int
    stage_id: int
    deadline: int
    engine: str
    route: str
    report_key: str
    statistics_key: str | None = None


SOLO_SCORE_MODES = {
    2507: ScoreRoute(4, 3507, 3504732, 180, "FakeGod7GeneralSoulBattleEngine",
                     "general-soul-activity-solo", "generalSoulTrial"),
    2069: ScoreRoute(58, 3069, 7287242, 300, "SijinshenGeneralSoulBattleEngine",
                     "solo-activity-score", "activityScore", "fg8_battle_statisics"),
    6086: ScoreRoute(6082, 6086, 3334472, 300, "XiaoyeBaitiBattleEngine",
                     "solo-activity-score", "activityScore", "xiaoye_battle_statisics"),
}
SCORE_STAGES = {row.stage_id for row in SOLO_SCORE_MODES.values()} | {594011}


def solo_score_stage(mode, stage_id):
    from com.data.cdata import act_team_battle
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    route = SOLO_SCORE_MODES[mode]
    event = act_team_battle.data.get(route.event_row)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
    if (stage_id != route.stage_id or not event or event["team_battle_type"] != route.team_type
            or event["battle_id"] != stage_id or not stage or stage["shishentotal"] != 5):
        raise ValueError("Unknown solo activity score battle")
    group = BattleMonstersInfo.data[stage["groupid"]]
    if len(group["MonstersInfos"]) != 1:
        raise ValueError("Expected one configured solo activity formation")
    module = import_module(f"battleengine.engine.{route.engine}")
    team_uid = "offline-general-soul" if mode == 2507 else "offline-solo-activity"
    engine = getattr(module, route.engine)({"pve_data_flag": str(stage_id), "act_id": event["act_id"],
                                            "teamUid": team_uid})
    engine.battleMode = mode
    return engine, group, event["act_id"], module.const


class SoloScoreReplay(SoloActivityReplay):
    def report(self, completed, expected_roster, actor_id, act_id):
        engine = self.engine
        route = SOLO_SCORE_MODES[engine.battleMode]
        if self.started is None or not self.opening:
            raise RuntimeError("The activity did not start combat")
        if (not engine.team_share_hp or engine.group_members or engine.assist_hero_list or self.assists
                or abs(engine.haltBattleTime - self.started - route.deadline) > 1):
            raise RuntimeError("The activity ran under different solo scoring conditions")
        if route.statistics_key:
            if completed:
                used_ids = engine.engineUserData.get(route.statistics_key, {}).get("used_hero_ids")
                if not isinstance(used_ids, (list, tuple)) or sorted(used_ids) != sorted([*expected_roster, actor_id]):
                    raise RuntimeError("The activity did not return the original settlement roster")
                used_ids = list(used_ids)
                used_ids.remove(actor_id)
            else:
                from com.utils import helpers

                used_ids = [unit.protoid for unit in engine.heroEntities.values()
                            if unit.camp == self.const.CampFlag.CAMP1 and helpers.isSSEntity(unit)]
        else:
            used_ids = engine.used_hero_ids
            if completed and engine.engineUserData.get("used_hero_ids") != used_ids:
                raise RuntimeError("The activity did not return the original settlement roster")
        damage = engine.get_my_total_damage()
        if type(damage) is not int or damage < 0 or not isinstance(used_ids, (list, tuple)) or sorted(used_ids) != sorted(expected_roster):
            raise RuntimeError("The activity did not return the original settlement roster and damage")
        return {"actId": act_id, "deadlineSeconds": route.deadline, "damage": damage,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": engine.isHaltBattle,
                "opening": self.opening, "usedHeroIds": used_ids}
