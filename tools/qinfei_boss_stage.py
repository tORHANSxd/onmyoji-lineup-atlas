"""Run a local Qinfei boss round with the original raid and battle controllers."""

from guild_retreat_stage import LocalRaidRoom

QINFEI_BOSS_MODE = 320
QINFEI_BOSS_STAGE = 25005
QINFEI_BOSS_MAX_WINDOW = 1200
QINFEI_BOSS_REPLAY_SECONDS = 220
QINFEI_BOSS_PROFILES = {
    (raid, difficulty): boss
    for raid, (boss, levels) in {2: (201, 4), 3: (202, 4), 4: (203, 1), 5: (204, 1)}.items()
    for difficulty in range(1, levels + 1)
}
QINFEI_BOSS_SOURCES = {
    "battleengine.engine.QinfeiBossEngine": "de0dcf19c9b9a919c93a7a0d7e04b95cdec6057f51045751dd66e19880f09db0",
    "battleengine.raid.raid_controllers.RaidController": "6fef2d8afb786bf54d89bee3723fcb877e442c72e08422c4e000de1cb1fc2730",
    "battleengine.raid.raid_controllers.RaidComp_40001": "30dc30b76bb5948a2bf5cf4bee2a24a3b809d442bf1b33b5cccab51d0161e973",
    "com.data.cdata.raid_info": "5d41d3fd6a4698df2ed3ff73a822334113074e1ecc6054f2825d251f1bc65837",
    "com.data.cdata.boss_info": "c7f426bcd56624de40897fd02d856c14ecb9f0d798f6f6000c264905608e8cc5",
}


class QinfeiBossRaid(LocalRaidRoom):
    def __init__(self, modules, profile):
        from battleengine.engine.QinfeiBossEngine import QinfeiBossEngine, const
        from battleengine.raid.raid_controllers.RaidController import RaidController
        from DynamicConfigData import DATA_BOSS_INFO, DATA_RAID_INFO

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in QINFEI_BOSS_SOURCES.items()):
            raise ValueError("The original Qinfei boss controller or tables have changed")
        self.raid_id, self.difficulty = profile
        self.boss_id = QINFEI_BOSS_PROFILES[profile]
        config = DATA_RAID_INFO.data[profile]
        if tuple(config["bossInfo"]) != (self.boss_id,) or config["boss_num"] != 1 or config["battleId"] != QINFEI_BOSS_STAGE:
            raise RuntimeError("The original Qinfei raid configuration changed")
        super().__init__(f"offline-qinfei-{self.raid_id}-{self.difficulty}")
        self.round = 1
        self.boss = DATA_BOSS_INFO.data[self.boss_id]
        self.raid = RaidController.create_raid_controller(self, *profile, [self.boss_id])
        self.userdata = self.raid.get_user_data(self.player_id)
        if (self.userdata["pve_data_flag"] != str(QINFEI_BOSS_STAGE) or self.userdata["round_count"] != self.round
                or self.userdata["bossWaveList"] != [self.boss_id] or self.userdata["boss_proto_id"] != self.boss["protoId"]
                or self.userdata.get("buff_times_count") or any(food["cur"] for food in self.userdata["food_info"].values())):
            raise RuntimeError("The original raid controller initialized another Qinfei scenario")
        self.userdata.update(team=self, teamUid=self.id, raid_header={"attacker": self.player_id})
        self.engine = QinfeiBossEngine(self.userdata)
        self.engine.battleMode = const.BattleMode.MODE_QINFEI_BOSS
        self.settlements.clear()

    def matches(self):
        return (self.engine.combineSceneInfoId == 40023 and self.engine.currBossProtoId == self.boss["protoId"]
                and self.engine.raid_id == self.raid_id and self.engine.hard_level == self.difficulty
                and self.engine.finishedWaveCount == 0)

    def report(self, window):
        boss = self.raid.get_cur_boss_ctrl()
        return {**window.report(), "raidId": self.raid_id, "difficulty": self.difficulty, "bossId": self.boss_id,
                "remainingHp": boss.get_boss_cur_hp(), "fed": False,
                "raidSHA256": QINFEI_BOSS_SOURCES["battleengine.raid.raid_controllers.RaidComp_40001"]}
