"""Offline solo and three-player replays of the original Tianfa difficulties."""

from fengmo_yanwu_stage import SoloActivityReplay
from rune_team import assign_local_party, verify_local_party, verify_local_party_selection


TIANFA_MODE = 2600
TIANFA_TEAM_TYPE = 3600
TIANFA_TEAM_ENTRY = 57
TIANFA_STAGES = (2716061, 2716062, 2716063)
TIANFA_LOBBY_STAGE = 594011
TIANFA_MEMBER_COUNT = 6
TIANFA_REPLAY_SECONDS = 150
SOLO_POSITIONS = list(range(2, 8))
TEAM_POSITIONS = ((3, 7), (2, 5), (4, 6))


class TianfaReplay(SoloActivityReplay):
    def __init__(self, stage_id, team=False):
        from battleengine.engine.TianFaBattleEngine import TianFaBattleEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA, DATA_TIANFA_BATTLE

        self.difficulty = TIANFA_STAGES.index(stage_id) + 1
        self.three_players = team
        config = DATA_TIANFA_BATTLE.data.get(self.difficulty)
        stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
        if (not config or config["stage_id"] != stage_id or config["difficulty"] != self.difficulty
                or not stage or stage["groupid"] != stage_id or stage["shishentotal"] != TIANFA_MEMBER_COUNT):
            raise ValueError("Unknown Tianfa solo challenge")
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if len(self.group["MonstersInfos"]) != 1:
            raise ValueError("Expected one original Tianfa formation")
        battle_info = {"is_solo": not team, "difficulty": self.difficulty}
        engine = TianFaBattleEngine({"pve_data_flag": str(stage_id), "teamUid": "offline-tianfa", "battle_info": battle_info})
        engine.battleMode = const.BattleMode.MODE_TIAN_FA_BATTLE
        super().__init__(engine, self.group, const)

    def assign_players(self, player, fighters):
        return assign_local_party(player, fighters, TEAM_POSITIONS)

    def verify_players(self, controllers):
        verify_local_party(controllers, TEAM_POSITIONS)

    def verify_selection(self, controllers):
        verify_local_party_selection(self.engine, controllers, TEAM_POSITIONS)

    def report(self, completed):
        engine = self.engine
        actual_positions = [tuple(player.ssPosIndexList) for player in engine.battlePlayers]
        expected_positions = TEAM_POSITIONS if self.three_players else (tuple(SOLO_POSITIONS),)
        if (self.started is None or not self.opening or actual_positions != list(expected_positions)
                or not engine.battlePlayer1.hasYYS or engine.group_members or engine.assist_hero_list or self.assists
                or engine.getHaltBattleTime() is not None or engine.get_max_hp_add_factor() != 0):
            raise RuntimeError("Tianfa did not run under the selected original entry conditions")
        damage = engine.get_my_total_damage()
        fire_count = engine.fire_buff_87852_counter
        if completed and (engine.engineUserData.get("my_total_damage") != damage
                          or engine.engineUserData.get("fire_buff_87852_counter") != fire_count):
            raise RuntimeError("Tianfa did not return its original settlement")
        result = {"difficulty": self.difficulty, "opening": self.opening, "positions": engine.battlePlayer1.ssPosIndexList,
                  "combatSeconds": round(engine.now_time() - self.started, 6), "damage": damage, "fireCount": fire_count}
        if self.three_players:
            result["teamPositions"] = actual_positions
        return result
