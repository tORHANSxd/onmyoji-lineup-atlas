"""Offline solo replays of the three original Tianfa difficulties."""

from fengmo_yanwu_stage import SoloActivityReplay


TIANFA_MODE = 2600
TIANFA_STAGES = (2716061, 2716062, 2716063)
TIANFA_MEMBER_COUNT = 6
TIANFA_REPLAY_SECONDS = 150
SOLO_POSITIONS = list(range(2, 8))


class TianfaReplay(SoloActivityReplay):
    def __init__(self, stage_id):
        from battleengine.engine.TianFaBattleEngine import TianFaBattleEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA, DATA_TIANFA_BATTLE

        self.difficulty = TIANFA_STAGES.index(stage_id) + 1
        config = DATA_TIANFA_BATTLE.data.get(self.difficulty)
        stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
        if (not config or config["stage_id"] != stage_id or config["difficulty"] != self.difficulty
                or not stage or stage["groupid"] != stage_id or stage["shishentotal"] != TIANFA_MEMBER_COUNT):
            raise ValueError("Unknown Tianfa solo challenge")
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if len(self.group["MonstersInfos"]) != 1:
            raise ValueError("Expected one original Tianfa formation")
        engine = TianFaBattleEngine({"pve_data_flag": str(stage_id), "teamUid": "offline-tianfa",
                                     "battle_info": {"is_solo": True, "difficulty": self.difficulty}})
        engine.battleMode = const.BattleMode.MODE_TIAN_FA_BATTLE
        super().__init__(engine, self.group, const)

    def report(self, completed):
        engine = self.engine
        player = engine.battlePlayer1
        if (self.started is None or not self.opening or len(engine.battlePlayers) != 1 or not player.hasYYS
                or player.ssPosIndexList != SOLO_POSITIONS or engine.group_members or engine.assist_hero_list or self.assists
                or engine.getHaltBattleTime() is not None or engine.get_max_hp_add_factor() != 0):
            raise RuntimeError("Tianfa did not run under the original solo default entry conditions")
        damage = engine.get_my_total_damage()
        fire_count = engine.fire_buff_87852_counter
        if completed and (engine.engineUserData.get("my_total_damage") != damage
                          or engine.engineUserData.get("fire_buff_87852_counter") != fire_count):
            raise RuntimeError("Tianfa did not return its original solo settlement")
        return {"difficulty": self.difficulty, "opening": self.opening, "positions": player.ssPosIndexList,
                "combatSeconds": round(engine.now_time() - self.started, 6), "damage": damage, "fireCount": fire_count}
