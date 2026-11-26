"""Offline single-player replay of the original General Soul Trial."""

from fengmo_yanwu_stage import SoloActivityReplay


GENERAL_SOUL_MODE = 2507
TEAM_TYPE = 3507
STAGE_ID = 3504732
DEADLINE_SECONDS = 180


def general_soul_stage(stage_id):
    from battleengine.engine.FakeGod7GeneralSoulBattleEngine import FakeGod7GeneralSoulBattleEngine, const
    from com.data.cdata import act_team_battle
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    event = act_team_battle.data.get(4)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
    if (stage_id != STAGE_ID or not event or event["team_battle_type"] != TEAM_TYPE
            or event["battle_id"] != stage_id or not stage or stage["shishentotal"] != 5):
        raise ValueError("Unknown General Soul Trial event battle")
    group = BattleMonstersInfo.data[stage["groupid"]]
    if len(group["MonstersInfos"]) != 1:
        raise ValueError("Expected one configured General Soul Trial formation")
    engine = FakeGod7GeneralSoulBattleEngine({"pve_data_flag": str(stage_id), "act_id": event["act_id"],
                                              "teamUid": "offline-general-soul"})
    engine.battleMode = const.BattleMode.MODE_FAKE_GOD7_GENERAL_SOUL_BATTLE
    return engine, group, event["act_id"], const


class GeneralSoulReplay(SoloActivityReplay):
    def report(self, completed, expected_roster, act_id):
        engine = self.engine
        if self.started is None or not self.opening:
            raise RuntimeError("General Soul Trial did not start combat")
        if (not engine.team_share_hp or engine.group_members or engine.assist_hero_list or self.assists
                or sorted(engine.used_hero_ids) != sorted(expected_roster)
                or not 179 <= engine.haltBattleTime - self.started <= 181):
            raise RuntimeError("General Soul Trial ran under different solo scoring conditions")
        damage = engine.get_my_total_damage()
        if (type(damage) is not int or damage < 0
                or completed and engine.engineUserData.get("used_hero_ids") != engine.used_hero_ids):
            raise RuntimeError("General Soul Trial did not return the original settlement roster")
        return {"actId": act_id, "deadlineSeconds": DEADLINE_SECONDS, "damage": damage,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": engine.isHaltBattle,
                "opening": self.opening, "usedHeroIds": engine.used_hero_ids}
